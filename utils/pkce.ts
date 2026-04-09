/**
 * PKCE (Proof Key for Code Exchange) utilities for the OAuth 2.0 authorization code flow.
 * Implements RFC 7636 using S256 code challenge method.
 */

export interface PkceState {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
  nonce: string;
  timestamp: string;
}

export interface PendingLoginState extends PkceState {
  env: string;
  profile: string;
  redirectUri: string;
  scope: string;
  createdAt: string;
  expiresAt: string;
}

function base64urlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/** Generate a cryptographically random base64url string of `byteLength` bytes. */
function randomBase64url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64urlEncode(bytes.buffer);
}

/** Generate a PKCE code_verifier (RFC 7636 §4.1: 43–128 unreserved chars). */
export function generateCodeVerifier(): string {
  return randomBase64url(64); // 64 bytes → 86 base64url chars
}

/** Derive the S256 code_challenge from a code_verifier. */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64urlEncode(digest);
}

/**
 * Generate a full PKCE bundle (verifier, S256 challenge, state, nonce).
 * Optionally accepts externally supplied state/nonce for testing or
 * when the caller wants deterministic values.
 */
export async function generatePkce(
  stateOverride?: string,
  nonceOverride?: string,
): Promise<PkceState> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  return {
    codeVerifier,
    codeChallenge,
    state: stateOverride ?? randomBase64url(24),
    nonce: nonceOverride ?? randomBase64url(24),
    timestamp: new Date().toISOString(),
  };
}

export async function createPendingLoginState(
  params: {
    env: string;
    profile: string;
    redirectUri: string;
    scope: string;
    state?: string;
    nonce?: string;
  },
): Promise<PendingLoginState> {
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 10 * 60 * 1000);
  const pkce = await generatePkce(params.state, params.nonce);

  return {
    ...pkce,
    env: params.env,
    profile: params.profile,
    redirectUri: params.redirectUri,
    scope: params.scope,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    timestamp: createdAt.toISOString(),
  };
}

export function assertPendingLoginStateValid(state: PendingLoginState): void {
  if (!state.env || !state.profile || !state.redirectUri || !state.scope) {
    throw new Error('Pending login state is incomplete. Run "nfauth login url" again.');
  }

  const expiresAtMs = Date.parse(state.expiresAt);
  if (Number.isNaN(expiresAtMs)) {
    throw new Error('Pending login state is invalid. Run "nfauth login url" again.');
  }

  if (Date.now() > expiresAtMs) {
    throw new Error('Pending login state has expired. Run "nfauth login url" again.');
  }
}

function getPkceStatePath(): string {
  const home = Deno.env.get('HOME');
  if (!home) throw new Error('HOME environment variable is not set');
  return `${home}/.nuewframe/pkce-state.json`;
}

/** Persist PKCE state to ~/.nuewframe/pkce-state.json so exchange-code can read it back. */
export async function savePkceState(pkce: PendingLoginState): Promise<void> {
  const home = Deno.env.get('HOME');
  if (!home) throw new Error('HOME environment variable is not set');
  await Deno.mkdir(`${home}/.nuewframe`, { recursive: true });
  await Deno.writeTextFile(getPkceStatePath(), JSON.stringify(pkce, null, 2));
}

/** Load previously saved PKCE state. Throws if no state file exists. */
export async function loadPkceState(): Promise<PendingLoginState> {
  try {
    return JSON.parse(await Deno.readTextFile(getPkceStatePath())) as PendingLoginState;
  } catch {
    throw new Error(
      'No pending login state found. Run "nfauth login url" first to start the login flow.',
    );
  }
}

/** Remove the PKCE state file after a successful or failed exchange. */
export async function clearPkceState(): Promise<void> {
  try {
    await Deno.remove(getPkceStatePath());
  } catch {
    // Already removed or never existed – not an error.
  }
}
