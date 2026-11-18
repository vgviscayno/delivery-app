import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { editMobileField } from "./mobile-field";
import { Tooltip } from "./Tooltip";

export function EmailField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
}) {
  return (
    <View style={formStyles.field}>
      <Text>Email</Text>
      <TextInput
        style={formStyles.input}
        value={value}
        onChangeText={onChange}
        accessibilityLabel="Email"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="email"
      />
      <FieldError error={error} />
    </View>
  );
}

/** A password, hidden until the customer taps Show. */
export function PasswordField({
  label,
  value,
  onChange,
  isNew,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** A password being chosen, so autofill offers to make one up, not a saved one. */
  isNew: boolean;
  error?: string | undefined;
}) {
  const [shown, setShown] = useState(false);

  return (
    <View style={formStyles.field}>
      <Text>{label}</Text>
      <View style={[formStyles.input, formStyles.inputRow]}>
        <TextInput
          style={formStyles.rowInput}
          value={value}
          onChangeText={onChange}
          accessibilityLabel={label}
          secureTextEntry={!shown}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={isNew ? "new-password" : "current-password"}
        />
        <Pressable
          onPress={() => setShown(!shown)}
          accessibilityRole="button"
          accessibilityLabel={`${shown ? "Hide" : "Show"} ${label.toLowerCase()}`}
          hitSlop={8}
        >
          <Text style={formStyles.linkText}>{shown ? "Hide" : "Show"}</Text>
        </Pressable>
      </View>
      <FieldError error={error} />
    </View>
  );
}

const ABOUT_PHONE =
  "The number the shop calls about your orders — for example, to approve a price change.";

/**
 * The Account phone, labelled for the customer as their phone number: a mobile, so
 * `09` is fixed on screen and `value` is the 9 digits after it, `17 123 4567`.
 */
export function PhoneField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
}) {
  return (
    <View style={formStyles.field}>
      <View style={formStyles.labelRow}>
        <Text>Phone number</Text>
        <Tooltip label="About phone number" text={ABOUT_PHONE} />
      </View>
      <View style={[formStyles.input, formStyles.inputRow, formStyles.flush]}>
        <Text style={formStyles.prefix}>09</Text>
        <TextInput
          style={formStyles.rowInput}
          value={value}
          onChangeText={(text) => onChange(editMobileField(value, text))}
          accessibilityLabel="Phone number, after 09"
          placeholder="17 123 4567"
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
        />
      </View>
      <FieldError error={error} />
    </View>
  );
}

function FieldError({ error }: { error: string | undefined }) {
  return error ? (
    <Text style={formStyles.error} accessibilityRole="alert">
      {error}
    </Text>
  ) : null;
}

export function Submit({
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
      style={[formStyles.submit, disabled && formStyles.disabled]}
      accessibilityRole="button"
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
    >
      {busy ? (
        <ActivityIndicator color="#ffffff" />
      ) : (
        <Text style={formStyles.submitText}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Link({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={formStyles.link}>
      <Text style={formStyles.linkText}>{label}</Text>
    </Pressable>
  );
}

export const formStyles = StyleSheet.create({
  screen: { padding: 16, gap: 12 },
  heading: { fontSize: 18, fontWeight: "600" },
  notice: { color: "#b00020" },
  hint: { color: "#5f6670" },
  field: { gap: 4 },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 0 },
  // `09` reads as the start of the number, so nothing sits between it and the digits.
  flush: { gap: 0 },
  prefix: { fontSize: 16 },
  rowInput: { flex: 1, fontSize: 16, paddingVertical: 12, paddingHorizontal: 0 },
  input: {
    borderWidth: 1,
    borderColor: "#c8ccd2",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  error: { color: "#b00020" },
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
