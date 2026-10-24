import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import * as api from '../api/endpoints';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { DietProposalEditor } from '../dietAssistant/DietProposalEditor';
import {
  draftProblems as dietDraftProblems,
  draftToTemplateContent,
  emptyDietDraft,
  templateToDraft as dietTemplateToDraft,
  type DietDraft,
} from '../dietAssistant/draft';
import { apiErrorMessage } from '../dietEditor/draftEdit';
import { WorkoutProposalEditor } from '../workoutAssistant/WorkoutProposalEditor';
import {
  draftProblems as workoutDraftProblems,
  draftToPayload as workoutDraftToPayload,
  emptyWorkoutDraft,
  templateToDraft as workoutTemplateToDraft,
  type WorkoutDraft,
} from '../workoutAssistant/draft';
import type { DietChatResult, TemplateKind, TemplateSummary } from '../types/api';
import { ApplyTemplateModal } from './ApplyTemplateModal';
import { TemplateAiChat } from './TemplateAiChat';
import { forgetChat, moveChat, newTemplateChatKey } from './chatMemory';
import chatStyles from './TemplateAiChat.module.css';

const inputStyle = {
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  padding: '8px 10px',
  font: 'inherit',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
} as const;
const fieldStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: 13,
  minWidth: 0,
} as const;
const captionStyle = {
  color: 'var(--color-text-secondary)',
  fontWeight: 600,
} as const;

interface Meta {
  name: string;
  description: string;
  objective: string;
}

/** Cabeçalho, dados do modelo, avisos e botões — o editor do conteúdo entra no meio. */
function TemplateShell({
  kind,
  isNew,
  meta,
  onMeta,
  problems,
  error,
  saving,
  notice,
  onSave,
  onSaveAndApply,
  chat,
  children,
}: {
  kind: TemplateKind;
  isNew: boolean;
  meta: Meta;
  onMeta: (meta: Meta) => void;
  problems: string[];
  error: string | null;
  saving: boolean;
  notice: string | null;
  onSave: () => void;
  onSaveAndApply: () => void;
  chat: ReactNode;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const noun = kind === 'diet' ? 'dieta' : 'treino';
  const back = () => navigate(`/modelos?tipo=${kind === 'diet' ? 'dietas' : 'treinos'}`);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--color-primary-dark)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Modelo de {noun}
          </div>
          <h1 style={{ fontSize: 22, margin: '2px 0 0' }}>{isNew ? `Novo modelo de ${noun}` : meta.name || 'Modelo sem nome'}</h1>
        </div>
        <Button variant="ghost" onClick={back}>
          ← Voltar aos modelos
        </Button>
      </div>

      {notice ? (
        <div
          role="status"
          style={{
            fontSize: 13,
            padding: '8px 12px',
            borderRadius: 8,
            background: 'var(--color-primary-light)',
          }}
        >
          {notice}
        </div>
      ) : null}

      <div className={chatStyles.layout}>
        {chat}
        <div className={chatStyles.main}>
          <Card>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 12,
              }}
            >
              <label style={fieldStyle}>
                <span style={captionStyle}>Nome do modelo *</span>
                <input
                  style={inputStyle}
                  aria-label="Nome do modelo"
                  maxLength={120}
                  placeholder={kind === 'diet' ? 'Ex.: Emagrecimento 1.600 kcal' : 'Ex.: ABC iniciante'}
                  value={meta.name}
                  onChange={(e) => onMeta({ ...meta, name: e.target.value })}
                />
              </label>
              <label style={fieldStyle}>
                <span style={captionStyle}>Objetivo</span>
                <input
                  style={inputStyle}
                  aria-label="Objetivo"
                  maxLength={200}
                  placeholder={kind === 'diet' ? 'Ex.: Perda de gordura' : 'Ex.: Hipertrofia'}
                  value={meta.objective}
                  onChange={(e) => onMeta({ ...meta, objective: e.target.value })}
                />
              </label>
            </div>
            <label style={fieldStyle}>
              <span style={captionStyle}>Descrição (só você vê)</span>
              <textarea
                style={inputStyle}
                aria-label="Descrição"
                rows={2}
                maxLength={2000}
                placeholder="Para quem é, quando usar…"
                value={meta.description}
                onChange={(e) => onMeta({ ...meta, description: e.target.value })}
              />
            </label>
          </Card>

          {children}

          {problems.length > 0 ? (
            <Card title="Corrija antes de salvar">
              <ul
                role="alert"
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  fontSize: 13,
                  color: 'var(--color-danger)',
                }}
              >
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

          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              justifyContent: 'flex-end',
            }}
          >
            <Button variant="ghost" onClick={back} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="secondary" onClick={onSaveAndApply} loading={saving}>
              Salvar e atribuir a paciente
            </Button>
            <Button onClick={onSave} loading={saving}>
              Salvar modelo
            </Button>
          </div>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              color: 'var(--color-text-secondary)',
              textAlign: 'right',
            }}
          >
            O modelo fica na sua biblioteca. Atribuir cria um rascunho na ficha do paciente; o modelo não muda.
          </p>
        </div>
      </div>
    </div>
  );
}

