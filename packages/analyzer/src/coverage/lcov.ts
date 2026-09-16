import type { CoverageMetrics, CoverageSummary, FileCoverage } from '@qualityguard/domain';
import { normalizeCoveragePath } from './normalize.js';

export class CoverageParseError extends Error {
  readonly code = 'COVERAGE_PARSE_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'CoverageParseError';
  }
}

export function calculateMetrics(covered: number, total: number): CoverageMetrics {
  const safeTotal = Math.max(0, Number.isFinite(total) ? Math.floor(total) : 0);
  const safeCovered = Math.min(safeTotal, Math.max(0, Number.isFinite(covered) ? Math.floor(covered) : 0));
  const missed = Math.max(0, safeTotal - safeCovered);
  const percentage = safeTotal > 0 ? Math.round((safeCovered / safeTotal) * 1000) / 10 : null;

  return {
    total: safeTotal,
    covered: safeCovered,
    missed,
    percentage,
  };
}

interface RawFileRecord {
  file: string;
  lines: Map<number, number>; // lineNr -> hitCount
  functions: Map<string, number>; // fnName -> hitCount
  branches: Map<string, number>; // branchKey -> hitCount
  lf?: number | undefined;
  lh?: number | undefined;
  fnf?: number | undefined;
  fnh?: number | undefined;
  brf?: number | undefined;
  brh?: number | undefined;
}

/**
 * Parses LCOV format text into structured CoverageSummary and per-file coverage.
 */
