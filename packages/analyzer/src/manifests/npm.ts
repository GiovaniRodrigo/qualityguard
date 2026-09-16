import type { DependencyItem } from '@qualityguard/domain';

/**
 * Extracts dependencies from npm package.json
 */
export function extractPackageJson(content: string, manifestPath: string = 'package.json'): DependencyItem[] {
  const items: DependencyItem[] = [];
  const seen = new Set<string>();

  try {
    const pkg = JSON.parse(content);

    const sections: Array<{ key: string; type: string; optional: boolean }> = [
      { key: 'dependencies', type: 'dependency', optional: false },
      { key: 'devDependencies', type: 'devDependency', optional: false },
      { key: 'peerDependencies', type: 'peerDependency', optional: true },
      { key: 'optionalDependencies', type: 'optionalDependency', optional: true },
    ];

    for (const { key, type, optional } of sections) {
      const deps = pkg[key];
      if (deps && typeof deps === 'object' && !Array.isArray(deps)) {
        for (const [name, version] of Object.entries(deps)) {
          const strVersion = String(version);
          const dedupKey = `${name}@${strVersion}`;
          if (!seen.has(dedupKey)) {
            seen.add(dedupKey);
            items.push({
              name,
              version: strVersion,
              ecosystem: 'npm',
              manifest: manifestPath,
              type,
              optional,
              indirect: false,
              metadata: {},
            });
          }
        }
      }
    }
  } catch {}

  return items;
}
