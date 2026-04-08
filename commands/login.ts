import { Command } from '@cliffy/command';
import { OktaLoginService } from '../services/okta-login.service.ts';
import type { OktaLoginConfig } from '../services/okta-login.service.ts';
import { OktaService } from '../services/okta.service.ts';
import { getCurrentOktaConfig, loadConfig, resolveConfigSelection } from '../config/app.config.ts';
import { saveCredentials } from '../utils/credentials.ts';
import { createLoggerFromOptions, type Logger, type LoggingOptions } from '../utils/logger.ts';
import { buildOktaServiceConfig } from '../utils/okta-service-options.ts';
import { clearPkceState, generatePkce, loadPkceState, savePkceState } from '../utils/pkce.ts';

interface LoginCommandOptions {
  env?: string;
  namespace?: string;
  logLevel?: string;
  verbose?: boolean;
  redirectUri?: string;
  port?: number;
  state?: string;
  nonce?: string;
  url?: string;
}

interface LoginContext {
  env: string;
  namespace: string;
  oktaConfig: ReturnType<typeof getCurrentOktaConfig>;
}

function getLoginContext(options: LoginCommandOptions): LoginContext {
  const config = loadConfig();
  const selection = resolveConfigSelection(config, options.env, options.namespace);
  const oktaConfig = getCurrentOktaConfig(config, selection.env, selection.namespace);
  return { env: selection.env, namespace: selection.namespace, oktaConfig };
}

/** Open a URL in the system default browser. Silently ignored if unavailable. */
async function openBrowser(url: string): Promise<void> {
  const os = Deno.build.os;
  const [cmd, args]: [string, string[]] = os === 'darwin'
    ? ['open', [url]]
    : os === 'windows'
    ? ['cmd', ['/c', 'start', '', url]]
    : ['xdg-open', [url]];

  try {
    const proc = new Deno.Command(cmd, { args, stdout: 'null', stderr: 'null' });
    await proc.output();
  } catch {
    // Browser opening is best-effort; the URL is also printed to the terminal.
  }
}

/**
 * Wait for OAuth callback on localhost and return the code when state matches.
 */
async function waitForLocalhostCallback(port: number, expectedState: string): Promise<string> {
  let resolveCode!: (code: string) => void;
  let rejectCode!: (err: Error) => void;

  const codePromise = new Promise<string>((res, rej) => {
    resolveCode = res;
    rejectCode = rej;
  });

  const server = Deno.serve(
    { port, hostname: '127.0.0.1', onListen: () => {} },
    (req) => {
      const url = new URL(req.url);
      if (url.pathname !== '/callback') {
        return new Response('Not found', { status: 404 });
      }

      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');

      if (error) {
        const desc = url.searchParams.get('error_description') ?? error;
        setTimeout(() => {
          server.shutdown();
          rejectCode(new Error(`OAuth error: ${desc}`));
        }, 50);
        return new Response(
          `<h1>&#10060; Login failed</h1><p>${desc}</p><p>You may close this tab.</p>`,
          { headers: { 'Content-Type': 'text/html' } },
        );
      }

      if (state && state !== expectedState) {
        setTimeout(() => {
          server.shutdown();
          rejectCode(new Error('OAuth state mismatch – possible CSRF attempt'));
        }, 50);
        return new Response(
          '<h1>&#10060; State mismatch. You may close this tab.</h1>',
          { headers: { 'Content-Type': 'text/html' } },
        );
      }

      if (code && state === expectedState) {
        setTimeout(() => {
          server.shutdown();
          resolveCode(code);
        }, 50);
        return new Response(
          '<h1>&#9989; Login successful!</h1><p>You may close this tab and return to the terminal.</p>',
          { headers: { 'Content-Type': 'text/html' } },
        );
      }

      return new Response('<p>Waiting for authentication…</p>', {
        headers: { 'Content-Type': 'text/html' },
      });
    },
  );

  const code = await codePromise;
  await server.finished;
  return code;
}

