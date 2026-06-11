-- Unified ledger read access — the apps' billing UIs show the SHARED platform
-- ledger (both products' credits/debits), not just their own app-local rows.
-- The apps reach it via postgres_fdw authenticating as platform_app, which so
-- far could only INSERT into the ledger (14-unified-wallet). Reads come
-- through platform_fdw.wallet_transactions_read in each app DB.

GRANT SELECT ON platform.wallet_transactions TO platform_app;
