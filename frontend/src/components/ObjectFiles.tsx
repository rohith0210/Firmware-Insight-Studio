import { useState, useMemo, useEffect } from "react";
import type { ParseResult } from "../App";

export default function ObjectFiles({ result, targetSymbol }: { result: ParseResult; targetSymbol?: string | any }) {
  const targetName = typeof targetSymbol === "string" ? targetSymbol : targetSymbol?.name;

  // Find the object module containing the target symbol or default to first module
  const targetModule = useMemo(() => {
    if (!targetName || !result.objects) return null;
    return result.objects.find(o => o.funcs && o.funcs.includes(targetName)) || null;
  }, [targetName, result.objects]);

  const [open, setOpen] = useState<string | null>(targetModule?.name || (result.objects?.[0]?.name || null));

  useEffect(() => {
    if (targetModule?.name) {
      setOpen(targetModule.name);
    }
  }, [targetModule?.name]);

  const mods = (result.objects || []).filter(o => o.kind === "module");
  const files = (result.objects || []).filter(o => o.kind === "file");
  const max = Math.max(1, ...mods.map(m => m.size));

  // Compute flash vs RAM for a module's symbols
  const getModuleStats = (m: any) => {
    const funcs = m.funcs || [];
    const moduleSyms = result.symbols.filter(s => funcs.includes(s.name));
    const flash = moduleSyms.filter(s => s.section === ".text" || s.section === ".rodata").reduce((a, b) => a + (b.size || 0), 0) || m.size || 0;
    const ram = moduleSyms.filter(s => s.section === ".data" || s.section === ".bss").reduce((a, b) => a + (b.size || 0), 0);
    const sections = Array.from(new Set(moduleSyms.map(s => s.section))).filter(Boolean);
    return { flash, ram, symbols: moduleSyms, sections: sections.length ? sections : [".text"] };
  };

  return (
    <div className="panel space-y-4">
      <div className="panel-head flex justify-between items-center">
        <div>
          <span>Object File Contribution</span>
          <span className="tag ml-2">{mods.length} modules · {files.length} translation units</span>
        </div>
        {targetName && (
          <div className="mono text-[10px] acc bg-[rgba(51,214,194,0.1)] px-2 py-1 rounded border border-[var(--a-dim)]">
            Locating object for: {targetName}
          </div>
        )}
      </div>

      <div className="p-4 space-y-3">
        <div className="mono text-[10px] mut px-1">
          Modules grouped by symbol prefix (e.g. HAL_GPIO_* → HAL_GPIO); translation units are real STT_FILE entries from ELF.
        </div>

        <div className="space-y-2">
          {mods.map(m => {
            const stats = getModuleStats(m);
            const isOpen = open === m.name;
            const isTarget = targetModule?.name === m.name;

            return (
              <div
                key={m.name}
                className={`border rounded-md transition-all duration-300 ${
                  isTarget
                    ? "border-[var(--a)] bg-[rgba(51,214,194,0.06)] shadow-[0_0_15px_rgba(51,214,194,0.2)]"
                    : "border-[var(--line)] bg-[var(--panel2)]"
                }`}
              >
                <div
                  className="cons-row cursor-pointer p-3 flex items-center justify-between"
                  onClick={() => setOpen(isOpen ? null : m.name)}
                >
                  <div className="flex items-center gap-2" style={{ width: "35%" }}>
                    <span className="acc">{isOpen ? "▾" : "▸"}</span>
                    <span className="font-bold fg text-sm truncate" title={m.name}>{m.name}</span>
                    {isTarget && (
                      <span className="mono text-[9px] uppercase px-1.5 py-0.5 rounded bg-[var(--a)] text-black font-bold">
                        Target
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 flex-1 px-4">
                    <span className="bar flex-1 h-2 bg-[var(--line)] rounded-full overflow-hidden">
                      <i className="h-full block rounded-full transition-all duration-500" style={{ width: `${(m.size / max) * 100}%`, background: "var(--a)" }} />
                    </span>
                    <span className="sz mono text-[12px] fg font-bold w-20 text-right">
                      {(m.size / 1024).toFixed(2)} KB
                    </span>
                  </div>

                  <div className="mut mono text-[11px] w-16 text-right">
                    {m.count} sym
                  </div>
                </div>

                {isOpen && (
                  <div className="p-4 border-t border-[var(--line)] bg-black/20 space-y-3" style={{ animation: "tmSlide .2s ease-out" }}>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-[var(--panel)] border border-[var(--line)] rounded p-2">
                        <div className="mono text-[9px] mut uppercase">Object Name</div>
                        <div className="mono text-xs font-bold fg truncate">{m.name}.o</div>
                      </div>
                      <div className="bg-[var(--panel)] border border-[var(--line)] rounded p-2">
                        <div className="mono text-[9px] mut uppercase">Flash Usage</div>
                        <div className="mono text-xs font-bold acc">{(stats.flash / 1024).toFixed(2)} KB</div>
                      </div>
                      <div className="bg-[var(--panel)] border border-[var(--line)] rounded p-2">
                        <div className="mono text-[9px] mut uppercase">RAM Contribution</div>
                        <div className="mono text-xs font-bold acc2">{stats.ram ? `${(stats.ram / 1024).toFixed(2)} KB` : "0 B"}</div>
                      </div>
                      <div className="bg-[var(--panel)] border border-[var(--line)] rounded p-2">
                        <div className="mono text-[9px] mut uppercase">Compiler Sections</div>
                        <div className="mono text-xs font-bold fg truncate">{stats.sections.join(", ")}</div>
                      </div>
                    </div>

                    <div>
                      <div className="mono text-[10px] mut uppercase tracking-wider mb-2">Contained Symbols ({m.funcs?.length || 0})</div>
                      <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 bg-black/30 rounded border border-[var(--line)]">
                        {(m.funcs || []).map((f: string) => {
                          const isSymTarget = f === targetName;
                          return (
                            <span
                              key={f}
                              className={`mono text-[11px] px-2 py-0.5 rounded border transition-colors ${
                                isSymTarget
                                  ? "bg-[var(--a)] text-black border-[var(--a)] font-bold shadow-[0_0_8px_rgba(51,214,194,0.6)]"
                                  : "bg-[rgba(255,255,255,0.03)] border-[var(--line)] fg hover:border-[var(--a-dim)]"
                              }`}
                            >
                              {f}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {files.length > 0 && (
          <div className="mt-6 pt-4 border-t border-[var(--line)]">
            <div className="mono text-[10px] mut uppercase tracking-widest mb-2 px-1">
              Translation Units (STT_FILE)
            </div>
            <div className="flex flex-wrap gap-2">
              {files.map((f, i) => (
                <span key={i} className="mono text-[11px] px-2 py-1 rounded bg-[var(--panel2)] border border-[var(--line)] fg">
                  📄 {f.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
