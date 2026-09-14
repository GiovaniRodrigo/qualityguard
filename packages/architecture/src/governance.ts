import type { ArchitectureGraph } from './index.js';
export interface ArchitecturePolicy { forbiddenEdges?: Array<{from:string;to:string}>; allowedLayers?: Record<string,string[]>; }
export interface Drift { type:'forbidden_dependency'|'layer_violation'; from:string; to:string; message:string; }
export function detectDrift(graph:ArchitectureGraph,policy:ArchitecturePolicy):Drift[]{const drifts:Drift[]=[];for(const edge of graph.edges){if(policy.forbiddenEdges?.some(x=>match(x.from,edge.from)&&match(x.to,edge.to)))drifts.push({type:'forbidden_dependency',from:edge.from,to:edge.to,message:`Forbidden dependency: ${edge.from} -> ${edge.to}`});const fromLayer=layer(edge.from),toLayer=layer(edge.to);const allowed=fromLayer&&policy.allowedLayers?.[fromLayer];if(allowed&&toLayer&&!allowed.includes(toLayer))drifts.push({type:'layer_violation',from:edge.from,to:edge.to,message:`Layer ${fromLayer} cannot depend on ${toLayer}`});}return drifts;}
function match(pattern:string,value:string){return pattern==='*'||pattern===value||value.startsWith(pattern.replace('*',''));}
function layer(path:string){return path.split('/')[0]??'';}
export function architectureMap(graph:ArchitectureGraph){return graph.nodes.map(node=>({node,dependsOn:graph.edges.filter(e=>e.from===node).map(e=>e.to)}));}
