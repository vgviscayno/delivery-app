import type { CustomerCredentials, CustomerSignUp } from "@courier/api-client";
import { PHILIPPINE_MOBILE_HINT, parsePhilippineMobile } from "@courier/domain";
import { useState } from "react";
import { Text, View } from "react-native";
import { EmailField, formStyles, Link, PasswordField, PhoneField, Submit } from "./form";
import { typedMobile } from "./mobile-field";

/** Auth's own minimum (`minimum_password_length`), checked here to say it plainly. */
const MINIMUM_PASSWORD_LENGTH = 6;

export interface SignInProps {
  readonly notice: string | undefined;
  readonly busy: boolean;
  readonly onSignIn: (credentials: CustomerCredentials) => void;
  readonly onSignUp: (signUp: CustomerSignUp) => void;
}

interface SignUpErrors {
  readonly password?: string;
  readonly confirmation?: string;
  readonly phone?: string;
}

/** Signing in, or opening an Account: email, password twice, and the Account phone. */
export function SignIn({ notice, busy, onSignIn, onSignUp }: SignInProps) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<SignUpErrors>({});

  const signingUp = mode === "sign-up";
  const filled =
    email.trim() !== "" &&
    password !== "" &&
    (!signingUp || (confirmation !== "" && phone.trim() !== ""));

  const submit = () => {
    if (!signingUp) {
      onSignIn({ email: email.trim(), password });
      return;
    }
    const found: SignUpErrors = {
      ...(password.length < MINIMUM_PASSWORD_LENGTH && {
        password: `Use at least ${MINIMUM_PASSWORD_LENGTH} characters.`,
      }),
      ...(confirmation !== password && { confirmation: "Passwords don't match." }),
      ...(!parsePhilippineMobile(typedMobile(phone)) && {
        phone: PHILIPPINE_MOBILE_HINT,
      }),
    };
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    onSignUp({ email: email.trim(), password, accountPhone: typedMobile(phone) });
  };

  return (
    <View style={formStyles.screen}>
      <Text style={formStyles.heading}>{signingUp ? "Open an Account" : "Sign in"}</Text>
      {notice ? (
        <Text style={formStyles.notice} accessibilityRole="alert">
          {notice}
        </Text>
      ) : null}
      <EmailField value={email} onChange={setEmail} />
      <PasswordField
        label="Password"
        value={password}
        onChange={setPassword}
        isNew={signingUp}
        error={errors.password}
      />
      {signingUp ? (
        <>
          <PasswordField
            label="Confirm password"
            value={confirmation}
            onChange={setConfirmation}
            isNew
            error={errors.confirmation}
          />
          <PhoneField value={phone} onChange={setPhone} error={errors.phone} />
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
          setErrors({});
          setMode(signingUp ? "sign-in" : "sign-up");
        }}
      />
    </View>
  );
}
