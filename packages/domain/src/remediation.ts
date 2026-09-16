import type { Finding } from './finding.js';

export interface CodeContext {
  path: string;
  content: string;
  startLine?: number | undefined;
  endLine?: number | undefined;
}

export interface RemediationRequest {
  findingId: string;
}

export interface RemediationContext {
  finding: Finding;
  repository?: string | undefined;
  branch?: string | undefined;
  relevantFiles?: CodeContext[] | undefined;
  architectureSummary?: string | undefined;
  dependencySummary?: string | undefined;
}
