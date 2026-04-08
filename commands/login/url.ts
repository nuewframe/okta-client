import { Command } from '@cliffy/command';
import { OktaService } from '../../services/okta.service.ts';
import { createLoggerFromOptions, type LoggingOptions } from '../../utils/logger.ts';
import { buildOktaServiceConfig } from '../../utils/okta-service-options.ts';
import { createPendingLoginState, savePkceState } from '../../utils/pkce.ts';
import { getLoginContext, logContext } from './context.ts';
import type { LoginCommandOptions } from './types.ts';

export const loginUrlCommand = new Command()
  .description('Generate OAuth login URL and save pending PKCE state for manual completion')
  .option('-s, --state <state:string>', 'State parameter (auto-generated when omitted)')
  .option('--nonce <nonce:string>', 'Nonce parameter (auto-generated when omitted)')
  .option('--redirect-uri <uri:string>', 'Override redirect URI for this login flow')
  .action(async (options) => {
    const logger = createLoggerFromOptions(options as unknown as LoggingOptions);
    try {
      const commandOptions = options as unknown as LoginCommandOptions;
      const context = getLoginContext(commandOptions);
      const effectiveRedirectUri = commandOptions.redirectUri ?? context.oktaConfig.redirectUri;
      if (!effectiveRedirectUri) {
        throw new Error(
          'No redirect URI configured. Set redirectUri in config.yaml or pass --redirect-uri.',
        );
      }

      const serviceConfig = buildOktaServiceConfig({
        ...context.oktaConfig,
        redirectUri: effectiveRedirectUri,
      });
      const oktaService = new OktaService(serviceConfig);

      const pending = await createPendingLoginState({
        env: context.env,
        namespace: context.namespace,
        redirectUri: effectiveRedirectUri,
        scope: context.oktaConfig.scope || 'openid profile email',
        state: commandOptions.state,
        nonce: commandOptions.nonce,
      });
      await savePkceState(pending);

      const authUrl = oktaService.getAuthorizeUrl({
        state: pending.state,
        nonce: pending.nonce,
        codeChallenge: pending.codeChallenge,
      });

      logContext(logger, context);
      logger.info(`Redirect URI: ${effectiveRedirectUri}`);
      logger.info('Login URL:');
      console.log(authUrl);
      logger.info('Pending login state saved. Complete with:');
      logger.info(`Transaction expires at: ${pending.expiresAt}`);
      logger.info('  okta-client login code <code>');
      logger.info('or:');
      logger.info('  okta-client login code --url "<full-redirect-url>"');
    } catch (error) {
      logger.error(
        'Failed to generate login URL:',
        error instanceof Error ? error.message : String(error),
      );
      Deno.exit(1);
    }
  });
