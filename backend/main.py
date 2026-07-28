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

def parse_elf(path: str) -> dict:
    with open(path, "rb") as f:
        elf = ELFFile(f)
        sections = []
        symbols = []
        summary = {}
        section_symbols = {}
        
        # Build a map of section index -> name
        section_map = {i: sec.name for i, sec in enumerate(elf.iter_sections())}

        for sec in elf.iter_sections():
            if not sec.name:
                continue
            
            sec_size = sec["sh_size"]
            sections.append({
                "name": sec.name,
                "type": sec["sh_type"],
                "addr": sec["sh_addr"],
                "size": sec_size,
                "flags": sec["sh_flags"],
            })
            
            if sec.name in (".text", ".data", ".bss", ".rodata"):
                summary[sec.name] = sec_size

            # Extract symbols from .symtab AND .dynsym
            if isinstance(sec, SymbolTableSection):
                for sym in sec.iter_symbols():
                    if not sym.name:
                        continue
                    
                    # Resolve the actual section where this symbol lives
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
                        "name": sym.name,
                        "value": sym['st_value'],
                        "size": sym['st_size'],
                        "type": sym['st_info']['type'],
                        "bind": sym['st_info']['bind'],
                        "section": actual_sec,
                    }
                    symbols.append(sym_data)
                    
                    # Group by actual section for Treemap
                    if actual_sec in (".text", ".data", ".bss", ".rodata"):
                        if actual_sec not in section_symbols:
                            section_symbols[actual_sec] = []
                        section_symbols[actual_sec].append(sym_data)

        # Sort all symbols by size descending
        symbols.sort(key=lambda s: s["size"], reverse=True)

        # Build hierarchical Treemap data
        treemap_data = []
        for sec_name, syms in section_symbols.items():
            syms.sort(key=lambda x: x["size"], reverse=True)
            top_syms = syms[:20]
            other_size = sum(s["size"] for s in syms[20:])
            
            children = [{"name": s["name"], "size": s["size"]} for s in top_syms]
            if other_size > 0:
                children.append({"name": "Other", "size": other_size})
                
            total_size = sum(s["size"] for s in syms)
            treemap_data.append({
                "name": sec_name,
                "size": total_size if total_size > 0 else summary.get(sec_name, 0),
                "children": children
            })

        return {
            "arch": elf.get_machine_arch(),
            "entry": hex(elf.header["e_entry"]),
            "sections": sections,
            "symbols": symbols[:500],
            "summary": summary,
            "treemap_data": treemap_data,
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