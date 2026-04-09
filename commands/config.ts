import { Command } from '@cliffy/command';
import {
  addEnvironment,
  type AuthProfileConfig,
  initializeConfig,
  loadUnifiedConfig,
  saveConfig,
} from '../config/app.config.ts';
import { createLoggerFromOptions, type LoggingOptions } from '../utils/logger.ts';

export const configCommand = new Command().description('Manage Nuewframe OAuth CLI configuration')
  .action(
    (options) => {
      const logger = createLoggerFromOptions(options as unknown as LoggingOptions);
      logger.info('Use one of the subcommands: init, show, add, set-default, list');
      logger.info("Run 'nfauth config --help' for more information");
    },
  );

configCommand.command('init', 'Initialize the configuration directory at ~/.nuewframe/nfauth/')
  .action(
    (options) => {
      const logger = createLoggerFromOptions(options as unknown as LoggingOptions);
      try {
        const config = initializeConfig();
        saveConfig(config);

        logger.success('Configuration directory created at ~/.nuewframe/nfauth/');
        logger.info('Edit the configuration file:');
        logger.info('   nano ~/.nuewframe/nfauth/config.yaml  # or your preferred editor');
        logger.info('Example configuration:');
        console.log('security:');
        console.log('  env: dev');
        console.log('  profile: default');
        console.log('  auth:');
        console.log('    dev:');
        console.log('      default:');
        console.log('        type: oauth2');
        console.log('        provider:');
        console.log('          issuer_uri: https://your-oauth-domain.example.com/oauth2/default');
        console.log('          discovery_url: /.well-known/openid-configuration');
        console.log('        client:');
        console.log('          client_id: your-client-id');
        console.log('          client_secret: your-client-secret');
        console.log('          redirect_uri: http://localhost:7879/callback');
        console.log('          scope: openid profile email');
      } catch (error) {
        logger.error(
          'Failed to initialize configuration:',
          error instanceof Error ? error.message : String(error),
        );
        Deno.exit(1);
      }
    },
  );

configCommand.command('show', 'Show the current configuration').action((options) => {
  const logger = createLoggerFromOptions(options as unknown as LoggingOptions);
  try {
    const config = loadUnifiedConfig();
    if (!config) {
      logger.error('No configuration found. Run "nfauth config init" first.');
      Deno.exit(1);
    }

    logger.info('Current Configuration:');
    console.log('==================================================');
    console.log(JSON.stringify(config, null, 2));
  } catch (error) {
    logger.error(
      'Failed to load configuration:',
      error instanceof Error ? error.message : String(error),
    );
    Deno.exit(1);
  }
});

