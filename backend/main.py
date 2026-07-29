from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from collections import OrderedDict
import tempfile, os, re, zlib
from elftools.elf.elffile import ELFFile
from elftools.elf.sections import SymbolTableSection
from elftools.elf.relocation import RelocationSection

app = FastAPI(title="Firmware Insight Studio API")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_methods=["*"], allow_headers=["*"])

_CACHE: "OrderedDict[str, dict]" = OrderedDict()

class ParseResult(BaseModel):
    filename: str; arch: str; entry: str; elf_class: int
    file_size: int; checksum: str; toolchain: str
    num_sections: int; num_symbols: int; largest: Dict[str, Any]
    sections: List[Dict[str, Any]]; symbols: List[Dict[str, Any]]
    summary: Dict[str, int]; treemap_data: List[Dict[str, Any]]
    call_graph: Dict[str, Any]; dead_code: Dict[str, Any]

_KEEP_EXACT = {"main", "_start", "_exit", "Reset_Handler", "reset_handler", "SystemInit"}
_KEEP_RE = re.compile(r"(IRQHandler|Handler$|_isr$|_ISR$|_vector$|_Vector$)")
def _is_keep(n: str) -> bool:
    return n in _KEEP_EXACT or n.startswith(("__", "ITM_")) or bool(_KEEP_RE.search(n))

def parse_elf(path: str) -> dict:
    raw = open(path, "rb").read()
    checksum = format(zlib.crc32(raw) & 0xffffffff, "08x")
    file_size = len(raw)
    with open(path, "rb") as f:
        elf = ELFFile(f)
        em = elf.header["e_machine"]
        sections, symbols, summary, section_symbols = [], [], {}, {}
        referenced = set(); va2off = []
        section_map = {i: sec.name for i, sec in enumerate(elf.iter_sections())}
        cmt = elf.get_section_by_name(".comment"); toolchain = ""
        if cmt:
            try: toolchain = cmt.data().decode("utf-8", "ignore").strip("\x00").split("\n")[0].strip()
            except Exception: toolchain = ""
        for sec in elf.iter_sections():
            if not sec.name: continue
            sa, ss, so = sec["sh_addr"], sec["sh_size"], sec["sh_offset"]
            sections.append({"name": sec.name, "type": sec["sh_type"], "addr": sa, "size": ss, "flags": sec["sh_flags"]})
            if ss > 0 and sec["sh_type"] != "SHT_NOBITS":
                va2off.append((sa, sa + ss, so))
            if sec.name in (".text", ".data", ".bss", ".rodata"):
                summary[sec.name] = ss
            if isinstance(sec, SymbolTableSection):
                for sym in sec.iter_symbols():
                    if not sym.name: continue
                    shndx = sym['st_shndx']
                    actual = "ABS" if shndx == 'SHN_ABS' else "COMMON" if shndx == 'SHN_COMMON' else "UNDEF" if shndx == 'SHN_UNDEF' else section_map.get(shndx, "UNKNOWN")
                    symbols.append({"name": sym.name, "value": sym['st_value'], "size": sym['st_size'], "type": sym['st_info']['type'], "bind": sym['st_info']['bind'], "section": actual})
                    if actual in (".text", ".data", ".bss", ".rodata"):
                        section_symbols.setdefault(actual, []).append(symbols[-1])
            if isinstance(sec, RelocationSection):
                try:
                    symtab = elf.get_section(sec['sh_link'])
                    for rel in sec.iter_relocations():
                        nm = symtab.get_symbol(rel['r_info_sym']).name
                        if nm: referenced.add(nm)
                except Exception: pass
    symbols.sort(key=lambda s: s["size"], reverse=True)
    num_symbols = len(symbols)
    largest = {"name": symbols[0]["name"], "size": symbols[0]["size"]} if symbols and symbols[0]["size"] > 0 else {"name": "—", "size": 0}
    treemap_data = []
    for sec_name, syms in section_symbols.items():
        syms = sorted(syms, key=lambda x: x["size"], reverse=True)
        sec_total = sum(s["size"] for s in syms) or summary.get(sec_name, 0)
        top = syms[:20]; other = sum(s["size"] for s in syms[20:])
        children = [{"name": s["name"], "size": s["size"]} for s in top if s["size"] > 0]
        if other > 0: children.append({"name": "Other", "size": other})
        if not children and sec_total > 0:           # <-- treemap-leaf fix
            children = [{"name": sec_name, "size": sec_total}]
        if children:
            treemap_data.append({"name": sec_name, "size": sec_total, "children": children})
    text_funcs = [s for s in symbols if s['section'] == '.text' and s['type'] == 'STT_FUNC']
    root = next((s for s in text_funcs if s['name'] == 'main'), None) or (text_funcs[0] if text_funcs else None)
    nodes, edges = [], []
    if root:
        nodes.append({"id": root['name'], "label": root['name'], "type": "entry"}); n = 0
        for fn in text_funcs:
            if fn['name'] != root['name'] and n < 4:
                nodes.append({"id": fn['name'], "label": fn['name'], "type": "function"})
                edges.append({"source": root['name'], "target": fn['name'], "animated": True}); n += 1
    referenced |= {nd['id'] for nd in nodes} | ({root['name']} if root else set())
    dead = [s for s in symbols if s['type'] == 'STT_FUNC' and s['size'] > 0 and s['section'] == '.text' and s['name'] not in referenced and not _is_keep(s['name'])]
    dead.sort(key=lambda x: x['size'], reverse=True)
    _CACHE[checksum] = {"bytes": raw, "e_machine": em, "arch": elf.get_machine_arch(),
                        "va2off": va2off, "sym_by_name": {s["name"]: s for s in symbols if s["size"] > 0}}
    if len(_CACHE) > 8: _CACHE.popitem(last=False)
    return {"arch": elf.get_machine_arch(), "entry": hex(elf.header["e_entry"]), "elf_class": elf.elfclass,
            "file_size": file_size, "checksum": checksum, "toolchain": toolchain or "—",
            "num_sections": len(sections), "num_symbols": num_symbols, "largest": largest,
            "sections": sections, "symbols": symbols[:600], "summary": summary,
            "treemap_data": treemap_data, "call_graph": {"nodes": nodes, "edges": edges},
            "dead_code": {"items": dead[:200], "reclaimable": sum(s['size'] for s in dead), "referenced_count": len(referenced)}}

