#!/usr/bin/env node

/**
 * Gong MCP Server - Stdio Entry Point
 *
 * Exposes Gong's conversation intelligence data through the Model Context Protocol.
 * Query calls, transcripts, deals, emails, and user activity.
 *
 * This is the stdio transport version for local development and Claude Desktop integration.
 *
 * Environment variables:
 *   GONG_ACCESS_KEY - Your Gong API access key
 *   GONG_ACCESS_KEY_SECRET - Your Gong API access key secret
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GongClient } from "./gong-client.js";
import { createGongMcpServer } from "./server.js";

// Initialize client from environment
const accessKey = process.env.GONG_ACCESS_KEY;
const accessKeySecret = process.env.GONG_ACCESS_KEY_SECRET;

if (!accessKey || !accessKeySecret) {
  console.error("ERROR: GONG_ACCESS_KEY and GONG_ACCESS_KEY_SECRET environment variables are required");
  process.exit(1);
}

const gong = new GongClient({ accessKey, accessKeySecret });

// Create MCP server with all tools
const server = createGongMcpServer(gong);

// Start server with stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Gong MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
