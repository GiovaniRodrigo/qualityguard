import { describe, it, expect } from 'vitest';
import type { Finding } from '@qualityguard/domain';
import {
  parseUnifiedDiffExtended,
  mapFindingToDiffPosition,
  formatInlineComment,
  formatReviewBody,
} from './diff-mapping.js';

const SAMPLE_UNIFIED_DIFF = `
diff --git a/src/auth.ts b/src/auth.ts
index 1234567..89abcdef 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -10,6 +10,12 @@ export function authenticateUser(token: string) {
   if (!token) return null;
+  // Hardcoded secret test
+  const apiKey = "sk-proj-1234567890abcdef1234567890abcdef";
+  const isSuperUser = token === apiKey;
+  if (isSuperUser) {
+    return { role: 'admin' };
+  }
   return verifyToken(token);
 }
diff --git a/src/new-feature.ts b/src/new-feature.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/new-feature.ts
@@ -0,0 +1,5 @@
+export function complexCalculation(a: number, b: number): number {
+  if (a > 0 && b > 0) {
+    return a + b;
+  }
+  return 0;
+}
diff --git a/src/deleted-file.ts b/src/deleted-file.ts
deleted file mode 100644
index 2222222..0000000
--- a/src/deleted-file.ts
+++ /dev/null
@@ -1,4 +0,0 @@
-export function oldFunction() {
-  return 'deprecated';
-}
`;