function parseCodeFromRedirectUrl(redirectUrl: string, expectedState?: string): string {
  let parsed: URL;
  try {
    parsed = new URL(redirectUrl);
  } catch {
    throw new Error('Invalid URL. Provide the full redirect URL (starting with https://…).');
  }

  const error = parsed.searchParams.get('error');
  if (error) {
    throw new Error(
      `OAuth error: ${error} – ${parsed.searchParams.get('error_description') ?? ''}`.trimEnd(),
    );
  }

  const code = parsed.searchParams.get('code');
  if (!code) {
    throw new Error('No authorization code found in the URL.');
  }

  if (expectedState) {
    const returnedState = parsed.searchParams.get('state');
    if (returnedState !== expectedState) {
      throw new Error('State mismatch – possible CSRF attempt. Aborting.');
    }
  }

  return code;
}

async function promptPassword(prompt: string): Promise<string> {
  console.log(prompt);

  const originalRaw = Deno.stdin.isTerminal() ? Deno.stdin.setRaw(true) : false;
  let password = '';
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const buf = new Uint8Array(1);
      const n = await Deno.stdin.read(buf);
      if (n === null) break;

      const char = decoder.decode(buf.subarray(0, n));
      if (char === '\n' || char === '\r') {
        console.log('');
        break;
      }

      if (char === '\x7f' || char === '\x08') {
        if (password.length > 0) {
          password = password.slice(0, -1);
          await Deno.stdout.write(encoder.encode('\x08 \x08'));
        }
        continue;
      }

      if (char === '\x03') {
        console.log('\nOperation cancelled');
        Deno.exit(1);
      }

      if (char === '\x04') break;

      password += char;
      await Deno.stdout.write(encoder.encode('*'));
    }

    if (!password) {
      throw new Error('Password is required');
    }

    return password;
  } finally {
    if (originalRaw) {
      Deno.stdin.setRaw(false);
    }
  }
}

function logContext(logger: Logger, context: LoginContext): void {
  logger.info(`Environment: ${context.env}`);
  logger.info(`Namespace: ${context.namespace}`);
  logger.info(`Domain: ${context.oktaConfig.domain}`);
}

const loginPasswordCommand = new Command()
  .description('Direct login with username/password (high-trust or legacy path)')
  .arguments('<username:string>')
  .action(async (options, username) => {
    const logger = createLoggerFromOptions(options as unknown as LoggingOptions);
    try {
      const commandOptions = options as unknown as LoginCommandOptions;
      const context = getLoginContext(commandOptions);
      if (!context.oktaConfig.redirectUri) {
        throw new Error(
          'Missing redirectUri in selected Okta configuration. Set redirectUri in config.yaml for this env/namespace.',
        );
      }

      const authorizationServerId = context.oktaConfig.authorizationServerId || 'default';

      const loginConfig: OktaLoginConfig = {
        issuer: `${context.oktaConfig.domain}/oauth2/${authorizationServerId}`,
        clientId: context.oktaConfig.clientId,
        redirectUri: context.oktaConfig.redirectUri,
        scope: context.oktaConfig.scope || 'openid profile email',
      };

      const loginService = new OktaLoginService(loginConfig);

      logger.info('Attempting password login...');
      logContext(logger, context);

      const password = await promptPassword('Enter password: ');
      const tokens = await loginService.login({ username, password });
      await saveCredentials(tokens);

      logger.success('Login successful');
      logger.info(`Access Token: ${tokens.access_token.substring(0, 50)}...`);
      logger.info(`ID Token: ${tokens.id_token.substring(0, 50)}...`);
      logger.info(`Token Type: ${tokens.token_type}`);
      logger.info(`Expires In: ${tokens.expires_in} seconds`);
      logger.success('Tokens saved to ~/.nuewframe/credential.json');
    } catch (error) {
      logger.error(
        'Password login failed:',
        error instanceof Error ? error.message : String(error),
      );
      Deno.exit(1);
    }
  });

