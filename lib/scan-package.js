import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const MIDNIGHT_NS = '@midnight-ntwrk';

export async function scanPackage(projectDir) {
  const findings = {
    packageJsonFound: false,
    declared: {},
    installed: {},
    duplicates: {},
    missingNodeModules: false,
  };

  const pkgPath = join(projectDir, 'package.json');
  let pkg;
  try {
    pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
    findings.packageJsonFound = true;
  } catch {
    return findings;
  }

  const allDeps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
    ...(pkg.peerDependencies || {}),
  };

  for (const [name, version] of Object.entries(allDeps)) {
    if (name.startsWith(MIDNIGHT_NS + '/')) {
      findings.declared[name] = version;
    }
  }

  const nmPath = join(projectDir, 'node_modules', MIDNIGHT_NS);
  try {
    await stat(nmPath);
  } catch {
    findings.missingNodeModules = true;
    return findings;
  }

  const entries = await readdir(nmPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const subPkgPath = join(nmPath, entry.name, 'package.json');
    try {
      const sub = JSON.parse(await readFile(subPkgPath, 'utf8'));
      findings.installed[`${MIDNIGHT_NS}/${entry.name}`] = sub.version;
    } catch {
      // skip unreadable
    }
  }

  // Detect duplicates by walking nested node_modules
  const allInstances = await findAllInstances(projectDir, MIDNIGHT_NS);
  for (const [name, versions] of Object.entries(allInstances)) {
    const unique = [...new Set(versions)];
    if (unique.length > 1) {
      findings.duplicates[name] = unique;
    }
  }

  return findings;
}

async function findAllInstances(projectDir, namespace) {
  const result = {};
  const queue = [join(projectDir, 'node_modules')];
  const seen = new Set();
  const MAX_DEPTH_DIRS = 5000; // prevent runaway in monorepos

  let visited = 0;
  while (queue.length && visited < MAX_DEPTH_DIRS) {
    const current = queue.shift();
    if (seen.has(current)) continue;
    seen.add(current);
    visited++;

    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const path = join(current, entry.name);

      if (entry.name === namespace) {
        const subEntries = await readdir(path, { withFileTypes: true }).catch(() => []);
        for (const sub of subEntries) {
          if (!sub.isDirectory()) continue;
          const subPkgPath = join(path, sub.name, 'package.json');
          try {
            const subPkg = JSON.parse(await readFile(subPkgPath, 'utf8'));
            const fullName = `${namespace}/${sub.name}`;
            if (!result[fullName]) result[fullName] = [];
            result[fullName].push(subPkg.version);
          } catch {
            // skip
          }
        }
      } else if (entry.name === 'node_modules') {
        queue.push(path);
      } else if (!entry.name.startsWith('.') && !entry.name.startsWith('@')) {
        const nested = join(path, 'node_modules');
        queue.push(nested);
      } else if (entry.name.startsWith('@')) {
        // scoped namespace folder — recurse into each scoped pkg's node_modules
        const scopedEntries = await readdir(path, { withFileTypes: true }).catch(() => []);
        for (const scoped of scopedEntries) {
          if (scoped.isDirectory()) {
            queue.push(join(path, scoped.name, 'node_modules'));
          }
        }
      }
    }
  }

  return result;
}
