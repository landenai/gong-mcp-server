# Gong MCP Server - Vercel Deployment Guide

This guide covers deploying the Gong MCP server to Vercel as a serverless HTTP endpoint.

## Architecture

- **Transport**: WebStandardStreamableHTTPServerTransport (stateless mode)
- **Runtime**: Vercel Node.js serverless functions
- **Authentication**: Shared team Gong credentials via Vercel environment variables
- **Tools**: All 9 Gong tools (calls, transcripts, users, deals, emails, library)

## Prerequisites

1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
2. **Vercel CLI**: Install globally
   ```bash
   npm install -g vercel
   ```
3. **Gong API Credentials**: Obtain from your Gong workspace
   - Access Key
   - Access Key Secret

## Local Testing

### Option 1: Vercel Dev (Recommended)

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create `.env` file for local testing:
   ```bash
   GONG_ACCESS_KEY=your_access_key_here
   GONG_ACCESS_KEY_SECRET=your_secret_here
   ```

3. Start Vercel dev server:
   ```bash
   npm run dev:vercel
   ```

4. Test the endpoint at `http://localhost:3000/mcp`

### Option 2: Manual Testing

Test with curl:

```bash
# Initialize request
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2024-11-05" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "clientInfo": {"name": "test-client", "version": "1.0.0"},
      "capabilities": {}
    }
  }'

# List tools
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2024-11-05" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
  }'

# Call a tool (list users)
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2024-11-05" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "gong_list_users",
      "arguments": {}
    }
  }'
```

## Deployment

### Step 1: Build the Project

```bash
npm run build
```

Verify that `dist/` contains compiled JavaScript files.

### Step 2: Link to Vercel (First Time Only)

```bash
vercel link
```

Follow the prompts to:
- Select your Vercel account/team
- Choose to link to existing project or create new
- Set project name (e.g., `gong-mcp-server`)

### Step 3: Set Environment Variables

**In Vercel Dashboard:**

1. Go to your project settings
2. Navigate to "Environment Variables"
3. Add the following variables for **Production**, **Preview**, and **Development**:

   ```
   GONG_ACCESS_KEY = your_access_key_here
   GONG_ACCESS_KEY_SECRET = your_secret_here
   ```

**Or via CLI:**

```bash
vercel env add GONG_ACCESS_KEY production
# Paste your access key when prompted

vercel env add GONG_ACCESS_KEY_SECRET production
# Paste your secret when prompted

# Also add for preview and development environments
vercel env add GONG_ACCESS_KEY preview
vercel env add GONG_ACCESS_KEY_SECRET preview

vercel env add GONG_ACCESS_KEY development
vercel env add GONG_ACCESS_KEY_SECRET development
```

### Step 4: Deploy to Preview

```bash
npm run deploy:preview
```

This creates a preview deployment with a unique URL (e.g., `gong-mcp-server-abc123.vercel.app`).

### Step 5: Test Production Deployment

```bash
# Test initialize
curl -X POST https://your-project.vercel.app/mcp \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2024-11-05" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "clientInfo": {"name": "test-client", "version": "1.0.0"},
      "capabilities": {}
    }
  }'

# Test tools/list
curl -X POST https://your-project.vercel.app/mcp \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2024-11-05" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
  }'
```

### Step 6: Deploy to Production

Once preview testing is successful:

```bash
npm run deploy:prod
```

This deploys to your production domain (e.g., `gong-mcp-server.vercel.app`).

## Verification Checklist

After deployment, verify:

- [ ] Build succeeds: `npm run build` completes without errors
- [ ] Local dev works: `vercel dev` starts server on localhost:3000
- [ ] Initialize works: POST to `/mcp` with initialize method returns server info
- [ ] List tools works: Returns all 9 Gong tools
- [ ] Tool execution works: Call `gong_list_users` returns user data
- [ ] Production deploy: `vercel --prod` completes successfully
- [ ] Production endpoint: Live URL responds to MCP protocol requests
- [ ] Environment variables: Credentials correctly injected from Vercel

## Troubleshooting

### Error: "Missing GONG_ACCESS_KEY or GONG_ACCESS_KEY_SECRET"

**Solution**: Ensure environment variables are set in Vercel dashboard for all environments (Production, Preview, Development).

### Error: "Gong API error (401)"

**Solution**: Verify your Gong credentials are correct and have not expired.

### Error: "Module not found"

**Solution**:
1. Run `npm install` to ensure all dependencies are installed
2. Run `npm run build` to compile TypeScript
3. Check that `vercel.json` has correct build configuration

### Timeout Errors

**Solution**:
- Default timeout is 60 seconds (configured in `vercel.json`)
- For longer operations, upgrade to Vercel Pro (allows up to 300s)
- Or optimize queries (use date filters, pagination)

## Security Considerations

### Shared Team Credentials

This deployment uses **shared Gong credentials** configured at the workspace level:

- **Use Case**: Team-wide Cowork connector where all users access the same Gong account
- **Security**: Credentials stored in Vercel environment variables (encrypted at rest)
- **Access Control**: Managed by Cowork workspace permissions

### Best Practices

1. **Environment Variables**: Use Vercel's encrypted environment variables (never commit credentials)
2. **Audit Logs**: Enable Vercel audit logs to track configuration changes
3. **Access Control**: Restrict Vercel project access to authorized team members
4. **IP Allowlist**: Consider adding IP allowlist in Vercel if accessing from known IPs only
5. **Credentials Rotation**: Periodically rotate Gong API credentials

## Configuration

### Memory and Timeout

Edit `vercel.json` to adjust function settings:

```json
{
  "functions": {
    "api/mcp.ts": {
      "memory": 1024,        // MB (512, 1024, 2048, 3008)
      "maxDuration": 60      // seconds (10, 60, 300 with Pro)
    }
  }
}
```

### Regions

To deploy to specific regions, add to `vercel.json`:

```json
{
  "regions": ["sfo1", "iad1"]
}
```

## Monitoring

### View Logs

```bash
vercel logs <deployment-url>
```

Or view in Vercel Dashboard:
1. Go to your project
2. Click on "Deployments"
3. Select a deployment
4. View "Functions" tab for logs

### Metrics

Monitor in Vercel Dashboard:
- Request count
- Error rate
- Response time (p50, p99)
- Bandwidth usage

## Updating

To update the server:

1. Make code changes
2. Run `npm run build` to test
3. Run `npm run deploy:preview` to test in preview environment
4. Run `npm run deploy:prod` to deploy to production

Vercel automatically rebuilds on git push if connected to GitHub.

## Stdio Version

The original stdio version for local development is still available:

```bash
npm run dev
```

Or use with Claude Desktop by configuring `claude_desktop_config.json`.

## Support

- **Vercel Docs**: https://vercel.com/docs
- **MCP SDK**: https://github.com/anthropics/mcp
- **Gong API**: https://help.gong.io/docs/what-the-gong-api-provides

## Next Steps

1. Connect to Cowork workspace
2. Configure endpoint URL in Cowork
3. Test all 9 tools with real Gong data
4. Monitor usage and performance
5. Set up alerts for errors/downtime
