import { assertEquals, assertExists, assertThrows } from '@std/assert';
import { OAuthService } from './oauth.service.ts';

Deno.test('OAuthService - getAuthorizeUrl uses explicit authUrl and redirectUrl', () => {
  const service = new OAuthService({
    authUrl: 'https://idp.example.com/oauth2/v1/authorize',
    tokenUrl: 'https://idp.example.com/oauth2/v1/token',
    redirectUrl: 'https://app.example.com/callback',
    clientId: 'client-123',
    clientSecret: 'secret-123',
    scope: 'openid profile email',
    clientCredentialsMode: 'basic',
  });

  const url = service.getAuthorizeUrl({ state: 'state-1', nonce: 'nonce-1' });

  assertExists(url);
  assertEquals(url.startsWith('https://idp.example.com/oauth2/v1/authorize'), true);
  assertEquals(url.includes('client_id=client-123'), true);
  assertEquals(url.includes('redirect_uri=https%3A%2F%2Fapp.example.com%2Fcallback'), true);
  assertEquals(url.includes('state=state-1'), true);
});

Deno.test('OAuthService - getAuthorizeUrl uses default scope when empty', () => {
  const service = new OAuthService({
    authUrl: 'https://idp.example.com/oauth2/v1/authorize',
    tokenUrl: 'https://idp.example.com/oauth2/v1/token',
    redirectUrl: 'https://app.example.com/callback',
    clientId: 'client-123',
    clientSecret: 'secret-123',
    scope: '',
    clientCredentialsMode: 'basic',
  });

  const url = service.getAuthorizeUrl();
  assertEquals(url.includes('scope=openid+profile+email'), true);
});

Deno.test('OAuthService - getAuthorizeUrl applies auth-scoped custom parameters', () => {
  const service = new OAuthService({
    authUrl: 'https://idp.example.com/oauth2/v1/authorize',
    tokenUrl: 'https://idp.example.com/oauth2/v1/token',
    redirectUrl: 'https://app.example.com/callback',
    clientId: 'client-123',
    clientSecret: 'secret-123',
    scope: 'openid profile email',
    clientCredentialsMode: 'basic',
    customRequestParameters: {
      audience: { values: ['api://default'], use: 'everywhere' },
      prompt: { values: ['consent'], use: 'in_auth_request' },
      resource: { values: ['token-only'], use: 'in_token_request' },
    },
  });

  const url = service.getAuthorizeUrl({ state: 'state-1', nonce: 'nonce-1' });

  assertEquals(url.includes('audience=api%3A%2F%2Fdefault'), true);
  assertEquals(url.includes('prompt=consent'), true);
  assertEquals(url.includes('resource=token-only'), false);
});

