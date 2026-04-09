import { getCurrentAuthConfig } from '../../config/app.config.ts';

export interface LoginCommandOptions {
  env?: string;
  profile?: string;
  logLevel?: string;
  verbose?: boolean;
  scope?: string;
  authUrl?: string;
  tokenUrl?: string;
  clientId?: string;
  clientSecret?: string;
  clientCredentialsMode?: string;
  param?: string;
  paramAuth?: string;
  paramToken?: string;
  header?: string;
  headerAuth?: string;
  headerToken?: string;
  redirectUri?: string;
  port?: number;
  state?: string;
  nonce?: string;
  url?: string;
}

export interface LoginContext {
  env: string;
  profile: string;
  authConfig: ReturnType<typeof getCurrentAuthConfig>;
}
