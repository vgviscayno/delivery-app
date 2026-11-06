import type { DriverCredentials, DriverInvite } from "@courier/api-client";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { RememberedDriver } from "./remembered-drivers";

type Step =
  | { readonly kind: "pick" }
  | { readonly kind: "password"; readonly driver: RememberedDriver }
  | { readonly kind: "someone-else" }
  | { readonly kind: "first-time" };

export interface SignInProps {
  readonly remembered: readonly RememberedDriver[];
  readonly notice: string | undefined;
  readonly busy: boolean;
  readonly onSignIn: (credentials: DriverCredentials) => void;
  readonly onAcceptInvite: (invite: DriverInvite) => void;
  readonly onForget: (driver: RememberedDriver) => void;
}

/**
 * Who has used this phone, then a password. Signing in is going On duty, so the screen
 * says so. A driver new to this phone types their email once; a driver new to the shop
 * types the code from their invite email and chooses a password.
 */
export function SignIn({
  remembered,
  notice,
  busy,
  onSignIn,
  onAcceptInvite,
  onForget,
}: SignInProps) {
  const [step, setStep] = useState<Step>(
    remembered.length > 0 ? { kind: "pick" } : { kind: "someone-else" },
  );
  const back = remembered.length > 0 ? () => setStep({ kind: "pick" }) : undefined;

  return (
    <View style={styles.screen}>
      <Text style={styles.heading}>Sign in to go On duty</Text>
      {notice ? (
        <Text style={styles.notice} accessibilityRole="alert">
          {notice}
        </Text>
      ) : null}

      {step.kind === "pick" && (
        <>
          {remembered.map((driver) => (
            <Pressable
              key={driver.email}
              style={styles.name}
              accessibilityRole="button"
              onPress={() => setStep({ kind: "password", driver })}
              onLongPress={() => onForget(driver)}
            >
              <Text style={styles.nameText}>{driver.name}</Text>
            </Pressable>
          ))}
          <Text style={styles.hint}>
            Press and hold a name to remove it from this phone.
          </Text>
          <Link label="Someone else" onPress={() => setStep({ kind: "someone-else" })} />
          <Link
            label="First time here?"
            onPress={() => setStep({ kind: "first-time" })}
          />
        </>
      )}

      {step.kind === "password" && (
        <PasswordForm
          title={step.driver.name}
          fixedEmail={step.driver.email}
          busy={busy}
          onBack={back}
          onSubmit={onSignIn}
        />
      )}

      {step.kind === "someone-else" && (
        <>
          <PasswordForm
            title="Your email"
            busy={busy}
            onBack={back}
            onSubmit={onSignIn}
          />
          <Link
            label="First time here?"
            onPress={() => setStep({ kind: "first-time" })}
          />
        </>
      )}

      {step.kind === "first-time" && (
        <InviteForm
          busy={busy}
          onBack={() =>
            setStep(remembered.length > 0 ? { kind: "pick" } : { kind: "someone-else" })
          }
          onSubmit={onAcceptInvite}
        />
      )}
    </View>
  );
}

function PasswordForm({
  title,
  fixedEmail,
  busy,
  onBack,
  onSubmit,
}: {
  title: string;
  fixedEmail?: string;
  busy: boolean;
  onBack: (() => void) | undefined;
  onSubmit: (credentials: DriverCredentials) => void;
}) {
  const [email, setEmail] = useState(fixedEmail ?? "");
  const [password, setPassword] = useState("");
  const ready = email.trim() !== "" && password !== "" && !busy;

  return (
    <View style={styles.form}>
      <Text style={styles.formTitle}>{title}</Text>
      {fixedEmail === undefined && (
        <Field label="Email" value={email} onChange={setEmail} email />
      )}
      <Field label="Password" value={password} onChange={setPassword} secret />
      <Submit
        label="Sign in"
        busy={busy}
        disabled={!ready}
        onPress={() => onSubmit({ email: email.trim(), password })}
      />
      {onBack && <Link label="Not you?" onPress={onBack} />}
    </View>
  );
}

function InviteForm({
  busy,
  onBack,
  onSubmit,
}: {
  busy: boolean;
  onBack: () => void;
  onSubmit: (invite: DriverInvite) => void;
}) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const ready = email.trim() !== "" && code.trim() !== "" && password !== "" && !busy;

  return (
    <View style={styles.form}>
      <Text style={styles.formTitle}>First time here</Text>
      <Text style={styles.hint}>
        Enter the email the dispatcher invited, the code from the invite email, and the
        password you will sign in with from now on.
      </Text>
      <Field label="Email" value={email} onChange={setEmail} email />
      <Field label="Code from the email" value={code} onChange={setCode} numeric />
      <Field label="Choose a password" value={password} onChange={setPassword} secret />
      <Submit
        label="Set password and sign in"
        busy={busy}
        disabled={!ready}
        onPress={() => onSubmit({ email: email.trim(), code: code.trim(), password })}
      />
      <Link label="Back" onPress={onBack} />
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  secret,
  email,
  numeric,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  secret?: boolean;
  email?: boolean;
  numeric?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        accessibilityLabel={label}
        secureTextEntry={secret}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={email ? "email-address" : numeric ? "number-pad" : "default"}
        autoComplete={
          secret ? "password" : email ? "email" : numeric ? "one-time-code" : "off"
        }
      />
    </View>
  );
}

function Submit({
  label,
  busy,
  disabled,
  onPress,
}: {
  label: string;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.submit, disabled && styles.disabled]}
      accessibilityRole="button"
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
    >
      {busy ? (
        <ActivityIndicator color="#ffffff" />
      ) : (
        <Text style={styles.submitText}>{label}</Text>
      )}
    </Pressable>
  );
}

function Link({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.link}>
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 12 },
  heading: { fontSize: 18, fontWeight: "600" },
  notice: { color: "#b00020" },
  name: {
    borderWidth: 1,
    borderColor: "#c8ccd2",
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  nameText: { fontSize: 18 },
  hint: { color: "#5f6670" },
  form: { gap: 12 },
  formTitle: { fontSize: 18, fontWeight: "500" },
  field: { gap: 4 },
  input: {
    borderWidth: 1,
    borderColor: "#c8ccd2",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  submit: {
    backgroundColor: "#1f5fbf",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
  },
  disabled: { opacity: 0.5 },
  submitText: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
  link: { paddingVertical: 8 },
  linkText: { color: "#1f5fbf", fontSize: 16 },
});
