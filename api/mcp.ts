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
 *   - Requires Bearer token in Authorization header
 *   - Accepts JWT tokens (OAuth flow) or manual API tokens
 *   - Verifies token and checks email domain against ALLOWED_EMAIL_DOMAINS
 *   - Only users with @sentry.io (or configured) emails can access
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { GongClient } from '../dist/gong-client.js';
import { createGongMcpServer } from '../dist/server.js';
import { verifyApiToken } from './auth.js';
import { getSecret } from '../dist/secrets.js';
import jwt from 'jsonwebtoken';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed', message: 'Only POST requests are supported' });
    return;
  }

  try {
    // 1. Authenticate request - Accept JWT (MCP-compliant) OR legacy custom tokens
    const allowedDomains = (process.env.ALLOWED_EMAIL_DOMAINS || 'sentry.io').split(',').map(d => d.trim());

    // Fetch TOKEN_SECRET for JWT verification
    let TOKEN_SECRET: string;
    try {
      TOKEN_SECRET = await getSecret('TOKEN_SECRET');
    } catch (error) {
      console.error('Failed to fetch TOKEN_SECRET:', error);
      res.status(500).json({ error: 'Server configuration error' });
      return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // Return 401 with WWW-Authenticate header per MCP spec (RFC9728)
      const resourceMetadataUrl = `https://${req.headers.host}/.well-known/oauth-protected-resource`;
      res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${resourceMetadataUrl}"`);
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required. Get a token at: https://gong-mcp-server.sentry.dev/api/auth',
      });
      return;
    }

    const token = authHeader.replace('Bearer ', '');
    let email: string | null = null;

    // Expected audience for this MCP server
    const expectedAudience = `https://${req.headers.host}/mcp`;

    // Try to verify as JWT first (MCP-compliant tokens)
    try {
      const decoded = jwt.verify(token, TOKEN_SECRET, {
        algorithms: ['HS256'],
        audience: expectedAudience, // Validate audience claim
      }) as jwt.JwtPayload;

      email = decoded.sub || null;
      if (email) {
        console.log(`Authenticated with JWT (MCP-compliant): ${email}`);
      }
    } catch (jwtError) {
      // JWT verification failed, try manual API token (custom format)

      // Try to verify as manual API token
      const apiTokenData = verifyApiToken(token, TOKEN_SECRET);
      if (apiTokenData) {
        email = apiTokenData.email;
        console.log(`Authenticated with manual API token: ${email}`);
      }
    }

    if (!email) {
      // Return 401 with WWW-Authenticate header per MCP spec
      const resourceMetadataUrl = `https://${req.headers.host}/.well-known/oauth-protected-resource`;
      res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${resourceMetadataUrl}"`);
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired token. Get a new token at: https://gong-mcp-server.sentry.dev/api/auth',
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

    // 2. Fetch Gong credentials from GCP Secret Manager (with env var fallback)
    let accessKey: string;
    let accessKeySecret: string;

    try {
      accessKey = await getSecret('GONG_ACCESS_KEY');
      accessKeySecret = await getSecret('GONG_ACCESS_KEY_SECRET');
    } catch (error) {
      console.error('Failed to fetch Gong API credentials:', error);
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
