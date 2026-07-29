import { useMemo, useRef, useState } from "react";
import type { ParseResult } from "../App";
import type { Device } from "../utils/devices";
import { inRegion, fmt } from "../utils/devices";

type LdRegion = { name: string; attrs: string; origin: number; length: number };
type NRegion = { name: string; origin: number; length: number; kind: string; color: string; attrs: string; base: number; size: number };

function parseSize(t: string): number { t = t.trim().replace(/;$/, ""); const m = t.match(/^([0-9]+(?:\.[0-9]+)?)([KkMm])?$/); if (m) { const n = parseFloat(m[1]); return m[2] ? n * (m[2].toLowerCase() === "k" ? 1024 : 1048576) : n; } if (/^0x[0-9a-f]+$/i.test(t)) return parseInt(t, 16); if (/^\d+$/.test(t)) return parseInt(t, 10); return 0; }
function parseLD(text: string) {
  const regions: LdRegion[] = []; const placement: Record<string, string[]> = {};
  const mem = text.match(/MEMORY\s*\{([\s\S]*?)\}/i);
  if (mem) for (const line of mem[1].split(/[;\n]/)) { const m = line.match(/^\s*(\w+)\s*(?:\(([^)]*)\))?\s*:\s*ORIGIN\s*=\s*([^,]+?)\s*,\s*LENGTH\s*=\s*(.+?)\s*$/i); if (m) regions.push({ name: m[1], attrs: m[2] || "", origin: parseSize(m[3]), length: parseSize(m[4]) }); }
  const sec = text.match(/SECTIONS\s*\{([\s\S]*)\}/i);
  if (sec) { let cur = ""; for (const line of sec[1].split("\n")) { const o = line.match(/^\s*\.([\w.\-]+)\s*:/); if (o) cur = o[1]; const g = line.match(/>\s*(\w+)/); if (g && cur) (placement[g[1]] = placement[g[1]] || []).push(cur); } }
  return { regions, placement };
}
const ticks = (origin: number, length: number) => [0, 0.25, 0.5, 0.75, 1].map(f => ({ f, addr: origin + Math.round(length * f) }));
const tickShift = (f: number) => (f <= 0 ? "0%" : f >= 1 ? "-100%" : "-50%");

