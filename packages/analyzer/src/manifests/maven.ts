import type { DependencyItem } from '@qualityguard/domain';

/**
 * Extracts dependencies from Maven pom.xml with property interpolation
 */
export function extractPomXml(content: string, manifestPath: string = 'pom.xml'): DependencyItem[] {
  const items: DependencyItem[] = [];
  const seen = new Set<string>();

  // 1. Extract properties: <properties><name>value</name></properties>
  const properties: Record<string, string> = {};
  const propertiesMatch = content.match(/<properties>([\s\S]*?)<\/properties>/i);
  if (propertiesMatch && propertiesMatch[1]) {
    const propRegex = /<([a-zA-Z0-9_.-]+)>([\s\S]*?)<\/\1>/gi;
    let match: RegExpExecArray | null;
    while ((match = propRegex.exec(propertiesMatch[1])) !== null) {
      const key = match[1];
      const val = match[2];
      if (key && val) {
        properties[key] = val.trim();
      }
    }
  }

  // 2. Extract dependency tags: <dependency>...</dependency>
  const depBlockRegex = /<dependency>([\s\S]*?)<\/dependency>/gi;
  let depMatch: RegExpExecArray | null;

  while ((depMatch = depBlockRegex.exec(content)) !== null) {
    const depXml = depMatch[1];
    if (!depXml) continue;

    const groupIdMatch = depXml.match(/<groupId>([\s\S]*?)<\/groupId>/i);
    const artifactIdMatch = depXml.match(/<artifactId>([\s\S]*?)<\/artifactId>/i);
    const versionMatch = depXml.match(/<version>([\s\S]*?)<\/version>/i);
    const scopeMatch = depXml.match(/<scope>([\s\S]*?)<\/scope>/i);
    const optionalMatch = depXml.match(/<optional>([\s\S]*?)<\/optional>/i);

    const groupId = groupIdMatch && groupIdMatch[1] ? groupIdMatch[1].trim() : undefined;
    const artifactId = artifactIdMatch && artifactIdMatch[1] ? artifactIdMatch[1].trim() : undefined;
    if (!groupId || !artifactId) continue;

    const rawVersion = versionMatch && versionMatch[1] ? versionMatch[1].trim() : undefined;
    const scope = scopeMatch && scopeMatch[1] ? scopeMatch[1].trim().toLowerCase() : 'compile';
    const isOptional = optionalMatch && optionalMatch[1] ? optionalMatch[1].trim().toLowerCase() === 'true' : false;

    // Resolve version property interpolation: ${property.name}
    let version = rawVersion;
    if (version && version.startsWith('${') && version.endsWith('}')) {
      const propKey = version.slice(2, -1).trim();
      if (properties[propKey]) {
        version = properties[propKey];
      }
    }

    const name = `${groupId}:${artifactId}`;
    const type =
      scope === 'test'
        ? 'devDependency'
        : scope === 'provided'
          ? 'buildDependency'
          : 'dependency';

    const dedupKey = `${name}@${version ?? '*'}`;
    if (!seen.has(dedupKey)) {
      seen.add(dedupKey);
      items.push({
        name,
        version: version ?? '*',
        ecosystem: 'maven',
        manifest: manifestPath,
        type,
        optional: isOptional,
        indirect: false,
        metadata: {
          groupId,
          artifactId,
          scope,
        },
      });
    }
  }

  return items;
}
