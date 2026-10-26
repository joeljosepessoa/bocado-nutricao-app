import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, Vibration, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { CalendarDays, CheckCircle2, ChevronDown, ChevronUp, Circle, Clock, Dumbbell, Flag, MessageSquareText, Play, Timer, Weight, WifiOff } from 'lucide-react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ExerciseDemo } from '../components/ExerciseDemo';
import { ExerciseGuidance } from '../components/ExerciseGuidance';
import { RestTimerModal } from '../components/RestTimerModal';
import { ScreenContainer } from '../components/ScreenContainer';
import { EmptyState, ErrorState, FadeIn, IconBox, LoadingState, ProgressBar } from '../components/ui';
import { useAuth } from '../auth/AuthContext';
import { useRestTimer } from '../hooks/useRestTimer';
import * as api from '../api/endpoints';
import { enqueueExecutionLogOffline } from '../offline/sync';
import { readLocalLastPerformance, rememberLastPerformance } from '../workout/lastPerformanceStore';
import type { WorkoutClientDay, WorkoutClientSummary } from '../types/api';
import { nextWorkoutDay } from '../dashboard/dashboardModel';
import {
  DEFAULT_REST_SECONDS,
  NOTES_MAX_LENGTH,
  buildExecution,
  buildExecutionPayload,
  commonLoad,
  dayTabLabel,
  executionProgress,
  loadUnitOf,
  prescriptionSummary,
  restLabel,
  type ExecutionExercise,
  type ExecutionSet,
  type LocalLastPerformance,
} from '../workout/executionModel';
import { radius, spacing, typography } from '../theme/tokens';
import { useStyles, useTheme, type ThemeColors } from '../theme/theme';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- som local empacotado pelo Metro
const REST_DONE_SOUND = require('../../assets/sounds/rest-done.wav');

const UNIT_LABEL: Record<string, string> = { kg: 'kg', lb: 'lb', bodyweight: '', band_level: 'nível', other: '' };

interface LoadedWorkout {
  workout: WorkoutClientSummary | null;
  lastDayId: string | null;
  /** Última carga guardada no aparelho (inclui treino ainda não enviado). */
  localLast: LocalLastPerformance;
}

/** Erro que o servidor respondeu (recusou os dados), diferente de falta de internet: não adianta guardar e reenviar. */
function serverRejection(err: unknown): string | null {
  const response = (err as { response?: { status?: number; data?: { message?: unknown } } })?.response;
  if (!response?.status || response.status < 400 || response.status >= 500 || response.status === 401) return null;
  const message = response.data?.message;
  return Array.isArray(message) ? message.join(' ') : typeof message === 'string' ? message : 'O servidor não aceitou o registro.';
}

/** O que o aluno marcou/digitou num dia, guardado enquanto ele alterna entre os dias. */
interface Session {
  exercises: ExecutionExercise[];
  notes: string;
  started: boolean;
}

const freshSession = (day: WorkoutClientDay, localLast: LocalLastPerformance): Session => ({ exercises: buildExecution(day, localLast), notes: '', started: false });

/**
 * Meus Treinos: o treino publicado numa tela só. No topo, os dias em botões, o
 * progresso e "Iniciar Treino"; abaixo, cada exercício com o resumo ("4x 6–8"),
 * um botão por série, a carga, os detalhes e o descanso. Marcar séries, ajustar
 * repetições/cargas, cronômetro (som + vibração) e observação acontecem aqui;
 * "Finalizar" salva no banco as séries feitas — sem internet, guarda no aparelho
 * e envia depois.
 */
