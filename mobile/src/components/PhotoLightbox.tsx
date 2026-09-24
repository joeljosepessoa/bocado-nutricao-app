import React from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme/tokens';

interface Props {
  visible: boolean;
  uri: string | null;
  label: string;
  onClose: () => void;
}

/**
 * Visualizador em tela cheia, sem biblioteca nova — não há zoom/pinça (não
 * existe lib de galeria/lightbox no app hoje), só abrir grande e tocar pra
 * fechar. Suficiente pro pedido ("tocar na foto pra abrir maior").
 */
export function PhotoLightbox({ visible, uri, label, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {uri ? <Image source={{ uri }} style={styles.image} resizeMode="contain" /> : null}
        <View style={styles.labelBox}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.hint}>Toque para fechar</Text>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '80%' },
  labelBox: { position: 'absolute', bottom: spacing.xl, alignItems: 'center' },
  label: { ...typography.subtitle, color: colors.textInverse },
  hint: { ...typography.caption, color: colors.textInverse, opacity: 0.7, marginTop: spacing.xs },
});
