import { parse, stringify } from '@std/yaml';
import { dirname } from '@std/path';

const CONFIG_PATH_ENV_VAR = 'NUEWFRAME_CONFIG';
const CONFIG_BASE_DIR = '.nuewframe';
const CURRENT_CONFIG_DIR_NAME = 'nfauth';

function getHomeDir(): string {
  const home = Deno.env.get('HOME') ?? Deno.env.get('USERPROFILE');
  if (!home) {
    throw new Error('HOME environment variable is not set');
  }
  return home;
}

function getDefaultConfigPaths(): { dir: string; file: string } {
  const configuredPath = Deno.env.get(CONFIG_PATH_ENV_VAR)?.trim();
  if (configuredPath) {
    const dir = dirname(configuredPath);
    return { dir, file: configuredPath };
  }

  const dir = `${getHomeDir()}/${CONFIG_BASE_DIR}/${CURRENT_CONFIG_DIR_NAME}`;
  return { dir, file: `${dir}/config.yaml` };
}

function getConfigPaths(): { dir: string; file: string } {
  return getDefaultConfigPaths();
}

export interface AuthProfileConfig {
  domain: string;
  clientId: string;
  redirectUri?: string;
  scope?: string;
  discoveryUrl?: string;
  authorizationServerId?: string;
  auth?: OAuthCompatibilityConfig;
}

export type AuthType = 'OAuth2';
export type GrantType = 'authorization_code' | 'client_credentials' | 'password';
export type ClientCredentialsMode = 'basic' | 'in_body' | 'none';
export type ScopedUse = 'everywhere' | 'in_auth_request' | 'in_token_request';
export type CodeChallengeMethod = 'S256' | 'plain';

export type ScopedValue = string | string[] | {
  value: string | string[];
  use?: ScopedUse;
};

export interface ResolvedScopedValue {
  values: string[];
  use: ScopedUse;
}

export interface OAuthPkceConfig {
  enabled?: boolean;
  codeChallengeMethod?: CodeChallengeMethod;
}

export interface OAuthCompatibilityConfig {
  type?: AuthType;
  grantType?: GrantType;
  authUrl?: string;
  tokenUrl?: string;
  deviceAuthUrl?: string;
  redirectUrl?: string;
  clientId?: string;
  clientSecret?: string;
  clientCredentialsMode?: ClientCredentialsMode;
  scope?: string | string[];
  pkce?: boolean | OAuthPkceConfig;
  customRequestParameters?: Record<string, ScopedValue>;
  customRequestHeaders?: Record<string, ScopedValue>;
  passwordEnvVar?: string;
  passwordPromptVisible?: boolean;
}

export interface ResolvedOAuthExecutionConfig {
  grantType?: GrantType;
  authUrl?: string;
  tokenUrl?: string;
  deviceAuthUrl?: string;
  redirectUrl?: string;
  clientId: string;
  clientSecret?: string;
  clientCredentialsMode: ClientCredentialsMode;
  scope: string;
  pkceEnabled: boolean;
  pkceCodeChallengeMethod: CodeChallengeMethod;
  customRequestParameters?: Record<string, ResolvedScopedValue>;
  customRequestHeaders?: Record<string, ResolvedScopedValue>;
  passwordEnvVar?: string;
  passwordPromptVisible: boolean;
}

export interface OAuthExecutionOverrides {
  authUrl?: string;
  tokenUrl?: string;
  redirectUrl?: string;
  clientId?: string;
  clientSecret?: string;
  clientCredentialsMode?: ClientCredentialsMode;
  scope?: string;
  customRequestParameters?: Record<string, ResolvedScopedValue>;
  customRequestHeaders?: Record<string, ResolvedScopedValue>;
}

type EnvironmentRegistry = Record<string, Record<string, AuthProfileConfig>>;

export interface AppConfig {
  security: {
    auth: EnvironmentRegistry;
  };
  current?: {
    env: string;
    profile: string;
  };
}

