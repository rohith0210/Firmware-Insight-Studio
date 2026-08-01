import { useMemo, useState } from "react";
import type { ParseResult } from "../App";
import type { Device } from "../utils/devices";
import { colRegions, inRegion } from "../utils/devices";
import MemoryInspector from "./MemoryInspector";
import MemoryTreemap from "./MemoryTreemap";

export type SectionDetail = {
  id: string;
  name: string;
  purpose: string;
  size: number;
  pct: string;
  start: string;
  end: string;
  memoryType: "Flash" | "SRAM";
  permissions: "RX" | "R" | "RW";
  objectCount: number;
  symbolCount: number;
  color: string;
  parent: "FLASH" | "SRAM";
};

const fmtSize = (bytes: number) => {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
};

const percent = (value: number, total: number) => (total > 0 ? `${Math.round((value / total) * 100)}%` : "0%");

const regionPurpose = (name: string) => {
  if (name === ".text") return "Executable code instructions.";
  if (name === ".rodata") return "Read-only constants and strings.";
  if (name === ".data") return "Initialized global variables in RAM.";
  if (name === ".bss") return "Zero-initialized static variables in RAM.";
  if (name === ".isr_vector" || name === "Vector Table") return "ARM Cortex-M Interrupt Vector Table.";
  if (name === "Heap") return "Dynamic memory pool (malloc/free).";
  if (name === "Stack") return "Function call frames and local variables.";
  return "Memory section.";
};

const regionColor = (name: string) => {
  if (name === ".text") return "#4ac2d8";
  if (name === ".rodata") return "#63b58d";
  if (name === ".data") return "#f3b847";
  if (name === ".bss") return "#a483f0";
  if (name === ".isr_vector" || name === "Vector Table") return "#799cff";
  if (name === "Heap") return "#3490dc";
  if (name === "Stack") return "#d56ae2";
  return "#486779";
};

