import { useEffect, useMemo, useRef, useState } from "react";

type R = { x: number; y: number; w: number; h: number };
function squarify(vals: number[], rect: R): R[] {
  const out: R[] = [];
  const total = vals.reduce((a: number, b: number) => a + b, 0);
  if (total <= 0 || rect.w <= 0 || rect.h <= 0) return vals.map(() => ({ x: rect.x, y: rect.y, w: 0, h: 0 }));
  const area = rect.w * rect.h;
  const q = vals.map((v: number, i: number) => ({ v: (v / total) * area, i })).filter(o => o.v > 0);
  let r = { ...rect };
  let rowV: number[] = [], rowI: { v: number; i: number }[] = [];
  const short = (rr: R) => Math.min(rr.w, rr.h);
  const worst = (row: number[], len: number) => {
    const s = row.reduce((a: number, b: number) => a + b, 0);
    if (s <= 0) return Infinity;
    const mx = Math.max(...row), mn = Math.min(...row);
    return Math.max((len * len * mx) / (s * s), (s * s) / (len * len * mn));
  };
  const place = (rv: number[], ri: { v: number; i: number }[]) => {
    const s = rv.reduce((a: number, b: number) => a + b, 0);
    if (r.w <= 0 || r.h <= 0) return;
    if (r.w <= r.h) {
      const t = s / r.w; let cx = r.x;
      for (const it of ri) { const iw = it.v / t; out[it.i] = { x: cx, y: r.y, w: iw, h: t }; cx += iw; }
      r = { x: r.x, y: r.y + t, w: r.w, h: r.h - t };
    } else {
      const t = s / r.h; let cy = r.y;
      for (const it of ri) { const ih = it.v / t; out[it.i] = { x: r.x, y: cy, w: t, h: ih }; cy += ih; }
      r = { x: r.x + t, y: r.y, w: r.w - t, h: r.h };
    }
  };
  let i = 0;
  while (i < q.length) {
    const c = q[i]; const w = short(r); if (w <= 0) break;
    if (!rowV.length || worst([...rowV, c.v], w) <= worst(rowV, w)) { rowV.push(c.v); rowI.push(c); i++; }
    else { place(rowV, rowI); rowV = []; rowI = []; }
  }
  if (rowV.length) place(rowV, rowI);
  return vals.map((_, k) => out[k] || { x: rect.x, y: rect.y, w: 0, h: 0 });
}

const STOPS = ["#3f8f7a", "#86a85a", "#c7b24c", "#d68f3e", "#cb5d4d"].map(c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]);
const mix = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
function heat(t: number) {
  t = Math.max(0, Math.min(1, t));
  const x = t * (STOPS.length - 1); const i = Math.floor(x); const f = x - i;
  const a = STOPS[i], b = STOPS[Math.min(STOPS.length - 1, i + 1)];
  const rgb = [mix(a[0], b[0], f), mix(a[1], b[1], f), mix(a[2], b[2], f)];
  const lum = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  return { fill: `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`, dark: lum > 138 };
}
const elide = (s: string, max: number) => (max < 2 ? "" : s.length > max ? s.slice(0, Math.max(1, max - 1)) + "…" : s);

