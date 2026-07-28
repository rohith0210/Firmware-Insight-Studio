import { useState } from "react";

type Sym = { name: string; value: number; size: number; type: string; bind: string; section: string };

export default function SymbolExplorer({ symbols, title = "Symbol Explorer" }: { symbols: Sym[]; title?: string }) {
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(50);
  const filtered = symbols.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="panel">
      <div className="panel-head"><span>{title}</span><span className="tag">{filtered.length} matches</span></div>
      <div className="p-3">
        <div className="flex items-center gap-2 border ln rounded-[3px] px-3 py-2 bg-black/30 mb-3">
          <span className="acc mono">›</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="grep symbol  e.g. main, HAL_GPIO"
            className="flex-1 bg-transparent outline-none mono text-[12px] fg placeholder:mut" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full mono text-[12px]">
            <thead>
              <tr className="text-left mut border-b ln">
                <th className="pb-2 font-medium">NAME</th><th className="pb-2 font-medium">SECTION</th>
                <th className="pb-2 font-medium">ADDRESS</th><th className="pb-2 font-medium">SIZE</th><th className="pb-2 font-medium">TYPE</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, limit).map((s, i) => (
                <tr key={i} className="sym-row border-b ln">
                  <td className="py-1.5 acc">{s.name}</td>
                  <td className="py-1.5 fg">{s.section}</td>
                  <td className="py-1.5 mut">0x{s.value.toString(16)}</td>
                  <td className="py-1.5 fg">{(s.size / 1024).toFixed(2)} KB</td>
                  <td className="py-1.5 mut">{s.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <div className="text-center mut mono text-[12px] py-8">no symbols match the query</div>}
        </div>
        {filtered.length > limit && (
          <button onClick={() => setLimit(limit + 50)} className="btn-hw mt-3">load +50 ({filtered.length - limit} left)</button>
        )}
      </div>
    </div>
  );
}
