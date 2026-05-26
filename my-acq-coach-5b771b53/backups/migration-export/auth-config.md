# Auth configuration — ACQ Coach

These items live in the Supabase project control plane (not in Postgres) and
must be captured manually from the Supabase dashboard. Lovable Cloud does not
expose them to the in-product tools.

How to open the dashboard: Lovable project → Connectors → Lovable Cloud →
"Open in Supabase" (gives a session against the underlying project).

---

## 1. Auth → Providers
What's enabled today?

- [x] **Email / password** — confirmed in use (every dumped user has
  `raw_app_meta_data.provider = "email"` and a matching `auth.identities` row).
- [ ] Google — likely toggled ON in the dashboard but unused by current users.
      If ON, paste here:
      - Client ID:        ___________________________________________
      - Client secret:    (DO NOT paste — set your own on restore)
      - Authorized redirect URI shown by Supabase:
                          ___________________________________________
- [ ] Other (Apple / GitHub / SAML / phone OTP / magic link) — likely OFF.

## 2. Auth → URL Configuration
- Site URL: ___________________________________________
  (expected: `https://www.acqcoach.com` per README)
- Redirect URLs (one per line):
  - `https://www.acqcoach.com`
  - `https://acqcoach.com`
  - `https://coach-deploy-magic.lovable.app`
  - `http://localhost:5173` (if dev allowed)
  - any Lovable preview URLs

## 3. Auth → Email Templates
Default Supabase templates or customized?
- [ ] Confirm signup
- [ ] Magic link
- [ ] Change email address
- [ ] Reset password
- [ ] Invite user

If any are customized, paste full HTML below.

## 4. Project Settings → API → JWT
- JWT expiry: __________ s   (default 3600)
- Refresh token rotation: __________   (default: enabled)
- Reuse interval: __________ s   (default 10)

## 5. Project Settings → Auth → Advanced
- Enable email confirmations: __________   (default: ON)
- Secure email change: __________
- Secure password change: __________
- Minimum password length: __________
- Rate limits (sign-up / sign-in / token refresh / OTP): __________

## 6. SMTP
- Custom SMTP configured? __________
- If yes:
  - Host:        ___________
  - Port:        ___________
  - Sender email:___________
  - Sender name: ___________
  - Username:    ___________
  (password — set fresh on restore)

---

## Why this matters at restore time

On **self-host (GoTrue container)** these become environment variables in the
GoTrue container. The key ones map like this:

| Dashboard field            | GoTrue env var                                |
|----------------------------|-----------------------------------------------|
| Site URL                   | `GOTRUE_SITE_URL`                             |
| Redirect URLs              | `GOTRUE_URI_ALLOW_LIST` (comma-separated)     |
| JWT expiry                 | `GOTRUE_JWT_EXP`                              |
| Email confirmations        | `GOTRUE_MAILER_AUTOCONFIRM` (inverse)         |
| Google OAuth client ID     | `GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID`            |
| Google OAuth client secret | `GOTRUE_EXTERNAL_GOOGLE_SECRET`               |
| Google redirect URL        | `GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI`         |
| SMTP host/port/etc.        | `GOTRUE_SMTP_*`                               |

On **new Supabase project** you just re-enter these in the new project's
dashboard.
