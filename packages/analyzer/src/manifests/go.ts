import type { DependencyItem } from '@qualityguard/domain';

/**
 * Extracts dependencies from Go Modules manifest (go.mod)
 */
export function extractGoMod(content: string, manifestPath: string = 'go.mod'): DependencyItem[] {
  const items: DependencyItem[] = [];
  const seen = new Set<string>();

  let moduleName: string | undefined;
  let goVersion: string | undefined;
  let insideRequireBlock = false;

  const lines = content.split(/\r?\n/);

  // First pass: extract module and go version metadata
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('module ')) {
      moduleName = trimmed.replace(/^module\s+/, '').trim();
    } else if (trimmed.startsWith('go ')) {
      goVersion = trimmed.replace(/^go\s+/, '').trim();
    }
  }

  const baseMetadata: Record<string, unknown> = {};
  if (moduleName) baseMetadata.module = moduleName;
  if (goVersion) baseMetadata.goVersion = goVersion;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) continue;

    // Detect require block start
    if (trimmed === 'require (' || trimmed.startsWith('require (')) {
      insideRequireBlock = true;
      continue;
    }

    if (insideRequireBlock && trimmed === ')') {
      insideRequireBlock = false;
      continue;
    }

    if (insideRequireBlock) {
      const isIndirect = trimmed.includes('// indirect');
      const cleanLine = (trimmed.split('//')[0] ?? '').trim();
      const parts = cleanLine.split(/\s+/);
      const name = parts[0];
      const version = parts[1];
      if (name && version) {
        const dedupKey = `${name}@${version}`;
        if (!seen.has(dedupKey)) {
          seen.add(dedupKey);
          items.push({
            name,
            version,
            ecosystem: 'go',
            manifest: manifestPath,
            type: 'dependency',
            optional: false,
            indirect: isIndirect,
            metadata: { ...baseMetadata },
          });
        }
      }
      continue;
    }

    // Single-line require: require github.com/gin-gonic/gin v1.10.0
    if (trimmed.startsWith('require ')) {
      const isIndirect = trimmed.includes('// indirect');
      const cleanLine = (trimmed.replace(/^require\s+/, '').split('//')[0] ?? '').trim();
      const parts = cleanLine.split(/\s+/);
      const name = parts[0];
      const version = parts[1];
      if (name && version) {
        const dedupKey = `${name}@${version}`;
        if (!seen.has(dedupKey)) {
          seen.add(dedupKey);
          items.push({
            name,
            version,
            ecosystem: 'go',
            manifest: manifestPath,
            type: 'dependency',
            optional: false,
            indirect: isIndirect,
            metadata: { ...baseMetadata },
          });
        }
      }
    }
  }

  return items;
}
