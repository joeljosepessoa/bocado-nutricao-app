import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import * as api from '../api/endpoints';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { apiErrorMessage } from '../dietEditor/draftEdit';
import { formatDate } from '../lib/format';
import type { FormAnswers, FormQuestion } from '../types/api';
import { AnswerInput } from './AnswerInput';
import { answerText, missingRequired } from './formModel';

const todayInput = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dateInputOf = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** Meio-dia no horário local: a data não "muda de dia" ao virar UTC. */
const isoOfDateInput = (value: string) => new Date(`${value}T12:00:00`).toISOString();

function QuestionBlock({ q, index, children }: { q: FormQuestion; index: number; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 12, borderBottom: '1px solid var(--color-border)' }}>
      <div style={{ fontWeight: 600, fontSize: 14 }}>
        {index + 1}. {q.label}
        {q.required ? <span style={{ color: 'var(--color-danger)' }}> *</span> : null}
      </div>
      {q.help ? <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>{q.help}</div> : null}
      {children}
    </div>
  );
}

/**
 * Preencher um formulário para o paciente (…/forms/new?form=ID) ou ver/corrigir um já preenchido
 * (…/forms/:responseId). Quem preenche é o profissional, na consulta.
 */
export function FormFillPage() {
  const { clientId, responseId } = useParams<{ clientId: string; responseId: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isNew = !responseId;
  const formId = params.get('form');

  const form = useQuery({ queryKey: ['custom-form', formId], queryFn: () => api.getForm(formId!), enabled: isNew && !!formId });
  const response = useQuery({ queryKey: ['form-response', clientId, responseId], queryFn: () => api.getFormResponse(clientId!, responseId!), enabled: !isNew });

  const [editing, setEditing] = useState(isNew);
  const [answers, setAnswers] = useState<FormAnswers>({});
  const [date, setDate] = useState(todayInput());
  const [problems, setProblems] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const questions: FormQuestion[] = (isNew ? form.data?.questions : response.data?.questions) ?? [];
  const title = (isNew ? form.data?.name : response.data?.formName) ?? 'Formulário';
  const back = () => navigate(`/clients/${clientId}`);

  // Depois de criar, a rota muda de …/new para …/:responseId na mesma tela: volta ao modo leitura.
  useEffect(() => {
    setEditing(!responseId);
    setProblems([]);
  }, [responseId]);

  useEffect(() => {
    if (response.data) {
      setAnswers(response.data.answers);
      setDate(dateInputOf(response.data.filledAt));
    }
  }, [response.data]);

  const save = useMutation({
    mutationFn: () =>
      isNew
        ? api.createFormResponse(clientId!, { formId: formId!, answers, filledAt: isoOfDateInput(date) })
        : api.updateFormResponse(clientId!, responseId!, { answers, filledAt: isoOfDateInput(date) }),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['form-responses', clientId] });
      void queryClient.invalidateQueries({ queryKey: ['custom-forms'] });
      queryClient.setQueryData(['form-response', clientId, saved.id], saved);
      if (isNew) navigate(`/clients/${clientId}/forms/${saved.id}`, { replace: true });
      else setEditing(false);
    },
    onError: (err) => setProblems([apiErrorMessage(err, 'Não foi possível salvar o formulário.')]),
  });

  const submit = () => {
    const missing = missingRequired(questions, answers);
    const found = missing.map((q) => `Responda: ${q.label}`);
    if (!date) found.push('Informe a data.');
    setProblems(found);
    if (found.length === 0) save.mutate();
  };

  if (isNew && !formId) return <EmptyState title="Escolha um formulário na Visão geral do paciente." />;
  if ((isNew && form.isLoading) || (!isNew && response.isLoading)) return <EmptyState title="Carregando formulário…" />;
  if ((isNew && form.isError) || (!isNew && response.isError)) return <EmptyState title="Formulário não encontrado" />;

  return (
    <>
      <Card title={title}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
          {editing ? (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              Data
              <input
                type="date"
                aria-label="Data do preenchimento"
                value={date}
                max={todayInput()}
                onChange={(e) => setDate(e.target.value)}
                style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '6px 8px', font: 'inherit' }}
              />
            </label>
          ) : (
            <span style={{ color: 'var(--color-text-secondary)' }}>Preenchido em {formatDate(response.data?.filledAt)}</span>
          )}
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            {!editing ? (
              <>
                <Button size="small" variant="secondary" onClick={() => setEditing(true)}>
                  Editar respostas
                </Button>
                <Button size="small" variant="ghost" onClick={() => setConfirmDelete(true)}>
                  Excluir
                </Button>
              </>
            ) : null}
            <Button size="small" variant="ghost" onClick={back}>
              Voltar
            </Button>
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
          {questions.map((q, i) => (
            <QuestionBlock key={q.id} q={q} index={i}>
              {editing ? (
                <AnswerInput q={q} value={answers[q.id]} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: typeof v === 'function' ? v(a[q.id]) : v }))} />
              ) : (
                <div style={{ fontSize: 14, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{answerText(q, answers[q.id])}</div>
              )}
            </QuestionBlock>
          ))}
        </div>

        {problems.length > 0 ? (
          <div role="alert" style={{ color: 'var(--color-danger)', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {problems.map((p) => (
              <span key={p}>{p}</span>
            ))}
          </div>
        ) : null}
        {editing ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={submit} loading={save.isPending}>
              Salvar
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                if (isNew) back();
                else {
                  setAnswers(response.data?.answers ?? {});
                  setDate(response.data ? dateInputOf(response.data.filledAt) : todayInput());
                  setProblems([]);
                  setEditing(false);
                }
              }}
            >
              Cancelar
            </Button>
          </div>
        ) : null}
      </Card>

      {confirmDelete ? (
        <ConfirmDialog
          title="Excluir formulário preenchido"
          description={`As respostas de “${title}” deste paciente serão apagadas. Não dá para desfazer.`}
          confirmLabel="Excluir"
          danger
          onConfirm={async () => {
            await api.deleteFormResponse(clientId!, responseId!);
            await queryClient.invalidateQueries({ queryKey: ['form-responses', clientId] });
            back();
          }}
          onClose={() => setConfirmDelete(false)}
        />
      ) : null}
    </>
  );
}
