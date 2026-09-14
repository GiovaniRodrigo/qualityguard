import type { ReviewResult } from '@qualityguard/domain';
import { analyze } from './analyzer.js';
import { changedSourceFiles, type DiffFile } from './diff.js';

export interface DiffReviewResult extends ReviewResult {
  changedFiles: number;
  additions: number;
  deletions: number;
}

export function analyzeDiff(diff: string): DiffReviewResult {
  const changed = changedSourceFiles(diff);
  const files = changed.map((file) => ({ path: file.path, content: file.patch }));
  const result = analyze({ files });
  return {
    ...result,
    changedFiles: changed.length,
    additions: sum(changed, 'additions'),
    deletions: sum(changed, 'deletions'),
  };
}

function sum(files: DiffFile[], key: 'additions' | 'deletions'): number {
  return files.reduce((total, file) => total + file[key], 0);
}
