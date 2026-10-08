import React, { useCallback, useMemo, useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { HomeScreen } from '../screens/HomeScreen';
import { DietScreen } from '../screens/DietScreen';
import { WorkoutScreen } from '../screens/WorkoutScreen';
import { EvolutionScreen } from '../screens/EvolutionScreen';
import { WeightScreen } from '../screens/WeightScreen';
import { WaterScreen } from '../screens/WaterScreen';
import { PhotosScreen } from '../screens/PhotosScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { AssessmentScreen } from '../screens/AssessmentScreen';
import { ActivityScreen } from '../screens/ActivityScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { MessagesScreen } from '../screens/MessagesScreen';
import { AppointmentsScreen } from '../screens/AppointmentsScreen';
import { ReportsScreen } from '../screens/ReportsScreen';
import { NotificationPreferencesScreen } from '../screens/NotificationPreferencesScreen';
import { PrivacyScreen } from '../screens/PrivacyScreen';
import type { MainTabParamList, RootStackParamList } from './types';
import { ROUTE_TITLES, type AppRoute } from './navItems';
import { AppHeader, BottomTabBar, ProfileSheet, ShellContext, SideDrawer } from './AppShell';

const Tab = createBottomTabNavigator<MainTabParamList>();

/**
 * Área do paciente: cabeçalho fixo + menu lateral + barra inferior com 5 abas
 * (Dashboard, Dieta, Treinos, Evolução e Perfil, que abre o painel de perfil).
 * As demais telas ficam no mesmo navegador, fora da barra, com "voltar" pelo
 * histórico.
 */
export function MainTabs() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [activeRoute, setActiveRoute] = useState<AppRoute>('Home');

  const navigateTo = useCallback((route: AppRoute) => navigation.navigate('Main', { screen: route }), [navigation]);
  const shell = useMemo(() => ({ openDrawer: () => setDrawerOpen(true), openProfile: () => setProfileOpen(true) }), []);

  return (
    <ShellContext.Provider value={shell}>
      <Tab.Navigator
        backBehavior="history"
        screenListeners={{
          state: (event) => {
            const state = (event.data as { state?: { index: number; routes: Array<{ name: string }> } }).state;
            if (state) setActiveRoute(state.routes[state.index].name as AppRoute);
          },
        }}
        tabBar={(props) => (
          <BottomTabBar activeRoute={props.state.routes[props.state.index].name as AppRoute} onNavigate={navigateTo} onProfile={() => setProfileOpen(true)} />
        )}
        screenOptions={({ route, navigation: tabNavigation }) => ({
          lazy: true,
          header: () => (
            <AppHeader
              title={ROUTE_TITLES[route.name]}
              onBack={route.name === 'Home' ? undefined : () => (tabNavigation.canGoBack() ? tabNavigation.goBack() : navigateTo('Home'))}
              onMenu={() => setDrawerOpen(true)}
              onProfile={() => setProfileOpen(true)}
            />
          ),
        })}
      >
        <Tab.Screen name="Home" component={HomeScreen} />
        <Tab.Screen name="Diet" component={DietScreen} />
        <Tab.Screen name="Workout" component={WorkoutScreen} />
        <Tab.Screen name="Evolution" component={EvolutionScreen} />
        <Tab.Screen name="Weight" component={WeightScreen} />
        <Tab.Screen name="Water" component={WaterScreen} />
        <Tab.Screen name="Photos" component={PhotosScreen} />
        <Tab.Screen name="History" component={HistoryScreen} />
        <Tab.Screen name="Assessment" component={AssessmentScreen} />
        <Tab.Screen name="Profile" component={ProfileScreen} />
        <Tab.Screen name="Settings" component={SettingsScreen} />
        <Tab.Screen name="Activity" component={ActivityScreen} />
        <Tab.Screen name="Messages" component={MessagesScreen} />
        <Tab.Screen name="Appointments" component={AppointmentsScreen} />
        <Tab.Screen name="Reports" component={ReportsScreen} />
        <Tab.Screen name="NotificationPreferences" component={NotificationPreferencesScreen} />
        <Tab.Screen name="Privacy" component={PrivacyScreen} />
      </Tab.Navigator>
      <SideDrawer visible={drawerOpen} activeRoute={activeRoute} onClose={() => setDrawerOpen(false)} onNavigate={navigateTo} />
      <ProfileSheet visible={profileOpen} onClose={() => setProfileOpen(false)} onNavigate={navigateTo} />
    </ShellContext.Provider>
  );
}
