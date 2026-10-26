import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import type { LegalDocument } from '../types/api';
import { versionDateLabel } from '../legal/legalGate';
import { radius, spacing, typography } from '../theme/tokens';
import { useStyles, useTheme, type ThemeColors } from '../theme/theme';

/** Texto completo dos Termos de Uso ou da Política de Privacidade (abre por cima da tela atual). */
export function LegalDocumentModal({ document, onClose }: { document: LegalDocument | null; onClose: () => void }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={!!document} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.back} hitSlop={12}>
          <ArrowLeft size={20} color={colors.textSecondary} />
          <Text style={styles.backText}>Voltar</Text>
        </Pressable>
        {document ? (
          <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
            <Text style={styles.title}>{document.title}</Text>
            <Text style={styles.meta}>
              Versão {document.version} · atualizada em {versionDateLabel(document.updatedAt)}
            </Text>
            <Text style={styles.body}>{document.intro}</Text>
            {document.sections.map((section) => (
              <View key={section.title} style={styles.section}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                {section.paragraphs.map((paragraph, index) => (
                  <Text key={index} style={styles.body}>
                    {paragraph}
                  </Text>
                ))}
              </View>
            ))}
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    back: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, alignSelf: 'flex-start' },
    backText: { ...typography.body, color: colors.textSecondary },
    content: { paddingHorizontal: spacing.md, gap: spacing.md },
    title: { ...typography.title, color: colors.textPrimary },
    meta: { ...typography.caption, color: colors.textSecondary, marginTop: -spacing.sm },
    section: {
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
    },
    sectionTitle: { ...typography.body, fontWeight: '600', color: colors.textPrimary },
    body: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },
  });
