import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import ReactFlow, { Background, Controls, MiniMap, ReactFlowProvider } from "reactflow";
import type { Edge, Node, NodeProps, ReactFlowInstance } from "reactflow";
import dagre from "dagre";
import "reactflow/dist/style.css";
import type { ParseResult } from "../App";
import type { Device } from "../utils/devices";

type CG = {
  nodes: Array<{ id: string; label: string; type: string }>;
  edges: Array<{ source: string; target: string; animated?: boolean }>;
};

type GraphMode = "calls" | "startup" | "isr" | "task" | "driver" | "library";
type LayoutMode = "hierarchical" | "radial" | "force" | "orthogonal";
type InspectorTab = "Overview" | "Memory" | "Calls" | "Metrics";
type BottomTab = "Trace" | "Architecture" | "Vectors" | "Analytics";
type NodeCategory = "Application" | "Startup" | "Drivers" | "RTOS/Tasks" | "Interrupts" | "Runtime" | "Libraries";

type FunctionData = {
  name: string;
  section: string;
  size: number;
  category: NodeCategory;
  module: string;
  purpose: string;
  stackEstimate: string;
  icon: string;
  subtitle: string;
  callersCount: number;
  calleesCount: number;
  riskScore: number;
};

type RenderNode = Node<FunctionData>;
type RenderEdge = Edge;
type TraceEvent = { ts: number; message: string; level: "info" | "action" | "warning" };

const CATEGORY_META: Record<NodeCategory, { accent: string; fill: string; label: string; icon: string }> = {
  Application: { accent: "#3ddbd8", fill: "rgba(61,219,216,.12)", label: "Application", icon: "📡" },
  Startup: { accent: "#b48df7", fill: "rgba(180,141,247,.14)", label: "Startup / Boot", icon: "🚀" },
  Drivers: { accent: "#f3af41", fill: "rgba(243,175,65,.14)", label: "Driver / HAL", icon: "⚙" },
  "RTOS/Tasks": { accent: "#7fa9ff", fill: "rgba(127,169,255,.14)", label: "RTOS / Task", icon: "🧩" },
  Interrupts: { accent: "#f16172", fill: "rgba(241,97,114,.14)", label: "Interrupt / Vector", icon: "⚡" },
  Runtime: { accent: "#8d99a8", fill: "rgba(141,153,168,.14)", label: "C Runtime", icon: "📦" },
  Libraries: { accent: "#73c67c", fill: "rgba(115,198,124,.14)", label: "Library / Middleware", icon: "📚" },
};

// Architecture-Agnostic ISA Detection
const detectArchitecture = (result: ParseResult, device?: Device): string => {
  const raw = `${result.arch} ${device?.architecture || ""} ${result.toolchain}`.toLowerCase();
  if (raw.includes("cortex-m") || raw.includes("armv7-m") || raw.includes("armv6-m") || raw.includes("armv8-m")) return "ARM Cortex-M";
  if (raw.includes("cortex-a") || raw.includes("aarch64") || raw.includes("armv7-a")) return "ARM Cortex-A";
  if (raw.includes("riscv") || raw.includes("rv32") || raw.includes("rv64")) return "RISC-V (RV32/RV64)";
  if (raw.includes("xtensa") || raw.includes("esp32") || raw.includes("esp8266")) return "Xtensa (ESP32)";
  if (raw.includes("avr") || raw.includes("atmega") || raw.includes("attiny")) return "AVR (8-bit)";
  if (raw.includes("8051") || raw.includes("mcs-51") || raw.includes("c51")) return "Intel 8051";
  if (raw.includes("x86") || raw.includes("amd64") || raw.includes("linux")) return "Linux x86/x64";
  return result.arch || "Generic Microcontroller";
};

