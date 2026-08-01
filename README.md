<p align="center">
  <h1 align="center">Firmware Insight Studio v2.0</h1>
  <p align="center">
    <strong>Offline Virtual Embedded Debugger, Firmware Replay Engine &amp; Introspection IDE</strong><br/>
    Turn any microcontroller ELF binary into a fully interactive, professional embedded IDE debugging session — no hardware required.
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

## ⚡ What is Firmware Insight Studio v2.0?

**Firmware Insight Studio v2.0** is an **Offline Virtual Embedded Debugger & Firmware Replay IDE**. 

Instead of requiring physical target hardware, ST-Link programmers, OpenOCD, or GDB servers, Firmware Insight Studio parses the uploaded `.elf`, `.axf`, or `.out` binary file and builds a **Virtual Execution Engine**. The uploaded firmware itself becomes an active, interactive debugging session that visually and functionally matches **STM32CubeIDE**, **Keil uVision**, or **VS Code Cortex Debug**.

```text
                               Firmware Insight Studio v2.0
                                             │
                                   Upload microcontroller.elf
                                             │
                                   ELF + DWARF Parser Engine
                                             │
      ┌────────────────────────┬─────────────┴──────────────┬────────────────────────┐
      │                        │                            │                        │
      ▼                        ▼                            ▼                        ▼
 Symbol Explorer          Source View                 Assembly View            Memory Layout
      │                        │                            │                        │
      └────────────────────────┴─────────────┬──────────────┴────────────────────────┘
                                             ▼
                                  Virtual Execution Engine
                                             │
                  ├──────────────────────────┼──────────────────────────┤
                  ▼                          ▼                          ▼
       Step Into / Step Over      Call Lineage & Call Stack    Virtual Register State
       (DWARF + Disassembly)      (Stack Frames & Local Vars)  (CubeIDE Amber Highlights)
```

---

## 🚀 Key Features & Architectural Highlights

### 1. ⚡ Pure Offline Virtual Debugger & Replay Engine
- **No Physical Hardware Required**: Drop any microcontroller ELF file to step line-by-line through machine instructions and source lines offline.
- **Full Stepping Toolbar**:
  - `▶ Run` / `⏸ Pause`: Toggles continuous instruction execution with automatic breakpoint checking.
  - `↷ Step Over`: Advances instruction/source line within the current function listing.
  - `⤶ Step Into`: Follows subroutine call targets (`bl`, `blx`, `call`), pushes a new frame onto the Call Stack, and sets PC to the target function's entry line.
  - `⤴ Step Out`: Pops the top Call Stack frame and returns Virtual PC to the Link Register (`LR`).
  - `↺ Reset Target`: Resets Virtual PC directly to `main()` line 1 and clears the Call Stack.

### 2. 📍 Call Lineage & Entry Trace Banner
- Positioned directly above the disassembly viewport:
  - **Caller Origin**: `Called from: Reset_Handler ➔ main (@ 0x080001c5)`
  - **Target Entry**: `HAL_Init (@ 0x08000410)`
  - **Return Vector**: `RETURN TARGET (LR): 0x0800033c`
- Provides instant visual lineage showing where execution entered from and where it will return upon exit.

### 3. 🥞 Call Stack & Local Variable Inspector
- Renders active stack frames (`FRAME #0`, `FRAME #1`, `FRAME #2`) under the right sidebar tab:
  - Function names, entry addresses, and caller source offsets.
  - **Local Variables & Scope**: Displays SRAM addresses (`0x2000xxxx`), types (`uint32_t`, `HAL_StatusTypeDef`), and virtual variable states.

### 4. 🎛️ Virtual CPU Core Registers (CubeIDE-Style)
- Simulates ARM Cortex-M 16-register payload (`R0–R12`, `SP`, `LR`, `PC`, `xPSR`, `PRIMASK`).
- **Amber Change Highlights**: Registers modified by current instructions glow inCubeIDE-style amber text (`bg-amber-500/30 border-amber-400 text-amber-200`).
- **Thumb-2 LSB Address Masking**: Enforces `(pc & ~1) === (ins.addr & ~1)` so Thumb-2 LSB addresses remain 100% aligned with glowing green instruction highlights.

### 5. 📄 Synchronized Code Investigator (C Source View)
- **Source View (`main.c` / C Source)**: Highlighting active C source code line (`HAL_Init(); ◄ CURRENT`).
- **Assembly View**: Thumb-2 assembly listing with branch comments and MMIO peripheral target annotations.
- **Hex Viewer**: Raw machine code byte display synced with memory addresses.

