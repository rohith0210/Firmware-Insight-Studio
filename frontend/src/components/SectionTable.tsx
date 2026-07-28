export default function SectionTable({
  sections,
}: {
  sections: { name: string; type: string; addr: number; size: number }[];
}) {
  const visible = sections.filter((s) => s.size > 0);
  const maxSize = Math.max(...visible.map((s) => s.size), 1); // prevent divide by zero

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <h2 className="text-xl font-semibold mb-4">📐 Sections</h2>
      <div className="space-y-2">
        {visible.map((s) => (
          <div key={s.name} className="flex items-center gap-3">
            <div className="w-32 text-sm font-mono truncate">{s.name}</div>
            <div className="flex-1 bg-slate-800 rounded-full h-5 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-sky-500 to-indigo-500"
                style={{ width: `${(s.size / maxSize) * 100}%` }}
              />
            </div>
            <div className="w-24 text-right text-sm font-mono text-slate-300">
              {(s.size / 1024).toFixed(2)} KB
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}