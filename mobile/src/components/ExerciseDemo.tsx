import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as api from '../api/endpoints';
import { API_BASE_URL, getAccessToken } from '../api/client';
import { resolveExerciseMediaSource } from '../media/exerciseMedia';
import { radius, spacing, typography } from '../theme/tokens';
import { useStyles, useTheme, type ThemeColors } from '../theme/theme';

interface Props {
  imageUrl: string | null;
  exerciseName: string;
  expanded: boolean;
  onToggle: () => void;
}

/**
 * Demonstração do exercício sob demanda: o GIF só é pedido (e decodificado)
 * quando o cliente toca em "Ver demonstração". `DemoImage` só existe
 * enquanto expandido, então fechar libera a imagem da memória; quem usa
 * este componente mantém no máximo UM GIF aberto por vez.
 */
export function ExerciseDemo({ imageUrl, exerciseName, expanded, onToggle }: Props) {
  const styles = useStyles(makeStyles);
  if (!resolveExerciseMediaSource(imageUrl, API_BASE_URL, null)) {
    return null;
  }

  return (
    <View style={styles.wrapper}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${expanded ? 'Ocultar' : 'Ver'} demonstração do exercício ${exerciseName}`}
        onPress={onToggle}
        hitSlop={8}
      >
        <Text style={styles.toggle}>{expanded ? 'Ocultar demonstração' : 'Ver demonstração'}</Text>
      </Pressable>
      {expanded ? <DemoImage imageUrl={imageUrl} exerciseName={exerciseName} /> : null}
    </View>
  );
}

function DemoImage({ imageUrl, exerciseName }: { imageUrl: string | null; exerciseName: string }) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);

  // O token é relido a cada tentativa: um GIF que falhou por token expirado
  // (401) precisa do token renovado, não do que estava em memória antes.
  const source = useMemo(
    () => resolveExerciseMediaSource(imageUrl, API_BASE_URL, getAccessToken()),
    [imageUrl, attempt],
  );

  async function retry() {
    setStatus('loading');
    try {
      // Chamada autenticada barata: se o access token expirou, o interceptor
      // do axios renova antes de o <Image> tentar de novo.
      await api.getMe();
    } catch {
      // sem rede: a nova tentativa abaixo falha de novo e mostra o erro.
    }
    setAttempt((n) => n + 1);
  }

  // No navegador o <Image> não manda cabeçalho: a mídia da nossa API (rota com login)
  // é baixada com o token e exibida a partir de uma cópia local (blob:).
  const needsFetch = Platform.OS === 'web' && !!source?.headers;
  const [blobUri, setBlobUri] = useState<string | null>(null);
  useEffect(() => {
    if (!needsFetch || !source) return;
    let cancelled = false;
    let url: string | null = null;
    setBlobUri(null);
    fetch(source.uri, { headers: source.headers })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setBlobUri(url);
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [source, needsFetch]);

  if (!source) return null;
  const imageSource = needsFetch ? (blobUri ? { uri: blobUri } : null) : source;

  return (
    <View style={styles.frame}>
      {status !== 'error' ? (
        imageSource ? (
          <Image
            key={attempt}
            source={imageSource}
            style={styles.image}
            resizeMode="contain"
            resizeMethod="resize"
            accessible
            accessibilityLabel={`Demonstração do exercício ${exerciseName}`}
            onLoadStart={() => setStatus('loading')}
            onLoad={() => setStatus('ready')}
            onError={() => setStatus('error')}
          />
        ) : null
      ) : (
        <View style={styles.center}>
          <Text style={styles.errorText}>Não foi possível carregar a demonstração.</Text>
          <Pressable accessibilityRole="button" onPress={retry} hitSlop={8}>
            <Text style={styles.toggle}>Tentar de novo</Text>
          </Pressable>
        </View>
      )}
      {status === 'loading' ? (
        <View style={[styles.center, StyleSheet.absoluteFill]} pointerEvents="none">
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  wrapper: { marginTop: spacing.xs },
  toggle: { ...typography.caption, color: colors.primary, fontWeight: '600' },
  frame: {
    marginTop: spacing.xs,
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#fcfcff',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, padding: spacing.sm },
  errorText: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
});
