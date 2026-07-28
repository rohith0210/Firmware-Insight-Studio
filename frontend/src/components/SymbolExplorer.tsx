import { useState } from "react";

type Symbol = {
  name: string;
  value: number;
  size: number;
  type: string;
  bind: string;
  section: string;
};

export default function SymbolExplorer({ 
  symbols, 
  title = "Symbol Explorer" 
}: { 
  symbols: Symbol[];
  title?: string;
}) {
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(50);

  const filtered = symbols.filter((sym) =>
    sym.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <h2 className="text-xl font-semibold mb-4">🔍 {title}</h2>
      
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search symbols (e.g., main, HAL_GPIO)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-sky-500 transition"
        />
      </div>

      <div className="text-sm text-slate-400 mb-3">
        Showing {Math.min(filtered.length, limit)} of {filtered.length} symbols
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 border-b border-slate-700">
              <th className="pb-2 font-medium">Name</th>
              <th className="pb-2 font-medium">Section</th>
              <th className="pb-2 font-medium">Address</th>
              <th className="pb-2 font-medium">Size</th>
              <th className="pb-2 font-medium">Type</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, limit).map((sym, idx) => (
              <tr key={idx} className="border-b border-slate-800 hover:bg-slate-800/50 transition">
                <td className="py-2 font-mono text-sky-400">{sym.name}</td>
                <td className="py-2 text-slate-300">{sym.section}</td>
                <td className="py-2 font-mono text-slate-400">0x{sym.value.toString(16)}</td>
                <td className="py-2 text-slate-300">{(sym.size / 1024).toFixed(2)} KB</td>
                <td className="py-2 text-slate-400">{sym.type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length > limit && (
        <button
          onClick={() => setLimit(limit + 50)}
          className="mt-4 px-4 py-2 bg-sky-600 hover:bg-sky-700 rounded-lg text-white font-medium transition"
        >
          Load More ({filtered.length - limit} more)
        </button>
      )}
      
      {filtered.length === 0 && (
        <div className="text-center text-slate-500 py-8">
          No symbols found matching your search.
        </div>
      )}
    </div>
  );
}