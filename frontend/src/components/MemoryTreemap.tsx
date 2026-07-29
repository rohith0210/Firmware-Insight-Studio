import { Treemap, ResponsiveContainer, Tooltip } from "recharts";
const CODE = new Set([".text", ".rodata"]);
const PAL: Record<string, { stroke: string; fill: string; sub: string }> = { a: { stroke: "#33d6c2", fill: "rgba(51,214,194,.14)", sub: "#33d6c2" }, b: { stroke: "#f0a830", fill: "rgba(240,168,48,.14)", sub: "#f0a830" } };
const Cell = (p: any) => { const { x, y, width, height, payload } = p; if (!payload || width < 46 || height < 26) return null; const c = PAL[payload.accent] || PAL.a; const n = payload.name || "";
  return (<g><rect x={x} y={y} width={width} height={height} fill={c.fill} stroke={c.stroke} strokeWidth={1} /><text x={x + width / 2} y={y + height / 2} textAnchor="middle" fill="#d8e1ec" fontSize={width > 110 ? 12 : 10} fontFamily="JetBrains Mono" fontWeight={700}>{n.length > 16 ? n.slice(0, 14) + ".." : n}</text><text x={x + width / 2} y={y + height / 2 + 14} textAnchor="middle" fill={c.sub} fontSize={9} fontFamily="JetBrains Mono">{(payload.size / 1024).toFixed(1)} KB</text></g>); };
const Tip = ({ active, payload }: any) => active && payload?.length && payload[0].payload ? (<div className="mono text-[11px] px-3 py-2 rounded-[3px] border" style={{ background: "var(--panel)", borderColor: "var(--line2)" }}><div className="fg">{payload[0].payload.name}</div><div className="mut">{(payload[0].payload.size / 1024).toFixed(2)} KB</div></div>) : null;
export default function MemoryTreemap({ data }: { data: any[] }) {
  if (!data?.length) return null;
  const mapped = data.map(d => { const a = CODE.has(d.name) ? "a" : "b"; return { ...d, accent: a, children: (d.children || []).map((c: any) => ({ ...c, accent: a })) }; });
  return (<div className="panel"><div className="panel-head"><span>Memory Treemap</span><span className="tag">flash + ram</span></div><div className="p-3"><div style={{ width: "100%", height: 380 }}><ResponsiveContainer width="100%" height="100%"><Treemap data={mapped} dataKey="size" aspectRatio={4 / 3} content={<Cell />}><Tooltip content={<Tip />} /></Treemap></ResponsiveContainer></div></div></div>);
}
