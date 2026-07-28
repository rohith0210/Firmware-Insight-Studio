import { useState } from "react";
import Uploader from "./components/Uploader";
import Dashboard from "./components/Dashboard";
import MemoryTreemap from "./components/MemoryTreemap";
import SectionTable from "./components/SectionTable";
import SymbolExplorer from "./components/SymbolExplorer";

export type ParseResult = {
  filename: string;
  arch: string;
  entry: string;
  sections: { name: string; type: string; addr: number; size: number; flags: number }[];
  symbols: { name: string; value: number; size: number; type: string; bind: string; section: string }[];
  summary: Record<string, number>;
  treemap_data: { name: string; size: number; children: { name: string; size: number }[] }[];
};

export default function App() {
  const [result, setResult] = useState<ParseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);

  const handleUpload = async (file: File) => {
    setLoading(true);
    setError(null);
    setSelectedSection(null); // Reset filter on new upload
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("http://localhost:8000/api/upload", { method: "POST", body: form });
      if (!res.ok) throw new Error((await res.json()).detail || "Upload failed");
      
      const data = await res.json();
      console.log("📊 Full Upload result:", data);
      console.log("🗺️ TreeMap data:", data.treemap_data);
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Filter symbols by selected section
  const filteredSymbols = selectedSection
    ? result?.symbols.filter((s) => s.section === selectedSection) || []
    : result?.symbols || [];

  return (
    <div className="min-h-screen p-8 max-w-6xl mx-auto">
      <header className="mb-8">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent">
          Firmware Insight Studio
        </h1>
        <p className="text-slate-400 mt-2">Understand your firmware like never before.</p>
      </header>

      <Uploader onUpload={handleUpload} loading={loading} />

      {error && (
        <div className="mt-4 p-4 bg-red-900/40 border border-red-700 rounded-lg text-red-200">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-8 space-y-6">
          <Dashboard result={result} />
          {result.treemap_data && result.treemap_data.length > 0 && (
            <MemoryTreemap data={result.treemap_data} />
          )}
          <SectionTable 
            sections={result.sections} 
            onSectionClick={setSelectedSection}
            selectedSection={selectedSection}
          />
          <SymbolExplorer 
            symbols={filteredSymbols}
            title={selectedSection ? `Symbols in ${selectedSection}` : "All Symbols"}
          />
        </div>
      )}
    </div>
  );
}