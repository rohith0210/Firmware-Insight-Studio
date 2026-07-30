<p align="center">
  <h1 align="center">Firmware Insight Studio</h1>
  <p align="center">
    <strong>A professional firmware analysis and visualization platform for embedded engineers.</strong><br/>
    Static ELF introspection, interactive disassembly, memory layout visualization, and firmware optimization in a unified workbench.
  </p>
  <p align="center">
    <a href="https://github.com/rohith0210/Firmware-Insight-Studio/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License"/></a>
    <a href="https://fastapi.tiangolo.com/"><img src="https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white" alt="FastAPI"/></a>
    <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black" alt="React"/></a>
    <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript"/></a>
    <a href="http://www.capstone-engine.org/"><img src="https://img.shields.io/badge/Capstone-5.0-orange" alt="Capstone"/></a>
    <a href="https://pypi.org/project/pyelftools/"><img src="https://img.shields.io/badge/pyelftools-0.31-blue" alt="pyelftools"/></a>
  </p>
</p>

---

<!-- DEMO_PLACEHOLDER_START -->
<p align="center">
  <img width="2816" height="1536" alt="FWS" src="https://github.com/user-attachments/assets/b6e5cf11-ef00-43e1-9acf-1e68bb547e62" />
  <br/>
  <em>Firmware Insight Studio Overview &amp; Memory Introspection Workspace</em>
</p>
<!-- DEMO_PLACEHOLDER_END -->

---

## Why Firmware Insight Studio?

Traditional embedded toolchains rely on command-line utilities such as `readelf`, `objdump`, `nm`, and `size`. While accurate, these tools produce flat text dumps that require tedious manual cross-referencing to answer basic architectural questions:

* *Which module is responsible for the recent 15 KB Flash size jump?*
* *Is this memory region overflow caused by static allocations or bloated vector tables?*
* *Are unreferenced library subroutines linked into `.text` despite `-ffunction-sections`?*

**Firmware Insight Studio** replaces disjointed CLI invocation with an integrated visual workspace:

| Standard CLI Tools (`readelf` / `objdump`) | Firmware Insight Studio Workspace |
|:---|:---|
| Text-based section headers (`readelf -S`) | Interactive memory map & squarified Flash/RAM treemaps |
| Flat symbol table listings (`nm --size-sort`) | Filterable symbol explorer with module attribution & scope categorization |
| Manual CLI disassembly (`arm-none-eabi-objdump -d`) | Context-aware disassembler with control flow visualization |
| Manual string search for build flags | Automatic toolchain identification & `.ARM.attributes` inspection |
| Manual linker map review | Rule-based dead code identification & reclaimable byte calculation |

---

## Workspace Features

### 1. Overview Workspace
* **Purpose**: Provides high-level diagnostics immediately upon loading a firmware binary payload.
* **Key Capabilities**:
  * Automatic toolchain string detection from `.comment` section metadata.
  * FLASH and SRAM capacity utilization gauges with overflow indicators.
  * Checksum verification (CRC32) and entry point address mapping.
  * Top size contributors breakdown for Flash and RAM.
* **Status**: **Fully Implemented**.

### 2. Memory Analysis Workspace
* **Purpose**: Interactive visual analysis of Flash and RAM distribution across sections and translation units.
* **Key Capabilities**:
  * **Squarified Treemap**: Visual representation of Flash memory allocations with color ramps proportional to function size.
  * **Address-True Memory Map**: Vertical memory layout visualization showing physical section boundaries (`.text`, `.rodata`, `.data`, `.bss`).
  * **Section Explorer**: Tabular section inspection with type filtering, address alignment metrics, and flags (`SHF_ALLOC`, `SHF_EXECINSTR`).
* **Status**: **Fully Implemented**.

