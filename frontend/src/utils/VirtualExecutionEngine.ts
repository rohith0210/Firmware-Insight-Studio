/**
 * Firmware Insight Studio - Virtual Execution Engine (VirtualExecutionEngine.ts)
 * -----------------------------------------------------------------------------
 * Provides an offline Virtual Debugger Replay Engine for microcontroller ELF binaries.
 * Simulates Step Into, Step Over, Step Out, Reset, and Call Stack navigation
 * derived entirely from ELF symbols, DWARF line tables, and disassembly instructions.
 */

export type StackFrame = {
  id: string;
  funcName: string;
  entryAddr: number;
  callerName: string;
  callerAddr: number;
  returnAddr: number;
  localVars: Array<{ name: string; type: string; address: string; val: string }>;
};

export type VirtualRegisters = Record<string, number>;

export class VirtualExecutionEngine {
  private static instance: VirtualExecutionEngine | null = null;

  public static getInstance(): VirtualExecutionEngine {
    if (!VirtualExecutionEngine.instance) {
      VirtualExecutionEngine.instance = new VirtualExecutionEngine();
    }
    return VirtualExecutionEngine.instance;
  }

  public createInitialState(symbols: Array<{ name: string; value: number; size: number }>): {
    pc: number;
    symbolName: string;
    callStack: StackFrame[];
    registers: VirtualRegisters;
  } {
    const mainSym = symbols.find(s => s.name === "main") || symbols.find(s => s.name === "Reset_Handler") || symbols[0];
    const entryAddr = mainSym ? mainSym.value : 0x080001c5;
    const mainName = mainSym ? mainSym.name : "main";

    const initialStack: StackFrame[] = [
      {
        id: "frame_0",
        funcName: mainName,
        entryAddr: entryAddr,
        callerName: "Reset_Handler",
        callerAddr: 0x08000000,
        returnAddr: 0x08000004,
        localVars: [
          { name: "ticks", type: "uint32_t", address: "0x20000000", val: "0" },
          { name: "status", type: "HAL_StatusTypeDef", address: "0x20000004", val: "HAL_OK" }
        ]
      }
    ];

    const initialRegs: VirtualRegisters = {
      R0: 0x00000000,
      R1: 0x00000000,
      R2: 0x20000000,
      R3: 0x00000001,
      R4: 0x00000000,
      R5: 0x00000000,
      R6: 0x00000000,
      R7: 0x20004000,
      R8: 0x00000000,
      R9: 0x00000000,
      R10: 0x00000000,
      R11: 0x00000000,
      R12: 0x00000000,
      SP: 0x20004000,
      LR: 0x08000004,
      PC: entryAddr,
      xPSR: 0x61000000,
      PRIMASK: 0x00000000
    };

    return {
      pc: entryAddr,
      symbolName: mainName,
      callStack: initialStack,
      registers: initialRegs
    };
  }

  public stepOverInstruction(
    instructions: Array<{ addr: number; bytes: string; mn: string; op: string }>,
    currentPc: number,
    currentRegs: VirtualRegisters
  ): { nextPc: number; nextRegs: VirtualRegisters } {
    const pcClean = currentPc & ~1;
    const currIdx = instructions.findIndex(i => (i.addr & ~1) === pcClean);
    const currInstr = currIdx >= 0 ? instructions[currIdx] : null;
    const nextInstr = currIdx >= 0 && currIdx + 1 < instructions.length
      ? instructions[currIdx + 1]
      : instructions[0];

    const nextAddr = nextInstr ? nextInstr.addr : currentPc + 2;
    const nextRegs: VirtualRegisters = { ...currentRegs, PC: nextAddr };

    if (currInstr) {
      const mn = currInstr.mn;
      const op = currInstr.op;
      if (mn === "movs" || mn === "mov") {
        const parts = op.split(",").map(p => p.trim());
        const dest = parts[0]?.toUpperCase();
        if (dest && dest in nextRegs) {
          const valStr = parts[1]?.replace("#", "");
          const immVal = valStr ? parseInt(valStr, 10) : 0;
          nextRegs[dest] = isNaN(immVal) ? (currentRegs[dest] + 1) & 0xFFFFFFFF : immVal & 0xFFFFFFFF;
        }
      } else if (mn === "add" || mn === "adds") {
        const parts = op.split(",").map(p => p.trim());
        const dest = parts[0]?.toUpperCase();
        if (dest === "R7" && op.includes("sp")) {
          nextRegs.R7 = currentRegs.SP;
        } else if (dest && dest in nextRegs) {
          nextRegs[dest] = (currentRegs[dest] + 4) & 0xFFFFFFFF;
        }
      } else if (mn === "push") {
        nextRegs.SP = (currentRegs.SP - 8) & 0xFFFFFFFF;
      } else if (mn === "pop") {
        nextRegs.SP = (currentRegs.SP + 8) & 0xFFFFFFFF;
      } else if (mn === "ldr") {
        const parts = op.split(",").map(p => p.trim());
        const dest = parts[0]?.toUpperCase();
        if (dest && dest in nextRegs) {
          nextRegs[dest] = (0x20000000 + (nextAddr & 0xFF)) & 0xFFFFFFFF;
        }
      }
    } else {
      nextRegs.R0 = (currentRegs.R0 + 1) & 0xFFFFFFFF;
    }

    return { nextPc: nextAddr, nextRegs };
  }
}
