# midnight-doctor

> Pre-flight check for Midnight Network projects. Catches version mismatches, duplicate ledgers, broken configs — **before** you spend 6 hours watching `waitForSyncedState()` run forever.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

## Why

Building on [Midnight](https://midnight.network) is harder than it should be. Not because the protocol is wrong — Compact and the shielded/unshielded/dust split are genuinely good — but because the **information you need to align your stack is scattered across Discord pinned messages, GitHub READMEs, and conflicting tutorials**.

Some real failure modes that cost the author days:

- `wallet-sdk-facade@2.0.0` paired with `midnight-node:0.21.0` → `waitForSyncedState()` hangs forever, **no error**.
- A community tutorial recommends `.npmrc` with `@midnight-ntwrk:registry=https://npm.midnight.network/` — that domain has **no DNS record**. `npm install` fails with ENOTFOUND, newbie quits.
- Two versions of `@midnight-ntwrk/ledger-v7` end up in `node_modules` after a transitive bump → silent transaction failures.

This tool reads your project, your Docker containers, and your config files; cross-references them against a verified compatibility matrix; and tells you what's wrong **in seconds**, not hours.

## Install

```bash
# global (recommended for CLI use)
npm install -g midnight-doctor

# or run via npx without installing
npx midnight-doctor
```

## Usage

```bash
# Run against current directory
midnight-doctor

# Run against a specific project
midnight-doctor ~/projects/my-midnight-app

# Machine-readable output for CI
midnight-doctor --json | jq '.diagnostics[] | select(.severity == "error")'
```

### Example output

```
── midnight-doctor ──
project: /root/midnight-hello-world

⚠ SDK track: Preprod 3.x (legacy, OK for existing apps)
   Detected from wallet-sdk-facade@2.0.0.
⚠ Track is deprecated
   SDK 3.2 / facade 2.0 is 2 majors behind. Current is wallet-sdk@1.0.0 / facade@4.0.0
   (released 2026-04-23). The WalletFacade.init({...}) constructor used in 2.0 has been
   removed; 4.0 reverted to `new WalletFacade(s, u, d) + .start()`. Plan a migration.
⚠ WalletFacade.init() in 2.x stalls on standalone dev nodes
   In SDK 2.x, WalletFacade.init() subscribes to runtime version events that the
   standalone node closes early. The wallet hangs in 'syncing' state forever with no error.
   → fix: Either (a) develop against preprod once past hello-world, or (b) upgrade to
     wallet-sdk-facade@4.0.0 which reverted to constructor + .start() pattern.
✓ node: midnightntwrk/midnight-node:0.21.0
✓ indexer: midnightntwrk/indexer-standalone:4.0.0-rc.4
✓ proof-server: midnightntwrk/proof-server:7.0.0
✓ midnight-node:0.21.0 matches SDK track

summary: 4 ok  3 warn  0 error  0 info

Status: workable, but warnings deserve a look.
```

## What it checks

### Package alignment

- Detects which **SDK track** your project is on (`current`, `preprod-3x`, `preprod-1x`)
- Flags deprecated tracks with migration guidance
- Detects **major-version mismatch** across `wallet-sdk-*` subpackages (silent type errors at runtime)
- Walks `node_modules` to detect **duplicate installs** of `ledger-v7`, `compact-runtime`, etc.

### Docker stack

- Reads `docker ps` and identifies running `midnight-node`, `indexer-standalone`, `proof-server`
- **Cross-references node tag with SDK track** — flags mismatches that cause silent sync failures

### Config files

- `.npmrc` — flags the bogus `npm.midnight.network` registry
- `indexer.yml` — flags missing `subscription:` block (causes 4.x indexer crash loops)

### Known issues

The matrix encodes specific bugs and their fixes:

| ID | Severity | What it catches |
|----|----------|-----------------|
| `npmrc-bad-registry` | error | `npm.midnight.network` in `.npmrc` |
| `duplicate-ledger` | error | Two `@midnight-ntwrk/ledger-v7` in `node_modules` |
| `duplicate-runtime` | error | Two `@midnight-ntwrk/compact-runtime` in `node_modules` |
| `facade-2x-init-bug` | warn | `wallet-sdk-facade@2.x` (standalone hang) |
| `facade-major-mismatch` | error | `wallet-sdk-*` subpackages span multiple majors |
| `indexer-subscription-block` | warn | Missing `subscription:` in `indexer.yml` |
| `node-track-mismatch` | error | Docker node tag doesn't match SDK track |

## Compatibility matrix

The verified matrix lives in [`data/compatibility-matrix.json`](data/compatibility-matrix.json) and is keyed by **track**. Current verified state (2026-04-27):

| Component | Current track |
|-----------|--------------|
| `@midnight-ntwrk/wallet-sdk` (barrel) | `1.0.0` |
| `@midnight-ntwrk/wallet-sdk-facade` | `4.0.0` |
| `@midnight-ntwrk/midnight-js-*` | `4.0.4` |
| `@midnight-ntwrk/compact-runtime` | `0.15.0` |
| `@midnight-ntwrk/ledger-v7` | `7.0.3` |
| `midnight-node` (Docker) | `0.21.0` |
| `indexer-standalone` (Docker) | `4.0.0-rc.4` |
| `proof-server` (Docker) | `7.0.0` |

> The matrix is human-curated. To suggest updates, open a PR against `data/compatibility-matrix.json`.

## Programmatic API

```js
import { runDoctor } from 'midnight-doctor';

const result = await runDoctor({ projectDir: process.cwd() });
console.log(result.diagnostics);
console.log(result.report.text);
console.log(result.report.counts); // { ok, warn, error, info }
```

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | No errors (warnings allowed) |
| 1 | At least one error found |
| 2 | Internal failure |

CI-friendly: fail your build if doctor reports errors.

```yaml
# .github/workflows/ci.yml
- run: npx midnight-doctor
```

## Contributing

The most valuable contribution is **keeping the compatibility matrix current**. When `@midnight-ntwrk/*` packages bump or new known issues surface:

1. Verify versions with `npm view @midnight-ntwrk/<pkg> version`
2. Update `data/compatibility-matrix.json`
3. Bump `verifiedAt` to today's date
4. Add a regression test in `test/diagnose.test.js` if a new check is added

Run tests:

```bash
npm test
```

## Roadmap

- [ ] Auto-detect monorepos (turbo / pnpm workspaces) and check each workspace
- [ ] `--fix` flag that runs `npm dedupe` / removes bogus `.npmrc` automatically
- [ ] Compact compiler version check (`compactc --version` vs `compact-runtime`)
- [ ] Health probe — actually `curl` indexer/RPC/proof endpoints, not just Docker presence
- [ ] Compatibility matrix fetched from a remote source so users don't need to update the package

## License

MIT — see [LICENSE](LICENSE).

## Author

Frederico Santana ([@DPO2U](https://dpo2u.com)) — built while shipping 4 apps on Midnight (`midnight-hello-world`, `dpo2u-midnight-agents`, `dpo2u-wallet`, `dpo2u-midnight-lab`) and tired of debugging silent failures.

## Acknowledgements

The Midnight devs in `#dev-help` on Discord — half the matrix entries came from their pinned messages and patient answers.
