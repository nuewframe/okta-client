/**
 * Chrome DevTools Protocol (CDP) helpers for the browser-based OAuth login flow.
 *
 * Strategy:
 *  1. Find a free TCP port, then spawn Chrome/Edge with `--remote-debugging-port=<port>`
 *     so we pick a known port without touching stderr.
 *  2. Poll `/json/version` until Chrome's DevTools HTTP server responds, then extract
 *     the browser-level WebSocket URL.
 *  3. Connect to that WebSocket, enable `Target.setDiscoverTargets`, and attach to
 *     every page target that appears (including SSO pop-ups).
 *  4. Enable the `Page` domain on each attached session and watch for
 *     `Page.frameNavigated` on the main frame. The first navigation whose URL starts
 *     with `redirectUri` contains the `?code=` – extract it, validate `state`,
 *     kill Chrome, and return the code.
 *
 * This works with **any** registered redirect URI – no localhost Okta change needed.
 */

/** Known Chromium-based browser paths per OS. First match wins. */
const CHROME_PATHS: Partial<Record<string, string[]>> = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/snap/bin/chromium',
  ],
  windows: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
};

/** Return the path to the first Chromium-based browser found, or `null`. */
export async function findChromePath(): Promise<string | null> {
  const paths = CHROME_PATHS[Deno.build.os] ?? [];
  for (const p of paths) {
    try {
      const stat = await Deno.stat(p);
      if (stat.isFile) return p;
    } catch {
      // not present, try next
    }
  }
  return null;
}

/** Bind to port 0 to get a free port from the OS, then immediately release it. */
function findFreePort(): number {
  const listener = Deno.listen({ port: 0, hostname: '127.0.0.1' });
  const { port } = listener.addr as Deno.NetAddr;
  listener.close();
  return port;
}

/**
 * Poll Chrome's `/json/version` endpoint until it responds, then return the
 * browser-level `webSocketDebuggerUrl`.
 */
async function waitForDevToolsVersion(port: number, timeoutMs = 15_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) {
        const data = await res.json() as { webSocketDebuggerUrl?: string };
        if (data.webSocketDebuggerUrl) return data.webSocketDebuggerUrl;
      }
    } catch {
      // Chrome not up yet – keep polling
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('Timed out waiting for Chrome DevTools to respond (15 s)');
}

interface CdpMessage {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string };
  sessionId?: string;
}

function normalizePathname(pathname: string): string {
  if (pathname === '/') {
    return '/';
  }

  return pathname.replace(/\/+$/, '');
}

function isRedirectNavigationUrl(navigationUrl: URL, redirectUrl: URL): boolean {
  if (navigationUrl.origin !== redirectUrl.origin) {
    return false;
  }

  return normalizePathname(navigationUrl.pathname) === normalizePathname(redirectUrl.pathname);
}

export function extractCodeFromRedirectNavigation(
  navigationUrl: string,
  redirectUri: string,
  expectedState: string,
): string | null {
  let parsedNavigationUrl: URL;
  let parsedRedirectUri: URL;

  try {
    parsedNavigationUrl = new URL(navigationUrl);
  } catch {
    return null;
  }

  try {
    parsedRedirectUri = new URL(redirectUri);
  } catch {
    throw new Error(`Invalid redirect URI configured: ${redirectUri}`);
  }

  if (!isRedirectNavigationUrl(parsedNavigationUrl, parsedRedirectUri)) {
    return null;
  }

  const oauthError = parsedNavigationUrl.searchParams.get('error');
  if (oauthError) {
    const description = parsedNavigationUrl.searchParams.get('error_description');
    const suffix = description ? ` - ${description}` : '';
    throw new Error(`OAuth error: ${oauthError}${suffix}`);
  }

  const code = parsedNavigationUrl.searchParams.get('code');
  if (!code) {
    throw new Error('No authorization code in redirect URL');
  }

  const state = parsedNavigationUrl.searchParams.get('state');
  if (state !== expectedState) {
    throw new Error('State mismatch - possible CSRF attempt');
  }

  return code;
}

/**
 * Open a browser-level CDP WebSocket, attach to every page target that appears,
 * and resolve with the authorization code as soon as any page navigates to a URL
 * that starts with `redirectUri`.
 */
