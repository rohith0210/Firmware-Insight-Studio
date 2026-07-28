from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any
from collections import deque, defaultdict
import bisect, tempfile, os
from elftools.elf.elffile import ELFFile
from elftools.elf.sections import SymbolTableSection

app = FastAPI(title="Firmware Insight Studio API")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"],
                   allow_methods=["*"], allow_headers=["*"])

class ParseResult(BaseModel):
    filename: str; arch: str; entry: str
    sections: List[Dict[str, Any]]; symbols: List[Dict[str, Any]]
    summary: Dict[str, int]; treemap_data: List[Dict[str, Any]]
    call_graph: Dict[str, Any]

def _dwarf_ranges(elf):
    """name -> (lo, hi) from DWARF subprograms, if present."""
    out = {}
    try:
        if not elf.has_dwarf_info():
            return out
        di = elf.get_dwarf_info()
        for cu in di.iter_CUs():
            for die in cu.iter_DIEs():
                if die.tag != "DW_TAG_subprogram":
                    continue
                a = die.attributes
                if "DW_AT_low_pc" not in a or "DW_AT_high_pc" not in a:
                    continue
                lo = a["DW_AT_low_pc"].value
                hp = a["DW_AT_high_pc"]
                hi = hp.value if hp.form in ("DW_FORM_addr",) else lo + hp.value
                nm = a.get("DW_AT_name")
                nm = nm.value.decode() if nm and nm.value else None
                if nm and hi > lo:
                    out[nm] = (lo, hi)
    except Exception:
        return {}
    return out

def _scan_calls_x86_64(data, base, lo, hi):
    """Yield absolute call targets from E8 rel32 within [lo,hi)."""
    a, b = lo - base, hi - base
    if a < 0 or b > len(data):
        return
    i = a
    while i + 5 <= b:
        if data[i] == 0xE8:
            rel = int.from_bytes(data[i+1:i+5], "little", signed=True)
            yield (lo + i) + 5 + rel
            i += 5
        else:
            i += 1

def build_call_graph(elf, symbols):
    text_funcs = [s for s in symbols if s["section"] == ".text"
                  and s["type"] == "STT_FUNC" and s["size"] > 0]
    by_size = sorted(text_funcs, key=lambda s: s["size"], reverse=True)
    dwarf = _dwarf_ranges(elf)

    # function ranges: prefer DWARF, else symbol size
    funcs = []
    for s in text_funcs:
        lo = s["value"]
        hi = dwarf.get(s["name"], (lo, lo + s["size"]))[1]
        funcs.append((lo, hi, s["name"]))
    funcs.sort()
    starts = [f[0] for f in funcs]

    def func_at(addr):
        i = bisect.bisect_right(starts, addr) - 1
        if i >= 0:
            lo, hi, name = funcs[i]
            if lo <= addr < hi:
                return name
        return None

    machine = elf.header["e_machine"]
    edges_set = set()
    mode = "heuristic"
    text_sec = elf.get_section_by_name(".text")

    if text_sec and machine == "EM_X86_64" and funcs:
        try:
            base = text_sec["sh_addr"]
            data = text_sec.data()
            for lo, hi, name in funcs:
                for tgt in _scan_calls_x86_64(data, base, lo, hi):
                    callee = func_at(tgt)
                    if callee and callee != name:
                        edges_set.add((name, callee))
            if edges_set:
                mode = "real · x86-64"
        except Exception:
            edges_set = set()
    # ARM/Thumb: intentionally heuristic (hand-decoding BL/BLX risks false edges;
    # capstone-powered decode is the queued upgrade).

    root = next((n for _, _, n in funcs if n == "main"), None) \
        or (by_size[0]["name"] if by_size else None)

    def heuristic():
        nd = {root: {"id": root, "label": root, "x": 0, "y": 0, "kind": "entry"}} if root else {}
        ed, k = [], 0
        for s in by_size:
            if s["name"] != root and k < 4:
                nd[s["name"]] = {"id": s["name"], "label": s["name"], "x": k * 185 - 277, "y": 150, "kind": "function"}
                ed.append({"source": root, "target": s["name"], "animated": True})
                k += 1
        return list(nd.values()), ed, "heuristic"

    if mode.startswith("real") and root:
        adj = defaultdict(set)
        for s, t in edges_set:
            adj[s].add(t)
        depth, seen, order = {root: 0}, {root}, [root]
        layer = defaultdict(int); layer[0] = 1
        q = deque([root])
        while q:
            u = q.popleft(); du = depth[u]
            if du >= 3:
                continue
            for v in sorted(adj[u]):
                if v in seen:
                    continue
                nd2 = du + 1
                if layer[nd2] >= 6:
                    continue
                seen.add(v); depth[v] = nd2; order.append(v); layer[nd2] += 1; q.append(v)
        if len(order) >= 2:
            by_d = defaultdict(list)
            for u in order:
                by_d[depth[u]].append(u)
            nodes, edges = [], []
            for d, us in by_d.items():
                span = (len(us) - 1) * 185
                for k, u in enumerate(us):
                    nodes.append({"id": u, "label": u, "x": k * 185 - span / 2,
                                  "y": d * 135, "kind": "entry" if u == root else "function"})
            ids = {n["id"] for n in nodes}
            for s, t in edges_set:
                if s in ids and t in ids:
                    edges.append({"source": s, "target": t, "animated": True})
            return nodes, edges, mode
    return heuristic()