Deno.test('OAuthService - client_credentials none mode sends client_id in body', async () => {
  let capturedBody = '';
  let capturedAuthorization = '';

  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
    const body = init?.body;
    capturedBody = body instanceof URLSearchParams ? body.toString() : String(body ?? '');
    const headers = init?.headers as Record<string, string> | undefined;
    capturedAuthorization = headers?.Authorization ?? headers?.authorization ?? '';

    return Promise.resolve(
      new Response(
        JSON.stringify({
          access_token: 'access',
          id_token: 'id',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'openid profile email',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  }) as typeof globalThis.fetch;

  try {
    const service = new OAuthService({
      authUrl: 'https://idp.example.com/oauth2/v1/authorize',
      tokenUrl: 'https://idp.example.com/oauth2/v1/token',
      redirectUrl: 'https://app.example.com/callback',
      clientId: 'client-123',
      scope: 'openid profile email',
      clientCredentialsMode: 'none',
    });

    const tokens = await service.getClientCredentialsTokens();

    assertEquals(tokens.access_token, 'access');
    assertEquals(capturedBody.includes('client_id=client-123'), true);
    assertEquals(capturedAuthorization, '');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('OAuthService - client_credentials basic mode sends Authorization header', async () => {
  let capturedAuthorization = '';

  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
    const headers = init?.headers as Record<string, string> | undefined;
    capturedAuthorization = headers?.Authorization ?? headers?.authorization ?? '';

    return Promise.resolve(
      new Response(
        JSON.stringify({
          access_token: 'access',
          id_token: 'id',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'openid profile email',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  }) as typeof globalThis.fetch;

  try {
    const service = new OAuthService({
      authUrl: 'https://idp.example.com/oauth2/v1/authorize',
      tokenUrl: 'https://idp.example.com/oauth2/v1/token',
      redirectUrl: 'https://app.example.com/callback',
      clientId: 'client-123',
      clientSecret: 'secret-123',
      scope: 'openid profile email',
      clientCredentialsMode: 'basic',
    });

    const tokens = await service.getClientCredentialsTokens();

    assertEquals(tokens.access_token, 'access');
    assertEquals(capturedAuthorization.startsWith('Basic '), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('OAuthService - client_credentials in_body mode sends client credentials in body', async () => {
  let capturedBody = '';
  let capturedAuthorization = '';

  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
    const body = init?.body;
    capturedBody = body instanceof URLSearchParams ? body.toString() : String(body ?? '');
    const headers = init?.headers as Record<string, string> | undefined;
    capturedAuthorization = headers?.Authorization ?? headers?.authorization ?? '';

    return Promise.resolve(
      new Response(
        JSON.stringify({
          access_token: 'access',
          id_token: 'id',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'openid profile email',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  }) as typeof globalThis.fetch;

  try {
    const service = new OAuthService({
      authUrl: 'https://idp.example.com/oauth2/v1/authorize',
      tokenUrl: 'https://idp.example.com/oauth2/v1/token',
      redirectUrl: 'https://app.example.com/callback',
      clientId: 'client-123',
      clientSecret: 'secret-123',
      scope: 'openid profile email',
      clientCredentialsMode: 'in_body',
    });

    const tokens = await service.getClientCredentialsTokens();

    assertEquals(tokens.access_token, 'access');
    assertEquals(capturedAuthorization, '');
    assertEquals(capturedBody.includes('client_id=client-123'), true);
    assertEquals(capturedBody.includes('client_secret=secret-123'), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('OAuthService - token request applies token-scoped metadata only', async () => {
  let capturedBody = '';
  let capturedHeaders: Record<string, string> = {};

  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
    const body = init?.body;
    capturedBody = body instanceof URLSearchParams ? body.toString() : String(body ?? '');
    capturedHeaders = (init?.headers as Record<string, string> | undefined) ?? {};

    return Promise.resolve(
      new Response(
        JSON.stringify({
          access_token: 'access',
          id_token: 'id',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'openid profile email',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  }) as typeof globalThis.fetch;

  try {
    const service = new OAuthService({
      authUrl: 'https://idp.example.com/oauth2/v1/authorize',
      tokenUrl: 'https://idp.example.com/oauth2/v1/token',
      redirectUrl: 'https://app.example.com/callback',
      clientId: 'client-123',
      clientSecret: 'secret-123',
      scope: 'openid profile email',
      clientCredentialsMode: 'basic',
      customRequestParameters: {
        audience: { values: ['api://default'], use: 'everywhere' },
        resource: { values: ['https://resource'], use: 'in_token_request' },
        prompt: { values: ['consent'], use: 'in_auth_request' },
      },
      customRequestHeaders: {
        'X-Custom-Any': { values: ['a'], use: 'everywhere' },
        'X-Custom-Token': { values: ['t'], use: 'in_token_request' },
        'X-Custom-Auth': { values: ['h'], use: 'in_auth_request' },
      },
    });

    await service.getClientCredentialsTokens();

    assertEquals(capturedBody.includes('audience=api%3A%2F%2Fdefault'), true);
    assertEquals(capturedBody.includes('resource=https%3A%2F%2Fresource'), true);
    assertEquals(capturedBody.includes('prompt=consent'), false);
    assertEquals(capturedHeaders['X-Custom-Any'], 'a');
    assertEquals(capturedHeaders['X-Custom-Token'], 't');
    assertEquals(capturedHeaders['X-Custom-Auth'], undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('OAuthService - decodeIdToken decodes valid JWT', () => {
  const service = new OAuthService({
    authUrl: 'https://idp.example.com/oauth2/v1/authorize',
    tokenUrl: 'https://idp.example.com/oauth2/v1/token',
    redirectUrl: 'https://app.example.com/callback',
    clientId: 'client-123',
    clientSecret: 'secret-123',
    scope: 'openid profile email',
    clientCredentialsMode: 'basic',
  });

  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ sub: 'user123', email: 'test@example.com' }));
  const token = `${header}.${payload}.signature`;

  const decoded = service.decodeIdToken(token);
  assertEquals(decoded.sub, 'user123');
  assertEquals(decoded.email, 'test@example.com');
});

Deno.test('OAuthService - decodeIdToken throws on invalid JWT', () => {
  const service = new OAuthService({
    authUrl: 'https://idp.example.com/oauth2/v1/authorize',
    tokenUrl: 'https://idp.example.com/oauth2/v1/token',
    redirectUrl: 'https://app.example.com/callback',
    clientId: 'client-123',
    clientSecret: 'secret-123',
    scope: 'openid profile email',
    clientCredentialsMode: 'basic',
  });

  assertThrows(
    () => service.decodeIdToken('invalid.jwt.token'),
    Error,
    'Failed to decode ID token',
  );
});

Deno.test('OAuthService - getUserInfo derives userinfo URL from token URL', async () => {
  let capturedUrl = '';

  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, _init?: RequestInit) => {
    capturedUrl = String(input);

    return Promise.resolve(
      new Response(
        JSON.stringify({ sub: 'user-1', email: 'user@example.com' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  }) as typeof globalThis.fetch;

  try {
    const service = new OAuthService({
      authUrl: 'https://idp.example.com/oauth2/v1/authorize',
      tokenUrl: 'https://idp.example.com/oauth2/v1/token',
      redirectUrl: 'https://app.example.com/callback',
      clientId: 'client-123',
      clientSecret: 'secret-123',
      scope: 'openid profile email',
      clientCredentialsMode: 'basic',
    });

    const userInfo = await service.getUserInfo('access-token');

    assertEquals(userInfo.sub, 'user-1');
    assertEquals(capturedUrl, 'https://idp.example.com/oauth2/v1/userinfo');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
