import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import { scanPackage } from './scan-package.js';
import { scanDocker } from './scan-docker.js';
import { scanConfig } from './scan-config.js';
import { diagnose } from './diagnose.js';
import { formatReport } from './report.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MATRIX_PATH = resolve(__dirname, '..', 'data', 'compatibility-matrix.json');

export async function loadMatrix(path = MATRIX_PATH) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function runDoctor({ projectDir = process.cwd(), color = true } = {}) {
  const matrix = await loadMatrix();
  const [pkg, docker, config] = await Promise.all([
    scanPackage(projectDir),
    scanDocker(),
    scanConfig(projectDir),
  ]);

  const diagnostics = diagnose({ pkg, docker, config, matrix });
  const report = formatReport(diagnostics, { color, projectDir });

  return {
    diagnostics,
    report,
    raw: { pkg, docker, config },
    matrix: { version: matrix.version, verifiedAt: matrix.verifiedAt },
  };
}

export { scanPackage, scanDocker, scanConfig, diagnose, formatReport };
