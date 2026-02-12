# Google OAuth Setup Guide

This guide walks you through setting up Google OAuth for the improved authentication flow.

## Overview

Instead of manually getting Google ID tokens, users now:
1. Visit `https://gong-mcp-server.sentry.dev/api/auth`
2. Click "Sign in with Google"
3. Authenticate with their `@sentry.io` email
4. Receive a **long-lived API token** (valid for 1 year)
5. Configure their MCP client once with that token

## Setup Steps

### 1. Create Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (or create a new one for "Gong MCP Server")
3. Enable **Google+ API**:
   - Navigate to **APIs & Services** → **Library**
   - Search for "Google+ API"
   - Click **Enable**

4. Create OAuth 2.0 credentials:
   - Navigate to **APIs & Services** → **Credentials**
   - Click **Create Credentials** → **OAuth client ID**
   - Application type: **Web application**
   - Name: `Gong MCP Server`
   - **Authorized redirect URIs**:
     - Add: `https://gong-mcp-server.sentry.dev/api/auth`
     - (For local testing, also add: `http://localhost:3000/api/auth`)
   - Click **Create**

5. Copy the **Client ID** and **Client Secret**

### 2. Set Environment Variables in Vercel

Go to: https://vercel.com/sentry/gong-mcp-server/settings/environment-variables

Add these new variables for **Production**, **Preview**, and **Development**:

| Variable | Value | Description |
|----------|-------|-------------|
| `GOOGLE_CLIENT_ID` | `your-client-id.apps.googleusercontent.com` | From step 1 |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-...` | From step 1 |
| `TOKEN_SECRET` | Generate with `openssl rand -base64 32` | For signing API tokens |

The existing variables should already be set:
- `GONG_ACCESS_KEY`
- `GONG_ACCESS_KEY_SECRET`
- `ALLOWED_EMAIL_DOMAINS`

### 3. Deploy

The auth flow will be available at the `/api/auth` endpoint automatically after deployment.

## Testing the Flow

### 1. Visit the Auth Page

Open: https://gong-mcp-server.sentry.dev/api/auth

### 2. Sign In

- Click "Sign in with Google"
- Choose your `@sentry.io` Google account
- Grant permissions

### 3. Get Your Token

You'll be redirected to a success page showing your API token.

### 4. Test the Token

```bash
curl -X POST https://gong-mcp-server.sentry.dev/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "clientInfo": {"name": "test", "version": "1.0.0"},
      "capabilities": {}
    }
  }'
```

Should return server info (not an auth error).

## User Instructions

Share this with Sentry team members:

---

### How to Get Your Gong MCP Token

1. **Visit**: https://gong-mcp-server.sentry.dev/api/auth
2. **Sign in** with your `@sentry.io` Google account
3. **Copy the API token** shown on the success page
4. **Configure your MCP client** with this token

#### For Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "gong": {
      "url": "https://gong-mcp-server.sentry.dev/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN_HERE"
      }
    }
  }
}
```

#### For Claude Code CLI

```bash
claude mcp add gong-http https://gong-mcp-server.sentry.dev/mcp \
  --header "Authorization: Bearer YOUR_TOKEN_HERE"
```

#### For Cowork

In Cowork settings:
- **URL**: `https://gong-mcp-server.sentry.dev/mcp`
- **Authentication**: Custom Header
- **Header Name**: `Authorization`
- **Header Value**: `Bearer YOUR_TOKEN_HERE`

---

## Security Features

✅ **Email Domain Restriction**: Only `@sentry.io` and `@getsentry.com` allowed
✅ **Token Expiration**: Tokens expire after 1 year
✅ **Signed Tokens**: Tokens are cryptographically signed (HMAC-SHA256)
✅ **No Passwords**: Uses Google OAuth (no password storage)
✅ **Audit Trail**: All authentication attempts are logged

## Troubleshooting

### "Redirect URI mismatch" error

**Solution**: Add the exact redirect URI to your Google OAuth credentials:
- `https://gong-mcp-server.sentry.dev/api/auth`

### "Access restricted" error

**Solution**: User must sign in with `@sentry.io` or `@getsentry.com` email.

### "Invalid token" error in MCP requests

**Solution**: Token may be expired (1 year validity). Get a new token at `/api/auth`.

## Token Management

### Revoking Access

To revoke a user's access:
1. They can't get new tokens (if removed from Google Workspace)
2. Existing tokens expire after 1 year
3. To immediately revoke: Rotate `TOKEN_SECRET` in Vercel (invalidates all tokens)

### Rotating TOKEN_SECRET

If you need to invalidate all tokens:

```bash
# Generate new secret
openssl rand -base64 32

# Update in Vercel
vercel env add TOKEN_SECRET production
# Paste the new secret

# All users will need to get new tokens at /api/auth
```

## Local Development

For local testing with `vercel dev`:

1. Add to `.env`:
```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
TOKEN_SECRET=your-secret-here
ALLOWED_EMAIL_DOMAINS=sentry.io,getsentry.com
```

2. Add redirect URI to Google OAuth:
```
http://localhost:3000/api/auth
```

3. Run:
```bash
vercel dev
```

4. Visit: `http://localhost:3000/api/auth`
