import {
  type Database,
  PHILIPPINE_MOBILE_HINT,
  parsePhilippineMobile,
} from "@courier/domain";
import { ApiError, type CourierClient } from "./client.js";

const SIGN_UP = "sign_up";
const SIGN_IN = "sign_in";
const CUSTOMER_ACCOUNT = "customer_account";
const UPDATE_ACCOUNT_PHONE = "update_account_phone";

/** Postgres' insufficient_privilege, which every customer-app RPC raises to refuse. */
const REFUSED = "42501";

type AccountRow = Database["public"]["Functions"]["customer_account"]["Returns"][number];

/** What the customer types to sign in. */
export interface CustomerCredentials {
  readonly email: string;
  readonly password: string;
}

/** What the customer types to open an Account. The phone however they write it. */
export interface CustomerSignUp extends CustomerCredentials {
  readonly accountPhone: string;
}

/** The customer a session on this phone belongs to, as the Account tab shows them. */
export interface CustomerAccount {
  readonly id: string;
  /** Auth's, and read-only in the app. */
  readonly email: string;
  /** E.164, `+63…`. */
  readonly accountPhone: string;
}

/**
 * Where a customer-app session stands. `refused` is an account that authenticated but
 * may not use the customer app -- a driver, a dispatcher, a deactivated customer. By
 * the time the app sees it, that account has already been signed out of this phone.
 */
export type CustomerAccess =
  | { readonly status: "signed-out" }
  | { readonly status: "customer"; readonly account: CustomerAccount }
  | { readonly status: "refused" };

/**
 * Opens an Account and signs the customer in. The Account phone goes to the server in
 * E.164; the server checks the format again but does not normalise it.
 */
export async function signUpAsCustomer(
  client: CourierClient,
  { email, password, accountPhone }: CustomerSignUp,
): Promise<CustomerAccess> {
  const phone = toE164(SIGN_UP, accountPhone);

  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { data: { account_phone: phone } },
  });
  if (error) throw new ApiError(SIGN_UP, error);
  // Only when Auth requires email confirmation, which this project turns off.
  if (!data.session) {
    throw new ApiError(SIGN_UP, { message: "Confirm your email, then sign in." });
  }

  return askAsCustomer(client);
}

/** Signs in. Wrong credentials throw an `ApiError`. */
export async function signInAsCustomer(
  client: CourierClient,
  credentials: CustomerCredentials,
): Promise<CustomerAccess> {
  const { error } = await client.auth.signInWithPassword(credentials);
  if (error) throw new ApiError(SIGN_IN, error);

  return askAsCustomer(client);
}

/**
 * Picks up a session the phone stored earlier, re-asking who it belongs to: the
 * account may have been deactivated since.
 */
export async function resumeCustomerSession(
  client: CourierClient,
): Promise<CustomerAccess> {
  const { data } = await client.auth.getSession();
  if (!data.session) return { status: "signed-out" };

  return askAsCustomer(client);
}

/** Changes the signed-in customer's own Account phone, typed however they write it. */
export async function updateAccountPhone(
  client: CourierClient,
  accountPhone: string,
): Promise<CustomerAccount> {
  const phone = toE164(UPDATE_ACCOUNT_PHONE, accountPhone);

  const { data, error } = await client.rpc(UPDATE_ACCOUNT_PHONE, { phone });
  const row = data?.[0];
  if (error || !row) {
    throw new ApiError(
      UPDATE_ACCOUNT_PHONE,
      error ?? { message: "the server returned no Account" },
    );
  }
  return toAccount(row);
}

/**
 * Signs out, ending the session on the server and every refresh token with it. If the
 * server cannot be told, this phone lets go all the same.
 */
export async function signOutAsCustomer(client: CourierClient): Promise<void> {
  const ended = await client.auth.signOut({ scope: "global" });
  if (ended.error) await client.auth.signOut({ scope: "local" });
}

async function askAsCustomer(client: CourierClient): Promise<CustomerAccess> {
  const { data, error } = await client.rpc(CUSTOMER_ACCOUNT);

  if (error?.code === REFUSED) {
    await client.auth.signOut({ scope: "local" });
    return { status: "refused" };
  }

  const row = data?.[0];
  if (error || !row) {
    await client.auth.signOut({ scope: "local" });
    throw new ApiError(
      CUSTOMER_ACCOUNT,
      error ?? { message: "the server returned no Account" },
    );
  }

  return { status: "customer", account: toAccount(row) };
}

function toE164(operation: string, typed: string): string {
  const phone = parsePhilippineMobile(typed);
  if (!phone) throw new ApiError(operation, { message: PHILIPPINE_MOBILE_HINT });
  return phone;
}

function toAccount(row: AccountRow): CustomerAccount {
  return { id: row.id, email: row.email, accountPhone: row.account_phone };
}
