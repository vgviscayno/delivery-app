import { fetchServerClock, type CourierClient } from "@courier/api-client";
import type { ServerClock } from "@courier/domain";
import { useEffect, useState } from "react";
import { describeClock, type ClockView } from "./clock-view.js";

export function App({ client }: { client: CourierClient }) {
  const [view, setView] = useState<ClockView>({
    state: "loading",
    label: "Reading the shop clock…",
  });

  useEffect(() => {
    let live = true;

    const read = async () => {
      try {
        const clock: ServerClock = await fetchServerClock(client);
        if (live) setView(describeClock(clock));
      } catch (error) {
        if (live)
          setView(
            describeClock(error instanceof Error ? error : new Error(String(error))),
          );
      }
    };

    void read();
    const timer = setInterval(() => void read(), 1000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [client]);

  return (
    <main>
      <h1>Courier Ops</h1>
      <p>Dispatcher console</p>
      <section aria-label="Shop clock" data-state={view.state}>
        <h2>Shop clock</h2>
        <p className="clock">{view.label}</p>
        <p className="detail">{view.detail}</p>
      </section>
    </main>
  );
}
