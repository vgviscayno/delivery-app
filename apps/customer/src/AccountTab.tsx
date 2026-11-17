import {
  type CourierClient,
  type CustomerAccount,
  updateAccountPhone,
} from "@courier/api-client";
import {
  formatPhilippinePhone,
  PHILIPPINE_PHONE_HINT,
  parsePhilippinePhone,
} from "@courier/domain";
import { useState } from "react";
import { Text, View } from "react-native";
import { formStyles, Link, PhoneField, Submit } from "./form";

export interface AccountTabProps {
  readonly client: CourierClient;
  readonly account: CustomerAccount;
  readonly onAccountChange: (account: CustomerAccount) => void;
  readonly signingOut: boolean;
  readonly onSignOut: () => void;
}

/** The email, read-only; the Account phone, editable; and signing out. */
export function AccountTab({
  client,
  account,
  onAccountChange,
  signingOut,
  onSignOut,
}: AccountTabProps) {
  const [phone, setPhone] = useState(formatPhilippinePhone(account.accountPhone));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  const unchanged = parsePhilippinePhone(phone) === account.accountPhone;

  const save = async () => {
    setSaved(false);
    if (!parsePhilippinePhone(phone)) {
      setError(PHILIPPINE_PHONE_HINT);
      return;
    }
    setError(undefined);
    setSaving(true);
    try {
      const updated = await updateAccountPhone(client, phone);
      onAccountChange(updated);
      setPhone(formatPhilippinePhone(updated.accountPhone));
      setSaved(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={formStyles.screen}>
      <Text style={formStyles.heading}>Account</Text>
      <View style={formStyles.field}>
        <Text>Email</Text>
        <Text style={formStyles.hint} accessibilityLabel={`Email, ${account.email}`}>
          {account.email}
        </Text>
      </View>
      <PhoneField
        value={phone}
        onChange={(value) => {
          setSaved(false);
          setPhone(value);
        }}
        error={error}
      />
      {saved ? <Text style={formStyles.hint}>Saved.</Text> : null}
      <Submit
        label="Save phone"
        busy={saving}
        disabled={saving || unchanged || phone.trim() === ""}
        onPress={() => void save()}
      />
      <Link label={signingOut ? "Signing out…" : "Sign out"} onPress={onSignOut} />
    </View>
  );
}
