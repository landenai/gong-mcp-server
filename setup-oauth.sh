#!/bin/bash
set -e

echo "🔧 Setting up OAuth for Cowork Integration"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
  echo "❌ Error: Please run this script from the gong-mcp-server directory"
  exit 1
fi

echo "📝 Step 1: Generate OAuth Client Secret"
echo ""
CLIENT_SECRET=$(openssl rand -base64 32)
echo "Generated client secret: $CLIENT_SECRET"
echo ""

echo "💾 Step 2: Add credentials to Vercel"
echo ""

# Add COWORK_OAUTH_CLIENT_ID
echo "Adding COWORK_OAUTH_CLIENT_ID..."
printf "cowork-connector\n" | vercel env add COWORK_OAUTH_CLIENT_ID production

echo "Adding COWORK_OAUTH_CLIENT_ID to preview..."
printf "cowork-connector\n" | vercel env add COWORK_OAUTH_CLIENT_ID preview

# Add COWORK_OAUTH_CLIENT_SECRET
echo "Adding COWORK_OAUTH_CLIENT_SECRET..."
printf "$CLIENT_SECRET\n" | vercel env add COWORK_OAUTH_CLIENT_SECRET production

echo "Adding COWORK_OAUTH_CLIENT_SECRET to preview..."
printf "$CLIENT_SECRET\n" | vercel env add COWORK_OAUTH_CLIENT_SECRET preview

echo ""
echo "✅ Credentials added to Vercel!"
echo ""

echo "📋 Save these credentials for Cowork configuration:"
echo ""
echo "  OAuth Client ID:     cowork-connector"
echo "  OAuth Client Secret: $CLIENT_SECRET"
echo ""

echo "📖 Next steps:"
echo ""
echo "1. Add this redirect URI to Google Cloud Console:"
echo "   https://gong-mcp-server.sentry.dev/api/oauth/callback"
echo ""
echo "2. Deploy to production:"
echo "   npm run build && vercel --prod"
echo ""
echo "3. Configure in Cowork (see COWORK-OAUTH-SETUP.md for details)"
echo ""
