import { useState, useMemo } from "react";
import type { Device } from "../utils/devices";
import type { ParseResult } from "../App";
import { DB, DB_ORDER, VENDORS, fmt } from "../utils/devices";

type TabId = "overview" | "arch" | "memory" | "startup" | "interrupts" | "peripherals" | "toolchains" | "docs";

export default function DeviceExplorer({
  activeDevice,
  result,
  override,
  onSelectDevice,
  onNavigate,
}: {
  activeDevice: Device;
  result: ParseResult | null;
  override: string;
  onSelectDevice: (id: string) => void;
  onNavigate?: (view: any, parameter?: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedVendor, setSelectedVendor] = useState("All");
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [expandedVendor, setExpandedVendor] = useState<Record<string, boolean>>({
    STMicroelectronics: true,
    Espressif: true,
    "Raspberry Pi": true,
    "Nordic Semiconductor": true,
  });

  const toggleVendor = (v: string) => {
    setExpandedVendor(prev => ({ ...prev, [v]: !prev[v] }));
  };

  // Grouped device tree by Architecture -> Vendor -> Family
  const groupedTree = useMemo(() => {
    let list = DB_ORDER.map(id => DB[id]);

    if (selectedVendor !== "All") {
      list = list.filter(d => d.vendor === selectedVendor);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        d =>
          d.name.toLowerCase().includes(q) ||
          d.vendor.toLowerCase().includes(q) ||
          d.core.toLowerCase().includes(q) ||
          d.architecture.toLowerCase().includes(q)
      );
    }

    const map: Record<string, Record<string, Device[]>> = {};
    list.forEach(d => {
      const archCat = d.architecture.includes("ARM")
        ? "ARM Cortex-M"
        : d.architecture.includes("Xtensa")
        ? "Xtensa"
        : d.architecture.includes("RISC-V")
        ? "RISC-V"
        : "Generic / Other";
      if (!map[archCat]) map[archCat] = {};
      if (!map[archCat][d.vendor]) map[archCat][d.vendor] = [];
      map[archCat][d.vendor].push(d);
    });

    return map;
  }, [search, selectedVendor]);

  const usedFlash = result ? (result.summary[".text"] || 0) + (result.summary[".rodata"] || 0) : 0;
  const usedRam = result ? (result.summary[".data"] || 0) + (result.summary[".bss"] || 0) : 0;
  const flashPct = activeDevice.flashSize ? Math.min(100, Math.round((usedFlash / activeDevice.flashSize) * 100)) : 0;
  const ramPct = activeDevice.sramSize ? Math.min(100, Math.round((usedRam / activeDevice.sramSize) * 100)) : 0;

  // Boot sequence based on selected MCU
  const getBootSteps = () => {
    const v = (activeDevice.vendor || "").toLowerCase();
    const n = (activeDevice.name || "").toLowerCase();

    if (v.includes("espressif") || n.includes("esp32")) {
      return [
        { title: "ROM Bootloader", desc: "Hardcoded ROM code executes from address 0x40000000 upon power-on reset. Checks boot pins and unpacks flash image.", addr: "0x40000000" },
        { title: "2nd Stage Bootloader", desc: "Loads partition table, selects active OTA app partition, and configures MMU flash cache mapping.", addr: "0x40080000" },
        { title: "esp_startup", desc: "Initializes FreeRTOS CPU scheduler, heaps, stack guard canary, and hardware locks.", code: "call esp_startup()" },
        { title: "app_main()", desc: "Main entry point for user application code executing on Core 0.", code: "void app_main(void)" },
      ];
    } else if (v.includes("raspberry") || n.includes("rp2040") || n.includes("rp2350")) {
      return [
        { title: "Boot ROM", desc: "Internal 16 KB Boot ROM configures clock tree, USB stack, and reads QSPI flash header.", addr: "0x00000000" },
        { title: "Stage 2 Bootloader", desc: "256-byte boot block loaded into SRAM to configure SSI / QSPI XIP mode for fast flash execution.", addr: "0x10000000" },
        { title: "Reset_Handler", desc: "C Runtime startup routine copies .data section from XIP Flash to SRAM and zeros .bss.", addr: "0x10000100" },
        { title: "main()", desc: "User main function launched on Core 0. Core 1 remains halted until launched via multicore API.", code: "int main(void)" },
      ];
    } else {
      return [
        { title: "Vector Table", desc: "Located at Flash offset 0x0000. Contains Initial Stack Pointer (MSP) and Reset_Handler pointer.", addr: `0x${(activeDevice.vectorTableAddr || 0x08000000).toString(16)}` },
        { title: "Reset_Handler", desc: "Core assembly boot code. Copies .data section from Flash to SRAM and zero-initializes .bss region.", addr: `0x${((activeDevice.vectorTableAddr || 0x08000000) + 0x100).toString(16)}` },
        { title: "SystemInit", desc: "Configures system clocks (HSE/HSI, PLL multiplier), FLASH latency wait states, and FPU registers.", code: "SystemInit()" },
        { title: "HAL_Init / main()", desc: "Initializes hardware abstraction layers, peripheral clocks, and branches directly into main().", code: "int main(void)" },
      ];
    }
  };

  const baseVector = activeDevice.vectorTableAddr || 0x08000000;
  const vectors = [
    { irq: -15, name: "Reset_Handler", desc: "System Reset Vector Executed upon power-on or hardware reset pin toggle.", category: "System Exception", defaultAddr: `0x${(baseVector + 0x04).toString(16)}` },
    { irq: -14, name: "NMI_Handler", desc: "Non-Maskable Interrupt generated by clock security system or external hardware fail.", category: "System Exception", defaultAddr: `0x${(baseVector + 0x08).toString(16)}` },
    { irq: -13, name: "HardFault_Handler", desc: "Hard Fault exception triggered on illegal instruction execution or invalid memory access.", category: "System Exception", defaultAddr: `0x${(baseVector + 0x0c).toString(16)}` },
    { irq: -12, name: "MemManage_Handler", desc: "Memory Protection Unit (MPU) fault vector triggered on access violation.", category: "System Exception", defaultAddr: `0x${(baseVector + 0x10).toString(16)}` },
    { irq: -11, name: "BusFault_Handler", desc: "Bus fault vector triggered on AHB/APB bus transaction error or unaligned access.", category: "System Exception", defaultAddr: `0x${(baseVector + 0x14).toString(16)}` },
    { irq: -10, name: "UsageFault_Handler", desc: "Usage fault exception triggered on divide-by-zero or undefined instruction execution.", category: "System Exception", defaultAddr: `0x${(baseVector + 0x18).toString(16)}` },
    { irq: -5, name: "SVC_Handler", desc: "SuperVisor Call exception triggered by 'svc' assembly instruction for RTOS system calls.", category: "System Exception", defaultAddr: `0x${(baseVector + 0x2c).toString(16)}` },
    { irq: -2, name: "PendSV_Handler", desc: "Pending Supervisor Call exception used by RTOS for context switching between threads.", category: "System Exception", defaultAddr: `0x${(baseVector + 0x38).toString(16)}` },
    { irq: -1, name: "SysTick_Handler", desc: "24-bit System Tick timer interrupt generating time base tick for RTOS scheduler.", category: "System Exception", defaultAddr: `0x${(baseVector + 0x3c).toString(16)}` },
    { irq: 0, name: "WWDG_IRQHandler", desc: "Window Watchdog Interrupt triggered before watchdog resets MCU.", category: "Peripheral IRQ", defaultAddr: `0x${(baseVector + 0x40).toString(16)}` },
    { irq: 1, name: "PVD_IRQHandler", desc: "Programmable Voltage Detector interrupt triggered on supply voltage dip.", category: "Peripheral IRQ", defaultAddr: `0x${(baseVector + 0x44).toString(16)}` },
    { irq: 6, name: "EXTI0_IRQHandler", desc: "External Interrupt Line 0 handler for GPIO pin state changes.", category: "Peripheral IRQ", defaultAddr: `0x${(baseVector + 0x58).toString(16)}` },
    { irq: 11, name: "DMA1_Channel1_IRQHandler", desc: "Direct Memory Access Channel 1 transfer complete or error interrupt.", category: "Peripheral IRQ", defaultAddr: `0x${(baseVector + 0x6c).toString(16)}` },
    { irq: 18, name: "ADC1_2_IRQHandler", desc: "Analog to Digital Converter 1 & 2 conversion complete interrupt vector.", category: "Peripheral IRQ", defaultAddr: `0x${(baseVector + 0x88).toString(16)}` },
    { irq: 37, name: "USART1_IRQHandler", desc: "Universal Synchronous Asynchronous Receiver Transmitter 1 RX/TX interrupt.", category: "Peripheral IRQ", defaultAddr: `0x${(baseVector + 0xd4).toString(16)}` },
    { irq: 42, name: "SPI1_IRQHandler", desc: "Serial Peripheral Interface 1 transmit buffer empty / receive data ready vector.", category: "Peripheral IRQ", defaultAddr: `0x${(baseVector + 0xe8).toString(16)}` },
  ];

  return (
    <div className="p-6 h-full overflow-y-auto space-y-6 bg-[var(--bg)] text-white mono text-xs select-none">
      {/* SEARCH HEADER BAR */}
      <div className="p-4 rounded-xl bg-black/30 border border-[var(--line)] space-y-3">
        <div className="flex justify-between items-center">
          <div>
            <span className="text-[10px] text-[var(--mut)] uppercase tracking-wider font-bold">DEVICE MANAGEMENT MODULE</span>
            <h1 className="text-xl font-bold text-white">Device Explorer</h1>
          </div>
          <button
            onClick={() => onSelectDevice("")}
            className={`px-4 py-2 rounded-lg border text-xs font-bold transition ${
              !override
                ? "bg-[rgba(51,214,194,0.15)] border-[var(--a)] text-[var(--a)]"
                : "bg-black/40 border-[var(--line)] text-gray-300 hover:text-white"
            }`}
          >
            ⚡ Auto-Detect Mode
          </button>
        </div>

        <input
          type="text"
          placeholder="Search devices by MCU model, family, vendor, or architecture (e.g., STM32F4, ESP32, nRF52)..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-black/60 border border-[var(--line)] focus:border-[var(--a)] rounded-lg px-4 py-2 text-xs text-white placeholder-gray-500 outline-none"
        />

        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="text-[var(--mut)] self-center font-bold mr-1">Vendor:</span>
          {["All", ...VENDORS].map(v => (
            <button
              key={v}
              onClick={() => setSelectedVendor(v)}
              className={`px-2.5 py-1 rounded border transition ${
                selectedVendor === v
                  ? "bg-[var(--a-dim)] border-[var(--a)] text-[var(--a)] font-bold"
                  : "bg-black/30 border-[var(--line)] text-gray-400 hover:text-gray-200"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* DEVICE SELECTION TREE (ACCORDION STYLE) */}
      <div className="p-4 rounded-xl bg-black/30 border border-[var(--line)] space-y-3">
        <div className="text-[10px] text-[var(--mut)] uppercase font-bold">Microcontroller Device Catalog</div>

        <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
          {Object.entries(groupedTree).map(([archName, vendors]) => (
            <div key={archName} className="space-y-2">
              <div className="text-xs font-bold text-[var(--a)] flex items-center gap-1.5 border-b border-[var(--line)] pb-1">
                <span>❖</span>
                <span>{archName}</span>
              </div>

              <div className="pl-3 space-y-2">
                {Object.entries(vendors).map(([vendorName, devices]) => {
                  const isExpanded = expandedVendor[vendorName] !== false;
                  return (
                    <div key={vendorName} className="space-y-1">
                      <button
                        onClick={() => toggleVendor(vendorName)}
                        className="flex items-center gap-2 text-xs font-bold text-gray-300 hover:text-white transition"
                      >
                        <span className="text-[9px]">{isExpanded ? "▼" : "▶"}</span>
                        <span>{vendorName}</span>
                        <span className="text-[10px] text-[var(--mut)] font-normal">({devices.length})</span>
                      </button>

                      {isExpanded && (
                        <div className="flex flex-wrap gap-2 pl-4 pt-1">
                          {devices.map(d => {
                            const isActive = activeDevice.id === d.id;
                            return (
                              <button
                                key={d.id}
                                onClick={() => onSelectDevice(d.id)}
                                className={`px-3 py-1.5 rounded border text-xs font-bold transition flex items-center gap-2 ${
                                  isActive
                                    ? "bg-[rgba(51,214,194,0.2)] border-[var(--a)] text-[var(--a)] shadow-md"
                                    : "bg-black/40 border-[var(--line)] text-gray-300 hover:border-[var(--a-dim)] hover:text-white"
                                }`}
                              >
                                {isActive && <span className="w-1.5 h-1.5 rounded-full bg-[var(--a)] animate-pulse" />}
                                <span>{d.name}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ACTIVE DEVICE HEADER BANNER */}
      <div className="p-4 rounded-xl bg-black/40 border border-[var(--line)] flex justify-between items-center shadow-lg">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-[var(--a-dim)] border border-[var(--a)] flex items-center justify-center text-lg font-bold text-[var(--a)]">
            {activeDevice.vendor.substring(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="text-[10px] text-[var(--mut)] uppercase font-bold">Active Selected Target</div>
            <h2 className="text-lg font-bold text-white">{activeDevice.name}</h2>
            <div className="text-[11px] text-gray-400">
              {activeDevice.vendor} · {activeDevice.architecture} · {activeDevice.core} @ {activeDevice.clockSpeed || "72 MHz"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 text-right">
          <div>
            <div className="text-[10px] text-[var(--mut)] uppercase">Flash / SRAM</div>
            <div className="text-xs font-bold text-emerald-400">
              {activeDevice.flashSize ? fmt(activeDevice.flashSize) : "N/A"} / {activeDevice.sramSize ? fmt(activeDevice.sramSize) : "N/A"}
            </div>
          </div>
          {activeDevice.datasheetUrl && (
            <a
              href={activeDevice.datasheetUrl}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 rounded bg-[var(--a-dim)] border border-[var(--a)] text-[var(--a)] hover:bg-[var(--a)] hover:text-black font-bold transition text-xs"
            >
              📄 Datasheet
            </a>
          )}
        </div>
      </div>

      {/* DEVICE EXPLORER TABS NAVIGATION */}
      <div className="border-b border-[var(--line)] flex gap-1 text-xs">
        {[
          { id: "overview", label: "Overview", icon: "📊" },
          { id: "arch", label: "Architecture", icon: "❖" },
          { id: "memory", label: "Memory", icon: "▤" },
          { id: "startup", label: "Startup", icon: "➔" },
          { id: "interrupts", label: "Interrupts", icon: "⚡" },
          { id: "peripherals", label: "Peripherals", icon: "⌁" },
          { id: "toolchains", label: "Toolchains", icon: "⚒" },
          { id: "docs", label: "Documentation", icon: "📄" },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as TabId)}
            className={`px-4 py-2.5 rounded-t-lg font-bold border-t border-l border-r transition flex items-center gap-1.5 ${
              activeTab === t.id
                ? "bg-black/60 border-[var(--a)] text-[var(--a)] border-b-2 border-b-[var(--a)]"
                : "bg-black/20 border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* TAB CONTENT PANEL */}
      <div className="p-5 rounded-b-xl bg-black/30 border border-[var(--line)] min-h-[300px]">
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-black/40 border border-[var(--line)] space-y-1">
                <div className="text-[10px] text-[var(--mut)] uppercase font-bold">Flash Capacity</div>
                <div className="text-base font-bold text-white">{activeDevice.flashSize ? fmt(activeDevice.flashSize) : "N/A"}</div>
                <div className="text-[10px] text-[var(--a)] font-bold">{flashPct}% used by firmware</div>
              </div>
              <div className="p-4 rounded-xl bg-black/40 border border-[var(--line)] space-y-1">
                <div className="text-[10px] text-[var(--mut)] uppercase font-bold">SRAM Capacity</div>
                <div className="text-base font-bold text-white">{activeDevice.sramSize ? fmt(activeDevice.sramSize) : "N/A"}</div>
                <div className="text-[10px] text-emerald-400 font-bold">{ramPct}% used by runtime</div>
              </div>
              <div className="p-4 rounded-xl bg-black/40 border border-[var(--line)] space-y-1">
                <div className="text-[10px] text-[var(--mut)] uppercase font-bold">Vector Table Base</div>
                <div className="text-base font-bold text-purple-400 font-mono">0x{(activeDevice.vectorTableAddr || 0x08000000).toString(16)}</div>
                <div className="text-[10px] text-gray-400">{activeDevice.interruptCount || 48} IRQ Vectors</div>
              </div>
              <div className="p-4 rounded-xl bg-black/40 border border-[var(--line)] space-y-1">
                <div className="text-[10px] text-[var(--mut)] uppercase font-bold">Default Toolchain</div>
                <div className="text-sm font-bold text-amber-300">{activeDevice.defaultToolchain || "arm-none-eabi-gcc"}</div>
                <div className="text-[10px] text-gray-400">RTOS: {(activeDevice.rtos || ["FreeRTOS"]).join(", ")}</div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-black/40 border border-[var(--line)] space-y-2">
              <h3 className="text-xs font-bold text-white uppercase">Device Description</h3>
              <p className="text-gray-300 text-xs leading-relaxed">{activeDevice.description}</p>
            </div>
          </div>
        )}

        {activeTab === "arch" && (
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] text-[var(--mut)] uppercase font-bold">{activeDevice.vendor}</span>
                <h3 className="text-base font-bold text-[var(--a)]">{activeDevice.architecture} — {activeDevice.core}</h3>
              </div>
              <span className="px-2.5 py-1 rounded bg-[var(--a-dim)] text-[var(--a)] border border-[var(--a)] font-bold text-xs">
                32-Bit RISC Architecture
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-black/40 border border-[var(--line)] space-y-1">
                <div className="text-[10px] text-[var(--mut)] uppercase font-bold">Register Model</div>
                <div className="text-white font-mono text-xs">R0-R12, SP (MSP/PSP), LR (R14), PC (R15), xPSR</div>
              </div>
              <div className="p-4 rounded-xl bg-black/40 border border-[var(--line)] space-y-1">
                <div className="text-[10px] text-[var(--mut)] uppercase font-bold">Calling Convention</div>
                <div className="text-amber-300 font-mono text-xs">AAPCS / Standard EABI (R0-R3 for args)</div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-black/40 border border-[var(--line)] space-y-2">
              <div className="text-xs font-bold text-emerald-400 uppercase">Architecture Capabilities</div>
              <div className="grid grid-cols-2 gap-2 text-gray-200 text-xs">
                <div className="p-2 rounded bg-black/50 border border-[var(--line)]">✓ Hardware Thumb-2 Instruction Set</div>
                <div className="p-2 rounded bg-black/50 border border-[var(--line)]">✓ Hardware Multiply & Divide Unit</div>
                <div className="p-2 rounded bg-black/50 border border-[var(--line)]">✓ Nested Vectored Interrupt Controller (NVIC)</div>
                <div className="p-2 rounded bg-black/50 border border-[var(--line)]">✓ Single-Cycle I/O Port Acceleration</div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "memory" && (
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-white uppercase">Physical Memory Layout</h3>
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[var(--line)] text-[var(--mut)] uppercase text-[10px]">
                  <th className="py-2 px-3">Region</th>
                  <th className="py-2 px-3">Kind</th>
                  <th className="py-2 px-3">Start Address</th>
                  <th className="py-2 px-3">End Address</th>
                  <th className="py-2 px-3">Size</th>
                  <th className="py-2 px-3">Access</th>
                </tr>
              </thead>
              <tbody>
                {activeDevice.regions.map((r: any) => (
                  <tr key={r.name} className="border-b border-[var(--line)]/40 hover:bg-white/5 transition">
                    <td className="py-2.5 px-3 font-bold text-white flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                      <span>{r.name}</span>
                    </td>
                    <td className="py-2.5 px-3 text-amber-300 font-bold uppercase text-[10px]">{r.kind}</td>
                    <td className="py-2.5 px-3 font-mono text-gray-300">0x{r.base.toString(16).padStart(8, "0")}</td>
                    <td className="py-2.5 px-3 font-mono text-gray-300">0x{(r.base + r.size - 1).toString(16).padStart(8, "0")}</td>
                    <td className="py-2.5 px-3 font-bold text-emerald-400">{fmt(r.size)}</td>
                    <td className="py-2.5 px-3 font-mono text-purple-400">{r.kind === "flash" || r.kind === "xip" ? "RX" : "RW"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "startup" && (
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-white uppercase">Execution Boot Sequence</h3>
            <div className="space-y-3">
              {getBootSteps().map((st, idx) => (
                <div key={st.title} className="p-3 rounded-lg bg-black/40 border border-[var(--line)] flex gap-4 items-center">
                  <div className="w-7 h-7 rounded-full bg-[var(--a-dim)] border border-[var(--a)] text-[var(--a)] font-bold text-xs flex items-center justify-center shrink-0">
                    {idx + 1}
                  </div>
                  <div className="flex-1 space-y-0.5">
                    <div className="flex justify-between">
                      <h4 className="font-bold text-white text-xs">{st.title}</h4>
                      {st.addr && <span className="font-mono text-purple-400 text-[10px]">{st.addr}</span>}
                      {st.code && <span className="font-mono text-amber-300 text-[10px]">{st.code}</span>}
                    </div>
                    <p className="text-gray-300 text-[11px]">{st.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "interrupts" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold text-white uppercase">Interrupt Vector Table</h3>
              <span className="text-purple-400 font-mono text-[10px]">Vector Base: 0x{baseVector.toString(16)}</span>
            </div>
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[var(--line)] text-[var(--mut)] uppercase text-[10px]">
                  <th className="py-2 px-3">IRQ</th>
                  <th className="py-2 px-3">Vector Handler</th>
                  <th className="py-2 px-3">Address</th>
                  <th className="py-2 px-3">Description</th>
                  <th className="py-2 px-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {vectors.map(v => (
                  <tr key={v.name} className="border-b border-[var(--line)]/40 hover:bg-white/5 transition">
                    <td className="py-2 px-3 font-mono font-bold text-amber-300">{v.irq}</td>
                    <td className="py-2 px-3 font-bold text-white">{v.name}</td>
                    <td className="py-2 px-3 font-mono text-purple-400">{v.defaultAddr}</td>
                    <td className="py-2 px-3 text-gray-300 text-[11px]">{v.desc}</td>
                    <td className="py-2 px-3">
                      <button
                        onClick={() => onNavigate?.("investigator", v.name)}
                        className="px-2 py-0.5 rounded bg-[var(--a-dim)] text-[var(--a)] border border-[var(--a-dim)] hover:bg-[var(--a)] hover:text-black font-bold text-[10px] transition"
                      >
                        Code
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "peripherals" && (
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-white uppercase">Integrated Hardware Peripherals</h3>
            <div className="grid grid-cols-3 gap-3">
              {["GPIO", "USART", "SPI", "I2C", "CAN", "USB", "DMA", "ADC", "DAC", "TIMERS", "RCC", "NVIC"].map(p => (
                <div key={p} className="p-3 rounded-lg bg-black/40 border border-[var(--line)] space-y-1">
                  <div className="font-bold text-[var(--a)] text-xs">{p} Module</div>
                  <div className="text-[10px] text-gray-400">Integrated Hardware Peripheral</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "toolchains" && (
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-white uppercase">Supported Toolchains & Debug Interfaces</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-black/40 border border-[var(--line)] space-y-2">
                <div className="text-[10px] text-[var(--mut)] uppercase font-bold">Compiler Toolchains</div>
                <div className="space-y-1 text-xs">
                  <div className="text-amber-300 font-mono">GCC: {activeDevice.defaultToolchain || "arm-none-eabi-gcc"}</div>
                  <div className="text-gray-300">LLVM / Clang Embedded Target</div>
                  <div className="text-gray-300">IAR Embedded Workbench</div>
                </div>
              </div>
              <div className="p-4 rounded-xl bg-black/40 border border-[var(--line)] space-y-2">
                <div className="text-[10px] text-[var(--mut)] uppercase font-bold">Debug Interfaces</div>
                <div className="space-y-1 text-xs text-emerald-400 font-mono">
                  <div>✓ SWD (Serial Wire Debug)</div>
                  <div>✓ JTAG (IEEE 1149.1)</div>
                  <div>✓ SEGGER J-Link / ST-LINK v3 / OpenOCD</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "docs" && (
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-white uppercase">Documentation & Datasheets</h3>
            <div className="space-y-2">
              {activeDevice.datasheetUrl && (
                <a
                  href={activeDevice.datasheetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="p-3 rounded-lg bg-black/40 border border-[var(--line)] hover:border-[var(--a)] flex justify-between items-center text-gray-200 hover:text-white transition"
                >
                  <div>
                    <div className="font-bold text-xs">{activeDevice.name} Official Datasheet</div>
                    <div className="text-[10px] text-[var(--mut)]">Hardware electrical specifications, pinouts, and memory maps</div>
                  </div>
                  <span className="text-[var(--a)] font-bold">PDF ↗</span>
                </a>
              )}
              <div className="p-3 rounded-lg bg-black/40 border border-[var(--line)] flex justify-between items-center text-gray-200">
                <div>
                  <div className="font-bold text-xs">{activeDevice.architecture} Reference Manual</div>
                  <div className="text-[10px] text-[var(--mut)]">Register details and programmer's model</div>
                </div>
                <span className="text-gray-400 text-xs">Available</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
