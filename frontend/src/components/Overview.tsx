import type { ParseResult } from "../App";
function heat(r: number) { return r > 0.6 ? "#e0566b" : r > 0.32 ? "#f0a830" : r > 0.15 ? "#e0c84a" : "var(--a)"; }
export default function Overview({ result }: { result: ParseResult }) {
  const s = result.summary || {};
  const flash = (s[".text"] || 0) + (s[".rodata"] || 0), ram = (s[".data"] || 0) + (s[".bss"] || 0), tot = flash + ram || 1;
  const segs = [[".text", s[".text"] || 0, "var(--a)"], [".rodata", s[".rodata"] || 0, "var(--a-dim)"], [".data", s[".data"] || 0, "var(--b)"], [".bss", s[".bss"] || 0, "var(--b-dim)"]] as const;
  const top = result.symbols.filter(x => x.size > 0).slice(0, 10);
  const max = top[0]?.size || 1;
  const Spec = ({ k, v, c }: { k: string; v: string; c?: string }) => (<div className="row"><span className="k">{k}</span><span className={`v ${c || ""}`}>{v}</span></div>);
  return (
    <div className="grid lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 panel">
        <div className="panel-head"><span>Firmware Overview</span><span className="tag">{result.filename}</span></div>
        <div className="p-4">
          <div className="spec">
            <Spec k="Binary" v={result.filename} />
            <Spec k="Architecture" v={result.arch} c="a" />
            <Spec k="ELF Class" v={`${result.elf_class || "—"}-bit`} />
            <Spec k="Entry Address" v={result.entry} c="a" />
            <Spec k="Toolchain" v={result.toolchain || "—"} />
            <Spec k="CRC-32" v={`0x${result.checksum || "—"}`} c="b" />
            <Spec k="Sections" v={String(result.num_sections ?? result.sections.length)} />
            <Spec k="Symbols" v={String(result.num_symbols ?? result.symbols.length)} />
            <Spec k="File Size" v={`${((result.file_size || 0) / 1024).toFixed(2)} KB`} />
            <Spec k="Largest Symbol" v={`${result.largest?.name || "—"} · ${((result.largest?.size || 0) / 1024).toFixed(2)} KB`} c="b" />
          </div>
          <div className="mt-4">
            <div className="flex h-7 rounded-[2px] overflow-hidden border ln">
              {segs.map(([l, v, c]) => v > 0 && <div key={l} title={`${l} · ${(v / 1024).toFixed(2)} KB`} style={{ width: `${(v / tot) * 100}%`, background: c, borderRight: "1px solid rgba(0,0,0,.4)" }} />)}
            </div>
            <div className="flex flex-wrap gap-4 mt-3 mono text-[11px] mut">
              {segs.map(([l, v, c]) => <span key={l} className="flex items-center gap-1.5"><span style={{ width: 9, height: 9, background: c, display: "inline-block" }} />{l} <span className="fg">{((v / tot) * 100).toFixed(1)}%</span></span>)}
            </div>
          </div>
        </div>
      </div>
      <div className="panel">
        <div className="panel-head"><span>Largest Consumers</span><span className="tag">top 10</span></div>
        <div className="p-3">
          {top.length === 0 && <div className="mut mono text-[12px] py-6 text-center">no sized symbols</div>}
          {top.map((x, i) => (
            <div className="cons-row" key={i}>
              <span className="nm" title={x.name}>{x.name}</span>
              <span className="bar"><i style={{ width: `${(x.size / max) * 100}%`, background: heat(x.size / max) }} /></span>
              <span className="sz">{x.size} B</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
