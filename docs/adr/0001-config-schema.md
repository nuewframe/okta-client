# ADR: Standardized CLI Security Configuration Schema

## Status

Accepted

## Context

Our CLI acts as an authentication client that abstracts the complexity of OAuth 2.0 and OIDC flows, securely obtaining JSON Web Tokens (JWTs) for use by other downstream CLI tools.

We require a configuration schema that:

1. Supports multiple environments (e.g., `dev`, `prod`) and multiple profiles per environment.
2. Supports default environment and profile selections.
3. Follows a flat, meaningful hierarchy using dot-notation property paths to avoid redundant object wrappers.
4. Cleanly separates the Identity Provider (IdP) server details from the specific client application's registration details, aligning with industry practices.
5. Is extensible for future authentication types (e.g., SAML).

## Decision

We will adopt a flattened, dot-notation configuration schema where properties are contextually grouped under `security.auth.[env].[profile]`. The schema defines properties using metadata attributes such as **Name**, **Type**, **Description**, and **Default Value**.

### 1. Configuration Example (JSON)

```json
{
  "security": {
    "env": "dev",
    "profile": "developer-read-write",
    "auth": {
      "dev": {
        "developer-read-write": {
          "type": "oauth2",
          "provider": {
            "issuer_uri": "https://dev-auth.yourdomain.com/oauth2/default",
            "discovery_url": "/.well-known/openid-configuration"
          },
          "client": {
            "client_id": "0oa1abc2def3ghi4jkl5",
            "client_secret": "",
            "client_authentication_method": "none",
            "grant_type": "authorization_code",
            "redirect_uri": "http://localhost:8080/callback",
            "scope": "openid profile email offline_access"
          },
          "options": {
            "pkce": true,
            "acquire_automatically": true,
            "custom_request_parameters": {
              "audience": "api://dev-default"
            }
          }
        }
      }
    }
  }
}
```

### 2. Property Specification

The following specification details the exact data types and purposes for each property in the schema.

#### Global Security Selection

| Name               | Type     | Default Value | Description                                                |
| :----------------- | :------- | :------------ | :--------------------------------------------------------- |
| `security.env`     | `String` | _None_        | The selected active environment (e.g., `dev`, `prod`).     |
| `security.profile` | `String` | _None_        | The selected active profile within the chosen environment. |

#### Auth Block: `security.auth.[env].[profile]`

This block contains the authentication configuration dynamically resolved based on the selected `env` and `profile`.

| Name   | Type     | Default Value | Description                                                                                                      |
| :----- | :------- | :------------ | :--------------------------------------------------------------------------------------------------------------- |
| `type` | `String` | `"oauth2"`    | The authentication strategy type. Currently supports `oauth2`, but acts as a discriminator for future protocols. |

#### Provider Properties: `security.auth.[env].[profile].provider`

Details regarding the authorization server endpoints.

| Name                | Type     | Default Value                       | Description                                                                                                                              |
| :------------------ | :------- | :---------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------- |
| `issuer_uri`        | `String` | _None_                              | The issuer URI for the authorization server. When explicit endpoints are omitted, the CLI derives discovery metadata from this value.    |
| `discovery_url`     | `String` | `/.well-known/openid-configuration` | Optional OIDC discovery endpoint. Supports either an absolute URL or a relative path resolved against `issuer_uri`.                      |
| `authorization_url` | `String` | _None_                              | Optional authorization endpoint override. When omitted, the CLI reads `authorization_endpoint` from the discovery document.              |
| `token_url`         | `String` | _None_                              | Optional token endpoint override. When omitted, the CLI reads `token_endpoint` from the discovery document.                              |
| `device_auth_url`   | `String` | _None_                              | Optional device authorization endpoint override. When omitted, the CLI uses `device_authorization_endpoint` from discovery when present. |

If `discovery_url` is not provided, the CLI uses `issuer_uri + '/.well-known/openid-configuration'`.

#### Client Properties: `security.auth.[env].[profile].client`

Credentials and flow configurations specific to the registered client application.

| Name                           | Type     | Default Value          | Description                                                                                                                |
| :----------------------------- | :------- | :--------------------- | :------------------------------------------------------------------------------------------------------------------------- |
| `client_id`                    | `String` | _None_                 | The public identifier of your client registered with the API provider. Required for all grant types.                       |
| `client_secret`                | `String` | `""`                   | The confidential identifier used by a client application to authenticate to the authorization server.                      |
| `client_authentication_method` | `String` | `"basic"`              | Dictates how client credentials are sent. Valid values include `none` (for public CLIs), `in body`, or `basic`.            |
| `grant_type`                   | `String` | `"authorization_code"` | The method used to get access tokens. Typical values include `authorization_code`, `client_credentials`, or `device_code`. |
| `redirect_uri`                 | `String` | _None_                 | The client application callback URL to which the request should be redirected after successful authentication.             |
| `scope`                        | `String` | _None_                 | A space-delimited string of scopes to limit the application's access to the user's account.                                |

#### Options Properties: `security.auth.[env].[profile].options`

Security enhancements, overrides, and tool-specific developer experience flags.

| Name                        | Type      | Default Value | Description                                                                                                                             |
| :-------------------------- | :-------- | :------------ | :-------------------------------------------------------------------------------------------------------------------------------------- |
| `pkce`                      | `Boolean` | `false`       | Enables Proof Key for Code Exchange (PKCE) security to mitigate interception. Standard practice for Authorization Code grants.          |
| `acquire_automatically`     | `Boolean` | `true`        | Dictates if the CLI should automatically refresh or acquire an access token before executing requests.                                  |
| `custom_request_parameters` | `Object`  | `{}`          | A key-value map to define custom request parameters that the authorization server may require (e.g., Okta/Auth0 `audience` parameters). |

## Consequences

- **Positive:** Developers can easily override specific nested fields via CLI flags using standard dot-notation (e.g., `--security.env=prod`).
- **Positive:** Adding support for other protocols like SAML or extending to a mock environment for testing (`"type": "mock"`) will not break the existing OAuth 2.0 configuration structure.
- **Negative:** Users must ensure they don't misconfigure the `env` and `profile` names, as a mismatch between `security.env` and the keys in `security.auth` will result in a failure to resolve the active profile.
