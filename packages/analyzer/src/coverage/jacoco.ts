import type { CoverageMetrics, CoverageSummary, FileCoverage } from '@qualityguard/domain';
import { calculateMetrics, CoverageParseError } from './lcov.js';
import { normalizeCoveragePath } from './normalize.js';

interface CounterData {
  missed: number;
  covered: number;
}

/**
 * Validates XML for XXE / DTD injection attempts before processing.
 */
export function validateXmlSafety(xml: string): void {
  // Reject entity declarations (XXE)
  if (/<!ENTITY/i.test(xml)) {
    throw new CoverageParseError('XML contains disallowed DOCTYPE/ENTITY declarations (XXE protection)');
  }
  // Reject external system identifiers with protocols or file references (e.g. SYSTEM "file://..." or SYSTEM "http://...")
  if (/<!DOCTYPE[^>]*SYSTEM\s+["'](file|http|https|ftp|data|javascript):/i.test(xml)) {
    throw new CoverageParseError('XML contains disallowed external DTD reference (XXE protection)');
  }
}

function parseCounters(xmlFragment: string): {
  lines?: CounterData | undefined;
  methods?: CounterData | undefined;
  branches?: CounterData | undefined;
} {
  const result: { lines?: CounterData; methods?: CounterData; branches?: CounterData } = {};
  const counterRegex = /<counter\s+([^>]+)\/>/gi;
  let match: RegExpExecArray | null;

  while ((match = counterRegex.exec(xmlFragment)) !== null) {
    const attrs = match[1];
    if (!attrs) continue;

    const typeMatch = attrs.match(/type="([^"]+)"/i);
    const missedMatch = attrs.match(/missed="([^"]+)"/i);
    const coveredMatch = attrs.match(/covered="([^"]+)"/i);

    if (typeMatch && missedMatch && coveredMatch) {
      const type = typeMatch[1]?.toUpperCase();
      const missed = parseInt(missedMatch[1] ?? '0', 10);
      const covered = parseInt(coveredMatch[1] ?? '0', 10);

      if (!Number.isNaN(missed) && !Number.isNaN(covered)) {
        const data: CounterData = { missed, covered };
        if (type === 'LINE') result.lines = data;
        else if (type === 'METHOD') result.methods = data;
        else if (type === 'BRANCH') result.branches = data;
      }
    }
  }

  return result;
}

/**
 * Parses JaCoCo XML format into structured CoverageSummary and per-file coverage.
 */
