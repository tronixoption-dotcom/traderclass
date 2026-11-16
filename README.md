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

Apply `drizzle/migrations/0004_mpesa_wallet.sql` to the target Supabase database using the Supabase SQL Editor, or use `npx drizzle-kit migrate` with `LOVABLE_DB_MIGRATION_URL` set to a direct PostgreSQL connection string. The migration adds the private KES wallet and payment ledger, RLS read policies, and atomic balance settlement functions.

Configure the Daraja callback URLs to the exact public HTTPS URLs in `.env.example`. Use `DARAJA_ENV=production` only with Safaricom-approved production credentials and an approved shortcode; use `sandbox` for local verification.
