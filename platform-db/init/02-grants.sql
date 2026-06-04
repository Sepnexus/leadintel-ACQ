-- Grants run after schema is created.
-- platform_app  → read access to users + user_product_access, insert into audit_log
-- platform_admin → full mutation on user_product_access + users; can read everything
-- postgres → init only

GRANT USAGE ON SCHEMA platform TO platform_app, platform_admin;

-- ── platform_app: app-runtime role ──
-- Both apps' edge functions connect as platform_app to check entitlements.
GRANT SELECT ON platform.users                TO platform_app;
GRANT SELECT ON platform.user_product_access  TO platform_app;
GRANT INSERT ON platform.audit_log            TO platform_app;
-- Helper functions:
GRANT EXECUTE ON FUNCTION platform.user_has_access(uuid, platform.product)            TO platform_app;
GRANT EXECUTE ON FUNCTION platform.user_id_for_acq(uuid)                              TO platform_app;
GRANT EXECUTE ON FUNCTION platform.user_id_for_leadintel(uuid)                        TO platform_app;
GRANT EXECUTE ON FUNCTION platform.acq_user_has_access(uuid, platform.product)        TO platform_app;
GRANT EXECUTE ON FUNCTION platform.leadintel_user_has_access(uuid, platform.product)  TO platform_app;

-- ── platform_admin: launcher Admin Console + backfill scripts ──
-- Can grant/revoke product access and create platform users.
GRANT SELECT, INSERT, UPDATE         ON platform.users                TO platform_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON platform.user_product_access  TO platform_admin;
GRANT SELECT, INSERT                 ON platform.audit_log            TO platform_admin;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA platform                     TO platform_admin;
