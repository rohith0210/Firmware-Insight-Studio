import { useEffect, useRef, useState } from "react";
const N = 96;
type Block = { id: number; size: number } | null;
function rng(seed: number) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
function runWorkload(seed: number): { heap: Block[]; metric: number }[] {
  const rand = rng(seed); const frames: { heap: Block[]; metric: number }[] = [];
  let heap: Block[] = Array(N).fill(null); let nextId = 1; const live = new Map<number, number[]>();
  const metric = (h: Block[]) => { const free = h.filter(c => !c).length; if (!free) return 0; let run = 0, max = 0; for (const c of h) if (!c) { run++; max = Math.max(max, run); } else run = 0; return free ? 1 - max / free : 0; };
  const alloc = (sz: number) => { for (let i = 0; i + sz <= N; i++) { if (heap.slice(i, i + sz).every(c => !c)) { const id = nextId++; for (let j = 0; j < sz; j++) heap[j + i] = { id, size: sz }; live.set(id, Array(sz).fill(0).map((_, k) => i + k)); return true; } } return false; };
  const free = (id: number) => { const idx = live.get(id); if (idx) { idx.forEach(i => (heap[i] = null)); live.delete(id); } };
  for (let step = 0; step < 60; step++) {
    if (rand() < 0.62 || live.size < 3) { const sz = 1 + Math.floor(rand() * rand() * 14); alloc(sz); }
    else { const ids = [...live.keys()]; free(ids[Math.floor(rand() * ids.length)]); }
    heap = heap.slice(); frames.push({ heap: heap.slice(), metric: metric(heap) });
  }
  return frames;
}
const COLS = ["#33d6c2", "#f0a830", "#e0566b", "#7c8cff", "#46e08a", "#c084fc", "#e0c84a", "#5ad1e0"];
export default function Fragmentation() {
  const [seed, setSeed] = useState(7);
  const frames = useRef(runWorkload(7));
  const [t, setT] = useState(0);
  const [play, setPlay] = useState(false);
  const [speed, setSpeed] = useState(220);
  useEffect(() => { frames.current = runWorkload(seed); setT(0); }, [seed]);
  useEffect(() => { if (!play) return; const id = setInterval(() => setT(p => (p + 1) % frames.current.length), speed); return () => clearInterval(id); }, [play, speed]);
  const f = frames.current[t] || frames.current[0];
  return (
    <div className="panel">
      <div className="panel-head"><span>Heap Fragmentation Simulator</span><span className="tag">model · malloc/free workload · {N} words</span></div>
      <div className="p-4">
        <div className="fragrow">{f.heap.map((c, i) => <div key={i} className="fragcell" style={{ background: c ? COLS[c.id % COLS.length] : "rgba(255,255,255,.04)" }} title={c ? `block #${c.id} · ${c.size}w` : "free"} />)}</div>
        <div className="flex items-center gap-4 mt-4 flex-wrap">
          <button className="btn-hw primary" onClick={() => setPlay(p => !p)}>{play ? "⏸ pause" : "▶ run"}</button>
          <button className="btn-hw" onClick={() => setT(p => (p + 1) % frames.current.length)}>⏭ step</button>
          <button className="btn-hw" onClick={() => { setSeed(s => s + 1); setPlay(false); }}>⟲ new workload</button>
          <label className="mono text-[11px] mut flex items-center gap-2">speed<input type="range" min={40} max={500} value={540 - speed} onChange={e => setSpeed(540 - parseInt(e.target.value))} /></label>
          <span className="ml-auto mono text-[11px]">frame <span className="fg">{t + 1}/{frames.current.length}</span></span>
          <span className="mono text-[11px]">fragmentation <span className={f.metric > 0.5 ? "danger" : f.metric > 0.25 ? "acc2" : "acc"}>{(f.metric * 100).toFixed(0)}%</span></span>
        </div>
        <div className="mut mono text-[10px] mt-3 leading-relaxed">metric = 1 − (largest free run / total free). a high number with free space still available means allocations will fail even though memory exists — the classic fragmentation trap. colored cells are live blocks; dim cells are free.</div>
      </div>
    </div>
  );
}
