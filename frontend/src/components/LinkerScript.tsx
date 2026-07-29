import { useMemo, useRef, useState } from "react";
import type { ParseResult } from "../App";
import type { Device, Region } from "../utils/devices";
import { inRegion, fmt } from "../utils/devices";
type LdRegion = { name: string; attrs: string; origin: number; length: number };
function parseSize(t: string): number { t = t.trim().replace(/;$/, ""); const m = t.match(/^([0-9]+(?:\.[0-9]+)?)([KkMm])?$/); if (m) { const n = parseFloat(m[1]); return m[2] ? n * (m[2].toLowerCase() === "k" ? 1024 : 1048576) : n; } if (/^0x[0-9a-f]+$/i.test(t)) return parseInt(t, 16); if (/^\d+$/.test(t)) return parseInt(t, 10); return 0; }
function parseLD(text: string) {
  const regions: LdRegion[] = []; const placement: Record<string, string[]> = {};
  const mem = text.match(/MEMORY\s*\{([\s\S]*?)\}/i);
  if (mem) for (const line of mem[1].split(/[;\n]/)) { const m = line.match(/^\s*(\w+)\s*(?:\(([^)]*)\))?\s*:\s*ORIGIN\s*=\s*([^,]+?)\s*,\s*LENGTH\s*=\s*(.+?)\s*$/i); if (m) regions.push({ name: m[1], attrs: m[2] || "", origin: parseSize(m[3]), length: parseSize(m[4]) }); }
  const sec = text.match(/SECTIONS\s*\{([\s\S]*)\}/i);
  if (sec) { let cur = ""; for (const line of sec[1].split("\n")) { const o = line.match(/^\s*\.([\w.\-]+)\s*:/); if (o) cur = o[1]; const g = line.match(/>\s*(\w+)/); if (g && cur) (placement[g[1]] = placement[g[1]] || []).push(cur); } }
  return { regions, placement };
}
function ticks(origin: number, length: number) { return [0, 0.25, 0.5, 0.75, 1].map(f => ({ f, addr: origin + Math.round(length * f) })); }

function Column({ rg, secs, placed, edit, onEdit, onPick }: any) {
  const placedNames: string[] = placed || [];
  const inSecs = secs.filter((s: any) => s.size > 0 && inRegion(rg, s.addr)).sort((a: any, b: any) => a.addr - b.addr);
  const isFlash = /(r|x)/.test(rg.attrs || "") && !/(w)/.test(rg.attrs || "") || rg.kind === "flash" || rg.kind === "xip";
  const isRam = rg.kind === "ram" || rg.kind === "ccm" || (rg.attrs && /w/.test(rg.attrs) && !/x/.test(rg.attrs));
  const stackSize = isRam ? Math.min(rg.length, 2048) : 0;
  const heapSize = isRam ? Math.min(rg.length, 1024) : 0;
  const vecSize = isFlash ? Math.min(rg.length, 0x400) : 0;
  // build positioned blocks (offset fraction within region)
  const blocks: any[] = [];
  if (vecSize > 0) blocks.push({ name: "VECTOR TABLE", off: 0, size: vecSize, color: "#e0566b", ann: true });
  inSecs.forEach((s: any) => { const off = (s.addr >>> 0) - rg.origin; if (off >= 0 && off + s.size <= rg.length) blocks.push({ name: s.name, off, size: s.size, color: rg.color, sec: s }); });
  if (heapSize > 0) { const bssEnd = inSecs.filter((s: any) => s.name === ".bss").reduce((m: number, s: any) => Math.max(m, (s.addr >>> 0) - rg.origin + s.size), 0); blocks.push({ name: "HEAP ↑", off: bssEnd, size: heapSize, color: "#9a6c1c", ann: true }); }
  if (stackSize > 0) blocks.push({ name: "↓ STACK (_estack)", off: rg.length - stackSize, size: stackSize, color: "#1c8a7e", ann: true });
  blocks.sort((a, b) => a.off - b.off);
  return (
    <div className="ldcol">
      <div className="ldcol-head">
        <span className="fg">{rg.name}</span>
        <span className="mut mono text-[10px]">0x{(rg.origin >>> 0).toString(16)}</span>
        <label className="ldedit" title="region length (KB)">{edit ? <><input type="number" min={1} value={Math.round(rg.length / 1024)} onChange={e => onEdit(Math.max(1, parseInt(e.target.value) || 1) * 1024)} /> <span>KB</span></> : <span className="mut">{fmt(rg.length)}</span>}</label>
      </div>
      <div className="ldaxis">
        <div className="ldruler">
          {ticks(rg.origin, rg.length).map((t, i) => <div key={i} className="ldtick" style={{ top: `${t.f * 100}%` }}><span>0x{(t.addr >>> 0).toString(16).padStart(8, "0")}</span></div>)}
          <div className="ldbar2">
            {blocks.map((b, i) => { const top = (b.off / rg.length) * 100; const h = Math.max(0.6, (b.size / rg.length) * 100); return (
              <div key={i} className={`ldblk ${b.ann ? "ann" : ""}`} style={{ top: `${top}%`, height: `${h}%`, background: b.color }} title={`${b.name} · 0x${(rg.origin + b.off).toString(16)} · ${(b.size / 1024).toFixed(2)} KB`} onClick={() => b.sec && onPick(b.sec)}>
                {h > 3 && <span>{b.name}</span>}
              </div>); })}
          </div>
        </div>
      </div>
      <div className="mut mono text-[9px] mt-1">{placedNames.length ? `sections: ${placedNames.slice(0, 6).join(", ")}${placedNames.length > 6 ? "…" : ""}` : (isFlash ? "code / rodata" : isRam ? "data / bss / heap / stack" : "")}</div>
    </div>
  );
}

