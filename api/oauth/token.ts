/**
 * OAuth 2.0 Token Endpoint
 *
 * Cowork calls this endpoint to exchange the authorization code for an access token.
 *
 * Request:
 *   POST /api/oauth/token
 *   Content-Type: application/x-www-form-urlencoded
 *   Body: grant_type=authorization_code&code=...&client_id=...&client_secret=...&redirect_uri=...
 *
 * Response:
 *   {
 *     "access_token": "...",
 *     "token_type": "Bearer",
 *     "expires_in": 31536000
 *   }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAuthCode } from './callback.js';
import { createHmac } from 'crypto';
import { getSecret } from '../../dist/secrets.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Fetch secrets from GCP Secret Manager (with env var fallback)
  let COWORK_OAUTH_CLIENT_ID: string;
  let COWORK_OAUTH_CLIENT_SECRET: string;
  let TOKEN_SECRET: string;

  try {
    [COWORK_OAUTH_CLIENT_ID, COWORK_OAUTH_CLIENT_SECRET, TOKEN_SECRET] = await Promise.all([
      getSecret('COWORK_OAUTH_CLIENT_ID').catch(() => 'cowork-connector'),
      getSecret('COWORK_OAUTH_CLIENT_SECRET').catch(() => ''),
      getSecret('TOKEN_SECRET'),
    ]);
  } catch (error) {
    console.error('Failed to fetch configuration secrets:', error);
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }
  // Only accept POST requests
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const { grant_type, code, client_id, client_secret, redirect_uri } = req.body;

  // Validate required parameters
  if (grant_type !== 'authorization_code') {
    res.status(400).json({
      error: 'unsupported_grant_type',
      error_description: 'Only authorization_code grant type is supported',
    });
    return;
  }

  if (!code || !client_id || !redirect_uri) {
    res.status(400).json({
      error: 'invalid_request',
      error_description: 'Missing required parameters: code, client_id, redirect_uri',
    });
    return;
  }

  // Verify client credentials
  if (client_id !== COWORK_OAUTH_CLIENT_ID) {
    res.status(401).json({
      error: 'invalid_client',
      error_description: 'Invalid client_id',
    });
    return;
  }

  // Verify client secret if configured
  if (COWORK_OAUTH_CLIENT_SECRET && client_secret !== COWORK_OAUTH_CLIENT_SECRET) {
    res.status(401).json({
      error: 'invalid_client',
      error_description: 'Invalid client_secret',
    });
    return;
  }

  // Verify and decode authorization code
  const authData = verifyAuthCode(code);
  if (!authData) {
    res.status(400).json({
      error: 'invalid_grant',
      error_description: 'Invalid or expired authorization code',
    });
    return;
  }

  // Generate long-lived access token (same as current flow)
  const accessToken = generateAccessToken(authData.email, TOKEN_SECRET);

  console.log(`Issued access token for ${authData.email} via OAuth flow`);

  // Return OAuth token response
  res.status(200).json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 31536000, // 1 year in seconds
  });
}

/**
 * Generate a long-lived access token (same as api/auth.ts)
 * Format: base64url(email:expiresAt).signature
 */
function generateAccessToken(email: string, tokenSecret: string): string {
  const timestamp = Date.now();
  const expiresAt = timestamp + (365 * 24 * 60 * 60 * 1000); // 1 year
  const payload = `${email}:${expiresAt}`;
  const signature = createHmac('sha256', tokenSecret)
    .update(payload)
    .digest('base64url');

  return `${Buffer.from(payload).toString('base64url')}.${signature}`;
}
