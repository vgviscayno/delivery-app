import type { Price } from "@courier/domain";
import { StyleSheet, Text, View } from "react-native";
import { StepButton, WeightChips } from "./WeightChips";

/**
 * How much of a Product: weight chips for a per-weight one, a quantity stepper for a
 * per-unit one. The Product sheet and the cart line both use this, so a customer edits
 * a line with the control they picked it with. Controlled; `amount` is units or grams.
 */
export function AmountPicker({
  price,
  amount,
  onChange,
}: {
  price: Price;
  amount: number;
  onChange: (amount: number) => void;
}) {
  if (price.type === "per_weight") {
    return (
      <WeightChips stepGrams={price.weightStepGrams} grams={amount} onChange={onChange} />
    );
  }
  return (
    <View style={styles.stepper}>
      <StepButton
        label="−"
        accessibilityLabel="One fewer"
        disabled={amount <= 1}
        onPress={() => onChange(Math.max(amount - 1, 1))}
      />
      <Text style={styles.value} accessibilityLiveRegion="polite">
        {amount}
      </Text>
      <StepButton
        label="+"
        accessibilityLabel="One more"
        onPress={() => onChange(amount + 1)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: "row", alignItems: "center", gap: 16 },
  value: {
    fontSize: 17,
    fontVariant: ["tabular-nums"],
    minWidth: 40,
    textAlign: "center",
  },
});
