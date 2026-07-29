import { useEffect, useMemo, useRef, useState } from "react";
import type { ParseResult } from "../App";
import { detectDevice } from "../utils/devices";

type Instr = { addr: number; bytes: string; mn: string; op: string; t: string[]; w: string[] };
type Dis = { func: { name: string; addr: number; size: number }; thumb: boolean; arch: string; instructions: Instr[]; touched: string[]; written: string[]; schema: { n: string; role: string }[] };
type Log = { c: "o" | "a" | "b" | "e" | "m"; t: string };
type Status = "idle" | "running" | "halted" | "returned";

const REGSET = /\{([^}]+)\}/;
const splitOps = (op: string) => op.replace(REGSET, m => m.replace(/,/g, "|")).split(",").map(s => s.trim()).filter(Boolean).flatMap(s => s.includes("|") ? s.split("|").map(x => x.trim()) : [s]);

export default function Disassembler({ result, target }: { result: ParseResult; target?: { name: string; nonce: number } | null }) {
  const funcs = useMemo(() => result.symbols.filter(s => s.type === "STT_FUNC" && s.size > 0).map(s => s.name), [result]);
  const [name, setName] = useState<string>(target && target.name && funcs.includes(target.name) ? target.name : (funcs.includes("main") ? "main" : funcs[0] || ""));
  const [dis, setDis] = useState<Dis | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [bps, setBps] = useState<Set<number>>(new Set());
  const [log, setLog] = useState<Log[]>([
    { c: "a", t: "Firmware Insight · debug console" },
    { c: "m", t: "model CPU — no probe attached. run/step animate the PC over real disassembly; register values are simulated." },
    { c: "m", t: "type 'help'. click a gutter dot = breakpoint (halts the run)." },
  ]);
  const [cmd, setCmd] = useState(""); const [hist, setHist] = useState<string[]>([]); const [hi, setHi] = useState(-1);
  // simulator state
  const [pc, setPc] = useState<number | null>(null);
  const [regs, setRegs] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<Status>("idle");
  const [steps, setSteps] = useState(0);
  const [now, setNow] = useState<Set<string>>(new Set());
  const logRef = useRef<HTMLDivElement>(null);
  const pcRef = useRef<HTMLDivElement | null>(null);
  const stackRef = useRef<number[]>([]);
  const flagsRef = useRef({ z: false, n: false });
  const timerRef = useRef<number | null>(null);
  const stateRef = useRef({ dis, name, bps, pc, regs, status });
  stateRef.current = { dis, name, bps, pc, regs, status };

  useEffect(() => { if (target && target.name && funcs.includes(target.name)) setName(target.name); }, [target?.nonce]);
  const word = result.elf_class === 64 ? 8 : 4;
  const pad = result.elf_class === 64 ? 12 : 8;
  const hex = (n: number) => (n >>> 0).toString(16).padStart(pad, "0");
  const regNames = useMemo(() => new Set((dis?.schema || []).map(s => s.n)), [dis]);
  const canon = (t: string) => { const u = t.toUpperCase(); return regNames.has(u) ? u : (regNames.has("R" + u.replace(/^R/, "")) ? u : u); };
  const isReg = (t: string) => regNames.has(t.toUpperCase());
  const addrSet = useMemo(() => new Set((dis?.instructions || []).map(i => i.addr)), [dis]);
  const idxOf = useMemo(() => { const m = new Map<number, number>(); (dis?.instructions || []).forEach((i, k) => m.set(i.addr, k)); return m; }, [dis]);

  const push = (c: Log["c"], t: string) => setLog(l => [...l, { c, t }]);
  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight); }, [log]);
  useEffect(() => { pcRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [pc]);

  useEffect(() => { if (!name) return; let alive = true; setErr(null); halt(); reset();
    fetch(`http://localhost:8000/api/disasm?checksum=${result.checksum}&name=${encodeURIComponent(name)}`)
      .then(async r => { if (!r.ok) throw new Error((await r.json()).detail || "disasm failed"); return r.json(); })
      .then((d: Dis) => { if (alive) { setDis(d); push("a", `disassembled ${d.func.name} @ 0x${hex(d.func.addr)} · ${d.instructions.length} insn · ${d.thumb ? "thumb" : "arm"}`); } })
      .catch(e => { if (alive) { setDis(null); setErr(e.message); push("e", e.message); } });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, result.checksum]);

  const evalTok = (t: string): number => {
    let s = t.trim(); if (s.startsWith("#")) s = s.slice(1);
    if (/^-?0x[0-9a-f]+$/i.test(s)) return parseInt(s, 16) >>> 0;
    if (/^-?\d+$/.test(s)) return parseInt(s, 10) >>> 0;
    if (s.startsWith("[")) return (0xdead0000 | (s.length * 2654435761 >>> 0) & 0xfff) >>> 0;
    if (isReg(s)) return (stateRef.current.regs[s.toUpperCase()] ?? 0) >>> 0;
    return 0;
  };
  const setFlag = (res: number) => { flagsRef.current = { z: (res | 0) === 0, n: (res | 0) < 0 }; };

  // one modeled step; returns next status
  const stepOnce = (): Status => {
    const cur = stateRef.current; const d = cur.dis; if (!d) return "idle";
    const k = cur.pc == null ? 0 : idxOf.get(cur.pc);
    if (k == null) return "returned";
    const it = d.instructions[k]; if (!it) return "returned";
    const R = { ...cur.regs }; const st = stackRef.current; const mn = it.mn.toLowerCase().split(".")[0];
    const ops = splitOps(it.op); const set = (n: string, v: number) => { R[n.toUpperCase()] = v >>> 0; };
    const next = () => d.instructions[k + 1]?.addr ?? null;
    let jumped: number | null = null; let ended = false; const wr = new Set<string>();
    const linkReg = regNames.has("LR") ? "LR" : null;

    const doPushSet = (names: string[]) => { for (const n of names) { st.push((R[n.toUpperCase()] ?? 0) >>> 0); if (regNames.has("SP")) set("SP", (R["SP"] ?? 0) - word); } };
    const doPopSet = (names: string[]) => { for (const n of names) { const v = st.length ? st.pop()! : (0xcafe0000 | (n.length * 4099) & 0xffff); if (n.toUpperCase() === "PC" || n.toLowerCase() === "pc") { ended = !addrSet.has(v); if (!ended) jumped = v; } else set(n, v); if (regNames.has("SP")) set("SP", (R["SP"] ?? 0) + word); } };

    if (mn === "nop" || mn === "endbr64" || mn === "endbr32" || mn === "it") { /* nothing */ }
    else if (mn === "push") { if (REGSET.test(it.op)) doPushSet(it.op.match(REGSET)![1].split(",").map(x => x.trim())); else { st.push(evalTok(ops[0])); if (regNames.has("SP")) set("SP", (R["SP"] ?? 0) - word); wr.add("SP"); } }
    else if (mn === "pop") { if (REGSET.test(it.op)) doPopSet(it.op.match(REGSET)![1].split(",").map(x => x.trim())); else { const v = st.length ? st.pop()! : 0; set(ops[0], v); wr.add(ops[0]); wr.add("SP"); } }
    else if (mn === "call" || mn === "bl" || mn === "blx") { if (linkReg) { set(linkReg, next() ?? it.addr + word); wr.add(linkReg); } push("m", `  ↳ ${mn} ${ops[0]}  (external · modeled return)`); }
    else if (mn === "ret" || mn === "retq" || mn === "bx") { const v = st.length ? st.pop()! : (linkReg ? R[linkReg] ?? 0 : 0); ended = !addrSet.has(v); if (!ended) jumped = v; }
    else if (mn === "jmp" || mn === "b") { const v = evalTok(ops[0]); ended = !addrSet.has(v); if (!ended) jumped = v; }
    else if (["je", "jz", "beq"].includes(mn)) { if (flagsRef.current.z) { const v = evalTok(ops[0]); ended = !addrSet.has(v); if (!ended) jumped = v; } }
    else if (["jne", "jnz", "bne"].includes(mn)) { if (!flagsRef.current.z) { const v = evalTok(ops[0]); ended = !addrSet.has(v); if (!ended) jumped = v; } }
    else if (["jl", "blt"].includes(mn)) { if (flagsRef.current.n) { const v = evalTok(ops[0]); ended = !addrSet.has(v); if (!ended) jumped = v; } }
    else if (["jge", "bge"].includes(mn)) { if (!flagsRef.current.n) { const v = evalTok(ops[0]); ended = !addrSet.has(v); if (!ended) jumped = v; } }
    else if (mn === "cbz") { if (evalTok(ops[0]) === 0) { const v = evalTok(ops[1]); ended = !addrSet.has(v); if (!ended) jumped = v; } }
    else if (mn === "cbnz") { if (evalTok(ops[0]) !== 0) { const v = evalTok(ops[1]); ended = !addrSet.has(v); if (!ended) jumped = v; } }
    else if (mn === "cmp" || mn === "cmn" || mn === "tst" || mn === "teq") { const a = evalTok(ops[0]); const b = evalTok(ops[1] || "0"); setFlag(mn === "cmp" ? a - b : mn === "cmn" ? a + b : mn === "tst" ? a & b : a ^ b); }
    else if (mn === "mov" || mn === "movs" || mn === "mvn" || mn === "lea" || mn === "ldr" || mn === "ldrb" || mn === "ldrh") { const dst = ops[0]; const src = mn === "mvn" ? ~evalTok(ops[1]) : evalTok(ops[ops.length > 2 ? 2 : 1]); set(dst, src); wr.add(dst); }
    else if (mn === "add" || mn === "adds" || mn === "sub" || mn === "subs" || mn === "and" || mn === "ands" || mn === "orr" || mn === "or" || mn === "eor" || mn === "xor") {
      const dst = ops[0]; const a = evalTok(ops[1]); const b = evalTok(ops[ops.length > 2 ? 2 : 1]);
      let v = 0; if (mn.startsWith("add")) v = a + b; else if (mn.startsWith("sub")) v = a - b; else if (mn === "and" || mn === "ands") v = a & b; else v = a ^ b;
      set(dst, v); wr.add(dst); if (mn.endsWith("s")) setFlag(v);
    }
    else if (mn === "str" || mn === "strb" || mn === "strh" || mn === "stmia" || mn === "stmdb") { /* modeled store — no visible effect */ }

    const newPc = ended ? null : (jumped != null ? jumped : next());
    setRegs(R); setNow(wr); setSteps(s => s + 1);
    if (newPc != null && cur.bps.has(newPc)) { setPc(newPc); push("b", `breakpoint hit @ 0x${hex(newPc)}  (step ${steps + 1})`); return "halted"; }
    if (ended) { setPc(null); push("a", `returned after ${steps + 1} step(s)`); return "returned"; }
    setPc(newPc); return "running";
  };
  const stepRef = useRef(stepOnce); stepRef.current = stepOnce;

  const step = () => { if (!dis) return; if (status === "idle" || status === "returned") reset(true); const s = stepRef.current(); setStatus(s); if (s !== "running") stopTimer(); };
  const stopTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  const halt = () => { stopTimer(); setStatus(st => (st === "running" ? "halted" : st)); };
  const run = () => { if (!dis) return; if (status === "idle" || status === "returned") reset(true); setStatus("running"); stopTimer();
    timerRef.current = window.setInterval(() => { const s = stepRef.current(); if (s !== "running") { setStatus(s); stopTimer(); } }, 360); };
  function reset(quiet = false) { stopTimer(); stackRef.current = []; flagsRef.current = { z: false, n: false }; setNow(new Set()); setSteps(0); setRegs({});
    const d = stateRef.current.dis; if (d) { const dev = detectDevice(result); const ramTop = dev.regions.filter(r => r.kind === "ram" || r.kind === "ccm").reduce((a, r) => Math.max(a, r.base + r.size), 0);
      const sp0 = ramTop || (/x86|80386/i.test(result.arch) ? (result.elf_class === 64 ? 0x7fffffe000 : 0xbffff000) : 0x20010000);
      setRegs(regNames.has("SP") ? { SP: sp0 >>> 0 } : {}); setPc(d.instructions[0]?.addr ?? null); setStatus("idle"); if (!quiet) push("m", `reset · PC=0x${hex(d.instructions[0]?.addr ?? 0)} SP=0x${hex(sp0)}`);
    } else { setPc(null); setStatus("idle"); } }

  const toggleBp = (addr: number) => setBps(prev => { const n = new Set(prev); n.has(addr) ? n.delete(addr) : n.add(addr); push(n.has(addr) ? "b" : "m", `${n.has(addr) ? "breakpoint set" : "breakpoint cleared"} @ 0x${hex(addr)}`); return n; });

  const runCmd = (raw: string) => {
    const line = raw.trim(); if (!line) return; push("o", "› " + line); setHist(h => [...h, line]); setHi(-1);
    const [c, ...rest] = line.split(/\s+/); const arg = rest.join(" ");
    switch (c.toLowerCase()) {
      case "help": push("m", ["commands:", "  run | r              start / resume stepping", "  step | s             one instruction", "  halt | h             pause the run", "  reset                reset PC + registers", "  b 0xADDR             toggle breakpoint", "  breaks               list breakpoints", "  regs                 registers touched / written", "  pc                   current program counter", "  funcs [pat]          list functions", "  disasm <name>        disassemble a function", "  sym <pat>            matching symbols", "  clear                clear console"].join("\n")); break;
      case "run": case "r": run(); push("a", "running…"); break;
      case "step": case "s": step(); break;
      case "halt": case "h": halt(); push("m", "halted"); break;
      case "reset": reset(); break;
      case "pc": push("a", stateRef.current.pc == null ? "PC: <returned>" : `PC: 0x${hex(stateRef.current.pc)}`); break;
      case "b": case "break": { const n = parseInt(arg.replace(/^0x/i, ""), 16); if (isNaN(n)) push("e", "usage: b 0xADDR"); else toggleBp(n); break; }
      case "breaks": { const s = [...stateRef.current.bps].sort((a, b) => a - b); push(s.length ? "b" : "m", s.length ? s.map(a => "  * 0x" + hex(a)).join("\n") : "no breakpoints"); break; }
      case "regs": { const d = stateRef.current.dis; if (!d) { push("e", "no function disassembled"); break; } push("a", `touched: ${d.touched.join(" ") || "—"}\nwritten: ${d.written.join(" ") || "—"}`); break; }
      case "funcs": { const p = arg.toLowerCase(); const m = funcs.filter(n => n.toLowerCase().includes(p)).slice(0, 40); push(m.length ? "o" : "m", m.length ? m.join("  ") : "no functions match"); break; }
      case "disasm": case "d": { const t = arg || "main"; if (funcs.includes(t)) { setName(t); push("a", `selecting ${t}`); } else push("e", `unknown function '${t}'`); break; }
      case "sym": { const p = arg.toLowerCase(); const m = result.symbols.filter(s => s.name.toLowerCase().includes(p)).slice(0, 30); push(m.length ? "o" : "m", m.length ? m.map(s => `  ${s.name.padEnd(28)} 0x${s.value.toString(16).padStart(8, "0")}  ${s.size}B`).join("\n") : "no symbols match"); break; }
      case "clear": setLog([]); break;
      default: push("e", `unknown command '${c}' — type help`);
    }
  };
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { runCmd(cmd); setCmd(""); }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (hist.length) { const ni = hi < 0 ? hist.length - 1 : Math.max(0, hi - 1); setHi(ni); setCmd(hist[ni]); } }
    else if (e.key === "ArrowDown") { e.preventDefault(); if (hi >= 0) { const ni = hi + 1; if (ni >= hist.length) { setHi(-1); setCmd(""); } else { setHi(ni); setCmd(hist[ni]); } } }
  };

  const touched = new Set(dis?.touched || []); const written = new Set(dis?.written || []);
  const live = status !== "idle";
  const stColor = status === "running" ? "var(--a)" : status === "halted" ? "var(--b)" : status === "returned" ? "var(--mut)" : "var(--mut)";

  return (
    <div className="space-y-4">
      <div className="panel">
        <div className="panel-head"><span>Disassembler</span><span className="tag">capstone · model CPU · click dot = breakpoint</span></div>
        <div className="p-3 space-y-3">
          <div className="funcbar">
            <input list="fnlist" value={name} onChange={e => setName(e.target.value)} placeholder="function — e.g. main, HAL_GPIO_WritePin" spellCheck={false} />
            <datalist id="fnlist">{funcs.map(f => <option key={f} value={f} />)}</datalist>
            <button className="btn-hw primary" onClick={() => name && setName(name)}>disasm</button>
          </div>
          {dis && (
            <div className="runbar">
              <button className={`btn-hw ${status === "running" ? "primary" : ""}`} onClick={run}>▶ run</button>
              <button className="btn-hw" onClick={step}>⏭ step</button>
              <button className="btn-hw" onClick={halt}>⏸ halt</button>
              <button className="btn-hw" onClick={() => reset()}>⟲ reset</button>
              <span className="spacer" />
              <span className="runchip" style={{ color: stColor, borderColor: stColor }}><span className="dot" style={{ background: stColor, animation: status === "running" ? "pulse 1s infinite" : "none" }} />{status}</span>
              <span className="mono text-[11px] mut">step <span className="fg">{steps}</span></span>
              {pc != null && <span className="mono text-[11px] mut">PC <span className="acc">0x{hex(pc)}</span></span>}
            </div>
          )}
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
              {dis.instructions.map((it, i) => {
                const isPc = pc === it.addr;
                return (
                  <div className={`dline ${isPc ? "pc" : ""}`} key={it.addr} ref={isPc ? pcRef : undefined} style={{ animationDelay: `${Math.min(i, 60) * 9}ms` }}>
                    <span className="pcmk">{isPc ? "▸" : ""}</span>
                    <span className={`bp ${bps.has(it.addr) ? "on" : ""}`} title="toggle breakpoint" onClick={() => toggleBp(it.addr)} />
                    <span className="addr">{hex(it.addr)}</span>
                    <span className="bytes">{it.bytes}</span>
                    <span className="mn">{it.mn}</span>
                    <span className="op">{it.op}<span className="rtag">{it.w.map(r => <span key={"w" + r} className="rchip w">{r}</span>)}{it.t.filter(r => !it.w.includes(r)).map(r => <span key={"r" + r} className="rchip r">{r}</span>)}</span></span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="dbg">
        <div className="panel">
          <div className="panel-head"><span>Register File · {result.arch}</span><span className="tag">{live ? "live · model" : "static · usage from disasm"}</span></div>
          <div className="p-3">
            <div className="reggrid" key={name + status}>
              {(dis?.schema || []).map(rg => {
                const t = touched.has(rg.n); const w = written.has(rg.n); const nw = now.has(rg.n);
                const val = !live ? (rg.n === "PC" && dis ? "0x" + hex(dis.func.addr) : (rg.n === "SP" || rg.n === "LR" ? "—" : "0x????????"))
                  : (regs[rg.n] != null ? "0x" + hex(regs[rg.n]) : (rg.n === "PC" && pc != null ? "0x" + hex(pc) : "—"));
                return (
                  <div key={rg.n} className={`regcell ${t || (live && regs[rg.n] != null) ? "t" : ""} ${nw ? "now" : ""}`}>
                    <span className="rw">{w ? <span className="acc2">W</span> : t ? <span className="acc">R</span> : null}</span>
                    <div className="rn">{rg.n}</div>
                    <div className={`rv ${val.includes("?") ? "q" : ""}`}>{val}</div>
                  </div>
                );
              })}
            </div>
            <div className="mono text-[10px] mut mt-3 leading-relaxed">
              {live ? "values are simulated by the model CPU as it steps the real instructions — push/pop move SP, mov sets the destination, ret returns." : <>values show <span style={{ color: "#3a4858" }}>0x????????</span> until you <span className="acc">run</span> — <span className="acc">R</span>ead / <span className="acc2">W</span>rite use is derived from the function's real code.</>}
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><span>Debug Console</span><span className="tag">run / step / halt / reset · ↑↓ history</span></div>
          <div className="p-3">
            <div className="console">
              <div className="log" ref={logRef}>{log.map((l, i) => <div key={i} className={l.c}>{l.t}</div>)}<span className="cursor" /></div>
              <div className="in"><span className="pr">fis›</span><input value={cmd} onChange={e => setCmd(e.target.value)} onKeyDown={onKey} placeholder="run" spellCheck={false} autoFocus /></div>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {["run", "step", "halt", "reset", "regs", "breaks"].map(q => <button key={q} className="btn-hw" onClick={() => runCmd(q)}>{q}</button>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
