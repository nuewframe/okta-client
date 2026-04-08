import { parse, stringify } from '@std/yaml';
import { dirname } from '@std/path';

const CONFIG_PATH_ENV_VAR = 'NUEWFRAME_CONFIG';

function getHomeDir(): string {
  const home = Deno.env.get('HOME') ?? Deno.env.get('USERPROFILE');
  if (!home) {
    throw new Error('HOME environment variable is not set');
  }
  return home;
}

function getConfigPaths(): { dir: string; file: string } {
  const configuredPath = Deno.env.get(CONFIG_PATH_ENV_VAR)?.trim();
  if (configuredPath) {
    const dir = dirname(configuredPath);
    return { dir, file: configuredPath };
  }

  const dir = `${getHomeDir()}/.nuewframe/okta-client`;
  return { dir, file: `${dir}/config.yaml` };
}

export interface OktaEnvironment {
  domain: string;
  clientId: string;
  apiToken: string;
  redirectUri?: string;
  scope?: string;
  discoveryUrl?: string;
  authorizationServerId?: string;
}

export interface AppConfig {
  okta: {
    environments: Record<string, Record<string, OktaEnvironment>>;
    defaultEnv?: string;
    defaultNamespace?: string;
  };
  current?: {
    env: string;
    namespace: string;
  };
}

export interface ConfigSelection {
  env: string;
  namespace: string;
}

/**
 * Load environment variables from a .env file
 */
