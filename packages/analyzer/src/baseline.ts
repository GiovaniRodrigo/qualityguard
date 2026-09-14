import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Finding } from '@qualityguard/domain';
import { findingFingerprint } from './fingerprint.js';

export interface Baseline { version: 1; fingerprints: string[]; generatedAt: string; }

export async function loadBaseline(root: string): Promise<Baseline> {
  try {
    return JSON.parse(await readFile(join(root, '.qualityguard-baseline.json'), 'utf8')) as Baseline;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, fingerprints: [], generatedAt: new Date(0).toISOString() };
    throw new Error('Unable to read .qualityguard-baseline.json');
  }
}

export async function writeBaseline(root: string, findings: Finding[]): Promise<void> {
  const baseline: Baseline = { version: 1, fingerprints: [...new Set(findings.map(findingFingerprint))].sort(), generatedAt: new Date().toISOString() };
  await writeFile(join(root, '.qualityguard-baseline.json'), `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
}

export function excludeBaselineFindings(findings: Finding[], baseline: Baseline): Finding[] {
  const known = new Set(baseline.fingerprints);
  return findings.filter((finding) => !known.has(findingFingerprint(finding)));
}
