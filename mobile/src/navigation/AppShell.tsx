import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Alert, Animated, Dimensions, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Activity,
  BarChart3,
  CalendarDays,
  Camera,
  ChevronLeft,
  Droplets,
  Dumbbell,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Moon,
  Scale,
  Settings,
  Sun,
  TrendingUp,
  User,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react-native';
import { useAuth } from '../auth/AuthContext';
import { radius, spacing, typography } from '../theme/tokens';
import { shadow, useStyles, useTheme, type ThemeColors } from '../theme/theme';
import { BOTTOM_TABS, DRAWER_EXTRA_ITEMS, DRAWER_ITEMS, initialOf, type AppRoute } from './navItems';

/**
 * Esqueleto da área do paciente recriado da referência: cabeçalho fixo, menu
 * lateral (desliza da esquerda), barra inferior com 5 abas e painel de
 * perfil que sobe de baixo.
 */

export const ROUTE_ICONS: Record<AppRoute, LucideIcon> = {
  Home: LayoutDashboard,
  Diet: UtensilsCrossed,
  Workout: Dumbbell,
  Evolution: TrendingUp,
  Weight: Scale,
  Water: Droplets,
  Photos: Camera,
  History: History,
  Assessment: BarChart3,
  Profile: User,
  Settings: Settings,
  Activity: Activity,
  Messages: MessageCircle,
  Appointments: CalendarDays,
  Reports: FileText,
  NotificationPreferences: Settings,
  Privacy: Settings,
};

// eslint-disable-next-line @typescript-eslint/no-require-imports -- imagem local empacotada pelo Metro
const LOGO = require('../../assets/logo.png');
const DRAWER_WIDTH = Math.min(300, Math.round(Dimensions.get('window').width * 0.82));

interface ShellContextValue {
  openDrawer: () => void;
  openProfile: () => void;
}

export const ShellContext = createContext<ShellContextValue>({ openDrawer: () => undefined, openProfile: () => undefined });
export const useShell = () => useContext(ShellContext);

function confirmLogout(logout: () => Promise<void>) {
  Alert.alert('Sair', 'Deseja realmente sair?', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Sair', style: 'destructive', onPress: () => logout() },
  ]);
}

// --- Cabeçalho -----------------------------------------------------------------

