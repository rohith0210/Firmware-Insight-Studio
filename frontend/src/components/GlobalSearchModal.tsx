import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import type { ParseResult, View } from "../App";
import type { Device } from "../utils/devices";
import { DB_ORDER, DB } from "../utils/devices";

export type SearchResultItem = {
  id: string;
  category: "symbol" | "section" | "object" | "interrupt" | "peripheral" | "device" | "view";
  title: string;
  subtitle: string;
  badge?: string;
  icon: string;
  actionView: View;
  payload?: any;
};

export default function GlobalSearchModal({
  isOpen,
  onClose,
  result,
  device,
  onNavigate,
  onSelectSymbol,
}: {
  isOpen: boolean;
  onClose: () => void;
  result: ParseResult | null;
  device?: Device | null;
  onNavigate: (view: View, param?: string) => void;
  onSelectSymbol: (symbol: any) => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Global Keyboard Listener (Ctrl+K or Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (isOpen) onClose();
        else setQuery("");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Aggregate searchable items
  const items = useMemo<SearchResultItem[]>(() => {
    const list: SearchResultItem[] = [];

    // Core Workspaces / Views
    const views: { id: View; title: string; subtitle: string; icon: string }[] = [
      { id: "overview", title: "Overview Workspace", subtitle: "Firmware binary summary and memory pressure", icon: "◧" },
      { id: "memory", title: "Memory Analysis", subtitle: "Squarified Flash/RAM treemap and region inspector", icon: "▤" },
      { id: "investigator", title: "Code Investigator", subtitle: "Integrated Source, Assembly, Pseudocode & XRefs", icon: "🔍" },
      { id: "callgraph", title: "Call Graph", subtitle: "Function call tree & ISR execution path visualization", icon: "⑂" },
      { id: "debug", title: "Execution Workspace", subtitle: "Cortex-M disassembler & CPU step debugger", icon: "🎯" },
      { id: "dev_explorer", title: "Device Explorer", subtitle: "Microcontroller architecture, startup & vector table", icon: "🖳" },
      { id: "optimize", title: "Optimization", subtitle: "Bloat analysis, dead code elimination & heap fragmentation", icon: "✦" },
      { id: "compare", title: "Build Compare", subtitle: "Binary snapshot diffing & footprint delta metrics", icon: "⇄" },
      { id: "reports", title: "Reports", subtitle: "JSON/CSV symbol exports and verification reports", icon: "⎙" },
      { id: "settings", title: "Settings", subtitle: "IDE options, theme selection and MCU profile overrides", icon: "⚙" },
    ];

    views.forEach(v => {
      list.push({
        id: `view:${v.id}`,
        category: "view",
        title: v.title,
        subtitle: v.subtitle,
        icon: v.icon,
        actionView: v.id,
      });
    });

    if (result) {
      // Symbols / Functions
      if (result.symbols) {
        result.symbols.slice(0, 150).forEach(sym => {
          const isFunc = sym.type === "STT_FUNC" || sym.section === ".text";
          list.push({
            id: `sym:${sym.name}`,
            category: "symbol",
            title: sym.name,
            subtitle: `Address: 0x${sym.value.toString(16)} · Size: ${sym.size} Bytes · Section: ${sym.section}`,
            badge: isFunc ? "FUNC" : "VAR",
            icon: isFunc ? "ƒ" : "x",
            actionView: "investigator",
            payload: sym,
          });
        });
      }

      // Memory Sections
      if (result.sections) {
        result.sections.forEach(sec => {
          list.push({
            id: `sec:${sec.name}`,
            category: "section",
            title: sec.name,
            subtitle: `Address: 0x${sec.addr.toString(16)} · Size: ${sec.size} Bytes · Type: ${sec.type}`,
            badge: "SECTION",
            icon: "▤",
            actionView: "memory",
            payload: sec,
          });
        });
      }

      // Object Files
      if (result.objects) {
        result.objects.forEach(obj => {
          list.push({
            id: `obj:${obj.name}`,
            category: "object",
            title: obj.name,
            subtitle: `Contains ${obj.symbol_count || obj.symbols?.length || 0} symbols · Total Size: ${obj.size || 0} B`,
            badge: "OBJECT",
            icon: "📦",
            actionView: "investigator",
            payload: obj,
          });
        });
      }

      // Interrupts / ISRs
      if (result.isrs) {
        result.isrs.forEach(isr => {
          list.push({
            id: `isr:${isr.name}`,
            category: "interrupt",
            title: isr.name,
            subtitle: `Vector #${isr.vector || 0} · Handled by: ${isr.handler || isr.name}`,
            badge: "ISR",
            icon: "⚡",
            actionView: "dev_explorer",
            payload: isr,
          });
        });
      }

      // Peripherals
      if (result.peripherals) {
        result.peripherals.forEach(p => {
          list.push({
            id: `periph:${p.name}`,
            category: "peripheral",
            title: p.name,
            subtitle: `Base Address: 0x${(p.base || 0x40000000).toString(16)} · Registers: ${p.registers?.length || 0}`,
            badge: "PERIPHERAL",
            icon: "🎛️",
            actionView: "dev_explorer",
            payload: p,
          });
        });
      }
    }

    // Devices Database
    DB_ORDER.forEach(id => {
      const d = DB[id];
      if (d) {
        list.push({
          id: `dev:${d.id}`,
          category: "device",
          title: `${d.vendor} ${d.name}`,
          subtitle: `${d.architecture} (${d.core}) · Flash: ${Math.round((d.flashSize || 0) / 1024)}KB · SRAM: ${Math.round((d.sramSize || 0) / 1024)}KB`,
          badge: d.family || d.vendor,
          icon: "🖳",
          actionView: "dev_explorer",
          payload: d,
        });
      }
    });

    return list;
  }, [result]);

  // Filtered Results
  const filtered = useMemo(() => {
    if (!query.trim()) return items.slice(0, 20);
    const q = query.toLowerCase().trim();
    return items
      .filter(
        it =>
          it.title.toLowerCase().includes(q) ||
          it.subtitle.toLowerCase().includes(q) ||
          (it.badge && it.badge.toLowerCase().includes(q))
      )
      .slice(0, 30);
  }, [items, query]);

  const handleSelect = (item: SearchResultItem) => {
    if (item.category === "symbol" && item.payload) {
      onSelectSymbol(item.payload);
      onNavigate("investigator", item.payload.name);
    } else if (item.category === "device") {
      onNavigate("dev_explorer");
    } else {
      onNavigate(item.actionView);
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % Math.max(1, filtered.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filtered.length) % Math.max(1, filtered.length));
    } else if (e.key === "Enter" && filtered[selectedIndex]) {
      e.preventDefault();
      handleSelect(filtered[selectedIndex]);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start justify-center pt-20 p-4 select-none font-sans">
      <div className="bg-[var(--panel)] border border-[var(--line)] rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[580px] mono text-xs">
        {/* SEARCH INPUT BAR */}
        <div className="px-4 py-3 border-b border-[var(--line)] bg-black/40 flex items-center gap-3">
          <span className="text-[var(--a)] text-base font-bold">🔍</span>
          <input
            type="text"
            autoFocus
            placeholder="Search functions, symbols, sections, object files, interrupts, devices (e.g. main, .text, USART1)..."
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent border-0 outline-none text-white text-xs placeholder-gray-500 font-mono"
          />
          <kbd className="px-2 py-0.5 rounded bg-white/10 border border-white/10 text-[10px] text-gray-400 font-mono">
            ESC
          </kbd>
        </div>

        {/* RESULTS LIST */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-gray-500 space-y-1">
              <div className="text-base">No matching elements found</div>
              <div className="text-[11px] text-[var(--mut)]">Try searching for symbol names, hex addresses, or sections.</div>
            </div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`p-2.5 rounded-lg border cursor-pointer transition flex items-center justify-between gap-3 ${
                    isSelected
                      ? "bg-[rgba(51,214,194,0.15)] border-[var(--a)] text-white shadow"
                      : "bg-black/20 border-transparent hover:bg-white/5 text-gray-300"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-7 h-7 rounded flex items-center justify-center font-bold text-xs ${isSelected ? "bg-[var(--a)] text-black" : "bg-black/40 text-[var(--a)] border border-[var(--line)]"}`}>
                      {item.icon}
                    </span>
                    <div className="min-w-0">
                      <div className="font-bold text-white text-xs truncate flex items-center gap-2">
                        <span>{item.title}</span>
                        {item.badge && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/10 text-[var(--a)] border border-white/10 uppercase">
                            {item.badge}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-[var(--mut)] truncate">{item.subtitle}</div>
                    </div>
                  </div>

                  <span className="text-[10px] text-gray-400 font-mono flex items-center gap-1">
                    <span>Jump to</span>
                    <span className="text-[var(--a)] font-bold">↵</span>
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="px-4 py-2 border-t border-[var(--line)] bg-black/60 flex justify-between items-center text-[10px] text-[var(--mut)]">
          <div className="flex items-center gap-3">
            <span><kbd className="px-1 py-0.5 rounded bg-white/10">↑</kbd> <kbd className="px-1 py-0.5 rounded bg-white/10">↓</kbd> Navigate</span>
            <span><kbd className="px-1 py-0.5 rounded bg-white/10">↵</kbd> Select</span>
          </div>
          <div>Firmware Insight Universal Search (Ctrl+K) {device ? `· Target: ${device.name}` : ""}</div>
        </div>
      </div>
    </div>,
    document.body
  );
}
