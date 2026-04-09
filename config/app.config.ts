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

// ============================================================================
// ADR-0001 Compliant Configuration Schema Types
// ============================================================================

export type AuthType = 'oauth2';
export type GrantType = 'authorization_code' | 'client_credentials' | 'password';
export type ClientAuthenticationMethod = 'none' | 'basic' | 'in_body';
export type ScopedUse = 'everywhere' | 'in_auth_request' | 'in_token_request';
export type CodeChallengeMethod = 'S256' | 'plain';

export interface OAuthPkceConfig {
  enabled: boolean;
  code_challenge_method?: CodeChallengeMethod;
}

export type ScopedValue = string | string[] | {
  value: string | string[];
  use?: ScopedUse;
};

export interface ResolvedScopedValue {
  values: string[];
  use: ScopedUse;
}

/**
 * Provider configuration (issuer server details)
 * ADR-0001 Section: Provider Properties
 */
export interface ProviderConfig {
  issuer_uri: string;
  discovery_url?: string;
  authorization_url?: string;
  token_url?: string;
  device_auth_url?: string;
}

interface OidcDiscoveryDocument {
  issuer?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  device_authorization_endpoint?: string;
}

/**
 * Client configuration (application registration details)
 * ADR-0001 Section: Client Properties
 */
export interface ClientConfig {
  client_id: string;
  client_secret?: string;
  client_authentication_method?: ClientAuthenticationMethod;
  grant_type?: GrantType;
  redirect_uri?: string;
  scope?: string;
}

/**
 * Options configuration (security enhancements and developer experience)
 * ADR-0001 Section: Options Properties
 */
export interface OptionsConfig {
  pkce?: boolean | OAuthPkceConfig;
  acquire_automatically?: boolean;
  custom_request_parameters?: Record<string, ScopedValue>;
  custom_request_headers?: Record<string, ScopedValue>;
  password_env_var?: string;
  password_prompt_visible?: boolean;
}

/**
 * ADR-0001 Compliant Auth Profile Configuration
 * Follows the standardized CLI security configuration schema
 */
export interface AuthProfileConfig {
  type?: AuthType;
  provider: ProviderConfig;
  client: ClientConfig;
  options?: OptionsConfig;
}

type EnvironmentRegistry = Record<string, Record<string, AuthProfileConfig>>;

/**
 * Global configuration structure following ADR-0001
 * Unified configuration file format: ~/.nuewframe/nfauth/config.yaml
 */
export interface AppConfig {
  security: {
    env: string;
    profile: string;
    auth: EnvironmentRegistry;
  };
}

export interface ConfigSelection {
  env: string;
  profile: string;
}

/**
 * OAuth execution config used by command handlers
 */
export interface OAuthExecutionConfig {
  grantType?: GrantType;
  discoveryUrl: string;
  authUrl: string;
  tokenUrl: string;
  deviceAuthUrl?: string;
  redirectUrl?: string;
  clientId: string;
  clientSecret?: string;
  clientAuthenticationMethod: ClientAuthenticationMethod;
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
  clientAuthenticationMethod?: ClientAuthenticationMethod;
  scope?: string;
  customRequestParameters?: Record<string, ResolvedScopedValue>;
  customRequestHeaders?: Record<string, ResolvedScopedValue>;
}

// ============================================================================
// Utility Functions
// ============================================================================

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

function isValidAbsoluteUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function isValidRelativeUrlPath(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  if (isValidAbsoluteUrl(trimmed)) {
    return false;
  }

  return !trimmed.includes(' ');
}

function isValidProviderUrlReference(value: string): boolean {
  return isValidAbsoluteUrl(value) || isValidRelativeUrlPath(value);
}

function resolveProviderUrlReference(issuerUri: string, value: string): string {
  if (isValidAbsoluteUrl(value)) {
    return value;
  }

  const normalizedIssuer = issuerUri.replace(/\/+$/, '');
  const normalizedValue = value.trim().replace(/^\/+/, '');
  return `${normalizedIssuer}/${normalizedValue}`;
}

