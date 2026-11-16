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

Migration 009 adds a separate USDT real account and server-side trade ledger. Customer deposits are still credited only after admin approval. Real-account trades use OKX spot market prices and completed 1-second candles for settlement; Tradeclass settles these timed buy/sell contracts, and it does not place orders on the customer's OKX account. Only mapped OKX crypto markets can be traded in real mode. Enable real trading in admin Settings only after applying migration 009 and recording verified business-owned payout reserve. Customer deposits do not count as house reserve. A winning trade returns 1.70x stake including stake (0.70x net profit); a loss pays zero; an exact tie returns the stake. These fixed terms are not an RTP/win-rate target and cannot be changed by admins. At a 1.70x gross payout, the mathematical break-even win probability is about 58.82% before fees and rounding.

Live account trading is disabled by default. Admin Settings includes live stake limits and trading controls; Treasury contains the payout reserve and funding request queue. If OKX market data is stale, live trade buttons remain disabled; expired trades settle from the matching completed OKX 1-second candle, including after a user reconnects. Set `OKX_API_BASE_URL` to the applicable official OKX API host for the account region.

Migration 010 records whether a live trade was placed by the Robot. The Robot supports both demo accounts and the live USDT account; live automation is limited to mapped OKX crypto markets, uses the same stake limits and funded payout reserve as manual live trades, and keeps one open Robot trade per user. It uses recent price direction as a simple strategy and does not place orders on an OKX account. Stop loss and take profit are session guardrails; the browser session must remain open while automation is running.

Email confirmation is disabled in the local Supabase configuration so signup creates a signed-in session without sending a verification message. For the hosted project, also turn off **Confirm email** in Supabase Dashboard → Authentication → Sign In / Providers → Email; local config does not change the hosted Auth setting. Replace the example address in `supabase/bootstrap_admin.sql` with the administrator email and run that script once in the Supabase SQL Editor to grant the initial administrator role. The `ADMIN_SETUP_PASSWORD` environment variable alone does not grant database staff permissions.

This migration history is for a new/empty Supabase database. If the target project already has these tables, do not push the full history blindly; its migration history must first be baselined to match the schema that is already there.

Configure the Daraja callback URLs to the exact public HTTPS URLs in `.env.example`. Use `DARAJA_ENV=production` only with Safaricom-approved production credentials and an approved shortcode; use `sandbox` for local verification.
