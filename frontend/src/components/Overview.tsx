import type { ParseResult } from "../App";
import type { Device } from "../utils/devices";
import { usedIn, fmt } from "../utils/devices";
import FirmwareHealth from "./FirmwareHealth";
import MemoryPressure from "./MemoryPressure";
function heat(r: number) { return r > 0.6 ? "#e0566b" : r > 0.32 ? "#f0a830" : r > 0.15 ? "#e0c84a" : "var(--a)"; }
function Gauge({ label, used, cap, color }: { label: string; used: number; cap: number; color: string }) {
  const pct = cap > 0 ? Math.min(100, (used / cap) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between mono text-[10px] mut mb-1"><span className="uppercase tracking-[.14em]">{label}</span><span className="fg">{fmt(used)} / {fmt(cap)} · <span style={{ color }}>{pct.toFixed(1)}%</span></span></div>
      <div className="h-2.5 rounded-[2px]" style={{ background: "rgba(255,255,255,.04)" }}><div className="h-full rounded-[2px] transition-all duration-700" style={{ width: `${pct}%`, background: color }} /></div>
    </div>
  );
}
export default function Overview({ result, device }: { result: ParseResult; device: Device }) {
  const fallbackF = (result.summary[".text"] || 0) + (result.summary[".rodata"] || 0);
  const fallbackR = (result.summary[".data"] || 0) + (result.summary[".bss"] || 0);
  const inRegF = usedIn(device, result.sections, ["flash", "xip"]);
  const inRegR = usedIn(device, result.sections, ["ram", "ccm"]);
  const usedF = inRegF > 0 ? inRegF : fallbackF;
  const usedR = inRegR > 0 ? inRegR : fallbackR;

  const capF = device.regions.filter(r => r.kind === "flash" || r.kind === "xip").reduce((a, r) => a + r.size, 0) || device.flashSize || (usedF > 0 ? usedF : 1);
  const capR = device.regions.filter(r => r.kind === "ram" || r.kind === "ccm").reduce((a, r) => a + r.size, 0) || device.sramSize || (usedR > 0 ? usedR : 1);

  const top = [...(result.symbols || [])].filter(x => x && x.size > 0).sort((a, b) => b.size - a.size).slice(0, 10);
  const max = top[0]?.size || 1;
  const Spec = ({ k, v, c }: { k: string; v: string; c?: string }) => (<div className="row"><span className="k">{k}</span><span className={`v ${c || ""}`}>{v}</span></div>);
  const isMCU = device.mcu !== false;
  return (
    <div className="space-y-5">
      <div className="grid lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 panel">
        <div className="panel-head"><span>Firmware Overview</span><span className="tag">{result.filename}</span></div>
        <div className="p-4">
          <div className="spec">
            <Spec k="Binary" v={result.filename} />
            <Spec k="Target Device" v={device.name} c="a" />
            <Spec k="Vendor" v={device.vendor || "—"} />
            <Spec k="Core / FPU" v={`${device.core || result.arch} · ${device.fpu || "—"}`} c="a" />
            <Spec k="Architecture" v={result.arch} c="a" />
            <Spec k="ELF Class" v={`${result.elf_class || "—"}-bit`} />
            <Spec k="Entry Address" v={result.entry} c="a" />
            <Spec k="Toolchain" v={result.toolchain || "—"} />
            <Spec k="CRC-32" v={`0x${result.checksum || "—"}`} c="b" />
            <Spec k="Sections / Symbols" v={`${result.num_sections ?? result.sections.length} / ${result.num_symbols ?? result.symbols.length}`} />
            <Spec k="File Size" v={`${((result.file_size || 0) / 1024).toFixed(2)} KB`} />
            <Spec k="Largest Symbol" v={`${result.largest?.name || "—"} · ${((result.largest?.size || 0) / 1024).toFixed(2)} KB`} c="b" />
          </div>
          <div className="grid sm:grid-cols-2 gap-4 mt-4">
            <Gauge label={isMCU ? "flash utilization" : "code (.text / .rodata)"} used={usedF} cap={capF} color="var(--a)" />
            <Gauge label={isMCU ? "ram utilization" : "data (.data / .bss)"} used={usedR} cap={capR} color="var(--b)" />
          </div>
        </div>
      </div>
      <div className="panel">
        <div className="panel-head"><span>Largest Consumers</span><span className="tag">top 10</span></div>
        <div className="p-3">
          {top.length === 0 && <div className="mut mono text-[12px] py-6 text-center">no sized symbols</div>}
          {top.map((x, i) => (
            <div className="cons-row" key={i}><span className="nm" title={x.name}>{x.name}</span><span className="bar"><i style={{ width: `${(x.size / max) * 100}%`, background: heat(x.size / max) }} /></span><span className="sz">{x.size} B</span></div>
          ))}
        </div>
      </div>
      </div>
      <div className="grid lg:grid-cols-2 gap-5"><FirmwareHealth result={result} device={device} /><MemoryPressure result={result} device={device} /></div>
      <div className="mono text-[10px] mut px-1">target identity: {device.detection || "manual selection / device database"}. Confirm it in Settings before treating capacity as a hardware constraint.</div>
    </div>
  );
}
