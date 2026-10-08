import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import * as api from '../api/endpoints';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { Nutrients, OrganizedDietProposal } from '../types/api';
import { DietProposalEditor } from './DietProposalEditor';
import { draftProblems, draftToPayload, proposalToDraft, type DietDraft } from './draft';

const MAX_TEXT_LENGTH = 12000;
const MAX_GOAL_LENGTH = 4000;
const TARGET_KCAL = { min: 800, max: 6000 } as const;
const MEALS_PER_DAY = { min: 1, max: 8 } as const;

type Step = 'input' | 'organizing' | 'needsConsent' | 'review';
/** keep = organizar a dieta escrita sem mexer; create = a IA monta com o catálogo (E3). */
type Mode = 'keep' | 'create';
type Nutrition = NonNullable<OrganizedDietProposal['nutrition']>;

/** Campo numérico opcional: vazio = não informado; fora do intervalo = inválido. */
function optionalInt(value: string, range: { min: number; max: number }): { ok: boolean; value?: number } {
  if (!value.trim()) return { ok: true };
  const n = Number(value);
  return Number.isInteger(n) && n >= range.min && n <= range.max ? { ok: true, value: n } : { ok: false };
}

const fmt = (n: number) => Math.round(n).toLocaleString('pt-BR');
const rangeText = (min: number, max: number, unit: string) => (fmt(min) === fmt(max) ? `${fmt(min)} ${unit}` : `${fmt(min)}–${fmt(max)} ${unit}`);
const macroText = (min: Nutrients, max: Nutrients) =>
  `Proteína ${rangeText(min.proteinG, max.proteinG, 'g')} · Carboidrato ${rangeText(min.carbG, max.carbG, 'g')} · Lipídeos ${rangeText(min.fatG, max.fatG, 'g')}`;

/** Total calculado pelo SISTEMA sobre a proposta da IA (faixa quando há "escolha 1"). */
function NutritionSummary({ nutrition }: { nutrition: Nutrition }) {
  return (
    <Card title="Cálculo do sistema para a proposta da IA">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
        {nutrition.targetKcal ? <div>Meta informada: {fmt(nutrition.targetKcal)} kcal por dia</div> : null}
        {nutrition.days.map((day, i) => (
          <div key={i}>
            <strong>{day.label ?? (nutrition.days.length > 1 ? `Dia ${i + 1}` : 'Total do dia')}:</strong> {rangeText(day.min.kcal, day.max.kcal, 'kcal')}
            <span style={{ color: 'var(--color-text-secondary)' }}> · {macroText(day.min, day.max)}</span>
          </div>
        ))}
        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
          Calculado com os valores do catálogo (TACO). Se você mudar alimentos ou quantidades, o sistema recalcula ao criar a dieta.
        </span>
      </div>
    </Card>
  );
}

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
const textareaStyle = {
  width: '100%',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  padding: 10,
  fontFamily: 'inherit',
  fontSize: 13.5,
  resize: 'vertical',
} as const;
const numberLabel = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, fontWeight: 600 } as const;
const numberInput = { width: 160, border: '1px solid var(--color-border)', borderRadius: 8, padding: '6px 8px', fontSize: 13.5, fontFamily: 'inherit' } as const;

function httpStatus(err: unknown): number | undefined {
  return (err as { response?: { status?: number } })?.response?.status;
}

/**
 * Assistente de Dieta, em dois modos escolhidos na tela:
 * - "Manter exatamente como escrevi": a IA só estrutura o texto colado (o
 *   backend confere que nada foi inventado ou alterado);
 * - "Deixar a IA montar/ajustar": a IA propõe a dieta só com alimentos do
 *   catálogo, a partir do pedido e de dados mínimos do paciente (exige o
 *   consentimento dele); o sistema calcula kcal/macros.
 * Nos dois, o profissional revisa e cria um RASCUNHO. Publicar continua sendo
 * a ação manual da aba Dieta.
 */
