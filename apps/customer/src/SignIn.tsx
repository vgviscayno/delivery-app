import type { CustomerCredentials, CustomerSignUp } from "@courier/api-client";
import { PHILIPPINE_PHONE_EXAMPLE, parsePhilippinePhone } from "@courier/domain";
import { useState } from "react";
import { Text, View } from "react-native";
import { Field, formStyles, Link, Submit } from "./form";

export interface SignInProps {
  readonly notice: string | undefined;
  readonly busy: boolean;
  readonly onSignIn: (credentials: CustomerCredentials) => void;
  readonly onSignUp: (signUp: CustomerSignUp) => void;
}

/** Signing in, or opening an Account: email, password and the Account phone. */
export function SignIn({ notice, busy, onSignIn, onSignUp }: SignInProps) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountPhone, setAccountPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string>();

  const signingUp = mode === "sign-up";
  const filled =
    email.trim() !== "" && password !== "" && (!signingUp || accountPhone.trim() !== "");

  const submit = () => {
    if (!signingUp) {
      onSignIn({ email: email.trim(), password });
      return;
    }
    if (!parsePhilippinePhone(accountPhone)) {
      setPhoneError(PHILIPPINE_PHONE_EXAMPLE);
      return;
    }
    setPhoneError(undefined);
    onSignUp({ email: email.trim(), password, accountPhone });
  };

  return (
    <View style={formStyles.screen}>
      <Text style={formStyles.heading}>{signingUp ? "Open an Account" : "Sign in"}</Text>
      {notice ? (
        <Text style={formStyles.notice} accessibilityRole="alert">
          {notice}
        </Text>
      ) : null}
      <Field label="Email" value={email} onChange={setEmail} kind="email" />
      <Field label="Password" value={password} onChange={setPassword} kind="password" />
      {signingUp ? (
        <>
          <Field
            label="Account phone"
            value={accountPhone}
            onChange={setAccountPhone}
            kind="phone"
            error={phoneError}
          />
          <Text style={formStyles.hint}>
            The number the shop and your driver call about your orders.
          </Text>
        </>
      ) : null}
      <Submit
        label={signingUp ? "Open Account" : "Sign in"}
        busy={busy}
        disabled={busy || !filled}
        onPress={submit}
      />
      <Link
        label={signingUp ? "I already have an Account" : "Open an Account"}
        onPress={() => {
          setPhoneError(undefined);
          setMode(signingUp ? "sign-in" : "sign-up");
        }}
      />
    </View>
  );
}
