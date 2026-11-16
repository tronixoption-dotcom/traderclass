import { Link } from "@tanstack/react-router";
import { NavAccountIcon, NavMarketIcon, NavRobotIcon, NavSupportIcon, TradesIcon } from "./icons";

export const navItems = [
  { to: "/", label: "Market", icon: NavMarketIcon },
  { to: "/robot", label: "Robot", icon: NavRobotIcon },
  { to: "/trades", label: "Trades", icon: TradesIcon },
  { to: "/support", label: "Support", icon: NavSupportIcon },
  { to: "/account", label: "Account", icon: NavAccountIcon },
] as const;

const accountPaths = ["/deposit", "/withdraw", "/auth", "/transfer", "/transactions", "/profile", "/about", "/referral", "/copy-trading", "/community"];

export function isNavActive(to: string, pathname: string) {
  if (to === "/") return pathname === "/";
  return pathname.startsWith(to) || (to === "/account" && accountPaths.some((p) => pathname.startsWith(p)));
}

export function BottomNav({ pathname }: { pathname: string }) {
  return (
    <nav className="grid h-[51px] shrink-0 grid-cols-5 border-t border-border bg-nav pb-[env(safe-area-inset-bottom)]">
      {navItems.map(({ to, label, icon: Icon }) => {
        const active = isNavActive(to, pathname);
        return (
          <Link
            key={to}
            to={to}
            className={`flex flex-col items-center pt-[10.75px] text-[8px] leading-[10px] transition-colors ${active ? "text-primary" : "text-nav-muted hover:text-foreground"}`}
          >
            <Icon className="size-[18.5px]" />
            <span className="mt-[1.25px]">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
