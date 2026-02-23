# Cowork OAuth Integration Setup

This guide explains how to configure the Gong MCP Server as a custom connector in Claude Cowork using OAuth authentication.

## Overview

Instead of users manually copying API tokens, OAuth provides a seamless authentication flow:

1. **Org owner** configures the connector once in Cowork with OAuth credentials
2. **Team members** simply click "Connect" in Cowork
3. They're redirected to Google OAuth to authenticate
4. Cowork automatically receives and stores their access token
5. No manual token copying required!

## Architecture

### OAuth Endpoints

- **Authorization**: `https://gong-mcp-server.sentry.dev/api/oauth/authorize`
- **Token Exchange**: `https://gong-mcp-server.sentry.dev/api/oauth/token`

### Flow

```
User clicks "Connect" in Cowork
    ↓
Cowork → /api/oauth/authorize (with client_id, redirect_uri, state)
    ↓
Redirects to Google OAuth
    ↓
User authenticates with @sentry.io email
    ↓
Google → /api/oauth/callback
    ↓
Verify email domain → Generate auth code
    ↓
Redirect back to Cowork with auth code
    ↓
Cowork → /api/oauth/token (exchange code for access token)
    ↓
Returns long-lived Bearer token (1 year validity)
    ↓
Cowork stores token and uses it for all MCP requests
```

## Setup Instructions

### 1. Add OAuth Client Credentials to GCP Secret Manager (One-Time)

You need to define OAuth credentials that Cowork will use.

**Option A: Use the setup script (Recommended)**

The automated setup script will prompt you for OAuth credentials:

```bash
cd ~/sentry-repos/gong-mcp-server
./setup-gcp-secrets.sh
```

**Option B: Manual setup**

```bash
# Set a client ID (can be any string, but use something identifiable)
echo -n "cowork-connector" | gcloud secrets create COWORK_OAUTH_CLIENT_ID --data-file=-

# Generate and set a client secret
openssl rand -base64 32 | gcloud secrets create COWORK_OAUTH_CLIENT_SECRET --data-file=-
```

**Important**: Save the client secret! You'll need to provide it to Cowork.

To retrieve the client secret later:
```bash
gcloud secrets versions access latest --secret="COWORK_OAUTH_CLIENT_SECRET"
```

> **Note**: All secrets are stored in GCP Secret Manager, not Vercel environment variables. See [GCP-SECRETS-README.md](./GCP-SECRETS-README.md) for details.

### 2. Update Google Cloud Console (One-Time)

Add the OAuth callback URL to your Google OAuth credentials:

1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Click on your OAuth 2.0 Client ID
3. Under "Authorized redirect URIs", add:
   ```
   https://gong-mcp-server.sentry.dev/api/oauth/callback
   ```
4. Click **Save**

### 3. Deploy to Production

```bash
npm run build
vercel --prod
```

### 4. Configure in Cowork (Org Owner Only)

**For Team/Enterprise Claude Plans:**

1. Open Claude Desktop
2. Navigate to **Organization settings** → **Connectors**
3. Click **"Add custom connector"**
4. Fill in the fields:

   **Connector Name**: `Gong`

   **Server URL**: `https://gong-mcp-server.sentry.dev/mcp`

   **Advanced Settings** (click to expand):
   - **OAuth Authorization URL**: `https://gong-mcp-server.sentry.dev/api/oauth/authorize`
   - **OAuth Token URL**: `https://gong-mcp-server.sentry.dev/api/oauth/token`
   - **OAuth Client ID**: `cowork-connector`
   - **OAuth Client Secret**: (paste the secret from step 1)

5. Click **"Add"**

### 5. Team Members Connect (Self-Service)

Each team member:

1. Open Cowork
2. Navigate to **Settings** → **Connectors**
3. Find "Gong" connector (will have "Custom" label)
4. Click **"Connect"**
5. Browser opens → Sign in with Google (@sentry.io email)
6. Redirected back to Cowork → Connection established!

**No manual token copying needed!**

