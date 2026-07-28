import { Treemap, ResponsiveContainer, Tooltip } from "recharts";

// Custom tooltip
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length && payload[0].payload) {
    const data = payload[0].payload;
    const sizeKB = (data.size / 1024).toFixed(2);
    return (
      <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-xl">
        <p className="font-bold text-sky-400">{data.name}</p>
        <p className="text-sm text-slate-300">Size: {sizeKB} KB</p>
      </div>
    );
  }
  return null;
};

// Custom content for the Treemap cells
const renderContent = (props: any) => {
  const { x, y, width, height, name, value, payload } = props;
  
  // Debug log: uncomment this to see what Recharts sends
  // console.log("Treemap Cell:", { name, value, payload, width, height });

  // Fallback: if payload is missing, try to use name/value directly
  const displayName = payload?.name || name;
  const displaySize = payload?.size || value;

  if (!displayName || displaySize === undefined) return null;
  
  const sizeKB = (displaySize / 1024).toFixed(1);
  
  // Lowered the threshold so small blocks still show up
  if (width < 40 || height < 20) return null;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill="rgba(56, 189, 248, 0.2)" // Slightly more opaque
        stroke="#38bdf8"
        strokeWidth={1}
        rx={4}
      />
      <text
        x={x + width / 2}
        y={y + height / 2}
        textAnchor="middle"
        fill="#e2e8f0"
        fontSize={width > 100 ? 12 : 10}
        fontWeight="bold"
      >
        {displayName.length > 15 ? displayName.substring(0, 12) + "..." : displayName}
      </text>
      <text
        x={x + width / 2}
        y={y + height / 2 + 14}
        textAnchor="middle"
        fill="#94a3b8"
        fontSize={9}
      >
        {sizeKB} KB
      </text>
    </g>
  );
};

export default function MemoryTreemap({ data }: { data: any[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <h2 className="text-xl font-semibold mb-4">🗺️ Memory TreeMap</h2>
        <div className="h-96 flex items-center justify-center text-slate-500">
          <p>No memory data available for visualization</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <h2 className="text-xl font-semibold mb-4">🗺️ Memory TreeMap</h2>
      <div className="h-96 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={data}
            dataKey="size"
            aspectRatio={4 / 3}
            stroke="#fff"
            content={renderContent}
          >
            <Tooltip content={<CustomTooltip />} />
          </Treemap>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-slate-500 mt-2 text-center">
        Hover over blocks to see exact sizes.
      </p>
    </div>
  );
}