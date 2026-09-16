import type { DependencyItem } from '@qualityguard/domain';
import type { SourceFile } from '../rules.js';
import { extractRequirementsTxt, extractPyprojectToml } from './python.js';
import { extractGoMod } from './go.js';
import { extractPomXml } from './maven.js';
import { extractCargoToml } from './cargo.js';
import { extractPackageJson } from './npm.js';

export {
  extractRequirementsTxt,
  extractPyprojectToml,
  extractGoMod,
  extractPomXml,
  extractCargoToml,
  extractPackageJson,
};

/**
 * Extracts and normalizes dependencies across all supported multi-language manifests in a codebase
 */
export function extractAllDependencies(files: SourceFile[]): DependencyItem[] {
  const dependencies: DependencyItem[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    const filename = file.path.split('/').pop() ?? file.path;
    let extracted: DependencyItem[] = [];

    if (filename === 'package.json') {
      extracted = extractPackageJson(file.content, file.path);
    } else if (filename === 'requirements.txt' || filename.endsWith('.requirements.txt')) {
      extracted = extractRequirementsTxt(file.content, file.path);
    } else if (filename === 'pyproject.toml') {
      extracted = extractPyprojectToml(file.content, file.path);
    } else if (filename === 'go.mod') {
      extracted = extractGoMod(file.content, file.path);
    } else if (filename === 'pom.xml') {
      extracted = extractPomXml(file.content, file.path);
    } else if (filename === 'Cargo.toml') {
      extracted = extractCargoToml(file.content, file.path);
    }

    for (const item of extracted) {
      const dedupKey = `${item.ecosystem}:${item.name}@${item.version}:${item.manifest}`;
      if (!seen.has(dedupKey)) {
        seen.add(dedupKey);
        dependencies.push(item);
      }
    }
  }

  return dependencies;
}
