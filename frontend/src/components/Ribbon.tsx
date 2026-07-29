import type { ParseResult } from "../App";
import type { Device } from "../utils/devices";
import { DB, DB_ORDER } from "../utils/devices";
export default function Ribbon({ title, result, loading, accent, device, override, setOverride, cycleAccent, onJSON, onCSV, onReset }: { title: string; result: ParseResult | null; loading: boolean; accent: string; device: Device | null; override: string; setOverride: (s: string) => void; cycleAccent: () => void; onJSON: () => void; onCSV: () => void; onReset: () => void; }) {
  return (
    <div className="ribbon">
      <span className="crumb">WORKBENCH <b>/</b> {title}</span>
      <span className="spacer" />
      {result && device && (<span className="chip" title="target device — override in Settings"><span className="mut">target</span><select value={override} onChange={e => setOverride(e.target.value)} style={{ background: "transparent", border: 0, color: "var(--a)", fontFamily: "JetBrains Mono", fontSize: 11, outline: "none", cursor: "pointer" }}><option value="">auto · {device.name}</option>{DB_ORDER.map(id => <option key={id} value={id}>{DB[id].name}</option>)}<option value="generic">Cortex-M · generic</option></select></span>)}
      {result && <span className="chip"><span className="v">{result.filename}</span><span className="a">{result.arch}</span><span>{result.elf_class}-bit</span></span>}
      {result && <button className="btn-hw" onClick={cycleAccent} title="swap trace accent">{accent === "signal" ? "◐ signal" : "◑ phosphor"}</button>}
      {result && <button className="btn-hw" onClick={onCSV}>CSV</button>}
      {result && <button className="btn-hw primary" onClick={onJSON}>Export</button>}
      {result && <button className="btn-hw" onClick={onReset} title="load another binary">↻ new</button>}
      <span className="chip"><span className={`dot ${loading ? "busy" : ""}`} />{loading ? "parsing" : "idle"}</span>
    </div>
  );
}
