import type { ParseResult } from "../App";
const ALL = ["GPIO", "USART", "UART", "SPI", "I2C", "ADC", "DAC", "DMA", "TIM", "RTC", "USB", "CAN", "FDCAN", "ETH", "SDIO", "I2S", "RNG", "AES", "QSPI", "FMC", "LTDC", "SAI"];
export default function Peripherals({ result }: { result: ParseResult }) {
  const map = Object.fromEntries((result.peripherals || []).map(p => [p.token, p.count]));
  const used = ALL.filter(t => map[t]); const idle = ALL.filter(t => !map[t]);
  const max = Math.max(1, ...used.map(t => map[t]));
  return (
    <div className="panel">
      <div className="panel-head"><span>Peripheral Usage</span><span className="tag">auto-detected from symbols · {used.length} active</span></div>
      <div className="p-4">
        <div className="perigrid">
          {ALL.map(t => { const c = map[t] || 0; const on = c > 0; return (
            <div key={t} className={`peritile ${on ? "on" : ""}`} style={on ? { ["--h" as any]: `${(c / max) * 100}%` } : undefined}>
              <span className="pt">{t}</span><span className="pc">{on ? c : "—"}</span>
              {on && <i className="pbar" />}
            </div>); })}
        </div>
        {idle.length > 0 && <div className="mut mono text-[10px] mt-3">not referenced: {idle.join(", ")}</div>}
        <div className="mut mono text-[10px] mt-2 leading-relaxed">detection is name-based (HAL_/LL_ driver symbols + section names). a peripheral driven only by raw register writes without driver symbols won't appear here.</div>
      </div>
    </div>
  );
}
