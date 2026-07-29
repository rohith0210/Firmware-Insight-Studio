export default function Locked({ name, note, compact }: { name: string; note: string; compact?: boolean }) {
  return (
    <div className={compact ? "locked !py-8" : "panel"}>
      {!compact && <div className="panel-head"><span>{name}</span><span className="tag">roadmap</span></div>}
      <div className={compact ? "" : "locked"}>
        <div className="dots"><i /><i /><i /></div>
        <h2 className="fg">{name}</h2>
        <p className="mut mono text-[12px] max-w-md">{note}</p>
      </div>
    </div>
  );
}
