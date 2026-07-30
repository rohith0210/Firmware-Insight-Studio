import { useEffect, useState } from "react";
import { inRegion } from "../utils/devices";
import type { LR } from "./MemoryTreemap";

const STOPS = ["#3f8f7a", "#86a85a", "#c7b24c", "#d68f3e", "#cb5d4d"].map(c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]);
const mix = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
function heat(t: number) { t = Math.max(0, Math.min(1, t)); const x = t * (STOPS.length - 1); const i = Math.floor(x); const f = x - i; const a = STOPS[i], b = STOPS[Math.min(STOPS.length - 1, i + 1)]; const rgb = [mix(a[0], b[0], f), mix(a[1], b[1], f), mix(a[2], b[2], f)]; const lum = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]; return { fill: `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`, dark: lum > 138 }; }
const modOf = (n: any) => {
  if (!n || typeof n !== "string") return "APP";
  const x = n.split("@")[0];
  if (x.startsWith("HAL_") || x.startsWith("LL_")) {
    const p = x.split("_");
    return (p[0] + "_" + (p[1] || "")).toUpperCase();
  }
  if (x.startsWith("__") || x.startsWith("_Z")) return "runtime / c++";
  const p = x.split("_");
  return (p[0] || "APP").toUpperCase() || "APP";
};

