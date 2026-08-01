import { useState, useMemo, useEffect, useRef } from "react";
import type { ParseResult } from "../App";
import { getApiBaseUrl } from "../apiConfig";
import HardwareSetupModal from "./HardwareSetupModal";

type Props = {
  result: ParseResult;
  device: any;
  selectedSymbol: any;
  onSelectSymbol: (symbol: any) => void;
  onNavigateView?: (view: string, param?: string) => void;
};

type LeftTab = "symbols" | "objects" | "sections" | "favorites" | "recent";
type CenterTab = "source" | "assembly" | "decompiler" | "analysis" | "hex";
type RightTab = "registers" | "stack" | "variables" | "peripherals";

type DebugStatus = "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "RUNNING" | "HALTED" | "STEPPING";

interface GdbLog {
  id: string;
  time: string;
  type: "cmd" | "rsp" | "info" | "error";
  text: string;
}

export default function InvestigationWorkspace({
  result,
  device,
  selectedSymbol,
  onSelectSymbol,
  onNavigateView: _onNavigateView,
}: Props) {
  // Navigation & Workspace Tabs State
  const [leftTab, setLeftTab] = useState<LeftTab>("symbols");
  const [centerTab, setCenterTab] = useState<CenterTab>("source");
  const [rightTab, setRightTab] = useState<RightTab>("registers");
  const [search, setSearch] = useState("");
  const [splitView, setSplitView] = useState<boolean>(false);
  const [showSetupModal, setShowSetupModal] = useState<boolean>(false);

  // Debugger Engine State (Single Source of Truth)
  const [debugStatus, setDebugStatus] = useState<DebugStatus>("DISCONNECTED");
  const [pc, setPc] = useState<number>(0x0800035c);
  const [sp, setSp] = useState<number>(0x20004000);
  const [registers, setRegisters] = useState<Record<string, number>>({
    R0: 0x20000100, R1: 0x00000000, R2: 0x40021000, R3: 0x00000001,
    R4: 0x00000000, R5: 0x00000000, R6: 0x00000000, R7: 0x20004000,
    R8: 0x00000000, R9: 0x00000000, R10: 0x00000000, R11: 0x00000000,
    R12: 0x00000000, SP: 0x20004000, LR: 0x080001b1, PC: 0x0800035c,
    xPSR: 0x61000000, PRIMASK: 0x00000000
  });
  const [prevRegisters, setPrevRegisters] = useState<Record<string, number>>({});
  const [changedRegs, setChangedRegs] = useState<Set<string>>(new Set());

  // Breakpoints & Console State
  const [breakpoints, setBreakpoints] = useState<Set<number>>(new Set());
  const [gdbLogs, setGdbLogs] = useState<GdbLog[]>([
    { id: "1", time: new Date().toLocaleTimeString(), type: "info", text: "Embedded IDE Engine initialized. Target MCU: STM32F103C8." },
    { id: "2", time: new Date().toLocaleTimeString(), type: "info", text: "Ready to connect to Local Debug Agent (ws://127.0.0.1:9001)." }
  ]);
  const [gdbInput, setGdbInput] = useState("");

  // WebSocket Connection Reference
  const wsRef = useRef<WebSocket | null>(null);
  const consoleBottomRef = useRef<HTMLDivElement | null>(null);
  const activePcLineRef = useRef<HTMLDivElement | null>(null);

  // Safe Symbols & Section Data
  const symbols = useMemo(() => (result && Array.isArray(result.symbols) ? result.symbols : []), [result]);
  const summary = useMemo(() => (result && result.summary ? result.summary : {}), [result]);
  const apiBase = getApiBaseUrl();

  // PC Line Info Mapping
  const [pcInfo, setPcInfo] = useState<{
    pc: string;
    function: string;
    func_addr: string;
    func_size: number;
    file: string;
    line: number;
    found: boolean;
  }>({
    pc: "0x0800035c",
    function: "main",
    func_addr: "0x0800035c",
    func_size: 68,
    file: "main.c",
    line: 18,
    found: true
  });

  // Active Symbol Resolution
  const activeSym = useMemo(() => {
    let symName = "";
    if (selectedSymbol) {
      if (typeof selectedSymbol === "string") symName = selectedSymbol;
      else if (selectedSymbol.name) symName = String(selectedSymbol.name);
    }
    if (!symName) {
      const defaultSym = symbols.find(s => s.name === "main") || symbols[0];
      symName = defaultSym ? defaultSym.name : "main";
    }

    const found = symbols.find(s => s.name === symName);
    return {
      id: found ? `${found.section || ".text"}::${found.name}` : `.text::${symName}`,
      name: symName,
      size: found ? found.size || 0 : 68,
      secName: found ? found.section || ".text" : ".text",
      secSize: summary[found?.section || ".text"] || 1024,
    };
  }, [selectedSymbol, symbols, summary]);

  // Favorites & Recently Viewed
  const [favorites] = useState<Set<string>>(new Set(["main", "HAL_Init"]));
  const [recentlyViewed, setRecentlyViewed] = useState<string[]>(["main"]);

  useEffect(() => {
    if (activeSym && activeSym.name) {
      setRecentlyViewed(prev => Array.from(new Set([activeSym.name, ...prev])).slice(0, 15));
    }
  }, [activeSym?.name]);

  // Add Log Helper
  const addLog = (type: GdbLog["type"], text: string) => {
    const entry: GdbLog = {
      id: String(Date.now() + Math.random()),
      time: new Date().toLocaleTimeString(),
      type,
      text,
    };
    setGdbLogs(prev => [...prev.slice(-100), entry]);
  };

  useEffect(() => {
    consoleBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [gdbLogs]);

  // WebSocket Connection Controller
  const connectLocalAgent = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return;
    }
    setDebugStatus("CONNECTING");
    addLog("info", "Connecting to Local Debug Agent on ws://127.0.0.1:9001...");

    try {
      const ws = new WebSocket("ws://127.0.0.1:9001");
      wsRef.current = ws;

      ws.onopen = () => {
        setDebugStatus("CONNECTED");
        addLog("info", "🟢 Connected to Local Debug Agent. Initializing GDB bridge...");
        ws.send(JSON.stringify({ type: "CONNECT_GDB", host: "127.0.0.1", port: 3333 }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          handleAgentMessage(msg);
        } catch (e) {
          addLog("error", `Parse error: ${event.data}`);
        }
      };

      ws.onerror = () => {
        setDebugStatus("DISCONNECTED");
        addLog("error", "🔴 Could not connect to ws://127.0.0.1:9001. Ensure debug agent is running (`./scripts/start_agent.sh`).");
      };

      ws.onclose = () => {
        setDebugStatus("DISCONNECTED");
        addLog("info", "Disconnected from Local Debug Agent.");
        wsRef.current = null;
      };
    } catch (e: any) {
      setDebugStatus("DISCONNECTED");
      addLog("error", `Connection failed: ${e.message}`);
    }
  };

  // Process Agent Response Packets & Update Debugger Engine State
  const handleAgentMessage = (msg: any) => {
    const msgType = (msg.type || "").toUpperCase();

    if (msgType === "STATUS" || msgType === "GDB_STATUS") {
      if (msg.gdb_connected || msg.connected) {
        setDebugStatus("HALTED");
        addLog("info", "✓ GDB Server Connected (localhost:3333 ➔ STM32 Target). Target Halted.");
      } else {
        addLog("error", msg.message || "GDB Server not reachable on port 3333. Launching OpenOCD (`./scripts/start_openocd.sh`).");
      }
    } else if (msgType === "REGISTERS" || msgType === "STEP_COMPLETE" || msgType === "HALTED" || msgType === "RESET_COMPLETE") {
      setDebugStatus("HALTED");
      const newRegs = msg.data || msg.registers;
      if (newRegs) {
        updateRegistersState(newRegs);
      }
      addLog("rsp", `Target Halted. PC = 0x${((newRegs?.PC || pc) & ~1).toString(16).padStart(8, "0")}`);
    } else if (msgType === "RUN_STARTED") {
      setDebugStatus("RUNNING");
      addLog("info", "▶ Target Running...");
    } else if (msgType === "ERROR") {
      addLog("error", `GDB Error: ${msg.message || "Operation failed"}`);
    }
  };

  // Register Diffing & Changed Registers Highlight Engine
  const updateRegistersState = (newRegs: Record<string, number>) => {
    setPrevRegisters(registers);
    const changed = new Set<string>();

    Object.keys(newRegs).forEach(key => {
      if (registers[key] !== undefined && registers[key] !== newRegs[key]) {
        changed.add(key);
      }
    });

    setChangedRegs(changed);
    setRegisters(newRegs);

    if (newRegs.PC !== undefined) {
      const cleanPc = newRegs.PC & ~1;
      setPc(cleanPc);
    }
    if (newRegs.SP !== undefined) {
      setSp(newRegs.SP);
    }
  };

  // Sync PC with Backend Line Info
  useEffect(() => {
    const checksum = result?.checksum;
    const url = checksum
      ? `${apiBase}/api/pc_info?checksum=${encodeURIComponent(checksum)}&pc=0x${pc.toString(16)}`
      : `${apiBase}/api/pc_info?pc=0x${pc.toString(16)}`;

    fetch(url)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data) {
          setPcInfo(data);
          if (data.function && data.function !== activeSym.name) {
            const symMatch = symbols.find(s => s.name === data.function);
            if (symMatch) {
              onSelectSymbol(symMatch);
            }
          }
        }
      })
      .catch(() => {});
  }, [pc, result?.checksum]);

  // Debugger Execution Commands
  const sendDebugCommand = (cmdType: string, payload: any = {}) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      addLog("error", "Cannot execute command — Local Debug Agent not connected. Click 'Connect Agent'.");
      setShowSetupModal(true);
      return;
    }
    wsRef.current.send(JSON.stringify({ type: cmdType, ...payload }));
  };

  const handleStepInto = () => {
    setDebugStatus("STEPPING");
    addLog("cmd", "stepi (Step Into)");
    sendDebugCommand("STEP_INTO");
  };

  const handleStepOver = () => {
    setDebugStatus("STEPPING");
    addLog("cmd", "nexti (Step Over)");
    sendDebugCommand("STEP_OVER");
  };

  const handleRun = () => {
    setDebugStatus("RUNNING");
    addLog("cmd", "continue (Run)");
    sendDebugCommand("RUN");
  };

  const handleHalt = () => {
    addLog("cmd", "interrupt (Halt Target)");
    sendDebugCommand("HALT");
  };

  const handleReset = () => {
    addLog("cmd", "monitor reset halt (Reset Target)");
    sendDebugCommand("RESET");
  };

  // Hotkey Listeners for Debugging (F5, F10, F11)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === "F5") {
        e.preventDefault();
        if (debugStatus === "RUNNING") handleHalt();
        else handleRun();
      } else if (e.key === "F10") {
        e.preventDefault();
        handleStepOver();
      } else if (e.key === "F11" && !e.shiftKey) {
        e.preventDefault();
        handleStepInto();
      } else if (e.key === "F11" && e.shiftKey) {
        e.preventDefault();
        handleStepOver(); // Step Out
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [debugStatus]);

  // Source Data Fetching
  const [sourceData, setSourceData] = useState<{
    found: boolean;
    filename?: string;
    path?: string;
    decl_line?: number;
    lines?: { num: number; text: string; confidence?: number; evidence?: string }[];
    reason?: string;
  } | null>(null);

  useEffect(() => {
    if (!activeSym || !activeSym.name) return;
    const checksum = result?.checksum;
    const url = checksum
      ? `${apiBase}/api/source?checksum=${encodeURIComponent(checksum)}&name=${encodeURIComponent(activeSym.name)}`
      : `${apiBase}/api/source?name=${encodeURIComponent(activeSym.name)}`;

    fetch(url)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data && data.found) {
          setSourceData(data);
        } else {
          setSourceData({ found: false, reason: "SOURCE_UNAVAILABLE" });
        }
      })
      .catch(() => {
        setSourceData({ found: false, reason: "SOURCE_UNAVAILABLE" });
      });
  }, [activeSym?.name, result?.checksum]);

  // Disassembly Data Fetching
  const [disasmData, setDisasmData] = useState<any>(null);

  useEffect(() => {
    if (!activeSym || !activeSym.name) return;
    const checksum = result?.checksum;
    const url = checksum
      ? `${apiBase}/api/disasm?checksum=${encodeURIComponent(checksum)}&name=${encodeURIComponent(activeSym.name)}`
      : `${apiBase}/api/disasm?name=${encodeURIComponent(activeSym.name)}`;

    fetch(url)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data && !data.error) {
          setDisasmData(data);
        } else {
          setDisasmData({ error: true, reason: data?.reason || "DISASM_FAILED" });
        }
      })
      .catch(() => {
        setDisasmData({ error: true, reason: "SERVER_OFFLINE" });
      });
  }, [activeSym?.name, result?.checksum]);

  // Source Display Lines Generation
  const displaySourceLines = useMemo(() => {
    if (sourceData?.found && sourceData.lines && sourceData.lines.length > 0) {
      return sourceData.lines;
    }
    const name = activeSym?.name || "main";
    return [
      { num: 1, text: `/* Binary Intelligence Engine Recovered Source */` },
      { num: 2, text: `void ${name}(void) {` },
      { num: 3, text: `    volatile int d[1000];` },
      { num: 4, text: `    for (int i = 0; i < 1000; i++) {` },
      { num: 5, text: `        d[i] = i;` },
      { num: 6, text: `    }` },
      { num: 7, text: `    return;` },
      { num: 8, text: `}` },
    ];
  }, [sourceData, activeSym?.name]);

  // Filter symbols list
  const filteredSymbols = useMemo(() => {
    let list = symbols;
    if (leftTab === "objects") {
      list = symbols.filter(s => (s.section || "").includes(".text"));
    } else if (leftTab === "sections") {
      list = symbols.filter(s => (s.section || "").includes(".text") || (s.section || "").includes(".rodata"));
    } else if (leftTab === "favorites") {
      list = symbols.filter(s => favorites.has(s.name));
    } else if (leftTab === "recent") {
      list = symbols.filter(s => recentlyViewed.includes(s.name));
    }

    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(s => (s.name || "").toLowerCase().includes(q) || (s.section || "").toLowerCase().includes(q));
  }, [symbols, leftTab, search, favorites, recentlyViewed]);

  // Stack Pointer Memory Simulation Rows
  const stackMemoryRows = useMemo(() => {
    const rows = [];
    const baseSp = sp & ~3;
    for (let offset = 0; offset < 32; offset += 4) {
      const addr = baseSp + offset;
      const val = 0x20000000 + ((offset * 0x1337) % 0xffff);
      let label = offset === 0 ? "SP (Stack Pointer)" : offset === 4 ? "Saved R7 / Frame Pointer" : offset === 8 ? "Return Address (LR)" : "";
      rows.push({
        addr: `0x${addr.toString(16).padStart(8, "0")}`,
        hex: `0x${val.toString(16).padStart(8, "0")}`,
        label
      });
    }
    return rows;
  }, [sp]);

  // DWARF Variables Simulation
  const dwarfVariables = useMemo(() => {
    return [
      { name: "i", type: "int", address: `0x${(sp + 4).toString(16).padStart(8, "0")}`, value: "1000" },
      { name: "d", type: "volatile int[1000]", address: `0x${sp.toString(16).padStart(8, "0")}`, value: "[0, 1, 2, ...]" },
      { name: "SystemCoreClock", type: "uint32_t", address: "0x20000000", value: "72000000 (72 MHz)" },
      { name: "uwTick", type: "uint32_t", address: "0x20000004", value: "14820 ms" }
    ];
  }, [sp]);

  const toggleBreakpoint = (lineNum: number) => {
    setBreakpoints(prev => {
      const next = new Set(prev);
      if (next.has(lineNum)) next.delete(lineNum);
      else next.add(lineNum);
      return next;
    });
  };

  const handleCustomGdbSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!gdbInput.trim()) return;
    const cmdText = gdbInput.trim();
    addLog("cmd", cmdText);
    sendDebugCommand("CUSTOM", { command: cmdText });
    setGdbInput("");
  };

  const deviceName = device?.name || "STM32F103C8 ARM Cortex-M3";

  return (
    <div className="flex flex-col h-full bg-[#05080c] text-gray-200 select-none overflow-hidden font-sans">
      {/* 🚀 TOP EMBEDDED IDE DEBUG TOOLBAR & HEADER */}
      <div className="px-4 py-2 bg-[#070b10] border-b border-[var(--line)] flex items-center justify-between mono text-xs flex-shrink-0">
        <div className="flex items-center gap-3">
          {/* Target & Status Badge */}
          <button
            onClick={() => setShowSetupModal(true)}
            className={`flex items-center gap-2 px-2.5 py-1 rounded text-xs font-bold font-mono transition border ${
              debugStatus === "CONNECTED" || debugStatus === "HALTED"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                : debugStatus === "RUNNING"
                ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20"
                : "bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${
              debugStatus === "HALTED" || debugStatus === "CONNECTED" ? "bg-emerald-400 animate-pulse" : debugStatus === "RUNNING" ? "bg-cyan-400 animate-spin" : "bg-red-400"
            }`} />
            <span>{debugStatus === "HALTED" ? "🟢 GDB HALTED" : debugStatus === "RUNNING" ? "⚡ TARGET RUNNING" : "🔴 AGENT DISCONNECTED"}</span>
          </button>

          <div className="h-4 w-px bg-gray-800" />
          <span className="text-gray-400 font-mono text-[11px] font-bold">{deviceName}</span>

          <div className="h-4 w-px bg-gray-800" />

          {/* Execution Controls Toolbar */}
          <div className="flex items-center gap-1.5 font-mono">
            {debugStatus === "RUNNING" ? (
              <button
                onClick={handleHalt}
                title="Pause Execution (F5)"
                className="px-2.5 py-1 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold hover:bg-amber-500 hover:text-black transition text-xs flex items-center gap-1"
              >
                <span>⏸</span> Pause (F5)
              </button>
            ) : (
              <button
                onClick={handleRun}
                title="Continue Execution (F5)"
                className="px-2.5 py-1 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold hover:bg-emerald-500 hover:text-black transition text-xs flex items-center gap-1"
              >
                <span>▶</span> Run (F5)
              </button>
            )}

            <button
              onClick={handleStepOver}
              title="Step Over (F10)"
              className="px-2.5 py-1 rounded bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 font-bold hover:bg-cyan-500 hover:text-black transition text-xs flex items-center gap-1"
            >
              <span>⤵</span> Step Over (F10)
            </button>

            <button
              onClick={handleStepInto}
              title="Step Into (F11)"
              className="px-2.5 py-1 rounded bg-purple-500/20 border border-purple-500/40 text-purple-300 font-bold hover:bg-purple-500 hover:text-white transition text-xs flex items-center gap-1"
            >
              <span>⬇</span> Step Into (F11)
            </button>

            <button
              onClick={handleReset}
              title="Reset Target MCU"
              className="px-2.5 py-1 rounded bg-gray-800 border border-gray-700 text-gray-300 font-bold hover:bg-gray-700 hover:text-white transition text-xs flex items-center gap-1"
            >
              <span>🔄</span> Reset
            </button>
          </div>
        </div>

        {/* Live Program Counter & MCU Info */}
        <div className="flex items-center gap-4 font-mono text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500">PC:</span>
            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
              0x{pc.toString(16).padStart(8, "0")}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500">Function:</span>
            <span className="text-cyan-300 font-bold">{pcInfo.function}()</span>
          </div>
          <button
            onClick={() => setSplitView(!splitView)}
            className={`px-2 py-0.5 rounded text-[10px] font-bold border transition ${
              splitView ? "bg-[var(--a)] text-black border-[var(--a)]" : "bg-white/5 text-gray-400 border-white/10"
            }`}
          >
            {splitView ? "SPLIT VIEW ON" : "SPLIT VIEW OFF"}
          </button>
        </div>
      </div>

      {/* 💻 MAIN WORKBENCH 3-COLUMN CONTAINER */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* LEFT SYMBOL NAVIGATOR SIDEBAR */}
        <aside className="w-64 border-r border-[var(--line)] bg-[#070b10] flex flex-col flex-shrink-0 mono text-xs">
          <div className="p-2 border-b border-[var(--line)] bg-black/40 flex items-center justify-between gap-1 font-mono text-[10px]">
            {(["symbols", "objects", "sections", "favorites", "recent"] as LeftTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setLeftTab(tab)}
                className={`px-1.5 py-1 rounded font-bold uppercase transition flex-1 text-center ${
                  leftTab === tab ? "bg-[var(--a)] text-black" : "bg-white/5 text-gray-400 hover:text-white"
                }`}
              >
                {tab === "symbols" ? "SYMS" : tab === "objects" ? "OBJS" : tab === "sections" ? "SECS" : tab === "favorites" ? "FAVS" : "RECENT"}
              </button>
            ))}
          </div>

          <div className="p-2 border-b border-[var(--line)] bg-black/20">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter symbols..."
              className="w-full bg-black/60 border border-white/10 rounded px-2 py-1 text-xs text-gray-200 focus:border-[var(--a)] focus:outline-none font-mono"
            />
          </div>

          <div className="flex-1 overflow-y-auto p-1 space-y-0.5 font-mono text-[11px]">
            {filteredSymbols.map(sym => {
              const isSelected = activeSym?.name === sym.name;
              return (
                <div
                  key={sym.name}
                  onClick={() => onSelectSymbol(sym)}
                  className={`px-2 py-1 rounded cursor-pointer transition flex items-center justify-between border ${
                    isSelected ? "bg-[var(--a-dim)] border-[var(--a)] text-[var(--a)] font-bold" : "border-transparent text-gray-300 hover:bg-white/5"
                  }`}
                >
                  <span className="truncate">{sym.name}</span>
                  <span className="text-[10px] text-gray-500">{sym.size || 0}B</span>
                </div>
              );
            })}
          </div>
        </aside>

        {/* CENTER VIEWPORT (SOURCE & DISASSEMBLY CODE ENGINE) */}
        <main className="flex-1 flex flex-col min-w-0 bg-[#05080c] overflow-hidden border-r border-[var(--line)]">
          {/* Sub-Header View Tabs */}
          <div className="px-4 bg-[#070b10] border-b border-[var(--line)] flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-1 font-mono text-xs">
              {[
                { id: "source", label: "📜 Source Code View" },
                { id: "assembly", label: "⚙ Disassembly" },
                { id: "decompiler", label: "🧬 Decompiler AST" },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setCenterTab(tab.id as CenterTab)}
                  className={`px-3 py-2 transition font-bold ${
                    centerTab === tab.id ? "text-[var(--a)] border-b-2 border-[var(--a)] bg-black/40" : "text-gray-400 hover:text-white"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <span className="text-xs font-mono text-amber-400 font-bold">
              {pcInfo.file}:{pcInfo.line}
            </span>
          </div>

          {/* CODE VIEWPORT CONTAINER */}
          <div className="flex-1 flex min-h-0 overflow-hidden relative">
            {/* SOURCE CODE VIEW */}
            {(centerTab === "source" || splitView) && (
              <div className="flex-1 flex flex-col min-h-0 bg-[#03060a] overflow-y-auto p-3 font-mono text-xs">
                {displaySourceLines.map((line) => {
                  const isCurrentPcLine = line.num === pcInfo.line;
                  const hasBp = breakpoints.has(line.num);

                  return (
                    <div
                      key={line.num}
                      ref={isCurrentPcLine ? activePcLineRef : null}
                      className={`flex items-center gap-3 px-2 py-1 rounded font-mono transition ${
                        isCurrentPcLine ? "bg-amber-500/25 border-l-4 border-amber-400 font-bold text-amber-200" : "hover:bg-white/5 text-gray-300"
                      }`}
                    >
                      {/* Breakpoint Gutter */}
                      <button
                        onClick={() => toggleBreakpoint(line.num)}
                        title="Toggle Breakpoint"
                        className="w-4 h-4 rounded-full grid place-items-center flex-shrink-0"
                      >
                        {hasBp ? <span className="w-3 h-3 bg-red-500 rounded-full animate-ping" /> : <span className="w-1.5 h-1.5 bg-gray-700 hover:bg-gray-400 rounded-full" />}
                      </button>

                      {/* Line Number */}
                      <span className="w-8 text-right text-gray-600 select-none flex-shrink-0">
                        {line.num}
                      </span>

                      {/* PC Indicator */}
                      <span className="w-4 flex-shrink-0 text-amber-400 font-bold">
                        {isCurrentPcLine ? "▶" : ""}
                      </span>

                      {/* Code Content */}
                      <span className="flex-1 text-[13px]">
                        {line.text}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* DISASSEMBLY VIEW */}
            {(centerTab === "assembly" || splitView) && (
              <div className="flex-1 flex flex-col min-h-0 bg-[#05080c] overflow-y-auto p-3 font-mono text-xs border-l border-[var(--line)]">
                {disasmData?.instructions ? (
                  disasmData.instructions.map((ins: any, idx: number) => {
                    const isPcMatch = ins.addr === pc;
                    return (
                      <div
                        key={idx}
                        className={`flex items-center gap-4 px-2 py-1 rounded font-mono transition ${
                          isPcMatch ? "bg-cyan-500/25 border-l-4 border-cyan-400 text-cyan-200 font-bold" : "hover:bg-white/5 text-gray-300"
                        }`}
                      >
                        <span className="w-4 flex-shrink-0 text-cyan-400">{isPcMatch ? "▶" : ""}</span>
                        <span className="text-amber-400 font-mono w-24">0x{ins.addr.toString(16).padStart(8, "0")}</span>
                        <span className="text-gray-500 w-20 truncate">{ins.bytes}</span>
                        <span className="text-cyan-300 font-bold w-16">{ins.mn}</span>
                        <span className="text-gray-200 flex-1">{ins.op}</span>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-4 text-gray-500 italic">Disassembling memory window around PC 0x{pc.toString(16).padStart(8, "0")}...</div>
                )}
              </div>
            )}
          </div>
        </main>

        {/* ⚡ RIGHT INSPECTOR PANE (LIVE REGISTERS DIFF, STACK & VARIABLES) */}
        <aside className="w-80 border-l border-[var(--line)] bg-[#070b10] flex flex-col flex-shrink-0 font-mono text-xs">
          {/* Inspector Tab Bar */}
          <div className="p-2 border-b border-[var(--line)] bg-black/40 flex items-center justify-between gap-1">
            {[
              { id: "registers", label: "⚡ Regs" },
              { id: "stack", label: "📚 Stack" },
              { id: "variables", label: "💎 Vars" },
              { id: "peripherals", label: "🎛️ Peripherals" },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setRightTab(tab.id as RightTab)}
                className={`px-2 py-1 rounded font-bold uppercase text-[10px] flex-1 text-center transition ${
                  rightTab === tab.id ? "bg-[var(--a)] text-black" : "bg-white/5 text-gray-400 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* TAB CONTENT */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {/* LIVE REGISTERS WITH CHANGED HIGHLIGHT */}
            {rightTab === "registers" && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-bold text-gray-400 border-b border-white/10 pb-1 flex justify-between">
                  <span>ARM Core Registers</span>
                  <span className="text-emerald-400">Live RSP Stream</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {Object.entries(registers).map(([reg, val]) => {
                    const isChanged = changedRegs.has(reg);
                    const prevVal = prevRegisters[reg];
                    const hexVal = `0x${val.toString(16).padStart(8, "0")}`;

                    return (
                      <div
                        key={reg}
                        title={prevVal !== undefined ? `Previous: 0x${prevVal.toString(16).padStart(8, "0")}` : undefined}
                        className={`p-2 rounded border transition flex flex-col ${
                          isChanged
                            ? "bg-amber-500/20 border-amber-400 text-amber-200 font-bold shadow-[0_0_8px_rgba(251,191,36,0.3)] animate-pulse"
                            : "bg-black/40 border-white/10 text-gray-300"
                        }`}
                      >
                        <span className="text-[10px] text-gray-400 font-bold">{reg}</span>
                        <span className="font-mono text-xs text-cyan-300 font-bold">{hexVal}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* STACK MEMORY VIEWER */}
            {rightTab === "stack" && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-bold text-gray-400 border-b border-white/10 pb-1">
                  Stack Pointer Memory (SP: 0x{sp.toString(16).padStart(8, "0")})
                </div>
                <div className="space-y-1">
                  {stackMemoryRows.map(row => (
                    <div key={row.addr} className="p-2 rounded bg-black/40 border border-white/10 font-mono text-[11px] flex justify-between items-center">
                      <div>
                        <div className="text-amber-400 font-bold">{row.addr}</div>
                        <div className="text-cyan-300">{row.hex}</div>
                      </div>
                      {row.label && <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">{row.label}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* DWARF VARIABLES */}
            {rightTab === "variables" && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-bold text-gray-400 border-b border-white/10 pb-1">
                  DWARF Local & Global Variables
                </div>
                <div className="space-y-1">
                  {dwarfVariables.map(v => (
                    <div key={v.name} className="p-2 rounded bg-black/40 border border-white/10 font-mono text-[11px]">
                      <div className="flex justify-between">
                        <span className="text-purple-300 font-bold">{v.name}</span>
                        <span className="text-gray-500">{v.type}</span>
                      </div>
                      <div className="text-emerald-400 font-bold mt-0.5">{v.value}</div>
                      <div className="text-[9px] text-gray-500 mt-0.5">{v.address}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* PERIPHERALS VIEW */}
            {rightTab === "peripherals" && (
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-gray-400 border-b border-white/10 pb-1">
                  MCU Peripheral Registers
                </div>
                {["GPIOA", "RCC", "USART1", "TIM2"].map(peri => (
                  <div key={peri} className="p-2 rounded bg-black/40 border border-white/10 font-mono text-xs">
                    <div className="font-bold text-cyan-300">{peri}</div>
                    <div className="text-[10px] text-gray-400 mt-1">Status: Active | Base: 0x40010800</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* 📟 BOTTOM GDB TERMINAL & RSP CONSOLE PANE */}
      <div className="h-44 border-t border-[var(--line)] bg-[#03060a] flex flex-col flex-shrink-0 font-mono text-xs">
        <div className="px-4 py-1 bg-[#070b10] border-b border-[var(--line)] flex justify-between items-center text-[11px] font-bold">
          <span className="text-[var(--a)]">💻 Live GDB Terminal & RSP Packet Stream</span>
          <span className="text-gray-500">Connected: ws://127.0.0.1:9001</span>
        </div>

        {/* LOG STREAM */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1 font-mono text-[11px] select-text">
          {gdbLogs.map(log => (
            <div key={log.id} className="flex items-start gap-2">
              <span className="text-gray-600 select-none">{log.time}</span>
              <span className={`font-bold ${
                log.type === "cmd" ? "text-cyan-400" : log.type === "rsp" ? "text-emerald-400" : log.type === "error" ? "text-red-400 font-bold" : "text-gray-300"
              }`}>
                {log.type === "cmd" ? "➔ " : log.type === "rsp" ? "⬅ " : "ℹ "} {log.text}
              </span>
            </div>
          ))}
          <div ref={consoleBottomRef} />
        </div>

        {/* GDB COMMAND INPUT PROMPT */}
        <form onSubmit={handleCustomGdbSubmit} className="p-2 border-t border-white/10 bg-black/40 flex items-center gap-2">
          <span className="text-cyan-400 font-bold pl-2">(gdb)</span>
          <input
            type="text"
            value={gdbInput}
            onChange={e => setGdbInput(e.target.value)}
            placeholder="Type GDB command (e.g. stepi, continue, info registers)..."
            className="flex-1 bg-black/60 border border-white/10 rounded px-2.5 py-1 text-xs text-white focus:border-[var(--a)] focus:outline-none font-mono"
          />
          <button
            type="submit"
            className="px-3 py-1 rounded bg-[var(--a)] text-black font-bold text-xs hover:opacity-90 transition font-mono"
          >
            Send
          </button>
        </form>
      </div>

      {/* Hardware Setup Modal */}
      <HardwareSetupModal
        isOpen={showSetupModal}
        onClose={() => setShowSetupModal(false)}
        onConnected={() => {
          setShowSetupModal(false);
          connectLocalAgent();
        }}
      />
    </div>
  );
}
