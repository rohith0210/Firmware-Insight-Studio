import { useRef, useState, DragEvent } from "react";
import type { ParseResult } from "../App";
const KB = (b: number) => (b / 1024).toFixed(2);
const sign = (d: number) => (d > 0 ? "+" : "");
function Delta({ k, a, b, unit = "KB", conv = (x: number) => x / 1024 }: { k: string; a: number; b: number; unit?: string; conv?: (x: number) => number }) {
  const d = conv(b) - conv(a);
  const cls = Math.abs(d) < 0.005 ? "flat" : d > 0 ? "up" : "down";
  return (<div className="verdict"><span className="k">{k}</span><span className={`v ${cls}`}>{sign(d)}{d.toFixed(2)} <span className="mono text-[11px] mut font-normal">{unit}</span></span><span className="mono text-[10px] mut">{KB(a)} → {KB(b)}</span></div>);
}
function Slot({ label, file, onDrop }: { label: string; file: ParseResult | null; onDrop?: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null); const [hot, setHot] = useState(false);
  if (file) return (
    <div className="panel">
      <div className="panel-head"><span>{label}</span><span className="tag">{file.arch} · {file.elf_class}-bit</span></div>
      <div className="p-4 spec">
        <div className="row"><span className="k">binary</span><span className="v">{file.filename}</span></div>
        <div className="row"><span className="k">crc-32</span><span className="v b">0x{file.checksum}</span></div>
        <div className="row"><span className="k">file size</span><span className="v">{KB(file.file_size || 0)} KB</span></div>
        <div className="row"><span className="k">symbols</span><span className="v">{file.num_symbols ?? file.symbols.length}</span></div>
      </div>
    </div>
  );
  const drop = (e: DragEvent) => { e.preventDefault(); setHot(false); const f = e.dataTransfer.files[0]; if (f && onDrop) onDrop(f); };
  return (
    <div className={`drop2 ${hot ? "hot" : ""}`} onDragOver={e => { e.preventDefault(); setHot(true); }} onDragLeave={() => setHot(false)} onDrop={drop} onClick={() => ref.current?.click()}>
      <input ref={ref} type="file" hidden accept=".elf,.o,.out,.axf,.bin" onChange={e => { const f = e.target.files?.[0]; if (f && onDrop) onDrop(f); }} />
      <span className="mono text-[10px] mut uppercase tracking-[.2em]">{label}</span>
      <span className="font-display text-lg fg">drop candidate binary</span>
      <span className="mono text-[10px] mut">.elf .axf .o .out .bin</span>
    </div>
  );
}
export default function Compare({ base, candidate, onLoad, onClear }: { base: ParseResult; candidate: ParseResult | null; onLoad: (f: File) => void; onClear: () => void }) {
  if (!candidate) return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4"><Slot label="baseline" file={base} /><Slot label="candidate" file={null} onDrop={onLoad} /></div>
      <div className="mono text-[11px] mut text-center">load a second build to diff flash, ram, sections and symbol sets against the baseline</div>
    </div>
  );
  const sa = base.summary || {}, sb = candidate.summary || {};
  const flashA = (sa[".text"] || 0) + (sa[".rodata"] || 0), flashB = (sb[".text"] || 0) + (sb[".rodata"] || 0);
  const ramA = (sa[".data"] || 0) + (sa[".bss"] || 0), ramB = (sb[".data"] || 0) + (sb[".bss"] || 0);
  const names = Array.from(new Set([...base.sections, ...candidate.sections].map(s => s.name))).filter(n => n.startsWith("."));
  const mapA = Object.fromEntries(base.sections.map(s => [s.name, s.size]));
  const mapB = Object.fromEntries(candidate.sections.map(s => [s.name, s.size]));
  const rows = names.map(n => ({ n, a: mapA[n] || 0, b: mapB[n] || 0, d: (mapB[n] || 0) - (mapA[n] || 0) })).filter(r => r.a || r.b).sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 40);
  const maxAbs = Math.max(1, ...rows.map(r => Math.abs(r.d)));
  const fa = new Set(base.symbols.filter(s => s.type === "STT_FUNC" && s.size > 0).map(s => s.name));
  const fb = new Set(candidate.symbols.filter(s => s.type === "STT_FUNC" && s.size > 0).map(s => s.name));
  const added = [...fb].filter(n => !fa.has(n)); const removed = [...fa].filter(n => !fb.has(n));
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="mono text-[11px] mut">baseline <span className="fg">{base.filename}</span>  ⇄  candidate <span className="acc">{candidate.filename}</span></span>
        <button className="btn-hw" onClick={onClear}>↻ clear candidate</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Delta k="file size" a={base.file_size || 0} b={candidate.file_size || 0} />
        <Delta k="flash" a={flashA} b={flashB} />
        <Delta k="ram" a={ramA} b={ramB} />
        <div className="verdict"><span className="k">functions</span><span className={`v ${added.length - removed.length > 0 ? "up" : added.length - removed.length < 0 ? "down" : "flat"}`}>{sign(added.length - removed.length)}{added.length - removed.length}</span><span className="mono text-[10px] mut">+{added.length} / −{removed.length}</span></div>
      </div>
      <div className="panel">
        <div className="panel-head"><span>Section deltas</span><span className="tag">centre = zero · amber grew · teal shrank</span></div>
        <div className="p-3">
          {rows.map(r => (
            <div className="drow" key={r.n}>
              <span className="nm">{r.n}</span>
              <span className="track"><span className="mid" /><i style={r.d >= 0 ? { left: "50%", width: `${(Math.abs(r.d) / maxAbs) * 50}%`, background: "var(--b)" } : { right: "50%", width: `${(Math.abs(r.d) / maxAbs) * 50}%`, background: "var(--a)" }} /></span>
              <span className="dl" style={{ color: r.d > 0 ? "var(--b)" : r.d < 0 ? "var(--a)" : "var(--mut)" }}>{sign(r.d)}{(r.d / 1024).toFixed(2)} KB</span>
            </div>
          ))}
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="panel"><div className="panel-head"><span>Functions added</span><span className="tag acc">{added.length}</span></div><div className="p-3 mono text-[12px] max-h-64 overflow-auto">{added.length ? added.slice(0, 200).map((n, i) => <div key={i} className="acc py-0.5">+ {n}</div>) : <span className="mut">none</span>}</div></div>
        <div className="panel"><div className="panel-head"><span>Functions removed</span><span className="tag acc2">{removed.length}</span></div><div className="p-3 mono text-[12px] max-h-64 overflow-auto">{removed.length ? removed.slice(0, 200).map((n, i) => <div key={i} className="acc2 py-0.5">− {n}</div>) : <span className="mut">none</span>}</div></div>
      </div>
    </div>
  );
}
