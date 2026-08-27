import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const scannedRoots = ['src', 'public'].map((path) => join(repositoryRoot, path));
const scannedExtensions = new Set(['.astro', '.css', '.svg', '.ts']);
const absoluteLengthPattern = /-?(?:\d+\.?\d*|\.\d+)(?:px|pt|pc|cm|mm|in)\b/gi;

async function collectFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);

      if (entry.isDirectory()) {
        return collectFiles(path);
      }

      return scannedExtensions.has(extname(entry.name)) ? [path] : [];
    })
  );

  return files.flat();
}

describe('responsive sizing policy', () => {
  it('does not use absolute CSS length units in application source or public assets', async () => {
    const files = (await Promise.all(scannedRoots.map(collectFiles))).flat();
    const violations: string[] = [];

    for (const path of files) {
      const content = await readFile(path, 'utf8');
      const matches = content.match(absoluteLengthPattern);

      if (matches) {
        violations.push(`${relative(repositoryRoot, path)}: ${[...new Set(matches)].join(', ')}`);
      }
    }

    expect(violations).toEqual([]);
  });
});
