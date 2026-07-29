import { useState } from "react";
type Sec = { name: string; type: string; addr: number; size: number };
type Sym = { name: string; value: number; size: number; type: string; bind: string; section: string };
function moduleOf(n: string) { const p = n.split("_"); if (p[0] === "HAL" && p.length > 1) return p[0] + "_" + p[1]; return p.length > 1 ? p[0] : n; }
export default function SectionTable({ sections, symbols, onSectionClick, selectedSection }: {
  sections: Sec[]; symbols: Sym[]; onSectionClick?: (s: string | null) => void; selectedSection?: string | null;
}) {
  const [mod, setMod] = useState<string | null>(null);
  const visible = sections.filter(s => s.size > 0);
  const max = Math.max(...visible.map(s => s.size), 1);
  const secSyms = symbols.filter(s => s.section === selectedSection && s.size > 0);
  const groups: Record<string, Sym[]> = {};
  secSyms.forEach(s => { const m = moduleOf(s.name); (groups[m] = groups[m] || []).push(s); });
  const mods = Object.entries(groups).map(([m, arr]) => ({ m, arr, size: arr.reduce((a, x) => a + x.size, 0) })).sort((a, b) => b.size - a.size);
  return (
    <div className="panel">
      <div className="panel-head"><span>Sections</span><span className="flex items-center gap-3">{selectedSection && <button onClick={() => { onSectionClick?.(null); setMod(null); }} className="acc2 mono text-[10px] uppercase tracking-widest hover:underline">clear ✕</button>}<span className="tag">{visible.length} regions · click to drill</span></span></div>
      <div className="p-3 space-y-1">
        {visible.map(s => { const sel = selectedSection === s.name; return (
          <div key={s.name}>
            <div className={`sec-row ${sel ? "sel" : ""} flex items-center gap-3 rounded-[3px] px-3 py-1.5 cursor-pointer`} onClick={() => { onSectionClick?.(sel ? null : s.name); setMod(null); }}>
              <div className="w-28 mono text-[12px] fg truncate">{s.name}</div>
              <div className="w-20 mono text-[10px] mut hidden sm:block">0x{s.addr.toString(16)}</div>
              <div className="flex-1 h-3 rounded-[2px]" style={{ background: "rgba(255,255,255,.04)" }}><div className="h-full rounded-[2px]" style={{ width: `${(s.size / max) * 100}%`, background: sel ? "var(--b)" : "var(--a)" }} /></div>
              <div className="w-20 text-right mono text-[12px] fg">{(s.size / 1024).toFixed(2)} <span className="mut text-[10px]">KB</span></div>
            </div>
            {sel && (
              <div className="drill mx-3 mb-2">
                <div className="mono text-[10px] mut uppercase tracking-widest px-2 pb-1">modules in {s.name} · {mods.length}</div>
                {mods.length === 0 && <div className="mut mono text-[11px] px-2 py-3">no sized symbols in this section</div>}
                {mods.map(({ m, arr, size }) => (
                  <div key={m}>
                    <div className="mod" onClick={() => setMod(mod === m ? null : m)}><span className="tw">{mod === m ? "▾" : "▸"}</span><span className="fg">{m}</span><span className="mc">{arr.length} fn · {(size / 1024).toFixed(2)} KB</span></div>
                    {mod === m && arr.sort((a, b) => b.size - a.size).map((f, i) => <div className="fn" key={i}><span>{f.name}</span><span>{f.size} B</span></div>)}
                  </div>
                ))}
              </div>
            )}
          </div>); })}
      </div>
    </div>
  );
}
