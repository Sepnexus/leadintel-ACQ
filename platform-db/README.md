# platform-db

Shared identity + entitlement Postgres for the Sepnexus platform. Postgres 17.

## What lives here

| Table | What it stores |
|---|---|
| `platform.users` | One row per real human across both products. Holds `acq_user_id` + `leadintel_user_id` back-pointers. **No passwords** — those stay in each app's GoTrue. |
| `platform.user_product_access` | `(user_id, product, enabled, valid_until)` — the source of truth for "can this user use Lead Intel right now?" |
| `platform.audit_log` | Cross-product activity stream — who granted/revoked access to whom, when. |

What does NOT live here (yet):
- Passwords / refresh tokens (in each app's `auth.users`)
- Wallets / billing (in each app's `wallets` + `wallet_transactions`)
- Stripe customer IDs (per-app, will move here in week 2)

## First-time setup

```bash
cd platform-db
make setup        # writes .env with fresh passwords
make network      # creates the shared 'platform-shared' Docker network
make up           # boots Postgres + runs init/*.sh + init/*.sql automatically
make backfill     # mirrors existing ACQ + Lead Intel users in
make verify       # row counts
```

## Connection strings (for the other stacks)

The two app stacks reach platform-db over the `platform-shared` Docker network
using these URLs (set in each app's `.env`):

```
PLATFORM_DB_URL=postgres://platform_app:<PLATFORM_APP_PASSWORD>@platform-db:5432/platform
PLATFORM_ADMIN_DB_URL=postgres://platform_admin:<PLATFORM_ADMIN_PASSWORD>@platform-db:5432/platform
```

`platform_app` is read-only on `users` + `user_product_access`, INSERT-only on `audit_log`.
`platform_admin` can grant/revoke product access (used by the launcher Admin Console).

## Roles summary

| Role | Used by | Privileges |
|---|---|---|
| `postgres` | init scripts only | Superuser |
| `platform_admin` | Launcher Admin Console, backfill scripts | RW users, RWX user_product_access, INSERT audit_log |
| `platform_app` | ACQ + Lead Intel edge functions | SELECT users + user_product_access, INSERT audit_log |

## Backfill is idempotent

Re-running `make backfill` is safe. It upserts by email — duplicates are
deduplicated, missing back-pointers are filled in, never deletes rows.
Every backfill writes an `audit_log` row tagged `backfill_users`.
