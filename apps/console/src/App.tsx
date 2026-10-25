import {
  type ConsoleAccess,
  type ConsoleCredentials,
  type CourierClient,
  resumeConsoleSession,
  signInToConsole,
  signOutOfConsole,
} from "@courier/api-client";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { hasIdledOut } from "./idle.js";
import { Shell } from "./Shell.js";
import { SignIn } from "./SignIn.js";
import {
  clearActivity,
  readLastActivity,
  recordActivity,
  useIdleSignOut,
} from "./use-idle-sign-out.js";

type Session =
  | { readonly status: "checking" }
  | (ConsoleAccess & { readonly notice?: string | undefined });

const REFUSED_NOTICE = "This account cannot use the dispatcher console.";

export interface AppProps {
  readonly client: CourierClient;
  readonly idleTimeoutMs: number;
}

export function App({ client, idleTimeoutMs }: AppProps) {
  const [session, setSession] = useState<Session>({ status: "checking" });

  const idleNotice = `Signed out after ${formatMinutes(idleTimeoutMs)} without activity.`;

  // A stored session is only resumed if it was used within the timeout. Otherwise a
  // browser closed mid-shift would reopen straight into the console hours later.
  useEffect(() => {
    let live = true;

    void (async () => {
      let next: Session;
      try {
        const lastActivity = readLastActivity();
        if (hasIdledOut(lastActivity, Date.now(), idleTimeoutMs)) {
          // Every deliberate sign-out clears the mark, so one left behind belongs to a
          // session that was abandoned while signed in.
          await signOutOfConsole(client);
          clearActivity();
          next = {
            status: "signed-out",
            notice: lastActivity === null ? undefined : idleNotice,
          };
        } else {
          next = settle(await resumeConsoleSession(client));
        }
      } catch (error) {
        next = { status: "signed-out", notice: messageOf(error) };
      }
      if (live) setSession(next);
    })();

    return () => {
      live = false;
    };
  }, [client, idleTimeoutMs, idleNotice]);

  // A session can end without this tab asking: another tab signed out, or a refresh
  // failed. The shell must not outlive it.
  useEffect(() => {
    const { data } = client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setSession((current) =>
          current.status === "dispatcher" ? { status: "signed-out" } : current,
        );
      }
    });
    return () => data.subscription.unsubscribe();
  }, [client]);

  const signIn = useCallback(
    async (credentials: ConsoleCredentials) => {
      try {
        const access = await signInToConsole(client, credentials);
        if (access.status === "dispatcher") recordActivity();
        setSession(settle(access));
      } catch (error) {
        setSession({ status: "signed-out", notice: messageOf(error) });
      }
    },
    [client],
  );

  const signOut = useCallback(
    async (notice?: string) => {
      await signOutOfConsole(client);
      clearActivity();
      setSession({ status: "signed-out", notice });
    },
    [client],
  );

  if (session.status === "checking")
    return <main className="sign-in">Checking session…</main>;

  if (session.status !== "dispatcher") {
    return <SignIn notice={session.notice} onSubmit={signIn} />;
  }

  return (
    <SignedIn timeoutMs={idleTimeoutMs} onIdle={() => void signOut(idleNotice)}>
      <Shell
        client={client}
        dispatcher={session.dispatcher}
        onSignOut={() => void signOut()}
      />
    </SignedIn>
  );
}

/** Mounted only while a dispatcher is signed in, so the idle clock runs only then. */
function SignedIn({
  timeoutMs,
  onIdle,
  children,
}: {
  timeoutMs: number;
  onIdle: () => void;
  children: ReactNode;
}) {
  useIdleSignOut(timeoutMs, onIdle);
  return children;
}

/** Anything but a dispatcher leaves no activity mark behind for the next boot to find. */
function settle(access: ConsoleAccess): Session {
  if (access.status === "dispatcher") return access;
  clearActivity();
  return access.status === "refused" ? { ...access, notice: REFUSED_NOTICE } : access;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatMinutes(ms: number): string {
  const minutes = ms / 60_000;
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}
