import type { Finding } from '@qualityguard/domain';

export type DiffChangeType = 'added' | 'modified' | 'deleted' | 'renamed';

export interface DiffHunk {
  oldStart: number;
  oldLinesCount: number;
  newStart: number;
  newLinesCount: number;
  addedLines: number[];
  deletedLines: number[];
}

export interface DiffFileExtended {
  path: string;
  previousPath?: string | undefined;
  change: DiffChangeType;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
  patch: string;
}

export interface DiffPosition {
  path: string;
  line: number;
  side: 'RIGHT';
  start_line?: number | undefined;
  start_side?: 'RIGHT' | undefined;
}

export interface ReviewBodyOptions {
  score: number;
  decision: string;
  passed: boolean;
  reasons: string[];
  findingsCount: number;
  inlineCommentsCount: number;
  unmappedFindingsCount: number;
  categoryScores?: {
    architecture?: number | undefined;
    security?: number | undefined;
    testing?: number | null | undefined;
    dependencies?: number | undefined;
  } | undefined;
  aiInsight?: string | undefined;
}

const FILE_HEADER = /^diff --git a\/(.+) b\/(.+)$/;
const RENAME_FROM = /^rename from (.+)$/;
const RENAME_TO = /^rename to (.+)$/;
const NEW_FILE = /^new file mode /;
const DELETED_FILE = /^deleted file mode /;
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

export function parseUnifiedDiffExtended(diff: string): DiffFileExtended[] {
  const lines = diff.split(/\r?\n/);
  const files: DiffFileExtended[] = [];
  let current: DiffFileExtended | undefined;
  let currentHunk: DiffHunk | undefined;
  let currentNewLine = 0;
  let currentOldLine = 0;
  const patchLines: string[] = [];

  const flushHunk = () => {
    if (current && currentHunk) {
      current.hunks.push(currentHunk);
      currentHunk = undefined;
    }
  };

  const flushFile = () => {
    flushHunk();
    if (current) {
      current.patch = patchLines.join('\n').trimEnd();
      files.push(current);
      current = undefined;
      patchLines.length = 0;
    }
  };

  for (const line of lines) {
    const header = line.match(FILE_HEADER);
    if (header && header[1] && header[2]) {
      flushFile();
      current = {
        path: header[2],
        previousPath: header[1],
        change: 'modified',
        additions: 0,
        deletions: 0,
        hunks: [],
        patch: '',
      };
      continue;
    }

    if (!current) continue;

    if (NEW_FILE.test(line)) current.change = 'added';
    if (DELETED_FILE.test(line)) current.change = 'deleted';
    const renameFrom = line.match(RENAME_FROM);
    const renameTo = line.match(RENAME_TO);
    if (renameFrom?.[1]) current.previousPath = renameFrom[1];
    if (renameTo?.[1]) {
      current.path = renameTo[1];
      current.change = 'renamed';
    }

    const hunkMatch = line.match(HUNK_HEADER);
    if (hunkMatch) {
      flushHunk();
      const oldStart = Number(hunkMatch[1]);
      const oldLinesCount = hunkMatch[2] !== undefined ? Number(hunkMatch[2]) : 1;
      const newStart = Number(hunkMatch[3]);
      const newLinesCount = hunkMatch[4] !== undefined ? Number(hunkMatch[4]) : 1;

      currentHunk = {
        oldStart,
        oldLinesCount,
        newStart,
        newLinesCount,
        addedLines: [],
        deletedLines: [],
      };
      currentNewLine = newStart;
      currentOldLine = oldStart;
      patchLines.push(line);
      continue;
    }

    if (!currentHunk) continue;

    patchLines.push(line);
    if (line.startsWith('+') && !line.startsWith('+++')) {
      current.additions++;
      currentHunk.addedLines.push(currentNewLine);
      currentNewLine++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      current.deletions++;
      currentHunk.deletedLines.push(currentOldLine);
      currentOldLine++;
    } else if (!line.startsWith('\\')) {
      currentNewLine++;
      currentOldLine++;
    }
  }

  flushFile();
  return files;
}

