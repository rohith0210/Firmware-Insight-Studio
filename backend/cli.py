#!/usr/bin/env python3
"""Headless firmware report — reuses the parser so CI and the UI never drift.
   Usage: python cli.py firmware.elf [--md] [--diff old.elf]"""
import sys, json, argparse
from main import parse_elf

def kb(b): return f"{b/1024:.2f}"
def report(r, md=False):
    s = r["summary"]; flash = s.get(".text", 0) + s.get(".rodata", 0); ram = s.get(".data", 0) + s.get(".bss", 0)
    bc = r.get("build_config", {}); dc = r.get("dead_code", {})
    if not md:
        print(json.dumps(r, indent=2)); return
    L = [f"## Firmware Insight — `{r['filename']}`",
         f"- **Arch** {r['arch']} · {r['elf_class']}-bit · entry `{r['entry']}`",
         f"- **Toolchain** {bc.get('compiler','—')} · **ABI** {bc.get('abi','—')} · **flags** {bc.get('e_flags','—')}",
         f"- **FLASH** {kb(flash)} KB · **RAM** {kb(ram)} KB · **file** {kb(r['file_size'])} KB · **CRC** 0x{r['checksum']}",
         f"- **Symbols** {r['num_symbols']} · **Sections** {r['num_sections']} · **ISR** {len(r.get('isrs',[]))} · **peripherals** {', '.join(p['token'] for p in r.get('peripherals',[])[:8]) or '—'}",
         f"- **Dead code** {len(dc.get('items',[]))} candidates · {kb(dc.get('reclaimable',0))} KB reclaimable"]
    top = [x for x in r['symbols'] if x['size'] > 0][:6]
    if top:
        L += ["", "### Largest symbols", "```"] + [f"{x['name'][:34]:34} {x['size']:>7} B  {x['section']}" for x in top] + ["```"]
    if bc.get("opt_hints"):
        L += ["", "### Compiler hints"] + [f"- {h}" for h in bc["opt_hints"]]
    print("\n".join(L))

def diff_md(a, b):
    sa, sb = a["summary"], b["summary"]
    fa = sa.get(".text", 0) + sa.get(".rodata", 0); fb = sb.get(".text", 0) + sb.get(".rodata", 0)
    ra = sa.get(".data", 0) + sa.get(".bss", 0); rb = sb.get(".data", 0) + sb.get(".bss", 0)
    da, db = {x['name']: x['size'] for x in a['symbols'] if x['type'] == 'STT_FUNC'}, {x['name']: x['size'] for x in b['symbols'] if x['type'] == 'STT_FUNC'}
    deltas = sorted(((n, db.get(n, 0) - da.get(n, 0)) for n in set(da) | set(db)), key=lambda t: -abs(t[1]))[:6]
    added = [n for n in db if n not in da]; removed = [n for n in da if n not in db]
    s = lambda d: f"{('+' if d > 0 else '')}{kb(d)} KB"
    L = [f"## Firmware Diff  `{a['filename']}` → `{b['filename']}`",
         f"- FLASH **{s(fb-fa)}** · RAM **{s(rb-ra)}** · file **{s(b['file_size']-a['file_size'])}**",
         f"- functions **+{len(added)} / −{len(removed)}**", "", "### Largest symbol deltas", "```"] + \
        [f"{n[:34]:34} {d:+d} B" for n, d in deltas if d] + ["```"]
    print("\n".join(L))

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("elf"); ap.add_argument("--md", action="store_true"); ap.add_argument("--diff")
    a = ap.parse_args(); r = parse_elf(a.elf); r["filename"] = a.elf
    if a.diff:
        ro = parse_elf(a.diff); ro["filename"] = a.diff; diff_md(r, ro)
    else:
        report(r, a.md)
