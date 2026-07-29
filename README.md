<p align="center">
  <h1 align="center">Firmware Insight Studio</h1>
  <p align="center">
    <strong>An open-source firmware analysis &amp; optimisation workbench for Embedded Linux &amp; MCU developers.</strong><br/>
    Drop in an <code>.elf</code> and stop squinting at <code>readelf</code> — get an IDE-grade view of what eats your flash, what eats your RAM, what's dead, and what to do about it.
  </p>
  <p align="center">
    <img src="https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white" alt="Python"/>
    <img src="https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white" alt="FastAPI"/>
    <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black" alt="React"/>
    <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript"/>
    <img src="https://img.shields.io/badge/Capstone-disassembler-E44D26" alt="Capstone"/>
    <img src="https://img.shields.io/badge/License-MIT-green" alt="License"/>
  </p>
</p>

---

## The problem with every other ELF tool

`readelf`, `objdump`, and GUI wrappers like Elfyzer hand you **data** — long tables you have to interpret yourself. Firmware Insight Studio hands you **decisions**.

| A normal ELF viewer shows you… | This workbench shows you… |
|---|---|
| A flat list of sections & symbols | A **heat-mapped treemap** where the function eating your flash *glows red* — click it for a full inspector |
| A memory map with no context | A **device-aware layout** that auto-detects STM32 / nRF / RP2040 / ESP32 and draws *real* FLASH/RAM capacity & utilisation |
| Static disassembly you scroll through | A **stepping simulator** — `run` / `step` / `halt` over real instructions, with a live register model, breakpoints & a debug REPL |
| One build, one number | A **build diff + CI pipeline** that reports the flash/RAM delta and per-function growth on every pull request |
| Nothing actionable | An **optimisation assistant** with rule-based, evidence-cited suggestions (nano-printf, `--gc-sections`, LTO…) |

That shift — from *displaying bytes* to *answering the engineer's actual question* — is the whole project.

---

## What's inside

### Understand
- **Firmware Overview** — toolchain (read from `.comment`), CRC-32, entry point, FLASH/RAM utilisation gauges, largest consumers
- **Memory Treemap** — dependency-free squarified layout, size→heat ramp, click-to-zoom into a section
- **Inspector Panel** — an IDE-style docked panel (address, size, section, module, memory region, related symbols, tabbed) that the treemap shrinks to make room for
- **Memory Layout / Linker Playground** — vertical, address-true regions; upload a `.ld` *or* edit region sizes live and watch the map rescale
- **Sections** — drill down section → module → function
- **Symbol Explorer** — search & sort
- **Object Files** — per-module contribution plus the real translation units (`STT_FILE`)

### Analyse
- **Disassembler** — multi-arch via Capstone (ARM / Thumb / AArch64 / x86 / x86-64) with a stepping simulator, live register file, breakpoints & a console REPL
- **Call Graph** — interactive (ReactFlow)
- **ISR Analyzer** — interrupt handlers mapped to their vector-table index
- **Peripheral Dashboard** — auto-detected GPIO / UART / SPI / ADC / DMA / I2C / USB / CAN usage
- **Build Config Inspector** — `e_flags`, `.ARM.attributes` (hard/soft float, ABI), detected compiler hints
- **Dead Code** — unreferenced functions via relocation + call-reference analysis

### Optimise
- **Optimisation Assistant** — rule-based, evidence-cited, with estimated savings
- **Build Compare** — flash/RAM deltas, per-function growth, added / removed functions
- **Build Timeline** — your upload history as a flash/RAM chart (*"which build added 20 KB?"*)
- **Heap Fragmentation Simulator** — a malloc/free visualiser and teaching tool

### Ship
- **Reports** — JSON / CSV export
- **CI/CD** — a GitHub Actions workflow + a headless `cli.py` that posts the size delta as a PR comment

---

## Architecture

```text
+--------------------------- Frontend (React + Vite + TS) ---------------------------+
|  Sidebar (workbench nav) . Ribbon (device picker / export) . 18 analysis views     |
|  Treemap (squarified SVG) . Inspector Panel . Disassembler . ReactFlow . Recharts  |
+-----------------------------------------+------------------------------------------+
                                          |   REST   /api/upload   /api/disasm
+-----------------------------------------+------------------------------------------+
|                              Backend (FastAPI + Python)                            |
|   pyelftools  ->  sections / symbols / relocations / .ARM.attributes / .comment    |
|   capstone    ->  multi-arch disassembly                                           |
|   analysis    ->  device detect . dead code . modules . ISRs . peripherals . flags |
+------------------------------------------------------------------------------------+
```

---

## Project layout

```text
Firmware-Insight-Studio/
+-- backend/
|   +-- main.py                 # FastAPI server, ELF parser, all analysis passes
|   +-- cli.py                  # headless reporter (terminal + CI)
|   +-- requirements.txt
+-- frontend/
|   +-- src/
|       +-- App.tsx             # workbench shell + 3-column layout
|       +-- components/         # Overview, Treemap, Inspector, Disassembler, ...
|       +-- utils/devices.ts    # MCU memory-map database + auto-detection
+-- .github/workflows/
|   +-- analyze.yml             # CI: report + PR comment
+-- README.md
```

---

## Quick start

**Backend**

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**Frontend** (a second terminal)

```bash
cd frontend
npm install
npm run dev          # open http://localhost:5173
```

Then drag any `.elf` / `.axf` / `.o` / `.out` / `.bin` into the socket.

---

## Headless CLI & CI

The same parser that drives the UI also runs with no browser at all:

```bash
python backend/cli.py firmware.elf --md            # markdown datasheet
python backend/cli.py old.elf --diff new.elf       # build diff
```

Wire it into CI (see `.github/workflows/analyze.yml`) and every PR gets a comment like:

```text
Firmware Diff   v1.elf -> v2.elf
- FLASH  +4.2 KB     RAM  -512 B
- functions  +12 / -3
- largest change: UART driver
```

That single capability is what moves the project from *"an ELF viewer"* to *"a firmware-engineering productivity tool"* — the kind of thing teams actually want in their pipeline.

---

## Screenshots

<!--
  Drop four PNGs into a docs/ folder with these exact names and they render below:
      mkdir -p docs
      cp overview.png treemap-inspector.png disassembler.png compare.png docs/
  If you don't have them yet, DELETE this whole table (from the line above down to
  the end of the second table) so GitHub doesn't show broken-image icons.
-->

| Overview | Treemap + Inspector |
|:---:|:---:|
| <img src="docs/overview.png" width="100%" alt="Firmware overview"/> | <img src="docs/treemap-inspector.png" width="100%" alt="Memory treemap with inspector panel"/> |

| Disassembler + simulator | Build Compare |
|:---:|:---:|
| <img src="docs/disassembler.png" width="100%" alt="Disassembler and stepping simulator"/> | <img src="docs/compare.png" width="100%" alt="Build comparison"/> |

---

## Roadmap

- [ ] **DWARF-based call graph** — real `main -> HAL_GPIO_Init` edges decoded from debug info (v1.5)
- [ ] AI optimisation assistant (an LLM reasoning over the analysis)
- [ ] RTOS task visualiser (FreeRTOS-aware)
- [ ] Power-estimation hooks
- [ ] Plugin system

---

## Tech stack

`FastAPI` · `pyelftools` · `Capstone` · `React` · `Vite` · `TypeScript` · `Tailwind CSS` · `Recharts` · `ReactFlow`

## License

MIT — see [LICENSE](LICENSE).

---

<p align="center">
  <sub>Built for firmware engineers who are tired of squinting at <code>readelf</code> dumps.</sub>
</p>