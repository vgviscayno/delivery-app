export interface RememberedDriver {
  readonly email: string;
  readonly name: string;
}

const MOST_REMEMBERED = 8;

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
