import type { ParseResult } from "../App";
export default function BuildConfig({ result }: { result: ParseResult }) {
  const bc = result.build_config || {}; const attrs = bc.attrs || {};
  const Row = ({ k, v, c }: any) => (<div className="row"><span className="k">{k}</span><span className={`v ${c || ""}`}>{v || "—"}</span></div>);
  return (
    <div className="panel">
      <div className="panel-head"><span>Build Configuration Inspector</span><span className="tag">from ELF header + .ARM.attributes + .comment</span></div>
      <div className="p-4">
        <div className="spec">
          <Row k="ELF type" v={bc.elf_type} />
          <Row k="machine" v={bc.machine} c="a" />
          <Row k="e_flags" v={bc.e_flags} />
          <Row k="flags decoded" v={(bc.e_flags_decoded || []).join(" · ") || "—"} c="a" />
          <Row k="float ABI" v={bc.abi} c="b" />
          <Row k="thumb entry" v={bc.thumb ? "yes" : "no"} />
          <Row k="cpu" v={attrs.cpu || attrs.cpu_arch} />
          <Row k="fp arch" v={attrs.fp_arch} />
          <Row k="VFP args" v={attrs.vfp_args} />
          <Row k="compiler" v={bc.compiler} />
        </div>
        <div className="mt-4">
          <div className="mono text-[10px] mut uppercase tracking-widest mb-2">detected compiler / link hints</div>
          {(bc.opt_hints || []).length === 0 ? <div className="mut mono text-[12px]">no hints detected</div>
            : <div className="space-y-1">{(bc.opt_hints || []).map((h: string, i: number) => <div key={i} className="mono text-[12px] fg px-2 py-1 border-l-2" style={{ borderColor: "var(--a-dim)" }}>{h}</div>)}</div>}
        </div>
      </div>
    </div>
  );
}
