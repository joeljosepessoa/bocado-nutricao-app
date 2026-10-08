import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, Vibration, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { Check, CheckCircle2, Circle, Flag, MessageSquareText, Timer } from 'lucide-react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Collapsible } from '../components/Collapsible';
import { ExerciseDemo } from '../components/ExerciseDemo';
import { RestTimerModal } from '../components/RestTimerModal';
import { ScreenContainer } from '../components/ScreenContainer';
import { FadeIn, GradientCard, ProgressBar } from '../components/ui';
import { useRestTimer } from '../hooks/useRestTimer';
import * as api from '../api/endpoints';
import { enqueueExecutionLogOffline } from '../offline/sync';
import type { AppNavigation, RootStackParamList } from '../navigation/types';
import {
  DEFAULT_REST_SECONDS,
  NOTES_MAX_LENGTH,
  buildExecution,
  buildExecutionPayload,
  executionProgress,
  type ExecutionExercise,
  type ExecutionSet,
} from '../workout/executionModel';
import { radius, spacing, typography } from '../theme/tokens';
import { useStyles, useTheme, type ThemeColors } from '../theme/theme';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- som local empacotado pelo Metro
const REST_DONE_SOUND = require('../../assets/sounds/rest-done.wav');

const UNIT_LABEL: Record<string, string> = { kg: 'kg', lb: 'lb', bodyweight: 'corpo', band_level: 'nível', other: '' };

/**
 * Execução do treino: marcar séries, ajustar repetições e cargas, descansar
 * com o cronômetro (som + vibração no fim) e escrever uma observação. Ao
 * finalizar, salva no banco as séries feitas, as cargas, a observação e a
 * data; sem internet, guarda no aparelho e envia depois.
 */
