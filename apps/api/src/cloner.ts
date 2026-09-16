import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export class RepositoryValidationError extends Error {
  readonly code = 'REPOSITORY_VALIDATION_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'RepositoryValidationError';
  }
}

export class RepositoryCloneTimeoutError extends Error {
  readonly code = 'REPOSITORY_CLONE_TIMEOUT';
  constructor(message: string) {
    super(message);
    this.name = 'RepositoryCloneTimeoutError';
  }
}

export class RepositorySizeLimitError extends Error {
  readonly code = 'REPOSITORY_SIZE_LIMIT_EXCEEDED';
  constructor(message: string) {
    super(message);
    this.name = 'RepositorySizeLimitError';
  }
}

export class RepositoryCloneError extends Error {
  readonly code = 'REPOSITORY_CLONE_FAILED';
  constructor(message: string) {
    super(message);
    this.name = 'RepositoryCloneError';
  }
}

export class RepositoryWorkspaceError extends Error {
  readonly code = 'REPOSITORY_WORKSPACE_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'RepositoryWorkspaceError';
  }
}

const DISALLOWED_CHARACTERS = /[;&|`$\n\r\t"'<>\0]/;
const DISALLOWED_SCHEMES = /^(file|ftp|ssh|data|javascript|http):/i;

export function validateRepositoryUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new RepositoryValidationError('Repository URL cannot be empty');
  }

  const trimmed = rawUrl.trim();
  if (trimmed.length === 0) {
    throw new RepositoryValidationError('Repository URL cannot be empty');
  }

  if (trimmed.startsWith('-')) {
    throw new RepositoryValidationError('Repository URL cannot start with a hyphen or git flag');
  }

  if (DISALLOWED_CHARACTERS.test(trimmed)) {
    throw new RepositoryValidationError('Repository URL contains disallowed shell metacharacters');
  }

  if (DISALLOWED_SCHEMES.test(trimmed)) {
    throw new RepositoryValidationError('Disallowed repository URL protocol (only HTTPS supported)');
  }

  // Handle shorthand owner/repo notation
  const shortMatch = trimmed.match(/^([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (shortMatch && !trimmed.includes('://')) {
    const owner = shortMatch[1];
    let repo = shortMatch[2]!;
    if (repo.endsWith('.git')) repo = repo.slice(0, -4);
    return `https://github.com/${owner}/${repo}.git`;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') {
      throw new RepositoryValidationError(`Protocol ${parsed.protocol} is not supported. Only HTTPS is allowed.`);
    }

    if (!parsed.hostname || parsed.hostname.length < 3 || !parsed.hostname.includes('.')) {
      throw new RepositoryValidationError(`Invalid repository hostname: ${parsed.hostname}`);
    }

    if (!parsed.pathname || parsed.pathname === '/' || parsed.pathname.length < 2) {
      throw new RepositoryValidationError('Repository path is required in URL');
    }

    let cleanPath = parsed.pathname;
    if (!cleanPath.endsWith('.git')) {
      cleanPath = `${cleanPath}.git`;
    }

    return `https://${parsed.host}${cleanPath}`;
  } catch (err) {
    if (err instanceof RepositoryValidationError) throw err;
    throw new RepositoryValidationError(`Invalid repository URL: ${rawUrl}`);
  }
}

export function validateBranch(rawBranch?: string): string | undefined {
  if (!rawBranch) return undefined;
  const trimmed = rawBranch.trim();
  if (!trimmed) return undefined;

  if (trimmed.startsWith('-')) {
    throw new RepositoryValidationError('Branch name cannot start with a hyphen or flag');
  }

  if (DISALLOWED_CHARACTERS.test(trimmed)) {
    throw new RepositoryValidationError('Branch name contains disallowed metacharacters');
  }

  if (trimmed.includes('..')) {
    throw new RepositoryValidationError('Branch name cannot contain path traversal sequences (..)');
  }

  const validBranchPattern = /^[a-zA-Z0-9_./-]+$/;
  if (!validBranchPattern.test(trimmed) || trimmed.startsWith('/') || trimmed.endsWith('/')) {
    throw new RepositoryValidationError(`Invalid branch format: ${rawBranch}`);
  }

  return trimmed;
}

export async function calculateDirectorySize(dirPath: string): Promise<number> {
  let totalSize = 0;

  async function walk(current: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        try {
          const fileStat = await stat(fullPath);
          totalSize += fileStat.size;
        } catch {
          // Ignore unreadable or deleted files during walk
        }
      }
    }
  }

  await walk(dirPath);
  return totalSize;
}