export function WorkoutScreen() {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const { user } = useAuth();
  const timer = useRestTimer(DEFAULT_REST_SECONDS);
  const player = useAudioPlayer(REST_DONE_SOUND);

  const [data, setData] = useState<LoadedWorkout | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Record<string, Session>>({});
  const [listOpen, setListOpen] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState<Record<string, boolean>>({});
  // No máximo um GIF aberto por vez: limita memória/dados (cada GIF é grande).
  const [openDemoId, setOpenDemoId] = useState<string | null>(null);
  const [timerOpen, setTimerOpen] = useState(false);
  const [restTotal, setRestTotal] = useState(DEFAULT_REST_SECONDS);
  const [submitting, setSubmitting] = useState(false);
  const alertedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const [workout, executions, localLast] = await Promise.all([
        api.getCurrentWorkout(),
        api.listWorkoutExecutions(1, 1).catch(() => null),
        readLocalLastPerformance(),
      ]);
      setData({ workout, lastDayId: executions?.items[0]?.workoutDayId ?? null, localLast });
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

  const workout = data?.workout ?? null;
  const days = useMemo(() => (workout ? [...workout.days].sort((a, b) => a.order - b.order) : []), [workout]);
  const next = workout ? nextWorkoutDay(workout, data?.lastDayId ?? null) : null;
  const day = days.find((d) => d.workoutDayId === selectedDayId) ?? days.find((d) => d.workoutDayId === next?.workoutDayId) ?? days[0] ?? null;
  // Versão nova do treino = ids novos: o que foi marcado na versão antiga não é reaproveitado.
  const sessionKey = workout && day ? `${workout.versionId}:${day.workoutDayId}` : '';
  const localLast = data?.localLast;
  const initial = useMemo(() => (day ? freshSession(day, localLast ?? {}) : null), [day, localLast]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (!data && failed) {
    return (
      <ScreenContainer onRefresh={refresh} refreshing={refreshing}>
        <ErrorState message="Não foi possível carregar seu treino." onRetry={refresh} retrying={refreshing} icon={WifiOff} />
      </ScreenContainer>
    );
  }
  if (!data) {
    return (
      <ScreenContainer scroll={false}>
        <LoadingState />
      </ScreenContainer>
    );
  }
  if (!workout || !day || !initial) {
    return (
      <ScreenContainer onRefresh={refresh} refreshing={refreshing}>
        <EmptyState icon={Dumbbell} title="Nenhum treino publicado" description="Seu profissional ainda não publicou um treino para você." />
      </ScreenContainer>
    );
  }

  const session = sessions[sessionKey] ?? initial;
  const { exercises } = session;
  const progress = executionProgress(exercises);
  const percent = Math.round(progress.percent * 100);
  const active = session.started || progress.done > 0;

  const patchSession = (change: (current: Session) => Session) => setSessions((prev) => ({ ...prev, [sessionKey]: change(prev[sessionKey] ?? initial) }));
  const patchSets = (match: (set: ExecutionSet) => boolean, patch: Partial<ExecutionSet>, start = false) =>
    patchSession((current) => ({
      ...current,
      started: current.started || start,
      exercises: current.exercises.map((e) => ({ ...e, sets: e.sets.map((s) => (match(s) ? { ...s, ...patch } : s)) })),
    }));

  function startRest(seconds: number) {
    setRestTotal(seconds);
    timer.reset(seconds);
    timer.start(seconds);
    setTimerOpen(true);
  }

  function closeTimer() {
    setTimerOpen(false);
    timer.reset(restTotal);
  }

  /** Marcar uma série como feita já inicia o descanso dela; desmarcar não mexe no cronômetro. */
  function toggleSet(set: ExecutionSet) {
    patchSets((s) => s.key === set.key, { done: !set.done }, true);
    if (!set.done) startRest(set.restSeconds);
  }

  /** O círculo do exercício marca (ou desmarca) todas as séries dele de uma vez. */
  function toggleExercise(exercise: ExecutionExercise) {
    const complete = exercise.sets.length > 0 && exercise.sets.every((s) => s.done);
    patchSets((s) => s.workoutExerciseId === exercise.workoutExerciseId, { done: !complete }, true);
  }

  async function finish() {
    const payload = buildExecutionPayload(day!.workoutDayId, exercises, session.notes, new Date());
    if (!payload) {
      Alert.alert('Nenhuma série marcada', 'Marque as séries que você fez antes de finalizar.');
      return;
    }
    const finishedKey = sessionKey;
    const finishedDayId = day!.workoutDayId;
    const saved = async () => {
      // Treino salvo: o dia volta ao estado inicial (já com as cargas de hoje) e passa a ser o último treino feito.
      const remembered = await rememberLastPerformance(payload);
      setSessions((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => key !== finishedKey)));
      setData((current) => (current ? { ...current, lastDayId: finishedDayId, localLast: remembered } : current));
    };
    setSubmitting(true);
    try {
      await api.logWorkoutExecution(payload);
      await saved();
      Alert.alert('Treino salvo!', `${payload.sets.length} ${payload.sets.length === 1 ? 'série registrada' : 'séries registradas'}. Bom trabalho!`);
    } catch (err) {
      const rejected = serverRejection(err);
      if (rejected) {
        // Não é falta de internet: o que foi marcado continua na tela para tentar de novo.
        Alert.alert('Não foi possível salvar o treino', `${rejected}

O que você marcou continua na tela. Se acontecer de novo, avise seu profissional.`);
        return;
      }
      await enqueueExecutionLogOffline(payload);
      await saved();
      Alert.alert('Salvo no aparelho', 'Sem conexão agora — o treino será enviado automaticamente quando a internet voltar.');
    } finally {
      setSubmitting(false);
    }
  }

  const name = user?.fullName?.trim() || 'Meu treino';

  return (
    <ScreenContainer onRefresh={refresh} refreshing={refreshing}>
      <FadeIn>
        <Card>
          <View style={styles.profileRow}>
            <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatar}>
              <Text style={styles.avatarText}>{name.charAt(0).toLocaleUpperCase('pt-BR')}</Text>
            </LinearGradient>
            <View style={styles.flex}>
              <Text style={styles.profileName} numberOfLines={1}>
                {name}
              </Text>
              <View style={styles.metaRow}>
                <View style={styles.metaItem}>
                  <Dumbbell size={14} color={colors.textSecondary} />
                  <Text style={styles.meta}>
                    {exercises.length} {exercises.length === 1 ? 'exercício' : 'exercícios'}
                  </Text>
                </View>
                <View style={styles.metaItem}>
                  <Clock size={14} color={colors.textSecondary} />
                  <Text style={styles.meta}>~{progress.total} séries</Text>
                </View>
                <View style={styles.metaItem}>
                  <CalendarDays size={14} color={colors.textSecondary} />
                  <Text style={styles.meta}>
                    {days.length} {days.length === 1 ? 'treino' : 'treinos'}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills} accessibilityRole="tablist">
            {days.map((item, index) => {
              const selected = item.workoutDayId === day.workoutDayId;
              const label = dayTabLabel(item.name, index);
              return (
                <Pressable
                  key={item.workoutDayId}
                  onPress={() => setSelectedDayId(item.workoutDayId)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Treino ${item.name}`}
                >
                  {selected ? (
                    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.pill}>
                      <Text style={[styles.pillText, styles.pillTextSelected]}>{label}</Text>
                    </LinearGradient>
                  ) : (
                    <View style={[styles.pill, styles.pillIdle]}>
                      <Text style={styles.pillText}>{label}</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.progressRow}>
            <View style={styles.flex}>
              <View style={styles.progressLabels}>
                <Text style={styles.meta}>Progresso</Text>
                <Text style={styles.progressCount}>
                  {progress.done}/{progress.total} séries <Text style={styles.progressPercent}>({percent}%)</Text>
                </Text>
              </View>
              <ProgressBar value={percent} height={8} />
            </View>
            {active ? (
              <Button title="Finalizar" variant="success" compact onPress={finish} loading={submitting} icon={<Flag size={16} color="#FFFFFF" />} />
            ) : (
              <Button
                title="Iniciar Treino"
                variant="success"
                compact
                onPress={() => {
                  setListOpen(true);
                  patchSession((current) => ({ ...current, started: true }));
                }}
                icon={<Play size={16} color="#FFFFFF" />}
              />
            )}
          </View>
        </Card>
      </FadeIn>

      <View>
        <Text style={styles.dayTitle}>
          {day.name}
          <Text style={styles.dayTitleSuffix}> – Exercícios</Text>
        </Text>
        {day.notes && day.notes.trim() ? <Text style={styles.dayNotes}>{day.notes.trim()}</Text> : null}
      </View>

      <FadeIn delay={60}>
        <Card style={styles.listCard}>
          <Pressable
            onPress={() => setListOpen((value) => !value)}
            accessibilityRole="button"
            accessibilityState={{ expanded: listOpen }}
            accessibilityLabel={`Exercícios, ${exercises.length} exercícios, ${progress.total} séries`}
            style={styles.listHeader}
          >
            <IconBox icon={Dumbbell} color={colors.textInverse} background={colors.textSecondary} size={44} />
            <View style={styles.flex}>
              <Text style={styles.listTitle}>Exercícios</Text>
              <Text style={styles.meta}>
                {exercises.length} {exercises.length === 1 ? 'exercício' : 'exercícios'} · {progress.total} séries · <Text style={styles.progressPercent}>{percent}%</Text>
              </Text>
            </View>
            {listOpen ? <ChevronUp size={20} color={colors.textMuted} /> : <ChevronDown size={20} color={colors.textMuted} />}
          </Pressable>
          <ProgressBar value={percent} height={4} colors={[colors.textSecondary, colors.textSecondary]} />

          {listOpen
            ? exercises.map((exercise, index) => {
                const done = exercise.sets.filter((s) => s.done).length;
                const complete = exercise.sets.length > 0 && done === exercise.sets.length;
                const summary = prescriptionSummary(exercise.sets);
                const rest = exercise.sets[0]?.restSeconds ?? DEFAULT_REST_SECONDS;
                const unit = UNIT_LABEL[loadUnitOf(exercise.sets)] ?? '';
                const open = !!detailsOpen[exercise.workoutExerciseId];
                const info = [exercise.muscleGroup, exercise.equipment].filter(Boolean).join(' · ');
                return (
                  <View key={exercise.workoutExerciseId} style={[styles.exercise, index > 0 && styles.exerciseBorder, index === exercises.length - 1 && styles.exerciseLast, complete && styles.exerciseDone]}>
                    <View style={styles.exerciseTop}>
                      <Pressable
                        onPress={() => toggleExercise(exercise)}
                        hitSlop={8}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: complete }}
                        accessibilityLabel={`Todas as séries de ${exercise.name} feitas`}
                      >
                        {complete ? <CheckCircle2 size={26} color={colors.success} /> : <Circle size={26} color={colors.textMuted} />}
                      </Pressable>
                      <Text style={[styles.exerciseName, complete && styles.exerciseNameDone]}>{exercise.name}</Text>
                    </View>

                    <View style={styles.metaRow}>
                      <Text style={styles.meta}>
                        <Text style={styles.metaStrong}>{summary.count}</Text>
                        {summary.reps ? ` ${summary.reps}` : ''}
                      </Text>
                      <View style={styles.metaItem}>
                        <Clock size={13} color={colors.textSecondary} />
                        <Text style={styles.meta}>{restLabel(rest)}</Text>
                      </View>
                      <Text style={styles.metaMuted}>
                        {done}/{exercise.sets.length}
                      </Text>
                    </View>

                    {/* A técnica prescrita fica sempre à vista; o "como fazer" abre em Ver detalhes. */}
                    <ExerciseGuidance exerciseName={exercise.name} notes={exercise.notes} instructions={null} />

                    <View style={styles.chips}>
                      {exercise.sets.map((set) => (
                        <Pressable
                          key={set.key}
                          onPress={() => toggleSet(set)}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: set.done }}
                          accessibilityLabel={`${set.number}ª série de ${exercise.name} feita`}
                          style={[styles.chip, set.done && styles.chipDone]}
                        >
                          {set.done ? <CheckCircle2 size={16} color={colors.success} /> : <Circle size={16} color={colors.textMuted} />}
                          <Text style={[styles.chipText, set.done && styles.chipTextDone]}>{set.number}ª série</Text>
                        </Pressable>
                      ))}
                    </View>

                    {exercise.lastTime ? <Text style={styles.lastTime}>{exercise.lastTime}</Text> : null}
                    <View style={styles.loadBox}>
                      <Weight size={18} color={colors.textMuted} />
                      <TextInput
                        style={styles.loadInput}
                        keyboardType="decimal-pad"
                        value={commonLoad(exercise.sets)}
                        placeholder={unit ? `Carga (${unit})` : 'Carga'}
                        placeholderTextColor={colors.textMuted}
                        onChangeText={(value) => patchSets((s) => s.workoutExerciseId === exercise.workoutExerciseId, { load: value })}
                        accessibilityLabel={`Carga de ${exercise.name}`}
                      />
                    </View>

                    <Pressable
                      onPress={() => setDetailsOpen((prev) => ({ ...prev, [exercise.workoutExerciseId]: !open }))}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: open }}
                      accessibilityLabel={`${open ? 'Ocultar' : 'Ver'} detalhes de ${exercise.name}`}
                      hitSlop={6}
                      style={styles.link}
                    >
                      {open ? <ChevronUp size={16} color={colors.textSecondary} /> : <ChevronDown size={16} color={colors.textSecondary} />}
                      <Text style={styles.detailsText}>{open ? 'Ocultar detalhes' : 'Ver detalhes'}</Text>
                    </Pressable>

                    {open ? (
                      <View style={styles.details}>
                        {info ? <Text style={styles.meta}>{info}</Text> : null}
                        <ExerciseGuidance exerciseName={exercise.name} notes={null} instructions={exercise.instructions} />
                        <View style={styles.setHeader}>
                          <Text style={[styles.setHeaderText, styles.setNumberCol]}>Série</Text>
                          <Text style={[styles.setHeaderText, styles.flex]}>Reps</Text>
                          <Text style={[styles.setHeaderText, styles.flex]}>Carga{unit ? ` (${unit})` : ''}</Text>
                        </View>
                        {exercise.sets.map((set) => (
                          <React.Fragment key={set.key}>
                            <View style={styles.setRow}>
                              <Text style={[styles.setNumber, styles.setNumberCol]}>{set.number}ª</Text>
                              <TextInput
                                style={[styles.input, styles.flex]}
                                keyboardType="number-pad"
                                value={set.reps}
                                // Faixa prescrita ("8–12") fica como dica: o aluno digita o que fez.
                                placeholder={set.repsTarget ?? '—'}
                                placeholderTextColor={colors.textMuted}
                                onChangeText={(value) => patchSets((s) => s.key === set.key, { reps: value })}
                                accessibilityLabel={`Repetições da ${set.number}ª série de ${exercise.name}`}
                              />
                              <TextInput
                                style={[styles.input, styles.flex]}
                                keyboardType="decimal-pad"
                                value={set.load}
                                placeholder="—"
                                placeholderTextColor={colors.textMuted}
                                onChangeText={(value) => patchSets((s) => s.key === set.key, { load: value })}
                                accessibilityLabel={`Carga da ${set.number}ª série de ${exercise.name}`}
                              />
                            </View>
                            {set.notes ? (
                              <Text style={styles.setNote}>
                                {set.number}ª série: {set.notes}
                              </Text>
                            ) : null}
                          </React.Fragment>
                        ))}
                        <ExerciseDemo
                          imageUrl={exercise.imageUrl}
                          exerciseName={exercise.name}
                          expanded={openDemoId === exercise.workoutExerciseId}
                          onToggle={() => setOpenDemoId((current) => (current === exercise.workoutExerciseId ? null : exercise.workoutExerciseId))}
                        />
                      </View>
                    ) : null}

                    <Pressable onPress={() => startRest(rest)} accessibilityRole="button" accessibilityLabel={`Iniciar descanso de ${restLabel(rest)}`} hitSlop={6} style={styles.link}>
                      <Timer size={16} color={colors.primary} />
                      <Text style={styles.restText}>Iniciar Descanso</Text>
                    </Pressable>
                  </View>
                );
              })
            : null}
        </Card>
      </FadeIn>

      {active ? (
        <>
          <Card>
            <View style={styles.notesHeader}>
              <MessageSquareText size={18} color={colors.primary} />
              <Text style={styles.listTitle}>Observação</Text>
            </View>
            <TextInput
              style={styles.notes}
              value={session.notes}
              onChangeText={(value) => patchSession((current) => ({ ...current, notes: value }))}
              multiline
              maxLength={NOTES_MAX_LENGTH}
              placeholder="Como foi o treino? Dor, cansaço, carga que subiu..."
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Observação do treino"
              textAlignVertical="top"
            />
          </Card>
          <Button title="Finalizar treino" variant="success" onPress={finish} loading={submitting} icon={<Flag size={18} color="#FFFFFF" />} />
        </>
      ) : null}

      <RestTimerModal visible={timerOpen} timer={timer} totalSeconds={restTotal} onSelectPreset={startRest} onClose={closeTimer} />
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    profileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
    avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
    profileName: { ...typography.subtitle, fontWeight: '700', color: colors.textPrimary },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.sm + 4, rowGap: 2 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    meta: { ...typography.caption, color: colors.textSecondary },
    metaStrong: { fontWeight: '800', color: colors.textPrimary },
    metaMuted: { ...typography.caption, color: colors.textMuted },
    pills: { gap: spacing.sm, paddingVertical: 2 },
    pill: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, borderRadius: radius.md, minWidth: 56, alignItems: 'center' },
    pillIdle: { backgroundColor: colors.surfaceMuted },
    pillText: { ...typography.body, fontWeight: '600', color: colors.textPrimary },
    pillTextSelected: { color: '#FFFFFF', fontWeight: '700' },
    progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
    progressLabels: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: spacing.sm },
    progressCount: { ...typography.caption, fontWeight: '700', color: colors.textPrimary },
    progressPercent: { color: colors.primary, fontWeight: '700' },
    dayTitle: { ...typography.subtitle, fontWeight: '700', color: colors.textPrimary },
    dayTitleSuffix: { ...typography.body, fontWeight: '400', color: colors.textSecondary },
    dayNotes: { ...typography.caption, color: colors.textPrimary, fontStyle: 'italic', marginTop: 2 },
    listCard: { paddingHorizontal: 0, paddingBottom: 0, gap: 0 },
    listHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, paddingHorizontal: spacing.md, paddingBottom: spacing.sm + 4 },
    listTitle: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
    exercise: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 4 },
    exerciseBorder: { borderTopWidth: 1, borderTopColor: colors.border },
    exerciseDone: { backgroundColor: colors.successSoft },
    // A última linha acompanha o canto arredondado do cartão (o fundo verde não vaza).
    exerciseLast: { borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
    exerciseTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    exerciseName: { ...typography.body, fontWeight: '600', color: colors.textPrimary, flex: 1 },
    exerciseNameDone: { textDecorationLine: 'line-through', color: colors.textMuted },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: spacing.sm + 4,
      paddingVertical: spacing.sm,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
    },
    chipDone: { borderColor: colors.success, backgroundColor: colors.successSoft },
    chipText: { ...typography.caption, fontWeight: '500', color: colors.textPrimary },
    chipTextDone: { color: colors.success, fontWeight: '700' },
    loadBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.sm + 4,
      backgroundColor: colors.surfaceMuted,
    },
    lastTime: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
    loadInput: { flex: 1, paddingVertical: spacing.sm + 2, ...typography.body, color: colors.textPrimary },
    link: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 2 },
    detailsText: { ...typography.caption, color: colors.textSecondary },
    restText: { ...typography.caption, fontWeight: '600', color: colors.primary },
    details: { gap: spacing.sm, paddingLeft: spacing.xs },
    setHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    setHeaderText: { ...typography.tiny, color: colors.textMuted, textTransform: 'uppercase', textAlign: 'center' },
    setRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    setNumber: { ...typography.body, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
    setNumberCol: { width: 40 },
    setNote: { ...typography.caption, color: colors.textSecondary, fontStyle: 'italic' },
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
