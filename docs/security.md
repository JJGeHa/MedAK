# Security

MedAK stores CPR numbers, names and addresses so that users don't have to keep files themselves and
can work as a team. This document describes how that data is protected, what is not yet covered,
and what must be done **before any real data is entered**.

> **Status: development only.** The app shows a banner saying so. Nothing below replaces a security
> review or legal advice.

## How data is protected

| Layer | What happens |
|---|---|
| **Sign-in** | Email and password (at least 12 characters, letters and digits), confirmed email, and **mandatory two-factor (TOTP)** for every account |
| **Access control** | Row-level security in Postgres on every table, using the signed-in user's own session. The app has **no service-role key**, so a bug in the app can't reach another workspace's data. Case data also requires a two-factor session at database level |
| **Encryption at rest** | Personal data is encrypted by the app server with AES-256-GCM before it reaches the database. Each workspace has its own data key, itself encrypted by a master key held only in the server's environment. A copy of the database alone reveals no CPR numbers |
| **Tamper binding** | Each ciphertext is bound to its workspace and company, so it can't be moved elsewhere and still decrypt |
| **Audit log** | Opening or changing a case, making a file and team changes are logged by database triggers, without personal data. Nobody can edit the log through the API, including owners |
| **Files for SKAT** | Kept encrypted to support the 5-year retention duty. Their contents can't be changed or deleted through the app; only their status can |
| **Team safety** | Invitations hold only a hash of the token, expire after 7 days and only work for the invited email address. A workspace can't lose its last owner. Removing a member takes effect at once |
| **Overwrites** | A save based on an old revision is refused, so colleagues can't silently overwrite each other |
| **Browser** | Strict security headers (CSP, HSTS, frame denial, no referrer), no third-party scripts, responses with case files aren't cached, automatic sign-out after 30 idle minutes, CPR numbers masked in lists |
| **Outside calls** | The only one is the exchange-rate lookup at Statistics Denmark, which sends a currency and a date |

The rules are tested against the real migration in
[`apps/web/test/rls.test.ts`](../apps/web/test/rls.test.ts) and
[`crypto.test.ts`](../apps/web/test/crypto.test.ts), on every push.

## What this does not protect against

Be clear about these. Each is a deliberate trade-off or a known gap.

- **The server can read the data.** It has to, to build files and serve a team. This is encryption
  at rest, not end-to-end encryption. Someone who gets both the database and the master key, or
  takes over the running server, can read everything.
- **Everyone in a workspace sees everything in it.** There are no per-company permissions yet, which
  matters for advisor firms.
- **A member's account is the weak point.** A phished password and two-factor code, or a malware-
  infected computer, gives access to that member's workspaces.
- **Session tokens are readable by page scripts**, as usual with Supabase's browser client. The CSP
  limits this, but it still allows inline scripts (a Next.js default); nonces would tighten it.
- **Editing conflicts are per company**, so two people in the same company's case will conflict even
  if they edit different things.

## Before real data can be entered

The app must not hold real CPR numbers until these are done.

### Legal (get a lawyer; this list is not legal advice)

- [ ] A legal entity to run the service. Customers are data controllers; MedAK is their **data
      processor**, which needs a data processing agreement (databehandleraftale) with each customer
- [ ] Data processing agreements with sub-processors (database and hosting), and EU-only data location
- [ ] Privacy policy and terms, including that the customer stays responsible for its reports
- [ ] Assess the rules on CPR numbers (databeskyttelsesloven § 11) and whether a DPIA is required
- [ ] A process for data subject requests. Case data can be changed and exported, but erasure must be
      weighed against the 5-year retention duty, and retention needs an automatic end
- [ ] A breach response plan, including the 72-hour notification to Datatilsynet

### Technical

- [ ] Independent penetration test and review of the RLS policies
- [ ] A separate hosted project in its own organisation, EU region, paid plan with point-in-time recovery
- [ ] Master key in a key management service, a tested **backup of it** (losing it loses all cases) and
      key rotation, which isn't built yet (the encrypted format has a version prefix to allow for it)
- [ ] Two-factor recovery. Today a lost device means support must reset it, and that process needs
      strong identity checks. Consider MitID login through a broker, which would replace passwords
- [ ] Leaked-password protection, sign-in rate limits, and shorter session lifetimes in Supabase
- [ ] Email through a real provider, with SPF/DKIM
- [ ] Dependency and secret scanning in CI; alerts on unusual access; logs checked for personal data
- [ ] Encrypted backups, with restore tested

## FTPs Gateway (later)

Direct submission to SKAT needs access from eKapital, which isn't available now. When it is:

- Browsers can't use FTPS, so it needs a server-side worker, and a MitID certificate per the
  guidance. Each company or advisor must authorise this, and the credential needs at least the same
  protection as the master key.
- The worker would pick up files already made and encrypted in `submissions`, send them in test or
  production mode, and read SKAT's status files. The engine already parses SKAT's error records
  (individ 3921), so errors can be matched to people automatically.
- Until then, users upload the file themselves in TastSelv Erhverv, and MedAK sends nothing to SKAT.