function Column({ rg, secs, placed, edit, onEdit, onPick }: any) {
  const region = rg as NRegion;
  const isFlash = region.kind === "flash" || region.kind === "xip";
  const isRam = region.kind === "ram" || region.kind === "ccm";
  // real sections at their true offsets
  const occ = secs.filter((s: any) => s.size > 0 && inRegion(region, s.addr))
    .map((s: any) => ({ off: (s.addr >>> 0) - region.origin, size: s.size, name: s.name, color: region.color, sec: s }))
    .filter((b: any) => b.off >= 0 && b.off + b.size <= region.length)
    .sort((a: any, b: any) => a.off - b.off);
  // free gaps between/around real sections -> canonical annotations live ONLY here (never overlap a real section)
  const blocks: any[] = occ.map(o => ({ ...o, ann: false }));
  const gaps: { off: number; size: number }[] = [];
  let cursor = 0;
  for (const o of occ) { if (o.off > cursor) gaps.push({ off: cursor, size: o.off - cursor }); cursor = Math.max(cursor, o.off + o.size); }
  if (cursor < region.length) gaps.push({ off: cursor, size: region.length - cursor });
  for (const g of gaps) {
    if (g.size < 64) { blocks.push({ ...g, name: "", color: "transparent", ann: false, free: true }); continue; }
    const atStart = g.off === 0, atEnd = g.off + g.size >= region.length;
    if (isFlash && atStart) blocks.push({ ...g, name: "VECTOR TABLE", color: "#e0566b", ann: true });
    else if (isRam && atEnd) blocks.push({ ...g, name: "↓ STACK (_estack)", color: "#1c8a7e", ann: true });
    else if (isRam && !atStart && !atEnd) blocks.push({ ...g, name: "HEAP ↑", color: "#9a6c1c", ann: true });
    else blocks.push({ ...g, name: "", color: "transparent", ann: false, free: true });
  }
  blocks.sort((a: any, b: any) => a.off - b.off);

  return (
    <div className="ldcol">
      <div className="ldcol-head">
        <span className="fg">{region.name}</span>
        <span className="mut mono text-[10px]">0x{(region.origin >>> 0).toString(16)}</span>
        <label className="ldedit" title="region length (KB)">{edit ? <><input type="number" min={1} value={Math.round(region.length / 1024)} onChange={e => onEdit(Math.max(1, parseInt(e.target.value) || 1) * 1024)} /> <span>KB</span></> : <span className="mut">{fmt(region.length)}</span>}</label>
      </div>
      <div className="ldaxis">
        <div className="ldruler">
          {ticks(region.origin, region.length).map((t, i) => (
            <div key={i} className="ldtick" style={{ top: `${t.f * 100}%`, transform: `translateY(${tickShift(t.f)})` }}><span>0x{(t.addr >>> 0).toString(16).padStart(8, "0")}</span></div>
          ))}
          <div className="ldbar2">
            {blocks.map((b, i) => { const top = (b.off / region.length) * 100; const h = Math.max(0.5, (b.size / region.length) * 100); return (
              <div key={i} className={`ldblk ${b.ann ? "ann" : ""} ${b.free ? "free" : ""}`} style={{ top: `${top}%`, height: `${h}%`, background: b.free ? undefined : b.color }} title={b.sec ? `${b.name} · 0x${(region.origin + b.off).toString(16)} · ${(b.size / 1024).toFixed(2)} KB` : (b.name || "free")} onClick={() => b.sec && onPick(b.sec)}>
                {h > 3 && b.name && <span>{b.name}</span>}
              </div>); })}
          </div>
        </div>
      </div>
      <div className="mut mono text-[9px] mt-2 truncate">{placed.length ? `sections: ${placed.slice(0, 7).join(", ")}${placed.length > 7 ? "…" : ""}` : (isFlash ? "code / rodata" : isRam ? "data / bss / heap / stack" : "")}</div>
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

  const rawBase: Omit<NRegion, "base" | "size">[] = parsed
    ? parsed.regions.map(rg => ({ name: rg.name, origin: rg.origin, length: rg.length, kind: (/(r|x)/.test(rg.attrs) && !/w/.test(rg.attrs)) ? "flash" : "ram", color: (/(r|x)/.test(rg.attrs) && !/w/.test(rg.attrs)) ? "#33d6c2" : "#f0a830", attrs: rg.attrs }))
    : device.regions.map(rg => ({ name: rg.name, origin: rg.base, length: rg.size, kind: rg.kind, color: rg.color, attrs: "" }));
  const regions: NRegion[] = rawBase.map(rg => { const L = overrides[rg.name] || rg.length; return { ...rg, length: L, base: rg.origin, size: L }; });
  const placement = parsed?.placement || Object.fromEntries(regions.map(rg => [rg.name, result.sections.filter(s => s.size > 0 && inRegion(rg, s.addr)).map(s => s.name.replace(/^\./, ""))]));

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
          <div className="ldgrid">{regions.map(rg => <Column key={rg.name} rg={rg} secs={result.sections} placed={placement[rg.name] || []} edit={edit} onEdit={(v: number) => setOverrides(o => ({ ...o, [rg.name]: v }))} onPick={setPick} />)}</div>
          <div className="mut mono text-[9px] mt-3 leading-relaxed">sections sit at their real addresses; the canonical Cortex-M markers (vector table, heap, stack→<span className="acc">_estack</span>) only fill genuinely empty gaps, so they never cover real code. edit a region's KB to rescale live.</div>
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
