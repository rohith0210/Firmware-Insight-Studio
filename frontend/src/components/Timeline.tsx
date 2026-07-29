import { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend } from "recharts";
export type Snap = { id: number; filename: string; ts: number; flash: number; ram: number; file_size: number; checksum: string };
const KB = (b: number) => (b / 1024).toFixed(1);
export default function Timeline({ history, onClear }: { history: Snap[]; onClear: () => void }) {
  const data = useMemo(() => history.map((h, i) => ({ i: i + 1, name: h.filename, flash: +(h.flash / 1024).toFixed(2), ram: +(h.ram / 1024).toFixed(2), ts: h.ts })), [history]);
  return (
    <div className="panel">
      <div className="panel-head"><span>Build Timeline</span><span className="flex items-center gap-3"><span className="tag">{history.length} builds · this browser</span>{history.length > 0 && <button className="acc2 mono text-[10px] uppercase tracking-widest hover:underline" onClick={onClear}>clear</button>}</span></div>
      <div className="p-4">
        {data.length < 2 ? <div className="mut mono text-[12px] py-10 text-center">upload two or more builds to plot flash / RAM over time — history is stored locally in this browser.</div> : (
          <>
            <div style={{ width: "100%", height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 6, right: 12, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gF" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#33d6c2" stopOpacity={0.5} /><stop offset="100%" stopColor="#33d6c2" stopOpacity={0.02} /></linearGradient>
                    <linearGradient id="gR" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f0a830" stopOpacity={0.5} /><stop offset="100%" stopColor="#f0a830" stopOpacity={0.02} /></linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1b2531" vertical={false} />
                  <XAxis dataKey="i" stroke="#69788a" tick={{ fontFamily: "JetBrains Mono", fontSize: 10 }} />
                  <YAxis stroke="#69788a" tick={{ fontFamily: "JetBrains Mono", fontSize: 10 }} width={42} />
                  <Tooltip contentStyle={{ background: "#0c1118", border: "1px solid #283443", borderRadius: 3, fontFamily: "JetBrains Mono", fontSize: 11 }} labelFormatter={(l: any) => `build #${l}`} />
                  <Legend wrapperStyle={{ fontFamily: "JetBrains Mono", fontSize: 10 }} />
                  <Area type="monotone" dataKey="flash" stroke="#33d6c2" fill="url(#gF)" strokeWidth={1.6} name="flash KB" />
                  <Area type="monotone" dataKey="ram" stroke="#f0a830" fill="url(#gR)" strokeWidth={1.6} name="ram KB" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 space-y-0.5">
              {data.slice().reverse().map((d, idx) => { const prev = data[data.length - 1 - idx - 1]; const df = prev ? d.flash - prev.flash : 0; return (
                <div key={d.i} className="drow"><span className="nm">#{d.i} {d.name}</span><span className="flex-1" /><span className="dl" style={{ color: df > 0 ? "var(--b)" : df < 0 ? "var(--a)" : "var(--mut)" }}>{prev ? `${df > 0 ? "+" : ""}${df.toFixed(1)} KB` : "—"}</span><span className="dl fg">{d.flash} KB</span></div>); })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
