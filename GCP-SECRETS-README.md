# GCP Secret Manager Integration

This guide explains how the Gong MCP Server uses GCP Secret Manager for enterprise-grade secret management.

## Why GCP Secret Manager?

### Security Benefits
✅ **Audit Trail**: Every secret access is logged (who, what, when)
✅ **Access Control**: Fine-grained IAM permissions per secret
✅ **Versioning**: Keep old versions during rotation, rollback if needed
✅ **Encryption**: Secrets encrypted at rest with Google-managed keys
✅ **Compliance**: Meets SOC2, ISO 27001, HIPAA requirements
✅ **No Manual Exposure**: Secrets never appear in Vercel UI or code

### Cost
- **First 10,000 accesses/month**: FREE
- **Beyond that**: $0.03 per 10,000 accesses
- **6 active secret versions**: FREE
- **Your estimated cost**: $0/month (well under free tier)

## Architecture

### How It Works

```
Vercel Serverless Function starts
    ↓
Reads GCP_SERVICE_ACCOUNT_KEY from Vercel env var
    ↓
Authenticates to GCP Secret Manager
    ↓
Fetches secrets (cached in memory for function lifetime)
    ↓
Uses secrets for Gong API calls, OAuth, token signing
    ↓
Function completes (memory cleared)
```

### Secrets Stored in GCP

