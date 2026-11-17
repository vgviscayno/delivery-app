import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type FieldKind = "email" | "password" | "phone";

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
        keyboardType={
          kind === "email" ? "email-address" : kind === "phone" ? "phone-pad" : "default"
        }
        autoComplete={kind === "phone" ? "tel" : kind}
      />
      {error ? (
        <Text style={formStyles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
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
