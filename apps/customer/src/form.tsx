import { formatPhilippinePhone } from "@courier/domain";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Tooltip } from "./Tooltip";

type FieldKind = "email" | "password";

export function Field({
  label,
  value,
  onChange,
  kind,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  kind: FieldKind;
  error?: string | undefined;
}) {
  return (
    <View style={formStyles.field}>
      <Text>{label}</Text>
      <TextInput
        style={formStyles.input}
        value={value}
        onChangeText={onChange}
        accessibilityLabel={label}
        secureTextEntry={kind === "password"}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={kind === "email" ? "email-address" : "default"}
        autoComplete={kind}
      />
      <FieldError error={error} />
    </View>
  );
}

const ABOUT_PHONE =
  "The number the shop calls about your orders — for example, to approve a price change.";

/**
 * The Account phone, labelled for the customer as their phone number. `+63` is fixed on
 * screen and the rest is grouped as they type; `value` is what they see, `917 123 4567`.
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
  const change = (text: string) => {
    // Backspacing over a space removes no digit, and regrouping would put the space
    // straight back: take the digit before it instead.
    const digits = (t: string) => t.replace(/\D/g, "");
    const deletedSeparator = text.length < value.length && digits(text) === digits(value);
    onChange(formatPhilippinePhone(deletedSeparator ? digits(text).slice(0, -1) : text));
  };

  return (
    <View style={formStyles.field}>
      <View style={formStyles.labelRow}>
        <Text>Phone number</Text>
        <Tooltip label="About phone number" text={ABOUT_PHONE} />
      </View>
      <View style={[formStyles.input, formStyles.phoneRow]}>
        <Text style={formStyles.prefix}>+63</Text>
        <TextInput
          style={formStyles.phoneInput}
          value={value}
          onChangeText={change}
          accessibilityLabel="Phone number, after +63"
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
  phoneRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 0 },
  prefix: { fontSize: 16, color: "#5f6670" },
  phoneInput: { flex: 1, fontSize: 16, paddingVertical: 12 },
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