| Secret Name | Purpose | Used By |
|------------|---------|---------|
| `GONG_ACCESS_KEY` | Gong API access key | api/mcp.ts |
| `GONG_ACCESS_KEY_SECRET` | Gong API secret | api/mcp.ts |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | api/auth.ts, api/oauth/* |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | api/auth.ts, api/oauth/* |
| `TOKEN_SECRET` | HMAC key for signing tokens | api/auth.ts, api/oauth/* |
| `ALLOWED_EMAIL_DOMAINS` | Allowed email domains | api/auth.ts, api/oauth/* |
| `COWORK_OAUTH_CLIENT_ID` | Cowork OAuth client ID | api/oauth/* |
| `COWORK_OAUTH_CLIENT_SECRET` | Cowork OAuth client secret | api/oauth/* |

### Vercel Environment Variables

Only 2 variables needed in Vercel (not the actual secrets!):

| Variable | Purpose |
|----------|---------|
| `GCP_PROJECT_ID` | Your GCP project ID |
| `GCP_SERVICE_ACCOUNT_KEY` | Service account credentials (JSON) |

## Setup

### Quick Setup (Automated)

```bash
# Run the setup script
chmod +x setup-gcp-secrets.sh
./setup-gcp-secrets.sh
```

This will:
1. Create secrets in GCP Secret Manager
2. Set up service account with minimal permissions
3. Generate service account key
4. Configure Vercel environment variables

### Manual Setup

See [GCP-SECRET-MANAGER-SETUP.md](./GCP-SECRET-MANAGER-SETUP.md) for detailed step-by-step instructions.

## How the Code Works

### Fetching Secrets

The `src/secrets.ts` module provides a simple interface:

```typescript
import { getSecret } from './dist/secrets.js';

// Fetch a single secret
const gongKey = await getSecret('GONG_ACCESS_KEY');

// Fetch multiple secrets in parallel
const [clientId, clientSecret] = await Promise.all([
  getSecret('GOOGLE_CLIENT_ID'),
  getSecret('GOOGLE_CLIENT_SECRET'),
]);
```

### Automatic Fallback

The secrets module automatically falls back to environment variables for local development:

1. **Production (Vercel)**: Fetches from GCP Secret Manager
2. **Local dev**: Reads from `.env` file or process.env
3. **Caching**: Secrets cached in memory (cleared on function termination)

### Example Usage in Endpoints

```typescript
// api/mcp.ts
import { getSecret } from '../dist/secrets.js';

export default async function handler(req, res) {
  // Fetch Gong credentials from GCP Secret Manager
  const accessKey = await getSecret('GONG_ACCESS_KEY');
  const accessKeySecret = await getSecret('GONG_ACCESS_KEY_SECRET');

  // Use credentials...
  const gongClient = new GongClient({ accessKey, accessKeySecret });
}
```

## Security Features

### Service Account Permissions

The service account has minimal permissions:
- **ONLY** `roles/secretmanager.secretAccessor` on specific secrets
- **NO** permissions to create, delete, or modify secrets
- **NO** permissions to manage IAM or other GCP resources

### Audit Logging

View who accessed secrets:

```bash
# View all secret accesses in last 7 days
gcloud logging read "resource.type=secretmanager.googleapis.com/Secret" \
  --limit 100 \
  --format json \
  --project YOUR_PROJECT_ID

# View specific secret accesses
gcloud logging read "resource.type=secretmanager.googleapis.com/Secret AND protoPayload.resourceName=projects/YOUR_PROJECT_ID/secrets/GONG_ACCESS_KEY/versions/latest" \
  --limit 50
```

### Service Account Key Security

⚠️ **CRITICAL**: The `gcp-key.json` file contains sensitive credentials:

✅ **DO**:
- Add to Vercel, then delete local copy
- Store securely if you need to keep it (password manager, vault)
- Rotate keys quarterly
- Review active keys regularly in GCP Console

❌ **DON'T**:
- Commit to git (already in .gitignore)
- Share via email or Slack
- Store in plaintext on your computer
- Use the same key across multiple environments

### Key Rotation

Rotate a service account key:

```bash
# Create new key
gcloud iam service-accounts keys create gcp-key-new.json \
  --iam-account=gong-mcp-vercel@YOUR_PROJECT_ID.iam.gserviceaccount.com

# Update Vercel
cat gcp-key-new.json | jq -c . | vercel env add GCP_SERVICE_ACCOUNT_KEY production

# Delete old key (get KEY_ID from GCP Console)
gcloud iam service-accounts keys delete KEY_ID \
  --iam-account=gong-mcp-vercel@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

## Secret Rotation

Rotate a secret without downtime:

```bash
# Update secret value (creates new version automatically)
echo -n "NEW_VALUE" | gcloud secrets versions add GONG_ACCESS_KEY --data-file=-

# Old version still available for rollback
gcloud secrets versions list GONG_ACCESS_KEY

# Disable old version after confirming new one works
gcloud secrets versions disable 1 --secret=GONG_ACCESS_KEY

# No code changes or redeployment needed!
```

## Local Development

### Option 1: Use Environment Variables (Recommended)

```bash
# Copy example env file
cp .env.example .env

# Edit .env with your credentials
# The secrets module will automatically use these
```

### Option 2: Use GCP Secret Manager Locally

```bash
# Authenticate with your personal GCP account
gcloud auth application-default login

# Set project
export GCP_PROJECT_ID=your-project-id

# Run locally
npm run dev
```

The secrets module will fetch from GCP Secret Manager using your personal credentials.

## Troubleshooting

### "Failed to fetch secret" in production

**Cause**: Service account doesn't have access

**Solution**:
```bash
# Grant access
gcloud secrets add-iam-policy-binding SECRET_NAME \
  --member="serviceAccount:gong-mcp-vercel@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### "Project ID not found"

**Cause**: GCP_PROJECT_ID not set in Vercel

**Solution**:
```bash
echo "YOUR_PROJECT_ID" | vercel env add GCP_PROJECT_ID production
```

### "Invalid service account key"

**Cause**: GCP_SERVICE_ACCOUNT_KEY malformed or missing

**Solution**:
```bash
# Recreate key and add to Vercel
cat gcp-key.json | jq -c . | vercel env add GCP_SERVICE_ACCOUNT_KEY production
```

### Secrets cached incorrectly

**Cause**: Serverless function reused with old cache

**Solution**: Secrets are automatically refreshed on next cold start. To force:
```bash
# Redeploy (forces new function instances)
vercel --prod --force
```

## Monitoring

### Check Secret Access

```bash
# How many times was a secret accessed today?
gcloud logging read "resource.type=secretmanager.googleapis.com/Secret AND timestamp>=2026-02-20" \
  --format="value(timestamp)" | wc -l

# Who accessed secrets?
gcloud logging read "resource.type=secretmanager.googleapis.com/Secret" \
  --format="table(timestamp,protoPayload.authenticationInfo.principalEmail,protoPayload.resourceName)" \
  --limit 20
```

### Set Up Alerts

Create alerts for unusual access patterns:

```bash
# Alert if a secret is accessed more than 1000 times/hour
# (Set up in GCP Console → Monitoring → Alerting)
```

## Cost Tracking

```bash
# View Secret Manager usage
gcloud logging read "resource.type=secretmanager.googleapis.com/Secret" \
  --format="value(timestamp)" \
  --limit 10000 | wc -l

# If under 10k/month → $0 cost
```

## Comparison: Vercel Env Vars vs GCP Secret Manager

| Feature | Vercel Env Vars | GCP Secret Manager |
|---------|----------------|-------------------|
| **Security** | ⚠️ Visible in Vercel UI to all with project access | ✅ Not visible in UI, IAM controlled |
| **Audit Trail** | ❌ None | ✅ Every access logged |
| **Rotation** | ❌ Requires redeploy | ✅ Instant, no redeploy |
| **Versioning** | ❌ No history | ✅ All versions kept |
| **Compliance** | ⚠️ Basic | ✅ SOC2, ISO 27001 ready |
| **Cost** | ✅ Free | ✅ Free (under 10k access/month) |
| **Setup Complexity** | ✅ Simple | ⚠️ Moderate |

## Migration from Vercel Env Vars

The code automatically falls back to environment variables, so migration is non-breaking:

1. Set up GCP Secret Manager (secrets module tries GCP first)
2. Deploy (works with both GCP and Vercel env vars)
3. Verify GCP secrets working (check logs for "Retrieved from GCP")
4. Optionally remove secrets from Vercel (or keep as fallback)

## Best Practices

✅ **DO**:
- Use GCP Secret Manager for production
- Rotate service account keys quarterly
- Review audit logs monthly
- Use Vercel env vars only for non-sensitive config (like GCP_PROJECT_ID)
- Keep .env file for local development

❌ **DON'T**:
- Commit service account keys to git
- Share keys via email or Slack
- Grant overly broad IAM permissions
- Use same secrets for dev and production

## Additional Resources

- [GCP Secret Manager Docs](https://cloud.google.com/secret-manager/docs)
- [GCP Best Practices](https://cloud.google.com/secret-manager/docs/best-practices)
- [Audit Logging](https://cloud.google.com/secret-manager/docs/audit-logging)
- [IAM Permissions](https://cloud.google.com/secret-manager/docs/access-control)