export default function LinkerScript({ result, device }: { result: ParseResult; device: Device }) {
  const [text, setText] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [edit, setEdit] = useState(true);
  const [pick, setPick] = useState<any>(null);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const ref = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => (text ? parseLD(text) : null), [text]);
  const base = parsed ? parsed.regions.map(rg => ({ name: rg.name, origin: rg.origin, length: rg.length, kind: (/(r|x)/.test(rg.attrs) && !/w/.test(rg.attrs)) ? "flash" : "ram", color: (/(r|x)/.test(rg.attrs) && !/w/.test(rg.attrs)) ? "#33d6c2" : "#f0a830", attrs: rg.attrs }))
    : device.regions.map(rg => ({ name: rg.name, origin: rg.base, length: rg.size, kind: rg.kind, color: rg.color, attrs: "" }));
  const regions = base.map(rg => ({ ...rg, length: overrides[rg.name] || rg.length }));
  const placement = parsed?.placement || Object.fromEntries(device.regions.map(rg => [rg.name, result.sections.filter(s => s.size > 0 && inRegion(rg, s.addr)).map(s => s.name.replace(/^\./, ""))]));
  const load = (f: File) => { setName(f.name); f.text().then(t => { setText(t); setOverrides({}); }); };
  const onDrop = (e: React.DragEvent) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) load(f); };
  return (
    <div className="space-y-4">
      <div className="panel">
        <div className="panel-head"><span>Linker Script · Memory Layout</span><span className="flex items-center gap-3"><button className="acc mono text-[10px] uppercase tracking-widest hover:underline" onClick={() => setEdit(e => !e)}>{edit ? "lock sizes" : "edit sizes"}</button><span className="tag">{text ? name : "inferred from device"}</span></span></div>
        <div className="p-3">
          <div className="drop2 !min-h-[84px]" onClick={() => ref.current?.click()} onDragOver={e => e.preventDefault()} onDrop={onDrop}>
            <input ref={ref} type="file" hidden accept=".ld,.lds,.sct,.txt" onChange={e => { const f = e.target.files?.[0]; if (f) load(f); }} />
            <span className="mono text-[10px] mut uppercase tracking-[.2em]">{text ? "replace .ld" : "drop linker script (.ld)"}</span>
            <span className="mono text-[11px] fg">parses MEMORY {`{ ORIGIN, LENGTH }`} + SECTIONS {`> REGION`} · editable · address-true</span>
          </div>
        </div>
      </div>
      <div className="panel">
        <div className="panel-head"><span>{parsed ? "Declared Regions" : "Device Memory Map"}</span><span className="tag">vertical axis = address · click a section</span></div>
        <div className="p-4">
          <div className="ldgrid">{regions.map(rg => <Column key={rg.name} rg={rg} secs={result.sections} placed={placement[rg.name]} edit={edit} onEdit={(v: number) => setOverrides(o => ({ ...o, [rg.name]: v }))} onPick={setPick} />)}</div>
          <div className="mut mono text-[9px] mt-3 leading-relaxed">annotations are the canonical Cortex-M model: vector table pinned at the flash origin, stack at the top of RAM growing down to <span className="acc">_estack</span>, heap after <span className="acc">.bss</span>. edit a region's KB to see the layout rescale live — the playground.</div>
        </div>
      </div>
      {pick && (
        <div className="panel">
          <div className="panel-head"><span>Address Readout</span><span className="tag">0x{(pick.addr >>> 0).toString(16)}</span></div>
          <div className="p-3 spec">
            <div className="row"><span className="k">section</span><span className="v a">{pick.name}</span></div>
            <div className="row"><span className="k">address</span><span className="v">0x{(pick.addr >>> 0).toString(16)}</span></div>
            <div className="row"><span className="k">size</span><span className="v b">{(pick.size / 1024).toFixed(2)} KB · {pick.size} B</span></div>
            <div className="row"><span className="k">flags / type</span><span className="v">{pick.type} · 0x{pick.flags?.toString(16)}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