export function loadEnvFile(envPath: string): void {
  try {
    // Check if file exists first
    const fileInfo = Deno.statSync(envPath);
    if (!fileInfo.isFile) {
      throw new Error(`File not found: ${envPath}`);
    }

    // Load .env file manually and set environment variables
    const envContent = Deno.readTextFileSync(envPath);

    // Parse the .env file manually
    const lines = envContent.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').replace(/^["']|["']$/g, ''); // Remove quotes
          Deno.env.set(key.trim(), value.trim());
        }
      }
    }
  } catch (error) {
    throw new Error(
      `Failed to load .env file from ${envPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Load configuration from unified config file or .env files (for backward compatibility)
 */
export function loadConfig(envFile?: string, env?: string, namespace?: string): AppConfig {
  // Try to load from unified config first
  const unifiedConfig = loadUnifiedConfig();
  if (unifiedConfig) {
    return unifiedConfig;
  }

  // Fallback to .env files for backward compatibility
  return loadLegacyConfig(envFile, env, namespace);
}

/**
 * Load unified configuration from configured path or default file.
 */
export function loadUnifiedConfig(): AppConfig | null {
  const { dir: configDir, file: configPath } = getConfigPaths();

  try {
    // Check if directory exists
    const dirInfo = Deno.statSync(configDir);
    if (!dirInfo.isDirectory) {
      return null;
    }

    const configContent = Deno.readTextFileSync(configPath);
    const config = parse(configContent) as AppConfig;

    // Validate config structure
    if (!config.okta?.environments) {
      throw new Error('Invalid config structure');
    }

    return normalizeConfig(config);
  } catch (_error) {
    // Config file doesn't exist or is invalid
    return null;
  }
}

export function resolveConfigSelection(
  config: AppConfig,
  env?: string,
  namespace?: string,
): ConfigSelection {
  return {
    env: env || config.current?.env || config.okta.defaultEnv || 'dev',
    namespace: namespace || config.current?.namespace || config.okta.defaultNamespace || 'default',
  };
}

export function normalizeConfig(config: AppConfig): AppConfig {
  const current = resolveConfigSelection(config);

  return {
    okta: {
      environments: config.okta.environments,
    },
    current,
  };
}

/**
 * Load legacy configuration from .env files (for backward compatibility)
 */
export function loadLegacyConfig(envFile?: string, env?: string, namespace?: string): AppConfig {
  // If no envFile provided, try to find based on env and namespace
  if (!envFile && env && namespace) {
    const possiblePaths = [`.env.${env}.${namespace}`, `.env.${env}`, `.env.${namespace}`, `.env`];

    for (const path of possiblePaths) {
      try {
        Deno.statSync(path);
        envFile = path;
        break;
      } catch {
        // File doesn't exist, continue
      }
    }
  }

  // If .env path is provided, load it first
  if (envFile) {
    loadEnvFile(envFile);
  }

  // Always load from environment variables only
  const oktaDomain = Deno.env.get('OKTA_DOMAIN');
  const oktaClientId = Deno.env.get('OKTA_CLIENT_ID');
  const oktaApiToken = Deno.env.get('OKTA_API_TOKEN');
  const oktaRedirectUri = Deno.env.get('OKTA_REDIRECT_URI') || 'http://localhost:8000/callback';
  const oktaScope = Deno.env.get('OKTA_SCOPE') || 'openid profile email';
  const oktaDiscoveryUrl = Deno.env.get('OKTA_DISCOVERY_URL') ||
    `${oktaDomain}/.well-known/oauth-authorization-server`;

  if (!oktaDomain || !oktaClientId || !oktaApiToken) {
    const suggestion = envFile
      ? `Check your .env file: ${envFile}`
      : `Initialize config with: deno task cli okta config-init`;

    throw new Error(
      `Missing required Okta configuration from environment variables.\n` +
        `${suggestion}\n` +
        `Required: OKTA_DOMAIN, OKTA_CLIENT_ID, OKTA_API_TOKEN`,
    );
  }

  // Convert legacy format to new format
  const legacyEnv = env || 'dev';
  const legacyNamespace = namespace || 'default';

  return {
    okta: {
      environments: {
        [legacyEnv]: {
          [legacyNamespace]: {
            domain: oktaDomain,
            clientId: oktaClientId,
            apiToken: oktaApiToken,
            redirectUri: oktaRedirectUri,
            scope: oktaScope,
            discoveryUrl: oktaDiscoveryUrl,
          },
        },
      },
    },
    current: {
      env: legacyEnv,
      namespace: legacyNamespace,
    },
  };
}

/**
 * Get the current Okta environment configuration
 */
export function getCurrentOktaConfig(
  config: AppConfig,
  env?: string,
  namespace?: string,
): OktaEnvironment {
  const selection = resolveConfigSelection(config, env, namespace);
  const targetEnv = selection.env;
  const targetNamespace = selection.namespace;

  const envConfig = config.okta.environments[targetEnv];
  if (!envConfig) {
    throw new Error(`Environment '${targetEnv}' not found in configuration`);
  }

  const namespaceConfig = envConfig[targetNamespace];
  if (!namespaceConfig) {
    throw new Error(`Namespace '${targetNamespace}' not found in environment '${targetEnv}'`);
  }

  return namespaceConfig;
}

/**
 * Save configuration to config file
 */
export function saveConfig(config: AppConfig): void {
  const { dir: configDir, file: configPath } = getConfigPaths();

  // Create directory if it doesn't exist
  try {
    Deno.mkdirSync(configDir, { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.AlreadyExists)) {
      throw new Error(
        `Failed to create config directory: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  const normalizedConfig = normalizeConfig(config);
  const configContent = stringify(normalizedConfig);
  Deno.writeTextFileSync(configPath, configContent);
}

/**
 * Initialize a new configuration file
 */
export function initializeConfig(): AppConfig {
  const config: AppConfig = {
    okta: {
      environments: {
        dev: {
          default: {
            domain: 'https://your-dev-okta-domain.okta.com',
            clientId: 'your-dev-client-id',
            apiToken: 'your-dev-api-token',
            redirectUri: 'http://localhost:8000/callback',
            scope: 'openid profile email',
            discoveryUrl:
              'https://your-dev-okta-domain.okta.com/.well-known/oauth-authorization-server',
          },
        },
        stg: {
          default: {
            domain: 'https://your-stg-okta-domain.okta.com',
            clientId: 'your-stg-client-id',
            apiToken: 'your-stg-api-token',
            redirectUri: 'http://localhost:8000/callback',
            scope: 'openid profile email',
            discoveryUrl:
              'https://your-stg-okta-domain.okta.com/.well-known/oauth-authorization-server',
          },
        },
        prod: {
          default: {
            domain: 'https://your-prod-okta-domain.okta.com',
            clientId: 'your-prod-client-id',
            apiToken: 'your-prod-api-token',
            redirectUri: 'http://localhost:8000/callback',
            scope: 'openid profile email',
            discoveryUrl:
              'https://your-prod-okta-domain.okta.com/.well-known/oauth-authorization-server',
          },
        },
      },
    },
    current: {
      env: 'dev',
      namespace: 'default',
    },
  };

  saveConfig(config);
  return config;
}

/**
 * Add or update an environment/namespace configuration
 */
export function addEnvironment(
  config: AppConfig,
  env: string,
  namespace: string,
  oktaConfig: OktaEnvironment,
): AppConfig {
  if (!config.okta.environments[env]) {
    config.okta.environments[env] = {};
  }

  config.okta.environments[env][namespace] = oktaConfig;
  saveConfig(config);
  return config;
}
