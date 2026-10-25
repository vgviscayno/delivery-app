import { ApiError, type CourierClient } from "./client.js";

const SIGN_IN = "sign_in";
const CONSOLE_PROFILE = "console_profile";

/** Postgres' insufficient_privilege, which `public.console_profile()` raises to refuse. */
const REFUSED = "42501";

/** What the dispatcher types into the console's sign-in form. */
export interface ConsoleCredentials {
  readonly email: string;
  readonly password: string;
}

/** The dispatcher a console session belongs to. */
export interface Dispatcher {
  readonly id: string;
  readonly email: string;
}

/**
 * Where a console session stands. `refused` is an account that authenticated but may
 * not use the console -- a customer, a driver, a deactivated dispatcher. By the time
 * the console sees it, that account has already been signed out of this browser.
 */
export type ConsoleAccess =
  | { readonly status: "signed-out" }
  | { readonly status: "dispatcher"; readonly dispatcher: Dispatcher }
  | { readonly status: "refused" };

/**
 * Signs in to the dispatcher console with email and password.
 *
 * Authenticating is not enough: one Auth instance holds customers and drivers too, so
 * the server is asked who the account is, and anything but an active dispatcher is
 * signed straight back out. Wrong credentials throw an `ApiError`.
 */
export async function signInToConsole(
  client: CourierClient,
  credentials: ConsoleCredentials,
): Promise<ConsoleAccess> {
  const { error } = await client.auth.signInWithPassword(credentials);
  if (error) throw new ApiError(SIGN_IN, error);

  return askWhoSignedIn(client);
}

/**
 * Picks up a session the browser stored earlier, re-asking the server who it belongs
 * to: the account may have been deactivated since.
 */
export async function resumeConsoleSession(
  client: CourierClient,
): Promise<ConsoleAccess> {
  const { data } = await client.auth.getSession();
  if (!data.session) return { status: "signed-out" };

  return askWhoSignedIn(client);
}

/**
 * Ends the console session in this browser only. `global` would also end the same
 * dispatcher's session on every other machine, which an idle tab has no business doing.
 */
export async function signOutOfConsole(client: CourierClient): Promise<void> {
  await client.auth.signOut({ scope: "local" });
}

async function askWhoSignedIn(client: CourierClient): Promise<ConsoleAccess> {
  const { data, error } = await client.rpc(CONSOLE_PROFILE);

  if (error?.code === REFUSED) {
    await signOutOfConsole(client);
    return { status: "refused" };
  }

  // A session the server could not vouch for is not kept around on trust.
  const row = data?.[0];
  if (error || !row) {
    await signOutOfConsole(client);
    throw new ApiError(
      CONSOLE_PROFILE,
      error ?? { message: "the server returned no profile" },
    );
  }

  return { status: "dispatcher", dispatcher: { id: row.id, email: row.email } };
}
