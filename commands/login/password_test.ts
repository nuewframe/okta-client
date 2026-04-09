import { assertEquals } from '@std/assert';
import { Logger } from '../../utils/logger.ts';
import { executePasswordLogin, resolvePasswordForLogin } from './password.ts';

function restoreEnv(originalEnv: Record<string, string>): void {
  for (const key of Object.keys(Deno.env.toObject())) {
    if (!(key in originalEnv)) {
      Deno.env.delete(key);
    }
  }

  for (const [key, value] of Object.entries(originalEnv)) {
    Deno.env.set(key, value);
  }
}

Deno.test('resolvePasswordForLogin - prefers environment variable password', async () => {
  const originalEnv = { ...Deno.env.toObject() };

  try {
    Deno.env.set('LOGIN_PASSWORD', 'env-secret');

    let promptCalled = false;
    const prompt = (_message: string, _visible?: boolean): Promise<string> => {
      promptCalled = true;
      return Promise.resolve('prompt-secret');
    };

    const password = await resolvePasswordForLogin(
      {
        passwordEnvVar: 'LOGIN_PASSWORD',
        passwordPromptVisible: false,
      },
      prompt,
    );

    assertEquals(password, 'env-secret');
    assertEquals(promptCalled, false);
  } finally {
    restoreEnv(originalEnv);
  }
});

Deno.test('resolvePasswordForLogin - falls back to prompt when env password is missing', async () => {
  const originalEnv = { ...Deno.env.toObject() };

  try {
    Deno.env.delete('LOGIN_PASSWORD_MISSING');

    let promptMessage = '';
    let promptVisible = false;
    const prompt = (message: string, visible?: boolean): Promise<string> => {
      promptMessage = message;
      promptVisible = Boolean(visible);
      return Promise.resolve('prompt-secret');
    };

    const password = await resolvePasswordForLogin(
      {
        passwordEnvVar: 'LOGIN_PASSWORD_MISSING',
        passwordPromptVisible: true,
      },
      prompt,
    );

    assertEquals(password, 'prompt-secret');
    assertEquals(promptMessage, 'Enter password: ');
    assertEquals(promptVisible, true);
  } finally {
    restoreEnv(originalEnv);
  }
});

Deno.test('executePasswordLogin - uses env password and saves tokens', async () => {
  const originalEnv = { ...Deno.env.toObject() };

  try {
    Deno.env.set('LOGIN_PASSWORD', 'env-secret');

    let capturedUsername = '';
    let capturedPassword = '';
    let savedAccessToken = '';
    let promptCalled = false;

    await executePasswordLogin(
      {},
      'user@example.com',
      new Logger('none'),
      {
        getContext: () => ({
          env: 'dev',
          profile: 'default',
          authConfig: {
            domain: 'https://issuer.example.com',
            clientId: 'client-id',
            redirectUri: 'http://localhost:7879/callback',
            scope: 'openid profile email',
            authorizationServerId: 'default',
            auth: {
              grantType: 'password',
              passwordEnvVar: 'LOGIN_PASSWORD',
            },
          },
        }),
        createLoginService: () => ({
          login: ({ username, password }) => {
            capturedUsername = username;
            capturedPassword = password;
            return Promise.resolve({
              access_token: 'access-token',
              id_token: 'id-token',
              token_type: 'Bearer',
              expires_in: 3600,
              scope: 'openid profile email',
            });
          },
        }),
        saveCredentialsFn: (tokens) => {
          savedAccessToken = tokens.access_token;
          return Promise.resolve();
        },
        promptPasswordFn: () => {
          promptCalled = true;
          return Promise.resolve('prompt-secret');
        },
      },
    );

    assertEquals(capturedUsername, 'user@example.com');
    assertEquals(capturedPassword, 'env-secret');
    assertEquals(savedAccessToken, 'access-token');
    assertEquals(promptCalled, false);
  } finally {
    restoreEnv(originalEnv);
  }
});

Deno.test('executePasswordLogin - falls back to prompt password when env is missing', async () => {
  const originalEnv = { ...Deno.env.toObject() };

  try {
    Deno.env.delete('LOGIN_PASSWORD_MISSING');

    let capturedPassword = '';
    let promptMessage = '';
    let promptVisible = false;

    await executePasswordLogin(
      {},
      'user@example.com',
      new Logger('none'),
      {
        getContext: () => ({
          env: 'dev',
          profile: 'default',
          authConfig: {
            domain: 'https://issuer.example.com',
            clientId: 'client-id',
            redirectUri: 'http://localhost:7879/callback',
            scope: 'openid profile email',
            authorizationServerId: 'default',
            auth: {
              grantType: 'password',
              passwordEnvVar: 'LOGIN_PASSWORD_MISSING',
              passwordPromptVisible: true,
            },
          },
        }),
        createLoginService: () => ({
          login: ({ password }) => {
            capturedPassword = password;
            return Promise.resolve({
              access_token: 'access-token',
              id_token: 'id-token',
              token_type: 'Bearer',
              expires_in: 3600,
              scope: 'openid profile email',
            });
          },
        }),
        saveCredentialsFn: () => Promise.resolve(),
        promptPasswordFn: (message, visible) => {
          promptMessage = message;
          promptVisible = Boolean(visible);
          return Promise.resolve('prompt-secret');
        },
      },
    );

    assertEquals(promptMessage, 'Enter password: ');
    assertEquals(promptVisible, true);
    assertEquals(capturedPassword, 'prompt-secret');
  } finally {
    restoreEnv(originalEnv);
  }
});
