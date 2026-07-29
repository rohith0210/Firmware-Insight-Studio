from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any
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
    objects: List[Dict[str, Any]]; isrs: List[Dict[str, Any]]
    peripherals: List[Dict[str, Any]]; build_config: Dict[str, Any]

_KEEP_EXACT = {"main", "_start", "_exit", "Reset_Handler", "reset_handler", "SystemInit"}
_KEEP_RE = re.compile(r"(IRQHandler|Handler$|_isr$|_ISR$|_vector$|_Vector$)")
def _is_keep(n: str) -> bool:
    return n in _KEEP_EXACT or n.startswith(("__", "ITM_")) or bool(_KEEP_RE.search(n))

_ISR_RE = re.compile(r"(IRQHandler|_ISR$|_isr$|Handler$|_Vector$|Vector$|SysTick|PendSV|NMI_Handler|HardFault|MemManage|BusFault|UsageFault|SVC_Handler|DebugMon)", re.I)
_ISR_VECTOR = {"NMI_Handler": 1, "HardFault_Handler": 3, "MemManage_Handler": 4, "BusFault_Handler": 5,
               "UsageFault_Handler": 6, "SVC_Handler": 11, "DebugMon_Handler": 12, "PendSV_Handler": 14,
               "SysTick_Handler": 15, "NMI": 1, "HardFault": 3, "SVC": 11, "PendSV": 14, "SysTick": 15}
_PERIPH = ["GPIO", "USART", "UART", "SPI", "I2S", "I2C", "ADC", "DAC", "DMA", "BDMA", "MDMA", "TIM", "LPTIM",
           "RTC", "USB", "OTG", "CAN", "FDCAN", "ETH", "SDIO", "SDMMC", "WWDG", "IWDG", "FLASH", "CRYP", "AES",
           "RNG", "HASH", "QSPI", "OSPI", "FMC", "LTDC", "DCMI", "CEC", "SPDIF", "SAI", "TSC", "COMP", "OPAMP"]

def _module_of(name: str) -> str:
    n = name.split("@")[0]
    if n.startswith("HAL_") or n.startswith("LL_"):
        p = n.split("_"); return (p[0] + "_" + p[1]).upper() if len(p) > 1 else p[0].upper()
    if n.startswith("__") or n.startswith("_Z"):
        return "runtime / c++"
    p = n.split("_")
    return p[0].upper() if len(p) > 1 and p[0] else "app"

def _e_flags_arm(f: int) -> List[str]:
    out = []
    eabi = (f >> 24) & 0xff
    if eabi: out.append(f"EABI v{eabi}")
    if f & 0x00000400: out.append("hard-float")
    elif f & 0x00000200: out.append("soft-float")
    if f & 0x00400000: out.append("BE8")
    if f & 0x00000002: out.append("has-entry")
    if f & 0x00000004: out.append("PIC")
    return out

def _arm_attrs(elf) -> Dict[str, Any]:
    a: Dict[str, Any] = {}
    try:
        sec = elf.get_section_by_name(".ARM.attributes")
        if sec is None: return a
        for sub in sec.iter_subsections():
            for attr in sub.iter_attributes():
                tag = attr.tag
                if tag in ("TAG_CPU_NAME",): a["cpu"] = attr.value
                elif tag in ("TAG_CPU_ARCH_NAME",): a["cpu_arch"] = attr.value
                elif tag in ("TAG_FP_ARCH",): a["fp_arch"] = attr.value
                elif tag in ("TAG_ABI_VFP_ARGS",): a["vfp_args"] = {0: "soft", 1: "hard", 2: "mixed", 3: "compat"}.get(attr.value, str(attr.value))
                elif tag in ("TAG_ABI_PCS_RW_DATA",): a["pcs_rw"] = str(attr.value)
    except Exception:
        pass
    return a

