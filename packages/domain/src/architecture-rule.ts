import type { Severity } from './finding.js';

export type ArchitectureRuleType =
  | 'forbidden_dependency'
  | 'allowed_dependency'
  | 'forbidden_path_dependency'
  | 'no_cycles'
  | 'required_layer';

export interface ForbiddenDependencyConfig {
  source: string;
  target: string;
}

export interface AllowedDependencyConfig {
  source: string;
  allowedTargets: string[];
}

export interface ForbiddenPathDependencyConfig {
  fromPath: string;
  toPath: string;
}

export interface NoCyclesConfig {
  maxCycleLength?: number | undefined;
}

export interface RequiredLayerConfig {
  layers: string[];
  strictAdjacentOnly?: boolean | undefined;
}

export type ArchitectureRuleConfig =
  | ForbiddenDependencyConfig
  | AllowedDependencyConfig
  | ForbiddenPathDependencyConfig
  | NoCyclesConfig
  | RequiredLayerConfig
  | Record<string, unknown>;

export interface ArchitectureRule {
  id: string;
  projectId: string;
  organizationId?: string | undefined;
  name: string;
  description?: string | undefined;
  enabled: boolean;
  severity: Severity;
  type: ArchitectureRuleType;
  config: ArchitectureRuleConfig;
  createdAt: string;
  updatedAt: string;
}
