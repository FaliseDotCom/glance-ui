# 0004. Authentication

- **Status:** accepted
- **Date:** 2026-10-13
- **Decider:** PM
- **UX impact:** **yes**. It decides whether and how you log in to the editor.

## Context
- The editor can rewrite the whole dashboard and (ADR-0005) list Docker containers. Anyone who can reach it can
  change what Glance shows, including links that users click.
- Glance has its own optional `auth` (username/password, `secret-key`; docs v0.8.6 "Authentication"). That protects
  the *dashboard*, not this editor. The editor must not depend on it.
- How you reach your homelab (LAN only, VPN, reverse proxy, public) is **unknown**. See todo-user.

## Options
### A. Built-in single-user password (recommended default)
- One admin account. A password hash (argon2id or bcrypt; library not chosen or verified) is set on first run
  or via env var / Docker secret. An HttpOnly, SameSite=Strict session cookie, CSRF protection on mutating
  requests, and rate limiting on login.
- Works anywhere, with no extra infrastructure.
- UX: a login page; sessions last N days (N to decide).

### B. Trusted reverse-proxy header (forward auth: Authelia, Authentik, oauth2-proxy…)
- SSO with your existing setup, if you have one.
- Dangerous if the editor is reachable without going through the proxy (header spoofing). Needs an explicit allow-list of proxy IPs.

### C. OIDC built in
- The most work. Overkill for one user unless you already run an IdP.

### D. No auth, LAN/VPN only
- The simplest, but one compromised device on the LAN can rewrite the dashboard.

## Recommendation
(Original recommendation, not chosen.) **A as the default, with B as an opt-in mode** (`AUTH_MODE=password|proxy`). It is off only if you explicitly set
`AUTH_MODE=none`, and then it binds to 127.0.0.1 unless overridden. The editor never stores Glance's `auth`
secrets in plain text in its model. If you use Glance `auth`, those fields are stored as placeholders (`${secret:…}`).

## Questions for you
1. How do you reach Glance today (LAN, VPN, reverse proxy, public)? Which proxy, if any?
2. Do you already run an SSO/IdP?
3. Session length you'd accept before having to log in again?

## Verified vs assumed
- Verified: Glance has its own `auth` block (docs v0.8.6, 2026-10-13).
- Not verified: any auth library. The library is chosen in the auth phase, with its versions cited.

## Decision record
**Accepted 2026-10-13 by the PM (via chat): option D, no authentication; LAN only.**

Consequences and accepted risk (recorded so they're visible later):
- Anyone who can reach the editor's port on the LAN can rewrite the dashboard, including the links people click, and
  can see the container list that the socket proxy exposes.
- The editor must not be published to the internet or behind a public reverse proxy. The deployment docs say so explicitly.
- The editor still enforces CSRF-safe practices (SameSite cookies are not available without sessions, so it checks
  the `Origin` header on mutating requests). This blocks a malicious web page in your browser from posting to the editor.
- The editor never stores Glance `auth` secrets in plain text (placeholders only). This is unchanged.
- Can be revisited: adding option A later is a new ADR, not a rewrite.