export function AppHeader({ title, onBack, onMenu, onProfile }: { title: string; onBack?: () => void; onMenu?: () => void; onProfile?: () => void }) {
  const { colors, isDark, toggle } = useTheme();
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        {onBack ? (
          <Pressable onPress={onBack} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Voltar" hitSlop={6}>
            <ChevronLeft size={26} color={colors.textSecondary} />
          </Pressable>
        ) : null}
        {onMenu ? (
          <Pressable onPress={onMenu} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Abrir menu" hitSlop={6}>
            <Menu size={26} color={colors.textSecondary} />
          </Pressable>
        ) : null}
        <Text style={styles.headerTitle} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        <Pressable onPress={toggle} style={styles.iconButton} accessibilityRole="button" accessibilityLabel={isDark ? 'Usar modo claro' : 'Usar modo escuro'} hitSlop={6}>
          {isDark ? <Sun size={22} color={colors.textSecondary} /> : <Moon size={22} color={colors.textSecondary} />}
        </Pressable>
        {onProfile ? (
          <Pressable onPress={onProfile} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Abrir menu do perfil" hitSlop={6}>
            <User size={22} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

// --- Menu lateral ----------------------------------------------------------------

function DrawerLink({ route, label, active, onPress }: { route: AppRoute; label: string; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const Icon = ROUTE_ICONS[route];
  const content = (
    <>
      <Icon size={20} color={active ? colors.textInverse : colors.textSecondary} />
      <Text style={[styles.drawerLabel, active && styles.drawerLabelActive]}>{label}</Text>
      {active ? <View style={styles.activeDot} /> : null}
    </>
  );
  return (
    <Pressable onPress={onPress} accessibilityRole="menuitem" accessibilityState={{ selected: active }} style={({ pressed }) => [!active && pressed && styles.drawerPressed]}>
      {active ? (
        <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.drawerItem, shadow('md', colors.primary)]}>
          {content}
        </LinearGradient>
      ) : (
        <View style={styles.drawerItem}>{content}</View>
      )}
    </Pressable>
  );
}

export function SideDrawer({ visible, activeRoute, onClose, onNavigate }: { visible: boolean; activeRoute: AppRoute; onClose: () => void; onNavigate: (route: AppRoute) => void }) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.spring(progress, { toValue: 1, damping: 25, stiffness: 220, useNativeDriver: true }).start();
    } else if (mounted) {
      Animated.timing(progress, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setMounted(false));
    }
  }, [visible, mounted, progress]);

  if (!mounted) return null;
  const go = (route: AppRoute) => {
    onClose();
    onNavigate(route);
  };

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Fechar menu" />
      </Animated.View>
      <Animated.View
        style={[
          styles.drawer,
          shadow('xl'),
          { width: DRAWER_WIDTH, paddingTop: insets.top, paddingBottom: insets.bottom, transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-DRAWER_WIDTH, 0] }) }] },
        ]}
      >
        <View style={styles.brand}>
          <Image source={LOGO} style={styles.logo} accessibilityIgnoresInvertColors />
          <View style={styles.flex}>
            <Text style={styles.brandName}>Bocado de Nutrição</Text>
            <Text style={styles.brandSub}>Área do Paciente</Text>
          </View>
        </View>
        <ScrollView contentContainerStyle={styles.drawerList}>
          {DRAWER_ITEMS.map((item) => (
            <DrawerLink key={item.route} route={item.route} label={item.label} active={activeRoute === item.route} onPress={() => go(item.route)} />
          ))}
          <View style={styles.drawerDivider} />
          {DRAWER_EXTRA_ITEMS.map((item) => (
            <DrawerLink key={item.route} route={item.route} label={item.label} active={activeRoute === item.route} onPress={() => go(item.route)} />
          ))}
        </ScrollView>
        <View style={styles.drawerFooter}>
          <Pressable onPress={() => confirmLogout(logout)} style={styles.drawerItem} accessibilityRole="button">
            <LogOut size={20} color={colors.danger} />
            <Text style={[styles.drawerLabel, { color: colors.danger }]}>Sair</Text>
          </Pressable>
          {user ? (
            <View style={styles.userRow}>
              <Avatar name={user.fullName} size={36} />
              <View style={styles.flex}>
                <Text style={styles.userName} numberOfLines={1}>
                  {user.fullName || 'Usuário'}
                </Text>
                <Text style={styles.userEmail} numberOfLines={1}>
                  {user.email}
                </Text>
              </View>
            </View>
          ) : null}
        </View>
      </Animated.View>
    </Modal>
  );
}

export function Avatar({ name, size = 40 }: { name: string | null | undefined; size?: number }) {
  const { colors } = useTheme();
  return (
    <LinearGradient colors={['#FB923C', '#EF4444']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.textInverse, fontWeight: '700', fontSize: size * 0.42 }}>{initialOf(name)}</Text>
    </LinearGradient>
  );
}

// --- Painel de perfil ------------------------------------------------------------

export function ProfileSheet({ visible, onClose, onNavigate }: { visible: boolean; onClose: () => void; onNavigate: (route: AppRoute) => void }) {
  const { colors, isDark, toggle } = useTheme();
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.spring(progress, { toValue: 1, damping: 25, stiffness: 300, useNativeDriver: true }).start();
    } else if (mounted) {
      Animated.timing(progress, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setMounted(false));
    }
  }, [visible, mounted, progress]);

  if (!mounted) return null;
  const go = (route: AppRoute) => {
    onClose();
    onNavigate(route);
  };
  const Row = ({ icon: Icon, label, onPress, tint }: { icon: LucideIcon; label: string; onPress: () => void; tint?: string }) => (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.sheetRow, pressed && styles.drawerPressed]} accessibilityRole="button">
      <Icon size={20} color={tint ?? colors.textMuted} />
      <Text style={[styles.sheetLabel, tint ? { color: tint } : null]}>{label}</Text>
    </Pressable>
  );

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Fechar menu do perfil" />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: insets.bottom + spacing.md, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [600, 0] }) }] },
        ]}
      >
        <View style={styles.handle} />
        <Text style={styles.sheetTitle}>Menu</Text>
        {user ? (
          <View style={styles.sheetUser}>
            <Avatar name={user.fullName} />
            <View style={styles.flex}>
              <Text style={styles.userName} numberOfLines={1}>
                {user.fullName || 'Usuário'}
              </Text>
              <Text style={styles.userEmail} numberOfLines={1}>
                {user.email}
              </Text>
            </View>
          </View>
        ) : null}
        <Row icon={User} label="Meu Perfil" onPress={() => go('Profile')} />
        <Row icon={BarChart3} label="Minhas Avaliações" onPress={() => go('Assessment')} />
        <Row icon={isDark ? Sun : Moon} label={isDark ? 'Modo Claro' : 'Modo Escuro'} onPress={toggle} />
        <Row icon={Settings} label="Configurações" onPress={() => go('Settings')} />
        <Row
          icon={LogOut}
          label="Sair"
          tint={colors.danger}
          onPress={() => {
            onClose();
            confirmLogout(logout);
          }}
        />
      </Animated.View>
    </Modal>
  );
}

