import { Pressable, StyleSheet, Text } from "react-native";
import { type Cart, cartTotalLabel } from "./cart";

export function CartButton({ cart, onOpen }: { cart: Cart; onOpen: () => void }) {
  if (cart.length === 0) return null;
  const total = cartTotalLabel(cart);
  return (
    <Pressable
      style={styles.button}
      accessibilityRole="button"
      accessibilityLabel={`View cart, ${total}`}
      onPress={onOpen}
    >
      <Text style={styles.label}>View cart</Text>
      <Text style={styles.total}>{total}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#1f5fbf",
    elevation: 4,
  },
  label: { fontSize: 15, fontWeight: "600", color: "#ffffff" },
  total: { fontSize: 16, fontWeight: "700", color: "#ffffff" },
});
