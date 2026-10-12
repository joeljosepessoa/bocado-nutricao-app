import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, spacing, typography } from '../theme/tokens';
import { useStyles, type ThemeColors } from '../theme/theme';

interface Props {
  exerciseName: string;
  /** Observação/técnica que o profissional escreveu para este exercício — sempre à vista. */
  notes: string | null | undefined;
  /** Como executar (cadastro do exercício) — abre sob demanda, para a lista não ficar longa. */
  instructions: string | null | undefined;
}

const clean = (text: string | null | undefined) => (text && text.trim() ? text.trim() : null);

/**
 * Orientação em TEXTO do exercício: o que o aluno precisa para executar
 * mesmo quando o exercício não tem demonstração em GIF. Sem observação e
 * sem instrução, não ocupa espaço.
 */
export function ExerciseGuidance({ exerciseName, notes, instructions }: Props) {
  const styles = useStyles(makeStyles);
  const [open, setOpen] = useState(false);
  const note = clean(notes);
  const how = clean(instructions);
  if (!note && !how) return null;

  return (
    <View style={styles.wrapper}>
      {note ? (
        <View style={styles.note} accessible accessibilityLabel={`Observação do profissional: ${note}`}>
          <Text style={styles.noteText}>{note}</Text>
        </View>
      ) : null}
      {how ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            accessibilityLabel={`${open ? 'Ocultar' : 'Ver'} como fazer o exercício ${exerciseName}`}
            onPress={() => setOpen((value) => !value)}
            hitSlop={8}
          >
            <Text style={styles.toggle}>{open ? 'Ocultar como fazer' : 'Como fazer'}</Text>
          </Pressable>
          {open ? <Text style={styles.how}>{how}</Text> : null}
        </>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    wrapper: { marginTop: spacing.xs, gap: spacing.xs },
    note: { borderLeftWidth: 3, borderLeftColor: colors.primary, paddingLeft: spacing.sm, paddingVertical: 2, borderRadius: radius.sm },
    noteText: { ...typography.caption, color: colors.textPrimary, fontStyle: 'italic' },
    toggle: { ...typography.caption, color: colors.primary, fontWeight: '600' },
    how: { ...typography.caption, color: colors.textSecondary },
  });
