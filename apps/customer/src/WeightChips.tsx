import { formatWeight, stepWeight, weightChips } from "@courier/domain";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export function WeightChips({
  stepGrams,
  grams,
  onChange,
}: {
  stepGrams: number;
  grams: number;
  onChange: (grams: number) => void;
}) {
  const chips = weightChips(stepGrams);
  const [customChosen, setCustomChosen] = useState(false);
  const custom = customChosen || !chips.includes(grams);
  const lower = stepWeight(grams, stepGrams, -1);

  return (
    <View>
      <View style={styles.chips}>
        {chips.map((chip) => (
          <Chip
            key={chip}
            label={formatWeight(chip)}
            selected={!custom && chip === grams}
            onPress={() => {
              setCustomChosen(false);
              onChange(chip);
            }}
          />
        ))}
        <Chip label="Custom…" selected={custom} onPress={() => setCustomChosen(true)} />
      </View>
      {custom && (
        <View style={styles.stepper}>
          <StepButton
            label="−"
            accessibilityLabel={`${formatWeight(stepGrams)} less`}
            disabled={lower === grams}
            onPress={() => onChange(lower)}
          />
          <Text style={styles.value} accessibilityLiveRegion="polite">
            ~{formatWeight(grams)}
          </Text>
          <StepButton
            label="+"
            accessibilityLabel={`${formatWeight(stepGrams)} more`}
            onPress={() => onChange(stepWeight(grams, stepGrams, 1))}
          />
        </View>
      )}
    </View>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.chip, selected && styles.chipSelected]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
    >
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function StepButton({
  label,
  accessibilityLabel,
  disabled = false,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.step, disabled && styles.stepDisabled]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
    >
      <Text style={styles.stepLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: "#c9ced6",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipSelected: { borderColor: "#1f5fbf", backgroundColor: "#e8f0fc" },
  chipLabel: { fontSize: 15, color: "#2a2f36" },
  chipLabelSelected: { color: "#1f5fbf", fontWeight: "600" },
  stepper: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 12 },
  step: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#c9ced6",
    alignItems: "center",
    justifyContent: "center",
  },
  stepDisabled: { opacity: 0.4 },
  stepLabel: { fontSize: 22 },
  value: {
    fontSize: 17,
    fontVariant: ["tabular-nums"],
    minWidth: 72,
    textAlign: "center",
  },
});
