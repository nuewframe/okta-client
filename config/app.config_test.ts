import { assert, assertEquals, assertExists } from '@std/assert';

import {
  applyOAuthExecutionOverrides,
  getCurrentAuthConfig,
  initializeConfig,
  loadConfig,
  loadUnifiedConfig,
  normalizeConfig,
  resolveConfigSelection,
  resolveOAuthExecutionConfig,
  resolvePasswordFromEnvironment,
  saveConfig,
  validateOAuthCompatibilityConfig,
  validateOAuthExecutionConfig,
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

Deno.test('Config - loadConfig fails when unified config is missing', () => {
  const originalEnv = { ...Deno.env.toObject() };
  const tempHome = Deno.makeTempDirSync();

  try {
    Deno.env.set('HOME', tempHome);

    let threw = false;
    try {
      loadConfig();
    } catch (error) {
      threw = true;
      const message = error instanceof Error ? error.message : String(error);
      assert(message.includes('No configuration found'));
    }

    assert(threw);
  } finally {
    restoreEnv(originalEnv);
    Deno.removeSync(tempHome, { recursive: true });
  }
});

Deno.test('Config - initializeConfig creates a readable default config', () => {
  const originalEnv = { ...Deno.env.toObject() };
  const tempHome = Deno.makeTempDirSync();

  try {
    Deno.env.set('HOME', tempHome);

    const initialized = initializeConfig();
    assertExists(initialized.security.auth.dev.default.auth);

    const loaded = loadUnifiedConfig();
    assertExists(loaded);
    assertEquals(loaded.current, { env: 'dev', profile: 'default' });
    assertExists(loaded.security.auth.dev.default.auth);
  } finally {
    restoreEnv(originalEnv);
    Deno.removeSync(tempHome, { recursive: true });
  }
});

Deno.test('Config - environment validation', () => {
  const mockConfig = {
    security: {
      auth: {
        dev: {
          default: {
            domain: 'https://dev.okta.com',
            clientId: 'test-client-id',
            redirectUri: 'http://localhost:8000/callback',
            auth: {
              clientSecret: 'test-client-secret',
            },
          },
        },
      },
    },
    current: {
      env: 'dev',
      profile: 'default',
    },
  };

  const config = getCurrentAuthConfig(mockConfig, 'dev', 'default');

  assertEquals(config.domain, 'https://dev.okta.com');
  assertEquals(config.clientId, 'test-client-id');
  assertEquals(config.auth?.clientSecret, 'test-client-secret');
});

Deno.test('Config parsing - basic structure validation', () => {
  assertExists(loadConfig);
  assertExists(getCurrentAuthConfig);
  assertExists(resolveConfigSelection);
  assertExists(normalizeConfig);
});

Deno.test('Config - resolveConfigSelection prefers explicit args over current defaults', () => {
  const selection = resolveConfigSelection(
    {
      security: {
        auth: {
          dev: {
            default: {
              domain: 'https://dev.okta.com',
              clientId: 'id',
            },
          },
        },
      },
      current: {
        env: 'prod',
        profile: 'cards',
      },
    },
    'dev',
    'default',
  );

  assertEquals(selection, { env: 'dev', profile: 'default' });
});

Deno.test('Config - normalizeConfig preserves current selection', () => {
  const normalized = normalizeConfig({
    security: {
      auth: {
        dev: {
          cards: {
            domain: 'https://dev.okta.com',
            clientId: 'client-id',
          },
        },
      },
    },
    current: {
      env: 'dev',
      profile: 'cards',
    },
  });

  assertEquals(normalized.current, { env: 'dev', profile: 'cards' });
});

Deno.test('Config - loadUnifiedConfig reads unified config and normalizes it', () => {
  const originalEnv = { ...Deno.env.toObject() };
  const tempHome = Deno.makeTempDirSync();

  try {
    Deno.env.set('HOME', tempHome);
    Deno.mkdirSync(`${tempHome}/.nuewframe/nfauth`, { recursive: true });
    Deno.writeTextFileSync(
      `${tempHome}/.nuewframe/nfauth/config.yaml`,
      [
        'security:',
        '  auth:',
        '    dev:',
        '      cards:',
        '        domain: https://dev.okta.com',
        '        clientId: client-id',
        'current:',
        '  env: dev',
        '  profile: cards',
      ].join('\n'),
    );

    const config = loadUnifiedConfig();

    assertExists(config);
    assertEquals(config.current, { env: 'dev', profile: 'cards' });
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
      security: {
        auth: {
          dev: {
            cards: {
              domain: 'https://dev.okta.com',
              clientId: 'client-id',
            },
          },
        },
      },
      current: {
        env: 'dev',
        profile: 'cards',
      },
    });

    const saved = Deno.readTextFileSync(`${tempHome}/.nuewframe/nfauth/config.yaml`);

    assert(saved.includes('current:\n  env: dev\n  profile: cards\n'));
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
        'security:',
        '  auth:',
        '    qa:',
        '      api:',
        '        domain: https://qa.okta.com',
        '        clientId: qa-client-id',
        '        auth:',
        '          clientSecret: qa-client-secret',
      ].join('\n'),
    );

    const config = loadUnifiedConfig();
    assertExists(config);
    assertEquals(config.current, { env: 'dev', profile: 'default' });
    assertEquals(config.security.auth.qa.api.clientId, 'qa-client-id');
  } finally {
    restoreEnv(originalEnv);
    Deno.removeSync(tempDir, { recursive: true });
  }
});

