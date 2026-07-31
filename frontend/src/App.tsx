import { useState, useEffect, useMemo, useCallback } from "react";
import Sidebar from "./components/Sidebar";
import Ribbon from "./components/Ribbon";
import Overview from "./components/Overview";
import MemoryMap from "./components/MemoryMap";
import LinkerScript from "./components/LinkerScript";
import SectionTable from "./components/SectionTable";
import SymbolExplorer from "./components/SymbolExplorer";
import CallGraph from "./components/CallGraph";
import DeadCode from "./components/DeadCode";
import Compare from "./components/Compare";
import Disassembler from "./components/Disassembler";
import ObjectFiles from "./components/ObjectFiles";
import SourceViewer from "./components/SourceViewer";
import InvestigationWorkspace from "./components/InvestigationWorkspace";
import IsrAnalyzer from "./components/IsrAnalyzer";
import Peripherals from "./components/Peripherals";
import Optimize from "./components/Optimize";
import BuildConfig from "./components/BuildConfig";
import Timeline, { type Snap } from "./components/Timeline";
import Fragmentation from "./components/Fragmentation";
import Uploader from "./components/Uploader";
import Locked from "./components/Locked";
import InspectorPanel from "./components/InspectorPanel";
import { detectDevice, DB } from "./utils/devices";

import DeviceExplorer from "./components/DeviceExplorer";
import GlobalSearchModal from "./components/GlobalSearchModal";

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
  has_debug_symbols?: boolean;
};

export type View =
  | "investigator"
  | "overview"
  | "memory"
  | "layout"
  | "sections"
  | "symbols"
  | "objects"
  | "callgraph"
  | "debug"
  | "source"
  | "isr"
  | "periph"
  | "config"
  | "optimize"
  | "compare"
  | "timeline"
  | "frag"
  | "deadcode"
  | "reports"
  | "settings"
  | "dev_explorer";

const TITLES: Record<View, string> = {
  investigator: "Code Investigator Workspace",
  overview: "Firmware Overview",
  memory: "Memory Analysis",
  layout: "Memory Layout",
  sections: "Section Layout",
  symbols: "Symbol Table",
  objects: "Object Files",
  callgraph: "Call Graph",
  debug: "Disassembler",
  source: "Source Viewer",
  isr: "ISR Analyzer",
  periph: "Peripheral Usage",
  config: "Build Configuration",
  optimize: "Optimization Assistant",
  compare: "Build Compare",
  timeline: "Build Timeline",
  frag: "Heap Fragmentation",
  deadcode: "Dead Code",
  reports: "Reports",
  settings: "Settings",
  dev_explorer: "Device Explorer",
};

const TL_KEY = "fis_timeline_v1";

async function parseFile(file: File): Promise<ParseResult> {
  const form = new FormData(); form.append("file", file);
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
  const res = await fetch(`${API_URL}/api/upload`, { method: "POST", body: form });
  if (!res.ok) throw new Error((await res.json()).detail || "Upload failed");
  const data = await res.json();
  return {
    ...data,
    sections: data.sections || [],
    symbols: data.symbols || [],
    summary: data.summary || {},
    treemap_data: data.treemap_data || [],
    call_graph: data.call_graph || { nodes: [], edges: [] },
    dead_code: data.dead_code || { items: [], reclaimable: 0, referenced_count: 0 },
    objects: data.objects || [],
    isrs: data.isrs || [],
    peripherals: data.peripherals || [],
    build_config: data.build_config || {},
  };
}

type Toast = { id: number; message: string; type: "info" | "success" | "warning" | "error" };