export function WorkoutExecutionScreen() {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const navigation = useNavigation<AppNavigation>();
  const route = useRoute<RouteProp<RootStackParamList, 'WorkoutExecution'>>();
  const { day } = route.params;
  const timer = useRestTimer(DEFAULT_REST_SECONDS);
  const player = useAudioPlayer(REST_DONE_SOUND);

  const [exercises, setExercises] = useState<ExecutionExercise[]>(() => buildExecution(day));
  const [notes, setNotes] = useState('');
  const [timerOpen, setTimerOpen] = useState(false);
  const [restTotal, setRestTotal] = useState(DEFAULT_REST_SECONDS);
  const [submitting, setSubmitting] = useState(false);
  const [startedAt] = useState(() => new Date());
  const savedRef = useRef(false);
  const alertedRef = useRef(false);
  // No máximo um GIF aberto por vez (cada GIF é grande).
  const [openDemo, setOpenDemo] = useState<string | null>(null);

  const progress = executionProgress(exercises);

  useEffect(() => {
    // Aviso curto por cima da música do paciente (abaixa o volume dela, não pausa).
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers' }).catch(() => undefined);
  }, []);

  // Fim do descanso: som + vibração uma vez, e o cronômetro aparece.
  useEffect(() => {
    if (timer.running && timer.finished) {
      if (!alertedRef.current) {
        alertedRef.current = true;
        Vibration.vibrate([0, 400, 200, 400]);
        try {
          player.seekTo(0);
          player.play();
        } catch {
          // Sem áudio disponível: a vibração e o aviso visual continuam.
        }
        setTimerOpen(true);
      }
    } else {
      alertedRef.current = false;
    }
  }, [timer.running, timer.finished, player]);

  // Sair com séries feitas e não salvas pede confirmação.
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (savedRef.current || executionProgress(exercises).done === 0) return;
        event.preventDefault();
        Alert.alert('Sair do treino?', 'As séries marcadas ainda não foram salvas.', [
          { text: 'Continuar treino', style: 'cancel' },
          { text: 'Sair sem salvar', style: 'destructive', onPress: () => navigation.dispatch(event.data.action) },
        ]);
      }),
    [navigation, exercises],
  );

  function updateSet(key: string, patch: Partial<ExecutionSet>) {
    setExercises((prev) => prev.map((e) => ({ ...e, sets: e.sets.map((s) => (s.key === key ? { ...s, ...patch } : s)) })));
  }

  function startRest(seconds: number) {
    setRestTotal(seconds);
    timer.reset(seconds);
    timer.start(seconds);
    setTimerOpen(true);
  }

  function toggleSet(set: ExecutionSet) {
    if (set.done) {
      updateSet(set.key, { done: false });
      return;
    }
    updateSet(set.key, { done: true });
    startRest(set.restSeconds);
  }

  function closeTimer() {
    setTimerOpen(false);
    timer.reset(restTotal);
  }

  async function finish() {
    const payload = buildExecutionPayload(day.workoutDayId, exercises, notes, new Date());
    if (!payload) {
      Alert.alert('Nenhuma série marcada', 'Marque as séries que você fez antes de finalizar.');
      return;
    }
    setSubmitting(true);
    try {
      await api.logWorkoutExecution(payload);
      savedRef.current = true;
      Alert.alert('Treino salvo!', `${payload.sets.length} ${payload.sets.length === 1 ? 'série registrada' : 'séries registradas'}. Bom trabalho!`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch {
      await enqueueExecutionLogOffline(payload);
      savedRef.current = true;
      Alert.alert('Salvo no aparelho', 'Sem conexão agora — o treino será enviado automaticamente quando a internet voltar.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } finally {
      setSubmitting(false);
    }
  }

  const elapsedMinutes = Math.max(0, Math.round((Date.now() - startedAt.getTime()) / 60000));

  return (
    <ScreenContainer>
      <FadeIn>
        <GradientCard>
          <Text style={styles.heroTitle}>{day.name}</Text>
          <Text style={styles.heroDetail}>
            {progress.done} de {progress.total} séries · {elapsedMinutes} min
          </Text>
          <ProgressBar value={progress.percent * 100} colors={['#FFFFFF', '#FED7AA']} />
        </GradientCard>
      </FadeIn>

      {exercises.map((exercise, index) => {
        const done = exercise.sets.filter((s) => s.done).length;
        const complete = done === exercise.sets.length && exercise.sets.length > 0;
        return (
          <FadeIn key={exercise.workoutExerciseId} delay={Math.min(index, 6) * 50}>
            <Card>
              <Collapsible
                initiallyOpen={index === 0}
                accessibilityLabel={`${exercise.name}, ${done} de ${exercise.sets.length} séries`}
                header={
                  <View style={styles.exerciseHeader}>
                    <View style={[styles.exerciseBadge, complete && styles.exerciseBadgeDone]}>
                      {complete ? <Check size={16} color="#FFFFFF" /> : <Text style={styles.exerciseBadgeText}>{index + 1}</Text>}
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.exerciseName}>{exercise.name}</Text>
                      <Text style={styles.exerciseMeta}>
                        {[exercise.muscleGroup, `${done}/${exercise.sets.length} séries`].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                  </View>
                }
              >
                <ExerciseDemo
                  imageUrl={exercise.imageUrl}
                  exerciseName={exercise.name}
                  expanded={openDemo === exercise.workoutExerciseId}
                  onToggle={() => setOpenDemo((current) => (current === exercise.workoutExerciseId ? null : exercise.workoutExerciseId))}
                />
                <View style={styles.setHeader}>
                  <Text style={[styles.setHeaderText, styles.setNumberCol]}>Série</Text>
                  <Text style={[styles.setHeaderText, styles.inputCol]}>Reps</Text>
                  <Text style={[styles.setHeaderText, styles.inputCol]}>Carga</Text>
                  <Text style={[styles.setHeaderText, styles.checkCol]}>Feita</Text>
                </View>
                {exercise.sets.map((set) => (
                  <View key={set.key} style={[styles.setRow, set.done && styles.setRowDone]}>
                    <Text style={[styles.setNumber, styles.setNumberCol]}>{set.number}</Text>
                    <TextInput
                      style={[styles.input, styles.inputCol]}
                      keyboardType="number-pad"
                      value={set.reps}
                      placeholder="—"
                      placeholderTextColor={colors.textMuted}
                      onChangeText={(value) => updateSet(set.key, { reps: value })}
                      accessibilityLabel={`Repetições da série ${set.number}`}
                    />
                    <View style={[styles.loadBox, styles.inputCol]}>
                      <TextInput
                        style={[styles.input, styles.flex]}
                        keyboardType="decimal-pad"
                        value={set.load}
                        placeholder="—"
                        placeholderTextColor={colors.textMuted}
                        onChangeText={(value) => updateSet(set.key, { load: value })}
                        accessibilityLabel={`Carga da série ${set.number}`}
                      />
                      <Text style={styles.unit}>{UNIT_LABEL[set.loadUnit ?? 'kg'] ?? ''}</Text>
                    </View>
                    <Pressable
                      onPress={() => toggleSet(set)}
                      hitSlop={6}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: set.done }}
                      accessibilityLabel={`Série ${set.number} feita`}
                      style={styles.checkCol}
                    >
                      {set.done ? <CheckCircle2 size={30} color={colors.success} /> : <Circle size={30} color={colors.textMuted} />}
                    </Pressable>
                  </View>
                ))}
                <Pressable onPress={() => startRest(exercise.sets[0]?.restSeconds ?? DEFAULT_REST_SECONDS)} accessibilityRole="button" style={styles.restLink}>
                  <Timer size={16} color={colors.primary} />
                  <Text style={styles.restLinkText}>Iniciar descanso ({exercise.sets[0]?.restSeconds ?? DEFAULT_REST_SECONDS}s)</Text>
                </Pressable>
              </Collapsible>
            </Card>
          </FadeIn>
        );
      })}

      <Card>
        <View style={styles.notesHeader}>
          <MessageSquareText size={18} color={colors.primary} />
          <Text style={styles.exerciseName}>Observação</Text>
        </View>
        <TextInput
          style={styles.notes}
          value={notes}
          onChangeText={setNotes}
          multiline
          maxLength={NOTES_MAX_LENGTH}
          placeholder="Como foi o treino? Dor, cansaço, carga que subiu..."
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Observação do treino"
          textAlignVertical="top"
        />
      </Card>

      <Button
        title="Finalizar treino"
        variant="success"
        onPress={finish}
        loading={submitting}
        icon={<Flag size={18} color="#FFFFFF" />}
      />

      <RestTimerModal
        visible={timerOpen}
        timer={timer}
        totalSeconds={restTotal}
        onSelectPreset={startRest}
        onClose={closeTimer}
      />
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    heroTitle: { ...typography.title, color: '#FFFFFF' },
    heroDetail: { ...typography.body, color: 'rgba(255,255,255,0.9)' },
    exerciseHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
    exerciseBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
    exerciseBadgeDone: { backgroundColor: colors.success },
    exerciseBadgeText: { ...typography.caption, fontWeight: '800', color: colors.primaryDark },
    exerciseName: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
    exerciseMeta: { ...typography.caption, color: colors.textSecondary },
    setHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xs },
    setHeaderText: { ...typography.tiny, color: colors.textMuted, textTransform: 'uppercase', textAlign: 'center' },
    setRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.xs, borderRadius: radius.md },
    setRowDone: { backgroundColor: colors.successSoft },
    setNumber: { ...typography.body, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
    setNumberCol: { width: 40 },
    inputCol: { flex: 1 },
    checkCol: { width: 48, alignItems: 'center' },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: 8,
      textAlign: 'center',
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
      backgroundColor: colors.surface,
    },
    loadBox: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    unit: { ...typography.tiny, color: colors.textSecondary },
    restLink: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4 },
    restLinkText: { ...typography.caption, fontWeight: '600', color: colors.primary },
    notesHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    notes: {
      minHeight: 96,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.sm + 2,
      ...typography.body,
      color: colors.textPrimary,
      backgroundColor: colors.surfaceMuted,
    },
  });
