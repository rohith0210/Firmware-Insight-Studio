export default function SectionTable({ sections, onSectionClick, selectedSection }: {
  sections: { name: string; type: string; addr: number; size: number }[];
  onSectionClick?: (s: string | null) => void; selectedSection?: string | null;
}) {
  const visible = sections.filter(s => s.size > 0);
  const max = Math.max(...visible.map(s => s.size), 1);
  return (
    <div className="panel">
      <div className="panel-head"><span>Sections</span>
        <span className="flex items-center gap-3">
          {selectedSection && <button onClick={() => onSectionClick?.(null)} className="acc2 mono text-[10px] uppercase tracking-widest hover:underline">clear ✕</button>}
          <span className="tag">{visible.length} regions</span>
        </span>
      </div>
      <div className="p-3 space-y-1">
        {visible.map(s => {
          const sel = selectedSection === s.name;
          return (
            <div key={s.name} onClick={() => onSectionClick?.(sel ? null : s.name)} className={`sec-row ${sel ? "sel" : ""} flex items-center gap-3 rounded-[3px] px-3 py-1.5 cursor-pointer`}>
              <div className="w-28 mono text-[12px] fg truncate">{s.name}</div>
              <div className="w-20 mono text-[10px] mut hidden sm:block">0x{s.addr.toString(16)}</div>
              <div className="flex-1 h-3 rounded-[2px]" style={{ background: "rgba(255,255,255,.04)" }}>
                <div className="h-full rounded-[2px]" style={{ width: `${(s.size / max) * 100}%`, background: sel ? "var(--b)" : "var(--a)" }} />
              </div>
              <div className="w-20 text-right mono text-[12px] fg">{(s.size / 1024).toFixed(2)} <span className="mut text-[10px]">KB</span></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
