import { useState } from "react";

type ArchSpec = {
  id: string;
  name: string;
  family: string;
  bits: number;
  endianness: string;
  registers: string;
  callingConvention: string;
  features: string[];
  vendors: string[];
  description: string;
};

const ARCH_DATABASE: ArchSpec[] = [
  {
    id: "cortex-m0",
    name: "ARM Cortex-M0 / M0+",
    family: "ARM Cortex-M",
    bits: 32,
    endianness: "Little-Endian (selectable)",
    registers: "R0-R12, SP (R13), LR (R14), PC (R15), PSR",
    callingConvention: "AAPCS (R0-R3 for args, R0 for return)",
    features: ["Thumb instruction set", "Single-cycle 32-bit multiplier", "Nested Vectored Interrupt Controller (NVIC)", "Low power 2-stage pipeline"],
    vendors: ["STMicroelectronics", "Raspberry Pi", "NXP", "Microchip"],
    description: "Ultra-low power 32-bit RISC processor designed for cost-sensitive embedded applications.",
  },
  {
    id: "cortex-m3",
    name: "ARM Cortex-M3",
    family: "ARM Cortex-M",
    bits: 32,
    endianness: "Little-Endian",
    registers: "R0-R12, SP (MSP/PSP), LR, PC, xPSR",
    callingConvention: "AAPCS (ARM Architecture Procedure Call Standard)",
    features: ["Thumb-2 instruction set", "Hardware divide & single-cycle multiply", "Memory Protection Unit (MPU)", "Bit-band operation"],
    vendors: ["STMicroelectronics", "NXP", "Silicon Labs"],
    description: "Mainstream 32-bit core featuring high compute efficiency and rich interrupt handling.",
  },
  {
    id: "cortex-m4",
    name: "ARM Cortex-M4 / M4F",
    family: "ARM Cortex-M",
    bits: 32,
    endianness: "Little-Endian",
    registers: "R0-R12, SP, LR, PC, S0-S31 (FPU)",
    callingConvention: "AAPCS with VFP extension",
    features: ["DSP instruction extensions", "Single-Precision FPU (IEEE 754)", "Thumb-2 instruction set", "3-stage pipeline with branch speculation"],
    vendors: ["STMicroelectronics", "Nordic Semiconductor", "Texas Instruments", "Renesas"],
    description: "High-efficiency core with DSP instructions and optional floating point unit for digital signal processing.",
  },
  {
    id: "cortex-m7",
    name: "ARM Cortex-M7",
    family: "ARM Cortex-M",
    bits: 32,
    endianness: "Little-Endian",
    registers: "R0-R12, SP, LR, PC, D0-D16 (Double Precision FPU)",
    callingConvention: "AAPCS with VFPv5",
    features: ["6-stage dual-issue superscalar pipeline", "Instruction & Data Cache (L1)", "TCM (Tightly Coupled Memory)", "Double Precision FPU"],
    vendors: ["STMicroelectronics", "NXP"],
    description: "Highest performance Cortex-M core designed for real-time control, graphics, and intensive compute.",
  },
  {
    id: "cortex-m33",
    name: "ARM Cortex-M33",
    family: "ARM Cortex-M",
    bits: 32,
    endianness: "Little-Endian",
    registers: "R0-R12, SP (Secure/Non-Secure), LR, PC, FPU",
    callingConvention: "AAPCS with ARMv8-M Security extensions",
    features: ["ARM TrustZone security", "DSP & FPU extensions", "Enhanced MPU", "Co-processor interface"],
    vendors: ["STMicroelectronics", "Nordic Semiconductor", "Raspberry Pi"],
    description: "ARMv8-M architecture featuring hardware TrustZone security isolation for IoT nodes.",
  },
  {
    id: "riscv-rv32",
    name: "RISC-V RV32 (IMC/EMC)",
    family: "RISC-V",
    bits: 32,
    endianness: "Little-Endian",
    registers: "x0 (zero), x1 (ra), x2 (sp), x3-x31, pc",
    callingConvention: "RISC-V Calling Convention (a0-a7 for arguments)",
    features: ["Open ISA standard", "Compressed Instructions (rv32i_c)", "Hardware Multiply/Divide (rv32i_m)", "Atomic instructions"],
    vendors: ["Espressif", "SiFive", "WCH", "Gigadevice"],
    description: "Modular open-standard RISC architecture gaining rapid adoption in embedded systems.",
  },
  {
    id: "xtensa-lx6",
    name: "Xtensa LX6 / LX7",
    family: "Xtensa",
    bits: 32,
    endianness: "Little-Endian",
    registers: "a0-a15 (Windowed registers), pc, SAR",
    callingConvention: "Windowed ABI / Call0 ABI",
    features: ["Windowed register file (64 physical registers)", "Dual-core symmetric multiprocessing", "Vector AI instructions", "Flexible coprocessor interface"],
    vendors: ["Espressif Systems"],
    description: "32-bit configurable RISC core powering popular Wi-Fi and Bluetooth SoCs.",
  },
];

