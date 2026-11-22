import { ApiError, type CourierClient } from "./client.js";

const SIGN_IN = "sign_in";
const CONSOLE_PROFILE = "console_profile";

const REFUSED = "42501";

export interface ConsoleCredentials {
  readonly email: string;
  readonly password: string;
}

export interface Dispatcher {
  readonly id: string;
  readonly email: string;
}

export type ConsoleAccess =
  | { readonly status: "signed-out" }
  | { readonly status: "dispatcher"; readonly dispatcher: Dispatcher }
  | { readonly status: "refused" };

export async function signInToConsole(
  client: CourierClient,
  credentials: ConsoleCredentials,
): Promise<ConsoleAccess> {
  const { error } = await client.auth.signInWithPassword(credentials);
  if (error) throw new ApiError(SIGN_IN, error);

  return askWhoSignedIn(client);
}

export async function resumeConsoleSession(
  client: CourierClient,
): Promise<ConsoleAccess> {
  const { data } = await client.auth.getSession();
  if (!data.session) return { status: "signed-out" };

  return askWhoSignedIn(client);
}

export async function signOutOfConsole(client: CourierClient): Promise<void> {
  await client.auth.signOut({ scope: "local" });
}

async function askWhoSignedIn(client: CourierClient): Promise<ConsoleAccess> {
  const { data, error } = await client.rpc(CONSOLE_PROFILE);

  if (error?.code === REFUSED) {
    await signOutOfConsole(client);
    return { status: "refused" };
  }

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
