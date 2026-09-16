import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import type { Finding, Review, Project } from '@/lib/api/types';
import {
  buildGitHubFileUrl,
  getSeverityRank,
  sortFindingsByPriority,
  FindingsSummary,
  FindingsTopPriorities,
  FindingsFilterBar,
  FindingItem,
  FindingDetailDrawer,
  FindingRemediationPanel,
  FindingsEmptyState,
  FindingsCommandCenter,
} from './index';


// Realistic Test Fixtures representing real domain records
const mockFindings: Finding[] = [
  {
    id: 'f-1',
    severity: 'critical',
    category: 'security',
    status: 'open',
    decision: 'block',
    file: 'src/api/auth.ts',
    line: 42,
    title: 'Hardcoded JWT Secret',
    description: 'A hardcoded secret string is used for signing authentication tokens.',
    suggestion: 'Load JWT_SECRET from environment variables.',
    confidence: 0.98,
    source: 'deterministic',
    ruleId: 'security/hardcoded-secret',
    evidence: ['const secret = "super-secret-key-123";'],
  },
  {
    id: 'f-2',
    severity: 'high',
    category: 'architecture',
    status: 'open',
    decision: 'review_required',
    file: 'src/services/order.ts',
    line: 88,
    title: 'Circular Module Dependency Detected',
    description: 'Module order.ts creates an architectural cycle with payment.ts.',
    suggestion: 'Extract shared types to a common module.',
    confidence: 1.0,
    source: 'deterministic',
    ruleId: 'architecture/circular-dependency',
    evidence: ['import { processPayment } from "./payment";'],
  },
  {
    id: 'f-3',
    severity: 'medium',
    category: 'maintainability',
    status: 'open',
    decision: 'review_required',
    file: 'src/utils/parser.ts',
    line: 120,
    title: 'High Cognitive Complexity',
    description: 'Function parseInput exceeds cognitive complexity threshold of 15.',
    suggestion: 'Refactor nested branching into smaller helper functions.',
    confidence: 0.9,
    source: 'deterministic',
    ruleId: 'complexity/excessive-nesting',
  },
  {
    id: 'f-4',
    severity: 'low',
    category: 'clean_code',
    status: 'open',
    decision: 'approve',
    file: 'src/models/user.ts',
    line: 15,
    title: 'Unused Private Property',
    description: 'Field _cachedHash is declared but never read.',
    suggestion: 'Remove unused property to improve readability.',
    confidence: 0.85,
    source: 'deterministic',
    ruleId: 'clean_code/no-unused-vars',
  },
];

const mockReview: Review = {
  id: 'rev-101',
  projectId: 'proj-001',
  organizationId: 'org-001',
  repository: 'https://github.com/akitaonrails/ai-memory.git',
  branch: 'release/2.2',
  commitSha: 'c9a2e3f890123456789abcdef0123456789abcde',
  score: 68,
  decision: 'review_required',
  findings: mockFindings,
  analyzedFiles: 42,
  gate: {
    passed: false,
    reasons: ['2 critical/high blocking finding(s)', 'score 68 is below minimum 80'],
    decision: 'block',
  },
  aiInsight: 'Primary risks relate to authentication token security and architectural cycle coupling.',
  status: 'COMPLETED',
  createdAt: '2026-09-15T03:30:00.000Z',
};

const mockProject: Project = {
  id: 'proj-001',
  organizationId: 'org-001',
  name: 'ai-memory',
  repository: 'https://github.com/akitaonrails/ai-memory.git',
  branch: 'release/2.2',
  createdAt: '2026-09-15T00:00:00.000Z',
};

