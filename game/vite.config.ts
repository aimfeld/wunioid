import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';

/** Every file below `dir`, as paths relative to `root` with '/' separators. */
function walk(dir: string, root = dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name), root) : [relative(root, join(dir, e.name)).split('\\').join('/')]);
}

/** Writes dist/sw.js (template: sw.js) with the list of built files and a hash of their contents. */
function offlinePlugin(): Plugin {
  let outDir = 'dist';
  return {
    name: 'wunioid-offline',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const core = walk(outDir).filter((f) => f !== 'sw.js').sort();
      const hash = createHash('sha256');
      for (const f of core) hash.update(f).update(readFileSync(join(outDir, f)));
      const build = { core, coreVersion: hash.digest('hex').slice(0, 12) };
      const template = readFileSync(new URL('sw.js', import.meta.url), 'utf8');
      writeFileSync(join(outDir, 'sw.js'), `self.__BUILD__ = ${JSON.stringify(build)};\n${template}`);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [offlinePlugin()],
  test: { environment: 'node' },
});