export interface ConfigSelection {
  env: string;
  profile: string;
}

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .map((item) => stripUndefinedDeep(item))
      .filter((item) => item !== undefined) as T;
  }

  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry === undefined) {
        continue;
      }

      result[key] = stripUndefinedDeep(entry);
    }

    return result as T;
  }

  return value;
}

/**
 * Load configuration from the unified config file.
 */
export function loadConfig(): AppConfig {
  const unifiedConfig = loadUnifiedConfig();
  if (unifiedConfig) {
    return unifiedConfig;
  }

  throw new Error(
    'No configuration found. Run "nfauth config init" and configure auth.clientSecret in your environment entry.',
  );
}

/**
 * Load unified configuration from configured path or default file.
 */
export function loadUnifiedConfig(): AppConfig | null {
  const { dir: configDir, file: configPath } = getConfigPaths();

  try {
    const dirInfo = Deno.statSync(configDir);
    if (!dirInfo.isDirectory) {
      return null;
    }
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return null;
    }
    throw error;
  }

  try {
    const configContent = Deno.readTextFileSync(configPath);
    const config = parse(configContent) as AppConfig;

    if (!config.security?.auth) {
      throw new Error('Invalid config structure');
    }

    return normalizeConfig(config);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return null;
    }
    throw error;
  }
}

function isValidAbsoluteUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function normalizePkce(
  pkce: boolean | OAuthPkceConfig | undefined,
): boolean | OAuthPkceConfig | undefined {
  if (pkce === undefined) {
    return undefined;
  }

  if (pkce === true) {
    return { enabled: true, codeChallengeMethod: 'S256' };
  }

  return pkce;
}

function normalizeScope(scope: string | string[] | undefined): string | undefined {
  if (scope === undefined) {
    return undefined;
  }

  if (Array.isArray(scope)) {
    return scope.join(' ').replace(/\s+/g, ' ').trim();
  }

  return scope;
}

function validateScopedValue(
  value: ScopedValue,
  path: string,
): void {
  if (typeof value === 'string') {
    return;
  }

  if (Array.isArray(value)) {
    return;
  }

  const allowedUse = ['everywhere', 'in_auth_request', 'in_token_request'];
  if (value.use && !allowedUse.includes(value.use)) {
    throw new Error(
      `Configuration error: ${path}.use must be one of everywhere, in_auth_request, in_token_request.`,
    );
  }
}

function normalizeScopedValue(value: ScopedValue): ResolvedScopedValue {
  if (typeof value === 'string') {
    return { values: [value], use: 'everywhere' };
  }

  if (Array.isArray(value)) {
    return { values: value, use: 'everywhere' };
  }

  const rawValues = Array.isArray(value.value) ? value.value : [value.value];
  return {
    values: rawValues,
    use: value.use ?? 'everywhere',
  };
}

function normalizeScopedCollection(
  collection: Record<string, ScopedValue> | undefined,
): Record<string, ResolvedScopedValue> | undefined {
  if (!collection) {
    return undefined;
  }

  const normalized: Record<string, ResolvedScopedValue> = {};
  for (const [key, value] of Object.entries(collection)) {
    normalized[key] = normalizeScopedValue(value);
  }

  return Object.keys(normalized).length ? normalized : undefined;
}

