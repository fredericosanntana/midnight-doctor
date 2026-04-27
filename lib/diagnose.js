/**
 * Cross-references scan findings with the compatibility matrix
 * and returns a list of diagnostics.
 *
 * Diagnostic shape: { id, severity, title, detail, fix? }
 * severity: 'error' | 'warn' | 'info' | 'ok'
 */
export function diagnose({ pkg, docker, config, matrix }) {
  const diagnostics = [];

  // ----- Package.json present? -----
  if (!pkg.packageJsonFound) {
    diagnostics.push({
      id: 'no-package-json',
      severity: 'info',
      title: 'No package.json found',
      detail: 'Doctor expected a Node project. Skipping JS-side checks.',
    });
  } else {
    diagnostics.push(...diagnosePackages(pkg, matrix));
  }

  // ----- Config files -----
  diagnostics.push(...diagnoseConfig(config, matrix));

  // ----- Docker stack -----
  diagnostics.push(...diagnoseDocker(docker, matrix));

  // ----- Cross-cutting checks -----
  diagnostics.push(...diagnoseCrossCutting(pkg, docker, matrix));

  return diagnostics;
}

function diagnosePackages(pkg, matrix) {
  const out = [];

  if (pkg.missingNodeModules) {
    out.push({
      id: 'no-node-modules',
      severity: 'warn',
      title: 'node_modules/@midnight-ntwrk not found — run `npm install` first',
      detail: 'Doctor checks against installed versions, not just declared.',
    });
    return out;
  }

  // Detect which track the project is on
  const facadeVersion = pkg.installed['@midnight-ntwrk/wallet-sdk-facade'];
  const detectedTrack = detectTrack(facadeVersion, matrix);

  if (detectedTrack) {
    const track = matrix.tracks[detectedTrack];
    out.push({
      id: 'track-detected',
      severity: detectedTrack === 'current' ? 'ok' : 'warn',
      title: `SDK track: ${track.label}`,
      detail: `Detected from wallet-sdk-facade@${facadeVersion}.`,
    });

    if (track.deprecation) {
      out.push({
        id: `track-deprecated-${detectedTrack}`,
        severity: track.deprecation.level,
        title: `Track is ${track.deprecation.level === 'error' ? 'unsupported' : 'deprecated'}`,
        detail: track.deprecation.message,
      });
    }
  } else if (facadeVersion) {
    out.push({
      id: 'track-unknown',
      severity: 'warn',
      title: `Unknown SDK track for wallet-sdk-facade@${facadeVersion}`,
      detail: 'Version not in compatibility matrix. Verify manually.',
    });
  }

  // Major mismatch among wallet-sdk-* packages
  const subPkgs = [
    '@midnight-ntwrk/wallet-sdk-facade',
    '@midnight-ntwrk/wallet-sdk-shielded',
    '@midnight-ntwrk/wallet-sdk-unshielded-wallet',
    '@midnight-ntwrk/wallet-sdk-dust-wallet',
  ];
  const majors = new Set();
  for (const p of subPkgs) {
    const v = pkg.installed[p];
    if (v) majors.add(parseInt(v.split('.')[0], 10));
  }
  if (majors.size > 1) {
    const issue = matrix.knownIssues.find((i) => i.id === 'facade-major-mismatch');
    out.push({
      id: 'facade-major-mismatch',
      severity: issue?.severity || 'error',
      title: issue?.title || 'wallet-sdk subpackages span multiple majors',
      detail: `Detected majors: ${[...majors].sort().join(', ')}. ${issue?.detail || ''}`,
      fix: issue?.fix,
    });
  }

  // Specific version warnings (e.g. facade 2.x init bug)
  for (const issue of matrix.knownIssues) {
    if (issue.match.type !== 'package-version') continue;
    const installed = pkg.installed[issue.match.package];
    if (!installed) continue;
    if (matchesRange(installed, issue.match.range)) {
      out.push({
        id: issue.id,
        severity: issue.severity,
        title: issue.title,
        detail: issue.detail,
        fix: issue.fix,
      });
    }
  }

  // Duplicate packages
  for (const issue of matrix.knownIssues) {
    if (issue.match.type !== 'duplicate-package') continue;
    const versions = pkg.duplicates[issue.match.package];
    if (versions && versions.length > 1) {
      out.push({
        id: issue.id,
        severity: issue.severity,
        title: issue.title,
        detail: `${issue.detail} Found versions: ${versions.join(', ')}.`,
        fix: issue.fix,
      });
    }
  }

  return out;
}

