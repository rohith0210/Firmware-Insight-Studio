import { useState, useEffect, useMemo } from "react";
import Sidebar from "./components/Sidebar";
import Ribbon from "./components/Ribbon";
import Overview from "./components/Overview";
import MemoryMap from "./components/MemoryMap";
import MemoryTreemap from "./components/MemoryTreemap";
import LinkerScript from "./components/LinkerScript";
import SectionTable from "./components/SectionTable";
import SymbolExplorer from "./components/SymbolExplorer";
import CallGraph from "./components/CallGraph";
import DeadCode from "./components/DeadCode";
import Compare from "./components/Compare";
import Disassembler from "./components/Disassembler";
import ObjectFiles from "./components/ObjectFiles";
import IsrAnalyzer from "./components/IsrAnalyzer";
import Peripherals from "./components/Peripherals";
import Optimize from "./components/Optimize";
import BuildConfig from "./components/BuildConfig";
import Timeline, { type Snap } from "./components/Timeline";
import Fragmentation from "./components/Fragmentation";
import Uploader from "./components/Uploader";
import Locked from "./components/Locked";
import { detectDevice, DB, DB_ORDER } from "./utils/devices";

export type ParseResult = {
  filename: string; arch: string; entry: string;
  elf_class?: number; file_size?: number; checksum?: string; toolchain?: string;
  num_sections?: number; num_symbols?: number; largest?: { name: string; size: number };
  sections: { name: string; type: string; addr: number; size: number; flags: number }[];
  symbols: { name: string; value: number; size: number; type: string; bind: string; section: string }[];
  summary: Record<string, number>;
  treemap_data: { name: string; size: number; children: { name: string; size: number }[] }[];
  call_graph: { nodes: Array<{ id: string; label: string; type: string }>; edges: Array<{ source: string; target: string; animated?: boolean }> };
  dead_code?: { items: any[]; reclaimable: number; referenced_count: number };
  objects?: any[]; isrs?: any[]; peripherals?: any[]; build_config?: any;
};
export type View = "overview" | "memory" | "layout" | "sections" | "symbols" | "objects" | "callgraph" | "debug" | "isr" | "periph" | "config" | "optimize" | "compare" | "timeline" | "frag" | "deadcode" | "reports" | "settings";
const TITLES: Record<View, string> = { overview: "Firmware Overview", memory: "Memory Analysis", layout: "Memory Layout", sections: "Section Layout", symbols: "Symbol Table", objects: "Object Files", callgraph: "Call Graph", debug: "Disassembler", isr: "ISR Analyzer", periph: "Peripheral Usage", config: "Build Configuration", optimize: "Optimization Assistant", compare: "Build Compare", timeline: "Build Timeline", frag: "Heap Fragmentation", deadcode: "Dead Code", reports: "Reports", settings: "Settings" };
const TL_KEY = "fis_timeline_v1";

async function parseFile(file: File): Promise<ParseResult> {
  const form = new FormData(); form.append("file", file);
  const res = await fetch("http://localhost:8000/api/upload", { method: "POST", body: form });
  if (!res.ok) throw new Error((await res.json()).detail || "Upload failed");
  return res.json();
}