// Architecture-Agnostic Category Classification
const inferAgnosticCategory = (name: string): NodeCategory => {
  // Interrupts & Exceptions across Cortex-M, RISC-V, Xtensa, AVR, 8051
  if (/IRQ|IRQHandler|Handler$|ISR_|__vector_|trap_vector|_vector$/i.test(name)) return "Interrupts";
  
  // Entry & Boot sequence routines across Linux, RTOS, ARM, RISC-V, Xtensa, AVR
  if (/^(Reset_Handler|reset_handler|SystemInit|_start|__libc_start_main|crt0|main|app_main|board_init|setup_arch|start_kernel|init_hart|__init)$/i.test(name)) return "Startup";

  // RTOS Task Creation & Kernel Interfacing (FreeRTOS, Zephyr, ThreadX, VxWorks, Pthreads)
  if (/(FreeRTOS|vTask|xTask|k_thread|tx_thread|pthread|osThread|cmsis_os|vTaskStartScheduler|taskSpawn)/i.test(name)) return "RTOS/Tasks";

  // Peripheral Drivers & Hardware Abstraction
  if (/^(HAL_|LL_|BSP_|esp_|avr_|nrfx_|(?:GPIO|UART|USART|SPI|I2C|ADC|DAC|DMA|TIM|USB|CAN|ETH|TWIM|PWM)_[A-Za-z])/i.test(name)) return "Drivers";

  // Shared Libraries, Middleware, Network, Cryptography
  if (/(mbedtls|zlib|libc|libm|__libc|fopen|fread|printf|scanf|snprintf|vsnprintf|lwip|tcp_|udp_|mqtt|fatfs|usb_device)/i.test(name)) return "Libraries";

  // C Runtime Helpers
  if (/^(__|_aeabi|memcpy|memset|strlen|strcpy|malloc|free|abort|exit|__do_copy_data|__do_clear_bss)/i.test(name)) return "Runtime";

  return "Application";
};

const inferModule = (name: any) => {
  if (!name || typeof name !== "string") return "core";
  if (name.includes("_")) return name.split("_")[0];
  if (name.includes(".")) return name.split(".")[0];
  return "core";
};

const formatBytes = (bytes: number) => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
};

const stackEstimate = (size: number) => {
  if (!size) return "≤32 B";
  if (size <= 64) return "≤32 B";
  if (size <= 256) return "32-128 B";
  if (size <= 1024) return "128-512 B";
  return ">512 B";
};

const calculateRiskScore = (size: number, callers: number, callees: number) => {
  let score = 10;
  if (size > 1024) score += 30;
  else if (size > 256) score += 15;
  if (callees > 6) score += 25;
  if (callers > 8) score += 20;
  if (callers === 0 && callees === 0) score += 15;
  return Math.min(99, score);
};

const defaultSymbol = { name: "unknown", value: 0, size: 0, type: "unknown", bind: "unknown", section: ".text" };
const getSymbolInfo = (symbols: ParseResult["symbols"], label: string) => symbols.find(sym => sym.name === label) || defaultSymbol;

const runDagreLayout = (nodes: RenderNode[], edges: RenderEdge[], direction: "TB" | "LR") => {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 25, ranksep: 40, marginx: 15, marginy: 15 });
  nodes.forEach((node) => {
    const width = Number(node.style?.width ?? 150);
    const height = Number(node.style?.height ?? 50);
    g.setNode(node.id, { width, height });
  });
  edges.forEach((edge) => g.setEdge(edge.source, edge.target));
  dagre.layout(g);
  return nodes.map((node) => {
    const { x, y } = g.node(node.id) as { x: number; y: number };
    const width = Number(node.style?.width ?? 150);
    const height = Number(node.style?.height ?? 50);
    return { ...node, position: { x: x - width / 2, y: y - height / 2 } };
  });
};

