import type { ParseResult } from "../App";

export default function ExecutionWorkspaceRoadmap({
  result,
  device,
  onNavigate,
}: {
  result: ParseResult;
  device: any;
  onNavigate?: (view: string) => void;
}) {
  const deviceName = device?.name || "STM32F103C8 (Blue Pill)";
  const fileName = result?.filename || "firmware.elf";

  return (
    <div className="h-full bg-[#05080c] p-6 text-gray-200 select-none overflow-y-auto font-sans">
      {/* 🚀 TOP INTROSPECTION STATUS BANNER */}
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="p-6 rounded-lg bg-[#070b10] border border-[var(--line)] space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 rounded bg-[var(--a-dim)] text-[var(--a)] font-mono text-xs font-bold border border-[var(--a-dim)]">
                v2.0 OFFLINE ENGINE ACTIVE
              </span>
              <span className="text-gray-400 font-mono text-xs font-bold">•</span>
              <span className="text-cyan-400 font-mono text-xs font-bold">{deviceName}</span>
              <span className="text-gray-400 font-mono text-xs font-bold">•</span>
              <span className="text-amber-300 font-mono text-xs font-bold">{fileName}</span>
            </div>
            <span className="text-xs font-mono text-gray-400 font-bold">Target Identity: Offline Introspection</span>
          </div>

          <div className="border-t border-white/10 pt-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white font-mono flex items-center gap-2">
                <span>🎯 Execution Workspace & Live Debugging</span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-xs border border-emerald-500/30">
                  v3.0 Target Execution Roadmap
                </span>
              </h2>
              <p className="text-xs text-gray-400 mt-1 max-w-2xl font-mono">
                Firmware Insight Studio v2.0 is currently operating in pure **Offline Introspection Mode**. All source lines, assembly disassembly, section memory maps, and function call trees are derived 100% dynamically from your uploaded binary file.
              </p>
            </div>
            {onNavigate && (
              <button
                onClick={() => onNavigate("investigator")}
                className="px-4 py-2 rounded bg-[var(--a)] text-black font-bold text-xs font-mono hover:opacity-90 transition flex items-center gap-2"
              >
                <span>🔍 Open Code Investigator</span>
              </button>
            )}
          </div>
        </div>

        {/* 🛠️ ROADMAP CAPABILITIES GRID */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="p-5 rounded-lg bg-[#070b10] border border-white/10 space-y-3">
            <h3 className="text-sm font-bold text-[var(--a)] font-mono flex items-center gap-2">
              <span>✅ Active v2.0 Introspection Capabilities</span>
            </h3>
            <ul className="space-y-2 text-xs font-mono text-gray-300">
              <li className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span> Dynamic ELF, BIN, HEX binary parsing
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span> DWARF line table source reconstruction
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span> Capstone ARM/RISC-V Thumb disassembly
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span> Pseudo-C AST decompiler & symbol resolution
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span> Interactive Call Graph & Section Treemaps
              </li>
            </ul>
          </div>

          <div className="p-5 rounded-lg bg-[#070b10] border border-white/10 space-y-3">
            <h3 className="text-sm font-bold text-amber-400 font-mono flex items-center gap-2">
              <span>🛠️ Target Execution Engine (Planned v3.0)</span>
            </h3>
            <ul className="space-y-2 text-xs font-mono text-gray-400">
              <li className="flex items-center gap-2">
                <span className="text-amber-400">⚡</span> Live ST-Link V2 & J-Link Probe Auto-Detection
              </li>
              <li className="flex items-center gap-2">
                <span className="text-amber-400">⚡</span> Native OpenOCD / PyOCD GDB RSP Server Tunneling
              </li>
              <li className="flex items-center gap-2">
                <span className="text-amber-400">⚡</span> Hardware Breakpoint & Watchpoint Insertion
              </li>
              <li className="flex items-center gap-2">
                <span className="text-amber-400">⚡</span> Real-time ARM Core Register Diff Stream
              </li>
              <li className="flex items-center gap-2">
                <span className="text-amber-400">⚡</span> Live Peripheral MMIO Register Inspection
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
