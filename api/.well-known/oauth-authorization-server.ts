/**
 * OAuth 2.0 Authorization Server Metadata Endpoint
 *
 * Implements RFC8414 - OAuth 2.0 Authorization Server Metadata
 * https://datatracker.ietf.org/doc/html/rfc8414
 *
 * This endpoint describes the capabilities and endpoints of our authorization server.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const baseUrl = `https://${req.headers.host}`;

  // Return Authorization Server Metadata per RFC8414
  res.status(200).json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/api/oauth/authorize`,
    token_endpoint: `${baseUrl}/api/oauth/token`,

    // Supported grant types
    grant_types_supported: ['authorization_code'],

    // Supported response types
    response_types_supported: ['code'],

    // PKCE support (REQUIRED by MCP spec)
    code_challenge_methods_supported: ['S256'],

    // Token endpoint authentication methods
    token_endpoint_auth_methods_supported: [
      'client_secret_post',
      'client_secret_basic',
      'none', // For public clients
    ],

    // Scopes (we don't use scopes, but include for completeness)
    scopes_supported: [],

    // We support the resource parameter per RFC8707
    resource_parameter_supported: true,

    // Additional metadata
    service_documentation: `${baseUrl}/COWORK-OAUTH-SETUP.md`,
  });
}
