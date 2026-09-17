import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import * as api from '../../api/endpoints';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { formatDateTime } from '../../lib/format';

export function MessagesTab() {
  const { clientId } = useParams<{ clientId: string }>();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');

  const { data: messages, isLoading } = useQuery({
    queryKey: ['messages', clientId],
    queryFn: () => api.listMessages(clientId!),
    enabled: !!clientId,
  });

  const sendMutation = useMutation({
    mutationFn: (body: string) => api.sendMessage(clientId!, body),
    onSuccess: () => {
      setDraft('');
      queryClient.invalidateQueries({ queryKey: ['messages', clientId] });
    },
  });

  if (isLoading) {
    return <EmptyState title="Carregando mensagens…" />;
  }

  return (
    <>
      <h2 style={{ fontSize: 17, margin: 0 }}>Mensagens</h2>

      {!messages || messages.length === 0 ? (
        <EmptyState title="Nenhuma mensagem ainda" description="Envie a primeira mensagem para este cliente." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {messages.map((m) => (
            <div
              key={m.id}
              style={{
                alignSelf: m.senderRole === 'professional' ? 'flex-end' : 'flex-start',
                maxWidth: '70%',
                background: m.senderRole === 'professional' ? 'var(--color-primary)' : 'var(--color-surface)',
                color: m.senderRole === 'professional' ? '#fff' : 'var(--color-text)',
                border: m.senderRole === 'professional' ? 'none' : '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: '8px 12px',
              }}
            >
              <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{m.body}</div>
              <div
                style={{
                  fontSize: 11,
                  marginTop: 4,
                  opacity: 0.75,
                  textAlign: m.senderRole === 'professional' ? 'right' : 'left',
                }}
              >
                {formatDateTime(m.createdAt)}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Escreva uma mensagem…"
          rows={2}
          maxLength={2000}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-border)',
            fontFamily: 'inherit',
            fontSize: 14,
            resize: 'vertical',
          }}
        />
        <Button
          onClick={() => sendMutation.mutate(draft)}
          loading={sendMutation.isPending}
          disabled={!draft.trim()}
        >
          Enviar
        </Button>
      </div>
    </>
  );
}
