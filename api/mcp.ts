/**
 * Vercel Serverless Function for Gong MCP Server
 *
 * HTTP handler that exposes the Gong MCP server via WebStandardStreamableHTTPServerTransport
 * in stateless mode. Each request creates fresh instances (no session persistence).
 *
 * Environment variables (set in Vercel dashboard):
 *   GONG_ACCESS_KEY - Shared team Gong API access key
 *   GONG_ACCESS_KEY_SECRET - Shared team Gong API secret
 *   ALLOWED_EMAIL_DOMAINS - Comma-separated list of allowed email domains (e.g., "sentry.io,getsentry.com")
 *
 * Authentication Model:
 *   - Requires Google ID token in Authorization header
 *   - Verifies token and checks email domain against ALLOWED_EMAIL_DOMAINS
 *   - Only users with @sentry.io (or configured) emails can access
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
    // 1. Authenticate request - Verify Google ID token
    const allowedDomains = (process.env.ALLOWED_EMAIL_DOMAINS || 'sentry.io').split(',').map(d => d.trim());

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Google ID token required in Authorization header. Format: "Bearer <id_token>"',
      });
      return;
    }

    const idToken = authHeader.replace('Bearer ', '');

    // Verify Google ID token and extract email
    const email = await verifyGoogleToken(idToken);

    if (!email) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired Google ID token',
      });
      return;
    }

    // Check if email domain is allowed
    const emailDomain = email.split('@')[1];
    if (!allowedDomains.includes(emailDomain)) {
      console.warn(`Access denied for email domain: ${emailDomain}`);
      res.status(403).json({
        error: 'Forbidden',
        message: `Access restricted to ${allowedDomains.join(', ')} email addresses. Your email: ${email}`,
      });
      return;
    }

    console.log(`Authenticated user: ${email}`);

    // 2. Validate Gong credentials
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

    // 3. Create per-request GongClient instance
    const gongClient = new GongClient({ accessKey, accessKeySecret });

    // 4. Create MCP server via factory
    const mcpServer = createGongMcpServer(gongClient);

    // 5. Create stateless WebStandardStreamableHTTPServerTransport
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless mode
    });

    // 6. Connect server to transport
    await mcpServer.connect(transport);

    // 7. Convert VercelRequest to Web Standard Request
    const webRequest = convertVercelRequestToWebRequest(req);

    // 8. Call transport.handleRequest()
    const webResponse = await transport.handleRequest(webRequest);

    // 9. Stream response back
    await streamWebResponseToVercel(webResponse, res);

  } catch (error) {
    console.error('Error handling MCP request:', error);

    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

/**
 * Verify Google ID token and extract email
 * Uses Google's tokeninfo endpoint (no client library needed)
 */
async function verifyGoogleToken(idToken: string): Promise<string | null> {
  try {
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);

    if (!response.ok) {
      console.error('Google token verification failed:', response.status);
      return null;
    }

    const tokenInfo = await response.json();

    // Check if token is valid and not expired
    if (!tokenInfo.email || !tokenInfo.email_verified) {
      console.error('Token email not verified');
      return null;
    }

    return tokenInfo.email;
  } catch (error) {
    console.error('Error verifying Google token:', error);
    return null;
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
