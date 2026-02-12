# Deploying Gong MCP Server to Vercel for Sentry Team

This guide walks you through deploying the Gong MCP server to Vercel with **Google Gmail authentication** restricted to Sentry team members.

## Overview

The deployed MCP server will:
- ✅ Be accessible via HTTPS at `https://your-project.vercel.app/mcp`
- ✅ Require Google authentication (users sign in with their @sentry.io Gmail)
- ✅ Only allow access to @sentry.io email addresses
- ✅ Work with Claude Desktop, Claude Code, and Cowork connectors

## Prerequisites

✅ Vercel account connected to this repository
✅ Gong API credentials (you already have these in `.env`)

## Step 1: Set Environment Variables in Vercel

Go to your Vercel project dashboard → **Settings** → **Environment Variables**

Add these variables for **Production**, **Preview**, and **Development**:

### Required Variables

| Variable | Value | Description |
|----------|-------|-------------|
| `GONG_ACCESS_KEY` | `G4DHR6CZX2QPI7PVN6GD63KPJQIRWL6Q` | Your Gong API access key |
| `GONG_ACCESS_KEY_SECRET` | `eyJhbGc...` | Your Gong API secret (from .env) |
| `ALLOWED_EMAIL_DOMAINS` | `sentry.io,getsentry.com` | Comma-separated allowed domains |

### Via Vercel Dashboard

1. Go to https://vercel.com/dashboard
2. Select your project (gong-mcp-server)
3. Click **Settings** → **Environment Variables**
4. For each variable:
   - Click **Add New**
   - Enter key name (e.g., `GONG_ACCESS_KEY`)
   - Enter value
   - Select environments: **Production**, **Preview**, **Development**
   - Click **Save**

### Via CLI (Alternative)

```bash
cd /Users/landenai/sentry-repos/gong-mcp-server

# Add for production
vercel env add GONG_ACCESS_KEY production
vercel env add GONG_ACCESS_KEY_SECRET production
vercel env add ALLOWED_EMAIL_DOMAINS production

# Add for preview
vercel env add GONG_ACCESS_KEY preview
vercel env add GONG_ACCESS_KEY_SECRET preview
vercel env add ALLOWED_EMAIL_DOMAINS preview

# Add for development
vercel env add GONG_ACCESS_KEY development
vercel env add GONG_ACCESS_KEY_SECRET development
vercel env add ALLOWED_EMAIL_DOMAINS development
```

## Step 2: Build the Project

```bash
cd /Users/landenai/sentry-repos/gong-mcp-server
npm run build
```

Verify that `dist/` contains compiled files.

## Step 3: Deploy to Production

```bash
npm run deploy:prod
```

This will deploy to your production URL (e.g., `https://gong-mcp-server.vercel.app`)

**Save this URL!** You'll need it for client configuration.

## Step 4: Test the Deployment

### Test Authentication (Should Fail)

```bash
curl -X POST https://your-project.vercel.app/mcp \
  -H "Content-Type: application/json" \
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

**Expected response:**
```json
{
  "error": "Unauthorized",
  "message": "Google ID token required in Authorization header..."
}
```

✅ This confirms authentication is working!

## How Authentication Works

### For Users (Sentry Team Members)

1. **User signs in with Google** using their @sentry.io email
2. **Client obtains ID token** from Google OAuth
3. **Client sends requests** with `Authorization: Bearer <id_token>` header
4. **Server verifies token** with Google's tokeninfo endpoint
5. **Server checks email domain** against `ALLOWED_EMAIL_DOMAINS`
6. **Access granted** if email ends with `@sentry.io` or `@getsentry.com`

### Technical Flow

```
User (landen@sentry.io)
  │
  │ 1. Sign in with Google
  ▼
Google OAuth
  │
  │ 2. Returns ID token
  ▼
MCP Client (Claude Desktop/Code/Cowork)
  │
  │ 3. Sends request with:
  │    Authorization: Bearer <id_token>
  ▼
Vercel MCP Server
  │
  │ 4. Verifies token with Google
  │ 5. Checks: landen@sentry.io ends with @sentry.io? ✅
  │ 6. Allows access
  ▼
