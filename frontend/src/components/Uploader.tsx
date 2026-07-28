import { useRef, useState, DragEvent } from "react";

export default function Uploader({
  onUpload, loading, loadedName = null,
}: { onUpload: (f: File) => void; loading: boolean; loadedName?: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [hot, setHot] = useState(false);
  const drop = (e: DragEvent) => { e.preventDefault(); setHot(false); const f = e.dataTransfer.files[0]; if (f) onUpload(f); };
  const linked = !!loadedName && !loading;

  return (
    <div className={`bay ${hot ? "hot" : ""} cursor-pointer px-6 py-9 text-center`}
      onDragOver={(e) => { e.preventDefault(); setHot(true); }}
      onDragLeave={() => setHot(false)} onDrop={drop} onClick={() => inputRef.current?.click()}>
      <span className="corner c1" /><span className="corner c2" /><span className="corner c3" /><span className="corner c4" />
      <input ref={inputRef} type="file" hidden accept=".elf,.o,.out,.axf,.bin"
        onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
      <div className="flex items-center justify-center gap-2 mono text-[11px] uppercase tracking-[.2em]">
        <span className={`dot ${loading ? "busy" : ""}`} />
        <span className={loading ? "acc2" : hot ? "acc" : linked ? "acc" : "mut"}>
          {loading ? "parsing binary" : hot ? "link established" : linked ? "binary linked" : "awaiting binary"}
        </span>
      </div>
      {linked ? (
        <p className="font-display text-lg fg mt-3 tracking-wide">
          {loadedName} <span className="mut text-[12px]">// drop to replace</span>
        </p>
      ) : (
        <p className="font-display text-lg fg mt-3 tracking-wide">DROP .elf INTO THE SOCKET</p>
      )}
      <div className="flex items-center justify-center gap-2 mt-3 mono text-[10px] mut">
        {[".ELF", ".AXF", ".O", ".OUT", ".BIN"].map(t => (
          <span key={t} className="px-2 py-0.5 border ln rounded-[2px]">{t}</span>
        ))}
      </div>
    </div>
  );
}