const FunctionNode = ({ data, selected }: NodeProps<FunctionData>) => {
  const meta = CATEGORY_META[data.category];
  return (
    <div
      className={`px-2.5 py-1.5 rounded border text-left shadow-lg transition-all duration-150 ${
        selected ? "ring-2 ring-[var(--a)] shadow-[0_0_16px_rgba(51,214,194,0.4)] border-white" : "border-[#1e293b] hover:border-gray-500"
      }`}
      style={{
        borderLeftWidth: "3px",
        borderLeftColor: meta.accent,
        background: "linear-gradient(180deg, #0d131c, #090e15)",
        minWidth: "150px",
        maxWidth: "180px",
      }}
      title={`${data.name}\nSection: ${data.section} · Size: ${formatBytes(data.size)}\nCallers: ${data.callersCount} · Callees: ${data.calleesCount}`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-[11px]">{data.icon}</span>
        <span className="truncate font-mono font-bold text-[11px] text-gray-100 flex-1">{data.name}</span>
      </div>
      <div className="flex items-center justify-between text-[9px] opacity-90 mt-1 pt-1 border-t border-white/5 font-mono">
        <span className="px-1 rounded bg-black/60 text-gray-400 border border-white/5">{data.section || ".text"}</span>
        <span className="font-semibold" style={{ color: meta.accent }}>{formatBytes(data.size)}</span>
      </div>
    </div>
  );
};

export default function CallGraph({
  data,
  result,
  device,
  targetSymbol,
  targetMode,
  onDisassemble,
  onShowSection,
  onOpenObject,
  onNavigate,
}: {
  data: CG;
  result: ParseResult;
  device: Device;
  targetSymbol?: string | any;
  targetMode?: "callers" | "callees" | "symbol" | null;
  onDisassemble?: (name: string) => void;
  onShowSection?: (section: string) => void;
  onOpenObject?: (name: string) => void;
  onNavigate?: (target: string, parameter?: string) => void;
}) {
  const [graphMode, setGraphMode] = useState<GraphMode>("calls");
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("hierarchical");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("Overview");
  const [bottomTab, setBottomTab] = useState<BottomTab>("Trace");
  const [maxDepth, setMaxDepth] = useState<number>(8);
  const [hideOrphans, setHideOrphans] = useState<boolean>(false);
  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([
    { ts: Date.now(), message: "Architecture-agnostic Firmware Flow Explorer initialized.", level: "info" },
  ]);
  const reactFlow = useRef<ReactFlowInstance | null>(null);

  const architectureName = useMemo(() => detectArchitecture(result, device), [result, device]);
  const symbolsByName = useMemo(() => new Map(result.symbols.map((sym) => [sym.name, sym])), [result.symbols]);

  // Compute Caller and Callee Degrees
  const degrees = useMemo(() => {
    const callersMap = new Map<string, number>();
    const calleesMap = new Map<string, number>();
    data.nodes.forEach((n) => { callersMap.set(n.id, 0); calleesMap.set(n.id, 0); });
    data.edges.forEach((e) => {
      callersMap.set(e.target, (callersMap.get(e.target) || 0) + 1);
      calleesMap.set(e.source, (calleesMap.get(e.source) || 0) + 1);
    });
    return { callersMap, calleesMap };
  }, [data]);

  // Primary Entry Point Detection (Architecture-Agnostic)
  const baseEntry = useMemo(() => {
    const entryCandidate = data.nodes.find((n) => /^(Reset_Handler|_start|entry|main|app_main)$/i.test(n.label))?.label
      || result.symbols.find((s) => /^(Reset_Handler|_start|main|app_main)$/i.test(s.name))?.name
      || data.nodes[0]?.label || "main";
    return entryCandidate;
  }, [data.nodes, result.symbols]);

  // Transform raw data into render nodes
  const availableNodes = useMemo(() => {
    return data.nodes.map((node) => {
      const symbol = symbolsByName.get(node.label) || defaultSymbol;
      const category = inferAgnosticCategory(node.label);
      const callersCount = degrees.callersMap.get(node.id) || 0;
      const calleesCount = degrees.calleesMap.get(node.id) || 0;
      const riskScore = calculateRiskScore(symbol.size || 0, callersCount, calleesCount);

      return {
        id: node.id,
        type: "functionCard",
        draggable: false,
        position: { x: 0, y: 0 },
        style: { width: 150, height: 50, cursor: "pointer" },
        data: {
          name: node.label,
          section: symbol.section || ".text",
          size: symbol.size || 0,
          category,
          module: inferModule(node.label),
          purpose: `${category} routine: ${node.label}`,
          stackEstimate: stackEstimate(symbol.size || 0),
          icon: CATEGORY_META[category].icon,
          subtitle: symbol.section || ".text",
          callersCount,
          calleesCount,
          riskScore,
        },
      } as RenderNode;
    });
  }, [data.nodes, result.symbols, symbolsByName, degrees]);

  const allEdges = useMemo<RenderEdge[]>(() => {
    return data.edges.map((edge) => {
      const sourceNode = availableNodes.find((n) => n.id === edge.source);
      const targetNode = availableNodes.find((n) => n.id === edge.target);
      const isInterrupt = sourceNode?.data.category === "Interrupts" || targetNode?.data.category === "Interrupts";
      const isLibrary = sourceNode?.data.category === "Libraries" || targetNode?.data.category === "Libraries";
      const isSelf = edge.source === edge.target;

      return {
        id: `${edge.source}_${edge.target}`,
        source: edge.source,
        target: edge.target,
        type: "smoothstep",
        animated: !isSelf && !isInterrupt,
        markerEnd: "arrowclosed",
        style: {
          stroke: isInterrupt ? "rgba(241,97,114,.9)" : isLibrary ? "rgba(115,198,124,.8)" : "rgba(61,219,216,.6)",
          strokeWidth: isInterrupt ? 2.2 : 1.4,
          strokeDasharray: isSelf ? "6 4" : isLibrary ? "3 4" : undefined,
        },
      } as RenderEdge;
    });
  }, [availableNodes, data.edges]);

  // Mode & Filter Logic
  const filteredNodes = useMemo(() => {
    return availableNodes.filter((node) => {
      // 1. Search Query
      if (search && !node.data.name.toLowerCase().includes(search.toLowerCase()) && !node.data.section.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      // 2. Category Filter
      if (selectedCategory !== "all" && node.data.category !== selectedCategory) {
        return false;
      }
      // 3. Hide Orphans
      if (hideOrphans && node.data.callersCount === 0 && node.data.calleesCount === 0) {
        return false;
      }
      // 4. Graph Mode Filtering
      if (graphMode === "startup" && node.data.category !== "Startup" && node.data.name !== "main" && node.data.name !== "app_main") {
        return false;
      }
      if (graphMode === "isr" && node.data.category !== "Interrupts") {
        return false;
      }
      if (graphMode === "task" && node.data.category !== "RTOS/Tasks") {
        return false;
      }
      if (graphMode === "driver" && node.data.category !== "Drivers") {
        return false;
      }
      if (graphMode === "library" && node.data.category !== "Libraries" && node.data.category !== "Runtime") {
        return false;
      }
      return true;
    });
  }, [availableNodes, search, selectedCategory, hideOrphans, graphMode]);

  const visibleIds = useMemo(() => new Set(filteredNodes.map((n) => n.id)), [filteredNodes]);
  const filteredEdges = useMemo(() => {
    return allEdges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target));
  }, [allEdges, visibleIds]);

  // Position Nodes using Dagre / Radial
  const layoutedNodes = useMemo(() => {
    if (!filteredNodes.length) return [];
    if (layoutMode === "radial") {
      const centerNode = filteredNodes.find((n) => n.data.name === baseEntry) || filteredNodes[0];
      const radius = 220;
      return filteredNodes.map((node, idx) => {
        if (node.id === centerNode.id) return { ...node, position: { x: 400, y: 300 } };
        const angle = ((idx - 1) / Math.max(1, filteredNodes.length - 1)) * 2 * Math.PI;
        return {
          ...node,
          position: { x: 400 + Math.cos(angle) * radius, y: 300 + Math.sin(angle) * radius },
        };
      });
    }
    return runDagreLayout(filteredNodes, filteredEdges, layoutMode === "orthogonal" ? "LR" : "TB");
  }, [filteredNodes, filteredEdges, layoutMode, baseEntry]);

  // Handle Selection & Synchronization
  const handleSelectNode = useCallback((node: RenderNode) => {
    setSelectedNode(node.id);
    setTraceEvents((events) => [
      ...events.slice(-19),
      { ts: Date.now(), message: `Inspecting ${node.data.name} (${node.data.section})`, level: "action" },
    ]);
  }, []);

  // Handle incoming navigation targets
  useEffect(() => {
    if (targetSymbol) {
      const symName = typeof targetSymbol === "string" ? targetSymbol : targetSymbol.name;
      const match = availableNodes.find((n) => n.data.name === symName || n.id === symName);
      if (match) setSelectedNode(match.id);
    }
  }, [targetSymbol, availableNodes]);

  const activeNodeData = useMemo(() => {
    return availableNodes.find((n) => n.id === selectedNode) || filteredNodes[0] || availableNodes[0];
  }, [selectedNode, availableNodes, filteredNodes]);

  const activeSymbolData = useMemo(() => {
    return activeNodeData ? getSymbolInfo(result.symbols, activeNodeData.data.name) : defaultSymbol;
  }, [activeNodeData, result.symbols]);

  // Node Types Definition
  const nodeTypes = useMemo(() => ({ functionCard: FunctionNode }), []);

  return (
    <div className="flex flex-col h-full bg-[var(--bg)] text-[var(--fg)] font-sans overflow-hidden select-none">
      {/* 1. TOP TOOLBAR: ARCHITECTURE BADGE, GRAPH MODES, LAYOUT & SEARCH */}
      <div className="bg-[var(--panel)] border-b border-[var(--line)] px-4 py-2 flex flex-wrap items-center justify-between gap-3 flex-shrink-0 mono text-xs">
        {/* LEFT: ARCHITECTURE & ISA TITLE */}
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded bg-[var(--a-dim)] text-[var(--a)] font-bold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[var(--a)] inline-block animate-pulse" />
            Flow Explorer
          </span>
          <span className="px-2 py-0.5 rounded bg-black/50 border border-[var(--line)] text-emerald-400 font-mono text-[11px]">
            ISA: {architectureName}
          </span>
          <span className="text-[var(--mut)] text-[11px] font-mono">
            ({filteredNodes.length} / {availableNodes.length} Functions)
          </span>
        </div>

        {/* CENTER: 6 GRAPH FILTER MODES */}
        <div className="flex items-center border border-[var(--line)] rounded overflow-hidden p-0.5 bg-black/40 text-[10px]">
          {[
            { id: "calls", label: "Function Calls", icon: "🎯" },
            { id: "startup", label: "Startup Flow", icon: "🚀" },
            { id: "isr", label: "ISR & Vectors", icon: "⚡" },
            { id: "task", label: "Task / RTOS", icon: "🧩" },
            { id: "driver", label: "Drivers / HAL", icon: "⚙" },
            { id: "library", label: "Libraries", icon: "📚" },
          ].map((mode) => (
            <button
              key={mode.id}
              onClick={() => setGraphMode(mode.id as GraphMode)}
              className={`px-2.5 py-1 rounded transition flex items-center gap-1 ${
                graphMode === mode.id
                  ? "bg-[var(--a-dim)] text-[var(--a)] font-bold shadow-sm"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <span>{mode.icon}</span>
              <span>{mode.label}</span>
            </button>
          ))}
        </div>

        {/* RIGHT: SEARCH, DEPTH, ORPHANS & LAYOUT OPTIONS */}
        <div className="flex items-center gap-2">
          {/* SEARCH INPUT */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search functions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="px-2.5 py-1 bg-black/60 border border-[var(--line)] rounded text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[var(--a)] w-36"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1 text-gray-400 hover:text-white text-xs">
                ✕
              </button>
            )}
          </div>

          {/* HIDE ORPHANS TOGGLE */}
          <button
            onClick={() => setHideOrphans((h) => !h)}
            className={`px-2 py-1 border border-[var(--line)] rounded text-xs transition ${
              hideOrphans ? "bg-amber-500/20 text-amber-400 font-bold border-amber-500/40" : "bg-black/60 text-gray-400 hover:text-white"
            }`}
            title="Toggle hiding isolated functions with zero calls"
          >
            {hideOrphans ? "Hide Orphans: ON" : "Orphans: OFF"}
          </button>

          {/* MAX DEPTH SELECTOR */}
          <select
            value={maxDepth}
            onChange={(e) => setMaxDepth(Number(e.target.value))}
            className="px-2 py-1 bg-black/60 border border-[var(--line)] rounded text-xs text-gray-300 focus:outline-none focus:border-[var(--a)]"
            title="Maximum Call Graph Traversal Depth"
          >
            <option value={4}>Depth: 4</option>
            <option value={8}>Depth: 8</option>
            <option value={12}>Depth: 12</option>
            <option value={20}>Depth: Max</option>
          </select>

          {/* LAYOUT ENGINE SELECTOR */}
          <select
            value={layoutMode}
            onChange={(e) => setLayoutMode(e.target.value as LayoutMode)}
            className="px-2 py-1 bg-black/60 border border-[var(--line)] rounded text-xs text-gray-300 focus:outline-none focus:border-[var(--a)]"
          >
            <option value="hierarchical">Hierarchical (DAG)</option>
            <option value="radial">Radial Flow Map</option>
            <option value="orthogonal">Orthogonal Grid</option>
          </select>

          {/* FIT VIEW BUTTON */}
          <button
            onClick={() => reactFlow.current?.fitView({ padding: 0.15, duration: 400 })}
            className="px-2.5 py-1 bg-[rgba(51,214,194,0.15)] border border-[var(--a)] text-[var(--a)] hover:bg-[var(--a)] hover:text-black rounded text-xs font-bold transition flex items-center gap-1 shadow-sm"
            title="Recenter and fit call graph inside viewport"
          >
            <span>🔍 Fit View</span>
          </button>
        </div>
      </div>

      {/* 2. MAIN WORKSPACE: GRAPH VISUALIZER + RIGHT SYNCHRONIZED INSPECTOR */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        {/* VISUALIZER CONTAINER */}
        <main className="flex-1 bg-[#05080c] relative overflow-hidden flex flex-col">
          {/* CATEGORY LEGEND BAR */}
          <div className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-1.5 bg-black/80 border border-[var(--line)] p-1.5 rounded-md backdrop-blur-md text-[10px] mono">
            {Object.entries(CATEGORY_META).map(([cat, meta]) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(selectedCategory === cat ? "all" : cat)}
                className={`px-2 py-0.5 rounded transition flex items-center gap-1 border ${
                  selectedCategory === cat
                    ? "border-white font-bold"
                    : "border-transparent opacity-80 hover:opacity-100"
                }`}
                style={{ backgroundColor: meta.fill, color: meta.accent }}
              >
                <span>{meta.icon}</span>
                <span>{meta.label}</span>
              </button>
            ))}
          </div>

          {/* REACT FLOW CANVAS */}
          <ReactFlowProvider>
            <ReactFlow
              nodes={layoutedNodes}
              edges={filteredEdges}
              nodeTypes={nodeTypes}
              onNodeClick={(_, node) => handleSelectNode(node as RenderNode)}
              onInit={(inst) => { reactFlow.current = inst; inst.fitView({ padding: 0.2 }); }}
              fitView
              minZoom={0.2}
              maxZoom={2.5}
            >
              <Background color="#16202c" gap={20} size={1} />
              <Controls className="bg-black/80 border border-[var(--line)] rounded p-1 fill-white" />
              <MiniMap
                nodeColor={(node) => CATEGORY_META[(node.data as FunctionData)?.category || "Application"]?.accent || "#3ddbd8"}
                maskColor="rgba(0, 0, 0, 0.7)"
                className="bg-black/80 border border-[var(--line)] rounded overflow-hidden"
              />
            </ReactFlow>
          </ReactFlowProvider>
        </main>

        {/* 3. RIGHT PANEL: SYNCHRONIZED FLOW INSPECTOR */}
        <aside className="w-80 border-l border-[var(--line)] bg-[var(--panel)] flex flex-col overflow-hidden flex-shrink-0 mono text-xs">
          {/* INSPECTOR HEADER */}
          <div className="p-3 border-b border-[var(--line)] bg-black/40 flex items-center justify-between">
            <span className="font-bold text-[var(--a)] uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <span>{activeNodeData?.data.icon || "🔍"}</span>
              <span className="truncate max-w-[180px]">{activeNodeData?.data.name || "Flow Inspector"}</span>
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-400 font-bold">
              Risk: {activeNodeData?.data.riskScore || 10}%
            </span>
          </div>

          {/* INSPECTOR TABS */}
          <div className="flex border-b border-[var(--line)] bg-black/20">
            {(["Overview", "Memory", "Calls", "Metrics"] as InspectorTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setInspectorTab(tab)}
                className={`flex-1 py-1.5 text-center text-[10px] transition ${
                  inspectorTab === tab
                    ? "text-[var(--a)] border-b-2 border-[var(--a)] bg-black/40 font-bold"
                    : "text-[var(--mut)] hover:text-gray-300"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* INSPECTOR BODY */}
          <div className="flex-1 p-3 overflow-y-auto space-y-3">
            {activeNodeData ? (
              <>
                {/* TAB 1: OVERVIEW */}
                {inspectorTab === "Overview" && (
                  <div className="space-y-3">
                    <div className="p-2.5 bg-black/50 border border-[var(--line)] rounded space-y-1">
                      <div className="text-[10px] text-[var(--mut)] uppercase tracking-wider font-bold">Symbol Identifier</div>
                      <div className="font-mono text-sm font-bold text-white break-all">{activeNodeData.data.name}</div>
                      <div className="text-[11px] text-[var(--a)] font-mono">{activeNodeData.data.purpose}</div>
                      {targetMode && (
                        <div className="text-[10px] text-amber-400 font-mono pt-1 border-t border-white/10">
                          Active Target Mode: {targetMode}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="p-2 bg-black/40 border border-[var(--line)] rounded">
                        <div className="text-[10px] text-[var(--mut)]">Category</div>
                        <div className="font-bold text-emerald-400">{activeNodeData.data.category}</div>
                      </div>
                      <div className="p-2 bg-black/40 border border-[var(--line)] rounded">
                        <div className="text-[10px] text-[var(--mut)]">Size</div>
                        <div className="font-bold text-white">{formatBytes(activeNodeData.data.size)}</div>
                      </div>
                      <div className="p-2 bg-black/40 border border-[var(--line)] rounded">
                        <div className="text-[10px] text-[var(--mut)]">Section</div>
                        <div className="font-bold text-amber-400 font-mono">{activeNodeData.data.section}</div>
                      </div>
                      <div className="p-2 bg-black/40 border border-[var(--line)] rounded">
                        <div className="text-[10px] text-[var(--mut)]">Stack Est.</div>
                        <div className="font-bold text-purple-300">{activeNodeData.data.stackEstimate}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: MEMORY */}
                {inspectorTab === "Memory" && (
                  <div className="space-y-2 text-[11px]">
                    <div className="p-2 bg-black/40 border border-[var(--line)] rounded flex justify-between">
                      <span className="text-[var(--mut)]">Memory Section:</span>
                      <span className="font-bold font-mono text-white">{activeNodeData.data.section}</span>
                    </div>
                    <div className="p-2 bg-black/40 border border-[var(--line)] rounded flex justify-between">
                      <span className="text-[var(--mut)]">Object Module:</span>
                      <span className="font-bold font-mono text-emerald-400">{activeNodeData.data.module}</span>
                    </div>
                    <div className="p-2 bg-black/40 border border-[var(--line)] rounded flex justify-between">
                      <span className="text-[var(--mut)]">ELF Binding:</span>
                      <span className="font-bold font-mono text-purple-300">{activeSymbolData.bind || "GLOBAL"}</span>
                    </div>
                    <div className="p-2 bg-black/40 border border-[var(--line)] rounded flex justify-between">
                      <span className="text-[var(--mut)]">Target ISA:</span>
                      <span className="font-bold font-mono text-amber-400">{architectureName}</span>
                    </div>
                  </div>
                )}

                {/* TAB 3: CALLS */}
                {inspectorTab === "Calls" && (
                  <div className="space-y-2 text-[11px]">
                    <div className="p-2 bg-black/40 border border-[var(--line)] rounded flex justify-between">
                      <span className="text-[var(--mut)]">Incoming Callers (Fan-In):</span>
                      <span className="font-bold text-emerald-400">{activeNodeData.data.callersCount}</span>
                    </div>
                    <div className="p-2 bg-black/40 border border-[var(--line)] rounded flex justify-between">
                      <span className="text-[var(--mut)]">Outgoing Callees (Fan-Out):</span>
                      <span className="font-bold text-amber-400">{activeNodeData.data.calleesCount}</span>
                    </div>
                  </div>
                )}

                {/* TAB 4: METRICS */}
                {inspectorTab === "Metrics" && (
                  <div className="space-y-2 text-[11px]">
                    <div className="p-2 bg-black/40 border border-[var(--line)] rounded flex justify-between">
                      <span className="text-[var(--mut)]">Complexity Risk Rating:</span>
                      <span className="font-bold text-rose-400">{activeNodeData.data.riskScore}%</span>
                    </div>
                  </div>
                )}

                {/* CROSS-NAVIGATION ACTION BUTTONS */}
                <div className="pt-3 border-t border-[var(--line)] space-y-2">
                  <button
                    onClick={() => onDisassemble?.(activeNodeData.data.name)}
                    className="w-full py-1.5 px-3 rounded bg-[var(--a-dim)] text-[var(--a)] font-bold hover:bg-[var(--a)] hover:text-black transition flex items-center justify-center gap-1.5 text-xs"
                  >
                    <span>🔍</span>
                    <span>View in Code Investigator</span>
                  </button>

                  <button
                    onClick={() => onShowSection?.(activeNodeData.data.section)}
                    className="w-full py-1.5 px-3 rounded bg-black/60 border border-[var(--line)] text-gray-300 font-bold hover:text-white hover:border-[var(--a)] transition flex items-center justify-center gap-1.5 text-xs"
                  >
                    <span>🗺️</span>
                    <span>Inspect in Memory Analysis</span>
                  </button>

                  <button
                    onClick={() => {
                      onOpenObject?.(activeNodeData.data.module);
                      onNavigate?.("objects", activeNodeData.data.module);
                    }}
                    className="w-full py-1.5 px-3 rounded bg-black/60 border border-[var(--line)] text-gray-300 font-bold hover:text-white hover:border-[var(--a)] transition flex items-center justify-center gap-1.5 text-xs"
                  >
                    <span>📦</span>
                    <span>Inspect Object Module</span>
                  </button>

                  <button
                    onClick={() => {
                      setSearch(activeNodeData.data.name);
                    }}
                    className="w-full py-1.5 px-3 rounded bg-black/60 border border-[var(--line)] text-gray-300 font-bold hover:text-white hover:border-[var(--a)] transition flex items-center justify-center gap-1.5 text-xs"
                  >
                    <span>📌</span>
                    <span>Focus Flow on This Function</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center text-[var(--mut)] py-8">Select a function to inspect</div>
            )}
          </div>
        </aside>
      </div>

      {/* 4. BOTTOM WORKFLOW TABS */}
      <div className="h-36 border-t border-[var(--line)] bg-[#05080c] flex flex-col flex-shrink-0 mono text-xs">
        <div className="flex border-b border-[var(--line)] bg-[var(--panel)]">
          {[
            { id: "Trace", label: "Flow Trace Logs" },
            { id: "Architecture", label: "Target Profile" },
            { id: "Vectors", label: "ISR Vector Map" },
            { id: "Analytics", label: "Complexity Analytics" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setBottomTab(tab.id as BottomTab)}
              className={`px-4 py-1.5 transition ${
                bottomTab === tab.id
                  ? "text-[var(--a)] border-b-2 border-[var(--a)] bg-black/40 font-bold"
                  : "text-[var(--mut)] hover:text-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 p-2.5 overflow-y-auto bg-black/60">
          {bottomTab === "Trace" && (
            <div className="space-y-1 font-mono text-[11px]">
              {traceEvents.map((ev, idx) => (
                <div key={idx} className="flex items-center gap-2 text-gray-300">
                  <span className="text-[var(--mut)]">[{new Date(ev.ts).toLocaleTimeString()}]</span>
                  <span className={ev.level === "action" ? "text-[var(--a)] font-bold" : "text-gray-300"}>
                    {ev.message}
                  </span>
                </div>
              ))}
            </div>
          )}

          {bottomTab === "Architecture" && (
            <div className="grid grid-cols-4 gap-3 text-[11px]">
              <div className="p-2 bg-black/40 border border-[var(--line)] rounded">
                <span className="text-[var(--mut)] block">Target Architecture</span>
                <strong className="text-emerald-400">{architectureName}</strong>
              </div>
              <div className="p-2 bg-black/40 border border-[var(--line)] rounded">
                <span className="text-[var(--mut)] block">ELF Toolchain</span>
                <strong className="text-white">{result.toolchain || "GCC / LLVM"}</strong>
              </div>
              <div className="p-2 bg-black/40 border border-[var(--line)] rounded">
                <span className="text-[var(--mut)] block">Entry Point</span>
                <strong className="text-amber-400 font-mono">{baseEntry} ({result.entry || "0x08000000"})</strong>
              </div>
              <div className="p-2 bg-black/40 border border-[var(--line)] rounded">
                <span className="text-[var(--mut)] block">Total Symbols</span>
                <strong className="text-purple-300">{result.symbols?.length || 0} Symbols</strong>
              </div>
            </div>
          )}

          {bottomTab === "Vectors" && (
            <div className="flex flex-wrap gap-2 text-[11px]">
              {result.isrs && result.isrs.length > 0 ? (
                result.isrs.map((isr, i) => (
                  <span key={i} className="px-2 py-1 bg-black/40 border border-rose-500/30 text-rose-300 rounded font-mono">
                    ⚡ {isr.name || isr}
                  </span>
                ))
              ) : (
                <span className="text-[var(--mut)]">Discovered Vector Handlers: {availableNodes.filter(n => n.data.category === "Interrupts").length} ISR routines mapped.</span>
              )}
            </div>
          )}

          {bottomTab === "Analytics" && (
            <div className="grid grid-cols-4 gap-3 text-[11px]">
              <div className="p-2 bg-black/40 border border-[var(--line)] rounded">
                <span className="text-[var(--mut)] block">Total Functions</span>
                <strong className="text-white">{availableNodes.length}</strong>
              </div>
              <div className="p-2 bg-black/40 border border-[var(--line)] rounded">
                <span className="text-[var(--mut)] block">Interrupt Vectors</span>
                <strong className="text-rose-400">{availableNodes.filter(n => n.data.category === "Interrupts").length}</strong>
              </div>
              <div className="p-2 bg-black/40 border border-[var(--line)] rounded">
                <span className="text-[var(--mut)] block">RTOS Tasks & Threads</span>
                <strong className="text-amber-400">{availableNodes.filter(n => n.data.category === "RTOS/Tasks").length}</strong>
              </div>
              <div className="p-2 bg-black/40 border border-[var(--line)] rounded">
                <span className="text-[var(--mut)] block">Isolated / Orphan Routines</span>
                <strong className="text-purple-300">{availableNodes.filter(n => n.data.callersCount === 0 && n.data.calleesCount === 0).length}</strong>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
