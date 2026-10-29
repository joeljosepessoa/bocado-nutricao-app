import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import * as api from '../api/endpoints';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { apiErrorMessage } from '../dietEditor/draftEdit';
import type { FormQuestion, FormQuestionType } from '../types/api';
import { changeType, cleanQuestions, formProblems, newQuestion, QUESTION_TYPE_LABELS, QUESTION_TYPES, STARTER_FORMS, starterQuestions } from './formModel';

const input = {
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  padding: '8px 10px',
  font: 'inherit',
  width: '100%',
  boxSizing: 'border-box',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
} as const;
const label = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, minWidth: 0 } as const;

function QuestionEditor({
  q,
  index,
  total,
  onChange,
  onMove,
  onRemove,
}: {
  q: FormQuestion;
  index: number;
  total: number;
  onChange: (q: FormQuestion) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const isChoice = q.type === 'single_choice' || q.type === 'multiple_choice';
  return (
    <li
      aria-label={`Pergunta ${index + 1}`}
      style={{ listStyle: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--color-surface)' }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 13 }}>Pergunta {index + 1}</strong>
        <select aria-label={`Tipo da pergunta ${index + 1}`} style={{ ...input, width: 'auto' }} value={q.type} onChange={(e) => onChange(changeType(q, e.target.value as FormQuestionType))}>
          {QUESTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {QUESTION_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={q.required} onChange={(e) => onChange({ ...q, required: e.target.checked })} /> Obrigatória
        </label>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <Button size="small" variant="ghost" onClick={() => onMove(-1)} disabled={index === 0} aria-label={`Subir pergunta ${index + 1}`}>
            ↑
          </Button>
          <Button size="small" variant="ghost" onClick={() => onMove(1)} disabled={index === total - 1} aria-label={`Descer pergunta ${index + 1}`}>
            ↓
          </Button>
          <Button size="small" variant="ghost" onClick={onRemove} aria-label={`Remover pergunta ${index + 1}`}>
            Remover
          </Button>
        </span>
      </div>
      <input aria-label={`Texto da pergunta ${index + 1}`} style={input} maxLength={300} placeholder="Escreva a pergunta" value={q.label} onChange={(e) => onChange({ ...q, label: e.target.value })} />
      <input
        aria-label={`Explicação da pergunta ${index + 1}`}
        style={{ ...input, fontSize: 13 }}
        maxLength={500}
        placeholder="Explicação (opcional) — ex.: 0 = nenhuma, 10 = muita"
        value={q.help ?? ''}
        onChange={(e) => onChange({ ...q, help: e.target.value })}
      />
      {q.type === 'number' ? (
        <label style={{ ...label, maxWidth: 200 }}>
          Unidade (opcional)
          <input aria-label={`Unidade da pergunta ${index + 1}`} style={input} maxLength={20} placeholder="kg, cm, horas…" value={q.unit ?? ''} onChange={(e) => onChange({ ...q, unit: e.target.value })} />
        </label>
      ) : null}
      {isChoice ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Opções</span>
          {(q.options ?? []).map((o, i) => (
            <div key={i} style={{ display: 'flex', gap: 6 }}>
              <input
                aria-label={`Opção ${i + 1} da pergunta ${index + 1}`}
                style={input}
                maxLength={120}
                value={o}
                onChange={(e) => onChange({ ...q, options: (q.options ?? []).map((x, j) => (j === i ? e.target.value : x)) })}
              />
              <Button size="small" variant="ghost" disabled={(q.options ?? []).length <= 2} onClick={() => onChange({ ...q, options: (q.options ?? []).filter((_, j) => j !== i) })} aria-label={`Remover opção ${i + 1} da pergunta ${index + 1}`}>
                ✕
              </Button>
            </div>
          ))}
          {(q.options ?? []).length < 30 ? (
            <div>
              <Button size="small" variant="secondary" onClick={() => onChange({ ...q, options: [...(q.options ?? []), ''] })}>
                + Opção
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/** Criar (do zero ou de um modelo pronto) e editar formulário próprio. */
export function FormEditorPage() {
  const { formId } = useParams<{ formId: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const editing = !!formId;
  const existing = useQuery({ queryKey: ['custom-form', formId], queryFn: () => api.getForm(formId!), enabled: editing });

  const starter = STARTER_FORMS.find((s) => s.key === params.get('modelo'));
  const [name, setName] = useState(starter?.name ?? '');
  const [description, setDescription] = useState(starter?.description ?? '');
  const [questions, setQuestions] = useState<FormQuestion[]>(() => (starter ? starterQuestions(starter.key) : [newQuestion()]));
  const [problems, setProblems] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(!editing);

  useEffect(() => {
    if (!existing.data || loaded) return;
    setName(existing.data.name);
    setDescription(existing.data.description ?? '');
    setQuestions(existing.data.questions);
    setLoaded(true);
  }, [existing.data, loaded]);

  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), description: description.trim(), questions: cleanQuestions(questions) };
      return editing ? api.updateForm(formId!, body) : api.createForm(body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['custom-forms'] });
      if (formId) void queryClient.invalidateQueries({ queryKey: ['custom-form', formId] });
      navigate('/formularios');
    },
    onError: (err) => setProblems([apiErrorMessage(err, 'Não foi possível salvar o formulário.')]),
  });

  const submit = () => {
    const found = formProblems(name, questions);
    setProblems(found);
    if (found.length === 0) save.mutate();
  };

  const update = (i: number, q: FormQuestion) => setQuestions((list) => list.map((x, j) => (j === i ? q : x)));
  const move = (i: number, delta: -1 | 1) =>
    setQuestions((list) => {
      const next = [...list];
      const [item] = next.splice(i, 1);
      next.splice(i + delta, 0, item);
      return next;
    });

  if (editing && existing.isError) return <EmptyState title="Formulário não encontrado" />;
  if (!loaded) return <EmptyState title="Carregando formulário…" />;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>{editing ? 'Editar formulário' : 'Novo formulário'}</h1>
        <Button variant="ghost" onClick={() => navigate('/formularios')} style={{ marginLeft: 'auto' }}>
          Voltar
        </Button>
      </div>
      {editing && existing.data?.deletedAt ? (
        <div role="status" style={{ fontSize: 13, padding: '8px 12px', borderRadius: 8, background: 'var(--color-primary-light)' }}>
          Este formulário está na lixeira. Restaure na lista para voltar a usar.
        </div>
      ) : null}

      <Card title="Formulário">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 640 }}>
          <label style={label}>
            <strong>Nome</strong>
            <input aria-label="Nome do formulário" style={input} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Check-in semanal" />
          </label>
          <label style={label}>
            <strong>Descrição (opcional)</strong>
            <input aria-label="Descrição do formulário" style={input} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Quando usar este formulário" />
          </label>
          {editing ? (
            <span style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>Mudar as perguntas não altera os formulários já preenchidos nos pacientes.</span>
          ) : null}
        </div>
      </Card>

      <Card title={`Perguntas (${questions.length})`}>
        <ol style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {questions.map((q, i) => (
            <QuestionEditor
              key={q.id}
              q={q}
              index={i}
              total={questions.length}
              onChange={(next) => update(i, next)}
              onMove={(delta) => move(i, delta)}
              onRemove={() => setQuestions((list) => list.filter((_, j) => j !== i))}
            />
          ))}
        </ol>
        {questions.length < 60 ? (
          <div>
            <Button variant="secondary" onClick={() => setQuestions((list) => [...list, newQuestion()])}>
              + Pergunta
            </Button>
          </div>
        ) : null}
      </Card>

      {problems.length > 0 ? (
        <div role="alert" style={{ color: 'var(--color-danger)', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {problems.map((p) => (
            <span key={p}>{p}</span>
          ))}
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 8 }}>
        <Button onClick={submit} loading={save.isPending}>
          {editing ? 'Salvar formulário' : 'Criar formulário'}
        </Button>
        <Button variant="ghost" onClick={() => navigate('/formularios')}>
          Cancelar
        </Button>
      </div>
    </>
  );
}
