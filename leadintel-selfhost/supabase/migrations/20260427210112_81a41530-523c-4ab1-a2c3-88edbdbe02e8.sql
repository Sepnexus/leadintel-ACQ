-- NEUTRALISED 2026-07-21. Was: DELETE FROM public.day_briefing_cache;
--
-- Same replay hazard as 20260424225732: docker/init-db.sh replays every
-- migration on container start, so an unguarded DELETE runs again on every
-- restart. This one only cleared a regenerable cache, so the blast radius was
-- small — unlike its neighbour, which wiped every tenant's synced GHL data on
-- 2026-07-21. Neutralised on the same principle: a migration has to be safe to
-- run a second time.

SELECT 1;
