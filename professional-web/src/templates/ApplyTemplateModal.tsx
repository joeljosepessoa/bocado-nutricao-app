import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../api/endpoints';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Modal } from '../components/Modal';
import { apiErrorMessage } from '../dietEditor/draftEdit';
import { formatDate } from '../lib/format';
import type { TemplateKind } from '../types/api';

const KIND_TEXT: Record<TemplateKind, { noun: string; article: string; tab: string }> = {
  diet: { noun: 'dieta', article: 'A', tab: 'Dieta' },
  workout: { noun: 'treino', article: 'O', tab: 'Treino' },
};

const selectStyle = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)', font: 'inherit' } as const;
const labelStyle = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 } as const;
const captionStyle = { color: 'var(--color-text-secondary)', fontWeight: 600 } as const;

function httpStatus(err: unknown): number | undefined {
  return (err as { response?: { status?: number } })?.response?.status;
}

/**
 * Atribuir um modelo a um paciente — vira RASCUNHO na ficha dele (nunca publica).
 * Da biblioteca: o modelo já está escolhido e falta o paciente.
 * Da aba Dieta/Treino do paciente: o paciente já está escolhido e falta o modelo.
 */
export function ApplyTemplateModal({
  kind,
  template,
  clientId: fixedClientId,
  onClose,
  onApplied,
}: {
  kind: TemplateKind;
  template?: { id: string; name: string };
  clientId?: string;
  onClose: () => void;
  onApplied: (clientId: string) => void;
}) {
  const queryClient = useQueryClient();
  const text = KIND_TEXT[kind];
  const [clientId, setClientId] = useState(fixedClientId ?? '');
  const [templateId, setTemplateId] = useState(template?.id ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmReplace, setConfirmReplace] = useState<string | null>(null);

  const clients = useQuery({
    queryKey: ['clients', '', 'apply-template'],
    queryFn: () => api.listClients({ status: 'all', pageSize: 100 }),
    enabled: !fixedClientId,
  });
  const templates = useQuery({ queryKey: ['templates', kind, false], queryFn: () => api.listTemplates(kind), enabled: !template });
  const patients = (clients.data?.items ?? []).filter((client) => client.status !== 'archived');

  async function apply(replaceDraft = false) {
    setSaving(true);
    setError(null);
    try {
      await api.applyTemplate(kind, templateId, clientId, replaceDraft);
      const keys = kind === 'diet' ? ['diets', 'diet', 'diet-version'] : ['workouts', 'workout', 'workout-version'];
      await Promise.all(keys.map((key) => queryClient.invalidateQueries({ queryKey: [key, clientId] })));
      onApplied(clientId);
    } catch (err) {
      if (httpStatus(err) === 409 && kind === 'diet' && !replaceDraft) {
        setConfirmReplace(apiErrorMessage(err, 'Este paciente já tem um rascunho de dieta aberto.'));
        return;
      }
      setError(apiErrorMessage(err, `Não foi possível usar o modelo. Nada foi alterado na ficha do paciente.`));
    } finally {
      setSaving(false);
    }
  }

  const options = templates.data ?? [];

  return (
    <>
      <Modal
        title={template ? `Atribuir "${template.name}" a um paciente` : `Usar um modelo de ${text.noun}`}
        onClose={onClose}
        actions={
          <>
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={() => apply()} loading={saving} disabled={!clientId || !templateId}>
              {template ? 'Atribuir ao paciente' : 'Usar este modelo'}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!fixedClientId ? (
            <label style={labelStyle}>
              <span style={captionStyle}>Paciente</span>
              <select value={clientId} onChange={(e) => setClientId(e.target.value)} style={selectStyle}>
                <option value="">{clients.isLoading ? 'Carregando…' : 'Selecione o paciente…'}</option>
                {patients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.user.fullName}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {!template ? (
            templates.isLoading ? (
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Carregando modelos…</div>
            ) : options.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                Você ainda não tem modelos de {text.noun}. Crie em <strong>Modelos</strong>, no menu.
              </div>
            ) : (
              <div role="radiogroup" aria-label="Modelos" style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
                {options.map((option) => (
                  <label
                    key={option.id}
                    style={{
                      display: 'flex',
                      gap: 10,
                      alignItems: 'flex-start',
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: `1px solid ${templateId === option.id ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      background: templateId === option.id ? 'var(--color-primary-light)' : 'var(--color-surface)',
                      cursor: 'pointer',
                    }}
                  >
                    <input type="radio" name="template" checked={templateId === option.id} onChange={() => setTemplateId(option.id)} style={{ marginTop: 3 }} />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontWeight: 600 }}>{option.name}</span>
                      {option.description ? (
                        <span style={{ display: 'block', fontSize: 12.5, color: 'var(--color-text-secondary)', overflowWrap: 'anywhere' }}>{option.description}</span>
                      ) : null}
                      <span style={{ display: 'block', fontSize: 12, color: 'var(--color-text-secondary)' }}>Atualizado em {formatDate(option.updatedAt)}</span>
                    </span>
                  </label>
                ))}
              </div>
            )
          ) : null}

          <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
            {text.article} {text.noun} entra como <strong>rascunho</strong> na aba {text.tab} do paciente. Você ajusta o que quiser e só depois publica. O modelo
            continua igual na biblioteca.
          </div>
          {error ? (
            <div role="alert" style={{ color: 'var(--color-danger)', fontSize: 13 }}>
              {error}
            </div>
          ) : null}
        </div>
      </Modal>

      {confirmReplace ? (
        <ConfirmDialog
          title="Substituir o rascunho atual?"
          description={`${confirmReplace} As refeições do rascunho atual serão trocadas pelas do modelo. A versão publicada não é alterada.`}
          confirmLabel="Substituir rascunho"
          danger
          onConfirm={() => apply(true)}
          onClose={() => setConfirmReplace(null)}
        />
      ) : null}
    </>
  );
}
