import React, { useEffect, useRef, useState } from 'react';
import { Animated, LayoutAnimation, Pressable, StyleSheet, View } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { spacing } from '../theme/tokens';
import { useTheme } from '../theme/theme';

/**
 * Cartão que expande/recolhe (seta girando + conteúdo animado), como os
 * cards da referência. O cabeçalho é sempre visível e inteiro clicável.
 */
export function Collapsible({
  header,
  children,
  initiallyOpen = false,
  accessibilityLabel,
}: {
  header: React.ReactNode;
  children: React.ReactNode;
  initiallyOpen?: boolean;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(initiallyOpen);
  const rotation = useRef(new Animated.Value(initiallyOpen ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(rotation, { toValue: open ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  }, [open, rotation]);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'));
    setOpen((value) => !value);
  };

  return (
    <View>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
      >
        <View style={styles.flex}>{header}</View>
        <Animated.View style={{ transform: [{ rotate: rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}>
          <ChevronDown size={20} color={colors.textMuted} />
        </Animated.View>
      </Pressable>
      {open ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pressed: { opacity: 0.7 },
  body: { marginTop: spacing.sm, gap: spacing.sm },
});
