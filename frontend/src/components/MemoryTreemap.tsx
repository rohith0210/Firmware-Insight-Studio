import { useEffect, useMemo, useRef, useState } from "react";

type R = { x: number; y: number; w: number; h: number };
type Leaf = { name: string; size: number; grey?: boolean };

/* ---- squarified treemap layout (Bruls et al.), pure math, no deps ---- */
function squarify(vals: number[], rect: R): R[] {
  const out: R[] = [];
  const total = vals.reduce((a, b) => a + b, 0);
  if (total <= 0 || rect.w <= 0 || rect.h <= 0) return vals.map(() => ({ x: rect.x, y: rect.y, w: 0, h: 0 }));
  const area = rect.w * rect.h;
  const q = vals.map((v, i) => ({ v: (v / total) * area, i })).filter(o => o.v > 0);
  let r = { ...rect };
  let rowV: number[] = [], rowI: { v: number; i: number }[] = [];
  const short = (rr: R) => Math.min(rr.w, rr.h);
  const worst = (row: number[], len: number) => {
    const s = row.reduce((a, b) => a + b, 0); if (s <= 0) return Infinity;
    const mx = Math.max(...row), mn = Math.min(...row);
    return Math.max((len * len * mx) / (s * s), (s * s) / (len * len * mn));
  };
  const place = (rv: number[], ri: { v: number; i: number }[]) => {
    const s = rv.reduce((a, b) => a + b, 0); if (r.w <= 0 || r.h <= 0) return;
    if (r.w <= r.h) { const t = s / r.w; let cx = r.x; for (const it of ri) { const iw = it.v / t; out[it.i] = { x: cx, y: r.y, w: iw, h: t }; cx += iw; } r = { x: r.x, y: r.y + t, w: r.w, h: r.h - t }; }
    else { const t = s / r.h; let cy = r.y; for (const it of ri) { const ih = it.v / t; out[it.i] = { x: r.x, y: cy, w: t, h: ih }; cy += ih; } r = { x: r.x + t, y: r.y, w: r.w - t, h: r.h }; }
  };
  let i = 0;
  while (i < q.length) {
    const c = q[i]; const w = short(r); if (w <= 0) break;
    const wNow = rowV.length ? worst(rowV, w) : Infinity;
    const wNext = worst([...rowV, c.v], w);
    if (!rowV.length || wNext <= wNow) { rowV.push(c.v); rowI.push(c); i++; }
    else { place(rowV, rowI); rowV = []; rowI = []; }
  }
  if (rowV.length) place(rowV, rowI);
  return vals.map((_, k) => out[k] || { x: rect.x, y: rect.y, w: 0, h: 0 });
}

/* ---- heat ramp: small (green) -> large (red) ---- */
const STOPS = ["#2bb673", "#9fc23f", "#e0c84a", "#f0a830", "#e0793a", "#e0566b"].map(c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]);
const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
function heat(t: number) { t = Math.max(0, Math.min(1, t)); const x = t * (STOPS.length - 1); const i = Math.floor(x); const f = x - i; const a = STOPS[i], b = STOPS[Math.min(STOPS.length - 1, i + 1)]; return `rgb(${lerp(a[0], b[0], f)},${lerp(a[1], b[1], f)},${lerp(a[2], b[2], f)})`; }
const GREY = "#2a3744";
const elide = (s: string, n: number) => (s.length > n ? s.slice(0, Math.max(1, n - 1)) + "…" : s);

function useWidth() {
  const ref = useRef<HTMLDivElement>(null); const [w, setW] = useState(0);
  useEffect(() => { const el = ref.current; if (!el) return; const ro = new ResizeObserver(es => { for (const e of es) setW(e.contentRect.width); }); ro.observe(el); setW(el.clientWidth); return () => ro.disconnect(); }, []);
  return [ref, w] as const;
}

function leavesOf(sec: any): Leaf[] {
  let lv: Leaf[] = (sec.children || []).filter((c: any) => c.size > 0).map((c: any) => ({ name: c.name, size: c.size }));
  const sum = lv.reduce((a, c) => a + c.size, 0);
  if (lv.length && sum < sec.size) lv.push({ name: "(unattributed)", size: sec.size - sum, grey: true });
  if (!lv.length) lv = [{ name: sec.name, size: sec.size }];
  return lv;
}

const H = 420;