export function validateOAuthCompatibilityConfig(
  auth: OAuthCompatibilityConfig,
  path: string,
): void {
  if (auth.type && auth.type !== 'OAuth2') {
    throw new Error(`Configuration error: ${path}.type must be OAuth2.`);
  }

  const validGrantTypes = ['authorization_code', 'client_credentials', 'password'];
  if (auth.grantType && !validGrantTypes.includes(auth.grantType)) {
    throw new Error(
      `Configuration error: ${path}.grantType must be one of authorization_code, client_credentials, password.`,
    );
  }

  const urlFields: Array<keyof OAuthCompatibilityConfig> = [
    'authUrl',
    'tokenUrl',
    'deviceAuthUrl',
    'redirectUrl',
  ];

  for (const field of urlFields) {
    const value = auth[field];
    if (typeof value === 'string' && !isValidAbsoluteUrl(value)) {
      throw new Error(`Configuration error: ${path}.${field} must be a valid absolute URL.`);
    }
  }

  const validModes = ['basic', 'in_body', 'none'];
  if (auth.clientCredentialsMode && !validModes.includes(auth.clientCredentialsMode)) {
    throw new Error(
      `Configuration error: ${path}.clientCredentialsMode must be one of basic, in_body, none.`,
    );
  }

  if (typeof auth.pkce === 'object' && auth.pkce !== null) {
    if (
      auth.pkce.codeChallengeMethod &&
      auth.pkce.codeChallengeMethod !== 'S256' &&
      auth.pkce.codeChallengeMethod !== 'plain'
    ) {
      throw new Error(
        `Configuration error: ${path}.pkce.codeChallengeMethod must be one of S256, plain.`,
      );
    }
  }

  if (auth.customRequestParameters) {
    for (const [key, value] of Object.entries(auth.customRequestParameters)) {
      if (!key.trim()) {
        throw new Error(
          `Configuration error: ${path}.customRequestParameters contains an empty key.`,
        );
      }
      validateScopedValue(value, `${path}.customRequestParameters.${key}`);
    }
  }

  if (auth.customRequestHeaders) {
    for (const [key, value] of Object.entries(auth.customRequestHeaders)) {
      if (!key.trim()) {
        throw new Error(`Configuration error: ${path}.customRequestHeaders contains an empty key.`);
      }
      validateScopedValue(value, `${path}.customRequestHeaders.${key}`);
    }
  }
}

function normalizeOAuthCompatibilityConfig(
  auth: OAuthCompatibilityConfig,
): OAuthCompatibilityConfig {
  const normalized: OAuthCompatibilityConfig = {
    ...auth,
    type: auth.type ?? 'OAuth2',
    clientCredentialsMode: auth.clientCredentialsMode ?? 'basic',
    scope: normalizeScope(auth.scope),
    pkce: normalizePkce(auth.pkce),
  };

  validateOAuthCompatibilityConfig(normalized, 'security.auth.*.*.auth');

  return normalized;
}

function getIssuerBaseUrlFromEnvironment(authConfig: AuthProfileConfig): string {
  if (authConfig.domain.includes('/oauth2/')) {
    return authConfig.domain;
  }

  const authServer = authConfig.authorizationServerId || 'default';
  return `${authConfig.domain}/oauth2/${authServer}`;
}

export function resolveOAuthExecutionConfig(
  authConfig: AuthProfileConfig,
  grantTypeHint?: GrantType,
): ResolvedOAuthExecutionConfig {
  const auth = authConfig.auth;
  const grantType = auth?.grantType ?? grantTypeHint;
  const pkce = normalizePkce(auth?.pkce);

  let pkceEnabled = grantType === 'authorization_code';
  let pkceCodeChallengeMethod: CodeChallengeMethod = 'S256';

  if (typeof pkce === 'boolean') {
    pkceEnabled = pkce;
  } else if (typeof pkce === 'object' && pkce !== null) {
    pkceEnabled = pkce.enabled ?? true;
    pkceCodeChallengeMethod = pkce.codeChallengeMethod ?? 'S256';
  }

  const issuerBaseUrl = getIssuerBaseUrlFromEnvironment(authConfig);

  return {
    grantType,
    authUrl: auth?.authUrl ?? `${issuerBaseUrl}/v1/authorize`,
    tokenUrl: auth?.tokenUrl ?? `${issuerBaseUrl}/v1/token`,
    deviceAuthUrl: auth?.deviceAuthUrl,
    redirectUrl: auth?.redirectUrl ?? authConfig.redirectUri,
    clientId: auth?.clientId ?? authConfig.clientId,
    clientSecret: auth?.clientSecret,
    clientCredentialsMode: auth?.clientCredentialsMode ?? 'basic',
    scope: normalizeScope(auth?.scope) ?? authConfig.scope ?? 'openid profile email',
    pkceEnabled,
    pkceCodeChallengeMethod,
    customRequestParameters: normalizeScopedCollection(auth?.customRequestParameters),
    customRequestHeaders: normalizeScopedCollection(auth?.customRequestHeaders),
    passwordEnvVar: auth?.passwordEnvVar,
    passwordPromptVisible: Boolean(auth?.passwordPromptVisible),
  };
}

