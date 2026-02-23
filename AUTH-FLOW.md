# Authentication Flow - Complete Guide

This document provides a comprehensive overview of all authentication methods and flows in the Gong MCP Server.

## Table of Contents

1. [Overview](#overview)
2. [Authentication Methods](#authentication-methods)
3. [MCP-Compliant OAuth Flow](#mcp-compliant-oauth-flow)
4. [Token Types](#token-types)
5. [Architecture Diagram](#architecture-diagram)
6. [Endpoint Reference](#endpoint-reference)
7. [Related Documentation](#related-documentation)

## Overview

The Gong MCP Server supports multiple authentication methods to accommodate different client types (Claude Desktop, Claude Code CLI, Claude Cowork) while maintaining enterprise-grade security.

**Key Security Features:**
- Email domain restriction (@sentry.io, @getsentry.com)
- MCP specification compliance (OAuth 2.1 + PKCE + RFC8707)
- HMAC-SHA256 signed tokens
- JWT with audience validation
- GCP Secret Manager integration

## Authentication Methods

### 1. OAuth Flow (Recommended for Cowork)

**Use Case**: Claude Cowork team connectors
**User Experience**: One-click "Connect" button
**Setup Guide**: [COWORK-OAUTH-SETUP.md](./COWORK-OAUTH-SETUP.md)

**Flow Summary:**
```
User clicks "Connect" in Cowork
  ↓
MCP client discovers authorization server
  ↓
Authorization endpoint with PKCE challenge
  ↓
Google OAuth authentication
  ↓
Token exchange with PKCE verification
  ↓
JWT access token with audience claim
```

### 2. Manual Token Flow

**Use Case**: Claude Desktop, Claude Code CLI
**User Experience**: Visit web page, copy token, paste into config
**Setup Guide**: [OAUTH-SETUP.md](./OAUTH-SETUP.md)

**Flow Summary:**
```
User visits /api/auth
  ↓
Click "Sign in with Google"
  ↓
Google OAuth authentication
  ↓
Receive long-lived API token
  ↓
Manually configure MCP client
```

## MCP-Compliant OAuth Flow

This server implements the [MCP Authorization Specification (2025-06-18)](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization) with full compliance for all MUST requirements.

### Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. MCP CLIENT DISCOVERY                                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│ Client makes unauthenticated request to MCP server                   │
│   POST /mcp                                                           │
│                                                                       │
│ Server returns 401 with WWW-Authenticate header:                     │
│   WWW-Authenticate: Bearer resource_metadata="https://.../.well-known/oauth-protected-resource"
│                                                                       │
│ Client fetches protected resource metadata:                          │
│   GET /.well-known/oauth-protected-resource                          │
│   Returns:                                                            │
│   {                                                                   │
│     "resource": "https://gong-mcp-server.sentry.dev/mcp",            │
│     "authorization_servers": ["https://gong-mcp-server.sentry.dev"]  │
│   }                                                                   │
│                                                                       │
│ Client fetches authorization server metadata:                        │
│   GET /.well-known/oauth-authorization-server                        │
│   Returns:                                                            │
│   {                                                                   │
│     "issuer": "https://gong-mcp-server.sentry.dev",                  │
│     "authorization_endpoint": ".../api/oauth/authorize",             │
│     "token_endpoint": ".../api/oauth/token",                         │
│     "code_challenge_methods_supported": ["S256"],                    │
│     "resource_parameter_supported": true                             │
│   }                                                                   │
└─────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 2. AUTHORIZATION REQUEST (with PKCE)                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│ Client generates PKCE parameters:                                    │
│   code_verifier = random_string(43-128 chars)                        │
│   code_challenge = BASE64URL(SHA256(code_verifier))                  │
│                                                                       │
│ Client redirects user to authorization endpoint:                     │
│   GET /api/oauth/authorize?                                          │
│     client_id=cowork-connector&                                      │
│     redirect_uri=https://cowork.example.com/callback&                │
│     response_type=code&                                              │
│     state=xyz&                                                        │
│     code_challenge=abc123...&                                        │
│     code_challenge_method=S256&                                      │
│     resource=https://gong-mcp-server.sentry.dev/mcp                  │
│                                                                       │
│ Server validates:                                                    │
│   ✓ client_id matches configured OAuth client                        │
│   ✓ response_type = "code"                                           │
│   ✓ code_challenge and code_challenge_method present                 │
│   ✓ code_challenge_method = "S256" (only method supported)           │
│   ✓ resource matches expected MCP server URI                         │
│                                                                       │
│ Server stores OAuth state (PKCE + resource) in encoded state param   │
│                                                                       │
│ Server redirects to Google OAuth:                                    │
│   https://accounts.google.com/o/oauth2/v2/auth                       │
└─────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 3. USER AUTHENTICATION (Google OAuth)                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│ User authenticates with Google (@sentry.io email)                    │
│                                                                       │
│ Google redirects to callback:                                        │
│   GET /api/oauth/callback?code=google_auth_code&state=encoded_state  │
│                                                                       │
│ Server exchanges Google code for user info                           │
│ Server validates email domain (@sentry.io or @getsentry.com)         │
│                                                                       │
│ Server generates authorization code:                                 │
│   Payload: {                                                         │
│     email: "user@sentry.io",                                         │
│     expiresAt: now + 10 minutes,                                     │
│     codeChallenge: "abc123...",  // From PKCE                        │
│     resource: "https://gong-mcp-server.sentry.dev/mcp"               │
│   }                                                                   │
│   Code: BASE64URL(payload) + "." + HMAC_SHA256(payload)              │
│                                                                       │
│ Server redirects back to client:                                     │
│   https://cowork.example.com/callback?code=auth_code&state=xyz       │
└─────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 4. TOKEN EXCHANGE (with PKCE verification)                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│ Client sends token request:                                          │
│   POST /api/oauth/token                                              │
│   Content-Type: application/x-www-form-urlencoded                    │
│   Body:                                                              │
│     grant_type=authorization_code                                    │
│     code=auth_code                                                   │
│     code_verifier=original_random_string  // PKCE verification       │
│     client_id=cowork-connector                                       │
│     client_secret=xxx                                                │
│     redirect_uri=https://cowork.example.com/callback                 │
│     resource=https://gong-mcp-server.sentry.dev/mcp                  │
│                                                                       │
│ Server validates:                                                    │
│   ✓ Authorization code signature                                     │
│   ✓ Authorization code not expired (10 minute window)                │
│   ✓ Client credentials (client_id + client_secret)                   │
│   ✓ PKCE: SHA256(code_verifier) == stored code_challenge             │
│   ✓ Resource parameter matches authorization request                 │
│                                                                       │
│ Server generates JWT access token:                                   │
│   {                                                                   │
│     "sub": "user@sentry.io",                                         │
│     "aud": "https://gong-mcp-server.sentry.dev/mcp",  // Audience    │
│     "iss": "https://gong-mcp-server.sentry.dev",                     │
│     "iat": 1708632000,                                               │
│     "exp": 1740168000  // 1 year                                     │
│   }                                                                   │
│   Signed with: HMAC-SHA256(TOKEN_SECRET)                             │
│                                                                       │
│ Server responds:                                                     │
│   {                                                                   │
│     "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",       │
│     "token_type": "Bearer",                                          │
│     "expires_in": 31536000  // 1 year in seconds                     │
│   }                                                                   │
└─────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────┐
│ 5. MCP REQUEST (with token validation)                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│ Client makes MCP request with token:                                 │
│   POST /mcp                                                           │
│   Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...      │
│   Body: { "jsonrpc": "2.0", "method": "tools/list", ... }            │
│                                                                       │
│ Server validates JWT:                                                │
│   ✓ Signature valid (HMAC-SHA256 with TOKEN_SECRET)                  │
│   ✓ Audience claim matches: "https://{host}/mcp"                     │
│   ✓ Not expired (exp > now)                                          │
│   ✓ Extracts email from "sub" claim                                  │
│                                                                       │
│ Server validates email domain:                                       │
│   ✓ Email domain in ALLOWED_EMAIL_DOMAINS                            │
│                                                                       │
│ Server processes MCP request and returns response                    │
│                                                                       │
│ If token invalid → 401 with WWW-Authenticate header                  │
└─────────────────────────────────────────────────────────────────────┘
```

### PKCE (Proof Key for Code Exchange)

PKCE protects against authorization code interception attacks. Required by OAuth 2.1 and MCP spec.

**Client-side (before authorization):**
```javascript
// 1. Generate random string (43-128 characters)
const code_verifier = base64url(randomBytes(32))
// Example: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"

// 2. Compute SHA-256 hash
const code_challenge = base64url(sha256(code_verifier))
// Example: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"

// 3. Send code_challenge in authorization request
// 4. Send code_verifier in token request (server verifies match)
```

**Server-side verification:**
```typescript
// Token endpoint verifies:
const computedChallenge = createHash('sha256')
  .update(code_verifier)
  .digest('base64url');

if (computedChallenge !== storedCodeChallenge) {
  return error('invalid_grant', 'PKCE verification failed');
}
```

### Resource Parameter (RFC 8707)

The resource parameter binds tokens to specific MCP servers, preventing confused deputy attacks.

**Authorization Request:**
```
resource=https://gong-mcp-server.sentry.dev/mcp
```

**Token Response:**
```json
{
  "aud": "https://gong-mcp-server.sentry.dev/mcp"
}
```

**Token Validation:**
```typescript
jwt.verify(token, TOKEN_SECRET, {
  audience: `https://${req.headers.host}/mcp`
});
```

This ensures tokens issued for one MCP server cannot be used on another.

## Token Types

### 1. OAuth JWT Token (MCP-Compliant)

**Format**: Standard JWT (JSON Web Token)
**Lifetime**: 1 year
**Claims**:
- `sub`: User email (subject)
- `aud`: MCP server resource URI (audience)
- `iss`: Authorization server URL (issuer)
- `iat`: Issued at timestamp
- `exp`: Expiration timestamp

**Example**:
```json
{
  "sub": "user@sentry.io",
  "aud": "https://gong-mcp-server.sentry.dev/mcp",
  "iss": "https://gong-mcp-server.sentry.dev",
  "iat": 1708632000,
  "exp": 1740168000
}
```

**Validation**:
- Verify HMAC-SHA256 signature with `TOKEN_SECRET`
- Verify `aud` claim matches expected resource
- Verify not expired
- Extract email from `sub` claim
- Verify email domain

**Generation**: api/oauth/token.ts:156

**Validation**: api/mcp.ts:66-76

### 2. Manual API Token (Custom Format)

**Format**: `base64url(email:timestamp).signature`
**Lifetime**: 1 year
**Used by**: `/api/auth` web flow

**Example**:
```
YWlkYW4ubGFuZGVuQHNlbnRyeS5pbzoxODAzMzE3Njg1MTU5.JF3yVamz7jfhQ8PKlcxIoFYLRXhmKTk2NUGXNXnpQFs
```

**Structure**:
```typescript
Payload: email:timestamp
Signature: HMAC-SHA256(payload, TOKEN_SECRET)
Token: base64url(payload) + "." + base64url(signature)
```

**Validation**: api/auth.ts (verifyApiToken function)

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         GONG MCP SERVER                          │
│                  (gong-mcp-server.sentry.dev)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ DISCOVERY ENDPOINTS (RFC 9728, RFC 8414)                 │    │
│  ├─────────────────────────────────────────────────────────┤    │
│  │                                                           │    │
│  │  GET /.well-known/oauth-protected-resource               │    │
│  │  └─> Returns: resource URI + authorization server list   │    │
│  │                                                           │    │
│  │  GET /.well-known/oauth-authorization-server             │    │
│  │  └─> Returns: OAuth capabilities, endpoints, PKCE info   │    │
│  │                                                           │    │
│  └─────────────────────────────────────────────────────────┘    │
│                           ↓                                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ AUTHORIZATION ENDPOINTS                                  │    │
│  ├─────────────────────────────────────────────────────────┤    │
│  │                                                           │    │
│  │  GET /api/oauth/authorize                                │    │
│  │  └─> Validates PKCE + resource → Redirects to Google     │    │
│  │                                                           │    │
│  │  GET /api/oauth/callback                                 │    │
│  │  └─> Validates email → Generates auth code               │    │
│  │                                                           │    │
│  │  POST /api/oauth/token                                   │    │
│  │  └─> Verifies PKCE + resource → Issues JWT               │    │
│  │                                                           │    │
│  └─────────────────────────────────────────────────────────┘    │
│                           ↓                                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ MCP SERVER ENDPOINT                                      │    │
│  ├─────────────────────────────────────────────────────────┤    │
│  │                                                           │    │
│  │  POST /mcp                                               │    │
│  │  └─> Validates token → Processes MCP request             │    │
│  │                                                           │    │
│  │  Token validation order:                                 │    │
│  │  1. Try JWT (OAuth flow) with audience validation        │    │
│  │  2. Try Manual API token (custom format)                 │    │
│  │                                                           │    │
│  │  Returns 401 with WWW-Authenticate header if invalid     │    │
│  │                                                           │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
        ┌──────────────────────────────────────┐
        │   EXTERNAL AUTHENTICATION PROVIDERS   │
        ├──────────────────────────────────────┤
        │                                        │
        │  ┌──────────────────────────────┐     │
        │  │ Google OAuth 2.0             │     │
        │  ├──────────────────────────────┤     │
        │  │ • User authentication        │     │
        │  │ • Email verification         │     │
        │  │ • Domain restriction         │     │
        │  └──────────────────────────────┘     │
        │                                        │
        │  ┌──────────────────────────────┐     │
        │  │ GCP Secret Manager           │     │
        │  ├──────────────────────────────┤     │
        │  │ • TOKEN_SECRET               │     │
        │  │ • GOOGLE_CLIENT_ID           │     │
        │  │ • GOOGLE_CLIENT_SECRET       │     │
        │  │ • COWORK_OAUTH_CLIENT_ID     │     │
        │  │ • COWORK_OAUTH_CLIENT_SECRET │     │
        │  │ • GONG_ACCESS_KEY            │     │
        │  │ • GONG_ACCESS_KEY_SECRET     │     │
        │  └──────────────────────────────┘     │
        │                                        │
        └──────────────────────────────────────┘
```

## Endpoint Reference

### Discovery Endpoints

| Endpoint | Method | Purpose | RFC |
|----------|--------|---------|-----|
| `/.well-known/oauth-protected-resource` | GET | Returns resource URI and authorization server locations | RFC 9728 |
| `/.well-known/oauth-authorization-server` | GET | Returns OAuth server metadata (endpoints, capabilities) | RFC 8414 |

### OAuth Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/oauth/authorize` | GET | Initiates OAuth flow, validates PKCE/resource parameters |
| `/api/oauth/callback` | GET | Handles Google OAuth callback, generates authorization code |
| `/api/oauth/token` | POST | Exchanges authorization code for JWT access token |

### Authentication Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth` | GET | Web UI for manual token generation |
| `/api/mcp` | POST | MCP server endpoint (validates tokens, processes requests) |

### Parameters Summary

**Authorization Request** (`/api/oauth/authorize`):
- `client_id` (required): OAuth client identifier
- `redirect_uri` (required): Where to send authorization code
- `response_type` (required): Must be "code"
- `state` (required): Client state for CSRF protection
- `code_challenge` (required): PKCE challenge (S256)
- `code_challenge_method` (required): Must be "S256"
- `resource` (required): MCP server resource URI

**Token Request** (`/api/oauth/token`):
- `grant_type` (required): Must be "authorization_code"
- `code` (required): Authorization code from callback
- `code_verifier` (required): PKCE verifier (proves challenge)
- `client_id` (required): OAuth client identifier
- `client_secret` (optional): OAuth client secret
- `redirect_uri` (required): Must match authorization request
- `resource` (required): Must match authorization request

## Related Documentation

- **[MCP-SPEC-COMPLIANCE.md](./MCP-SPEC-COMPLIANCE.md)** - Detailed MCP specification compliance documentation
- **[COWORK-OAUTH-SETUP.md](./COWORK-OAUTH-SETUP.md)** - Step-by-step guide for setting up OAuth in Cowork
- **[OAUTH-SETUP.md](./OAUTH-SETUP.md)** - Guide for manual token flow
- **[GCP-SECRETS-README.md](./GCP-SECRETS-README.md)** - GCP Secret Manager setup and usage

## Security Considerations

### Token Audience Binding

Per MCP spec security considerations, tokens MUST be bound to their intended audience to prevent confused deputy attacks:

✅ Include `resource` parameter in authorization/token requests
✅ Validate `aud` claim in JWT matches MCP server URI
✅ Reject tokens issued for other resources

### PKCE

Per OAuth 2.1 requirements, PKCE is mandatory for all authorization code flows:

✅ Code challenge required in authorization request (S256 only)
✅ Code verifier verified in token request
✅ Protects against authorization code interception

### Communication Security

✅ HTTPS enforced for all endpoints (Vercel automatic HTTPS)
✅ Tokens never in query strings (header-only)
✅ Short-lived auth codes (10 minutes)
✅ Long-lived access tokens (1 year)

### Secret Management

✅ Tokens signed with HMAC-SHA256
✅ Secrets managed via GCP Secret Manager
✅ No plaintext secrets in code or config
✅ Environment variable fallback for development

## Testing

See individual setup guides for testing procedures:
- OAuth Flow Testing: [COWORK-OAUTH-SETUP.md § Testing](./COWORK-OAUTH-SETUP.md#testing-the-oauth-flow)
- Manual Token Testing: [OAUTH-SETUP.md § Testing](./OAUTH-SETUP.md#testing-the-flow)
- Compliance Testing: [MCP-SPEC-COMPLIANCE.md § Testing](./MCP-SPEC-COMPLIANCE.md#testing-compliance)
