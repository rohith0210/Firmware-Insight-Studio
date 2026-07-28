import { useState } from "react";
import Uploader from "./components/Uploader";
import Dashboard from "./components/Dashboard";
import MemoryTreemap from "./components/MemoryTreemap";
import SectionTable from "./components/SectionTable";
import SymbolExplorer from "./components/SymbolExplorer";
import CallGraph from "./components/CallGraph";

export type ParseResult = {
  filename: string; arch: string; entry: string;
  sections: { name: string; type: string; addr: number; size: number; flags: number }[];
  symbols: { name: string; value: number; size: number; type: string; bind: string; section: string }[];
  summary: Record<string, number>;
  treemap_data: { name: string; size: number; children: { name: string; size: number }[] }[];
  call_graph: {
    nodes: Array<{ id: string; label: string; x: number; y: number; kind: string }>;
    edges: Array<{ source: string; target: string; animated?: boolean }>;
    mode?: string;
  };
};

const Chip = () => (
  <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.4" className="acc">
    <rect x="6" y="6" width="12" height="12" rx="1.5" />
    <rect x="9.5" y="9.5" width="5" height="5" rx=".5" opacity=".6" />
    <path d="M9 6V3 M12 6V3 M15 6V3 M9 18v3 M12 18v3 M15 18v3 M6 9H3 M6 12H3 M6 15H3 M18 9h3 M18 12h3 M18 15h3" />
  </svg>
);

export default function App() {
  const [result, setResult] = useState<ParseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);

  const handleUpload = async (file: File) => {
    setLoading(true); setError(null); setSelectedSection(null);
    try {
      const form = new FormData(); form.append("file", file);
      const res = await fetch("http://localhost:8000/api/upload", { method: "POST", body: form });
      if (!res.ok) throw new Error((await res.json()).detail || "Upload failed");
      setResult(await res.json());
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const download = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  };
  const exportJSON = () => result && download(new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }), `${result.filename}_analysis.json`);
  const exportCSV = () => {
    if (!result) return;
    const rows = [["Name", "Section", "Address", "SizeBytes", "Type"],
      ...result.symbols.map(s => [s.name, s.section, "0x" + s.value.toString(16), String(s.size), s.type])];
    download(new Blob([rows.map(r => r.join(",")).join("\n")], { type: "text/csv" }), `${result.filename}_symbols.csv`);
  };

  const filteredSymbols = selectedSection
    ? result?.symbols.filter(s => s.section === selectedSection) || []
    : result?.symbols || [];
  const secNames = (result?.sections || []).filter(s => s.size > 0).map(s => s.name);

  return (
    <>
      <div className="app-bg" />
      <div className="scanline" />
      <div className="content max-w-6xl mx-auto px-5 py-7">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Chip />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-3xl font-bold tracking-tight fg">FIRMWARE INSIGHT<span className="acc">_</span></h1>
                <span className="flex items-center gap-1.5 mono text-[10px] mut uppercase tracking-widest">
                  <span className={`dot ${loading ? "busy" : ""}`} />{loading ? "analyzing" : "ready"}
                </span>
              </div>
              <p className="mono text-[11px] mut uppercase tracking-[.18em] mt-0.5">ELF // memory analyzer · v1.0</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {result && (
              <div className="mono text-[11px] mut hidden md:flex items-center gap-3 px-3 py-2 border ln rounded-[3px] bg-black/30">
                <span className="fg">{result.filename}</span><span className="acc">{result.arch}</span><span>{result.symbols.length} sym</span>
              </div>
            )}
            {result && <button onClick={exportCSV} className="btn-hw">CSV</button>}
            {result && <button onClick={exportJSON} className="btn-hw primary">Export JSON</button>}
          </div>
        </header>

        {result && secNames.length > 0 && (
          <div className="ticker mt-4"><div className="ticker-track">{[...secNames, ...secNames].map((n, i) => <span key={i}><b>//</b>{n}</span>)}</div></div>
        )}

        <div className="mt-5"><Uploader onUpload={handleUpload} loading={loading} loadedName={result?.filename ?? null} /></div>

        {error && <div className="mt-4 p-3 border rounded-[3px] mono text-[12px]" style={{ borderColor: "var(--danger)", color: "var(--danger)", background: "rgba(224,86,107,.08)" }}>ERR // {error}</div>}

        {result && (
          <div className="mt-6 space-y-5 reveal">
            <Dashboard result={result} />
            {result.treemap_data && result.treemap_data.length > 0 && <MemoryTreemap data={result.treemap_data} />}
            {result.call_graph && result.call_graph.nodes.length > 0 && <CallGraph data={result.call_graph} />}
            <SectionTable sections={result.sections} onSectionClick={setSelectedSection} selectedSection={selectedSection} />
            <SymbolExplorer symbols={filteredSymbols} title={selectedSection ? `Symbols // ${selectedSection}` : "Symbol Explorer"} />
          </div>
        )}
      </div>
    </>
  );
}
