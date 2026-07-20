-- Re-pointing a tenant to a different GHL location must not leave the old
-- location's data behind.
--
-- This caused a real cross-tenant exposure: 46,019 contacts (plus 210,039 tags
-- and related rows) sat in tenants that had since been re-pointed elsewhere, so
-- customers could see leads belonging to other customers. Every row had been
-- synced correctly at the time — GHL rejects a token used against a location it
-- does not own, so the sync itself cannot pull foreign data. The rows only
-- became foreign later, when tenants.ghl_location_id was changed and nothing
-- cleaned up what the previous location had put there.
--
-- The prune inside syncContacts does not cover this: it only deletes rows older
-- than the current sweep when that sweep re-synced >=90% of the location's
-- contacts, so a tenant pointed at a small (or empty) new location keeps the old
-- one's data indefinitely.
--
-- Deleting is the correct behaviour, not merely the convenient one: the data
-- belongs to a location this tenant no longer has access to, and anything still
-- valid is re-fetched from GHL on the next sync.

CREATE OR REPLACE FUNCTION public.purge_tenant_ghl_data_on_location_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removed_contacts bigint;
BEGIN
  IF NEW.ghl_location_id IS DISTINCT FROM OLD.ghl_location_id THEN
    DELETE FROM ghl_contact_tags  WHERE tenant_id = NEW.id;
    DELETE FROM ghl_opportunities WHERE tenant_id = NEW.id;
    DELETE FROM ghl_conversations WHERE tenant_id = NEW.id;
    DELETE FROM ghl_messages      WHERE tenant_id = NEW.id;
    DELETE FROM ghl_tasks         WHERE tenant_id = NEW.id;
    DELETE FROM ghl_contact_notes WHERE tenant_id = NEW.id;
    DELETE FROM ghl_users         WHERE tenant_id = NEW.id;
    DELETE FROM tenant_pipelines  WHERE tenant_id = NEW.id;

    DELETE FROM ghl_contacts WHERE tenant_id = NEW.id;
    GET DIAGNOSTICS removed_contacts = ROW_COUNT;

    -- Drop the delta cursors too, so the next sync is a clean full pull of the
    -- NEW location instead of resuming from the old one's position.
    DELETE FROM sync_state WHERE tenant_id = NEW.id;

    RAISE NOTICE 'tenant % re-pointed (% -> %): purged % contacts and related rows from the previous location',
      NEW.id, coalesce(OLD.ghl_location_id, '(none)'), coalesce(NEW.ghl_location_id, '(none)'), removed_contacts;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purge_tenant_ghl_data_on_location_change ON public.tenants;
CREATE TRIGGER trg_purge_tenant_ghl_data_on_location_change
  AFTER UPDATE OF ghl_location_id ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.purge_tenant_ghl_data_on_location_change();
