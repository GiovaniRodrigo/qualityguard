export type DiffChangeType = 'added' | 'modified' | 'deleted' | 'renamed';

export interface DiffFile {
  path: string;
  previousPath?: string;
  change: DiffChangeType;
  additions: number;
  deletions: number;
  patch: string;
}

const FILE_HEADER = /^diff --git a\/(.+) b\/(.+)$/;
const RENAME_FROM = /^rename from (.+)$/;
const RENAME_TO = /^rename to (.+)$/;
const NEW_FILE = /^new file mode /;
const DELETED_FILE = /^deleted file mode /;
const HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

export function parseUnifiedDiff(diff: string): DiffFile[] {
  const lines = diff.split(/\r?\n/);
  const files: DiffFile[] = [];
  let current: DiffFile | undefined;
  let hunk = false;
  let newLine = 0;
  const patchLines: string[] = [];

  const flush = () => {
    if (!current) return;
    current.patch = patchLines.join('\n').trimEnd();
    files.push(current);
    current = undefined;
    patchLines.length = 0;
    hunk = false;
  };

  for (const line of lines) {
    const header = line.match(FILE_HEADER);
    if (header && header[1] && header[2]) {
      flush();
      current = { path: header[2], previousPath: header[1], change: 'modified', additions: 0, deletions: 0, patch: '' };
      continue;
    }
    if (!current) continue;
    if (NEW_FILE.test(line)) current.change = 'added';
    if (DELETED_FILE.test(line)) current.change = 'deleted';
    const renameFrom = line.match(RENAME_FROM);
    const renameTo = line.match(RENAME_TO);
    if (renameFrom?.[1]) current.previousPath = renameFrom[1];
    if (renameTo?.[1]) { current.path = renameTo[1]; current.change = 'renamed'; }
    const hunkMatch = line.match(HUNK);
    if (hunkMatch) {
      hunk = true;
      newLine = Number(hunkMatch[1]);
      patchLines.push(line);
      continue;
    }
    if (!hunk) continue;
    patchLines.push(line);
    if (line.startsWith('+') && !line.startsWith('+++')) {
      current.additions++;
      newLine++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      current.deletions++;
    } else if (!line.startsWith('\\')) {
      newLine++;
    }
  }
  flush();
  return files;
}

export function changedSourceFiles(diff: string): DiffFile[] {
  return parseUnifiedDiff(diff).filter((file) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file.path) && file.change !== 'deleted');
}
