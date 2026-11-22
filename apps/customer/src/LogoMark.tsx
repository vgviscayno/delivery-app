import { StyleSheet, View } from "react-native";

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
