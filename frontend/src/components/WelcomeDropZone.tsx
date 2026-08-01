import { useState, useRef } from "react";
import { getApiBaseUrl } from "../apiConfig";
import type { ParseResult } from "../App";

type Props = {
  onFileParsed: (result: ParseResult) => void;
};

export default function WelcomeDropZone({ onFileParsed }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const uploadFile = async (file: File) => {
    setLoading(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const apiBase = getApiBaseUrl();
      let res = await fetch(`${apiBase}/api/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        res = await fetch(`${apiBase}/api/parse`, {
          method: "POST",
          body: formData,
        });
      }

      if (!res.ok) {
        throw new Error(`Upload failed with status ${res.status}`);
      }

      const data: ParseResult = await res.json();
      onFileParsed(data);
    } catch (err: any) {
      setError(err.message || "Failed to parse binary file");
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadFile(e.dataTransfer.files[0]);
    }
  };



  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#05080c] text-white p-6 font-sans select-none">
      <div className="max-w-3xl w-full flex flex-col items-center text-center space-y-6">
        
        {/* IDE BRANDING HEADER */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--a-dim)] text-[var(--a)] border border-[var(--a-dim)] text-xs font-mono font-bold uppercase tracking-wider">
            <span>⚡ Professional Embedded Firmware IDE</span>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight font-mono text-white">
            Firmware Insight Studio
          </h1>
          <p className="text-gray-400 text-sm max-w-xl font-mono">
            Static ELF introspection, DWARF source reconstruction, ARM disassembly, and live GDB debugging in a unified workbench.
          </p>
        </div>

        {/* DRAG & DROP TARGET ZONE */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`w-full p-10 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-4 ${
            dragOver
              ? "border-[var(--a)] bg-[var(--a-dim)]/20 scale-[1.01]"
              : "border-white/10 bg-[#070b10] hover:border-[var(--a)]/50 hover:bg-white/5"
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={e => e.target.files?.[0] && uploadFile(e.target.files[0])}
            accept=".elf,.axf,.out,.bin,.hex,.o,.c,.cpp,.h,.hpp,.zip"
            className="hidden"
          />

          {loading ? (
            <div className="flex flex-col items-center space-y-3">
              <div className="w-10 h-10 border-2 border-[var(--a)] border-t-transparent rounded-full animate-spin" />
              <span className="font-mono text-sm text-[var(--a)]">Parsing Binary & DWARF Metadata...</span>
            </div>
          ) : (
            <>
              <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 grid place-items-center text-3xl font-mono">
                📥
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-white font-mono">
                  Drop your microcontroller binary or project here
                </h3>
                <p className="text-xs text-gray-400 font-mono">
                  Supports ARM, RISC-V, ESP32 binaries & source (.elf, .axf, .out, .hex, .bin, .c, .cpp, .zip)
                </p>
              </div>
              <button
                type="button"
                className="px-5 py-2 rounded-lg bg-[var(--a)] text-black font-bold font-mono text-xs hover:opacity-90 transition shadow-lg"
              >
                Browse Local File
              </button>
            </>
          )}
        </div>

        {error && (
          <div className="w-full p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 font-mono text-xs text-center">
            ❌ {error}
          </div>
        )}



        {/* FEATURE BADGES */}
        <div className="grid grid-cols-4 gap-4 w-full pt-6 text-left font-mono text-xs">
          <div className="p-3 rounded-xl bg-white/5 border border-white/5">
            <span className="text-[var(--a)] font-bold block mb-1">🔍 Zero Fallbacks</span>
            <span className="text-gray-400 text-[11px]">100% generated from uploaded binary.</span>
          </div>
          <div className="p-3 rounded-xl bg-white/5 border border-white/5">
            <span className="text-cyan-400 font-bold block mb-1">📜 DWARF Source</span>
            <span className="text-gray-400 text-[11px]">Line mapping & function bounds.</span>
          </div>
          <div className="p-3 rounded-xl bg-white/5 border border-white/5">
            <span className="text-purple-400 font-bold block mb-1">⚙ ARM Disassembly</span>
            <span className="text-gray-400 text-[11px]">Machine code byte decoding.</span>
          </div>
          <div className="p-3 rounded-xl bg-white/5 border border-white/5">
            <span className="text-emerald-400 font-bold block mb-1">⚡ Live GDB Engine</span>
            <span className="text-gray-400 text-[11px]">Single-packet state synchronization.</span>
          </div>
        </div>

      </div>
    </div>
  );
}
