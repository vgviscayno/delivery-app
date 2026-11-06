import { describe, expect, it, vi } from "vitest";
import type { CourierClient } from "./client.js";
import { ApiError } from "./client.js";
import {
  acceptDriverInvite,
  resumeDriverSession,
  signInAsDriver,
  signOutAsDriver,
} from "./driver-access.js";

const DRIVER_ID = "d1500000-0000-4000-8000-000000000101";

type Result = { data: unknown; error: unknown };

interface Fake {
  signIn?: { error: unknown };
  session?: object | null;
  rpc?: Record<string, Result>;
}

function fakeClient({ signIn = { error: null }, session = null, rpc = {} }: Fake) {
  const auth = {
    signInWithPassword: vi.fn().mockResolvedValue({ data: {}, ...signIn }),
    verifyOtp: vi.fn().mockResolvedValue({ data: {}, error: null }),
    updateUser: vi.fn().mockResolvedValue({ data: {}, error: null }),
    getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  };
  const call = vi.fn((name: string) =>
    Promise.resolve(
      rpc[name] ?? { data: null, error: { message: `no fake for ${name}` } },
    ),
  );
  return { client: { auth, rpc: call } as unknown as CourierClient, auth, rpc: call };
}

const onDuty = {
  data: [
    {
      id: DRIVER_ID,
      email: "driver1@courier.local",
      name: "Jun Santos",
      on_duty: true,
      on_duty_changed_at: "2026-11-06T07:55:00+08:00",
    },
  ],
  error: null,
};
const refusal = {
  data: null,
  error: { message: "only an active driver may use the driver app", code: "42501" },
};
const credentials = { email: "driver1@courier.local", password: "driver-demo" };

describe("signInAsDriver", () => {
  it("signs a driver in and puts them On duty", async () => {
    const { client, auth, rpc } = fakeClient({ rpc: { go_on_duty: onDuty } });

    await expect(signInAsDriver(client, credentials)).resolves.toEqual({
      status: "driver",
      driver: {
        id: DRIVER_ID,
        email: "driver1@courier.local",
        name: "Jun Santos",
        onDuty: true,
        onDutyChangedAt: "2026-11-06T07:55:00+08:00",
      },
    });
    expect(auth.signInWithPassword).toHaveBeenCalledWith(credentials);
    expect(rpc).toHaveBeenCalledWith("go_on_duty");
  });

  it("refuses an account that is not an active driver, and leaves no session behind", async () => {
    const { client, auth } = fakeClient({ rpc: { go_on_duty: refusal } });

    await expect(signInAsDriver(client, credentials)).resolves.toEqual({
      status: "refused",
    });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});

describe("signInAsDriver, deactivated", () => {
  it("is refused, like any account that is not an active driver, once Auth has banned it", async () => {
    const { client, rpc } = fakeClient({
      signIn: { error: { message: "User is banned", code: "user_banned" } },
    });

    await expect(signInAsDriver(client, credentials)).resolves.toEqual({
      status: "refused",
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("resumeDriverSession", () => {
  it("is signed out when the phone holds no session", async () => {
    const { client, rpc } = fakeClient({});

    await expect(resumeDriverSession(client)).resolves.toEqual({ status: "signed-out" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("resumes a stored session without signing in again", async () => {
    const { client, rpc } = fakeClient({ session: {}, rpc: { driver_profile: onDuty } });

    await expect(resumeDriverSession(client)).resolves.toMatchObject({
      status: "driver",
      driver: { name: "Jun Santos", onDuty: true },
    });
    expect(rpc).toHaveBeenCalledWith("driver_profile");
    expect(rpc).not.toHaveBeenCalledWith("go_on_duty");
  });

  it("refuses a stored session whose driver has been deactivated since", async () => {
    const { client, auth } = fakeClient({
      session: {},
      rpc: { driver_profile: refusal },
    });

    await expect(resumeDriverSession(client)).resolves.toEqual({ status: "refused" });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});

describe("acceptDriverInvite", () => {
  const invite = { email: "lito@courier.local", code: "512178", password: "lito-pass-1" };

  it("turns the invite code into a password and a first sign-in, On duty", async () => {
    const { client, auth, rpc } = fakeClient({ rpc: { go_on_duty: onDuty } });

    await expect(acceptDriverInvite(client, invite)).resolves.toMatchObject({
      status: "driver",
    });
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      email: "lito@courier.local",
      token: "512178",
      type: "invite",
    });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "lito-pass-1" });
    expect(rpc).toHaveBeenCalledWith("go_on_duty");
  });

  it("sets no password when the code is wrong or spent", async () => {
    const { client, auth } = fakeClient({ rpc: { go_on_duty: onDuty } });
    auth.verifyOtp.mockResolvedValue({
      data: {},
      error: { message: "Token has expired or is invalid", code: "otp_expired" },
    });

    await expect(acceptDriverInvite(client, invite)).rejects.toThrow(ApiError);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("leaves no half-finished session when the password is refused", async () => {
    const { client, auth, rpc } = fakeClient({ rpc: { go_on_duty: onDuty } });
    auth.updateUser.mockResolvedValue({
      data: {},
      error: {
        message: "Password should be at least 6 characters.",
        code: "weak_password",
      },
    });

    await expect(acceptDriverInvite(client, invite)).rejects.toThrow(/at least 6/);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("signOutAsDriver", () => {
  const offDuty = { data: [{ ...onDuty.data[0], on_duty: false }], error: null };

  it("takes the driver off duty, then lets go of the session", async () => {
    const { client, auth, rpc } = fakeClient({ rpc: { go_off_duty: offDuty } });

    await signOutAsDriver(client);

    expect(rpc).toHaveBeenCalledWith("go_off_duty");
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(
      auth.signOut.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("keeps the session when the server could not be told, so nobody is left On duty unseen", async () => {
    const { client, auth } = fakeClient({
      rpc: { go_off_duty: { data: null, error: { message: "network error" } } },
    });

    await expect(signOutAsDriver(client)).rejects.toThrow(/go_off_duty/);
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("lets go of the session anyway when the account is no longer a driver", async () => {
    const { client, auth } = fakeClient({ rpc: { go_off_duty: refusal } });

    await signOutAsDriver(client);

    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
