import type { ServerClock } from "@courier/domain";
import { toServerClock } from "@courier/domain";
import { ApiError, type CourierClient } from "./client.js";

export {
  deleteCategory,
  deleteProduct,
  fetchCatalog,
  fetchDispatcherCatalog,
  reorderCategories,
  saveCategory,
  saveProduct,
  setCategoryProducts,
  setProductAvailable,
} from "./catalog.js";
export {
  ApiError,
  type CourierClient,
  type CourierClientOptions,
  createCourierClient,
} from "./client.js";
export {
  type ConsoleAccess,
  type ConsoleCredentials,
  type Dispatcher,
  resumeConsoleSession,
  signInToConsole,
  signOutOfConsole,
} from "./console-access.js";
export {
  acceptDriverInvite,
  type Driver,
  type DriverAccess,
  type DriverCredentials,
  type DriverInvite,
  resumeDriverSession,
  signInAsDriver,
  signOutAsDriver,
} from "./driver-access.js";
export {
  type DispatcherDriver,
  type DriverInvitation,
  deactivateDriver,
  fetchDrivers,
  inviteDriver,
} from "./drivers.js";
export {
  type ProductPhotoFiles,
  type ProductPhotoUrls,
  productPhotoUrls,
  removeProductPhoto,
  uploadProductPhoto,
} from "./product-photos.js";
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
