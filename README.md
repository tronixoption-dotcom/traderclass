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

## Wallet and funding setup

The M-Pesa wallet is denominated in whole Kenyan shillings and is separate from simulated USD/USDT practice balances. Copy `.env.example` to an ignored local `.env` for development, or set the same variables as **server-side secrets** in the production host. Never set a secret under a `VITE_` name. `SUPABASE_SECRET_ROLE_KEY`, `ADMIN_SETUP_PASSWORD`, and `CRON_SECRET` are mapped server-side to the names expected by the generated integrations. Do not set `VITE_SUPABASE_SECRET_ROLE_KEY`.

The Supabase CLI migration files live in `supabase/migrations/` and include every app table: `profiles`, `practice_accounts`, `user_roles`, `staff_invitations`, `site_settings`, `support_tickets`, `admin_audit`, `admin_session_unlocks`, `mpesa_wallets`, `mpesa_transactions`, `funding_methods`, `funding_wallets`, `funding_transactions`, `real_trades`, `real_trading_reserves`, and `real_trading_reserve_ledger`. Signup country and mobile are stored in Supabase Auth user metadata. The migrations also create signup/referral, role-management, M-Pesa settlement, and funding review functions with RLS policies. Link the CLI to the project and apply them with `npx supabase link --project-ref ifgvocgcwmdsnqgvvvsw` followed by `npx supabase db push`. These files are the Supabase CLI path; do not also apply the duplicate Drizzle SQL migrations.

The flexible funding migrations add real `funding_wallets` and `funding_transactions` for USD and USDT, plus admin-configured exchange methods in `funding_methods`. Binance, Bybit, and OKX appear as payment choices after migration 007; their options stay disabled until an admin opens **Payment methods**, sets each real receiving address/network, and enables deposits. Crypto deposits stay pending until staff verify the submitted transaction hash and approve them. Exchange withdrawals reserve the wallet balance and require staff to send the payout before marking it paid. M-Pesa continues through the configured Daraja STK/B2C callbacks into the KES wallet. These real wallet balances are kept separate from simulated trading balances and simulated trade execution.

Migration 008 adds admin-configurable deposit and withdrawal fees. They appear in the Settings panel, are shown to customers before submitting a request, and are recorded with each transaction. Deposits credit the net amount after fees; withdrawals reserve the requested amount and pay out the net amount. The same fee settings apply to crypto/manual funding and M-Pesa.

Migration 009 adds a separate USDT real account and server-side trade ledger. Customer deposits are credited only after admin approval. Migration `20261117000300_inhouse_market_engine.sql` adds the in-house market engine: authenticated server functions publish shared per-second synthetic prices, and trades settle against that same stored price series. The engine does not connect to an exchange or place orders. Enable real trading in admin Settings only after applying all migrations and recording the business-owned payout reserve. Customer deposits do not count as house reserve. The admin-configured RTP and target win-rate assumption determine the gross payout multiplier; the in-house price movement determines the trade outcome.

Live account trading is disabled by default. Admin Settings includes adjustable live stake, payout, risk and fraud controls; setting a maximum stake or optional risk cap to zero disables that cap. Treasury contains the payout reserve and funding request queue. The in-house engine stores shared one-second ticks for chart display and trade settlement, including after a user reconnects. OKX is available only as an administrator-configured deposit method where enabled.

Migration 010 records whether a live trade was placed by the Robot. The Robot supports both demo accounts and the live USDT account; live automation uses the in-house price series and same configurable stake rules and funded payout reserve as manual live trades, and keeps one open Robot trade per user. It uses recent price direction as a simple strategy. Stop loss and take profit are session guardrails; the browser session must remain open while automation is running.

Email confirmation is enabled in the local Supabase configuration. For the hosted project, enable **Confirm email** in Supabase Dashboard → Authentication → Sign In / Providers → Email and make sure the app URL is in the redirect URL allow list. New customers must open the verification email before signing in. Replace the example address in `supabase/bootstrap_admin.sql` with the administrator email and run that script once in the Supabase SQL Editor to grant the initial administrator role. The `ADMIN_SETUP_PASSWORD` environment variable alone does not grant database staff permissions.

This migration history is for a new/empty Supabase database. If the target project already has these tables, do not push the full history blindly; its migration history must first be baselined to match the schema that is already there.

Configure the Daraja callback URLs to the exact public HTTPS URLs in `.env.example`. Use `DARAJA_ENV=production` only with Safaricom-approved production credentials and an approved shortcode; use `sandbox` for local verification.
