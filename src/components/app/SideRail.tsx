import { Link } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { useStore } from "@/lib/store";
import { isNavActive, navItems } from "./BottomNav";
import { AdminEntry } from "@/components/admin/AdminEntry";

/** Desktop left menu: logo, the five sections stacked, settings at the bottom. */
export function SideRail({ pathname }: { pathname: string }) {
  const { state, setTheme } = useStore();
  const dark = state.theme === "dark";
  return (
    <nav aria-label="Main" className="flex w-[73px] shrink-0 flex-col items-center border-r border-border bg-nav pb-[12px] pt-[5px]">
      <AdminEntry />
      <div className="mt-[24px] flex flex-col gap-[20px]">
        {navItems.map(({ to, label, icon: Icon }) => {
          const active = isNavActive(to, pathname);
          return (
            <Link
              key={to}
              to={to}
              className={`flex w-[66px] flex-col items-center gap-[5px] rounded-[6px] py-[3px] text-[13.5px] leading-[16px] transition-colors ${active ? "text-primary" : "text-nav-muted hover:text-foreground"}`}
            >
              <Icon className="size-[23px]" />
              {label}
            </Link>
          );
        })}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button aria-label="Settings" className="mt-auto grid size-[40px] place-items-center rounded-full text-nav-muted hover:bg-muted hover:text-foreground">
            <Settings className="size-[22px]" fill="currentColor" stroke="var(--nav)" strokeWidth={1.6} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="end" className="w-52">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Settings</DropdownMenuLabel>
          <DropdownMenuItem onSelect={(e) => e.preventDefault()} onClick={() => setTheme(dark ? "light" : "dark")} className="justify-between">
            Light theme <Switch checked={!dark} aria-hidden tabIndex={-1} className="pointer-events-none" />
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/profile">Profile</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/about">About</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
