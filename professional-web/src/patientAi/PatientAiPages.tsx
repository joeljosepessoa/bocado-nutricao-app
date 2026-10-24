import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import * as api from '../api/endpoints';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { DietProposalEditor } from '../dietAssistant/DietProposalEditor';
import { draftProblems as dietProblems, draftToPayload as dietToPayload, draftToTemplateContent, emptyDietDraft, templateToDraft as dietFromContent, type DietDraft } from '../dietAssistant/draft';
import { apiErrorMessage } from '../dietEditor/draftEdit';
import { blockedBy, dietHasFoods, nutritionSummary, workoutHasExercises } from '../templates/chatHelpers';
import { TemplateAiChat } from '../templates/TemplateAiChat';
import chatStyles from '../templates/TemplateAiChat.module.css';
import type { ClientDetail, TemplateChatMessage } from '../types/api';
import { WorkoutProposalEditor } from '../workoutAssistant/WorkoutProposalEditor';
import {
  draftProblems as workoutProblems,
  draftToPayload as workoutToPayload,
  emptyWorkoutDraft,
  templateToDraft as workoutFromContent,
  type WorkoutDraft,
} from '../workoutAssistant/draft';

function httpStatus(err: unknown): number | undefined {
  return (err as { response?: { status?: number } })?.response?.status;
}

const SUGGESTIONS = {
  diet: [
    'Monte a dieta deste paciente a partir da anamnese e da última avaliação',
    'Ajuste as calorias para o objetivo dele',
    'Troque o que ele não pode ou não gosta de comer',
  ],
  workout: [
    'Monte o treino deste paciente a partir da anamnese',
    'Adapte à frequência e ao tempo de treino que ele tem',
    'Evite exercícios que possam piorar o que está na anamnese',
  ],
};