def parse_elf(path: str) -> dict:
    raw = open(path, "rb").read()
    checksum = format(zlib.crc32(raw) & 0xffffffff, "08x"); file_size = len(raw)
    with open(path, "rb") as f:
        elf = ELFFile(f)
        em = elf.header["e_machine"]; eflags = int(elf.header["e_flags"]); etype = elf.header["e_type"]
        sections, symbols, summary, section_symbols = [], [], {}, {}
        referenced = set(); va2off = []; file_syms = []
        section_map = {i: sec.name for i, sec in enumerate(elf.iter_sections())}
        cmt = elf.get_section_by_name(".comment"); toolchain = ""
        if cmt:
            try: toolchain = cmt.data().decode("utf-8", "ignore").strip("\x00").split("\n")[0].strip()
            except Exception: toolchain = ""
        sec_names = [s.name for s in elf.iter_sections() if s.name]
        for sec in elf.iter_sections():
            if not sec.name: continue
            sa, ss, so = sec["sh_addr"], sec["sh_size"], sec["sh_offset"]
            sections.append({"name": sec.name, "type": sec["sh_type"], "addr": sa, "size": ss, "flags": sec["sh_flags"]})
            if ss > 0 and sec["sh_type"] != "SHT_NOBITS": va2off.append((sa, sa + ss, so))
            if sec.name in (".text", ".data", ".bss", ".rodata"): summary[sec.name] = ss
            if isinstance(sec, SymbolTableSection):
                for sym in sec.iter_symbols():
                    if not sym.name: continue
                    shndx = sym['st_shndx']
                    actual = "ABS" if shndx == 'SHN_ABS' else "COMMON" if shndx == 'SHN_COMMON' else "UNDEF" if shndx == 'SHN_UNDEF' else section_map.get(shndx, "UNKNOWN")
                    sd = {"name": sym.name, "value": sym['st_value'], "size": sym['st_size'], "type": sym['st_info']['type'], "bind": sym['st_info']['bind'], "section": actual}
                    symbols.append(sd)
                    if sym['st_info']['type'] == 'STT_FILE': file_syms.append(sym.name)
                    if actual in (".text", ".data", ".bss", ".rodata"): section_symbols.setdefault(actual, []).append(sd)
            if isinstance(sec, RelocationSection):
                try:
                    st = elf.get_section(sec['sh_link'])
                    for rel in sec.iter_relocations():
                        nm = st.get_symbol(rel['r_info_sym']).name
                        if nm: referenced.add(nm)
                except Exception: pass
    symbols.sort(key=lambda s: s["size"], reverse=True)
    num_symbols = len(symbols)
    largest = {"name": symbols[0]["name"], "size": symbols[0]["size"]} if symbols and symbols[0]["size"] > 0 else {"name": "—", "size": 0}

    # treemap (heat-ready; unattributed leaf added client-side)
    treemap_data = []
    for sec_name, syms in section_symbols.items():
        syms = sorted(syms, key=lambda x: x["size"], reverse=True)
        sec_total = sum(s["size"] for s in syms) or summary.get(sec_name, 0)
        top = [s for s in syms[:20] if s["size"] > 0]; other = sum(s["size"] for s in syms[20:])
        children = [{"name": s["name"], "size": s["size"]} for s in top]
        if other > 0: children.append({"name": "Other", "size": other})
        if not children and sec_total > 0: children = [{"name": sec_name, "size": sec_total}]
        if children: treemap_data.append({"name": sec_name, "size": sec_total, "children": children})

    # call graph (heuristic)
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

    # dead code
    dead = [s for s in symbols if s['type'] == 'STT_FUNC' and s['size'] > 0 and s['section'] == '.text' and s['name'] not in referenced and not _is_keep(s['name'])]
    dead.sort(key=lambda x: x['size'], reverse=True)

    # object / module attribution
    func_by_mod: Dict[str, List[Dict[str, Any]]] = {}
    for s in symbols:
        if s['type'] == 'STT_FUNC' and s['size'] > 0:
            func_by_mod.setdefault(_module_of(s['name']), []).append(s)
    objects = []
    for mod, fs in sorted(func_by_mod.items(), key=lambda kv: -sum(x['size'] for x in kv[1])):
        fs = sorted(fs, key=lambda x: -x['size'])
        objects.append({"name": mod, "kind": "module", "size": sum(x['size'] for x in fs), "count": len(fs), "funcs": [x['name'] for x in fs[:40]]})
    for fn in file_syms:  # real translation units from STT_FILE
        objects.append({"name": fn, "kind": "file", "size": 0, "count": 0, "funcs": []})

    # ISR analyzer
    isrs = []
    for s in symbols:
        if s['type'] == 'STT_FUNC' and _ISR_RE.search(s['name']):
            base = s['name'].split("@")[0]
            isrs.append({"name": s['name'], "size": s['size'], "section": s['section'],
                         "vector": _ISR_VECTOR.get(base, _ISR_VECTOR.get(s['name'], -1))})
    isrs.sort(key=lambda x: (x['vector'] if x['vector'] >= 0 else 9999, -x['size']))

    # peripheral usage
    hay_symbols = " ".join(s['name'] for s in symbols)
    hay_sections = " ".join(sec_names)
    peripherals = []
    for tok in _PERIPH:
        c = len(re.findall(r'(?<![A-Z0-9])' + tok + r'(?![a-z])', hay_symbols))  # word-ish, case-sensitive token
        if c > 0: peripherals.append({"token": tok, "count": c})
    peripherals.sort(key=lambda x: -x['count'])

    # build config
    eflags_dec = _e_flags_arm(eflags) if em == "EM_ARM" else ([] if em != "EM_AARCH64" else ["AArch64"])
    attrs = _arm_attrs(elf) if em in ("EM_ARM",) else {}
    opt_hints = []
    if any(n.startswith(".text.unlikely") or n.startswith(".text.hot") for n in sec_names): opt_hints.append("function reordering (-freorder-blocks / -fprofile-use)")
    if any(n.startswith(".rodata.cst") for n in sec_names): opt_hints.append("constant merging (-fmerge-all-constants)")
    perfunc = sum(1 for n in sec_names if re.match(r'^\.(text|data|rodata)\.[A-Za-z_]', n))
    if perfunc >= 3: opt_hints.append(f"per-function sections present ({perfunc}) — -ffunction-sections/-fdata-sections; ensure -Wl,--gc-sections")
    if any("lto" in n.lower() or n == ".gnu.lto_.symtab" for n in sec_names) or not file_syms: opt_hints.append("possible LTO (no per-TU file symbols / lto markers)")
    if ".ARM.exidx" in sec_names: opt_hints.append("ARM exception unwinding tables present (-funwind-tables)")
    build_config = {"elf_type": etype, "machine": em, "e_flags": hex(eflags), "e_flags_decoded": eflags_dec,
                    "abi": attrs.get("vfp_args", ("hard-float" if "hard-float" in eflags_dec else "soft-float" if "soft-float" in eflags_dec else "—")),
                    "attrs": attrs, "compiler": toolchain or "—", "opt_hints": opt_hints,
                    "thumb": bool(em == "EM_ARM" and (int(root['value']) & 1)) if root else False}

    _CACHE[checksum] = {"bytes": raw, "e_machine": em, "arch": elf.get_machine_arch(), "va2off": va2off,
                        "sym_by_name": {s["name"]: s for s in symbols if s["size"] > 0}}
    if len(_CACHE) > 8: _CACHE.popitem(last=False)
    return {"arch": elf.get_machine_arch(), "entry": hex(elf.header["e_entry"]), "elf_class": elf.elfclass,
            "file_size": file_size, "checksum": checksum, "toolchain": toolchain or "—",
            "num_sections": len(sections), "num_symbols": num_symbols, "largest": largest,
            "sections": sections, "symbols": symbols[:600], "summary": summary,
            "treemap_data": treemap_data, "call_graph": {"nodes": nodes, "edges": edges},
            "dead_code": {"items": dead[:200], "reclaimable": sum(s['size'] for s in dead), "referenced_count": len(referenced)},
            "objects": objects[:300], "isrs": isrs[:300], "peripherals": peripherals, "build_config": build_config}

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