export default function MemoryTreemap({ data }: { data: any[] }) {
  const [ref, W] = useWidth();
  const [focus, setFocus] = useState<string | null>(null);
  const width = W > 0 ? W : 800;

  const layout = useMemo(() => {
    const full: R = { x: 0, y: 0, w: width, h: H };
    if (focus) {
      const sec = data.find(d => d.name === focus); if (!sec) return { mode: "zoom" as const, leaves: [] as (Leaf & R)[], max: 1, title: focus };
      const lv = leavesOf(sec); const max = Math.max(1, ...lv.map(l => l.size));
      const rects = squarify(lv.map(l => l.size), full);
      return { mode: "zoom" as const, title: focus, max, leaves: lv.map((l, i) => ({ ...l, ...rects[i] })) };
    }
    const secs = data.filter(d => d.size > 0);
    const secRects = squarify(secs.map(s => s.size), full);
    const leafSets = secs.map(leavesOf);
    const max = Math.max(1, ...leafSets.flat().map(l => l.size));
    const groups = secs.map((s, si) => {
      const sr = secRects[si]; const headH = sr.h > 46 ? 17 : 0;
      const inner: R = { x: sr.x + 1, y: sr.y + headH, w: Math.max(0, sr.w - 2), h: Math.max(0, sr.h - headH - 1) };
      const lr = squarify(leafSets[si].map(l => l.size), inner);
      return { sec: s, sr, headH, leaves: leafSets[si].map((l, li) => ({ ...l, ...lr[li] })) };
    });
    return { mode: "sections" as const, max, groups };
  }, [data, focus, width]);

  if (!data?.length) return null;

  const Leaf = (l: Leaf & R, key: any) => {
    if (l.w < 2 || l.h < 2) return null;
    const fill = l.grey ? GREY : heat(l.size / layout.max);
    return (
      <g key={key} className="tm-leaf" style={{ cursor: "default" }}>
        <rect x={l.x} y={l.y} width={l.w} height={l.h} fill={fill} stroke="rgba(0,0,0,.45)" strokeWidth={0.5} />
        <title>{`${l.name}\n${(l.size / 1024).toFixed(2)} KB`}</title>
        {l.w > 44 && l.h > 16 && <text x={l.x + 5} y={l.y + 14} fill="#06121a" fontSize={l.w > 110 ? 12 : 10} fontFamily="JetBrains Mono" fontWeight={700}>{elide(l.name, Math.floor(l.w / 7))}</text>}
        {l.w > 44 && l.h > 30 && <text x={l.x + 5} y={l.y + 27} fill="rgba(6,18,26,.72)" fontSize={9} fontFamily="JetBrains Mono">{(l.size / 1024).toFixed(1)} KB</text>}
      </g>
    );
  };

  return (
    <div className="panel">
      <style>{`.tm-leaf{transition:filter .12s} .tm-leaf:hover{filter:brightness(1.14)} .tm-sec{cursor:pointer} .tm-sec:hover .tm-secframe{stroke:var(--a);stroke-width:1.4}`}</style>
      <div className="panel-head">
        <span>Memory Treemap{focus && <span className="acc"> / {focus}</span>}</span>
        <span className="flex items-center gap-3">
          {focus && <button className="acc mono text-[10px] uppercase tracking-widest hover:underline" onClick={() => setFocus(null)}>‹ back</button>}
          <span className="heatkey"><i style={{ background: "linear-gradient(90deg,#2bb673,#e0c84a,#f0a830,#e0566b)" }} /><span className="mut mono text-[9px]">small → large</span></span>
          <span className="tag">{focus ? "functions in section" : "click a section to zoom"}</span>
        </span>
      </div>
      <div className="p-3">
        <div ref={ref} style={{ width: "100%", height: H }}>
          <svg width="100%" height={H} style={{ display: "block" }}>
            {layout.mode === "zoom" ? layout.leaves.map((l, i) => Leaf(l, i)) :
              layout.groups.map((g, gi) => (
                <g key={g.sec.name} className="tm-sec" onClick={() => setFocus(g.sec.name)}>
                  <rect className="tm-secframe" x={g.sr.x} y={g.sr.y} width={g.sr.w} height={g.sr.h} fill="rgba(255,255,255,.015)" stroke="rgba(255,255,255,.16)" strokeWidth={1} />
                  {g.headH > 0 && <>
                    <rect x={g.sr.x + 1} y={g.sr.y + 1} width={Math.max(0, g.sr.w - 2)} height={g.headH - 1} fill="rgba(7,10,15,.6)" />
                    <text x={g.sr.x + 6} y={g.sr.y + 12} fill="#d8e1ec" fontSize={11} fontFamily="JetBrains Mono" fontWeight={700}>{elide(g.sec.name, Math.floor(g.sr.w / 7))}</text>
                    <text x={g.sr.x + g.sr.w - 6} y={g.sr.y + 12} fill="#69788a" fontSize={9} fontFamily="JetBrains Mono" textAnchor="end">{(g.sec.size / 1024).toFixed(1)} KB</text>
                  </>}
                  <title>{`${g.sec.name}\n${(g.sec.size / 1024).toFixed(2)} KB — click to zoom`}</title>
                  {g.leaves.map((l, li) => Leaf(l, gi + "-" + li))}
                </g>
              ))}
          </svg>
        </div>
      </div>
    </div>
  );
}
