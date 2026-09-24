import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as api from '../api/endpoints';
import { API_BASE_URL } from '../api/client';
import { PHOTO_ANGLE_LABELS, resolvePhotoSource } from '../media/reportPhoto';
import { PhotoLightbox } from './PhotoLightbox';
import type { EvaluationPhotoView } from '../types/api';
import { colors, radius, spacing, typography } from '../theme/tokens';

interface LoadedPhoto extends EvaluationPhotoView {
  uri: string | null;
}

interface Props {
  evaluationId: string;
  // `| undefined` de propósito: o backend só passou a mandar `photos` numa
  // fase mais recente do que este componente — enquanto uma versão mais
  // antiga da API estiver no ar, o campo simplesmente não vem no JSON, e o
  // tipo do TS sozinho não protege contra isso em runtime.
  photos: EvaluationPhotoView[] | undefined;
}

/**
 * URL assinada de cada foto tem vida curta (5 min) — busca de novo sempre
 * que a galeria monta, nunca guarda em cache/disco (dado de saúde: mesma
 * postura de EvolutionScreen ao não cachear a evolução).
 */
export function EvaluationPhotoGallery({ evaluationId, photos: photosProp }: Props) {
  const photos = photosProp ?? [];
  const [loaded, setLoaded] = useState<LoadedPhoto[]>(photos.map((p) => ({ ...p, uri: null })));
  const [loading, setLoading] = useState(true);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all(
      photos.map(async (photo) => {
        try {
          const signed = await api.getEvaluationPhotoUrl(evaluationId, photo.id);
          return { ...photo, uri: resolvePhotoSource(signed.url, API_BASE_URL).uri };
        } catch {
          return { ...photo, uri: null };
        }
      }),
    ).then((result) => {
      if (!cancelled) {
        setLoaded(result);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [evaluationId, photos]);

  if (photos.length === 0) {
    return null;
  }

  return (
    <View>
      <Text style={styles.sectionTitle}>Fotos da evolução</Text>
      {loading ? <ActivityIndicator color={colors.primary} style={styles.spinner} /> : null}
      <View style={styles.grid}>
        {loaded.map((photo, index) =>
          photo.uri ? (
            <Pressable key={photo.id} onPress={() => setOpenIndex(index)} style={styles.thumbWrap}>
              <Image source={{ uri: photo.uri }} style={styles.thumb} resizeMode="cover" />
              <Text style={styles.thumbLabel}>{PHOTO_ANGLE_LABELS[photo.angle]}</Text>
            </Pressable>
          ) : null,
        )}
      </View>
      <PhotoLightbox
        visible={openIndex != null}
        uri={openIndex != null ? loaded[openIndex]?.uri ?? null : null}
        label={openIndex != null ? PHOTO_ANGLE_LABELS[loaded[openIndex]?.angle] ?? '' : ''}
        onClose={() => setOpenIndex(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { ...typography.subtitle, color: colors.textPrimary, fontSize: 16 },
  spinner: { marginTop: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  thumbWrap: { width: '47%' },
  thumb: { width: '100%', aspectRatio: 3 / 4, borderRadius: radius.md, backgroundColor: colors.border },
  thumbLabel: { ...typography.caption, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xs / 2 },
});
