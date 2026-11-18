import { describe, expect, it, vi } from "vitest";
import type { CourierClient } from "./client.js";
import { ApiError } from "./client.js";
import {
  resumeCustomerSession,
  signInAsCustomer,
  signOutAsCustomer,
  signUpAsCustomer,
  updateAccountPhone,
} from "./customer-access.js";

const CUSTOMER_ID = "c1500000-0000-4000-8000-000000000201";

type Result = { data: unknown; error: unknown };

interface Fake {
  signUp?: Result;
  signIn?: { error: unknown };
  session?: object | null;
  globalSignOut?: { error: unknown };
  rpc?: Record<string, Result>;
}

function fakeClient({
  signUp = { data: { session: {} }, error: null },
  signIn = { error: null },
  session = null,
  globalSignOut = { error: null },
  rpc = {},
}: Fake) {
  const auth = {
    signUp: vi.fn().mockResolvedValue(signUp),
    signInWithPassword: vi.fn().mockResolvedValue({ data: {}, ...signIn }),
    getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
    signOut: vi.fn(({ scope }: { scope: string }) =>
      Promise.resolve(scope === "global" ? globalSignOut : { error: null }),
    ),
  };
  const call = vi.fn((name: string) =>
    Promise.resolve(
      rpc[name] ?? { data: null, error: { message: `no fake for ${name}` } },
    ),
  );
  return { client: { auth, rpc: call } as unknown as CourierClient, auth, rpc: call };
}

const accountRow = (account_phone: string) => ({
  data: [{ id: CUSTOMER_ID, email: "lia@example.com", account_phone }],
  error: null,
});
const theAccount = accountRow("+639171234567");
const refusal = {
  data: null,
  error: { message: "only an active customer may use the customer app", code: "42501" },
};
const signedIn = {
  status: "customer",
  account: { id: CUSTOMER_ID, email: "lia@example.com", accountPhone: "+639171234567" },
};

