import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  useNavigate,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { StoreProvider } from "@/lib/store";
import { BottomNav } from "@/components/app/BottomNav";
import { MarketView } from "@/components/app/MarketView";
import { SideRail } from "@/components/app/SideRail";
import { useIsDesktop } from "@/hooks/use-desktop";
import { Toaster } from "@/components/ui/sonner";
import { SiteAnnouncement } from "@/components/admin/SiteAnnouncement";
import { LandingPage } from "@/components/marketing/LandingPage";
import { useStore } from "@/lib/store";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    // Each content route sets its own head(). Never add og:image or twitter:image here.
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Tradeclass | Practice Trading" },
      { name: "description", content: "Explore gold, forex and crypto in a focused practice workspace." },
      { property: "og:title", content: "Tradeclass | Practice Trading" },
      { property: "og:description", content: "A focused market workspace with simulated practice balances." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <StoreProvider>
        <RootFrame />
      </StoreProvider>
    </QueryClientProvider>
  );
}

function RootFrame() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const desktop = useIsDesktop();
  const navigate = useNavigate();
  const { user, authReady } = useStore();
  const publicRoute = pathname === "/" || pathname === "/auth";

  useEffect(() => {
    if (authReady && !user && !publicRoute) {
      navigate({ to: "/auth", search: { redirect: pathname } });
    }
  }, [authReady, user, publicRoute, pathname, navigate]);

  if (pathname === "/auth") {
    return <><Outlet /><Toaster position="top-center" richColors closeButton /></>;
  }
  if (pathname === "/" && (!authReady || !user)) {
    return <><LandingPage /><Toaster position="top-center" richColors closeButton /></>;
  }
  if (!authReady) {
    return <div className="grid h-dvh place-items-center bg-background text-sm text-muted-foreground">Loading your secure workspace…</div>;
  }
  if (!user) return null;

  return (
    <>
        {pathname === "/admin" ? <Outlet /> : desktop ? (
          <div className="flex h-dvh w-full overflow-hidden bg-background">
            <SideRail pathname={pathname} />
            {/* The chart stays on screen; other sections open as a panel over its left side. */}
            <MarketView
              desktop
              overlay={
                pathname !== "/" && (
                  <aside className="absolute inset-y-0 left-0 z-30 flex w-[400px] max-w-full flex-col overflow-y-auto border-r border-border bg-background">
                    <Outlet />
                  </aside>
                )
              }
            />
          </div>
        ) : (
          <div className="mx-auto flex h-dvh max-w-md flex-col bg-background shadow-xl">
            <main className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
              {/* Required: nested routes render here. */}
              <Outlet />
            </main>
            <BottomNav pathname={pathname} />
          </div>
        )}
        {pathname !== '/admin' && <SiteAnnouncement />}
        <Toaster position="top-center" richColors closeButton />
    </>
  );
}
