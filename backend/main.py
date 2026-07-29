from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any
import tempfile, os, re, zlib
from elftools.elf.elffile import ELFFile
from elftools.elf.sections import SymbolTableSection
from elftools.elf.relocation import RelocationSection

app = FastAPI(title="Firmware Insight Studio API")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_methods=["*"], allow_headers=["*"])

class ParseResult(BaseModel):
    filename: str
    arch: str
    entry: str
    elf_class: int
    file_size: int
    checksum: str
    toolchain: str
    num_sections: int
    num_symbols: int
    largest: Dict[str, Any]
    sections: List[Dict[str, Any]]
    symbols: List[Dict[str, Any]]
    summary: Dict[str, int]
    treemap_data: List[Dict[str, Any]]
    call_graph: Dict[str, Any]
    dead_code: Dict[str, Any]

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
        sections, symbols, summary, section_symbols = [], [], {}, {}
        referenced = set()
        section_map = {i: sec.name for i, sec in enumerate(elf.iter_sections())}
        cmt = elf.get_section_by_name(".comment")
        toolchain = ""
        if cmt:
            try:
                toolchain = cmt.data().decode("utf-8", "ignore").strip("\x00").split("\n")[0].strip()
            except Exception:
                toolchain = ""
        for sec in elf.iter_sections():
            if not sec.name:
                continue
            sections.append({"name": sec.name, "type": sec["sh_type"], "addr": sec["sh_addr"], "size": sec["sh_size"], "flags": sec["sh_flags"]})
            if sec.name in (".text", ".data", ".bss", ".rodata"):
                summary[sec.name] = sec["sh_size"]
            if isinstance(sec, SymbolTableSection):
                for sym in sec.iter_symbols():
                    if not sym.name:
                        continue
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
                        if nm:
                            referenced.add(nm)
                except Exception:
                    pass
    symbols.sort(key=lambda s: s["size"], reverse=True)
    num_symbols = len(symbols)
    largest = {"name": symbols[0]["name"], "size": symbols[0]["size"]} if symbols and symbols[0]["size"] > 0 else {"name": "—", "size": 0}
    treemap_data = []
    for sec_name, syms in section_symbols.items():
        syms = sorted(syms, key=lambda x: x["size"], reverse=True)
        top = syms[:20]; other = sum(s["size"] for s in syms[20:])
        children = [{"name": s["name"], "size": s["size"]} for s in top]
        if other > 0:
            children.append({"name": "Other", "size": other})
        treemap_data.append({"name": sec_name, "size": sum(s["size"] for s in syms) or summary.get(sec_name, 0), "children": children})
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
    reclaim = sum(s['size'] for s in dead)
    return {
        "arch": elf.get_machine_arch(), "entry": hex(elf.header["e_entry"]), "elf_class": elf.elfclass,
        "file_size": file_size, "checksum": checksum, "toolchain": toolchain or "—",
        "num_sections": len(sections), "num_symbols": num_symbols, "largest": largest,
        "sections": sections, "symbols": symbols[:600], "summary": summary,
        "treemap_data": treemap_data, "call_graph": {"nodes": nodes, "edges": edges},
        "dead_code": {"items": dead[:200], "reclaimable": reclaim, "referenced_count": len(referenced)},
    }

@app.post("/api/upload", response_model=ParseResult)
async def upload_firmware(file: UploadFile = File(...)):
    allowed = (".elf", ".o", ".out", ".axf", ".bin")
    if not file.filename.lower().endswith(allowed):
        raise HTTPException(400, f"Only {allowed} supported")
    with tempfile.NamedTemporaryFile(delete=False, suffix=".elf") as tmp:
        tmp.write(await file.read()); tmp_path = tmp.name
    try:
        r = parse_elf(tmp_path); r["filename"] = file.filename; return r
    except Exception as e:
        raise HTTPException(500, f"Parse error: {e}")
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)

@app.get("/api/health")
def health():
    return {"status": "ok"}
