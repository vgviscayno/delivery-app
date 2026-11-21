import { formatWeight, type Product, shelfPrice } from "@courier/domain";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { AmountPicker } from "./AmountPicker";
import { amountLabel, lineTotalLabel, startingAmount } from "./cart";

/**
 * A Product, opened from the grid: what it is, how much, and a button that puts that
 * much in the cart. Opened on a Product already in the cart, it starts at the cart's
 * amount and updates that line rather than adding a second.
 */
export function ProductSheet({
  product,
  inCart,
  onPut,
  onClose,
}: {
  product: Product;
  /** How much of it the cart already holds, if any. */
  inCart: number | undefined;
  onPut: (amount: number) => void;
  onClose: () => void;
}) {
  const { price } = product;
  const [amount, setAmount] = useState(() => startingAmount(price, inCart));

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
        <Text style={styles.price}>{shelfPrice(price)}</Text>
        {product.description && <Text style={styles.note}>{product.description}</Text>}
        <View style={styles.amount}>
          {price.type === "per_weight" && (
            <Text style={styles.note}>
              Cut to order, sold in {formatWeight(price.weightStepGrams)} steps.
            </Text>
          )}
          <AmountPicker price={price} amount={amount} onChange={setAmount} />
          <Text style={styles.total} accessibilityLiveRegion="polite">
            {amountLabel({ price, amount })} ·{" "}
            <Text style={styles.totalFigure}>{lineTotalLabel({ price, amount })}</Text>
          </Text>
          {price.type === "per_weight" && (
            <Text style={styles.note}>
              Weighed when packed. If it lands more than{" "}
              {formatWeight(price.toleranceGrams)} off, we call you first.
            </Text>
          )}
        </View>
        <Pressable
          style={styles.put}
          accessibilityRole="button"
          onPress={() => {
            onPut(amount);
            onClose();
          }}
        >
          <Text style={styles.putLabel}>
            {inCart === undefined ? "Add to cart" : "Update cart"}
          </Text>
        </Pressable>
        <Pressable style={styles.close} accessibilityRole="button" onPress={onClose}>
          <Text style={styles.closeLabel}>Close</Text>
        </Pressable>
      </View>
    </Modal>
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
  amount: { gap: 12, marginTop: 8 },
  total: { fontSize: 15, color: "#5f6670" },
  totalFigure: { fontSize: 17, fontWeight: "700", color: "#1b1f24" },
  put: {
    marginTop: 16,
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#1f5fbf",
  },
  putLabel: { fontSize: 15, fontWeight: "600", color: "#ffffff" },
  close: {
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#eef0f3",
  },
  closeLabel: { fontSize: 15, fontWeight: "600" },
});
