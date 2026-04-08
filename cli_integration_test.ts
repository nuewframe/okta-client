import { assertEquals, assertNotEquals, assertStringIncludes } from '@std/assert';
import { dirname, fromFileUrl } from '@std/path';

const repoRoot = dirname(fromFileUrl(import.meta.url));

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
  const command = new Deno.Command('deno', {
    args: [
      'run',
      '--allow-env',
      '--allow-net',
      '--allow-read',
      '--allow-write',
      '--allow-run',
      'main.ts',
      ...args,
    ],
    cwd: repoRoot,
    env: {
      ...Deno.env.toObject(),
      HOME: homeDir,
    },
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

Deno.test('Integration - token info uses saved credentials by default', async () => {
  const homeDir = await Deno.makeTempDir();

  try {
    await writeCredential(homeDir, createJwt({ sub: 'saved-access', iss: 'issuer' }));

    const result = await runCli(['token', 'info', '--log-level', 'none'], homeDir);
    assertEquals(result.code, 0, result.stderr);

    const info = JSON.parse(result.stdout.trim()) as Record<string, unknown>;
    assertEquals(info.token_type, 'Bearer');
    assertEquals(info.scope, 'openid profile email');
    assertEquals(info.has_id_token, true);
    assertEquals(info.has_refresh_token, true);
  } finally {
    await Deno.remove(homeDir, { recursive: true });
  }
});

Deno.test('Integration - token claims --token prefers explicit token over saved token', async () => {
  const homeDir = await Deno.makeTempDir();

  try {
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
  } finally {
    await Deno.remove(homeDir, { recursive: true });
  }
});

Deno.test('Integration - token claims uses saved access token by default', async () => {
  const homeDir = await Deno.makeTempDir();

  try {
    const savedToken = createJwt({ sub: 'default-saved-user', iss: 'saved-issuer' });
    await writeCredential(homeDir, savedToken);

    const result = await runCli(['token', 'claims', '--log-level', 'none'], homeDir);

    assertEquals(result.code, 0, result.stderr);
    assertStringIncludes(result.stdout, 'default-saved-user');
  } finally {
    await Deno.remove(homeDir, { recursive: true });
  }
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
    while (tokenPort === 0) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    await Deno.mkdir(`${homeDir}/.nuewframe/okta-client`, { recursive: true });
    await Deno.writeTextFile(
      `${homeDir}/.nuewframe/okta-client/config.yaml`,
      [
        'okta:',
        '  environments:',
        '    dev:',
        '      default:',
        `        domain: http://127.0.0.1:${tokenPort}`,
        '        clientId: test-client',
        '        apiToken: test-secret',
        '        redirectUri: http://localhost:7879/callback',
        '        scope: openid profile email',
        'current:',
        '  env: dev',
        '  namespace: default',
      ].join('\n'),
    );

    const future = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const now = new Date().toISOString();
    await Deno.mkdir(`${homeDir}/.nuewframe`, { recursive: true });
    await Deno.writeTextFile(
      `${homeDir}/.nuewframe/pkce-state.json`,
      JSON.stringify(
        {
          env: 'dev',
          namespace: 'default',
          redirectUri: 'http://localhost:7879/callback',
          scope: 'openid profile email',
          codeVerifier: 'code-verifier-xyz',
          codeChallenge: 'challenge-xyz',
          state: 'expected-state',
          nonce: 'nonce-xyz',
          createdAt: now,
          expiresAt: future,
          timestamp: now,
        },
        null,
        2,
      ),
    );

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
  const homeDir = await Deno.makeTempDir();

  try {
    const past = new Date(Date.now() - 60 * 1000).toISOString();
    await Deno.mkdir(`${homeDir}/.nuewframe`, { recursive: true });
    await Deno.writeTextFile(
      `${homeDir}/.nuewframe/pkce-state.json`,
      JSON.stringify(
        {
          env: 'dev',
          namespace: 'default',
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
  } finally {
    await Deno.remove(homeDir, { recursive: true });
  }
});
