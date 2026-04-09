import { assertEquals, assertNotEquals, assertStringIncludes } from '@std/assert';
import { dirname, fromFileUrl } from '@std/path';

const repoRoot = dirname(fromFileUrl(import.meta.url));
const integrationBinDir = Deno.makeTempDirSync({ prefix: 'nfauth-it-' });
const integrationBinPath = `${integrationBinDir}/nfauth-integration`;
let integrationBinReady = false;
let integrationBinBuildInFlight: Promise<void> | null = null;

async function ensureIntegrationBinary(): Promise<void> {
  if (integrationBinReady) {
    return;
  }

  if (integrationBinBuildInFlight) {
    await integrationBinBuildInFlight;
    return;
  }

  integrationBinBuildInFlight = (async () => {
    const compile = new Deno.Command('deno', {
      args: [
        'compile',
        '--allow-env',
        '--allow-net',
        '--allow-read',
        '--allow-write',
        '--allow-run',
        '--output',
        integrationBinPath,
        'main.ts',
      ],
      cwd: repoRoot,
      stdout: 'piped',
      stderr: 'piped',
    });

    const out = await compile.output();
    if (out.code !== 0) {
      throw new Error(new TextDecoder().decode(out.stderr));
    }

    integrationBinReady = true;
  })();

  try {
    await integrationBinBuildInFlight;
  } finally {
    integrationBinBuildInFlight = null;
  }
}

function createJwt(payload: Record<string, unknown>): string {
  const header = { alg: 'none', typ: 'JWT' };
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `${encode(header)}.${encode(payload)}.signature`;
}

async function runCli(
  args: string[],
  homeDir: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  await ensureIntegrationBinary();

  const env = { ...Deno.env.toObject() };
  // Keep subprocess behavior deterministic and isolated from host auth config env vars.
  delete env.NUEWFRAME_CONFIG;
  delete env.OKTA_DOMAIN;
  delete env.OKTA_CLIENT_ID;
  delete env.OKTA_API_TOKEN;
  delete env.OKTA_REDIRECT_URI;
  delete env.OKTA_SCOPE;
  delete env.OKTA_DISCOVERY_URL;
  env.HOME = homeDir;

  const command = new Deno.Command(integrationBinPath, {
    args,
    cwd: repoRoot,
    env,
    stdout: 'piped',
    stderr: 'piped',
  });

  const output = await command.output();
  return {
    code: output.code,
    stdout: new TextDecoder().decode(output.stdout),
    stderr: new TextDecoder().decode(output.stderr),
  };
}

async function writeConfig(homeDir: string, configLines: string[]): Promise<void> {
  await Deno.mkdir(`${homeDir}/.nuewframe/nfauth`, { recursive: true });
  await Deno.writeTextFile(`${homeDir}/.nuewframe/nfauth/config.yaml`, configLines.join('\n'));
}

interface SimpleConfigOptions {
  domain: string;
  clientId?: string;
  redirectUri?: string;
  scope?: string;
  authLines?: string[];
}

function buildSimpleConfigLines(options: SimpleConfigOptions): string[] {
  const lines = [
    'security:',
    '  auth:',
    '    dev:',
    '      default:',
    `        domain: ${options.domain}`,
    `        clientId: ${options.clientId ?? 'test-client'}`,
  ];

  if (options.redirectUri) {
    lines.push(`        redirectUri: ${options.redirectUri}`);
  }

  lines.push(`        scope: ${options.scope ?? 'openid profile email'}`);

  if ((options.authLines?.length ?? 0) > 0) {
    lines.push('        auth:');
    for (const authLine of options.authLines ?? []) {
      lines.push(`          ${authLine}`);
    }
  }

  lines.push('current:', '  env: dev', '  profile: default');
  return lines;
}

async function withTempHome(testFn: (homeDir: string) => Promise<void>): Promise<void> {
  const homeDir = await Deno.makeTempDir();

  try {
    await testFn(homeDir);
  } finally {
    await Deno.remove(homeDir, { recursive: true });
  }
}

