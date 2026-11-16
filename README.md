# Goldmine

if i give you a website link and logins so that you can interact with it inside is functionality and all can you  replicate it?

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://gold-grove-market-hub.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/66b656d8-27ad-412d-87a1-ea6649b200b6).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## M-Pesa wallet setup

The M-Pesa wallet is denominated in whole Kenyan shillings and is separate from simulated USD/USDT practice balances. Copy `.env.example` to an ignored local `.env` for development, or set the same variables as **server-side secrets** in the production host. Never set a secret under a `VITE_` name. `SUPABASE_SECRET_ROLE_KEY`, `ADMIN_SETUP_PASSWORD`, and `CRON_SECRET` are mapped server-side to the names expected by the generated integrations. Do not set `VITE_SUPABASE_SECRET_ROLE_KEY`.

The Supabase CLI migration files live in `supabase/migrations/` and include every app table: `profiles`, `practice_accounts`, `user_roles`, `staff_invitations`, `site_settings`, `support_tickets`, `admin_audit`, `admin_session_unlocks`, `mpesa_wallets`, and `mpesa_transactions`. Signup country and mobile are stored in Supabase Auth user metadata. The migrations also create the signup/referral, role-management, and M-Pesa settlement functions and RLS policies. Link the CLI to the project and apply them with `npx supabase link --project-ref ifgvocgcwmdsnqgvvvsw` followed by `npx supabase db push`. These files are the Supabase CLI path; do not also apply the duplicate Drizzle SQL migrations.

Email confirmation is disabled in the local Supabase configuration so signup creates a signed-in session without sending a verification message. For the hosted project, also turn off **Confirm email** in Supabase Dashboard → Authentication → Sign In / Providers → Email; local config does not change the hosted Auth setting. Replace the example address in `supabase/bootstrap_admin.sql` with the administrator email and run that script once in the Supabase SQL Editor to grant the initial administrator role. The `ADMIN_SETUP_PASSWORD` environment variable alone does not grant database staff permissions.

This migration history is for a new/empty Supabase database. If the target project already has these tables, do not push the full history blindly; its migration history must first be baselined to match the schema that is already there.

Configure the Daraja callback URLs to the exact public HTTPS URLs in `.env.example`. Use `DARAJA_ENV=production` only with Safaricom-approved production credentials and an approved shortcode; use `sandbox` for local verification.
