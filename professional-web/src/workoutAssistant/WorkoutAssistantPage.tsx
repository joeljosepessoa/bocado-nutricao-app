import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import * as api from '../api/endpoints';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { draftProblems, draftToPayload, proposalToDraft, type WorkoutDraft } from './draft';
import { WorkoutProposalEditor } from './WorkoutProposalEditor';

const MAX_TEXT_LENGTH = 12000;

type Step = 'input' | 'organizing' | 'needsConsent' | 'review';

function errorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  if (Array.isArray(message)) return message.join(' ');
  return typeof message === 'string' ? message : fallback;
}

function httpStatus(err: unknown): number | undefined {
  return (err as { response?: { status?: number } })?.response?.status;
}

/**
 * Assistente de Treino — modo "Organizar treino existente". A IA só
 * organiza o texto colado; o profissional revisa/corrige tudo e cria um
 * RASCUNHO. Publicar continua sendo a ação manual da aba Treino.
 */
export function WorkoutAssistantPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [text, setText] = useState('');
  const [step, setStep] = useState<Step>('input');
  const [draft, setDraft] = useState<WorkoutDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consentReason, setConsentReason] = useState<string | null>(null);
  const [consenting, setConsenting] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);

  const backToWorkout = () => navigate(`/clients/${clientId}/workout`);

  async function organize() {
    setStep('organizing');
    setError(null);
    try {
      const result = await api.organizeWorkout(clientId!, text);
      setDraft(proposalToDraft(result.structuredData));
      setProblems([]);
      setStep('review');
    } catch (err) {
      if (httpStatus(err) === 403) {
        setConsentReason(errorMessage(err, 'É necessário consentimento de IA para usar este recurso.'));
        setStep('needsConsent');
        return;
      }
      setError(errorMessage(err, 'Não foi possível organizar o treino agora.'));
      setStep('input');
    }
  }

  async function activateConsent() {
    setConsenting(true);
    try {
      await api.acceptProfessionalAiConsent();
      await organize();
    } finally {
      setConsenting(false);
    }
  }

  async function createDraft() {
    if (!draft) return;
    const found = draftProblems(draft);
    setProblems(found);
    if (found.length > 0) return;

    setCreating(true);
    setError(null);
    try {
      await api.createWorkoutFromProposal(clientId!, draftToPayload(draft));
      await queryClient.invalidateQueries({ queryKey: ['workouts', clientId] });
      navigate(`/clients/${clientId}/workout`, { state: { assistantCreated: true } });
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível criar o treino. Nada foi salvo.'));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <h2 style={{ fontSize: 18, margin: 0 }}>🤖 Assistente de Treino</h2>
        <Button variant="ghost" onClick={backToWorkout}>
          Voltar ao treino
        </Button>
      </div>

      <div role="radiogroup" aria-label="Modo do assistente" style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          role="radio"
          aria-checked="true"
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            border: '2px solid var(--color-primary)',
            background: 'var(--color-primary-light)',
            fontWeight: 700,
            cursor: 'default',
          }}
        >
          📋 Organizar treino existente
        </button>
      </div>

      {step === 'input' || step === 'organizing' || step === 'needsConsent' ? (
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label htmlFor="workout-text" style={{ fontWeight: 600, fontSize: 13 }}>
              Cole aqui o treino que você já possui
            </label>
            <textarea
              id="workout-text"
              rows={14}
              maxLength={MAX_TEXT_LENGTH}
              value={text}
              disabled={step === 'organizing'}
              placeholder={'SEGUNDA - PEITO + TRÍCEPS\n\nSupino reto com barra\n4x6-10\nDescanso 90s'}
              onChange={(e) => setText(e.target.value)}
              style={{
                width: '100%',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                padding: 10,
                fontFamily: 'inherit',
                fontSize: 13.5,
                resize: 'vertical',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                A IA só organiza o que você escreveu — não cria nem completa a prescrição. {text.length}/{MAX_TEXT_LENGTH}
              </span>
              <Button onClick={organize} loading={step === 'organizing'} disabled={!text.trim()}>
                Organizar com IA
              </Button>
            </div>
            {step === 'organizing' ? (
              <div role="status" style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                Organizando… isso pode levar até um minuto.
              </div>
            ) : null}
            {error ? (
              <div role="alert" style={{ color: 'var(--color-danger)', fontSize: 13 }}>
                {error}
              </div>
            ) : null}
            {step === 'needsConsent' ? (
              <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p role="alert" style={{ margin: 0 }}>
                  {consentReason}
                </p>
                {consentReason?.includes('sua conta') ? (
                  <div>
                    <Button onClick={activateConsent} loading={consenting}>
                      Ativar assistente de IA para minha conta
                    </Button>
                  </div>
                ) : (
                  <p style={{ margin: 0, fontStyle: 'italic', color: 'var(--color-text-secondary)' }}>
                    O cliente precisa consentir pelo próprio aplicativo — nenhuma ação por aqui resolve isso agora.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      {step === 'review' && draft ? (
        <>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--color-accent)',
              textTransform: 'uppercase',
            }}
          >
            Proposta de treino organizada por IA — revise e corrija antes de criar. Nada foi salvo ainda.
          </div>

          <WorkoutProposalEditor draft={draft} onChange={setDraft} />

          {problems.length > 0 ? (
            <Card title="Corrija antes de criar o treino">
              <ul role="alert" style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--color-danger)' }}>
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </Card>
          ) : null}
          {error ? (
            <div role="alert" style={{ color: 'var(--color-danger)', fontSize: 13 }}>
              {error}
            </div>
          ) : null}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={backToWorkout} disabled={creating}>
              Cancelar
            </Button>
            <Button variant="secondary" onClick={() => setConfirmRestart(true)} disabled={creating}>
              Organizar novamente
            </Button>
            <Button onClick={createDraft} loading={creating}>
              Criar treino como rascunho
            </Button>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-secondary)', textAlign: 'right' }}>
            O treino fica em rascunho — o cliente só vê depois que você publicar na aba Treino.
          </p>
        </>
      ) : null}

      {confirmRestart ? (
        <ConfirmDialog
          title="Organizar novamente?"
          description="As correções feitas nesta revisão serão descartadas. O texto colado continua disponível para editar."
          confirmLabel="Descartar revisão"
          onConfirm={() => {
            setDraft(null);
            setProblems([]);
            setError(null);
            setStep('input');
          }}
          onClose={() => setConfirmRestart(false)}
        />
      ) : null}
    </div>
  );
}
