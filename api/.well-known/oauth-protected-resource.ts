/**
 * OAuth 2.0 Protected Resource Metadata Endpoint
 *
 * Implements RFC9728 - OAuth 2.0 Protected Resource Metadata
 * https://datatracker.ietf.org/doc/html/rfc9728
 *
 * This endpoint tells MCP clients where to find our authorization server.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  // The canonical resource URI for this MCP server
  const resourceUri = `https://${req.headers.host}/mcp`;

  // Authorization server location
  const authServerUri = `https://${req.headers.host}`;

  // Return Protected Resource Metadata per RFC9728
  res.status(200).json({
    resource: resourceUri,
    authorization_servers: [authServerUri],
  });
}
