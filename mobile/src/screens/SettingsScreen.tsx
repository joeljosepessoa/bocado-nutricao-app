import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Bell, ChevronRight, Moon, ShieldCheck, Sun, type LucideIcon } from 'lucide-react-native';
import { Card } from '../components/Card';
import { ScreenContainer } from '../components/ScreenContainer';
import { PageTitle } from '../components/ui';
import type { AppNavigation } from '../navigation/types';
import { radius, spacing, typography } from '../theme/tokens';
import { useStyles, useTheme, type ThemeColors } from '../theme/theme';

/** Configurações do paciente: tema, notificações e privacidade (telas que já existem no app). */
export function SettingsScreen() {
  const navigation = useNavigation<AppNavigation>();
  const { colors, isDark, toggle } = useTheme();
  const styles = useStyles(makeStyles);

  const Row = ({ icon: Icon, title, detail, onPress }: { icon: LucideIcon; title: string; detail: string; onPress: () => void }) => (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.iconBox}>
        <Icon size={20} color={colors.primary} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.detail}>{detail}</Text>
      </View>
      <ChevronRight size={18} color={colors.textMuted} />
    </Pressable>
  );

  return (
    <ScreenContainer>
      <PageTitle title="Configurações" subtitle="Preferências do aplicativo" />
      <Card>
        <Row icon={isDark ? Sun : Moon} title={isDark ? 'Modo claro' : 'Modo escuro'} detail="Aparência do aplicativo neste aparelho" onPress={toggle} />
        <Row icon={Bell} title="Notificações" detail="Escolha quais avisos você quer receber" onPress={() => navigation.navigate('NotificationPreferences')} />
        <Row icon={ShieldCheck} title="Privacidade e dados" detail="Consentimentos, exportação e exclusão de conta" onPress={() => navigation.navigate('Privacy')} />
      </Card>
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, paddingVertical: spacing.sm + 2, borderRadius: radius.md },
    pressed: { opacity: 0.7 },
    iconBox: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
    title: { ...typography.body, fontWeight: '600', color: colors.textPrimary },
    detail: { ...typography.caption, color: colors.textSecondary },
  });