export interface ClonedWorkspace {
  path: string;
  commitSha?: string | undefined;
  sizeBytes: number;
  cleanup: () => Promise<void>;
}

export interface ClonerOptions {
  timeoutMs?: number | undefined;
  maxSizeBytes?: number | undefined;
  baseDir?: string | undefined;
}

export interface CloneParams {
  repository: string;
  branch?: string | undefined;
  timeoutMs?: number | undefined;
  maxSizeBytes?: number | undefined;
}

export const DEFAULT_TIMEOUT_MS = 45_000; // 45 seconds hard timeout
export const DEFAULT_MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

export class SandboxedRepositoryCloner {
  private readonly defaultTimeoutMs: number;
  private readonly defaultMaxSizeBytes: number;
  private readonly baseDir: string;

  constructor(options: ClonerOptions = {}) {
    this.defaultTimeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.defaultMaxSizeBytes = options.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES;
    this.baseDir = options.baseDir ?? join(tmpdir(), 'qualityguard', 'workspaces');
  }

  async clone(params: CloneParams): Promise<ClonedWorkspace> {
    const validUrl = validateRepositoryUrl(params.repository);
    const validBranch = validateBranch(params.branch);

    const timeoutMs = params.timeoutMs ?? this.defaultTimeoutMs;
    const maxSizeBytes = params.maxSizeBytes ?? this.defaultMaxSizeBytes;

    const workspaceId = `job-${randomUUID()}`;
    const workspacePath = join(this.baseDir, workspaceId);

    await mkdir(workspacePath, { recursive: true });

    const gitArgs = [
      '-c', 'protocol.file.allow=never',
      '-c', 'submodule.recurse=false',
      'clone',
      '--depth', '1',
      '--no-tags',
      '--recurse-submodules=no',
    ];

    if (validBranch) {
      gitArgs.push('--branch', validBranch);
    }

    gitArgs.push('--', validUrl, workspacePath);

    let childExited = false;
    let timedOut = false;
    let timeoutTimer: NodeJS.Timeout | null = null;

    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn('git', gitArgs, {
          stdio: ['ignore', 'ignore', 'pipe'],
        });

        let stderrOutput = '';
        child.stderr?.on('data', (chunk) => {
          stderrOutput += chunk.toString();
        });

        timeoutTimer = setTimeout(() => {
          timedOut = true;
          try {
            child.kill('SIGKILL');
          } catch {}
          reject(new RepositoryCloneTimeoutError(`Git clone exceeded hard timeout of ${timeoutMs}ms for ${validUrl}`));
        }, timeoutMs);

        child.on('error', (err) => {
          if (!childExited) {
            childExited = true;
            if (timeoutTimer) clearTimeout(timeoutTimer);
            reject(new RepositoryCloneError(`Failed to spawn git process: ${err.message}`));
          }
        });

        child.on('close', (code) => {
          if (!childExited) {
            childExited = true;
            if (timeoutTimer) clearTimeout(timeoutTimer);
            if (timedOut) return; // already rejected by timer

            if (code === 0) {
              resolve();
            } else {
              const cleanErr = stderrOutput.trim() || `Exit code ${code}`;
              reject(new RepositoryCloneError(`Git clone failed for ${validUrl}: ${cleanErr}`));
            }
          }
        });
      });

      // Post-clone verification: Directory size limit check
      const sizeBytes = await calculateDirectorySize(workspacePath);
      if (sizeBytes > maxSizeBytes) {
        throw new RepositorySizeLimitError(
          `Cloned repository size (${sizeBytes} bytes) exceeds configured limit of ${maxSizeBytes} bytes (50MB maximum)`,
        );
      }

      // Read commit SHA
      let commitSha: string | undefined;
      try {
        commitSha = await new Promise<string>((resolve, reject) => {
          const revChild = spawn('git', ['-C', workspacePath, 'rev-parse', 'HEAD'], {
            stdio: ['ignore', 'pipe', 'ignore'],
          });
          let sha = '';
          revChild.stdout?.on('data', (c) => { sha += c.toString(); });
          revChild.on('close', (code) => {
            if (code === 0 && sha.trim()) resolve(sha.trim());
            else reject(new Error('Failed to resolve HEAD commit'));
          });
          revChild.on('error', reject);
        });
      } catch {}

      const cleanup = async () => {
        if (existsSync(workspacePath)) {
          await rm(workspacePath, { recursive: true, force: true }).catch(() => {});
        }
      };

      return {
        path: workspacePath,
        commitSha,
        sizeBytes,
        cleanup,
      };
    } catch (error) {
      // Ensure strict cleanup on any failure
      await rm(workspacePath, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
  }
}