export default function App() {
  const [result, setResult] = useState<ParseResult | null>(null);
  const [resultB, setResultB] = useState<ParseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("overview");
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [accent, setAccent] = useState<"signal" | "phosphor">("signal");
  const [scanline, setScanline] = useState(true);
  const [deviceOverride, setDeviceOverride] = useState<string>("");
  const [history, setHistory] = useState<Snap[]>(() => { try { return JSON.parse(localStorage.getItem(TL_KEY) || "[]"); } catch { return []; } });
  useEffect(() => { document.documentElement.dataset.theme = accent; }, [accent]);
  useEffect(() => { localStorage.setItem(TL_KEY, JSON.stringify(history)); }, [history]);

  const device = useMemo(() => result ? (deviceOverride && DB[deviceOverride] ? DB[deviceOverride] : detectDevice(result)) : null, [result, deviceOverride]);

  // timeline: record a snapshot whenever a new base binary lands
  useEffect(() => {
    if (!result) return;
    const s = result.summary || {};
    const snap: Snap = { id: Date.now(), filename: result.filename, ts: Date.now(), flash: (s[".text"] || 0) + (s[".rodata"] || 0), ram: (s[".data"] || 0) + (s[".bss"] || 0), file_size: result.file_size || 0, checksum: result.checksum || "" };
    setHistory(h => (h[h.length - 1]?.checksum === snap.checksum ? h : [...h, snap].slice(-40)));
  }, [result?.checksum]);

  const handleUpload = async (file: File) => { setLoading(true); setError(null); setSelectedSection(null); setResultB(null); setDeviceOverride(""); setView("overview"); try { setResult(await parseFile(file)); } catch (e: any) { setError(e.message); } finally { setLoading(false); } };
  const handleCompare = async (file: File) => { setError(null); try { setResultB(await parseFile(file)); } catch (e: any) { setError(e.message); } };
  const download = (blob: Blob, name: string) => { const u = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u); };
  const exportJSON = () => result && download(new Blob([JSON.stringify({ base: result, candidate: resultB, device: device?.name, history }, null, 2)], { type: "application/json" }), `${result.filename}_analysis.json`);
  const exportCSV = () => { if (!result) return; const rows = [["Name", "Section", "Address", "SizeBytes", "Type"], ...result.symbols.map(s => [s.name, s.section, "0x" + s.value.toString(16), String(s.size), s.type])]; download(new Blob([rows.map(r => r.join(",")).join("\n")], { type: "text/csv" }), `${result.filename}_symbols.csv`); };
  const filteredSymbols = selectedSection ? result?.symbols.filter(s => s.section === selectedSection) || [] : result?.symbols || [];

  const renderView = () => {
    if (!result || !device) return <Uploader onUpload={handleUpload} loading={loading} />;
    switch (view) {
      case "overview": return <Overview result={result} device={device} />;
      case "memory": return <div className="space-y-5"><MemoryMap result={result} device={device} />{result.treemap_data.length > 0 && <MemoryTreemap data={result.treemap_data} />}</div>;
      case "layout": return <LinkerScript result={result} device={device} />;
      case "sections": return <SectionTable sections={result.sections} symbols={result.symbols} onSectionClick={setSelectedSection} selectedSection={selectedSection} />;
      case "symbols": return <SymbolExplorer symbols={filteredSymbols} title={selectedSection ? `Symbols // ${selectedSection}` : "Symbol Table"} />;
      case "objects": return <ObjectFiles result={result} />;
      case "callgraph": return result.call_graph.nodes.length > 0 ? <CallGraph data={result.call_graph} /> : <Locked name="Call Graph" note="No function symbols resolved in this binary." />;
      case "debug": return <Disassembler result={result} />;
      case "isr": return <IsrAnalyzer result={result} />;
      case "periph": return <Peripherals result={result} />;
      case "config": return <BuildConfig result={result} />;
      case "optimize": return <Optimize result={result} />;
      case "compare": return <Compare base={result} candidate={resultB} onLoad={handleCompare} onClear={() => setResultB(null)} />;
      case "timeline": return <Timeline history={history} onClear={() => setHistory([])} />;
      case "frag": return <Fragmentation />;
      case "deadcode": return <DeadCode data={result.dead_code} />;
      case "reports": return <Reports onJSON={exportJSON} onCSV={exportCSV} />;
      case "settings": return <Settings accent={accent} setAccent={setAccent} scanline={scanline} setScanline={setScanline} device={device} override={deviceOverride} setOverride={setDeviceOverride} />;
      default: return <Locked name={TITLES[view]} note="wired" />;
    }
  };

  return (
    <>
      <div className="app-bg" />
      {scanline && <div className="scanline" />}
      <div className="shell">
        <Sidebar view={view} setView={setView} hasResult={!!result} />
        <div className="main">
          <Ribbon title={TITLES[view]} result={result} loading={loading} accent={accent} device={device} override={deviceOverride} setOverride={setDeviceOverride} cycleAccent={() => setAccent(a => a === "signal" ? "phosphor" : "signal")} onJSON={exportJSON} onCSV={exportCSV} onReset={() => { setResult(null); setResultB(null); setDeviceOverride(""); }} />
          <div className="view" key={view + (result ? result.filename : "empty") + (resultB ? resultB.filename : "")}>
            {error && <div className="mb-4 p-3 border rounded-[3px] mono text-[12px]" style={{ borderColor: "var(--danger)", color: "var(--danger)", background: "rgba(224,86,107,.08)" }}>ERR // {error}</div>}
            {renderView()}
          </div>
        </div>
      </div>
    </>
  );
}