export function applyOAuthExecutionOverrides(
  config: ResolvedOAuthExecutionConfig,
  overrides: OAuthExecutionOverrides,
): ResolvedOAuthExecutionConfig {
  const mergeScoped = (
    base: Record<string, ResolvedScopedValue> | undefined,
    incoming: Record<string, ResolvedScopedValue> | undefined,
  ): Record<string, ResolvedScopedValue> | undefined => {
    if (!base && !incoming) {
      return undefined;
    }

    return {
      ...(base ?? {}),
      ...(incoming ?? {}),
    };
  };

  return {
    ...config,
    authUrl: overrides.authUrl ?? config.authUrl,
    tokenUrl: overrides.tokenUrl ?? config.tokenUrl,
    redirectUrl: overrides.redirectUrl ?? config.redirectUrl,
    clientId: overrides.clientId ?? config.clientId,
    clientSecret: overrides.clientSecret ?? config.clientSecret,
    clientCredentialsMode: overrides.clientCredentialsMode ?? config.clientCredentialsMode,
    scope: overrides.scope ?? config.scope,
    customRequestParameters: mergeScoped(
      config.customRequestParameters,
      overrides.customRequestParameters,
    ),
    customRequestHeaders: mergeScoped(
      config.customRequestHeaders,
      overrides.customRequestHeaders,
    ),
  };
}

export function validateOAuthExecutionConfig(
  config: ResolvedOAuthExecutionConfig,
  path: string,
): void {
  if (!config.grantType) {
    throw new Error(
      `Configuration error: ${path}.grantType is required for execution.`,
    );
  }

  if (!config.clientId.trim()) {
    throw new Error(`Configuration error: ${path}.clientId must be a non-empty string.`);
  }

  if (config.grantType === 'authorization_code') {
    if (!config.authUrl) {
      throw new Error(`Configuration error: ${path}.authUrl is required for authorization_code.`);
    }

    if (!config.tokenUrl) {
      throw new Error(`Configuration error: ${path}.tokenUrl is required for authorization_code.`);
    }

    if (!config.redirectUrl) {
      throw new Error(
        `Configuration error: ${path}.redirectUrl is required for authorization_code.`,
      );
    }

    if (!config.pkceEnabled && config.clientCredentialsMode === 'none') {
      throw new Error(
        `Configuration error: ${path}.clientCredentialsMode=none is not supported when grantType=authorization_code and PKCE is disabled.`,
      );
    }
  }

  if (config.grantType === 'client_credentials') {
    if (!config.tokenUrl) {
      throw new Error(`Configuration error: ${path}.tokenUrl is required for client_credentials.`);
    }

    if (config.clientCredentialsMode !== 'none' && !config.clientSecret) {
      throw new Error(
        `Configuration error: ${path}.clientSecret is required when clientCredentialsMode is basic or in_body.`,
      );
    }
  }

  if (config.grantType === 'password') {
    if (!config.tokenUrl) {
      throw new Error(`Configuration error: ${path}.tokenUrl is required for password grant.`);
    }
  }
}

export function resolvePasswordFromEnvironment(
  auth: OAuthCompatibilityConfig | undefined,
): string | undefined {
  const envVar = auth?.passwordEnvVar?.trim();
  if (!envVar) {
    return undefined;
  }

  const value = Deno.env.get(envVar);
  if (!value || !value.trim()) {
    return undefined;
  }

  return value;
}