# ---- disassembler (unchanged from v1.3) ----
def _schema_arm():
    s = [{"n": f"R{i}", "role": "arg/ret" if i < 4 else "callee-saved"} for i in range(13)]
    return s + [{"n": "SP", "role": "stack"}, {"n": "LR", "role": "link"}, {"n": "PC", "role": "program"}, {"n": "xPSR", "role": "flags"}]
def _schema_a64():
    return [{"n": f"X{i}", "role": "arg/ret" if i < 8 else ("callee-saved" if i < 16 else "caller-saved")} for i in range(31)] + [{"n": "SP", "role": "stack"}, {"n": "PC", "role": "program"}, {"n": "NZCV", "role": "flags"}]
def _schema_x32():
    return [{"n": n, "role": r} for n, r in [("EAX", "ret/arg0"), ("ECX", "arg/ctr"), ("EDX", "arg"), ("EBX", "saved"), ("ESP", "stack"), ("EBP", "frame"), ("ESI", "src"), ("EDI", "dst")]] + [{"n": "EIP", "role": "program"}, {"n": "EFLAGS", "role": "flags"}]
def _schema_x64():
    base = [("RAX", "ret"), ("RBX", "saved"), ("RCX", "arg"), ("RDX", "arg"), ("RSI", "arg"), ("RDI", "arg"), ("RBP", "frame"), ("RSP", "stack")]
    return [{"n": n, "role": r} for n, r in base] + [{"n": f"R{i}", "role": "arg" if i < 10 else "scratch"} for i in range(8, 16)] + [{"n": "RIP", "role": "program"}, {"n": "RFLAGS", "role": "flags"}]
