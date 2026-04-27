import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function scanConfig(projectDir) {
  const findings = {
    npmrc: null,
    indexerYml: null,
    envFiles: [],
  };

  // .npmrc — flag the bogus npm.midnight.network registry
  try {
    const content = await readFile(join(projectDir, '.npmrc'), 'utf8');
    findings.npmrc = {
      exists: true,
      content,
      hasBogusRegistry: /npm\.midnight\.network/i.test(content),
    };
  } catch {
    findings.npmrc = { exists: false };
  }

  // indexer.yml / indexer-config.yml
  for (const fname of ['indexer.yml', 'indexer-config.yml', 'config/indexer.yml']) {
    try {
      const content = await readFile(join(projectDir, fname), 'utf8');
      findings.indexerYml = {
        path: fname,
        content,
        hasSubscription: /^subscription\s*:/m.test(content),
      };
      break;
    } catch {
      // try next
    }
  }

  // .env / .env.local — just record presence (don't read secrets)
  for (const fname of ['.env', '.env.local', '.env.example', '.env.template']) {
    try {
      await readFile(join(projectDir, fname), 'utf8');
      findings.envFiles.push(fname);
    } catch {
      // skip
    }
  }

  return findings;
}
