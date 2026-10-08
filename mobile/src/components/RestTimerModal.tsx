import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Minus, Pause, Play, Plus, SkipForward, Timer, X } from 'lucide-react-native';
import type { RestTimerControls } from '../hooks/useRestTimer';
import { REST_PRESETS } from '../workout/executionModel';
import { Button } from './Button';
import { radius, spacing, typography } from '../theme/tokens';
import { useStyles, useTheme, type ThemeColors } from '../theme/theme';

const SIZE = 220;
const STROKE = 12;
const R = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;

/**
 * Cronômetro de descanso em tela sobreposta: anel de progresso, presets de
 * 30 a 120 s, ±15 s, pausar/continuar e pular. O som e a vibração do fim do
 * descanso ficam na tela de execução (tocam mesmo com o modal fechado).
 */
export function RestTimerModal({
  visible,
  timer,
  totalSeconds,
  onSelectPreset,
  onClose,
}: {
  visible: boolean;
  timer: RestTimerControls;
  totalSeconds: number;
  onSelectPreset: (seconds: number) => void;
  onClose: () => void;
}) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const fraction = totalSeconds > 0 ? Math.min(timer.remainingSeconds / totalSeconds, 1) : 0;
  const finished = timer.finished && timer.running;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerTitle}>
              <Timer size={20} color={colors.primary} />
              <Text style={styles.title}>{finished ? 'Descanso concluído!' : 'Descanso'}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Fechar cronômetro">
              <X size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.ring} accessibilityLabel={`Faltam ${timer.label}`} accessibilityLiveRegion="polite">
            <Svg width={SIZE} height={SIZE}>
              <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={colors.surfaceMuted} strokeWidth={STROKE} fill="none" />
              <Circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                stroke={finished ? colors.success : colors.primary}
                strokeWidth={STROKE}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
                strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
                transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
              />
            </Svg>
            <View style={styles.ringCenter}>
              <Text style={[styles.time, finished && { color: colors.success }]}>{timer.label}</Text>
              <Text style={styles.caption}>{finished ? 'Hora da próxima série' : timer.running ? 'descansando' : 'pausado'}</Text>
            </View>
          </View>

          <View style={styles.presets}>
            {REST_PRESETS.map((seconds) => {
              const active = totalSeconds === seconds;
              return (
                <Pressable
                  key={seconds}
                  onPress={() => onSelectPreset(seconds)}
                  accessibilityRole="button"
                  accessibilityLabel={`Descanso de ${seconds} segundos`}
                  style={[styles.preset, active && styles.presetActive]}
                >
                  <Text style={[styles.presetText, active && styles.presetTextActive]}>{seconds}s</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.controls}>
            <RoundButton label="Menos 15 segundos" onPress={() => timer.adjust(-15)}>
              <Minus size={22} color={colors.textPrimary} />
            </RoundButton>
            <Pressable
              onPress={() => (timer.running && !timer.finished ? timer.pause() : timer.start())}
              accessibilityRole="button"
              accessibilityLabel={timer.running && !timer.finished ? 'Pausar' : 'Continuar'}
              style={({ pressed }) => [styles.mainButton, pressed && styles.pressed]}
            >
              {timer.running && !timer.finished ? <Pause size={30} color="#FFFFFF" /> : <Play size={30} color="#FFFFFF" />}
            </Pressable>
            <RoundButton label="Mais 15 segundos" onPress={() => timer.adjust(15)}>
              <Plus size={22} color={colors.textPrimary} />
            </RoundButton>
          </View>

          <Button
            title={finished ? 'Continuar treino' : 'Pular descanso'}
            variant={finished ? 'success' : 'outline'}
            onPress={onClose}
            icon={<SkipForward size={18} color={finished ? '#FFFFFF' : colors.primary} />}
          />
        </View>
      </View>
    </Modal>
  );
}

function RoundButton({ children, label, onPress }: { children: React.ReactNode; label: string; onPress: () => void }) {
  const styles = useStyles(makeStyles);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}>
      {children}
    </Pressable>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: spacing.md },
    sheet: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, gap: spacing.md },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    title: { ...typography.subtitle, color: colors.textPrimary },
    ring: { alignSelf: 'center', width: SIZE, height: SIZE },
    ringCenter: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
    time: { fontSize: 52, fontWeight: '800', color: colors.textPrimary, fontVariant: ['tabular-nums'] },
    caption: { ...typography.caption, color: colors.textSecondary },
    presets: { flexDirection: 'row', gap: 6 },
    preset: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
    presetActive: { backgroundColor: colors.primaryLight },
    presetText: { ...typography.caption, fontWeight: '700', color: colors.textSecondary },
    presetTextActive: { color: colors.primaryDark },
    controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
    roundButton: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
    mainButton: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    pressed: { opacity: 0.7 },
  });
