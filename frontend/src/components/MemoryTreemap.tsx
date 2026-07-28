import { Treemap, ResponsiveContainer, Tooltip } from "recharts";
const CODE = new Set([".text", ".rodata"]);
const renderCell = (props: any) => {
  const { x, y, width, height, payload, name, value } = props;
  const p = payload || {}; const nm = p.name || name || ""; const sz = p.size ?? value ?? 0;
  if (width < 44 || height < 24 || !nm) return null;
  const isCode = CODE.has(p.name || nm) || p.accent === "a";
  const stroke = isCode ? "#33d6c2" : "#f0a830";
  const fill = isCode ? "rgba(51,214,194,.16)" : "rgba(240,168,48,.16)";
  const sub = isCode ? "#33d6c2" : "#f0a830";
  const isSection = !!p.children; const label = nm.length > 16 ? nm.slice(0, 14) + ".." : nm;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} stroke={stroke} strokeWidth={isSection ? 1.6 : 1} />
      <text x={x + width / 2} y={y + height / 2} textAnchor="middle" fill="#d8e1ec" fontSize={width > 110 ? 12 : 10} fontFamily="JetBrains Mono" fontWeight={700}>{label}</text>
      <text x={x + width / 2} y={y + height / 2 + 14} textAnchor="middle" fill={sub} fontSize={9} fontFamily="JetBrains Mono">{(sz / 1024).toFixed(1)} KB</text>
    </g>
  );
};
const Tip = ({ active, payload }: any) => {
  if (active && payload && payload.length && payload[0].payload) {
    const d = payload[0].payload;
    return <div className="mono text-[11px] px-3 py-2 rounded-[3px] border" style={{ background: "var(--panel)", borderColor: "var(--line2)" }}><div className="fg">{d.name}</div><div className="mut">{(d.size / 1024).toFixed(2)} KB</div></div>;
  }
  return null;
};
export default function MemoryTreemap({ data }: { data: any[] }) {
  if (!data || data.length === 0) return null;
  const mapped = data.map(d => { const accent = CODE.has(d.name) ? "a" : "b"; return { ...d, accent, children: (d.children || []).map((c: any) => ({ ...c, accent })) }; });
  return (
    <div className="panel">
      <div className="panel-head"><span>Memory Map</span>
        <span className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 mono text-[10px] mut"><span style={{ width: 9, height: 9, background: "var(--a)", display: "inline-block" }} />code</span>
          <span className="flex items-center gap-1.5 mono text-[10px] mut"><span style={{ width: 9, height: 9, background: "var(--b)", display: "inline-block" }} />data</span>
          <span className="tag">flash + ram</span>
        </span>
      </div>
      <div className="p-3"><div className="h-[380px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <Treemap data={mapped} dataKey="size" aspectRatio={4 / 3} isAnimationActive={false} content={renderCell}><Tooltip content={<Tip />} /></Treemap>
        </ResponsiveContainer>
      </div></div>
    </div>
  );
}