export function DietAssistantPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<Mode>('keep');
  const [text, setText] = useState('');
  const [goal, setGoal] = useState('');
  const [targetKcal, setTargetKcal] = useState('');
  const [mealsPerDay, setMealsPerDay] = useState('');
  const [nutrition, setNutrition] = useState<Nutrition | null>(null);
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

  const kcalField = optionalInt(targetKcal, TARGET_KCAL);
  const mealsField = optionalInt(mealsPerDay, MEALS_PER_DAY);
  const canSubmit = mode === 'keep' ? Boolean(text.trim()) : Boolean(goal.trim()) && kcalField.ok && mealsField.ok;

  async function organize() {
    setStep('organizing');
    setError(null);
    try {
      const result =
        mode === 'keep'
          ? await api.organizeDiet(clientId!, text)
          : await api.createDietWithAi(clientId!, {
              dietGoal: goal,
              ...(kcalField.value !== undefined ? { targetKcal: kcalField.value } : {}),
              ...(mealsField.value !== undefined ? { mealsPerDay: mealsField.value } : {}),
            });
      setDraft(proposalToDraft(result.structuredData));
      setNutrition(result.structuredData.nutrition ?? null);
      setProblems([]);
      setStep('review');
    } catch (err) {
      if (httpStatus(err) === 403) {
        setConsentReason(errorMessage(err, 'É necessário consentimento de IA para usar este recurso.'));
        setStep('needsConsent');
        return;
      }
      setError(errorMessage(err, mode === 'keep' ? 'Não foi possível organizar a dieta agora.' : 'Não foi possível montar a dieta agora.'));
      setStep('input');
    }
  }

  function chooseMode(next: Mode) {
    setMode(next);
    setError(null);
    setConsentReason(null);
    if (step === 'needsConsent') setStep('input');
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
        {mode === 'keep' ? (
          <>
            Use a IA para organizar uma dieta já elaborada. <strong>A IA não altera quantidades, alimentos ou prescrição</strong> — e o sistema
            confere cada item contra o texto que você colou.
          </>
        ) : (
          <>
            A IA monta uma <strong>proposta</strong> só com alimentos do catálogo, a partir do seu pedido e de dados do paciente (idade, sexo e
            última avaliação — nunca o nome). Exige que o paciente tenha autorizado o uso de IA no app. <strong>O sistema calcula calorias e
            macros</strong>, e você revisa tudo antes de criar o rascunho.
          </>
        )}
      </div>

      {step === 'input' || step === 'organizing' || step === 'needsConsent' ? (
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div role="radiogroup" aria-label="Como a IA deve tratar a dieta" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <label style={modeStyle(mode === 'keep')}>
                <input type="radio" name="diet-mode" checked={mode === 'keep'} disabled={step === 'organizing'} onChange={() => chooseMode('keep')} />{' '}
                <strong>Manter exatamente como escrevi</strong>
                <span style={modeHint}>A IA só organiza em dias, refeições, opções e blocos. Nomes, quantidades e alimentos ficam iguais ao texto.</span>
              </label>
              <label style={modeStyle(mode === 'create')}>
                <input type="radio" name="diet-mode" checked={mode === 'create'} disabled={step === 'organizing'} onChange={() => chooseMode('create')} />{' '}
                <strong>Deixar a IA montar/ajustar</strong>
                <span style={modeHint}>A IA propõe a dieta com alimentos do catálogo e dados do paciente (com o consentimento dele). O sistema calcula.</span>
              </label>
            </div>
            {mode === 'keep' ? (
              <>
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
                  style={textareaStyle}
                />
              </>
            ) : (
              <>
                <label htmlFor="diet-goal" style={{ fontWeight: 600, fontSize: 13 }}>
                  O que a dieta deve atender
                </label>
                <textarea
                  id="diet-goal"
                  rows={8}
                  maxLength={MAX_GOAL_LENGTH}
                  value={goal}
                  disabled={step === 'organizing'}
                  placeholder={'Objetivo: emagrecimento com preservação de massa magra\nRestrições/alergias: sem lactose\nPreferências: gosta de ovos, não come peixe\nRotina: treina às 18h, almoça fora'}
                  onChange={(e) => setGoal(e.target.value)}
                  style={textareaStyle}
                />
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <label style={numberLabel}>
                    Meta de kcal por dia (opcional)
                    <input
                      type="number"
                      inputMode="numeric"
                      min={TARGET_KCAL.min}
                      max={TARGET_KCAL.max}
                      value={targetKcal}
                      disabled={step === 'organizing'}
                      onChange={(e) => setTargetKcal(e.target.value)}
                      aria-invalid={!kcalField.ok}
                      style={numberInput}
                    />
                  </label>
                  <label style={numberLabel}>
                    Refeições por dia (opcional)
                    <input
                      type="number"
                      inputMode="numeric"
                      min={MEALS_PER_DAY.min}
                      max={MEALS_PER_DAY.max}
                      value={mealsPerDay}
                      disabled={step === 'organizing'}
                      onChange={(e) => setMealsPerDay(e.target.value)}
                      aria-invalid={!mealsField.ok}
                      style={numberInput}
                    />
                  </label>
                </div>
                {!kcalField.ok || !mealsField.ok ? (
                  <div role="alert" style={{ color: 'var(--color-danger)', fontSize: 12 }}>
                    {!kcalField.ok ? `A meta precisa ser um número inteiro entre ${TARGET_KCAL.min} e ${TARGET_KCAL.max} kcal. ` : ''}
                    {!mealsField.ok ? `Refeições por dia: de ${MEALS_PER_DAY.min} a ${MEALS_PER_DAY.max}.` : ''}
                  </div>
                ) : null}
              </>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                {mode === 'keep'
                  ? `Não inclua nome, peso ou dados de saúde do paciente — só a dieta. ${text.length}/${MAX_TEXT_LENGTH}`
                  : `Não escreva o nome do paciente — o sistema já envia só o necessário. ${goal.length}/${MAX_GOAL_LENGTH}`}
              </span>
              <Button onClick={organize} loading={step === 'organizing'} disabled={!canSubmit}>
                {mode === 'keep' ? 'Organizar com IA' : 'Montar com IA'}
              </Button>
            </div>
            {step === 'organizing' ? (
              <div role="status" style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                {mode === 'keep' ? 'Organizando… isso pode levar até um minuto.' : 'Montando a proposta… isso pode levar até dois minutos.'}
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
            {mode === 'keep'
              ? 'Proposta de dieta organizada por IA — revise e corrija antes de criar. Nada foi salvo ainda.'
              : 'Proposta de dieta montada por IA com alimentos do catálogo — revise e ajuste antes de criar. Nada foi salvo ainda.'}
          </div>

          {nutrition ? <NutritionSummary nutrition={nutrition} /> : null}

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
              {mode === 'keep' ? 'Organizar novamente' : 'Montar novamente'}
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
          title={mode === 'keep' ? 'Organizar novamente?' : 'Montar novamente?'}
          description={
            mode === 'keep'
              ? 'As correções feitas nesta revisão serão descartadas. O texto colado continua disponível para editar.'
              : 'As correções feitas nesta revisão serão descartadas. O pedido continua disponível para editar.'
          }
          confirmLabel="Descartar revisão"
          onConfirm={() => {
            setDraft(null);
            setNutrition(null);
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
