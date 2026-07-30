import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import type { Device } from "../utils/devices";
import { DB, DB_ORDER, VENDORS, fmt } from "../utils/devices";

export default function DeviceSelectorModal({
  currentDevice,
  override,
  onSelectDevice,
  onClose,
}: {
  currentDevice: Device;
  override: string;
  onSelectDevice: (id: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedVendor, setSelectedVendor] = useState<string>("All");
  const [selectedTab, setSelectedTab] = useState<"all" | "favorites" | "recent">("all");
  const [hoveredId, setHoveredId] = useState<string | null>(override || currentDevice.id);
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem("fis_fav_devices") || '["stm32f103c8","esp32","rp2040","nrf52840"]'));
    } catch {
      return new Set(["stm32f103c8", "esp32", "rp2040", "nrf52840"]);
    }
  });

  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem("fis_fav_devices", JSON.stringify(Array.from(next)));
      return next;
    });
  };

  const filteredDevices = useMemo(() => {
    let list = DB_ORDER.map(id => DB[id]);

    if (selectedTab === "favorites") {
      list = list.filter(d => favorites.has(d.id));
    }

    if (selectedVendor !== "All") {
      list = list.filter(d => d.vendor === selectedVendor);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        d =>
          d.name.toLowerCase().includes(q) ||
          d.vendor.toLowerCase().includes(q) ||
          d.core.toLowerCase().includes(q) ||
          d.architecture.toLowerCase().includes(q) ||
          (d.family && d.family.toLowerCase().includes(q))
      );
    }

    return list;
  }, [search, selectedVendor, selectedTab, favorites]);

  const previewDevice = useMemo(() => {
    return DB[hoveredId || ""] || currentDevice;
  }, [hoveredId, currentDevice]);

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none font-sans">
      <div className="bg-[var(--panel)] border border-[var(--line)] rounded-xl w-full max-w-5xl h-[680px] flex flex-col overflow-hidden shadow-2xl">
        {/* MODAL HEADER */}
        <div className="px-5 py-3 border-b border-[var(--line)] bg-black/40 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-[var(--a)] animate-pulse" />
            <div>
              <div className="text-[10px] text-[var(--mut)] uppercase tracking-wider font-bold mono">Device Support System</div>
              <h2 className="text-base font-bold text-white">Target Microcontroller Selector</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-[var(--line)] text-gray-400 hover:text-white hover:bg-white/5 flex items-center justify-center mono"
          >
            ✕
          </button>
        </div>

        {/* SEARCH & VENDOR FILTER BAR */}
        <div className="p-4 border-b border-[var(--line)] bg-black/20 space-y-3">
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Search by MCU name, family, vendor, or CPU core (e.g. STM32, ESP32, Cortex-M4)..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 bg-black/60 border border-[var(--line)] focus:border-[var(--a)] rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 outline-none mono"
            />
            <button
              onClick={() => onSelectDevice("")}
              className={`px-3 py-2 rounded-lg border text-xs mono font-bold transition flex items-center gap-2 ${
                !override
                  ? "bg-[rgba(51,214,194,0.15)] border-[var(--a)] text-[var(--a)]"
                  : "bg-black/40 border-[var(--line)] text-gray-300 hover:text-white"
              }`}
            >
              <span>⚡ Auto-Detect Profile</span>
            </button>
          </div>

          {/* VENDOR PILLS */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 mono text-xs">
            <span className="text-[10px] text-[var(--mut)] uppercase tracking-wider font-bold mr-1">Vendor:</span>
            {["All", ...VENDORS].map(v => (
              <button
                key={v}
                onClick={() => setSelectedVendor(v)}
                className={`px-2.5 py-1 rounded-md text-[11px] border transition whitespace-nowrap ${
                  selectedVendor === v
                    ? "bg-[var(--a-dim)] border-[var(--a)] text-[var(--a)] font-bold"
                    : "bg-black/30 border-[var(--line)] text-gray-400 hover:text-gray-200"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* MAIN BODY: LEFT DEVICE LIST & RIGHT SPECS PREVIEW */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* LEFT DEVICE CATALOG LIST */}
          <div className="flex-1 border-r border-[var(--line)] flex flex-col overflow-hidden">
            {/* TABS BAR */}
            <div className="flex border-b border-[var(--line)] bg-black/40 px-4 mono text-xs">
              <button
                onClick={() => setSelectedTab("all")}
                className={`px-3 py-2 border-b-2 transition ${
                  selectedTab === "all" ? "border-[var(--a)] text-[var(--a)] font-bold" : "border-transparent text-[var(--mut)] hover:text-white"
                }`}
              >
                All Devices ({filteredDevices.length})
              </button>
              <button
                onClick={() => setSelectedTab("favorites")}
                className={`px-3 py-2 border-b-2 transition ${
                  selectedTab === "favorites" ? "border-[var(--a)] text-[var(--a)] font-bold" : "border-transparent text-[var(--mut)] hover:text-white"
                }`}
              >
                ★ Favorites ({favorites.size})
              </button>
            </div>

            {/* DEVICE LIST GRID */}
            <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 gap-2 text-xs mono">
              {filteredDevices.map(d => {
                const isActive = (override ? override === d.id : currentDevice.id === d.id);
                const isFav = favorites.has(d.id);
                return (
                  <div
                    key={d.id}
                    onMouseEnter={() => setHoveredId(d.id)}
                    onClick={() => {
                      onSelectDevice(d.id);
                      onClose();
                    }}
                    className={`p-3 rounded-lg border cursor-pointer transition flex flex-col justify-between ${
                      isActive
                        ? "bg-[rgba(51,214,194,0.15)] border-[var(--a)] shadow-md"
                        : "bg-black/30 border-[var(--line)] hover:border-[var(--a-dim)] hover:bg-white/5"
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-[10px] text-[var(--mut)] uppercase">{d.vendor}</div>
                        <div className="font-bold text-white text-xs">{d.name}</div>
                      </div>
                      <button
                        onClick={e => toggleFavorite(d.id, e)}
                        className={`text-sm ${isFav ? "text-amber-400" : "text-gray-600 hover:text-amber-300"}`}
                      >
                        {isFav ? "★" : "☆"}
                      </button>
                    </div>

                    <div className="flex justify-between items-center text-[10px] text-gray-400 mt-2">
                      <span className="bg-white/5 px-1.5 py-0.5 rounded text-[9px]">{d.architecture}</span>
                      <span>Flash: {d.flashSize ? fmt(d.flashSize) : "N/A"} / RAM: {d.sramSize ? fmt(d.sramSize) : "N/A"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* RIGHT DEVICE SPECIFICATIONS PREVIEW PANEL */}
          <div className="w-80 p-4 bg-black/40 overflow-y-auto space-y-4 mono text-xs">
            <div>
              <div className="text-[10px] text-[var(--mut)] uppercase font-bold">Target Device Specification</div>
              <h3 className="text-base font-bold text-[var(--a)]">{previewDevice.name}</h3>
              <div className="text-[11px] text-gray-400">{previewDevice.vendor} · {previewDevice.architecture}</div>
            </div>

            {/* QUICK STATS CARD */}
            <div className="p-3 rounded-lg bg-black/60 border border-[var(--line)] space-y-2 text-[11px]">
              <div className="flex justify-between">
                <span className="text-[var(--mut)]">CPU Core:</span>
                <span className="text-white font-bold">{previewDevice.core}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--mut)]">Max Clock:</span>
                <span className="text-amber-400 font-bold">{previewDevice.clockSpeed || "N/A"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--mut)]">Flash Capacity:</span>
                <span className="text-[var(--a)] font-bold">{previewDevice.flashSize ? fmt(previewDevice.flashSize) : "N/A"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--mut)]">SRAM Capacity:</span>
                <span className="text-emerald-400 font-bold">{previewDevice.sramSize ? fmt(previewDevice.sramSize) : "N/A"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--mut)]">Vector Address:</span>
                <span className="text-purple-400 font-mono">0x{(previewDevice.vectorTableAddr || 0x08000000).toString(16)}</span>
              </div>
            </div>

            {/* DESCRIPTION */}
            {previewDevice.description && (
              <div className="p-3 rounded-lg bg-black/60 border border-[var(--line)] text-[11px] text-gray-300 leading-relaxed">
                {previewDevice.description}
              </div>
            )}

            {/* SUPPORTED RTOS & TOOLCHAINS */}
            <div className="p-3 rounded-lg bg-black/60 border border-[var(--line)] space-y-2 text-[11px]">
              <div className="text-[10px] text-[var(--mut)] uppercase font-bold">Toolchains & RTOS</div>
              <div className="flex flex-wrap gap-1">
                {(previewDevice.rtos || ["FreeRTOS", "Zephyr"]).map(rtos => (
                  <span key={rtos} className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[10px]">
                    {rtos}
                  </span>
                ))}
              </div>
            </div>

            {/* ACTIONS */}
            <button
              onClick={() => {
                onSelectDevice(previewDevice.id);
                onClose();
              }}
              className="w-full py-2 rounded-lg bg-[var(--a-dim)] text-[var(--a)] border border-[var(--a)] hover:bg-[var(--a)] hover:text-black font-bold transition text-xs"
            >
              Select {previewDevice.name}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
