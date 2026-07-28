export default function SectionTable({
  sections,
  onSectionClick,
  selectedSection,
}: {
  sections: { name: string; type: string; addr: number; size: number }[];
  onSectionClick?: (section: string | null) => void;
  selectedSection?: string | null;
}) {
  const visible = sections.filter((s) => s.size > 0);
  const maxSize = Math.max(...visible.map((s) => s.size), 1);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">📐 Sections</h2>
        {selectedSection && (
          <button
            onClick={() => onSectionClick?.(null)}
            className="text-sm text-sky-400 hover:text-sky-300 transition"
          >
            Clear filter ✕
          </button>
        )}
      </div>
      <div className="space-y-2">
        {visible.map((s) => {
          const isSelected = selectedSection === s.name;
          return (
            <div
              key={s.name}
              onClick={() => onSectionClick?.(isSelected ? null : s.name)}
              className={`flex items-center gap-3 cursor-pointer rounded-lg p-2 transition
                ${isSelected ? 'bg-sky-900/30 border border-sky-700/50' : 'hover:bg-slate-800/50 border border-transparent'}`}
            >
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
          );
        })}
      </div>
    </div>
  );
}