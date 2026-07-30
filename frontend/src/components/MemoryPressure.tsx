import type { ParseResult } from "../App";
import type { Device } from "../utils/devices";
import { colRegions, fmt, inRegion } from "../utils/devices";

type Space = "FLASH" | "RAM";
const tone = (ratio: number) => ratio >= .85 ? "#e0566b" : ratio >= .65 ? "#f0a830" : "var(--a)";

function Pressure({ title, result, device, mode }: { title: Space; result: ParseResult; device: Device; mode: "flash" | "ram" }) {
  const regions = colRegions(device, mode);
  const capacity = regions.reduce((total, region) => total + region.size, 0);
  const sections = result.sections.filter(section => section.size > 0 && regions.some(region => inRegion(region, section.addr)));
  const used = sections.reduce((total, section) => total + section.size, 0);
  const ratio = capacity ? used / capacity : 0;
  const top = [...sections].sort((a, b) => b.size - a.size).slice(0, 4);
  const max = top[0]?.size || 1;

  return <div className="border ln rounded-[3px] p-3">
    <div className="flex justify-between items-center mono text-[11px] mb-3"><span className="fg tracking-[.12em]">{title} PRESSURE</span><span style={{ color: tone(ratio) }}>{capacity ? `${(ratio * 100).toFixed(1)}%` : "N/A"}</span></div>
    <div className="h-3 rounded-[2px] overflow-hidden mb-3" style={{ background: "rgba(255,255,255,.05)" }}>
      <div className="h-full transition-all duration-700" style={{ width: `${Math.min(100, ratio * 100)}%`, background: tone(ratio), boxShadow: `0 0 12px ${tone(ratio)}` }} />
    </div>
    <div className="flex justify-between mono text-[10px] mut mb-3"><span>{fmt(used)} used</span><span>{capacity ? `${fmt(Math.max(0, capacity - used))} free` : "virtual region"}</span></div>
    <div className="space-y-2">
      {top.length ? top.map(section => <div key={section.name} title={`${section.name}: ${fmt(section.size)}`}>
        <div className="flex justify-between mono text-[10px] mb-1"><span className="fg">{section.name}</span><span className="mut">{fmt(section.size)}</span></div>
        <div className="h-1 rounded overflow-hidden" style={{ background: "rgba(255,255,255,.04)" }}><div className="h-full" style={{ width: `${(section.size / max) * 100}%`, background: tone(section.size / Math.max(capacity || section.size, 1)) }} /></div>
      </div>) : <div className="mono text-[10px] mut">no mapped sections</div>}
    </div>
  </div>;
}

export default function MemoryPressure({ result, device }: { result: ParseResult; device: Device }) {
  return <div className="panel">
    <div className="panel-head"><span>Memory Pressure Map</span><span className="tag">capacity-aware · hotspots first</span></div>
    <div className="p-4 grid md:grid-cols-2 gap-4"><Pressure title="FLASH" result={result} device={device} mode="flash" /><Pressure title="RAM" result={result} device={device} mode="ram" /></div>
  </div>;
}