export function parseLcov(content: string): {
  summary: CoverageSummary;
  files: FileCoverage[];
  filesCount: number;
} {
  if (!content || typeof content !== 'string') {
    throw new CoverageParseError('LCOV content cannot be empty');
  }

  const lines = content.split(/\r?\n/);
  const fileRecords = new Map<string, RawFileRecord>();

  let current: RawFileRecord | null = null;
  let recordsFound = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('SF:')) {
      const rawPath = line.substring(3).trim();
      const normalized = normalizeCoveragePath(rawPath);
      if (normalized) {
        if (!fileRecords.has(normalized)) {
          fileRecords.set(normalized, {
            file: normalized,
            lines: new Map(),
            functions: new Map(),
            branches: new Map(),
          });
        }
        current = fileRecords.get(normalized)!;
      }
      continue;
    }

    if (!current) continue;

    // Line hit: DA:<line_number>,<execution_count>[,<checksum>]
    if (line.startsWith('DA:')) {
      const parts = line.substring(3).split(',');
      const lineNr = parseInt(parts[0]?.trim() ?? '', 10);
      const hits = parseInt(parts[1]?.trim() ?? '', 10);
      if (!Number.isNaN(lineNr) && !Number.isNaN(hits) && lineNr > 0) {
        const prevHits = current.lines.get(lineNr) ?? 0;
        current.lines.set(lineNr, prevHits + Math.max(0, hits));
      }
      continue;
    }

    // Lines found / hit: LF:<count> / LH:<count>
    if (line.startsWith('LF:')) {
      const lf = parseInt(line.substring(3).trim(), 10);
      if (!Number.isNaN(lf)) current.lf = (current.lf ?? 0) + lf;
      continue;
    }
    if (line.startsWith('LH:')) {
      const lh = parseInt(line.substring(3).trim(), 10);
      if (!Number.isNaN(lh)) current.lh = (current.lh ?? 0) + lh;
      continue;
    }

    // Function definition: FN:<line_number>,<function_name>
    if (line.startsWith('FN:')) {
      const commaIdx = line.indexOf(',');
      if (commaIdx !== -1) {
        const fnName = line.substring(commaIdx + 1).trim();
        if (fnName && !current.functions.has(fnName)) {
          current.functions.set(fnName, 0);
        }
      }
      continue;
    }

    // Function hit count: FNDA:<execution_count>,<function_name>
    if (line.startsWith('FNDA:')) {
      const commaIdx = line.indexOf(',');
      if (commaIdx !== -1) {
        const hits = parseInt(line.substring(5, commaIdx).trim(), 10);
        const fnName = line.substring(commaIdx + 1).trim();
        if (fnName && !Number.isNaN(hits)) {
          const prev = current.functions.get(fnName) ?? 0;
          current.functions.set(fnName, prev + Math.max(0, hits));
        }
      }
      continue;
    }

    // Functions found / hit: FNF:<count> / FNH:<count>
    if (line.startsWith('FNF:')) {
      const fnf = parseInt(line.substring(4).trim(), 10);
      if (!Number.isNaN(fnf)) current.fnf = (current.fnf ?? 0) + fnf;
      continue;
    }
    if (line.startsWith('FNH:')) {
      const fnh = parseInt(line.substring(4).trim(), 10);
      if (!Number.isNaN(fnh)) current.fnh = (current.fnh ?? 0) + fnh;
      continue;
    }

    // Branch coverage: BRDA:<line_number>,<block_number>,<branch_number>,<taken>
    if (line.startsWith('BRDA:')) {
      const parts = line.substring(5).split(',');
      if (parts.length >= 4) {
        const lineNr = parts[0]?.trim();
        const blockNr = parts[1]?.trim();
        const branchNr = parts[2]?.trim();
        const takenStr = parts[3]?.trim();
        const key = `${lineNr}:${blockNr}:${branchNr}`;
        const taken = takenStr === '-' || takenStr === '0' || Number.isNaN(parseInt(takenStr ?? '', 10))
          ? 0
          : parseInt(takenStr ?? '', 10);
        const prev = current.branches.get(key) ?? 0;
        current.branches.set(key, prev + Math.max(0, taken));
      }
      continue;
    }

    // Branches found / hit: BRF:<count> / BRH:<count>
    if (line.startsWith('BRF:')) {
      const brf = parseInt(line.substring(4).trim(), 10);
      if (!Number.isNaN(brf)) current.brf = (current.brf ?? 0) + brf;
      continue;
    }
    if (line.startsWith('BRH:')) {
      const brh = parseInt(line.substring(4).trim(), 10);
      if (!Number.isNaN(brh)) current.brh = (current.brh ?? 0) + brh;
      continue;
    }

    if (line === 'end_of_record') {
      recordsFound++;
      current = null;
    }
  }

  if (fileRecords.size === 0 && recordsFound === 0) {
    throw new CoverageParseError('No valid LCOV records found in artifact');
  }

  const resultFiles: FileCoverage[] = [];
  let totalLinesFound = 0;
  let totalLinesHit = 0;
  let totalFunctionsFound = 0;
  let totalFunctionsHit = 0;
  let totalBranchesFound = 0;
  let totalBranchesHit = 0;

  for (const record of fileRecords.values()) {
    // Determine line metrics
    let lf = record.lf ?? record.lines.size;
    let lh = record.lh ?? 0;
    if (record.lh === undefined) {
      for (const hits of record.lines.values()) {
        if (hits > 0) lh++;
      }
    }
    // Safeguard: if LF was explicit but 0 while lines map has items, prioritize map
    if (lf === 0 && record.lines.size > 0) {
      lf = record.lines.size;
    }

    // Determine function metrics
    let fnf = record.fnf ?? record.functions.size;
    let fnh = record.fnh ?? 0;
    if (record.fnh === undefined) {
      for (const hits of record.functions.values()) {
        if (hits > 0) fnh++;
      }
    }
    if (fnf === 0 && record.functions.size > 0) {
      fnf = record.functions.size;
    }

    // Determine branch metrics
    let brf = record.brf ?? record.branches.size;
    let brh = record.brh ?? 0;
    if (record.brh === undefined) {
      for (const hits of record.branches.values()) {
        if (hits > 0) brh++;
      }
    }
    if (brf === 0 && record.branches.size > 0) {
      brf = record.branches.size;
    }

    const lineMetrics = calculateMetrics(lh, lf);
    const fnMetrics = calculateMetrics(fnh, fnf);
    const branchMetrics = calculateMetrics(brh, brf);

    totalLinesFound += lineMetrics.total;
    totalLinesHit += lineMetrics.covered;
    totalFunctionsFound += fnMetrics.total;
    totalFunctionsHit += fnMetrics.covered;
    totalBranchesFound += branchMetrics.total;
    totalBranchesHit += branchMetrics.covered;

    resultFiles.push({
      file: record.file,
      lines: lineMetrics,
      functions: fnMetrics,
      branches: branchMetrics,
    });
  }

  const summary: CoverageSummary = {
    lines: calculateMetrics(totalLinesHit, totalLinesFound),
    functions: calculateMetrics(totalFunctionsHit, totalFunctionsFound),
    branches: calculateMetrics(totalBranchesHit, totalBranchesFound),
  };

  return {
    summary,
    files: resultFiles.sort((a, b) => a.file.localeCompare(b.file)),
    filesCount: resultFiles.length,
  };
}
