import { createHash } from 'node:crypto';
import type { Finding } from '@qualityguard/domain';

export function findingFingerprint(finding: Pick<Finding, 'ruleId' | 'file' | 'line' | 'title' | 'evidence'>): string {
  const normalized = [finding.ruleId ?? 'custom', finding.file.replaceAll('\\', '/'), finding.line ?? 0, finding.title.trim().toLowerCase(), ...(finding.evidence ?? []).map((x) => x.trim())].join('|');
  return createHash('sha256').update(normalized).digest('hex').slice(0, 24);
}

export function deduplicateFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const fingerprint = findingFingerprint(finding);
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}
