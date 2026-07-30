import { useRef, useState, type DragEvent } from "react";
export default function Uploader({ onUpload, loading }: { onUpload: (f: File) => void; loading: boolean }) {
  const ref = useRef<HTMLInputElement>(null); const [hot, setHot] = useState(false);
  const drop = (e: DragEvent) => { e.preventDefault(); setHot(false); const f = e.dataTransfer.files[0]; if (f) onUpload(f); };
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className={`bay ${hot ? "hot" : ""} cursor-pointer px-8 py-14 text-center w-full max-w-2xl`} onDragOver={e => { e.preventDefault(); setHot(true); }} onDragLeave={() => setHot(false)} onDrop={drop} onClick={() => ref.current?.click()}>
        <span className="corner c1" /><span className="corner c2" /><span className="corner c3" /><span className="corner c4" />
        <input ref={ref} type="file" hidden accept=".elf,.o,.out,.axf,.bin" onChange={e => e.target.files?.[0] && onUpload(e.target.files[0])} />
        <div className="flex items-center justify-center gap-2 mono text-[11px] uppercase tracking-[.2em]"><span className={`dot ${loading ? "busy" : ""}`} /><span className={loading ? "acc2" : hot ? "acc" : "mut"}>{loading ? "parsing binary" : hot ? "link established" : "awaiting binary"}</span></div>
        <p className="font-display text-2xl fg mt-4 tracking-wide">DROP .elf INTO THE SOCKET</p>
        <p className="mut text-sm mt-2">Open a firmware image to boot the workbench</p>
        <div className="flex items-center justify-center gap-2 mt-4 mono text-[10px] mut">{[".ELF", ".AXF", ".O", ".OUT", ".BIN"].map(t => <span key={t} className="px-2 py-0.5 border ln rounded-[2px]">{t}</span>)}</div>
      </div>
    </div>
  );
}
