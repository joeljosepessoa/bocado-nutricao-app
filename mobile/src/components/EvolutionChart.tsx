import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';
import type { ChartPoint } from '../evolution/chartData';
import { colors, spacing, typography } from '../theme/tokens';

const WIDTH = 320;
const HEIGHT = 180;
const PAD_LEFT = 44;
const PAD_RIGHT = 16;
const PAD_TOP = 20;
const PAD_BOTTOM = 28;

function formatDateShort(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

interface Props {
  points: ChartPoint[];
  unit: string;
}

/**
 * Gráfico de linha único e reutilizável para qualquer métrica numérica —
 * eixo X por tempo real (não por índice), eixo Y na unidade da métrica.
 * Pontos já vêm sem nulos (ver src/evolution/chartData.ts): esta função só
 * desenha o que existe, nunca interpola.
 */
export function EvolutionChart({ points, unit }: Props) {
  if (points.length < 2) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyText}>Pelo menos duas avaliações com este indicador são necessárias para o gráfico.</Text>
      </View>
    );
  }

  const values = points.map((p) => p.value);
  const timestamps = points.map((p) => p.timestamp);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valuePad = (maxValue - minValue) * 0.15 || Math.max(Math.abs(maxValue) * 0.1, 1);
  const yMin = minValue - valuePad;
  const yMax = maxValue + valuePad;
  const xMin = Math.min(...timestamps);
  const xMax = Math.max(...timestamps);

  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const toX = (t: number) => PAD_LEFT + (xMax === xMin ? plotWidth / 2 : ((t - xMin) / (xMax - xMin)) * plotWidth);
  const toY = (v: number) => PAD_TOP + plotHeight - ((v - yMin) / (yMax - yMin)) * plotHeight;

  const svgPoints = points.map((p) => `${toX(p.timestamp)},${toY(p.value)}`).join(' ');
  const first = points[0];
  const last = points[points.length - 1];

  return (
    <View>
      <Svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" height={HEIGHT}>
        <Line x1={PAD_LEFT} y1={PAD_TOP} x2={PAD_LEFT} y2={HEIGHT - PAD_BOTTOM} stroke={colors.border} strokeWidth={1} />
        <Line
          x1={PAD_LEFT}
          y1={HEIGHT - PAD_BOTTOM}
          x2={WIDTH - PAD_RIGHT}
          y2={HEIGHT - PAD_BOTTOM}
          stroke={colors.border}
          strokeWidth={1}
        />

        <SvgText x={4} y={PAD_TOP + 4} fontSize={9} fill={colors.textSecondary}>
          {`${Math.round(maxValue * 10) / 10}${unit}`}
        </SvgText>
        <SvgText x={4} y={HEIGHT - PAD_BOTTOM} fontSize={9} fill={colors.textSecondary}>
          {`${Math.round(minValue * 10) / 10}${unit}`}
        </SvgText>

        <Polyline points={svgPoints} fill="none" stroke={colors.primary} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

        {points.map((p, index) => {
          const isEdge = index === 0 || index === points.length - 1;
          return (
            <Circle
              key={p.evaluationId}
              cx={toX(p.timestamp)}
              cy={toY(p.value)}
              r={isEdge ? 4.5 : 3}
              fill={colors.primary}
            />
          );
        })}

        <SvgText x={toX(first.timestamp)} y={HEIGHT - 6} fontSize={9} fill={colors.textSecondary} textAnchor="start">
          {`Inicial · ${formatDateShort(first.timestamp)}`}
        </SvgText>
        <SvgText x={toX(last.timestamp)} y={HEIGHT - 6} fontSize={9} fill={colors.textSecondary} textAnchor="end">
          {`Atual · ${formatDateShort(last.timestamp)}`}
        </SvgText>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  emptyBox: { paddingVertical: spacing.lg, alignItems: 'center' },
  emptyText: { ...typography.caption, color: colors.textSecondary, textAlign: 'center', maxWidth: 260 },
});
