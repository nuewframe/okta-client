import { decodeJwtPayload } from '../utils/jwt.ts';

export type ClientCredentialsMode = 'basic' | 'in_body' | 'none';
export type ScopedUse = 'everywhere' | 'in_auth_request' | 'in_token_request';

export interface ResolvedScopedValue {
  values: string[];
  use: ScopedUse;
}

export interface OAuthServiceConfig {
  authUrl: string;
  tokenUrl: string;
  redirectUrl?: string;
  clientId: string;
  clientSecret?: string;
  scope: string;
  clientCredentialsMode: ClientCredentialsMode;
  customRequestParameters?: Record<string, ResolvedScopedValue>;
  customRequestHeaders?: Record<string, ResolvedScopedValue>;
}

export interface TokenResponse {
  access_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  refresh_token?: string;
}

export interface AuthorizeUrlParams {
  responseType?: string;
  state?: string;
  nonce?: string;
  codeChallenge?: string;
  codeChallengeMethod?: 'S256' | 'plain';
}

export class OAuthService {
  private config: OAuthServiceConfig;

  constructor(config: OAuthServiceConfig) {
    this.config = {
      ...config,
      scope: config.scope || 'openid profile email',
      clientCredentialsMode: config.clientCredentialsMode || 'basic',
    };
  }

  getAuthorizeUrl(params: AuthorizeUrlParams = {}): string {
    const {
      responseType = 'code',
      state = this.generateRandomString(),
      nonce = this.generateRandomString(),
      codeChallenge,
      codeChallengeMethod = 'S256',
    } = params;

    const url = new URL(this.config.authUrl);

    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('response_type', responseType);
    url.searchParams.set('scope', this.config.scope);

    if (this.config.redirectUrl) {
      url.searchParams.set('redirect_uri', this.config.redirectUrl);
    }

    url.searchParams.set('state', state);
    url.searchParams.set('nonce', nonce);

    if (codeChallenge) {
      url.searchParams.set('code_challenge', codeChallenge);
      url.searchParams.set('code_challenge_method', codeChallengeMethod);
    }

    this.applyScopedParameters(url.searchParams, 'in_auth_request');

    return url.toString();
  }

  async exchangeCodeForTokens(code: string, codeVerifier?: string): Promise<TokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
    });

    const sendBasicCredentials =
      this.config.clientCredentialsMode === 'basic' && !!this.config.clientSecret;

    if (!sendBasicCredentials) {
      body.set('client_id', this.config.clientId);
    }

    if (this.config.redirectUrl) {
      body.set('redirect_uri', this.config.redirectUrl);
    }

    if (codeVerifier) {
      body.set('code_verifier', codeVerifier);
    }

    if (this.config.clientCredentialsMode === 'in_body' && this.config.clientSecret) {
      body.set('client_secret', this.config.clientSecret);
    }

    this.applyScopedParameters(body, 'in_token_request');

    const headers = this.applyScopedHeaders({
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    }, 'in_token_request');

    if (sendBasicCredentials) {
      const credentials = btoa(`${this.config.clientId}:${this.config.clientSecret}`);
      headers.Authorization = `Basic ${credentials}`;
    }

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers,
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to exchange code for tokens: ${response.status} ${errorText}`);
    }

    return (await response.json()) as TokenResponse;
  }

  async getClientCredentialsTokens(scope?: string): Promise<TokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      scope: scope || this.config.scope || 'openid profile email',
    });

    if (this.config.clientCredentialsMode === 'in_body' && this.config.clientSecret) {
      body.set('client_id', this.config.clientId);
      body.set('client_secret', this.config.clientSecret);
    }

    if (this.config.clientCredentialsMode === 'none') {
      body.set('client_id', this.config.clientId);
    }

    this.applyScopedParameters(body, 'in_token_request');

    const headers = this.applyScopedHeaders({
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    }, 'in_token_request');

    if (this.config.clientCredentialsMode === 'basic' && this.config.clientSecret) {
      const credentials = btoa(`${this.config.clientId}:${this.config.clientSecret}`);
      headers.Authorization = `Basic ${credentials}`;
    }

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers,
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to get client credentials tokens: ${response.status} ${errorText}`,
      );
    }

    return (await response.json()) as TokenResponse;
  }

  decodeIdToken(idToken: string): Record<string, unknown> {
    try {
      return decodeJwtPayload(idToken);
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(`Failed to decode ID token: ${error.message}`);
      }
      throw new Error('Failed to decode ID token');
    }
  }

  async getUserInfo(accessToken: string, userInfoUrl?: string): Promise<Record<string, unknown>> {
    const resolvedUserInfoUrl = userInfoUrl ?? this.getDefaultUserInfoUrl();

    const response = await fetch(resolvedUserInfoUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get user info: ${response.status} ${errorText}`);
    }

    return (await response.json()) as Record<string, unknown>;
  }

  private getDefaultUserInfoUrl(): string {
    const url = new URL(this.config.tokenUrl);

    if (url.pathname.endsWith('/token')) {
      url.pathname = `${url.pathname.slice(0, -'/token'.length)}/userinfo`;
      return url.toString();
    }

    return `${this.config.tokenUrl}/userinfo`;
  }

  private appliesToScope(use: ScopedUse, scope: 'in_auth_request' | 'in_token_request'): boolean {
    return use === 'everywhere' || use === scope;
  }

  private applyScopedParameters(
    params: URLSearchParams,
    scope: 'in_auth_request' | 'in_token_request',
  ): void {
    const entries = this.config.customRequestParameters;
    if (!entries) {
      return;
    }

    for (const [key, value] of Object.entries(entries)) {
      if (!this.appliesToScope(value.use, scope)) {
        continue;
      }

      for (const item of value.values) {
        params.append(key, item);
      }
    }
  }

  private applyScopedHeaders(
    baseHeaders: Record<string, string>,
    scope: 'in_auth_request' | 'in_token_request',
  ): Record<string, string> {
    const headers: Record<string, string> = { ...baseHeaders };
    const entries = this.config.customRequestHeaders;

    if (!entries) {
      return headers;
    }

    for (const [key, value] of Object.entries(entries)) {
      if (!this.appliesToScope(value.use, scope)) {
        continue;
      }

      headers[key] = value.values.join(',');
    }

    return headers;
  }

  private generateRandomString(length: number = 32): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}