// --- Barra inferior --------------------------------------------------------------

export function BottomTabBar({ activeRoute, onNavigate, onProfile }: { activeRoute: AppRoute; onNavigate: (route: AppRoute) => void; onProfile: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.tabBar, { paddingBottom: insets.bottom }]} accessibilityRole="tablist">
      {BOTTOM_TABS.map((tab) => {
        if (tab.route === null) {
          return (
            <Pressable key="profile" onPress={onProfile} style={styles.tab} accessibilityRole="button" accessibilityLabel="Perfil">
              <User size={22} color={colors.textMuted} />
              <Text style={styles.tabLabel}>{tab.label}</Text>
            </Pressable>
          );
        }
        const active = activeRoute === tab.route;
        const Icon = ROUTE_ICONS[tab.route];
        const route = tab.route;
        return (
          <Pressable key={route} onPress={() => onNavigate(route)} style={styles.tab} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={tab.label}>
            {active ? <View style={styles.tabIndicator} /> : null}
            <Icon size={22} color={active ? colors.primary : colors.textMuted} />
            <Text style={[styles.tabLabel, active && { color: colors.primary }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    header: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
    headerRow: { height: 60, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xs, gap: spacing.xs },
    headerTitle: { ...typography.subtitle, color: colors.textPrimary, flex: 1, marginLeft: spacing.xs },
    iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
    drawer: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.surface },
    brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
    logo: { width: 40, height: 40, borderRadius: radius.md },
    brandName: { ...typography.body, fontWeight: '800', color: colors.textPrimary, fontSize: 17 },
    brandSub: { ...typography.caption, color: colors.textSecondary },
    drawerList: { padding: spacing.md, gap: 4 },
    drawerItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm + 4, paddingVertical: spacing.sm + 2, borderRadius: radius.md },
    drawerPressed: { backgroundColor: colors.surfaceMuted, borderRadius: radius.md },
    drawerLabel: { ...typography.body, fontWeight: '500', color: colors.textSecondary, flex: 1 },
    drawerLabelActive: { color: colors.textInverse, fontWeight: '600' },
    activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textInverse },
    drawerDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
    drawerFooter: { borderTopWidth: 1, borderTopColor: colors.border, padding: spacing.md, gap: spacing.sm },
    userRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
    userName: { ...typography.body, fontWeight: '600', color: colors.textPrimary },
    userEmail: { ...typography.caption, color: colors.textSecondary },
    sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, gap: 2 },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.md },
    sheetTitle: { ...typography.subtitle, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
    sheetUser: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm + 4, backgroundColor: colors.surfaceMuted, borderRadius: radius.md, marginBottom: spacing.sm },
    sheetRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 4, borderRadius: radius.md },
    sheetLabel: { ...typography.body, fontWeight: '500', color: colors.textPrimary },
    tabBar: { flexDirection: 'row', backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
    tab: { flex: 1, height: 62, alignItems: 'center', justifyContent: 'center', gap: 3 },
    tabIndicator: { position: 'absolute', top: 0, width: 32, height: 2, borderRadius: 1, backgroundColor: colors.primary },
    tabLabel: { fontSize: 11, fontWeight: '500', color: colors.textMuted },
  });