### 3. Code Investigator
* **Purpose**: Single-pane inspection combining DWARF source mapping, disassembly, and AST decompilation.
* **Key Capabilities**:
  * Real-time DWARF debug source code viewing for binaries compiled with `-g`.
  * **Pseudocode Fallback**: Reconstructed C AST representation when source files are unavailable locally.
  * Synchronized line-level assembly navigation.
* **Status**: **Fully Implemented**.

### 4. Call Graph Workspace
* **Purpose**: Interactive function dependency graph visualization.
* **Key Capabilities**:
  * ReactFlow-powered call graph visualization derived from symbol relocation references.
  * Focus node selection with leaf node highlighting.
  * Direct navigation from call graph nodes into the Code Investigator.
* **Status**: **Fully Implemented**.

### 5. Execution Workspace
* **Purpose**: Dual-mode instruction workspace distinguishing static firmware introspection from live debugging.
* **Key Capabilities**:
  * **Static Analysis Mode**: Disassembly view with instruction mnemonic decoding, machine code hex display, and register access pattern tagging (`touched` / `written`).
  * **Live Debug Mode**: UI hooks prepared for GDB / OpenOCD server connection (Register file, Stack frames, Program Counter).
* **Status**: Static Mode **Fully Implemented**; Live Debug GDB bridge **In Progress**.

### 6. Device Explorer
* **Purpose**: Target MCU hardware layout matching and peripheral register map inspection.
* **Key Capabilities**:
  * Pre-configured memory layouts for popular microcontrollers (STM32, NRF52, RP2040, ESP32, SAMD, MSP430).
  * Peripheral utilization auto-detection (GPIO, UART, SPI, I2C, USB, DMA, ADC, CAN).
  * System View Description (SVD) register mapping hooks.
* **Status**: **Fully Implemented**.

### 7. Optimization Workspace
* **Purpose**: Automated firmware footprint reduction and linker configuration checks.
* **Key Capabilities**:
  * **Dead Code Identification**: Finds unreferenced global functions and calculates total reclaimable Flash bytes.
  * **Rule-Based Recommendations**: Highlights missing `-ffunction-sections`, `-fdata-sections`, or `--gc-sections` flags.
* **Status**: **Fully Implemented**.

### 8. Reports & Comparison Workspace
* **Purpose**: Firmware metrics export and multi-build delta tracking.
* **Key Capabilities**:
  * Export structured analysis reports in JSON and CSV formats.
  * Build comparison engine tracking size deltas between two ELF binaries (`v1` vs `v2`).
  * Headless CLI (`cli.py`) for CI/CD pull request automated comment generation.
* **Status**: **Fully Implemented**.

---

## Supported Architectures

Disassembly decoding and register schema attribution support the following target architectures:

| Architecture | Architecture Variant / ISA | Decoder Engine | Disassembly Support |
|:---|:---|:---|:---|
| **ARM Cortex-M** | ARMv6-M, ARMv7-M, ARMv8-M (Thumb / Thumb-2) | Capstone Engine | **Full** |
| **ARM Cortex-A** | ARMv7-A (ARM / Thumb) | Capstone Engine | **Full** |
| **AArch64** | ARMv8-A 64-bit | Capstone Engine | **Full** |
| **RISC-V** | RV32I / RV64I / RV32C | Capstone / GNU objdump | **Full** |
| **x86 / x86-64** | IA-32 / AMD64 | Capstone Engine | **Full** |
| **Xtensa** | ESP32 / ESP8266 | GNU objdump fallback | **Supported** |
| **AVR / 8051** | AVR 8-bit / MCS-51 | Symbol & Section analysis | **Metadata Only** |

*Note: Disassembly capabilities depend on available ELF relocation metadata and architecture disassembler backends.*

---

## Supported Firmware Formats

| Format | File Extension | Symbol Metadata | Disassembly | Source Mapping |
|:---|:---|:---|:---|:---|
| **ELF Executable** | `.elf`, `.out`, `.axf` | **Full** | **Full** | Supported (DWARF) |
| **Relocatable Object** | `.o` | **Full** | **Full** | Supported (DWARF) |
| **Raw Binary** | `.bin` | None | Requires Offset | Unavailable |
| **Intel HEX** | `.hex` | None | Address Only | Unavailable |

