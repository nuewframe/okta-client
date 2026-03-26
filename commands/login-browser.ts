import { Command } from '@cliffy/command';
import { OktaService } from '../services/okta.service.ts';
import { getCurrentOktaConfig, loadConfig, resolveConfigSelection } from '../config/app.config.ts';
import { buildOktaServiceConfig } from '../utils/okta-service-options.ts';
import { findChromePath, loginViaCdp } from '../utils/cdp.ts';
import { generatePkce } from '../utils/pkce.ts';
import { saveCredentials } from '../utils/credentials.ts';
import { createLoggerFromOptions, type LoggingOptions } from '../utils/logger.ts';
import type { Logger } from '../utils/logger.ts';
import type { OktaService as OktaServiceType } from '../services/okta.service.ts';
import type { PkceState } from '../utils/pkce.ts';

interface LoginBrowserOptions {
  env?: string;
  namespace?: string;
  logLevel?: string;
  verbose?: boolean;
  redirectUri?: string;
  port?: number;
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
 * Strategy A (automated) — start a local HTTP server, wait for Okta to redirect
 * `?code=…&state=…` to it, then shut down and return the code.
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

  // Race: resolve when the code arrives; server.finished ensures cleanup.
  const code = await codePromise;
  await server.finished;
  return code;
}

/**
 * Strategy B (semi-automated) — open the browser then ask the user to paste
 * the full redirect URL back into the terminal. Works with any redirect URI
 * that is registered in Okta, including non-localhost ones.
 */
async function waitForManualCallback(
  authUrl: string,
  pkce: PkceState,
  logger: Logger,
): Promise<string> {
  logger.info('Opening browser…');
  logger.info('If it does not open automatically, visit:');
  console.log(authUrl);
  await openBrowser(authUrl);

  logger.info('');
  logger.info('After authenticating, you will be redirected to a URL containing ?code=…');
  logger.info('Copy the full redirect URL from the browser address bar and paste it here.');
  await Deno.stdout.write(new TextEncoder().encode('Redirect URL: '));

  const buf = new Uint8Array(8192);
  const n = await Deno.stdin.read(buf);
  if (n === null) throw new Error('No input received');
  const pastedUrl = new TextDecoder().decode(buf.subarray(0, n)).trim();

  let parsed: URL;
  try {
    parsed = new URL(pastedUrl);
  } catch {
    throw new Error('Invalid URL. Paste the complete redirect URL (starting with https://…).');
  }

  const error = parsed.searchParams.get('error');
  if (error) {
    throw new Error(
      `OAuth error: ${error} – ${parsed.searchParams.get('error_description') ?? ''}`.trimEnd(),
    );
  }

  const code = parsed.searchParams.get('code');
  if (!code) throw new Error('No authorization code found in the URL.');

  const returnedState = parsed.searchParams.get('state');
  if (returnedState !== pkce.state) {
    throw new Error('State mismatch – possible CSRF attempt. Aborting.');
  }

  return code;
}

