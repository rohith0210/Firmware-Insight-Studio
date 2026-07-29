import type { ParseResult } from "../App";
export default function Ribbon({ title, result, loading, accent, cycleAccent, onJSON, onCSV, onReset }: {
  title: string; result: ParseResult | null; loading: boolean; accent: string;
  cycleAccent: () => void; onJSON: () => void; onCSV: () => void; onReset: () => void;
}) {
  return (
    <div className="ribbon">
      <span className="crumb">WORKBENCH <b>/</b> {title}</span>
      <span className="spacer" />
      {result && (
        <>
          <span className="chip"><span className="v">{result.filename}</span><span className="a">{result.arch}</span><span>{result.elf_class}-bit</span></span>
          <button className="btn-hw" onClick={cycleAccent} title="Swap trace accent">{accent === "signal" ? "◐ signal" : "◑ phosphor"}</button>
          <button className="btn-hw" onClick={onCSV}>CSV</button>
          <button className="btn-hw primary" onClick={onJSON}>Export</button>
          <button className="btn-hw" onClick={onReset} title="Load another binary">↻ new</button>
        </>
      )}
      <span className="chip"><span className={`dot ${loading ? "busy" : ""}`} />{loading ? "parsing" : "idle"}</span>
    </div>
  );
}
