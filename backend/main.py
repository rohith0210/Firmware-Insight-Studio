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

def parse_elf(path: str) -> dict:
    with open(path, "rb") as f:
        elf = ELFFile(f)
        sections = []
        symbols = []
        summary = {}

        for sec in elf.iter_sections():
            if not sec.name:
                continue
            sections.append({
                "name": sec.name,
                "type": sec["sh_type"],
                "addr": sec["sh_addr"],
                "size": sec["sh_size"],
                "flags": sec["sh_flags"],
            })
            # Track key sections for the dashboard
            if sec.name in (".text", ".data", ".bss", ".rodata"):
                summary[sec.name] = sec["sh_size"]

            if isinstance(sec, SymbolTableSection):
                for sym in sec.iter_symbols():
                    if sym.name and sym["st_size"] > 0:
                        symbols.append({
                            "name": sym.name,
                            "value": sym["st_value"],
                            "size": sym["st_size"],
                            "type": sym["st_info"]["type"],
                            "bind": sym["st_info"]["bind"],
                            "section": sec.name,
                        })

        # Sort symbols by size descending — useful for "biggest offenders" view
        symbols.sort(key=lambda s: s["size"], reverse=True)

        return {
            "arch": elf.get_machine_arch(),
            "entry": hex(elf.header["e_entry"]),
            "sections": sections,
            "symbols": symbols[:1000],  # cap for UI perf; we'll paginate later
            "summary": summary,
        }

@app.post("/api/upload", response_model=ParseResult)
async def upload_firmware(file: UploadFile = File(...)):
    allowed = (".elf", ".o", ".out", ".axf")
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
        os.unlink(tmp_path)

@app.get("/api/health")
def health():
    return {"status": "ok"}
