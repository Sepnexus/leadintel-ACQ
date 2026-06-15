# Closer Control Platform — End-to-End Test Plan

Two layers:
- **Automated** (`scripts/e2e-local-tests.sh`) — backend/data layer. 19 checks, all green locally.
- **Manual** (below) — the browser/UI flows you perform on the VPS.

---

## A. Automated suite (already run locally — 19/19 pass)

```bash
bash scripts/e2e-local-tests.sh
```
Covers: unified wallet (both apps charge one ledger, no double-count) · wallet
mirror self-heal · unified transaction-history RPC · super-admin create→login→
admin-access→revoke · SSO liveness (revoked token detected) · contacts reconcile
(prune + cascade) · login bundles carry launcher redirect.

> Note: the suite caught that a container rebuild had reverted the unified-wallet
> RPCs on the **local** stack; re-applied. On the VPS confirm both apps are
> UNIFIED before trusting wallet tests there:
> ```
> docker exec -e PGPASSWORD="$(grep -E '^POSTGRES_PASSWORD=' acq-coach-selfhost/.env|grep -v CHANGE_ME|tail -1|cut -d= -f2)" acq-coach \
>   psql -h localhost -U postgres -d acqcoach -tA -c \
>   "SELECT CASE WHEN prosrc LIKE '%platform_fdw%' THEN 'UNIFIED' ELSE 'LOCAL-ONLY' END FROM pg_proc WHERE proname='debit_wallet';"
> ```

---

## B. Manual browser tests (perform on the VPS)

Legend: ⬜ = to test. Record PASS/FAIL + note.

### 1. SSO — open apps from the launcher (no app login screen)
⬜ 1.1 Log into `closercontrol.srv844822.hstgr.cloud`.
⬜ 1.2 Click **ACQ Coach → Open App** → lands in ACQ dashboard, NOT an ACQ login.
⬜ 1.3 Back to launcher → **Lead Intel → Open App** → lands in LI, NOT a login.
⬜ 1.4 In LI, open **Settings / Pipeline / All Leads** → all load, no "edge function non-2xx".

### 2. SSO — stale-token recovery (the "Setting up your account" bug)
⬜ 2.1 Open Lead Intel, leave it idle ~20 min (lets the ACQ token age out).
⬜ 2.2 Log out of Lead Intel → should land on the **launcher** (not LI login).
⬜ 2.3 From the launcher, click **ACQ Coach** → loads the dashboard (NOT stuck on
       "Setting up your account…"). If it ever shows that screen, a **Retry**
       button now appears and recovers.

### 3. Logout → main login, from any screen
⬜ 3.1 In ACQ, from the dashboard, **Sign out** → lands on the launcher.
⬜ 3.2 In LI, from a deep screen (e.g. a lead detail / Settings), **Sign out** →
       lands on the launcher (not LI's own login).
⬜ 3.3 Visit `acq.srv844822.hstgr.cloud` directly while logged out → redirects to
       the launcher.

### 4. Theme toggle (Lead Intel)
⬜ 4.1 In LI, click the ☀️/🌙 toggle → whole UI flips light/dark, icon changes.
⬜ 4.2 Toggle back → returns. (ACQ has its own toggle — unaffected.)

### 5. App-card entitlement
⬜ 5.1 As a user whose customer has **both** products → both cards show **Open App**.
⬜ 5.2 As a user entitled to only one → the other card shows **No access** (locked).

### 6. Unified wallet + billing history
⬜ 6.1 Launcher → **Account → Billing**: balance shown. Note it.
⬜ 6.2 Open ACQ billing and LI billing (Account → Billing link) → **same balance**
       across ACQ, LI, and the launcher (may lag ≤30s right after a charge).
⬜ 6.3 LI **Settings/Billing → Wallet transactions** → shows rows tagged
       **ACQ —** and **LI —** (Stripe top-up, Auto-recharge, briefing charges all
       in one list).
⬜ 6.4 Run an AI feature in LI (e.g. **Play briefing**) → balance drops by the
       charge in all three views.

### 7. Auto-recharge (Stripe TEST mode)
⬜ 7.1 Pick a test customer with a saved **test** card + auto-recharge ON, threshold
       set, balance below it.
⬜ 7.2 Within ~2 min the balance jumps by the top-up amount; a new
       **Auto-recharge** row appears in the unified transactions.
⬜ 7.3 It fires **once** (not repeatedly) — confirm only one Auto-recharge row in a
       30-min window.

### 8. Super-admin management (Admin → Users)
⬜ 8.1 Admin → Users → **+ New user** → email + password, keep **Platform
       super-admin** checked → Create.
⬜ 8.2 Log in as that new user at the launcher → full access (sees Admin).
⬜ 8.3 On a user → **★ Make platform admin** / **Revoke platform admin** toggles.
⬜ 8.4 **🔑 Set password** on any user → that user can log in with the new password.
⬜ 8.5 Try to revoke your **own** admin → blocked (no self-lockout).

### 9. Notes access (Lead Intel admin → tenant → Overview)
⬜ 9.1 **Re-check** on a tenant whose GHL token HAS notes scope → **SCOPE OK**
       (one stale/deleted contact no longer flips it to "no scope").
⬜ 9.2 **Test before saving** a token → gives a real result (valid / rejected),
       not "Edge Function returned a non-2xx status code".

### 10. Sync status bar
⬜ 10.1 Trigger a sync → the green "Syncing… from GHL" indicator sits at the
        **bottom** and does NOT cover the header / block the app switcher or
        user menu.

### 11. Contacts reconcile (count convergence)
⬜ 11.1 Note LI's CONTACTS quick-stat for a tenant and GHL's own contact count.
⬜ 11.2 Trigger a **Full** contacts sync → on completion, LI's count converges to
        GHL's (deleted-in-GHL contacts pruned). For Black Label Group this should
        drop ~5,232 → ~4,428.
⬜ 11.3 Confirm it only pruned (didn't wipe) — count matches GHL, not ~0.
