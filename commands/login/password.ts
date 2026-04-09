import { Command } from '@cliffy/command';
import {
  applyOAuthExecutionOverrides,
  type OAuthExecutionConfig,
  resolveOAuthExecutionConfigWithDiscovery,
  validateOAuthExecutionConfig,
} from '../../config/app.config.ts';
import { OktaLoginService } from '../../services/okta-login.service.ts';
import type { LoginTokens, OktaLoginConfig } from '../../services/okta-login.service.ts';
import { saveCredentials } from '../../utils/credentials.ts';
import { Logger } from '../../utils/logger.ts';
import { createLoggerFromOptions, type LoggingOptions } from '../../utils/logger.ts';
import { getLoginContext, logContext } from './context.ts';
import { promptPassword } from './flow.ts';
import type { LoginCommandOptions } from './types.ts';

interface PasswordLoginDeps {
  getContext?: (options: LoginCommandOptions) => ReturnType<typeof getLoginContext>;
  createLoginService?: (
    config: OktaLoginConfig,
  ) => { login: (credentials: { username: string; password: string }) => Promise<LoginTokens> };
  saveCredentialsFn?: (tokens: LoginTokens) => Promise<void>;
  promptPasswordFn?: (message: string, visible?: boolean) => Promise<string>;
}

export async function resolvePasswordForLogin(
  resolvedConfig: Pick<OAuthExecutionConfig, 'passwordEnvVar' | 'passwordPromptVisible'>,
  prompt: (message: string, visible?: boolean) => Promise<string> = promptPassword,
): Promise<string> {
  const envVar = resolvedConfig.passwordEnvVar?.trim();
  const passwordFromEnv = envVar ? Deno.env.get(envVar) : undefined;

  if (passwordFromEnv?.trim()) {
    return passwordFromEnv;
  }

  return await prompt('Enter password: ', resolvedConfig.passwordPromptVisible);
}

function resolveIssuerFromProvider(issuerUri: string): string {
  const parsed = new URL(issuerUri);
  return parsed.toString().replace(/\/$/, '');
}

export async function executePasswordLogin(
  commandOptions: LoginCommandOptions,
  username: string,
  logger: Logger,
  deps: PasswordLoginDeps = {},
): Promise<void> {
  const context = (deps.getContext ?? getLoginContext)(commandOptions);
  const resolvedConfig = applyOAuthExecutionOverrides(
    await resolveOAuthExecutionConfigWithDiscovery(
      context.authConfig,
      'password',
    ),
    {
      redirectUrl: commandOptions.redirectUri?.trim() || undefined,
      scope: commandOptions.scope?.trim() || undefined,
      clientId: commandOptions.clientId?.trim() || undefined,
    },
  );
  validateOAuthExecutionConfig(resolvedConfig, 'security.auth');

  if (!resolvedConfig.redirectUrl) {
    throw new Error(
      'Missing redirect URI in selected configuration. Set client.redirect_uri in config.yaml for this env/profile.',
    );
  }

  const loginConfig: OktaLoginConfig = {
    issuer: resolveIssuerFromProvider(context.authConfig.provider.issuer_uri),
    clientId: resolvedConfig.clientId,
    redirectUri: resolvedConfig.redirectUrl,
    scope: resolvedConfig.scope,
  };

  const loginService = (deps.createLoginService ?? ((cfg) => new OktaLoginService(cfg)))(
    loginConfig,
  );

  logger.info('Attempting password login...');
  logContext(logger, context);

  const password = await resolvePasswordForLogin(
    resolvedConfig,
    deps.promptPasswordFn ?? promptPassword,
  );
  const tokens = await loginService.login({ username, password });
  await (deps.saveCredentialsFn ?? saveCredentials)(tokens);

  logger.success('Login successful');
  logger.info(`Access Token: ${tokens.access_token.substring(0, 50)}...`);
  logger.info(`ID Token: ${tokens.id_token.substring(0, 50)}...`);
  logger.info(`Token Type: ${tokens.token_type}`);
  logger.info(`Expires In: ${tokens.expires_in} seconds`);
  logger.success('Tokens saved to ~/.nuewframe/credential.json');
}

export const loginPasswordCommand = new Command()
  .description('Direct login with username/password (high-trust or legacy path)')
  .arguments('<username:string>')
  .option('--redirect-uri <uri:string>', 'Override redirect URI for this login flow')
  .option('--scope <scope:string>', 'Override OAuth scope for this login flow')
  .option('--client-id <id:string>', 'Override OAuth client ID for this login flow')
  .action(async (options, username) => {
    const logger = createLoggerFromOptions(options as unknown as LoggingOptions);
    try {
      const commandOptions = options as unknown as LoginCommandOptions;
      await executePasswordLogin(commandOptions, username, logger);
    } catch (error) {
      logger.error(
        'Password login failed:',
        error instanceof Error ? error.message : String(error),
      );
      Deno.exit(1);
    }
  });
