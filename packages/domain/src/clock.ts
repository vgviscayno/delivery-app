import { TIME_ZONE } from "@courier/config";
import type { Database } from "./generated/database.types.js";

/** The row `public.server_clock()` returns, straight from the generated schema. */
type ServerClockRow = Database["public"]["Functions"]["server_clock"]["Returns"][number];

/**
 * What time the shop thinks it is.
 *
 * Read from the server and never computed on a client: every rule that turns on the
 * clock — the Ordering window, the Same-day cutoff, the 7-day horizon, duty auto-end
 * — is judged server-side against `app.now()`, so a surface that worked out its own
 * Manila date could disagree with the rule it is trying to explain.
 */
export interface ServerClock {
  /** The instant, as an absolute point in time. */
  readonly instant: Date;
  /** The Asia/Manila wall clock, ready to display: `2026-09-26 15:30:00`. */
  readonly localTime: string;
  /** The current delivery day in Asia/Manila: `2026-09-26`. */
  readonly localDate: string;
  /** Always `Asia/Manila`. Carried so a client renders the zone it was told, not one it assumed. */
  readonly timeZone: string;
}

export class ServerClockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServerClockError";
  }
}

/**
 * Turns the generated row into the domain type, and refuses a clock that disagrees
 * with the one time zone this system has. A mismatch means the database is not the
 * one we think it is — a preview branch pointed at the wrong project, say — and every
 * time rule downstream would be wrong in a way nobody would notice.
 */
export function toServerClock(row: ServerClockRow): ServerClock {
  if (row.time_zone !== TIME_ZONE) {
    throw new ServerClockError(
      `The server reports its time zone as ${row.time_zone}, not ${TIME_ZONE}.`,
    );
  }

  const instant = new Date(row.instant);
  if (Number.isNaN(instant.getTime())) {
    throw new ServerClockError(
      `The server reported an unreadable instant: ${row.instant}`,
    );
  }

  return {
    instant,
    localTime: row.local_time,
    localDate: row.local_date,
    timeZone: row.time_zone,
  };
}
