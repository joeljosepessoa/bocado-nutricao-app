import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import * as api from '../../api/endpoints';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { StatusBadge } from '../../components/StatusBadge';
import { EmptyState } from '../../components/EmptyState';
import { TextField } from '../../components/TextField';
import { Modal } from '../../components/Modal';

// Assume-se que o cliente tem no máximo uma "Diet" (registro de dietas)
// ativa por vez — a lista existe no backend para o caso raro de mais de
// uma; o painel usa a primeira ativa, ou oferece criar uma se não houver.
export function DietTab() {
  const { clientId } = useParams<{ clientId: string }>();
  const queryClient = useQueryClient();
  const [showAddFood, setShowAddFood] = useState<string | null>(null);

  const { data: dietList, isLoading: loadingList } = useQuery({
    queryKey: ['diets', clientId],
    queryFn: () => api.listDiets(clientId!),
  });
  const dietId = dietList?.items[0]?.id;

  const { data: diet, isLoading: loadingDiet } = useQuery({
    queryKey: ['diet', clientId, dietId],
    queryFn: () => api.getDiet(clientId!, dietId!),
    enabled: !!dietId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['diet', clientId, dietId] });
    queryClient.invalidateQueries({ queryKey: ['diets', clientId] });
  };

  const createDietMutation = useMutation({
    mutationFn: () => api.createDiet(clientId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['diets', clientId] }),
  });

  const publishMutation = useMutation({
    mutationFn: () => api.publishDietVersion(clientId!, dietId!, diet!.currentVersion!.id),
    onSuccess: invalidate,
  });

  const createMealMutation = useMutation({
    mutationFn: (name: string) => api.createMeal(clientId!, dietId!, diet!.currentVersion!.id, { name }),
    onSuccess: invalidate,
  });

  if (loadingList || (dietId && loadingDiet)) {
    return <EmptyState title="Carregando dieta…" />;
  }

  if (!dietId || !diet) {
    return (
      <EmptyState
        title="Nenhuma dieta criada ainda"
        description="Crie a primeira versão para começar a montar as refeições."
        action={<Button onClick={() => createDietMutation.mutate()} loading={createDietMutation.isPending}>Criar dieta</Button>}
      />
    );
  }

  const version = diet.currentVersion;
  const isDraft = version?.status === 'draft';

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2 style={{ fontSize: 17, margin: 0 }}>Dieta — versão {version?.versionNumber}</h2>
          {version ? <StatusBadge status={version.status} /> : null}
        </div>
        {isDraft ? (
          <Button onClick={() => publishMutation.mutate()} loading={publishMutation.isPending}>
            Publicar versão
          </Button>
        ) : null}
      </div>

      {!version ? (
        <EmptyState title="Sem versão em edição" description="Todas as versões foram publicadas ou substituídas." />
      ) : (
        <>
          {version.meals.map((meal) => (
            <Card key={meal.id} title={meal.name}>
              {meal.foods.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Nenhum alimento ainda.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {meal.foods.map((food) => (
                      <tr key={food.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '6px 4px', fontSize: 13.5 }}>{food.food?.name ?? food.foodId}</td>
                        <td style={{ padding: '6px 4px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
                          {food.quantity} {food.unit}
                        </td>
                        <td style={{ padding: '6px 4px', fontSize: 12, color: 'var(--color-text-secondary)' }}>
                          {food.kcal ?? '—'} kcal
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {isDraft ? (
                <Button size="small" variant="ghost" onClick={() => setShowAddFood(meal.id)}>
                  + Alimento
                </Button>
              ) : null}
            </Card>
          ))}

          {isDraft ? <NewMealForm onCreate={(name) => createMealMutation.mutate(name)} loading={createMealMutation.isPending} /> : null}
        </>
      )}

      {showAddFood ? (
        <AddFoodModal
          clientId={clientId!}
          dietId={dietId}
          versionId={version!.id}
          mealId={showAddFood}
          onClose={() => setShowAddFood(null)}
          onAdded={invalidate}
        />
      ) : null}
    </>
  );
}

function NewMealForm({ onCreate, loading }: { onCreate: (name: string) => void; loading: boolean }) {
  const [name, setName] = useState('');
  return (
    <Card>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <TextField label="Nova refeição" placeholder="Ex.: Café da manhã" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button
          onClick={() => {
            if (name.trim()) {
              onCreate(name.trim());
              setName('');
            }
          }}
          loading={loading}
        >
          Adicionar
        </Button>
      </div>
    </Card>
  );
}

function AddFoodModal({
  clientId,
  dietId,
  versionId,
  mealId,
  onClose,
  onAdded,
}: {
  clientId: string;
  dietId: string;
  versionId: string;
  mealId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [search, setSearch] = useState('');
  const [foodId, setFoodId] = useState('');
  const [quantity, setQuantity] = useState('100');
  const [unit, setUnit] = useState('g');

  const { data: foods } = useQuery({ queryKey: ['foods', search], queryFn: () => api.listFoods(search || undefined) });

  const mutation = useMutation({
    mutationFn: () => api.addMealFood(clientId, dietId, versionId, mealId, { foodId, quantity: Number(quantity), unit }),
    onSuccess: () => {
      onAdded();
      onClose();
    },
  });

  return (
    <Modal
      title="Adicionar alimento"
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!foodId}>
            Adicionar
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <TextField label="Buscar alimento" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={foodId} onChange={(e) => setFoodId(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)' }}>
          <option value="">Selecione…</option>
          {(foods ?? []).map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <div style={{ display: 'flex', gap: 8 }}>
          <TextField label="Quantidade" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          <TextField label="Unidade" value={unit} onChange={(e) => setUnit(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
