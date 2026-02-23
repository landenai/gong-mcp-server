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
import { createHash } from 'crypto';
import { getSecret } from '../../dist/secrets.js';
import jwt from 'jsonwebtoken';

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

  const { grant_type, code, client_id, client_secret, redirect_uri, code_verifier, resource } = req.body;

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

  // PKCE code_verifier is REQUIRED by MCP spec
  if (!code_verifier) {
    res.status(400).json({
      error: 'invalid_request',
      error_description: 'code_verifier required (PKCE)',
    });
    return;
  }

  // Resource parameter is REQUIRED by MCP spec (RFC8707)
  if (!resource) {
    res.status(400).json({
      error: 'invalid_request',
      error_description: 'resource parameter required (RFC8707)',
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

  // Verify PKCE: Hash the code_verifier and compare to stored code_challenge
  const computedChallenge = createHash('sha256')
    .update(code_verifier)
    .digest('base64url');

  if (computedChallenge !== authData.codeChallenge) {
    console.error('PKCE verification failed');
    res.status(400).json({
      error: 'invalid_grant',
      error_description: 'Invalid code_verifier (PKCE verification failed)',
    });
    return;
  }

  // Verify resource parameter matches what was in the authorization request
  if (resource !== authData.resource) {
    console.error(`Resource mismatch: ${resource} !== ${authData.resource}`);
    res.status(400).json({
      error: 'invalid_target',
      error_description: 'Resource parameter does not match authorization request',
    });
    return;
  }

  // Generate JWT access token with proper audience claim
  const accessToken = generateJWT(authData.email, authData.resource, TOKEN_SECRET, req.headers.host as string);

  console.log(`Issued access token for ${authData.email} via OAuth flow for resource ${resource}`);

  // Return OAuth token response
  res.status(200).json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 31536000, // 1 year in seconds
  });
}

/**
 * Generate a JWT access token with proper audience claim (MCP spec compliant)
 *
 * Per MCP spec, tokens MUST include audience claim to ensure they're only
 * valid for the intended MCP server.
 */
function generateJWT(email: string, audience: string, secret: string, issuer: string): string {
  const payload = {
    sub: email, // Subject: user's email
    aud: audience, // Audience: the MCP server resource URI
    iss: `https://${issuer}`, // Issuer: our authorization server
    iat: Math.floor(Date.now() / 1000), // Issued at
    exp: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60), // Expires in 1 year
  };

  return jwt.sign(payload, secret, { algorithm: 'HS256' });
}