_ARM_SP = {"sp": "SP", "lr": "LR", "pc": "PC", "r13": "SP", "r14": "LR", "r15": "PC"}
def _canon_arm(t): return _ARM_SP.get(t, t.upper())
def _canon_a64(t):
    if t in ("sp", "lr", "pc"): return t.upper()
    return ("X" + t[1:]) if t.startswith("w") else t.upper()
def _canon_x(t): return t.upper()
_NOWRITE = {"cmp", "cmn", "tst", "teq", "nop", "push", "str", "strh", "strb", "stm", "stmia", "stmdb", "vstr", "b", "bx", "blx", "cbz", "cbnz", "tbz", "tbnz", "it", "svc", "udf", "movs"}
def _parse_regs(op, pat, canon, mn):
    toks = [canon(x.lower()) for x in re.findall(pat, op, re.I)]
    t = set(toks); mnl = mn.lower().split(".")[0]
    w = set() if (mnl in _NOWRITE or mnl.startswith(("b", "cb", "tb"))) else ({toks[0]} if toks else set())
    return sorted(t), sorted(w)
def _va2off(c, addr):
    for a, b, o in c["va2off"]:
        if a <= addr < b: return o + (addr - a)
    return None
def _arch_map(em):
    try: import capstone as cs
    except Exception: return None, None
    if em == "EM_ARM": return cs.CS_ARCH_ARM, dict(mode=cs.CS_MODE_ARM, pat=r"\b(r1[0-5]|r[0-9]|sp|lr|pc)\b", canon=_canon_arm, schema=_schema_arm(), thumb=True)
    if em == "EM_AARCH64": return cs.CS_ARCH_ARM64, dict(mode=0, pat=r"\b([xw]3[01]|[xw][12]?[0-9]|sp|lr|pc)\b", canon=_canon_a64, schema=_schema_a64(), thumb=False)
    if em == "EM_386": return cs.CS_ARCH_X86, dict(mode=cs.CS_MODE_32, pat=r"\b(r1[0-5]|[re]?[abcd]x|[re]?[sd]i|[re]?bp|[re]?sp|rip|eip)\b", canon=_canon_x, schema=_schema_x32(), thumb=False)
    if em == "EM_X86_64": return cs.CS_ARCH_X86, dict(mode=cs.CS_MODE_64, pat=r"\b(r1[0-5]|[re]?[abcd]x|[re]?[sd]i|[re]?bp|[re]?sp|rip|eip)\b", canon=_canon_x, schema=_schema_x64(), thumb=False)
    return None, None
@app.get("/api/disasm")
def disasm(checksum: str = Query(...), name: str = Query(...)):
    c = _CACHE.get(checksum)
    if not c: raise HTTPException(404, "binary not in cache — re-upload it")
    s = c["sym_by_name"].get(name)
    if not s: raise HTTPException(404, f"function '{name}' not found")
    if s["size"] <= 0: raise HTTPException(404, f"'{name}' has zero size")
    mapping = _arch_map(c["e_machine"])
    if mapping[0] is None: raise HTTPException(501, f"disassembly unsupported for {c['e_machine']}")
    try: import capstone as cs
    except Exception: raise HTTPException(501, "capstone not installed")
    ca, cfg = mapping
    val, size = s["value"], s["size"]; thumb = bool(cfg["thumb"] and (val & 1))
    mode = cs.CS_MODE_THUMB if thumb else cfg["mode"]
    try: md = cs.Cs(ca, mode)
    except Exception: md = cs.Cs(ca, 0)
    md.detail = False
    addr = val & ~1; off = _va2off(c, addr)
    if off is None: raise HTTPException(404, "function address not in a loaded section")
    code = c["bytes"][off:off + size]; instrs, touched, written = [], set(), set()
    for i in md.disasm(code, addr):
        t, w = _parse_regs(i.op_str, cfg["pat"], cfg["canon"], i.mnemonic)
        touched |= set(t); written |= set(w)
        instrs.append({"addr": i.address, "bytes": i.bytes.hex(" "), "mn": i.mnemonic, "op": i.op_str, "t": t, "w": w})
    return {"func": {"name": name, "addr": addr, "size": size}, "thumb": thumb, "arch": c["arch"],
            "instructions": instrs, "touched": sorted(touched), "written": sorted(written), "schema": cfg["schema"]}

@app.get("/api/health")
def health(): return {"status": "ok"}
