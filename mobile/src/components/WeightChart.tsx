import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient as SvgGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import type { WeightPoint } from '../dashboard/dashboardModel';
import { formatNumber } from '../diet/dietView';
import { useTheme } from '../theme/theme';

const HEIGHT = 180;
const PAD_LEFT = 40;
const PAD_RIGHT = 12;
const PAD_TOP = 14;
const PAD_BOTTOM = 26;

function shortDate(timestamp: number): string {
  const date = new Date(timestamp);
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Gráfico de área do peso (gradiente laranja da referência). Desenha só os
 * pontos recebidos — um por registro real, eixo X pelo tempo; nunca
 * interpola nem completa dias sem registro. Precisa de 2+ pontos (quem usa
 * mostra o convite para registrar antes disso).
 */
export function WeightChart({ points }: { points: WeightPoint[] }) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);

  const values = points.map((p) => p.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const pad = (maxValue - minValue) * 0.2 || 1;
  const yMin = minValue - pad;
  const yMax = maxValue + pad;
  const xMin = points[0]?.timestamp ?? 0;
  const xMax = points[points.length - 1]?.timestamp ?? 0;
  const plotW = Math.max(width - PAD_LEFT - PAD_RIGHT, 1);
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const toX = (t: number) => PAD_LEFT + (xMax === xMin ? plotW / 2 : ((t - xMin) / (xMax - xMin)) * plotW);
  const toY = (v: number) => PAD_TOP + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.timestamp)},${toY(p.value)}`).join(' ');
  const area = points.length > 1 ? `${line} L${toX(xMax)},${PAD_TOP + plotH} L${toX(xMin)},${PAD_TOP + plotH} Z` : '';
  const ticks = [yMax - pad, (yMin + yMax) / 2, yMin + pad];

  return (
    <View style={styles.box} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessibilityLabel={`Gráfico de peso com ${points.length} registros`}>
      {width > 0 && points.length > 1 ? (
        <Svg width={width} height={HEIGHT}>
          <Defs>
            <SvgGradient id="weightArea" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.primary} stopOpacity={0.35} />
              <Stop offset="1" stopColor={colors.primary} stopOpacity={0} />
            </SvgGradient>
          </Defs>
          {ticks.map((tick) => (
            <React.Fragment key={tick}>
              <Line x1={PAD_LEFT} x2={width - PAD_RIGHT} y1={toY(tick)} y2={toY(tick)} stroke={colors.border} strokeDasharray="3 3" />
              <SvgText x={PAD_LEFT - 6} y={toY(tick) + 4} fontSize={10} fill={colors.textMuted} textAnchor="end">
                {formatNumber(tick, 1)}
              </SvgText>
            </React.Fragment>
          ))}
          <Path d={area} fill="url(#weightArea)" />
          <Path d={line} stroke={colors.primary} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p) => (
            <Circle key={p.timestamp} cx={toX(p.timestamp)} cy={toY(p.value)} r={3.5} fill={colors.surface} stroke={colors.primary} strokeWidth={2} />
          ))}
          <SvgText x={toX(xMin)} y={HEIGHT - 6} fontSize={10} fill={colors.textMuted} textAnchor="start">
            {shortDate(xMin)}
          </SvgText>
          <SvgText x={toX(xMax)} y={HEIGHT - 6} fontSize={10} fill={colors.textMuted} textAnchor="end">
            {shortDate(xMax)}
          </SvgText>
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { height: HEIGHT, width: '100%' },
});
