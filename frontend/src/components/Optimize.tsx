import type { ParseResult } from "../App";
type Card = { icon: string; title: string; evidence: string; fix: string; save?: string; tone: "a" | "b" | "m" };
export default function Optimize({ result }: { result: ParseResult }) {
  const s = result.summary || {}; const syms = result.symbols || [];
  const byName = (re: RegExp) => syms.filter(x => re.test(x.name));
  const sizeOf = (arr: any[]) => arr.reduce((a, x) => a + (x.size || 0), 0);
  const cards: Card[] = [];
  const printf = byName(/\b(printf|sprintf|vsprintf|snprintf|vprintf|fprintf)\b/);
  if (printf.length) cards.push({ icon: "⎙", title: "printf family linked", evidence: `${printf.length} fn · ${sizeOf(printf)} B in .text`, fix: "link with --specs=nano.specs and drop -u _printf_float unless you need %f", save: "EST 3–6 KB", tone: "b" });
  const dc = result.dead_code;
  if (dc && dc.reclaimable > 0) cards.push({ icon: "⌫", title: `${dc.items?.length || 0} unreferenced functions`, evidence: `${dc.reclaimable} B not reached from any relocation or call edge`, fix: "compile with -ffunction-sections -fdata-sections and link -Wl,--gc-sections", save: `EST ${(dc.reclaimable / 1024).toFixed(1)} KB`, tone: "b" });
  const ro = s[".rodata"] || 0;
  if (ro > 4096) cards.push({ icon: "▤", title: "large .rodata", evidence: `${(ro / 1024).toFixed(1)} KB of constants / tables`, fix: "-fmerge-all-constants; audit lookup tables — move read-only data to flash (already there) and consider table compression", tone: "m" });
  const bss = s[".bss"] || 0;
  if (bss > 2048) cards.push({ icon: "▥", title: "large .bss (zero-init RAM)", evidence: `${(bss / 1024).toFixed(1)} KB`, fix: "shrink big buffers; make read-only arrays `const` so they live in flash, not RAM", save: "RAM", tone: "b" });
  const bc = result.build_config || {};
  if (!(bc.opt_hints || []).some((h: string) => /LTO/i.test(h))) cards.push({ icon: "⇄", title: "no LTO detected", evidence: "per-TU file symbols present → link-time optimization likely off", fix: "add -flto at compile AND link to inline across translation units", save: "EST 2–8%", tone: "m" });
  if (!(bc.opt_hints || []).some((h: string) => /gc-sections|function sections/i.test(h))) cards.push({ icon: "✂", title: "function-sections / gc-sections not confirmed", evidence: "no per-function .text.* sections observed", fix: "-ffunction-sections -fdata-sections + -Wl,--gc-sections removes unused code per-section", tone: "m" });
  const big = syms.filter(x => x.size > 1024).slice(0, 3);
  if (big.length) cards.push({ icon: "▲", title: "largest functions", evidence: big.map(x => `${x.name} (${x.size} B)`).join(", "), fix: "profile these first — refactor, table-drive, or split hot/cold paths", tone: "a" });
  return (
    <div className="panel">
      <div className="panel-head"><span>Optimization Assistant</span><span className="tag">rule-based · evidence from this binary · savings are estimates</span></div>
      <div className="p-4 grid sm:grid-cols-2 gap-3">
        {cards.length === 0 && <div className="mut mono text-[12px] py-8 text-center sm:col-span-2">no actionable findings — lean build</div>}
        {cards.map((c, i) => (
          <div key={i} className="optcard" style={{ borderLeftColor: c.tone === "a" ? "var(--a)" : c.tone === "b" ? "var(--b)" : "var(--line2)" }}>
            <div className="flex items-center gap-2"><span className="text-lg">{c.icon}</span><span className="fg font-medium text-[13px]">{c.title}</span>{c.save && <span className="tagpill acc2 ml-auto">{c.save}</span>}</div>
            <div className="mut mono text-[11px] mt-2">evidence · {c.evidence}</div>
            <div className="acc mono text-[11px] mt-1">→ {c.fix}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
