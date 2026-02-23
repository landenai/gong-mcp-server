/**
 * OAuth Authentication Flow for Gong MCP Server
 *
 * User flow:
 * 1. Visit /auth
 * 2. Click "Sign in with Google"
 * 3. Complete Google OAuth
 * 4. Get a long-lived API token
 * 5. Use token in MCP client: Authorization: Bearer <token>
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomBytes, createHmac } from 'crypto';
import { getSecret } from '../dist/secrets.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { code, error } = req.query;

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
    // Read ALLOWED_EMAIL_DOMAINS from Vercel env var (not GCP Secret Manager)
    const allowedDomainsStr = process.env.ALLOWED_EMAIL_DOMAINS || 'sentry.io';
    ALLOWED_DOMAINS = allowedDomainsStr.split(',').map(d => d.trim());
  } catch (error) {
    console.error('Failed to fetch configuration secrets:', error);
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }

  // Step 1: Show login page
  if (!code && !error) {
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID || '',
      redirect_uri: `https://${req.headers.host}/api/auth`,
      response_type: 'code',
      scope: 'email profile',
      access_type: 'offline',
      prompt: 'select_account',
    })}`;

    res.setHeader('Content-Type', 'text/html');
    res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Gong MCP Server - Authentication</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 16px;
      padding: 48px;
      max-width: 480px;
      width: 100%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    h1 {
      font-size: 28px;
      margin-bottom: 12px;
      color: #1a1a1a;
    }
    p {
      color: #666;
      line-height: 1.6;
      margin-bottom: 24px;
    }
    .feature {
      display: flex;
      align-items: start;
      margin-bottom: 16px;
      padding: 12px;
      background: #f8f9fa;
      border-radius: 8px;
    }
    .feature svg {
      margin-right: 12px;
      flex-shrink: 0;
    }
    .feature-text {
      font-size: 14px;
      color: #444;
    }
    .btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      padding: 14px 24px;
      background: white;
      border: 2px solid #ddd;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      color: #444;
      text-decoration: none;
      cursor: pointer;
      transition: all 0.2s;
      margin-top: 24px;
    }
    .btn:hover {
      border-color: #667eea;
      background: #f8f9fa;
    }
    .btn svg {
      margin-right: 12px;
    }
    .info {
      margin-top: 24px;
      padding: 16px;
      background: #e3f2fd;
      border-left: 4px solid #2196f3;
      border-radius: 4px;
      font-size: 14px;
      color: #1565c0;
    }
    .info strong {
      display: block;
      margin-bottom: 8px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔐 Gong MCP Server</h1>
    <p>Sign in with your Sentry Google account to get an API token for the MCP server.</p>

    <div class="feature">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M10 0C4.477 0 0 4.477 0 10s4.477 10 10 10 10-4.477 10-10S15.523 0 10 0zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8z" fill="#4CAF50"/>
        <path d="M14.59 5.58L8 12.17 5.41 9.59 4 11l4 4 8-8-1.41-1.42z" fill="#4CAF50"/>
      </svg>
      <div class="feature-text">
        <strong>Sentry Team Only</strong>
        Only @sentry.io and @getsentry.com emails allowed
      </div>
    </div>

    <div class="feature">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M10 1C5.03 1 1 5.03 1 10s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9zm0 16c-3.86 0-7-3.14-7-7s3.14-7 7-7 7 3.14 7 7-3.14 7-7 7z" fill="#2196F3"/>
        <path d="M10.5 5H9v6l5.25 3.15.75-1.23-4.5-2.67V5z" fill="#2196F3"/>
      </svg>
      <div class="feature-text">
        <strong>Long-Lived Token</strong>
        Get a token that works for 1 year
      </div>
    </div>

    <div class="feature">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M10 0C4.477 0 0 4.477 0 10s4.477 10 10 10 10-4.477 10-10S15.523 0 10 0zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8z" fill="#FF9800"/>
        <path d="M9 5h2v2H9V5zm0 4h2v6H9V9z" fill="#FF9800"/>
      </svg>
      <div class="feature-text">
        <strong>Configure Once</strong>
        Use token in Claude Desktop, Code, or Cowork
      </div>
    </div>

    <a href="${authUrl}" class="btn">
      <svg width="20" height="20" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
      Sign in with Google
    </a>

    <div class="info">
      <strong>What happens next?</strong>
      You'll authenticate with Google, then receive an API token to use in your MCP client configuration.
    </div>
  </div>
</body>
</html>
    `);
    return;
  }

  // Step 2: Handle OAuth callback
  if (error) {
    res.status(400).send(`Authentication error: ${error}`);
    return;
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: code as string,
        client_id: GOOGLE_CLIENT_ID || '',
        client_secret: GOOGLE_CLIENT_SECRET || '',
        redirect_uri: `https://${req.headers.host}/api/auth`,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to exchange authorization code');
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
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: #f5f5f5;
      margin: 0;
      padding: 20px;
    }
    .container {
      background: white;
      padding: 48px;
      border-radius: 12px;
      max-width: 480px;
      text-align: center;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    h1 { color: #d32f2f; margin-bottom: 16px; }
    p { color: #666; line-height: 1.6; }
    .email { font-weight: 600; color: #1a1a1a; }
  </style>
</head>
<body>
  <div class="container">
    <h1>❌ Access Denied</h1>
    <p>Only <strong>@sentry.io</strong> and <strong>@getsentry.com</strong> email addresses are allowed.</p>
    <p class="email">Your email: ${email}</p>
  </div>
</body>
</html>
      `);
      return;
    }

    // Generate long-lived API token
    const apiToken = generateApiToken(email, TOKEN_SECRET);

    // Show success page with token
    res.setHeader('Content-Type', 'text/html');
    res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Authentication Successful</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 16px;
      padding: 48px;
      max-width: 600px;
      width: 100%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    h1 {
      font-size: 28px;
      margin-bottom: 12px;
      color: #1a1a1a;
    }
    .success {
      display: flex;
      align-items: center;
      padding: 16px;
      background: #e8f5e9;
      border-radius: 8px;
      margin-bottom: 24px;
    }
    .success svg {
      margin-right: 12px;
      flex-shrink: 0;
    }
    .token-section {
      background: #f8f9fa;
      border-radius: 8px;
      padding: 20px;
      margin: 24px 0;
    }
    .token-label {
      font-size: 14px;
      font-weight: 600;
      color: #666;
      margin-bottom: 8px;
    }
    .token-box {
      background: white;
      border: 2px solid #ddd;
      border-radius: 6px;
      padding: 12px;
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 13px;
      word-break: break-all;
      color: #1a1a1a;
      margin-bottom: 12px;
    }
    .btn {
      width: 100%;
      padding: 12px;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }
    .btn:hover {
      background: #5568d3;
    }
    .btn:active {
      background: #4854b8;
    }
    .instructions {
      margin-top: 24px;
      padding: 20px;
      background: #e3f2fd;
      border-radius: 8px;
    }
    .instructions h3 {
      font-size: 16px;
      margin-bottom: 12px;
      color: #1565c0;
    }
    .instructions code {
      background: white;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 13px;
      color: #d32f2f;
    }
    .instructions pre {
      background: white;
      padding: 12px;
      border-radius: 6px;
      overflow-x: auto;
      margin-top: 12px;
      font-size: 12px;
      line-height: 1.5;
    }
    .user-info {
      font-size: 14px;
      color: #666;
      margin-top: 16px;
    }
    .copied {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: #4caf50;
      color: white;
      padding: 12px 24px;
      border-radius: 6px;
      font-weight: 600;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      opacity: 0;
      transition: opacity 0.3s;
    }
    .copied.show {
      opacity: 1;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>✅ Authentication Successful!</h1>

    <div class="success">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill="#4CAF50"/>
      </svg>
      <div>
        <strong>Signed in as:</strong> ${email}
      </div>
    </div>

    <div class="token-section">
      <div class="token-label">Your API Token (valid for 1 year):</div>
      <div class="token-box" id="token">${apiToken}</div>
      <button class="btn" onclick="copyToken()">📋 Copy Token</button>
    </div>

    <div class="instructions">
      <h3>🔧 How to Use This Token</h3>
      <p style="font-size: 14px; color: #444; margin-bottom: 12px;">
        Configure your MCP client with this token. The token will be sent in the Authorization header.
      </p>

      <strong style="display: block; margin-top: 16px; margin-bottom: 8px; font-size: 14px;">For HTTP requests:</strong>
      <pre>Authorization: Bearer ${apiToken.substring(0, 40)}...</pre>

      <strong style="display: block; margin-top: 16px; margin-bottom: 8px; font-size: 14px;">MCP Server URL:</strong>
      <pre>https://gong-mcp-server.sentry.dev/mcp</pre>
    </div>

    <div class="user-info">
      ⏰ Token expires: ${new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toLocaleDateString()}
    </div>
  </div>

  <div class="copied" id="copied">✓ Token copied to clipboard!</div>

  <script>
    function copyToken() {
      const token = document.getElementById('token').textContent;
      navigator.clipboard.writeText(token).then(() => {
        const copiedEl = document.getElementById('copied');
        copiedEl.classList.add('show');
        setTimeout(() => copiedEl.classList.remove('show'), 2000);
      });
    }
  </script>
</body>
</html>
    `);

  } catch (error) {
    console.error('OAuth error:', error);
    res.status(500).json({
      error: 'Authentication failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Generate a secure API token for the user
 * Format: email:timestamp:signature
 */
function generateApiToken(email: string, tokenSecret: string): string {
  const timestamp = Date.now();
  const expiresAt = timestamp + (365 * 24 * 60 * 60 * 1000); // 1 year
  const payload = `${email}:${expiresAt}`;
  const signature = createHmac('sha256', tokenSecret)
    .update(payload)
    .digest('base64url');

  return `${Buffer.from(payload).toString('base64url')}.${signature}`;
}

/**
 * Verify and decode an API token
 * Note: This function needs TOKEN_SECRET from environment/GCP as a fallback
 * since it's called from other modules (api/mcp.ts) without async context
 */
export function verifyApiToken(token: string, tokenSecret?: string): { email: string; expiresAt: number } | null {
  try {
    const [payloadB64, signature] = token.split('.');
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

    const [email, expiresAtStr] = payload.split(':');
    const expiresAt = parseInt(expiresAtStr, 10);

    // Check expiration
    if (Date.now() > expiresAt) {
      return null;
    }

    return { email, expiresAt };
  } catch {
    return null;
  }
}
