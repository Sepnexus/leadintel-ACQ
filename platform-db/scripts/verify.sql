SELECT 'users.total                ' AS metric, count(*) AS n FROM platform.users
UNION ALL
SELECT 'users.both_apps            ',           count(*) FROM platform.users WHERE acq_user_id IS NOT NULL AND leadintel_user_id IS NOT NULL
UNION ALL
SELECT 'users.acq_only             ',           count(*) FROM platform.users WHERE acq_user_id IS NOT NULL AND leadintel_user_id IS NULL
UNION ALL
SELECT 'users.li_only              ',           count(*) FROM platform.users WHERE acq_user_id IS NULL AND leadintel_user_id IS NOT NULL
UNION ALL
SELECT 'users.platform_admins      ',           count(*) FROM platform.users WHERE is_platform_admin
UNION ALL
SELECT 'access.acq_enabled         ',           count(*) FROM platform.user_product_access WHERE product='acq_coach' AND enabled
UNION ALL
SELECT 'access.li_enabled          ',           count(*) FROM platform.user_product_access WHERE product='lead_intel' AND enabled
UNION ALL
SELECT 'audit.total                ',           count(*) FROM platform.audit_log;
