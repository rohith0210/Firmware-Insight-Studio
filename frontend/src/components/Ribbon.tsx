import { useState } from "react";
import type { ParseResult } from "../App";
import type { Device } from "../utils/devices";
import DeviceSelectorModal from "./DeviceSelectorModal";
import DeviceDashboardModal from "./DeviceDashboardModal";

export default function Ribbon({
  title,
  result,
  loading,
  accent,
  device,
  override,
  setOverride,
  cycleAccent,
  onJSON,
  onCSV,
  onReset,
  onOpenSearch,
}: {
  title: string;
  result: ParseResult | null;
  loading: boolean;
  accent: string;
  device: Device | null;
  override: string;
  setOverride: (s: string) => void;
  cycleAccent: () => void;
  onJSON: () => void;
  onCSV: () => void;
  onReset: () => void;
  onOpenSearch?: () => void;
}) {
  const [showSelector, setShowSelector] = useState(false);
  const [showSpecs, setShowSpecs] = useState(false);

  return (
    <div className="ribbon">
      <span className="crumb">WORKBENCH <b>/</b> {title}</span>

      {/* UNIVERSAL SEARCH BUTTON */}
      {result && onOpenSearch && (
        <button
          onClick={onOpenSearch}
          className="px-3 py-1 rounded bg-black/40 border border-[var(--line)] hover:border-[var(--a)] text-gray-300 hover:text-white text-xs mono flex items-center gap-2 transition"
          title="Universal Search Palette (Ctrl+K)"
        >
          <span className="text-[var(--a)]">🔍</span>
          <span>Search...</span>
          <kbd className="px-1.5 py-0.2 rounded bg-white/10 text-[9px] text-gray-400 font-mono">Ctrl+K</kbd>
        </button>
      )}

      <span className="spacer" />

      {result && device && (
        <div className="flex items-center gap-2">
          {/* TARGET MCU PICKER BUTTON */}
          <button
            onClick={() => setShowSelector(true)}
            className="px-3 py-1.5 rounded bg-[rgba(51,214,194,0.12)] border border-[var(--a-dim)] hover:border-[var(--a)] text-[var(--a)] font-bold text-xs flex items-center gap-2 transition mono"
            title="Open Target Microcontroller Selector"
          >
            <span className="w-2 h-2 rounded-full bg-[var(--a)] animate-pulse" />
            <span className="text-[10px] text-gray-400 uppercase">MCU:</span>
            <span>{device.name}</span>
            <span className="text-[10px] text-gray-400 font-normal">({device.vendor})</span>
            <span className="text-gray-400 text-[10px]">⚙️</span>
          </button>

          {/* VIEW MCU SPECS DASHBOARD BUTTON */}
          <button
            onClick={() => setShowSpecs(true)}
            className="px-2 py-1.5 rounded bg-black/40 border border-[var(--line)] hover:border-gray-500 text-gray-300 hover:text-white text-xs mono"
            title="View Device Specifications Dashboard"
          >
            📊 Specs
          </button>
        </div>
      )}

      {result && (
        <span className="chip">
          <span className="v">{result.filename}</span>
          <span className="a">{result.arch}</span>
          <span>{result.elf_class}-bit</span>
        </span>
      )}

      {result && (
        <button className="btn-hw" onClick={cycleAccent} title="swap trace accent">
          {accent === "signal" ? "◐ signal" : "◑ phosphor"}
        </button>
      )}

      {result && <button className="btn-hw" onClick={onCSV}>CSV</button>}
      {result && <button className="btn-hw primary" onClick={onJSON}>Export</button>}
      {result && <button className="btn-hw" onClick={onReset} title="load another binary">↻ new</button>}

      <span className="chip">
        <span className={`dot ${loading ? "busy" : ""}`} />
        {loading ? "parsing" : "idle"}
      </span>

      {/* DEVICE SELECTOR MODAL */}
      {showSelector && device && (
        <DeviceSelectorModal
          currentDevice={device}
          override={override}
          onSelectDevice={(id: string) => setOverride(id)}
          onClose={() => setShowSelector(false)}
        />
      )}

      {/* DEVICE DASHBOARD MODAL */}
      {showSpecs && device && (
        <DeviceDashboardModal device={device} onClose={() => setShowSpecs(false)} />
      )}
    </div>
  );
}
