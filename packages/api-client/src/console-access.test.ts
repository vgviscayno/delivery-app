import { describe, expect, it, vi } from "vitest";
import { ApiError, type CourierClient } from "./client.js";
import { resumeConsoleSession, signInToConsole } from "./console-access.js";

const DISPATCHER_ID = "0b8e7c1e-5d0c-4c47-9c1e-3a1f0e6d2a10";

interface Fake {
  signIn?: { error: unknown };
  session?: object | null;
  profile: { data: unknown; error: unknown };
}

function fakeClient({ signIn = { error: null }, session = null, profile }: Fake) {
  const auth = {
    signInWithPassword: vi.fn().mockResolvedValue({ data: {}, ...signIn }),
    getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  };
  const rpc = vi.fn().mockResolvedValue(profile);
  return { client: { auth, rpc } as unknown as CourierClient, auth, rpc };
}

const dispatcherRow = {
  data: [{ id: DISPATCHER_ID, email: "desk@shop.ph" }],
  error: null,
};
const refusal = {
  data: null,
  error: { message: "only an active dispatcher may use the console", code: "42501" },
};
const credentials = { email: "desk@shop.ph", password: "correct horse" };

describe("signInToConsole", () => {
  it("signs a dispatcher in as themselves", async () => {
    const { client, auth, rpc } = fakeClient({ profile: dispatcherRow });

    await expect(signInToConsole(client, credentials)).resolves.toEqual({
      status: "dispatcher",
      dispatcher: { id: DISPATCHER_ID, email: "desk@shop.ph" },
    });
    expect(auth.signInWithPassword).toHaveBeenCalledWith(credentials);
    expect(rpc).toHaveBeenCalledWith("console_profile");
  });

  it("refuses an account that is not a dispatcher, and leaves no session behind", async () => {
    const { client, auth } = fakeClient({ profile: refusal });

    await expect(signInToConsole(client, credentials)).resolves.toEqual({
      status: "refused",
    });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("fails on a wrong password without asking who the account is", async () => {
    const { client, rpc } = fakeClient({
      signIn: {
        error: { message: "Invalid login credentials", code: "invalid_credentials" },
      },
      profile: dispatcherRow,
    });

    await expect(signInToConsole(client, credentials)).rejects.toThrow(ApiError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("drops the session when the server cannot say who signed in", async () => {
    const { client, auth } = fakeClient({
      profile: { data: null, error: { message: "network error" } },
    });

    await expect(signInToConsole(client, credentials)).rejects.toThrow(/console_profile/);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});

describe("resumeConsoleSession", () => {
  it("is signed out when the browser holds no session", async () => {
    const { client, rpc } = fakeClient({ profile: dispatcherRow });

    await expect(resumeConsoleSession(client)).resolves.toEqual({ status: "signed-out" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("resumes a stored dispatcher session", async () => {
    const { client } = fakeClient({ session: {}, profile: dispatcherRow });

    await expect(resumeConsoleSession(client)).resolves.toMatchObject({
      status: "dispatcher",
    });
  });

  it("refuses a stored session whose account can no longer use the console", async () => {
    const { client, auth } = fakeClient({ session: {}, profile: refusal });

    await expect(resumeConsoleSession(client)).resolves.toEqual({ status: "refused" });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
