import type {
  OAuthExecutionOverrides,
  ResolvedScopedValue,
  ScopedUse,
} from '../config/app.config.ts';

interface OAuthMetadataCliOptions {
  param?: string;
  paramAuth?: string;
  paramToken?: string;
  header?: string;
  headerAuth?: string;
  headerToken?: string;
}

function parseKeyValueList(input?: string): Array<[string, string]> {
  if (!input) {
    return [];
  }

  const pairs = input
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  return pairs.map((pair) => {
    const idx = pair.indexOf('=');
    if (idx <= 0 || idx === pair.length - 1) {
      throw new Error(`Configuration error: invalid key=value pair '${pair}'.`);
    }

    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (!key || !value) {
      throw new Error(`Configuration error: invalid key=value pair '${pair}'.`);
    }

    return [key, value];
  });
}

function mergeScopedPairs(
  target: Record<string, ResolvedScopedValue>,
  pairs: Array<[string, string]>,
  use: ScopedUse,
): void {
  for (const [key, value] of pairs) {
    target[key] = { values: [value], use };
  }
}

function buildScopedMap(
  everywhere?: string,
  authOnly?: string,
  tokenOnly?: string,
): Record<string, ResolvedScopedValue> | undefined {
  const result: Record<string, ResolvedScopedValue> = {};

  mergeScopedPairs(result, parseKeyValueList(everywhere), 'everywhere');
  mergeScopedPairs(result, parseKeyValueList(authOnly), 'in_auth_request');
  mergeScopedPairs(result, parseKeyValueList(tokenOnly), 'in_token_request');

  return Object.keys(result).length ? result : undefined;
}

export function buildOAuthMetadataOverrides(
  options: OAuthMetadataCliOptions,
): Pick<OAuthExecutionOverrides, 'customRequestParameters' | 'customRequestHeaders'> {
  return {
    customRequestParameters: buildScopedMap(options.param, options.paramAuth, options.paramToken),
    customRequestHeaders: buildScopedMap(options.header, options.headerAuth, options.headerToken),
  };
}
