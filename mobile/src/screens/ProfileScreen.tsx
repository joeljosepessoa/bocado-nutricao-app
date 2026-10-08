import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  CalendarDays,
  ChevronRight,
  ClipboardList,
  FileText,
  LogOut,
  MessageCircle,
  Settings,
  type LucideIcon,
} from 'lucide-react-native';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ScreenContainer } from '../components/ScreenContainer';
import { TextField } from '../components/TextField';
import { FadeIn, GradientCard } from '../components/ui';
import { Avatar } from '../navigation/AppShell';
import * as api from '../api/endpoints';
import type { ClientSelf } from '../types/api';
import type { AppNavigation, MainTabParamList } from '../navigation/types';
import { formatKg } from '../dashboard/dashboardModel';
import { radius, spacing, typography } from '../theme/tokens';
import { useStyles, useTheme, type ThemeColors } from '../theme/theme';

const LINKS: Array<{ route: keyof MainTabParamList; label: string; icon: LucideIcon }> = [
  { route: 'Assessment', label: 'Minhas Avaliações', icon: ClipboardList },
  { route: 'Messages', label: 'Mensagens', icon: MessageCircle },
  { route: 'Appointments', label: 'Consultas', icon: CalendarDays },
  { route: 'Reports', label: 'Relatórios', icon: FileText },
  { route: 'Settings', label: 'Configurações', icon: Settings },
];

/** Meu Perfil: dados pessoais (nome e telefone editáveis), metas do nutricionista e atalhos. */
export function ProfileScreen() {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const { logout } = useAuth();
  const navigation = useNavigation<AppNavigation>();
  const [profile, setProfile] = useState<ClientSelf | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    api
      .getMe()
      .then((data) => {
        setProfile(data);
        setFullName(data.user.fullName);
        setPhone(data.phone ?? '');
      })
      .catch(() => setMessage({ text: 'Não foi possível carregar seus dados agora.', ok: false }));
  }, []);

  async function handleSave() {
    if (!fullName.trim()) {
      setMessage({ text: 'Informe seu nome.', ok: false });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const updated = await api.updateMe({ fullName: fullName.trim(), phone: phone.trim() });
      setProfile(updated);
      setMessage({ text: 'Dados atualizados.', ok: true });
    } catch {
      setMessage({ text: 'Não foi possível salvar agora.', ok: false });
    } finally {
      setSaving(false);
    }
  }

  const confirmLogout = () => {
    Alert.alert('Sair', 'Deseja sair da sua conta?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => logout() },
    ]);
  };

  const name = profile?.user.fullName ?? '';

  return (
    <ScreenContainer>
      <FadeIn>
        <GradientCard>
          <View style={styles.heroRow}>
            <View style={styles.avatarRing}>
              <Avatar name={name} size={64} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.heroName} numberOfLines={2}>
                {name || ' '}
              </Text>
              <Text style={styles.heroEmail} numberOfLines={1}>
                {profile?.user.email ?? ''}
              </Text>
            </View>
          </View>
          <View style={styles.goals}>
            <View style={styles.goal}>
              <Text style={styles.goalLabel}>Meta de peso</Text>
              <Text style={styles.goalValue}>{profile?.targetWeightKg != null ? formatKg(profile.targetWeightKg) : '--'}</Text>
            </View>
            <View style={styles.goal}>
              <Text style={styles.goalLabel}>Meta de água</Text>
              <Text style={styles.goalValue}>{profile?.waterGoalMl != null ? `${profile.waterGoalMl} ml` : '--'}</Text>
            </View>
          </View>
        </GradientCard>
      </FadeIn>

      <FadeIn delay={60}>
        <Card>
          <Text style={styles.cardTitle}>Dados pessoais</Text>
          <TextField label="Nome" value={fullName} onChangeText={setFullName} autoCapitalize="words" />
          <TextField label="Telefone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          {message ? <Text style={[styles.message, { color: message.ok ? colors.success : colors.danger }]}>{message.text}</Text> : null}
          <Button title="Salvar" onPress={handleSave} loading={saving} />
        </Card>
      </FadeIn>

      <FadeIn delay={120}>
        <Card>
          {LINKS.map(({ route, label, icon: Icon }, index) => (
            <Pressable
              key={route}
              onPress={() => navigation.navigate(route)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.link, index > 0 && styles.linkBorder, pressed && styles.pressed]}
            >
              <View style={styles.linkIcon}>
                <Icon size={20} color={colors.primary} />
              </View>
              <Text style={[styles.linkText, styles.flex]}>{label}</Text>
              <ChevronRight size={18} color={colors.textMuted} />
            </Pressable>
          ))}
        </Card>
      </FadeIn>

      <Button title="Sair" variant="danger" onPress={confirmLogout} icon={<LogOut size={18} color="#FFFFFF" />} />
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    pressed: { opacity: 0.7 },
    heroRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    avatarRing: { padding: 3, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.35)' },
    heroName: { ...typography.subtitle, fontWeight: '800', color: '#FFFFFF' },
    heroEmail: { ...typography.caption, color: 'rgba(255,255,255,0.9)' },
    goals: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
    goal: { flex: 1, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: radius.md, padding: spacing.sm },
    goalLabel: { ...typography.tiny, color: 'rgba(255,255,255,0.9)' },
    goalValue: { ...typography.body, fontWeight: '800', color: '#FFFFFF' },
    cardTitle: { ...typography.subtitle, color: colors.textPrimary },
    message: { ...typography.caption },
    link: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, paddingVertical: spacing.sm + 2 },
    linkBorder: { borderTopWidth: 1, borderTopColor: colors.border },
    linkIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
    linkText: { ...typography.body, fontWeight: '600', color: colors.textPrimary },
  });
