import type { Device } from "../utils/devices";
import type { ParseResult } from "../App";
import { fmt } from "../utils/devices";

export default function MemoryRegionsView({
  device,
  result,
}: {
  device: Device;
  result: ParseResult | null;
}) {
  if (!device) return null;

  return (
    <div className="p-6 h-full overflow-y-auto space-y-6 bg-[var(--bg)] text-white mono text-xs select-none">
      {/* HEADER */}
      <div className="pb-4 border-b border-[var(--line)] flex justify-between items-center">
        <div>
          <div className="text-[10px] text-[var(--mut)] uppercase tracking-wider font-bold">Device Support System</div>
          <h1 className="text-xl font-bold text-white">Memory Regions Manager</h1>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-[var(--mut)] uppercase">Target MCU</div>
          <div className="text-sm font-bold text-[var(--a)]">{device.name}</div>
        </div>
      </div>

      {/* REGION LAYOUT TABLE */}
      <div className="p-5 rounded-xl bg-black/30 border border-[var(--line)] space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-sm font-bold text-white">Hardware Memory Bus & Physical Regions</h2>
          <span className="text-[10px] text-[var(--mut)]">Configured via active MCU profile</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-[11px]">
            <thead>
              <tr className="border-b border-[var(--line)] text-[var(--mut)] uppercase text-[10px]">
                <th className="py-2.5 px-3">Region Name</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">Start Address</th>
                <th className="py-2.5 px-3">End Address</th>
                <th className="py-2.5 px-3">Size</th>
                <th className="py-2.5 px-3">Permissions</th>
                <th className="py-2.5 px-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {device.regions.map(r => {
                const used = result ? (r.kind === "flash" || r.kind === "xip" ? (result.summary[".text"] || 0) + (result.summary[".rodata"] || 0) : (result.summary[".data"] || 0) + (result.summary[".bss"] || 0)) : 0;
                const pct = Math.min(100, Math.round((used / r.size) * 100));
                return (
                  <tr key={r.name} className="border-b border-[var(--line)]/40 hover:bg-white/5 transition">
                    <td className="py-3 px-3 font-bold text-white flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                      <span>{r.name}</span>
                    </td>
                    <td className="py-3 px-3 text-amber-300 font-bold uppercase text-[10px]">{r.kind}</td>
                    <td className="py-3 px-3 font-mono text-gray-300">0x{r.base.toString(16).padStart(8, "0")}</td>
                    <td className="py-3 px-3 font-mono text-gray-300">0x{(r.base + r.size - 1).toString(16).padStart(8, "0")}</td>
                    <td className="py-3 px-3 font-bold text-emerald-400">{fmt(r.size)}</td>
                    <td className="py-3 px-3 font-mono text-purple-400">{r.kind === "flash" || r.kind === "xip" ? "RX (Read / Execute)" : "RW (Read / Write)"}</td>
                    <td className="py-3 px-3">
                      <div className="w-28 space-y-1">
                        <div className="flex justify-between text-[9px] text-[var(--mut)]">
                          <span>Usage</span>
                          <span>{pct}%</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-black/60 overflow-hidden border border-white/5">
                          <div className="h-full bg-[var(--a)]" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