const loginUrlCommand = new Command()
  .description('Generate OAuth login URL and save pending PKCE state for manual completion')
  .option('-s, --state <state:string>', 'State parameter (auto-generated when omitted)')
  .option('--nonce <nonce:string>', 'Nonce parameter (auto-generated when omitted)')
  .option('--redirect-uri <uri:string>', 'Override redirect URI for this login flow')
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

      const pkce = await generatePkce(commandOptions.state, commandOptions.nonce);
      await savePkceState(pkce);

      const authUrl = oktaService.getAuthorizeUrl({
        state: pkce.state,
        nonce: pkce.nonce,
        codeChallenge: pkce.codeChallenge,
      });

      logContext(logger, context);
      logger.info(`Redirect URI: ${effectiveRedirectUri}`);
      logger.info('Login URL:');
      console.log(authUrl);
      logger.info('Pending login state saved. Complete with:');
      logger.info('  okta-client login code <code>');
      logger.info('or:');
      logger.info('  okta-client login code --url "<full-redirect-url>"');
    } catch (error) {
      logger.error(
        'Failed to generate login URL:',
        error instanceof Error ? error.message : String(error),
      );
      Deno.exit(1);
    }
  });

const loginCodeCommand = new Command()
  .description('Complete login by exchanging an authorization code for tokens')
  .arguments('[code:string]')
  .option('--url <url:string>', 'Full redirect URL containing ?code= and optional state')
  .action(async (options, codeArg) => {
    const logger = createLoggerFromOptions(options as unknown as LoggingOptions);
    try {
      const commandOptions = options as unknown as LoginCommandOptions;
      const context = getLoginContext(commandOptions);
      const oktaServiceConfig = buildOktaServiceConfig(context.oktaConfig);
      const oktaService = new OktaService(oktaServiceConfig);

      const pkce = await loadPkceState();
      let code = codeArg;

      if (!code && commandOptions.url) {
        code = parseCodeFromRedirectUrl(commandOptions.url, pkce.state);
      }

      if (!code) {
        throw new Error(
          'No authorization code provided. Use login code <code> or --url <full-url>.',
        );
      }

      logger.info('Exchanging authorization code for tokens...');
      logContext(logger, context);

      const tokens = await oktaService.exchangeCodeForTokens(code, pkce.codeVerifier);
      await saveCredentials(tokens);
      await clearPkceState();

      logger.success('Login successful! Credentials saved to ~/.nuewframe/credential.json');
      logger.info(`Access Token: ${tokens.access_token.substring(0, 50)}...`);
      logger.info(`Token Type: ${tokens.token_type}`);
      if (tokens.id_token) {
        logger.info(`ID Token: ${tokens.id_token.substring(0, 50)}...`);
      }
      if (tokens.refresh_token) {
        logger.info('Refresh Token: Available');
      }
    } catch (error) {
      logger.error('Code exchange failed:', error instanceof Error ? error.message : String(error));
      Deno.exit(1);
    }
  });

const loginBrowserCommand = new Command()
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

      const pkce = await generatePkce();
      await savePkceState(pkce);

      const authUrl = oktaService.getAuthorizeUrl({
        state: pkce.state,
        nonce: pkce.nonce,
        codeChallenge: pkce.codeChallenge,
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
          code = await waitForLocalhostCallback(port, pkce.state);
        } catch {
          logger.info('Automatic callback capture failed. Complete manually with:');
          logger.info('  okta-client login code <code>');
          logger.info('or:');
          logger.info('  okta-client login code --url "<full-redirect-url>"');
          return;
        }
      } else {
        logger.info('No localhost callback configured. Complete manually with:');
        logger.info('  okta-client login code <code>');
        logger.info('or:');
        logger.info('  okta-client login code --url "<full-redirect-url>"');
        return;
      }

      const tokens = await oktaService.exchangeCodeForTokens(code, pkce.codeVerifier);
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

export const loginCommand = new Command()
  .description('End-user login flows')
  .action((options) => {
    const logger = createLoggerFromOptions(options as unknown as LoggingOptions);
    logger.info('Use one of the login subcommands: browser, url, code, password');
    logger.info("Run 'okta-client login --help' for more information");
  })
  .command('browser', loginBrowserCommand)
  .command('url', loginUrlCommand)
  .command('code', loginCodeCommand)
  .command('password', loginPasswordCommand);
