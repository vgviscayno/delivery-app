import {
  type CourierClient,
  type CustomerAccount,
  updateAccountPhone,
} from "@courier/api-client";
import { PHILIPPINE_PHONE_EXAMPLE, parsePhilippinePhone } from "@courier/domain";
import { useState } from "react";
import { Text, View } from "react-native";
import { Field, formStyles, Link, Submit } from "./form";

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
  const [phone, setPhone] = useState(account.accountPhone);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  const unchanged = parsePhilippinePhone(phone) === account.accountPhone;

  const save = async () => {
    setSaved(false);
    if (!parsePhilippinePhone(phone)) {
      setError(PHILIPPINE_PHONE_EXAMPLE);
      return;
    }
    setError(undefined);
    setSaving(true);
    try {
      const updated = await updateAccountPhone(client, phone);
      onAccountChange(updated);
      setPhone(updated.accountPhone);
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
      <Field
        label="Account phone"
        value={phone}
        onChange={(value) => {
          setSaved(false);
          setPhone(value);
        }}
        kind="phone"
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
