import type { DependencyItem } from '@qualityguard/domain';

/**
 * Parses PEP 508 requirement specification line.
 * Examples:
 *   fastapi==0.115.0
 *   uvicorn[standard]>=0.30.0
 *   requests[socks]>=2.31.0; python_version >= "3.10"
 *   pytest
 */
function parsePep508Requirement(
  rawLine: string,
  manifest: string,
  defaultType: string = 'dependency',
  isOptional: boolean = false,
): DependencyItem | null {
  let line = rawLine.trim();
  // Strip inline comments
  const hashIdx = line.indexOf('#');
  if (hashIdx !== -1) {
    line = line.slice(0, hashIdx).trim();
  }
  if (!line) return null;

  // Check for command flags / includes
  if (line.startsWith('-') || line.startsWith('--')) {
    return null;
  }

  // Split environment markers separated by ';'
  let markers: string | undefined;
  if (line.includes(';')) {
    const parts = line.split(';');
    line = (parts[0] ?? '').trim();
    markers = parts.slice(1).join(';').trim();
  }

  // Match package name, optional extras, and version specifiers
  // Regex captures: 1: name, 2: extras string without brackets, 3: version specifier
  const match = line.match(/^([a-zA-Z0-9_.-]+)(?:\[([a-zA-Z0-9_.,\s-]+)\])?\s*(.*)$/);
  if (!match || !match[1]) {
    return null;
  }

  const name = match[1].toLowerCase();
  const extrasRaw = match[2];
  const versionRaw = match[3]?.trim();

  const extras = extrasRaw
    ? extrasRaw
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean)
    : undefined;

  const version = versionRaw && versionRaw.length > 0 ? versionRaw : '*';

  const metadata: Record<string, unknown> = {};
  if (extras && extras.length > 0) metadata.extras = extras;
  if (markers) metadata.markers = markers;

  return {
    name,
    version,
    ecosystem: 'python',
    manifest,
    type: defaultType,
    optional: isOptional,
    indirect: false,
    metadata,
  };
}

/**
 * Extracts dependencies from standard Python requirements.txt
 */
export function extractRequirementsTxt(content: string, manifestPath: string = 'requirements.txt'): DependencyItem[] {
  const items: DependencyItem[] = [];
  const seen = new Set<string>();

  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const item = parsePep508Requirement(line, manifestPath);
    if (item) {
      const key = `${item.name}@${item.version}`;
      if (!seen.has(key)) {
        seen.add(key);
        items.push(item);
      }
    }
  }

  return items;
}

/**
 * Extracts dependencies from pyproject.toml (PEP 621 & Poetry formats)
 */
