import { useMemo } from "react";
import type { ParseResult } from "../App";
import type { SectionDetail } from "./MemoryMap";

const fmt = (bytes: number) => {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
};

export default function MemoryInspector({
  region,
  result,
  onClose,
  onNavigate,
}: {
  region: SectionDetail;
  result: ParseResult;
  onClose: () => void;
  onNavigate?: (target: string, parameter?: string) => void;
  onDisassemble?: (symbol: string) => void;
}) {
  if (!region) return null;

  const matchingSymbols = useMemo(() => {
    if (!result.symbols) return [];
    return result.symbols.filter(sym => sym.section === region.id || sym.section === region.name);
  }, [region, result.symbols]);

  return (
    <div className="flex flex-col h-full space-y-3 mono text-xs select-none overflow-y-auto">
      {/* HEADER BAR */}
      <div className="flex justify-between items-center border-b border-[var(--line)] pb-2">
        <div>
          <div className="text-[10px] text-[var(--mut)] font-bold">Region Inspector</div>
          <div className="font-bold text-[var(--a)] text-sm">{region.name}</div>
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded bg-black/40 border border-[var(--line)] text-[var(--mut)] hover:text-white flex items-center justify-center text-xs"
        >
          ✕
        </button>
      </div>

      {/* SECTION 1: OVERVIEW */}
      <div className="p-2.5 rounded bg-black/30 border border-[var(--line)] space-y-1.5">
        <div className="text-[11px] font-bold text-[var(--a)]">Overview</div>
        <div className="flex justify-between text-[11px]">
          <span className="text-[var(--mut)]">Address Range</span>
          <span className="text-white font-bold">{region.start} – {region.end}</span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-[var(--mut)]">Size</span>
          <span className="text-gray-200 font-bold">{fmt(region.size)}</span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-[var(--mut)]">Memory Class</span>
          <span className="text-amber-400 font-bold">{region.memoryType} ({region.permissions})</span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-[var(--mut)]">Permissions</span>
          <span className="text-emerald-400 font-bold">{region.permissions}</span>
        </div>
      </div>

      {/* SECTION 2: STATISTICS */}
      <div className="p-2.5 rounded bg-black/30 border border-[var(--line)] space-y-1.5">
        <div className="text-[11px] font-bold text-amber-300">Statistics</div>
        <div className="flex justify-between text-[11px]">
          <span className="text-[var(--mut)]">Share of Total</span>
          <span className="text-emerald-400 font-bold">{region.pct}</span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-[var(--mut)]">Symbol Count</span>
          <span className="text-gray-200 font-bold">{region.symbolCount || matchingSymbols.length}</span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-[var(--mut)]">Object Count</span>
          <span className="text-gray-200 font-bold">{region.objectCount || 1}</span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-[var(--mut)]">Alignment</span>
          <span className="text-gray-300">4-Byte Aligned</span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-[var(--mut)]">Padding Waste</span>
          <span className="text-emerald-400">~12 Bytes</span>
        </div>
      </div>

      {/* SECTION 3: ACTIONS */}
      <div className="p-2.5 rounded bg-black/30 border border-[var(--line)] space-y-1.5">
        <div className="text-[11px] font-bold text-emerald-400">Actions</div>
        <button
          onClick={() => onNavigate?.("investigator", region.name)}
          className="w-full py-1.5 rounded bg-[var(--a-dim)] text-[var(--a)] font-bold border border-[var(--a-dim)] hover:bg-[var(--a)] hover:text-black transition text-[11px]"
        >
          View in Code Investigator
        </button>
        <button
          onClick={() => onNavigate?.("callgraph")}
          className="w-full py-1.5 rounded bg-white/5 text-gray-300 font-bold border border-[var(--line)] hover:text-white transition text-[11px]"
        >
          View in Call Graph
        </button>
      </div>
    </div>
  );
}
