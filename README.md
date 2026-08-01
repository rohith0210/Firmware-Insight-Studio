<p align="center">
  <h1 align="center">Firmware Insight Studio v2.0</h1>
  <p align="center">
    <strong>A Desktop-Class Embedded Firmware Replay &amp; Introspection IDE</strong><br/>
    Build a professional desktop-class embedded engineering application that happens to run in a browser.
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

## 🏛️ Engineering Vision & Architecture

> **"Do not try to imitate a website. Build a professional desktop-class embedded engineering application that happens to run in a browser."**

**Firmware Insight Studio** is a professional Embedded Firmware Analysis and Replay IDE comparable in UX quality, precision, and presentation to industry-standard engineering software:

* **STM32CubeIDE**
* **Keil μVision**
* **Segger Ozone**
* **Ghidra**
* **Binary Ninja**
* **IDA Pro**
* **VS Code**

---

## 🎯 Product Purpose & Zero-Hardware Philosophy

**Purpose**: Upload an embedded firmware ELF binary (`.elf`, `.axf`, `.out`) and explore, inspect, and step through it like a professional embedded IDE.

It is **NOT** a live hardware debugger and does **NOT** require:
* ❌ ST-Link
* ❌ OpenOCD
* ❌ GDB / GDB Server
* ❌ JLink
* ❌ Local Debug Agent
* ❌ Physical hardware / Target boards

Everything is dynamically reconstructed from the uploaded ELF binary and embedded DWARF debug information. Think of it as an **Offline Firmware Replay IDE** instead of a live debugger.

---

## 💡 Core Philosophy: Dynamic & Truthful Replay

* **Upload Driven**: The uploaded ELF becomes the entire workspace. Nothing exists before the user uploads an ELF file.
* **100% Dynamic**: After upload, every view (Symbols, Source, Assembly, CFG, Memory Map, Stack Frames) is generated dynamically from that ELF.
* **Zero Fake Data**: Never preload fake data, example firmware, fake source code, or synthetic assembly.
* **Truthful Reporting**: If information does not exist inside the ELF/DWARF, the workspace explicitly reports *"No information available"* instead of inventing fake values.

---

## 💻 Professional Engineering UI/UX Design

The interface is engineered to feel like **VS Code + STM32CubeIDE + Ghidra + Binary Ninja**:

* 🎨 **Dark Theme**: Dark, high-contrast, minimal engineering aesthetic.
* ⚡ **Functional Layout**: Clean split viewports, precise panel borders, monospace typography.
* 🚫 **No Marketing / Dashboard Style**: No oversized marketing cards, no giant buttons, no unnecessary animations.
* 🔍 **Focus on Code**: The core focus remains strictly on the code, assembly, control flow, and memory layout.

---

## 🧩 Synchronized Workspace Panels

The IDE workspace provides synchronized panels that stay aligned to the active Program Counter (`PC`):

```text
  Symbol Explorer ──► Source Code ──► Assembly ──► Decompiler
         │                                              │
         ▼                                              ▼
    Call Graph ──► Memory Map ──► Sections ──► Reconstructed Registers
                                                        │
                                                        ▼
                                           Variables & Stack Frames
```

1. **Symbol Explorer**: Filterable function and global variable table with translation unit and section scope.
2. **Source Code View**: DWARF-mapped C source lines (`main.c` / C source) with line-by-line active highlighting.
3. **Assembly View**: Thumb-2 assembly listing with branch target comments and MMIO peripheral annotations.
4. **Call Graph**: ReactFlow-powered control flow graph (CFG) visualizing function invocation edges.
5. **Memory Map & Hex Viewer**: Physical Flash (`.text`, `.rodata`) and SRAM (`.data`, `.bss`) section boundaries.
6. **Reconstructed Registers**: Virtual CPU core register payload (`R0–R12`, `SP`, `LR`, `PC`, `xPSR`) with CubeIDE-style amber text highlights for modified registers.
7. **Variables & Call Stack**: Expandable frame stack (`FRAME #0`, `FRAME #1`) displaying caller lineage, return addresses (`LR`), and scoped SRAM local variables.

---

## 🔄 Deterministic Upload & Replay Flow

```text
Initial Landing Screen
          │
          ▼
   Upload ELF Binary (.elf / .axf / .out)
          │
          ▼
   Parse ELF Headers & Sections
          │
          ▼
   Parse DWARF Debug Metadata
          │
          ▼
   Generate Symbol Table & Object Map
          │
          ▼
   Disassemble Machine Code (Capstone Engine)
          │
          ▼
   Generate Control Flow Graph (CFG)
          │
          ▼
   Open Embedded IDE Workspace
```

*The IDE workspace never opens before an ELF file has been loaded.*

---

## ⏩ Offline Replay & Navigation

The execution workspace simulates firmware navigation rather than executing hardware clock cycles:

