import type { CourierClient, Dispatcher } from "@courier/api-client";
import { Link, Outlet, useMatchRoute } from "@tanstack/react-router";
import { ShopClock } from "./ShopClock.js";
import type { Tab } from "./SubTabs.js";

const MODES: readonly Tab[] = [
  { label: "Dispatch", to: "/dispatch" },
  { label: "Packing bench", to: "/packing-bench" },
  { label: "Catalog", to: "/catalog" },
  { label: "Settings", to: "/settings" },
];

export interface ShellProps {
  readonly client: CourierClient;
  readonly dispatcher: Dispatcher;
  readonly onSignOut: () => void;
}

/** The signed-in console. The URL says which mode is open, and the route fills it in. */
export function Shell({ client, dispatcher, onSignOut }: ShellProps) {
  const matchRoute = useMatchRoute();
  const mode = MODES.find((each) => matchRoute({ to: each.to, fuzzy: true }));

  return (
    <div className="shell">
      <header>
        <strong>Courier Ops</strong>
        <nav aria-label="Console">
          {MODES.map((each) => (
            <Link key={each.to} to={each.to}>
              {each.label}
            </Link>
          ))}
        </nav>
        <ShopClock client={client} />
        <span className="who">{dispatcher.email}</span>
        <button type="button" onClick={onSignOut}>
          Sign out
        </button>
      </header>
      <main aria-label={mode?.label}>
        {mode && <h1>{mode.label}</h1>}
        <Outlet />
      </main>
    </div>
  );
}

/** A mode with no content yet says so. */
export function Placeholder() {
  return <p className="detail">Nothing here yet.</p>;
}
