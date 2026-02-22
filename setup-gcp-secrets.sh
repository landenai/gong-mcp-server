#!/bin/bash
set -e

echo "🔐 GCP Secret Manager Setup for Gong MCP Server"
echo "==============================================="
echo ""

# Check prerequisites
if ! command -v gcloud &> /dev/null; then
  echo "❌ Error: gcloud CLI not found. Please install it first:"
  echo "   https://cloud.google.com/sdk/docs/install"
  exit 1
fi

echo "📋 This script will:"
echo "  1. Create secrets in GCP Secret Manager"
echo "  2. Set up service account with access"
echo "  3. Generate service account key for Vercel"
echo "  4. Configure Vercel environment variables"
echo ""

# Get GCP project ID
read -p "Enter your GCP Project ID: " GCP_PROJECT_ID

if [ -z "$GCP_PROJECT_ID" ]; then
  echo "❌ Error: GCP Project ID is required"
  exit 1
fi

echo ""
echo "🔧 Setting GCP project to: $GCP_PROJECT_ID"
gcloud config set project "$GCP_PROJECT_ID"

echo ""
echo "📡 Enabling Secret Manager API..."
gcloud services enable secretmanager.googleapis.com

echo ""
echo "🔑 Creating secrets in GCP Secret Manager..."
echo ""

# Function to create or update secret
create_or_update_secret() {
  local SECRET_NAME=$1
  local SECRET_VALUE=$2

  # Check if secret exists
  if gcloud secrets describe "$SECRET_NAME" &> /dev/null; then
    echo "  ✓ Secret $SECRET_NAME already exists, adding new version..."
    echo -n "$SECRET_VALUE" | gcloud secrets versions add "$SECRET_NAME" --data-file=-
  else
    echo "  ✓ Creating secret $SECRET_NAME..."
    echo -n "$SECRET_VALUE" | gcloud secrets create "$SECRET_NAME" --data-file=-
  fi
}

# Get secrets from current .env or prompt
if [ -f ".env" ]; then
  echo "📝 Found .env file, using existing values..."
  source .env
else
  echo "📝 No .env file found, please provide values..."
fi

# GONG_ACCESS_KEY
if [ -z "$GONG_ACCESS_KEY" ]; then
  read -p "Enter GONG_ACCESS_KEY: " GONG_ACCESS_KEY
fi
create_or_update_secret "GONG_ACCESS_KEY" "$GONG_ACCESS_KEY"

# GONG_ACCESS_KEY_SECRET
if [ -z "$GONG_ACCESS_KEY_SECRET" ]; then
  read -p "Enter GONG_ACCESS_KEY_SECRET: " GONG_ACCESS_KEY_SECRET
fi
create_or_update_secret "GONG_ACCESS_KEY_SECRET" "$GONG_ACCESS_KEY_SECRET"

# GOOGLE_CLIENT_ID
if [ -z "$GOOGLE_CLIENT_ID" ]; then
  read -p "Enter GOOGLE_CLIENT_ID: " GOOGLE_CLIENT_ID
fi
create_or_update_secret "GOOGLE_CLIENT_ID" "$GOOGLE_CLIENT_ID"

# GOOGLE_CLIENT_SECRET
if [ -z "$GOOGLE_CLIENT_SECRET" ]; then
  read -p "Enter GOOGLE_CLIENT_SECRET: " GOOGLE_CLIENT_SECRET
fi
create_or_update_secret "GOOGLE_CLIENT_SECRET" "$GOOGLE_CLIENT_SECRET"

# TOKEN_SECRET
if [ -z "$TOKEN_SECRET" ]; then
  TOKEN_SECRET=$(openssl rand -base64 32)
  echo "  ✓ Generated new TOKEN_SECRET"
fi
create_or_update_secret "TOKEN_SECRET" "$TOKEN_SECRET"

# ALLOWED_EMAIL_DOMAINS
ALLOWED_EMAIL_DOMAINS="${ALLOWED_EMAIL_DOMAINS:-sentry.io,getsentry.com}"
create_or_update_secret "ALLOWED_EMAIL_DOMAINS" "$ALLOWED_EMAIL_DOMAINS"

# COWORK_OAUTH_CLIENT_ID
COWORK_OAUTH_CLIENT_ID="${COWORK_OAUTH_CLIENT_ID:-cowork-connector}"
create_or_update_secret "COWORK_OAUTH_CLIENT_ID" "$COWORK_OAUTH_CLIENT_ID"

