import { Command } from '@cliffy/command';
import { OktaService } from '../services/okta.service.ts';
import { getCurrentOktaConfig, loadConfig, resolveConfigSelection } from '../config/app.config.ts';
import { buildOktaServiceConfig } from '../utils/okta-service-options.ts';
import { createLoggerFromOptions, type LoggingOptions } from '../utils/logger.ts';
import { clearPkceState, generatePkce, loadPkceState, savePkceState } from '../utils/pkce.ts';
import { saveCredentials } from '../utils/credentials.ts';

interface AuthCommandOptions {
  env?: string;
  namespace?: string;
  state?: string;
  nonce?: string;
  logLevel?: string;
  verbose?: boolean;
}

export const authCommand = new Command()
  .description(
    'Generate an OAuth 2.0 authorization URL with PKCE (S256).\n\nPKCE state is saved to ~/.nuewframe/pkce-state.json. After authenticating in the\nbrowser, copy the ?code= value from the redirect URL and run:\n  okta-client auth-url exchange-code <code>',
  )
  .example('Generate auth URL', 'okta-client auth-url')
  .example('Dev environment', 'okta-client auth-url --env dev --namespace cards')
  .option('-s, --state <state:string>', 'State parameter (auto-generated when omitted)')
  .option('--nonce <nonce:string>', 'Nonce parameter (auto-generated when omitted)')
  .action(async (options) => {
    const logger = createLoggerFromOptions(options as unknown as LoggingOptions);
    try {
      const commandOptions = options as unknown as AuthCommandOptions;
      const config = loadConfig();
      const selection = resolveConfigSelection(
        config,
        commandOptions.env,
        commandOptions.namespace,
      );
      const oktaConfig = getCurrentOktaConfig(config, selection.env, selection.namespace);

      const oktaServiceConfig = buildOktaServiceConfig(oktaConfig);
      const oktaService = new OktaService(oktaServiceConfig);

      logger.success('Okta Service Initialized');
      logger.info(`Environment: ${selection.env}`);
      logger.info(`Namespace: ${selection.namespace}`);
      logger.info(`Domain: ${oktaConfig.domain}`);
      logger.info(`Client ID: ${oktaConfig.clientId}`);

      // Generate PKCE bundle and persist so exchange-code can use the verifier.
      const pkce = await generatePkce(commandOptions.state, commandOptions.nonce);
      await savePkceState(pkce);

      const authUrl = oktaService.getAuthorizeUrl({
        state: pkce.state,
        nonce: pkce.nonce,
        codeChallenge: pkce.codeChallenge,
      });
      logger.info('Authorization URL (PKCE/S256):');
      console.log(authUrl);
      logger.info('PKCE state saved to ~/.nuewframe/pkce-state.json');
      logger.info('Open this URL in your browser, authenticate, then run:');
      logger.info('  okta-client auth exchange-code <code>');
    } catch (error) {
      logger.error(
        'Failed to generate auth URL:',
        error instanceof Error ? error.message : String(error),
      );
      logger.info('Make sure your configuration is set up: deno task cli okta config-init');
      Deno.exit(1);
    }
  });

authCommand
  .command(
    'exchange-code <code:string>',
    'Exchange an authorization code for tokens and save them to ~/.nuewframe/credential.json.\n\nThe PKCE code_verifier from the matching auth-url run is used automatically.\nRun "okta-client auth-url" first to generate the code.',
  )
  .example('Exchange code', 'okta-client auth-url exchange-code <CODE>')
  .example('Specific env', 'okta-client auth-url exchange-code <CODE> --env dev --namespace cards')
  .action(async (options, code) => {
    const logger = createLoggerFromOptions(options as unknown as LoggingOptions);
    try {
      const commandOptions = options as unknown as AuthCommandOptions;
      const config = loadConfig();
      const selection = resolveConfigSelection(
        config,
        commandOptions.env,
        commandOptions.namespace,
      );
      const oktaConfig = getCurrentOktaConfig(config, selection.env, selection.namespace);

      const oktaServiceConfig = buildOktaServiceConfig(oktaConfig);
      const oktaService = new OktaService(oktaServiceConfig);

      logger.info('Exchanging authorization code for tokens...');
      logger.info(`Environment: ${selection.env}`);
      logger.info(`Namespace: ${selection.namespace}`);

      // Load saved PKCE verifier, use it in the token exchange, then clean up.
      let codeVerifier: string | undefined;
      try {
        const pkce = await loadPkceState();
        codeVerifier = pkce.codeVerifier;
        await clearPkceState();
      } catch {
        // No saved PKCE state – fall back to client_secret exchange (confidential client).
        logger.info('No PKCE state found – using client_secret exchange.');
      }

      const tokens = await oktaService.exchangeCodeForTokens(code, codeVerifier);

      // Persist tokens so gql-client and other tools can read them.
      await saveCredentials(tokens);

      logger.success('Tokens received and saved to ~/.nuewframe/credential.json');
      logger.info(`Access Token: ${tokens.access_token.substring(0, 50)}...`);
      logger.info(`Token Type: ${tokens.token_type}`);
      if (tokens.id_token) {
        logger.info(`ID Token: ${tokens.id_token.substring(0, 50)}...`);
      }
      if (tokens.refresh_token) {
        logger.info(`Refresh Token: ${tokens.refresh_token.substring(0, 50)}...`);
      }
    } catch (error) {
      logger.error(
        'Failed to exchange code:',
        error instanceof Error ? error.message : String(error),
      );
      Deno.exit(1);
    }
  });
