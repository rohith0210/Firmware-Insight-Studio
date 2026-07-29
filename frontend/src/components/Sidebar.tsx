import type { View } from "../App";
const GROUPS: { lbl: string; items: { id: View; t: string; ic: string; locked?: boolean }[] }[] = [
  { lbl: "ANALYZE", items: [{ id: "overview", t: "Overview", ic: "◧" }, { id: "memory", t: "Memory Map", ic: "▤" }, { id: "sections", t: "Sections", ic: "≣" }, { id: "symbols", t: "Symbols", ic: "⌕" }] },
  { lbl: "FIRMWARE", items: [{ id: "debug", t: "Disassembler", ic: "⌬" }, { id: "callgraph", t: "Call Graph", ic: "⑂" }, { id: "linker", t: "Linker Script", ic: "⌗" }] },
  { lbl: "OPTIMIZE", items: [{ id: "compare", t: "Build Compare", ic: "⇄" }, { id: "deadcode", t: "Dead Code", ic: "⌫" }] },
  { lbl: "OUTPUT", items: [{ id: "reports", t: "Reports", ic: "⎙" }, { id: "settings", t: "Settings", ic: "⚙" }] },
];
export default function Sidebar({ view, setView, hasResult }: { view: View; setView: (v: View) => void; hasResult: boolean }) {
  return (
    <aside className="side">
      <div className="brand">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.4" className="acc"><rect x="6" y="6" width="12" height="12" rx="1.5" /><rect x="9.5" y="9.5" width="5" height="5" rx=".5" opacity=".6" /><path d="M9 6V3M12 6V3M15 6V3M9 18v3M12 18v3M15 18v3M6 9H3M6 12H3M6 15H3M18 9h3M18 12h3M18 15h3" /></svg>
        <div><h1 className="fg">FIRMWARE<br />INSIGHT</h1><small className="mut">workbench v1.3</small></div>
      </div>
      {GROUPS.map(g => (
        <div className="nav-grp" key={g.lbl}><div className="lbl">{g.lbl}</div>
          {g.items.map(it => (
            <div key={it.id} className={`nav-item ${view === it.id ? "on" : ""} ${!hasResult ? "off" : ""}`} onClick={() => hasResult && setView(it.id)}>
              <span className="ic">{it.ic}</span><span>{it.t}</span>{it.locked && <span className="soon">soon</span>}
            </div>))}
        </div>))}
      <div className="foot"><span className={`dot ${hasResult ? "" : "busy"}`} />{hasResult ? "engine · ready" : "no binary loaded"}</div>
    </aside>
  );
}
