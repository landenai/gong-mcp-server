# Local Setup Guide - Individual Users

This guide is for Sentry team members who want to add the Gong MCP server to their **local Claude Desktop configuration**.

> **Note**: If your workspace admin has set up the remote Cowork connector, you don't need this guide - just click "Connect" in Cowork settings. This guide is for individual local setup only.

## Overview

Local setup allows you to use the Gong MCP server in Claude Desktop without requiring workspace admin setup:

1. Visit the auth page to get your personal token
2. Add the token to your local Claude Desktop config file
3. Restart Claude Desktop

## Step 1: Get Your Authentication Token

1. Visit: **https://gong-mcp-server.sentry.dev/api/auth**
2. Click **"Sign in with Google"**
3. Authenticate with your `@sentry.io` Google account
4. Copy the API token shown on the success page

Your token is valid for **1 year** and is personal to you.

## Step 2: Configure Claude Desktop

### Location

Edit your Claude Desktop configuration file:
```bash
~/Library/Application Support/Claude/claude_desktop_config.json
```

### Configuration

Add the Gong server to your `mcpServers` section:

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

**Important**: Replace `YOUR_TOKEN_HERE` with the token you copied in Step 1.

### Full Example

If your config file is empty or you're adding to existing servers:

```json
{
  "mcpServers": {
    "gong": {
      "url": "https://gong-mcp-server.sentry.dev/mcp",
      "headers": {
        "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
      }
    },
    "other-server": {
      "command": "node",
      "args": ["/path/to/other/server.js"]
    }
  }
}
```

## Step 3: Restart Claude Desktop

Close and reopen Claude Desktop for the changes to take effect.

## Verify Setup

Once restarted, you should see the Gong server available. Try asking Claude:

> "Search for recent Gong calls about pricing"

Claude should be able to access your Gong data.

## Troubleshooting

### "Invalid token" error

**Solution**: Your token may have expired (1 year validity). Get a new token at https://gong-mcp-server.sentry.dev/api/auth

### "Access restricted" error

**Solution**: Make sure you signed in with your `@sentry.io` email address (not personal Gmail).

### Server not showing up

**Solution**:
1. Verify the config file syntax is valid JSON (use a JSON validator)
2. Check that you saved the file
3. Completely quit and restart Claude Desktop (don't just close the window)

### Config file doesn't exist

**Solution**: Create it:
```bash
mkdir -p ~/Library/Application\ Support/Claude
echo '{"mcpServers":{}}' > ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

Then edit it with the Gong server configuration above.

## Security Notes

✅ **Token is personal**: Your token is tied to your email. Don't share it.
✅ **Token expiration**: Tokens expire after 1 year. You'll need to get a new one.
✅ **Revocation**: If your token is compromised, contact your admin to rotate the token secret.

## Alternative: Use Cowork Connector

If you prefer not to manage tokens individually, ask your workspace admin to set up the remote Cowork connector. See [COWORK-OAUTH-SETUP.md](./COWORK-OAUTH-SETUP.md) for admin instructions.

With the Cowork connector:
- No manual token copying
- One-click "Connect" button
- Automatic token management
- Works across all devices
