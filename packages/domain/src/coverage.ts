export type CoverageFormat = 'lcov' | 'jacoco';

export interface CoverageMetrics {
  total: number;
  covered: number;
  missed: number;
  percentage: number | null;
}

export interface CoverageSummary {
  lines: CoverageMetrics;
  functions: CoverageMetrics;
  branches: CoverageMetrics;
}

export interface FileCoverage {
  file: string;
  lines: CoverageMetrics;
  functions?: CoverageMetrics | undefined;
  branches?: CoverageMetrics | undefined;
}

export interface CoverageReport {
  id: string;
  projectId: string;
  reviewId: string;
  organizationId: string;
  format: CoverageFormat;
  summary: CoverageSummary;
  filesCount: number;
  fileCoverage?: FileCoverage[] | undefined;
  createdAt: string;
}

export interface CoverageResponse {
  coverage: {
    lines: number | null;
    functions: number | null;
    branches: number | null;
  };
  summary?: CoverageSummary | undefined;
  format: CoverageFormat;
  files: number;
  analysisId: string;
  projectId: string;
  createdAt: string;
}
