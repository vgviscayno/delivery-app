import {
  type Database,
  PHILIPPINE_MOBILE_HINT,
  parsePhilippineMobile,
} from "@courier/domain";
import { ApiError, type CourierClient } from "./client.js";

export const EMAIL_CONFIRMATION_REQUIRED = "email_confirmation_required";
export const INVALID_EMAIL = "invalid_email";
export const INVALID_ACCOUNT_PHONE = "invalid_account_phone";

const SIGN_UP = "sign_up";
const SIGN_IN = "sign_in";
const CUSTOMER_ACCOUNT = "customer_account";
const UPDATE_ACCOUNT_PHONE = "update_account_phone";

const REFUSED = "42501";

type AccountRow = Database["public"]["Functions"]["customer_account"]["Returns"][number];

export interface CustomerCredentials {
  readonly email: string;
  readonly password: string;
}

export interface CustomerSignUp extends CustomerCredentials {
  readonly accountPhone: string;
}

export interface CustomerAccount {
  readonly id: string;
  readonly email: string;
  readonly accountPhone: string;
}

export type CustomerAccess =
  | { readonly status: "signed-out" }
  | { readonly status: "customer"; readonly account: CustomerAccount }
  | { readonly status: "refused" };

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
  if (error?.code === "validation_failed") {
    throw new ApiError(SIGN_UP, { ...error, code: INVALID_EMAIL });
  }
  if (error) throw new ApiError(SIGN_UP, error);
  if (!data.session) {
    throw new ApiError(SIGN_UP, {
      code: EMAIL_CONFIRMATION_REQUIRED,
      message: "Confirm your email, then sign in.",
    });
  }

  return askAsCustomer(client);
}

export async function signInAsCustomer(
  client: CourierClient,
  credentials: CustomerCredentials,
): Promise<CustomerAccess> {
  const { error } = await client.auth.signInWithPassword(credentials);
  if (error) throw new ApiError(SIGN_IN, error);

  return askAsCustomer(client);
}

export async function resumeCustomerSession(
  client: CourierClient,
): Promise<CustomerAccess> {
  const { data } = await client.auth.getSession();
  if (!data.session) return { status: "signed-out" };

  return askAsCustomer(client);
}

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
  if (!phone) {
    throw new ApiError(operation, {
      code: INVALID_ACCOUNT_PHONE,
      message: PHILIPPINE_MOBILE_HINT,
    });
  }
  return phone;
}

function toAccount(row: AccountRow): CustomerAccount {
  return { id: row.id, email: row.email, accountPhone: row.account_phone };
}
