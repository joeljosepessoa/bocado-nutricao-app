import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import * as api from '../../api/endpoints';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { StatusBadge } from '../../components/StatusBadge';
import { EmptyState } from '../../components/EmptyState';
import { DietVersionEditor } from '../../dietEditor/DietVersionEditor';
import { DietDaysView } from '../../dietEditor/DietStructure';
import { GuidelinesSection, SupplementsSection } from '../../dietEditor/DietExtras';
import { structureProblems } from '../../dietEditor/structure';
import type { DietVersion } from '../../types/api';

function errorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  if (Array.isArray(message)) return message.join(' ');
  return typeof message === 'string' ? message : fallback;
}

const banner = { fontSize: 13, padding: '8px 12px', borderRadius: 8, background: 'var(--color-primary-light)' } as const;

// O painel trabalha com a dieta ATIVA mais recente do cliente; dieta excluída
// (arquivada) some daqui e do app, mas o histórico fica guardado.
export function DietTab() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const createdByAssistant = (location.state as { assistantCreated?: boolean } | null)?.assistantCreated === true;
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const openAssistant = () => navigate(`/clients/${clientId}/diet/assistant`);

  const { data: dietList, isLoading: loadingList } = useQuery({
    queryKey: ['diets', clientId],
    queryFn: () => api.listDiets(clientId!),
  });
  const dietId = dietList?.items.find((d) => d.status === 'active')?.id;

  const { data: diet, isLoading: loadingDiet } = useQuery({
    queryKey: ['diet', clientId, dietId],
    queryFn: () => api.getDiet(clientId!, dietId!),
    enabled: !!dietId,
  });

  // A API devolve como "atual" a versão publicada; um rascunho aberto ao lado dela é buscado à parte.
  const current = diet?.currentVersion ?? null;
  const draftSummary = diet?.versions.find((v) => v.status === 'draft');
  const draftIsCurrent = !!draftSummary && current?.id === draftSummary.id;
  const { data: separateDraft, isLoading: loadingDraft } = useQuery({
    queryKey: ['diet-version', clientId, dietId, draftSummary?.id],
    queryFn: () => api.getDietVersion(clientId!, dietId!, draftSummary!.id) as Promise<DietVersion>,
    enabled: !!draftSummary && !draftIsCurrent,
  });
  const draft: DietVersion | null = draftSummary ? (draftIsCurrent ? current : (separateDraft ?? null)) : null;
  const published = current?.status === 'published' ? current : null;

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['diet', clientId, dietId] }),
      queryClient.invalidateQueries({ queryKey: ['diet-version', clientId, dietId] }),
      queryClient.invalidateQueries({ queryKey: ['diets', clientId] }),
    ]);

  const createDietMutation = useMutation({
    mutationFn: () => api.createDiet(clientId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['diets', clientId] }),
  });

  // Editar dieta publicada = abrir uma NOVA versão em rascunho (cópia da publicada); a publicada fica intacta.
  const editMutation = useMutation({
    mutationFn: () => api.createDietVersion(clientId!, dietId!),
    onMutate: () => setActionError(null),
    onSuccess: refresh,
    onError: (err) => setActionError(errorMessage(err, 'Não foi possível abrir a edição da dieta.')),
  });

  // A UI confere a estrutura antes (mesmas regras do backend, que continua sendo a autoridade final).
  const publishMutation = useMutation({
    mutationFn: () => api.publishDietVersion(clientId!, dietId!, draft!.id),
    onMutate: () => setActionError(null),
    onSuccess: refresh,
    onError: (err) => setActionError(errorMessage(err, 'Não foi possível publicar a versão.')),
  });

  async function deleteDiet() {
    setActionError(null);
    try {
      await api.archiveDiet(clientId!, dietId!);
      queryClient.removeQueries({ queryKey: ['diet', clientId, dietId] });
      queryClient.removeQueries({ queryKey: ['diet-version', clientId, dietId] });
      await queryClient.invalidateQueries({ queryKey: ['diets', clientId] });
    } catch (err) {
      setActionError(errorMessage(err, 'Não foi possível excluir a dieta.'));
    }
  }

  if (loadingList || (dietId && loadingDiet) || (draftSummary && !draftIsCurrent && loadingDraft)) {
    return <EmptyState title="Carregando dieta…" />;
  }

  if (!dietId || !diet) {
    return (
      <EmptyState
        title="Nenhuma dieta criada ainda"
        description="Monte as refeições manualmente ou organize uma dieta já elaborada com o Assistente."
        action={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Button onClick={() => createDietMutation.mutate()} loading={createDietMutation.isPending}>
              Criar dieta
            </Button>
            <Button variant="secondary" onClick={openAssistant}>
              🤖 Organizar dieta com IA
            </Button>
          </div>
        }
      />
    );
  }

  const shown = draft ?? published;

  return (
    <>
      {createdByAssistant && draft ? (
        <div role="status" style={banner}>
          Dieta criada como rascunho pelo Assistente. Revise e publique quando quiser — nada foi enviado ao paciente.
        </div>
      ) : null}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2 style={{ fontSize: 17, margin: 0 }}>Dieta — versão {shown?.versionNumber}</h2>
          {shown ? <StatusBadge status={shown.status} /> : null}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {draft ? (
            <Button
              onClick={() => {
                const problems = structureProblems(draft.days ?? []);
                if (problems.length > 0) {
                  setActionError(`Corrija antes de publicar: ${problems.join(' ')}`);
                  return;
                }
                publishMutation.mutate();
              }}
              loading={publishMutation.isPending}
            >
              Publicar versão
            </Button>
          ) : (
            <Button onClick={() => editMutation.mutate()} loading={editMutation.isPending}>
              Editar
            </Button>
          )}
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            Excluir
          </Button>
        </div>
      </div>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 220, flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14.5 }}>🤖 Organizar com IA</div>
            <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', marginTop: 2 }}>
              Use a IA para organizar uma dieta já elaborada. A IA não altera quantidades, alimentos ou prescrição — o resultado vira rascunho para você
              revisar.
            </div>
          </div>
          <Button variant="secondary" onClick={openAssistant}>
            Assistente de Dieta
          </Button>
        </div>
      </Card>

      {draft && published ? (
        <div role="status" style={banner}>
          Editando a versão {draft.versionNumber} (rascunho). A versão {published.versionNumber} publicada continua sendo a que o paciente vê até
          você publicar.
        </div>
      ) : null}

      {actionError ? (
        <div role="alert" style={{ fontSize: 13, padding: '8px 12px', borderRadius: 8, color: 'var(--color-danger)', border: '1px solid var(--color-danger)' }}>
          {actionError}
        </div>
      ) : null}

      {draft ? (
        <DietVersionEditor key={draft.id} clientId={clientId!} dietId={dietId} version={draft} onChanged={refresh} />
      ) : published ? (
        <PublishedVersion version={published} />
      ) : (
        <EmptyState title="Sem versão em edição" />
      )}

      {confirmDelete ? (
        <ConfirmDialog
          title="Excluir esta dieta?"
          description="Essa ação removerá esta dieta do painel e do aplicativo do paciente. O histórico de versões é preservado. Deseja continuar?"
          confirmLabel="Excluir dieta"
          danger
          onConfirm={deleteDiet}
          onClose={() => setConfirmDelete(false)}
        />
      ) : null}
    </>
  );
}

/** Versão publicada: só leitura (sem contexto de edição) — alterar passa por "Editar" (novo rascunho). */
function PublishedVersion({ version }: { version: DietVersion }) {
  return (
    <>
      {version.objective || version.notes ? (
        <Card title="Dados da dieta">
          {version.objective ? <div style={{ fontSize: 13.5 }}>Objetivo: {version.objective}</div> : null}
          {version.notes ? <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Observações internas: {version.notes}</div> : null}
        </Card>
      ) : null}
      <DietDaysView days={version.days ?? []} />
      <SupplementsSection supplements={version.supplements ?? []} />
      <GuidelinesSection guidelines={version.patientGuidelines} />
    </>
  );
}
