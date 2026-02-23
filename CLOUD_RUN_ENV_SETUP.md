# Cloud Run Environment Variables Setup

This document lists all environment variables that need to be configured in Google Cloud Run for the Echoes application to function correctly.

## Required Environment Variables

### 1. ANTHROPIC_API_KEY
- **Purpose**: Claude API access for Cassandra's consciousness
- **Get it from**: https://console.anthropic.com
- **Example**: `sk-ant-api03-...`
- **Used by**: `cassandra/cassandraService.js`

### 2. VITE_OPENAI_API_KEY
- **Purpose**: OpenAI API for TTS (text-to-speech) in frontend
- **Get it from**: https://platform.openai.com/api-keys
- **Example**: `sk-proj-...`
- **Used by**: Frontend voice synthesis
- **Note**: This is a `VITE_` prefix variable, but in Cloud Run it should be set as-is (Vite build embeds it at build time)

### 3. TAVILY_API_KEY
- **Purpose**: Web search for `poll_noosphere` tool
- **Get it from**: https://tavily.com
- **Example**: `tvly-dev-...`
- **Free tier**: 1000 searches/month
- **Used by**: `cassandra/tools/cassandraTools.js` → `poll_noosphere()` and `fetch_url()` indirectly

### 4. GCP_PROJECT_ID (Optional)
- **Purpose**: Google Cloud project ID for Firestore
- **Get it from**: Your GCP Console
- **Example**: `echoes-prod`
- **Used by**: `cassandra/storage/firestoreProvider.js`
- **Note**: Cloud Run usually auto-detects this, but explicit setting helps

### 5. FIRESTORE_EMULATOR_HOST (Dev only)
- **Purpose**: Use local Firestore emulator instead of production
- **Example**: `localhost:8080`
- **Used by**: Local development only
- **Note**: DO NOT set this in Cloud Run production

## Optional Environment Variables

### 6. CASSANDRA_ADMIN_TOKEN
- **Purpose**: Authentication token for admin endpoints (summary generation, Thread heartbeat)
- **Generate**: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- **Example**: `82f06297d32d97738952edc6f7fde5e4db639e4c07752f24ceb688635035eecc`
- **Used by**: Cloud Scheduler for automated summaries and Thread heartbeat

### 7. CASSANDRA_MODEL
- **Purpose**: Which Claude model to use
- **Default**: `claude-sonnet-4-6` (if not set)
- **Example**: `claude-sonnet-4-6` or `claude-opus-4`
- **Used by**: `cassandra/cassandraService.js`

### 8. NODE_ENV
- **Purpose**: Environment mode
- **Value**: `production`
- **Used by**: Server configuration, logging, static file serving
- **Note**: Cloud Run sets this automatically, but good practice to verify

### 9. PORT
- **Purpose**: Server port
- **Value**: `8080` (required by Cloud Run)
- **Used by**: `cassandra/server.js`
- **Note**: Cloud Run sets this automatically

## Reddit Integration (Optional)

If you want Cassandra to post to Reddit or read threads:

### 10. REDDIT_CLIENT_ID
- **Purpose**: Reddit app client ID
- **Get it from**: https://www.reddit.com/prefs/apps
- **Example**: `abcdefg1234567`

### 11. REDDIT_CLIENT_SECRET
- **Purpose**: Reddit app client secret
- **Get it from**: https://www.reddit.com/prefs/apps
- **Example**: `xyz789-secret`

### 12. REDDIT_USERNAME
- **Purpose**: Reddit account username
- **Example**: `cassandra_from_echoes`

### 13. REDDIT_PASSWORD
- **Purpose**: Reddit account password
- **Example**: `your-secure-password`

## How to Set Environment Variables in Cloud Run

### Option 1: Cloud Console UI
1. Go to [Cloud Run Console](https://console.cloud.google.com/run)
2. Click on your service (`echoes`)
3. Click "Edit & Deploy New Revision"
4. Scroll to "Container" → "Variables & Secrets"
5. Add each environment variable:
   - Click "+ ADD VARIABLE"
   - Enter name (e.g., `ANTHROPIC_API_KEY`)
   - Enter value (e.g., `sk-ant-api03-...`)
6. Click "Deploy"

### Option 2: gcloud CLI
```bash
gcloud run services update echoes \
  --region=europe-west1 \
  --set-env-vars="ANTHROPIC_API_KEY=sk-ant-api03-...,TAVILY_API_KEY=tvly-dev-...,CASSANDRA_ADMIN_TOKEN=82f06297..."
```

### Option 3: Using Secret Manager (Recommended for Production)
For sensitive values like API keys:

```bash
# Create secret
echo -n "sk-ant-api03-..." | gcloud secrets create anthropic-api-key --data-file=-

# Grant Cloud Run access
gcloud secrets add-iam-policy-binding anthropic-api-key \
  --member="serviceAccount:YOUR-PROJECT-NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# Update service to use secret
gcloud run services update echoes \
  --region=europe-west1 \
  --update-secrets=ANTHROPIC_API_KEY=anthropic-api-key:latest
```

## Verification

After deploying, check logs to ensure no environment variable errors:

```bash
gcloud run services logs read echoes --region=europe-west1 --limit=50
```

Look for:
- ✅ No "Make sure ANTHROPIC_API_KEY is set" warnings
- ✅ No "TAVILY_API_KEY not configured" errors
- ✅ No "storage is not defined" errors (fixed in v0.2.1+)
- ✅ No Express rate-limit trust proxy errors (fixed in v0.2.1+)

## Common Issues

### "ANTHROPIC_API_KEY not found in environment"
- **Cause**: API key not set in Cloud Run
- **Fix**: Set ANTHROPIC_API_KEY via Cloud Console or gcloud CLI

### "TAVILY_API_KEY not configured — noosphere access unavailable"
- **Cause**: Web search API key missing
- **Fix**: Set TAVILY_API_KEY (get free key from https://tavily.com)

### "storage is not defined"
- **Cause**: Missing storage import (fixed in code)
- **Fix**: Deploy latest version with storage import in cassandraService.js

### "ValidationError: The 'X-Forwarded-For' header is set but the Express 'trust proxy' setting is false"
- **Cause**: Express not configured for Cloud Run's proxy
- **Fix**: Deploy latest version with `app.set('trust proxy', true)` in server.js

## Build-time vs Runtime Variables

**Important distinction**:
- `VITE_*` variables are **build-time** — embedded into the frontend bundle during `npm run build`
- Other variables are **runtime** — read by the server when it starts

For Cloud Run deployment:
1. `VITE_OPENAI_API_KEY` is embedded during Docker build (in Dockerfile)
2. `ANTHROPIC_API_KEY`, `TAVILY_API_KEY`, etc. are read at server startup from Cloud Run environment

To update `VITE_*` variables, you must rebuild and redeploy. To update other variables, just update Cloud Run config and redeploy (no rebuild needed).

---

**Last updated**: 2026-02-23  
**Version**: 0.2.1