### 6. 📊 Memory Map, Treemaps & Peripheral MMIO Inspector
- **Address-True Memory Layout**: Flash (`.text`, `.rodata`) vs SRAM (`.data`, `.bss`) physical boundaries.
- **Squarified Treemap**: Visual size allocation per translation unit.
- **STM32 Special Function Register (SFR) Maps**: Interactive register maps for `GPIOA`, `GPIOB`, `GPIOC`, `RCC`, `SysTick`, `NVIC`, `USART1`, `TIM2`.

---

## 📂 Codebase Directory & File Summary

```text
Firmware-Insight-Studio/
├── backend/
│   ├── main.py                 # FastAPI backend server (pyelftools, Capstone disassembly, DWARF parsing)
│   ├── requirements.txt        # Python backend dependencies
│   └── venv/                   # Python virtual environment
├── frontend/
│   ├── index.html              # HTML5 entry page
│   ├── package.json            # Vite + React dependencies & scripts
│   ├── vite.config.ts          # Vite build configuration
│   └── src/
│       ├── App.tsx             # Primary navigation shell & state dispatcher
│       ├── apiConfig.ts        # Backend API URL resolver
│       ├── components/
│       │   ├── WelcomeDropZone.tsx      # Initial clean drag-and-drop landing screen
│       │   ├── InvestigationWorkspace.tsx # Code Investigator (Source, Assembly, Hex, Symbol Inspector)
│       │   ├── Disassembler.tsx         # Virtual Debugger & Instruction Stepping Workbench
│       │   ├── Overview.tsx             # High-level binary diagnostics & RAM/Flash utilization gauges
│       │   ├── MemoryMap.tsx            # Physical memory layout & squarified size treemaps
│       │   ├── CallGraph.tsx            # ReactFlow interactive function call tree
│       │   ├── SymbolExplorer.tsx       # Filterable symbol table browser
│       │   ├── SectionTable.tsx         # ELF section header inspector
│       │   ├── ObjectFiles.tsx          # Object file / compilation unit breakdown
│       │   ├── Peripherals.tsx          # Hardware peripheral utilization grid
│       │   ├── IsrAnalyzer.tsx          # Interrupt vector table & ISR priority analyzer
│       │   ├── Compare.tsx              # Differential build comparator (v1 vs v2 ELF)
│       │   ├── Optimize.tsx             # Dead code analyzer & reclaimable Flash calculator
│       │   └── Ribbon.tsx               # Top navigation ribbon
│       └── utils/
│           ├── VirtualExecutionEngine.ts # Offline Virtual Debugger state machine & frame stack
│           ├── DebuggerEngine.ts        # Event subscription manager for PC state
│           └── devices.ts               # Microcontroller hardware definitions (STM32, NRF52, RP2040, etc.)
└── README.md                   # Project documentation
```

---

## 🛠️ Architecture & Microcontroller Support

| Target Architecture | Variant / ISA | Disassembly Engine | Virtual Execution Support |
|:---|:---|:---|:---|
| **ARM Cortex-M** | ARMv6-M, ARMv7-M, ARMv8-M (Thumb/Thumb-2) | Capstone Engine | **Full Interactive Replay** |
| **ARM Cortex-A** | ARMv7-A (ARM / Thumb) | Capstone Engine | **Full** |
| **AArch64** | ARMv8-A 64-bit | Capstone Engine | **Full** |
| **RISC-V** | RV32I / RV64I / RV32C | Capstone / GNU objdump | **Full** |
| **Xtensa** | ESP32 / ESP8266 | Capstone / Fallback | **Supported** |
| **x86 / x86-64** | IA-32 / AMD64 | Capstone Engine | **Full** |

---

## 💻 Local Installation & Setup

### Prerequisites
- **Python**: 3.10 or higher
- **Node.js**: 18.0 or higher (`npm`)

### 1. Clone & Setup Backend
```bash
git clone https://github.com/rohith0210/Firmware-Insight-Studio.git
cd Firmware-Insight-Studio/backend

# Create and activate Python virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start FastAPI backend server
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000
```

### 2. Setup & Launch Frontend
Open a new terminal window:
```bash
cd Firmware-Insight-Studio/frontend

# Install dependencies
npm install

# Launch Vite development server
npm run dev
```

Open `http://localhost:5173` in your browser, drag and drop any microcontroller `.elf` file, and experience **Firmware Insight Studio v2.0**!

---

## 📜 License

Distributed under the **MIT License**. See `LICENSE` for details.
