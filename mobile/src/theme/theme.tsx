import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, Platform, type ViewStyle } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PALETTES, resolveMode, THEME_STORAGE_KEY, type ThemeColors, type ThemeMode } from './palette';

export type { ThemeColors, ThemeMode } from './palette';

/**
 * Tema do app do cliente (claro/escuro). Visual da marca: laranja → vermelho.
 * A preferência do paciente fica no aparelho ("theme" = light | dark); sem
 * preferência salva, segue o tema do sistema e acompanha quando ele muda.
 */

interface ThemeContextValue {
  mode: ThemeMode;
  isDark: boolean;
  colors: ThemeColors;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({ mode: 'light', isDark: false, colors: PALETTES.light, toggle: () => undefined });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [saved, setSaved] = useState<string | null>(null);
  const [system, setSystem] = useState(Appearance.getColorScheme());

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((value) => setSaved(value))
      .catch(() => undefined);
    const subscription = Appearance.addChangeListener(({ colorScheme }) => setSystem(colorScheme));
    return () => subscription.remove();
  }, []);

  const mode = resolveMode(saved, system);
  const toggle = useCallback(() => {
    const next: ThemeMode = mode === 'dark' ? 'light' : 'dark';
    setSaved(next);
    AsyncStorage.setItem(THEME_STORAGE_KEY, next).catch(() => undefined);
  }, [mode]);

  const value = useMemo(() => ({ mode, isDark: mode === 'dark', colors: PALETTES[mode], toggle }), [mode, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/** Estilos que dependem das cores do tema: `const styles = useStyles(makeStyles)`. */
export function useStyles<T>(factory: (colors: ThemeColors) => T): T {
  const { colors } = useTheme();
  return useMemo(() => factory(colors), [factory, colors]);
}

/** Sombras da referência (shadow-sm/md/lg/xl), com elevação equivalente no Android. */
export function shadow(level: 'sm' | 'md' | 'lg' | 'xl', color = '#000000'): ViewStyle {
  const map = {
    sm: { opacity: 0.05, radius: 2, offset: 1, elevation: 1 },
    md: { opacity: 0.08, radius: 6, offset: 3, elevation: 3 },
    lg: { opacity: 0.1, radius: 12, offset: 6, elevation: 6 },
    xl: { opacity: 0.14, radius: 20, offset: 10, elevation: 10 },
  }[level];
  return Platform.select<ViewStyle>({
    android: { elevation: map.elevation, shadowColor: color },
    default: { shadowColor: color, shadowOpacity: map.opacity, shadowRadius: map.radius, shadowOffset: { width: 0, height: map.offset } },
  })!;
}
