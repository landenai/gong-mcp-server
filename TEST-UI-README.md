# Gong MCP Server Test UI

A simple interactive CLI tool to test the Gong MCP Server functionality.

## Features

- Interactive menu-driven interface
- Quick test options for all available tools
- Custom tool calls with JSON parameters
- Colored output for better readability
- Real-time response display with timing information

## Prerequisites

1. **Gong API Credentials**: You need a Gong API access key and secret
   - Get them from: https://app.gong.io/settings/api/documentation

2. **Build the MCP Server**: The test UI requires the compiled server
   ```bash
   npm run build
   ```

## Setup

1. **Create a .env file** (if you haven't already):
   ```bash
   cp .env.example .env
   ```

2. **Add your Gong credentials** to the `.env` file:
   ```
   GONG_ACCESS_KEY=your_actual_access_key
   GONG_ACCESS_KEY_SECRET=your_actual_secret
   ```

3. **Load environment variables** (or let the test UI load them):
   ```bash
   source .env  # Optional - test UI will use .env if available
   ```

## Running the Test UI

```bash
npm run test-ui
```

Or with explicit environment variables:

```bash
GONG_ACCESS_KEY=your_key GONG_ACCESS_KEY_SECRET=your_secret npm run test-ui
```

## Available Quick Tests

The test UI provides quick access to common operations:

### 1. List Recent Calls
Lists recent calls from Gong with metadata including title, duration, participants, and CRM context.

### 2. List Users
Lists all users in the Gong workspace with their email, name, title, and status.

### 3. List Deals
Lists deals/opportunities synced from CRM, including stage, amount, and close date.

### 4. List Emails
Lists emails captured by Gong's email integration.

### 5. List Library Folders
Lists saved call folders in the Gong library.

### 6. Get Call Details
Retrieves detailed information about specific calls. Requires a call ID.

### 7. Get Transcript
Gets the full transcript of a specific call with speaker identification. Requires a call ID.

### 8. Get User Stats
Gets aggregated activity statistics for users over a date range. Requires:
- From date (YYYY-MM-DD format)
- To date (YYYY-MM-DD format)

### 9. Get Calls for CRM Account
Gets all calls associated with a CRM account/deal. Requires:
- Object type (Account/Deal/Lead/Contact)
- Object ID (CRM ID)

### Custom Tool Call (c)
Allows you to manually construct JSON arguments for any available tool.

## Example Workflow

1. Start the test UI:
   ```bash
   npm run test-ui
   ```

2. List recent calls to get call IDs:
   ```
   Select option: 1
   ```

3. Copy a call ID from the results

4. Get detailed information about that call:
   ```
   Select option: 6
   Enter call ID: <paste-call-id>
   ```

5. Get the transcript:
   ```
   Select option: 7
   Enter call ID: <paste-call-id>
   ```

## Troubleshooting

### "GONG_ACCESS_KEY and GONG_ACCESS_KEY_SECRET environment variables are required"

Make sure your `.env` file exists and contains valid credentials, or export them:

```bash
export GONG_ACCESS_KEY=your_key
export GONG_ACCESS_KEY_SECRET=your_secret
```

### "Connection refused" or "Cannot connect to server"

Make sure the server is built:
```bash
npm run build
```

### Invalid JSON error

When using custom tool calls, ensure your JSON is properly formatted:
```json
{
  "from_date": "2024-01-01T00:00:00Z",
  "to_date": "2024-01-31T23:59:59Z"
}
```

## Using with .env file

If you have a `.env` file in the project root, you can use `dotenv` to automatically load it:

```bash
# Install dotenv-cli if you want automatic loading
npm install -D dotenv-cli

# Run with automatic .env loading
npx dotenv -e .env -- npm run test-ui
```

Or simply export the variables before running:

```bash
export $(cat .env | xargs) && npm run test-ui
```

## Development

To modify the test UI, edit `test-ui.ts` and run directly with tsx:

```bash
npx tsx test-ui.ts
```

## Tips

- Press `q` at any time to quit
- Press `Ctrl+C` for emergency exit
- Use the custom tool call option (`c`) to test edge cases
- Check the response timing to identify slow queries
- The UI clears the screen between operations for better readability

## Next Steps

Once you've tested the server locally:

1. Add it to Claude Code (see main README)
2. Test with Claude in a real conversation
3. Use the MCP inspector for more detailed debugging:
   ```bash
   npm run inspect
   ```
