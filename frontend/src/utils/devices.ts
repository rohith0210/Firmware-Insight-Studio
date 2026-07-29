export type Region = { name: string; kind: "flash" | "xip" | "ram" | "ccm" | "virt"; base: number; size: number; color: string };
export type Device = { id: string; name: string; mcu: boolean; regions: Region[] };
const K = 1024, M = 1024 * 1024;
const C = { flash: "#33d6c2", xip: "#1c8a7e", ram: "#f0a830", ccm: "#9a6c1c", virt: "#46566a" };
const r = (name: string, kind: Region["kind"], base: number, size: number): Region => ({ name, kind, base, size, color: C[kind] });

export const DB: Record<string, Device> = {
  stm32f103c8: { id: "stm32f103c8", name: "STM32F103C8 (Blue Pill)", mcu: true, regions: [r("FLASH", "flash", 0x08000000, 64 * K), r("SRAM", "ram", 0x20000000, 20 * K)] },
  stm32f303:   { id: "stm32f303",   name: "STM32F303", mcu: true, regions: [r("FLASH", "flash", 0x08000000, 256 * K), r("SRAM", "ram", 0x20000000, 40 * K), r("CCM", "ccm", 0x10000000, 8 * K)] },
  stm32f407:   { id: "stm32f407",   name: "STM32F407", mcu: true, regions: [r("FLASH", "flash", 0x08000000, 1024 * K), r("SRAM", "ram", 0x20000000, 128 * K), r("CCM", "ccm", 0x10000000, 64 * K)] },
  stm32h743:   { id: "stm32h743",   name: "STM32H743", mcu: true, regions: [r("FLASH", "flash", 0x08000000, 2048 * K), r("AXI SRAM", "ram", 0x24000000, 512 * K), r("DTCM", "ccm", 0x20000000, 128 * K)] },
  nrf52840:    { id: "nrf52840",    name: "nRF52840", mcu: true, regions: [r("FLASH", "flash", 0x00000000, 1024 * K), r("RAM", "ram", 0x20000000, 256 * K)] },
  nrf52832:    { id: "nrf52832",    name: "nRF52832", mcu: true, regions: [r("FLASH", "flash", 0x00000000, 512 * K), r("RAM", "ram", 0x20000000, 64 * K)] },
  rp2040:      { id: "rp2040",      name: "RP2040", mcu: true, regions: [r("FLASH XIP", "xip", 0x10000000, 2048 * K), r("SRAM", "ram", 0x20000000, 264 * K)] },
  samd21:      { id: "samd21",      name: "ATSAMD21", mcu: true, regions: [r("FLASH", "flash", 0x00000000, 256 * K), r("SRAM", "ram", 0x20000000, 32 * K)] },
  esp32c3:     { id: "esp32c3",     name: "ESP32-C3", mcu: true, regions: [r("IRAM", "ram", 0x40380000, 320 * K), r("DRAM", "ram", 0x3FC80000, 320 * K)] },
  lpc1768:     { id: "lpc1768",     name: "LPC1768", mcu: true, regions: [r("FLASH", "flash", 0x00000000, 512 * K), r("SRAM0", "ram", 0x10000000, 32 * K), r("SRAM1", "ram", 0x20000000, 32 * K)] },
};
export const DB_ORDER = ["stm32f103c8", "stm32f303", "stm32f407", "stm32h743", "nrf52840", "nrf52832", "rp2040", "samd21", "esp32c3", "lpc1768"];

const np2 = (n: number) => Math.pow(2, Math.ceil(Math.log2(Math.max(n, 1))));
const minAddr = (secs: any[], names: string[]) => {
  const m = secs.filter(s => names.includes(s.name) && s.size > 0).map(s => s.addr >>> 0);
  return m.length ? Math.min(...m) : 0;
};

export function detectDevice(res: { arch: string; elf_class?: number; sections: any[]; summary: Record<string, number> }): Device {
  const arch = res.arch || "";
  const usedF = (res.summary[".text"] || 0) + (res.summary[".rodata"] || 0);
  const usedR = (res.summary[".data"] || 0) + (res.summary[".bss"] || 0);
  if (/x86|80386|i386|amd64/i.test(arch)) {
    const t = minAddr(res.sections, [".text", ".init", ".rodata"]) || 0x1000;
    const d = minAddr(res.sections, [".data", ".bss"]) || 0x4000;
    return { id: "x86", name: `${arch} · host binary`, mcu: false, regions: [r(".text/.rodata", "virt", t, usedF || 1), r(".data/.bss", "virt", d, usedR || 1)] };
  }
  if (/aarch64|arm64/i.test(arch)) {
    const t = minAddr(res.sections, [".text", ".rodata"]) || 0x40000;
    const d = minAddr(res.sections, [".data", ".bss"]) || 0x80000;
    return { id: "aarch64", name: "AArch64 · host/generic", mcu: false, regions: [r("code", "virt", t, usedF || 1), r("data", "virt", d, usedR || 1)] };
  }
  // 32-bit ARM — guess the part from base address + used flash
  const t = (minAddr(res.sections, [".text", ".init", ".rodata", ".isr_vector"]) || 0) >>> 0;
  const top = t & 0xff000000;
  if (top === 0x08000000) {
    if (usedF <= 64 * K) return DB.stm32f103c8;
    if (usedF <= 256 * K) return DB.stm32f303;
    if (usedF <= 1024 * K) return DB.stm32f407;
    return DB.stm32h743;
  }
  if (top === 0x10000000) return DB.rp2040;
  if (top === 0x00000000) return usedF <= 256 * K ? DB.samd21 : DB.nrf52840;
  if (top === 0x40000000 || top === 0x3f000000) return DB.esp32c3;
  // generic Cortex-M, regions inferred from the binary itself
  const fb = t & 0xfff00000, db = (minAddr(res.sections, [".data", ".bss"]) || 0x20000000) >>> 0;
  return { id: "generic", name: "Cortex-M · generic", mcu: true, regions: [r("FLASH", "flash", fb, np2(usedF) * 2 || 64 * K), r("SRAM", "ram", db & 0xfff00000, np2(usedR) * 2 || 16 * K)] };
}

export const inRegion = (rg: Region, addr: number) => { const a = addr >>> 0; return a >= rg.base && a < rg.base + rg.size; };
export const colRegions = (d: Device, col: "flash" | "ram") => d.regions.filter(rg => col === "flash" ? rg.kind === "flash" || rg.kind === "xip" : rg.kind === "ram" || rg.kind === "ccm");
export const usedIn = (d: Device, secs: any[], kinds: Region["kind"][]) => {
  const rgs = d.regions.filter(rg => kinds.includes(rg.kind));
  return secs.filter(s => s.size > 0 && rgs.some(rg => inRegion(rg, s.addr))).reduce((a, s) => a + s.size, 0);
};
export function fmt(b: number): string {
  if (b >= M) { const mb = b / M; return (Number.isInteger(mb) ? mb : mb.toFixed(1)) + "M"; }
  if (b >= K) { const kb = b / K; return (Number.isInteger(kb) ? kb : kb.toFixed(1)) + "K"; }
  return b + "B";
}
