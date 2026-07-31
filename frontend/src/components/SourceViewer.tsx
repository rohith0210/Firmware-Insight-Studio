import { useState, useEffect, useMemo } from "react";
import type { ParseResult } from "../App";

type Props = {
  result: ParseResult;
  targetSymbol?: string | any;
  onNavigateView?: (view: string, param?: string) => void;
};

export default function SourceViewer({ result, targetSymbol, onNavigateView }: Props) {
  const symbolName = typeof targetSymbol === "string" 
    ? targetSymbol 
    : targetSymbol?.name || "main";

  const sym = useMemo(() => {
    return result.symbols?.find(s => s.name === symbolName) || 
           result.symbols?.find(s => s.name === "main") || 
           result.symbols?.[0];
  }, [result.symbols, symbolName]);

  const [sourceData, setSourceData] = useState<{
    found: boolean;
    filename?: string;
    path?: string;
    decl_line?: number;
    lines?: { num: number; text: string }[];
    reason?: string;
    dwarf_info?: { cu?: string; comp_dir?: string; filename?: string; decl_line?: number };
  } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchFilter, setSearchFilter] = useState<string>("");

  useEffect(() => {
    if (!symbolName) return;
    setLoading(true);
    const checksum = result.checksum;
    const apiBase = import.meta.env.VITE_API_URL || (window.location.port === "5173" ? "http://localhost:8000" : "");
    const url = checksum
      ? `${apiBase}/api/source?checksum=${encodeURIComponent(checksum)}&name=${encodeURIComponent(symbolName)}`
      : `${apiBase}/api/source?name=${encodeURIComponent(symbolName)}`;

    fetch(url)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        setSourceData(data);
        setLoading(false);
      })
      .catch(() => {
        setSourceData({ found: false, reason: "DWARF_MISSING" });
        setLoading(false);
      });
  }, [symbolName, result.checksum]);

  const filteredLines = useMemo(() => {
    if (!sourceData?.lines) return [];
    if (!searchFilter.trim()) return sourceData.lines;
    const q = searchFilter.toLowerCase();
    return sourceData.lines.filter(l => l.text.toLowerCase().includes(q) || String(l.num).includes(q));
  }, [sourceData?.lines, searchFilter]);

  const hasDebug = !!(result.has_debug_symbols || result.sections?.some(s => s.name.startsWith(".debug_")));

  return (
    <div className="panel flex flex-col h-full overflow-hidden bg-[#070b10] text-[var(--fg)]">
      {/* HEADER TOOLBAR */}
      <div className="panel-head flex justify-between items-center px-4 py-2.5 bg-[var(--panel)] border-b border-[var(--line)] flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="mono text-xs px-2 py-0.5 rounded bg-[var(--a-dim)] text-[var(--a)] font-bold uppercase tracking-wider">
            SOURCE VIEWER
          </span>
          <span className="mono text-xs font-bold text-amber-400 truncate">
            {sourceData?.found && sourceData?.filename ? `📜 ${sourceData.filename}` : `Symbol: ${symbolName}`}
          </span>
          {sourceData?.path && (
            <span className="mono text-[10px] text-[var(--mut)] truncate max-w-md hidden md:inline" title={sourceData.path}>
              ({sourceData.path})
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {sourceData?.found && (
            <input
              type="text"
              placeholder="Search source code..."
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              className="bg-black/50 border border-[var(--line)] px-2.5 py-1 rounded text-xs mono text-white focus:outline-none focus:border-[var(--a)] w-48"
            />
          )}

          <button
            onClick={() => onNavigateView?.("investigator", symbolName)}
            className="px-2.5 py-1 rounded bg-[var(--a-dim)] border border-[var(--a-dim)] text-[var(--a)] hover:bg-[var(--a)] hover:text-black transition mono text-xs font-bold"
          >
            🔬 Code Investigator
          </button>
          <button
            onClick={() => onNavigateView?.("debug", symbolName)}
            className="px-2.5 py-1 rounded bg-purple-500/20 border border-purple-500/30 text-purple-300 hover:bg-purple-500 hover:text-white transition mono text-xs font-bold"
          >
            ⚙ Disassembly
          </button>
        </div>
      </div>

      {/* CONTENT VIEWPORT */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-8 h-8 border-2 border-[var(--a)] border-t-transparent rounded-full animate-spin mb-3"></div>
            <span className="mono text-xs text-[var(--a)]">Extracting DWARF source mappings for '{symbolName}'...</span>
          </div>
        ) : sourceData?.found && sourceData.lines ? (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* SUBHEADER METRICS */}
            <div className="px-4 py-1.5 bg-black/40 border-b border-[var(--line)] flex justify-between items-center mono text-[11px]">
              <span className="text-[var(--mut)]">
                Target Function: <strong className="text-white">{symbolName}</strong> | Address: <span className="text-amber-400 font-mono">0x{sym ? sym.value.toString(16) : "0"}</span> | Declared Line: <strong className="text-[var(--a)]">{sourceData.decl_line || "1"}</strong>
              </span>
              <span className="text-[var(--a)] font-mono">
                {filteredLines.length} of {sourceData.lines.length} lines visible
              </span>
            </div>

            {/* SOURCE CODE LISTING */}
            <div className="flex-1 overflow-y-auto p-4 mono text-xs leading-relaxed space-y-0.5 select-text font-mono bg-[#05080c]">
              {filteredLines.map(line => {
                const isDecl = sourceData.decl_line === line.num;
                return (
                  <div
                    key={line.num}
                    className={`flex items-start gap-4 px-2 py-0.5 rounded transition ${
                      isDecl
                        ? "bg-[rgba(51,214,194,0.18)] border-l-2 border-[var(--a)] font-bold text-amber-300"
                        : "hover:bg-white/5 text-gray-200"
                    }`}
                  >
                    <span
                      className={`w-10 text-right text-[10px] select-none flex-shrink-0 font-mono ${
                        isDecl ? "text-[var(--a)] font-bold" : "text-gray-500"
                      }`}
                    >
                      {line.num}
                    </span>
                    <pre className="font-mono whitespace-pre-wrap flex-1 leading-normal">{line.text}</pre>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* DIAGNOSTIC PANEL FOR MISSING OR UNMAPPED SOURCE CODE */
          <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#070b10] text-center select-text overflow-y-auto">
            <div className="max-w-xl w-full p-6 rounded-lg bg-black/60 border border-[var(--line)] space-y-6 text-left shadow-2xl">
              <div className="flex items-start gap-4 border-b border-[var(--line)] pb-4">
                <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 grid place-items-center flex-shrink-0">
                  <span className="text-2xl">📜</span>
                </div>
                <div>
                  <h3 className="text-base font-bold text-white mb-1">C/C++ Source Code Unavailable</h3>
                  <p className="text-xs text-[var(--mut)] leading-relaxed">
                    {hasDebug
                      ? `DWARF debug metadata is present in '${result.filename}', but the source file referenced during compilation cannot be accessed on the local filesystem.`
                      : `This binary payload was compiled without DWARF line table debug symbols (-g). Raw machine instructions cannot be mapped back to C/C++ source code.`}
                  </p>
                </div>
              </div>

              <div className="space-y-3 text-xs mono">
                <div className="font-bold text-[var(--a)] uppercase tracking-wider text-[11px]">Extracted Debug Metadata</div>
                <div className="grid grid-cols-2 gap-2 text-gray-300 bg-black/40 p-3 rounded border border-white/5">
                  <div className="flex items-center gap-2"><span className="text-emerald-400">✓</span> Compile Unit: <span className="text-white font-mono">{sourceData?.dwarf_info?.cu || "Main CU"}</span></div>
                  <div className="flex items-center gap-2"><span className="text-emerald-400">✓</span> File Name: <span className="text-white font-mono">{sourceData?.dwarf_info?.filename || `${symbolName}.c`}</span></div>
                  <div className="flex items-center gap-2"><span className="text-emerald-400">✓</span> Symbol Name: <span className="text-white font-mono">{symbolName}</span></div>
                  <div className="flex items-center gap-2"><span className="text-emerald-400">✓</span> Declared Line: <span className="text-white font-mono">{sourceData?.dwarf_info?.decl_line || 1}</span></div>
                </div>

                <div className="font-bold text-rose-400 uppercase tracking-wider text-[11px] pt-1">Missing Component</div>
                <div className="flex items-center gap-2 text-gray-400 bg-rose-500/5 p-3 rounded border border-rose-500/20">
                  <span className="text-rose-400 font-bold">✗</span> Original Source Path: <span className="text-gray-300 font-mono">{sourceData?.dwarf_info?.comp_dir || "External build environment"}</span>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-[var(--line)]">
                <div className="text-[11px] text-[var(--mut)] uppercase font-bold">Alternative Analysis Pathways</div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => onNavigateView?.("debug", symbolName)} className="px-3 py-1.5 rounded bg-[var(--a)]/20 hover:bg-[var(--a)]/30 border border-[var(--a)]/50 text-[var(--a)] text-xs font-bold transition">
                    [ Inspect Disassembly ]
                  </button>
                  <button onClick={() => onNavigateView?.("investigator", symbolName)} className="px-3 py-1.5 rounded bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/50 text-purple-300 text-xs font-bold transition">
                    [ Code Investigator ]
                  </button>
                  <button onClick={() => onNavigateView?.("memory")} className="px-3 py-1.5 rounded bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 text-cyan-300 text-xs font-bold transition">
                    [ Memory Analysis ]
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
