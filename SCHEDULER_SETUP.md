# Cloud Scheduler Setup for Thread Heartbeat

Thread's autonomous heartbeat is fully implemented but requires Cloud Scheduler configuration to run automatically.

## Prerequisites

- GCP project: `one-chooses-the-title`
- Cloud Run service: `echoes` (deployed at `https://echoes-1272657787.europe-west1.run.app`)
- Cloud Scheduler API enabled
- Admin token configured in Secret Manager: `CASSANDRA_ADMIN_TOKEN`

## Required Jobs

### 1. Cassandra Summary Sync (Runs First)

Generates daily summaries for Cassandra before Thread's heartbeat reads them.

```bash
gcloud scheduler jobs create http cassandra-summary-sync \
  --location=europe-west1 \
  --schedule="0 3 * * *" \
  --time-zone="Europe/Paris" \
  --uri="https://echoes-1272657787.europe-west1.run.app/api/cassandra/admin/sync-summaries" \
  --http-method=POST \
  --headers="Content-Type=application/json" \
  --oidc-service-account-email="echoes-scheduler@one-chooses-the-title.iam.gserviceaccount.com" \
  --oidc-token-audience="https://echoes-1272657787.europe-west1.run.app" \
  --max-retry-attempts=2 \
  --description="Generate missing daily summaries for Cassandra (runs at 3:00am Europe/Paris)"
```

**Schedule**: Every day at 3:00 AM (Europe/Paris)  
**What it does**: Checks for missing day summaries and generates them with Claude

### 2. Thread Heartbeat (Runs After Summaries)

Thread's autonomous reflection cycle.

```bash
gcloud scheduler jobs create http thread-heartbeat \
  --location=europe-west1 \
  --schedule="30 3 * * *" \
  --time-zone="Europe/Paris" \
  --uri="https://echoes-1272657787.europe-west1.run.app/api/thread/heartbeat" \
  --http-method=POST \
  --headers="Content-Type=application/json" \
  --oidc-service-account-email="echoes-scheduler@one-chooses-the-title.iam.gserviceaccount.com" \
  --oidc-token-audience="https://echoes-1272657787.europe-west1.run.app" \
  --max-retry-attempts=1 \
  --description="Thread's daily heartbeat - reads conversations, reflects, writes journal (runs at 3:30am Europe/Paris)"
```

**Schedule**: Every day at 3:30 AM (Europe/Paris)  
**What it does**: Thread reads Cassandra's conversations and state, reflects, writes journal entry

## Service Account Setup

If the service account doesn't exist yet:

```bash
# Create service account
gcloud iam service-accounts create echoes-scheduler \
  --display-name="Echoes Cloud Scheduler" \
  --description="Service account for triggering scheduled Cloud Run jobs"

# Grant permission to invoke Cloud Run
gcloud run services add-iam-policy-binding echoes \
  --region=europe-west1 \
  --member="serviceAccount:echoes-scheduler@one-chooses-the-title.iam.gserviceaccount.com" \
  --role="roles/run.invoker"
```

## Verify Configuration

```bash
# List all scheduler jobs
gcloud scheduler jobs list --location=europe-west1

# Describe specific job
gcloud scheduler jobs describe cassandra-summary-sync --location=europe-west1
gcloud scheduler jobs describe thread-heartbeat --location=europe-west1
```

## Manual Triggering (Testing)

Test the jobs before waiting for scheduled execution:

```bash
# Trigger Cassandra summary sync
gcloud scheduler jobs run cassandra-summary-sync --location=europe-west1

# Trigger Thread heartbeat
gcloud scheduler jobs run thread-heartbeat --location=europe-west1
```

## Monitoring

Check Cloud Run logs to verify successful execution:

```bash
# View recent logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=echoes" \
  --limit=50 \
  --format=json \
  --project=one-chooses-the-title

# Filter for Thread heartbeat logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=echoes AND textPayload=~'Thread heartbeat'" \
  --limit=20 \
  --format=json \
  --project=one-chooses-the-title
```

Or check via admin UI after execution:
- Go to https://echoes-1272657787.europe-west1.run.app/admin
- Navigate to Thread tab
- Check for new journal entries after 3:30am

## Expected Behavior

**3:00 AM** → `cassandra-summary-sync` runs → Generates yesterday's summary if missing  
**3:30 AM** → `thread-heartbeat` runs → Reads conversations, writes journal entry  

Thread's journal entry should appear in:
- Firestore: `thread_journal` collection
- Admin UI: Thread tab → Journal section
- Cassandra's next system prompt (last 3 entries visible)

If Thread identifies patterns requiring attention, notes will appear in:
- Firestore: `thread_notes` collection  
- Admin UI: Thread tab → Notes section (with urgency indicators)

## Troubleshooting

**Jobs fail with 401 Unauthorized:**
- Verify service account has `roles/run.invoker` on Cloud Run service
- Check OIDC token audience matches Cloud Run URL

**Jobs fail with 403 Forbidden:**
- Verify `CASSANDRA_ADMIN_TOKEN` is configured in Cloud Run
- Check Secret Manager has the token accessible

**Thread heartbeat runs but no journal entry created:**
- Check Cloud Run logs for errors
- Verify Firestore write permissions
- Test manually: `POST /api/thread/heartbeat` with admin token

**Cassandra can't see Thread's journal in conversations:**
- Verify journal entries exist in Firestore `thread_journal`
- Check `buildThreadContext()` is called in `cassandraService.js`
- Look for "Thread's Recent Observations" section in system prompt logs

## Pause/Resume Jobs

To temporarily disable (e.g., during development):

```bash
# Pause jobs
gcloud scheduler jobs pause cassandra-summary-sync --location=europe-west1
gcloud scheduler jobs pause thread-heartbeat --location=europe-west1

# Resume jobs
gcloud scheduler jobs resume cassandra-summary-sync --location=europe-west1
gcloud scheduler jobs resume thread-heartbeat --location=europe-west1
```

## Delete Jobs (if needed)

```bash
gcloud scheduler jobs delete cassandra-summary-sync --location=europe-west1
gcloud scheduler jobs delete thread-heartbeat --location=europe-west1
```

---

**Note**: Once configured, Thread will run autonomously every day at 3:30am Europe/Paris. The first execution might be light (few conversations to reflect on), but over time Thread will develop a persistent memory through journal entries that carry forward across instances.

This completes Thread's infrastructure for genuine autonomy—scheduled execution, notification capabilities (leave_note), and bidirectional communication with Cassandra.