Gong API
```

## Client Configuration

### Option 1: Claude Desktop (with Google auth helper)

Users will need a small auth helper script that:
1. Gets Google ID token
2. Passes it to the MCP server

Create `~/.config/claude/mcp-auth-helper.sh`:

```bash
#!/bin/bash
# Get Google ID token (this is a placeholder - actual implementation TBD)
# In practice, users would run `gcloud auth print-identity-token`
# or use a browser-based OAuth flow

# For now, users can get token from: https://developers.google.com/oauthplayground
ID_TOKEN="<paste_token_here>"

# Call MCP server with auth
curl -X POST https://gong-mcp-server.vercel.app/mcp \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$1"
```

### Option 2: Claude Code CLI

```bash
claude mcp add gong-http https://gong-mcp-server.vercel.app/mcp \
  --header "Authorization: Bearer $(gcloud auth print-identity-token)"
```

**Note:** This requires `gcloud` CLI installed and authenticated.

### Option 3: Cowork Connector

In Cowork settings, configure:
- **URL**: `https://gong-mcp-server.vercel.app/mcp`
- **Auth**: Google OAuth (users sign in with Google)
- **Allowed Domains**: `sentry.io, getsentry.com`

## Adding More Email Domains

To allow additional domains (e.g., contractor emails):

1. Go to Vercel Dashboard → Settings → Environment Variables
2. Edit `ALLOWED_EMAIL_DOMAINS`
3. Add domains: `sentry.io,getsentry.com,contractor-company.com`
4. Save

Changes take effect on next deployment or within minutes.

## Security Considerations

### Why Google OAuth?

- ✅ **No shared secrets** - Each user authenticates individually
- ✅ **Email verification** - Google verifies email ownership
- ✅ **Domain restriction** - Only @sentry.io/@getsentry.com allowed
- ✅ **Audit trail** - Logs show which user accessed what
- ✅ **Easy revocation** - Remove user from Google Workspace to revoke access

### Token Expiration

- Google ID tokens expire after **1 hour**
- Clients must refresh tokens periodically
- MCP clients handle this automatically

### Logging

The server logs:
- ✅ Successful authentications: `Authenticated user: landen@sentry.io`
- ❌ Failed auth attempts: `Access denied for email domain: gmail.com`

View logs in Vercel Dashboard → Deployments → Functions → Logs

## Troubleshooting

### "Invalid or expired Google ID token"

**Solution**: Token expired. Get a new one:
```bash
gcloud auth print-identity-token
```

### "Access restricted to sentry.io email addresses"

**Solution**: User is not signed in with @sentry.io email. They must use their Sentry Gmail account.

### "Missing GONG_ACCESS_KEY or GONG_ACCESS_KEY_SECRET"

**Solution**: Environment variables not set in Vercel. Go to Settings → Environment Variables and add them.

## Monitoring

### View Deployment Status

```bash
vercel ls
```

### View Logs

```bash
vercel logs https://your-deployment-url.vercel.app
```

### Metrics

Monitor in Vercel Dashboard:
- Request count
- Error rate
- Response time
- Authentication success/failure rate

## Next Steps

1. ✅ Share deployment URL with Sentry team
2. ✅ Provide authentication instructions
3. ✅ Test with real users
4. ✅ Monitor logs for issues
5. ✅ Set up alerts for errors

## Getting a Google ID Token (For Testing)

### Method 1: gcloud CLI

```bash
gcloud auth login
gcloud auth print-identity-token
```

### Method 2: Google OAuth Playground

1. Go to https://developers.google.com/oauthplayground
2. Click **OAuth 2.0 Configuration** (gear icon)
3. Check "Use your own OAuth credentials" (or use default)
4. In left panel, select **Google OAuth2 API v2**
5. Select `https://www.googleapis.com/auth/userinfo.email`
6. Click **Authorize APIs**
7. Sign in with your @sentry.io email
8. Click **Exchange authorization code for tokens**
9. Copy the `id_token` value

### Method 3: Browser Extension (Future)

A browser extension could automate this for users, making it seamless.

## Support

Questions? Check:
- Vercel logs for errors
- This deployment guide
- Contact DevOps team