export function resolveConfigSelection(
  config: AppConfig,
  env?: string,
  profile?: string,
): ConfigSelection {
  return {
    env: env || config.current?.env || 'dev',
    profile: profile || config.current?.profile || 'default',
  };
}

export function normalizeConfig(config: AppConfig): AppConfig {
  const current = resolveConfigSelection(config);
  const normalizedEnvironments: Record<string, Record<string, AuthProfileConfig>> = {};

  for (const [envName, profiles] of Object.entries(config.security.auth)) {
    normalizedEnvironments[envName] = {};

    for (const [profileName, envConfig] of Object.entries(profiles)) {
      const normalizedEnv: AuthProfileConfig = {
        ...envConfig,
      };

      if (envConfig.auth) {
        normalizedEnv.auth = normalizeOAuthCompatibilityConfig(envConfig.auth);
      }

      normalizedEnvironments[envName][profileName] = normalizedEnv;
    }
  }

  return {
    security: {
      auth: normalizedEnvironments,
    },
    current: {
      env: current.env,
      profile: current.profile,
    },
  };
}

/**
 * Get the current authentication profile configuration
 */
export function getCurrentAuthConfig(
  config: AppConfig,
  env?: string,
  profile?: string,
): AuthProfileConfig {
  const selection = resolveConfigSelection(config, env, profile);
  const targetEnv = selection.env;
  const targetProfile = selection.profile;

  const envConfig = config.security.auth[targetEnv];
  if (!envConfig) {
    throw new Error(`Environment '${targetEnv}' not found in configuration`);
  }

  const profileConfig = envConfig[targetProfile];
  if (!profileConfig) {
    throw new Error(`Profile '${targetProfile}' not found in environment '${targetEnv}'`);
  }

  return profileConfig;
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
  const sanitizedConfig = stripUndefinedDeep(normalizedConfig);
  const configContent = stringify(sanitizedConfig);
  Deno.writeTextFileSync(configPath, configContent);
}

/**
 * Initialize a new configuration file
 */
export function initializeConfig(): AppConfig {
  const config: AppConfig = {
    security: {
      auth: {
        dev: {
          default: {
            domain: 'https://your-dev-okta-domain.okta.com',
            clientId: 'your-dev-client-id',
            redirectUri: 'http://localhost:8000/callback',
            scope: 'openid profile email',
            discoveryUrl:
              'https://your-dev-okta-domain.okta.com/.well-known/oauth-authorization-server',
            auth: {
              type: 'OAuth2',
              clientSecret: 'your-dev-client-secret',
            },
          },
        },
        stg: {
          default: {
            domain: 'https://your-stg-okta-domain.okta.com',
            clientId: 'your-stg-client-id',
            redirectUri: 'http://localhost:8000/callback',
            scope: 'openid profile email',
            discoveryUrl:
              'https://your-stg-okta-domain.okta.com/.well-known/oauth-authorization-server',
            auth: {
              type: 'OAuth2',
              clientSecret: 'your-stg-client-secret',
            },
          },
        },
        prod: {
          default: {
            domain: 'https://your-prod-okta-domain.okta.com',
            clientId: 'your-prod-client-id',
            redirectUri: 'http://localhost:8000/callback',
            scope: 'openid profile email',
            discoveryUrl:
              'https://your-prod-okta-domain.okta.com/.well-known/oauth-authorization-server',
            auth: {
              type: 'OAuth2',
              clientSecret: 'your-prod-client-secret',
            },
          },
        },
      },
    },
    current: {
      env: 'dev',
      profile: 'default',
    },
  };

  saveConfig(config);
  return config;
}

/**
 * Add or update an environment/profile configuration
 */
export function addEnvironment(
  config: AppConfig,
  env: string,
  profile: string,
  authConfig: AuthProfileConfig,
): AppConfig {
  if (!config.security.auth[env]) {
    config.security.auth[env] = {};
  }

  config.security.auth[env][profile] = authConfig;
  saveConfig(config);
  return config;
}
