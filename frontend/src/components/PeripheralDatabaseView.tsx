import { useState } from "react";
import type { Device } from "../utils/devices";

type PeriphSpec = {
  name: string;
  category: string;
  desc: string;
  commonRegisters: string[];
  features: string[];
};

const PERIPHERAL_CATALOG: PeriphSpec[] = [
  { name: "GPIO", category: "General Purpose I/O", desc: "General-Purpose Input/Output controller managing digital pins, push-pull/open-drain modes, and pull-up/down resistors.", commonRegisters: ["MODER", "OTYPER", "OSPEEDR", "PUPDR", "IDR", "ODR", "BSRR"], features: ["Digital I/O toggle", "Alternate Function multiplexing", "Atomic bit set/reset via BSRR"] },
  { name: "USART / UART", category: "Communication", desc: "Universal Synchronous/Asynchronous Receiver Transmitter supporting RS-232, RS-485, and LIN protocols.", commonRegisters: ["CR1", "CR2", "CR3", "BRR", "GTPR", "SR / ISR", "DR / TDR / RDR"], features: ["Hardware flow control (RTS/CTS)", "DMA transmit/receive acceleration", "Baud rate generator"] },
  { name: "SPI", category: "Communication", desc: "Serial Peripheral Interface bus for high-speed synchronous communication with sensors, SD cards, and displays.", commonRegisters: ["CR1", "CR2", "SR", "DR", "CRCPR", "RXCRCR", "TXCRCR"], features: ["Full-duplex master/slave mode", "Hardware CRC calculation", "NSS slave select management"] },
  { name: "I2C", category: "Communication", desc: "Inter-Integrated Circuit multi-master bus for low-speed 2-wire communication.", commonRegisters: ["CR1", "CR2", "OAR1", "OAR2", "DR", "SR1", "SR2", "CCR", "TRISE"], features: ["7-bit and 10-bit addressing", "SMBus 2.0 / PMBus support", "Clock stretching & Noise filter"] },
  { name: "CAN / CAN-FD", category: "Automotive / Bus", desc: "Controller Area Network for robust noise-immune automotive and industrial multi-master messaging.", commonRegisters: ["MCR", "MSR", "TSR", "RF0R", "RF1R", "IER", "ESR", "BTR"], features: ["Hardware packet filtering & FIFOs", "Automatic retransmission", "CAN 2.0B & CAN-FD payload expansion"] },
  { name: "USB OTG", category: "Communication", desc: "Universal Serial Bus On-The-Go controller supporting Device, Host, and OTG modes.", commonRegisters: ["GOTGCTL", "GAHBCFG", "GUSBCFG", "GRSTCTL", "GINTSTS", "GINTMSK"], features: ["Full-Speed (12 Mbps) & High-Speed (480 Mbps)", "Dedicated FIFO RAM", "Isochronous & Bulk endpoints"] },
  { name: "DMA", category: "System", desc: "Direct Memory Access controller performing memory-to-memory, peripheral-to-memory transfers without CPU intervention.", commonRegisters: ["ISR", "IFCR", "CCR", "CNDTR", "CPAR", "CMAR"], features: ["Circular buffer mode", "Double buffer mode", "Hardware request mapping"] },
  { name: "ADC", category: "Analog", desc: "Analog-to-Digital Converter converting analog sensor voltages into high-resolution digital values.", commonRegisters: ["SR", "CR1", "CR2", "SMPR1", "SMPR2", "JOFR1", "HTR", "LTR", "SQR1", "DR"], features: ["12-bit to 16-bit resolution", "Injected & Regular sequence channels", "DMA direct transfer"] },
  { name: "DAC", category: "Analog", desc: "Digital-to-Analog Converter generating continuous analog output voltage waveforms.", commonRegisters: ["CR", "SWTRIGR", "DHR12R1", "DHR12L1", "DOR1"], features: ["Dual channel output", "Noise & Triangle wave generator", "DMA support"] },
  { name: "Timers (TIM)", category: "Timer & PWM", desc: "Advanced-control and general-purpose timers for frequency generation, pulse counting, and PWM motor control.", commonRegisters: ["CR1", "CR2", "SMCR", "DIER", "SR", "EGR", "CCMR1", "CCER", "CNT", "PSC", "ARR"], features: ["PWM output with dead-time insertion", "Quadrature encoder interface", "Input capture & Output compare"] },
  { name: "Clock Tree (RCC)", category: "Clock & Power", desc: "Reset and Clock Control peripheral managing System Clocks (HSE, HSI, LSE, LSI, PLL) and bus prescalers.", commonRegisters: ["CR", "CFGR", "CIR", "APB2RSTR", "APB1RSTR", "AHBENR", "APB2ENR", "APB1ENR"], features: ["PLL frequency multiplication", "Peripheral clock gating for power saving", "Clock Security System (CSS)"] },
  { name: "NVIC", category: "Core Peripherals", desc: "Nested Vectored Interrupt Controller managing exception priorities and vector table dispatch.", commonRegisters: ["ISER", "ICER", "ISPR", "ICPR", "IABR", "IPR"], features: ["Low latency interrupt processing", "Dynamic priority grouping & preemption", "Tail-chaining & Late arriving optimizations"] },
];