/** Moldura das duas telas: título, aviso de autorização, o que a IA usa, conversa + editor e o botão final. */
function PatientAiShell({
  kind,
  client,
  consent,
  chat,
  problems,
  error,
  creating,
  onCreate,
  children,
}: {
  kind: 'diet' | 'workout';
  client: ClientDetail;
  consent: boolean;
  chat: ReactNode;
  problems: string[];
  error: string | null;
  creating: boolean;
  onCreate: () => void;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const noun = kind === 'diet' ? 'dieta' : 'treino';
  const back = () => navigate(`/clients/${client.id}/${kind}`);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 18, margin: 0 }}>🤖 Montar {kind === 'diet' ? 'a dieta' : 'o treino'} com a IA</h2>
        <Button variant="ghost" onClick={back}>
          Voltar {kind === 'diet' ? 'à dieta' : 'ao treino'}
        </Button>
      </div>

      {!consent ? (
        <div role="alert" style={{ fontSize: 13, padding: '10px 14px', borderRadius: 12, background: 'var(--color-warning-light, #fef3c7)', color: 'var(--color-text)' }}>
          <strong>{client.user.fullName} ainda não autorizou a IA.</strong> Sem a autorização dele, a IA não pode usar os dados do paciente. Peça para ele abrir o
          app em <strong>Privacidade e dados</strong> e autorizar o uso de inteligência artificial.
        </div>
      ) : null}

      <div role="note" style={{ fontSize: 13, padding: '10px 14px', borderRadius: 12, background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)' }}>
        A IA usa a idade, o sexo, a última avaliação e a anamnese completa do paciente — sem nome, CPF, RG, endereço, e-mail e telefone. O resultado
        vira um <strong>rascunho</strong> na aba {kind === 'diet' ? 'Dieta' : 'Treino'}: o paciente só vê depois que você publicar.
      </div>

      <div className={chatStyles.layout}>
        {chat}
        <div className={chatStyles.main}>
          {children}

          {problems.length > 0 ? (
            <Card title={`Corrija antes de criar ${kind === 'diet' ? 'a dieta' : 'o treino'}`}>
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
            <Button variant="ghost" onClick={back} disabled={creating}>
              Cancelar
            </Button>
            <Button onClick={onCreate} loading={creating}>
              Criar {noun} como rascunho
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DietForm({ client, initial, objective, consent }: { client: ClientDetail; initial: DietDraft; objective: string; consent: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(initial);
  const [beforeAi, setBeforeAi] = useState<DietDraft | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState<string | null>(null);

  async function chat(messages: TemplateChatMessage[]) {
    const before = draft;
    const result = await api.patientDietChat(client.id, messages, dietHasFoods(before) ? draftToTemplateContent(before, objective) : null);
    if (result.changed && result.content) {
      setBeforeAi(before);
      setDraft(dietFromContent(result.content, result.foods));
    }
    return { reply: result.reply, changed: result.changed, warnings: result.warnings, summary: result.changed ? nutritionSummary(result.nutrition) : null };
  }

  async function create(replaceDraft = false) {
    const found = dietProblems(draft);
    setProblems(found);
    if (found.length > 0) return;
    setCreating(true);
    setError(null);
    try {
      await api.createDietFromProposal(client.id, { ...(objective.trim() ? { objective: objective.trim() } : {}), ...dietToPayload(draft, replaceDraft) });
      await queryClient.invalidateQueries({ queryKey: ['diets', client.id] });
      await queryClient.invalidateQueries({ queryKey: ['diet', client.id] });
      navigate(`/clients/${client.id}/diet`, { state: { assistantCreated: true } });
    } catch (err) {
      if (httpStatus(err) === 409 && !replaceDraft) {
        setConfirmReplace(apiErrorMessage(err, 'Já existe um rascunho em aberto.'));
        return;
      }
      setError(apiErrorMessage(err, 'Não foi possível criar a dieta. Nada foi salvo.'));
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <PatientAiShell
        kind="diet"
        client={client}
        consent={consent}
        problems={problems}
        error={error}
        creating={creating}
        onCreate={() => create()}
        chat={
          <TemplateAiChat
            kind="diet"
            memoryKey={`paciente-${client.id}-dieta`}
            send={chat}
            blockedReason={() => (dietHasFoods(draft) ? blockedBy(dietProblems(draft)) : null)}
            canUndo={beforeAi !== null}
            onUndo={() => {
              if (beforeAi) setDraft(beforeAi);
              setBeforeAi(null);
            }}
            suggestions={SUGGESTIONS.diet}
            intro="Peça para a IA montar ou ajustar a dieta deste paciente. Ela já conhece a anamnese e a última avaliação; o resultado aparece no editor."
          />
        }
      >
        <DietProposalEditor draft={draft} onChange={setDraft} allowDays />
      </PatientAiShell>
      {confirmReplace ? (
        <ConfirmDialog
          title="Substituir o rascunho atual?"
          description={`${confirmReplace} As refeições do rascunho atual serão trocadas pelas desta conversa. A versão publicada não é alterada.`}
          confirmLabel="Substituir rascunho"
          danger
          onConfirm={() => create(true)}
          onClose={() => setConfirmReplace(null)}
        />
      ) : null}
    </>
  );
}

function WorkoutForm({ client, initial, objective, consent }: { client: ClientDetail; initial: WorkoutDraft; objective: string; consent: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(initial);
  const [beforeAi, setBeforeAi] = useState<WorkoutDraft | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const withObjective = <T extends object>(payload: T) => ({ ...(objective.trim() ? { objective: objective.trim() } : {}), ...payload });

  async function chat(messages: TemplateChatMessage[]) {
    const before = draft;
    const result = await api.patientWorkoutChat(client.id, messages, workoutHasExercises(before) ? withObjective(workoutToPayload(before)) : null);
    if (result.changed && result.content) {
      setBeforeAi(before);
      setDraft(workoutFromContent(result.content, result.exercises));
    }
    return { reply: result.reply, changed: result.changed, warnings: result.warnings };
  }

  async function create() {
    const found = workoutProblems(draft);
    setProblems(found);
    if (found.length > 0) return;
    setCreating(true);
    setError(null);
    try {
      await api.createWorkoutFromProposal(client.id, withObjective(workoutToPayload(draft)));
      await queryClient.invalidateQueries({ queryKey: ['workouts', client.id] });
      navigate(`/clients/${client.id}/workout`, { state: { assistantCreated: true } });
    } catch (err) {
      setError(apiErrorMessage(err, 'Não foi possível criar o treino. Nada foi salvo.'));
    } finally {
      setCreating(false);
    }
  }

  return (
    <PatientAiShell
      kind="workout"
      client={client}
      consent={consent}
      problems={problems}
      error={error}
      creating={creating}
      onCreate={create}
      chat={
        <TemplateAiChat
          kind="workout"
          memoryKey={`paciente-${client.id}-treino`}
          send={chat}
          blockedReason={() => (workoutHasExercises(draft) ? blockedBy(workoutProblems(draft)) : null)}
          canUndo={beforeAi !== null}
          onUndo={() => {
            if (beforeAi) setDraft(beforeAi);
            setBeforeAi(null);
          }}
          suggestions={SUGGESTIONS.workout}
          intro="Peça para a IA montar ou ajustar o treino deste paciente. Ela já conhece a anamnese e a última avaliação; o resultado aparece no editor."
        />
      }
    >
      <WorkoutProposalEditor draft={draft} onChange={setDraft} allowDays />
    </PatientAiShell>
  );
}

/** /clients/:clientId/diet/ia — começa da dieta atual do paciente (ou em branco). */
export function PatientDietAiPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const { client } = useOutletContext<{ client: ClientDetail }>();
  const { data, isLoading, isError } = useQuery({ queryKey: ['client-diet-content', clientId], queryFn: () => api.getClientDietContent(clientId!), gcTime: 0 });
  if (isLoading) return <EmptyState title="Carregando a dieta do paciente…" />;
  if (isError || !data) return <EmptyState title="Não foi possível abrir a dieta do paciente" />;
  return (
    <DietForm
      client={client}
      initial={data.content ? dietFromContent(data.content, data.foods) : emptyDietDraft()}
      objective={data.content?.objective ?? ''}
      consent={data.patientAiConsent}
    />
  );
}

/** /clients/:clientId/workout/ia — começa do treino atual do paciente (ou em branco). */
export function PatientWorkoutAiPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const { client } = useOutletContext<{ client: ClientDetail }>();
  const { data, isLoading, isError } = useQuery({ queryKey: ['client-workout-content', clientId], queryFn: () => api.getClientWorkoutContent(clientId!), gcTime: 0 });
  if (isLoading) return <EmptyState title="Carregando o treino do paciente…" />;
  if (isError || !data) return <EmptyState title="Não foi possível abrir o treino do paciente" />;
  return (
    <WorkoutForm
      client={client}
      initial={data.content ? workoutFromContent(data.content, data.exercises) : emptyWorkoutDraft()}
      objective={data.content?.objective ?? ''}
      consent={data.patientAiConsent}
    />
  );
}
