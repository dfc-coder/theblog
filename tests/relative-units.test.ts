import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sourceRoot = fileURLToPath(new URL('../src', import.meta.url));
const scannedExtensions = new Set(['.astro', '.css', '.ts']);
const absoluteLengthPattern = /-?(?:\d+\.?\d*|\.\d+)(?:px|pt|pc|cm|mm|in)\b/gi;

async function collectSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);

      if (entry.isDirectory()) {
        return collectSourceFiles(path);
      }

      return scannedExtensions.has(extname(entry.name)) ? [path] : [];
    })
  );

  return files.flat();
}

describe('responsive sizing policy', () => {
  it('does not use absolute CSS length units in source files', async () => {
    const files = await collectSourceFiles(sourceRoot);
    const violations: string[] = [];

    for (const path of files) {
      const content = await readFile(path, 'utf8');
      const matches = content.match(absoluteLengthPattern);

      if (matches) {
        violations.push(`${relative(sourceRoot, path)}: ${[...new Set(matches)].join(', ')}`);
      }
    }

    expect(violations).toEqual([]);
  });
});
