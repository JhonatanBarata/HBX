import { cpSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { defineConfig } from 'tsup';

const DIST_DIR = 'dist';
const DIST_TRANSLATIONS_DIR = join(DIST_DIR, 'translations');
const LEGACY_DIST_DIRECTORIES = ['@types', 'api', 'cache', 'config', 'exceptions', 'utils', 'validate'];

function removeLegacyBuildArtifacts() {
  for (const directory of LEGACY_DIST_DIRECTORIES) {
    rmSync(join(DIST_DIR, directory), { recursive: true, force: true });
  }

  for (const fileName of readdirSync(DIST_DIR)) {
    if (fileName.endsWith('.mjs') || fileName.endsWith('.map')) {
      rmSync(join(DIST_DIR, fileName), { force: true });
    }
  }
}

export default defineConfig({
  entry: {
    main: 'src/main.ts',
  },
  outDir: 'dist',
  platform: 'node',
  target: 'node20',
  bundle: true,
  skipNodeModulesBundle: true,
  splitting: false,
  sourcemap: false,
  clean: true,
  minify: false,
  format: ['cjs'],
  outExtension() {
    return {
      js: '.js',
    };
  },
  onSuccess: async () => {
    removeLegacyBuildArtifacts();
    rmSync(DIST_TRANSLATIONS_DIR, { recursive: true, force: true });
    cpSync('src/utils/translations', DIST_TRANSLATIONS_DIR, { recursive: true });
  },
  loader: {
    '.json': 'file',
    '.yml': 'file',
  },
});
