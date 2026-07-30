import { useMemo } from "react";
import type { ParseResult } from "../App";

export default function SourceViewer({ result, targetSymbol }: { result: ParseResult; targetSymbol?: string | any }) {
  const symbolName = typeof targetSymbol === "string" ? targetSymbol : targetSymbol?.name || "main";
  const hasDebug = !!(result.has_debug_symbols || result.sections?.some(s => s.name.startsWith(".debug_")));

  const sym = useMemo(() => {
    return result.symbols.find(s => s.name === symbolName) || result.symbols.find(s => s.name === "main") || result.symbols[0];
  }, [result.symbols, symbolName]);

  // Mock code rendering for demo when debug symbols exist
  const mockLines = useMemo(() => {
    if (!sym) return [];
    return [
      `// Source file: src/${sym.name.toLowerCase()}.c`,
      `// Target section: ${sym.section} (Address: 0x${sym.value.toString(16)})`,
      `#include <stdint.h>`,
      `#include <stdbool.h>`,
      ``,
      `/**`,
      ` * @brief ${sym.name} execution routine`,
      ` * Symbol size: ${sym.size} bytes`,
      ` */`,
      `void ${sym.name}(void) {`,
      `    /* First executable line */`,
      `    uint32_t status = 0x00000000;`,
      `    volatile uint32_t *reg = (uint32_t *)0x40021000;`,
      ``,
      `    // Initialize hardware peripheral registers`,
      `    *reg |= (1 << 0);`,
      `    for (int i = 0; i < 100; i++) {`,
      `        __asm__ volatile ("nop");`,
      `    }`,
      `    (void)status;`,
      `}`,
    ];
  }, [sym]);

  return (
    <div className="panel flex flex-col h-full overflow-hidden" style={{ animation: "tmSlide .22s ease-out" }}>
      <div className="panel-head flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span>Source Viewer</span>
          <span className="tag">{sym ? sym.name : "No symbol"}</span>
        </div>
        <div className="mono text-[10px] mut">
          {hasDebug ? "DWARF Debug Info Present" : "No DWARF Debug Info"}
        </div>
      </div>

      <div className="p-4 flex-1 overflow-auto">
        {!hasDebug ? (
          <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8 border border-[var(--line)] rounded-lg bg-[rgba(10,14,22,0.6)]">
            <div className="w-16 h-16 rounded-full bg-[rgba(240,168,48,0.1)] border border-[rgba(240,168,48,0.3)] grid place-items-center mb-6">
              <span className="text-3xl text-[var(--b)]">📜</span>
            </div>
            
            <h2 className="font-display text-2xl font-bold fg mb-2">Source unavailable</h2>
            <p className="mono text-[13px] mut max-w-md mb-6 leading-relaxed">
              This firmware was built without debug symbols.
            </p>

            <div className="bg-black/40 border border-[var(--line)] rounded p-4 text-left mono text-[12px] max-w-md w-full mb-6">
              <div className="mut text-[10px] uppercase tracking-wider mb-2">Rebuild using:</div>
              <div className="acc font-bold text-sm bg-[rgba(51,214,194,0.08)] px-3 py-2 rounded border border-[var(--a-dim)]">
                -g
              </div>
              <div className="mut text-[10px] my-1 text-center">or</div>
              <div className="acc font-bold text-sm bg-[rgba(51,214,194,0.08)] px-3 py-2 rounded border border-[var(--a-dim)]">
                -g3
              </div>
              <div className="mut text-[10px] mt-3">to enable source navigation.</div>
            </div>

            <div className="mono text-[11px] mut max-w-sm">
              Without DWARF line tables, machine instructions cannot be mapped back to C/C++ source code lines.
            </div>
          </div>
        ) : (
          <div className="border border-[var(--line)] rounded-lg overflow-hidden bg-[#070b12] font-mono text-[12px]">
            <div className="bg-[var(--panel2)] px-4 py-2 border-b border-[var(--line)] flex justify-between items-center text-[11px] mut">
              <span>src/{sym?.name.toLowerCase()}.c</span>
              <span>Function: <strong className="fg">{sym?.name}</strong> @ 0x{sym?.value.toString(16)}</span>
            </div>
            <div className="p-3 overflow-x-auto space-y-1">
              {mockLines.map((line, idx) => {
                const isExecutableLine = idx === 10;
                return (
                  <div
                    key={idx}
                    className={`flex gap-4 px-2 py-1 rounded ${
                      isExecutableLine
                        ? "bg-[rgba(51,214,194,0.15)] border-l-4 border-[var(--a)] font-bold text-[#d6fff9]"
                        : "hover:bg-white/5"
                    }`}
                  >
                    <span className="w-8 text-right mut select-none">{idx + 1}</span>
                    <span className={isExecutableLine ? "acc" : "fg"}>{line}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
