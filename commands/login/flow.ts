export async function openBrowser(url: string): Promise<void> {
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

export async function waitForLocalhostCallback(
  port: number,
  expectedState: string,
): Promise<string> {
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
          rejectCode(new Error('OAuth state mismatch - possible CSRF attempt'));
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

      return new Response('<p>Waiting for authentication...</p>', {
        headers: { 'Content-Type': 'text/html' },
      });
    },
  );

  const code = await codePromise;
  await server.finished;
  return code;
}

export function parseCodeFromRedirectUrl(redirectUrl: string, expectedState?: string): string {
  let parsed: URL;
  try {
    parsed = new URL(redirectUrl);
  } catch {
    throw new Error('Invalid URL. Provide the full redirect URL (starting with https://...).');
  }

  const error = parsed.searchParams.get('error');
  if (error) {
    const description = parsed.searchParams.get('error_description');
    const suffix = description ? ` - ${description}` : '';
    throw new Error(`OAuth error: ${error}${suffix}`);
  }

  const code = parsed.searchParams.get('code');
  if (!code) {
    throw new Error('No authorization code found in the URL.');
  }

  if (expectedState) {
    const returnedState = parsed.searchParams.get('state');
    if (returnedState !== expectedState) {
      throw new Error('State mismatch - possible CSRF attempt. Aborting.');
    }
  }

  return code;
}

export async function promptPassword(prompt: string, visible: boolean = false): Promise<string> {
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
      await Deno.stdout.write(encoder.encode(visible ? char : '*'));
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
