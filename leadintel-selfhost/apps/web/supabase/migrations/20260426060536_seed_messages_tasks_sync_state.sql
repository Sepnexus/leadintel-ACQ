INSERT INTO sync_state (resource, consecutive_failures)
VALUES ('messages', 0), ('tasks', 0)
ON CONFLICT (resource) DO NOTHING;
