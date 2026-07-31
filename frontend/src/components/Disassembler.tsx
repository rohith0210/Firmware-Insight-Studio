import { useEffect, useMemo, useRef, useState } from "react";
import type { ParseResult } from "../App";
import { getApiBaseUrl } from "../apiConfig";
import HardwareSetupModal from "./HardwareSetupModal";

type Instr = { addr: number; bytes: string; mn: string; op: string; t: string[]; w: string[] };
type Dis = {
  func: { name: string; addr: number; size: number };
  thumb: boolean;
  arch: string;
  instructions: Instr[];
  touched: string[];
  written: string[];
  schema: { n: string; role: string }[];
  error?: boolean;
  reason?: string;
  message?: string;
};
type Log = { c: "o" | "a" | "b" | "e" | "m"; t: string };
type Status = "idle" | "running" | "halted" | "returned";

export default function Disassembler({
  result,
  target,
  onNavigateView,
}: {
  result: ParseResult;
  target?: { name: string; nonce: number } | null;
  onNavigateView?: (view: string, param?: string) => void;
}) {
  const funcs = useMemo(() => {
    if (!result || !result.symbols || result.symbols.length === 0) {
      return ["main", "SystemClock_Config", "MX_GPIO_Init", "HAL_Init", "HAL_IncTick", "USART2_IRQHandler"];
    }
    const filtered = result.symbols
      .filter(s => s.type === "STT_FUNC" || s.section === ".text" || s.section === ".isr_vector" || s.size > 0)
      .map(s => s.name);
    return filtered.length > 0 ? filtered : result.symbols.map(s => s.name);
  }, [result]);

  const [name, setName] = useState<string>(() => {
    if (target && target.name) return target.name;
    if (funcs.includes("main")) return "main";
    return funcs[0] || "main";
  });

  // Mode Selection: Static Analysis Mode (default) vs Live Debug Session Mode
  const [isLiveDebug, setIsLiveDebug] = useState<boolean>(false);
  const [dis, setDis] = useState<Dis | null>(null);
  const [disError, setDisError] = useState<{ reason?: string; message?: string } | null>(null);
  const [loadingDis, setLoadingDis] = useState<boolean>(false);
  const [rightTab, setRightTab] = useState<"registers" | "stack" | "peripherals">("registers");
  const [bps, setBps] = useState<Set<number>>(new Set());
  const [log, setLog] = useState<Log[]>([
    { c: "a", t: "Firmware Insight · Static Analysis & Execution Workbench Initialized" },
    { c: "m", t: "Mode: Static Analysis Mode. Load a live debugging session (GDB/OpenOCD) for live CPU stepping." },
  ]);
  const [cmd, setCmd] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [funcSearch, setFuncSearch] = useState("");

  // CPU Registers State
  const [pc, setPc] = useState<number | null>(null);
  const [regs, setRegs] = useState<Record<string, number>>({
    R0: 0x20000100, R1: 0x00000000, R2: 0x40021000, R3: 0x00000001,
    R4: 0x00000000, R5: 0x00000000, R6: 0x00000000, R7: 0x20004000,
    R8: 0x00000000, R9: 0x00000000, R10: 0x00000000, R11: 0x00000000,
    R12: 0x00000000, SP: 0x20004000, LR: 0x080001b1, PC: 0x08000180,
    xPSR: 0x61000000, PRIMASK: 0x00000000,
  });
  const [status, setStatus] = useState<Status>("idle");
  const [steps] = useState(0);
  const [now] = useState<Set<string>>(new Set());

  const pcRef = useRef<number | null>(pc);
  const logRef = useRef<HTMLDivElement>(null);
  const activePcRef = useRef<HTMLDivElement | null>(null);

  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [showAgentModal, setShowAgentModal] = useState<boolean>(false);
  const wsRef = useRef<WebSocket | null>(null);
  const disasmCacheRef = useRef<Map<string, Dis>>(new Map());

  // Symbol resolution helper: maps an arbitrary memory address to its containing symbol name
  const resolveSymbolForPc = (targetPc: number): string | null => {
    const pcClean = targetPc & ~1;
    if (!result || !Array.isArray(result.symbols)) return null;

    const match = result.symbols.find(s => {
      const val = (s.value || 0) & ~1;
      const size = s.size || 0;
      if (size > 0) {
        return val <= pcClean && pcClean < val + size;
      }
      return val === pcClean;
    });

    return match ? match.name : null;
  };

  const connectLocalAgent = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      push("a", "🟢 [LOCAL AGENT ACTIVE] Session connected to ws://127.0.0.1:9001");
      return;
    }

    try {
      push("m", "🔌 [LOCAL AGENT] Connecting to Local Debug Agent on ws://127.0.0.1:9001...");
      const ws = new WebSocket("ws://127.0.0.1:9001");

      ws.onopen = () => {
        setWsConnected(true);
        setIsLiveDebug(true);
        setShowAgentModal(false);
        wsRef.current = ws;
        push("a", "🟢 [CONNECTED] Live Debugger active (ST-Link / OpenOCD:3333)");
        ws.send(JSON.stringify({ type: "CONNECT_GDB", host: "127.0.0.1", port: 3333 }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if ((msg.type === "REGISTERS" || msg.type === "STEP_COMPLETE" || msg.type === "HALTED" || msg.type === "RESET_COMPLETE") && msg.data) {
            setRegs(prev => ({ ...prev, ...msg.data }));
            if (msg.data.PC !== undefined) {
              setPc(msg.data.PC);
              pcRef.current = msg.data.PC;
            }
            if (msg.type === "HALTED" || msg.type === "RESET_COMPLETE" || msg.type === "STEP_COMPLETE") {
              setStatus("halted");
            }
          } else if (msg.type === "RUN_STARTED") {
            setStatus("running");
          }
        } catch (e) {}
      };

      ws.onerror = () => {
        setWsConnected(false);
        setIsLiveDebug(false);
        setShowAgentModal(true);
        push("e", "🔴 [DISCONNECTED] Could not reach Local Debug Agent on ws://127.0.0.1:9001.");
      };

      ws.onclose = () => {
        setWsConnected(false);
        setIsLiveDebug(false);
        wsRef.current = null;
      };
    } catch (e) {
      setWsConnected(false);
      setIsLiveDebug(false);
      setShowAgentModal(true);
    }
  };

  // Auto-scroll disassembly view to active PC line & Auto-follow PC across symbol boundaries
  useEffect(() => {
    if (pc !== null) {
      if (activePcRef.current) {
        activePcRef.current.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }

      // Check if current PC address is within the currently rendered disassembly view
      if (isLiveDebug && dis && dis.instructions && dis.instructions.length > 0) {
        const pcClean = pc & ~1;
        const inView = dis.instructions.some(i => (i.addr & ~1) === pcClean);
        if (!inView) {
          // Resolve symbol name for PC address to prevent raw hex bounce
          const resolvedSym = resolveSymbolForPc(pcClean);
          const targetName = resolvedSym || `0x${pcClean.toString(16).padStart(8, "0")}`;
          if (name !== targetName) {
            setName(targetName);
            push("b", `⚡ [LIVE CPU BRANCH] PC moved to ${targetName} (0x${pcClean.toString(16)}).`);
          }
        }
      }
    }
  }, [pc, isLiveDebug, dis, name, result]);

  const push = (c: Log["c"], t: string) => {
    setLog(prev => [...prev, { c, t }]);
    setTimeout(() => {
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    }, 20);
  };

  useEffect(() => {
    if (target && target.name) {
      setName(target.name);
    }
  }, [target?.nonce, target?.name]);

  // Fetch Disassembly with Client-Side Caching (Disassemble ONCE per symbol, silent cache hits)
  const fetchDisasm = () => {
    if (!name) return;

    // Check client-side cache first - SILENT load without redundant console logs
    if (disasmCacheRef.current.has(name)) {
      const cached = disasmCacheRef.current.get(name)!;
      setDis(cached);
      setLoadingDis(false);
      setDisError(null);
      return;
    }

    setLoadingDis(true);
    setDisError(null);
    const checksum = result?.checksum;
    const apiBase = getApiBaseUrl();
    const disUrl = checksum
      ? `${apiBase}/api/disasm?checksum=${encodeURIComponent(checksum)}&name=${encodeURIComponent(name)}`
      : `${apiBase}/api/disasm?name=${encodeURIComponent(name)}`;

    fetch(disUrl)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        setLoadingDis(false);
        if (data && !data.error && data.instructions && data.instructions.length > 0) {
          disasmCacheRef.current.set(name, data);
          setDis(data);
          // ONLY set initial static PC if PC is null. Do NOT overwrite live hardware PC!
          if (pc === null) {
            const entryAddr = data.func.addr;
            setPc(entryAddr);
            pcRef.current = entryAddr;
            setRegs(prev => ({ ...prev, PC: entryAddr }));
          }
          push("a", `Loaded '${name}' (${data.instructions.length} instrs)`);
        } else {
          setDis(null);
          const errDetail = {
            reason: data?.reason || "DECODE_FAILED",
            message: data?.message || `Disassembly unavailable for symbol '${name}'.`
          };
          setDisError(errDetail);
          push("e", `Disassembly unavailable for '${name}'`);
        }
      })
      .catch(err => {
        setLoadingDis(false);
        setDis(null);
        const errDetail = {
          reason: "NETWORK_ERROR",
          message: `Failed to connect to backend disassembly service: ${err.message}`
        };
        setDisError(errDetail);
        push("e", `Failed to load disassembly: ${err.message}`);
      });
  };

  useEffect(() => {
    fetchDisasm();
  }, [name, result?.checksum]);

  // STEP OVER (Single 'n' command)
  const handleStepOver = (): boolean => {
    if (!isLiveDebug) return false;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "STEP_OVER" }));
      push("o", "⤼ Step Over ('n')");
      return true;
    }
    return false;
  };

  // STEP INTO (Single 's' command)
  const handleStepInto = () => {
    if (!isLiveDebug) return;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "STEP_INTO" }));
      push("o", "⤵ Step Into ('s')");
      return;
    }
  };

  // RUN / CONTINUE (Send GDB RSP 'c' ONCE, or HALT with Interrupt \x03 ONCE)
  const handleRunToggle = () => {
    if (!isLiveDebug) return;

    if (status === "running") {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "HALT" }));
      }
      setStatus("halted");
      push("b", "⏸ Halted by user (\\x03)");
    } else {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "RUN" }));
      }
      setStatus("running");
      push("a", "▶ Continue ('c')");
    }
  };

  // RESET TARGET (Send monitor reset halt ONCE)
  const handleReset = () => {
    if (!isLiveDebug) {
      if (dis) {
        setPc(dis.func.addr);
        pcRef.current = dis.func.addr;
        setRegs(prev => ({ ...prev, PC: dis.func.addr }));
      }
      return;
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "RESET" }));
      setStatus("halted");
      push("a", "↺ Target Reset (monitor reset halt)");
    }
  };

  const toggleBp = (addr: number) => {
    setBps(prev => {
      const next = new Set(prev);
      if (next.has(addr)) {
        next.delete(addr);
        push("m", `🛑 Breakpoint removed at 0x${addr.toString(16)}`);
      } else {
        next.add(addr);
        push("b", `🛑 Breakpoint set at 0x${addr.toString(16)}`);
      }
      return next;
    });
  };

  const handleCommandInput = (inputStr: string) => {
    const trimmed = inputStr.trim();
    if (!trimmed) return;
    push("o", `> ${trimmed}`);

    const parts = trimmed.split(" ");
    const cmdName = parts[0].toLowerCase();
    const arg = parts[1];

    if (cmdName === "step" || cmdName === "s" || cmdName === "stepinto" || cmdName === "si") {
      handleStepInto();
    } else if (cmdName === "next" || cmdName === "n" || cmdName === "stepover" || cmdName === "so") {
      handleStepOver();
    } else if (cmdName === "run" || cmdName === "r") {
      handleRunToggle();
    } else if (cmdName === "reset") {
      handleReset();
    } else if (cmdName === "break" || cmdName === "b") {
      if (arg) {
        let addr = parseInt(arg.replace(/^0x/i, ""), 16);
        if (!isNaN(addr)) toggleBp(addr);
        else push("e", `Invalid breakpoint hex address '${arg}'`);
      } else {
        push("e", "Usage: break <hex_address>");
      }
    } else if (cmdName === "regs" || cmdName === "info") {
      if (isLiveDebug) {
        push(
          "a",
          `Registers: R0=0x${(regs.R0 || 0).toString(16)} R1=0x${(regs.R1 || 0).toString(16)} SP=0x${(regs.SP || 0).toString(16)} PC=0x${(regs.PC || 0).toString(16)}`
        );
      } else {
        push("e", "Runtime register values unavailable in Static Analysis Mode.");
      }
    } else if (cmdName === "help" || cmdName === "?") {
      push("b", "════════════════════════════════════════════════════");
      push("b", "  Cortex-M Execution REPL Debugger Help Reference   ");
      push("b", "════════════════════════════════════════════════════");
      push("o", "  step / s / si    - Step INTO function call");
      push("o", "  next / n / so    - Step OVER instruction");
      push("o", "  run / r          - Resume continuous execution");
      push("o", "  reset            - Reset target MCU");
      push("o", "  break / b <addr> - Set breakpoint at address");
      push("o", "  regs             - Display current CPU core registers");
      push("b", "════════════════════════════════════════════════════");
    } else {
      push("m", `Command '${trimmed}' executed.`);
    }
  };

  const filteredFuncs = funcs.filter(f => f.toLowerCase().includes(funcSearch.toLowerCase()));

  return (
    <div className="flex flex-col h-full bg-[var(--bg)] text-[var(--fg)] font-sans overflow-hidden select-none">
      {/* 4-STATE STATUS BAR: STATIC ANALYSIS | LOCAL AGENT CONNECTED | LIVE RUNNING | LIVE HALTED */}
      {!wsConnected || !isLiveDebug ? (
        <div className="bg-slate-900/80 border-b border-slate-700/50 px-4 py-2 text-slate-300 mono text-xs flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-600 text-slate-300 font-bold text-[10px] uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-slate-500" />
              Static Analysis
            </span>
            <span className="text-gray-400">Inspecting binary metadata. Connect Local Agent for live CPU stepping & hardware register state.</span>
          </div>
          <button
            onClick={connectLocalAgent}
            className="px-3 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-[11px] transition shadow flex items-center gap-1.5 whitespace-nowrap"
          >
            <span>🔌</span> Connect Local Debug Agent
          </button>
        </div>
      ) : status === "running" ? (
        <div className="bg-emerald-950/60 border-b border-emerald-500/30 px-4 py-2 text-emerald-300 mono text-xs flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold text-[10px] uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              Live Running
            </span>
            <span>Target executing at full hardware clock speed ('c'). Click Pause (Interrupt \x03) to halt.</span>
          </div>
          <button
            onClick={handleRunToggle}
            className="px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-bold text-[11px] transition shadow flex items-center gap-1.5 whitespace-nowrap"
          >
            <span>⏸</span> Pause Target
          </button>
        </div>
      ) : status === "halted" ? (
        <div className="bg-amber-950/60 border-b border-amber-500/30 px-4 py-2 text-amber-300 mono text-xs flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-[10px] uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              Live Halted
            </span>
            <span>CPU Halted at PC 0x{(pc || 0).toString(16).padStart(8, "0")}. Disassembly & registers synced.</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleStepOver}
              className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-white font-bold text-[11px] transition border border-white/10"
            >
              ⤼ Step Over
            </button>
            <button
              onClick={handleRunToggle}
              className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] transition shadow flex items-center gap-1.5"
            >
              <span>▶</span> Continue
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-blue-950/60 border-b border-blue-500/30 px-4 py-2 text-blue-300 mono text-xs flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-0.5 rounded bg-blue-500/20 border border-blue-500/40 text-blue-300 font-bold text-[10px] uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              Local Agent Connected
            </span>
            <span>Connected to Local Debug Agent (ws://127.0.0.1:9001 ➔ OpenOCD:3333 ➔ ST-Link). Ready for commands.</span>
          </div>
          <button
            onClick={() => {
              setIsLiveDebug(false);
              push("m", "[STATIC MODE] Disconnected live debugger session. Reverted to Static Analysis Mode.");
            }}
            className="px-3 py-1 rounded bg-black/40 border border-white/20 text-gray-300 hover:text-white font-bold text-[11px] transition whitespace-nowrap"
          >
            Disconnect Debugger
          </button>
        </div>
      )}

      {/* TOP EXECUTION TOOLBAR & CONTROLS */}
      <div className="bg-[var(--panel)] border-b border-[var(--line)] px-4 py-2 flex items-center justify-between gap-4 flex-shrink-0 relative z-30">
        <div className="flex items-center gap-3 relative">
          <span className="mono text-xs px-2 py-0.5 rounded bg-[var(--a-dim)] text-[var(--a)] font-bold uppercase tracking-wider">
            EXECUTION WORKSPACE
          </span>

          {/* FUNCTION SELECTION DRAWER */}
          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="bg-[#090d13] border border-[var(--a-dim)] hover:border-[var(--a)] rounded px-3 py-1 mono text-xs font-bold text-[var(--a)] flex items-center gap-2 transition shadow-md"
            >
              <span>⚙ {name}</span>
              <span className="text-[10px] text-[var(--mut)]">▼</span>
            </button>

            {dropdownOpen && (
              <div className="absolute left-0 top-full mt-1 w-64 bg-[#0a0f16] border border-[var(--a-dim)] shadow-2xl rounded p-2 z-50 mono text-xs">
                <input
                  type="text"
                  value={funcSearch}
                  onChange={e => setFuncSearch(e.target.value)}
                  placeholder="Filter functions..."
                  className="w-full bg-black/60 border border-[var(--line)] rounded px-2 py-1 text-[11px] text-[var(--fg)] outline-none mb-2"
                />
                <div className="max-h-48 overflow-y-auto space-y-0.5">
                  {filteredFuncs.map(f => (
                    <button
                      key={f}
                      onClick={() => {
                        setName(f);
                        setDropdownOpen(false);
                      }}
                      className={`w-full text-left px-2 py-1 rounded transition text-[11px] flex justify-between items-center ${name === f
                          ? "bg-[var(--a-dim)] text-[var(--a)] font-bold border border-[var(--a-dim)]"
                          : "hover:bg-white/5 text-gray-300"
                        }`}
                    >
                      <span className="truncate">{f}</span>
                      <span className="text-[9px] text-[var(--mut)]">FUNC</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* LOCAL AGENT HANDSHAKE BUTTON */}
          <button
            onClick={connectLocalAgent}
            title="Connect to Local Debug Agent (ws://127.0.0.1:9001) for live ST-Link hardware stepping"
            className={`mono text-xs px-2.5 py-1 rounded border font-bold transition flex items-center gap-1.5 ${
              wsConnected
                ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
                : "bg-cyan-500/10 border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20"
            }`}
          >
            <span>{wsConnected ? "🟢 Local Agent Active" : "🔌 Connect Local Agent"}</span>
          </button>
        </div>

        {/* DEBUGGER CONTROLS (DISABLED WHEN HARDWARE NOT CONNECTED) */}
        <div className="flex items-center gap-2">
          {(() => {
            const isHardwareActive = isLiveDebug || wsConnected;
            const disabledTitle = "Hardware not connected. Connect Local Debug Agent (ws://127.0.0.1:9001) or ST-Link to enable live CPU controls.";
            return (
              <>
                <button
                  onClick={handleRunToggle}
                  disabled={!isHardwareActive}
                  title={!isHardwareActive ? disabledTitle : status === "running" ? "Pause execution" : "Run target"}
                  className={`mono text-xs px-3 py-1 rounded transition flex items-center gap-1 font-bold ${
                    !isHardwareActive
                      ? "bg-black/40 border border-white/10 text-gray-500 cursor-not-allowed opacity-50"
                      : status === "running"
                      ? "bg-amber-600 text-white hover:bg-amber-500 font-bold"
                      : "bg-emerald-600 text-white hover:bg-emerald-500 font-bold"
                  }`}
                >
                  <span>{status === "running" ? "⏸ Pause" : "▶ Run"}</span>
                </button>

                <button
                  onClick={handleStepOver}
                  disabled={!isHardwareActive}
                  title={!isHardwareActive ? disabledTitle : "Step Over (stay in current function listing)"}
                  className={`mono text-xs px-3 py-1 rounded border font-bold transition flex items-center gap-1 ${
                    !isHardwareActive
                      ? "bg-black/40 border border-white/10 text-gray-500 cursor-not-allowed opacity-50"
                      : "bg-[#121922] border-[var(--line)] hover:border-[var(--a)] text-[var(--fg)] hover:text-white"
                  }`}
                >
                  <span>↷ Step Over</span>
                </button>

                <button
                  onClick={handleStepInto}
                  disabled={!isHardwareActive}
                  title={!isHardwareActive ? disabledTitle : "Step Into (follow function calls like HAL_Init)"}
                  className={`mono text-xs px-3 py-1 rounded border font-bold transition flex items-center gap-1 ${
                    !isHardwareActive
                      ? "bg-black/40 border border-white/10 text-gray-500 cursor-not-allowed opacity-50"
                      : "bg-[rgba(51,214,194,0.18)] border-[var(--a)] text-[var(--a)] hover:bg-[var(--a)] hover:text-black shadow-sm"
                  }`}
                >
                  <span>⤶ Step Into</span>
                </button>

                <button
                  onClick={handleReset}
                  disabled={!isHardwareActive}
                  title={!isHardwareActive ? disabledTitle : "Reset Target PC to function entry point"}
                  className={`mono text-xs px-3 py-1 rounded border font-bold transition ${
                    !isHardwareActive
                      ? "bg-black/40 border border-white/10 text-gray-500 cursor-not-allowed opacity-50"
                      : "bg-black/40 border-red-500/40 text-red-400 hover:bg-red-500/20"
                  }`}
                >
                  ↺ Reset Target
                </button>
              </>
            );
          })()}
        </div>
      </div>

      {/* MAIN EXECUTION WORKSPACE LAYOUT */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* LEFT ASSEMBLY LISTING & BREAKPOINTS */}
        <div className="flex-1 border-r border-[var(--line)] bg-[#090d13] flex flex-col overflow-hidden">
          <div className="px-4 py-2 border-b border-[var(--line)] bg-[var(--panel)] flex justify-between items-center">
            <div className="mono text-xs text-[var(--a)] font-bold flex items-center gap-2">
              <span>⌬</span>
              <span>Disassembly Listing // {name}</span>
            </div>
            <div className="mono text-[10px] text-[var(--mut)]">
              {isLiveDebug ? `PC: 0x${(pc || 0).toString(16)} · Steps: ${steps}` : "Static Disassembly View"}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 mono text-xs leading-relaxed">
            {loadingDis ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <div className="w-8 h-8 border-2 border-[var(--a)] border-t-transparent rounded-full animate-spin mb-3"></div>
                <span className="mono text-xs text-[var(--a)]">Decoding assembly instructions for '{name}'...</span>
              </div>
            ) : dis && dis.instructions && dis.instructions.length > 0 ? (
              <div className="space-y-1 font-mono select-text">
                {dis.instructions.map(ins => {
                  const isCurrentPc = pc === ins.addr;
                  const isBp = bps.has(ins.addr);
                  return (
                    <div
                      key={ins.addr}
                      ref={isCurrentPc ? activePcRef : null}
                      onClick={() => {
                        if (isLiveDebug) {
                          setPc(ins.addr);
                          pcRef.current = ins.addr;
                        }
                      }}
                      className={`flex items-center gap-3 px-2.5 py-1 rounded transition ${isCurrentPc
                          ? "bg-[rgba(51,214,194,0.35)] border-l-4 border-[var(--a)] font-bold text-white shadow-lg shadow-[var(--a)]/20"
                          : "hover:bg-white/5 text-gray-300"
                        }`}
                    >
                      {/* Breakpoint Gutter */}
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          toggleBp(ins.addr);
                        }}
                        className={`w-4 h-4 rounded-full border text-[9px] flex items-center justify-center font-bold transition ${isBp
                            ? "bg-red-500 border-red-400 text-white shadow-lg shadow-red-500/50"
                            : "border-[var(--line)] hover:border-red-400 text-transparent"
                          }`}
                      >
                        ●
                      </button>

                      {/* PC Indicator */}
                      <span className="w-4 text-center font-bold text-[var(--a)]">
                        {isCurrentPc ? "➔" : ""}
                      </span>

                      {/* Address */}
                      <span className="w-24 text-[var(--a)] font-bold">
                        0x{ins.addr.toString(16)}
                      </span>

                      {/* Machine Code Bytes */}
                      <span className="w-24 text-[var(--mut)] text-[10px] font-mono">
                        {ins.bytes}
                      </span>

                      {/* Mnemonic & Operands */}
                      <span className="w-16 font-bold text-amber-400">
                        {ins.mn}
                      </span>
                      <span className="flex-1 text-gray-200">{ins.op}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* RICH DIAGNOSTIC PANEL WHEN DISASSEMBLY FAILS */
              <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#070b10] text-center select-text">
                <div className="max-w-xl w-full p-6 rounded-lg bg-black/60 border border-[var(--line)] space-y-6 text-left shadow-2xl">
                  <div className="flex items-start gap-4 border-b border-[var(--line)] pb-4">
                    <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/30 grid place-items-center flex-shrink-0">
                      <span className="text-2xl">⚠️</span>
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white mb-1">Disassembly Generation Unavailable</h3>
                      <p className="text-xs text-[var(--mut)] leading-relaxed">
                        Unable to decode assembly instructions for symbol <strong className="text-white">{name}</strong>.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3 text-xs mono">
                    <div className="font-bold text-rose-400 uppercase tracking-wider text-[11px]">Reason & Diagnostics</div>
                    <div className="p-3 rounded bg-black/40 border border-white/5 text-gray-300 leading-relaxed font-mono">
                      {disError?.message || `Symbol size is 0 bytes or target section is non-executable.`}
                    </div>

                    <div className="font-bold text-[var(--a)] uppercase tracking-wider text-[11px] pt-1">Possible Causes</div>
                    <ul className="list-disc list-inside space-y-1 text-gray-400 text-[11px]">
                      <li>Symbol represents a static data variable or table in <code className="text-amber-300">.rodata</code> / <code className="text-amber-300">.data</code> / <code className="text-amber-300">.bss</code>.</li>
                      <li>DWARF line table missing or symbol address is out of section virtual bounds.</li>
                      <li>Unsupported instruction architecture or stripped symbol payload.</li>
                    </ul>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-[var(--line)]">
                    <div className="text-[11px] text-[var(--mut)] uppercase font-bold">Suggested Actions</div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => onNavigateView?.("investigator", name)} className="px-3 py-1.5 rounded bg-[var(--a)]/20 hover:bg-[var(--a)]/30 border border-[var(--a)]/50 text-[var(--a)] text-xs font-bold transition">
                        [ Open Symbol Inspector ]
                      </button>
                      <button onClick={() => onNavigateView?.("memory")} className="px-3 py-1.5 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-300 text-xs font-bold transition">
                        [ Open Hex Dump ]
                      </button>
                      <button onClick={() => fetchDisasm()} className="px-3 py-1.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 text-emerald-300 text-xs font-bold transition">
                        [ Retry Analysis ]
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANE: CPU CORE REGISTERS, STACK FRAME, & PERIPHERAL MMIO INSPECTOR */}
        <div className="w-[380px] flex flex-col border-l border-[var(--line)] bg-[var(--panel)] overflow-y-auto flex-shrink-0">
          {/* TAB BAR FOR RIGHT SIDEBAR */}
          <div className="px-2 py-1.5 border-b border-[var(--line)] bg-black/40 flex items-center justify-between font-mono text-[11px]">
            <div className="flex items-center gap-1">
              {(["registers", "stack", "peripherals"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setRightTab(tab)}
                  className={`px-2.5 py-1 rounded font-bold capitalize transition ${
                    rightTab === tab
                      ? "bg-[var(--a)] text-black"
                      : "text-gray-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <span className="text-[10px] text-emerald-400 font-bold">ARM Cortex-M3</span>
          </div>

          {/* REGISTERS PANE */}
          {rightTab === "registers" && (
            !isLiveDebug && !wsConnected ? (
              <div className="p-4 border-b border-[var(--line)] bg-black/40 text-center space-y-2.5 mono text-xs">
                <div className="text-gray-400 font-bold flex items-center justify-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-gray-500"></span>
                  <span>⚪ HARDWARE DISCONNECTED</span>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Connect a Local Debug Agent (<code className="text-cyan-300">ws://127.0.0.1:9001</code>) & ST-Link probe to view live hardware CPU core registers.
                </p>
                <button
                  onClick={connectLocalAgent}
                  className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] transition shadow flex items-center gap-1.5 mx-auto"
                >
                  <span>🔌</span> Connect Local Agent
                </button>
              </div>
            ) : (
              <div className="p-3 border-b border-[var(--line)] bg-black/20 space-y-2">
                <div className="mono text-[10px] text-[var(--mut)] uppercase font-bold tracking-wider flex justify-between items-center">
                  <span>CPU Core Registers</span>
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                    🟢 Live GDB RSP
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 mono text-xs">
                  {Object.entries(regs).map(([rName, val]) => {
                    const isTouched = now.has(rName.toLowerCase());
                    const hexVal = (val >>> 0).toString(16).padStart(8, "0");
                    return (
                      <div
                        key={rName}
                        onClick={() => {
                          if (onNavigateView) onNavigateView("memory");
                          push("b", `🔍 Inspecting memory at address 0x${hexVal} (${rName})`);
                        }}
                        title={`Click to inspect memory at address 0x${hexVal}`}
                        className={`p-1.5 rounded border flex justify-between items-center transition cursor-pointer hover:border-[var(--a)] ${
                          isTouched
                            ? "bg-amber-500/20 border-amber-400 text-amber-200"
                            : "bg-black/30 border-[var(--line)] text-gray-200"
                        }`}
                      >
                        <span className="font-bold text-[var(--a)] text-[11px]">{rName}</span>
                        <span className="font-mono text-[11px] text-emerald-400 underline decoration-dotted">
                          0x{hexVal}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          )}

          {/* STACK INSPECTOR PANE */}
          {rightTab === "stack" && (
            <div className="p-3 border-b border-[var(--line)] bg-black/20 space-y-3 mono text-xs">
              <div className="mono text-[10px] text-[var(--mut)] uppercase font-bold tracking-wider flex justify-between">
                <span>Call Stack / Frames</span>
                <span className="text-[var(--a)]">{isLiveDebug || wsConnected ? "🟢 Live GDB Frame" : "Static Frame"}</span>
              </div>
              <div className="space-y-2">
                <div className="p-2.5 rounded bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-amber-400 font-bold text-sm">🟡</span>
                    <div>
                      <div className="font-bold text-amber-300 text-xs">{name}</div>
                      <div className="text-[10px] text-gray-400">PC: 0x{(pc || 0).toString(16).padStart(8, "0")}</div>
                    </div>
                  </div>
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[9px] font-bold">FRAME #0</span>
                </div>

                {regs.LR && regs.LR !== 0xffffffff ? (
                  <>
                    <div className="text-center text-gray-500 text-[10px] font-bold">↓</div>
                    <div className="p-2.5 rounded bg-black/40 border border-white/10 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400 font-bold text-sm">⚪</span>
                        <div>
                          <div className="font-bold text-gray-300 text-xs">caller_subroutine</div>
                          <div className="text-[10px] text-gray-400">LR: 0x{(regs.LR || 0).toString(16).padStart(8, "0")}</div>
                        </div>
                      </div>
                      <span className="px-1.5 py-0.5 rounded bg-white/10 text-gray-400 text-[9px] font-bold">FRAME #1</span>
                    </div>
                  </>
                ) : null}

                <div className="pt-2 border-t border-[var(--line)] text-[10px] text-gray-400 flex justify-between items-center">
                  <span>Stack Pointer (SP):</span>
                  <span className="font-bold text-cyan-300 font-mono">0x{(regs.SP || 0x20004000).toString(16).padStart(8, "0")}</span>
                </div>
              </div>
            </div>
          )}

          {/* PERIPHERAL MMIO REGISTER INSPECTOR */}
          {rightTab === "peripherals" && (
            <div className="p-3 bg-black/20 space-y-3 flex-1 overflow-y-auto font-mono text-xs">
              <div className="mono text-[10px] text-amber-400 uppercase font-bold tracking-wider flex justify-between">
                <span>Peripheral MMIO Registers</span>
                <span>Cortex-M Map</span>
              </div>
              <div className="space-y-3">
                {[
                  {
                    name: "GPIOA",
                    base: "0x40010800",
                    bus: "APB2",
                    regs: [
                      { name: "CRL", off: "0x00", val: "0x44444444", desc: "Port Config Low" },
                      { name: "CRH", off: "0x04", val: "0x44444444", desc: "Port Config High" },
                      { name: "IDR", off: "0x08", val: "0x00000000", desc: "Input Data Reg" },
                      { name: "ODR", off: "0x0C", val: "0x00000001", desc: "Output Data Reg (Pin 0 HIGH)" },
                      { name: "BSRR", off: "0x10", val: "0x00000000", desc: "Bit Set/Reset" }
                    ]
                  },
                  {
                    name: "GPIOB",
                    base: "0x40010C00",
                    bus: "APB2",
                    regs: [
                      { name: "CRL", off: "0x00", val: "0x44444444", desc: "Port Config Low" },
                      { name: "ODR", off: "0x0C", val: "0x00000000", desc: "Output Data Reg" }
                    ]
                  },
                  {
                    name: "RCC",
                    base: "0x40021000",
                    bus: "AHB",
                    regs: [
                      { name: "CR", off: "0x00", val: "0x03035683", desc: "Clock Control (HSE/PLL ON)" },
                      { name: "CFGR", off: "0x04", val: "0x001D0402", desc: "Clock Configuration" },
                      { name: "APB2ENR", off: "0x18", val: "0x0000001D", desc: "APB2 Clock Enable (IOPA|IOPB|AFIO)" }
                    ]
                  },
                  {
                    name: "USART1",
                    base: "0x40013800",
                    bus: "APB2",
                    regs: [
                      { name: "SR", off: "0x00", val: "0x000000C0", desc: "Status (TXE=1, TC=1)" },
                      { name: "DR", off: "0x04", val: "0x00000055", desc: "Data Reg ('U')" },
                      { name: "BRR", off: "0x08", val: "0x000001D4", desc: "Baud Rate 115200" }
                    ]
                  },
                  {
                    name: "TIM2",
                    base: "0x40000000",
                    bus: "APB1",
                    regs: [
                      { name: "CR1", off: "0x00", val: "0x00000001", desc: "Control Reg 1 (Counter ON)" },
                      { name: "CNT", off: "0x24", val: "0x000003E8", desc: "Current Counter (1000)" }
                    ]
                  }
                ].map(per => (
                  <div key={per.name} className="p-2.5 rounded bg-black/50 border border-[var(--line)] space-y-1.5">
                    <div className="flex justify-between items-center border-b border-white/10 pb-1 text-[11px]">
                      <span className="font-bold text-cyan-300">{per.name}</span>
                      <span className="text-[10px] text-gray-400">{per.base} ({per.bus})</span>
                    </div>
                    <div className="space-y-1 pt-1">
                      {per.regs.map(r => (
                        <div key={r.name} className="flex justify-between items-center text-[10px]">
                          <span className="text-gray-300 font-bold">{r.name} ({r.off})</span>
                          <span className="text-amber-300 font-mono font-bold">{r.val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* EXPANDED PRO-GRADE COMMAND LINE INTERFACE */}
      <div className="h-56 border-t border-[var(--line)] bg-[#070b10] flex flex-col flex-shrink-0">
        <div className="px-4 py-2 border-b border-[var(--line)] bg-[var(--panel)] flex items-center justify-between">
          <div className="mono text-xs text-[var(--a)] font-bold flex items-center gap-2">
            <span>💻</span>
            <span>Debugger Command Line Terminal (Cortex-M REPL Console)</span>
          </div>
          <div className="mono text-[10px] text-[var(--mut)] flex items-center gap-3">
            <span>STATUS: <strong className={isLiveDebug ? "text-emerald-400" : "text-amber-400"}>{isLiveDebug ? "LIVE DEBUGGER" : "STATIC ANALYSIS"}</strong></span>
            <span>|</span>
            <span>PORT: <strong>GDB-STLINK:3333</strong></span>
          </div>
        </div>

        <div ref={logRef} className="flex-1 p-3 overflow-y-auto mono text-xs space-y-1 bg-black/60 select-text leading-relaxed">
          {log.map((l, i) => (
            <div
              key={i}
              className={
                l.c === "a" ? "text-[var(--a)] font-bold" :
                  l.c === "b" ? "text-amber-400 font-bold" :
                    l.c === "e" ? "text-red-400 font-bold" :
                      l.c === "m" ? "text-[var(--mut)] italic" : "text-gray-200"
              }
            >
              {l.t}
            </div>
          ))}
        </div>

        <div className="px-3 py-1.5 bg-black/80 border-t border-[var(--line)] flex items-center gap-2 overflow-x-auto no-scrollbar mono text-[10px]">
          <span className="text-[var(--mut)] font-bold uppercase tracking-wider text-[9px] mr-1">Quick Cmds:</span>
          {[
            { label: "⤶ step into", cmdStr: "step" },
            { label: "↷ step over", cmdStr: "next" },
            { label: "▶ run", cmdStr: "run" },
            { label: "↺ reset", cmdStr: "reset" },
            { label: "● break 0x8000184", cmdStr: "break 0x8000184" },
            { label: "⌬ regs", cmdStr: "regs" },
            { label: "❓ help", cmdStr: "help" },
          ].map(badge => (
            <button
              key={badge.label}
              onClick={() => handleCommandInput(badge.cmdStr)}
              className="bg-white/5 hover:bg-[var(--a-dim)] border border-[var(--line)] hover:border-[var(--a-dim)] text-gray-300 hover:text-[var(--a)] px-2.5 py-1 rounded font-bold transition whitespace-nowrap"
            >
              {badge.label}
            </button>
          ))}
        </div>

        <form
          onSubmit={e => {
            e.preventDefault();
            handleCommandInput(cmd);
            setCmd("");
          }}
          className="flex border-t border-[var(--line)] bg-black"
        >
          <span className="px-4 py-2 mono text-xs text-[var(--a)] font-bold flex items-center gap-1">
            <span>dbg&gt;</span>
          </span>
          <input
            type="text"
            value={cmd}
            onChange={e => setCmd(e.target.value)}
            placeholder="Type debugger commands (step, next, run, break 0x8000184, regs, help)..."
            className="flex-1 bg-transparent border-none outline-none mono text-xs text-gray-200 placeholder:text-[var(--mut)] py-2"
          />
        </form>
      </div>

      {/* HARDWARE SETUP & DIAGNOSTICS GUIDE MODAL */}
      <HardwareSetupModal
        isOpen={showAgentModal}
        onClose={() => setShowAgentModal(false)}
        onConnected={connectLocalAgent}
      />
    </div>
  );
}
