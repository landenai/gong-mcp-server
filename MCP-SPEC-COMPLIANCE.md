# MCP Specification Compliance

This document describes how the Gong MCP Server's OAuth implementation complies with the Model Context Protocol (MCP) authorization specification.

**Specification Reference**: [MCP Authorization Specification 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)

## Overview

The MCP specification defines how MCP clients should authenticate with MCP servers using OAuth 2.1 with additional security requirements. Our implementation provides full compliance with:

- **RFC 8414**: OAuth 2.0 Authorization Server Metadata
- **RFC 8707**: Resource Indicators for OAuth 2.0
- **RFC 9728**: OAuth 2.0 Protected Resource Metadata
- **OAuth 2.1**: Including PKCE requirements

## Compliance Checklist

### ✅ Authorization Server Discovery (RFC 9728)

**Requirement**: MCP servers MUST implement OAuth 2.0 Protected Resource Metadata to indicate authorization server locations.

**Implementation**:
- Endpoint: `GET /.well-known/oauth-protected-resource`
- Returns: `authorization_servers` array with authorization server URL
- Location: `api/.well-known/oauth-protected-resource.ts`

**Example Response**:
```json
{
  "resource": "https://gong-mcp-server.sentry.dev/mcp",
  "authorization_servers": ["https://gong-mcp-server.sentry.dev"]
}
```

### ✅ WWW-Authenticate Header (RFC 9728)

**Requirement**: MCP servers MUST use `WWW-Authenticate` header when returning 401 to indicate resource metadata URL.

**Implementation**:
- Returns `WWW-Authenticate: Bearer resource_metadata="..."` header on 401 responses
- Location: `api/mcp.ts` lines ~45-50

**Example**:
```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer resource_metadata="https://gong-mcp-server.sentry.dev/.well-known/oauth-protected-resource"
```

### ✅ Authorization Server Metadata (RFC 8414)

**Requirement**: Authorization servers MUST provide OAuth 2.0 Authorization Server Metadata.

**Implementation**:
- Endpoint: `GET /.well-known/oauth-authorization-server`
- Describes endpoints, supported grant types, PKCE methods
- Location: `api/.well-known/oauth-authorization-server.ts`

**Example Response**:
```json
{
  "issuer": "https://gong-mcp-server.sentry.dev",
  "authorization_endpoint": "https://gong-mcp-server.sentry.dev/api/oauth/authorize",
  "token_endpoint": "https://gong-mcp-server.sentry.dev/api/oauth/token",
  "grant_types_supported": ["authorization_code"],
  "response_types_supported": ["code"],
  "code_challenge_methods_supported": ["S256"],
  "resource_parameter_supported": true
}
```

### ✅ PKCE (OAuth 2.1 Requirement)

**Requirement**: MCP clients MUST implement PKCE for authorization code protection.

**Implementation**:
- Authorization endpoint requires `code_challenge` and `code_challenge_method=S256`
- Token endpoint verifies `code_verifier` matches stored `code_challenge`
- Uses SHA-256 hashing per S256 spec
- Location: `api/oauth/authorize.ts`, `api/oauth/token.ts`

**Flow**:
```
1. Client generates code_verifier (random string)
2. Client computes code_challenge = BASE64URL(SHA256(code_verifier))
3. Client sends code_challenge in authorization request
4. Server stores code_challenge with auth code
5. Client sends code_verifier in token request
6. Server verifies SHA256(code_verifier) == stored code_challenge
```

### ✅ Resource Parameter (RFC 8707)

**Requirement**: MCP clients MUST include `resource` parameter in authorization and token requests.

**Implementation**:
- Authorization endpoint requires and validates `resource` parameter
- Token endpoint verifies `resource` matches stored value from authorization
- Resource URI format: `https://gong-mcp-server.sentry.dev/mcp`
- Location: `api/oauth/authorize.ts` lines ~50-60, `api/oauth/token.ts` lines ~125-135

**Purpose**: Binds tokens to specific MCP server, preventing token reuse across services.