1. **Select a Function**: Select `main` or any subroutine from the Symbol Explorer.
2. **View Source & Assembly**: View corresponding C source lines and synchronized Capstone assembly instructions.
3. **View Call Lineage**: Read the Call Lineage Banner (`Called from: Reset_Handler ➔ main @ 0x080001c5 | RETURN TARGET: 0x0800033c`).
4. **Step Through Replay**: Use `Step Into` ⤶, `Step Over` ↷, `Step Out` ⤴, `Run` ▶, and `Reset` ↺ to navigate subroutines, push/pop Call Stack frames, and trace reconstructed register states.

---

## 📐 Product Improvement Rule

Whenever improving the project, we adhere to a single architectural principle:

> **Always ask:**
> * *Would STM32CubeIDE do this?*
> * *Would Ghidra do this?*
> * *Would Binary Ninja do this?*
> * *Would IDA Pro do this?*
>
> **If the answer is no, don't implement it.**

---

## 🛠️ Code Quality & Architecture Standards

* **Refactoring over Rewriting**: Preserve modular components and existing API contracts.
* **Modular Components**: Separate UI rendering, state management, and disassembler logic.
* **Clean Architecture**: Eliminate dead code, duplicated logic, and ad-hoc utility functions.
* **Scalable Stack**: FastAPI 0.115 backend + React 18 & TypeScript 5 frontend.

---

## 📂 Project Directory Structure

```text
Firmware-Insight-Studio/
├── backend/
│   ├── main.py                 # FastAPI backend (pyelftools, Capstone disassembly, DWARF parsing)
│   ├── requirements.txt        # Python backend dependencies
│   └── venv/                   # Virtual environment
├── frontend/
│   ├── index.html              # HTML5 entry point
│   ├── package.json            # Vite + React dependencies
│   ├── vite.config.ts          # Vite configuration
│   └── src/
│       ├── App.tsx             # Main IDE shell & dispatcher
│       ├── apiConfig.ts        # Backend API resolver
│       ├── components/
│       │   ├── WelcomeDropZone.tsx      # Clean upload landing screen
│       │   ├── InvestigationWorkspace.tsx # Code Investigator (Source, Assembly, Hex, Symbols)
│       │   ├── Disassembler.tsx         # Execution & Stepping Workbench
│       │   ├── Overview.tsx             # High-level binary diagnostics & RAM/Flash utilization
│       │   ├── MemoryMap.tsx            # Physical memory layout & squarified size treemaps
│       │   ├── CallGraph.tsx            # ReactFlow function call graph
│       │   ├── SymbolExplorer.tsx       # Symbol table browser
│       │   ├── SectionTable.tsx         # ELF section header inspector
│       │   ├── ObjectFiles.tsx          # Translation unit / object file breakdown
│       │   ├── Peripherals.tsx          # Hardware peripheral utilization grid
│       │   ├── IsrAnalyzer.tsx          # Interrupt vector table & ISR priority analyzer
│       │   ├── Compare.tsx              # Differential build comparator (v1 vs v2 ELF)
│       │   ├── Optimize.tsx             # Dead code analyzer & reclaimable Flash calculator
│       │   └── Ribbon.tsx               # Top navigation ribbon
│       └── utils/
│           ├── VirtualExecutionEngine.ts # Offline Virtual Debugger state machine & frame stack
│           ├── DebuggerEngine.ts        # PC state event subscriber
│           └── devices.ts               # Target MCU hardware profiles (STM32, NRF52, RP2040, etc.)
└── README.md                   # Project documentation
```

---

## ⚡ Supported Microcontrollers & Architectures

| Target Architecture | Variant / ISA | Decoder Engine | Replay Support |
|:---|:---|:---|:---|
| **ARM Cortex-M** | ARMv6-M, ARMv7-M, ARMv8-M (Thumb/Thumb-2) | Capstone Engine | **Full Interactive Replay** |
| **ARM Cortex-A** | ARMv7-A (ARM / Thumb) | Capstone Engine | **Full** |
| **AArch64** | ARMv8-A 64-bit | Capstone Engine | **Full** |
| **RISC-V** | RV32I / RV64I / RV32C | Capstone / GNU objdump | **Full** |
| **Xtensa** | ESP32 / ESP8266 | Capstone / Fallback | **Supported** |
| **x86 / x86-64** | IA-32 / AMD64 | Capstone Engine | **Full** |

---

## 🚀 Quickstart Guide

### Prerequisites
- **Python**: 3.10+
- **Node.js**: 18.0+

### 1. Launch Backend
```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000
```

### 2. Launch Frontend
```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`, drop your microcontroller `.elf` binary, and explore your firmware inside **Firmware Insight Studio**.

---

## 📜 License

Distributed under the **MIT License**. See `LICENSE` for details.
