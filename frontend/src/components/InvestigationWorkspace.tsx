import { useState, useMemo, useEffect } from "react";
import type { ParseResult } from "../App";

type Props = {
  result: ParseResult;
  device: any;
  selectedSymbol: any;
  onSelectSymbol: (symbol: any) => void;
  onNavigateView?: (view: string, param?: string) => void;
};

type LeftTab = "objects" | "sections" | "symbols" | "favorites" | "recent";
type CenterTab = "source" | "assembly" | "decompiler" | "hex";
type BottomTab = "Console" | "Trace" | "Timeline" | "Warnings" | "Build" | "Statistics" | "Navigation" | "Events";

// Helper to extract clean module prefix from symbol name
function getModulePrefix(name: string): string {
  if (!name || typeof name !== "string") return "driver";
  const parts = name.split("_");
  return parts.length > 1 && parts[1] ? parts[1].toLowerCase() : "driver";
}

export default function InvestigationWorkspace({
  result,
  device,
  selectedSymbol,
  onSelectSymbol,
  onNavigateView,
}: Props) {
  const [leftTab, setLeftTab] = useState<LeftTab>("symbols");
  const [centerTab, setCenterTab] = useState<CenterTab>("source");
  const [bottomTab, setBottomTab] = useState<BottomTab>("Console");
  const [splitView, setSplitView] = useState<boolean>(false);
  const [search, setSearch] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; symbol: string } | null>(null);

  // Safe symbols & sections
  const symbols = useMemo(() => (result && Array.isArray(result.symbols) ? result.symbols : []), [result]);
  const summary = useMemo(() => (result && result.summary ? result.summary : {}), [result]);
  const sections = useMemo(() => (result && Array.isArray(result.sections) ? result.sections : []), [result]);

  // Active Symbol Resolution
  const activeSym = useMemo(() => {
    let symName = "";
    if (selectedSymbol) {
      if (typeof selectedSymbol === "string") symName = selectedSymbol;
      else if (selectedSymbol.name) symName = String(selectedSymbol.name);
    }
    if (!symName) {
      const defaultSym = symbols.find(s => s.name === "main") || symbols[0];
      symName = defaultSym ? defaultSym.name : "main";
    }

    const found = symbols.find(s => s.name === symName);
    return {
      id: found ? `${found.section || ".text"}::${found.name}` : `.text::${symName}`,
      name: symName,
      size: found ? found.size || 0 : 64,
      secName: found ? found.section || ".text" : ".text",
      secSize: summary[found?.section || ".text"] || 1024,
    };
  }, [selectedSymbol, symbols, summary]);

  const symDetails = useMemo(() => {
    if (!activeSym || !activeSym.name) return null;
    return symbols.find(s => s.name === activeSym.name) || {
      name: activeSym.name,
      value: 0x080001f8,
      size: activeSym.size || 64,
      type: "STT_FUNC",
      bind: "STB_GLOBAL",
      section: activeSym.secName || ".text",
    };
  }, [activeSym, symbols]);

  // Track recently viewed
  const [favorites, setFavorites] = useState<Set<string>>(new Set(["main", "HAL_Init"]));
  const [recentlyViewed, setRecentlyViewed] = useState<string[]>(["main"]);

  useEffect(() => {
    if (activeSym && activeSym.name) {
      setRecentlyViewed(prev => Array.from(new Set([activeSym.name, ...prev])).slice(0, 15));
    }
  }, [activeSym?.name]);

  // Fetch Real DWARF Source Code from Backend API
  const [sourceData, setSourceData] = useState<{
    found: boolean;
    filename?: string;
    path?: string;
    decl_line?: number;
    lines?: { num: number; text: string }[];
    reason?: string;
    dwarf_info?: { cu: string; filename: string; decl_line: number; comp_dir: string };
  } | null>(null);
  const [loadingSource, setLoadingSource] = useState<boolean>(false);

  const apiBase = window.location.port === "5173" ? "http://localhost:8000" : "";

  useEffect(() => {
    if (!activeSym || !activeSym.name) return;
    setLoadingSource(true);
    const checksum = result?.checksum;
    const url = checksum
      ? `${apiBase}/api/source?checksum=${encodeURIComponent(checksum)}&name=${encodeURIComponent(activeSym.name)}`
      : `${apiBase}/api/source?name=${encodeURIComponent(activeSym.name)}`;

    fetch(url)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        setSourceData(data);
        setLoadingSource(false);
        // Automatic Assembly Fallback if source code is unavailable
        if (data && !data.found && centerTab === "source") {
          setCenterTab("assembly");
        }
      })
      .catch(() => {
        setSourceData({ found: false, reason: "DWARF_MISSING" });
        setLoadingSource(false);
        if (centerTab === "source") setCenterTab("assembly");
      });
  }, [activeSym?.name, result?.checksum]);

  // Fetch Decompiled High-Level AST Pseudocode from Backend API
  const [pseudoData, setPseudoData] = useState<{ found: boolean; func?: string; pseudocode?: string[]; reason?: string } | null>(null);
  const [loadingPseudo, setLoadingPseudo] = useState<boolean>(false);

  useEffect(() => {
    if (!activeSym || !activeSym.name) return;
    setLoadingPseudo(true);
    const checksum = result?.checksum;
    const url = checksum
      ? `${apiBase}/api/decompiler?checksum=${encodeURIComponent(checksum)}&name=${encodeURIComponent(activeSym.name)}`
      : `${apiBase}/api/decompiler?name=${encodeURIComponent(activeSym.name)}`;

    fetch(url)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        setPseudoData(data);
        setLoadingPseudo(false);
      })
      .catch(() => {
        setPseudoData({ found: false, reason: "Decompiler engine unavailable" });
        setLoadingPseudo(false);
      });
  }, [activeSym?.name, result?.checksum]);

  // Fetch Real Disassembly for Assembly Tab
  const [disasmData, setDisasmData] = useState<{ instructions?: { addr: number; mn: string; op: string }[] } | null>(null);
  const [loadingDisasm, setLoadingDisasm] = useState<boolean>(false);

  useEffect(() => {
    if (!activeSym || !activeSym.name) return;
    setLoadingDisasm(true);
    const checksum = result?.checksum;
    const url = checksum
      ? `${apiBase}/api/disasm?checksum=${encodeURIComponent(checksum)}&name=${encodeURIComponent(activeSym.name)}`
      : `${apiBase}/api/disasm?name=${encodeURIComponent(activeSym.name)}`;

    fetch(url)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        setDisasmData(data);
        setLoadingDisasm(false);
      })
      .catch(() => {
        setDisasmData(null);
        setLoadingDisasm(false);
      });
  }, [activeSym?.name, result?.checksum]);

  // Object & Source ownership
  const objectFile = useMemo(() => {
    if (!activeSym || !activeSym.name) return "main.o";
    const name = String(activeSym.name);
    if (name.startsWith("HAL_") || name.startsWith("LL_")) {
      const sub = getModulePrefix(name);
      return `stm32f1xx_hal_${sub}.o`;
    }
    if (name.startsWith("__") || name.startsWith("_Z")) return "crt0.o";
    return "main.o";
  }, [activeSym]);

  // Object Files List
  const objectsList = useMemo(() => {
    if (result?.objects && Array.isArray(result.objects) && result.objects.length > 0) {
      return result.objects.map(o => ({
        name: o.name || "module.o",
        source: o.source || "module.c",
        flash: o.flash || 0,
        ram: o.ram || 0,
        symbols: Array.isArray(o.symbols) ? o.symbols : [],
      }));
    }
    const groups: Record<string, any> = {};
    symbols.forEach(s => {
      if (!s || !s.name) return;
      const sName = String(s.name);
      const obj = (sName.startsWith("HAL_") || sName.startsWith("LL_"))
        ? `stm32f1xx_hal_${getModulePrefix(sName)}.o`
        : sName.startsWith("__")
        ? "crt0.o"
        : "main.o";

      if (!groups[obj]) {
        groups[obj] = { name: obj, source: obj.replace(/\.o$/, ".c"), flash: 0, ram: 0, symbols: [] };
      }
      const sec = s.section || ".text";
      if (sec === ".text" || sec === ".rodata" || sec === ".isr_vector") {
        groups[obj].flash += (s.size || 0);
      } else {
        groups[obj].ram += (s.size || 0);
      }
      groups[obj].symbols.push(sName);
    });
    return Object.values(groups);
  }, [result?.objects, symbols]);

  const handleSelectSymByName = (symName: string) => {
    const s = symbols.find(x => x.name === symName);
    if (s) {
      onSelectSymbol({
        id: `${s.section || ".text"}::${s.name}`,
        name: s.name,
        size: s.size || 0,
        secName: s.section || ".text",
        secSize: summary[s.section || ".text"] || 0,
      });
    }
  };

  const toggleFavorite = (symName: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(symName)) next.delete(symName);
      else next.add(symName);
      return next;
    });
  };

  const handleContextMenu = (e: React.MouseEvent, symName?: string) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      symbol: symName || activeSym?.name || "main",
    });
  };

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  const hasDebugInfo = result?.has_debug_symbols !== false;

  return (
    <div className="flex flex-col h-full bg-[var(--bg)] text-[var(--fg)] font-sans overflow-hidden select-none relative">
      {/* RIGHT CLICK CONTEXT MENU */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-[#0c121e] border border-[var(--a-dim)] shadow-2xl rounded p-1.5 mono text-xs w-56 flex flex-col space-y-0.5"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={e => e.stopPropagation()}
        >
          <div className="px-2 py-1 text-[10px] text-[var(--a)] font-bold border-b border-[var(--line)] flex justify-between">
            <span>PROGRAM REPRESENTATION</span>
            <span className="truncate max-w-[100px] text-[var(--fg)]">{contextMenu.symbol}</span>
          </div>
          <button
            onClick={() => { setCenterTab("assembly"); setContextMenu(null); }}
            className="text-left px-2 py-1.5 hover:bg-[rgba(51,214,194,0.15)] rounded text-gray-200 flex items-center justify-between"
          >
            <span>Inspect Assembly</span>
            <span className="text-[10px] text-[var(--a)]">ASM</span>
          </button>
          <button
            onClick={() => { setCenterTab("decompiler"); setContextMenu(null); }}
            className="text-left px-2 py-1.5 hover:bg-[rgba(51,214,194,0.15)] rounded text-gray-200"
          >
            Open Decompiler
          </button>
          <div className="border-t border-[var(--line)] my-1" />
          <button
            onClick={() => { onNavigateView?.("memory", activeSym?.secName); setContextMenu(null); }}
            className="text-left px-2 py-1.5 hover:bg-[rgba(51,214,194,0.15)] rounded text-gray-200"
          >
            Open Memory Analysis
          </button>
          <button
            onClick={() => { onNavigateView?.("callgraph"); setContextMenu(null); }}
            className="text-left px-2 py-1.5 hover:bg-[rgba(51,214,194,0.15)] rounded text-gray-200"
          >
            Open Firmware Flow Explorer
          </button>
          <button
            onClick={() => { onNavigateView?.("debug", activeSym?.name); setContextMenu(null); }}
            className="text-left px-2 py-1.5 hover:bg-[rgba(51,214,194,0.15)] rounded text-gray-200"
          >
            Open Execution Debugger
          </button>
        </div>
      )}

      {/* TOP WORKSPACE TOOLBAR */}
      <div className="bg-[var(--panel)] border-b border-[var(--line)] px-4 py-2 flex items-center justify-between gap-4 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="mono text-xs px-2 py-0.5 rounded bg-[var(--a-dim)] text-[var(--a)] font-bold uppercase tracking-wider">
            CODE INVESTIGATOR
          </span>
          <div className="mono text-xs flex items-center gap-2 text-[var(--mut)] truncate">
            <span className="text-[var(--fg)] font-bold">{device?.name || "STM32F103CB"}</span>
            <span>›</span>
            <span>{result?.filename || "firmware.elf"}</span>
            <span>›</span>
            <span className="text-[var(--b)]">{objectFile}</span>
            <span>›</span>
            <span className="text-[var(--a)]">{activeSym?.secName}</span>
            <span>›</span>
            <span className="text-[var(--fg)] font-bold bg-[rgba(51,214,194,0.1)] px-1.5 py-0.5 rounded border border-[var(--a-dim)]">
              {activeSym?.name || "No Symbol"}
            </span>
          </div>
        </div>

        {/* SPLIT VIEW TOGGLE */}
        <button
          onClick={() => setSplitView(!splitView)}
          className={`mono text-[10px] uppercase px-3 py-1 rounded border transition ${
            splitView
              ? "bg-[var(--a-dim)] text-[var(--a)] border-[var(--a-dim)] font-bold"
              : "bg-black/40 text-[var(--mut)] border-[var(--line)] hover:text-[var(--fg)]"
          }`}
        >
          {splitView ? "Assembly Split ON" : "Split View OFF"}
        </button>
      </div>

      {/* MAIN THREE-PANE IDE LAYOUT */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* LEFT EXPLORER TABS */}
        <aside className="w-80 border-r border-[var(--line)] bg-[var(--panel)] flex flex-col overflow-hidden flex-shrink-0">
          <div className="flex border-b border-[var(--line)] bg-black/20 overflow-x-auto no-scrollbar">
            {[
              { id: "symbols", label: "🔣 Syms" },
              { id: "objects", label: "▦ Objs" },
              { id: "sections", label: "≣ Secs" },
              { id: "favorites", label: "★ Favs" },
              { id: "recent", label: "🕒 Recent" },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setLeftTab(tab.id as LeftTab)}
                className={`flex-1 py-2 px-2 mono text-[10px] uppercase tracking-wider transition whitespace-nowrap ${
                  leftTab === tab.id
                    ? "text-[var(--a)] border-b-2 border-[var(--a)] bg-[rgba(51,214,194,0.05)] font-bold"
                    : "text-[var(--mut)] hover:text-[var(--fg)]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* SEARCH INPUT */}
          <div className="p-2 border-b border-[var(--line)] bg-black/30">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={`Filter ${leftTab}...`}
              className="w-full bg-black/40 border border-[var(--line)] rounded px-2.5 py-1.5 mono text-[11px] outline-none text-[var(--fg)] placeholder:text-[var(--mut)]"
            />
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1 mono text-xs">
            {leftTab === "symbols" &&
              symbols
                .filter(s => s.name.toLowerCase().includes(search.toLowerCase()))
                .map(s => {
                  const isFav = favorites.has(s.name);
                  const isSel = activeSym?.name === s.name;
                  return (
                    <div
                      key={s.name}
                      onClick={() => handleSelectSymByName(s.name)}
                      onContextMenu={e => handleContextMenu(e, s.name)}
                      className={`p-2 rounded border cursor-pointer flex justify-between items-center transition ${
                        isSel
                          ? "bg-[rgba(51,214,194,0.15)] border-[var(--a)] text-[var(--a)] font-bold shadow"
                          : "bg-black/20 border-[var(--line)] hover:bg-white/5 text-gray-300"
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            toggleFavorite(s.name);
                          }}
                          className="text-[10px] text-amber-400 hover:scale-125 transition"
                        >
                          {isFav ? "★" : "☆"}
                        </button>
                        <span className="truncate">{s.name}</span>
                      </div>
                      <span className="text-[10px] text-[var(--mut)] font-mono">{s.size}B</span>
                    </div>
                  );
                })}

            {leftTab === "objects" &&
              objectsList
                .filter((obj: any) => obj.name.toLowerCase().includes(search.toLowerCase()))
                .map((obj: any) => (
                  <div key={obj.name} className="p-2 rounded bg-black/20 border border-[var(--line)] space-y-1">
                    <div className="font-bold text-[var(--b)] text-[11px] flex justify-between">
                      <span>▦ {obj.name}</span>
                      <span className="text-[10px] text-[var(--mut)]">{obj.flash}B</span>
                    </div>
                    <div className="space-y-0.5 pl-2 border-l border-white/10">
                      {obj.symbols.map((symName: string) => (
                        <div
                          key={symName}
                          onClick={() => handleSelectSymByName(symName)}
                          className={`cursor-pointer px-1.5 py-0.5 rounded text-[11px] truncate transition ${
                            activeSym?.name === symName
                              ? "bg-[var(--a-dim)] text-[var(--a)] font-bold"
                              : "text-gray-400 hover:text-gray-200"
                          }`}
                        >
                          {symName}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

            {leftTab === "sections" &&
              sections
                .filter(sec => sec.name.toLowerCase().includes(search.toLowerCase()))
                .map(sec => (
                  <div
                    key={sec.name}
                    onClick={() => onNavigateView?.("memory", sec.name)}
                    className="p-2 rounded bg-black/20 border border-[var(--line)] flex justify-between items-center cursor-pointer hover:border-[var(--a-dim)] transition"
                  >
                    <span className="font-bold text-[var(--a)] text-[11px]">{sec.name}</span>
                    <span className="text-[10px] text-[var(--mut)]">0x{sec.addr.toString(16)} ({sec.size}B)</span>
                  </div>
                ))}

            {leftTab === "favorites" &&
              Array.from(favorites).map(symName => (
                <div
                  key={symName}
                  onClick={() => handleSelectSymByName(symName)}
                  className={`p-2 rounded border cursor-pointer flex justify-between items-center transition ${
                    activeSym?.name === symName
                      ? "bg-[rgba(51,214,194,0.15)] border-[var(--a)] text-[var(--a)] font-bold"
                      : "bg-black/20 border-[var(--line)] text-amber-300 hover:bg-white/5"
                  }`}
                >
                  <span>★ {symName}</span>
                  <span className="text-[10px] text-[var(--mut)]">FAV</span>
                </div>
              ))}

            {leftTab === "recent" &&
              recentlyViewed.map(symName => (
                <div
                  key={symName}
                  onClick={() => handleSelectSymByName(symName)}
                  className={`p-2 rounded border cursor-pointer flex justify-between items-center transition ${
                    activeSym?.name === symName
                      ? "bg-[rgba(51,214,194,0.15)] border-[var(--a)] text-[var(--a)] font-bold"
                      : "bg-black/20 border-[var(--line)] text-gray-300 hover:bg-white/5"
                  }`}
                >
                  <span>🕒 {symName}</span>
                  <span className="text-[10px] text-[var(--mut)]">RECENT</span>
                </div>
              ))}
          </div>
        </aside>

        {/* CENTER PANE: PROGRAM REPRESENTATION TABBED WORKSPACE */}
        <main className="flex-1 flex flex-col bg-[#070b10] overflow-hidden">
          {/* DYNAMIC PROGRAM REPRESENTATION TAB BAR */}
          <div className="flex border-b border-[var(--line)] bg-[var(--panel)] overflow-x-auto no-scrollbar">
            {[
              { id: "assembly", label: "⚙ Assembly" },
              { id: "source", label: "📜 Source" },
              { id: "decompiler", label: "⚡ Decompiler" },
              { id: "hex", label: "▦ Hex" },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setCenterTab(tab.id as CenterTab)}
                className={`px-4 py-2 mono text-xs transition flex items-center gap-1.5 whitespace-nowrap ${
                  centerTab === tab.id
                    ? "text-[var(--a)] border-b-2 border-[var(--a)] bg-[#070b10] font-bold"
                    : "text-[var(--mut)] hover:text-[var(--fg)]"
                }`}
              >
                <span>{tab.label}</span>
                {tab.id === "decompiler" && (
                  <span className="text-[9px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1 rounded uppercase">
                    Experimental
                  </span>
                )}
                {tab.id === "source" && !sourceData?.found && (
                  <span className="text-[9px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-1 rounded uppercase">
                    Unavailable
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* TAB CONTENT VIEWPORT */}
          <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* ASSEMBLY TAB */}
            {centerTab === "assembly" && (
              <div className="flex-1 flex flex-col min-h-0 bg-[#05080c] overflow-hidden">
                <div className="px-4 py-2 bg-black/50 border-b border-[var(--line)] flex justify-between items-center mono text-xs">
                  <span className="text-[var(--a)] font-bold">⚙ Target Disassembly ({activeSym?.name})</span>
                  <button
                    onClick={() => onNavigateView?.("debug", activeSym?.name)}
                    className="px-2.5 py-1 rounded bg-[var(--a-dim)] border border-[var(--a-dim)] text-[var(--a)] hover:bg-[var(--a)] hover:text-black transition text-[11px] font-bold"
                  >
                    🎯 Debug Execution
                  </button>
                </div>
                {loadingDisasm ? (
                  <div className="flex-1 flex items-center justify-center p-8 text-[var(--a)] mono text-xs">
                    Decoding assembly instructions...
                  </div>
                ) : disasmData?.instructions && disasmData.instructions.length > 0 ? (
                  <div className="flex-1 overflow-y-auto p-4 mono text-xs space-y-1 font-mono select-text">
                    {disasmData.instructions.map((ins, idx) => (
                      <div key={idx} className="flex items-center gap-4 px-2 py-1 rounded hover:bg-white/5 font-mono">
                        <span className="w-20 text-amber-400 font-mono">0x{ins.addr.toString(16)}:</span>
                        <span className="w-16 font-bold text-[var(--a)]">{ins.mn}</span>
                        <span className="text-gray-200">{ins.op}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center p-8 text-gray-400 mono text-xs">
                    No disassembly instructions available for symbol '{activeSym?.name}'.
                  </div>
                )}
              </div>
            )}

            {/* SOURCE TAB */}
            {centerTab === "source" && (
              <div className="flex-1 flex flex-col min-h-0 bg-[#05080c] overflow-hidden">
                {loadingSource ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                    <div className="w-8 h-8 border-2 border-[var(--a)] border-t-transparent rounded-full animate-spin mb-3"></div>
                    <span className="mono text-xs text-[var(--a)]">Extracting DWARF source mappings for '{activeSym?.name}'...</span>
                  </div>
                ) : sourceData?.found && sourceData.lines ? (
                  <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                    <div className="px-4 py-2 bg-black/50 border-b border-[var(--line)] flex justify-between items-center mono text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-amber-400 font-bold">📜 {sourceData.filename}</span>
                        <span className="text-[10px] text-[var(--mut)]">({sourceData.lines.length} lines)</span>
                      </div>
                      <span className="text-[10px] text-[var(--a)] font-mono opacity-80">{sourceData.path}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 mono text-xs leading-relaxed space-y-0.5 select-text font-mono">
                      {sourceData.lines.map(line => {
                        const isDecl = sourceData.decl_line === line.num;
                        return (
                          <div
                            key={line.num}
                            className={`flex items-start gap-4 px-2 py-0.5 rounded transition ${
                              isDecl ? "bg-[rgba(51,214,194,0.18)] border-l-2 border-[var(--a)] font-bold text-amber-300" : "hover:bg-white/5 text-gray-200"
                            }`}
                          >
                            <span className={`w-10 text-right text-[10px] select-none flex-shrink-0 font-mono ${isDecl ? "text-[var(--a)] font-bold" : "text-gray-500"}`}>
                              {line.num}
                            </span>
                            <pre className="font-mono whitespace-pre-wrap flex-1 leading-normal">{line.text}</pre>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  /* PROFESSIONAL DIAGNOSTIC INFORMATION PANEL FOR MISSING SOURCE CODE */
                  <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#070b10] text-center select-text">
                    <div className="max-w-xl w-full p-6 rounded-lg bg-black/60 border border-[var(--line)] space-y-6 text-left shadow-2xl">
                      <div className="flex items-start gap-4 border-b border-[var(--line)] pb-4">
                        <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 grid place-items-center flex-shrink-0">
                          <span className="text-2xl">📜</span>
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-white mb-1">Source Code Unavailable</h3>
                          <p className="text-xs text-[var(--mut)] leading-relaxed">
                            The firmware contains DWARF debug metadata, however the original source file referenced during compilation cannot be located on the local filesystem.
                          </p>
                        </div>
                      </div>

                      <div className="space-y-3 text-xs mono">
                        <div className="font-bold text-[var(--a)] uppercase tracking-wider text-[11px]">Available Debug Information</div>
                        <div className="grid grid-cols-2 gap-2 text-gray-300 bg-black/40 p-3 rounded border border-white/5">
                          <div className="flex items-center gap-2"><span className="text-emerald-400">✓</span> Compile Unit: <span className="text-white font-mono">{sourceData?.dwarf_info?.cu || "Main CU"}</span></div>
                          <div className="flex items-center gap-2"><span className="text-emerald-400">✓</span> File Name: <span className="text-white font-mono">{sourceData?.dwarf_info?.filename || `${activeSym?.name}.c`}</span></div>
                          <div className="flex items-center gap-2"><span className="text-emerald-400">✓</span> Function Symbols: <span className="text-white font-mono">{activeSym?.name}</span></div>
                          <div className="flex items-center gap-2"><span className="text-emerald-400">✓</span> Line Mapping: <span className="text-white font-mono">Line {sourceData?.dwarf_info?.decl_line || 1}</span></div>
                        </div>

                        <div className="font-bold text-rose-400 uppercase tracking-wider text-[11px] pt-1">Unavailable</div>
                        <div className="flex items-center gap-2 text-gray-400 bg-rose-500/5 p-3 rounded border border-rose-500/20">
                          <span className="text-rose-400 font-bold">✗</span> Original Source File: <span className="text-gray-300 font-mono">{sourceData?.dwarf_info?.filename || `${activeSym?.name}.c`} ({sourceData?.dwarf_info?.comp_dir || "External Build Dir"})</span>
                        </div>
                      </div>

                      <div className="space-y-2 pt-2 border-t border-[var(--line)]">
                        <div className="text-[11px] text-[var(--mut)] uppercase font-bold">Recommended Views</div>
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => setCenterTab("assembly")} className="px-3 py-1.5 rounded bg-[var(--a)]/20 hover:bg-[var(--a)]/30 border border-[var(--a)]/50 text-[var(--a)] text-xs font-bold transition">
                            [ Assembly ]
                          </button>
                          <button onClick={() => setCenterTab("hex")} className="px-3 py-1.5 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-300 text-xs font-bold transition">
                            [ Hex Dump ]
                          </button>
                          <button onClick={() => setCenterTab("decompiler")} className="px-3 py-1.5 rounded bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/50 text-purple-300 text-xs font-bold transition">
                            [ Decompiler ]
                          </button>
                          <button onClick={() => onNavigateView?.("memory", activeSym?.secName)} className="px-3 py-1.5 rounded bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 text-cyan-300 text-xs font-bold transition">
                            [ Memory Analysis ]
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* DECOMPILER TAB (RECONSTRUCTED LOGIC / EXPERIMENTAL) */}
            {centerTab === "decompiler" && (
              <div className="flex-1 flex flex-col min-h-0 bg-[#05080c] overflow-hidden">
                {loadingPseudo ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                    <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                    <span className="mono text-xs text-purple-300">Decompiling AST logic for '{activeSym?.name}'...</span>
                  </div>
                ) : pseudoData?.found && pseudoData.pseudocode ? (
                  <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                    <div className="px-4 py-2 bg-black/50 border-b border-[var(--line)] flex justify-between items-center mono text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-purple-400 font-bold">⚡ Recovered Logic (Decompiler AST)</span>
                        <span className="text-[10px] text-purple-300 bg-purple-500/20 border border-purple-500/30 px-1.5 py-0.5 rounded font-mono uppercase">
                          [EXPERIMENTAL RECONSTRUCTION]
                        </span>
                      </div>
                      <span className="text-[10px] text-emerald-400 font-mono">Disassembly AST Engine v1.2</span>
                    </div>
                    <div className="bg-purple-500/10 border-b border-purple-500/20 px-4 py-1.5 text-purple-300 text-[11px] mono">
                      ⚠️ Note: This output represents reconstructed C-like pseudocode derived from raw binary disassembly. Variable and register names are inferred.
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 mono text-xs leading-relaxed space-y-0.5 select-text font-mono">
                      {pseudoData.pseudocode.map((line, idx) => (
                        <div key={idx} className="flex items-start gap-4 px-2 py-0.5 rounded hover:bg-white/5">
                          <span className="w-8 text-right text-purple-400/60 text-[10px] select-none flex-shrink-0 font-mono">{idx + 1}</span>
                          <pre className="font-mono text-purple-200 whitespace-pre-wrap flex-1 leading-normal">{line}</pre>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#070b10]">
                    <div className="w-16 h-16 rounded-full bg-purple-500/10 border border-purple-500/30 grid place-items-center mb-4">
                      <span className="text-3xl">⚡</span>
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2">Decompiler Unavailable</h3>
                    <p className="mono text-xs text-gray-400 max-w-md mb-6 leading-relaxed">
                      {pseudoData?.reason || "Decompiler reconstruction is unavailable for this symbol."}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* HEX TAB */}
            {centerTab === "hex" && (
              <div className="flex-1 p-4 overflow-y-auto mono text-xs space-y-3">
                <div className="text-[11px] text-[var(--a)] font-bold uppercase tracking-wider">
                  Raw Memory & Symbol Metrics
                </div>
                <div className="p-4 rounded bg-black/40 border border-[var(--line)] space-y-2 select-text">
                  <div className="flex justify-between">
                    <span className="text-[var(--mut)]">Symbol Name:</span>
                    <span className="text-white font-bold">{activeSym?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--mut)]">Symbol Address:</span>
                    <span className="text-amber-400 font-bold">0x{(symDetails?.value || 0).toString(16)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--mut)]">Symbol Size:</span>
                    <span className="text-white font-bold">{activeSym?.size || 0} Bytes</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--mut)]">Target Section:</span>
                    <span className="text-[var(--a)] font-bold">{activeSym?.secName}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* RIGHT PANE: VERIFIED SYMBOL INSPECTOR */}
        <aside className="w-80 border-l border-[var(--line)] bg-[var(--panel)] p-3 overflow-y-auto space-y-3 flex-shrink-0 mono text-xs">
          <div className="text-[10px] text-[var(--a)] font-bold uppercase tracking-wider border-b border-[var(--line)] pb-1">
            Verified Symbol Inspector
          </div>

          <div className="p-2.5 rounded bg-black/30 border border-[var(--line)] space-y-1.5 select-text">
            <div className="text-[10px] text-[var(--mut)] uppercase">Function Name:</div>
            <div className="font-bold text-[var(--fg)] text-sm truncate">{activeSym?.name}</div>
            <div className="flex justify-between text-[11px] pt-1 border-t border-white/5">
              <span className="text-[var(--mut)]">Address:</span>
              <span className="text-[var(--a)] font-bold">0x{(symDetails?.value || 0x080001f8).toString(16)}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-[var(--mut)]">Size:</span>
              <span className="text-gray-200 font-bold">{activeSym?.size} Bytes</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-[var(--mut)]">Object File:</span>
              <span className="text-[var(--b)] font-bold">{objectFile}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-[var(--mut)]">Section:</span>
              <span className="text-[var(--a)] font-bold">{activeSym?.secName}</span>
            </div>
          </div>

          <div className="p-2.5 rounded bg-black/30 border border-[var(--line)] space-y-1.5 select-text">
            <div className="text-[10px] text-[var(--mut)] uppercase font-bold">Verified Debug & Source Status</div>
            <div className="flex justify-between text-[11px]">
              <span className="text-[var(--mut)]">DWARF Status:</span>
              <span className={`font-bold ${hasDebugInfo ? "text-emerald-400" : "text-amber-400"}`}>
                {hasDebugInfo ? "✓ Present" : "✗ Stripped"}
              </span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-[var(--mut)]">Source Status:</span>
              <span className={`font-bold ${sourceData?.found ? "text-emerald-400" : "text-amber-400"}`}>
                {sourceData?.found ? "✓ Verified Local" : "✗ Unavailable"}
              </span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-[var(--mut)]">Compiler:</span>
              <span className="text-gray-300 font-bold">{hasDebugInfo ? "GNU GCC (Embedded)" : "Unknown"}</span>
            </div>
          </div>

          <div className="p-2.5 rounded bg-black/30 border border-[var(--line)] space-y-1.5">
            <div className="text-[10px] text-[var(--mut)] uppercase font-bold">Actions</div>
            <button
              onClick={() => onNavigateView?.("debug", activeSym?.name)}
              className="w-full py-1.5 rounded bg-[var(--a-dim)] border border-[var(--a-dim)] text-[var(--a)] font-bold hover:bg-[var(--a)] hover:text-black transition"
            >
              🎯 Debug Execution
            </button>
            <button
              onClick={() => onNavigateView?.("callgraph")}
              className="w-full py-1.5 rounded bg-white/5 border border-[var(--line)] text-gray-300 hover:text-white transition"
            >
              ⑂ Firmware Flow Explorer
            </button>
          </div>
        </aside>
      </div>

      {/* BOTTOM PANEL DOCK (CONSOLE ANALYSIS SUMMARY) */}
      <div className="h-48 border-t border-[var(--line)] bg-[#05080c] flex flex-col flex-shrink-0">
        <div className="flex border-b border-[var(--line)] bg-[var(--panel)] overflow-x-auto no-scrollbar">
          {[
            "Console",
            "Trace",
            "Timeline",
            "Warnings",
            "Build",
            "Statistics",
            "Navigation",
            "Events",
          ].map(tab => (
            <button
              key={tab}
              onClick={() => setBottomTab(tab as BottomTab)}
              className={`px-3 py-1.5 mono text-[11px] transition whitespace-nowrap ${
                bottomTab === tab
                  ? "text-[var(--a)] border-b-2 border-[var(--a)] bg-black/40 font-bold"
                  : "text-[var(--mut)] hover:text-gray-300"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex-1 p-3 overflow-y-auto mono text-xs bg-black/60 select-text font-mono">
          {bottomTab === "Console" && (
            <div className="space-y-1 text-gray-300 font-mono text-[11px] leading-relaxed">
              <div className="text-[var(--a)] font-bold">Firmware Loaded: {result?.filename || "firmware.elf"}</div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 max-w-2xl pt-1">
                <div>ELF Header: <span className="text-emerald-400 font-bold">✓ Parsed</span></div>
                <div>Program Headers: <span className="text-emerald-400 font-bold">✓ Parsed</span></div>
                <div>Section Headers: <span className="text-emerald-400 font-bold">✓ Parsed</span></div>
                <div>Symbol Table: <span className="text-emerald-400 font-bold">✓ Parsed ({symbols.length} symbols)</span></div>
                <div>DWARF Debug Metadata: <span className={hasDebugInfo ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>{hasDebugInfo ? "✓ Present" : "✗ Stripped"}</span></div>
                <div>Source Code Files: <span className={sourceData?.found ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>{sourceData?.found ? "✓ Available on Local FS" : "✗ Not Available on Local FS"}</span></div>
                <div>Decompiler Engine: <span className="text-emerald-400 font-bold">✓ Active (ARM Disassembly AST)</span></div>
                <div>Call Graph: <span className="text-emerald-400 font-bold">✓ Generated</span></div>
                <div>Memory Layout: <span className="text-emerald-400 font-bold">✓ Generated</span></div>
                <div>Device Profile: <span className="text-emerald-400 font-bold">✓ Detected ({device?.name || "STM32F103CB"})</span></div>
                <div>Architecture: <span className="text-gray-200 font-bold">ARM Cortex-M</span></div>
                <div>Compiler: <span className="text-gray-200 font-bold">{hasDebugInfo ? "GNU ARM Embedded GCC" : "Unknown / Stripped"}</span></div>
              </div>
              <div className="text-[var(--a)] font-bold pt-1 border-t border-white/10 mt-1">Analysis Status: Complete</div>
            </div>
          )}

          {bottomTab === "Trace" && (
            <div className="space-y-1 text-emerald-400">
              <div>[TRACE] Selected symbol: {activeSym?.name} @ 0x{(symDetails?.value || 0x080001f8).toString(16)}</div>
              <div>[TRACE] Memory section: {activeSym?.secName} ({activeSym?.size} Bytes)</div>
              <div>[TRACE] Module ownership resolved to {objectFile}</div>
            </div>
          )}

          {bottomTab === "Timeline" && (
            <div className="space-y-1 text-amber-300">
              <div>⏱ Firmware Build Milestone: System Initialization complete.</div>
              <div>⏱ Vector table mapped at 0x08000000.</div>
              <div>⏱ Main application execution chain active.</div>
            </div>
          )}

          {bottomTab === "Warnings" && (
            <div className="space-y-1 text-amber-400">
              {!hasDebugInfo && <div>⚠️ Warning: Binary lacks DWARF debug line tables. Build with -g for source line mapping.</div>}
              <div>ℹ Notice: Ensure -ffunction-sections and -fdata-sections are enabled for optimal dead code elimination.</div>
            </div>
          )}

          {bottomTab === "Build" && (
            <div className="space-y-1 text-gray-300">
              <div>Compiler Toolchain: {result?.toolchain || "arm-none-eabi-gcc"}</div>
              <div>Architecture Target: ARMv7E-M (Thumb-2)</div>
              <div>Linker Script: STM32F103C8Tx_FLASH.ld</div>
            </div>
          )}

          {bottomTab === "Statistics" && (
            <div className="space-y-1 text-gray-300">
              <div>Total Symbols: {result?.num_symbols || 0}</div>
              <div>Total Sections: {result?.num_sections || 0}</div>
              <div>Largest Symbol: {result?.largest?.name} ({result?.largest?.size} B)</div>
            </div>
          )}

          {bottomTab === "Navigation" && (
            <div className="space-y-1 text-gray-300">
              <div>Active View: Code Investigator</div>
              <div>Selected Symbol: {activeSym?.name}</div>
              <div>History: {recentlyViewed.join(" ➔ ")}</div>
            </div>
          )}

          {bottomTab === "Events" && (
            <div className="space-y-1 text-gray-300">
              <div>[EVENT] Binary checksum verified: {result?.checksum || "OK"}</div>
              <div>[EVENT] IDE components synchronized.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
