<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules

- Admin-specific colors are scoped to `.admin-workspace`; summary and client-list presentation lives in AdminRecords so trading screens and staff authorization stay unchanged.

- Admin data and mutations require live staff roles plus a server-written, one-hour unlock bound to the verified JWT user and session_id; avoid unlock cookies because embedded previews block them. The seven-click logo is only an entry affordance.
- Staff permissions live in a separate protected roles table; verified email reservations are redeemed server-side so signup metadata cannot grant privileges.
- Public site settings control practice actions through shared actionAllowed rules, polled by the browser store; simulated outcomes and historical activity are not editable by staff.

- Goldmarket is a practice-only trading app: balances, prices and the robot are simulated in the browser (`src/lib/feed.ts`, `src/lib/store.tsx`) and saved to localStorage. Never add real deposits, withdrawals, payment providers or identity collection — the app must not be usable to take real money.
- Trading rules (payout multiplier, minimums, settlement) live in `src/lib/trading.ts` with tests in `src/lib/trading.test.ts`; keep UI code calling these helpers instead of re-implementing rules.
- Feed starting prices are deterministic so SSR and hydration match; randomness only starts after `startFeed()` runs in the browser.
- The chart uses lightweight-charts loaded via dynamic import inside an effect (browser-only); canvas colors come from CSS tokens via `resolveToken`.
- Signed-in users' practice state is saved as one jsonb row per user in `practice_accounts`; `profiles` holds username and referral code (created by a signup trigger). Why: keeps the existing in-browser store shape while making progress follow the user across devices.
- At the `md` breakpoint (768px, `useIsDesktop`), the root layout keeps `MarketView` mounted with a left `SideRail` and a "Manual trade" column, and renders every other route in a width-constrained 400px panel over the chart's left side; phones keep the single-column layout with `BottomNav`. Market toolbar sizing uses the same breakpoint and chart density follows workspace mode, not the remaining chart width. Why: narrow desktop previews must show the reference workspace rather than a centered phone screen.

- Keep the instrument catalog in `src/lib/symbols.ts` and share `InstrumentPicker` across manual and robot trading; category/search selection must use the same symbols as the simulated feed so every listed instrument is usable.