export const loginBrowserCommand = new Command()
  .name('login-browser')
  .description(
    'Login via browser using OAuth 2.0 authorization code flow with PKCE.\n\n' +
      'CDP mode (fully automated, Chrome or Edge required):\n' +
      '  A browser window opens; the authorization code is captured automatically\n' +
      '  when Okta redirects – works with ANY registered redirect URI, no copy-paste.\n\n' +
      'Localhost mode (automated, no Chrome required):\n' +
      '  Pass --redirect-uri http://localhost:<port>/callback to start a local callback\n' +
      '  server. Requires that URI to be registered in your Okta application.\n\n' +
      'Paste mode (fallback when neither Chrome nor a localhost redirect URI is available):\n' +
      '  Opens the browser and prompts you to paste the full redirect URL.',
  )
  .example('CDP / localhost / paste (auto-detected)', 'okta-client login-browser')
  .example(
    'Localhost mode',
    'okta-client login-browser --redirect-uri http://localhost:7879/callback',
  )
  .example('Custom env/namespace', 'okta-client login-browser --env dev --namespace cards')
  .option(
    '--redirect-uri <uri:string>',
    'Override the redirect URI. Use http://localhost:<port>/callback for fully automated flow.',
  )
  .option(
    '--port <port:number>',
    'Local port for the callback server when using a localhost redirect URI.',
    { default: 7879 },
  )
  .action(async (options) => {
    const logger = createLoggerFromOptions(options as unknown as LoggingOptions);
    try {
      const commandOptions = options as unknown as LoginBrowserOptions;
      const config = loadConfig();
      const selection = resolveConfigSelection(
        config,
        commandOptions.env,
        commandOptions.namespace,
      );
      const oktaConfig = getCurrentOktaConfig(config, selection.env, selection.namespace);

      // Determine effective redirect URI (CLI override takes precedence over config).
      const effectiveRedirectUri = commandOptions.redirectUri ?? oktaConfig.redirectUri;
      if (!effectiveRedirectUri) {
        throw new Error(
          'No redirect URI configured. Set redirectUri in config.yaml or pass --redirect-uri.',
        );
      }

      // Build the service with the effective redirect URI so both auth URL and
      // token exchange use the same value (required by OAuth spec).
      const serviceConfig = {
        ...buildOktaServiceConfig({ ...oktaConfig, redirectUri: effectiveRedirectUri }),
      };
      const oktaService: OktaServiceType = new OktaService(serviceConfig);

      logger.info(`Environment: ${selection.env}`);
      logger.info(`Namespace:   ${selection.namespace}`);
      logger.info(`Redirect URI: ${effectiveRedirectUri}`);

      // Generate PKCE bundle.
      const pkce = await generatePkce();

      const authUrl = oktaService.getAuthorizeUrl({
        state: pkce.state,
        nonce: pkce.nonce,
        codeChallenge: pkce.codeChallenge,
      });

      // ── Mode selection (CDP → localhost server → paste) ──────────────────────
      const chromePath = await findChromePath();
      let code: string;

      if (chromePath) {
        // CDP mode: spawn Chrome/Edge with remote-debugging, intercept redirect.
        logger.info('CDP mode: Chrome/Edge detected – browser will open and close automatically.');
        logger.info('If the browser does not open, visit the URL below manually:');
        console.log(authUrl);
        code = await loginViaCdp(authUrl, effectiveRedirectUri, pkce.state);
      } else {
        // Fallback: localhost callback server or paste mode.
        const isLocalhost = effectiveRedirectUri.startsWith('http://localhost') ||
          effectiveRedirectUri.startsWith('http://127.0.0.1');

        if (isLocalhost) {
          const uriPort = new URL(effectiveRedirectUri).port;
          const port = uriPort ? parseInt(uriPort, 10) : (commandOptions.port ?? 7879);
          logger.info(`Starting callback server on http://127.0.0.1:${port}/callback …`);
          logger.info('Opening browser… If it does not open, visit:');
          console.log(authUrl);
          await openBrowser(authUrl);
          logger.info('Waiting for authorization callback… (Ctrl+C to cancel)');
          code = await waitForLocalhostCallback(port, pkce.state);
        } else {
          // No Chrome, non-localhost URI → paste mode.
          code = await waitForManualCallback(authUrl, pkce, logger);
        }
      }

      logger.info('Authorization code received. Exchanging for tokens…');
      const tokens = await oktaService.exchangeCodeForTokens(code, pkce.codeVerifier);
      await saveCredentials(tokens);

      logger.success('Login successful! Credentials saved to ~/.nuewframe/credential.json');
      logger.info(`Access Token: ${tokens.access_token.substring(0, 50)}…`);
      logger.info(`Expires in:   ${tokens.expires_in}s`);
    } catch (error) {
      logger.error(
        'Browser login failed:',
        error instanceof Error ? error.message : String(error),
      );
      Deno.exit(1);
    }
  });
