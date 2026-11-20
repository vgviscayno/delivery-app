import {
  estimatedPeso,
  formatWeight,
  lineTotalCentavos,
  type Price,
  type Product,
  shelfPrice,
} from "@courier/domain";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { WeightChips } from "./WeightChips";

/** A Product, opened from the grid: what it is, and for a per-weight one, its weight. */
export function ProductSheet({
  product,
  onClose,
}: {
  product: Product;
  onClose: () => void;
}) {
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onClose}
      />
      <View style={styles.sheet}>
        <View style={styles.grab} />
        <Text style={styles.name}>{product.name}</Text>
        <Text style={styles.price}>{shelfPrice(product.price)}</Text>
        {product.description && <Text style={styles.note}>{product.description}</Text>}
        {product.price.type === "per_weight" && <WeightPicker price={product.price} />}
        <Pressable style={styles.close} accessibilityRole="button" onPress={onClose}>
          <Text style={styles.closeLabel}>Close</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

type PerWeightPrice = Extract<Price, { type: "per_weight" }>;

function WeightPicker({ price }: { price: PerWeightPrice }) {
  const { pricePerKgCentavos, weightStepGrams: stepGrams, toleranceGrams } = price;
  const [grams, setGrams] = useState(stepGrams);

  return (
    <View style={styles.weight}>
      <Text style={styles.note}>
        Cut to order, sold in {formatWeight(stepGrams)} steps.
      </Text>
      <WeightChips stepGrams={stepGrams} grams={grams} onChange={setGrams} />
      <Text style={styles.total} accessibilityLiveRegion="polite">
        ~{formatWeight(grams)} ·{" "}
        <Text style={styles.totalFigure}>
          {estimatedPeso(lineTotalCentavos(pricePerKgCentavos, grams))}
        </Text>
      </Text>
      <Text style={styles.note}>
        Weighed when packed. If it lands more than {formatWeight(toleranceGrams)} off, we
        call you first.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 28,
    gap: 6,
  },
  grab: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#d5d9df",
    marginBottom: 8,
  },
  name: { fontSize: 18, fontWeight: "700" },
  price: { fontSize: 16, color: "#2a2f36" },
  note: { fontSize: 13, color: "#5f6670" },
  weight: { gap: 12, marginTop: 8 },
  total: { fontSize: 15, color: "#5f6670" },
  totalFigure: { fontSize: 17, fontWeight: "700", color: "#1b1f24" },
  close: {
    marginTop: 16,
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#eef0f3",
  },
  closeLabel: { fontSize: 15, fontWeight: "600" },
});
