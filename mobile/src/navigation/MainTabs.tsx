import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { HomeScreen } from '../screens/HomeScreen';
import { DietScreen } from '../screens/DietScreen';
import { WorkoutScreen } from '../screens/WorkoutScreen';
import { EvolutionScreen } from '../screens/EvolutionScreen';
import { ActivityScreen } from '../screens/ActivityScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import type { MainTabParamList } from './types';
import { colors } from '../theme/tokens';

const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Início' }} />
      <Tab.Screen name="Diet" component={DietScreen} options={{ title: 'Dieta' }} />
      <Tab.Screen name="Workout" component={WorkoutScreen} options={{ title: 'Treino' }} />
      <Tab.Screen name="Evolution" component={EvolutionScreen} options={{ title: 'Evolução' }} />
      <Tab.Screen name="Activity" component={ActivityScreen} options={{ title: 'Atividade' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Perfil' }} />
    </Tab.Navigator>
  );
}
