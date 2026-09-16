import type { Finding, Review } from '@/lib/api/types';

/**
 * Builds a deterministic GitHub deep link for a finding line in a specific commit or branch.
 * Returns null if repository is not a valid GitHub repository or required location data is missing.
 */
export function buildGitHubFileUrl(
  repositoryUrl?: string | null,
  commitShaOrBranch?: string | null,
  file?: string | null,
  line?: number | null,
): string | null {
  if (!repositoryUrl || !file) return null;

  // Clean git URL (supports https://github.com/owner/repo.git, git@github.com:owner/repo.git, etc.)
  let cleanRepo = repositoryUrl.trim();
  if (cleanRepo.endsWith('.git')) {
    cleanRepo = cleanRepo.slice(0, -4);
  }

  let match = cleanRepo.match(/github\.com[/:]([^/]+)\/([^/]+)/i);
  if (!match || !match[1] || !match[2]) {
    return null;
  }

  const owner = match[1];
  const repo = match[2];
  const ref = commitShaOrBranch?.trim() || 'main';
  const cleanFile = file.startsWith('/') ? file.slice(1) : file;

  let url = `https://github.com/${owner}/${repo}/blob/${ref}/${cleanFile}`;
  if (line && line > 0) {
    url += `#L${line}`;
  }

  return url;
}

export function getSeverityRank(severity: string): number {
  switch (severity.toLowerCase()) {
    case 'critical':
      return 1;
    case 'high':
      return 2;
    case 'medium':
      return 3;
    case 'low':
      return 4;
    case 'info':
      return 5;
    default:
      return 6;
  }
}

export function sortFindingsByPriority(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const rankA = getSeverityRank(a.severity);
    const rankB = getSeverityRank(b.severity);
    if (rankA !== rankB) return rankA - rankB;

    // Secondary: Security and Architecture categories first
    const catPriority = (cat: string) => (cat === 'security' ? 1 : cat === 'architecture' ? 2 : 3);
    const catA = catPriority(a.category);
    const catB = catPriority(b.category);
    if (catA !== catB) return catA - catB;

    // Tertiary: File path
    const fileComp = a.file.localeCompare(b.file);
    if (fileComp !== 0) return fileComp;

    // Quaternary: Line number
    const lineA = a.line ?? a.startLine ?? 0;
    const lineB = b.line ?? b.startLine ?? 0;
    if (lineA !== lineB) return lineA - lineB;

    // Quinary: Rule ID
    return (a.ruleId ?? '').localeCompare(b.ruleId ?? '');
  });
}