describe('Findings Command Center — QG-UX-001 Test Suite', () => {
  describe('1. GitHub URL Deep-Linking (buildGitHubFileUrl)', () => {
    it('constructs deterministic GitHub file URL with commit SHA and line', () => {
      const url = buildGitHubFileUrl(
        'https://github.com/akitaonrails/ai-memory.git',
        'c9a2e3f890123456789abcdef0123456789abcde',
        'src/api/auth.ts',
        42,
      );
      expect(url).toBe(
        'https://github.com/akitaonrails/ai-memory/blob/c9a2e3f890123456789abcdef0123456789abcde/src/api/auth.ts#L42',
      );
    });

    it('handles SSH-style git URL format', () => {
      const url = buildGitHubFileUrl(
        'git@github.com:GiovaniRodrigo/qualityguard.git',
        'main',
        'apps/api/src/server.ts',
        140,
      );
      expect(url).toBe(
        'https://github.com/GiovaniRodrigo/qualityguard/blob/main/apps/api/src/server.ts#L140',
      );
    });

    it('omits line anchor if line is not provided', () => {
      const url = buildGitHubFileUrl(
        'https://github.com/owner/repo',
        'v1.0.0',
        'README.md',
        null,
      );
      expect(url).toBe('https://github.com/owner/repo/blob/v1.0.0/README.md');
    });

    it('returns null for non-GitHub repositories or missing file', () => {
      expect(buildGitHubFileUrl('https://gitlab.com/owner/repo.git', 'main', 'file.ts', 10)).toBeNull();
      expect(buildGitHubFileUrl('https://github.com/owner/repo', 'main', null, 10)).toBeNull();
      expect(buildGitHubFileUrl(null, 'main', 'file.ts', 10)).toBeNull();
    });
  });

  describe('2. Deterministic Priority Sorting (sortFindingsByPriority)', () => {
    it('sorts findings by severity rank: critical > high > medium > low', () => {
      const sorted = sortFindingsByPriority(mockFindings);
      expect(sorted[0].severity).toBe('critical');
      expect(sorted[1].severity).toBe('high');
      expect(sorted[2].severity).toBe('medium');
      expect(sorted[3].severity).toBe('low');
    });

    it('prioritizes security category within same severity level', () => {
      const sameSeverity: Finding[] = [
        { ...mockFindings[2], id: 'f-a', category: 'maintainability', severity: 'high', file: 'b.ts' },
        { ...mockFindings[2], id: 'f-b', category: 'security', severity: 'high', file: 'a.ts' },
      ];
      const sorted = sortFindingsByPriority(sameSeverity);
      expect(sorted[0].id).toBe('f-b');
      expect(sorted[0].category).toBe('security');
    });
  });

  describe('3. FindingsSummary & Quality Gate Card', () => {
    it('renders quality score, grade, and severity counts accurately', () => {
      const html = renderToString(
        <FindingsSummary review={mockReview} findings={mockFindings} activeSeverityFilter="all" />,
      );
      expect(html).toContain('68');
      expect(html).toContain('/ 100');
      expect(html).toContain('Critical');
      expect(html).toContain('High');
      expect(html).toContain('Medium');
      expect(html).toContain('Low');
      expect(html).toContain('Quality Gate');
      expect(html).toContain('FAILED');
      expect(html).toContain('2 critical/high blocking finding(s)');
      expect(html).toContain('Primary risks relate to authentication token security');
    });

    it('renders Quality Gate PASSED when review satisfies threshold', () => {
      const passedReview: Review = {
        ...mockReview,
        score: 95,
        gate: { passed: true, reasons: [], decision: 'approve' },
      };
      const html = renderToString(
        <FindingsSummary review={passedReview} findings={[]} activeSeverityFilter="all" />,
      );
      expect(html).toContain('95');
      expect(html).toContain('PASSED');
      expect(html).toContain('Gate Passed');
    });
  });

  describe('4. FindingsTopPriorities Component', () => {
    it('renders top prioritized findings with badges, ruleId, and file location', () => {
      const html = renderToString(
        <FindingsTopPriorities findings={mockFindings} onSelectFinding={() => {}} />,
      );
      expect(html).toContain('Top priorities');
      expect(html).toContain('Hardcoded JWT Secret');
      expect(html).toContain('Circular Module Dependency Detected');
      expect(html).toContain('security/hardcoded-secret');
      expect(html).toContain('architecture/circular-dependency');
      expect(html).toContain('src/api/auth.ts:42');
    });

    it('returns null when findings list is empty', () => {
      const html = renderToString(
        <FindingsTopPriorities findings={[]} onSelectFinding={() => {}} />,
      );
      expect(html).toBe('');
    });
  });

  describe('5. FindingsFilterBar Component', () => {
    it('renders search input, severity filters, categories, and counter', () => {
      const html = renderToString(
        <FindingsFilterBar
          search="jwt"
          onSearchChange={() => {}}
          severityFilter="critical"
          onSeverityChange={() => {}}
          categoryFilter="all"
          onCategoryChange={() => {}}
          ruleFilter="all"
          onRuleChange={() => {}}
          fileFilter="all"
          onFileChange={() => {}}
          groupBy="none"
          onGroupByChange={() => {}}
          availableCategories={['security', 'architecture', 'maintainability']}
          availableRules={['security/hardcoded-secret', 'architecture/circular-dependency']}
          availableFiles={['src/api/auth.ts', 'src/services/order.ts']}
          totalCount={4}
          filteredCount={1}
          onResetFilters={() => {}}
        />
      );
      expect(html).toContain('Search by rule, message, file, or category...');
      expect(html).toContain('1</strong> findings');
      expect(html).toContain('(filtered from 4)');
      expect(html).toContain('Reset filters');
      expect(html).toContain('value="security"');
      expect(html).toContain('security/hardcoded-secret');
    });
  });

  describe('6. FindingItem Component', () => {
    it('renders finding item with severity badge, ruleId, title, and GitHub link', () => {
      const html = renderToString(
        <FindingItem
          finding={mockFindings[0]}
          review={mockReview}
          onOpenDetail={() => {}}
          defaultExpanded={true}
        />
      );
      expect(html).toContain('CRITICAL');
      expect(html).toContain('security/hardcoded-secret');
      expect(html).toContain('Hardcoded JWT Secret');
      expect(html).toContain('src/api/auth.ts');
      expect(html).toContain('Open in GitHub');
      expect(html).toContain('const secret = &quot;super-secret-key-123&quot;;');
      expect(html).toContain('Load JWT_SECRET from environment variables.');
    });
  });

  describe('7. FindingDetailDrawer Component', () => {
    it('renders complete finding detail drawer with technical evidence and metadata', () => {
      const html = renderToString(
        <FindingDetailDrawer
          finding={mockFindings[0]}
          review={mockReview}
          onClose={() => {}}
        />
      );
      expect(html).toContain('Finding Overview &amp; Impact');
      expect(html).toContain('Actionable Remediation');
      expect(html).toContain('Technical AST Evidence');
      expect(html).toContain('Deterministic AST Rule Engine');
      expect(html).toContain('Open in GitHub');
      expect(html).toContain('Copy Finding JSON');
    });

    it('returns null when no finding is selected', () => {
      const html = renderToString(
        <FindingDetailDrawer finding={null} review={mockReview} onClose={() => {}} />,
      );
      expect(html).toBe('');
    });
  });

  describe('8. FindingsEmptyState Component', () => {
    it('renders no-analysis empty state with action button', () => {
      const html = renderToString(
        <FindingsEmptyState type="no-analysis" onRunAnalysis={() => {}} />,
      );
      expect(html).toContain('No analysis yet');
      expect(html).toContain('Run analysis now');
    });

    it('renders analysis-running state with live progress message', () => {
      const html = renderToString(
        <FindingsEmptyState type="analysis-running" analysisStatus="Cloning repository..." />,
      );
      expect(html).toContain('Analysis in progress');
      expect(html).toContain('Cloning repository...');
    });

    it('renders no-findings state', () => {
      const html = renderToString(<FindingsEmptyState type="no-findings" />);
      expect(html).toContain('Great — no findings detected');
    });

    it('renders no-filtered-results state with reset action', () => {
      const html = renderToString(
        <FindingsEmptyState type="no-filtered-results" onResetFilters={() => {}} />,
      );
      expect(html).toContain('No findings match active filters');
      expect(html).toContain('Reset all filters');
    });

    it('renders api-error state with retry button', () => {
      const html = renderToString(
        <FindingsEmptyState type="api-error" errorMessage="Network connection lost" onRetry={() => {}} />,
      );
      expect(html).toContain('Unable to load findings');
      expect(html).toContain('Network connection lost');
      expect(html).toContain('Retry request');
    });

    it('renders auth-error state with sign in button', () => {
      const html = renderToString(
        <FindingsEmptyState type="auth-error" onSignIn={() => {}} />,
      );
      expect(html).toContain('Your session has expired');
      expect(html).toContain('Sign in');
    });
  });

  describe('9. FindingsCommandCenter Master Container', () => {
    it('renders full command center header, summary, priorities, filters, and list', () => {
      const html = renderToString(
        <FindingsCommandCenter
          project={mockProject}
          review={mockReview}
          isAnalyzing={false}
          analysisStatus={null}
          onRunAnalysis={() => {}}
          onViewArchitecture={() => {}}
          onViewHistory={() => {}}
        />
      );
      expect(html).toContain('Quality Review');
      expect(html).toContain('ai-memory');
      expect(html).toContain('Run analysis');
      expect(html).toContain('View architecture');
      expect(html).toContain('View history');
      expect(html).toContain('Quality Score');
      expect(html).toContain('Quality Gate');
      expect(html).toContain('Top priorities');
      expect(html).toContain('Hardcoded JWT Secret');
    });

    it('renders analysis-running state when isAnalyzing is true', () => {
      const html = renderToString(
        <FindingsCommandCenter
          project={mockProject}
          review={mockReview}
          isAnalyzing={true}
          analysisStatus="Parsing AST nodes..."
          onRunAnalysis={() => {}}
        />
      );
      expect(html).toContain('Analysis in progress');
      expect(html).toContain('Parsing AST nodes...');
    });
  });

  describe('10. FindingRemediationPanel', () => {
    it('renders initial idle state with Ask AI for Fix button', () => {
      const html = renderToString(
        <FindingRemediationPanel
          finding={mockFindings[0]!}
          review={mockReview}
        />
      );
      expect(html).toContain('AI Remediation Assistant');
      expect(html).toContain('Ask AI for Fix');
      expect(html).toContain('Get automated guidance for this finding');
    });

    it('renders within FindingDetailDrawer', () => {
      const html = renderToString(
        <FindingDetailDrawer
          finding={mockFindings[0]!}
          review={mockReview}
          onClose={() => {}}
        />
      );
      expect(html).toContain('AI Remediation Assistant');
      expect(html).toContain('Ask AI for Fix');
    });
  });
});


