import {
  getCurrentOktaConfig,
  loadConfig,
  resolveConfigSelection,
} from '../../config/app.config.ts';
import type { Logger } from '../../utils/logger.ts';
import type { LoginCommandOptions, LoginContext } from './types.ts';

export function getLoginContext(options: LoginCommandOptions): LoginContext {
  const config = loadConfig();
  const selection = resolveConfigSelection(config, options.env, options.namespace);
  const oktaConfig = getCurrentOktaConfig(config, selection.env, selection.namespace);
  return { env: selection.env, namespace: selection.namespace, oktaConfig };
}

export function logContext(logger: Logger, context: LoginContext): void {
  logger.info(`Environment: ${context.env}`);
  logger.info(`Namespace: ${context.namespace}`);
  logger.info(`Domain: ${context.oktaConfig.domain}`);
}