export function mapFindingToDiffPosition(finding: Finding, diff: string): DiffPosition | null {
  if (!finding.file || typeof finding.line !== 'number' || finding.line <= 0) {
    return null;
  }

  const files = parseUnifiedDiffExtended(diff);
  const normalizedFilePath = finding.file.replace(/\\/g, '/').replace(/^\.\//, '');
  const targetFile = files.find(
    (f) => f.path.replace(/^\.\//, '') === normalizedFilePath && f.change !== 'deleted',
  );

  if (!targetFile || targetFile.hunks.length === 0) {
    return null;
  }

  const targetLine = finding.line;
  const startLine = finding.startLine;

  // Find the hunk containing the target line in new file lines
  const matchingHunk = targetFile.hunks.find((hunk) => {
    const hunkEnd = hunk.newStart + Math.max(0, hunk.newLinesCount - 1);
    return targetLine >= hunk.newStart && targetLine <= hunkEnd;
  });

  if (!matchingHunk) {
    return null;
  }

  // Check if target line is among modified/added lines or inside the hunk
  // In GitHub PR reviews, comment can only be attached to lines within the diff chunk
  const isLineInDiff = matchingHunk.addedLines.includes(targetLine) ||
    (targetLine >= matchingHunk.newStart && targetLine < matchingHunk.newStart + matchingHunk.newLinesCount);

  if (!isLineInDiff) {
    return null;
  }

  if (startLine && startLine > 0 && startLine < targetLine) {
    const isStartInHunk = startLine >= matchingHunk.newStart;
    if (isStartInHunk) {
      return {
        path: targetFile.path,
        line: targetLine,
        side: 'RIGHT',
        start_line: startLine,
        start_side: 'RIGHT',
      };
    }
  }

  return {
    path: targetFile.path,
    line: targetLine,
    side: 'RIGHT',
  };
}

export function formatInlineComment(finding: Finding): string {
  const severityBadge = finding.severity.toUpperCase();
  const categoryTitle = finding.category.charAt(0).toUpperCase() + finding.category.slice(1);

  const lines: string[] = [
    `### 🛡️ QualityGuard [${severityBadge}] — ${categoryTitle}`,
    '',
    `**${finding.title}**`,
    '',
    finding.description,
  ];

  if (finding.evidence && finding.evidence.length > 0) {
    lines.push('', '```typescript', finding.evidence.join('\n'), '```');
  }

  if (finding.suggestion) {
    lines.push('', `💡 **Recommendation:** ${finding.suggestion}`);
  }

  lines.push('');
  if (finding.source === 'deterministic' && finding.ruleId) {
    lines.push(`🔍 **Source:** Deterministic Rule (\`${finding.ruleId}\`)`);
  } else if (finding.source === 'ai') {
    const confidencePct = finding.confidence ? Math.round(finding.confidence * 100) : 80;
    lines.push(`🤖 **Source:** AI Quality Intelligence (Confidence: ${confidencePct}%)`);
  } else {
    lines.push(`🔍 **Source:** ${finding.source ?? 'QualityGuard Core'}`);
  }

  return lines.join('\n');
}

export function formatReviewBody(options: ReviewBodyOptions): string {
  const isApproved = options.decision === 'approve' && options.passed;
  const decisionBadge = isApproved ? '✅ **APPROVED**' : '❌ **BLOCKED**';

  const lines: string[] = [
    '## 🛡️ QualityGuard Governance Review',
    '',
    `| Metric | Value |`,
    `| :--- | :--- |`,
    `| **Quality Score** | **${options.score} / 100** |`,
    `| **Quality Gate Decision** | ${decisionBadge} |`,
    `| **Total Findings** | ${options.findingsCount} |`,
    `| **Inline Comments** | ${options.inlineCommentsCount} |`,
    '',
  ];

  if (options.categoryScores) {
    lines.push('### Category Scores Breakdown');
    if (options.categoryScores.architecture !== undefined) {
      lines.push(`- **Architecture:** ${options.categoryScores.architecture}/100`);
    }
    if (options.categoryScores.security !== undefined) {
      lines.push(`- **Security:** ${options.categoryScores.security}/100`);
    }
    if (options.categoryScores.dependencies !== undefined) {
      lines.push(`- **Dependencies:** ${options.categoryScores.dependencies}/100`);
    }
    lines.push('');
  }

  if (options.reasons.length > 0) {
    lines.push('### Quality Gate Status Reasons');
    for (const reason of options.reasons) {
      lines.push(`- ${reason}`);
    }
    lines.push('');
  }

  if (options.aiInsight) {
    lines.push('### 🤖 AI Quality Insight', options.aiInsight, '');
  }

  if (options.inlineCommentsCount > 0) {
    lines.push(`> 💬 **${options.inlineCommentsCount} inline comments posted** on high & critical findings.`);
  }

  if (options.unmappedFindingsCount > 0) {
    lines.push(`> ℹ️ **${options.unmappedFindingsCount} finding outside PR diff recorded in Check Run** summary.`);
  }

  return lines.join('\n');
}
