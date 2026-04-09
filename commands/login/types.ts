import { getCurrentOktaConfig } from '../../config/app.config.ts';

export interface LoginCommandOptions {
  env?: string;
  namespace?: string;
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
  namespace: string;
  oktaConfig: ReturnType<typeof getCurrentOktaConfig>;
}
