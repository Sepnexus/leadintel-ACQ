# vault.secrets

| id | name | description | key_id | created_at | updated_at |
|----|------|-------------|--------|------------|------------|
| f36a6692-c579-416d-baf2-4e19081eeb5d | cron_secret | Cron auth secret for sync-resume-cron | NULL | 2026-05-07 06:08:25.615214+00 | 2026-05-07 06:08:25.615214+00 |

## Decrypted value

cron_secret = `LI_CRON_2026_xK9mPqR7vNs3wYbT`

Recreate on the new side:
```sql
SELECT vault.create_secret('LI_CRON_2026_xK9mPqR7vNs3wYbT', 'cron_secret', 'Cron auth secret for sync-resume-cron');
```

NOTE: this same string is also hard-coded as the `x-cron-secret` header in the `auto-sync-all-tenants` cron job and is stored in the `CRON_SECRET` edge-function secret. Rotate all three together.
