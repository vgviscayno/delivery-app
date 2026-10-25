import { type CourierClient, fetchServerClock } from "@courier/api-client";
import { useEffect, useState } from "react";
import {
  type ClockView,
  describeClock,
  describeClockFailure,
  LOADING_CLOCK,
} from "./clock-view.js";

export function ShopClock({ client }: { client: CourierClient }) {
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
    <section className="shop-clock" aria-label="Shop clock" data-state={view.state}>
      <p className="clock">{view.label}</p>
      <p className="detail">{view.detail}</p>
    </section>
  );
}