function diagnoseConfig(config, matrix) {
  const out = [];

  // .npmrc bogus registry
  if (config.npmrc?.exists && config.npmrc.hasBogusRegistry) {
    const issue = matrix.knownIssues.find((i) => i.id === 'npmrc-bad-registry');
    out.push({
      id: 'npmrc-bad-registry',
      severity: issue?.severity || 'error',
      title: issue?.title || 'Invalid npm registry in .npmrc',
      detail: issue?.detail,
      fix: issue?.fix,
    });
  }

  // indexer.yml subscription block
  if (config.indexerYml && !config.indexerYml.hasSubscription) {
    const check = matrix.configChecks.find((c) => c.id === 'indexer-subscription-block');
    out.push({
      id: 'indexer-subscription-block',
      severity: check?.severity || 'warn',
      title: check?.title || 'indexer.yml missing subscription block',
      detail: check?.detail,
      fix: check?.fix,
    });
  }

  return out;
}

function diagnoseDocker(docker, matrix) {
  const out = [];

  if (!docker.dockerAvailable) {
    out.push({
      id: 'docker-unavailable',
      severity: 'info',
      title: 'Docker not available — skipping container checks',
      detail: 'Install or start Docker to enable node/indexer/proof-server detection.',
    });
    return out;
  }

  const roles = ['node', 'indexer', 'proof-server'];
  for (const role of roles) {
    const c = docker.containers[role];
    if (!c) {
      out.push({
        id: `docker-no-${role}`,
        severity: 'info',
        title: `No running ${role} container detected`,
      });
    } else {
      out.push({
        id: `docker-${role}`,
        severity: 'ok',
        title: `${role}: ${c.image}:${c.tag}`,
        detail: `Container ${c.name} — ${c.status}`,
      });
    }
  }

  return out;
}

function diagnoseCrossCutting(pkg, docker, matrix) {
  const out = [];
  if (!docker.dockerAvailable || !pkg.packageJsonFound) return out;

  const facadeVersion = pkg.installed['@midnight-ntwrk/wallet-sdk-facade'];
  const nodeContainer = docker.containers.node;
  if (!facadeVersion || !nodeContainer) return out;

  const detectedTrack = detectTrack(facadeVersion, matrix);
  if (!detectedTrack) return out;
  const track = matrix.tracks[detectedTrack];
  if (track.node && track.node !== nodeContainer.tag) {
    out.push({
      id: 'node-track-mismatch',
      severity: 'error',
      title: `midnight-node:${nodeContainer.tag} doesn't match SDK track (expects ${track.node})`,
      detail: `Detected SDK track: ${track.label}. Running node: ${nodeContainer.tag}. Mixing causes silent sync failures with no error.`,
      fix: `Either update the node container to ${track.node}, or align SDK to a track that matches your node version.`,
    });
  } else if (track.node) {
    out.push({
      id: 'node-track-match',
      severity: 'ok',
      title: `midnight-node:${nodeContainer.tag} matches SDK track`,
    });
  }

  return out;
}

function detectTrack(facadeVersion, matrix) {
  if (!facadeVersion) return null;
  const major = parseInt(facadeVersion.split('.')[0], 10);
  if (major === 4) return 'current';
  if (major === 2 || major === 3) return 'preprod-3x';
  if (major === 1) return 'preprod-1x';
  return null;
}

function matchesRange(version, range) {
  const major = parseInt(version.split('.')[0], 10);
  const m = range.match(/^(\d+)\.x$/);
  if (m) return major === parseInt(m[1], 10);
  return version === range;
}
