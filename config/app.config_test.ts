import { assert, assertEquals, assertExists } from '@std/assert';

import {
  getCurrentOktaConfig,
  loadConfig,
  loadUnifiedConfig,
  normalizeConfig,
  resolveConfigSelection,
  saveConfig,
} from '../config/app.config.ts';

function restoreEnv(originalEnv: Record<string, string>): void {
  for (const key of Object.keys(Deno.env.toObject())) {
    if (!(key in originalEnv)) {
      Deno.env.delete(key);
    }
  }

  for (const [key, value] of Object.entries(originalEnv)) {
    Deno.env.set(key, value);
  }
}

Deno.test('Config - loadConfig handles missing file', () => {
  const originalEnv = { ...Deno.env.toObject() };

  try {
    Deno.env.set('OKTA_DOMAIN', 'https://test.okta.com');
    Deno.env.set('OKTA_CLIENT_ID', 'test-client-id');
    Deno.env.set('OKTA_API_TOKEN', 'test-api-token');

    const config = loadConfig();

    assertExists(config);
    assertExists(config.okta);
  } finally {
    restoreEnv(originalEnv);
  }
});

Deno.test('Config - environment validation', () => {
  const mockConfig = {
    okta: {
      environments: {
        dev: {
          default: {
            domain: 'https://dev.okta.com',
            clientId: 'test-client-id',
            apiToken: 'test-api-token',
            redirectUri: 'http://localhost:8000/callback',
          },
        },
      },
    },
    current: {
      env: 'dev',
      namespace: 'default',
    },
  };

  const config = getCurrentOktaConfig(mockConfig, 'dev', 'default');

  assertEquals(config.domain, 'https://dev.okta.com');
  assertEquals(config.clientId, 'test-client-id');
  assertEquals(config.apiToken, 'test-api-token');
});

Deno.test('Config parsing - basic structure validation', () => {
  assertExists(loadConfig);
  assertExists(getCurrentOktaConfig);
  assertExists(resolveConfigSelection);
  assertExists(normalizeConfig);
});

Deno.test('Config - resolveConfigSelection prefers explicit args over current and legacy defaults', () => {
  const selection = resolveConfigSelection(
    {
      okta: {
        environments: {
          dev: {
            default: {
              domain: 'https://dev.okta.com',
              clientId: 'id',
              apiToken: 'token',
            },
          },
        },
        defaultEnv: 'stg',
        defaultNamespace: 'legacy',
      },
      current: {
        env: 'prod',
        namespace: 'cards',
      },
    },
    'dev',
    'default',
  );

  assertEquals(selection, { env: 'dev', namespace: 'default' });
});

Deno.test('Config - normalizeConfig migrates legacy defaults into current', () => {
  const normalized = normalizeConfig({
    okta: {
      environments: {
        dev: {
          cards: {
            domain: 'https://dev.okta.com',
            clientId: 'client-id',
            apiToken: 'api-token',
          },
        },
      },
      defaultEnv: 'dev',
      defaultNamespace: 'cards',
    },
  });

  assertEquals(normalized.current, { env: 'dev', namespace: 'cards' });
  assertEquals(normalized.okta.defaultEnv, undefined);
  assertEquals(normalized.okta.defaultNamespace, undefined);
});

Deno.test('Config - loadUnifiedConfig reads legacy defaults and normalizes them', () => {
  const originalEnv = { ...Deno.env.toObject() };
  const tempHome = Deno.makeTempDirSync();

  try {
    Deno.env.set('HOME', tempHome);
    Deno.mkdirSync(`${tempHome}/.nuewframe/okta-client`, { recursive: true });
    Deno.writeTextFileSync(
      `${tempHome}/.nuewframe/okta-client/config.yaml`,
      [
        'okta:',
        '  environments:',
        '    dev:',
        '      cards:',
        '        domain: https://dev.okta.com',
        '        clientId: client-id',
        '        apiToken: api-token',
        '  defaultEnv: dev',
        '  defaultNamespace: cards',
      ].join('\n'),
    );

    const config = loadUnifiedConfig();

    assertExists(config);
    assertEquals(config.current, { env: 'dev', namespace: 'cards' });
    assertEquals(config.okta.defaultEnv, undefined);
    assertEquals(config.okta.defaultNamespace, undefined);
  } finally {
    restoreEnv(originalEnv);
    Deno.removeSync(tempHome, { recursive: true });
  }
});

Deno.test('Config - saveConfig writes only normalized current selection', () => {
  const originalEnv = { ...Deno.env.toObject() };
  const tempHome = Deno.makeTempDirSync();

  try {
    Deno.env.set('HOME', tempHome);

    saveConfig({
      okta: {
        environments: {
          dev: {
            cards: {
              domain: 'https://dev.okta.com',
              clientId: 'client-id',
              apiToken: 'api-token',
            },
          },
        },
        defaultEnv: 'dev',
        defaultNamespace: 'cards',
      },
    });

    const saved = Deno.readTextFileSync(`${tempHome}/.nuewframe/okta-client/config.yaml`);

    assert(saved.includes('current:\n  env: dev\n  namespace: cards\n'));
    assert(!saved.includes('defaultEnv:'));
    assert(!saved.includes('defaultNamespace:'));
  } finally {
    restoreEnv(originalEnv);
    Deno.removeSync(tempHome, { recursive: true });
  }
});

Deno.test('Config - loadUnifiedConfig honors NUEWFRAME_CONFIG override path', () => {
  const originalEnv = { ...Deno.env.toObject() };
  const tempDir = Deno.makeTempDirSync();

  try {
    const customPath = `${tempDir}/custom-config.yaml`;
    Deno.env.set('NUEWFRAME_CONFIG', customPath);
    Deno.writeTextFileSync(
      customPath,
      [
        'okta:',
        '  environments:',
        '    qa:',
        '      api:',
        '        domain: https://qa.okta.com',
        '        clientId: qa-client-id',
        '        apiToken: qa-api-token',
      ].join('\n'),
    );

    const config = loadUnifiedConfig();
    assertExists(config);
    assertEquals(config.current, { env: 'dev', namespace: 'default' });
    assertEquals(config.okta.environments.qa.api.clientId, 'qa-client-id');
  } finally {
    restoreEnv(originalEnv);
    Deno.removeSync(tempDir, { recursive: true });
  }
});
