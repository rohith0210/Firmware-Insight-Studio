import ReactFlow, { Background, Controls, MiniMap } from "reactflow";
import type { Node, Edge } from "reactflow";
import "reactflow/dist/style.css";

type CG = { nodes: Array<{ id: string; label: string; type: string }>; edges: Array<{ source: string; target: string; animated?: boolean }> };

export default function CallGraph({ data }: { data: CG }) {
  if (!data.nodes || data.nodes.length === 0) return null;
  const nodes: Node[] = data.nodes.map((n, i) => ({
    id: n.id,
    position: i === 0 ? { x: 240, y: 0 } : { x: (i - 1) * 165, y: 150 },
    data: { label: n.type === "entry" ? "▶ " + n.label : n.label },
    style: n.type === "entry"
      ? { background: "rgba(51,214,194,.12)", border: "1px solid #33d6c2", color: "#d8e1ec", padding: "12px 20px", borderRadius: 3, fontFamily: "Chakra Petch", fontWeight: 700, letterSpacing: ".04em" }
      : { background: "#0c1118", border: "1px solid #283443", color: "#d8e1ec", padding: "10px 16px", borderRadius: 3, fontFamily: "JetBrains Mono", fontSize: 12 },
  }));
  const edges: Edge[] = data.edges.map((e, i) => ({ id: "e" + i, source: e.source, target: e.target, animated: e.animated, style: { stroke: "#33d6c2", strokeWidth: 1.6 } }));

  return (
    <div className="panel">
      <div className="panel-head"><span>Call Graph</span><span className="tag">heuristic · entry → callees</span></div>
      <div className="p-3">
        <div className="h-[400px] w-full rounded-[3px] border ln" style={{ background: "#080b10" }}>
          <ReactFlow nodes={nodes} edges={edges} fitView attributionPosition="bottom-left" proOptions={{ hideAttribution: true }}>
            <Background color="#1b2531" gap={22} />
            <Controls />
            <MiniMap nodeColor={(n) => (n.id === data.nodes[0]?.id ? "#33d6c2" : "#f0a830")} maskColor="rgba(7,10,15,.85)" />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}
