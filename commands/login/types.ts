import { getCurrentOktaConfig } from '../../config/app.config.ts';

export interface LoginCommandOptions {
  env?: string;
  namespace?: string;
  logLevel?: string;
  verbose?: boolean;
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
