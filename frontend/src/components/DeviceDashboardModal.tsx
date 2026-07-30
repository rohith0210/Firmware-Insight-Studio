import { createPortal } from "react-dom";
import type { Device } from "../utils/devices";
import { fmt } from "../utils/devices";

export default function DeviceDashboardModal({
  device,
  onClose,
}: {
  device: Device;
  onClose: () => void;
}) {
  if (!device) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none font-sans">
      <div className="bg-[var(--panel)] border border-[var(--line)] rounded-xl w-full max-w-3xl overflow-hidden shadow-2xl mono text-xs">
        {/* HEADER */}
        <div className="px-5 py-4 border-b border-[var(--line)] bg-black/40 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-[var(--a)]" />
            <div>
              <div className="text-[10px] text-[var(--mut)] uppercase tracking-wider font-bold">Target Device Specification</div>
              <h2 className="text-lg font-bold text-white">{device.name}</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-[var(--line)] text-gray-400 hover:text-white hover:bg-white/5 flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        {/* CONTENT BODY */}
        <div className="p-5 space-y-4 max-h-[540px] overflow-y-auto">
          {/* GRID OF SPECS */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-black/50 border border-[var(--line)] space-y-1">
              <span className="text-[10px] text-[var(--mut)] uppercase block">Manufacturer</span>
              <strong className="text-white text-sm block">{device.vendor}</strong>
            </div>

            <div className="p-3 rounded-lg bg-black/50 border border-[var(--line)] space-y-1">
              <span className="text-[10px] text-[var(--mut)] uppercase block">Architecture</span>
              <strong className="text-[var(--a)] text-sm block">{device.architecture}</strong>
            </div>

            <div className="p-3 rounded-lg bg-black/50 border border-[var(--line)] space-y-1">
              <span className="text-[10px] text-[var(--mut)] uppercase block">CPU Core</span>
              <strong className="text-amber-300 text-sm block">{device.core}</strong>
            </div>

            <div className="p-3 rounded-lg bg-black/50 border border-[var(--line)] space-y-1">
              <span className="text-[10px] text-[var(--mut)] uppercase block">Flash Capacity</span>
              <strong className="text-emerald-400 text-sm block">{device.flashSize ? fmt(device.flashSize) : "N/A"}</strong>
            </div>

            <div className="p-3 rounded-lg bg-black/50 border border-[var(--line)] space-y-1">
              <span className="text-[10px] text-[var(--mut)] uppercase block">SRAM Capacity</span>
              <strong className="text-purple-400 text-sm block">{device.sramSize ? fmt(device.sramSize) : "N/A"}</strong>
            </div>

            <div className="p-3 rounded-lg bg-black/50 border border-[var(--line)] space-y-1">
              <span className="text-[10px] text-[var(--mut)] uppercase block">Max CPU Clock</span>
              <strong className="text-amber-400 text-sm block">{device.clockSpeed || "72 MHz"}</strong>
            </div>
          </div>

          {/* MEMORY REGION TABLE */}
          <div className="p-4 rounded-lg bg-black/50 border border-[var(--line)] space-y-2">
            <div className="text-[11px] font-bold text-[var(--a)] uppercase">Memory Region Layout</div>
            <div className="space-y-1 text-[11px]">
              {device.regions.map(r => (
                <div key={r.name} className="flex justify-between items-center p-2 rounded bg-black/40 border border-[var(--line)]">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                    <span className="font-bold text-white">{r.name}</span>
                    <span className="text-[10px] text-[var(--mut)]">({r.kind.toUpperCase()})</span>
                  </div>
                  <span className="font-mono text-gray-300">0x{r.base.toString(16)} – 0x{(r.base + r.size - 1).toString(16)} ({fmt(r.size)})</span>
                </div>
              ))}
            </div>
          </div>

          {/* DESCRIPTION */}
          {device.description && (
            <div className="p-4 rounded-lg bg-black/50 border border-[var(--line)] text-gray-300 leading-relaxed text-[11px]">
              <div className="text-[10px] text-[var(--mut)] uppercase font-bold mb-1">Device Description</div>
              {device.description}
            </div>
          )}

          {/* EXTERNAL DOCUMENTATION LINKS */}
          <div className="flex gap-3">
            {device.datasheetUrl && (
              <a
                href={device.datasheetUrl}
                target="_blank"
                rel="noreferrer"
                className="flex-1 py-2 px-3 rounded-lg bg-white/5 border border-[var(--line)] hover:border-[var(--a)] text-center text-gray-200 hover:text-white transition font-bold"
              >
                📄 View Official Datasheet (PDF)
              </a>
            )}
            <button
              onClick={onClose}
              className="px-6 py-2 rounded-lg bg-[var(--a-dim)] text-[var(--a)] border border-[var(--a)] font-bold hover:bg-[var(--a)] hover:text-black transition"
            >
              Close Specification
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