export function parseJacocoXml(content: string): {
  summary: CoverageSummary;
  files: FileCoverage[];
  filesCount: number;
} {
  if (!content || typeof content !== 'string') {
    throw new CoverageParseError('JaCoCo XML content cannot be empty');
  }

  // 1. XXE Security Check
  validateXmlSafety(content);

  // 2. Validate Root Tag
  if (!/<report[\s>]/i.test(content)) {
    throw new CoverageParseError('Invalid JaCoCo XML: missing <report> root tag');
  }

  const filesMap = new Map<string, FileCoverage>();

  // 3. Extract Packages: <package name="...">...</package>
  const packageRegex = /<package\s+name="([^"]*)"[^>]*>([\s\S]*?)<\/package>/gi;
  let pkgMatch: RegExpExecArray | null;

  while ((pkgMatch = packageRegex.exec(content)) !== null) {
    const pkgName = pkgMatch[1] ?? '';
    const pkgBody = pkgMatch[2] ?? '';

    // Extract sourcefiles within package: <sourcefile name="...">...</sourcefile>
    const sourcefileRegex = /<sourcefile\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/sourcefile>/gi;
    let sfMatch: RegExpExecArray | null;

    while ((sfMatch = sourcefileRegex.exec(pkgBody)) !== null) {
      const fileName = sfMatch[1] ?? '';
      const sfBody = sfMatch[2] ?? '';

      const relativePath = pkgName ? `${pkgName}/${fileName}` : fileName;
      const normalizedPath = normalizeCoveragePath(relativePath);
      if (!normalizedPath) continue;

      const counters = parseCounters(sfBody);

      // If counters are missing from sourcefile, check lines <line nr="..." mi="..." ci="..." mb="..." cb="..."/>
      let lineCovered = counters.lines?.covered ?? 0;
      let lineMissed = counters.lines?.missed ?? 0;
      let branchCovered = counters.branches?.covered ?? 0;
      let branchMissed = counters.branches?.missed ?? 0;

      if (!counters.lines) {
        const lineRegex = /<line\s+([^>]+)\/>/gi;
        let lMatch: RegExpExecArray | null;
        let cLines = 0;
        let mLines = 0;
        let cBranches = 0;
        let mBranches = 0;

        while ((lMatch = lineRegex.exec(sfBody)) !== null) {
          const lAttrs = lMatch[1];
          if (!lAttrs) continue;
          const ci = parseInt(lAttrs.match(/ci="([^"]+)"/i)?.[1] ?? '0', 10);
          const mi = parseInt(lAttrs.match(/mi="([^"]+)"/i)?.[1] ?? '0', 10);
          const cb = parseInt(lAttrs.match(/cb="([^"]+)"/i)?.[1] ?? '0', 10);
          const mb = parseInt(lAttrs.match(/mb="([^"]+)"/i)?.[1] ?? '0', 10);

          if (ci > 0) cLines++;
          else if (mi > 0) mLines++;

          if (!Number.isNaN(cb)) cBranches += cb;
          if (!Number.isNaN(mb)) mBranches += mb;
        }

        if (cLines > 0 || mLines > 0) {
          lineCovered = cLines;
          lineMissed = mLines;
        }
        if (!counters.branches && (cBranches > 0 || mBranches > 0)) {
          branchCovered = cBranches;
          branchMissed = mBranches;
        }
      }

      const methodCovered = counters.methods?.covered ?? 0;
      const methodMissed = counters.methods?.missed ?? 0;

      const lineMetrics = calculateMetrics(lineCovered, lineCovered + lineMissed);
      const funcMetrics = calculateMetrics(methodCovered, methodCovered + methodMissed);
      const branchMetrics = calculateMetrics(branchCovered, branchCovered + branchMissed);

      if (filesMap.has(normalizedPath)) {
        const existing = filesMap.get(normalizedPath)!;
        const mergedLines = calculateMetrics(
          existing.lines.covered + lineMetrics.covered,
          existing.lines.total + lineMetrics.total,
        );
        const mergedFuncs = calculateMetrics(
          (existing.functions?.covered ?? 0) + (funcMetrics.covered ?? 0),
          (existing.functions?.total ?? 0) + (funcMetrics.total ?? 0),
        );
        const mergedBranches = calculateMetrics(
          (existing.branches?.covered ?? 0) + (branchMetrics.covered ?? 0),
          (existing.branches?.total ?? 0) + (branchMetrics.total ?? 0),
        );

        filesMap.set(normalizedPath, {
          file: normalizedPath,
          lines: mergedLines,
          functions: mergedFuncs,
          branches: mergedBranches,
        });
      } else {
        filesMap.set(normalizedPath, {
          file: normalizedPath,
          lines: lineMetrics,
          functions: funcMetrics,
          branches: branchMetrics,
        });
      }
    }
  }

  // Check for root counters: <report ...> <counter .../> </report>
  // Root counters are located directly before </report>
  const rootCountersSection = content.replace(/<package[\s\S]*?<\/package>/gi, '');
  const rootCounters = parseCounters(rootCountersSection);

  let summary: CoverageSummary;

  if (rootCounters.lines || rootCounters.methods || rootCounters.branches) {
    summary = {
      lines: calculateMetrics(
        rootCounters.lines?.covered ?? 0,
        (rootCounters.lines?.covered ?? 0) + (rootCounters.lines?.missed ?? 0),
      ),
      functions: calculateMetrics(
        rootCounters.methods?.covered ?? 0,
        (rootCounters.methods?.covered ?? 0) + (rootCounters.methods?.missed ?? 0),
      ),
      branches: calculateMetrics(
        rootCounters.branches?.covered ?? 0,
        (rootCounters.branches?.covered ?? 0) + (rootCounters.branches?.missed ?? 0),
      ),
    };
  } else {
    // Sum from file counters
    let totalLinesCovered = 0;
    let totalLinesFound = 0;
    let totalFuncsCovered = 0;
    let totalFuncsFound = 0;
    let totalBranchesCovered = 0;
    let totalBranchesFound = 0;

    for (const f of filesMap.values()) {
      totalLinesCovered += f.lines.covered;
      totalLinesFound += f.lines.total;
      totalFuncsCovered += f.functions?.covered ?? 0;
      totalFuncsFound += f.functions?.total ?? 0;
      totalBranchesCovered += f.branches?.covered ?? 0;
      totalBranchesFound += f.branches?.total ?? 0;
    }

    summary = {
      lines: calculateMetrics(totalLinesCovered, totalLinesFound),
      functions: calculateMetrics(totalFuncsCovered, totalFuncsFound),
      branches: calculateMetrics(totalBranchesCovered, totalBranchesFound),
    };
  }

  const fileList = Array.from(filesMap.values()).sort((a, b) => a.file.localeCompare(b.file));

  return {
    summary,
    files: fileList,
    filesCount: fileList.length,
  };
}