Deno.test('Config - normalizeConfig applies auth defaults and scope normalization', () => {
  const normalized = normalizeConfig({
    security: {
      auth: {
        dev: {
          default: {
            domain: 'https://dev.okta.com',
            clientId: 'client-id',
            auth: {
              grantType: 'authorization_code',
              scope: ['openid', 'profile', 'email'],
              pkce: true,
            },
          },
        },
      },
    },
  });

  const auth = normalized.security.auth.dev.default.auth;
  assertExists(auth);
  assertEquals(auth.type, 'OAuth2');
  assertEquals(auth.clientCredentialsMode, 'basic');
  assertEquals(auth.scope, 'openid profile email');
  assertEquals(auth.pkce, { enabled: true, codeChallengeMethod: 'S256' });
});

Deno.test('Config - validateOAuthCompatibilityConfig rejects invalid URL', () => {
  const auth = {
    grantType: 'authorization_code' as const,
    authUrl: 'not-a-url',
  };

  let threw = false;
  try {
    validateOAuthCompatibilityConfig(auth, 'test.auth');
  } catch (error) {
    threw = true;
    const message = error instanceof Error ? error.message : String(error);
    assert(message.includes('test.auth.authUrl'));
  }

  assert(threw);
});

Deno.test('Config - validateOAuthCompatibilityConfig rejects invalid clientCredentialsMode', () => {
  const auth = {
    grantType: 'client_credentials' as const,
    tokenUrl: 'https://example.com/token',
    clientCredentialsMode: 'header' as 'basic',
  };

  let threw = false;
  try {
    validateOAuthCompatibilityConfig(auth, 'test.auth');
  } catch (error) {
    threw = true;
    const message = error instanceof Error ? error.message : String(error);
    assert(message.includes('clientCredentialsMode'));
  }

  assert(threw);
});

Deno.test('Config - resolveOAuthExecutionConfig applies precedence from auth over legacy fields', () => {
  const resolved = resolveOAuthExecutionConfig(
    {
      domain: 'https://dev.okta.com',
      clientId: 'legacy-client',
      redirectUri: 'http://localhost:8000/callback',
      authorizationServerId: 'default',
      auth: {
        grantType: 'authorization_code',
        clientId: 'auth-client',
        clientSecret: 'auth-secret',
        tokenUrl: 'https://example.com/token',
        authUrl: 'https://example.com/authorize',
        redirectUrl: 'http://localhost:7879/callback',
      },
    },
  );

  assertEquals(resolved.clientId, 'auth-client');
  assertEquals(resolved.clientSecret, 'auth-secret');
  assertEquals(resolved.tokenUrl, 'https://example.com/token');
  assertEquals(resolved.authUrl, 'https://example.com/authorize');
  assertEquals(resolved.redirectUrl, 'http://localhost:7879/callback');
});

