/**
 * An instant as the shop's wall clock reads it, `07:55`. Always Asia/Manila, whatever
 * time zone the phone thinks it is in.
 */
export function formatShopTime(instant: string): string {
  return new Date(instant).toLocaleTimeString("en-GB", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
  });
}