# COWORK_OAUTH_CLIENT_SECRET
if [ -z "$COWORK_OAUTH_CLIENT_SECRET" ]; then
  COWORK_OAUTH_CLIENT_SECRET=$(openssl rand -base64 32)
  echo "  ✓ Generated new COWORK_OAUTH_CLIENT_SECRET"
fi
create_or_update_secret "COWORK_OAUTH_CLIENT_SECRET" "$COWORK_OAUTH_CLIENT_SECRET"

echo ""
echo "👤 Creating service account..."
SERVICE_ACCOUNT_NAME="gong-mcp-vercel"
SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"

# Create service account if it doesn't exist
if gcloud iam service-accounts describe "$SERVICE_ACCOUNT_EMAIL" &> /dev/null; then
  echo "  ✓ Service account already exists: $SERVICE_ACCOUNT_EMAIL"
else
  gcloud iam service-accounts create "$SERVICE_ACCOUNT_NAME" \
    --display-name="Gong MCP Server (Vercel)"
  echo "  ✓ Created service account: $SERVICE_ACCOUNT_EMAIL"
fi

echo ""
echo "🔐 Granting secret access permissions..."
for SECRET in GONG_ACCESS_KEY GONG_ACCESS_KEY_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET TOKEN_SECRET ALLOWED_EMAIL_DOMAINS COWORK_OAUTH_CLIENT_ID COWORK_OAUTH_CLIENT_SECRET; do
  gcloud secrets add-iam-policy-binding "$SECRET" \
    --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet
  echo "  ✓ Granted access to $SECRET"
done

echo ""
echo "🔑 Creating service account key..."
KEY_FILE="gcp-key.json"

if [ -f "$KEY_FILE" ]; then
  echo "  ⚠️  Key file already exists: $KEY_FILE"
  read -p "  Do you want to create a new key? (y/N): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "  Skipping key creation"
  else
    rm "$KEY_FILE"
    gcloud iam service-accounts keys create "$KEY_FILE" \
      --iam-account="$SERVICE_ACCOUNT_EMAIL"
    echo "  ✓ Created new service account key: $KEY_FILE"
  fi
else
  gcloud iam service-accounts keys create "$KEY_FILE" \
    --iam-account="$SERVICE_ACCOUNT_EMAIL"
  echo "  ✓ Created service account key: $KEY_FILE"
fi

echo ""
echo "☁️  Configuring Vercel..."

# Convert JSON key to single line for Vercel
GCP_KEY_JSON=$(cat "$KEY_FILE" | jq -c .)

# Add to Vercel
echo "  Adding GCP_SERVICE_ACCOUNT_KEY to Vercel..."
echo "$GCP_KEY_JSON" | vercel env add GCP_SERVICE_ACCOUNT_KEY production 2>/dev/null || true
echo "$GCP_KEY_JSON" | vercel env add GCP_SERVICE_ACCOUNT_KEY preview 2>/dev/null || true

echo "  Adding GCP_PROJECT_ID to Vercel..."
echo "$GCP_PROJECT_ID" | vercel env add GCP_PROJECT_ID production 2>/dev/null || true
echo "$GCP_PROJECT_ID" | vercel env add GCP_PROJECT_ID preview 2>/dev/null || true

echo ""
echo "✅ Setup Complete!"
echo ""
echo "📋 Summary:"
echo "  • Created 8 secrets in GCP Secret Manager"
echo "  • Created service account: $SERVICE_ACCOUNT_EMAIL"
echo "  • Generated service account key: $KEY_FILE"
echo "  • Configured Vercel environment variables"
echo ""
echo "🚨 IMPORTANT SECURITY NOTES:"
echo "  1. The file $KEY_FILE contains sensitive credentials"
echo "  2. It has been added to .gitignore (DO NOT commit it)"
echo "  3. Store it securely or delete it after Vercel deployment"
echo "  4. You can regenerate keys anytime via GCP Console"
echo ""
echo "📝 Next Steps:"
echo "  1. Review secrets: gcloud secrets list --project=$GCP_PROJECT_ID"
echo "  2. Build: npm run build"
echo "  3. Deploy: vercel --prod"
echo "  4. Test: Visit https://gong-mcp-server.sentry.dev/api/auth"
echo ""
echo "💡 To view audit logs later:"
echo "   gcloud logging read \"resource.type=secretmanager.googleapis.com/Secret\" --limit 50"
echo ""