**Validation**:
```typescript
const expectedResource = `https://${req.headers.host}/mcp`;
if (resource !== expectedResource) {
  return error('invalid_target');
}
```

### ✅ Access Token with Audience Claim

**Requirement**: MCP servers MUST validate tokens were issued specifically for them (audience validation).

**Implementation**:
- Generate JWT tokens with `aud` claim set to MCP server resource URI
- MCP server verifies `aud` claim matches expected resource
- Prevents confused deputy attacks
- Location: `api/oauth/token.ts` (generateJWT), `api/mcp.ts` (verification)

**Token Structure**:
```json
{
  "sub": "user@sentry.io",
  "aud": "https://gong-mcp-server.sentry.dev/mcp",
  "iss": "https://gong-mcp-server.sentry.dev",
  "iat": 1708632000,
  "exp": 1740168000
}
```

**Verification**:
```typescript
jwt.verify(token, TOKEN_SECRET, {
  algorithms: ['HS256'],
  audience: `https://${req.headers.host}/mcp`
});
```

### ✅ Authorization Bearer Token Header

**Requirement**: Access tokens MUST be sent via `Authorization: Bearer <token>` header.

**Implementation**:
- MCP endpoint requires `Authorization: Bearer <token>` header
- Tokens must NOT appear in query string
- Location: `api/mcp.ts` lines ~37-43

### ✅ Token Validation

**Requirement**: MCP servers MUST validate access tokens and reject invalid/expired tokens with HTTP 401.

**Implementation**:
- Validates JWT signature using shared secret
- Validates audience claim matches this MCP server
- Validates expiration time
- Returns 401 with `WWW-Authenticate` header if invalid
- Location: `api/mcp.ts` lines ~60-80

## Security Considerations

### Token Audience Binding (Confused Deputy Prevention)

Per MCP spec security considerations, tokens MUST be bound to their intended audience:

✅ **We include `resource` parameter** in authorization/token requests
✅ **We validate `aud` claim** in JWT matches our MCP server URI
✅ **We reject tokens** issued for other resources

This prevents attackers from reusing legitimate tokens across different services.

### PKCE (Authorization Code Protection)

Per OAuth 2.1 and MCP requirements:

✅ **Code challenge required** in authorization request (S256 only)
✅ **Code verifier verified** in token request
✅ **Protects against** authorization code interception attacks

### Communication Security

Per MCP spec requirements:

✅ **HTTPS enforced** for all endpoints (Vercel automatic HTTPS)
✅ **Tokens never in query strings** (header-only)
✅ **Short-lived auth codes** (10 minutes)
✅ **Long-lived access tokens** (1 year, can be shortened)

### Token Storage

Per OAuth 2.1 security considerations:

✅ **Tokens signed** with HMAC-SHA256
✅ **Secrets managed** via GCP Secret Manager
✅ **No plaintext storage** of secrets in code/config

## Backward Compatibility

The implementation maintains backward compatibility with manual API tokens:

1. **Manual API tokens** from `/api/auth` (custom format) still work
2. **New JWT tokens** used for MCP-compliant OAuth flow

The MCP endpoint tries JWT verification first, then falls back to manual API tokens.

## Testing Compliance

### Test Authorization Server Discovery

```bash
# Get protected resource metadata
curl https://gong-mcp-server.sentry.dev/.well-known/oauth-protected-resource

# Get authorization server metadata
curl https://gong-mcp-server.sentry.dev/.well-known/oauth-authorization-server
```

### Test 401 with WWW-Authenticate Header

```bash
curl -i -X POST https://gong-mcp-server.sentry.dev/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

# Should return:
# HTTP/1.1 401 Unauthorized
# WWW-Authenticate: Bearer resource_metadata="..."
```

### Test PKCE Flow

```python
import hashlib
import base64
import secrets

# Generate code verifier
code_verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b'=').decode()

# Compute code challenge
code_challenge = base64.urlsafe_b64encode(
    hashlib.sha256(code_verifier.encode()).digest()
).rstrip(b'=').decode()

# Use code_challenge in authorization request
# Use code_verifier in token request
```

### Test Resource Parameter

```bash
# Authorization request must include resource parameter
GET /api/oauth/authorize?
  client_id=cowork-connector&
  redirect_uri=https://cowork.example.com/callback&
  response_type=code&
  state=xyz&
  code_challenge=abc123&
  code_challenge_method=S256&
  resource=https://gong-mcp-server.sentry.dev/mcp  # REQUIRED

# Token request must include matching resource
POST /api/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&
code=...&
code_verifier=...&
resource=https://gong-mcp-server.sentry.dev/mcp  # MUST MATCH
```

### Test JWT Audience Validation

```bash
# Token with correct audience: succeeds
# Token with wrong audience: 401 Unauthorized
# Token without audience: 401 Unauthorized
```

## Non-Implemented Optional Features

The following MCP spec features are optional and not currently implemented:

❌ **Dynamic Client Registration (RFC7591)** - Currently use static client ID/secret
❌ **Token Refresh** - Access tokens are long-lived (1 year) instead of using refresh tokens
❌ **Multiple Authorization Servers** - Single authorization server

These can be added if needed for future use cases.

## References

- [MCP Authorization Specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)
- [OAuth 2.1 Draft](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-13)
- [RFC 8414 - Authorization Server Metadata](https://datatracker.ietf.org/doc/html/rfc8414)
- [RFC 8707 - Resource Indicators](https://www.rfc-editor.org/rfc/rfc8707.html)
- [RFC 9728 - Protected Resource Metadata](https://datatracker.ietf.org/doc/html/rfc9728)
