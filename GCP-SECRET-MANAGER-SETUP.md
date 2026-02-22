# GCP Secret Manager Setup

## Why Use It?

- **Sensitive data**: Gong credentials give access to all sales calls/customer conversations
- **Audit logs**: Track every secret access
- **Rotation**: Update credentials without redeploying
- **Access control**: Better IAM than Vercel env vars
- **Cost**: Free for first 10k accesses/month (~$0 for your usage)

## Setup Steps

### 1. Enable GCP Secret Manager

```bash
# Authenticate with GCP
gcloud auth login

# Set your project (use your existing GCP project)
gcloud config set project YOUR_GCP_PROJECT_ID

# Enable Secret Manager API
gcloud services enable secretmanager.googleapis.com
```

### 2. Create Secrets

```bash
# Create secrets (one-time setup)
echo -n "YOUR_GONG_ACCESS_KEY" | gcloud secrets create GONG_ACCESS_KEY --data-file=-
echo -n "YOUR_GONG_SECRET" | gcloud secrets create GONG_ACCESS_KEY_SECRET --data-file=-
echo -n "YOUR_GOOGLE_CLIENT_ID" | gcloud secrets create GOOGLE_CLIENT_ID --data-file=-
echo -n "YOUR_GOOGLE_CLIENT_SECRET" | gcloud secrets create GOOGLE_CLIENT_SECRET --data-file=-

# Generate and store TOKEN_SECRET
openssl rand -base64 32 | gcloud secrets create TOKEN_SECRET --data-file=-

# Optional: allowed domains
echo -n "sentry.io,getsentry.com" | gcloud secrets create ALLOWED_EMAIL_DOMAINS --data-file=-
```

### 3. Create Service Account for Vercel

```bash
# Create service account
gcloud iam service-accounts create gong-mcp-vercel \
  --display-name="Gong MCP Server (Vercel)"

# Grant access to secrets
for SECRET in GONG_ACCESS_KEY GONG_ACCESS_KEY_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET TOKEN_SECRET ALLOWED_EMAIL_DOMAINS; do
  gcloud secrets add-iam-policy-binding $SECRET \
    --member="serviceAccount:gong-mcp-vercel@YOUR_GCP_PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done

# Create key for service account
gcloud iam service-accounts keys create gcp-key.json \
  --iam-account=gong-mcp-vercel@YOUR_GCP_PROJECT_ID.iam.gserviceaccount.com

# IMPORTANT: This downloads gcp-key.json - DO NOT commit this file!
# Add to .gitignore
echo "gcp-key.json" >> .gitignore
```

### 4. Add to Vercel

The service account key is a JSON file. You need to add it to Vercel as a single-line string:

```bash
# Convert JSON to single line (for Vercel env var)
cat gcp-key.json | jq -c . | pbcopy

# Now add to Vercel
vercel env add GCP_SERVICE_ACCOUNT_KEY production preview
# Paste the value from clipboard

# Also add your GCP project ID
vercel env add GCP_PROJECT_ID production preview
# Enter your project ID
```

### 5. Update Code

See `src/gcp-secrets.ts` for the implementation.

## Rotating Secrets

```bash
# Update a secret (creates new version automatically)
echo -n "NEW_VALUE" | gcloud secrets versions add GONG_ACCESS_KEY --data-file=-

# Secrets are versioned - old versions still accessible
gcloud secrets versions list GONG_ACCESS_KEY

# Disable old version after rotation
gcloud secrets versions disable 1 --secret=GONG_ACCESS_KEY
```

## Cost

- First 10,000 accesses/month: **FREE**
- Beyond that: $0.03 per 10,000 accesses
- 6 active secret versions: **FREE**
- Additional versions: $0.06/month each

**Your estimated cost**: $0/month (well under free tier)

## Audit Logs

View who accessed secrets when:
```bash
gcloud logging read "resource.type=secretmanager.googleapis.com/Secret" --limit 50
```

## Alternative: Use Vercel for Now, Migrate Later

If you want to ship faster:
1. Keep using Vercel env vars for now
2. Add GCP Secret Manager later (code change is minimal)
3. The abstraction in `src/gcp-secrets.ts` makes migration easy
