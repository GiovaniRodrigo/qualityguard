import { readdir, readFile } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';
import { analyze, calculateScore, defaultRules, evaluateGate, extractAllDependencies, type SourceFile } from '@qualityguard/analyzer';
import { buildDependencyGraph, findCycles, detectDrift, evaluateArchitectureRules, type ArchitectureGraph, type Drift } from '@qualityguard/architecture';
import type { Finding, ArchitectureRule } from '@qualityguard/domain';
import type { DependencyItem } from './store.js';
import { SandboxedRepositoryCloner, type ClonedWorkspace } from './cloner.js';

const defaultCloner = new SandboxedRepositoryCloner();

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.rs', '.py', '.go', '.java', '.rb', '.cs',
  '.json', '.toml', '.yaml', '.yml', '.xml', '.txt',
]);

const IGNORED_DIRECTORIES = new Set([
  'node_modules', '.git', 'target', 'dist', 'build',
  'coverage', '.next', '.turbo', '.cache', 'vendor',
]);

async function collectFilesFromDir(baseDir: string, currentDir = baseDir, maxFiles = 2000): Promise<SourceFile[]> {
  const files: SourceFile[] = [];

  async function walk(dir: string): Promise<void> {
    if (files.length >= maxFiles) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= maxFiles) return;
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && (SOURCE_EXTENSIONS.has(extname(entry.name)) || entry.name === 'go.mod' || entry.name === 'pom.xml' || entry.name === 'requirements.txt' || entry.name === 'Cargo.toml')) {
        try {
          const content = await readFile(fullPath, 'utf8');
          files.push({
            path: relative(baseDir, fullPath).replace(/\\/g, '/'),
            content,
          });
        } catch {
          // Ignore binary or unreadable files
        }
      }
    }
  }

  await walk(baseDir);
  return files;
}

export interface AnalysisOutput {
  score: number;
  decision: string;
  analyzedFiles: number;
  findings: Finding[];
  architecture: {
    nodes: string[];
    edges: Array<{ from: string; to: string; kind: 'import' | 'require' }>;
    cycles: string[][];
    drift: Array<{ type: string; from: string; to: string; message: string }>;
  };
  dependencies: DependencyItem[];
  gate: {
    passed: boolean;
    reasons: string[];
    decision: string;
  };
  categoryScores: {
    architecture: number;
    security: number;
    testing: number | null;
    dependencies: number;
  };
  commitSha?: string | undefined;
  aiInsight?: string | undefined;
}

export async function runRepositoryAnalysis(
  repository: string,
  branch?: string,
  cloner: SandboxedRepositoryCloner = defaultCloner,
  architectureRules: ArchitectureRule[] = [],
): Promise<AnalysisOutput> {
  const isLocal = repository.startsWith('/') || repository.startsWith('./') || repository.startsWith('../');
  let targetDir = repository;
  let workspace: ClonedWorkspace | null = null;
  let commitSha: string | undefined;

  if (!isLocal) {
    workspace = await cloner.clone({ repository, branch });
    targetDir = workspace.path;
    commitSha = workspace.commitSha;
  }

  try {
    const files = await collectFilesFromDir(targetDir);
    if (files.length === 0) {
      return {
        score: 100,
        decision: 'approve',
        analyzedFiles: 0,
        findings: [],
        architecture: { nodes: [], edges: [], cycles: [], drift: [] },
        dependencies: [],
        gate: { passed: true, reasons: [], decision: 'approve' },
        categoryScores: { architecture: 100, security: 100, testing: null, dependencies: 100 },
        commitSha,
        aiInsight: 'No analyzable source files found in repository.',
      };
    }

    // 1. Run domain rules analysis
    const result = analyze({ files, rules: defaultRules });

    // 2. Run architecture dependency analysis
    const graph: ArchitectureGraph = buildDependencyGraph(files);
    const cycles = findCycles(graph);
    const drift: Drift[] = detectDrift(graph, {});

    // Evaluate custom architecture rules
    if (architectureRules && architectureRules.length > 0) {
      const customFindings = evaluateArchitectureRules(graph, architectureRules);
      result.findings.push(...customFindings);
    } else {
      // Default cycle detection if no custom rules configured
      for (const cycle of cycles) {
        result.findings.push({
          id: `ARCH-CYCLE-${cycle.join('-')}`,
          severity: 'high',
          category: 'architecture',
          status: 'open',
          decision: 'review_required',
          file: cycle[0] ?? 'unknown',
          title: 'Circular dependency cycle detected',
          description: `Cycle: ${cycle.join(' -> ')}`,
          suggestion: 'Decouple circular module dependencies into separate abstractions.',
          confidence: 0.95,
          source: 'deterministic',
          ruleId: 'architecture.cycle-detected',
        });
      }
    }

    // Recalculate score including architecture findings
    result.score = calculateScore(result.findings);

    // 3. Extract real dependencies across all multi-language manifests
    const dependencies = extractAllDependencies(files);

    // 4. Calculate category scores
    const archFindings = result.findings.filter((f) => f.category === 'architecture' && f.status === 'open');
    const secFindings = result.findings.filter((f) => f.category === 'security' && f.status === 'open');
    const depFindings = result.findings.filter((f) => f.category === 'dependency' && f.status === 'open');

    const penalties = { critical: 35, high: 20, medium: 10, low: 3, info: 0 } as const;
    const calcCategory = (findings: Finding[]) =>
      Math.max(0, Math.min(100, 100 - findings.reduce((acc, f) => acc + (penalties[f.severity as keyof typeof penalties] ?? 0), 0)));

    const archScore = calcCategory(archFindings);
    const secScore = calcCategory(secFindings);
    const depScore = calcCategory(depFindings);

    // 5. Evaluate Quality Gate
    const gate = evaluateGate(result.score, result.findings, { minimumScore: 80, blockOn: ['critical', 'high'] });

    let aiInsight: string | undefined;
    if (result.findings.length > 0) {
      const topFinding = result.findings[0];
      aiInsight = `QualityGuard detected ${result.findings.length} findings across ${files.length} analyzed files. Primary area to address: ${topFinding?.title} in ${topFinding?.file}.`;
    } else {
      aiInsight = `Clean architecture and zero open findings across ${files.length} analyzed files. Quality gate passed.`;
    }

    return {
      score: result.score,
      decision: gate.decision,
      analyzedFiles: files.length,
      findings: result.findings,
      architecture: {
        nodes: graph.nodes,
        edges: graph.edges,
        cycles,
        drift,
      },
      dependencies,
      gate,
      categoryScores: {
        architecture: archScore,
        security: secScore,
        testing: null, // Test coverage is unavailable without runtime test runner (Rule 12)
        dependencies: depScore,
      },
      commitSha,
      aiInsight,
    };
  } finally {
    if (workspace) {
      await workspace.cleanup();
    }
  }
}
