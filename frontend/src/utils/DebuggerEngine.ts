import { getApiBaseUrl } from "../apiConfig";

export type DebugStatus = "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "RUNNING" | "HALTED" | "STEPPING";

export interface GdbLog {
  id: string;
  time: string;
  type: "cmd" | "rsp" | "info" | "error";
  text: string;
}

export interface DebuggerStateSnapshot {
  timestamp: string;
  status: DebugStatus;
  pc: number;
  sp: number;
  lr: number;
  registers: Record<string, number>;
  prevRegisters: Record<string, number>;
  changedRegs: Set<string>;
  pcInfo: {
    function: string;
    func_addr: string;
    func_size: number;
    file: string;
    line: number;
    found: boolean;
  };
  sourceLines: Array<{ num: number; text: string }>;
  disassembly: Array<{ addr: number; bytes: string; mn: string; op: string }>;
  stackMemory: Array<{ addr: string; hex: string; label?: string }>;
  variables: Array<{ name: string; type: string; address: string; value: string }>;
  gdbLogs: GdbLog[];
  mode: "static" | "live";
  checksum: string;
  activeSymbolName: string;
}

type StateListener = (state: DebuggerStateSnapshot) => void;

export class DebuggerEngine {
  private static instance: DebuggerEngine;
  private ws: WebSocket | null = null;
  private listeners: Set<StateListener> = new Set();

  private state: DebuggerStateSnapshot = {
    timestamp: new Date().toLocaleTimeString(),
    status: "DISCONNECTED",
    pc: 0x0800035c,
    sp: 0x20004000,
    lr: 0x080001b1,
    registers: {
      R0: 0x20000100, R1: 0x00000000, R2: 0x40021000, R3: 0x00000001,
      R4: 0x00000000, R5: 0x00000000, R6: 0x00000000, R7: 0x20004000,
      R8: 0x00000000, R9: 0x00000000, R10: 0x00000000, R11: 0x00000000,
      R12: 0x00000000, SP: 0x20004000, LR: 0x080001b1, PC: 0x0800035c,
      xPSR: 0x61000000, PRIMASK: 0x00000000
    },
    prevRegisters: {},
    changedRegs: new Set(),
    pcInfo: {
      function: "main",
      func_addr: "0x0800035c",
      func_size: 68,
      file: "main.c",
      line: 18,
      found: true
    },
    sourceLines: [
      { num: 1, text: "#include <stdint.h>" },
      { num: 2, text: "void large_function_A(void) { volatile int d[1000]; for(int i=0;i<1000;i++) d[i]=i; }" },
      { num: 3, text: "void large_function_B(void) { volatile int d[2000]; for(int i=0;i<2000;i++) d[i]=i; }" },
      { num: 4, text: "int main(void) {" },
      { num: 5, text: "    large_function_A();" },
      { num: 6, text: "    large_function_B();" },
      { num: 7, text: "    return 0;" },
      { num: 8, text: "}" }
    ],
    disassembly: [],
    stackMemory: [],
    variables: [
      { name: "i", type: "int", address: "0x20004004", value: "1000" },
      { name: "d", type: "volatile int[1000]", address: "0x20004000", value: "[0, 1, 2, ...]" },
      { name: "SystemCoreClock", type: "uint32_t", address: "0x20000000", value: "72000000 (72 MHz)" }
    ],
    gdbLogs: [
      { id: "1", time: new Date().toLocaleTimeString(), type: "info", text: "Debugger Engine Singleton initialized." }
    ],
    mode: "static",
    checksum: "",
    activeSymbolName: "main"
  };

  private constructor() {
    this.updateStackMemory(this.state.sp);
  }

  public static getInstance(): DebuggerEngine {
    if (!DebuggerEngine.instance) {
      DebuggerEngine.instance = new DebuggerEngine();
    }
    return DebuggerEngine.instance;
  }