const kcalText = (n: number) => Math.round(n).toLocaleString('pt-BR');

/** "1.780 kcal · P 120 g · C 180 g · G 60 g" por dia (faixa quando há escolhas), calculado pelo sistema. */
function nutritionSummary(nutrition: DietChatResult['nutrition']): string | null {
  if (nutrition.length === 0) return null;
  return nutrition
    .map((day) => {
      const kcal =
        kcalText(day.min.kcal) === kcalText(day.max.kcal) ? `${kcalText(day.min.kcal)} kcal` : `${kcalText(day.min.kcal)}–${kcalText(day.max.kcal)} kcal`;
      const macros = `P ${Math.round(day.max.proteinG)} g · C ${Math.round(day.max.carbG)} g · G ${Math.round(day.max.fatG)} g`;
      const label = nutrition.length > 1 ? `${day.label ?? 'Dia'}: ` : '';
      return `${label}${kcal} · ${macros}${day.partial ? ' (alguns itens sem cálculo)' : ''}`;
    })
    .join('\n');
}

const dietHasFoods = (draft: DietDraft) => draft.days.some((d) => d.meals.some((m) => m.groups.some((g) => g.choices.some((c) => c.foods.length > 0))));
const workoutHasExercises = (draft: WorkoutDraft) => draft.days.some((d) => d.exercises.length > 0);
const blockedBy = (problems: string[]) =>
  problems.length > 0 ? `Antes de pedir à IA, corrija no editor: ${problems.slice(0, 3).join(' ')}${problems.length > 3 ? ' …' : ''}` : null;

/** Salvar (criar ou atualizar) e, se pedido, abrir a escolha do paciente. */
function useTemplateSave(kind: TemplateKind, templateId: string | undefined) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState<TemplateSummary | null>(null);
  const basePath = kind === 'diet' ? '/modelos/dietas' : '/modelos/treinos';

  async function save(run: () => Promise<TemplateSummary>, thenApply: boolean) {
    setSaving(true);
    setError(null);
    try {
      const saved = await run();
      await queryClient.invalidateQueries({ queryKey: ['templates', kind] });
      // Só marca como velho: a tela aberta continua com o que está editando.
      await queryClient.invalidateQueries({
        queryKey: ['template', kind, saved.id],
        refetchType: 'none',
      });
      // Modelo novo: a conversa com a IA continua na tela do modelo salvo.
      if (!templateId) moveChat(newTemplateChatKey(kind), saved.id);
      if (thenApply) setApplying(saved);
      else if (!templateId)
        navigate(`${basePath}/${saved.id}`, {
          replace: true,
          state: { saved: true },
        });
      return saved;
    } catch (err) {
      setError(apiErrorMessage(err, 'Não foi possível salvar o modelo. Nada foi alterado.'));
      return null;
    } finally {
      setSaving(false);
    }
  }

  const applyModal = applying ? (
    <ApplyTemplateModal
      kind={kind}
      template={applying}
      onClose={() => {
        setApplying(null);
        if (!templateId)
          navigate(`${basePath}/${applying.id}`, {
            replace: true,
            state: { saved: true },
          });
      }}
      onApplied={(clientId) => navigate(`/clients/${clientId}/${kind === 'diet' ? 'diet' : 'workout'}`, { state: { templateApplied: applying.name } })}
    />
  ) : null;

  return { save, saving, error, applyModal };
}