export default function PeripheralDatabaseView({ device }: { device: Device }) {
  const [selectedPeriph, setSelectedPeriph] = useState<PeriphSpec>(PERIPHERAL_CATALOG[0]);

  return (
    <div className="p-6 h-full overflow-y-auto space-y-6 bg-[var(--bg)] text-white mono text-xs select-none">
      {/* HEADER */}
      <div className="pb-4 border-b border-[var(--line)] flex justify-between items-center">
        <div>
          <div className="text-[10px] text-[var(--mut)] uppercase tracking-wider font-bold">Device Support System</div>
          <h1 className="text-xl font-bold text-white">Hardware Peripheral Database</h1>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-[var(--mut)] uppercase">Target MCU</div>
          <div className="text-sm font-bold text-[var(--a)]">{device?.name || "Generic MCU"}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* LEFT COLUMN: PERIPHERAL CATALOG */}
        <div className="p-4 rounded-xl bg-black/30 border border-[var(--line)] space-y-2">
          <div className="text-[10px] text-[var(--mut)] uppercase font-bold mb-3">Supported On-Chip Peripherals</div>
          {PERIPHERAL_CATALOG.map(p => (
            <button
              key={p.name}
              onClick={() => setSelectedPeriph(p)}
              className={`w-full p-3 rounded-lg border text-left transition flex justify-between items-center ${
                selectedPeriph.name === p.name
                  ? "bg-[rgba(51,214,194,0.15)] border-[var(--a)] text-[var(--a)] font-bold"
                  : "bg-black/40 border-[var(--line)] text-gray-300 hover:text-white hover:bg-white/5"
              }`}
            >
              <div>
                <div className="text-xs font-bold">{p.name}</div>
                <div className="text-[10px] text-[var(--mut)]">{p.category}</div>
              </div>
              <span className="text-[10px]">➔</span>
            </button>
          ))}
        </div>

        {/* RIGHT 2 COLUMNS: PERIPHERAL SPECIFICATION */}
        <div className="col-span-2 space-y-4">
          <div className="p-5 rounded-xl bg-black/40 border border-[var(--line)] space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] text-[var(--mut)] uppercase font-bold">{selectedPeriph.category}</span>
                <h2 className="text-xl font-bold text-[var(--a)]">{selectedPeriph.name} Peripheral Module</h2>
              </div>
              <span className="px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold text-xs">
                INTEGRATED PERIPHERAL
              </span>
            </div>

            <p className="text-gray-300 text-[11px] leading-relaxed">{selectedPeriph.desc}</p>
          </div>

          {/* REGISTERS */}
          <div className="p-5 rounded-xl bg-black/30 border border-[var(--line)] space-y-3">
            <div className="text-[11px] font-bold text-amber-300 uppercase">Key Memory-Mapped Registers</div>
            <div className="flex flex-wrap gap-2">
              {selectedPeriph.commonRegisters.map(reg => (
                <span key={reg} className="px-3 py-1.5 rounded bg-black/60 border border-[var(--line)] font-mono text-purple-300 text-xs font-bold">
                  {reg}
                </span>
              ))}
            </div>
          </div>

          {/* CAPABILITIES */}
          <div className="p-5 rounded-xl bg-black/30 border border-[var(--line)] space-y-3">
            <div className="text-[11px] font-bold text-emerald-400 uppercase">Hardware Features</div>
            <div className="space-y-2">
              {selectedPeriph.features.map(f => (
                <div key={f} className="p-2.5 rounded bg-black/40 border border-[var(--line)] flex items-center gap-2 text-gray-200">
                  <span className="text-emerald-400">✓</span>
                  <span>{f}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
