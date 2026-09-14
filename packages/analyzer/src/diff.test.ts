import { describe, expect, it } from 'vitest';
import { changedSourceFiles, parseUnifiedDiff } from './diff.js';

describe('parseUnifiedDiff', () => {
  it('parses additions, deletions and hunk line numbers', () => {
    const diff = `diff --git a/src/application/UserService.ts b/src/application/UserService.ts
index 123..456 100644
--- a/src/application/UserService.ts
+++ b/src/application/UserService.ts
@@ -10,2 +10,3 @@
 const a = 1;
+const b = 2;
-const c = 3;`;

    const [file] = parseUnifiedDiff(diff);
    expect(file).toMatchObject({ path: 'src/application/UserService.ts', additions: 1, deletions: 1 });
    expect(file?.patch).toContain('+const b = 2;');
  });

  it('detects new, deleted and renamed files', () => {
    const diff = `diff --git a/src/a.ts b/src/a.ts
new file mode 100644
--- /dev/null
+++ b/src/a.ts
@@ -0,0 +1 @@
+export const a = 1;
diff --git a/src/b.ts b/src/b.ts
deleted file mode 100644
--- a/src/b.ts
+++ /dev/null
@@ -1 +0,0 @@
-export const b = 1;
diff --git a/src/c.ts b/src/d.ts
similarity index 90%
rename from src/c.ts
rename to src/d.ts`;

    const files = parseUnifiedDiff(diff);
    expect(files.map((file) => file.change)).toEqual(['added', 'deleted', 'renamed']);
    expect(files[2]?.previousPath).toBe('src/c.ts');
  });
});

describe('changedSourceFiles', () => {
  it('excludes deleted and non-source files', () => {
    const diff = `diff --git a/README.md b/README.md
@@ -1 +1 @@
-a
+b
diff --git a/src/a.ts b/src/a.ts
@@ -1 +1 @@
-a
+b
diff --git a/src/b.ts b/src/b.ts
deleted file mode 100644
@@ -1 +0,0 @@
-a`;
    expect(changedSourceFiles(diff).map((file) => file.path)).toEqual(['src/a.ts']);
  });
});