async function writePendingPkceState(
  homeDir: string,
  state: Partial<Record<string, string>> = {},
): Promise<void> {
  const now = new Date().toISOString();
  const future = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  await Deno.mkdir(`${homeDir}/.nuewframe`, { recursive: true });
  await Deno.writeTextFile(
    `${homeDir}/.nuewframe/pkce-state.json`,
    JSON.stringify(
      {
        env: 'dev',
        profile: 'default',
        redirectUri: 'http://localhost:7879/callback',
        scope: 'openid profile email',
        codeVerifier: 'code-verifier-xyz',
        codeChallenge: 'challenge-xyz',
        state: 'expected-state',
        nonce: 'nonce-xyz',
        createdAt: now,
        expiresAt: future,
        timestamp: now,
        ...state,
      },
      null,
      2,
    ),
  );
}

async function writeCredential(homeDir: string, accessToken: string): Promise<void> {
  const credDir = `${homeDir}/.nuewframe`;
  await Deno.mkdir(credDir, { recursive: true });
  await Deno.writeTextFile(
    `${credDir}/credential.json`,
    JSON.stringify(
      {
        access_token: accessToken,
        id_token: createJwt({ sub: 'saved-id', iss: 'issuer' }),
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'openid profile email',
        refresh_token: 'refresh-token',
        timestamp: '2026-01-01T00:00:00.000Z',
      },
      null,
      2,
    ),
  );
}

async function waitForBoundPort(
  getPort: () => number,
  timeoutMs = 3000,
): Promise<number> {
  const start = Date.now();

  while (getPort() === 0) {
    if (Date.now() - start >= timeoutMs) {
      throw new Error(`Timed out waiting for ephemeral server port after ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  return getPort();
}

Deno.test('Integration - token info uses saved credentials by default', async () => {
  await withTempHome(async (homeDir) => {
    await writeCredential(homeDir, createJwt({ sub: 'saved-access', iss: 'issuer' }));

    const result = await runCli(['token', 'info', '--log-level', 'none'], homeDir);
    assertEquals(result.code, 0, result.stderr);

    const info = JSON.parse(result.stdout.trim()) as Record<string, unknown>;
    assertEquals(info.token_type, 'Bearer');
    assertEquals(info.scope, 'openid profile email');
    assertEquals(info.has_id_token, true);
    assertEquals(info.has_refresh_token, true);
  });
});

Deno.test('Integration - token claims --token prefers explicit token over saved token', async () => {
  await withTempHome(async (homeDir) => {
    const savedToken = createJwt({ sub: 'saved-user', iss: 'saved-issuer' });
    const explicitToken = createJwt({ sub: 'explicit-user', iss: 'explicit-issuer' });
    await writeCredential(homeDir, savedToken);

    const result = await runCli(
      ['token', 'claims', '--token', explicitToken, '--log-level', 'none'],
      homeDir,
    );

    assertEquals(result.code, 0, result.stderr);
    assertStringIncludes(result.stdout, 'explicit-user');
    assertNotEquals(result.stdout.includes('saved-user'), true);
  });
});

Deno.test('Integration - token claims uses saved access token by default', async () => {
  await withTempHome(async (homeDir) => {
    const savedToken = createJwt({ sub: 'default-saved-user', iss: 'saved-issuer' });
    await writeCredential(homeDir, savedToken);

    const result = await runCli(['token', 'claims', '--log-level', 'none'], homeDir);

    assertEquals(result.code, 0, result.stderr);
    assertStringIncludes(result.stdout, 'default-saved-user');
  });
});

Deno.test('Integration - login code supports manual completion via --url', async () => {
  const homeDir = await Deno.makeTempDir();
  let tokenPort = 0;
  let receivedBody = '';
  const expectedAccessToken = createJwt({ sub: 'manual-flow-user', iss: 'local' });

  const server = Deno.serve(
    {
      hostname: '127.0.0.1',
      port: 0,
      onListen: ({ port }) => {
        tokenPort = port;
      },
    },
    async (req) => {
      const url = new URL(req.url);
      if (url.pathname === '/oauth2/default/v1/token') {
        receivedBody = await req.text();
        return new Response(
          JSON.stringify({
            access_token: expectedAccessToken,
            id_token: createJwt({ sub: 'manual-flow-id', iss: 'local' }),
            token_type: 'Bearer',
            expires_in: 3600,
            scope: 'openid profile email',
            refresh_token: 'refresh-123',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response('Not found', { status: 404 });
    },
  );

  try {
    await waitForBoundPort(() => tokenPort);

    await writeConfig(
      homeDir,
      [
        'security:',
        '  auth:',
        '    dev:',
        '      default:',
        `        domain: http://127.0.0.1:${tokenPort}`,
        '        clientId: test-client',
        '        auth:',
        '          clientSecret: test-secret',
        '        redirectUri: http://localhost:7879/callback',
        '        scope: openid profile email',
        'current:',
        '  env: dev',
        '  profile: default',
      ],
    );

    await writePendingPkceState(homeDir);

    const result = await runCli(
      [
        'login',
        'code',
        '--url',
        'http://localhost:7879/callback?code=manual-code-123&state=expected-state',
        '--log-level',
        'none',
      ],
      homeDir,
    );

    assertEquals(result.code, 0, result.stderr);
    assertStringIncludes(receivedBody, 'grant_type=authorization_code');
    assertStringIncludes(receivedBody, 'code=manual-code-123');
    assertStringIncludes(receivedBody, 'code_verifier=code-verifier-xyz');

    const cred = JSON.parse(await Deno.readTextFile(`${homeDir}/.nuewframe/credential.json`)) as {
      access_token: string;
    };
    assertEquals(cred.access_token, expectedAccessToken);

    let pkceExists = true;
    try {
      await Deno.stat(`${homeDir}/.nuewframe/pkce-state.json`);
    } catch {
      pkceExists = false;
    }
    assertEquals(pkceExists, false);
  } finally {
    server.shutdown();
    await server.finished;
    await Deno.remove(homeDir, { recursive: true });
  }
});

