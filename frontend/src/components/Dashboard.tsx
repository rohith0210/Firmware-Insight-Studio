import { useEffect, useRef, useState } from "react";
import type { ParseResult } from "../App";

function CountUp({ value, decimals = 2 }: { value: number; decimals?: number }) {
  const [n, setN] = useState(0); const ref = useRef<number>(0);
  useEffect(() => {
    const start = performance.now(), dur = 900;
    const tick = (t: number) => { const p = Math.min(1, (t - start) / dur); setN(value * (1 - Math.pow(1 - p, 3))); if (p < 1) ref.current = requestAnimationFrame(tick); };
    ref.current = requestAnimationFrame(tick); return () => cancelAnimationFrame(ref.current);
  }, [value]);
  return <>{n.toFixed(decimals)}</>;
}

export default function Dashboard({ result }: { result: ParseResult }) {
  const s = result.summary || {};
  const text = s[".text"] || 0, rodata = s[".rodata"] || 0, data = s[".data"] || 0, bss = s[".bss"] || 0;
  const flash = text + rodata, ram = data + bss, total = flash + ram || 1;
  const segs = [
    { label: ".text", v: text, c: "var(--a)" }, { label: ".rodata", v: rodata, c: "var(--a-dim)" },
    { label: ".data", v: data, c: "var(--b)" }, { label: ".bss", v: bss, c: "var(--b-dim)" },
  ];
  const Readout = ({ idx, label, children, accent }: any) => (
    <div className="panel p-3" style={{ borderLeft: `2px solid ${accent}` }}>
      <div className="flex items-center justify-between">
        <span className="mono text-[10px] mut uppercase tracking-[.14em]">{label}</span>
        <span className="mono text-[10px]" style={{ color: accent }}>{idx}</span>
      </div>
      <div className="mono text-3xl font-bold fg mt-1 leading-none">{children}</div>
    </div>
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Readout idx="01" label="Architecture" accent="var(--a)"><span className="text-2xl">{result.arch}</span></Readout>
        <Readout idx="02" label="Entry Point" accent="var(--a)"><span className="text-xl acc">{result.entry}</span></Readout>
        <Readout idx="03" label="Flash · code+ro" accent="var(--a)"><CountUp value={flash / 1024} /> <span className="text-sm mut">KB</span></Readout>
        <Readout idx="04" label="Ram · data+bss" accent="var(--b)"><CountUp value={ram / 1024} /> <span className="text-sm mut">KB</span></Readout>
      </div>
      <div className="panel">
        <div className="panel-head"><span>Memory Distribution</span><span className="tag">{total} bytes mapped</span></div>
        <div className="p-4">
          <div className="flex h-7 rounded-[2px] overflow-hidden border ln">
            {segs.map(g => g.v > 0 && <div key={g.label} title={`${g.label} · ${(g.v / 1024).toFixed(2)} KB`} style={{ width: `${(g.v / total) * 100}%`, background: g.c, borderRight: "1px solid rgba(0,0,0,.4)" }} />)}
          </div>
          <div className="flex flex-wrap gap-4 mt-3 mono text-[11px] mut">
            {segs.map(g => <span key={g.label} className="flex items-center gap-1.5"><span style={{ width: 9, height: 9, background: g.c, display: "inline-block" }} />{g.label} <span className="fg">{((g.v / total) * 100).toFixed(1)}%</span></span>)}
          </div>
        </div>
      </div>
    </div>
  );
}
