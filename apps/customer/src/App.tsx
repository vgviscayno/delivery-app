import {
  type CourierClient,
  type CustomerAccess,
  type CustomerCredentials,
  type CustomerSignUp,
  createCourierClient,
  onSignedOut,
  refreshWhileActive,
  resumeCustomerSession,
  signInAsCustomer,
  signOutAsCustomer,
  signUpAsCustomer,
} from "@courier/api-client";
import Mapbox from "@rnmapbox/maps";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState, StyleSheet, Text } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AccountTab } from "./AccountTab";
import { readAppBackend } from "./backend";
import { customerMessage } from "./customer-message";
import { sessionStorage } from "./device-storage";
import { ShopTab } from "./ShopTab";
import { SignIn } from "./SignIn";
import { type Tab, Tabs } from "./Tabs";
import { clearCart, useCart } from "./use-cart";

export function App() {
  const setup = useMemo(() => {
    try {
      const { backend, mapboxToken } = readAppBackend();
      if (mapboxToken) Mapbox.setAccessToken(mapboxToken);
      return { client: createCourierClient(backend, { sessionStorage }) };
    } catch (error) {
      return { error: messageOf(error) };
    }
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <StatusBar style="dark" />
        <Text style={styles.title}>Courier</Text>
        {"error" in setup ? (
          <Text style={styles.error}>{setup.error}</Text>
        ) : (
          <Session client={setup.client} />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

type SessionState =
  | { readonly status: "checking" }
  | (CustomerAccess & { readonly notice?: string | undefined });

const REFUSED_NOTICE = "This account cannot use the customer app.";

function Session({ client }: { client: CourierClient }) {
  const [session, setSession] = useState<SessionState>({ status: "checking" });
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("Shop");
  const { cart, change: changeCart } = useCart(
    session.status === "customer" ? session.account.id : null,
  );

  useEffect(() => refreshWhileActive(client, AppState), [client]);

  useEffect(() => {
    let live = true;
    void resumeCustomerSession(client)
      .then((access) => {
        if (access.status !== "customer") clearCart();
        return access;
      })
      .catch(
        (error): SessionState => ({
          status: "signed-out",
          notice: customerMessage(error),
        }),
      )
      .then((access) => {
        if (live) setSession(withRefusedNotice(access));
      });
    return () => {
      live = false;
    };
  }, [client]);

  useEffect(
    () =>
      onSignedOut(client, () => {
        clearCart();
        setSession((current) =>
          current.status === "customer" ? { status: "signed-out" } : current,
        );
      }),
    [client],
  );

  const enter = useCallback(async (attempt: () => Promise<CustomerAccess>) => {
    setBusy(true);
    try {
      setTab("Shop");
      setSession(withRefusedNotice(await attempt()));
    } catch (error) {
      setSession({ status: "signed-out", notice: customerMessage(error) });
    } finally {
      setBusy(false);
    }
  }, []);

  const signIn = useCallback(
    (credentials: CustomerCredentials) =>
      void enter(() => signInAsCustomer(client, credentials)),
    [client, enter],
  );
  const signUp = useCallback(
    (details: CustomerSignUp) => void enter(() => signUpAsCustomer(client, details)),
    [client, enter],
  );

  const signOut = useCallback(async () => {
    setBusy(true);
    try {
      await signOutAsCustomer(client);
    } finally {
      clearCart();
      setSession({ status: "signed-out" });
      setBusy(false);
    }
  }, [client]);

  if (session.status === "checking")
    return <Text style={styles.detail}>Checking session…</Text>;

  if (session.status !== "customer") {
    return (
      <SignIn notice={session.notice} busy={busy} onSignIn={signIn} onSignUp={signUp} />
    );
  }

  return (
    <Tabs current={tab} onChange={setTab}>
      {tab === "Shop" ? (
        <ShopTab client={client} cart={cart} onCartChange={changeCart} />
      ) : tab === "Orders" ? (
        <Text style={styles.detail}>No orders yet.</Text>
      ) : (
        <AccountTab
          client={client}
          account={session.account}
          onAccountChange={(account) => setSession({ status: "customer", account })}
          signingOut={busy}
          onSignOut={() => void signOut()}
        />
      )}
    </Tabs>
  );
}

function withRefusedNotice(access: SessionState): SessionState {
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