Deno.test('Integration - login code rejects expired pending login transaction', async () => {
  await withTempHome(async (homeDir) => {
    const past = new Date(Date.now() - 60 * 1000).toISOString();
    await Deno.mkdir(`${homeDir}/.nuewframe`, { recursive: true });
    await Deno.writeTextFile(
      `${homeDir}/.nuewframe/pkce-state.json`,
      JSON.stringify(
        {
          env: 'dev',
          profile: 'default',
          redirectUri: 'http://localhost:7879/callback',
          scope: 'openid profile email',
          codeVerifier: 'expired-verifier',
          codeChallenge: 'expired-challenge',
          state: 'expired-state',
          nonce: 'expired-nonce',
          createdAt: past,
          expiresAt: past,
          timestamp: past,
        },
        null,
        2,
      ),
    );

    const result = await runCli(['login', 'code', 'manual-code', '--log-level', 'none'], homeDir);

    assertEquals(result.code, 1);
    assertStringIncludes(result.stderr, 'Pending login state has expired');
  });
});

Deno.test('Integration - login url fails clearly when redirect URI is missing', async () => {
  await withTempHome(async (homeDir) => {
    await writeConfig(
      homeDir,
      buildSimpleConfigLines({
        domain: 'https://issuer.example.com',
        redirectUri: undefined,
        authLines: ['grantType: authorization_code', 'clientSecret: test-secret'],
      }),
    );

    const result = await runCli(
      [
        'login',
        'url',
        '--state',
        'state-missing-redirect',
        '--nonce',
        'nonce-1',
        '--log-level',
        'none',
      ],
      homeDir,
    );

    assertEquals(result.code, 1);
    assertStringIncludes(result.stderr, 'No redirect URI configured');
  });
});

Deno.test('Integration - login url emits only auth-scoped metadata in authorize URL', async () => {
  const homeDir = await Deno.makeTempDir();

  try {
    await writeConfig(
      homeDir,
      [
        'security:',
        '  auth:',
        '    dev:',
        '      default:',
        '        domain: https://issuer.example.com',
        '        clientId: test-client',
        '        redirectUri: http://localhost:7879/callback',
        '        scope: openid profile email',
        '        auth:',
        '          clientSecret: test-secret',
        '          grantType: authorization_code',
        '          customRequestParameters:',
        '            audience: api://default',
        '            prompt:',
        '              value: consent',
        '              use: in_auth_request',
        '            resource:',
        '              value: token-only',
        '              use: in_token_request',
        'current:',
        '  env: dev',
        '  profile: default',
      ],
    );

    const result = await runCli(
      ['login', 'url', '--state', 'state-1', '--nonce', 'nonce-1', '--log-level', 'none'],
      homeDir,
    );

    assertEquals(result.code, 0, result.stderr);
    assertStringIncludes(result.stdout, 'audience=api%3A%2F%2Fdefault');
    assertStringIncludes(result.stdout, 'prompt=consent');
    assertEquals(result.stdout.includes('resource=token-only'), false);
  } finally {
    await Deno.remove(homeDir, { recursive: true });
  }
});

