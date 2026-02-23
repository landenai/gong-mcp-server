/**
 * OAuth 2.0 Callback Handler
 *
 * After Google authenticates the user, this endpoint:
 * 1. Exchanges Google's auth code for user info
 * 2. Verifies user email domain
 * 3. Generates an authorization code
 * 4. Redirects back to Cowork with the auth code
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac } from 'crypto';
import { getSecret } from '../../dist/secrets.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { code, error, state } = req.query;

  // Fetch secrets from GCP Secret Manager (with env var fallback)
  let GOOGLE_CLIENT_ID: string;
  let GOOGLE_CLIENT_SECRET: string;
  let TOKEN_SECRET: string;
  let ALLOWED_DOMAINS: string[];

  try {
    [GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, TOKEN_SECRET] = await Promise.all([
      getSecret('GOOGLE_CLIENT_ID'),
      getSecret('GOOGLE_CLIENT_SECRET'),
      getSecret('TOKEN_SECRET'),
    ]);
    const allowedDomainsStr = await getSecret('ALLOWED_EMAIL_DOMAINS').catch(() => 'sentry.io');
    ALLOWED_DOMAINS = allowedDomainsStr.split(',').map(d => d.trim());
  } catch (error) {
    console.error('Failed to fetch configuration secrets:', error);
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }

  // Handle OAuth errors from Google
  if (error) {
    res.status(400).send(`
<!DOCTYPE html>
<html>
<head>
  <title>Authentication Error</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, sans-serif; padding: 40px; text-align: center; }
    .error { color: #d32f2f; }
  </style>
</head>
<body>
  <h1 class="error">Authentication Failed</h1>
  <p>Google OAuth error: ${error}</p>
</body>
</html>
    `);
    return;
  }

  if (!code || !state) {
    res.status(400).json({ error: 'invalid_request', error_description: 'Missing code or state' });
    return;
  }

  try {
    // Decode OAuth state
    const oauthState = JSON.parse(Buffer.from(state as string, 'base64url').toString('utf-8'));
    const { cowork_redirect_uri, cowork_state, code_challenge, code_challenge_method, resource } = oauthState;

    // Exchange Google auth code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: code as string,
        client_id: GOOGLE_CLIENT_ID || '',
        client_secret: GOOGLE_CLIENT_SECRET || '',
        redirect_uri: `https://${req.headers.host}/api/oauth/callback`,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      console.error('Google token exchange failed:', errorBody);
      throw new Error('Failed to exchange Google authorization code');
    }

    const tokens = await tokenResponse.json();

    // Verify ID token and get user info
    const userInfoResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${tokens.id_token}`);

    if (!userInfoResponse.ok) {
      throw new Error('Failed to verify ID token');
    }

    const userInfo = await userInfoResponse.json();

    // Check email domain
    const email = userInfo.email;
    const emailDomain = email.split('@')[1];

    if (!ALLOWED_DOMAINS.includes(emailDomain)) {
      res.status(403).send(`
<!DOCTYPE html>
<html>
<head>
  <title>Access Denied</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, sans-serif; padding: 40px; text-align: center; }
    .error { color: #d32f2f; }
  </style>
</head>
<body>
  <h1 class="error">Access Denied</h1>
  <p>Only @sentry.io and @getsentry.com email addresses are allowed.</p>
  <p>Your email: ${email}</p>
</body>
</html>
      `);
      return;
    }

    // Generate authorization code (short-lived, single-use)
    // Include PKCE parameters and resource for verification at token endpoint
    const authCode = generateAuthCode(email, TOKEN_SECRET, code_challenge, resource);

    // Redirect back to Cowork with authorization code
    const coworkCallbackUrl = new URL(cowork_redirect_uri as string);
    coworkCallbackUrl.searchParams.set('code', authCode);
    coworkCallbackUrl.searchParams.set('state', cowork_state as string);

    console.log(`Redirecting authenticated user ${email} back to Cowork`);
    res.redirect(coworkCallbackUrl.toString());

  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Generate a short-lived authorization code
 * Format: base64url(payload).signature
 * Payload: JSON with email, expiresAt, nonce, code_challenge, resource
 * Valid for 10 minutes
 */
function generateAuthCode(
  email: string,
  tokenSecret: string,
  codeChallenge: string,
  resource: string
): string {
  const timestamp = Date.now();
  const expiresAt = timestamp + (10 * 60 * 1000); // 10 minutes
  const nonce = Math.random().toString(36).substring(2, 15);

  // Include PKCE and resource for verification at token endpoint
  const payload = JSON.stringify({
    email,
    expiresAt,
    nonce,
    codeChallenge,
    resource,
  });

  const signature = createHmac('sha256', tokenSecret)
    .update(payload)
    .digest('base64url');

  return `${Buffer.from(payload).toString('base64url')}.${signature}`;
}

/**
 * Verify and decode an authorization code
 * Note: This function needs TOKEN_SECRET from environment/GCP as a fallback
 * since it's called from other modules (api/oauth/token.ts) without async context
 */
export function verifyAuthCode(
  code: string,
  tokenSecret?: string
): { email: string; expiresAt: number; codeChallenge: string; resource: string } | null {
  try {
    const [payloadB64, signature] = code.split('.');
    const payload = Buffer.from(payloadB64, 'base64url').toString('utf-8');

    // Use provided secret or fall back to environment variable
    const secret = tokenSecret || process.env.TOKEN_SECRET || 'change-me-in-production';

    // Verify signature
    const expectedSignature = createHmac('sha256', secret)
      .update(payload)
      .digest('base64url');

    if (signature !== expectedSignature) {
      return null;
    }

    const parsed = JSON.parse(payload);
    const { email, expiresAt, codeChallenge, resource } = parsed;

    // Check expiration
    if (Date.now() > expiresAt) {
      console.log('Authorization code expired');
      return null;
    }

    return { email, expiresAt, codeChallenge, resource };
  } catch {
    return null;
  }
}