---

## Analysis Capabilities

* **ELF Parsing**: Complete header parsing (`e_type`, `e_machine`, `e_entry`, `e_flags`).
* **Section Analysis**: Header extraction, alignment calculation, virtual vs. physical address mapping.
* **Symbol Analysis**: Scope categorization (Local, Global, Weak), STT type extraction, size sorting.
* **Memory Visualization**: Address-true stack/heap/flash diagrams and squarified size treemaps.
* **Disassembly Engine**: Machine instruction decoding, Thumb mode detection, register mutation tracking.
* **Call Graph Introspection**: Static call edge generation from relocation tables and instruction target offsets.
* **Device Identification**: Heuristic target detection via vector table signatures and device memory maps.
* **Build Comparison**: Differential symbol analysis reporting added, deleted, or expanded subroutines.

---

## Screenshots

<p align="center">
  <img src="https://raw.githubusercontent.com/rohith0210/Firmware-Insight-Studio/main/assets/screenshot_overview.png" alt="Overview Workspace" width="48%"/>
  <img src="https://raw.githubusercontent.com/rohith0210/Firmware-Insight-Studio/main/assets/screenshot_treemap.png" alt="Memory Analysis Treemap" width="48%"/>
</p>
<p align="center">
  <img src="https://raw.githubusercontent.com/rohith0210/Firmware-Insight-Studio/main/assets/screenshot_investigator.png" alt="Code Investigator Workspace" width="48%"/>
  <img src="https://raw.githubusercontent.com/rohith0210/Firmware-Insight-Studio/main/assets/screenshot_callgraph.png" alt="Call Graph Inspector" width="48%"/>
</p>

---

## Technical Architecture

```text
+-----------------------------------------------------------------------------------+
|                           Frontend (React 18 + Vite + TS)                         |
|  Sidebar Navigation  .  Header Ribbon  .  Global Search Modal  .  Error Boundary  |
|  Overview  .  Memory Map  .  Code Investigator  .  Call Graph  .  Execution      |
+-----------------------------------------+-----------------------------------------+
                                          | REST API (HTTP JSON)
+-----------------------------------------+-----------------------------------------+
|                               Backend (FastAPI + Python)                          |
|  - main.py           : REST Endpoints & Analysis Pipeline Controller              |
|  - pyelftools        : ELF Section, Symbol, Relocation & DWARF Parser              |
|  - Capstone Engine   : Multi-architecture Disassembly Decoder                      |
|  - Disk Cache        : Persistent Binary Payload Store (/tmp/fis_elf_cache)       |
|  - cli.py            : Headless CI/CD Datasheet & Diff Engine                     |
+-----------------------------------------------------------------------------------+
```

---

## Installation & Setup

### Prerequisites
* Python 3.10 or higher
* Node.js 18 or higher & npm

### Backend Setup

```bash
# Navigate to backend directory
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install python dependencies
pip install -r requirements.txt

# Start FastAPI development server
uvicorn main:app --reload --port 8000
```

### Frontend Setup

```bash
# Navigate to frontend directory in a new terminal
cd frontend

# Install node dependencies
npm install

# Start Vite development server
npm run dev
```

Open your browser at `http://localhost:5173`.

---

## Project Structure

