import type { CourierClient, Dispatcher } from "@courier/api-client";
import { useState } from "react";
import { ShopClock } from "./ShopClock.js";

const MODES = ["Dispatch", "Packing bench", "Settings"] as const;
type Mode = (typeof MODES)[number];

export interface ShellProps {
  readonly client: CourierClient;
  readonly dispatcher: Dispatcher;
  readonly onSignOut: () => void;
}

/** The signed-in console: the three modes, each still empty. */
export function Shell({ client, dispatcher, onSignOut }: ShellProps) {
  const [mode, setMode] = useState<Mode>("Dispatch");

  return (
    <div className="shell">
      <header>
        <strong>Courier Ops</strong>
        <nav aria-label="Console">
          {MODES.map((each) => (
            <button
              key={each}
              type="button"
              aria-current={each === mode ? "page" : undefined}
              onClick={() => setMode(each)}
            >
              {each}
            </button>
          ))}
        </nav>
        <ShopClock client={client} />
        <span className="who">{dispatcher.email}</span>
        <button type="button" onClick={onSignOut}>
          Sign out
        </button>
      </header>
      <main aria-label={mode}>
        <h1>{mode}</h1>
        <p className="detail">Nothing here yet.</p>
      </main>
    </div>
  );
}