export default function App() {
  const [result, setResult] = useState<ParseResult | null>(null);
  const [resultB, setResultB] = useState<ParseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("overview");
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [accent, setAccent] = useState<"signal" | "phosphor">("signal");
  const [deviceOverride, setDeviceOverride] = useState<string>("");
  const [disasmTarget, setDisasmTarget] = useState<{ name: string; nonce: number } | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<any | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [, setCallGraphTarget] = useState<{ symbol: string; mode: "callers" | "callees" | "symbol" } | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [history, setHistory] = useState<Snap[]>(() => { try { return JSON.parse(localStorage.getItem(TL_KEY) || "[]"); } catch { return []; } });

  const addToast = useCallback((message: string, type: "info" | "success" | "warning" | "error" = "info") => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t.slice(-3), { id, message, type }]);
    setTimeout(() => {
      setToasts(t => t.filter(item => item.id !== id));
    }, 3200);
  }, []);

  useEffect(() => { document.documentElement.dataset.theme = accent; }, [accent]);
  useEffect(() => { localStorage.setItem(TL_KEY, JSON.stringify(history)); }, [history]);
  const device = useMemo(() => {
    if (!result) return null;
    try {
      const d = deviceOverride && DB[deviceOverride] ? DB[deviceOverride] : detectDevice(result);
      return d || DB.generic_cortex_m || DB.stm32f103c8;
    } catch (e) {
      console.warn("Device detection fallback triggered:", e);
      return DB.generic_cortex_m || DB.stm32f103c8;
    }
  }, [result, deviceOverride]);

  useEffect(() => {
    if (!result) return;
    const s = result.summary || {};
    const snap: Snap = { id: Date.now(), filename: result.filename, ts: Date.now(), flash: (s[".text"] || 0) + (s[".rodata"] || 0), ram: (s[".data"] || 0) + (s[".bss"] || 0), file_size: result.file_size || 0, checksum: result.checksum || "" };
    setHistory(h => (h[h.length - 1]?.checksum === snap.checksum ? h : [...h, snap].slice(-40)));
  }, [result?.checksum]);

  const handleUpload = async (file: File) => {
    setLoading(true);
    setError(null);
    setSelectedSection(null);
    setResultB(null);
    setDeviceOverride("");
    setView("overview");
    try {
      const parsed = await parseFile(file);
      setResult(parsed);
      const defaultSym = parsed.symbols.find((s: any) => s.name === "main") || parsed.symbols.find((s: any) => s.type === "STT_FUNC" || s.section === ".text") || parsed.symbols[0] || null;
      setSelectedSymbol(defaultSym);
      addToast("Firmware binary parsed successfully", "success");
    } catch (e: any) {
      setError(e.message);
      addToast(`Parsing error: ${e.message}`, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCompare = async (file: File) => {
    setError(null);
    try {
      setResultB(await parseFile(file));
      addToast("Comparison binary loaded", "info");
    } catch (e: any) {
      setError(e.message);
      addToast(`Compare error: ${e.message}`, "error");
    }
  };

  const exportJSON = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify({ ...result, active_device: device }, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${result.filename}.insight.json`; a.click();
    addToast("Exported JSON report", "success");
  };

  const exportCSV = () => {
    if (!result) return;
    const lines = ["Name,Section,Address,Size"];
    result.symbols.forEach(s => lines.push(`"${s.name}","${s.section}",0x${s.value.toString(16)},${s.size}`));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${result.filename}.symbols.csv`; a.click();
    addToast("Exported CSV symbol table", "success");
  };

  const handleSelectSymbol = useCallback((sym: any) => {
    if (!sym) return;
    setSelectedSymbol(sym);
  }, []);

  const handleOpenAssembly = useCallback((symName: string) => {
    setDisasmTarget({ name: symName, nonce: Date.now() });
    setView("debug");
    addToast(`Disassembling ${symName}`, "info");
  }, [addToast]);

  const handleOpenObject = useCallback((objName: string) => {
    setView("objects");
    addToast(`Filtering to object: ${objName}`, "info");
  }, [addToast]);

  const handleViewSource = useCallback((symName: string) => {
    if (symName) handleSelectSymbol(symName);
    setView("investigator");
    addToast(`Opening Code Investigator for ${symName}`, "info");
  }, [addToast, handleSelectSymbol]);

  const handleHighlightSection = useCallback((secName: string) => {
    setSelectedSection(secName);
    setView("sections");
    addToast(`Highlighted section ${secName}`, "info");
  }, [addToast]);

  const handleOpenCallers = useCallback((symName: string) => {
    setCallGraphTarget({ symbol: symName, mode: "callers" });
    setView("callgraph");
    addToast(`Showing callers of ${symName}`, "info");
  }, [addToast]);

  const handleOpenCallees = useCallback((symName: string) => {
    setCallGraphTarget({ symbol: symName, mode: "callees" });
    setView("callgraph");
    addToast(`Showing callees of ${symName}`, "info");
  }, [addToast]);

  if (!result) {
    return <Uploader onUpload={handleUpload} loading={loading} />;
  }

  const renderView = () => {
    switch (view) {
      case "investigator":
        return (
          <InvestigationWorkspace
            result={result}
            device={device!}
            selectedSymbol={selectedSymbol}
            onSelectSymbol={handleSelectSymbol}
            onNavigateView={(target, param) => {
              if (target === "debug" && param) handleOpenAssembly(param);
              else setView(target as View);
            }}
          />
        );
      case "overview":
        return <Overview result={result} device={device!} />;
      case "memory":
        return <MemoryMap result={result} device={device!} onSelectRegion={() => { }} onNavigate={(target: any) => setView(target)} onDisassemble={handleOpenAssembly} />;
      case "layout":
        return <LinkerScript result={result} device={device!} />;
      case "sections":
        return <SectionTable sections={result.sections} symbols={result.symbols} selectedSection={selectedSection} onSectionClick={setSelectedSection} />;
      case "symbols":
        return <SymbolExplorer symbols={result.symbols} onSelectSymbol={handleSelectSymbol} />;
      case "objects":
        return <ObjectFiles result={result} />;
      case "source":
        return (
          <SourceViewer
            result={result}
            targetSymbol={selectedSymbol}
            onNavigateView={(target, param) => {
              if (target === "debug" && param) handleOpenAssembly(param);
              else if (target === "investigator" && param) {
                handleSelectSymbol(param);
                setView("investigator");
              } else setView(target as View);
            }}
          />
        );
      case "callgraph":
        return result.call_graph && result.call_graph.nodes.length > 0 ? (
          <CallGraph
            data={result.call_graph}
            result={result}
            device={device!}
            onDisassemble={handleOpenAssembly}
            onShowSection={(sec) => { setSelectedSection(sec); setView("sections"); }}
            onOpenObject={() => setView("objects")}
            onNavigate={(target, param) => {
              if (target === "debug" && param) handleOpenAssembly(param);
              else if ((target === "investigator" || target === "source") && param) {
                handleSelectSymbol(param);
                setView("investigator");
              } else setView(target as View);
            }}
          />
        ) : (
          <Locked name="Call Graph" note="No function symbols resolved in this binary." />
        );
      case "debug":
        return <Disassembler result={result} target={disasmTarget} />;
      case "isr":
        return <IsrAnalyzer result={result} />;
      case "periph":
        return <Peripherals result={result} />;
      case "config":
        return <BuildConfig result={result} />;
      case "optimize":
        return <Optimize result={result} device={device!} history={history} onNavigate={(target, symbol) => { if (target === "debug" && symbol) handleOpenAssembly(symbol); else setView(target as View); }} />;
      case "compare":
        return <Compare base={result} candidate={resultB} onLoad={handleCompare} onClear={() => setResultB(null)} />;
      case "timeline":
        return <Timeline history={history} onClear={() => setHistory([])} />;
      case "frag":
        return <Fragmentation />;
      case "deadcode":
        return <DeadCode data={result.dead_code} />;
      case "reports":
        return <Reports onJSON={exportJSON} onCSV={exportCSV} selectedSymbol={selectedSymbol} />;
      case "settings":
        return <Settings accent={accent} setAccent={setAccent} device={device} setOverride={setDeviceOverride} />;

      // UNIFIED DEVICE EXPLORER
      case "dev_explorer":
        return (
          <DeviceExplorer
            activeDevice={device!}
            result={result}
            override={deviceOverride}
            onSelectDevice={setDeviceOverride}
            onNavigate={(v, target) => {
              setView(v);
              if (target) handleOpenAssembly(target);
            }}
          />
        );

      default:
        return <Locked name={TITLES[view] || view} note="wired" />;
    }
  };

  return (
    <>
      <div className="app-bg" />
      <div className="shell" style={{ height: "100vh", overflow: "hidden" }}>
        <Sidebar view={view} setView={setView} hasResult={!!result} />
        <div className="main" style={{ overflow: "hidden" }}>
          <Ribbon title={TITLES[view] || view} result={result} loading={loading} accent={accent} device={device} override={deviceOverride} setOverride={setDeviceOverride} cycleAccent={() => setAccent(a => a === "signal" ? "phosphor" : "signal")} onJSON={exportJSON} onCSV={exportCSV} onReset={() => { setResult(null); setResultB(null); setDeviceOverride(""); setSelectedSymbol(null); }} onOpenSearch={() => setIsSearchOpen(true)} />
          <div className="flex flex-1" style={{ minHeight: 0 }}>
            <div className="view flex-1 overflow-auto" style={{ minWidth: 0 }} key={view + (result ? result.filename : "empty") + (resultB ? resultB.filename : "")}>
              {error && <div className="mb-4 p-3 border rounded-[3px] mono text-[12px]" style={{ borderColor: "var(--danger)", color: "var(--danger)", background: "rgba(224,86,107,.08)" }}>ERR // {error}</div>}
              {renderView()}
            </div>
            {selectedSymbol && result && device && (
              <InspectorPanel
                symbol={selectedSymbol}
                result={result}
                device={device}
                onClose={() => setSelectedSymbol(null)}
                onSelect={setSelectedSymbol}
                onOpenAssembly={handleOpenAssembly}
                onOpenObject={handleOpenObject}
                onViewSource={handleViewSource}
                onHighlightSection={handleHighlightSection}
                onOpenCallers={handleOpenCallers}
                onOpenCallees={handleOpenCallees}
              />
            )}
          </div>
        </div>
      </div>

      <GlobalSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        result={result}
        device={device}
        onNavigate={(targetView, param) => {
          setView(targetView);
          if (param) handleOpenAssembly(param);
          addToast(`Navigated to ${TITLES[targetView] || targetView}`, "info");
        }}
        onSelectSymbol={handleSelectSymbol}
      />

      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`pointer-events-auto px-4 py-2.5 rounded-lg border shadow-xl backdrop-blur-md mono text-[12px] flex items-center gap-2.5 transition-all duration-300 ${t.type === "success"
                ? "bg-[rgba(51,214,194,0.12)] border-[var(--a)] text-[#d6fff9]"
                : t.type === "error"
                  ? "bg-[rgba(224,86,107,0.15)] border-[var(--danger)] text-[#ffcdd2]"
                  : t.type === "warning"
                    ? "bg-[rgba(240,168,48,0.15)] border-[var(--b)] text-[#ffecb3]"
                    : "bg-[rgba(10,16,26,0.92)] border-[var(--line2)] fg"
              }`}
            style={{ animation: "tmSlide .25s ease-out" }}
          >
            <span className="text-base">{t.type === "success" ? "✓" : t.type === "error" ? "⚠" : "⚡"}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function Reports({ onJSON, onCSV, selectedSymbol }: { onJSON: () => void; onCSV: () => void; selectedSymbol?: any }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <span>Reports</span>
        <span className="tag">export analysis</span>
      </div>

      {selectedSymbol && (
        <div className="p-4 m-5 mb-0 border border-[var(--a-dim)] rounded bg-[rgba(51,214,194,0.05)] flex items-center justify-between mono text-[12px]">
          <div>
            <span className="mut uppercase tracking-wider text-[10px] mr-2">Synchronized Selected Symbol:</span>
            <strong className="acc">{selectedSymbol.name}</strong> ({selectedSymbol.secName} · {selectedSymbol.size} B)
          </div>
          <span className="tag">Active Workspace Context</span>
        </div>
      )}

      <div className="p-5 grid sm:grid-cols-2 gap-4">
        <button onClick={onJSON} className="btn-hw primary text-left !py-4 !px-4 flex flex-col items-start gap-1">
          <span className="text-base">⎙ Full Analysis · JSON</span>
          <span className="mono text-[10px] mut normal-case tracking-normal">sections · symbols · memory · objects · isr · peripherals · build config · timeline</span>
        </button>
        <button onClick={onCSV} className="btn-hw text-left !py-4 !px-4 flex flex-col items-start gap-1">
          <span className="text-base">⎙ Symbol Table · CSV</span>
          <span className="mono text-[10px] mut normal-case tracking-normal">name · section · address · size</span>
        </button>
      </div>
    </div>
  );
}

function Settings({ accent, setAccent, device, setOverride }: any) {
  return (
    <div className="panel p-6 space-y-6 mono text-xs">
      <div className="text-sm font-bold text-white">Studio Settings</div>

      <div className="p-4 rounded-lg bg-black/40 border border-[var(--line)] space-y-3">
        <div className="font-bold text-[var(--a)]">Target MCU Device Override</div>
        <div className="text-gray-300">Active Profile: <strong>{device?.name || "Auto-Detected"}</strong></div>
        <button onClick={() => setOverride("")} className="px-3 py-1.5 rounded bg-[var(--a-dim)] text-[var(--a)] font-bold border border-[var(--a-dim)] hover:bg-[var(--a)] hover:text-black transition">
          Reset to Auto-Detect
        </button>
      </div>

      <div className="p-4 rounded-lg bg-black/40 border border-[var(--line)] space-y-3">
        <div className="font-bold text-white">Display & Theme</div>
        <div className="flex gap-4">
          <button onClick={() => setAccent("signal")} className={`px-4 py-2 rounded border font-bold ${accent === "signal" ? "bg-[var(--a)] text-black border-[var(--a)]" : "bg-black/40 text-gray-300 border-[var(--line)]"}`}>
            Signal Theme
          </button>
          <button onClick={() => setAccent("phosphor")} className={`px-4 py-2 rounded border font-bold ${accent === "phosphor" ? "bg-amber-400 text-black border-amber-400" : "bg-black/40 text-gray-300 border-[var(--line)]"}`}>
            Phosphor Theme
          </button>
        </div>
      </div>
    </div>
  );
}
