import { useRef, useState } from "react";
import { getApiBaseUrl } from "../apiConfig";
import type { ParseResult } from "../App";

type Props = {
  onFileParsed: (result: ParseResult) => void;
};

const acceptedTypes = ".elf,.axf,.out,.o";

const capabilities = [
  ["01", "Inspect", "Read available ELF metadata, sections, symbols, and file details."],
  ["02", "Navigate", "Follow functions and source or DWARF references when they are present."],
  ["03", "Compare", "Use the workspace to review memory maps and firmware structure."],
  ["04", "Debug-ready", "Prepare analysis locally, then connect the tools your target supports."],
];

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
      let res = await fetch(`${apiBase}/api/upload`, { method: "POST", body: formData });
      if (!res.ok) res = await fetch(`${apiBase}/api/parse`, { method: "POST", body: formData });
      if (!res.ok) throw new Error(`Upload failed with status ${res.status}`);
      onFileParsed(await res.json() as ParseResult);
    } catch (err: any) {
      setError(err.message || "Failed to parse firmware file");
    } finally {
      setLoading(false);
    }
  };

  const openFilePicker = () => !loading && fileInputRef.current?.click();
  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file && !loading) uploadFile(file);
  };

  return (
    <main className="relative isolate flex h-screen w-full overflow-hidden bg-[#05090d] px-4 py-3 text-[var(--fg)] sm:px-8 sm:py-4">
      <div aria-hidden="true" className="absolute inset-0 -z-10 opacity-70 [background-image:linear-gradient(rgba(40,67,78,.25)_1px,transparent_1px),linear-gradient(90deg,rgba(40,67,78,.25)_1px,transparent_1px)] [background-size:32px_32px]" />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_55%_45%_at_50%_42%,rgba(30,154,151,.13),transparent_72%),radial-gradient(ellipse_50%_30%_at_15%_100%,rgba(160,102,28,.08),transparent_70%)]" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 opacity-30 [background:repeating-linear-gradient(0deg,transparent_0px,transparent_3px,rgba(255,255,255,.025)_4px)]" />

      <section className="mx-auto flex h-full w-full max-w-6xl flex-col justify-between">
        <header className="flex flex-shrink-0 items-center justify-between border-y border-[var(--line)] py-2 font-mono text-[10px] uppercase tracking-[.16em] text-[var(--mut)]">
          <div className="flex items-center gap-3">
            <span className="grid h-7 w-7 place-items-center border border-[var(--a-dim)] text-sm text-[var(--a)]">⌁</span>
            <div><strong className="block font-['Chakra_Petch'] text-xs tracking-[.1em] text-[var(--fg)]">Firmware Insight Studio</strong><span className="text-[8px] tracking-[.22em]">analysis workstation</span></div>
          </div>
          <div className="hidden items-center gap-5 sm:flex"><span>Universal MCU Workbench</span><span className="flex items-center gap-2 text-[var(--a)]"><i className="h-1.5 w-1.5 rounded-full bg-[var(--a)] shadow-[0_0_8px_var(--a)]" /> Offline-ready</span></div>
        </header>

        <div className="flex flex-1 flex-col items-center justify-center py-2 min-h-0">
          <div className="mb-4 max-w-2xl text-center">
            <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[.24em] text-[var(--a)]">Firmware analysis / no vendor lock-in</p>
            <h1 className="font-['Chakra_Petch'] text-3xl font-bold leading-[.96] tracking-tight text-white sm:text-5xl">Understand any<br className="sm:hidden" /> embedded firmware.</h1>
            <p className="mx-auto mt-2.5 max-w-xl font-mono text-xs leading-relaxed text-[#94a8ba]">Open one ELF-compatible firmware or object file from the hardware you already use. The workspace detects what it can, then helps you explore it.</p>
          </div>

          <div className="relative w-full max-w-2xl">
            <span aria-hidden="true" className="absolute -left-1 -top-1 h-8 w-8 border-l-2 border-t-2 border-[var(--a)]" />
            <span aria-hidden="true" className="absolute -right-1 -top-1 h-8 w-8 border-r-2 border-t-2 border-[var(--a)]" />
            <span aria-hidden="true" className="absolute -bottom-1 -left-1 h-8 w-8 border-b-2 border-l-2 border-[var(--a)]" />
            <span aria-hidden="true" className="absolute -bottom-1 -right-1 h-8 w-8 border-b-2 border-r-2 border-[var(--a)]" />
            <div
              onDragOver={event => { event.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={openFilePicker}
              onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openFilePicker(); } }}
              role="button"
              tabIndex={loading ? -1 : 0}
              aria-label="Choose a firmware file to analyze"
              className={`relative cursor-pointer overflow-hidden border px-5 py-6 text-center outline-none transition duration-200 sm:px-8 sm:py-8 ${dragOver ? "border-[var(--a)] bg-[rgba(51,214,194,.11)] shadow-[0_0_50px_rgba(51,214,194,.12)]" : "border-[var(--line2)] bg-[#080e14]/90 hover:border-[var(--a-dim)] hover:bg-[#091218] focus-visible:border-[var(--a)] focus-visible:ring-2 focus-visible:ring-[var(--a)]/40"}`}
            >
              <div aria-hidden="true" className="absolute inset-4 opacity-40 [background-image:linear-gradient(rgba(51,214,194,.11)_1px,transparent_1px),linear-gradient(90deg,rgba(51,214,194,.11)_1px,transparent_1px)] [background-size:18px_18px]" />
              <input ref={fileInputRef} type="file" accept={acceptedTypes} onChange={event => event.target.files?.[0] && uploadFile(event.target.files[0])} className="hidden" />
              {loading ? (
                <div className="relative flex flex-col items-center gap-3"><i className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--a)] border-t-transparent" /><span className="font-mono text-xs uppercase tracking-[.16em] text-[var(--a)]">Reading firmware workspace…</span></div>
              ) : (
                <div className="relative flex flex-col items-center">
                  <p className="mb-3 font-mono text-[10px] uppercase tracking-[.22em] text-[var(--a)]"><span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[var(--a)]" />Awaiting input</p>
                  <div className="mb-3 grid h-12 w-12 place-items-center border border-[var(--a-dim)] bg-[#0b1d22] font-mono text-xl text-[var(--b)] shadow-[inset_0_0_24px_rgba(51,214,194,.1)]">⇣</div>
                  <h2 className="font-['Chakra_Petch'] text-xl font-semibold tracking-wide text-white sm:text-2xl">Drop an ELF firmware file here</h2>
                  <p className="mt-1 font-mono text-xs text-[#93a5b5]">Start with the build output from your toolchain.</p>
                  <button type="button" onClick={event => { event.stopPropagation(); openFilePicker(); }} className="mt-4 border border-[var(--a)] bg-[var(--a)] px-4 py-2 font-['Chakra_Petch'] text-xs font-bold uppercase tracking-[.12em] text-[#051115] transition hover:bg-[#72e8da] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--a)]">Browse local file</button>
                  <p className="mt-3 font-mono text-[10px] text-[var(--b)]">SUPPORTED: .ELF&nbsp; .AXF&nbsp; .OUT&nbsp; .O</p>
                  <p className="mt-1 font-mono text-[10px] text-[var(--mut)]">One ELF-compatible file at a time — no ZIP archives, HEX/BIN images, or project folders.</p>
                </div>
              )}
            </div>
          </div>

          {error && <div role="alert" className="mt-3 w-full max-w-2xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-center font-mono text-xs text-red-300">Analysis could not start: {error}</div>}

          <div className="mt-5 grid w-full max-w-4xl grid-cols-1 border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2 lg:grid-cols-4">
            {capabilities.map(([number, title, copy]) => <article key={title} className="group bg-[#0a1016] p-3 transition hover:bg-[#0c171d]"><span className="font-mono text-[10px] text-[var(--b)]">{number}</span><h3 className="mt-1.5 font-['Chakra_Petch'] text-sm font-semibold text-[var(--a)]">{title}</h3><p className="mt-1 font-mono text-[10px] leading-relaxed text-[#899bab]">{copy}</p></article>)}
          </div>
        </div>

        <footer className="flex-shrink-0 py-2 text-center font-mono text-[10px] text-[var(--mut)]">
          <span className="text-[var(--a)]">First time here?</span> Choose a file → the workspace detects what it can → explore your results.
        </footer>
      </section>
    </main>
  );
}
