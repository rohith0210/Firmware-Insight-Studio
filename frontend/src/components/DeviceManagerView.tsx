import { useState, useMemo } from "react";
import type { Device } from "../utils/devices";
import { DB, DB_ORDER, VENDORS, fmt } from "../utils/devices";

export default function DeviceManagerView({
  activeDevice,
  override,
  onSelectDevice,
}: {
  activeDevice: Device;
  override: string;
  onSelectDevice: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedVendor, setSelectedVendor] = useState("All");
  const selectedArch = "All";
  const [expandedVendor, setExpandedVendor] = useState<Record<string, boolean>>({ STMicroelectronics: true, Espressif: true, "Raspberry Pi": true, "Nordic Semiconductor": true });

  const toggleVendor = (v: string) => {
    setExpandedVendor(prev => ({ ...prev, [v]: !prev[v] }));
  };

  const groupedTree = useMemo(() => {
    let list = DB_ORDER.map(id => DB[id]);

    if (selectedVendor !== "All") {
      list = list.filter(d => d.vendor === selectedVendor);
    }
    if (selectedArch !== "All") {
      list = list.filter(d => d.architecture.includes(selectedArch));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        d =>
          d.name.toLowerCase().includes(q) ||
          d.vendor.toLowerCase().includes(q) ||
          d.core.toLowerCase().includes(q) ||
          d.architecture.toLowerCase().includes(q)
      );
    }

    // Group by Architecture -> Vendor -> Family
    const map: Record<string, Record<string, Device[]>> = {};

    list.forEach(d => {
      const archCat = d.architecture.includes("ARM") ? "ARM Cortex-M" : d.architecture.includes("Xtensa") ? "Xtensa" : d.architecture.includes("RISC-V") ? "RISC-V" : "Generic / Other";
      if (!map[archCat]) map[archCat] = {};
      if (!map[archCat][d.vendor]) map[archCat][d.vendor] = [];
      map[archCat][d.vendor].push(d);
    });

    return map;
  }, [search, selectedVendor, selectedArch]);

  return (
    <div className="p-6 h-full overflow-y-auto space-y-6 bg-[var(--bg)] text-white mono text-xs select-none">
      {/* HEADER BAR */}
      <div className="flex justify-between items-center pb-4 border-b border-[var(--line)]">
        <div>
          <div className="text-[10px] text-[var(--mut)] uppercase tracking-wider font-bold">Device Support System</div>
          <h1 className="text-xl font-bold text-white">Device Manager</h1>
        </div>
        <button
          onClick={() => onSelectDevice("")}
          className={`px-4 py-2 rounded-lg border text-xs font-bold transition ${
            !override
              ? "bg-[rgba(51,214,194,0.15)] border-[var(--a)] text-[var(--a)]"
              : "bg-black/40 border-[var(--line)] text-gray-300 hover:text-white"
          }`}
        >
          ⚡ Auto-Detect Mode
        </button>
      </div>

      {/* SEARCH AND FILTERS */}
      <div className="p-4 rounded-xl bg-black/30 border border-[var(--line)] space-y-3">
        <input
          type="text"
          placeholder="Search by device, family, vendor, or core (e.g. STM32, ESP32, nRF52, Cortex-M4)..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-black/60 border border-[var(--line)] focus:border-[var(--a)] rounded-lg px-4 py-2.5 text-xs text-white placeholder-gray-500 outline-none"
        />

        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="text-[var(--mut)] self-center font-bold mr-1">Vendor Filter:</span>
          {["All", ...VENDORS].map(v => (
            <button
              key={v}
              onClick={() => setSelectedVendor(v)}
              className={`px-2.5 py-1 rounded border transition ${
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

      {/* TREE CONTENT BY ARCHITECTURE & VENDOR */}
      <div className="space-y-6">
        {Object.entries(groupedTree).map(([archName, vendors]) => (
          <div key={archName} className="p-5 rounded-xl bg-black/30 border border-[var(--line)] space-y-4">
            <div className="flex items-center gap-2 text-base font-bold text-[var(--a)] border-b border-[var(--line)] pb-2">
              <span>❖</span>
              <span>{archName}</span>
            </div>

            <div className="space-y-3 pl-2">
              {Object.entries(vendors).map(([vendorName, devices]) => {
                const isExpanded = expandedVendor[vendorName] !== false;
                return (
                  <div key={vendorName} className="space-y-2">
                    <button
                      onClick={() => toggleVendor(vendorName)}
                      className="flex items-center gap-2 text-sm font-bold text-gray-200 hover:text-white transition"
                    >
                      <span className="text-[10px]">{isExpanded ? "▼" : "▶"}</span>
                      <span>{vendorName}</span>
                      <span className="text-[10px] text-[var(--mut)] font-normal">({devices.length} profiles)</span>
                    </button>

                    {isExpanded && (
                      <div className="grid grid-cols-3 gap-3 pl-4">
                        {devices.map(d => {
                          const isActive = override ? override === d.id : activeDevice.id === d.id;
                          return (
                            <div
                              key={d.id}
                              onClick={() => onSelectDevice(d.id)}
                              className={`p-3 rounded-lg border cursor-pointer transition flex flex-col justify-between ${
                                isActive
                                  ? "bg-[rgba(51,214,194,0.15)] border-[var(--a)] shadow-md"
                                  : "bg-black/40 border-[var(--line)] hover:border-[var(--a-dim)] hover:bg-white/5"
                              }`}
                            >
                              <div>
                                <div className="flex justify-between items-start">
                                  <span className="text-[10px] text-[var(--mut)] uppercase">{d.family || d.vendor}</span>
                                  {isActive && <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--a)] text-black font-bold">SELECTED</span>}
                                </div>
                                <div className="font-bold text-white text-xs mt-0.5">{d.name}</div>
                              </div>

                              <div className="flex justify-between items-center text-[10px] text-gray-400 mt-3 pt-2 border-t border-white/5">
                                <span>{d.core}</span>
                                <span>Flash: {d.flashSize ? fmt(d.flashSize) : "N/A"}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
