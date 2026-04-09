import {
  getCurrentAuthConfig,
  loadConfig,
  resolveConfigSelection,
} from '../../config/app.config.ts';
import type { Logger } from '../../utils/logger.ts';
import type { LoginCommandOptions, LoginContext } from './types.ts';

export function getLoginContext(options: LoginCommandOptions): LoginContext {
  const config = loadConfig();
  const selection = resolveConfigSelection(config, options.env, options.profile);
  const authConfig = getCurrentAuthConfig(config, selection.env, selection.profile);
  return { env: selection.env, profile: selection.profile, authConfig };
}

export function logContext(logger: Logger, context: LoginContext): void {
  logger.info(`Environment: ${context.env}`);
  logger.info(`Profile: ${context.profile}`);
  logger.info(`Domain: ${context.authConfig.domain}`);
}
