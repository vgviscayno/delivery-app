import {
  type CourierClient,
  type CustomerAccount,
  updateAccountPhone,
} from "@courier/api-client";
import { PHILIPPINE_MOBILE_HINT, parsePhilippineMobile } from "@courier/domain";
import { useState } from "react";
import { Text, View } from "react-native";
import { customerMessage } from "./customer-message";
import { formStyles, Link, PhoneField, Submit } from "./form";
import { mobileFieldOf, typedMobile } from "./mobile-field";

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
  const [phone, setPhone] = useState(mobileFieldOf(account.accountPhone));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  const unchanged = parsePhilippineMobile(typedMobile(phone)) === account.accountPhone;

  const save = async () => {
    setSaved(false);
    if (!parsePhilippineMobile(typedMobile(phone))) {
      setError(PHILIPPINE_MOBILE_HINT);
      return;
    }
    setError(undefined);
    setSaving(true);
    try {
      const updated = await updateAccountPhone(client, typedMobile(phone));
      onAccountChange(updated);
      setPhone(mobileFieldOf(updated.accountPhone));
      setSaved(true);
    } catch (failure) {
      setError(customerMessage(failure));
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
