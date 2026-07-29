import { useEffect, useMemo, useRef, useState } from "react";
import type { ParseResult } from "../App";

type Instr = { addr: number; bytes: string; mn: string; op: string; t: string[]; w: string[] };
type Dis = { func: { name: string; addr: number; size: number }; thumb: boolean; arch: string; instructions: Instr[]; touched: string[]; written: string[]; schema: { n: string; role: string }[] };
type Log = { c: "o" | "a" | "b" | "e" | "m"; t: string };

export default function Disassembler({ result }: { result: ParseResult }) {
  const funcs = useMemo(() => result.symbols.filter(s => s.type === "STT_FUNC" && s.size > 0).map(s => s.name), [result]);
  const [name, setName] = useState<string>(funcs.includes("main") ? "main" : funcs[0] || "");
  const [dis, setDis] = useState<Dis | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [bps, setBps] = useState<Set<number>>(new Set());
  const [log, setLog] = useState<Log[]>([
    { c: "a", t: "Firmware Insight · static debug console" },
    { c: "m", t: "no live target attached — register values are a model; usage is derived from disassembly." },
    { c: "m", t: "type 'help' for commands. click an address dot to set a breakpoint." },
  ]);
  const [cmd, setCmd] = useState("");
  const [hist, setHist] = useState<string[]>([]);
  const [hi, setHi] = useState(-1);
  const logRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ dis, name, bps });
  stateRef.current = { dis, name, bps };
  const pad = result.elf_class === 64 ? 12 : 8;
  const hex = (n: number) => n.toString(16).padStart(pad, "0");

  useEffect(() => { if (!name) return; let alive = true; setErr(null);
    fetch(`http://localhost:8000/api/disasm?checksum=${result.checksum}&name=${encodeURIComponent(name)}`)
      .then(async r => { if (!r.ok) throw new Error((await r.json()).detail || "disasm failed"); return r.json(); })
      .then((d: Dis) => { if (alive) { setDis(d); push("a", `disassembled ${d.func.name} @ 0x${hex(d.func.addr)} · ${d.instructions.length} insn · ${d.thumb ? "thumb" : "arm"}`); } })
      .catch(e => { if (alive) { setDis(null); setErr(e.message); push("e", e.message); } });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, result.checksum]);

  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight); }, [log]);
  const push = (c: Log["c"], t: string) => setLog(l => [...l, { c, t }]);

  const toggleBp = (addr: number) => {
    setBps(prev => { const n = new Set(prev); n.has(addr) ? n.delete(addr) : n.add(addr);
      push(n.has(addr) ? "b" : "m", `${n.has(addr) ? "breakpoint set" : "breakpoint cleared"} @ 0x${hex(addr)}`); return n; });
  };

  const run = (raw: string) => {
    const line = raw.trim(); if (!line) return;
    push("o", "› " + line); setHist(h => [...h, line]); setHi(-1);
    const [c, ...rest] = line.split(/\s+/); const arg = rest.join(" ");
    const cur = stateRef.current;
    switch (c.toLowerCase()) {
      case "help":
        push("m", ["commands:", "  help                 this list", "  arch                 target architecture", "  funcs [pat]          list functions", "  disasm <name>        disassemble a function", "  b 0xADDR | break     toggle breakpoint", "  breaks               list breakpoints", "  regs                 registers touched by current fn", "  sym <pat>            matching symbols", "  clear                clear console"].join("\n")); break;
      case "arch": push("a", `${result.arch} · ${result.elf_class}-bit · entry ${result.entry} · ${result.num_symbols ?? result.symbols.length} symbols`); break;
      case "funcs": { const p = arg.toLowerCase(); const m = funcs.filter(n => n.toLowerCase().includes(p)).slice(0, 40); push(m.length ? "o" : "m", m.length ? m.join("  ") : "no functions match"); break; }
      case "disasm": case "d": { const t = arg || "main"; if (funcs.includes(t)) { setName(t); push("a", `selecting ${t}`); } else push("e", `unknown function '${t}'`); break; }
      case "b": case "break": { const n = parseInt(arg.replace(/^0x/i, ""), 16); if (isNaN(n)) { push("e", "usage: b 0xADDR"); break; } toggleBp(n); break; }
      case "breaks": case "info": { const s = [...cur.bps].sort((a, b) => a - b); push(s.length ? "b" : "m", s.length ? s.map(a => "  * 0x" + hex(a)).join("\n") : "no breakpoints"); break; }
      case "regs": { const d = cur.dis; if (!d) { push("e", "no function disassembled"); break; } push("a", `touched: ${d.touched.join(" ") || "—"}\nwritten: ${d.written.join(" ") || "—"}`); break; }
      case "sym": { const p = arg.toLowerCase(); const m = result.symbols.filter(s => s.name.toLowerCase().includes(p)).slice(0, 30); push(m.length ? "o" : "m", m.length ? m.map(s => `  ${s.name.padEnd(28)} 0x${s.value.toString(16).padStart(8, "0")}  ${s.size}B`).join("\n") : "no symbols match"); break; }
      case "clear": setLog([]); break;
      default: push("e", `unknown command '${c}' — type help`);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { run(cmd); setCmd(""); }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (hist.length) { const ni = hi < 0 ? hist.length - 1 : Math.max(0, hi - 1); setHi(ni); setCmd(hist[ni]); } }
    else if (e.key === "ArrowDown") { e.preventDefault(); if (hi >= 0) { const ni = hi + 1; if (ni >= hist.length) { setHi(-1); setCmd(""); } else { setHi(ni); setCmd(hist[ni]); } } }
  };

  const touched = new Set(dis?.touched || []); const written = new Set(dis?.written || []);

  return (
    <div className="space-y-4">
      <div className="panel">
        <div className="panel-head"><span>Disassembler</span><span className="tag">capstone · click gutter dot = breakpoint</span></div>
        <div className="p-3 space-y-3">
          <div className="funcbar">
            <input list="fnlist" value={name} onChange={e => setName(e.target.value)} placeholder="function name — e.g. main, HAL_GPIO_WritePin" spellCheck={false} />
            <datalist id="fnlist">{funcs.map(f => <option key={f} value={f} />)}</datalist>
            <button className="btn-hw primary" onClick={() => name && setName(name)}>disasm</button>
          </div>
          {dis && (
            <div className="funcmeta">
              <span className="mut">fn <span className="fg">{dis.func.name}</span></span>
              <span className="mut">addr <span className="acc">0x{hex(dis.func.addr)}</span></span>
              <span className="mut">size <span className="fg">{dis.func.size} B</span></span>
              <span className="mut">mode <span className={dis.thumb ? "acc2" : "acc"}>{dis.thumb ? "THUMB" : "ARM"}</span></span>
              <span className="mut">insn <span className="fg">{dis.instructions.length}</span></span>
              <span className="mut">regs <span className="acc">{dis.touched.join(" ") || "—"}</span></span>
            </div>
          )}
          {err && <div className="mono text-[12px] danger px-1">{err}</div>}
          {dis && (
            <div className="disasm">
              {dis.instructions.map((it, i) => (
                <div className="dline" key={it.addr} style={{ animationDelay: `${Math.min(i, 60) * 9}ms` }}>
                  <span className={`bp ${bps.has(it.addr) ? "on" : ""}`} title="toggle breakpoint" onClick={() => toggleBp(it.addr)} />
                  <span className="addr">{hex(it.addr)}</span>
                  <span className="bytes">{it.bytes}</span>
                  <span className="mn">{it.mn}</span>
                  <span className="op">{it.op}
                    <span className="rtag">
                      {it.w.map(r => <span key={"w" + r} className="rchip w">{r}</span>)}
                      {it.t.filter(r => !it.w.includes(r)).map(r => <span key={"r" + r} className="rchip r">{r}</span>)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="dbg">
        <div className="panel">
          <div className="panel-head"><span>Register File · {result.arch}</span><span className="tag">static model · usage from disasm</span></div>
          <div className="p-3">
            <div className="reggrid" key={name}>
              {(dis?.schema || []).map(r => {
                const t = touched.has(r.n); const w = written.has(r.n);
                const val = r.n === "PC" && dis ? "0x" + hex(dis.func.addr) : (r.n === "SP" || r.n === "LR" ? "—" : "0x????????");
                return (
                  <div key={r.n} className={`regcell ${t ? "t" : ""}`} style={t ? { animationDelay: "40ms" } : undefined}>
                    <span className="rw">{w ? <span className="acc2">W</span> : t ? <span className="acc">R</span> : null}</span>
                    <div className="rn">{r.n}</div>
                    <div className={`rv ${val.includes("?") ? "q" : ""}`}>{val}</div>
                  </div>
                );
              })}
            </div>
            <div className="mono text-[10px] mut mt-3 leading-relaxed">
              values show <span className="q" style={{ color: "#3a4858" }}>0x????????</span> because no probe is attached — this is the architecture's register set, with <span className="acc">R</span>ead / <span className="acc2">W</span>rite use derived from the selected function's real instructions.
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><span>Debug Console</span><span className="tag">static repl · ↑/↓ history</span></div>
          <div className="p-3">
            <div className="console">
              <div className="log" ref={logRef}>{log.map((l, i) => <div key={i} className={l.c}>{l.t}</div>)}<span className="cursor" /></div>
              <div className="in"><span className="pr">fis›</span><input value={cmd} onChange={e => setCmd(e.target.value)} onKeyDown={onKey} placeholder="help" spellCheck={false} autoFocus /></div>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {["help", "regs", "breaks", "funcs HAL", "sym main"].map(q => <button key={q} className="btn-hw" onClick={() => run(q)}>{q}</button>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