## Testing the OAuth Flow

### Test Authorization Endpoint

```bash
# This should redirect to Google OAuth
curl -i "https://gong-mcp-server.sentry.dev/api/oauth/authorize?client_id=cowork-connector&redirect_uri=http://localhost:3000/callback&state=test123&response_type=code"
```

You should see a `302 Redirect` to `accounts.google.com`.

### Test Full Flow (Manual)

1. Visit in browser:
   ```
   https://gong-mcp-server.sentry.dev/api/oauth/authorize?client_id=cowork-connector&redirect_uri=http://localhost:3000/callback&state=test123&response_type=code
   ```

2. Sign in with Google (@sentry.io email)

3. You'll be redirected to `http://localhost:3000/callback?code=...&state=test123`

4. Copy the `code` parameter value

5. Exchange code for token:
   ```bash
   curl -X POST https://gong-mcp-server.sentry.dev/api/oauth/token \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "grant_type=authorization_code&code=YOUR_CODE_HERE&client_id=cowork-connector&client_secret=YOUR_SECRET_HERE&redirect_uri=http://localhost:3000/callback"
   ```

6. You should receive:
   ```json
   {
     "access_token": "...",
     "token_type": "Bearer",
     "expires_in": 31536000
   }
   ```

## Security Features

✅ **Email Domain Restriction**: Only `@sentry.io` and `@getsentry.com` allowed
✅ **Short-Lived Auth Codes**: 10-minute expiration, single-use
✅ **Long-Lived Access Tokens**: 1-year validity (same as manual flow)
✅ **Signed Tokens**: HMAC-SHA256 cryptographic signatures
✅ **Client Authentication**: OAuth client secret verification

## Troubleshooting

### "unauthorized_client" error

**Cause**: Client ID mismatch

**Solution**: Verify `COWORK_OAUTH_CLIENT_ID` in Vercel matches the client ID you entered in Cowork settings.

### "invalid_grant" error

**Cause**: Authorization code expired or already used

**Solution**: Authorization codes are single-use and expire after 10 minutes. Restart the flow.

### "Redirect URI mismatch" (Google)

**Cause**: Google redirect URI not authorized

**Solution**: Ensure `https://gong-mcp-server.sentry.dev/api/oauth/callback` is added to your Google OAuth client's authorized redirect URIs.

### "Access Denied" after Google auth

**Cause**: User email not `@sentry.io` or `@getsentry.com`

**Solution**: Only Sentry team members can authenticate. User must use their Sentry Google account.

## Comparison: OAuth vs Manual Token

| Feature | Manual Token | OAuth (This Setup) |
|---------|-------------|-------------------|
| Org admin setup | None | Configure once in Cowork |
| User experience | Visit web page → copy token → paste into Cowork | Click "Connect" → Done |
| Token management | User manages their own token | Cowork manages token automatically |
| Token refresh | User must get new token manually | Could implement refresh tokens |
| User friction | High (copy/paste, 3 fields) | Low (one click) |
| Best for | Technical users | Non-technical sales team ✅ |

## Future Enhancements

- **Token Refresh**: Implement `refresh_token` grant type for automatic renewal
- **Token Revocation**: Add `/api/oauth/revoke` endpoint
- **Multiple OAuth Clients**: Support different client IDs for different apps
- **Audit Logging**: Track which users authenticated when

## Migration from Manual Tokens

Existing users with manual tokens can continue using them. The OAuth flow is additive:

- Manual tokens from `/api/auth` still work
- OAuth tokens work the same way (same format, same validation)
- Both use the same `/mcp` endpoint
- Users can switch to OAuth flow anytime by clicking "Connect" in Cowork

## Support

For issues with OAuth integration:
1. Check Vercel logs: `vercel logs gong-mcp-server.sentry.dev`
2. Verify secrets are set: `gcloud secrets list`
3. Test endpoints manually (see Testing section above)
4. Review secret access: See [GCP-SECRETS-README.md](./GCP-SECRETS-README.md)
