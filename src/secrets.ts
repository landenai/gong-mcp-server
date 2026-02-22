/**
 * Secrets Management
 *
 * Fetches secrets from GCP Secret Manager in production, with fallback to environment variables.
 * This provides enterprise-grade secret management with audit trails and rotation support.
 */

import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

// Cache secrets in memory for the duration of the serverless function execution
const secretCache = new Map<string, string>();

// Initialize GCP Secret Manager client
let secretClient: SecretManagerServiceClient | null = null;

function getSecretClient(): SecretManagerServiceClient | null {
  if (secretClient) return secretClient;

  try {
    // In production, Vercel will have GCP_SERVICE_ACCOUNT_KEY set
    const serviceAccountKey = process.env.GCP_SERVICE_ACCOUNT_KEY;

    if (serviceAccountKey) {
      const credentials = JSON.parse(serviceAccountKey);
      secretClient = new SecretManagerServiceClient({ credentials });
      console.log('✓ GCP Secret Manager client initialized');
      return secretClient;
    }
  } catch (error) {
    console.warn('Failed to initialize GCP Secret Manager client:', error);
  }

  return null;
}

/**
 * Get a secret from GCP Secret Manager with fallback to environment variables
 *
 * @param secretName - Name of the secret (e.g., 'GONG_ACCESS_KEY')
 * @param options - Configuration options
 * @returns The secret value
 */
export async function getSecret(
  secretName: string,
  options: {
    /** GCP project ID (required if using Secret Manager) */
    projectId?: string;
    /** Whether to cache the secret in memory (default: true) */
    cache?: boolean;
    /** Fallback to environment variable if GCP fails (default: true) */
    fallbackToEnv?: boolean;
  } = {}
): Promise<string> {
  const {
    projectId = process.env.GCP_PROJECT_ID,
    cache = true,
    fallbackToEnv = true
  } = options;

  // Check cache first
  if (cache && secretCache.has(secretName)) {
    return secretCache.get(secretName)!;
  }

  // Try GCP Secret Manager
  const client = getSecretClient();
  if (client && projectId) {
    try {
      const secretPath = `projects/${projectId}/secrets/${secretName}/versions/latest`;
      const [version] = await client.accessSecretVersion({ name: secretPath });

      const secretValue = version.payload?.data?.toString() || '';

      if (secretValue) {
        if (cache) {
          secretCache.set(secretName, secretValue);
        }
        console.log(`✓ Retrieved secret '${secretName}' from GCP Secret Manager`);
        return secretValue;
      }
    } catch (error) {
      console.warn(`Failed to fetch '${secretName}' from GCP Secret Manager:`, error);
      // Fall through to environment variable
    }
  }

  // Fallback to environment variable
  if (fallbackToEnv) {
    const envValue = process.env[secretName];
    if (envValue) {
      console.log(`✓ Retrieved secret '${secretName}' from environment variable`);
      if (cache) {
        secretCache.set(secretName, envValue);
      }
      return envValue;
    }
  }

  throw new Error(`Secret '${secretName}' not found in GCP Secret Manager or environment variables`);
}

/**
 * Get multiple secrets at once
 */
export async function getSecrets(secretNames: string[]): Promise<Record<string, string>> {
  const results = await Promise.all(
    secretNames.map(async (name) => {
      try {
        const value = await getSecret(name);
        return [name, value] as [string, string];
      } catch (error) {
        console.error(`Failed to fetch secret '${name}':`, error);
        return [name, ''] as [string, string];
      }
    })
  );

  return Object.fromEntries(results);
}

/**
 * Clear the secret cache (useful for testing or forced refresh)
 */
export function clearSecretCache(): void {
  secretCache.clear();
  console.log('✓ Secret cache cleared');
}

/**
 * Check if GCP Secret Manager is available
 */
export function isGCPSecretManagerAvailable(): boolean {
  return getSecretClient() !== null && !!process.env.GCP_PROJECT_ID;
}