export default function ArchitectureExplorerView() {
  const [activeArchId, setActiveArchId] = useState("cortex-m4");

  const activeArch = ARCH_DATABASE.find(a => a.id === activeArchId) || ARCH_DATABASE[2];

  return (
    <div className="p-6 h-full overflow-y-auto space-y-6 bg-[var(--bg)] text-white mono text-xs select-none">
      {/* HEADER */}
      <div className="pb-4 border-b border-[var(--line)]">
        <div className="text-[10px] text-[var(--mut)] uppercase tracking-wider font-bold">Device Support System</div>
        <h1 className="text-xl font-bold text-white">Architecture Explorer</h1>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* LEFT COLUMN: ARCHITECTURE SELECTOR CATALOG */}
        <div className="p-4 rounded-xl bg-black/30 border border-[var(--line)] space-y-2">
          <div className="text-[10px] text-[var(--mut)] uppercase font-bold mb-3">Supported Microcontroller Architectures</div>
          {ARCH_DATABASE.map(arch => (
            <button
              key={arch.id}
              onClick={() => setActiveArchId(arch.id)}
              className={`w-full p-3 rounded-lg border text-left transition flex justify-between items-center ${
                activeArchId === arch.id
                  ? "bg-[rgba(51,214,194,0.15)] border-[var(--a)] text-[var(--a)] font-bold"
                  : "bg-black/40 border-[var(--line)] text-gray-300 hover:text-white hover:bg-white/5"
              }`}
            >
              <div>
                <div className="text-xs">{arch.name}</div>
                <div className="text-[10px] text-[var(--mut)]">{arch.family} · {arch.bits}-bit</div>
              </div>
              <span className="text-[10px]">➔</span>
            </button>
          ))}
        </div>

        {/* RIGHT 2 COLUMNS: DETAILED SPECIFICATION BOARD */}
        <div className="col-span-2 space-y-4">
          {/* HERO BOARD */}
          <div className="p-5 rounded-xl bg-black/40 border border-[var(--line)] space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] text-[var(--mut)] uppercase font-bold">{activeArch.family}</span>
                <h2 className="text-xl font-bold text-[var(--a)]">{activeArch.name}</h2>
              </div>
              <span className="px-2.5 py-1 rounded bg-[var(--a-dim)] text-[var(--a)] border border-[var(--a)] font-bold text-xs">
                {activeArch.bits}-bit ISA
              </span>
            </div>

            <p className="text-gray-300 text-[11px] leading-relaxed">{activeArch.description}</p>
          </div>

          {/* REGISTER & CALLING CONVENTION CARD */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-black/30 border border-[var(--line)] space-y-2">
              <div className="text-[10px] text-[var(--mut)] uppercase font-bold">Register Model</div>
              <div className="text-white font-mono text-[11px]">{activeArch.registers}</div>
            </div>

            <div className="p-4 rounded-xl bg-black/30 border border-[var(--line)] space-y-2">
              <div className="text-[10px] text-[var(--mut)] uppercase font-bold">Calling Convention</div>
              <div className="text-amber-300 font-mono text-[11px]">{activeArch.callingConvention}</div>
            </div>
          </div>

          {/* KEY FEATURES LIST */}
          <div className="p-5 rounded-xl bg-black/30 border border-[var(--line)] space-y-3">
            <div className="text-[11px] font-bold text-emerald-400 uppercase">Architecture Capabilities</div>
            <div className="grid grid-cols-2 gap-2">
              {activeArch.features.map(feat => (
                <div key={feat} className="p-2.5 rounded bg-black/40 border border-[var(--line)] flex items-center gap-2 text-gray-200">
                  <span className="text-emerald-400">✓</span>
                  <span>{feat}</span>
                </div>
              ))}
            </div>
          </div>

          {/* TYPICAL VENDORS */}
          <div className="p-4 rounded-xl bg-black/30 border border-[var(--line)] space-y-2">
            <div className="text-[10px] text-[var(--mut)] uppercase font-bold">Primary Manufacturers</div>
            <div className="flex flex-wrap gap-2">
              {activeArch.vendors.map(v => (
                <span key={v} className="px-2.5 py-1 rounded bg-white/5 border border-[var(--line)] text-gray-200 font-bold text-[11px]">
                  {v}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
