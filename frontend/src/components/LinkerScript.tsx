import { useMemo, useRef, useState } from "react";
import type { ParseResult } from "../App";
import type { Device, Region } from "../utils/devices";
import { inRegion, fmt } from "../utils/devices";

type LdRegion = { name: string; attrs: string; origin: number; length: number };
function parseSize(t: string): number {
  t = t.trim().replace(/;$/, "");
  const m = t.match(/^([0-9]+(?:\.[0-9]+)?)([KkMm])?$/);
  if (m) { const n = parseFloat(m[1]); return m[2] ? n * (m[2].toLowerCase() === "k" ? 1024 : 1048576) : n; }
  if (/^0x[0-9a-f]+$/i.test(t)) return parseInt(t, 16);
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  return 0;
}
function parseLD(text: string): { regions: LdRegion[]; placement: Record<string, string[]> } {
  const regions: LdRegion[] = []; const placement: Record<string, string[]> = {};
  const mem = text.match(/MEMORY\s*\{([\s\S]*?)\}/i);
  if (mem) for (const line of mem[1].split(/[;\n]/)) {
    const m = line.match(/^\s*(\w+)\s*(?:\(([^)]*)\))?\s*:\s*ORIGIN\s*=\s*([^,]+?)\s*,\s*LENGTH\s*=\s*(.+?)\s*$/i);
    if (m) regions.push({ name: m[1], attrs: m[2] || "", origin: parseSize(m[3]), length: parseSize(m[4]) });
  }
  const sec = text.match(/SECTIONS\s*\{([\s\S]*)\}/i);
  if (sec) { let cur = ""; for (const line of sec[1].split("\n")) {
    const o = line.match(/^\s*\.([\w.\-]+)\s*:/); if (o) cur = o[1];
    const g = line.match(/>\s*(\w+)/); if (g && cur) { (placement[g[1]] = placement[g[1]] || []).push(cur); }
  } }
  return { regions, placement };
}

function RegionBar({ rg, placed, secs }: { rg: { name: string; origin: number; length: number; color: string }; placed: string[]; secs: any[] }) {
  return (
    <div className="ldrow">
      <div className="flex justify-between mono text-[11px] mb-1"><span className="fg">{rg.name}</span><span className="mut">0x{rg.origin.toString(16)} · {fmt(rg.length)}</span></div>
      <div className="ldbar">
        {placed.map((sn, i) => { const sec = secs.find(s => s.name === "." + sn || s.name === sn); const w = sec ? Math.max(2, (sec.size / rg.length) * 100) : 1.5; return <div key={i} className="ldplace" title={`${sn}${sec ? " · " + (sec.size / 1024).toFixed(2) + " KB" : ""}`} style={{ width: `${Math.min(w, 100)}%`, background: rg.color }}>{sec && w > 8 ? <span>{sn}</span> : null}</div>; })}
      </div>
    </div>
  );
}

export default function LinkerScript({ result, device }: { result: ParseResult; device: Device }) {
  const [text, setText] = useState<string | null>(null);
  const [name, setName] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => (text ? parseLD(text) : null), [text]);

  const view = parsed ? parsed.regions.map(rg => ({ ...rg, color: /(r|x)/.test(rg.attrs) && !/w/.test(rg.attrs) ? "#33d6c2" : "#f0a830" }))
    : device.regions.map(rg => ({ name: rg.name, origin: rg.base, length: rg.size, color: rg.color }));
  const placement = parsed ? parsed.placement
    : Object.fromEntries(device.regions.map(rg => [rg.name, result.sections.filter(s => s.size > 0 && inRegion(rg, s.addr)).map(s => s.name.replace(/^\./, ""))]));

  const load = (f: File) => { setName(f.name); f.text().then(setText); };
  const onDrop = (e: React.DragEvent) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) load(f); };

  return (
    <div className="space-y-4">
      <div className="panel">
        <div className="panel-head"><span>Linker Script</span><span className="tag">{text ? name : "inferred from device"}</span></div>
        <div className="p-3">
          <div className="drop2 !min-h-[92px]" onClick={() => ref.current?.click()} onDragOver={e => e.preventDefault()} onDrop={onDrop}>
            <input ref={ref} type="file" hidden accept=".ld,.lds,.sct,.txt" onChange={e => { const f = e.target.files?.[0]; if (f) load(f); }} />
            <span className="mono text-[10px] mut uppercase tracking-[.2em]">{text ? "replace .ld" : "drop linker script"}</span>
            <span className="mono text-[11px] fg">.ld / .lds / .sct — parsed in-browser · MEMORY + SECTIONS &gt; REGION</span>
          </div>
          {text && <button className="btn-hw mt-3" onClick={() => { setText(null); setName(""); }}>↻ use inferred layout</button>}
        </div>
      </div>
      <div className="panel">
        <div className="panel-head"><span>{parsed ? "Declared Regions" : "Inferred Memory Layout"}</span><span className="tag">{view.length} regions · placement from {parsed ? ".ld" : "ELF"}</span></div>
        <div className="p-4 space-y-4">
          {view.map(rg => <RegionBar key={rg.name} rg={rg} placed={placement[rg.name] || []} secs={result.sections} />)}
          {!parsed && <div className="mut mono text-[10px] leading-relaxed">no .ld loaded — regions are the detected device map; section widths are their real sizes. drop a linker script to see the linker's declared origins, lengths and `&gt; REGION` placement.</div>}
        </div>
      </div>
    </div>
  );
}
