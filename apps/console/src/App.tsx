import { fetchServerClock, type CourierClient } from "@courier/api-client";
import { useEffect, useState } from "react";
import {
  describeClock,
  describeClockFailure,
  LOADING_CLOCK,
  type ClockView,
} from "./clock-view.js";

export function App({ client }: { client: CourierClient }) {
  const [view, setView] = useState<ClockView>(LOADING_CLOCK);

  // Read once. The Shop clock only ever answers "what time is it now", and the console
  // has nothing that watches it change -- a read per second per open console would be
  // one call per second spent on a question nobody asked again.
  useEffect(() => {
    let live = true;

    void (async () => {
      try {
        const clock = await fetchServerClock(client);
        if (live) setView(describeClock(clock));
      } catch (error) {
        if (live) setView(describeClockFailure(error));
      }
    })();

    return () => {
      live = false;
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
