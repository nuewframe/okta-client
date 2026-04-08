import { Command } from '@cliffy/command';
import {
  addEnvironment,
  initializeConfig,
  loadUnifiedConfig,
  saveConfig,
} from '../config/app.config.ts';
import { createLoggerFromOptions, type LoggingOptions } from '../utils/logger.ts';

export const configCommand = new Command().description('Manage Okta CLI configuration').action(
  (options) => {
    const logger = createLoggerFromOptions(options as unknown as LoggingOptions);
    logger.info('Use one of the subcommands: init, show, add, set-default, list');
    logger.info("Run 'okta config --help' for more information");
  },
);

configCommand.command('init', 'Initialize the configuration directory at ~/.nuewframe/okta-client/')
  .action(
    (options) => {
      const logger = createLoggerFromOptions(options as unknown as LoggingOptions);
      try {
        const config = initializeConfig();
        saveConfig(config);

        logger.success('Configuration directory created at ~/.nuewframe/okta-client/');
        logger.info('Edit the configuration file:');
        logger.info('   nano ~/.nuewframe/okta-client/config.yaml  # or your preferred editor');
        logger.info('Example configuration:');
        console.log('okta:');
        console.log('  environments:');
        console.log('    dev:');
        console.log('      default:');
        console.log('        domain: https://your-okta-domain.okta.com');
        console.log('        clientId: your-client-id');
        console.log('        apiToken: your-api-token');
        console.log('current:');
        console.log('  env: dev');
        console.log('  namespace: default');
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
      logger.error('No configuration found. Run "okta config init" first.');
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
    'add <domain:string> <clientId:string> <apiToken:string>',
    'Add a new environment/namespace configuration',
  )
  .option('-e, --env <env:string>', 'Environment name', { default: 'dev' })
  .option('-n, --namespace <namespace:string>', 'Namespace name', { default: 'default' })
  .option('--redirect-uri <uri:string>', 'OAuth redirect URI (required)')
  .option('--scope <scope:string>', 'OAuth scopes', { default: 'openid profile email' })
  .option('--discovery-url <url:string>', 'OIDC discovery URL')
  .action((options, domain, clientId, apiToken) => {
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
        logger.error('No configuration found. Run "okta config init" first.');
        Deno.exit(1);
      }

      addEnvironment(config, options.env, options.namespace, {
        domain,
        clientId,
        apiToken,
        redirectUri: options.redirectUri,
        scope: options.scope,
        ...(options.discoveryUrl ? { discoveryUrl: options.discoveryUrl } : {}),
      });

      saveConfig(config);

      logger.success(`Added configuration for ${options.env}/${options.namespace}`);
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
  .command('set-default', 'Set the default environment and namespace')
  .option('-e, --env <env:string>', 'Environment name')
  .option('-n, --namespace <namespace:string>', 'Namespace name')
  .action((options) => {
    const logger = createLoggerFromOptions(options as unknown as LoggingOptions);
    try {
      const config = loadUnifiedConfig();
      if (!config) {
        logger.error('No configuration found. Run "okta config init" first.');
        Deno.exit(1);
      }

      if (options.env) {
        if (!config.current) config.current = { env: 'dev', namespace: 'default' };
        config.current.env = options.env;
      }
      if (options.namespace) {
        if (!config.current) config.current = { env: 'dev', namespace: 'default' };
        config.current.namespace = options.namespace;
      }

      saveConfig(config);

      const currentEnv = config.current?.env || 'dev';
      const currentNamespace = config.current?.namespace || 'default';
      logger.success('Active configuration updated');
      logger.info(`Environment: ${currentEnv}`);
      logger.info(`Namespace: ${currentNamespace}`);
    } catch (error) {
      logger.error(
        'Failed to update default configuration:',
        error instanceof Error ? error.message : String(error),
      );
      Deno.exit(1);
    }
  });

configCommand.command('list', 'List all available environments and namespaces').action(
  (options) => {
    const logger = createLoggerFromOptions(options as unknown as LoggingOptions);
    try {
      const config = loadUnifiedConfig();
      if (!config) {
        logger.error('No configuration found. Run "okta config init" first.');
        Deno.exit(1);
      }

      logger.info('Available Configurations:');
      console.log('==================================================');

      for (const [env, namespaces] of Object.entries(config.okta.environments)) {
        console.log(`🏢 Environment: ${env}`);
        for (
          const [namespace, settings] of Object.entries(
            namespaces as Record<string, { domain: string }>,
          )
        ) {
          console.log(`   📁 ${namespace}: ${(settings as { domain: string }).domain}`);
        }
        console.log();
      }

      const currentEnv = config.current?.env || 'dev';
      const currentNamespace = config.current?.namespace || 'default';
      logger.info(`Current: ${currentEnv}/${currentNamespace}`);
    } catch (error) {
      logger.error(
        'Failed to list configurations:',
        error instanceof Error ? error.message : String(error),
      );
      Deno.exit(1);
    }
  },
);
