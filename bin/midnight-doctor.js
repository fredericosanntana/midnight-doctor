#!/usr/bin/env node
import { runDoctor } from '../lib/index.js';
import { resolve } from 'node:path';

function parseArgs(argv) {
  const args = { json: false, dir: process.cwd(), help: false, version: false, noColor: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json' || a === '-j') args.json = true;
    else if (a === '--no-color') args.noColor = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--version' || a === '-v') args.version = true;
    else if (a === '--dir' || a === '-d') args.dir = resolve(argv[++i] || '.');
    else if (!a.startsWith('-')) args.dir = resolve(a);
  }
  return args;
}

function printHelp() {
  process.stdout.write(`midnight-doctor — pre-flight check for Midnight Network projects

Usage:
  midnight-doctor [path]            Run checks against the given project (defaults to cwd)
  midnight-doctor --json            Emit JSON instead of pretty output
  midnight-doctor --no-color        Disable ANSI colors
  midnight-doctor --version         Print version
  midnight-doctor --help            Show this help

Exit codes:
  0  — no errors (warnings allowed)
  1  — at least one error
  2  — internal failure

Examples:
  midnight-doctor
  midnight-doctor ~/projects/my-midnight-app
  midnight-doctor --json | jq '.diagnostics[] | select(.severity == "error")'
`);
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    printHelp();
    return 0;
  }

  if (args.version) {
    const { readFile } = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');
    const { dirname, resolve } = await import('node:path');
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(await readFile(resolve(here, '..', 'package.json'), 'utf8'));
    process.stdout.write(`midnight-doctor v${pkg.version}\n`);
    return 0;
  }

  const isTTY = process.stdout.isTTY;
  const color = !args.noColor && isTTY && !args.json;

  let result;
  try {
    result = await runDoctor({ projectDir: args.dir, color });
  } catch (err) {
    process.stderr.write(`midnight-doctor: internal error — ${err.message}\n`);
    return 2;
  }

  if (args.json) {
    process.stdout.write(JSON.stringify(
      {
        projectDir: args.dir,
        matrix: result.matrix,
        diagnostics: result.diagnostics,
        counts: result.report.counts,
      },
      null,
      2,
    ) + '\n');
  } else {
    process.stdout.write(result.report.text + '\n');
  }

  return result.report.counts.error > 0 ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`midnight-doctor: fatal — ${err.stack || err.message}\n`);
    process.exit(2);
  },
);
