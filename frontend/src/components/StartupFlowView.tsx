import type { Device } from "../utils/devices";

type BootStep = { title: string; desc: string; addr?: string; code?: string };

export default function StartupFlowView({ device }: { device: Device }) {
  if (!device) return null;

  const vendor = (device.vendor || "").toLowerCase();
  const name = (device.name || "").toLowerCase();

  let steps: BootStep[] = [];

  if (vendor.includes("espressif") || name.includes("esp32")) {
    steps = [
      { title: "ROM Bootloader", desc: "Hardcoded ROM code executes from address 0x40000000 upon power-on reset. Checks boot pins and unpacks flash image.", addr: "0x40000000" },
      { title: "2nd Stage Bootloader", desc: "Loads partition table, selects active OTA app partition, and configures MMU flash cache mapping.", addr: "0x40080000" },
      { title: "esp_startup", desc: "Initializes FreeRTOS CPU scheduler, heaps, stack guard canary, and hardware locks.", code: "call esp_startup()" },
      { title: "app_main()", desc: "Main entry point for user application code executing on Core 0.", code: "void app_main(void)" },
    ];
  } else if (vendor.includes("raspberry") || name.includes("rp2040") || name.includes("rp2350")) {
    steps = [
      { title: "Boot ROM", desc: "Internal 16 KB Boot ROM configures clock tree, USB stack, and reads QSPI flash header.", addr: "0x00000000" },
      { title: "Stage 2 Bootloader", desc: "256-byte boot block loaded into SRAM to configure SSI / QSPI XIP mode for fast flash execution.", addr: "0x10000000" },
      { title: "Reset_Handler", desc: "C Runtime startup routine copies .data section from XIP Flash to SRAM and zeros .bss.", addr: "0x10000100" },
      { title: "main()", desc: "User main function launched on Core 0. Core 1 remains halted until launched via multicore API.", code: "int main(void)" },
    ];
  } else if (name.includes("zephyr")) {
    steps = [
      { title: "Reset", desc: "Vector table entry at offset +0x04 branches immediately to hardware reset handler.", addr: "0x08000004" },
      { title: "z_cstart", desc: "Zephyr Kernel C startup function initializes memory pools, thread objects, and driver init levels.", code: "call z_cstart()" },
      { title: "Kernel Initialization", desc: "Runs POST_KERNEL driver initializations and launches system workqueue thread.", code: "z_sys_init()" },
      { title: "main()", desc: "App main entry point running inside default main thread context.", code: "void main(void)" },
    ];
  } else {
    // STM32 & Standard ARM Cortex-M Startup Sequence
    steps = [
      { title: "Vector Table", desc: "Located at Flash offset 0x0000. Contains Initial Stack Pointer (MSP) and Reset_Handler pointer.", addr: `0x${(device.vectorTableAddr || 0x08000000).toString(16)}` },
      { title: "Reset_Handler", desc: "Core assembly boot code. Copies .data section from Flash to SRAM and zero-initializes .bss region.", addr: `0x${((device.vectorTableAddr || 0x08000000) + 0x100).toString(16)}` },
      { title: "SystemInit", desc: "Configures system clocks (HSE/HSI, PLL multiplier), FLASH latency wait states, and FPU registers.", code: "SystemInit()" },
      { title: "HAL_Init / main()", desc: "Initializes hardware abstraction layers, peripheral clocks, and branches directly into main().", code: "int main(void)" },
    ];
  }

  return (
    <div className="p-6 h-full overflow-y-auto space-y-6 bg-[var(--bg)] text-white mono text-xs select-none">
      {/* HEADER */}
      <div className="pb-4 border-b border-[var(--line)] flex justify-between items-center">
        <div>
          <div className="text-[10px] text-[var(--mut)] uppercase tracking-wider font-bold">Device Support System</div>
          <h1 className="text-xl font-bold text-white">Startup Flow & Boot Sequence</h1>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-[var(--mut)] uppercase">Target Profile</div>
          <div className="text-sm font-bold text-[var(--a)]">{device.name}</div>
        </div>
      </div>

      {/* BOOT STEPS FLOW VISUALIZER */}
      <div className="p-6 rounded-xl bg-black/30 border border-[var(--line)] space-y-6">
        <div className="text-sm font-bold text-white">Boot Execution Timeline</div>

        <div className="space-y-4 relative">
          {steps.map((st, idx) => (
            <div key={st.title} className="flex gap-4 items-start relative">
              {/* STEP INDEX BADGE */}
              <div className="w-9 h-9 rounded-full bg-[var(--a-dim)] border border-[var(--a)] text-[var(--a)] font-bold text-sm flex items-center justify-center z-10 shrink-0">
                {idx + 1}
              </div>

              {/* CARD */}
              <div className="flex-1 p-4 rounded-lg bg-black/50 border border-[var(--line)] space-y-1">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-bold text-white">{st.title}</h3>
                  {st.addr && <span className="font-mono text-purple-400 text-[11px]">{st.addr}</span>}
                  {st.code && <span className="font-mono text-amber-300 text-[11px]">{st.code}</span>}
                </div>
                <p className="text-gray-300 text-[11px] leading-relaxed">{st.desc}</p>
              </div>

              {/* CONNECTING ARROW */}
              {idx < steps.length - 1 && (
                <div className="absolute left-4 top-9 w-0.5 h-6 bg-[var(--a-dim)] z-0" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
