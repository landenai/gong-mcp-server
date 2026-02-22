/**
 * OAuth 2.0 Authorization Endpoint for Cowork Integration
 *
 * Flow:
 * 1. Cowork redirects user here with: client_id, redirect_uri, state
 * 2. We redirect to Google OAuth for user authentication
 * 3. Google redirects back to /api/oauth/callback
 * 4. Callback verifies user and redirects back to Cowork with auth code
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSecret } from '../../dist/secrets.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { client_id, redirect_uri, state, response_type } = req.query;

  // Fetch secrets from GCP Secret Manager (with env var fallback)
  let GOOGLE_CLIENT_ID: string;
  let COWORK_CLIENT_ID: string;

  try {
    [GOOGLE_CLIENT_ID, COWORK_CLIENT_ID] = await Promise.all([
      getSecret('GOOGLE_CLIENT_ID'),
      getSecret('COWORK_OAUTH_CLIENT_ID').catch(() => 'cowork-connector'),
    ]);
  } catch (error) {
    console.error('Failed to fetch configuration secrets:', error);
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }

  // Validate OAuth parameters
  if (!client_id || !redirect_uri || !state || response_type !== 'code') {
    res.status(400).json({
      error: 'invalid_request',
      error_description: 'Missing or invalid OAuth parameters. Required: client_id, redirect_uri, state, response_type=code',
    });
    return;
  }

  // Validate client_id (for now, just accept Cowork's client)
  if (client_id !== COWORK_CLIENT_ID) {
    res.status(401).json({
      error: 'unauthorized_client',
      error_description: 'Unknown client_id. Contact administrator.',
    });
    return;
  }

  // Store OAuth request parameters in session (encode in state for stateless flow)
  const oauthState = Buffer.from(JSON.stringify({
    cowork_redirect_uri: redirect_uri,
    cowork_state: state,
  })).toString('base64url');

  // Redirect to Google OAuth with our callback URL
  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID || '',
    redirect_uri: `https://${req.headers.host}/api/oauth/callback`,
    response_type: 'code',
    scope: 'email profile',
    access_type: 'offline',
    prompt: 'select_account',
    state: oauthState, // Pass our state to callback
  })}`;

  res.redirect(googleAuthUrl);
}
