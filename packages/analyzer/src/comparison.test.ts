import { describe, expect, it } from 'vitest';
import type { Finding, DependencyItem, CoverageSummary } from '@qualityguard/domain';
import {
  compareReviews,
  diffFindings,
  computeScoreDelta,
  computeQualityGateDelta,
  computeArchitectureDriftDelta,
  computeDependencyDriftDelta,
  computeCoverageDriftDelta,
  computeStableFindingKey,
  type ReviewSnapshot,
} from './comparison.js';

function createMockFinding(override: Partial<Finding>): Finding {
  return {
    id: override.id ?? `QG-${Math.random().toString(36).slice(2, 7)}`,
    severity: override.severity ?? 'high',
    category: override.category ?? 'maintainability',
    status: override.status ?? 'open',
    decision: override.decision ?? 'review_required',
    file: override.file ?? 'src/index.ts',
    line: override.line ?? 10,
    title: override.title ?? 'Mock Finding',
    description: override.description ?? 'Description of finding',
    suggestion: override.suggestion ?? 'Fix suggestion',
    confidence: override.confidence ?? 0.9,
    source: override.source ?? 'deterministic',
    ruleId: override.ruleId ?? 'maintainability.high-complexity',
    evidence: override.evidence,
  };
}

describe('QG-TDD-008 — Comparison Engine Unit Tests', () => {
  describe('diffFindings & Stable Finding Identity', () => {
    it('identifies introduced, resolved, and unchanged findings correctly', () => {
      const fA = createMockFinding({
        id: 'f-A',
        ruleId: 'security.hardcoded-secret',
        file: 'src/auth.ts',
        line: 12,
        title: 'Secret A',
        evidence: ['const apiKey = "secret12345";'],
      });

      const fB = createMockFinding({
        id: 'f-B',
        ruleId: 'clean_code.empty-catch',
        file: 'src/utils.ts',
        line: 45,
        title: 'Empty catch',
        evidence: ['catch (e) {}'],
      });

      const fC = createMockFinding({
        id: 'f-C',
        ruleId: 'testing.missing-test',
        file: 'src/legacy.ts',
        line: 1,
        title: 'Missing test',
      });

      const fD = createMockFinding({
        id: 'f-D',
        ruleId: 'security.sql-injection',
        file: 'src/db.ts',
        line: 88,
        title: 'SQL injection',
        evidence: ['query(`SELECT * FROM users WHERE id = ${id}`)'],
      });

      const baseline = [fA, fB, fC];
      const current = [fB, fC, fD];

      const diff = diffFindings(baseline, current);

      expect(diff.totalBaseline).toBe(3);
      expect(diff.totalCurrent).toBe(3);
      expect(diff.introduced).toHaveLength(1);
      expect(diff.introduced[0]?.id).toBe('f-D');
      expect(diff.resolved).toHaveLength(1);
      expect(diff.resolved[0]?.id).toBe('f-A');
      expect(diff.unchanged).toHaveLength(2);
      expect(diff.unchanged.map((f) => f.id).sort()).toEqual(['f-B', 'f-C']);
    });

    it('handles line shifts gracefully without marking unchanged findings as introduced/resolved', () => {
      // In baseline, finding is at line 15
      const baselineFinding = createMockFinding({
        id: 'f-1',
        ruleId: 'security.hardcoded-secret',
        file: 'src/config.ts',
        line: 15,
        title: 'Potential hardcoded secret',
        evidence: ['const token = "eyJhGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";'],
      });

      // In current branch, 10 lines of imports were added above, shifting finding to line 25 with identical content
      const currentFinding = createMockFinding({
        id: 'f-2',
        ruleId: 'security.hardcoded-secret',
        file: 'src/config.ts',
        line: 25,
        title: 'Potential hardcoded secret',
        evidence: ['const token = "eyJhGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";'],
      });

      const diff = diffFindings([baselineFinding], [currentFinding]);

      expect(diff.introduced).toHaveLength(0);
      expect(diff.resolved).toHaveLength(0);
      expect(diff.unchanged).toHaveLength(1);
      expect(diff.unchanged[0]?.line).toBe(25);
    });

    it('disambiguates multiple duplicate findings in the same file', () => {
      const f1 = createMockFinding({
        ruleId: 'clean_code.empty-catch',
        file: 'src/runner.ts',
        line: 10,
        title: 'Empty catch',
        evidence: ['catch () {}'],
      });
      const f2 = createMockFinding({
        ruleId: 'clean_code.empty-catch',
        file: 'src/runner.ts',
        line: 40,
        title: 'Empty catch',
        evidence: ['catch () {}'],
      });
      const f3 = createMockFinding({
        ruleId: 'clean_code.empty-catch',
        file: 'src/runner.ts',
        line: 70,
        title: 'Empty catch',
        evidence: ['catch () {}'],
      });

      // Baseline had 2 empty catches, current has 3
      const diff = diffFindings([f1, f2], [f1, f2, f3]);

      expect(diff.unchanged).toHaveLength(2);
      expect(diff.introduced).toHaveLength(1);
      expect(diff.resolved).toHaveLength(0);
    });

    it('computes stable finding key with normalized paths', () => {
      const keyWin = computeStableFindingKey(
        createMockFinding({
          file: 'src\\domain\\user.ts',
          ruleId: 'arch.no-infra',
          evidence: ['import { DB } from "../infra/db";'],
        }),
      );

      const keyUnix = computeStableFindingKey(
        createMockFinding({
          file: './src/domain/user.ts',
          ruleId: 'arch.no-infra',
          evidence: ['import { DB } from "../infra/db";'],
        }),
      );

      expect(keyWin).toBe(keyUnix);
      expect(keyWin).toContain('arch.no-infra::src/domain/user.ts');
    });
  });

  describe('computeScoreDelta', () => {
    it('computes positive score improvement', () => {
      const delta = computeScoreDelta(75, 85);
      expect(delta).toEqual({ baseline: 75, current: 85, delta: 10 });
    });

    it('computes negative score degradation', () => {
      const delta = computeScoreDelta(90, 82);
      expect(delta).toEqual({ baseline: 90, current: 82, delta: -8 });
    });

    it('computes zero delta when score is identical', () => {
      const delta = computeScoreDelta(88, 88);
      expect(delta).toEqual({ baseline: 88, current: 88, delta: 0 });
    });
  });

  describe('computeQualityGateDelta', () => {
    it('detects BLOCK -> PASS transition', () => {
      const gate = computeQualityGateDelta(
        { passed: false, decision: 'block', reasons: ['High severity vulnerability'] },
        { passed: true, decision: 'approve', reasons: [] },
      );

      expect(gate.statusChanged).toBe(true);
      expect(gate.transition).toBe('BLOCK -> APPROVE');
      expect(gate.baseline.passed).toBe(false);
      expect(gate.current.passed).toBe(true);
    });

    it('detects PASS -> BLOCK transition', () => {
      const gate = computeQualityGateDelta(
        { passed: true, decision: 'approve', reasons: [] },
        { passed: false, decision: 'block', reasons: ['Circular architecture dependency'] },
      );

      expect(gate.statusChanged).toBe(true);
      expect(gate.transition).toBe('APPROVE -> BLOCK');
      expect(gate.baseline.passed).toBe(true);
      expect(gate.current.passed).toBe(false);
    });

    it('detects unchanged gate states', () => {
      const gate = computeQualityGateDelta(
        { passed: true, decision: 'approve', reasons: [] },
        { passed: true, decision: 'approve', reasons: [] },
      );

      expect(gate.statusChanged).toBe(false);
      expect(gate.transition).toBe('APPROVE -> APPROVE');
    });
  });

  describe('computeArchitectureDriftDelta', () => {
    it('identifies introduced and resolved forbidden dependencies and cycles', () => {
      const baselineArch = {
        drift: [
          { type: 'forbidden_dependency', from: 'domain/user.ts', to: 'infra/db.ts', message: 'Forbidden' },
          { type: 'layer_violation', from: 'domain/order.ts', to: 'ui/button.tsx', message: 'Layer' },
        ],
        cycles: [['domain/a.ts', 'domain/b.ts']],
      };

      const currentArch = {
        drift: [
          // 'domain/user.ts' -> 'infra/db.ts' resolved (removed)
          // 'domain/order.ts' -> 'ui/button.tsx' unchanged
          { type: 'layer_violation', from: 'domain/order.ts', to: 'ui/button.tsx', message: 'Layer' },
          // new drift introduced
          { type: 'forbidden_dependency', from: 'domain/payment.ts', to: 'infra/stripe.ts', message: 'Forbidden' },
        ],
        cycles: [
          // previous cycle resolved, new cycle introduced
          ['infra/repo.ts', 'infra/adapter.ts', 'infra/client.ts'],
        ],
      };

      const delta = computeArchitectureDriftDelta(baselineArch, currentArch);

      expect(delta.introducedDrift).toHaveLength(1);
      expect(delta.introducedDrift[0]?.from).toBe('domain/payment.ts');

      expect(delta.resolvedDrift).toHaveLength(1);
      expect(delta.resolvedDrift[0]?.from).toBe('domain/user.ts');

      expect(delta.unchangedDrift).toHaveLength(1);
      expect(delta.unchangedDrift[0]?.from).toBe('domain/order.ts');

      expect(delta.introducedCycles).toHaveLength(1);
      expect(delta.resolvedCycles).toHaveLength(1);
    });
  });

  describe('computeDependencyDriftDelta', () => {
    it('categorizes added, removed, and version-changed dependencies', () => {
      const baselineDeps: DependencyItem[] = [
        { name: 'react', version: '18.2.0', ecosystem: 'npm', manifest: 'package.json', type: 'dependency' },
        { name: 'lodash', version: '4.17.21', ecosystem: 'npm', manifest: 'package.json', type: 'dependency' },
        { name: 'serde', version: '1.0.190', ecosystem: 'cargo', manifest: 'Cargo.toml', type: 'dependency' },
      ];

      const currentDeps: DependencyItem[] = [
        // react upgraded 18.2.0 -> 19.0.0
        { name: 'react', version: '19.0.0', ecosystem: 'npm', manifest: 'package.json', type: 'dependency' },
        // lodash removed
        // serde unchanged
        { name: 'serde', version: '1.0.190', ecosystem: 'cargo', manifest: 'Cargo.toml', type: 'dependency' },
        // tailwindcss added
        { name: 'tailwindcss', version: '4.0.0', ecosystem: 'npm', manifest: 'package.json', type: 'devDependency' },
      ];

      const delta = computeDependencyDriftDelta(baselineDeps, currentDeps);

      expect(delta.added).toHaveLength(1);
      expect(delta.added[0]?.name).toBe('tailwindcss');

      expect(delta.removed).toHaveLength(1);
      expect(delta.removed[0]?.name).toBe('lodash');

      expect(delta.changed).toHaveLength(1);
      expect(delta.changed[0]).toEqual({
        name: 'react',
        ecosystem: 'npm',
        manifest: 'package.json',
        previousVersion: '18.2.0',
        currentVersion: '19.0.0',
        previousType: 'dependency',
        currentType: 'dependency',
      });
    });
  });

  describe('computeCoverageDriftDelta', () => {
    it('calculates line, function, and branch deltas when coverage exists on both sides', () => {
      const baseCoverage: CoverageSummary = {
        lines: { total: 100, covered: 80, missed: 20, percentage: 80.0 },
        functions: { total: 20, covered: 15, missed: 5, percentage: 75.0 },
        branches: { total: 50, covered: 30, missed: 20, percentage: 60.0 },
      };

      const currCoverage: CoverageSummary = {
        lines: { total: 110, covered: 95, missed: 15, percentage: 86.4 },
        functions: { total: 22, covered: 18, missed: 4, percentage: 81.8 },
        branches: { total: 55, covered: 40, missed: 15, percentage: 72.7 },
      };

      const delta = computeCoverageDriftDelta(baseCoverage, currCoverage);

      expect(delta.baseline).toBe(baseCoverage);
      expect(delta.current).toBe(currCoverage);
      expect(delta.delta).not.toBeNull();
      expect(delta.delta?.lines.delta).toBe(6.4);
      expect(delta.delta?.functions.delta).toBe(6.8);
      expect(delta.delta?.branches.delta).toBe(12.7);
    });

    it('returns null delta when either baseline or current lacks coverage without inventing 0%', () => {
      const currCoverage: CoverageSummary = {
        lines: { total: 50, covered: 40, missed: 10, percentage: 80.0 },
        functions: { total: 10, covered: 8, missed: 2, percentage: 80.0 },
        branches: { total: 10, covered: 8, missed: 2, percentage: 80.0 },
      };

      const result1 = computeCoverageDriftDelta(null, currCoverage);
      expect(result1.baseline).toBeNull();
      expect(result1.current).toBe(currCoverage);
      expect(result1.delta).toBeNull();

      const result2 = computeCoverageDriftDelta(currCoverage, null);
      expect(result2.baseline).toBe(currCoverage);
      expect(result2.current).toBeNull();
      expect(result2.delta).toBeNull();

      const result3 = computeCoverageDriftDelta(null, null);
      expect(result3.delta).toBeNull();
    });
  });

  describe('compareReviews End-to-End Function', () => {
    it('compares two full review snapshots producing complete ReviewComparisonResult', () => {
      const baseline: ReviewSnapshot = {
        id: 'rev-baseline',
        projectId: 'proj-123',
        projectName: 'QualityGuard Core',
        branch: 'main',
        commitSha: 'a1b2c3d4e5',
        score: 78,
        decision: 'block',
        findings: [
          createMockFinding({ id: 'f-1', ruleId: 'security.hardcoded-secret', file: 'src/api.ts', line: 10 }),
          createMockFinding({ id: 'f-2', ruleId: 'clean_code.empty-catch', file: 'src/log.ts', line: 20 }),
        ],
        architecture: {
          nodes: ['src/api.ts', 'src/log.ts'],
          edges: [{ from: 'src/api.ts', to: 'src/log.ts', kind: 'import' }],
          cycles: [],
          drift: [{ type: 'forbidden_dependency', from: 'src/api.ts', to: 'src/log.ts', message: 'Forbidden' }],
        },
        dependencies: [
          { name: 'express', version: '4.18.0', ecosystem: 'npm', manifest: 'package.json', type: 'dependency' },
        ],
        coverage: {
          lines: { total: 100, covered: 70, missed: 30, percentage: 70.0 },
          functions: { total: 10, covered: 7, missed: 3, percentage: 70.0 },
          branches: { total: 20, covered: 14, missed: 6, percentage: 70.0 },
        },
        gate: {
          passed: false,
          decision: 'block',
          reasons: ['Score below threshold (78 < 80)', 'High severity findings present'],
        },
        createdAt: '2026-09-01T10:00:00.000Z',
      };

      const current: ReviewSnapshot = {
        id: 'rev-current',
        projectId: 'proj-123',
        projectName: 'QualityGuard Core',
        branch: 'feature/hardening',
        commitSha: 'f6g7h8i9j0',
        score: 92,
        decision: 'approve',
        findings: [
          // f-1 resolved (secret removed)
          // f-2 unchanged
          createMockFinding({ id: 'f-2', ruleId: 'clean_code.empty-catch', file: 'src/log.ts', line: 20 }),
        ],
        architecture: {
          nodes: ['src/api.ts', 'src/log.ts'],
          edges: [],
          cycles: [],
          drift: [], // drift resolved
        },
        dependencies: [
          { name: 'express', version: '4.19.2', ecosystem: 'npm', manifest: 'package.json', type: 'dependency' },
          { name: 'zod', version: '3.22.0', ecosystem: 'npm', manifest: 'package.json', type: 'dependency' },
        ],
        coverage: {
          lines: { total: 105, covered: 88, missed: 17, percentage: 83.8 },
          functions: { total: 10, covered: 9, missed: 1, percentage: 90.0 },
          branches: { total: 20, covered: 17, missed: 3, percentage: 85.0 },
        },
        gate: {
          passed: true,
          decision: 'approve',
          reasons: [],
        },
        createdAt: '2026-09-15T12:00:00.000Z',
      };

      const comparison = compareReviews(baseline, current, 'cmp-test-1');

      expect(comparison.id).toBe('cmp-test-1');
      expect(comparison.projectId).toBe('proj-123');

      // Reference checks
      expect(comparison.baseline.reviewId).toBe('rev-baseline');
      expect(comparison.baseline.branch).toBe('main');
      expect(comparison.current.reviewId).toBe('rev-current');
      expect(comparison.current.branch).toBe('feature/hardening');

      // Score check: 78 -> 92 (+14)
      expect(comparison.score.baseline).toBe(78);
      expect(comparison.score.current).toBe(92);
      expect(comparison.score.delta).toBe(14);

      // Gate check: BLOCK -> APPROVE
      expect(comparison.gate.statusChanged).toBe(true);
      expect(comparison.gate.transition).toBe('BLOCK -> APPROVE');

      // Findings check: 1 resolved, 0 introduced, 1 unchanged
      expect(comparison.findings.resolved).toHaveLength(1);
      expect(comparison.findings.resolved[0]?.id).toBe('f-1');
      expect(comparison.findings.introduced).toHaveLength(0);
      expect(comparison.findings.unchanged).toHaveLength(1);

      // Architecture drift check: 1 resolved drift
      expect(comparison.architecture.resolvedDrift).toHaveLength(1);
      expect(comparison.architecture.introducedDrift).toHaveLength(0);

      // Dependency check: zod added, express upgraded
      expect(comparison.dependencies.added).toHaveLength(1);
      expect(comparison.dependencies.added[0]?.name).toBe('zod');
      expect(comparison.dependencies.changed).toHaveLength(1);
      expect(comparison.dependencies.changed[0]?.name).toBe('express');
      expect(comparison.dependencies.changed[0]?.currentVersion).toBe('4.19.2');

      // Coverage delta check: +13.8% lines
      expect(comparison.coverage.delta?.lines.delta).toBe(13.8);
      expect(comparison.coverage.delta?.functions.delta).toBe(20.0);
      expect(comparison.coverage.delta?.branches.delta).toBe(15.0);
    });
  });
});