export default function InspectorPanel({
  symbol,
  result,
  device,
  onClose,
  onSelect,
  onOpenAssembly,
  onOpenObject,
  onViewSource,
  onHighlightSection,
  onOpenCallers,
  onOpenCallees,
}: {
  symbol: LR;
  result: any;
  device: any;
  onClose: () => void;
  onSelect: (l: LR) => void;
  onOpenAssembly: (name: string) => void;
  onOpenObject: (name: string) => void;
  onViewSource: (name: string) => void;
  onHighlightSection: (section: string) => void;
  onOpenCallers: (name: string) => void;
  onOpenCallees: (name: string) => void;
}) {
  const [tab, setTab] = useState<"info" | "asm" | "refs">("info");
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);

  const symbols = result?.symbols || [];
  const treemap = result?.treemap_data || [];
  const totalBin = treemap.reduce((a: number, d: any) => a + (d.size || 0), 0) || 1;
  const maxLeaf = Math.max(1, ...treemap.flatMap((d: any) => (d.children || []).map((c: any) => c.size || 0)));
  const sym = symbols.find((s: any) => s.name === symbol.name && s.section === symbol.secName) || symbols.find((s: any) => s.name === symbol.name);
  const region = sym && device ? device.regions.find((rg: any) => inRegion(rg, sym.value)) : undefined;
  const pctSec = symbol.secSize ? ((symbol.size / symbol.secSize) * 100).toFixed(1) : "0.0";
  const pctBin = ((symbol.size / totalBin) * 100).toFixed(1);
  const sibs = (treemap.find((d: any) => d.name === symbol.secName)?.children || []).filter((c: any) => c.name !== symbol.name && c.size > 0).sort((a: any, b: any) => b.size - a.size).slice(0, 5);
  const isFunc = !!sym && (sym.type === "STT_FUNC" || symbol.secName === ".text" || symbol.secName === ".isr_vector");
  const hasObject = !!(result.objects && result.objects.length > 0);

  const Card = ({ k, v, c }: { k: string; v: string; c?: string }) => (
    <div className="bg-[var(--panel2)] border border-[var(--line)] rounded p-3">
      <div className="mono text-[9px] mut uppercase tracking-[.14em] mb-1">{k}</div>
      <div className={`mono text-sm font-bold truncate ${c || "fg"}`} title={v}>{v}</div>
    </div>
  );

  return (
    <aside className="w-[420px] max-w-[92vw] border-l border-[var(--line)] bg-[var(--panel)] flex flex-col overflow-hidden" style={{ animation: "tmSlide .22s cubic-bezier(.2,.8,.2,1) both" }}>
      <style>{`@keyframes tmSlide{from{transform:translateX(24px);opacity:.2}to{transform:none;opacity:1}}`}</style>
      <div className="p-4 border-b border-[var(--line)] flex items-start gap-2 flex-shrink-0">
        <div className="min-w-0 flex-1">
          <div className="mono text-[10px] mut mb-1 truncate">{symbol.secName} / {modOf(symbol.name)}</div>
          <div className="font-display text-xl font-bold fg truncate leading-tight" style={{ fontFamily: "Chakra Petch" }} title={symbol.name}>{symbol.name}</div>
        </div>
        <button onClick={onClose} className="mut hover:fg border border-[var(--line)] rounded w-7 h-7 grid place-items-center mono flex-shrink-0">✕</button>
      </div>

      <div className="flex border-b border-[var(--line)] flex-shrink-0">
        {(["info", "asm", "refs"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 py-2 mono text-[10px] uppercase tracking-[.12em] transition ${tab === t ? "acc border-b-2 border-[var(--a)] bg-[rgba(51,214,194,.05)]" : "mut hover:fg"}`}>
            {t === "info" ? "Information" : t === "asm" ? "Assembly" : "References"}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5" style={{ minHeight: 0 }}>
        {tab === "info" && (<>
          <div className="grid grid-cols-2 gap-3">
            <Card k="size" v={`${symbol.size} B`} />
            <Card k="address" v={sym ? "0x" + sym.value.toString(16) : "—"} c="acc" />
            <Card k="section" v={symbol.secName} />
            <Card k="module" v={modOf(symbol.name)} />
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between mono text-[10px] mb-1.5"><span className="mut uppercase tracking-[.12em]">share of {symbol.secName}</span><span className="fg font-bold">{pctSec}%</span></div>
              <div className="h-1.5 bg-[var(--line)] rounded-full overflow-hidden"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, +pctSec)}%`, background: "var(--a)" }} /></div>
            </div>
            <div>
              <div className="flex justify-between mono text-[10px] mb-1.5"><span className="mut uppercase tracking-[.12em]">share of binary</span><span className="fg font-bold">{pctBin}%</span></div>
              <div className="h-1.5 bg-[var(--line)] rounded-full overflow-hidden"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, +pctBin)}%`, background: "var(--b)" }} /></div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="mono text-[9px] uppercase tracking-[.08em] px-2 py-1 rounded border border-[var(--a-dim)] acc bg-[rgba(51,214,194,.08)]">{sym?.type || "—"}</span>
            <span className="mono text-[9px] uppercase tracking-[.08em] px-2 py-1 rounded border border-[var(--b-dim)] acc2 bg-[rgba(240,168,48,.08)]">{sym?.bind || "—"}</span>
            {region && <span className="mono text-[9px] uppercase tracking-[.08em] px-2 py-1 rounded border border-[var(--line)] mut">{region.name}</span>}
          </div>

          {sibs.length > 0 && (
            <div>
              <div className="mono text-[10px] mut uppercase tracking-[.14em] mb-2">related in {symbol.secName}</div>
              <div className="space-y-1">
                {sibs.map((sib: any) => (
                  <button key={sib.name} onClick={() => { const c = heat(sib.size / maxLeaf); onSelect({ id: `${symbol.secName}::${sib.name}`, name: sib.name, size: sib.size, secName: symbol.secName, secSize: symbol.secSize, fill: c.fill, dark: c.dark, x: 0, y: 0, w: 0, h: 0 }); }}
                    className="w-full text-left px-3 py-2 rounded border border-[var(--line)] hover:border-[var(--a-dim)] hover:bg-[rgba(51,214,194,.05)] transition flex justify-between items-center gap-2">
                    <span className="mono text-[12px] fg truncate">{sib.name}</span>
                    <span className="mono text-[10px] mut flex-shrink-0">{(sib.size / 1024).toFixed(1)} KB</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-[var(--line)] space-y-2">
            <div className="mono text-[10px] mut uppercase tracking-wider mb-2">IDE Workspace Actions</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={!isFunc}
                title={!isFunc ? "Assembly unavailable for non-function symbol." : `Open assembly for ${symbol.name}`}
                onClick={() => onOpenAssembly(symbol.name)}
                className="btn-hw primary text-left truncate"
                style={{ opacity: isFunc ? 1 : 0.4, cursor: isFunc ? "pointer" : "not-allowed" }}
              >
                ⌬ Open Assembly
              </button>

              <button
                disabled={!hasObject}
                title={!hasObject ? "No object file metadata available." : `Locate object file for ${symbol.name}`}
                onClick={() => onOpenObject(symbol.name)}
                className="btn-hw text-left truncate"
                style={{ opacity: hasObject ? 1 : 0.4, cursor: hasObject ? "pointer" : "not-allowed" }}
              >
                ▦ Open Object
              </button>

              <button
                onClick={() => onViewSource(symbol.name)}
                className="btn-hw text-left truncate"
                title={`View source for ${symbol.name}`}
              >
                📜 View Source
              </button>

              <button
                onClick={() => onHighlightSection(symbol.secName)}
                className="btn-hw text-left truncate"
                title={`Highlight section ${symbol.secName}`}
              >
                ≣ Highlight Section
              </button>

              <button
                disabled={!isFunc}
                title={!isFunc ? "Callers unavailable for non-function symbol." : `Highlight direct callers of ${symbol.name}`}
                onClick={() => onOpenCallers(symbol.name)}
                className="btn-hw text-left truncate"
                style={{ opacity: isFunc ? 1 : 0.4, cursor: isFunc ? "pointer" : "not-allowed" }}
              >
                ⑂ Open Callers
              </button>

              <button
                disabled={!isFunc}
                title={!isFunc ? "Callees unavailable for non-function symbol." : `Highlight callees of ${symbol.name}`}
                onClick={() => onOpenCallees(symbol.name)}
                className="btn-hw text-left truncate"
                style={{ opacity: isFunc ? 1 : 0.4, cursor: isFunc ? "pointer" : "not-allowed" }}
              >
                ⑂ Open Callees
              </button>
            </div>
          </div>
        </>)}

        {tab === "asm" && (
          <div className="flex flex-col items-center justify-center h-48 text-center space-y-3">
            <div className="text-4xl mut">⌬</div>
            <div className="mono text-[12px] fg">Disassembler Workspace</div>
            <button
              disabled={!isFunc}
              title={!isFunc ? "Assembly unavailable for non-function symbol." : `Open disassembly for ${symbol.name}`}
              onClick={() => onOpenAssembly(symbol.name)}
              className="btn-hw primary"
              style={{ opacity: isFunc ? 1 : 0.4 }}
            >
              Open in Disassembler
            </button>
          </div>
        )}
        {tab === "refs" && (
          <div className="flex flex-col items-center justify-center h-48 text-center space-y-3">
            <div className="text-4xl mut">⑂</div>
            <div className="mono text-[12px] fg">Call Graph Relationships</div>
            <div className="flex gap-2">
              <button disabled={!isFunc} onClick={() => onOpenCallers(symbol.name)} className="btn-hw" style={{ opacity: isFunc ? 1 : 0.4 }}>
                Show Callers
              </button>
              <button disabled={!isFunc} onClick={() => onOpenCallees(symbol.name)} className="btn-hw" style={{ opacity: isFunc ? 1 : 0.4 }}>
                Show Callees
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
