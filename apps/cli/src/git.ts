import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function gitDiff(target: string): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', target, 'diff', '--no-ext-diff', '--unified=40'], { maxBuffer: 20 * 1024 * 1024 });
  return stdout;
}

export async function gitDiffCached(target: string): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', target, 'diff', '--cached', '--no-ext-diff', '--unified=40'], { maxBuffer: 20 * 1024 * 1024 });
  return stdout;
}
