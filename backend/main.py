from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any
import tempfile, os
from elftools.elf.elffile import ELFFile
from elftools.elf.sections import SymbolTableSection

app = FastAPI(title="Firmware Insight Studio API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class ParseResult(BaseModel):
    filename: str
    arch: str
    entry: str
    sections: List[Dict[str, Any]]
    symbols: List[Dict[str, Any]]
    summary: Dict[str, int]
    treemap_data: List[Dict[str, Any]]
    call_graph: Dict[str, Any]

def parse_elf(path: str) -> dict:
    with open(path, "rb") as f:
        elf = ELFFile(f)
        sections, symbols, summary, section_symbols = [], [], {}, {}
        section_map = {i: sec.name for i, sec in enumerate(elf.iter_sections())}

        for sec in elf.iter_sections():
            if not sec.name:
                continue
            sec_size = sec["sh_size"]
            sections.append({
                "name": sec.name, "type": sec["sh_type"], "addr": sec["sh_addr"],
                "size": sec_size, "flags": sec["sh_flags"],
            })
            if sec.name in (".text", ".data", ".bss", ".rodata"):
                summary[sec.name] = sec_size
            if isinstance(sec, SymbolTableSection):
                for sym in sec.iter_symbols():
                    if not sym.name:
                        continue
                    shndx = sym['st_shndx']
                    if shndx == 'SHN_ABS':
                        actual_sec = "ABS"
                    elif shndx == 'SHN_COMMON':
                        actual_sec = "COMMON"
                    elif shndx == 'SHN_UNDEF':
                        actual_sec = "UNDEF"
                    else:
                        actual_sec = section_map.get(shndx, "UNKNOWN")
                    sym_data = {
                        "name": sym.name, "value": sym['st_value'], "size": sym['st_size'],
                        "type": sym['st_info']['type'], "bind": sym['st_info']['bind'],
                        "section": actual_sec,
                    }
                    symbols.append(sym_data)
                    if actual_sec in (".text", ".data", ".bss", ".rodata"):
                        section_symbols.setdefault(actual_sec, []).append(sym_data)

        symbols.sort(key=lambda s: s["size"], reverse=True)

        treemap_data = []
        for sec_name, syms in section_symbols.items():
            syms.sort(key=lambda x: x["size"], reverse=True)
            top = syms[:20]
            other = sum(s["size"] for s in syms[20:])
            children = [{"name": s["name"], "size": s["size"]} for s in top]
            if other > 0:
                children.append({"name": "Other", "size": other})
            treemap_data.append({
                "name": sec_name,
                "size": sum(s["size"] for s in syms) or summary.get(sec_name, 0),
                "children": children,
            })

        text_funcs = [s for s in symbols if s['section'] == '.text' and s['type'] == 'STT_FUNC']
        root = next((s for s in text_funcs if s['name'] == 'main'), None) or (text_funcs[0] if text_funcs else None)
        nodes, edges = [], []
        if root:
            nodes.append({"id": root['name'], "label": root['name'], "type": "entry"})
            n = 0
            for fn in text_funcs:
                if fn['name'] != root['name'] and n < 4:
                    nodes.append({"id": fn['name'], "label": fn['name'], "type": "function"})
                    edges.append({"source": root['name'], "target": fn['name'], "animated": True})
                    n += 1

        return {
            "arch": elf.get_machine_arch(), "entry": hex(elf.header["e_entry"]),
            "sections": sections, "symbols": symbols[:500], "summary": summary,
            "treemap_data": treemap_data, "call_graph": {"nodes": nodes, "edges": edges},
        }

@app.post("/api/upload", response_model=ParseResult)
async def upload_firmware(file: UploadFile = File(...)):
    allowed = (".elf", ".o", ".out", ".axf", ".bin")
    if not file.filename.lower().endswith(allowed):
        raise HTTPException(400, f"Only {allowed} files supported")
    with tempfile.NamedTemporaryFile(delete=False, suffix=".elf") as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    try:
        result = parse_elf(tmp_path)
        result["filename"] = file.filename
        return result
    except Exception as e:
        raise HTTPException(500, f"Parse error: {str(e)}")
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)

@app.get("/api/health")
def health():
    return {"status": "ok"}
