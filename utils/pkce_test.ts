import { assert, assertEquals, assertThrows } from '@std/assert';
import { assertPendingLoginStateValid, createPendingLoginState } from './pkce.ts';

Deno.test('PKCE - createPendingLoginState stores login transaction fields', async () => {
  const pending = await createPendingLoginState({
    env: 'dev',
    namespace: 'default',
    redirectUri: 'http://localhost:7879/callback',
    scope: 'openid profile email',
    state: 'fixed-state',
    nonce: 'fixed-nonce',
  });

  assertEquals(pending.env, 'dev');
  assertEquals(pending.namespace, 'default');
  assertEquals(pending.redirectUri, 'http://localhost:7879/callback');
  assertEquals(pending.scope, 'openid profile email');
  assertEquals(pending.state, 'fixed-state');
  assertEquals(pending.nonce, 'fixed-nonce');
  assert(pending.codeVerifier.length > 0);
  assert(pending.codeChallenge.length > 0);
  assertEquals(pending.createdAt, pending.timestamp);
  assert(Date.parse(pending.expiresAt) > Date.parse(pending.createdAt));
});

Deno.test('PKCE - assertPendingLoginStateValid rejects expired transaction', () => {
  const error = assertThrows(
    () => {
      assertPendingLoginStateValid({
        env: 'dev',
        namespace: 'default',
        redirectUri: 'http://localhost:7879/callback',
        scope: 'openid profile email',
        codeVerifier: 'verifier',
        codeChallenge: 'challenge',
        state: 'state',
        nonce: 'nonce',
        timestamp: '2026-01-01T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2026-01-01T00:00:01.000Z',
      });
    },
    Error,
  );

  assertEquals(
    error.message,
    'Pending login state has expired. Run "okta-client login url" again.',
  );
});

Deno.test('PKCE - assertPendingLoginStateValid rejects missing context fields', () => {
  assertThrows(
    () => {
      assertPendingLoginStateValid({
        env: '',
        namespace: 'default',
        redirectUri: 'http://localhost:7879/callback',
        scope: 'openid profile email',
        codeVerifier: 'verifier',
        codeChallenge: 'challenge',
        state: 'state',
        nonce: 'nonce',
        timestamp: '2026-01-01T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2099-01-01T00:00:00.000Z',
      });
    },
    Error,
    'Pending login state is incomplete',
  );
});