  public getState(): DebuggerStateSnapshot {
    return this.state;
  }

  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.state.timestamp = new Date().toLocaleTimeString();
    this.listeners.forEach(fn => fn(this.state));
  }

  public addLog(type: GdbLog["type"], text: string): void {
    const entry: GdbLog = {
      id: String(Date.now() + Math.random()),
      time: new Date().toLocaleTimeString(),
      type,
      text
    };
    this.state.gdbLogs = [...this.state.gdbLogs.slice(-100), entry];
    this.notify();
  }

  public connect(url = "ws://127.0.0.1:9001"): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.state.status = "CONNECTING";
    this.addLog("info", `Connecting to Local Debug Agent at ${url}...`);
    this.notify();

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.state.status = "CONNECTED";
        this.state.mode = "live";
        this.addLog("info", "🟢 WebSocket Connected to Local Debug Agent. Handshaking GDB target...");
        this.ws?.send(JSON.stringify({ type: "CONNECT_GDB", host: "127.0.0.1", port: 3333 }));
        this.notify();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleAgentMessage(msg);
        } catch (e) {
          this.addLog("error", `Parse error from WS agent: ${event.data}`);
        }
      };

      this.ws.onerror = () => {
        this.state.status = "DISCONNECTED";
        this.addLog("error", "🔴 Could not connect to ws://127.0.0.1:9001. Ensure debug agent is running (`./scripts/start_agent.sh`).");
        this.notify();
      };

      this.ws.onclose = () => {
        this.state.status = "DISCONNECTED";
        this.addLog("info", "Disconnected from Local Debug Agent.");
        this.ws = null;
        this.notify();
      };
    } catch (e: any) {
      this.state.status = "DISCONNECTED";
      this.addLog("error", `Connection failed: ${e.message}`);
      this.notify();
    }
  }

  private handleAgentMessage(msg: any): void {
    const msgType = (msg.type || "").toUpperCase();

    if (msgType === "STATUS" || msgType === "GDB_STATUS") {
      if (msg.gdb_connected || msg.connected) {
        this.state.status = "HALTED";
        this.addLog("info", "✓ GDB Target Connected (localhost:3333). Target Halted.");
      } else {
        this.addLog("error", msg.message || "GDB Target not reachable. Check OpenOCD.");
      }
    } else if (msgType === "REGISTERS" || msgType === "STEP_COMPLETE" || msgType === "HALTED" || msgType === "RESET_COMPLETE") {
      this.state.status = "HALTED";
      const newRegs = msg.data || msg.registers;
      if (newRegs) {
        this.updateRegisters(newRegs);
      }
      this.addLog("rsp", `Target Halted. PC = 0x${((newRegs?.PC || this.state.pc) & ~1).toString(16).padStart(8, "0")}`);
    } else if (msgType === "RUN_STARTED") {
      this.state.status = "RUNNING";
      this.addLog("info", "▶ Target Running...");
    } else if (msgType === "ERROR") {
      this.addLog("error", `GDB Error: ${msg.message || "Operation failed"}`);
    }
    this.notify();
  }

  public updateRegisters(newRegs: Record<string, number>): void {
    this.state.prevRegisters = { ...this.state.registers };
    const changed = new Set<string>();

    Object.keys(newRegs).forEach(key => {
      if (this.state.registers[key] !== undefined && this.state.registers[key] !== newRegs[key]) {
        changed.add(key);
      }
    });

    this.state.changedRegs = changed;
    this.state.registers = { ...newRegs };

    if (newRegs.PC !== undefined) {
      const cleanPc = newRegs.PC & ~1;
      this.state.pc = cleanPc;
      this.fetchSingleDebugSnapshot(cleanPc, newRegs.SP || this.state.sp);
    }
    if (newRegs.SP !== undefined) {
      this.state.sp = newRegs.SP;
      this.updateStackMemory(newRegs.SP);
    }
  }

  private fetchSingleDebugSnapshot(targetPc: number, targetSp: number): void {
    const apiBase = getApiBaseUrl();
    const url = `${apiBase}/api/debug/state?checksum=${encodeURIComponent(this.state.checksum)}&pc=0x${targetPc.toString(16)}&sp=0x${targetSp.toString(16)}`;

    fetch(url)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data) {
          if (data.pcInfo) this.state.pcInfo = data.pcInfo;
          if (data.sourceLines) this.state.sourceLines = data.sourceLines;
          if (data.disassembly) this.state.disassembly = data.disassembly;
          if (data.variables) this.state.variables = data.variables;
          this.notify();
        }
      })
      .catch(() => {});
  }

  private updateStackMemory(spVal: number): void {
    const rows = [];
    const baseSp = spVal & ~3;
    for (let offset = 0; offset < 32; offset += 4) {
      const addr = baseSp + offset;
      const val = 0x20000000 + ((offset * 0x1337) % 0xffff);
      let label = offset === 0 ? "SP (Stack Pointer)" : offset === 4 ? "Saved Frame Pointer" : offset === 8 ? "Return Address (LR)" : "";
      rows.push({
        addr: `0x${addr.toString(16).padStart(8, "0")}`,
        hex: `0x${val.toString(16).padStart(8, "0")}`,
        label
      });
    }
    this.state.stackMemory = rows;
  }

  public stepInto(): void {
    this.state.status = "STEPPING";
    this.addLog("cmd", "stepi (Step Into)");
    this.send("STEP_INTO");
  }

  public stepOver(): void {
    this.state.status = "STEPPING";
    this.addLog("cmd", "nexti (Step Over)");
    this.send("STEP_OVER");
  }

  public run(): void {
    this.state.status = "RUNNING";
    this.addLog("cmd", "continue (Run)");
    this.send("RUN");
  }

  public halt(): void {
    this.addLog("cmd", "interrupt (Halt Target)");
    this.send("HALT");
  }

  public reset(): void {
    this.addLog("cmd", "monitor reset halt (Reset Target)");
    this.send("RESET");
  }

  public sendCustomCommand(cmdText: string): void {
    this.addLog("cmd", cmdText);
    this.send("CUSTOM", { command: cmdText });
  }

  public setChecksum(cs: string): void {
    this.state.checksum = cs;
  }

  public setMode(mode: "static" | "live"): void {
    this.state.mode = mode;
    this.notify();
  }

  private send(cmdType: string, payload: any = {}): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.addLog("error", "Local Debug Agent not connected. Click status badge to connect.");
      return;
    }
    this.ws.send(JSON.stringify({ type: cmdType, ...payload }));
  }
}
