# Security Key Rotation Checklist

> [!CAUTION]
> The following credentials were found committed to git history in `.env` files. 
> These must be considered **compromised** and require immediate rotation.

## Exposed Credentials

1. **MongoDB Atlas Connection String**
   - **File:** `apps/llm-service/.env` (L2)
   - **Exposed Value:** `[REDACTED — credential rotated]`
   - **Action:** Rotate database password in MongoDB Atlas console.

2. **OpenRouter API Key**
   - **File:** `apps/llm-service/.env` (L10)
   - **Exposed Value:** `[REDACTED — credential rotated]`
   - **Action:** Revoke old key and generate a new one in the OpenRouter dashboard.

3. **Anthropic Claude API Key**
   - **File:** `apps/llm-service/.env` (L14)
   - **Exposed Value:** `[REDACTED — credential rotated]`
   - **Action:** Revoke old key and generate a new one in the Anthropic dashboard.

## Remediation Steps

### Step 1: Rotate Keys
Go to the respective provider dashboards (MongoDB, OpenRouter, Anthropic) and generate new credentials. Update your local `.env` files with the new values. **Do not commit the new keys.**

### Step 2: Purge Git History
Because `.env` files were tracked in git before being added to `.gitignore`, their contents exist in the repository's history.

To purge them entirely from history, use the [BFG Repo-Cleaner](https://rtyley.github.io/bfg-repo-cleaner/) or `git filter-repo`.

Using `git filter-repo` (Recommended):
```bash
# Install git-filter-repo (requires Python)
pip install git-filter-repo

# Remove .env files from history
git filter-repo --invert-paths --path apps/llm-service/.env --path apps/api-gateway/.env
```

### Step 3: Force Push
After rewriting history, force push to the remote repository.

```bash
git push --force origin main
```

> [!IMPORTANT]
> If other team members have checked out the repository, they will need to pull the rewritten history cleanly, as their local histories will diverge.
