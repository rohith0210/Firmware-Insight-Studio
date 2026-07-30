import type { Device } from "../utils/devices";
import type { ParseResult } from "../App";
import { fmt } from "../utils/devices";

export default function DeviceDashboardView({
  device,
  result,
  onNavigate,
}: {
  device: Device;
  result: ParseResult | null;
  onNavigate?: (view: any, parameter?: string) => void;
}) {
  if (!device) return null;

  const usedFlash = result ? (result.summary[".text"] || 0) + (result.summary[".rodata"] || 0) : 0;
  const usedRam = result ? (result.summary[".data"] || 0) + (result.summary[".bss"] || 0) : 0;

  const flashPct = device.flashSize ? Math.min(100, Math.round((usedFlash / device.flashSize) * 100)) : 0;
  const ramPct = device.sramSize ? Math.min(100, Math.round((usedRam / device.sramSize) * 100)) : 0;

  return (
    <div className="p-6 h-full overflow-y-auto space-y-6 bg-[var(--bg)] text-white mono text-xs select-none">
      {/* DEVICE HERO HEADER */}
      <div className="p-5 rounded-xl bg-black/40 border border-[var(--line)] flex justify-between items-center shadow-lg">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-[var(--a-dim)] border border-[var(--a)] flex items-center justify-center text-xl font-bold text-[var(--a)]">
            {device.vendor.substring(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[var(--mut)] uppercase tracking-wider font-bold">Active Target MCU</span>
              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px]">
                ACTIVE PROFILE
              </span>
            </div>
            <h1 className="text-xl font-bold text-white mt-0.5">{device.name}</h1>
            <div className="text-gray-400 text-[11px]">
              {device.vendor} · {device.architecture} · {device.core} @ {device.clockSpeed || "72 MHz"}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => onNavigate?.("dev_manager")}
            className="px-3 py-2 rounded-lg bg-black/50 border border-[var(--line)] hover:border-[var(--a)] text-gray-200 hover:text-white transition font-bold text-xs"
          >
            🔄 Switch Target Device
          </button>
          {device.datasheetUrl && (
            <a
              href={device.datasheetUrl}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-2 rounded-lg bg-[var(--a-dim)] border border-[var(--a)] text-[var(--a)] hover:bg-[var(--a)] hover:text-black transition font-bold text-xs flex items-center gap-1"
            >
              📄 Datasheet
            </a>
          )}
        </div>
      </div>

      {/* METRICS GRID */}
      <div className="grid grid-cols-4 gap-4">
        {/* FLASH METRIC */}
        <div className="p-4 rounded-xl bg-black/30 border border-[var(--line)] space-y-2">
          <div className="flex justify-between text-[10px] text-[var(--mut)] uppercase font-bold">
            <span>Flash Memory</span>
            <span className="text-[var(--a)]">{flashPct}% Used</span>
          </div>
          <div className="text-lg font-bold text-white">{device.flashSize ? fmt(device.flashSize) : "N/A"}</div>
          <div className="w-full h-1.5 rounded-full bg-black/60 overflow-hidden border border-white/5">
            <div className="h-full bg-[var(--a)] transition-all duration-500" style={{ width: `${flashPct}%` }} />
          </div>
          <div className="text-[10px] text-gray-400">Used: {fmt(usedFlash)} | Free: {fmt(Math.max(0, (device.flashSize || 0) - usedFlash))}</div>
        </div>

        {/* SRAM METRIC */}
        <div className="p-4 rounded-xl bg-black/30 border border-[var(--line)] space-y-2">
          <div className="flex justify-between text-[10px] text-[var(--mut)] uppercase font-bold">
            <span>SRAM Memory</span>
            <span className="text-emerald-400">{ramPct}% Used</span>
          </div>
          <div className="text-lg font-bold text-white">{device.sramSize ? fmt(device.sramSize) : "N/A"}</div>
          <div className="w-full h-1.5 rounded-full bg-black/60 overflow-hidden border border-white/5">
            <div className="h-full bg-emerald-400 transition-all duration-500" style={{ width: `${ramPct}%` }} />
          </div>
          <div className="text-[10px] text-gray-400">Used: {fmt(usedRam)} | Free: {fmt(Math.max(0, (device.sramSize || 0) - usedRam))}</div>
        </div>

        {/* VECTOR TABLE */}
        <div className="p-4 rounded-xl bg-black/30 border border-[var(--line)] space-y-2">
          <div className="text-[10px] text-[var(--mut)] uppercase font-bold">Vector Table Base</div>
          <div className="text-lg font-bold text-purple-400 font-mono">0x{(device.vectorTableAddr || 0x08000000).toString(16)}</div>
          <div className="text-[10px] text-gray-400">Vectors: {device.interruptCount || 48} Interrupts</div>
        </div>

        {/* TOOLCHAIN & RTOS */}
        <div className="p-4 rounded-xl bg-black/30 border border-[var(--line)] space-y-2">
          <div className="text-[10px] text-[var(--mut)] uppercase font-bold">Default Toolchain</div>
          <div className="text-sm font-bold text-amber-300">{device.defaultToolchain || "arm-none-eabi-gcc"}</div>
          <div className="text-[10px] text-gray-400">RTOS: {(device.rtos || ["FreeRTOS"]).join(", ")}</div>
        </div>
      </div>

      {/* DETAILED DEVICE CHARACTERISTICS & MEMORY REGIONS */}
      <div className="grid grid-cols-3 gap-6">
        {/* LEFT 2 COLUMNS: MEMORY REGION LAYOUT */}
        <div className="col-span-2 p-5 rounded-xl bg-black/30 border border-[var(--line)] space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-white text-sm">Memory Region Map</h3>
            <button
              onClick={() => onNavigate?.("dev_regions")}
              className="text-[11px] text-[var(--a)] hover:underline"
            >
              View Full Layout →
            </button>
          </div>

          <div className="space-y-2">
            {device.regions.map((r: any) => (
              <div key={r.name} className="p-3 rounded-lg bg-black/50 border border-[var(--line)] flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: r.color }} />
                  <div>
                    <div className="font-bold text-white">{r.name}</div>
                    <div className="text-[10px] text-[var(--mut)] uppercase">{r.kind} Memory</div>
                  </div>
                </div>
                <div className="text-right font-mono">
                  <div className="text-gray-200">0x{r.base.toString(16)} – 0x{(r.base + r.size - 1).toString(16)}</div>
                  <div className="text-[10px] text-emerald-400 font-bold">{fmt(r.size)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT COLUMN: QUICK NAVIGATOR TO DEVICE TOOLS */}
        <div className="p-5 rounded-xl bg-black/30 border border-[var(--line)] space-y-3">
          <h3 className="font-bold text-white text-sm">Device Analysis Tools</h3>
          <div className="space-y-2">
            <button
              onClick={() => onNavigate?.("dev_arch")}
              className="w-full p-3 rounded-lg bg-black/50 border border-[var(--line)] hover:border-[var(--a)] text-left flex justify-between items-center transition"
            >
              <div>
                <div className="font-bold text-white">Architecture Explorer</div>
                <div className="text-[10px] text-[var(--mut)]">ISA, register model, calling convention</div>
              </div>
              <span className="text-[var(--a)]">→</span>
            </button>

            <button
              onClick={() => onNavigate?.("dev_startup")}
              className="w-full p-3 rounded-lg bg-black/50 border border-[var(--line)] hover:border-[var(--a)] text-left flex justify-between items-center transition"
            >
              <div>
                <div className="font-bold text-white">Startup Flow</div>
                <div className="text-[10px] text-[var(--mut)]">Bootloader to main() sequence</div>
              </div>
              <span className="text-[var(--a)]">→</span>
            </button>

            <button
              onClick={() => onNavigate?.("dev_interrupts")}
              className="w-full p-3 rounded-lg bg-black/50 border border-[var(--line)] hover:border-[var(--a)] text-left flex justify-between items-center transition"
            >
              <div>
                <div className="font-bold text-white">Interrupt Viewer</div>
                <div className="text-[10px] text-[var(--mut)]">Vector table handler addresses</div>
              </div>
              <span className="text-[var(--a)]">→</span>
            </button>

            <button
              onClick={() => onNavigate?.("dev_periph_db")}
              className="w-full p-3 rounded-lg bg-black/50 border border-[var(--line)] hover:border-[var(--a)] text-left flex justify-between items-center transition"
            >
              <div>
                <div className="font-bold text-white">Peripheral Database</div>
                <div className="text-[10px] text-[var(--mut)]">Integrated MCU hardware peripherals</div>
              </div>
              <span className="text-[var(--a)]">→</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
