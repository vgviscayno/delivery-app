import { type ComponentRef, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

/**
 * An ⓘ that explains the field beside it. A phone has no hover, so a tap opens the
 * bubble under the ⓘ and a tap anywhere closes it.
 */
export function Tooltip({ label, text }: { label: string; text: string }) {
  const icon = useRef<ComponentRef<typeof View>>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number }>();

  const open = () =>
    icon.current?.measureInWindow((x, y, _width, height) =>
      setAnchor({ x, y: y + height }),
    );
  const close = () => setAnchor(undefined);

  return (
    <>
      <Pressable
        ref={icon}
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={text}
        hitSlop={12}
      >
        <Text style={styles.icon}>ⓘ</Text>
      </Pressable>
      <Modal transparent visible={anchor !== undefined} onRequestClose={close}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={close}
          accessibilityLabel="Close"
        >
          {anchor ? (
            <View
              style={[
                styles.bubble,
                { top: anchor.y + 6, left: Math.max(16, anchor.x - 24) },
              ]}
            >
              <Text style={styles.text}>{text}</Text>
            </View>
          ) : null}
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  icon: { color: "#1f5fbf", fontSize: 16 },
  bubble: {
    position: "absolute",
    right: 16,
    backgroundColor: "#22262b",
    borderRadius: 8,
    padding: 10,
  },
  text: { color: "#ffffff" },
});