describe('Diff Parsing and Finding Mapping — QG-TDD-003', () => {
  describe('Unified Diff Parsing', () => {
    it('correctly parses added, modified, and deleted files with line ranges', () => {
      const parsed = parseUnifiedDiffExtended(SAMPLE_UNIFIED_DIFF);
      expect(parsed).toHaveLength(3);

      const modified = parsed.find((f) => f.path === 'src/auth.ts');
      expect(modified).toBeDefined();
      expect(modified?.change).toBe('modified');
      expect(modified?.hunks).toHaveLength(1);
      expect(modified?.hunks[0]?.newStart).toBe(10);
      expect(modified?.hunks[0]?.addedLines).toContain(12);
      expect(modified?.hunks[0]?.addedLines).toContain(13);

      const added = parsed.find((f) => f.path === 'src/new-feature.ts');
      expect(added).toBeDefined();
      expect(added?.change).toBe('added');
      expect(added?.hunks[0]?.newStart).toBe(1);
      expect(added?.hunks[0]?.newLinesCount).toBe(5);

      const deleted = parsed.find((f) => f.path === 'src/deleted-file.ts');
      expect(deleted).toBeDefined();
      expect(deleted?.change).toBe('deleted');
    });
  });

  describe('Finding to Diff Position Mapping', () => {
    it('maps a single-line finding on an added line to RIGHT diff position', () => {
      const finding: Finding = {
        id: 'SEC-SECRET-1',
        severity: 'critical',
        category: 'security',
        status: 'open',
        decision: 'block',
        file: 'src/auth.ts',
        line: 12,
        title: 'Hardcoded Secret Detected',
        description: 'Hardcoded API secret token found in source code.',
        evidence: ['const apiKey = "sk-proj-1234567890abcdef1234567890abcdef";'],
        suggestion: 'Move API secret to environment variables.',
        confidence: 0.99,
        source: 'deterministic',
        ruleId: 'security.hardcoded-secret',
      };

      const position = mapFindingToDiffPosition(finding, SAMPLE_UNIFIED_DIFF);
      expect(position).toEqual({
        path: 'src/auth.ts',
        line: 12,
        side: 'RIGHT',
      });
    });

    it('maps a multi-line finding spanning added lines with start_line and line', () => {
      const finding: Finding = {
        id: 'ARCH-COMPLEXITY-1',
        severity: 'high',
        category: 'maintainability',
        status: 'open',
        decision: 'review_required',
        file: 'src/new-feature.ts',
        line: 4,
        startLine: 1,
        endLine: 4,
        title: 'Complex Condition Block',
        description: 'Multi-branch decision logic needs simplification.',
        suggestion: 'Refactor into smaller pure functions.',
        confidence: 0.90,
        source: 'deterministic',
        ruleId: 'code.cyclomatic-complexity',
      };

      const position = mapFindingToDiffPosition(finding, SAMPLE_UNIFIED_DIFF);
      expect(position).toEqual({
        path: 'src/new-feature.ts',
        line: 4,
        side: 'RIGHT',
        start_line: 1,
        start_side: 'RIGHT',
      });
    });

    it('returns null when finding line is outside the diff hunks', () => {
      const finding: Finding = {
        id: 'SEC-1',
        severity: 'high',
        category: 'security',
        status: 'open',
        decision: 'review_required',
        file: 'src/auth.ts',
        line: 999, // Line 999 is not in the diff
        title: 'Vulnerability in unchanged code',
        description: '...',
        suggestion: 'Review legacy code',
        confidence: 0.8,
        source: 'deterministic',
      };

      const position = mapFindingToDiffPosition(finding, SAMPLE_UNIFIED_DIFF);
      expect(position).toBeNull();
    });

    it('returns null when finding is in a file not touched in the PR', () => {
      const finding: Finding = {
        id: 'SEC-2',
        severity: 'high',
        category: 'security',
        status: 'open',
        decision: 'review_required',
        file: 'src/untouched.ts',
        line: 10,
        title: 'Vulnerability in untouched file',
        description: '...',
        suggestion: 'Review untouched file',
        confidence: 0.8,
        source: 'deterministic',
      };

      const position = mapFindingToDiffPosition(finding, SAMPLE_UNIFIED_DIFF);
      expect(position).toBeNull();
    });

    it('returns null when finding is on a deleted file', () => {
      const finding: Finding = {
        id: 'SEC-3',
        severity: 'high',
        category: 'security',
        status: 'open',
        decision: 'review_required',
        file: 'src/deleted-file.ts',
        line: 2,
        title: 'Finding on deleted code',
        description: '...',
        suggestion: 'Clean up dead references',
        confidence: 0.8,
        source: 'deterministic',
      };

      const position = mapFindingToDiffPosition(finding, SAMPLE_UNIFIED_DIFF);
      expect(position).toBeNull();
    });
  });

  describe('Comment Formatting', () => {
    it('formats a clean, actionable markdown comment distinguishing deterministic vs AI rules', () => {
      const deterministicFinding: Finding = {
        id: 'SEC-SECRET-1',
        severity: 'critical',
        category: 'security',
        status: 'open',
        decision: 'block',
        file: 'src/auth.ts',
        line: 12,
        title: 'Hardcoded Secret Detected',
        description: 'API key detected in source code.',
        evidence: ['const apiKey = "sk-proj-1234...";'],
        suggestion: 'Store in process.env.API_KEY.',
        confidence: 0.99,
        source: 'deterministic',
        ruleId: 'security.hardcoded-secret',
      };

      const commentBody = formatInlineComment(deterministicFinding);
      expect(commentBody).toContain('### 🛡️ QualityGuard [CRITICAL] — Security');
      expect(commentBody).toContain('**Hardcoded Secret Detected**');
      expect(commentBody).toContain('API key detected in source code.');
      expect(commentBody).toContain('const apiKey = "sk-proj-1234...";');
      expect(commentBody).toContain('Store in process.env.API_KEY.');
      expect(commentBody).toContain('🔍 **Source:** Deterministic Rule (`security.hardcoded-secret`)');

      const aiFinding: Finding = {
        id: 'AI-PERF-1',
        severity: 'high',
        category: 'maintainability',
        status: 'open',
        decision: 'review_required',
        file: 'src/auth.ts',
        line: 14,
        title: 'Inefficient Token Parsing',
        description: 'Parsing token synchronously inside hot loop.',
        suggestion: 'Cache token verification result.',
        confidence: 0.85,
        source: 'ai',
      };

      const aiCommentBody = formatInlineComment(aiFinding);
      expect(aiCommentBody).toContain('🤖 **Source:** AI Quality Intelligence (Confidence: 85%)');
    });

    it('formats a comprehensive PR review summary body with gate decision and score', () => {
      const summary = formatReviewBody({
        score: 75,
        decision: 'block',
        passed: false,
        reasons: ['Quality score (75) is below required threshold of 80', '1 critical finding detected'],
        findingsCount: 3,
        inlineCommentsCount: 2,
        unmappedFindingsCount: 1,
        categoryScores: { architecture: 90, security: 50, testing: null, dependencies: 85 },
        aiInsight: 'Primary security risk detected in src/auth.ts.',
      });

      expect(summary).toContain('## 🛡️ QualityGuard Governance Review');
      expect(summary).toContain('**Quality Score** | **75 / 100**');
      expect(summary).toContain('**Quality Gate Decision** | ❌ **BLOCKED**');
      expect(summary).toContain('1 critical finding detected');
      expect(summary).toContain('Primary security risk detected in src/auth.ts.');
      expect(summary).toContain('2 inline comments posted');
      expect(summary).toContain('1 finding outside PR diff recorded in Check Run');
    });
  });
});
