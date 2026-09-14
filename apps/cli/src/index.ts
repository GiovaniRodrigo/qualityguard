#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';
import { analyze } from '@qualityguard/analyzer';
import { changedSourceFiles } from '@qualityguard/analyzer';
import { gitDiff, gitDiffCached } from './git.js';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const IGNORED = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next']);

async function collectFiles(root: string, current = root): Promise<{ path: string; content: string }[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const files: { path: string; content: string }[] = [];
  for (const entry of entries) {
    if (IGNORED.has(entry.name)) continue;
    const absolute = join(current, entry.name);
    if (entry.isDirectory()) { files.push(...await collectFiles(root, absolute)); continue; }
    if (SOURCE_EXTENSIONS.has(extname(entry.name))) files.push({ path: relative(root, absolute), content: await readFile(absolute, 'utf8') });
  }
  return files;
}

function printResult(result: ReturnType<typeof analyze>): void {
  console.log('\nQualityGuard\n');
  console.log(`Files analyzed: ${result.analyzedFiles}`);
  console.log(`Findings:       ${result.findings.length}`);
  console.log(`\nQuality Score: ${result.score}/100`);
  console.log(`Decision:       ${result.decision.replace('_', ' ').toUpperCase()}`);
  for (const f of result.findings) {
    console.log(`\n${f.severity.toUpperCase()}  ${f.category}`);
    console.log(`      ${f.file}${f.line ? `:${f.line}` : ''}`);
    console.log(`\n      ${f.title}`);
    console.log(`\n      ${f.description}`);
    console.log(`\n      Rule: ${f.ruleId ?? 'custom'}`);
    console.log(`      Suggestion: ${f.suggestion}`);
  }
  console.log(`\n${result.findings.length} findings`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  const target = args[1] ?? '.';
  const json = args.includes('--json');
  const diffMode = args.includes('--diff');
  const stagedMode = args.includes('--staged');

  if (command !== 'analyze') {
    console.error('Usage: qualityguard analyze <path> [--diff|--staged] [--json]');
    process.exitCode = 2;
    return;
  }

  const root = join(process.cwd(), target);
  let files: { path: string; content: string }[];

  if (diffMode || stagedMode) {
    const diff = stagedMode ? await gitDiffCached(root) : await gitDiff(root);
    const changed = changedSourceFiles(diff);
    const fullFiles = await collectFiles(root);
    const byPath = new Map(fullFiles.map((file) => [file.path, file]));
    files = changed.map((file) => byPath.get(file.path) ?? { path: file.path, content: file.patch });
  } else {
    files = await collectFiles(root);
  }

  const result = analyze({ files });
  if (json) console.log(JSON.stringify(result, null, 2));
  else printResult(result);

  process.exitCode = result.decision === 'block' ? 1 : 0;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
