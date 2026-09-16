import type { CoverageFormat, CoverageSummary, FileCoverage } from '@qualityguard/domain';
import { CoverageParseError, parseLcov } from './lcov.js';
import { parseJacocoXml } from './jacoco.js';

export * from './normalize.js';
export * from './lcov.js';
export * from './jacoco.js';

/**
 * Detects whether the provided coverage artifact is JaCoCo XML or LCOV text.
 */
export function detectCoverageFormat(content: string): CoverageFormat {
  if (!content || typeof content !== 'string') {
    throw new CoverageParseError('Coverage content cannot be empty');
  }

  const trimmed = content.trim();

  // XML checks: starts with <?xml or contains <report
  if (trimmed.startsWith('<?xml') || trimmed.startsWith('<report') || /<report[\s>]/i.test(trimmed)) {
    return 'jacoco';
  }

  // LCOV checks: contains SF: or TN: or end_of_record
  if (/^TN:/m.test(trimmed) || /^SF:/m.test(trimmed) || /end_of_record/m.test(trimmed)) {
    return 'lcov';
  }

  throw new CoverageParseError(
    'Unrecognized coverage format. Expected valid LCOV (SF:/end_of_record) or JaCoCo XML (<report>).',
  );
}

/**
 * Unified parser for test coverage artifacts (LCOV or JaCoCo XML).
 */
export function parseCoverage(
  content: string,
  formatHint?: CoverageFormat,
): {
  format: CoverageFormat;
  summary: CoverageSummary;
  files: FileCoverage[];
  filesCount: number;
} {
  const format = formatHint ?? detectCoverageFormat(content);

  if (format === 'jacoco') {
    const result = parseJacocoXml(content);
    return { format: 'jacoco', ...result };
  }

  if (format === 'lcov') {
    const result = parseLcov(content);
    return { format: 'lcov', ...result };
  }

  throw new CoverageParseError(`Unsupported coverage format: ${format}`);
}