function useWidth() {
  const ref = useRef<HTMLDivElement>(null); const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(es => { for (const e of es) setW(e.contentRect.width); });
    ro.observe(el); setW(el.clientWidth); return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

type Leaf = { name: string; size: number };
export type LR = { id: string; name: string; size: number; x: number; y: number; w: number; h: number; fill: string; dark: boolean; secName: string; secSize: number };
type Row = { name: string; size: number; x: number; y: number; w: number; h: number; fill: string; dark: boolean };
type Col = { kind: "sec" | "other"; x: number; w: number; headerH: number; frameH: number; secName?: string; secSize?: number; dom?: string; leafRects: LR[]; rows: Row[] };
type Tip = { x: number; y: number; lines: string[] } | null;

const DEFAULT_HEIGHT = 360, PAD = 2, COLGAP = 6, LEAFGAP = 2, BIG = 0.04;
function leavesOf(sec: any, cap: number): Leaf[] {
  let lv: Leaf[] = (sec.children || []).filter((c: any) => c.size > 0).map((c: any) => ({ name: c.name, size: c.size })).sort((a: Leaf, b: Leaf) => b.size - a.size);
  if (lv.length > cap) { const rest = lv.slice(cap).reduce((a: number, c: Leaf) => a + c.size, 0); lv = lv.slice(0, cap); if (rest > 0) lv.push({ name: "other", size: rest }); }
  const sum = lv.reduce((a: number, c: Leaf) => a + c.size, 0);
  if (lv.length && sum < sec.size) lv.push({ name: "(unattributed)", size: sec.size - sum });
  if (!lv.length) lv = [{ name: sec.name, size: sec.size }];
  return lv;
}

export default function MemoryTreemap({ data, onSelect, selectedId, height = DEFAULT_HEIGHT }: { data: any[]; onSelect: (l: LR) => void; selectedId?: string; height?: number }) {
  const [ref, W] = useWidth();
  const [focus, setFocus] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [tip, setTip] = useState<Tip>(null);
  const width = W > 0 ? W : 900;

  const { totalAll, maxLeaf } = useMemo(() => {
    let m = 1; for (const d of data) for (const c of (d.children || [])) if (c.size > m) m = c.size;
    return { totalAll: data.reduce((a: number, d: any) => a + (d.size || 0), 0), maxLeaf: m };
  }, [data]);

  const view = useMemo(() => {
    const inner: R = { x: PAD, y: PAD, w: Math.max(0, width - PAD * 2), h: height - PAD * 2 };
    if (focus) {
      const sec = data.find(d => d.name === focus);
      if (!sec) return { mode: "zoom" as const, leafRects: [] as LR[] };
      const lv = leavesOf(sec, 60); const rects = squarify(lv.map(l => l.size), inner);
      const leafRects: LR[] = lv.map((l, i) => { const c = heat(l.size / maxLeaf); return { id: `${sec.name}::${l.name}`, name: l.name, size: l.size, ...rects[i], fill: c.fill, dark: c.dark, secName: sec.name, secSize: sec.size }; });
      return { mode: "zoom" as const, leafRects };
    }
    const secs = data.filter(d => d.size > 0).sort((a: any, b: any) => b.size - a.size);
    const big = secs.filter(s => s.size / totalAll >= BIG); const tiny = secs.filter(s => s.size / totalAll < BIG);
    const colsDef: { kind: "sec" | "other"; size: number; sec?: any; secs?: any[] }[] = big.map(s => ({ kind: "sec", size: s.size, sec: s }));
    if (tiny.length) colsDef.push({ kind: "other", size: tiny.reduce((a: number, s: any) => a + s.size, 0), secs: tiny });
    const nCols = colsDef.length || 1; const usable = inner.w - COLGAP * (nCols - 1); const floor = Math.max(48, Math.min(132, usable / nCols));
    let fixed = 0, flexSum = 0;
    const widths = colsDef.map(c => { const prop = (c.size / totalAll) * usable; if (prop < floor) { fixed += floor; return floor; } flexSum += prop; return -prop; });
    const remain = usable - fixed; const cols: Col[] = []; let cx = inner.x;
    colsDef.forEach((c, i) => {
      const w = widths[i] < 0 ? (flexSum > 0 ? (-widths[i] / flexSum) * remain : remain) : widths[i];
      const frameH = inner.h; const headerH = w > 150 ? 38 : w > 96 ? 30 : 0;
      if (c.kind === "sec") {
        const lv = leavesOf(c.sec, 26);
        const field: R = { x: cx + LEAFGAP, y: inner.y + headerH + LEAFGAP, w: Math.max(0, w - LEAFGAP * 2), h: Math.max(0, frameH - headerH - LEAFGAP * 2) };
        const rects = squarify(lv.map(l => l.size), field);
        const leafRects: LR[] = lv.map((l, li) => { const cc = heat(l.size / maxLeaf); return { id: `${c.sec.name}::${l.name}`, name: l.name, size: l.size, ...rects[li], fill: cc.fill, dark: cc.dark, secName: c.sec.name, secSize: c.sec.size }; });
        const dom = lv[0] && lv[0].size / c.sec.size > 0.3 && field.h > 64 ? lv[0].name : undefined;
        cols.push({ kind: "sec", x: cx, w, headerH, frameH, secName: c.sec.name, secSize: c.sec.size, dom, leafRects, rows: [] });
      } else {
        const listTop = inner.y + headerH + LEAFGAP; const listH = Math.max(0, frameH - headerH - LEAFGAP * 2);
        const rowsDef = (c.secs || []).slice().sort((a: any, b: any) => b.size - a.size); const minR = Math.min(24, listH / Math.max(1, rowsDef.length));
        let rfixed = 0, rflex = 0;
        const rh = rowsDef.map(s => { const p = (s.size / (c.size || 1)) * listH; if (p < minR) { rfixed += minR; return minR; } rflex += p; return -p; });
        const rremain = listH - rfixed; let ry = listTop; const rows: Row[] = [];
        rowsDef.forEach((s, si) => { const h = rh[si] < 0 ? (rflex > 0 ? (-rh[si] / rflex) * rremain : 0) : rh[si]; const cc = heat(s.size / maxLeaf); rows.push({ name: s.name, size: s.size, x: cx + LEAFGAP, y: ry, w: Math.max(0, w - LEAFGAP * 2), h, fill: cc.fill, dark: cc.dark }); ry += h + 1; });
        cols.push({ kind: "other", x: cx, w, headerH, frameH, secName: "other sections", secSize: c.size, leafRects: [], rows });
      }
      cx += w + COLGAP;
    });
    return { mode: "top" as const, cols };
  }, [data, focus, width, height, totalAll, maxLeaf]);

  if (!data?.length) return null;
  const pct = (n: number, d: number) => (d > 0 ? ((n / d) * 100).toFixed(1) : "0.0");
  const showTip = (e: React.MouseEvent, lines: string[]) => setTip({ x: e.clientX, y: e.clientY, lines });

  const LeafG = (l: LR, delay: number, labeled: boolean) => {
    const isSel = selectedId === l.id;
    return (
      <g key={l.id} className="tm-leaf"
        style={{ transformBox: "fill-box", transformOrigin: "center", animation: "tmIn .34s ease both", animationDelay: `${Math.min(delay, 32) * 5}ms`, opacity: hover && hover !== l.id ? 0.4 : 1, cursor: "pointer", filter: isSel ? "drop-shadow(0 0 7px rgba(51,214,194,.55))" : "none" }}
        onMouseMove={e => showTip(e, [l.name, `${(l.size / 1024).toFixed(2)} KB`, `${pct(l.size, l.secSize)}% of ${l.secName}`, `${pct(l.size, totalAll)}% of mapped`, "click to inspect"])}
        onMouseLeave={() => { setHover(null); setTip(null); }}
        onMouseEnter={() => setHover(l.id)}
        onClick={(e) => { e.stopPropagation(); onSelect(l); }}>
        <rect x={l.x} y={l.y} width={Math.max(0, l.w - LEAFGAP)} height={Math.max(0, l.h - LEAFGAP)} rx={3} fill={l.fill} stroke={isSel ? "var(--a)" : hover === l.id ? "#e8f1ec" : "rgba(0,0,0,.35)"} strokeWidth={isSel ? 2.2 : hover === l.id ? 1.4 : 0.6} />
        <rect x={l.x} y={l.y} width={Math.max(0, l.w - LEAFGAP)} height={2} rx={1} fill="rgba(255,255,255,.22)" />
        {labeled && l.w > 46 && l.h > 17 && <text x={l.x + 6} y={l.y + 15} fill={l.dark ? "#0a130f" : "#f1f7f3"} fontSize={l.w > 120 ? 12 : 10.5} fontFamily="JetBrains Mono" fontWeight={700}>{elide(l.name, Math.floor((l.w - 12) / (l.w > 120 ? 7.4 : 6.5)))}</text>}
        {labeled && l.w > 46 && l.h > 33 && <text x={l.x + 6} y={l.y + 29} fill={l.dark ? "rgba(10,19,15,.7)" : "rgba(241,247,243,.78)"} fontSize={9.5} fontFamily="JetBrains Mono">{(l.size / 1024).toFixed(2)} KB</text>}
      </g>
    );
  };

  return (
    <div className="panel" style={{ position: "relative" }}>
      <style>{`@keyframes tmIn{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:scale(1)}} .tm-leaf{transition:opacity .12s} .tm-colframe{transition:stroke .15s}`}</style>
      <div className="panel-head">
        <span>Memory Treemap{focus && <span className="acc"> · {focus}</span>}</span>
        <span className="flex items-center gap-3">
          {focus && <button className="acc mono text-[10px] uppercase tracking-widest hover:underline" onClick={() => setFocus(null)}>‹ all sections</button>}
          <span className="heatkey"><span className="mut mono text-[9px]">0</span><i style={{ background: "linear-gradient(90deg,#3f8f7a,#c7b24c,#cb5d4d)" }} /><span className="mut mono text-[9px]">{(maxLeaf / 1024).toFixed(1)} KB</span></span>
          <span className="tag">{focus ? "click a tile to inspect" : "header = zoom · tile = inspect"}</span>
        </span>
      </div>
      <div className="p-3">
        <div ref={ref} style={{ width: "100%", height }}>
          <svg width="100%" height={height} style={{ display: "block" }} onMouseLeave={() => setTip(null)}>
            {view.mode === "zoom" ? view.leafRects.map((l, i) => LeafG(l, i, true)) :
              view.cols.map((col, ci) => (
                <g key={ci}>
                  <rect className="tm-colframe" x={col.x} y={PAD} width={Math.max(0, col.w)} height={col.frameH} rx={4} fill="rgba(255,255,255,.022)" stroke="#223040" strokeWidth={1} />
                  {col.headerH > 0 && (
                    <g className="tm-colhead" style={{ cursor: col.kind === "sec" ? "pointer" : "default" }} onClick={(e) => { e.stopPropagation(); if (col.kind === "sec") setFocus(col.secName!); }}
                      onMouseMove={e => col.kind === "sec" && showTip(e, [col.secName!, `${(col.secSize! / 1024).toFixed(2)} KB`, `${pct(col.secSize!, totalAll)}% of mapped`, "click header to zoom"])} onMouseLeave={() => setTip(null)}>
                      <rect x={col.x + 1} y={PAD + 1} width={Math.max(0, col.w - 2)} height={col.headerH - 2} rx={3} fill="rgba(8,12,18,.6)" />
                      <text x={col.x + 9} y={PAD + (col.dom ? 15 : 19)} fill="#e6eef6" fontSize={col.w > 150 ? 13 : 11.5} fontFamily="Chakra Petch" fontWeight={700} letterSpacing=".03em">{elide(col.secName!, Math.floor((col.w - 18) / 7.6))}</text>
                      <text x={col.x + col.w - 9} y={PAD + (col.dom ? 15 : 19)} fill="#7c8b9c" fontSize={10} fontFamily="JetBrains Mono" textAnchor="end">{(col.secSize! / 1024).toFixed(1)} KB</text>
                      {col.dom && <text x={col.x + 9} y={PAD + 29} fill="#5f7184" fontSize={9.5} fontFamily="JetBrains Mono">▸ {elide(col.dom, Math.floor((col.w - 18) / 6))}</text>}
                    </g>
                  )}
                  {col.kind === "sec" ? col.leafRects.map((l, li) => LeafG(l, li, false)) :
                    col.rows.map((rw, ri) => (
                      <g key={ri} className="tm-leaf" style={{ cursor: "pointer", opacity: hover && hover !== `row:${rw.name}` ? 0.45 : 1, transition: "opacity .12s" }}
                        onClick={(e) => { e.stopPropagation(); setFocus(rw.name); }} onMouseEnter={() => setHover(`row:${rw.name}`)} onMouseLeave={() => { setHover(null); setTip(null); }}
                        onMouseMove={e => showTip(e, [rw.name, `${(rw.size / 1024).toFixed(2)} KB`, `${pct(rw.size, totalAll)}% of mapped`, "click to zoom"])}>
                        <rect x={rw.x} y={rw.y} width={Math.max(0, rw.w)} height={Math.max(0, rw.h - 1)} rx={3} fill={rw.fill} stroke={hover === `row:${rw.name}` ? "#e8f1ec" : "rgba(0,0,0,.3)"} strokeWidth={hover === `row:${rw.name}` ? 1.3 : 0.6} />
                        {rw.h > 15 && rw.w > 70 && <text x={rw.x + 8} y={rw.y + rw.h / 2 + 3.5} fill={rw.dark ? "#0a130f" : "#f1f7f3"} fontSize={10.5} fontFamily="JetBrains Mono" fontWeight={600}>{elide(rw.name, Math.floor((rw.w - 64) / 6.4))}</text>}
                        {rw.h > 15 && rw.w > 70 && <text x={rw.x + rw.w - 8} y={rw.y + rw.h / 2 + 3.5} fill={rw.dark ? "rgba(10,19,15,.72)" : "rgba(241,247,243,.8)"} fontSize={9.5} fontFamily="JetBrains Mono" textAnchor="end">{(rw.size / 1024).toFixed(2)} KB</text>}
                      </g>
                    ))}
                </g>
              ))}
          </svg>
        </div>
      </div>
      {tip && <div style={{ position: "fixed", left: tip.x + 14, top: tip.y + 14, zIndex: 60, pointerEvents: "none", background: "var(--panel)", border: "1px solid var(--line2)", borderRadius: 4, padding: "7px 10px", fontFamily: "JetBrains Mono", fontSize: 11, lineHeight: 1.5, boxShadow: "0 10px 30px -12px rgba(0,0,0,.8)" }}><div className="fg" style={{ fontWeight: 700 }}>{tip.lines[0]}</div>{tip.lines.slice(1).map((l, i) => <div key={i} className="mut">{l}</div>)}</div>}
    </div>
  );
}
