import type { Finding, ArchitectureRule, ArchitectureRuleType } from '@qualityguard/domain';
import { findCycles, type ArchitectureGraph } from './index.js';

/**
 * Escapes regex special characters except wildcards
 */
function escapeRegex(str: string): string {
  return str.replace(/[-[\]{}()+?.,\\^$|#\s]/g, '\\$&');
}

/**
 * Converts a glob pattern to a safe regular expression.
 * Handles ** (any path segments) and * (single path segment).
 */
export function globToRegex(pattern: string): RegExp {
  if (pattern === '*' || pattern === '**') {
    return /^.*$/;
  }

  // Normalize slashes
  const normalized = pattern.replace(/\\/g, '/').trim();

  // Tokenize ** vs *
  const parts = normalized.split('**');
  const regexParts = parts.map((part) => {
    const subParts = part.split('*');
    return subParts.map((sub) => escapeRegex(sub)).join('[^/]*');
  });

  const regexString = `^${regexParts.join('.*')}$`;
  return new RegExp(regexString);
}

/**
 * Matches a file path against a glob pattern safely and deterministically.
 */
export function matchPattern(pattern: string, path: string): boolean {
  if (!pattern || !path) return false;
  if (pattern === '*' || pattern === '**' || pattern === path) return true;

  const normalizedPath = path.replace(/\\/g, '/');
  const normalizedPattern = pattern.replace(/\\/g, '/');

  if (normalizedPattern === normalizedPath) return true;

  try {
    const regex = globToRegex(normalizedPattern);
    return regex.test(normalizedPath);
  } catch {
    return false;
  }
}

/**
 * Validates the configuration schema for an ArchitectureRule
 */
export function validateArchitectureRuleConfig(
  type: ArchitectureRuleType,
  config: unknown,
): { valid: boolean; error?: string } {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return { valid: false, error: 'Rule configuration must be an object' };
  }

  const record = config as Record<string, unknown>;

  switch (type) {
    case 'forbidden_dependency': {
      if (!record.source || typeof record.source !== 'string' || !record.target || typeof record.target !== 'string') {
        return { valid: false, error: 'source and target are required for forbidden_dependency rule' };
      }
      return { valid: true };
    }

    case 'allowed_dependency': {
      if (!record.source || typeof record.source !== 'string') {
        return { valid: false, error: 'source is required for allowed_dependency rule' };
      }
      if (!Array.isArray(record.allowedTargets) || record.allowedTargets.length === 0) {
        return { valid: false, error: 'allowedTargets must contain at least one target pattern' };
      }
      if (record.allowedTargets.some((t) => typeof t !== 'string' || !t.trim())) {
        return { valid: false, error: 'All allowedTargets must be non-empty strings' };
      }
      return { valid: true };
    }

    case 'forbidden_path_dependency': {
      if (!record.fromPath || typeof record.fromPath !== 'string' || !record.toPath || typeof record.toPath !== 'string') {
        return { valid: false, error: 'fromPath and toPath are required for forbidden_path_dependency rule' };
      }
      return { valid: true };
    }

    case 'no_cycles': {
      if (record.maxCycleLength !== undefined && (typeof record.maxCycleLength !== 'number' || record.maxCycleLength < 2)) {
        return { valid: false, error: 'maxCycleLength must be a number >= 2' };
      }
      return { valid: true };
    }

    case 'required_layer': {
      if (!Array.isArray(record.layers) || record.layers.length < 2) {
        return { valid: false, error: 'layers must contain at least two layer patterns in hierarchical order' };
      }
      if (record.layers.some((l) => typeof l !== 'string' || !l.trim())) {
        return { valid: false, error: 'All layer patterns must be non-empty strings' };
      }
      return { valid: true };
    }

    default:
      return { valid: false, error: `Unsupported architecture rule type: ${String(type)}` };
  }
}

/**
 * Pure Architecture Governance Engine.
 * Evaluates a set of deterministic architecture rules against an ArchitectureGraph.
 */
export function evaluateArchitectureRules(
  graph: ArchitectureGraph,
  rules: ArchitectureRule[],
): Finding[] {
  const findings: Finding[] = [];
  if (!graph || !graph.edges || graph.edges.length === 0 && !rules.some((r) => r.type === 'no_cycles')) {
    return [];
  }

  const activeRules = rules.filter((r) => r.enabled);

  for (const rule of activeRules) {
    const validation = validateArchitectureRuleConfig(rule.type, rule.config);
    if (!validation.valid) continue;

    const decision = rule.severity === 'critical' ? 'block' : 'review_required';

    switch (rule.type) {
      case 'forbidden_dependency': {
        const config = rule.config as { source: string; target: string };
        for (const edge of graph.edges) {
          if (matchPattern(config.source, edge.from) && matchPattern(config.target, edge.to)) {
            findings.push({
              id: `ARCH-RULE-${rule.id}-${edge.from}->${edge.to}`,
              severity: rule.severity,
              category: 'architecture',
              status: 'open',
              decision,
              file: edge.from,
              title: rule.name || 'Forbidden architectural dependency detected',
              description: `Forbidden dependency: ${edge.from} -> ${edge.to} violates rule "${rule.name}"`,
              suggestion:
                rule.description ||
                `Decouple ${edge.from} from ${edge.to} by introducing appropriate domain interfaces or inversion of control.`,
              confidence: 1.0,
              source: 'deterministic',
              ruleId: 'custom/forbidden-dependency',
            });
          }
        }
        break;
      }

      case 'allowed_dependency': {
        const config = rule.config as { source: string; allowedTargets: string[] };
        for (const edge of graph.edges) {
          if (matchPattern(config.source, edge.from)) {
            const isAllowed = config.allowedTargets.some((target) => matchPattern(target, edge.to));
            if (!isAllowed) {
              findings.push({
                id: `ARCH-RULE-${rule.id}-${edge.from}->${edge.to}`,
                severity: rule.severity,
                category: 'architecture',
                status: 'open',
                decision,
                file: edge.from,
                title: rule.name || 'Disallowed architectural dependency detected',
                description: `Dependency: ${edge.from} -> ${edge.to} is not in allowed target list [${config.allowedTargets.join(', ')}]`,
                suggestion:
                  rule.description ||
                  `Remove or redirect dependency from ${edge.from} to ${edge.to} to conform to allowed boundaries.`,
                confidence: 1.0,
                source: 'deterministic',
                ruleId: 'custom/allowed-dependency',
              });
            }
          }
        }
        break;
      }

      case 'forbidden_path_dependency': {
        const config = rule.config as { fromPath: string; toPath: string };
        for (const edge of graph.edges) {
          if (matchPattern(config.fromPath, edge.from) && matchPattern(config.toPath, edge.to)) {
            findings.push({
              id: `ARCH-RULE-${rule.id}-${edge.from}->${edge.to}`,
              severity: rule.severity,
              category: 'architecture',
              status: 'open',
              decision,
              file: edge.from,
              title: rule.name || 'Forbidden path dependency detected',
              description: `Forbidden path dependency from ${edge.from} to ${edge.to} violates rule "${rule.name}"`,
              suggestion:
                rule.description ||
                `Prevent modules in path ${config.fromPath} from importing modules in path ${config.toPath}.`,
              confidence: 1.0,
              source: 'deterministic',
              ruleId: 'custom/forbidden-path-dependency',
            });
          }
        }
        break;
      }

      case 'no_cycles': {
        const cycles = findCycles(graph);
        const config = rule.config as { maxCycleLength?: number };
        const maxLen = config.maxCycleLength;

        for (const cycle of cycles) {
          if (maxLen && cycle.length > maxLen) continue;
          const startNode = cycle[0] ?? 'unknown';
          findings.push({
            id: `ARCH-RULE-${rule.id}-${cycle.join('-')}`,
            severity: rule.severity,
            category: 'architecture',
            status: 'open',
            decision,
            file: startNode,
            title: rule.name || 'Circular dependency cycle detected',
            description: `Circular dependency cycle: ${cycle.join(' -> ')}`,
            suggestion:
              rule.description ||
              'Decouple circular dependencies by introducing abstractions or moving shared logic to a lower layer.',
            confidence: 1.0,
            source: 'deterministic',
            ruleId: 'custom/no-cycles',
          });
        }
        break;
      }

      case 'required_layer': {
        const config = rule.config as { layers: string[]; strictAdjacentOnly?: boolean };
        const layers = config.layers;
        const strictAdjacent = Boolean(config.strictAdjacentOnly);

        for (const edge of graph.edges) {
          const fromIdx = layers.findIndex((layerPattern) => matchPattern(layerPattern, edge.from));
          const toIdx = layers.findIndex((layerPattern) => matchPattern(layerPattern, edge.to));

          if (fromIdx !== -1 && toIdx !== -1) {
            // Layer violation: Lower layer depends on higher layer (inverted flow)
            if (toIdx < fromIdx) {
              findings.push({
                id: `ARCH-RULE-${rule.id}-${edge.from}->${edge.to}`,
                severity: rule.severity,
                category: 'architecture',
                status: 'open',
                decision,
                file: edge.from,
                title: rule.name || 'Architectural layer inversion detected',
                description: `Layer violation: ${edge.from} (layer ${layers[fromIdx]}) cannot depend on upper layer ${edge.to} (layer ${layers[toIdx]})`,
                suggestion:
                  rule.description ||
                  `Invert the dependency using dependency injection or interfaces defined in the lower layer.`,
                confidence: 1.0,
                source: 'deterministic',
                ruleId: 'custom/required-layer',
              });
            } else if (strictAdjacent && toIdx > fromIdx + 1) {
              // Strict adjacency violation: skipping an intermediate layer
              findings.push({
                id: `ARCH-RULE-${rule.id}-${edge.from}->${edge.to}`,
                severity: rule.severity,
                category: 'architecture',
                status: 'open',
                decision,
                file: edge.from,
                title: rule.name || 'Non-adjacent architectural layer jump detected',
                description: `Non-adjacent layer dependency: ${edge.from} (layer ${layers[fromIdx]}) skips intermediate layers to depend on ${edge.to} (layer ${layers[toIdx]})`,
                suggestion:
                  rule.description ||
                  `Route dependencies through adjacent intermediate architectural layers.`,
                confidence: 1.0,
                source: 'deterministic',
                ruleId: 'custom/required-layer',
              });
            }
          }
        }
        break;
      }
    }
  }

  // Return deterministically sorted findings
  return findings.sort((a, b) => {
    const ruleComp = (a.ruleId ?? '').localeCompare(b.ruleId ?? '');
    if (ruleComp !== 0) return ruleComp;
    const fileComp = a.file.localeCompare(b.file);
    if (fileComp !== 0) return fileComp;
    return a.title.localeCompare(b.title);
  });
}
