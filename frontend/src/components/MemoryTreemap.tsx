import { useMemo, useState } from "react";
import { Treemap, ResponsiveContainer, Tooltip } from "recharts";
const CODE = new Set([".text", ".rodata"]);
function lerp(a: number, b: number, t: number) { return Math.round(a + (b - a) * t); }
function hex(c: string) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
const STOPS = ["#2bb673", "#9fc23f", "#e0c84a", "#f0a830", "#e0793a", "#e0566b"].map(hex);
function heat(t: number) { t = Math.max(0, Math.min(1, t)); const x = t * (STOPS.length - 1); const i = Math.floor(x); const f = x - i; const a = STOPS[i], b = STOPS[Math.min(STOPS.length - 1, i + 1)]; return `rgb(${lerp(a[0], b[0], f)},${lerp(a[1], b[1], f)},${lerp(a[2], b[2], f)})`; }
const GREY = "#2a3744";

function build(data: any[], focus: string | null) {
  let nodes: any[];
  if (focus) { const sec = data.find(d => d.name === focus); nodes = (sec?.children || []).map((c: any) => ({ ...c })); }
  else nodes = data.map(d => ({ ...d }));
  // full tile: add unattributed leaf where children under-fill the node
  nodes = nodes.map(n => {
    const cs: any[] = (n.children || []).slice();
    const childSum = cs.reduce((a, c) => a + (c.size || 0), 0);
    if (cs.length && childSum < n.size) cs.push({ name: "(unattributed)", size: n.size - childSum, grey: true });
    return { ...n, children: cs.length ? cs : [{ name: n.name, size: n.size, grey: false }] };
  });
  // attach heat value (relative to max at this level / within section)
  const maxTop = Math.max(1, ...nodes.map(n => n.size));
  return nodes.map(n => {
    const kids = n.children || [];
    const maxKid = Math.max(1, ...kids.map((k: any) => k.size));
    return { ...n, _heat: n.grey ? -1 : (focus ? 0.5 : n.size / maxTop),
      children: kids.map((k: any) => ({ ...k, _heat: k.grey ? -1 : k.size / maxKid })) };
  });
}

const Cell = (p: any) => {
  const { x, y, width, height, payload } = p; if (!payload || width < 40 || height < 24) return null;
  const h = payload._heat; const fill = h < 0 ? GREY : heat(h); const isLeaf = !payload.children?.length;
  const stroke = isLeaf ? "rgba(0,0,0,.45)" : "rgba(255,255,255,.18)";
  const name = payload.name || ""; const txt = width > 120 ? name : (name.length > 12 ? name.slice(0, 11) + ".." : name);
  return (
    <g style={{ cursor: isLeaf ? "default" : "pointer" }}>
      <rect x={x} y={y} width={width} height={height} fill={isLeaf ? fill : `${fill}33`} stroke={stroke} strokeWidth={isLeaf ? 0.5 : 1.2} />
      {!isLeaf && <rect x={x} y={y} width={width} height={3} fill={fill} />}
      <text x={x + 6} y={y + 15} fill={isLeaf ? "#06121a" : "#d8e1ec"} fontSize={width > 110 ? 12 : 10} fontFamily="JetBrains Mono" fontWeight={700}>{txt}</text>
      {height > 34 && <text x={x + 6} y={y + 28} fill={isLeaf ? "rgba(6,18,26,.7)" : "#69788a"} fontSize={9} fontFamily="JetBrains Mono">{(payload.size / 1024).toFixed(1)} KB</text>}
    </g>
  );
};
const Tip = ({ active, payload }: any) => active && payload?.length && payload[0].payload ? (<div className="mono text-[11px] px-3 py-2 rounded-[3px] border" style={{ background: "var(--panel)", borderColor: "var(--line2)" }}><div className="fg">{payload[0].payload.name}</div><div className="mut">{(payload[0].payload.size / 1024).toFixed(2)} KB</div></div>) : null;

export default function MemoryTreemap({ data }: { data: any[] }) {
  const [focus, setFocus] = useState<string | null>(null);
  const mapped = useMemo(() => build(data, focus), [data, focus]);
  if (!data?.length) return null;
  const onNode = (n: any) => { if (!focus && n?.name && data.find(d => d.name === n.name)) setFocus(n.name); };
  return (
    <div className="panel">
      <div className="panel-head">
        <span>Memory Treemap {focus && <span className="acc"> / {focus}</span>}</span>
        <span className="flex items-center gap-3">
          {focus && <button className="acc mono text-[10px] uppercase tracking-widest hover:underline" onClick={() => setFocus(null)}>‹ back</button>}
          <span className="heatkey"><i style={{ background: "linear-gradient(90deg,#2bb673,#e0c84a,#f0a830,#e0566b)" }} /><span className="mut mono text-[9px]">small → large</span></span>
          <span className="tag">click a section to zoom</span>
        </span>
      </div>
      <div className="p-3">
        <div style={{ width: "100%", height: 400 }}>
          <ResponsiveContainer width="100%" height="100%">
            <Treemap data={mapped} dataKey="size" aspectRatio={4 / 3} content={<Cell />} onClick={onNode} isAnimationActive={false}>
              <Tooltip content={<Tip />} />
            </Treemap>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
