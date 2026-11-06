/**
 * Who has signed in on this phone. The phones belong to the vans and bikes, not the
 * drivers, so the sign-in screen offers the names it has seen: the driver taps theirs
 * and types only a password. Nothing here is a credential; it saves typing an email.
 */

export interface RememberedDriver {
  readonly email: string;
  readonly name: string;
}

/** Enough for a small fleet's rotation; older names fall off the end. */
const MOST_REMEMBERED = 8;

/** Whoever just signed in goes to the top, once, under the name the server gave. */
export function rememberDriver(
  remembered: readonly RememberedDriver[],
  driver: RememberedDriver,
): RememberedDriver[] {
  const email = normalise(driver.email);
  return [{ email, name: driver.name }, ...forgetDriver(remembered, email)].slice(
    0,
    MOST_REMEMBERED,
  );
}

export function forgetDriver(
  remembered: readonly RememberedDriver[],
  email: string,
): RememberedDriver[] {
  const forgotten = normalise(email);
  return remembered.filter((each) => normalise(each.email) !== forgotten);
}

/** What the phone stored, or nobody: an unreadable list is not worth failing over. */
export function parseRememberedDrivers(stored: string | null): RememberedDriver[] {
  if (stored === null) return [];
  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(isRememberedDriver) : [];
  } catch {
    return [];
  }
}

function isRememberedDriver(value: unknown): value is RememberedDriver {
  if (typeof value !== "object" || value === null) return false;
  const { email, name } = value as Record<string, unknown>;
  return typeof email === "string" && typeof name === "string";
}

function normalise(email: string): string {
  return email.trim().toLowerCase();
}
