import { FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { AmountPicker } from "./AmountPicker";
import {
  amountLabel,
  type Cart,
  type CartChange,
  type CartLine,
  cartTotalLabel,
  changeAmount,
  lineTotalLabel,
  removeLine,
} from "./cart";

/**
 * The cart, opened from its floating button: each line editable with the control it
 * was picked with, and removable. Checkout joins this screen later (#65).
 */
export function CartScreen({
  cart,
  onChange,
  onClose,
}: {
  cart: Cart;
  onChange: CartChange;
  onClose: () => void;
}) {
  return (
    <Modal animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.heading}>Cart</Text>
          <Pressable accessibilityRole="button" onPress={onClose} hitSlop={12}>
            <Text style={styles.closeLabel}>Close</Text>
          </Pressable>
        </View>
        <FlatList
          data={cart}
          keyExtractor={(line) => line.productId}
          contentContainerStyle={styles.lines}
          ListEmptyComponent={<Text style={styles.note}>Your cart is empty.</Text>}
          renderItem={({ item }) => (
            <Line
              line={item}
              onAmount={(amount) =>
                onChange((current) => changeAmount(current, item.productId, amount))
              }
              onRemove={() => onChange((current) => removeLine(current, item.productId))}
            />
          )}
        />
        {cart.length > 0 && (
          <View style={styles.footer}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.total} accessibilityLiveRegion="polite">
              {cartTotalLabel(cart)}
            </Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

function Line({
  line,
  onAmount,
  onRemove,
}: {
  line: CartLine;
  onAmount: (amount: number) => void;
  onRemove: () => void;
}) {
  return (
    <View style={styles.line}>
      <View style={styles.lineHead}>
        <Text style={styles.name}>{line.name}</Text>
        <Text style={styles.lineTotal}>{lineTotalLabel(line)}</Text>
      </View>
      <Text style={styles.note}>{amountLabel(line)}</Text>
      <AmountPicker price={line.price} amount={line.amount} onChange={onAmount} />
      <Pressable
        style={styles.remove}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${line.name}`}
        onPress={onRemove}
      >
        <Text style={styles.removeLabel}>Remove</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#ffffff" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e5e9",
  },
  heading: { fontSize: 20, fontWeight: "700" },
  closeLabel: { fontSize: 15, fontWeight: "600", color: "#1f5fbf" },
  lines: { padding: 16, gap: 20 },
  line: { gap: 10 },
  lineHead: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  name: { fontSize: 16, fontWeight: "600", flexShrink: 1 },
  lineTotal: { fontSize: 16, fontWeight: "700" },
  note: { fontSize: 13, color: "#5f6670" },
  remove: { alignSelf: "flex-start", paddingVertical: 6 },
  removeLabel: { fontSize: 14, color: "#b00020", fontWeight: "600" },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#e2e5e9",
  },
  totalLabel: { fontSize: 16, fontWeight: "600" },
  total: { fontSize: 18, fontWeight: "700" },
});
