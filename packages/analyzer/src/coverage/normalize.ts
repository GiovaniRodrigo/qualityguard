/**
 * Normalizes file paths from coverage artifacts (LCOV, JaCoCo) into clean,
 * relative repository paths suitable for monorepos and cross-platform reports.
 */
export function normalizeCoveragePath(rawPath: string): string {
  if (!rawPath || typeof rawPath !== 'string') return '';

  let p = rawPath.trim();
  if (!p) return '';

  // 1. Replace Windows backslashes with POSIX slashes
  p = p.replace(/\\/g, '/');

  // 2. Strip Windows drive letters (e.g. C:/ or D:/)
  p = p.replace(/^[a-zA-Z]:\//, '/');

  // 3. Normalize multiple consecutive slashes
  p = p.replace(/\/+/g, '/');

  // 4. Strip common CI / container / workspace prefixes
  // e.g. /home/runner/work/repo/repo/apps/api/src/foo.ts -> apps/api/src/foo.ts
  // e.g. /workspace/packages/core/src/foo.ts -> packages/core/src/foo.ts
  // e.g. /app/apps/web/page.tsx -> apps/web/page.tsx
  const knownPrefixes = [
    /^\/home\/runner\/work\/[^/]+\/[^/]+\//,
    /^\/home\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\//,
    /^\/workspace\//,
    /^\/workspaces\/[^/]+\//,
    /^\/builds\/[^/]+\/[^/]+\//,
    /^\/app\//,
  ];

  for (const prefix of knownPrefixes) {
    if (prefix.test(p)) {
      p = p.replace(prefix, '');
      break;
    }
  }

  // 5. Strip leading ./ or /
  p = p.replace(/^(\.\/|\/)+/, '');

  // 6. Remove redundant /./ segments and resolve /../ safely
  const segments = p.split('/');
  const resolved: string[] = [];
  for (const seg of segments) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      if (resolved.length > 0 && resolved[resolved.length - 1] !== '..') {
        resolved.pop();
      }
    } else {
      resolved.push(seg);
    }
  }

  return resolved.join('/');
}
