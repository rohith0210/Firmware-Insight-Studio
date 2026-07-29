import type { ParseResult } from "../App";
export default function IsrAnalyzer({ result }: { result: ParseResult }) {
  const isrs = result.isrs || [];
  return (
    <div className="panel">
      <div className="panel-head"><span>ISR Analyzer</span><span className="tag">{isrs.length} handlers · vector index for Cortex-M</span></div>
      <div className="p-3">
        {isrs.length === 0 ? <div className="mut mono text-[12px] py-8 text-center">no interrupt handlers matched (no *IRQHandler / *_Handler symbols)</div> : (
          <table className="w-full mono text-[12px]">
            <thead><tr className="text-left mut border-b ln"><th className="pb-2 font-medium w-16">VEC#</th><th className="pb-2 font-medium">HANDLER</th><th className="pb-2 font-medium">SECTION</th><th className="pb-2 font-medium">SIZE</th><th className="pb-2 font-medium">PRIORITY</th></tr></thead>
            <tbody>{isrs.map((s, i) => (
              <tr key={i} className="sym-row border-b ln">
                <td className="py-1.5 acc2">{s.vector >= 0 ? s.vector : "ext"}</td>
                <td className="py-1.5 acc">{s.name}</td>
                <td className="py-1.5 fg">{s.section}</td>
                <td className="py-1.5 fg">{s.size} B</td>
                <td className="py-1.5 mut">{s.vector >= 0 && s.vector < 16 ? "system" : s.vector >= 16 ? `IRQ ${s.vector - 16}` : "external"}</td>
              </tr>))}</tbody>
          </table>
        )}
        <div className="mut mono text-[10px] mt-3 leading-relaxed">vector numbers follow the ARMv7-M exception table (system 0–15, external 16+). priority column is the table position, not the NVIC priority register — read that from a live target.</div>
      </div>
    </div>
  );
}
