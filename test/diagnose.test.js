import { test } from 'node:test';
import assert from 'node:assert/strict';

import { diagnose } from '../lib/diagnose.js';
import { loadMatrix } from '../lib/index.js';

const matrix = await loadMatrix();

test('detects current track when facade is 3.x (matches official support matrix)', () => {
  const out = diagnose({
    pkg: {
      packageJsonFound: true,
      missingNodeModules: false,
      declared: {},
      installed: { '@midnight-ntwrk/wallet-sdk-facade': '3.0.0' },
      duplicates: {},
    },
    docker: { dockerAvailable: false, containers: {} },
    config: { npmrc: { exists: false }, indexerYml: null, envFiles: [] },
    matrix,
  });
  const trackDiag = out.find((d) => d.id === 'track-detected');
  assert.equal(trackDiag.severity, 'ok');
  assert.match(trackDiag.title, /Current/);
});

test('detects preview track when facade is 4.x (npm latest, ahead of support matrix)', () => {
  const out = diagnose({
    pkg: {
      packageJsonFound: true,
      missingNodeModules: false,
      declared: {},
      installed: { '@midnight-ntwrk/wallet-sdk-facade': '4.0.0' },
      duplicates: {},
    },
    docker: { dockerAvailable: false, containers: {} },
    config: { npmrc: { exists: false }, indexerYml: null, envFiles: [] },
    matrix,
  });
  const trackDiag = out.find((d) => d.id === 'track-detected');
  assert.match(trackDiag.title, /Preview/);
  const dep = out.find((d) => d.id.startsWith('track-deprecated'));
  assert.ok(dep, 'should warn about preview being ahead of support matrix');
});

test('flags deprecated track when facade is 2.x', () => {
  const out = diagnose({
    pkg: {
      packageJsonFound: true,
      missingNodeModules: false,
      declared: {},
      installed: { '@midnight-ntwrk/wallet-sdk-facade': '2.0.0' },
      duplicates: {},
    },
    docker: { dockerAvailable: false, containers: {} },
    config: { npmrc: { exists: false }, indexerYml: null, envFiles: [] },
    matrix,
  });
  const dep = out.find((d) => d.id.startsWith('track-deprecated'));
  assert.ok(dep, 'deprecation diagnostic should exist');
  assert.equal(dep.severity, 'warn');
});

test('flags facade 2.x init bug', () => {
  const out = diagnose({
    pkg: {
      packageJsonFound: true,
      missingNodeModules: false,
      declared: {},
      installed: { '@midnight-ntwrk/wallet-sdk-facade': '2.0.0' },
      duplicates: {},
    },
    docker: { dockerAvailable: false, containers: {} },
    config: { npmrc: { exists: false }, indexerYml: null, envFiles: [] },
    matrix,
  });
  const bug = out.find((d) => d.id === 'facade-2x-init-bug');
  assert.ok(bug, 'should flag the 2.x init bug');
  assert.equal(bug.severity, 'warn');
});

test('flags duplicate ledger-v7', () => {
  const out = diagnose({
    pkg: {
      packageJsonFound: true,
      missingNodeModules: false,
      declared: {},
      installed: { '@midnight-ntwrk/wallet-sdk-facade': '4.0.0' },
      duplicates: { '@midnight-ntwrk/ledger-v7': ['7.0.0', '7.0.3'] },
    },
    docker: { dockerAvailable: false, containers: {} },
    config: { npmrc: { exists: false }, indexerYml: null, envFiles: [] },
    matrix,
  });
  const dup = out.find((d) => d.id === 'duplicate-ledger-v7');
  assert.ok(dup, 'should flag duplicate ledger-v7');
  assert.equal(dup.severity, 'error');
});

test('flags bogus npm.midnight.network registry', () => {
  const out = diagnose({
    pkg: {
      packageJsonFound: true,
      missingNodeModules: false,
      declared: {},
      installed: { '@midnight-ntwrk/wallet-sdk-facade': '4.0.0' },
      duplicates: {},
    },
    docker: { dockerAvailable: false, containers: {} },
    config: {
      npmrc: { exists: true, content: '@midnight-ntwrk:registry=https://npm.midnight.network/', hasBogusRegistry: true },
      indexerYml: null,
      envFiles: [],
    },
    matrix,
  });
  const bad = out.find((d) => d.id === 'npmrc-bad-registry');
  assert.ok(bad, 'should flag bogus registry');
  assert.equal(bad.severity, 'error');
});

test('flags wallet-sdk subpackage major mismatch', () => {
  const out = diagnose({
    pkg: {
      packageJsonFound: true,
      missingNodeModules: false,
      declared: {},
      installed: {
        '@midnight-ntwrk/wallet-sdk-facade': '4.0.0',
        '@midnight-ntwrk/wallet-sdk-shielded': '2.0.0',
        '@midnight-ntwrk/wallet-sdk-unshielded-wallet': '3.0.0',
      },
      duplicates: {},
    },
    docker: { dockerAvailable: false, containers: {} },
    config: { npmrc: { exists: false }, indexerYml: null, envFiles: [] },
    matrix,
  });
  const mismatch = out.find((d) => d.id === 'facade-major-mismatch');
  assert.ok(mismatch, 'should flag major mismatch');
  assert.equal(mismatch.severity, 'error');
});

test('cross-cuts current-track facade 3.x with node 0.22.x (preprod/preview/mainnet)', () => {
  for (const tag of ['0.22.1', '0.22.2', '0.22.3']) {
    const out = diagnose({
      pkg: {
        packageJsonFound: true,
        missingNodeModules: false,
        declared: {},
        installed: { '@midnight-ntwrk/wallet-sdk-facade': '3.0.0' },
        duplicates: {},
      },
      docker: {
        dockerAvailable: true,
        containers: {
          node: { image: 'midnightntwrk/midnight-node', tag, name: 'node', status: 'Up' },
        },
      },
      config: { npmrc: { exists: false }, indexerYml: null, envFiles: [] },
      matrix,
    });
    const match = out.find((d) => d.id === 'node-track-match');
    assert.ok(match, `should match for node ${tag}`);
  }
});

test('flags node/SDK mismatch when legacy facade 2.x runs against 0.22.x node', () => {
  const out = diagnose({
    pkg: {
      packageJsonFound: true,
      missingNodeModules: false,
      declared: {},
      installed: { '@midnight-ntwrk/wallet-sdk-facade': '2.0.0' },
      duplicates: {},
    },
    docker: {
      dockerAvailable: true,
      containers: {
        node: { image: 'midnightntwrk/midnight-node', tag: '0.22.2', name: 'node', status: 'Up' },
      },
    },
    config: { npmrc: { exists: false }, indexerYml: null, envFiles: [] },
    matrix,
  });
  const mismatch = out.find((d) => d.id === 'node-track-mismatch');
  assert.ok(mismatch, 'should flag node/track mismatch');
  assert.equal(mismatch.severity, 'error');
});
