import { useEffect, useState } from "react";
import type { ParseResult } from "../App";
import type { Device, Region } from "../utils/devices";
import { colRegions, inRegion, fmt } from "../utils/devices";

function Column({ title, regions, secs, mounted }: { title: string; regions: Region[]; secs: any[]; mounted: boolean }) {
  const cap = regions.reduce((a, r) => a + r.size, 0);
  const used = regions.reduce((a, rg) => a + secs.filter(s => s.size > 0 && inRegion(rg, s.addr)).reduce((x, s) => x + s.size, 0), 0);
  const noFree = regions.every(r => r.kind === "virt");
  const free = noFree ? 0 : Math.max(0, cap - used);
  const base = regions[0]?.base ?? 0;
  const util = cap > 0 ? (used / cap) * 100 : 0;
  const rows = [...regions.filter(rg => secs.some(s => s.size > 0 && inRegion(rg, s.addr))).map(rg => ({
    name: rg.name, color: rg.color, size: secs.filter(s => s.size > 0 && inRegion(rg, s.addr)).reduce((x, s) => x + s.size, 0), free: false,
  })), ...(free > 0 ? [{ name: "FREE", color: "", size: free, free: true }] : [])];
  const denom = used + free || 1;
  return (
    <div className="mmcol">
      <div className="mmhead"><span>{title} <span className="acc" style={{ fontSize: 10, marginLeft: 6 }}>{noFree ? "—" : util.toFixed(1) + "%"}</span></span><span className="base">0x{base.toString(16)} · {fmt(cap)}</span></div>
      <div className="mmbar">
        {rows.map((row, i) => (
          <div key={i} className={`mmseg ${row.free ? "free" : ""}`} title={`${row.name} · ${(row.size / 1024).toFixed(2)} KB`} style={{ height: mounted ? `${(row.size / denom) * 100}%` : "0%", background: row.free ? undefined : row.color }}>
            {(row.size / denom) * 100 > 6 && <><span className="n">{row.name}</span><span className="s">{(row.size / 1024).toFixed(1)} KB</span></>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MemoryMap({ result, device }: { result: ParseResult; device: Device }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 70); return () => clearTimeout(t); }, [device.id]);
  const flash = colRegions(device, "flash"), ram = colRegions(device, "ram");
  return (
    <div className="panel">
      <div className="panel-head"><span>Memory Map</span><span className="flex items-center gap-3"><span className="tag acc">{device.name}</span><span className="flex items-center gap-1.5 mono text-[10px] mut"><span style={{ width: 9, height: 9, background: "var(--a)", display: "inline-block" }} />code</span><span className="flex items-center gap-1.5 mono text-[10px] mut"><span style={{ width: 9, height: 9, background: "var(--b)", display: "inline-block" }} />data</span></span></div>
      <div className="p-4">
        {flash.length + ram.length === 0 ? <div className="mut mono text-[12px] py-10 text-center">no code/data regions for this device</div>
          : <div className="memmap"><Column title="FLASH" regions={flash} secs={result.sections} mounted={mounted} /><Column title="RAM" regions={ram} secs={result.sections} mounted={mounted} /></div>}
        {!device.mcu && <div className="mut mono text-[10px] mt-3">host binary — virtual segments, no fixed on-chip capacity; utilization shown as N/A.</div>}
      </div>
    </div>
  );
}
