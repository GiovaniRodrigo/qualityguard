import { describe, it, expect } from 'vitest';
import type { ArchitectureRule } from '@qualityguard/domain';
import {
  evaluateArchitectureRules,
  validateArchitectureRuleConfig,
  type ArchitectureGraph,
} from './index.js';

describe('QG-TDD-005 — Custom Architecture Governance Rule Engine', () => {
  const sampleGraph: ArchitectureGraph = {
    nodes: [
      'packages/ui/src/button.tsx',
      'packages/ui/src/header.tsx',
      'packages/application/src/auth-service.ts',
      'packages/domain/src/user.ts',
      'packages/infrastructure/src/user-repository.ts',
      'packages/database/src/client.ts',
    ],
    edges: [
      { from: 'packages/ui/src/header.tsx', to: 'packages/application/src/auth-service.ts', kind: 'import' },
      { from: 'packages/application/src/auth-service.ts', to: 'packages/domain/src/user.ts', kind: 'import' },
      { from: 'packages/infrastructure/src/user-repository.ts', to: 'packages/database/src/client.ts', kind: 'import' },
      { from: 'packages/infrastructure/src/user-repository.ts', to: 'packages/domain/src/user.ts', kind: 'import' },
    ],
  };

  describe('1. Forbidden Dependency Rule', () => {
    it('passes when no forbidden dependency edge exists', () => {
      const rule: ArchitectureRule = {
        id: 'rule-1',
        projectId: 'p1',
        name: 'UI cannot depend on Database',
        enabled: true,
        severity: 'critical',
        type: 'forbidden_dependency',
        config: {
          source: 'packages/ui/**',
          target: 'packages/database/**',
        },
        createdAt: '2026-09-15T00:00:00Z',
        updatedAt: '2026-09-15T00:00:00Z',
      };

      const findings = evaluateArchitectureRules(sampleGraph, [rule]);
      expect(findings).toHaveLength(0);
    });

    it('fails and generates architecture finding when forbidden edge exists', () => {
      const violatingGraph: ArchitectureGraph = {
        nodes: [...sampleGraph.nodes],
        edges: [
          ...sampleGraph.edges,
          { from: 'packages/ui/src/header.tsx', to: 'packages/database/src/client.ts', kind: 'import' },
        ],
      };

      const rule: ArchitectureRule = {
        id: 'rule-1',
        projectId: 'p1',
        name: 'UI cannot depend on Database',
        enabled: true,
        severity: 'critical',
        type: 'forbidden_dependency',
        config: {
          source: 'packages/ui/**',
          target: 'packages/database/**',
        },
        createdAt: '2026-09-15T00:00:00Z',
        updatedAt: '2026-09-15T00:00:00Z',
      };

      const findings = evaluateArchitectureRules(violatingGraph, [rule]);
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({
        category: 'architecture',
        severity: 'critical',
        source: 'deterministic',
        ruleId: 'custom/forbidden-dependency',
        file: 'packages/ui/src/header.tsx',
        decision: 'block',
      });
      expect(findings[0]?.description).toContain('packages/ui/src/header.tsx -> packages/database/src/client.ts');
    });
  });

  describe('2. Allowed Dependency Rule', () => {
    it('passes when dependencies from source are strictly within allowedTargets', () => {
      const rule: ArchitectureRule = {
        id: 'rule-2',
        projectId: 'p1',
        name: 'UI may only depend on Application',
        enabled: true,
        severity: 'high',
        type: 'allowed_dependency',
        config: {
          source: 'packages/ui/**',
          allowedTargets: ['packages/application/**'],
        },
        createdAt: '2026-09-15T00:00:00Z',
        updatedAt: '2026-09-15T00:00:00Z',
      };

      const findings = evaluateArchitectureRules(sampleGraph, [rule]);
      expect(findings).toHaveLength(0);
    });

    it('fails when source imports a module outside of allowedTargets', () => {
      const violatingGraph: ArchitectureGraph = {
        nodes: [...sampleGraph.nodes],
        edges: [
          ...sampleGraph.edges,
          { from: 'packages/ui/src/header.tsx', to: 'packages/infrastructure/src/user-repository.ts', kind: 'import' },
        ],
      };

      const rule: ArchitectureRule = {
        id: 'rule-2',
        projectId: 'p1',
        name: 'UI may only depend on Application',
        enabled: true,
        severity: 'high',
        type: 'allowed_dependency',
        config: {
          source: 'packages/ui/**',
          allowedTargets: ['packages/application/**'],
        },
        createdAt: '2026-09-15T00:00:00Z',
        updatedAt: '2026-09-15T00:00:00Z',
      };

      const findings = evaluateArchitectureRules(violatingGraph, [rule]);
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({
        category: 'architecture',
        severity: 'high',
        ruleId: 'custom/allowed-dependency',
        file: 'packages/ui/src/header.tsx',
      });
    });
  });

  describe('3. Forbidden Path Dependency Rule', () => {
    it('passes when no imports cross forbidden directory boundaries', () => {
      const rule: ArchitectureRule = {
        id: 'rule-3',
        projectId: 'p1',
        name: 'Domain cannot import Infrastructure',
        enabled: true,
        severity: 'high',
        type: 'forbidden_path_dependency',
        config: {
          fromPath: 'packages/domain/**',
          toPath: 'packages/infrastructure/**',
        },
        createdAt: '2026-09-15T00:00:00Z',
        updatedAt: '2026-09-15T00:00:00Z',
      };

      const findings = evaluateArchitectureRules(sampleGraph, [rule]);
      expect(findings).toHaveLength(0);
    });

    it('fails when domain imports infrastructure directly', () => {
      const violatingGraph: ArchitectureGraph = {
        nodes: [...sampleGraph.nodes],
        edges: [
          ...sampleGraph.edges,
          { from: 'packages/domain/src/user.ts', to: 'packages/infrastructure/src/user-repository.ts', kind: 'import' },
        ],
      };

      const rule: ArchitectureRule = {
        id: 'rule-3',
        projectId: 'p1',
        name: 'Domain cannot import Infrastructure',
        enabled: true,
        severity: 'high',
        type: 'forbidden_path_dependency',
        config: {
          fromPath: 'packages/domain/**',
          toPath: 'packages/infrastructure/**',
        },
        createdAt: '2026-09-15T00:00:00Z',
        updatedAt: '2026-09-15T00:00:00Z',
      };

      const findings = evaluateArchitectureRules(violatingGraph, [rule]);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe('custom/forbidden-path-dependency');
      expect(findings[0]?.file).toBe('packages/domain/src/user.ts');
    });
  });

  describe('4. No Cycles Rule', () => {
    it('passes when graph is acyclic', () => {
      const rule: ArchitectureRule = {
        id: 'rule-4',
        projectId: 'p1',
        name: 'Zero circular dependencies allowed',
        enabled: true,
        severity: 'critical',
        type: 'no_cycles',
        config: {},
        createdAt: '2026-09-15T00:00:00Z',
        updatedAt: '2026-09-15T00:00:00Z',
      };

      const findings = evaluateArchitectureRules(sampleGraph, [rule]);
      expect(findings).toHaveLength(0);
    });

    it('fails and reports finding with cycle path when cycles exist', () => {
      const cyclicGraph: ArchitectureGraph = {
        nodes: ['a.ts', 'b.ts', 'c.ts'],
        edges: [
          { from: 'a.ts', to: 'b.ts', kind: 'import' },
          { from: 'b.ts', to: 'c.ts', kind: 'import' },
          { from: 'c.ts', to: 'a.ts', kind: 'import' },
        ],
      };

      const rule: ArchitectureRule = {
        id: 'rule-4',
        projectId: 'p1',
        name: 'Zero circular dependencies allowed',
        enabled: true,
        severity: 'critical',
        type: 'no_cycles',
        config: {},
        createdAt: '2026-09-15T00:00:00Z',
        updatedAt: '2026-09-15T00:00:00Z',
      };

      const findings = evaluateArchitectureRules(cyclicGraph, [rule]);
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({
        category: 'architecture',
        severity: 'critical',
        ruleId: 'custom/no-cycles',
        decision: 'block',
      });
      expect(findings[0]?.description).toContain('a.ts');
    });
  });

  describe('5. Required Layer Rule', () => {
    it('passes when dependencies strictly flow top-down through layers', () => {
      const rule: ArchitectureRule = {
        id: 'rule-5',
        projectId: 'p1',
        name: 'Clean Architecture Layer Ordering',
        enabled: true,
        severity: 'high',
        type: 'required_layer',
        config: {
          layers: ['packages/ui/**', 'packages/application/**', 'packages/domain/**'],
        },
        createdAt: '2026-09-15T00:00:00Z',
        updatedAt: '2026-09-15T00:00:00Z',
      };

      const findings = evaluateArchitectureRules(sampleGraph, [rule]);
      expect(findings).toHaveLength(0);
    });

    it('fails when a lower layer imports an upper layer (inverted dependency)', () => {
      const violatingGraph: ArchitectureGraph = {
        nodes: [...sampleGraph.nodes],
        edges: [
          { from: 'packages/domain/src/user.ts', to: 'packages/ui/src/button.tsx', kind: 'import' },
        ],
      };

      const rule: ArchitectureRule = {
        id: 'rule-5',
        projectId: 'p1',
        name: 'Clean Architecture Layer Ordering',
        enabled: true,
        severity: 'high',
        type: 'required_layer',
        config: {
          layers: ['packages/ui/**', 'packages/application/**', 'packages/domain/**'],
        },
        createdAt: '2026-09-15T00:00:00Z',
        updatedAt: '2026-09-15T00:00:00Z',
      };

      const findings = evaluateArchitectureRules(violatingGraph, [rule]);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe('custom/required-layer');
      expect(findings[0]?.file).toBe('packages/domain/src/user.ts');
      expect(findings[0]?.description).toContain('Layer violation');
    });

    it('fails when strictAdjacentOnly is true and a layer skips an intermediate layer', () => {
      const strictRule: ArchitectureRule = {
        id: 'rule-5b',
        projectId: 'p1',
        name: 'Strict Adjacent Layers',
        enabled: true,
        severity: 'medium',
        type: 'required_layer',
        config: {
          layers: ['packages/ui/**', 'packages/application/**', 'packages/domain/**'],
          strictAdjacentOnly: true,
        },
        createdAt: '2026-09-15T00:00:00Z',
        updatedAt: '2026-09-15T00:00:00Z',
      };

      const skippingGraph: ArchitectureGraph = {
        nodes: [...sampleGraph.nodes],
        edges: [
          { from: 'packages/ui/src/header.tsx', to: 'packages/domain/src/user.ts', kind: 'import' },
        ],
      };

      const findings = evaluateArchitectureRules(skippingGraph, [strictRule]);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.severity).toBe('medium');
      expect(findings[0]?.description).toContain('Non-adjacent layer dependency');
    });
  });

  describe('6. Rule Engine Edge Cases & Determinism', () => {
    it('ignores disabled rules', () => {
      const violatingGraph: ArchitectureGraph = {
        nodes: [...sampleGraph.nodes],
        edges: [
          { from: 'packages/ui/src/header.tsx', to: 'packages/database/src/client.ts', kind: 'import' },
        ],
      };

      const disabledRule: ArchitectureRule = {
        id: 'rule-disabled',
        projectId: 'p1',
        name: 'Disabled UI to DB check',
        enabled: false,
        severity: 'critical',
        type: 'forbidden_dependency',
        config: {
          source: 'packages/ui/**',
          target: 'packages/database/**',
        },
        createdAt: '2026-09-15T00:00:00Z',
        updatedAt: '2026-09-15T00:00:00Z',
      };

      const findings = evaluateArchitectureRules(violatingGraph, [disabledRule]);
      expect(findings).toHaveLength(0);
    });

    it('evaluates multiple rules and returns deterministically sorted findings', () => {
      const multiViolatingGraph: ArchitectureGraph = {
        nodes: ['ui.ts', 'db.ts', 'infra.ts', 'a.ts', 'b.ts'],
        edges: [
          { from: 'ui.ts', to: 'db.ts', kind: 'import' },
          { from: 'a.ts', to: 'b.ts', kind: 'import' },
          { from: 'b.ts', to: 'a.ts', kind: 'import' },
        ],
      };

      const rules: ArchitectureRule[] = [
        {
          id: 'r1',
          projectId: 'p1',
          name: 'Forbidden UI to DB',
          enabled: true,
          severity: 'critical',
          type: 'forbidden_dependency',
          config: { source: 'ui.ts', target: 'db.ts' },
          createdAt: '2026-09-15T00:00:00Z',
          updatedAt: '2026-09-15T00:00:00Z',
        },
        {
          id: 'r2',
          projectId: 'p1',
          name: 'No cycles',
          enabled: true,
          severity: 'high',
          type: 'no_cycles',
          config: {},
          createdAt: '2026-09-15T00:00:00Z',
          updatedAt: '2026-09-15T00:00:00Z',
        },
      ];

      const findings = evaluateArchitectureRules(multiViolatingGraph, rules);
      expect(findings).toHaveLength(2);
      expect(findings[0]?.ruleId).toBeDefined();
      expect(findings[1]?.ruleId).toBeDefined();
    });

    it('gracefully handles empty graph and graphs with no edges', () => {
      const emptyGraph: ArchitectureGraph = { nodes: [], edges: [] };
      const rule: ArchitectureRule = {
        id: 'r1',
        projectId: 'p1',
        name: 'No cycles',
        enabled: true,
        severity: 'critical',
        type: 'no_cycles',
        config: {},
        createdAt: '2026-09-15T00:00:00Z',
        updatedAt: '2026-09-15T00:00:00Z',
      };

      expect(evaluateArchitectureRules(emptyGraph, [rule])).toEqual([]);
    });

    it('validates rule configurations cleanly', () => {
      expect(validateArchitectureRuleConfig('forbidden_dependency', { source: 'ui/**', target: 'db/**' })).toEqual({ valid: true });
      expect(validateArchitectureRuleConfig('forbidden_dependency', { source: '' })).toEqual({
        valid: false,
        error: 'source and target are required for forbidden_dependency rule',
      });

      expect(validateArchitectureRuleConfig('allowed_dependency', { source: 'ui/**', allowedTargets: ['app/**'] })).toEqual({ valid: true });
      expect(validateArchitectureRuleConfig('allowed_dependency', { source: 'ui/**', allowedTargets: [] })).toEqual({
        valid: false,
        error: 'allowedTargets must contain at least one target pattern',
      });

      expect(validateArchitectureRuleConfig('required_layer', { layers: ['ui/**', 'app/**'] })).toEqual({ valid: true });
      expect(validateArchitectureRuleConfig('required_layer', { layers: ['single'] })).toEqual({
        valid: false,
        error: 'layers must contain at least two layer patterns in hierarchical order',
      });
    });
  });
});
