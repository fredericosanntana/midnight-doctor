import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

const KNOWN_IMAGES = {
  'midnightntwrk/midnight-node': 'node',
  'midnightntwrk/indexer-standalone': 'indexer',
  'midnightntwrk/proof-server': 'proof-server',
};

export async function scanDocker() {
  const findings = {
    dockerAvailable: false,
    containers: {},
  };

  try {
    await exec('docker', ['version', '--format', '{{.Server.Version}}']);
    findings.dockerAvailable = true;
  } catch {
    return findings;
  }

  let stdout;
  try {
    const result = await exec('docker', [
      'ps',
      '--format',
      '{{.Image}}|{{.Names}}|{{.Status}}',
    ]);
    stdout = result.stdout;
  } catch {
    return findings;
  }

  const lines = stdout.split('\n').filter(Boolean);
  for (const line of lines) {
    const [image, name, status] = line.split('|');
    const [imageName, tag = 'latest'] = image.split(':');
    if (KNOWN_IMAGES[imageName]) {
      const role = KNOWN_IMAGES[imageName];
      findings.containers[role] = {
        image: imageName,
        tag,
        name,
        status,
      };
    }
  }

  return findings;
}
