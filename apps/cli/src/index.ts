#!/usr/bin/env node
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';
import { analyze, applySeverityOverrides, configuredRules, deduplicateFindings, evaluateGate, excludeBaselineFindings, loadBaseline, loadConfig, writeBaseline, changedSourceFiles } from '@qualityguard/analyzer';
import { gitDiff, gitDiffCached } from './git.js';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const IGNORED = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next']);

type File = { path: string; content: string };

async function collectFiles(root: string, current = root): Promise<File[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const files: File[] = [];
  for (const entry of entries) {
    if (IGNORED.has(entry.name)) continue;
    const absolute = join(current, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(root, absolute));
    else if (SOURCE_EXTENSIONS.has(extname(entry.name))) files.push({ path: relative(root, absolute), content: await readFile(absolute, 'utf8') });
  }
  return files;
}

async function resolveRoot(target: string): Promise<string> {
  const absolute = join(process.cwd(), target);
  return (await stat(absolute)).isDirectory() ? absolute : process.cwd();
}

async function getFiles(root: string, diffMode: boolean, stagedMode: boolean): Promise<File[]> {
  if (!diffMode && !stagedMode) return collectFiles(root);
  const diff = stagedMode ? await gitDiffCached(root) : await gitDiff(root);
  const changed = changedSourceFiles(diff);
  const fullFiles = await collectFiles(root);
  const byPath = new Map(fullFiles.map((file) => [file.path, file]));
  return changed.map((file) => byPath.get(file.path) ?? { path: file.path, content: file.patch });
}

function printResult(result: ReturnType<typeof analyze>, gate?: ReturnType<typeof evaluateGate>): void {
  console.log('\nQualityGuard\n');
  console.log(`Files analyzed: ${result.analyzedFiles}`);
  console.log(`Findings:       ${result.findings.length}`);
  console.log(`Quality Score:  ${result.score}/100`);
  console.log(`Decision:       ${(gate?.decision ?? result.decision).replace('_', ' ').toUpperCase()}`);
  if (gate) console.log(`Gate:           ${gate.passed ? 'PASS' : `FAIL — ${gate.reasons.join('; ')}`}`);
  for (const f of result.findings) {
    console.log(`\n${f.severity.toUpperCase()} ${f.category} — ${f.file}${f.line ? `:${f.line}` : ''}`);
    console.log(`  ${f.title}\n  ${f.description}\n  Rule: ${f.ruleId ?? 'custom'}\n  Suggestion: ${f.suggestion}`);
  }
}

async function runAnalysis(root: string, args: string[]) {
  const config = await loadConfig(root, args.find((arg) => arg.startsWith('--config='))?.slice(9));
  const files = await getFiles(root, args.includes('--diff'), args.includes('--staged'));
  const base = analyze({ files, rules: configuredRules(config) });
  const findings = deduplicateFindings(applySeverityOverrides(base.findings, config));
  const baseline = await loadBaseline(root);
  const active = excludeBaselineFindings(findings, baseline);
  const score = Math.max(0, Math.min(100, 100 - active.filter((f) => f.status === 'open').reduce((n, f) => n + ({ critical: 35, high: 20, medium: 10, low: 3, info: 0 }[f.severity]), 0)));
  const result = { ...base, findings: active, score, decision: 'approve' as const };
  const gate = evaluateGate(score, active, { minimumScore: config.quality.minimum_score, blockOn: config.gate.block_on });
  result.decision = gate.decision;
  return { result, gate };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  const target = args[1] ?? '.';
  const json = args.includes('--json');
  if (!command || !['analyze', 'check', 'baseline'].includes(command)) {
    console.error('Usage: qualityguard <analyze|check|baseline> <path> [--diff|--staged] [--json] [--config=path]');
    process.exitCode = 2; return;
  }
  const root = await resolveRoot(target);
  if (command === 'baseline') {
    const { result } = await runAnalysis(root, args.slice(2));
    await writeBaseline(root, result.findings);
    console.log(`Baseline written with ${result.findings.length} findings.`);
    return;
  }
  const { result, gate } = await runAnalysis(root, args.slice(2));
  if (json) console.log(JSON.stringify({ ...result, gate }, null, 2)); else printResult(result, gate);
  if (command === 'check' && !gate.passed) process.exitCode = 1;
  else if (command === 'analyze' && gate.decision === 'block') process.exitCode = 1;
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
