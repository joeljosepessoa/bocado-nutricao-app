import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import * as api from '../api/endpoints';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DietProposalEditor } from './DietProposalEditor';
import { draftProblems, draftToPayload, proposalToDraft, type DietDraft } from './draft';

const MAX_TEXT_LENGTH = 12000;

type Step = 'input' | 'organizing' | 'needsConsent' | 'review';

function errorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  if (Array.isArray(message)) return message.join(' ');
  return typeof message === 'string' ? message : fallback;
}

const modeStyle = (active: boolean) =>
  ({
    flex: 1,
    minWidth: 240,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    fontSize: 13,
    padding: '10px 12px',
    borderRadius: 10,
    border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
    background: active ? 'var(--color-primary-light)' : 'var(--color-surface)',
    opacity: active ? 1 : 0.6,
  }) as const;
const modeHint = { fontSize: 12, color: 'var(--color-text-secondary)' } as const;

function httpStatus(err: unknown): number | undefined {
  return (err as { response?: { status?: number } })?.response?.status;
}

/**
 * Assistente de Dieta — "Organizar dieta existente". A IA só estrutura o
 * texto colado (o backend confere que nada foi inventado ou alterado); o
 * profissional revisa e cria um RASCUNHO. Publicar continua sendo a ação
 * manual da aba Dieta.
 */
export function DietAssistantPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [text, setText] = useState('');
  const [step, setStep] = useState<Step>('input');
  const [draft, setDraft] = useState<DietDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consentReason, setConsentReason] = useState<string | null>(null);
  const [consenting, setConsenting] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState<string | null>(null);

  const backToDiet = () => navigate(`/clients/${clientId}/diet`);

  async function organize() {
    setStep('organizing');
    setError(null);
    try {
      const result = await api.organizeDiet(clientId!, text);
      setDraft(proposalToDraft(result.structuredData));
      setProblems([]);
      setStep('review');
    } catch (err) {
      if (httpStatus(err) === 403) {
        setConsentReason(errorMessage(err, 'É necessário consentimento de IA para usar este recurso.'));
        setStep('needsConsent');
        return;
      }
      setError(errorMessage(err, 'Não foi possível organizar a dieta agora.'));
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

  async function createDraft(replaceDraft = false) {
    if (!draft) return;
    const found = draftProblems(draft);
    setProblems(found);
    if (found.length > 0) return;

    setCreating(true);
    setError(null);
    try {
      await api.createDietFromProposal(clientId!, draftToPayload(draft, replaceDraft));
      await queryClient.invalidateQueries({ queryKey: ['diets', clientId] });
      await queryClient.invalidateQueries({ queryKey: ['diet', clientId] });
      navigate(`/clients/${clientId}/diet`, { state: { assistantCreated: true } });
    } catch (err) {
      if (httpStatus(err) === 409 && !replaceDraft) {
        setConfirmReplace(errorMessage(err, 'Já existe um rascunho em aberto.'));
        return;
      }
      setError(errorMessage(err, 'Não foi possível criar a dieta. Nada foi salvo.'));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <h2 style={{ fontSize: 18, margin: 0 }}>🤖 Assistente de Dieta</h2>
        <Button variant="ghost" onClick={backToDiet}>
          Voltar à dieta
        </Button>
      </div>

      <div
        role="note"
        style={{ fontSize: 13, padding: '10px 14px', borderRadius: 12, background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)' }}
      >
        Use a IA para organizar uma dieta já elaborada. <strong>A IA não altera quantidades, alimentos ou prescrição</strong> — e o sistema confere
        cada item contra o texto que você colou.
      </div>

      {step === 'input' || step === 'organizing' || step === 'needsConsent' ? (
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div role="radiogroup" aria-label="Como a IA deve tratar a dieta" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <label style={modeStyle(true)}>
                <input type="radio" name="diet-mode" checked readOnly /> <strong>Manter exatamente como escrevi</strong>
                <span style={modeHint}>A IA só organiza em dias, refeições, opções e blocos. Nomes, quantidades e alimentos ficam iguais ao texto.</span>
              </label>
              <label style={modeStyle(false)} title="Em breve">
                <input type="radio" name="diet-mode" disabled /> <strong>Deixar a IA montar/ajustar</strong>
                <span style={modeHint}>Em breve: a IA propõe a dieta com alimentos do catálogo e dados do paciente (com o consentimento dele).</span>
              </label>
            </div>
            <label htmlFor="diet-text" style={{ fontWeight: 600, fontSize: 13 }}>
              Cole aqui a dieta que você já elaborou
            </label>
            <textarea
              id="diet-text"
              rows={14}
              maxLength={MAX_TEXT_LENGTH}
              value={text}
              disabled={step === 'organizing'}
              placeholder={'CAFÉ DA MANHÃ\n2 fatias de pão integral\n4 ovos inteiros\n4 claras\n150 g de fruta\n\nALMOÇO\n150 g arroz\n100 g feijão\n150 g frango\nsalada'}
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
                Não inclua nome, peso ou dados de saúde do paciente — só a dieta. {text.length}/{MAX_TEXT_LENGTH}
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
                ) : null}
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      {step === 'review' && draft ? (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-accent)', textTransform: 'uppercase' }}>
            Proposta de dieta organizada por IA — revise e corrija antes de criar. Nada foi salvo ainda.
          </div>

          <DietProposalEditor draft={draft} onChange={setDraft} />

          {problems.length > 0 ? (
            <Card title="Corrija antes de criar a dieta">
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
            <Button variant="ghost" onClick={backToDiet} disabled={creating}>
              Cancelar
            </Button>
            <Button variant="secondary" onClick={() => setConfirmRestart(true)} disabled={creating}>
              Organizar novamente
            </Button>
            <Button onClick={() => createDraft()} loading={creating}>
              Criar dieta como rascunho
            </Button>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-secondary)', textAlign: 'right' }}>
            A dieta fica em rascunho — o paciente só vê depois que você publicar na aba Dieta. Calorias e macros são calculadas pelo sistema.
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

      {confirmReplace ? (
        <ConfirmDialog
          title="Substituir o rascunho atual?"
          description={`${confirmReplace} As refeições do rascunho atual serão trocadas pelas desta revisão. A versão publicada não é alterada.`}
          confirmLabel="Substituir rascunho"
          danger
          onConfirm={() => createDraft(true)}
          onClose={() => setConfirmReplace(null)}
        />
      ) : null}
    </div>
  );
}