export function extractPyprojectToml(content: string, manifestPath: string = 'pyproject.toml'): DependencyItem[] {
  const items: DependencyItem[] = [];
  const seen = new Set<string>();

  let currentSection = '';
  let insideArray = false;
  let arraySection = '';
  let arrayOptionalGroup = '';

  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const currentRaw = lines[i];
    if (currentRaw === undefined) continue;
    let line = currentRaw.trim();
    const commentIdx = line.indexOf('#');
    if (commentIdx !== -1) {
      line = line.slice(0, commentIdx).trim();
    }
    if (!line) continue;

    // Header matching [section] or [section.subsection]
    if (line.startsWith('[') && line.endsWith(']')) {
      currentSection = line.slice(1, -1).trim();
      insideArray = false;
      continue;
    }

    // Handle multiline arrays: dependencies = [ ... ]
    if (!insideArray && line.includes('=')) {
      const eqIdx = line.indexOf('=');
      const key = line.slice(0, eqIdx).trim();
      const val = line.slice(eqIdx + 1).trim();

      if (
        (currentSection === 'project' && key === 'dependencies') ||
        (currentSection.startsWith('project.optional-dependencies') || currentSection === 'project.optional-dependencies')
      ) {
        if (val.startsWith('[')) {
          arraySection = currentSection;
          arrayOptionalGroup = currentSection.startsWith('project.optional-dependencies.')
            ? currentSection.replace('project.optional-dependencies.', '')
            : key;

          // Single-line array check: dependencies = ["fastapi>=0.115.0", "uvicorn>=0.30.0"]
          if (val.endsWith(']') && val.length > 2) {
            const inner = val.slice(1, -1);
            const matches = inner.match(/["']([^"']+)["']/g);
            if (matches) {
              for (const m of matches) {
                const clean = m.replace(/^["']|["']$/g, '').trim();
                const isOpt = arraySection.includes('optional') || arrayOptionalGroup !== 'dependencies';
                const depType = isOpt ? 'devDependency' : 'dependency';
                const parsed = parsePep508Requirement(clean, manifestPath, depType, isOpt);
                if (parsed) {
                  const dedupKey = `${parsed.name}@${parsed.version}`;
                  if (!seen.has(dedupKey)) {
                    seen.add(dedupKey);
                    items.push(parsed);
                  }
                }
              }
            }
          } else {
            insideArray = true;
          }
          continue;
        }
      }
    }

    if (insideArray) {
      const trimmed = line.trim();
      if (trimmed === ']' || trimmed === '],') {
        insideArray = false;
        continue;
      }

      const matchQuoted = trimmed.match(/^["'](.*)["'],?$/);
      const rawString = matchQuoted ? matchQuoted[1] : trimmed.replace(/^[\[\s,'"]+|[\]\s,'"]+$/g, '').trim();

      if (rawString) {
        const isOpt = arraySection.includes('optional') || arrayOptionalGroup !== 'dependencies';
        const depType = isOpt ? 'devDependency' : 'dependency';
        const parsed = parsePep508Requirement(rawString, manifestPath, depType, isOpt);
        if (parsed) {
          const dedupKey = `${parsed.name}@${parsed.version}`;
          if (!seen.has(dedupKey)) {
            seen.add(dedupKey);
            items.push(parsed);
          }
        }
      }

      if (trimmed.endsWith(']') || trimmed.endsWith('],')) {
        insideArray = false;
      }
      continue;
    }

    // Handle Poetry format: [tool.poetry.dependencies] or [tool.poetry.group.*.dependencies]
    if (
      currentSection === 'tool.poetry.dependencies' ||
      currentSection.startsWith('tool.poetry.group.') && currentSection.endsWith('.dependencies')
    ) {
      const match = line.match(/^([a-zA-Z0-9_.-]+)\s*=\s*(.+)$/);
      if (match && match[1] && match[2]) {
        const name = match[1].toLowerCase();
        if (name === 'python') continue; // Skip Python runtime constraint

        const val = match[2].trim();
        let version = '*';
        let extras: string[] | undefined;

        if (val.startsWith('"') || val.startsWith("'")) {
          version = val.replace(/^["']|["']$/g, '');
        } else if (val.startsWith('{')) {
          const vMatch = val.match(/version\s*=\s*["']([^"']+)["']/);
          if (vMatch && vMatch[1]) {
            version = vMatch[1];
          }
          const eMatch = val.match(/extras\s*=\s*\[([^\]]+)\]/);
          if (eMatch && eMatch[1]) {
            extras = eMatch[1].split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
          }
        }

        const isDev = currentSection.includes('.dev.') || currentSection.includes('.test.');
        const type = isDev ? 'devDependency' : 'dependency';
        const metadata: Record<string, unknown> = {};
        if (extras) metadata.extras = extras;

        const dedupKey = `${name}@${version}`;
        if (!seen.has(dedupKey)) {
          seen.add(dedupKey);
          items.push({
            name,
            version,
            ecosystem: 'python',
            manifest: manifestPath,
            type,
            optional: isDev,
            indirect: false,
            metadata,
          });
        }
      }
    }
  }

  return items;
}
