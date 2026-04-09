import { assertEquals, assertStringIncludes, assertThrows } from '@std/assert';
import { parseCodeFromRedirectUrl } from './flow.ts';

Deno.test('parseCodeFromRedirectUrl - returns code for valid URL', () => {
  const code = parseCodeFromRedirectUrl(
    'https://example.com/callback?code=abc123&state=xyz',
    'xyz',
  );

  assertEquals(code, 'abc123');
});

Deno.test('parseCodeFromRedirectUrl - decodes URL-encoded authorization code', () => {
  const code = parseCodeFromRedirectUrl(
    'https://example.com/callback?code=a%2Bb%2Fc%3D%3D&state=xyz',
    'xyz',
  );

  assertEquals(code, 'a+b/c==');
});

Deno.test('parseCodeFromRedirectUrl - ignores state when no expectedState is provided', () => {
  const code = parseCodeFromRedirectUrl(
    'https://example.com/callback?code=abc123&state=unexpected',
  );

  assertEquals(code, 'abc123');
});

Deno.test('parseCodeFromRedirectUrl - throws for invalid URL', () => {
  const error = assertThrows(
    () => parseCodeFromRedirectUrl('not-a-url'),
    Error,
  );

  assertStringIncludes(error.message, 'Invalid URL');
});

Deno.test('parseCodeFromRedirectUrl - throws when oauth error is present', () => {
  const error = assertThrows(
    () => parseCodeFromRedirectUrl('https://example.com/callback?error=access_denied'),
    Error,
  );

  assertEquals(error.message, 'OAuth error: access_denied');
});

Deno.test('parseCodeFromRedirectUrl - includes oauth error description when present', () => {
  const error = assertThrows(
    () =>
      parseCodeFromRedirectUrl(
        'https://example.com/callback?error=access_denied&error_description=User%20cancelled',
      ),
    Error,
  );

  assertStringIncludes(error.message, 'OAuth error: access_denied - User cancelled');
});

Deno.test('parseCodeFromRedirectUrl - throws when code is missing', () => {
  const error = assertThrows(
    () => parseCodeFromRedirectUrl('https://example.com/callback?state=xyz'),
    Error,
  );

  assertStringIncludes(error.message, 'No authorization code found');
});

Deno.test('parseCodeFromRedirectUrl - throws when state mismatches', () => {
  const error = assertThrows(
    () => parseCodeFromRedirectUrl('https://example.com/callback?code=abc&state=other', 'xyz'),
    Error,
  );

  assertStringIncludes(error.message, 'State mismatch');
});
