import { useRef, useState, DragEvent } from "react";

export default function Uploader({
  onUpload,
  loading,
}: {
  onUpload: (f: File) => void;
  loading: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const file = e.dataTransfer.files[0];
    if (file) onUpload(file);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer border-2 border-dashed rounded-xl p-12 text-center transition
        ${drag ? "border-sky-400 bg-sky-400/10" : "border-slate-700 hover:border-slate-500"}`}
    >
      <input
        ref={inputRef}
        type="file"
        hidden
        accept=".elf,.o,.out,.axf"
        onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
      />
      <div className="text-5xl mb-3">📦</div>
      <p className="text-lg font-medium">
        {loading ? "Parsing firmware..." : "Drop your .elf file here, or click to browse"}
      </p>
      <p className="text-sm text-slate-500 mt-2">Supports ELF, AXF, .o, .out</p>
    </div>
  );
}