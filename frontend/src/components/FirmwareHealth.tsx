import type { ParseResult } from "../App";
import type { Device } from "../utils/devices";
import { colRegions, inRegion } from "../utils/devices";

export type HealthFinding = { label: string; detail: string; status: "good" | "warn"; points: number };

export function assessFirmware(result: ParseResult, device: Device): { score: number; findings: HealthFinding[] } {
  const usage = (kind: "flash" | "ram") => {
    const regions = colRegions(device, kind); const capacity = regions.reduce((sum, region) => sum + region.size, 0);
    const used = result.sections.filter(s => s.size > 0 && regions.some(r => inRegion(r, s.addr))).reduce((sum, s) => sum + s.size, 0);
    return capacity ? used / capacity : 0;
  };
  const flash = usage("flash"), ram = usage("ram"), symbols = result.symbols || [], config = result.build_config || {};
  const findings: HealthFinding[] = [
    { label: "Flash headroom", detail: `${Math.max(0, 100 - flash * 100).toFixed(0)}% remaining`, status: flash < .8 ? "good" : "warn", points: flash < .8 ? 0 : flash < .92 ? -5 : -12 },
    { label: "RAM headroom", detail: `${Math.max(0, 100 - ram * 100).toFixed(0)}% remaining`, status: ram < .75 ? "good" : "warn", points: ram < .75 ? 0 : ram < .9 ? -6 : -14 },
  ];
  const printf = symbols.filter(s => /\b(printf|sprintf|vsprintf|snprintf|vprintf|fprintf)\b/i.test(s.name));
  findings.push(printf.length ? { label: "Large logging runtime", detail: `${printf.length} printf-family symbols linked`, status: "warn", points: -4 } : { label: "Logging footprint", detail: "no printf-family symbols found", status: "good", points: 0 });
  const dead = result.dead_code?.reclaimable || 0;
  findings.push(dead ? { label: "Dead-code opportunity", detail: `${dead} B appears reclaimable`, status: "warn", points: -5 } : { label: "Symbol reachability", detail: "no obvious unused functions", status: "good", points: 0 });
  const lto = (config.opt_hints || []).some((hint: string) => /LTO/i.test(hint));
  findings.push(lto ? { label: "Link-time optimization", detail: "LTO evidence found", status: "good", points: 0 } : { label: "Link-time optimization", detail: "not detected", status: "warn", points: -3 });
  return { score: Math.max(0, Math.min(100, 100 + findings.reduce((sum, item) => sum + item.points, 0))), findings };
}

export default function FirmwareHealth({ result, device }: { result: ParseResult; device: Device }) {
  const { score, findings } = assessFirmware(result, device);
  return <div className="panel">
    <div className="panel-head"><span>Firmware Health</span><span className="tag">evidence-based</span></div>
    <div className="p-4 flex gap-5 items-start">
      <div className="shrink-0 w-[86px] h-[86px] rounded-full border-4 flex flex-col items-center justify-center" style={{ borderColor: score >= 85 ? "var(--a)" : score >= 70 ? "var(--b)" : "var(--danger)", boxShadow: "0 0 18px rgba(51,214,194,.12)" }}><b className="text-2xl fg leading-none">{score}</b><span className="mono text-[9px] mut mt-1">/ 100</span></div>
      <div className="space-y-2 flex-1 pt-1">
        {findings.map(item => <div className="flex gap-2 mono text-[10px]" key={item.label}><span style={{ color: item.status === "good" ? "var(--a)" : "var(--b)" }}>{item.status === "good" ? "✓" : "⚠"}</span><span className="fg">{item.label}</span><span className="mut">· {item.detail}</span></div>)}
      </div>
    </div>
  </div>;
}
