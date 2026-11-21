import { TIME_ZONE } from "@courier/config";
import type { Database } from "./generated/database.types.js";

type ServerClockRow = Database["public"]["Functions"]["server_clock"]["Returns"][number];

export interface ServerClock {
  readonly instant: Date;
  readonly localTime: string;
  readonly localDate: string;
  readonly timeZone: string;
}

export class ServerClockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServerClockError";
  }
}

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
