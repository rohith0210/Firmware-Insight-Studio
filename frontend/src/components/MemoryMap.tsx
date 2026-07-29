import { useEffect, useState } from "react";
import type { ParseResult } from "../App";
const CODE = new Set([".text", ".rodata"]);
const DATA = new Set([".data", ".bss", ".tdata", ".tbss"]);
const COL: Record<string, string> = { ".text": "var(--a)", ".rodata": "var(--a-dim)", ".data": "var(--b)", ".bss": "var(--b-dim)", ".tdata": "var(--b)", ".tbss": "var(--b-dim)" };
function nominal(used: number) { const kb = used / 1024; for (const c of [8, 16, 32, 64, 128, 256, 512, 1024, 2048]) if (c >= kb * 1.12) return c * 1024; return Math.pow(2, Math.ceil(Math.log2(kb * 1.12))) * 1024; }
function Column({ title, secs }: { title: string; secs: { name: string; addr: number; size: number }[] }) {
  const [m, setM] = useState(false);
  useEffect(() => { const t = setTimeout(() => setM(true), 70); return () => clearTimeout(t); }, []);
  const used = secs.reduce((a, s) => a + s.size, 0);
  const nom = nominal(used) || 1; const free = Math.max(0, nom - used);
  const base = secs[0]?.addr ?? 0;
  const rows = [...secs.map(s => ({ name: s.name, size: s.size, addr: s.addr, free: false })), { name: "FREE", size: free, addr: base + used, free: true }].filter(r => r.size > 0);
  return (
    <div className="mmcol">
      <div className="mmhead"><span>{title}</span><span className="base">0x{base.toString(16)} · {((nom) / 1024).toFixed(0)} KB</span></div>
      <div className="mmbar">
        {rows.map((r, i) => { const pct = (r.size / nom) * 100; return (
          <div key={i} className={`mmseg ${r.free ? "free" : ""}`} title={`${r.name} · 0x${r.addr.toString(16)} · ${(r.size / 1024).toFixed(2)} KB`}
            style={{ height: m ? `${pct}%` : "0%", background: r.free ? undefined : COL[r.name] || "var(--a-dim)" }}>
            {pct > 7 && <><span className="n">{r.name}</span><span className="s">{(r.size / 1024).toFixed(1)} KB</span></>}
          </div>); })}
      </div>
    </div>
  );
}
export default function MemoryMap({ result }: { result: ParseResult }) {
  const all = result.sections.filter(s => s.size > 0);
  const code = all.filter(s => CODE.has(s.name)).sort((a, b) => a.addr - b.addr);
  const data = all.filter(s => DATA.has(s.name)).sort((a, b) => a.addr - b.addr);
  return (
    <div className="panel">
      <div className="panel-head"><span>Memory Map</span><span className="flex items-center gap-4"><span className="flex items-center gap-1.5 mono text-[10px] mut"><span style={{ width: 9, height: 9, background: "var(--a)", display: "inline-block" }} />code</span><span className="flex items-center gap-1.5 mono text-[10px] mut"><span style={{ width: 9, height: 9, background: "var(--b)", display: "inline-block" }} />data</span><span className="tag">address layout</span></span></div>
      <div className="p-4">
        {code.length + data.length === 0 ? <div className="mut mono text-[12px] py-10 text-center">no code/data sections to map</div>
          : <div className="memmap"><Column title="FLASH" secs={code} /><Column title="RAM" secs={data} /></div>}
      </div>
    </div>
  );
}
