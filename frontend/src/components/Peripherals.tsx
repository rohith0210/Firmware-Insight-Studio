import { useMemo, useState } from "react";
import type { ParseResult } from "../App";
const ALL = ["GPIO", "USART", "UART", "SPI", "I2C", "ADC", "DAC", "DMA", "TIM", "RTC", "USB", "CAN", "FDCAN", "ETH", "SDIO", "I2S", "RNG", "AES", "QSPI", "FMC", "LTDC", "SAI"];
export default function Peripherals({ result }: { result: ParseResult }) {
  const [selected, setSelected] = useState<string | null>(null);
  const map = Object.fromEntries((result.peripherals || []).map(p => [p.token, p.count]));
  const used = ALL.filter(t => map[t]); const idle = ALL.filter(t => !map[t]);
  const max = Math.max(1, ...used.map(t => map[t]));
  const evidence = useMemo(() => selected ? result.symbols.filter(symbol => new RegExp(`(^|[_])${selected}([_0-9]|$)`, "i").test(symbol.name)).slice(0, 12) : [], [result.symbols, selected]);
  return (
    <div className="panel">
      <div className="panel-head"><span>Peripheral Usage</span><span className="tag">auto-detected from symbols · {used.length} active</span></div>
      <div className="p-4">
        <div className="perigrid">
          {ALL.map(t => { const c = map[t] || 0; const on = c > 0; return (
            <button type="button" onClick={() => on && setSelected(t)} key={t} className={`peritile text-left ${on ? "on cursor-pointer" : "cursor-default"} ${selected === t ? "ring-1 ring-[var(--a)]" : ""}`} style={on ? { ["--h" as any]: `${(c / max) * 100}%` } : undefined}>
              <span className="pt">{t}</span><span className="pc">{on ? c : "—"}</span>
              {on && <i className="pbar" />}
            </button>); })}
        </div>
        {selected && <div className="mt-4 border ln rounded-[3px] p-3"><div className="flex justify-between mono text-[11px] mb-2"><span className="acc">{selected} · symbol evidence</span><button className="mut hover:text-[var(--fg)]" onClick={() => setSelected(null)}>close</button></div>{evidence.length ? <div className="grid sm:grid-cols-2 gap-x-5 gap-y-1">{evidence.map(symbol => <div className="mono text-[10px] flex justify-between gap-2" key={`${symbol.name}-${symbol.value}`}><span className="fg truncate">{symbol.name}</span><span className="mut shrink-0">{symbol.size} B</span></div>)}</div> : <div className="mono text-[10px] mut">inferred from aggregate symbols; no directly matching named functions found.</div>}</div>}
        {idle.length > 0 && <div className="mut mono text-[10px] mt-3">not referenced: {idle.join(", ")}</div>}
        <div className="mut mono text-[10px] mt-2 leading-relaxed">detection is name-based (HAL_/LL_ driver symbols + section names). a peripheral driven only by raw register writes without driver symbols won't appear here.</div>
      </div>
    </div>
  );
}
