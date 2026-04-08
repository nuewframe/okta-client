import { assert, assertEquals, assertStringIncludes, assertThrows } from '@std/assert';
import type { CredentialData } from '../../utils/credentials.ts';
import { getExpiryInfo, isJwt, printClaims } from './claims-utils.ts';

Deno.test('isJwt - returns true for three segments', () => {
  assert(isJwt('a.b.c'));
});

Deno.test('isJwt - returns false for non-jwt token', () => {
  assertEquals(isJwt('not-a-jwt'), false);
  assertEquals(isJwt('a.b'), false);
  assertEquals(isJwt('a.b.c.d'), false);
});

Deno.test('getExpiryInfo - computes expiry timestamp and non-expired state', () => {
  const originalNow = Date.now;
  Date.now = () => new Date('2026-01-01T00:00:30.000Z').getTime();

  try {
    const credentials: CredentialData = {
      access_token: 'access',
      id_token: 'id',
      token_type: 'Bearer',
      expires_in: 60,
      scope: 'openid',
      timestamp: '2026-01-01T00:00:00.000Z',
    };

    const expiryInfo = getExpiryInfo(credentials);
    assertEquals(expiryInfo.expiresAt, '2026-01-01T00:01:00.000Z');
    assertEquals(expiryInfo.expired, false);
  } finally {
    Date.now = originalNow;
  }
});

Deno.test('getExpiryInfo - marks token expired when now is after expiry', () => {
  const originalNow = Date.now;
  Date.now = () => new Date('2026-01-01T00:01:01.000Z').getTime();

  try {
    const credentials: CredentialData = {
      access_token: 'access',
      id_token: 'id',
      token_type: 'Bearer',
      expires_in: 60,
      scope: 'openid',
      timestamp: '2026-01-01T00:00:00.000Z',
    };

    const expiryInfo = getExpiryInfo(credentials);
    assertEquals(expiryInfo.expired, true);
  } finally {
    Date.now = originalNow;
  }
});

Deno.test('printClaims - throws for non-jwt token', () => {
  const error = assertThrows(
    () => printClaims('not-a-jwt', 'provided token'),
    Error,
  );

  assertStringIncludes(error.message, 'is not a JWT');
});
