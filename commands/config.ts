import { Command } from '@cliffy/command';
import {
  addEnvironment,
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
        console.log('  auth:');
        console.log('    dev:');
        console.log('      default:');
        console.log('        domain: https://your-oauth-domain.example.com');
        console.log('        clientId: your-client-id');
        console.log('        auth:');
        console.log('          type: OAuth2');
        console.log('          clientSecret: your-client-secret');
        console.log('current:');
        console.log('  env: dev');
        console.log('  profile: default');
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
    'add <domain:string> <clientId:string> <clientSecret:string>',
    'Add a new environment/profile configuration',
  )
  .option('-e, --env <env:string>', 'Environment name', { default: 'dev' })
  .option('-p, --profile <profile:string>', 'Profile name', { default: 'default' })
  .option('--redirect-uri <uri:string>', 'OAuth redirect URI (required)')
  .option('--scope <scope:string>', 'OAuth scopes', { default: 'openid profile email' })
  .option('--discovery-url <url:string>', 'OIDC discovery URL')
  .action((options, domain, clientId, clientSecret) => {
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

      addEnvironment(config, options.env, profile, {
        domain,
        clientId,
        redirectUri: options.redirectUri,
        scope: options.scope,
        auth: {
          clientSecret,
        },
        ...(options.discoveryUrl ? { discoveryUrl: options.discoveryUrl } : {}),
      });

      saveConfig(config);

      logger.success(`Added configuration for ${options.env}/${profile}`);
      logger.info(`Domain: ${domain}`);
      logger.info(`Client ID: ${clientId}`);
      logger.info(`Redirect URI: ${options.redirectUri}`);
      logger.info(`Scope: ${options.scope}`);
      if (options.discoveryUrl) logger.info(`Discovery URL: ${options.discoveryUrl}`);
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
        if (!config.current) config.current = { env: 'dev', profile: 'default' };
        config.current.env = options.env;
      }
      const profile = options.profile;
      if (profile) {
        if (!config.current) config.current = { env: 'dev', profile: 'default' };
        config.current.profile = profile;
      }

      saveConfig(config);

      const currentEnv = config.current?.env || 'dev';
      const currentProfile = config.current?.profile || 'default';
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
        for (
          const [profile, settings] of Object.entries(
            profiles as Record<string, { domain: string }>,
          )
        ) {
          console.log(`   📁 ${profile}: ${(settings as { domain: string }).domain}`);
        }
        console.log();
      }

      const currentEnv = config.current?.env || 'dev';
      const currentProfile = config.current?.profile || 'default';
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
