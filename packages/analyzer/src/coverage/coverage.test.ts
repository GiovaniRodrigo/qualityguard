import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  normalizeCoveragePath,
  parseLcov,
  parseJacocoXml,
  detectCoverageFormat,
  parseCoverage,
  CoverageParseError,
  calculateMetrics,
} from './index.js';

const fixturesDir = join(process.cwd(), '..', '..', 'fixtures', 'coverage');

describe('Coverage Ingestion Engine — QG-TDD-007', () => {
  describe('Path Normalization', () => {
    it('normalizes standard posix and windows paths', () => {
      expect(normalizeCoveragePath('src/utils/math.ts')).toBe('src/utils/math.ts');
      expect(normalizeCoveragePath('src\\utils\\math.ts')).toBe('src/utils/math.ts');
      expect(normalizeCoveragePath('.\\src\\index.ts')).toBe('src/index.ts');
      expect(normalizeCoveragePath('./src/index.ts')).toBe('src/index.ts');
    });

    it('strips drive letters and workspace/CI prefixes', () => {
      expect(normalizeCoveragePath('C:\\workspace\\project\\src\\app.ts')).toBe('project/src/app.ts');
      expect(normalizeCoveragePath('/workspace/apps/api/src/server.ts')).toBe('apps/api/src/server.ts');
      expect(normalizeCoveragePath('/home/runner/work/qualityguard/qualityguard/packages/domain/src/index.ts')).toBe(
        'packages/domain/src/index.ts',
      );
    });

    it('resolves redundant segments safely', () => {
      expect(normalizeCoveragePath('src/components/../utils/helper.ts')).toBe('src/utils/helper.ts');
      expect(normalizeCoveragePath('///apps//web///page.tsx')).toBe('apps/web/page.tsx');
    });
  });

  describe('calculateMetrics', () => {
    it('computes coverage percentage accurately', () => {
      const m = calculateMetrics(8, 10);
      expect(m.total).toBe(10);
      expect(m.covered).toBe(8);
      expect(m.missed).toBe(2);
      expect(m.percentage).toBe(80);
    });

    it('handles zero denominator without returning NaN', () => {
      const m = calculateMetrics(0, 0);
      expect(m.total).toBe(0);
      expect(m.covered).toBe(0);
      expect(m.missed).toBe(0);
      expect(m.percentage).toBeNull();
      expect(Number.isNaN(m.percentage)).toBe(false);
    });
  });

  describe('LCOV Parser', () => {
    it('parses sample LCOV fixture correctly', () => {
      const raw = readFileSync(join(fixturesDir, 'sample.lcov'), 'utf-8');
      const result = parseLcov(raw);

      expect(result.filesCount).toBe(2);
      expect(result.files.map((f) => f.file)).toEqual(['src/index.ts', 'src/utils/math.ts']);

      // src/index.ts: lines: 3/6 (50%), functions: 1/2 (50%), branches: 1/2 (50%)
      const file1 = result.files.find((f) => f.file === 'src/index.ts')!;
      expect(file1.lines.total).toBe(6);
      expect(file1.lines.covered).toBe(3);
      expect(file1.lines.percentage).toBe(50);
      expect(file1.functions?.total).toBe(2);
      expect(file1.functions?.covered).toBe(1);
      expect(file1.branches?.total).toBe(2);
      expect(file1.branches?.covered).toBe(1);

      // Total summary:
      // Lines: (3 + 4) / (6 + 4) = 7/10 = 70.0%
      // Functions: (1 + 2) / (2 + 2) = 3/4 = 75.0%
      // Branches: 1 / 2 = 50.0%
      expect(result.summary.lines.percentage).toBe(70);
      expect(result.summary.functions.percentage).toBe(75);
      expect(result.summary.branches.percentage).toBe(50);
    });

    it('supports CRLF line endings', () => {
      const raw = readFileSync(join(fixturesDir, 'sample.lcov'), 'utf-8');
      const crlf = raw.replace(/\n/g, '\r\n');
      const result = parseLcov(crlf);
      expect(result.filesCount).toBe(2);
      expect(result.summary.lines.percentage).toBe(70);
    });

    it('merges duplicate SF records for same source file', () => {
      const duplicateLcov = `
SF:src/service.ts
FN:1,testA
FNDA:1,testA
FNF:1
FNH:1
DA:1,1
DA:2,1
DA:3,0
LF:3
LH:2
end_of_record
SF:src/service.ts
FN:10,testB
FNDA:1,testB
FNF:1
FNH:1
DA:3,1
DA:4,1
LF:2
LH:2
end_of_record
`;
      const result = parseLcov(duplicateLcov);
      expect(result.filesCount).toBe(1);
      const f = result.files[0]!;
      expect(f.file).toBe('src/service.ts');
      // Merged lines 1(1), 2(1), 3(1), 4(1) -> 4/4 lines hit = 100%
      expect(f.lines.total).toBe(5); // LF (3+2) = 5
      expect(f.functions?.covered).toBe(2);
    });

    it('handles zero denominator gracefully without crashing or returning NaN', () => {
      const raw = readFileSync(join(fixturesDir, 'zero-denominator.lcov'), 'utf-8');
      const result = parseLcov(raw);
      expect(result.filesCount).toBe(1);
      expect(result.summary.lines.percentage).toBeNull();
      expect(result.summary.functions.percentage).toBeNull();
      expect(result.summary.branches.percentage).toBeNull();
    });

    it('parses monorepo multi-package fixture', () => {
      const raw = readFileSync(join(fixturesDir, 'monorepo.lcov'), 'utf-8');
      const result = parseLcov(raw);
      expect(result.filesCount).toBe(3);
      expect(result.files.map((f) => f.file)).toEqual([
        'apps/api/src/server.ts',
        'apps/web/app/page.tsx',
        'packages/domain/src/finding.ts',
      ]);
      // Lines: 3/3 + 2/3 + 2/2 = 7/8 = 87.5%
      expect(result.summary.lines.percentage).toBe(87.5);
    });

    it('throws CoverageParseError on malformed or empty LCOV', () => {
      expect(() => parseLcov('')).toThrow(CoverageParseError);
      expect(() => parseLcov('just some random lines with no lcov records')).toThrow(CoverageParseError);
    });
  });

  describe('JaCoCo XML Parser', () => {
    it('parses sample JaCoCo fixture correctly', () => {
      const raw = readFileSync(join(fixturesDir, 'jacoco.xml'), 'utf-8');
      const result = parseJacocoXml(raw);

      expect(result.filesCount).toBe(1);
      expect(result.files[0]?.file).toBe('com/qualityguard/service/UserService.java');

      // Lines: covered 4, missed 1 -> 4/5 = 80.0%
      expect(result.summary.lines.total).toBe(5);
      expect(result.summary.lines.covered).toBe(4);
      expect(result.summary.lines.percentage).toBe(80);

      // Methods: covered 1, missed 0 -> 1/1 = 100.0%
      expect(result.summary.functions.total).toBe(1);
      expect(result.summary.functions.covered).toBe(1);
      expect(result.summary.functions.percentage).toBe(100);

      // Branches: covered 3, missed 1 -> 3/4 = 75.0%
      expect(result.summary.branches.total).toBe(4);
      expect(result.summary.branches.covered).toBe(3);
      expect(result.summary.branches.percentage).toBe(75);
    });

    it('blocks XXE injection and external entity attempts', () => {
      const maliciousXml = `<?xml version="1.0"?>
<!DOCTYPE report [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<report name="test">&xxe;</report>`;
      expect(() => parseJacocoXml(maliciousXml)).toThrow(CoverageParseError);
    });

    it('handles multiple packages and sourcefiles', () => {
      const multiPkgXml = `<?xml version="1.0" encoding="UTF-8"?>
<report name="multi-package">
  <package name="org/qualityguard/api">
    <sourcefile name="Server.java">
      <counter type="LINE" missed="0" covered="10"/>
      <counter type="METHOD" missed="0" covered="2"/>
    </sourcefile>
  </package>
  <package name="org/qualityguard/web">
    <sourcefile name="Client.java">
      <counter type="LINE" missed="5" covered="5"/>
      <counter type="METHOD" missed="1" covered="1"/>
    </sourcefile>
  </package>
</report>`;
      const result = parseJacocoXml(multiPkgXml);
      expect(result.filesCount).toBe(2);
      expect(result.files.map((f) => f.file)).toEqual([
        'org/qualityguard/api/Server.java',
        'org/qualityguard/web/Client.java',
      ]);
      // Lines: (10 + 5) / (10 + 10) = 15/20 = 75.0%
      expect(result.summary.lines.percentage).toBe(75);
      // Methods: (2 + 1) / (2 + 2) = 3/4 = 75.0%
      expect(result.summary.functions.percentage).toBe(75);
    });

    it('throws CoverageParseError on malformed XML or missing <report>', () => {
      expect(() => parseJacocoXml('')).toThrow(CoverageParseError);
      expect(() => parseJacocoXml('<not-a-report></not-a-report>')).toThrow(CoverageParseError);
    });
  });

  describe('Unified Coverage Ingestion (parseCoverage & detectCoverageFormat)', () => {
    it('detects LCOV vs JaCoCo format accurately', () => {
      const lcovSample = readFileSync(join(fixturesDir, 'sample.lcov'), 'utf-8');
      const jacocoSample = readFileSync(join(fixturesDir, 'jacoco.xml'), 'utf-8');

      expect(detectCoverageFormat(lcovSample)).toBe('lcov');
      expect(detectCoverageFormat(jacocoSample)).toBe('jacoco');
    });

    it('parses dynamically with auto-detection', () => {
      const lcovSample = readFileSync(join(fixturesDir, 'sample.lcov'), 'utf-8');
      const jacocoSample = readFileSync(join(fixturesDir, 'jacoco.xml'), 'utf-8');

      const res1 = parseCoverage(lcovSample);
      expect(res1.format).toBe('lcov');
      expect(res1.summary.lines.percentage).toBe(70);

      const res2 = parseCoverage(jacocoSample);
      expect(res2.format).toBe('jacoco');
      expect(res2.summary.lines.percentage).toBe(80);
    });
  });
});
