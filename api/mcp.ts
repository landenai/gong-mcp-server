/**
 * Vercel Serverless Function for Gong MCP Server
 *
 * HTTP handler that exposes the Gong MCP server via WebStandardStreamableHTTPServerTransport
 * in stateless mode. Each request creates fresh instances (no session persistence).
 *
 * Environment variables (set in Vercel dashboard):
 *   GONG_ACCESS_KEY - Shared team Gong API access key
 *   GONG_ACCESS_KEY_SECRET - Shared team Gong API secret
 *
 * Authentication Model:
 *   - Uses shared team credentials for all users
 *   - Credentials stored as Vercel environment variables (encrypted at rest)
 *   - Access controlled by Cowork workspace permissions
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { GongClient } from '../src/gong-client.js';
import { createGongMcpServer } from '../src/server.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed', message: 'Only POST requests are supported' });
    return;
  }

  try {
    // 1. Validate environment variables
    const accessKey = process.env.GONG_ACCESS_KEY;
    const accessKeySecret = process.env.GONG_ACCESS_KEY_SECRET;

    if (!accessKey || !accessKeySecret) {
      console.error('Missing GONG_ACCESS_KEY or GONG_ACCESS_KEY_SECRET environment variables');
      res.status(500).json({
        error: 'Server Configuration Error',
        message: 'Gong API credentials not configured',
      });
      return;
    }

    // 2. Create per-request GongClient instance
    const gongClient = new GongClient({ accessKey, accessKeySecret });

    // 3. Create MCP server via factory
    const mcpServer = createGongMcpServer(gongClient);

    // 4. Create stateless WebStandardStreamableHTTPServerTransport
    // Note: No sessionIdGenerator = stateless mode (perfect for serverless)
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless mode
    });

    // 5. Connect server to transport
    await mcpServer.connect(transport);

    // 6. Convert VercelRequest to Web Standard Request
    const webRequest = convertVercelRequestToWebRequest(req);

    // 7. Call transport.handleRequest()
    const webResponse = await transport.handleRequest(webRequest);

    // 8. Stream response back
    await streamWebResponseToVercel(webResponse, res);

  } catch (error) {
    console.error('Error handling MCP request:', error);

    // Check if response has already been sent
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

/**
 * Convert Vercel request to Web Standard Request
 */
function convertVercelRequestToWebRequest(vercelReq: VercelRequest): Request {
  // Get the full URL
  const protocol = vercelReq.headers['x-forwarded-proto'] || 'https';
  const host = vercelReq.headers['x-forwarded-host'] || vercelReq.headers.host || 'localhost:3000';
  const url = `${protocol}://${host}${vercelReq.url}`;

  // Convert headers
  const headers = new Headers();
  for (const [key, value] of Object.entries(vercelReq.headers)) {
    if (value) {
      headers.set(key, Array.isArray(value) ? value.join(', ') : value);
    }
  }

  // Create Web Standard Request
  return new Request(url, {
    method: vercelReq.method || 'POST',
    headers,
    body: vercelReq.body ? JSON.stringify(vercelReq.body) : undefined,
  });
}

/**
 * Stream Web Standard Response to Vercel response
 */
async function streamWebResponseToVercel(webResponse: Response, vercelRes: VercelResponse): Promise<void> {
  // Set status code
  vercelRes.status(webResponse.status);

  // Set headers
  webResponse.headers.forEach((value, key) => {
    vercelRes.setHeader(key, value);
  });

  // Stream body
  if (webResponse.body) {
    const reader = webResponse.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Write chunk to Vercel response
        const chunk = decoder.decode(value, { stream: true });
        vercelRes.write(chunk);
      }
    } finally {
      reader.releaseLock();
    }
  }

  // End the response
  vercelRes.end();
}