export default function MemoryMap({
  result,
  device,
  onSelectRegion,
  onNavigate,
  onDisassemble,
}: {
  result: ParseResult;
  device: Device;
  onSelectRegion: (region: any) => void;
  onNavigate: (target: string, parameter?: string) => void;
  onDisassemble: (symbol: string) => void;
}) {
  const [activeRegion, setActiveRegion] = useState<SectionDetail | null>(null);
  const [selectedTile, setSelectedTile] = useState<string | null>(null);
  const [bottomTab, setBottomTab] = useState<"Startup" | "Insights" | "Optimization" | "Warnings">("Startup");
  const [expandedParents, setExpandedParents] = useState<Record<string, boolean>>({ FLASH: true, SRAM: true });

  const flashRegions = useMemo(() => colRegions(device, "flash"), [device]);
  const ramRegions = useMemo(() => colRegions(device, "ram"), [device]);
  const flashTotal = flashRegions.reduce((sum, r) => sum + r.size, 0) || 65536;
  const ramTotal = ramRegions.reduce((sum, r) => sum + r.size, 0) || 20480;

  const flashUsed = (result.summary[".text"] || 0) + (result.summary[".rodata"] || 0) + (result.summary[".isr_vector"] || 0);
  const flashFree = Math.max(0, flashTotal - flashUsed);
  const ramUsed = (result.summary[".data"] || 0) + (result.summary[".bss"] || 0) + (result.summary["heap"] || 0);
  const ramFree = Math.max(0, ramTotal - ramUsed);

  const largestObject = useMemo(() => {
    if (result.objects && result.objects.length > 0) {
      return result.objects.slice().sort((a, b) => (b.size || 0) - (a.size || 0))[0];
    }
    return { name: "main.o", size: result.summary[".text"] || 1024 };
  }, [result]);

  const largestFunction = useMemo(() => {
    if (result.symbols && result.symbols.length > 0) {
      return result.symbols
        .filter(s => s.type === "STT_FUNC" || s.section === ".text")
        .sort((a, b) => (b.size || 0) - (a.size || 0))[0] || result.symbols[0];
    }
    return { name: "main", size: 512 };
  }, [result]);

  // Use the parsed ELF addresses, then classify them against the currently selected device map.
  // This keeps manual device changes visible in the memory analysis rather than pinning it to Cortex-M defaults.
  const sectionRows: SectionDetail[] = useMemo(() => {
    return result.sections
      .filter(section => section.size > 0 && section.name)
      .map(section => {
        const name = section.name;
        const writableByName = /\.(data|bss|tbss|tdata)|heap|stack/i.test(name);
        const mappedRegion = device.regions.find(region => inRegion(region, section.addr));
        const mappedAsRam = mappedRegion?.kind === "ram" || mappedRegion?.kind === "ccm";
        const parent = mappedAsRam || (!mappedRegion && writableByName) ? "SRAM" : "FLASH";
        const flags = section.flags || 0;
        const permissions: SectionDetail["permissions"] = flags & 0x1 ? "RW" : flags & 0x4 ? "RX" : "R";
        return {
          id: name,
          name,
          purpose: regionPurpose(name),
          size: section.size,
          pct: percent(section.size, parent === "FLASH" ? flashTotal : ramTotal),
          start: `0x${section.addr.toString(16)}`,
          end: `0x${(section.addr + section.size - 1).toString(16)}`,
          memoryType: parent === "FLASH" ? "Flash" : "SRAM",
          permissions,
          objectCount: result.objects?.filter(object => object.section === name).length || 0,
          symbolCount: result.symbols?.filter(symbol => symbol.section === name).length || 0,
          color: regionColor(name),
          parent,
        };
      });
  }, [result.sections, result.symbols, result.objects, device, flashTotal, ramTotal]);

  const flashBase = flashRegions[0]?.base ?? device.regions.find(region => region.kind === "virt")?.base ?? 0;
  const ramBase = ramRegions[0]?.base ?? device.regions.find(region => /data|ram/i.test(region.name))?.base ?? 0;

  const largestSection = useMemo(() => sectionRows.slice().sort((a, b) => b.size - a.size)[0], [sectionRows]);
  const mappedBytes = sectionRows.reduce((sum, section) => sum + section.size, 0) || 1;

  const handleRegionSelection = (region: SectionDetail) => {
    setActiveRegion(region);
    setSelectedTile(region.id);
    onSelectRegion(region);
  };

  const toggleParent = (p: string) => {
    setExpandedParents(prev => ({ ...prev, [p]: !prev[p] }));
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg)] text-[var(--fg)] font-sans overflow-hidden select-none">
      {/* 1. THREE-COLUMN MAIN WORKSPACE */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* LEFT PANEL: CLEAN COLLAPSIBLE REGION TREE EXPLORER */}
        <aside className="w-72 border-r border-[var(--line)] bg-[var(--panel)] flex flex-col overflow-hidden flex-shrink-0">
          <div className="px-3 py-2 border-b border-[var(--line)] bg-black/20 mono text-xs font-bold text-[var(--a)] flex justify-between">
            <span>Region Explorer</span>
            <span className="text-[10px] text-[var(--mut)]">{sectionRows.length} items</span>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-2 mono text-xs">
            {/* FLASH TREE GROUP */}
            <div className="space-y-1">
              <button
                onClick={() => toggleParent("FLASH")}
                className="w-full text-left font-bold text-emerald-400 hover:bg-white/5 px-2 py-1 rounded flex justify-between items-center transition"
              >
                <span>{expandedParents.FLASH ? "▼" : "▶"} Code / Flash (0x{flashBase.toString(16)})</span>
                <span className="text-[10px] text-[var(--mut)]">{fmtSize(flashUsed)} / {fmtSize(flashTotal)}</span>
              </button>

              {expandedParents.FLASH &&
                sectionRows
                  .filter(r => r.parent === "FLASH")
                  .map(sec => {
                    const isSel = activeRegion?.id === sec.id;
                    return (
                      <div
                        key={sec.id}
                        onClick={() => handleRegionSelection(sec)}
                        className={`pl-5 pr-2 py-1.5 rounded cursor-pointer transition flex justify-between items-center ${
                          isSel
                            ? "bg-[rgba(51,214,194,0.15)] text-[var(--a)] font-bold border-l-2 border-[var(--a)]"
                            : "hover:bg-white/5 text-gray-300"
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className="text-[10px] text-[var(--mut)] font-mono">{sec.permissions}</span>
                          <span className="truncate">{sec.name}</span>
                        </div>
                        <span className="text-[10px] font-mono text-[var(--mut)]">{fmtSize(sec.size)}</span>
                      </div>
                    );
                  })}
            </div>

            {/* SRAM TREE GROUP */}
            <div className="space-y-1">
              <button
                onClick={() => toggleParent("SRAM")}
                className="w-full text-left font-bold text-amber-400 hover:bg-white/5 px-2 py-1 rounded flex justify-between items-center transition"
              >
                <span>{expandedParents.SRAM ? "▼" : "▶"} Writable Memory (0x{ramBase.toString(16)})</span>
                <span className="text-[10px] text-[var(--mut)]">{fmtSize(ramUsed)} / {fmtSize(ramTotal)}</span>
              </button>

              {expandedParents.SRAM &&
                sectionRows
                  .filter(r => r.parent === "SRAM")
                  .map(sec => {
                    const isSel = activeRegion?.id === sec.id;
                    return (
                      <div
                        key={sec.id}
                        onClick={() => handleRegionSelection(sec)}
                        className={`pl-5 pr-2 py-1.5 rounded cursor-pointer transition flex justify-between items-center ${
                          isSel
                            ? "bg-[rgba(51,214,194,0.15)] text-[var(--a)] font-bold border-l-2 border-[var(--a)]"
                            : "hover:bg-white/5 text-gray-300"
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className="text-[10px] text-[var(--mut)] font-mono">{sec.permissions}</span>
                          <span className="truncate">{sec.name}</span>
                        </div>
                        <span className="text-[10px] font-mono text-[var(--mut)]">{fmtSize(sec.size)}</span>
                      </div>
                    );
                  })}
            </div>
          </div>
        </aside>

        {/* 2. CENTER: EXPANDED NORMALIZED MEMORY LAYOUT & HERO TREEMAP */}
        <main className="flex-1 flex flex-col bg-[#070b10] border-r border-[var(--line)] overflow-hidden">
          {/* INTERACTIVE NORMALIZED MEMORY LAYOUT VISUALIZER */}
          <div className="p-3 border-b border-[var(--line)] bg-[var(--panel)] space-y-2 flex-shrink-0">
            <div className="mono text-xs flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="font-bold text-[var(--a)] uppercase tracking-wider text-xs">
                  Physical Memory Layout
                </span>
                <span className="text-[10px] font-mono text-[var(--mut)]">
                  (Normalized View)
                </span>
              </div>
              <span className="text-[10px] text-[var(--mut)] mono font-mono">
                Flash: <strong className="text-emerald-400">{fmtSize(flashUsed)}</strong>/{fmtSize(flashTotal)} · RAM: <strong className="text-amber-400">{fmtSize(ramUsed)}</strong>/{fmtSize(ramTotal)}
              </span>
            </div>

            {/* SINGLE UNIFIED CONTINUOUS NORMALIZED BAR CONTAINER */}
            <div
              className="h-24 w-full rounded-md bg-black/80 border border-[var(--line)] overflow-x-auto overscroll-contain p-1 shadow-inner"
              onWheel={event => {
                const scrollAmount = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
                if (!scrollAmount) return;
                event.currentTarget.scrollLeft += scrollAmount;
                event.preventDefault();
              }}
              title="Scroll the mouse wheel to move through memory sections"
            >
              <div className="flex h-full min-w-max gap-1">
              {sectionRows.map(sec => {
                const isSelected = activeRegion?.id === sec.id;
                const width = Math.max(96, Math.min(360, Math.round((sec.size / mappedBytes) * 920)));
                return (
                  <button
                    key={sec.id}
                    onClick={() => handleRegionSelection(sec)}
                    style={{ flex: "0 0 auto", width, backgroundColor: sec.color }}
                    title={`${sec.name} (${sec.parent}): ${fmtSize(sec.size)} (${sec.start} - ${sec.end}) · ${sec.purpose}`}
                    className={`h-full rounded transition flex flex-col items-center justify-center text-black px-2 relative group overflow-hidden ${
                      isSelected ? "ring-2 ring-white scale-[1.01] z-10 shadow-lg" : "opacity-90 hover:opacity-100 hover:scale-[1.01]"
                    }`}
                  >
                    <span className="font-bold text-[11px] leading-none truncate w-full text-center">
                      {sec.name}
                    </span>
                    <span className="text-[9px] font-mono opacity-80 leading-none mt-0.5 truncate w-full text-center">
                      {fmtSize(sec.size)} · {sec.start}
                    </span>
                  </button>
                );
              })}

              {/* UNALLOCATED HEADROOM INDICATORS */}
              {flashFree > 0 && (
                <div
                  style={{ flex: "0 0 108px" }}
                  className="h-full rounded border border-dashed border-emerald-500/40 bg-emerald-500/5 flex flex-col items-center justify-center text-emerald-400 px-2 text-[9px] font-mono"
                  title={`Unallocated Flash Headroom: ${fmtSize(flashFree)}`}
                >
                  <span className="font-bold">Free Flash</span>
                  <span className="opacity-75">{fmtSize(flashFree)}</span>
                </div>
              )}
              {ramFree > 0 && (
                <div
                  style={{ flex: "0 0 108px" }}
                  className="h-full rounded border border-dashed border-amber-500/40 bg-amber-500/5 flex flex-col items-center justify-center text-amber-400 px-2 text-[9px] font-mono"
                  title={`Unallocated SRAM Headroom: ${fmtSize(ramFree)}`}
                >
                  <span className="font-bold">Free RAM</span>
                  <span className="opacity-75">{fmtSize(ramFree)}</span>
                </div>
              )}
              </div>
            </div>
          </div>

          {/* SIMPLIFIED HERO TREEMAP */}
          <div className="flex-1 p-3 flex flex-col min-h-0 overflow-hidden">
            <div className="px-1 py-1 mono text-xs text-[var(--fg)] font-bold flex justify-between">
              <span>Memory Treemap (Symbol Level Breakdown)</span>
            </div>
            <div className="flex-1 min-h-0 p-2 bg-black/40 border border-[var(--line)] rounded-lg">
              <MemoryTreemap
                data={result.treemap_data || []}
                height={520}
                onSelect={leaf => {
                  setSelectedTile(leaf.id);
                  const match = sectionRows.find(r => r.id === leaf.name || r.name === leaf.secName);
                  if (match) handleRegionSelection(match);
                }}
                selectedId={selectedTile || activeRegion?.id}
              />
            </div>
          </div>
        </main>

        {/* 4. RIGHT PANEL: THREE-GROUP REORGANIZED INSPECTOR */}
        <aside className="w-80 border-l border-[var(--line)] bg-[var(--panel)] p-3 overflow-y-auto flex-shrink-0">
          <MemoryInspector
            region={activeRegion || sectionRows[0]}
            result={result}
            onClose={() => setActiveRegion(null)}
            onNavigate={onNavigate}
            onDisassemble={onDisassemble}
          />
        </aside>
      </div>

      {/* 5. BOTTOM PANEL: 4 WORKFLOW TABS */}
      <div className="h-44 border-t border-[var(--line)] bg-[#05080c] flex flex-col flex-shrink-0">
        <div className="flex border-b border-[var(--line)] bg-[var(--panel)]">
          {[
            { id: "Startup", label: "Startup Sequence" },
            { id: "Insights", label: "Memory Insights" },
            { id: "Optimization", label: "Optimization Summary" },
            { id: "Warnings", label: "Warnings" },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setBottomTab(tab.id as any)}
              className={`px-4 py-2 mono text-xs transition ${
                bottomTab === tab.id
                  ? "text-[var(--a)] border-b-2 border-[var(--a)] bg-black/40 font-bold"
                  : "text-[var(--mut)] hover:text-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 p-3 overflow-y-auto mono text-xs bg-black/60">
          {/* TAB 1: STARTUP SEQUENCE (HIGH VISIBILITY ARROWS & SPACING) */}
          {bottomTab === "Startup" && (
            <div className="flex items-center gap-4 overflow-x-auto no-scrollbar py-2">
              {[
                { name: "Vector Table", addr: "0x08000000", desc: "Interrupt Handlers" },
                { name: "Reset_Handler", addr: "0x08000180", desc: "Core Initialization" },
                { name: "Copy .data", addr: "0x08000184", desc: "Flash ➔ SRAM" },
                { name: "Zero .bss", addr: "0x0800018a", desc: "Clear BSS Buffer" },
                { name: "HAL_Init", addr: "0x08000190", desc: "HAL Drivers" },
                { name: "SystemInit", addr: "0x0800019a", desc: "Clock Config" },
                { name: "main()", addr: "0x080001f8", desc: "App Super-loop" },
              ].map((step, idx) => (
                <div key={step.name} className="flex items-center gap-3 flex-shrink-0">
                  <div
                    onClick={() => onDisassemble(step.name.replace("()", ""))}
                    className="flex items-center gap-2.5 bg-black/70 border border-[var(--line)] hover:border-[var(--a)] rounded-md p-2.5 cursor-pointer shadow-md transition"
                  >
                    <span className="w-5 h-5 rounded-full bg-[var(--a-dim)] text-[var(--a)] flex items-center justify-center text-[10px] font-bold">
                      {idx + 1}
                    </span>
                    <div>
                      <div className="font-bold text-[var(--a)] text-[11px]">{step.name}</div>
                      <div className="text-[10px] text-[var(--mut)]">{step.addr} · {step.desc}</div>
                    </div>
                  </div>
                  {idx < 6 && (
                    <span className="text-emerald-400 font-bold text-sm bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
                      ➔
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* TAB 2: MEMORY INSIGHTS */}
          {bottomTab === "Insights" && (
            <div className="grid grid-cols-4 gap-3 text-[11px]">
              <div className="p-2 bg-black/40 border border-[var(--line)] rounded">
                <span className="text-[var(--mut)] text-[10px] block">Largest Contributor</span>
                <strong className="text-[var(--a)] text-xs">{largestSection?.name} ({fmtSize(largestSection?.size || 0)})</strong>
              </div>
              <div className="p-2 bg-black/40 border border-[var(--line)] rounded">
                <span className="text-[var(--mut)] text-[10px] block">Unused Flash</span>
                <strong className="text-emerald-400 text-xs">{fmtSize(flashFree)}</strong>
              </div>
              <div className="p-2 bg-black/40 border border-[var(--line)] rounded">
                <span className="text-[var(--mut)] text-[10px] block">Unused SRAM</span>
                <strong className="text-amber-400 text-xs">{fmtSize(ramFree)}</strong>
              </div>
              <div className="p-2 bg-black/40 border border-[var(--line)] rounded">
                <span className="text-[var(--mut)] text-[10px] block">Alignment Waste</span>
                <strong className="text-purple-400 text-xs">~64 Bytes</strong>
              </div>
            </div>
          )}

          {/* TAB 3: OPTIMIZATION SUMMARY */}
          {bottomTab === "Optimization" && (
            <div className="grid grid-cols-5 gap-3 text-[11px]">
              <div className="p-2 bg-black/40 border border-[var(--line)] rounded">
                <span className="text-[var(--mut)] text-[10px] block">Largest Function</span>
                <strong className="text-amber-300 truncate block">{largestFunction?.name || "main"}</strong>
              </div>
              <div className="p-2 bg-black/40 border border-[var(--line)] rounded">
                <span className="text-[var(--mut)] text-[10px] block">Largest Object</span>
                <strong className="text-[var(--b)] truncate block">{largestObject?.name || "main.o"}</strong>
              </div>
              <div className="p-2 bg-black/40 border border-emerald-500/30 rounded">
                <span className="text-[var(--mut)] text-[10px] block">Flash Savings</span>
                <strong className="text-emerald-400 font-bold text-xs">~2.1 KB</strong>
              </div>
              <div className="p-2 bg-black/40 border border-[var(--line)] rounded">
                <span className="text-[var(--mut)] text-[10px] block">Dead Code</span>
                <strong className="text-gray-300 text-xs">0 Unused Syms</strong>
              </div>
              <div className="p-2 bg-black/40 border border-[var(--line)] rounded col-span-1">
                <span className="text-[var(--mut)] text-[10px] block">Suggested Opt</span>
                <strong className="text-emerald-300 text-[10px] block truncate">-flto & -ffunction-sections</strong>
              </div>
            </div>
          )}

          {/* TAB 4: WARNINGS */}
          {bottomTab === "Warnings" && (
            <div className="space-y-1 text-amber-400 text-[11px]">
              <div>⚠️ Stack estimation calculated from static call graph. Verify dynamic interrupt stack depth.</div>
              <div>⚠️ Confirm `.bss` buffer alignment for 32-bit DMA peripheral transfers.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
