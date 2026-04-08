import { Command } from '@cliffy/command';
import { OktaService } from '../../services/okta.service.ts';
import { saveCredentials } from '../../utils/credentials.ts';
import { createLoggerFromOptions, type LoggingOptions } from '../../utils/logger.ts';
import { buildOktaServiceConfig } from '../../utils/okta-service-options.ts';
import { clearPkceState, createPendingLoginState, savePkceState } from '../../utils/pkce.ts';
import { getLoginContext, logContext } from './context.ts';
import { openBrowser, waitForLocalhostCallback } from './flow.ts';
import type { LoginCommandOptions } from './types.ts';

export const loginBrowserCommand = new Command()
  .description(
    'Login via browser (default interactive flow). Falls back to manual completion when needed',
  )
  .option('--redirect-uri <uri:string>', 'Override redirect URI for this login flow')
  .option(
    '--port <port:number>',
    'Local callback port for localhost redirect URIs when no auto-capture is available',
    { default: 7879 },
  )
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
      });
      await savePkceState(pending);

      const authUrl = oktaService.getAuthorizeUrl({
        state: pending.state,
        nonce: pending.nonce,
        codeChallenge: pending.codeChallenge,
      });

      logContext(logger, context);
      logger.info(`Redirect URI: ${effectiveRedirectUri}`);
      logger.info('Opening browser. If it does not open, use this URL:');
      console.log(authUrl);
      await openBrowser(authUrl);

      const isLocalhost = effectiveRedirectUri.startsWith('http://localhost') ||
        effectiveRedirectUri.startsWith('http://127.0.0.1');

      let code: string;
      if (isLocalhost) {
        const uriPort = new URL(effectiveRedirectUri).port;
        const port = uriPort ? parseInt(uriPort, 10) : (commandOptions.port ?? 7879);
        logger.info(`Waiting for callback on http://127.0.0.1:${port}/callback ...`);
        try {
          code = await waitForLocalhostCallback(port, pending.state);
        } catch {
          logger.info('Automatic callback capture failed. Complete manually with:');
          logger.info(`Transaction expires at: ${pending.expiresAt}`);
          logger.info('  okta-client login code <code>');
          logger.info('or:');
          logger.info('  okta-client login code --url "<full-redirect-url>"');
          return;
        }
      } else {
        logger.info('No localhost callback configured. Complete manually with:');
        logger.info(`Transaction expires at: ${pending.expiresAt}`);
        logger.info('  okta-client login code <code>');
        logger.info('or:');
        logger.info('  okta-client login code --url "<full-redirect-url>"');
        return;
      }

      const tokens = await oktaService.exchangeCodeForTokens(code, pending.codeVerifier);
      await saveCredentials(tokens);
      await clearPkceState();

      logger.success('Login successful! Credentials saved to ~/.nuewframe/credential.json');
      logger.info(`Access Token: ${tokens.access_token.substring(0, 50)}...`);
      logger.info(`Expires in: ${tokens.expires_in}s`);
    } catch (error) {
      logger.error('Browser login failed:', error instanceof Error ? error.message : String(error));
      Deno.exit(1);
    }
  });