def parse_elf(path: str) -> dict:
    with open(path, "rb") as f:
        elf = ELFFile(f)
        sections, symbols, summary, section_symbols = [], [], {}, {}
        section_map = {i: sec.name for i, sec in enumerate(elf.iter_sections())}
        for sec in elf.iter_sections():
            if not sec.name:
                continue
            sections.append({"name": sec.name, "type": sec["sh_type"], "addr": sec["sh_addr"],
                             "size": sec["sh_size"], "flags": sec["sh_flags"]})
            if sec.name in (".text", ".data", ".bss", ".rodata"):
                summary[sec.name] = sec["sh_size"]
            if isinstance(sec, SymbolTableSection):
                for sym in sec.iter_symbols():
                    if not sym.name:
                        continue
                    sh = sym["st_shndx"]
                    actual = {"SHN_ABS": "ABS", "SHN_COMMON": "COMMON", "SHN_UNDEF": "UNDEF"}.get(sh, section_map.get(sh, "UNKNOWN"))
                    sym_data = {"name": sym.name, "value": sym["st_value"], "size": sym["st_size"],
                                "type": sym["st_info"]["type"], "bind": sym["st_info"]["bind"], "section": actual}
                    symbols.append(sym_data)
                    if actual in (".text", ".data", ".bss", ".rodata"):
                        section_symbols.setdefault(actual, []).append(sym_data)
        symbols.sort(key=lambda s: s["size"], reverse=True)

        treemap_data = []
        for sec_name, syms in section_symbols.items():
            syms.sort(key=lambda x: x["size"], reverse=True)
            top, other = syms[:20], sum(s["size"] for s in syms[20:])
            children = [{"name": s["name"], "size": s["size"]} for s in top]
            if other > 0:
                children.append({"name": "Other", "size": other})
            treemap_data.append({"name": sec_name,
                                 "size": sum(s["size"] for s in syms) or summary.get(sec_name, 0),
                                 "children": children})

        cg_nodes, cg_edges, cg_mode = build_call_graph(elf, symbols)
        return {"arch": elf.get_machine_arch(), "entry": hex(elf.header["e_entry"]),
                "sections": sections, "symbols": symbols[:500], "summary": summary,
                "treemap_data": treemap_data,
                "call_graph": {"nodes": cg_nodes, "edges": cg_edges, "mode": cg_mode}}

@app.post("/api/upload", response_model=ParseResult)
async def upload_firmware(file: UploadFile = File(...)):
    allowed = (".elf", ".o", ".out", ".axf", ".bin")
    if not file.filename.lower().endswith(allowed):
        raise HTTPException(400, f"Only {allowed} files supported")
    with tempfile.NamedTemporaryFile(delete=False, suffix=".elf") as tmp:
        tmp.write(await file.read()); tmp_path = tmp.name
    try:
        result = parse_elf(tmp_path); result["filename"] = file.filename; return result
    except Exception as e:
        raise HTTPException(500, f"Parse error: {str(e)}")
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)

@app.get("/api/health")
def health():
    return {"status": "ok"}