function DietTemplateForm({ templateId, initialMeta, initialDraft }: { templateId?: string; initialMeta: Meta; initialDraft: DietDraft }) {
  const location = useLocation();
  const [meta, setMeta] = useState(initialMeta);
  const [draft, setDraft] = useState(initialDraft);
  const [chatKey] = useState(() => {
    const key = templateId ?? newTemplateChatKey('diet');
    if (!templateId) forgetChat(key); // modelo novo começa com a conversa em branco
    return key;
  });
  const [problems, setProblems] = useState<string[]>([]);
  const [saved, setSaved] = useState<string | null>((location.state as { saved?: boolean } | null)?.saved ? 'Modelo salvo.' : null);
  const { save, saving, error, applyModal } = useTemplateSave('diet', templateId);
  const [beforeAi, setBeforeAi] = useState<DietDraft | null>(null);

  async function chat(messages: Parameters<typeof api.templateDietChat>[0]) {
    const before = draft;
    const result = await api.templateDietChat(messages, dietHasFoods(before) ? draftToTemplateContent(before, meta.objective) : null);
    if (result.changed && result.content) {
      setBeforeAi(before);
      setDraft(dietTemplateToDraft(result.content, result.foods));
    }
    return {
      reply: result.reply,
      changed: result.changed,
      warnings: result.warnings,
      summary: result.changed ? nutritionSummary(result.nutrition) : null,
    };
  }

  async function submit(thenApply: boolean) {
    const found = [...(meta.name.trim() ? [] : ['Dê um nome ao modelo.']), ...dietDraftProblems(draft)];
    setProblems(found);
    setSaved(null);
    if (found.length > 0) return;
    const input = {
      name: meta.name.trim(),
      description: meta.description.trim() || null,
      content: draftToTemplateContent(draft, meta.objective),
    };
    const result = await save(() => (templateId ? api.updateDietTemplate(templateId, input) : api.createDietTemplate(input)), thenApply);
    if (result && templateId && !thenApply) setSaved('Modelo salvo.');
  }

  return (
    <>
      <TemplateShell
        kind="diet"
        isNew={!templateId}
        meta={meta}
        onMeta={setMeta}
        problems={problems}
        error={error}
        saving={saving}
        notice={saved}
        onSave={() => submit(false)}
        onSaveAndApply={() => submit(true)}
        chat={
          <TemplateAiChat
            kind="diet"
            memoryKey={chatKey}
            send={chat}
            blockedReason={() => (dietHasFoods(draft) ? blockedBy(dietDraftProblems(draft)) : null)}
            canUndo={beforeAi !== null}
            onUndo={() => {
              if (beforeAi) setDraft(beforeAi);
              setBeforeAi(null);
            }}
          />
        }
      >
        <DietProposalEditor draft={draft} onChange={setDraft} allowDays />
      </TemplateShell>
      {applyModal}
    </>
  );
}