describe("signUpAsCustomer", () => {
  const signUp = {
    email: "lia@example.com",
    password: "s3cret!",
    accountPhone: "0917 123 4567",
  };

  it("opens an Account with the Account phone in E.164, and signs the customer in", async () => {
    const { client, auth } = fakeClient({ rpc: { customer_account: theAccount } });

    await expect(signUpAsCustomer(client, signUp)).resolves.toEqual(signedIn);
    expect(auth.signUp).toHaveBeenCalledWith({
      email: "lia@example.com",
      password: "s3cret!",
      options: { data: { account_phone: "+639171234567" } },
    });
  });

  it("refuses a number that is not Philippine before asking the server", async () => {
    const { client, auth } = fakeClient({});

    await expect(
      signUpAsCustomer(client, { ...signUp, accountPhone: "12345" }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("refuses a landline before asking the server: the Account phone is a mobile", async () => {
    const { client, auth } = fakeClient({});

    await expect(
      signUpAsCustomer(client, { ...signUp, accountPhone: "(02) 8123 4567" }),
    ).rejects.toMatchObject({
      code: "invalid_account_phone",
      message: expect.stringContaining("Enter your mobile number"),
    });
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("names an email Auth could not validate, since that is all sign-up leaves it to check", async () => {
    const { client } = fakeClient({
      signUp: {
        data: { session: null },
        error: {
          message: "Unable to validate email address: invalid format",
          code: "validation_failed",
        },
      },
    });

    await expect(signUpAsCustomer(client, signUp)).rejects.toMatchObject({
      code: "invalid_email",
    });
  });

  it("passes on what Auth refused, such as an email already in use", async () => {
    const { client } = fakeClient({
      signUp: {
        data: { session: null },
        error: { message: "User already registered", code: "user_already_exists" },
      },
    });

    await expect(signUpAsCustomer(client, signUp)).rejects.toMatchObject({
      code: "user_already_exists",
      message: expect.stringContaining("User already registered"),
    });
  });

  it("says to confirm the email when Auth opens the Account without a session", async () => {
    const { client } = fakeClient({ signUp: { data: { session: null }, error: null } });

    await expect(signUpAsCustomer(client, signUp)).rejects.toMatchObject({
      code: "email_confirmation_required",
      message: expect.stringMatching(/confirm your email/i),
    });
  });
});

describe("signInAsCustomer", () => {
  const credentials = { email: "lia@example.com", password: "s3cret!" };

  it("signs a customer in and reads their Account", async () => {
    const { client, auth } = fakeClient({ rpc: { customer_account: theAccount } });

    await expect(signInAsCustomer(client, credentials)).resolves.toEqual(signedIn);
    expect(auth.signInWithPassword).toHaveBeenCalledWith(credentials);
  });

  it("refuses an account that is not an active customer, and leaves no session behind", async () => {
    const { client, auth } = fakeClient({ rpc: { customer_account: refusal } });

    await expect(signInAsCustomer(client, credentials)).resolves.toEqual({
      status: "refused",
    });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("says when the server could not be reached", async () => {
    const { client } = fakeClient({
      signIn: {
        error: {
          name: "AuthRetryableFetchError",
          message: "Network request failed",
          status: 0,
        },
      },
    });

    await expect(signInAsCustomer(client, credentials)).rejects.toMatchObject({
      code: "network_failure",
    });
  });

  it("passes on wrong credentials", async () => {
    const { client } = fakeClient({
      signIn: {
        error: { message: "Invalid login credentials", code: "invalid_credentials" },
      },
    });

    await expect(signInAsCustomer(client, credentials)).rejects.toThrow(
      "Invalid login credentials",
    );
  });
});

describe("resumeCustomerSession", () => {
  it("is signed out when the phone holds no session", async () => {
    const { client, rpc } = fakeClient({});

    await expect(resumeCustomerSession(client)).resolves.toEqual({
      status: "signed-out",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("picks up the stored session and re-reads the Account", async () => {
    const { client } = fakeClient({ session: {}, rpc: { customer_account: theAccount } });

    await expect(resumeCustomerSession(client)).resolves.toEqual(signedIn);
  });

  it("lets go of a stored session that is no longer an active customer's", async () => {
    const { client, auth } = fakeClient({
      session: {},
      rpc: { customer_account: refusal },
    });

    await expect(resumeCustomerSession(client)).resolves.toEqual({ status: "refused" });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("passes on a failure to read the Account", async () => {
    const { client } = fakeClient({
      session: {},
      rpc: { customer_account: { data: null, error: { message: "network down" } } },
    });

    await expect(resumeCustomerSession(client)).rejects.toThrow("network down");
  });
});

describe("updateAccountPhone", () => {
  it("says when the server could not be reached", async () => {
    const { client } = fakeClient({
      rpc: {
        update_account_phone: {
          data: null,
          error: { message: "TypeError: Network request failed", code: "" },
        },
      },
    });

    await expect(updateAccountPhone(client, "0918 987 6543")).rejects.toMatchObject({
      code: "network_failure",
    });
  });

  it("stores the number in E.164 and returns the Account as it now is", async () => {
    const { client, rpc } = fakeClient({
      rpc: { update_account_phone: accountRow("+639189876543") },
    });

    await expect(updateAccountPhone(client, "+63 918-987-6543")).resolves.toEqual({
      id: CUSTOMER_ID,
      email: "lia@example.com",
      accountPhone: "+639189876543",
    });
    expect(rpc).toHaveBeenCalledWith("update_account_phone", { phone: "+639189876543" });
  });

  it("refuses a number that is not Philippine before asking the server", async () => {
    const { client, rpc } = fakeClient({});

    await expect(updateAccountPhone(client, "call me")).rejects.toBeInstanceOf(ApiError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("passes on what the server refused", async () => {
    const { client } = fakeClient({ rpc: { update_account_phone: refusal } });

    await expect(updateAccountPhone(client, "0918 987 6543")).rejects.toThrow(
      "only an active customer",
    );
  });
});

describe("signOutAsCustomer", () => {
  it("ends the session everywhere", async () => {
    const { client, auth } = fakeClient({});

    await signOutAsCustomer(client);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "global" });
    expect(auth.signOut).not.toHaveBeenCalledWith({ scope: "local" });
  });

  it("still lets go on this phone when the server cannot be told", async () => {
    const { client, auth } = fakeClient({
      globalSignOut: { error: { message: "offline" } },
    });

    await signOutAsCustomer(client);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