@app.post("/api/upload", response_model=ParseResult)
async def upload_firmware(file: UploadFile = File(...)):
    allowed = (".elf", ".o", ".out", ".axf", ".bin")
    if not file.filename.lower().endswith(allowed): raise HTTPException(400, f"Only {allowed} supported")
    with tempfile.NamedTemporaryFile(delete=False, suffix=".elf") as tmp:
        tmp.write(await file.read()); tmp_path = tmp.name
    try:
        r = parse_elf(tmp_path); r["filename"] = file.filename; return r
    except Exception as e:
        raise HTTPException(500, f"Parse error: {e}")
    finally:
        if os.path.exists(tmp_path): os.unlink(tmp_path)

# ---------- disassembler ----------
def _schema_arm():
    s = [{"n": f"R{i}", "role": "arg/ret" if i < 4 else "callee-saved"} for i in range(13)]
    s += [{"n": "SP", "role": "stack"}, {"n": "LR", "role": "link"}, {"n": "PC", "role": "program"}, {"n": "xPSR", "role": "flags"}]
    return s
def _schema_a64():
    return [{"n": f"X{i}", "role": "arg/ret" if i < 8 else ("callee-saved" if i < 16 else "caller-saved")} for i in range(31)] + [{"n": "SP", "role": "stack"}, {"n": "PC", "role": "program"}, {"n": "NZCV", "role": "flags"}]
def _schema_x32():
    return [{"n": n, "role": r} for n, r in [("EAX", "ret/arg0"), ("ECX", "arg/ctr"), ("EDX", "arg"), ("EBX", "callee-saved"), ("ESP", "stack"), ("EBP", "frame"), ("ESI", "src"), ("EDI", "dst")]] + [{"n": "EIP", "role": "program"}, {"n": "EFLAGS", "role": "flags"}]
def _schema_x64():
    base = [("RAX", "ret"), ("RBX", "saved"), ("RCX", "arg"), ("RDX", "arg"), ("RSI", "arg"), ("RDI", "arg"), ("RBP", "frame"), ("RSP", "stack")]
    s = [{"n": n, "role": r} for n, r in base] + [{"n": f"R{i}", "role": "arg" if i < 10 else "scratch"} for i in range(8, 16)]
    return s + [{"n": "RIP", "role": "program"}, {"n": "RFLAGS", "role": "flags"}]

