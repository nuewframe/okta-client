import { decodeJwtHeader, decodeJwtPayload } from '../../utils/jwt.ts';
import type { CredentialData } from '../../utils/credentials.ts';

export function isJwt(token: string): boolean {
  return token.split('.').length === 3;
}

export function getExpiryInfo(
  credentials: CredentialData,
): { expiresAt: string; expired: boolean } {
  const issuedAt = new Date(credentials.timestamp).getTime();
  const expiresAtMs = issuedAt + credentials.expires_in * 1000;
  return {
    expiresAt: new Date(expiresAtMs).toISOString(),
    expired: Date.now() > expiresAtMs,
  };
}

export function printClaims(token: string, tokenLabel: string): void {
  if (!isJwt(token)) {
    throw new Error(`${tokenLabel} is not a JWT and cannot be decoded into claims.`);
  }

  const header = decodeJwtHeader(token);
  const payload = decodeJwtPayload(token);
  console.log(JSON.stringify({ header, payload }, null, 2));
}
