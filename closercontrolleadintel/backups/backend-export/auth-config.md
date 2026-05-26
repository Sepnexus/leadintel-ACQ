# Auth configuration — Closer Control Lead Intel

These items live in the Supabase project control plane (not in Postgres) and
must be captured manually from the Supabase dashboard. Lovable Cloud does not
expose them to the in-product tools.

How to open the dashboard: Lovable project → Connectors → Lovable Cloud →
"Open in Supabase" (project ref `wgnlnorxhfephwshuzvr`).

---

## 1. Auth → Providers
What's enabled today?

- [x] **Email / password** — confirmed in use (all 23 users have
  `raw_app_meta_data.provider = "email"` and a matching `auth.identities` row).
- [ ] **Google** — README.md claims it's enabled. Paste here:
      - Client ID:        ___________________________________________
      - Client secret:    (DO NOT paste — set your own on restore)
      - Authorized redirect URI shown by Supabase:
                          ___________________________________________
- [ ] Other (Apple / GitHub / SAML / phone OTP / magic link) — likely OFF.

## 2. Auth → URL Configuration
- Site URL: ___________________________________________
- Redirect URLs (one per line):
  - production app domain (the customer-facing URL)
  - any Lovable preview URLs (closercontrolleadintel.lovable.app, etc.)
  - localhost dev port if used

## 3. Auth → Email Templates
Default Supabase templates or customized?
- [ ] Confirm signup
- [ ] Magic link
- [ ] Change email address
- [ ] Reset password
- [ ] Invite user

The export README says auto-confirm is enabled — but the project also uses
`user_invitations` table with custom invite emails sent from edge functions,
so the dashboard templates may be defaults even though users see custom emails.
Verify and paste any customized HTML.

## 4. Project Settings → API → JWT
- JWT expiry: __________ s   (default 3600)
- Refresh token rotation: __________   (default: enabled)
- Reuse interval: __________ s   (default 10)

## 5. Project Settings → Auth → Advanced
- Enable email confirmations: __________
  (README implies OFF / auto-confirm — confirm)
- Secure email change: __________
- Secure password change: __________
- Minimum password length: __________

## 6. SMTP
- Custom SMTP configured? __________
  (the `invite-user` edge function sends invites; verify whether it goes
  through Supabase SMTP or a custom provider like Resend/SendGrid)
- If yes:
  - Host: ___________
  - Port: ___________
  - Sender email: ___________
  - Sender name: ___________

---

## GoTrue env-var mapping (for self-host)

| Dashboard field            | GoTrue env var                                |
|----------------------------|-----------------------------------------------|
| Site URL                   | `GOTRUE_SITE_URL`                             |
| Redirect URLs              | `GOTRUE_URI_ALLOW_LIST` (comma-separated)     |
| JWT expiry                 | `GOTRUE_JWT_EXP`                              |
| Email confirmations OFF    | `GOTRUE_MAILER_AUTOCONFIRM=true`              |
| Google OAuth client ID     | `GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID`            |
| Google OAuth client secret | `GOTRUE_EXTERNAL_GOOGLE_SECRET`               |
| Google redirect URL        | `GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI`         |
| SMTP host/port/etc.        | `GOTRUE_SMTP_*`                               |
