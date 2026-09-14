import { describe, expect, it } from 'vitest';
import { buildDependencyGraph, findCycles } from './index.js';

describe('architecture graph and cycle detection', () => {
  it('builds dependency graph from relative imports', () => {
    const files = [
      { path: 'src/a.ts', content: "import { b } from './b.js';" },
      { path: 'src/b.ts', content: "export const b = 1;" },
    ];
    const graph = buildDependencyGraph(files);
    expect(graph.nodes).toEqual(['src/a.ts', 'src/b.ts']);
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]?.from).toBe('src/a.ts');
    expect(graph.edges[0]?.to).toBe('src/b.ts');
  });

  it('detects circular dependencies', () => {
    const files = [
      { path: 'src/a.ts', content: "import { b } from './b.js';" },
      { path: 'src/b.ts', content: "import { a } from './a.js';" },
    ];
    const graph = buildDependencyGraph(files);
    const cycles = findCycles(graph);
    expect(cycles.length).toBeGreaterThan(0);
  });
});