function Reports({ onJSON, onCSV }: { onJSON: () => void; onCSV: () => void }) {
  return (<div className="panel"><div className="panel-head"><span>Reports</span><span className="tag">export analysis</span></div><div className="p-5 grid sm:grid-cols-2 gap-4"><button onClick={onJSON} className="btn-hw primary text-left !py-4 !px-4 flex flex-col items-start gap-1"><span className="text-base">⎙ Full Analysis · JSON</span><span className="mono text-[10px] mut normal-case tracking-normal">sections · symbols · memory · objects · isr · peripherals · build config · timeline</span></button><button onClick={onCSV} className="btn-hw text-left !py-4 !px-4 flex flex-col items-start gap-1"><span className="text-base">⎙ Symbol Table · CSV</span><span className="mono text-[10px] mut normal-case tracking-normal">name · section · address · size</span></button></div><div className="px-5 pb-5"><Locked name="CI / GitHub Action" note="a headless report is shipped in .github/workflows/analyze.yml + backend/cli.py — wire it to your build artifact to comment flash/RAM deltas on every PR." compact /></div></div>);
}
function Settings({ accent, setAccent, scanline, setScanline, device, override, setOverride }: { accent: string; setAccent: (a: any) => void; scanline: boolean; setScanline: (b: boolean) => void; device: any; override: string; setOverride: (s: string) => void }) {
  const Toggle = ({ on, set, label }: any) => (<button onClick={() => set(!on)} className="flex items-center justify-between w-full p-3 border ln rounded-[3px] hover:border-[var(--a-dim)] transition"><span className="mono text-[12px] fg">{label}</span><span className="mono text-[10px] px-2 py-1 rounded-[2px]" style={{ background: on ? "rgba(51,214,194,.15)" : "rgba(255,255,255,.04)", color: on ? "var(--a)" : "var(--mut)" }}>{on ? "ON" : "OFF"}</span></button>);
  return (<div className="panel"><div className="panel-head"><span>Settings</span><span className="tag">workbench</span></div><div className="p-5 grid sm:grid-cols-2 gap-3 max-w-2xl"><Toggle on={scanline} set={setScanline} label="CRT scanline" /><button onClick={() => setAccent(accent === "signal" ? "phosphor" : "signal")} className="flex items-center justify-between w-full p-3 border ln rounded-[3px] hover:border-[var(--a-dim)] transition"><span className="mono text-[12px] fg">Trace accent</span><span className="mono text-[10px] px-2 py-1 rounded-[2px] acc">{accent === "signal" ? "TEAL / AMBER" : "PHOSPHOR"}</span></button><label className="flex flex-col gap-2 p-3 border ln rounded-[3px] sm:col-span-2"><span className="mono text-[12px] fg">Target device override</span><select value={override} onChange={e => setOverride(e.target.value)} className="selbar" style={{ width: "100%" }}><option value="">auto-detect · {device?.name || "—"}</option>{DB_ORDER.map(id => <option key={id} value={id}>{DB[id].name}</option>)}<option value="generic">Cortex-M · generic</option></select><span className="mono text-[10px] mut">auto-detect reads arch + .text/.data base addresses; override for exact FLASH/RAM capacity.</span></label></div></div>);
}
