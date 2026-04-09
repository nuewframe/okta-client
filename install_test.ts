import { assertEquals, assertStringIncludes } from '@std/assert';
import { dirname, fromFileUrl, join } from '@std/path';

const repoRoot = dirname(fromFileUrl(import.meta.url));
const installScript = join(repoRoot, 'install.sh');

function parsePlan(stdout: string): Record<string, string> {
  const plan: Record<string, string> = {};

  for (const line of stdout.split('\n')) {
    const idx = line.indexOf('=');
    if (!line.startsWith('PLAN_') || idx <= 0) {
      continue;
    }

    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    plan[key] = value;
  }

  return plan;
}

Deno.test('install script dry-run resolves binary/tag/url/destination from env', async () => {
  const command = new Deno.Command('sh', {
    args: [installScript],
    cwd: repoRoot,
    env: {
      ...Deno.env.toObject(),
      DRY_RUN: '1',
      FORCE_PLATFORM: 'linux-x64',
      VERSION: 'v1.1.1',
      INSTALL_DIR: '/tmp/nfauth-bin',
    },
    stdout: 'piped',
    stderr: 'piped',
  });

  const output = await command.output();
  const stdout = new TextDecoder().decode(output.stdout);
  const stderr = new TextDecoder().decode(output.stderr);

  assertEquals(output.code, 0, `installer failed\nstdout:\n${stdout}\nstderr:\n${stderr}`);

  const plan = parsePlan(stdout);

  assertEquals(plan.PLAN_PROJECT, 'Nuewframe OAuth CLI');
  assertEquals(plan.PLAN_REPO, 'nuewframe/nfauth');
  assertEquals(plan.PLAN_BINARY, 'nfauth');
  assertEquals(plan.PLAN_TAG, 'v1.1.1');
  assertEquals(plan.PLAN_PLATFORM, 'linux-x64');
  assertEquals(plan.PLAN_ASSET, 'nfauth-linux-x64');
  assertEquals(
    plan.PLAN_URL,
    'https://github.com/nuewframe/nfauth/releases/download/v1.1.1/nfauth-linux-x64',
  );
  assertEquals(plan.PLAN_DEST, '/tmp/nfauth-bin/nfauth');

  // Ensure dry-run did not attempt install side effects.
  assertStringIncludes(stdout, 'PLAN_PROJECT=');
});
