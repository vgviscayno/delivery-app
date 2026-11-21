import { type CourierClient, fetchCatalog, productPhotoUrls } from "@courier/api-client";
import { type Product, shelfPrice } from "@courier/domain";
import { useEffect, useState } from "react";
import {
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CartButton } from "./CartButton";
import { CartScreen } from "./CartScreen";
import { amountInCart, type Cart, type CartChange, putLine } from "./cart";
import { customerMessage } from "./customer-message";
import { LogoMark } from "./LogoMark";
import { ProductSheet } from "./ProductSheet";
import { type Shelf, shopFront } from "./shop-front";

type ShopState =
  | { readonly state: "loading" }
  | { readonly state: "ready"; readonly shelves: readonly Shelf[] }
  | { readonly state: "error"; readonly message: string };

/** The Shop tab: the catalog, with the cart floating over it. */
export function ShopTab({
  client,
  cart,
  onCartChange,
}: {
  client: CourierClient;
  /** Null until the saved cart has loaded. */
  cart: Cart | null;
  onCartChange: CartChange;
}) {
  const [open, setOpen] = useState<Product | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  return (
    <View style={styles.shop}>
      <CatalogGrid client={client} onOpen={setOpen} />
      {cart && <CartButton cart={cart} onOpen={() => setCartOpen(true)} />}
      {/* Opened only once the cart has loaded, so it starts at the cart's amount. */}
      {open && cart && (
        <ProductSheet
          product={open}
          inCart={amountInCart(cart, open.id)}
          onPut={(amount) => onCartChange((current) => putLine(current, open, amount))}
          onClose={() => setOpen(null)}
        />
      )}
      {cart && cartOpen && (
        <CartScreen
          cart={cart}
          onChange={onCartChange}
          onClose={() => setCartOpen(false)}
        />
      )}
    </View>
  );
}

/** A strip of Category tabs over a two-column photo grid. */
function CatalogGrid({
  client,
  onOpen,
}: {
  client: CourierClient;
  onOpen: (product: Product) => void;
}) {
  const [view, setView] = useState<ShopState>({ state: "loading" });
  const [categoryId, setCategoryId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void fetchCatalog(client)
      .then((catalog): ShopState => ({ state: "ready", shelves: shopFront(catalog) }))
      .catch((error): ShopState => ({ state: "error", message: customerMessage(error) }))
      .then((next) => {
        if (live) setView(next);
      });
    return () => {
      live = false;
    };
  }, [client]);

  if (view.state === "loading")
    return <Text style={styles.detail}>Opening the shop…</Text>;
  if (view.state === "error") return <Text style={styles.detail}>{view.message}</Text>;
  if (view.shelves.length === 0) {
    return <Text style={styles.detail}>Nothing in the shop yet. Check back soon.</Text>;
  }

  const shelf = view.shelves.find((s) => s.category.id === categoryId) ?? view.shelves[0];
  if (!shelf) return null;

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.strip}
        contentContainerStyle={styles.stripContent}
        accessibilityRole="tablist"
      >
        {view.shelves.map(({ category }) => {
          const selected = category.id === shelf.category.id;
          return (
            <Pressable
              key={category.id}
              style={[styles.category, selected && styles.categorySelected]}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => setCategoryId(category.id)}
            >
              <Text
                style={[styles.categoryLabel, selected && styles.categoryLabelSelected]}
              >
                {category.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <FlatList
        key={shelf.category.id}
        data={shelf.products}
        keyExtractor={(product) => product.id}
        numColumns={2}
        contentContainerStyle={styles.grid}
        renderItem={({ item }) => (
          <ProductCard client={client} product={item} onOpen={() => onOpen(item)} />
        )}
      />
    </>
  );
}

function ProductCard({
  client,
  product,
  onOpen,
}: {
  client: CourierClient;
  product: Product;
  onOpen: () => void;
}) {
  const soldOut = !product.available;
  return (
    <View style={styles.cell}>
      <Pressable
        style={[styles.card, soldOut && styles.soldOutCard]}
        accessibilityRole="button"
        accessibilityState={{ disabled: soldOut }}
        accessibilityHint={soldOut ? "Sold out" : undefined}
        disabled={soldOut}
        onPress={onOpen}
      >
        {product.photoPath ? (
          <Image
            style={styles.photo}
            source={{ uri: productPhotoUrls(client, product.photoPath).thumb }}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <LogoMark />
        )}
        <View style={styles.meta}>
          <Text style={styles.name} numberOfLines={2}>
            {product.name}
          </Text>
          <View style={styles.priceRow}>
            <Text style={styles.price}>{shelfPrice(product.price)}</Text>
            {soldOut && <Text style={styles.soldOut}>Sold out</Text>}
          </View>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  shop: { flex: 1 },
  detail: { padding: 16 },
  strip: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: "#e2e5e9" },
  stripContent: { paddingHorizontal: 12, gap: 4 },
  category: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  categorySelected: { borderBottomColor: "#1f5fbf" },
  categoryLabel: { fontSize: 15, color: "#5f6670" },
  categoryLabelSelected: { color: "#1f5fbf", fontWeight: "600" },
  // The floating cart button must never cover the last row.
  grid: { padding: 6, paddingBottom: 88 },
  // Half the row each, never more: an odd last card keeps its column's width.
  cell: { width: "50%", padding: 6 },
  card: {
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e5e9",
  },
  soldOutCard: { opacity: 0.55 },
  photo: { width: "100%", aspectRatio: 1, backgroundColor: "#eef0f3" },
  meta: { padding: 10, gap: 4 },
  name: { fontSize: 14, fontWeight: "600", minHeight: 36 },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  price: { fontSize: 14, color: "#2a2f36" },
  soldOut: {
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "#b4441c",
    borderWidth: 1,
    borderColor: "#b4441c",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
});