configCommand
  .command(
    'add <issuerUri:string> <clientId:string> [clientSecret:string]',
    'Add a new environment/profile configuration',
  )
  .option('-e, --env <env:string>', 'Environment name', { default: 'dev' })
  .option('-p, --profile <profile:string>', 'Profile name', { default: 'default' })
  .option('--redirect-uri <uri:string>', 'OAuth redirect URI (required)')
  .option('--scope <scope:string>', 'OAuth scopes', { default: 'openid profile email' })
  .option('--discovery-url <url:string>', 'OIDC discovery URL (absolute URL or relative path)')
  .option('--authorization-url <url:string>', 'Authorization endpoint URL')
  .option('--token-url <url:string>', 'Token endpoint URL')
  .option(
    '--client-auth-method <method:string>',
    'Client authentication method: basic, in_body, none',
    { default: 'basic' },
  )
  .option(
    '--grant-type <grant:string>',
    'Grant type: authorization_code, client_credentials, password',
    { default: 'authorization_code' },
  )
  .action((options, issuerUri, clientId, clientSecret) => {
    const logger = createLoggerFromOptions(options as unknown as LoggingOptions);
    try {
      if (!options.redirectUri) {
        logger.error(
          '--redirect-uri is required. Provide the OAuth redirect URI for this application.',
        );
        Deno.exit(1);
      }

      const config = loadUnifiedConfig();
      if (!config) {
        logger.error('No configuration found. Run "nfauth config init" first.');
        Deno.exit(1);
      }

      const profile = options.profile ?? 'default';

      const clientAuthMethod = options.clientAuthMethod?.trim();
      if (
        clientAuthMethod !== 'basic' && clientAuthMethod !== 'in_body' &&
        clientAuthMethod !== 'none'
      ) {
        throw new Error(
          'Configuration error: --client-auth-method must be one of basic, in_body, none.',
        );
      }

      const grantType = options.grantType?.trim();
      if (
        grantType !== 'authorization_code' && grantType !== 'client_credentials' &&
        grantType !== 'password'
      ) {
        throw new Error(
          'Configuration error: --grant-type must be one of authorization_code, client_credentials, password.',
        );
      }

      const authProfile: AuthProfileConfig = {
        type: 'oauth2',
        provider: {
          issuer_uri: issuerUri,
          discovery_url: options.discoveryUrl?.trim() || '/.well-known/openid-configuration',
          authorization_url: options.authorizationUrl?.trim() || undefined,
          token_url: options.tokenUrl?.trim() || undefined,
        },
        client: {
          client_id: clientId,
          client_secret: clientSecret,
          client_authentication_method: clientAuthMethod,
          grant_type: grantType,
          redirect_uri: options.redirectUri,
          scope: options.scope,
        },
      };

      addEnvironment(config, options.env, profile, authProfile);

      saveConfig(config);

      logger.success(`Added configuration for ${options.env}/${profile}`);
      logger.info(`Issuer: ${issuerUri}`);
      logger.info(`Client ID: ${clientId}`);
      logger.info(`Redirect URI: ${options.redirectUri}`);
      logger.info(`Scope: ${options.scope}`);
    } catch (error) {
      logger.error(
        'Failed to add configuration:',
        error instanceof Error ? error.message : String(error),
      );
      Deno.exit(1);
    }
  });

configCommand
  .command('set-default', 'Set the default environment and profile')
  .option('-e, --env <env:string>', 'Environment name')
  .option('-p, --profile <profile:string>', 'Profile name')
  .action((options) => {
    const logger = createLoggerFromOptions(options as unknown as LoggingOptions);
    try {
      const config = loadUnifiedConfig();
      if (!config) {
        logger.error('No configuration found. Run "nfauth config init" first.');
        Deno.exit(1);
      }

      if (options.env) {
        config.security.env = options.env;
      }
      const profile = options.profile;
      if (profile) {
        config.security.profile = profile;
      }

      saveConfig(config);

      const currentEnv = config.security.env || 'dev';
      const currentProfile = config.security.profile || 'default';
      logger.success('Active configuration updated');
      logger.info(`Environment: ${currentEnv}`);
      logger.info(`Profile: ${currentProfile}`);
    } catch (error) {
      logger.error(
        'Failed to update default configuration:',
        error instanceof Error ? error.message : String(error),
      );
      Deno.exit(1);
    }
  });

configCommand.command('list', 'List all available environments and profiles').action(
  (options) => {
    const logger = createLoggerFromOptions(options as unknown as LoggingOptions);
    try {
      const config = loadUnifiedConfig();
      if (!config) {
        logger.error('No configuration found. Run "nfauth config init" first.');
        Deno.exit(1);
      }

      logger.info('Available Configurations:');
      console.log('==================================================');

      for (const [env, profiles] of Object.entries(config.security.auth)) {
        console.log(`🏢 Environment: ${env}`);
        for (const [profile, settings] of Object.entries(profiles)) {
          console.log(`   📁 ${profile}: ${settings.provider.issuer_uri}`);
        }
        console.log();
      }

      const currentEnv = config.security.env || 'dev';
      const currentProfile = config.security.profile || 'default';
      logger.info(`Current: ${currentEnv}/${currentProfile}`);
    } catch (error) {
      logger.error(
        'Failed to list configurations:',
        error instanceof Error ? error.message : String(error),
      );
      Deno.exit(1);
    }
  },
);
