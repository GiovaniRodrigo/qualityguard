import type { DependencyItem } from '@qualityguard/domain';

/**
 * Extracts dependencies from Rust Cargo.toml
 */
export function extractCargoToml(content: string, manifestPath: string = 'Cargo.toml'): DependencyItem[] {
  const items: DependencyItem[] = [];
  const seen = new Set<string>();

  let section = '';
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    let trimmed = line.trim();
    const commentIdx = trimmed.indexOf('#');
    if (commentIdx !== -1) {
      trimmed = trimmed.slice(0, commentIdx).trim();
    }
    if (!trimmed) continue;

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      section = trimmed.slice(1, -1).trim();
      continue;
    }

    const isDepSection =
      section === 'dependencies' ||
      section === 'workspace.dependencies' ||
      section === 'dev-dependencies' ||
      section === 'build-dependencies' ||
      section.startsWith('dependencies.') ||
      section.startsWith('dev-dependencies.') ||
      section.startsWith('build-dependencies.');

    if (isDepSection) {
      const match = trimmed.match(/^([a-zA-Z0-9_-]+)\s*=\s*(.+)$/);
      if (match && match[1] && match[2]) {
        const name = match[1];
        const val = match[2].trim();

        let version = '*';
        let optional = false;
        let features: string[] | undefined;

        if (val.startsWith('"') || val.startsWith("'")) {
          version = val.replace(/^["']|["']$/g, '');
        } else if (val.startsWith('{')) {
          const vMatch = val.match(/version\s*=\s*["']([^"']+)["']/);
          if (vMatch && vMatch[1]) {
            version = vMatch[1];
          }
          const optMatch = val.match(/optional\s*=\s*true/);
          if (optMatch) {
            optional = true;
          }
          const featMatch = val.match(/features\s*=\s*\[([^\]]+)\]/);
          if (featMatch && featMatch[1]) {
            features = featMatch[1].split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
          }
        }

        const type = section.includes('dev')
          ? 'devDependency'
          : section.includes('build')
            ? 'buildDependency'
            : 'dependency';

        const metadata: Record<string, unknown> = {};
        if (features && features.length > 0) {
          metadata.features = features;
        }

        const dedupKey = `${name}@${version}`;
        if (!seen.has(dedupKey)) {
          seen.add(dedupKey);
          items.push({
            name,
            version,
            ecosystem: 'cargo',
            manifest: manifestPath,
            type,
            optional,
            indirect: false,
            metadata,
          });
        }
      }
    }
  }

  return items;
}
