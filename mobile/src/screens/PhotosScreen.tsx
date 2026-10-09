import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, ImagePlus, Images, Lock, Trash2, Users, WifiOff } from 'lucide-react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ScreenContainer } from '../components/ScreenContainer';
import { EmptyState, ErrorState, FadeIn, LoadingState, PageTitle } from '../components/ui';
import { EvaluationPhotoGallery } from '../components/EvaluationPhotoGallery';
import { PhotoLightbox } from '../components/PhotoLightbox';
import * as api from '../api/endpoints';
import { API_BASE_URL } from '../api/client';
import { resolvePhotoSource } from '../media/reportPhoto';
import type { EvolutionEntry, PhotoSharing, ProgressPhoto } from '../types/api';
import { formatDay } from '../tracking/trackingModel';
import { radius, spacing, typography } from '../theme/tokens';
import { useStyles, useTheme, type ThemeColors } from '../theme/theme';

interface LoadedPhoto extends ProgressPhoto {
  uri: string | null;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Fotos: as que o próprio paciente envia (privadas, só ele vê) e as das
 * avaliações liberadas pelo nutricionista. URLs assinadas de vida curta,
 * buscadas a cada abertura — nada fica em cache no aparelho.
 */
export function PhotosScreen() {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const [photos, setPhotos] = useState<LoadedPhoto[] | null>(null);
  const [evaluations, setEvaluations] = useState<EvolutionEntry[]>([]);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [sharing, setSharing] = useState<PhotoSharing | null>(null);
  const [savingSharing, setSavingSharing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [own, evolution, sharingState] = await Promise.all([
        api.listProgressPhotos(),
        api.getEvolution(1, 50),
        api.getPhotoSharing().catch(() => null),
      ]);
      setSharing(sharingState);
      const loaded = await Promise.all(
        own.map(async (photo) => {
          try {
            const signed = await api.getProgressPhotoUrl(photo.id);
            return { ...photo, uri: resolvePhotoSource(signed.url, API_BASE_URL).uri };
          } catch {
            return { ...photo, uri: null };
          }
        }),
      );
      setPhotos(loaded);
      setEvaluations(evolution.items.filter((entry) => (entry.photos ?? []).length > 0));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Fecha o visualizador se a foto aberta sumir (ex.: depois de apagar).
  useEffect(() => {
    if (openIndex != null && (!photos || openIndex >= photos.length)) setOpenIndex(null);
  }, [photos, openIndex]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const pick = async (source: 'camera' | 'library') => {
    const permission =
      source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permissão necessária', source === 'camera' ? 'Permita o uso da câmera para tirar a foto.' : 'Permita o acesso às fotos para escolher uma imagem.');
      return;
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8, allowsEditing: true, aspect: [3, 4] };
    const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled || result.assets.length === 0) return;

    const asset = result.assets[0];
    const mimeType = asset.mimeType && ALLOWED_TYPES.includes(asset.mimeType) ? asset.mimeType : 'image/jpeg';
    const extension = mimeType.split('/')[1];
    setUploading(true);
    try {
      await api.uploadProgressPhoto({ uri: asset.uri, mimeType, name: `progresso.${extension}` });
      await load();
    } catch {
      Alert.alert('Erro', 'Não foi possível enviar a foto. Verifique sua conexão e tente novamente.');
    } finally {
      setUploading(false);
    }
  };

  // Ligar pede confirmação (é o consentimento do paciente); desligar vale na hora.
  const changeSharing = (next: boolean) => {
    const apply = async () => {
      setSavingSharing(true);
      try {
        setSharing(await api.setPhotoSharing(next));
      } catch {
        Alert.alert('Erro', 'Não foi possível salvar agora. Tente novamente.');
      } finally {
        setSavingSharing(false);
      }
    };
    if (!next) {
      apply();
      return;
    }
    Alert.alert(
      'Compartilhar fotos',
      'Seu nutricionista vai poder ver as fotos de progresso que você enviou e as que enviar daqui em diante. Você pode desligar quando quiser.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Compartilhar', onPress: apply },
      ],
    );
  };

  const remove = (photo: LoadedPhoto) => {
    Alert.alert('Apagar foto', `Apagar a foto de ${formatDay(photo.takenAt)}? Essa ação não pode ser desfeita.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteProgressPhoto(photo.id);
            await load();
          } catch {
            Alert.alert('Erro', 'Não foi possível apagar agora.');
          }
        },
      },
    ]);
  };

  if (!photos && failed) {
    return (
      <ScreenContainer onRefresh={refresh} refreshing={refreshing}>
        <ErrorState message="Não foi possível carregar suas fotos." onRetry={refresh} retrying={refreshing} icon={WifiOff} />
      </ScreenContainer>
    );
  }
  if (!photos) {
    return (
      <ScreenContainer scroll={false}>
        <LoadingState />
      </ScreenContainer>
    );
  }

  const open = openIndex != null ? photos[openIndex] : null;

  return (
    <ScreenContainer onRefresh={refresh} refreshing={refreshing}>
      <PageTitle title="Fotos" subtitle="Registre sua evolução visual" />

      <FadeIn>
        <Card>
          <Text style={styles.cardTitle}>Nova foto</Text>
          <Text style={styles.muted}>
            {sharing?.shared ? 'Você e seu nutricionista veem as fotos que você envia por aqui.' : 'Só você vê as fotos que envia por aqui.'}
          </Text>
          {uploading ? (
            <View style={styles.uploading}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.muted}>Enviando foto...</Text>
            </View>
          ) : (
            <View style={styles.buttons}>
              <View style={styles.flex}>
                <Button title="Câmera" onPress={() => pick('camera')} icon={<Camera size={18} color={colors.textInverse} />} />
              </View>
              <View style={styles.flex}>
                <Button title="Galeria" variant="outline" onPress={() => pick('library')} icon={<ImagePlus size={18} color={colors.primary} />} />
              </View>
            </View>
          )}
        </Card>
      </FadeIn>

      {sharing ? (
        <FadeIn delay={30}>
          <Card>
            <View style={styles.shareRow}>
              {sharing.shared ? <Users size={22} color={colors.primary} /> : <Lock size={22} color={colors.textSecondary} />}
              <View style={styles.flex}>
                <Text style={styles.shareTitle}>Compartilhar com meu nutricionista</Text>
                <Text style={styles.muted}>
                  {sharing.shared
                    ? 'Ligado: seu nutricionista vê suas fotos de progresso. Desligue quando quiser.'
                    : 'Desligado: só você vê suas fotos de progresso.'}
                </Text>
              </View>
              <Switch
                value={sharing.shared}
                onValueChange={changeSharing}
                disabled={savingSharing}
                trackColor={{ true: colors.primary, false: colors.border }}
                thumbColor={colors.surface}
                accessibilityLabel="Compartilhar minhas fotos com meu nutricionista"
              />
            </View>
          </Card>
        </FadeIn>
      ) : null}

      {photos.length === 0 ? (
        <EmptyState icon={Images} title="Nenhuma foto enviada" description="Tire fotos de frente, lado e costas, sempre na mesma luz, para comparar sua evolução." />
      ) : (
        <FadeIn delay={60}>
          <Card>
            <Text style={styles.cardTitle}>Minhas fotos</Text>
            <View style={styles.grid}>
              {photos.map((photo, index) => (
                <View key={photo.id} style={styles.thumbWrap}>
                  <Pressable onPress={() => photo.uri && setOpenIndex(index)} accessibilityRole="imagebutton" accessibilityLabel={`Foto de ${formatDay(photo.takenAt)}`}>
                    {photo.uri ? (
                      <Image source={{ uri: photo.uri }} style={styles.thumb} resizeMode="cover" />
                    ) : (
                      <View style={[styles.thumb, styles.thumbMissing]}>
                        <Images size={28} color={colors.textMuted} />
                      </View>
                    )}
                  </Pressable>
                  <View style={styles.thumbFooter}>
                    <Text style={styles.thumbLabel}>{formatDay(photo.takenAt)}</Text>
                    <Pressable onPress={() => remove(photo)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Apagar foto de ${formatDay(photo.takenAt)}`}>
                      <Trash2 size={16} color={colors.textMuted} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          </Card>
        </FadeIn>
      )}

      {evaluations.length > 0 ? (
        <FadeIn delay={120}>
          <Card>
            <Text style={styles.cardTitle}>Fotos das avaliações</Text>
            {evaluations.map((entry) => (
              <View key={entry.id} style={styles.evaluation}>
                <Text style={styles.evaluationDate}>Avaliação de {formatDay(entry.evaluatedAt)}</Text>
                <EvaluationPhotoGallery evaluationId={entry.id} photos={entry.photos} showTitle={false} />
              </View>
            ))}
          </Card>
        </FadeIn>
      ) : null}

      <PhotoLightbox visible={open != null} uri={open?.uri ?? null} label={open ? formatDay(open.takenAt) : ''} onClose={() => setOpenIndex(null)} />
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    cardTitle: { ...typography.subtitle, color: colors.textPrimary },
    muted: { ...typography.caption, color: colors.textSecondary },
    buttons: { flexDirection: 'row', gap: spacing.sm },
    uploading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    thumbWrap: { width: '48%' },
    thumb: { width: '100%', aspectRatio: 3 / 4, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
    thumbMissing: { alignItems: 'center', justifyContent: 'center' },
    thumbFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
    thumbLabel: { ...typography.caption, color: colors.textSecondary },
    evaluation: { gap: spacing.xs },
    shareRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
    shareTitle: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
    evaluationDate: { ...typography.body, fontWeight: '600', color: colors.textPrimary },
  });
