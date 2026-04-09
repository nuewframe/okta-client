import {
  assert,
  assertEquals,
  assertExists,
  assertStringIncludes,
  assertThrows,
} from '@std/assert';

import {
  type AppConfig,
  applyOAuthExecutionOverrides,
  type AuthProfileConfig,
  getCurrentAuthConfig,
  initializeConfig,
  loadConfig,
  loadUnifiedConfig,
  normalizeConfig,
  resolveConfigSelection,
  resolveOAuthExecutionConfig,
  resolvePasswordFromEnvironment,
  saveConfig,
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

function withTempHome(run: (tempHome: string) => void): void {
  const originalEnv = { ...Deno.env.toObject() };
  const tempHome = Deno.makeTempDirSync();

  try {
    Deno.env.set('HOME', tempHome);
    run(tempHome);
  } finally {
    restoreEnv(originalEnv);
    Deno.removeSync(tempHome, { recursive: true });
  }
}

function withTempDir(run: (tempDir: string) => void): void {
  const originalEnv = { ...Deno.env.toObject() };
  const tempDir = Deno.makeTempDirSync();

  try {
    run(tempDir);
  } finally {
    restoreEnv(originalEnv);
    Deno.removeSync(tempDir, { recursive: true });
  }
}

function createDevAuthProfile(): AuthProfileConfig {
  return {
    type: 'oauth2',
    provider: {
      issuer_uri: 'https://dev.okta.com',
      authorization_url: '/oauth2/default/v1/authorize',
      token_url: '/oauth2/default/v1/token',
    },
    client: {
      client_id: 'test-client-id',
      client_secret: 'test-client-secret',
      client_authentication_method: 'basic',
      grant_type: 'authorization_code',
      redirect_uri: 'http://localhost:8000/callback',
      scope: 'openid profile email',
    },
  };
}

// ============================================================================
// Configuration Loading Tests
// ============================================================================

Deno.test('Config - loadConfig fails when unified config is missing', () => {
  withTempHome(() => {
    const error = assertThrows(() => loadConfig(), Error);
    assertStringIncludes(error.message, 'No configuration found');
  });
});

Deno.test('Config - loadUnifiedConfig returns null when config file is missing', () => {
  withTempHome(() => {
    const config = loadUnifiedConfig();
    assertEquals(config, null);
  });
});

Deno.test('Config - initializeConfig creates a readable default config', () => {
  withTempHome(() => {
    const initialized = initializeConfig();
    assertExists(initialized.security.auth.dev.default);
    assertEquals(initialized.security.env, 'dev');
    assertEquals(initialized.security.profile, 'default');
    assertEquals(Object.keys(initialized.security.auth), ['dev']);
    assertEquals(
      initialized.security.auth.dev.default.provider.authorization_url,
      '/oauth2/default/v1/authorize',
    );
    assertEquals(
      initialized.security.auth.dev.default.provider.token_url,
      '/oauth2/default/v1/token',
    );

    const loaded = loadUnifiedConfig();
    assertExists(loaded);
    assertEquals(loaded?.security.env, 'dev');
    assertEquals(loaded?.security.profile, 'default');
    assertExists(loaded?.security.auth.dev.default);
    assertEquals(Object.keys(loaded?.security.auth ?? {}), ['dev']);
  });
});

Deno.test('Config - loadUnifiedConfig reads unified config from file', () => {
  withTempHome((tempHome) => {
    Deno.mkdirSync(`${tempHome}/.nuewframe/nfauth`, { recursive: true });
    Deno.writeTextFileSync(
      `${tempHome}/.nuewframe/nfauth/config.yaml`,
      [
        'security:',
        '  env: qa',
        '  profile: api',
        '  auth:',
        '    qa:',
        '      api:',
        '        type: oauth2',
        '        provider:',
        '          issuer_uri: https://qa.okta.com',
        '          authorization_url: https://qa.okta.com/oauth2/v1/authorize',
        '          token_url: https://qa.okta.com/oauth2/v1/token',
        '        client:',
        '          client_id: qa-client-id',
        '          client_secret: qa-client-secret',
        '          client_authentication_method: basic',
        '          grant_type: authorization_code',
        '          redirect_uri: http://localhost:8000/callback',
        '          scope: openid profile email',
      ].join('\n'),
    );

    const config = loadUnifiedConfig();

    assertExists(config);
    assertEquals(config?.security.env, 'qa');
    assertEquals(config?.security.profile, 'api');
    assertEquals(config?.security.auth.qa.api.provider.issuer_uri, 'https://qa.okta.com');
    assertEquals(config?.security.auth.qa.api.client.client_id, 'qa-client-id');
  });
});

Deno.test('Config - saveConfig writes config to YAML file', () => {
  withTempHome((tempHome) => {
    const config: AppConfig = {
      security: {
        env: 'dev',
        profile: 'default',
        auth: {
          dev: {
            default: createDevAuthProfile(),
          },
        },
      },
    };

    saveConfig(config);

    const saved = Deno.readTextFileSync(`${tempHome}/.nuewframe/nfauth/config.yaml`);
    assert(saved.includes('env: dev'));
    assert(saved.includes('profile: default'));
    assert(saved.includes('issuer_uri'));
    assert(saved.includes('client_id: test-client-id'));
  });
});

// ============================================================================
// Configuration Selection Tests
// ============================================================================

Deno.test('Config - getCurrentAuthConfig returns the selected profile', () => {
  const config: AppConfig = {
    security: {
      env: 'dev',
      profile: 'default',
      auth: {
        dev: {
          default: createDevAuthProfile(),
        },
      },
    },
  };

  const profile = getCurrentAuthConfig(config, 'dev', 'default');

  assertEquals(profile.provider.issuer_uri, 'https://dev.okta.com');
  assertEquals(profile.client.client_id, 'test-client-id');
});

Deno.test('Config - getCurrentAuthConfig throws when environment not found', () => {
  const config: AppConfig = {
    security: {
      env: 'dev',
      profile: 'default',
      auth: {
        dev: {
          default: createDevAuthProfile(),
        },
      },
    },
  };

  const error = assertThrows(
    () => getCurrentAuthConfig(config, 'qa', 'default'),
    Error,
  );

  assertStringIncludes(error.message, "Environment 'qa' not found");
});

Deno.test('Config - getCurrentAuthConfig throws when profile not found', () => {
  const config: AppConfig = {
    security: {
      env: 'dev',
      profile: 'default',
      auth: {
        dev: {
          default: createDevAuthProfile(),
        },
      },
    },
  };

  const error = assertThrows(
    () => getCurrentAuthConfig(config, 'dev', 'api'),
    Error,
  );

  assertStringIncludes(error.message, "Profile 'api' not found");
});

Deno.test('Config - resolveConfigSelection uses explicit args when provided', () => {
  const config: AppConfig = {
    security: {
      env: 'prod',
      profile: 'cards',
      auth: {},
    },
  };

  const selection = resolveConfigSelection(config, 'dev', 'default');

  assertEquals(selection.env, 'dev');
  assertEquals(selection.profile, 'default');
});

Deno.test('Config - resolveConfigSelection uses global env/profile when args are undefined', () => {
  const config: AppConfig = {
    security: {
      env: 'stg',
      profile: 'api',
      auth: {},
    },
  };

  const selection = resolveConfigSelection(config, undefined, undefined);

  assertEquals(selection.env, 'stg');
  assertEquals(selection.profile, 'api');
});

Deno.test('Config - resolveConfigSelection uses defaults when global values are missing', () => {
  const config: AppConfig = {
    security: {
      env: '',
      profile: '',
      auth: {},
    },
  };

  const selection = resolveConfigSelection(config);

  assertEquals(selection.env, 'dev');
  assertEquals(selection.profile, 'default');
});

// ============================================================================
// Configuration Validation Tests
// ============================================================================

Deno.test('Config - normalizeConfig validates all profiles', () => {
  const config: AppConfig = {
    security: {
      env: 'dev',
      profile: 'default',
      auth: {
        dev: {
          default: createDevAuthProfile(),
        },
      },
    },
  };

  const normalized = normalizeConfig(config);

  assertEquals(normalized.security.env, 'dev');
  assertEquals(normalized.security.profile, 'default');
  assertExists(normalized.security.auth.dev.default);
});

Deno.test('Config - normalizeConfig rejects invalid provider issuer_uri', () => {
  const config: AppConfig = {
    security: {
      env: 'dev',
      profile: 'default',
      auth: {
        dev: {
          default: {
            provider: {
              issuer_uri: 'not-a-url',
              authorization_url: 'https://dev.okta.com/oauth2/v1/authorize',
              token_url: 'https://dev.okta.com/oauth2/v1/token',
            },
            client: {
              client_id: 'test-client-id',
            },
          },
        },
      },
    },
  };

  const error = assertThrows(
    () => normalizeConfig(config),
    Error,
  );

  assertStringIncludes(error.message, 'issuer_uri must be a valid absolute URL');
});

Deno.test('Config - normalizeConfig accepts relative provider endpoint paths', () => {
  const config: AppConfig = {
    security: {
      env: 'dev',
      profile: 'default',
      auth: {
        dev: {
          default: {
            provider: {
              issuer_uri: 'https://dev.okta.com/oauth2/default',
              authorization_url: '/v1/authorize',
              token_url: 'v1/token',
              device_auth_url: '/v1/device/authorize',
            },
            client: {
              client_id: 'test-client-id',
            },
          },
        },
      },
    },
  };

  const normalized = normalizeConfig(config);

  assertExists(normalized.security.auth.dev.default);
});

Deno.test('Config - normalizeConfig rejects invalid client_id (empty)', () => {
  const config: AppConfig = {
    security: {
      env: 'dev',
      profile: 'default',
      auth: {
        dev: {
          default: {
            provider: {
              issuer_uri: 'https://dev.okta.com',
              authorization_url: 'https://dev.okta.com/oauth2/v1/authorize',
              token_url: 'https://dev.okta.com/oauth2/v1/token',
            },
            client: {
              client_id: '',
            },
          },
        },
      },
    },
  };

  const error = assertThrows(
    () => normalizeConfig(config),
    Error,
  );

  assertStringIncludes(error.message, 'client_id is required');
});

Deno.test('Config - normalizeConfig rejects invalid grant_type', () => {
  const config: AppConfig = {
    security: {
      env: 'dev',
      profile: 'default',
      auth: {
        dev: {
          default: {
            provider: {
              issuer_uri: 'https://dev.okta.com',
              authorization_url: 'https://dev.okta.com/oauth2/v1/authorize',
              token_url: 'https://dev.okta.com/oauth2/v1/token',
            },
            client: {
              client_id: 'test-client-id',
              grant_type: 'invalid-grant' as unknown as 'authorization_code',
            },
          },
        },
      },
    },
  };

  const error = assertThrows(
    () => normalizeConfig(config),
    Error,
  );

  assertStringIncludes(error.message, 'grant_type must be one of');
});

Deno.test('Config - normalizeConfig rejects invalid scoped value', () => {
  const config: AppConfig = {
    security: {
      env: 'dev',
      profile: 'default',
      auth: {
        dev: {
          default: {
            provider: {
              issuer_uri: 'https://dev.okta.com',
              authorization_url: 'https://dev.okta.com/oauth2/v1/authorize',
              token_url: 'https://dev.okta.com/oauth2/v1/token',
            },
            client: {
              client_id: 'test-client-id',
            },
            options: {
              custom_request_parameters: {
                resource: {
                  value: 'https://api.example.com',
                  use: 'invalid-use' as unknown as 'everywhere',
                },
              },
            },
          },
        },
      },
    },
  };

  const error = assertThrows(
    () => normalizeConfig(config),
    Error,
  );

  assertStringIncludes(
    error.message,
    'must be one of everywhere, in_auth_request, in_token_request',
  );
});

// ============================================================================
// OAuth Execution Config Tests
// ============================================================================

Deno.test('Config - resolveOAuthExecutionConfig builds OAuth config from auth profile', () => {
  const profile = createDevAuthProfile();

  const resolved = resolveOAuthExecutionConfig(profile);

  assertEquals(resolved.clientId, 'test-client-id');
  assertEquals(resolved.clientSecret, 'test-client-secret');
  assertEquals(resolved.clientAuthenticationMethod, 'basic');
  assertEquals(resolved.authUrl, 'https://dev.okta.com/oauth2/default/v1/authorize');
  assertEquals(resolved.tokenUrl, 'https://dev.okta.com/oauth2/default/v1/token');
  assertEquals(resolved.redirectUrl, 'http://localhost:8000/callback');
  assertEquals(resolved.scope, 'openid profile email');
  assertEquals(resolved.grantType, 'authorization_code');
  assertEquals(resolved.pkceEnabled, true);
});

Deno.test('Config - resolveOAuthExecutionConfig preserves absolute provider URLs', () => {
  const profile: AuthProfileConfig = {
    provider: {
      issuer_uri: 'https://dev.okta.com/oauth2/default',
      authorization_url: 'https://auth.example.com/authorize',
      token_url: 'https://auth.example.com/token',
      device_auth_url: 'https://auth.example.com/device',
    },
    client: {
      client_id: 'test-client-id',
      redirect_uri: 'http://localhost:8000/callback',
    },
  };

  const resolved = resolveOAuthExecutionConfig(profile);

  assertEquals(resolved.authUrl, 'https://auth.example.com/authorize');
  assertEquals(resolved.tokenUrl, 'https://auth.example.com/token');
  assertEquals(resolved.deviceAuthUrl, 'https://auth.example.com/device');
});

Deno.test('Config - resolveOAuthExecutionConfig resolves relative provider URLs from issuer_uri', () => {
  const profile: AuthProfileConfig = {
    provider: {
      issuer_uri: 'https://dev.okta.com/oauth2/default',
      authorization_url: '/v1/authorize',
      token_url: 'v1/token',
      device_auth_url: '/v1/device/authorize',
    },
    client: {
      client_id: 'test-client-id',
      redirect_uri: 'http://localhost:8000/callback',
    },
  };

  const resolved = resolveOAuthExecutionConfig(profile);

  assertEquals(resolved.authUrl, 'https://dev.okta.com/oauth2/default/v1/authorize');
  assertEquals(resolved.tokenUrl, 'https://dev.okta.com/oauth2/default/v1/token');
  assertEquals(resolved.deviceAuthUrl, 'https://dev.okta.com/oauth2/default/v1/device/authorize');
});

Deno.test('Config - resolveOAuthExecutionConfig respects explicit PKCE setting', () => {
  const profile: AuthProfileConfig = {
    provider: {
      issuer_uri: 'https://dev.okta.com',
      authorization_url: 'https://dev.okta.com/oauth2/v1/authorize',
      token_url: 'https://dev.okta.com/oauth2/v1/token',
    },
    client: {
      client_id: 'test-client-id',
      grant_type: 'authorization_code',
      redirect_uri: 'http://localhost:8000/callback',
    },
    options: {
      pkce: false,
    },
  };

  const resolved = resolveOAuthExecutionConfig(profile);

  assertEquals(resolved.pkceEnabled, false);
});

Deno.test('Config - resolveOAuthExecutionConfig handles client_credentials grant', () => {
  const profile: AuthProfileConfig = {
    provider: {
      issuer_uri: 'https://dev.okta.com',
      authorization_url: 'https://dev.okta.com/oauth2/v1/authorize',
      token_url: 'https://dev.okta.com/oauth2/v1/token',
    },
    client: {
      client_id: 'service-client-id',
      client_secret: 'service-client-secret',
      grant_type: 'client_credentials',
    },
  };

  const resolved = resolveOAuthExecutionConfig(profile);

  assertEquals(resolved.grantType, 'client_credentials');
  assertEquals(resolved.pkceEnabled, false);
});

Deno.test('Config - resolveOAuthExecutionConfig normalizes scoped values', () => {
  const profile: AuthProfileConfig = {
    provider: {
      issuer_uri: 'https://dev.okta.com',
      authorization_url: 'https://dev.okta.com/oauth2/v1/authorize',
      token_url: 'https://dev.okta.com/oauth2/v1/token',
    },
    client: {
      client_id: 'test-client-id',
      grant_type: 'authorization_code',
      redirect_uri: 'http://localhost:8000/callback',
    },
    options: {
      custom_request_parameters: {
        audience: 'https://api.example.com',
        resource: {
          value: ['https://resource/one', 'https://resource/two'],
          use: 'in_token_request',
        },
      },
      custom_request_headers: {
        'User-Agent': 'nfauth/1.0',
      },
    },
  };

  const resolved = resolveOAuthExecutionConfig(profile);

  assertExists(resolved.customRequestParameters);
  assertEquals(resolved.customRequestParameters?.audience.values, ['https://api.example.com']);
  assertEquals(resolved.customRequestParameters?.audience.use, 'everywhere');
  assertEquals(resolved.customRequestParameters?.resource.values, [
    'https://resource/one',
    'https://resource/two',
  ]);
  assertEquals(resolved.customRequestParameters?.resource.use, 'in_token_request');

  assertExists(resolved.customRequestHeaders);
  assertEquals(resolved.customRequestHeaders?.['User-Agent'].values, ['nfauth/1.0']);
  assertEquals(resolved.customRequestHeaders?.['User-Agent'].use, 'everywhere');
});

// ============================================================================
// OAuth Execution Overrides Tests
// ============================================================================

Deno.test('Config - applyOAuthExecutionOverrides gives CLI values highest precedence', () => {
  const base = resolveOAuthExecutionConfig(createDevAuthProfile());

  const overridden = applyOAuthExecutionOverrides(base, {
    tokenUrl: 'https://cli-override.example.com/token',
    clientId: 'cli-override-client-id',
  });

  assertEquals(overridden.tokenUrl, 'https://cli-override.example.com/token');
  assertEquals(overridden.clientId, 'cli-override-client-id');
  assertEquals(overridden.authUrl, 'https://dev.okta.com/oauth2/default/v1/authorize');
});

Deno.test('Config - applyOAuthExecutionOverrides merges custom parameters', () => {
  const profile: AuthProfileConfig = {
    provider: {
      issuer_uri: 'https://dev.okta.com',
      authorization_url: 'https://dev.okta.com/oauth2/v1/authorize',
      token_url: 'https://dev.okta.com/oauth2/v1/token',
    },
    client: {
      client_id: 'test-client-id',
      grant_type: 'authorization_code',
      redirect_uri: 'http://localhost:8000/callback',
    },
    options: {
      custom_request_parameters: {
        config_param: 'config_value',
      },
    },
  };

  const base = resolveOAuthExecutionConfig(profile);

  const overridden = applyOAuthExecutionOverrides(base, {
    customRequestParameters: {
      cli_param: {
        values: ['cli_value'],
        use: 'everywhere',
      },
    },
  });

  assertExists(overridden.customRequestParameters);
  assertEquals(overridden.customRequestParameters?.config_param.values, ['config_value']);
  assertEquals(overridden.customRequestParameters?.cli_param.values, ['cli_value']);
});

// ============================================================================
// OAuth Execution Validation Tests
// ============================================================================

Deno.test('Config - validateOAuthExecutionConfig accepts valid authorization_code config', () => {
  const config = resolveOAuthExecutionConfig(createDevAuthProfile());

  // Should not throw
  validateOAuthExecutionConfig(config, 'test.config');
});

Deno.test('Config - validateOAuthExecutionConfig rejects missing authUrl for authorization_code', () => {
  const config = resolveOAuthExecutionConfig(createDevAuthProfile());
  config.authUrl = '';

  const error = assertThrows(
    () => validateOAuthExecutionConfig(config, 'test.config'),
    Error,
  );

  assertStringIncludes(error.message, 'authUrl is required for authorization_code');
});

Deno.test('Config - validateOAuthExecutionConfig rejects authorization_code without PKCE and clientAuthenticationMethod=none', () => {
  const config = resolveOAuthExecutionConfig(createDevAuthProfile());
  config.pkceEnabled = false;
  config.clientAuthenticationMethod = 'none';

  const error = assertThrows(
    () => validateOAuthExecutionConfig(config, 'test.config'),
    Error,
  );

  assertStringIncludes(
    error.message,
    'clientAuthenticationMethod=none is not supported when grantType=authorization_code and PKCE is disabled',
  );
});

Deno.test('Config - validateOAuthExecutionConfig rejects client_credentials without clientSecret when needed', () => {
  const config = resolveOAuthExecutionConfig(createDevAuthProfile());
  config.grantType = 'client_credentials';
  config.clientSecret = undefined;
  config.clientAuthenticationMethod = 'basic';

  const error = assertThrows(
    () => validateOAuthExecutionConfig(config, 'test.config'),
    Error,
  );

  assertStringIncludes(
    error.message,
    'clientSecret is required when clientAuthenticationMethod is basic or in_body',
  );
});

// ============================================================================
// Password Environment Variable Tests
// ============================================================================

Deno.test('Config - resolvePasswordFromEnvironment retrieves password from env var', () => {
  withTempDir(() => {
    Deno.env.set('TEST_PASSWORD', 'super-secret');

    const profile: AuthProfileConfig = {
      provider: {
        issuer_uri: 'https://dev.okta.com',
        authorization_url: 'https://dev.okta.com/oauth2/v1/authorize',
        token_url: 'https://dev.okta.com/oauth2/v1/token',
      },
      client: {
        client_id: 'test-client-id',
      },
      options: {
        password_env_var: 'TEST_PASSWORD',
      },
    };

    const resolved = resolvePasswordFromEnvironment(profile);

    assertEquals(resolved, 'super-secret');
  });
});

Deno.test('Config - resolvePasswordFromEnvironment returns undefined when env var is missing', () => {
  withTempDir(() => {
    Deno.env.delete('MISSING_PASSWORD');

    const profile: AuthProfileConfig = {
      provider: {
        issuer_uri: 'https://dev.okta.com',
        authorization_url: 'https://dev.okta.com/oauth2/v1/authorize',
        token_url: 'https://dev.okta.com/oauth2/v1/token',
      },
      client: {
        client_id: 'test-client-id',
      },
      options: {
        password_env_var: 'MISSING_PASSWORD',
      },
    };

    const resolved = resolvePasswordFromEnvironment(profile);

    assertEquals(resolved, undefined);
  });
});

Deno.test('Config - resolvePasswordFromEnvironment returns undefined when no env var is configured', () => {
  const profile: AuthProfileConfig = {
    provider: {
      issuer_uri: 'https://dev.okta.com',
      authorization_url: 'https://dev.okta.com/oauth2/v1/authorize',
      token_url: 'https://dev.okta.com/oauth2/v1/token',
    },
    client: {
      client_id: 'test-client-id',
    },
  };

  const resolved = resolvePasswordFromEnvironment(profile);

  assertEquals(resolved, undefined);
});

// ============================================================================
// Environment Override Tests
// ============================================================================

Deno.test('Config - loadUnifiedConfig honors NUEWFRAME_CONFIG override path', () => {
  withTempDir((tempDir) => {
    const customPath = `${tempDir}/custom-config.yaml`;
    Deno.env.set('NUEWFRAME_CONFIG', customPath);

    Deno.writeTextFileSync(
      customPath,
      [
        'security:',
        '  env: qa',
        '  profile: api',
        '  auth:',
        '    qa:',
        '      api:',
        '        type: oauth2',
        '        provider:',
        '          issuer_uri: https://qa.okta.com',
        '          authorization_url: https://qa.okta.com/oauth2/v1/authorize',
        '          token_url: https://qa.okta.com/oauth2/v1/token',
        '        client:',
        '          client_id: qa-client-id',
      ].join('\n'),
    );

    const config = loadUnifiedConfig();

    assertExists(config);
    assertEquals(config?.security.auth.qa.api.client.client_id, 'qa-client-id');
  });
});
