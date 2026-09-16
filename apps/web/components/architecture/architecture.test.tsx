import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import type { Finding, Project, ArchitectureGraph } from '@/lib/api/types';
import { ArchitectureGovernance } from './architecture-governance';

const mockProject: Project = {
  id: 'proj-123',
  organizationId: 'org-123',
  name: 'Test Project',
  repository: 'org/test-repo',
  branch: 'main',
  createdAt: new Date().toISOString(),
};

const mockGraph: ArchitectureGraph = {
  nodes: ['src/ui/App.tsx', 'src/domain/user.ts', 'src/db/client.ts'],
  edges: [
    { from: 'src/ui/App.tsx', to: 'src/domain/user.ts', kind: 'import' },
    { from: 'src/domain/user.ts', to: 'src/db/client.ts', kind: 'import' },
  ],
  cycles: [['src/domain/user.ts', 'src/db/client.ts', 'src/domain/user.ts']],
  drift: [],
};

const mockFindings: Finding[] = [
  {
    id: 'f-arch-1',
    severity: 'high',
    category: 'architecture',
    status: 'open',
    decision: 'review_required',
    file: 'src/ui/App.tsx',
    line: 1,
    title: 'Forbidden direct import: src/ui/App.tsx -> src/db/client.ts',
    description: 'Direct dependency from presentation to persistence violates architectural rule.',
    suggestion: 'Access persistence layer through domain services only.',
    confidence: 1.0,
    source: 'deterministic',
    ruleId: 'custom/forbidden_dependency',
  },
];

describe('Architecture Governance Component', () => {
  it('renders governance stats cards correctly', () => {
    const html = renderToString(
      <ArchitectureGovernance
        project={mockProject}
        architectureGraph={mockGraph}
        findings={mockFindings}
      />
    );

    expect(html).toContain('Regras de Governança Arquitetural');
    expect(html).toContain('Módulos &amp; Arestas');
    expect(html).toContain('3'); // 3 nodes
    expect(html).toContain('Violações de Regras');
    expect(html).toContain('1'); // 1 finding
    expect(html).toContain('Ciclos Circulares');
  });

  it('renders detected architecture violations and suggestions', () => {
    const html = renderToString(
      <ArchitectureGovernance
        project={mockProject}
        architectureGraph={mockGraph}
        findings={mockFindings}
      />
    );

    expect(html).toContain('Violações Arquiteturais Detectadas');
    expect(html).toContain('Forbidden direct import: src/ui/App.tsx -&gt; src/db/client.ts');
    expect(html).toContain('custom/forbidden_dependency');
    expect(html).toContain('Access persistence layer through domain services only.');
  });


  it('renders circular dependency cycle paths', () => {
    const html = renderToString(
      <ArchitectureGovernance
        project={mockProject}
        architectureGraph={mockGraph}
        findings={mockFindings}
      />
    );

    expect(html).toContain('Ciclos de Dependência Circular');
    expect(html).toContain('src/domain/user.ts ➔ src/db/client.ts ➔ src/domain/user.ts');
  });

  it('handles null project and empty states gracefully', () => {
    const html = renderToString(
      <ArchitectureGovernance
        project={null}
        architectureGraph={null}
        findings={[]}
      />
    );

    expect(html).toContain('Regras de Governança Arquitetural');
    expect(html).not.toContain('Violações Arquiteturais Detectadas');
  });
});
