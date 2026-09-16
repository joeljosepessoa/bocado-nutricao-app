import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Card } from './Card';
import { Button } from './Button';
import * as api from '../api/endpoints';
import type { AiGenerationResult } from '../types/api';
import { colors, typography } from '../theme/tokens';

type Status = 'idle' | 'loading' | 'needsConsent' | 'ready' | 'error';

interface Props {
  title: string;
  helperText: string;
  generate: () => Promise<AiGenerationResult>;
}

/**
 * Versão do cliente do mesmo componente do professional-web (Fase 12) —
 * só as 2 funções aprovadas para o app do cliente (explicar/narrar sobre
 * o próprio dado já liberado). Nunca salva nada; só exibe, sempre
 * rotulado como conteúdo de IA.
 */
export function AiAssistPanel({ title, helperText, generate }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [consenting, setConsenting] = useState(false);

  async function handleGenerate() {
    setStatus('loading');
    setError(null);
    try {
      const result = await generate();
      setText(result.text);
      setStatus('ready');
    } catch (err) {
      const httpStatus = (err as { response?: { status?: number } })?.response?.status;
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      if (httpStatus === 403) {
        setStatus('needsConsent');
        return;
      }
      setError(message ?? 'Não foi possível gerar agora.');
      setStatus('error');
    }
  }

  async function handleAcceptConsent() {
    setConsenting(true);
    try {
      await api.acceptAiConsent();
      await handleGenerate();
    } finally {
      setConsenting(false);
    }
  }

  return (
    <Card>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.helper}>{helperText}</Text>

      {status === 'idle' || status === 'error' ? (
        <>
          <Button title="Gerar" onPress={handleGenerate} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </>
      ) : null}

      {status === 'needsConsent' ? (
        <>
          <Text style={styles.helper}>
            Para usar este recurso, você precisa concordar com o uso de IA sobre os seus próprios dados já liberados
            pelo seu profissional.
          </Text>
          <Button title="Concordar e continuar" onPress={handleAcceptConsent} loading={consenting} />
        </>
      ) : null}

      {status === 'loading' ? <Text style={styles.helper}>Gerando…</Text> : null}

      {status === 'ready' ? (
        <>
          <Text style={styles.badge}>Conteúdo gerado por IA — não é orientação médica</Text>
          <Text style={styles.body}>{text}</Text>
          <Button title="Gerar novamente" variant="secondary" onPress={handleGenerate} />
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.subtitle, color: colors.textPrimary },
  helper: { ...typography.caption, color: colors.textSecondary },
  body: { ...typography.body, color: colors.textPrimary },
  error: { ...typography.caption, color: colors.danger },
  badge: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: '700',
    textTransform: 'uppercase',
    fontSize: 10,
  },
});
