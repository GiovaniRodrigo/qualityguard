import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Finding, Severity } from '@qualityguard/domain';
import { defaultRules, type Rule } from './rules.js';

export interface QualityGuardConfig {
  version: 1;
  rules: Record<string, { enabled?: boolean; severity?: Severity }>;
  quality: { minimum_score: number };
  gate: { block_on: Severity[] };
}

const defaults: QualityGuardConfig = {
  version: 1,
  rules: Object.fromEntries(defaultRules.map((r) => [r.id, { enabled: true }])),
  quality: { minimum_score: 80 },
  gate: { block_on: ['critical', 'high'] },
};

export async function loadConfig(root: string, explicitPath?: string): Promise<QualityGuardConfig> {
  const path = explicitPath ?? join(root, 'qualityguard.yml');
  try {
    const raw = await readFile(path, 'utf8');
    return normalizeConfig(parse(raw) as Partial<QualityGuardConfig>);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' && !explicitPath) return defaults;
    throw new Error(`Unable to load QualityGuard config: ${path}`);
  }
}

export function normalizeConfig(input: Partial<QualityGuardConfig>): QualityGuardConfig {
  const rules = { ...defaults.rules, ...(input.rules ?? {}) };
  const minimum = input.quality?.minimum_score ?? defaults.quality.minimum_score;
  if (!Number.isFinite(minimum) || minimum < 0 || minimum > 100) throw new Error('quality.minimum_score must be between 0 and 100');
  return {
    version: 1,
    rules,
    quality: { minimum_score: minimum },
    gate: { block_on: input.gate?.block_on ?? defaults.gate.block_on },
  };
}

export function configuredRules(config: QualityGuardConfig): Rule[] {
  return defaultRules.filter((rule) => config.rules[rule.id]?.enabled !== false);
}

export function applySeverityOverrides(findings: Finding[], config: QualityGuardConfig): Finding[] {
  return findings.map((finding) => ({
    ...finding,
    severity: config.rules[finding.ruleId ?? '']?.severity ?? finding.severity,
  }));
}
