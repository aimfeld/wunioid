import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';

/** Every file below `dir`, as paths relative to `root` with '/' separators. */
function walk(dir: string, root = dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name), root) : [relative(root, join(dir, e.name)).split('\\').join('/')]);
}

/** Writes dist/sw.js (template: sw.js) with the lists of built files, core and music, and hashes of their contents. */
function offlinePlugin(): Plugin {
  let outDir = 'dist';
  return {
    name: 'wunioid-offline',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const files = walk(outDir).filter((f) => f !== 'sw.js').sort();
      const version = (list: string[]) => {
        const hash = createHash('sha256');
        for (const f of list) hash.update(f).update(readFileSync(join(outDir, f)));
        return hash.digest('hex').slice(0, 12);
      };
      const media = files.filter((f) => f.startsWith('music/'));
      const core = files.filter((f) => !media.includes(f));
      const build = { core, media, coreVersion: version(core), mediaVersion: version(media) };
      const template = readFileSync(new URL('sw.js', import.meta.url), 'utf8');
      writeFileSync(join(outDir, 'sw.js'), `self.__BUILD__ = ${JSON.stringify(build)};\n${template}`);
    },
  };
}

/**
 * `npm run dev` only: POST /__wunioid/save-course runs tools/save_course.py, the Remastered editor's Save into the
 * course sources (src/devSave.ts). One save at a time; only from the game's own page.
 */
function saveCoursePlugin(): Plugin {
  return {
    name: 'wunioid-save-course',
    apply: 'serve',
    configureServer(server) {
      const repo = resolve(server.config.root, '..');
      const args = [join(repo, 'tools/save_course.py'), join(repo, 'courses'), join(server.config.publicDir, 'data'), join(repo, 'original_source')];
      let queue = Promise.resolve();
      server.middlewares.use('/__wunioid/save-course', (req, res) => {
        const origin = req.headers.origin;
        if (req.method !== 'POST' || req.headers['content-type'] !== 'application/json' ||
          (origin !== undefined && new URL(origin).host !== req.headers.host)) {
          res.statusCode = 403;
          res.end();
          return;
        }
        const body: Buffer[] = [];
        req.on('data', (chunk: Buffer) => body.push(chunk));
        req.on('end', () => {
          queue = queue.then(() => new Promise<void>((done) => {
            const answer = (json: string) => {
              if (res.writableEnded) return; // 'error' and 'close' both come when python3 can't start
              res.setHeader('Content-Type', 'application/json');
              res.end(json);
              done();
            };
            const py = spawn('python3', args, { cwd: repo });
            let out = '', err = '';
            py.stdout.on('data', (d: Buffer) => out += d);
            py.stderr.on('data', (d: Buffer) => err += d);
            py.on('error', (e) => answer(JSON.stringify({ ok: false, error: `python3: ${e.message}` })));
            py.on('close', (code) => {
              if (err) server.config.logger.info(err.trimEnd());
              answer(code === 0 ? out : JSON.stringify({ ok: false, error: err.trim().split('\n').pop() || `save_course.py: exit ${code}` }));
            });
            py.stdin.end(Buffer.concat(body));
          }));
        });
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [offlinePlugin(), saveCoursePlugin()],
  test: { environment: 'node' },
});
