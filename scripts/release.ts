#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run --allow-env

/**
 * Release script for okta-client
 *
 * Usage:
 *   deno task release --bump patch    # 1.0.0 → 1.0.1
 *   deno task release --bump minor    # 1.0.0 → 1.1.0
 *   deno task release --bump major    # 1.0.0 → 2.0.0
 *   deno task release --dry-run       # preview without writing
 *
 * What this script does:
 *   1. Reads current version from deno.json
 *   2. Computes new version from --bump
 *   3. Validates CHANGELOG.md has an [Unreleased] section
 *   4. Builds all platform binaries (unless --dry-run)
 *   5. Updates CHANGELOG.md — moves [Unreleased] items to [X.Y.Z]
 *   6. Writes new version to deno.json
 *   7. Git commit + tag + push
 *   8. Creates GitHub release with binaries
 */

import { parseArgs } from '@std/cli/parse-args';

interface DenoJson {
  name?: string;
  version: string;
  [key: string]: unknown;
}

const BINARY_NAME = 'okta-client';

// Binary suffixes matching deno.json build tasks
const BINARY_SUFFIXES = [
  'macos-x64',
  'macos-arm64',
  'linux-x64',
  'windows-x64.exe',
];

function bumpVersion(current: string, bump: 'major' | 'minor' | 'patch'): string {
  const parts = current.split('.').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Invalid version: ${current}`);
  }
  const [major, minor, patch] = parts;
  switch (bump) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
  }
}

async function readDenoJson(): Promise<DenoJson> {
  const content = await Deno.readTextFile('deno.json');
  return JSON.parse(content);
}

async function writeDenoJson(data: DenoJson): Promise<void> {
  await Deno.writeTextFile('deno.json', JSON.stringify(data, null, 2) + '\n');
}

async function updateChangelog(version: string, date: string): Promise<void> {
  const content = await Deno.readTextFile('CHANGELOG.md');
  if (!content.includes('## [Unreleased]')) {
    throw new Error('CHANGELOG.md has no [Unreleased] section. Add your changes there first.');
  }
  // Extract body of [Unreleased] section and move it under the new version heading
  const unreleasedMatch = content.match(/## \[Unreleased\]\n([\s\S]*?)(?=\n## \[|$)/);
  const unreleasedBody = unreleasedMatch ? unreleasedMatch[1].trim() : '';
  const newChangelog = content.replace(
    /## \[Unreleased\]\n[\s\S]*?(?=\n## \[|$)/,
    `## [Unreleased]\n\n### Added\n- Nothing yet\n\n## [${version}] - ${date}\n\n${unreleasedBody}\n`,
  );
  await Deno.writeTextFile('CHANGELOG.md', newChangelog);
}

async function run(cmd: string, args: string[], description: string): Promise<string> {
  console.log(`  $ ${cmd} ${args.join(' ')}`);
  const proc = new Deno.Command(cmd, { args, stdout: 'piped', stderr: 'piped' });
  const { code, stdout, stderr } = await proc.output();
  const out = new TextDecoder().decode(stdout).trim();
  const err = new TextDecoder().decode(stderr).trim();
  if (code !== 0) {
    throw new Error(`${description} failed:\n${err}`);
  }
  return out;
}

async function checkBinaries(): Promise<string[]> {
  const artifacts: string[] = [];
  try {
    for await (const entry of Deno.readDir('dist')) {
      if (entry.isFile && entry.name.startsWith(BINARY_NAME)) {
        artifacts.push(`dist/${entry.name}`);
      }
    }
  } catch {
    /* dist not yet built */
  }
  return artifacts;
}

const args = parseArgs(Deno.args, {
  string: ['bump'],
  boolean: ['dry-run', 'help'],
  alias: { h: 'help' },
  default: { bump: 'patch', 'dry-run': false },
});

if (args.help) {
  console.log(`
Usage: deno task release [options]

Options:
  --bump major|minor|patch   Version bump type (default: patch)
  --dry-run                  Preview changes without writing or pushing
  -h, --help                 Show this help
`);
  Deno.exit(0);
}

const bump = args.bump as 'major' | 'minor' | 'patch';
if (!['major', 'minor', 'patch'].includes(bump)) {
  console.error(`❌ Invalid --bump value: "${bump}". Use major, minor, or patch.`);
  Deno.exit(1);
}

const dryRun = args['dry-run'] as boolean;

try {
  const denoJson = await readDenoJson();
  const currentVersion = denoJson.version;
  const newVersion = bumpVersion(currentVersion, bump);
  const today = new Date().toISOString().split('T')[0];

  console.log(`\n📦 ${BINARY_NAME} release`);
  console.log(`   Current version: ${currentVersion}`);
  console.log(`   New version:     ${newVersion}`);
  console.log(`   Date:            ${today}`);
  console.log(`   Dry run:         ${dryRun}\n`);

  if (dryRun) {
    console.log('🔍 Dry run — no changes written.');
    Deno.exit(0);
  }

  // Validate CHANGELOG
  const changelog = await Deno.readTextFile('CHANGELOG.md');
  if (!changelog.includes('## [Unreleased]')) {
    throw new Error('CHANGELOG.md missing [Unreleased] section.');
  }

  // Build binaries
  console.log('🔨 Building binaries...');
  await run('deno', ['task', 'build:all'], 'Build');
  const artifacts = await checkBinaries();
  console.log(`✅ Built: ${artifacts.join(', ')}\n`);

  // Update CHANGELOG
  console.log('📝 Updating CHANGELOG.md...');
  await updateChangelog(newVersion, today);

  // Bump version in deno.json
  console.log('🔖 Bumping version in deno.json...');
  denoJson.version = newVersion;
  await writeDenoJson(denoJson);

  // Git commit + tag + push
  console.log('🚀 Committing and tagging...');
  await run('git', ['add', 'deno.json', 'CHANGELOG.md'], 'git add');
  await run('git', ['commit', '-m', `chore: release v${newVersion}`], 'git commit');
  await run('git', ['tag', `v${newVersion}`], 'git tag');
  await run('git', ['push', 'origin', 'main', '--tags'], 'git push');

  // GitHub release
  console.log('🎉 Creating GitHub release...');
  const ghArgs = [
    'release',
    'create',
    `v${newVersion}`,
    '--title',
    `v${newVersion}`,
    '--generate-notes',
    ...artifacts,
  ];
  const releaseUrl = await run('gh', ghArgs, 'GitHub release');
  console.log(`\n✅ Released: ${releaseUrl}`);
} catch (error) {
  console.error('❌ Release failed:', error instanceof Error ? error.message : String(error));
  Deno.exit(1);
}
