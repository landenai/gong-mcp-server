# Gong MCP Server

An MCP (Model Context Protocol) server that connects Claude to your Gong data. Query calls, transcripts, deals, emails, and user activity directly from Claude.

**Access Options:**
- **Local Setup** - Individual users add server to their Claude Desktop configuration
- **Remote Connector** - Workspace admin sets up OAuth connector for entire team (Cowork)

## Getting Started

### For End Users

- **Local Setup**: [LOCAL-SETUP.md](./LOCAL-SETUP.md) - Add the server to your personal Claude Desktop config
- **Remote Connector**: Ask your workspace admin to set up the Cowork connector (no setup needed on your end)

### For Admins

- **Remote Connector Setup**: [COWORK-OAUTH-SETUP.md](./COWORK-OAUTH-SETUP.md) - Set up OAuth connector for your workspace
- **Server Deployment**: [DEPLOYMENT.md](./DEPLOYMENT.md) - Deploy to Vercel with GCP Secret Manager
- **Authentication Flow**: [AUTH-FLOW.md](./AUTH-FLOW.md) - Complete authentication architecture documentation

## Features

| Tool | Description |
|------|-------------|
| `gong_list_calls` | List recent calls with date filters |
| `gong_search_calls_by_text` | **NEW!** Search calls by title or participant name/email with smart date-range filtering |
| `gong_get_call_details` | Get detailed call info including CRM context and topics |
| `gong_get_transcript` | Get full call transcript with speaker identification |
| `gong_list_users` | List all users in workspace |
| `gong_get_user_stats` | Get activity statistics for users |
| `gong_get_calls_for_account` | Get all calls for a CRM account/deal |
| `gong_list_deals` | List deals synced from CRM |
| `gong_list_emails` | List captured emails |
| `gong_list_library_folders` | List saved call collections |

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Build

```bash
npm run build
```

### 3. Test the Server (Optional)

Before integrating with Claude, test the server with the built-in test UI:

```bash
# Create .env file with your credentials
cp .env.example .env
# Edit .env and add your credentials

# Run the interactive test UI
npm run test-ui
```

See [TEST-UI-README.md](TEST-UI-README.md) for detailed instructions.

### 4. Add to Claude Code

```bash
claude mcp add gong node ~/projects/gong-mcp-server/dist/index.js \
  -e GONG_ACCESS_KEY=your_key \
  -e GONG_ACCESS_KEY_SECRET=your_secret
```

## Example Queries

Once connected, you can ask Claude things like:

- "Search for calls about pricing" (uses smart text search)
- "Find all calls with John Smith as a participant"
- "Show me all calls from last week"
- "Get the transcript from call ID abc123"
- "What calls has the Acme account had in Q4?"
- "List all deals in stage 'Negotiation'"

## Vercel Deployment (HTTP/Serverless)

Deploy the MCP server to Vercel for team-wide HTTP access (e.g., Cowork connectors):

```bash
# Build the project
npm run build

# Link to Vercel
vercel link

# Set environment variables
vercel env add GONG_ACCESS_KEY production
vercel env add GONG_ACCESS_KEY_SECRET production

# Deploy to production
npm run deploy:prod
```

For detailed deployment instructions, testing strategies, and security considerations, see **[DEPLOYMENT.md](DEPLOYMENT.md)**.

### Architecture

- **Transport**: WebStandardStreamableHTTPServerTransport (stateless)
- **Runtime**: Vercel Node.js serverless functions
- **Authentication**: Shared team Gong credentials via Vercel environment variables
- **Endpoint**: `https://your-project.vercel.app/mcp`

## License

MIT