Deno.test('Config - validateOAuthExecutionConfig enforces PKCE safety rule', () => {
  let threw = false;
  try {
    validateOAuthExecutionConfig(
      {
        grantType: 'authorization_code',
        authUrl: 'https://example.com/authorize',
        tokenUrl: 'https://example.com/token',
        redirectUrl: 'http://localhost:7879/callback',
        clientId: 'client-id',
        clientCredentialsMode: 'none',
        scope: 'openid profile email',
        pkceEnabled: false,
        pkceCodeChallengeMethod: 'S256',
        passwordPromptVisible: false,
      },
      'test.auth',
    );
  } catch (error) {
    threw = true;
    const message = error instanceof Error ? error.message : String(error);
    assert(message.includes('clientCredentialsMode=none'));
  }

  assert(threw);
});

Deno.test('Config - resolvePasswordFromEnvironment prefers configured env variable', () => {
  const originalEnv = { ...Deno.env.toObject() };

  try {
    Deno.env.set('TEST_PASSWORD', 'super-secret');
    const resolved = resolvePasswordFromEnvironment({ passwordEnvVar: 'TEST_PASSWORD' });
    assertEquals(resolved, 'super-secret');
  } finally {
    restoreEnv(originalEnv);
  }
});

Deno.test('Config - resolvePasswordFromEnvironment returns undefined when missing env', () => {
  const originalEnv = { ...Deno.env.toObject() };

  try {
    Deno.env.delete('MISSING_PASSWORD');
    const resolved = resolvePasswordFromEnvironment({ passwordEnvVar: 'MISSING_PASSWORD' });
    assertEquals(resolved, undefined);
  } finally {
    restoreEnv(originalEnv);
  }
});

Deno.test('Config - resolveOAuthExecutionConfig normalizes scoped custom request metadata', () => {
  const resolved = resolveOAuthExecutionConfig(
    {
      domain: 'https://dev.okta.com',
      clientId: 'legacy-client',
      redirectUri: 'http://localhost:8000/callback',
      authorizationServerId: 'default',
      auth: {
        grantType: 'authorization_code',
        customRequestParameters: {
          audience: 'api://default',
          resource: {
            value: ['https://resource/one', 'https://resource/two'],
            use: 'in_token_request',
          },
        },
        customRequestHeaders: {
          Accept: {
            value: 'application/json',
            use: 'everywhere',
          },
        },
      },
    },
  );

  assertExists(resolved.customRequestParameters);
  assertExists(resolved.customRequestHeaders);
  assertEquals(resolved.customRequestParameters.audience.values, ['api://default']);
  assertEquals(resolved.customRequestParameters.audience.use, 'everywhere');
  assertEquals(
    resolved.customRequestParameters.resource.values,
    ['https://resource/one', 'https://resource/two'],
  );
  assertEquals(resolved.customRequestParameters.resource.use, 'in_token_request');
  assertEquals(resolved.customRequestHeaders.Accept.values, ['application/json']);
  assertEquals(resolved.customRequestHeaders.Accept.use, 'everywhere');
});

Deno.test('Config - applyOAuthExecutionOverrides gives CLI values highest precedence', () => {
  const base = resolveOAuthExecutionConfig(
    {
      domain: 'https://dev.okta.com',
      clientId: 'legacy-client',
      redirectUri: 'http://localhost:8000/callback',
      authorizationServerId: 'default',
      auth: {
        grantType: 'client_credentials',
        authUrl: 'https://config.example.com/authorize',
        tokenUrl: 'https://config.example.com/token',
        clientId: 'auth-client',
        clientSecret: 'auth-secret',
        clientCredentialsMode: 'basic',
      },
    },
    'client_credentials',
  );

  const overridden = applyOAuthExecutionOverrides(base, {
    tokenUrl: 'https://cli.example.com/token',
    clientId: 'cli-client',
    clientCredentialsMode: 'none',
    scope: 'openid email',
  });

  assertEquals(overridden.authUrl, 'https://config.example.com/authorize');
  assertEquals(overridden.tokenUrl, 'https://cli.example.com/token');
  assertEquals(overridden.clientId, 'cli-client');
  assertEquals(overridden.clientCredentialsMode, 'none');
  assertEquals(overridden.scope, 'openid email');
});
