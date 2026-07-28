import { useState } from "react";
import Uploader from "./components/Uploader";
import Dashboard from "./components/Dashboard";
import SectionTable from "./components/SectionTable";

export type ParseResult = {
  filename: string;
  arch: string;
  entry: string;
  sections: { name: string; type: string; addr: number; size: number; flags: number }[];
  symbols: { name: string; value: number; size: number; type: string; bind: string; section: string }[];
  summary: Record<string, number>;
};

export default function App() {
  const [result, setResult] = useState<ParseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("http://localhost:8000/api/upload", { method: "POST", body: form });
      if (!res.ok) throw new Error((await res.json()).detail || "Upload failed");
      setResult(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

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
          <SectionTable sections={result.sections} />
        </div>
      )}
    </div>
  );
}