```text
Firmware-Insight-Studio/
├── backend/
│   ├── main.py              # FastAPI server, ELF parsing pipeline, disassembly engine
│   ├── cli.py               # Headless CLI datasheet & CI build diff tool
│   └── requirements.txt     # Python dependencies (fastapi, pyelftools, capstone)
├── frontend/
│   ├── src/
│   │   ├── App.tsx          # Workbench shell & tab state management
│   │   ├── main.tsx         # React application entry point
│   │   ├── index.css        # Core styling & design tokens
│   │   ├── components/
│   │   │   ├── Overview.tsx                # Dashboard gauges & summary
│   │   │   ├── MemoryMap.tsx               # Flash/RAM treemap & address map
│   │   │   ├── SectionTable.tsx            # Section explorer grid
│   │   │   ├── CodeInvestigator.tsx        # Combined Source/Disassembly workspace
│   │   │   ├── Disassembler.tsx            # Instruction decoder & register decoder
│   │   │   ├── CallGraph.tsx               # Interactive ReactFlow call graph
│   │   │   ├── PeripheralDashboard.tsx     # Hardware peripheral explorer
│   │   │   ├── OptimizationAssistant.tsx   # Dead code & optimization recommendations
│   │   │   ├── BuildCompare.tsx            # Binary diff engine
│   │   │   ├── InspectorPanel.tsx          # Docked symbol inspector
│   │   │   ├── Ribbon.tsx                  # Target selector & quick actions
│   │   │   ├── Sidebar.tsx                 # Navigation bar
│   │   │   ├── ErrorBoundary.tsx           # Global React error handler
│   │   │   └── GlobalSearchModal.tsx       # Symbol & section quick search modal
│   │   └── utils/
│   │       └── devices.ts   # Microcontroller memory map database
│   ├── package.json
│   └── vite.config.ts
├── test_firmware.c          # Sample firmware compilation source
├── v1.elf                   # Sample ELF test binary (v1)
├── v2.elf                   # Sample ELF test binary (v2)
└── README.md
```

---

## Current Status

* **Implemented**:
  * Full ELF header, section table, and symbol table parsing.
  * Memory treemap visualization and physical address map rendering.
  * Disassembly decoding for ARM Thumb/ARM32, AArch64, RISC-V, and x86.
  * Combined Code Investigator workspace with DWARF source mapping.
  * Static dead code detection and optimization rule evaluation.
  * Headless CLI reporting and PR comment diff formatting.
* **In Progress**:
  * OpenOCD / GDB socket connector for Live Debug mode.
  * System View Description (SVD) XML parser for custom register definitions.
* **Planned**:
  * Advanced AST-based C decompiler pass.
  * FreeRTOS task & stack watermark analysis.

---

## Roadmap

### Phase 1: Near-Term Enhancements (v1.6)
- [ ] **Live Debugging Integration**: Direct GDB/OpenOCD socket bridge for live register stepping, breakpoint toggling, and memory inspection in the Execution Workspace.
- [ ] **CMSIS-SVD Peripheral Integration**: Support for uploading custom SVD XML files to auto-populate hardware register maps in the Device Explorer.
- [ ] **DWARF Call Graph Precision**: Extraction of exact subprogram call edges directly from DWARF debug tags (`DW_TAG_subprogram` / `DW_AT_call_file`).

### Phase 2: Advanced Analysis & Decompilation (v2.0)
- [ ] **Control-Flow AST Decompiler Engine**: Enhanced control-flow reconstruction (`if/else`, loops, variable types) for stripped binaries lacking source code.
- [ ] **RTOS Task & Stack Inspection**: Static allocation and stack watermark analysis for FreeRTOS, Zephyr OS, and CMSIS-RTOS targets.
- [ ] **Multi-Binary Diff Comparison**: Side-by-side visual code inspector diffing two arbitrary `.elf` revisions.

### Phase 3: Platform Extensibility (v2.5)
- [ ] **Extensible Python Plugin API**: Custom user-defined rule passes for security checks, memory safety audits, and custom MCU targets.
- [ ] **Headless CI/CD GitHub Action**: Official GitHub Action marketplace integration for pull request size impact comments.

---

## Contributing

Contributions to Firmware Insight Studio are welcome! Please feel free to submit Pull Requests, report bugs, or request features via GitHub Issues.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
