import {
  acceptDriverInvite,
  type CourierClient,
  createCourierClient,
  type DriverAccess,
  type DriverCredentials,
  type DriverInvite,
  resumeDriverSession,
  signInAsDriver,
  signOutAsDriver,
} from "@courier/api-client";
import Mapbox from "@rnmapbox/maps";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState, StyleSheet, Text } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { readAppBackend } from "./backend";
import {
  loadRememberedDrivers,
  saveRememberedDrivers,
  sessionStorage,
} from "./device-storage";
import { OnDuty } from "./OnDuty";
import {
  forgetDriver,
  type RememberedDriver,
  rememberDriver,
} from "./remembered-drivers";
import { ShopClock } from "./ShopClock";
import { ShopMap } from "./ShopMap";
import { SignIn } from "./SignIn";

export function App() {
  const setup = useMemo(() => {
    try {
      const { backend, mapboxToken } = readAppBackend();
      // Set once, before any map mounts. The style carries no token of its own.
      if (mapboxToken) Mapbox.setAccessToken(mapboxToken);
      return {
        client: createCourierClient(backend, { sessionStorage }),
        hasMapToken: Boolean(mapboxToken),
      };
    } catch (error) {
      return { error: messageOf(error) };
    }
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <StatusBar style="dark" />
        <Text style={styles.title}>Courier driver</Text>
        {"error" in setup ? (
          <Text style={styles.error}>{setup.error}</Text>
        ) : (
          <Session client={setup.client} hasMapToken={setup.hasMapToken} />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

type SessionState =
  | { readonly status: "checking" }
  | (DriverAccess & { readonly notice?: string | undefined });

const REFUSED_NOTICE = "This account cannot use the driver app.";

function Session({
  client,
  hasMapToken,
}: {
  client: CourierClient;
  hasMapToken: boolean;
}) {
  const [session, setSession] = useState<SessionState>({ status: "checking" });
  const [remembered, setRemembered] = useState<RememberedDriver[]>([]);
  const [busy, setBusy] = useState(false);
  const [signOutError, setSignOutError] = useState<string>();

  // supabase-js refreshes the token on a timer, which a backgrounded app cannot keep.
  // Run it only while the app is in front, as Supabase advises for React Native.
  useEffect(() => {
    if (AppState.currentState === "active") void client.auth.startAutoRefresh();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void client.auth.startAutoRefresh();
      else void client.auth.stopAutoRefresh();
    });
    return () => subscription.remove();
  }, [client]);

  useEffect(() => {
    let live = true;
    void (async () => {
      const [names, access] = await Promise.all([
        loadRememberedDrivers(),
        resumeDriverSession(client).catch(
          (error): SessionState => ({ status: "signed-out", notice: messageOf(error) }),
        ),
      ]);
      if (!live) return;
      setRemembered(names);
      setSession(settle(access));
    })();
    return () => {
      live = false;
    };
  }, [client]);

  // Deactivation ends this driver's sessions on the server, so the next refresh fails
  // and supabase-js signs out here too. The screen must not outlive the session.
  useEffect(() => {
    const { data } = client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setSession((current) =>
          current.status === "driver" ? { status: "signed-out" } : current,
        );
      }
    });
    return () => data.subscription.unsubscribe();
  }, [client]);

  const enter = useCallback(async (attempt: () => Promise<DriverAccess>) => {
    setBusy(true);
    try {
      const access = await attempt();
      if (access.status === "driver") {
        const { email, name } = access.driver;
        setRemembered((current) => {
          const next = rememberDriver(current, { email, name });
          void saveRememberedDrivers(next).catch(() => undefined);
          return next;
        });
      }
      setSession(settle(access));
    } catch (error) {
      setSession({ status: "signed-out", notice: messageOf(error) });
    } finally {
      setBusy(false);
    }
  }, []);

  const signIn = useCallback(
    (credentials: DriverCredentials) =>
      void enter(() => signInAsDriver(client, credentials)),
    [client, enter],
  );
  const acceptInvite = useCallback(
    (invite: DriverInvite) => void enter(() => acceptDriverInvite(client, invite)),
    [client, enter],
  );

  const forget = useCallback((driver: RememberedDriver) => {
    setRemembered((current) => {
      const next = forgetDriver(current, driver.email);
      void saveRememberedDrivers(next).catch(() => undefined);
      return next;
    });
  }, []);

  const signOut = useCallback(async () => {
    setBusy(true);
    setSignOutError(undefined);
    try {
      await signOutAsDriver(client);
      setSession({ status: "signed-out" });
    } catch (error) {
      // Still signed in, and still On duty as far as the dispatcher can see.
      setSignOutError(
        `Could not sign out, so you are still On duty: ${messageOf(error)}`,
      );
    } finally {
      setBusy(false);
    }
  }, [client]);

  if (session.status === "checking")
    return <Text style={styles.detail}>Checking session…</Text>;

  if (session.status !== "driver") {
    return (
      <>
        <ShopClock client={client} />
        <SignIn
          remembered={remembered}
          notice={session.notice}
          busy={busy}
          onSignIn={signIn}
          onAcceptInvite={acceptInvite}
          onForget={forget}
        />
      </>
    );
  }

  return (
    <>
      <OnDuty driver={session.driver} busy={busy} onSignOut={() => void signOut()} />
      {signOutError ? (
        <Text style={styles.error} accessibilityRole="alert">
          {signOutError}
        </Text>
      ) : null}
      <ShopClock client={client} />
      <ShopMap hasToken={hasMapToken} />
    </>
  );
}

function settle(access: SessionState): SessionState {
  return access.status === "refused" ? { ...access, notice: REFUSED_NOTICE } : access;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#ffffff" },
  title: { fontSize: 20, fontWeight: "600", padding: 16 },
  detail: { padding: 16 },
  error: { color: "#b00020", padding: 16, fontFamily: "monospace" },
});
