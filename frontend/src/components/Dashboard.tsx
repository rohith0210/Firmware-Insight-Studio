import type { ParseResult } from "../App";

export default function Dashboard({ result }: { result: ParseResult }) {
  const { summary, arch, entry, filename } = result;
  const flash = (summary[".text"] || 0) + (summary[".rodata"] || 0);
  const ram = (summary[".data"] || 0) + (summary[".bss"] || 0);

  const cards = [
    { label: "Architecture", value: arch, accent: "sky" },
    { label: "Entry Point", value: entry, accent: "indigo" },
    { label: "FLASH (text+rodata)", value: `${(flash / 1024).toFixed(2)} KB`, accent: "emerald" },
    { label: "RAM (data+bss)", value: `${(ram / 1024).toFixed(2)} KB`, accent: "amber" },
  ];

  return (
    <div>
      <h2 className="text-xl font-semibold mb-3">📊 {filename}</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className={`bg-slate-900 border border-slate-800 rounded-xl p-4`}>
            <div className="text-xs text-slate-400 uppercase tracking-wide">{c.label}</div>
            <div className={`text-2xl font-bold mt-1 text-${c.accent}-400`}>{c.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}