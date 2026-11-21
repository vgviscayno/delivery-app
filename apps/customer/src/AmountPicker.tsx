import type { Price } from "@courier/domain";
import { StyleSheet, Text, View } from "react-native";
import { StepButton, WeightChips } from "./WeightChips";

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