function WorkoutTemplateForm({ templateId, initialMeta, initialDraft }: { templateId?: string; initialMeta: Meta; initialDraft: WorkoutDraft }) {
  const location = useLocation();
  const [meta, setMeta] = useState(initialMeta);
  const [draft, setDraft] = useState(initialDraft);
  const [chatKey] = useState(() => {
    const key = templateId ?? newTemplateChatKey('workout');
    if (!templateId) forgetChat(key); // modelo novo começa com a conversa em branco
    return key;
  });
  const [problems, setProblems] = useState<string[]>([]);
  const [saved, setSaved] = useState<string | null>((location.state as { saved?: boolean } | null)?.saved ? 'Modelo salvo.' : null);
  const { save, saving, error, applyModal } = useTemplateSave('workout', templateId);
  const [beforeAi, setBeforeAi] = useState<WorkoutDraft | null>(null);

  async function chat(messages: Parameters<typeof api.templateWorkoutChat>[0]) {
    const before = draft;
    const current = workoutHasExercises(before)
      ? {
          ...(meta.objective.trim() ? { objective: meta.objective.trim() } : {}),
          ...workoutDraftToPayload(before),
        }
      : null;
    const result = await api.templateWorkoutChat(messages, current);
    if (result.changed && result.content) {
      setBeforeAi(before);
      setDraft(workoutTemplateToDraft(result.content, result.exercises));
    }
    return {
      reply: result.reply,
      changed: result.changed,
      warnings: result.warnings,
    };
  }

  async function submit(thenApply: boolean) {
    const found = [
      ...(meta.name.trim() ? [] : ['Dê um nome ao modelo.']),
      ...(draft.days.length === 0 ? ['Adicione pelo menos um dia de treino.'] : []),
      ...workoutDraftProblems(draft),
    ];
    setProblems(found);
    setSaved(null);
    if (found.length > 0) return;
    const content = {
      ...(meta.objective.trim() ? { objective: meta.objective.trim() } : {}),
      ...workoutDraftToPayload(draft),
    };
    const input = {
      name: meta.name.trim(),
      description: meta.description.trim() || null,
      content,
    };
    const result = await save(() => (templateId ? api.updateWorkoutTemplate(templateId, input) : api.createWorkoutTemplate(input)), thenApply);
    if (result && templateId && !thenApply) setSaved('Modelo salvo.');
  }

  return (
    <>
      <TemplateShell
        kind="workout"
        isNew={!templateId}
        meta={meta}
        onMeta={setMeta}
        problems={problems}
        error={error}
        saving={saving}
        notice={saved}
        onSave={() => submit(false)}
        onSaveAndApply={() => submit(true)}
        chat={
          <TemplateAiChat
            kind="workout"
            memoryKey={chatKey}
            send={chat}
            blockedReason={() => (workoutHasExercises(draft) ? blockedBy(workoutDraftProblems(draft)) : null)}
            canUndo={beforeAi !== null}
            onUndo={() => {
              if (beforeAi) setDraft(beforeAi);
              setBeforeAi(null);
            }}
          />
        }
      >
        <WorkoutProposalEditor draft={draft} onChange={setDraft} allowDays />
      </TemplateShell>
      {applyModal}
    </>
  );
}

const EMPTY_META: Meta = { name: '', description: '', objective: '' };

/** /modelos/dietas/novo e /modelos/dietas/:templateId */
export function DietTemplateEditorPage() {
  const { templateId } = useParams<{ templateId: string }>();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['template', 'diet', templateId],
    queryFn: () => api.getDietTemplate(templateId!),
    enabled: !!templateId,
  });

  if (!templateId) return <DietTemplateForm initialMeta={EMPTY_META} initialDraft={emptyDietDraft()} />;
  if (isLoading) return <EmptyState title="Carregando modelo…" />;
  if (isError || !data) return <EmptyState title="Modelo não encontrado" description="Ele pode ter sido excluído." />;
  return (
    <DietTemplateForm
      key={data.id + data.updatedAt}
      templateId={data.id}
      initialMeta={{
        name: data.name,
        description: data.description ?? '',
        objective: data.content.objective ?? '',
      }}
      initialDraft={dietTemplateToDraft(data.content, data.foods)}
    />
  );
}

/** /modelos/treinos/novo e /modelos/treinos/:templateId */
export function WorkoutTemplateEditorPage() {
  const { templateId } = useParams<{ templateId: string }>();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['template', 'workout', templateId],
    queryFn: () => api.getWorkoutTemplate(templateId!),
    enabled: !!templateId,
  });

  if (!templateId) return <WorkoutTemplateForm initialMeta={EMPTY_META} initialDraft={emptyWorkoutDraft()} />;
  if (isLoading) return <EmptyState title="Carregando modelo…" />;
  if (isError || !data) return <EmptyState title="Modelo não encontrado" description="Ele pode ter sido excluído." />;
  return (
    <WorkoutTemplateForm
      key={data.id + data.updatedAt}
      templateId={data.id}
      initialMeta={{
        name: data.name,
        description: data.description ?? '',
        objective: data.content.objective ?? '',
      }}
      initialDraft={workoutTemplateToDraft(data.content, data.exercises)}
    />
  );
}
