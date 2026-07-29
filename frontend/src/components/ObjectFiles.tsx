import { useState } from "react";
import type { ParseResult } from "../App";
export default function ObjectFiles({ result }: { result: ParseResult }) {
  const [open, setOpen] = useState<string | null>(null);
  const mods = (result.objects || []).filter(o => o.kind === "module");
  const files = (result.objects || []).filter(o => o.kind === "file");
  const max = Math.max(1, ...mods.map(m => m.size));
  return (
    <div className="panel">
      <div className="panel-head"><span>Object File Contribution</span><span className="tag">{mods.length} modules · {files.length} translation units</span></div>
      <div className="p-3">
        <div className="mono text-[10px] mut mb-2 px-1">modules grouped by symbol prefix (HAL_GPIO_* → HAL_GPIO); translation units are the real STT_FILE names from the ELF.</div>
        <div className="space-y-1">
          {mods.map(m => (
            <div key={m.name}>
              <div className="cons-row cursor-pointer" onClick={() => setOpen(open === m.name ? null : m.name)}>
                <span className="nm" style={{ width: "30%" }} title={m.name}>{open === m.name ? "▾" : "▸"} {m.name}</span>
                <span className="bar"><i style={{ width: `${(m.size / max) * 100}%`, background: "var(--a)" }} /></span>
                <span className="sz">{(m.size / 1024).toFixed(2)} KB</span>
                <span className="mut mono text-[10px] w-12 text-right">{m.count} fn</span>
              </div>
              {open === m.name && <div className="ml-7 mb-1">{(m.funcs || []).map((f, i) => <div key={i} className="fn"><span>{f}</span></div>)}</div>}
            </div>
          ))}
        </div>
        {files.length > 0 && (
          <div className="mt-4 pt-3 border-t ln">
            <div className="mono text-[10px] mut uppercase tracking-widest mb-2 px-1">translation units (STT_FILE)</div>
            <div className="flex flex-wrap gap-2">{files.map((f, i) => <span key={i} className="tagpill fg">{f.name}</span>)}</div>
          </div>
        )}
      </div>
    </div>
  );
}