function monitorForCode(
  browserWsUrl: string,
  redirectUri: string,
  expectedState: string,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let msgId = 0;
    let settled = false;
    const attachedSessions = new Set<string>();

    const timer = setTimeout(() => {
      settle(() =>
        reject(
          new Error(
            'Timed out waiting for login. Did you complete authentication in the browser?',
          ),
        )
      );
    }, timeoutMs);

    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch { /* already closing */ }
      fn();
    };

    const ws = new WebSocket(browserWsUrl);

    const send = (
      method: string,
      params: Record<string, unknown> = {},
      sessionId?: string,
    ): void => {
      const msg: CdpMessage = { id: ++msgId, method, params };
      if (sessionId) msg.sessionId = sessionId;
      try {
        ws.send(JSON.stringify(msg));
      } catch { /* ws may be closing */ }
    };

    ws.onopen = () => {
      // Fires Target.targetCreated for all *existing* targets, then watches new ones.
      send('Target.setDiscoverTargets', { discover: true });
    };

    ws.onmessage = (evt) => {
      let msg: CdpMessage;
      try {
        msg = JSON.parse(evt.data as string) as CdpMessage;
      } catch {
        return;
      }

      const maybeResolveFromUrl = (url?: string): boolean => {
        if (!url) {
          return false;
        }

        try {
          const code = extractCodeFromRedirectNavigation(url, redirectUri, expectedState);
          if (!code) {
            return false;
          }

          settle(() => resolve(code));
          return true;
        } catch (error) {
          settle(() => reject(error instanceof Error ? error : new Error(String(error))));
          return true;
        }
      };
      const { method, params, sessionId } = msg;

      // ── Target discovered ── attach to every page target
      if (method === 'Target.targetCreated' || method === 'Target.targetInfoChanged') {
        const { targetInfo } = params as {
          targetInfo: { type: string; targetId: string; url?: string };
        };
        if (targetInfo.type === 'page') {
          if (maybeResolveFromUrl(targetInfo.url)) {
            return;
          }
          send('Target.attachToTarget', { targetId: targetInfo.targetId, flatten: true });
        }
      }

      // ── Attachment succeeded ── enable the Page domain on this session
      if (method === 'Target.attachedToTarget') {
        const { sessionId: sid, targetInfo } = params as {
          sessionId: string;
          targetInfo: { type: string; url?: string };
        };
        if (targetInfo.type === 'page') {
          if (maybeResolveFromUrl(targetInfo.url)) {
            return;
          }
          attachedSessions.add(sid);
          send('Page.enable', {}, sid);
        }
      }

      // ── Page navigated ── check if the main frame reached the redirect URI
      if (method === 'Page.frameNavigated' && sessionId && attachedSessions.has(sessionId)) {
        const { frame } = params as {
          frame: { url: string; parentId?: string };
        };
        // Ignore iframe navigations (parentId is set for iframes)
        if (frame.parentId) return;

        maybeResolveFromUrl(frame.url);
      }
    };

    ws.onerror = () => settle(() => reject(new Error('CDP WebSocket connection error')));
    ws.onclose = () => {
      if (!settled) settle(() => reject(new Error('CDP WebSocket closed unexpectedly')));
    };
  });
}

/**
 * Launch a Chromium-based browser with CDP remote-debugging enabled, navigate to
 * `authUrl`, and wait for Okta to redirect back to `redirectUri`. Returns the
 * authorization code extracted from the redirect URL.
 *
 * Works with **any** registered `redirectUri` – the code is intercepted via CDP
 * before the browser completes the request to the redirect host.
 *
 * @param timeoutMs Maximum wait time for the user to complete login (default: 5 min).
 */
export async function loginViaCdp(
  authUrl: string,
  redirectUri: string,
  expectedState: string,
  timeoutMs = 5 * 60_000,
): Promise<string> {
  const chromePath = await findChromePath();
  if (!chromePath) {
    throw new Error('No Chromium-based browser found. Install Chrome or Edge to use CDP mode.');
  }

  const debugPort = findFreePort();
  const userDataDir = await Deno.makeTempDir({ prefix: 'okta-cli-cdp-' });

  const child = new Deno.Command(chromePath, {
    args: [
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-sync',
      '--disable-component-extensions-with-background-pages',
      authUrl,
    ],
    stdout: 'null',
    stderr: 'null',
  }).spawn();

  try {
    const browserWsUrl = await waitForDevToolsVersion(debugPort);
    return await monitorForCode(browserWsUrl, redirectUri, expectedState, timeoutMs);
  } finally {
    try {
      child.kill('SIGTERM');
    } catch { /* already exited */ }
    // Brief pause so Chrome can release file locks before we delete the temp dir.
    await new Promise((r) => setTimeout(r, 800));
    try {
      await Deno.remove(userDataDir, { recursive: true });
    } catch { /* ignore */ }
  }
}
