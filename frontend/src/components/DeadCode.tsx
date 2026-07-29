type DC = { items: { name: string; size: number; section: string }[]; reclaimable: number; referenced_count: number };
export default function DeadCode({ data }: { data?: DC }) {
  const items = data?.items || [];
  const reclaim = data?.reclaimable || 0;
  return (
    <div className="panel">
      <div className="panel-head">
        <span>Dead Code · unreferenced .text</span>
        <span className="tag">{items.length} candidates · {(reclaim / 1024).toFixed(2)} KB reclaimable</span>
      </div>
      <div className="p-3">
        <div className="mono text-[10px] mut leading-relaxed px-1 pb-3 border-b ln mb-2">
          heuristic — a function is flagged only when it has no relocation reference, no call-graph edge, is not an entry/root, and matches no ISR/runtime keep-list. Confirm with <span className="acc">-ffunction-sections -Wl,--gc-sections</span> and a link map.
        </div>
        {items.length === 0 ? (
          <div className="text-center mut mono text-[12px] py-10">no unreferenced .text functions — clean build, or symbols stripped</div>
        ) : (
          <div className="space-y-0.5">
            {items.map((s, i) => (
              <div className="cons-row" key={i}>
                <span className="nm" title={s.name}>{s.name}</span>
                <span className="flex-1" />
                <span className="tagpill mut">no refs</span>
                <span className="sz acc2">{s.size} B</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