function buildDiscoveryUrlFromIssuer(issuerUri: string): string {
  return `${issuerUri.replace(/\/+$/, '')}/.well-known/openid-configuration`;
}

function resolveProviderDiscoveryUrl(provider: ProviderConfig): string {
  if (provider.discovery_url?.trim()) {
    return resolveProviderUrlReference(provider.issuer_uri, provider.discovery_url);
  }

  return buildDiscoveryUrlFromIssuer(provider.issuer_uri);
}

function resolveDiscoveryEndpointReference(
  discoveryUrl: string,
  value: string,
  field: string,
): string {
  try {
    return new URL(value.trim(), discoveryUrl).toString();
  } catch {
    throw new Error(
      `OIDC discovery document at ${discoveryUrl} has an invalid ${field} value.`,
    );
  }
}

async function fetchOidcDiscoveryDocument(
  discoveryUrl: string,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<OidcDiscoveryDocument> {
  const response = await fetchFn(discoveryUrl, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch OIDC discovery document from ${discoveryUrl}: ${response.status} ${errorText}`,
    );
  }

  const document = await response.json() as unknown;
  if (!document || typeof document !== 'object') {
    throw new Error(`OIDC discovery document from ${discoveryUrl} must be a JSON object.`);
  }

  return document as OidcDiscoveryDocument;
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

function normalizePkceOption(
  pkce: boolean | OAuthPkceConfig | undefined,
): OAuthPkceConfig | undefined {
  if (pkce === undefined) {
    return undefined;
  }

  if (typeof pkce === 'boolean') {
    return {
      enabled: pkce,
      code_challenge_method: 'S256',
    };
  }

  return {
    enabled: pkce.enabled,
    code_challenge_method: pkce.code_challenge_method ?? 'S256',
  };
}

function normalizeClientAuthMethodTypos(config: AppConfig): void {
  for (const profiles of Object.values(config.security.auth)) {
    for (const profile of Object.values(profiles)) {
      const client = profile.client as Record<string, unknown>;
      if (
        client.client_authentication_method === undefined &&
        typeof client.client_authenication_method === 'string'
      ) {
        client.client_authentication_method = client.client_authenication_method;
      }

      delete client.client_authenication_method;
    }
  }
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate ADR-0001 provider configuration
 */
function validateProviderConfig(provider: ProviderConfig, path: string): void {
  if (!provider.issuer_uri?.trim()) {
    throw new Error(`Configuration error: ${path}.provider.issuer_uri is required`);
  }
  if (!isValidAbsoluteUrl(provider.issuer_uri)) {
    throw new Error(
      `Configuration error: ${path}.provider.issuer_uri must be a valid absolute URL`,
    );
  }

  if (provider.discovery_url && !isValidProviderUrlReference(provider.discovery_url)) {
    throw new Error(
      `Configuration error: ${path}.provider.discovery_url must be a valid absolute URL or relative path if provided`,
    );
  }

  if (provider.authorization_url && !isValidProviderUrlReference(provider.authorization_url)) {
    throw new Error(
      `Configuration error: ${path}.provider.authorization_url must be a valid absolute URL or relative path`,
    );
  }

  if (provider.token_url && !isValidProviderUrlReference(provider.token_url)) {
    throw new Error(
      `Configuration error: ${path}.provider.token_url must be a valid absolute URL or relative path`,
    );
  }

  if (provider.device_auth_url && !isValidProviderUrlReference(provider.device_auth_url)) {
    throw new Error(
      `Configuration error: ${path}.provider.device_auth_url must be a valid absolute URL or relative path if provided`,
    );
  }
}

/**
 * Validate ADR-0001 client configuration
 */
function validateClientConfig(client: ClientConfig, path: string): void {
  if (!client.client_id?.trim()) {
    throw new Error(`Configuration error: ${path}.client.client_id is required`);
  }

  const validMethods = ['none', 'basic', 'in_body'];
  if (
    client.client_authentication_method &&
    !validMethods.includes(client.client_authentication_method)
  ) {
    throw new Error(
      `Configuration error: ${path}.client.client_authentication_method must be one of ${
        validMethods.join(', ')
      }`,
    );
  }

  const validGrantTypes = ['authorization_code', 'client_credentials', 'password'];
  if (client.grant_type && !validGrantTypes.includes(client.grant_type)) {
    throw new Error(
      `Configuration error: ${path}.client.grant_type must be one of ${validGrantTypes.join(', ')}`,
    );
  }

  if (client.redirect_uri && !isValidAbsoluteUrl(client.redirect_uri)) {
    throw new Error(
      `Configuration error: ${path}.client.redirect_uri must be a valid absolute URL if provided`,
    );
  }
}

/**
 * Validate ADR-0001 options configuration
 */
function validateOptionsConfig(options: OptionsConfig, path: string): void {
  if (options.pkce !== undefined && typeof options.pkce !== 'boolean') {
    const method = options.pkce.code_challenge_method;
    if (typeof options.pkce.enabled !== 'boolean') {
      throw new Error(`Configuration error: ${path}.options.pkce.enabled must be a boolean.`);
    }

    if (method !== undefined && method !== 'S256' && method !== 'plain') {
      throw new Error(
        `Configuration error: ${path}.options.pkce.code_challenge_method must be one of S256, plain.`,
      );
    }
  }

  if (options.custom_request_parameters) {
    for (const [key, value] of Object.entries(options.custom_request_parameters)) {
      if (!key.trim()) {
        throw new Error(
          `Configuration error: ${path}.options.custom_request_parameters has empty key`,
        );
      }
      validateScopedValue(value, `${path}.options.custom_request_parameters.${key}`);
    }
  }

  if (options.custom_request_headers) {
    for (const [key, value] of Object.entries(options.custom_request_headers)) {
      if (!key.trim()) {
        throw new Error(
          `Configuration error: ${path}.options.custom_request_headers has empty key`,
        );
      }
      validateScopedValue(value, `${path}.options.custom_request_headers.${key}`);
    }
  }
}

/**
 * Validate ADR-0001 auth profile configuration
 */
function validateAuthProfileConfig(config: AuthProfileConfig, path: string): void {
  if (config.type && config.type !== 'oauth2') {
    throw new Error(`Configuration error: ${path}.type must be 'oauth2' if specified`);
  }

  validateProviderConfig(config.provider, path);
  validateClientConfig(config.client, path);

  if (config.options) {
    validateOptionsConfig(config.options, path);
  }
}

// ============================================================================
// Configuration Loading & Management
// ============================================================================

/**
 * Load configuration from the unified config file.
 */
export function loadConfig(): AppConfig {
  const unifiedConfig = loadUnifiedConfig();
  if (unifiedConfig) {
    return unifiedConfig;
  }

  throw new Error(
    'No configuration found. Run "nfauth config init" to create a starter configuration.',
  );
}

/**
 * Load unified configuration from configured path or default file.
 * Returns null if config file does not exist.
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
    const rawConfig = parse(configContent) as unknown;

    if (!rawConfig || typeof rawConfig !== 'object') {
      throw new Error('Invalid config file: must be a YAML object');
    }

    const config = rawConfig as AppConfig;

    if (!config.security?.auth) {
      throw new Error('Invalid config structure: missing security.auth');
    }

    if (!config.security.env) {
      config.security.env = 'dev';
    }

    if (!config.security.profile) {
      config.security.profile = 'default';
    }

    normalizeClientAuthMethodTypos(config);

    // Validate all profiles
    for (const [envName, profiles] of Object.entries(config.security.auth)) {
      for (const [profileName, profile] of Object.entries(profiles)) {
        const path = `security.auth.${envName}.${profileName}`;
        validateAuthProfileConfig(profile, path);
      }
    }

    return config;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return null;
    }
    throw error;
  }
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

  const sanitizedConfig = stripUndefinedDeep(config);
  const configContent = stringify(sanitizedConfig);
  Deno.writeTextFileSync(configPath, configContent);
}

/**
 * Initialize a new configuration file with default values
 */
export function initializeConfig(): AppConfig {
  const config: AppConfig = {
    security: {
      env: 'dev',
      profile: 'default',
      auth: {
        dev: {
          default: {
            type: 'oauth2',
            provider: {
              issuer_uri: 'https://your-dev-domain.okta.com/oauth2/default',
              discovery_url: '/.well-known/openid-configuration',
            },
            client: {
              client_id: 'your-dev-client-id',
              client_secret: 'your-dev-client-secret',
              client_authentication_method: 'basic',
              grant_type: 'authorization_code',
              redirect_uri: 'http://localhost:8000/callback',
              scope: 'openid profile email',
            },
            options: {
              pkce: true,
              acquire_automatically: true,
            },
          },
        },
      },
    },
  };

  saveConfig(config);
  return config;
}

/**
 * Resolve config selection with proper precedence: explicit > current > defaults
 */
export function resolveConfigSelection(
  config: AppConfig,
  env?: string,
  profile?: string,
): ConfigSelection {
  return {
    env: env || config.security.env || 'dev',
    profile: profile || config.security.profile || 'default',
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

/**
 * Normalize configuration: ensure valid structure and all profiles are valid
 */
export function normalizeConfig(config: AppConfig): AppConfig {
  const normalized = { ...config };

  if (!normalized.security.env) {
    normalized.security.env = 'dev';
  }
  if (!normalized.security.profile) {
    normalized.security.profile = 'default';
  }

  normalizeClientAuthMethodTypos(normalized);

  // Validate all profiles
  for (const [envName, profiles] of Object.entries(normalized.security.auth)) {
    for (const [profileName, profile] of Object.entries(profiles)) {
      const path = `security.auth.${envName}.${profileName}`;
      validateAuthProfileConfig(profile, path);
    }
  }

  return normalized;
}

/**
 * Resolve OAuth execution configuration from auth profile
 */
export function resolveOAuthExecutionConfig(
  authConfig: AuthProfileConfig,
  grantTypeHint?: GrantType,
): OAuthExecutionConfig {
  const client = authConfig.client;
  const provider = authConfig.provider;
  const options = authConfig.options ?? {};

  const grantType = client.grant_type ?? grantTypeHint ?? 'authorization_code';
  const normalizedPkce = normalizePkceOption(options.pkce);

  let pkceEnabled = grantType === 'authorization_code';
  let pkceCodeChallengeMethod: CodeChallengeMethod = 'S256';

  if (normalizedPkce) {
    pkceEnabled = normalizedPkce.enabled;
    pkceCodeChallengeMethod = normalizedPkce.code_challenge_method ?? 'S256';
  }

  return {
    grantType,
    discoveryUrl: resolveProviderDiscoveryUrl(provider),
    authUrl: provider.authorization_url
      ? resolveProviderUrlReference(provider.issuer_uri, provider.authorization_url)
      : '',
    tokenUrl: provider.token_url
      ? resolveProviderUrlReference(provider.issuer_uri, provider.token_url)
      : '',
    deviceAuthUrl: provider.device_auth_url
      ? resolveProviderUrlReference(provider.issuer_uri, provider.device_auth_url)
      : undefined,
    redirectUrl: client.redirect_uri,
    clientId: client.client_id,
    clientSecret: client.client_secret,
    clientAuthenticationMethod: client.client_authentication_method ?? 'basic',
    scope: client.scope ?? 'openid profile email',
    pkceEnabled,
    pkceCodeChallengeMethod,
    customRequestParameters: normalizeScopedCollection(options.custom_request_parameters),
    customRequestHeaders: normalizeScopedCollection(options.custom_request_headers),
    passwordEnvVar: options.password_env_var,
    passwordPromptVisible: options.password_prompt_visible ?? false,
  };
}

export async function resolveOAuthExecutionConfigWithDiscovery(
  authConfig: AuthProfileConfig,
  grantTypeHint?: GrantType,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<OAuthExecutionConfig> {
  const baseConfig = resolveOAuthExecutionConfig(authConfig, grantTypeHint);
  if (baseConfig.authUrl && baseConfig.tokenUrl) {
    return baseConfig;
  }

  const document = await fetchOidcDiscoveryDocument(baseConfig.discoveryUrl, fetchFn);

  const authUrl = baseConfig.authUrl || (() => {
    if (!document.authorization_endpoint?.trim()) {
      throw new Error(
        `OIDC discovery document at ${baseConfig.discoveryUrl} is missing authorization_endpoint.`,
      );
    }

    return resolveDiscoveryEndpointReference(
      baseConfig.discoveryUrl,
      document.authorization_endpoint,
      'authorization_endpoint',
    );
  })();

  const tokenUrl = baseConfig.tokenUrl || (() => {
    if (!document.token_endpoint?.trim()) {
      throw new Error(
        `OIDC discovery document at ${baseConfig.discoveryUrl} is missing token_endpoint.`,
      );
    }

    return resolveDiscoveryEndpointReference(
      baseConfig.discoveryUrl,
      document.token_endpoint,
      'token_endpoint',
    );
  })();

  const deviceAuthUrl = baseConfig.deviceAuthUrl ||
    (document.device_authorization_endpoint?.trim()
      ? resolveDiscoveryEndpointReference(
        baseConfig.discoveryUrl,
        document.device_authorization_endpoint,
        'device_authorization_endpoint',
      )
      : undefined);

  return {
    ...baseConfig,
    authUrl,
    tokenUrl,
    deviceAuthUrl,
  };
}

/**
 * Apply runtime overrides to OAuth execution configuration
 */
export function applyOAuthExecutionOverrides(
  config: OAuthExecutionConfig,
  overrides: OAuthExecutionOverrides,
): OAuthExecutionConfig {
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
    clientAuthenticationMethod: overrides.clientAuthenticationMethod ??
      config.clientAuthenticationMethod,
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

/**
 * Validate that OAuth execution configuration is complete and valid
 */
export function validateOAuthExecutionConfig(
  config: OAuthExecutionConfig,
  path: string,
): void {
  if (!config.grantType) {
    throw new Error(
      `Configuration error: ${path}.grantType is required for execution.`,
    );
  }

  if (!config.clientId?.trim()) {
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

    if (!config.pkceEnabled && config.clientAuthenticationMethod === 'none') {
      throw new Error(
        `Configuration error: ${path}.clientAuthenticationMethod=none is not supported when grantType=authorization_code and PKCE is disabled.`,
      );
    }
  }

  if (config.grantType === 'client_credentials') {
    if (!config.tokenUrl) {
      throw new Error(`Configuration error: ${path}.tokenUrl is required for client_credentials.`);
    }

    if (config.clientAuthenticationMethod !== 'none' && !config.clientSecret) {
      throw new Error(
        `Configuration error: ${path}.clientSecret is required when clientAuthenticationMethod is basic or in_body.`,
      );
    }
  }

  if (config.grantType === 'password') {
    if (!config.tokenUrl) {
      throw new Error(`Configuration error: ${path}.tokenUrl is required for password grant.`);
    }
  }
}

/**
 * Resolve password from environment variable
 */
export function resolvePasswordFromEnvironment(
  config: AuthProfileConfig | undefined,
): string | undefined {
  const envVar = config?.options?.password_env_var?.trim();
  if (!envVar) {
    return undefined;
  }

  const value = Deno.env.get(envVar);
  if (!value || !value.trim()) {
    return undefined;
  }

  return value;
}
