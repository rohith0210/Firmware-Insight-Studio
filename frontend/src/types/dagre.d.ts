declare module "dagre" {
  import type { Graph } from "graphlib";
  const dagre: {
    graphlib: {
      Graph: new () => Graph;
    };
    layout: (graph: Graph) => void;
  };
  export default dagre;
}
