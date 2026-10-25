import type { ServerClock } from "@courier/domain";
import { toServerClock } from "@courier/domain";
import { ApiError, type CourierClient } from "./client.js";

export { ApiError, type CourierClient, createCourierClient } from "./client.js";
export {
  type ConsoleAccess,
  type ConsoleCredentials,
  type Dispatcher,
  resumeConsoleSession,
  signInToConsole,
  signOutOfConsole,
} from "./console-access.js";
export {
  addShopClosure,
  fetchShopSettings,
  removeShopClosure,
  replaceQrPhImage,
  saveShopSettings,
  setOrderingDay,
  signShopImage,
} from "./shop-settings.js";

const SERVER_CLOCK = "server_clock";

/** Reads the shop clock. The one call the walking skeleton makes end to end. */
export async function fetchServerClock(client: CourierClient): Promise<ServerClock> {
  const { data, error } = await client.rpc(SERVER_CLOCK);

  if (error) throw new ApiError(SERVER_CLOCK, error);

  const row = data?.[0];
  if (!row) throw new ApiError(SERVER_CLOCK, { message: "the server returned no clock" });

  return toServerClock(row);
}
