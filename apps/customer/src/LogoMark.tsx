import { StyleSheet, View } from "react-native";

/**
 * The shop's mark, standing in for a Product with no photo. It fills the photo's
 * square exactly, so a card without a photo is the same height as one with.
 * A placeholder drawing until the shop supplies its own brand asset.
 */
export function LogoMark() {
  return (
    <View style={styles.tile} accessibilityLabel="No photo" accessible>
      <View style={styles.ring}>
        <View style={styles.tag} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: "#232b36",
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    width: "46%",
    aspectRatio: 1,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "rgba(226,165,58,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  tag: {
    width: "52%",
    height: "34%",
    borderRadius: 4,
    backgroundColor: "rgba(226,165,58,0.55)",
  },
});