Deno.test('Integration - login url uses configured pkce code challenge method', async () => {
  await withTempHome(async (homeDir) => {
    await writeConfig(
      homeDir,
      buildSimpleConfigLines({
        domain: 'https://issuer.example.com',
        redirectUri: 'http://localhost:7879/callback',
        authLines: [
          'grantType: authorization_code',
          'clientSecret: test-secret',
          'pkce:',
          '  enabled: true',
          '  codeChallengeMethod: plain',
        ],
      }),
    );

    const result = await runCli(
      ['login', 'url', '--state', 'state-plain', '--nonce', 'nonce-plain', '--log-level', 'none'],
      homeDir,
    );

    assertEquals(result.code, 0, result.stderr);
    assertStringIncludes(result.stdout, 'code_challenge_method=plain');
  });
});

Deno.test('Integration - login url rejects malformed --param-auth key=value pairs', async () => {
  await withTempHome(async (homeDir) => {
    await writeConfig(
      homeDir,
      buildSimpleConfigLines({
        domain: 'https://issuer.example.com',
        redirectUri: 'http://localhost:7879/callback',
        authLines: ['grantType: authorization_code', 'clientSecret: test-secret'],
      }),
    );

    const result = await runCli(
      [
        'login',
        'url',
        '--param-auth',
        'prompt',
        '--state',
        'state-invalid',
        '--nonce',
        'nonce-invalid',
        '--log-level',
        'none',
      ],
      homeDir,
    );

    assertEquals(result.code, 1);
    assertStringIncludes(result.stderr, 'invalid key=value pair');
  });
});

Deno.test('Integration - login url rejects invalid --client-credentials-mode value', async () => {
  await withTempHome(async (homeDir) => {
    await writeConfig(
      homeDir,
      buildSimpleConfigLines({
        domain: 'https://issuer.example.com',
        redirectUri: 'http://localhost:7879/callback',
        authLines: ['grantType: authorization_code', 'clientSecret: test-secret'],
      }),
    );

    const result = await runCli(
      [
        'login',
        'url',
        '--client-credentials-mode',
        'header',
        '--state',
        'state-invalid-mode',
        '--nonce',
        'nonce-invalid-mode',
        '--log-level',
        'none',
      ],
      homeDir,
    );

    assertEquals(result.code, 1);
    assertStringIncludes(
      result.stderr,
      '--client-credentials-mode must be one of basic, in_body, none',
    );
  });
});

Deno.test('Integration - service token rejects malformed --header-token key=value pairs', async () => {
  await withTempHome(async (homeDir) => {
    await writeConfig(
      homeDir,
      buildSimpleConfigLines({
        domain: 'https://issuer.example.com',
        redirectUri: 'http://localhost:7879/callback',
        authLines: ['grantType: client_credentials', 'clientSecret: test-secret'],
      }),
    );

    const result = await runCli(
      [
        'service',
        'token',
        '--header-token',
        'X-Bad-Header',
        '--scope',
        'openid profile email',
        '--log-level',
        'none',
      ],
      homeDir,
    );

    assertEquals(result.code, 1);
    assertStringIncludes(result.stderr, 'invalid key=value pair');
  });
});

Deno.test('Integration - service token rejects invalid --client-credentials-mode value', async () => {
  await withTempHome(async (homeDir) => {
    await writeConfig(
      homeDir,
      buildSimpleConfigLines({
        domain: 'https://issuer.example.com',
        redirectUri: 'http://localhost:7879/callback',
        authLines: ['grantType: client_credentials', 'clientSecret: test-secret'],
      }),
    );

    const result = await runCli(
      [
        'service',
        'token',
        '--client-credentials-mode',
        'header',
        '--scope',
        'openid profile email',
        '--log-level',
        'none',
      ],
      homeDir,
    );

    assertEquals(result.code, 1);
    assertStringIncludes(
      result.stderr,
      '--client-credentials-mode must be one of basic, in_body, none',
    );
  });
});

