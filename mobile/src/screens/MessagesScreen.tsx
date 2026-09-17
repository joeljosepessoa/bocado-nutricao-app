import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import * as api from '../api/endpoints';
import type { Message } from '../types/api';
import { ScreenContainer } from '../components/ScreenContainer';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { colors, radius, spacing, typography } from '../theme/tokens';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function MessagesScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMessages(await api.getMessages());
    } catch {
      // tela mostra o que já tinha carregado; sem estado de erro dedicado por ora
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSend() {
    const body = draft.trim();
    if (!body) {
      return;
    }
    setSending(true);
    try {
      await api.sendMessage(body);
      setDraft('');
      await load();
    } catch {
      // melhor esforço — o rascunho permanece no campo pra tentar de novo
    } finally {
      setSending(false);
    }
  }

  return (
    <ScreenContainer scroll={false}>
      <FlatList
        style={{ flex: 1 }}
        data={messages}
        keyExtractor={(item) => item.id}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={{ gap: spacing.sm }}
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.senderRole === 'client' ? styles.bubbleOwn : styles.bubbleOther,
            ]}
          >
            <Text style={item.senderRole === 'client' ? styles.bodyOwn : styles.bodyOther}>{item.body}</Text>
            <Text style={item.senderRole === 'client' ? styles.timeOwn : styles.timeOther}>{formatTime(item.createdAt)}</Text>
          </View>
        )}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>Nenhuma mensagem ainda.</Text> : null}
      />
      <View style={styles.composer}>
        <View style={{ flex: 1 }}>
          <TextField
            label=""
            value={draft}
            onChangeText={setDraft}
            placeholder="Escreva uma mensagem…"
            multiline
            autoCapitalize="sentences"
            maxLength={2000}
          />
        </View>
        <Button title="Enviar" onPress={handleSend} loading={sending} disabled={!draft.trim()} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  bubble: {
    maxWidth: '80%',
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  bubbleOwn: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
  },
  bubbleOther: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bodyOwn: { ...typography.body, color: colors.textInverse },
  bodyOther: { ...typography.body, color: colors.textPrimary },
  timeOwn: { ...typography.caption, color: colors.textInverse, opacity: 0.8, marginTop: 2 },
  timeOther: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  empty: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.lg },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingTop: spacing.sm },
});
