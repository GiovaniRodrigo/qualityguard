export interface DependencyEdge { from: string; to: string; kind: 'import'|'require'; }
export interface ArchitectureGraph { nodes: string[]; edges: DependencyEdge[]; }

const importRegex = /(?:import(?:[\s\S]*?from\s*)?|export(?:[\s\S]*?from\s*)?|require\(\s*)['"]([^'"]+)['"]/g;
export function buildDependencyGraph(files: {path:string;content:string}[]): ArchitectureGraph {
  const nodes = files.map((f) => f.path); const nodeSet = new Set(nodes); const edges: DependencyEdge[] = [];
  for (const file of files) for (const match of file.content.matchAll(importRegex)) {
    const target = match[1]; if (!target?.startsWith('.')) continue;
    const parts = file.path.split('/'); parts.pop(); const resolved = normalize([...parts, ...target.split('/')].join('/'));
    const candidate = nodes.find((n) => n === resolved || n.replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/,'') === resolved || n.replace(/\/index\.(ts|tsx|js|jsx|mjs|cjs)$/,'') === resolved);
    if (candidate) edges.push({from:file.path,to:candidate,kind:file.content.includes('require(')?'require':'import'});
  }
  return {nodes,edges};
}
function normalize(path:string){const out:string[]=[]; for(const p of path.split('/')){if(!p||p==='.')continue; if(p==='..')out.pop();else out.push(p);} return out.join('/');}

export function findCycles(graph: ArchitectureGraph): string[][] { const adjacency = new Map<string,string[]>(); for(const n of graph.nodes) adjacency.set(n,[]); for(const e of graph.edges) adjacency.get(e.from)?.push(e.to); const cycles:string[][]=[];
  for(const start of graph.nodes){const stack:string[]=[]; const visiting=new Set<string>(); const walk=(node:string)=>{stack.push(node);visiting.add(node);for(const next of adjacency.get(node)??[]){const i=stack.indexOf(next);if(i>=0)cycles.push([...stack.slice(i),next]);else if(!visiting.has(next))walk(next);}visiting.delete(node);stack.pop();};walk(start);} return uniqueCycles(cycles); }
function uniqueCycles(cycles:string[][]){const seen=new Set<string>();return cycles.filter(c=>{const key=[...c].sort().join('|');if(seen.has(key))return false;seen.add(key);return true;});}