Deno.test('Integration - service token fails clearly when no unified config exists', async () => {
  await withTempHome(async (homeDir) => {
    const result = await runCli(
      ['service', 'token', '--scope', 'openid profile email', '--log-level', 'none'],
      homeDir,
    );

    assertEquals(result.code, 1);
    assertStringIncludes(result.stderr, 'No configuration found');
  });
});

Deno.test('Integration - login code emits token-scoped metadata to token request only', async () => {
  const homeDir = await Deno.makeTempDir();
  let tokenPort = 0;
  let receivedBody = '';
  let receivedHeaderAny: string | null = null;
  let receivedHeaderToken: string | null = null;
  let receivedHeaderAuth: string | null = null;

  const server = Deno.serve(
    {
      hostname: '127.0.0.1',
      port: 0,
      onListen: ({ port }) => {
        tokenPort = port;
      },
    },
    async (req) => {
      const url = new URL(req.url);
      if (url.pathname === '/oauth2/default/v1/token') {
        receivedBody = await req.text();
        receivedHeaderAny = req.headers.get('x-custom-any');
        receivedHeaderToken = req.headers.get('x-custom-token');
        receivedHeaderAuth = req.headers.get('x-custom-auth');
        return new Response(
          JSON.stringify({
            access_token: createJwt({ sub: 'scoped-user', iss: 'local' }),
            id_token: createJwt({ sub: 'scoped-id', iss: 'local' }),
            token_type: 'Bearer',
            expires_in: 3600,
            scope: 'openid profile email',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response('Not found', { status: 404 });
    },
  );

  try {
    await waitForBoundPort(() => tokenPort);

    await writeConfig(
      homeDir,
      [
        'security:',
        '  auth:',
        '    dev:',
        '      default:',
        `        domain: http://127.0.0.1:${tokenPort}`,
        '        clientId: test-client',
        '        redirectUri: http://localhost:7879/callback',
        '        scope: openid profile email',
        '        auth:',
        '          clientSecret: test-secret',
        '          grantType: authorization_code',
        '          customRequestParameters:',
        '            audience: api://default',
        '            resource:',
        '              value: https://resource',
        '              use: in_token_request',
        '            prompt:',
        '              value: consent',
        '              use: in_auth_request',
        '          customRequestHeaders:',
        '            X-Custom-Any: any-value',
        '            X-Custom-Token:',
        '              value: token-value',
        '              use: in_token_request',
        '            X-Custom-Auth:',
        '              value: auth-value',
        '              use: in_auth_request',
        'current:',
        '  env: dev',
        '  profile: default',
      ],
    );

    await writePendingPkceState(homeDir);

    const result = await runCli(
      [
        'login',
        'code',
        '--url',
        'http://localhost:7879/callback?code=manual-code-123&state=expected-state',
        '--log-level',
        'none',
      ],
      homeDir,
    );

    assertEquals(result.code, 0, result.stderr);
    assertStringIncludes(receivedBody, 'audience=api%3A%2F%2Fdefault');
    assertStringIncludes(receivedBody, 'resource=https%3A%2F%2Fresource');
    assertEquals(receivedBody.includes('prompt=consent'), false);
    assertEquals(receivedHeaderAny, 'any-value');
    assertEquals(receivedHeaderToken, 'token-value');
    assertEquals(receivedHeaderAuth, null);
  } finally {
    server.shutdown();
    await server.finished;
    await Deno.remove(homeDir, { recursive: true });
  }
});

Deno.test('Integration - client-credentials emits token-scoped metadata only', async () => {
  const homeDir = await Deno.makeTempDir();
  let tokenPort = 0;
  let receivedBody = '';
  let receivedHeaderAny: string | null = null;
  let receivedHeaderToken: string | null = null;
  let receivedHeaderAuth: string | null = null;

  const server = Deno.serve(
    {
      hostname: '127.0.0.1',
      port: 0,
      onListen: ({ port }) => {
        tokenPort = port;
      },
    },
    async (req) => {
      const url = new URL(req.url);
      if (url.pathname === '/oauth2/default/v1/token') {
        receivedBody = await req.text();
        receivedHeaderAny = req.headers.get('x-custom-any');
        receivedHeaderToken = req.headers.get('x-custom-token');
        receivedHeaderAuth = req.headers.get('x-custom-auth');
        return new Response(
          JSON.stringify({
            access_token: createJwt({ sub: 'cc-user', iss: 'local' }),
            id_token: createJwt({ sub: 'cc-id', iss: 'local' }),
            token_type: 'Bearer',
            expires_in: 3600,
            scope: 'openid profile email',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response('Not found', { status: 404 });
    },
  );

  try {
    await waitForBoundPort(() => tokenPort);

    await writeConfig(
      homeDir,
      [
        'security:',
        '  auth:',
        '    dev:',
        '      default:',
        `        domain: http://127.0.0.1:${tokenPort}`,
        '        clientId: test-client',
        '        redirectUri: http://localhost:7879/callback',
        '        scope: openid profile email',
        '        auth:',
        '          clientSecret: test-secret',
        '          grantType: client_credentials',
        '          clientCredentialsMode: in_body',
        '          customRequestParameters:',
        '            audience: api://default',
        '            resource:',
        '              value: https://resource',
        '              use: in_token_request',
        '            prompt:',
        '              value: consent',
        '              use: in_auth_request',
        '          customRequestHeaders:',
        '            X-Custom-Any: any-value',
        '            X-Custom-Token:',
        '              value: token-value',
        '              use: in_token_request',
        '            X-Custom-Auth:',
        '              value: auth-value',
        '              use: in_auth_request',
        'current:',
        '  env: dev',
        '  profile: default',
      ],
    );

    const result = await runCli(
      ['service', 'token', '--scope', 'openid profile email', '--log-level', 'none'],
      homeDir,
    );

    assertEquals(result.code, 0, result.stderr);
    assertStringIncludes(receivedBody, 'audience=api%3A%2F%2Fdefault');
    assertStringIncludes(receivedBody, 'resource=https%3A%2F%2Fresource');
    assertEquals(receivedBody.includes('prompt=consent'), false);
    assertEquals(receivedHeaderAny, 'any-value');
    assertEquals(receivedHeaderToken, 'token-value');
    assertEquals(receivedHeaderAuth, null);
  } finally {
    server.shutdown();
    await server.finished;
    await Deno.remove(homeDir, { recursive: true });
  }
});

Deno.test('Integration - service token --token-url overrides config endpoint', async () => {
  const homeDir = await Deno.makeTempDir();
  let tokenPort = 0;
  let hitTokenOverridePath = false;

  const server = Deno.serve(
    {
      hostname: '127.0.0.1',
      port: 0,
      onListen: ({ port }) => {
        tokenPort = port;
      },
    },
    (req) => {
      const url = new URL(req.url);
      if (url.pathname === '/custom/token') {
        hitTokenOverridePath = true;
        return new Response(
          JSON.stringify({
            access_token: createJwt({ sub: 'override-user', iss: 'local' }),
            id_token: createJwt({ sub: 'override-id', iss: 'local' }),
            token_type: 'Bearer',
            expires_in: 3600,
            scope: 'openid profile email',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response('Not found', { status: 404 });
    },
  );

  try {
    await waitForBoundPort(() => tokenPort);

    await writeConfig(
      homeDir,
      [
        'security:',
        '  auth:',
        '    dev:',
        '      default:',
        '        domain: https://unused.example.invalid',
        '        clientId: config-client',
        '        auth:',
        '          clientSecret: config-secret',
        '        redirectUri: http://localhost:7879/callback',
        '        scope: openid profile email',
        'current:',
        '  env: dev',
        '  profile: default',
      ],
    );

    const result = await runCli(
      [
        'service',
        'token',
        '--token-url',
        `http://127.0.0.1:${tokenPort}/custom/token`,
        '--scope',
        'openid profile email',
        '--log-level',
        'none',
      ],
      homeDir,
    );

    assertEquals(result.code, 0, result.stderr);
    assertEquals(hitTokenOverridePath, true);
  } finally {
    server.shutdown();
    await server.finished;
    await Deno.remove(homeDir, { recursive: true });
  }
});

Deno.test('Integration - service token fails when client secret is missing in basic mode', async () => {
  await withTempHome(async (homeDir) => {
    await writeConfig(
      homeDir,
      buildSimpleConfigLines({
        domain: 'https://issuer.example.com',
        redirectUri: 'http://localhost:7879/callback',
        authLines: ['grantType: client_credentials', 'clientCredentialsMode: basic'],
      }),
    );

    const result = await runCli(
      ['service', 'token', '--scope', 'openid profile email', '--log-level', 'none'],
      homeDir,
    );

    assertEquals(result.code, 1);
    assertStringIncludes(
      result.stderr,
      'clientSecret is required when clientCredentialsMode is basic or in_body',
    );
  });
});

Deno.test('Integration - login url --auth-url overrides config authorize endpoint', async () => {
  await withTempHome(async (homeDir) => {
    await writeConfig(
      homeDir,
      buildSimpleConfigLines({
        domain: 'https://config.example.invalid',
        clientId: 'config-client',
        redirectUri: 'http://localhost:7879/callback',
        authLines: ['clientSecret: config-secret'],
      }),
    );

    const result = await runCli(
      [
        'login',
        'url',
        '--auth-url',
        'https://override.example.com/oauth2/v1/authorize',
        '--state',
        'state-1',
        '--nonce',
        'nonce-1',
        '--log-level',
        'none',
      ],
      homeDir,
    );

    assertEquals(result.code, 0, result.stderr);
    assertStringIncludes(result.stdout, 'https://override.example.com/oauth2/v1/authorize?');
    assertEquals(result.stdout.includes('https://config.example.invalid'), false);
  });
});

Deno.test('Integration - login url CLI --param-auth emits auth-only metadata', async () => {
  await withTempHome(async (homeDir) => {
    await writeConfig(
      homeDir,
      buildSimpleConfigLines({
        domain: 'https://config.example.invalid',
        clientId: 'config-client',
        redirectUri: 'http://localhost:7879/callback',
        authLines: ['clientSecret: config-secret'],
      }),
    );

    const result = await runCli(
      [
        'login',
        'url',
        '--auth-url',
        'https://override.example.com/oauth2/v1/authorize',
        '--param-auth',
        'prompt=consent',
        '--param-token',
        'resource=https://token-only',
        '--state',
        'state-1',
        '--nonce',
        'nonce-1',
        '--log-level',
        'none',
      ],
      homeDir,
    );

    assertEquals(result.code, 0, result.stderr);
    assertStringIncludes(result.stdout, 'prompt=consent');
    assertEquals(result.stdout.includes('resource=https%3A%2F%2Ftoken-only'), false);
  });
});

Deno.test('Integration - service token CLI --param-token and --header-token are emitted', async () => {
  const homeDir = await Deno.makeTempDir();
  let tokenPort = 0;
  let receivedBody = '';
  let receivedHeaderToken: string | null = null;
  let receivedHeaderAuth: string | null = null;

  const server = Deno.serve(
    {
      hostname: '127.0.0.1',
      port: 0,
      onListen: ({ port }) => {
        tokenPort = port;
      },
    },
    async (req) => {
      const url = new URL(req.url);
      if (url.pathname === '/oauth2/default/v1/token') {
        receivedBody = await req.text();
        receivedHeaderToken = req.headers.get('x-cli-token');
        receivedHeaderAuth = req.headers.get('x-cli-auth');
        return new Response(
          JSON.stringify({
            access_token: createJwt({ sub: 'cli-meta-user', iss: 'local' }),
            id_token: createJwt({ sub: 'cli-meta-id', iss: 'local' }),
            token_type: 'Bearer',
            expires_in: 3600,
            scope: 'openid profile email',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response('Not found', { status: 404 });
    },
  );

  try {
    await waitForBoundPort(() => tokenPort);

    await writeConfig(
      homeDir,
      [
        'security:',
        '  auth:',
        '    dev:',
        '      default:',
        `        domain: http://127.0.0.1:${tokenPort}`,
        '        clientId: test-client',
        '        redirectUri: http://localhost:7879/callback',
        '        scope: openid profile email',
        '        auth:',
        '          clientSecret: test-secret',
        '          grantType: client_credentials',
        'current:',
        '  env: dev',
        '  profile: default',
      ],
    );

    const result = await runCli(
      [
        'service',
        'token',
        '--scope',
        'openid profile email',
        '--param-token',
        'resource=https://cli-token',
        '--header-token',
        'X-Cli-Token=token-only',
        '--header-auth',
        'X-Cli-Auth=auth-only',
        '--log-level',
        'none',
      ],
      homeDir,
    );

    assertEquals(result.code, 0, result.stderr);
    assertStringIncludes(receivedBody, 'resource=https%3A%2F%2Fcli-token');
    assertEquals(receivedHeaderToken, 'token-only');
    assertEquals(receivedHeaderAuth, null);
  } finally {
    server.shutdown();
    await server.finished;
    await Deno.remove(homeDir, { recursive: true });
  }
});

Deno.test('Integration - login code --token-url overrides config token endpoint', async () => {
  const homeDir = await Deno.makeTempDir();
  let tokenPort = 0;
  let hitCustomTokenPath = false;

  const server = Deno.serve(
    {
      hostname: '127.0.0.1',
      port: 0,
      onListen: ({ port }) => {
        tokenPort = port;
      },
    },
    (req) => {
      const url = new URL(req.url);
      if (url.pathname === '/custom/token') {
        hitCustomTokenPath = true;
        return new Response(
          JSON.stringify({
            access_token: createJwt({ sub: 'code-override-user', iss: 'local' }),
            id_token: createJwt({ sub: 'code-override-id', iss: 'local' }),
            token_type: 'Bearer',
            expires_in: 3600,
            scope: 'openid profile email',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response('Not found', { status: 404 });
    },
  );

  try {
    await waitForBoundPort(() => tokenPort);

    await writeConfig(
      homeDir,
      [
        'security:',
        '  auth:',
        '    dev:',
        '      default:',
        '        domain: https://unused.example.invalid',
        '        clientId: config-client',
        '        auth:',
        '          clientSecret: config-secret',
        '        redirectUri: http://localhost:7879/callback',
        '        scope: openid profile email',
        'current:',
        '  env: dev',
        '  profile: default',
      ],
    );

    await writePendingPkceState(homeDir);

    const result = await runCli(
      [
        'login',
        'code',
        '--url',
        'http://localhost:7879/callback?code=override-code&state=expected-state',
        '--token-url',
        `http://127.0.0.1:${tokenPort}/custom/token`,
        '--log-level',
        'none',
      ],
      homeDir,
    );

    assertEquals(result.code, 0, result.stderr);
    assertEquals(hitCustomTokenPath, true);
  } finally {
    server.shutdown();
    await server.finished;
    await Deno.remove(homeDir, { recursive: true });
  }
});

Deno.test('Integration - token userinfo --userinfo-url overrides derived endpoint', async () => {
  const homeDir = await Deno.makeTempDir();
  let userinfoPort = 0;
  let hitCustomUserinfoPath = false;
  const accessToken = createJwt({ sub: 'userinfo-user', iss: 'issuer' });

  const server = Deno.serve(
    {
      hostname: '127.0.0.1',
      port: 0,
      onListen: ({ port }) => {
        userinfoPort = port;
      },
    },
    (_req) => {
      const url = new URL(_req.url);
      if (url.pathname === '/custom/userinfo') {
        hitCustomUserinfoPath = true;
        return new Response(
          JSON.stringify({ sub: 'userinfo-user', email: 'user@example.com' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response('Not found', { status: 404 });
    },
  );

  try {
    await waitForBoundPort(() => userinfoPort);

    await writeConfig(
      homeDir,
      [
        'security:',
        '  auth:',
        '    dev:',
        '      default:',
        '        domain: https://unused.example.invalid',
        '        clientId: config-client',
        '        auth:',
        '          clientSecret: config-secret',
        '        redirectUri: http://localhost:7879/callback',
        '        scope: openid profile email',
        'current:',
        '  env: dev',
        '  profile: default',
      ],
    );

    await writeCredential(homeDir, accessToken);

    const result = await runCli(
      [
        'token',
        'userinfo',
        '--userinfo-url',
        `http://127.0.0.1:${userinfoPort}/custom/userinfo`,
        '--token-url',
        `http://127.0.0.1:${userinfoPort}/oauth2/default/v1/token`,
        '--log-level',
        'none',
      ],
      homeDir,
    );

    assertEquals(result.code, 0, result.stderr);
    assertEquals(hitCustomUserinfoPath, true);
    assertStringIncludes(result.stdout, 'userinfo-user');
  } finally {
    server.shutdown();
    await server.finished;
    await Deno.remove(homeDir, { recursive: true });
  }
});