_ARM_SP = {"sp": "SP", "lr": "LR", "pc": "PC", "r13": "SP", "r14": "LR", "r15": "PC"}
def _canon_arm(t): return _ARM_SP.get(t, t.upper())
def _canon_a64(t):
    if t in ("sp", "lr", "pc"): return t.upper()
    if t.startswith("w"): return "X" + t[1:]
    return t.upper()
def _canon_x(t): return t.upper()

_NOWRITE = {"cmp", "cmn", "tst", "teq", "nop", "push", "str", "strh", "strb", "stm", "stmia", "stmdb", "vstr", "b", "bx", "blx", "cbz", "cbnz", "tbz", "tbnz", "it", "svc", "udf", "movs"}
def _parse_regs(op, pat, canon, mn):
    toks = [canon(x.lower()) for x in re.findall(pat, op, re.I)]
    t = set(toks); mnl = mn.lower().split(".")[0]
    if mnl in _NOWRITE or mnl.startswith(("b", "cb", "tb")):
        w = set()
    else:
        w = {toks[0]} if toks else set()
    return sorted(t), sorted(w)

def _va2off(c, addr):
    for a, b, o in c["va2off"]:
        if a <= addr < b: return o + (addr - a)
    return None

def _arch_map(em):
    try: import capstone as cs
    except Exception: return None, None
    if em == "EM_ARM":
        return cs.CS_ARCH_ARM, dict(mode=cs.CS_MODE_ARM, pat=r"\b(r1[0-5]|r[0-9]|sp|lr|pc)\b", canon=_canon_arm, schema=_schema_arm(), thumb=True)
    if em == "EM_AARCH64":
        return cs.CS_ARCH_ARM64, dict(mode=0, pat=r"\b([xw]3[01]|[xw][12]?[0-9]|sp|lr|pc)\b", canon=_canon_a64, schema=_schema_a64(), thumb=False)
    if em == "EM_386":
        return cs.CS_ARCH_X86, dict(mode=cs.CS_MODE_32, pat=r"\b(r1[0-5]|[re]?[abcd]x|[re]?[sd]i|[re]?bp|[re]?sp|rip|eip)\b", canon=_canon_x, schema=_schema_x32(), thumb=False)
    if em == "EM_X86_64":
        return cs.CS_ARCH_X86, dict(mode=cs.CS_MODE_64, pat=r"\b(r1[0-5]|[re]?[abcd]x|[re]?[sd]i|[re]?bp|[re]?sp|rip|eip)\b", canon=_canon_x, schema=_schema_x64(), thumb=False)
    return None, None

@app.get("/api/disasm")
def disasm(checksum: str = Query(...), name: str = Query(...)):
    c = _CACHE.get(checksum)
    if not c: raise HTTPException(404, "binary not in cache — re-upload it")
    s = c["sym_by_name"].get(name)
    if not s: raise HTTPException(404, f"function '{name}' not found")
    if s["size"] <= 0: raise HTTPException(404, f"'{name}' has zero size — no bytes to disassemble")
    mapping = _arch_map(c["e_machine"])
    if mapping[0] is None: raise HTTPException(501, f"disassembly unsupported for {c['e_machine']}")
    try: import capstone as cs
    except Exception: raise HTTPException(501, "capstone not installed — run: pip install capstone")
    ca, cfg = mapping
    val, size = s["value"], s["size"]
    thumb = bool(cfg["thumb"] and (val & 1))
    mode = cs.CS_MODE_THUMB if thumb else cfg["mode"]
    try: md = cs.Cs(ca, mode)
    except Exception: md = cs.Cs(ca, 0)
    md.detail = False
    addr = val & ~1
    off = _va2off(c, addr)
    if off is None: raise HTTPException(404, "function address not in a loaded section")
    code = c["bytes"][off:off + size]
    instrs, touched, written = [], set(), set()
    for i in md.disasm(code, addr):
        t, w = _parse_regs(i.op_str, cfg["pat"], cfg["canon"], i.mnemonic)
        touched |= set(t); written |= set(w)
        instrs.append({"addr": i.address, "bytes": i.bytes.hex(" "), "mn": i.mnemonic, "op": i.op_str, "t": t, "w": w})
    return {"func": {"name": name, "addr": addr, "size": size}, "thumb": thumb, "arch": c["arch"],
            "instructions": instrs, "touched": sorted(touched), "written": sorted(written), "schema": cfg["schema"]}

@app.get("/api/health")
def health(): return {"status": "ok"}
