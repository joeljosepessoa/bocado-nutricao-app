import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import * as api from '../api/endpoints';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import type { DietVersion } from '../types/api';
import { GuidelinesSection, SupplementsSection } from './DietExtras';
import styles from './DietStructure.module.css';
import { DietDaysView } from './DietStructure';
import { DraftEditContext, apiErrorMessage, type DraftEdit } from './draftEdit';
import { structureProblems } from './structure';

interface Props {
  clientId: string;
  dietId: string;
  version: DietVersion;
  onChanged: () => Promise<unknown> | void;
}

/** Editor do RASCUNHO (versão publicada nunca é editada — "Editar dieta" abre um rascunho novo). */
export function DietVersionEditor({ clientId, dietId, version, onChanged }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [objective, setObjective] = useState(version.objective ?? '');
  const [notes, setNotes] = useState(version.notes ?? '');

  const edit = useMemo<DraftEdit>(
    () => ({
      ref: { clientId, dietId, versionId: version.id },
      run: async (action, fallback) => {
        setError(null);
        try {
          await action();
          return true;
        } catch (err) {
          setError(apiErrorMessage(err, fallback));
          return false;
        } finally {
          await onChanged();
        }
      },
    }),
    [clientId, dietId, version.id, onChanged],
  );

  const saveVersion = useMutation({
    mutationFn: () => edit.run(() => api.updateDietVersion(clientId, dietId, version.id, { objective, notes }), 'Não foi possível salvar os dados da dieta.'),
  });

  const days = version.days ?? [];
  const problems = structureProblems(days);

  return (
    <DraftEditContext.Provider value={edit}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {error ? (
          <div role="alert" style={{ fontSize: 13, padding: '8px 12px', borderRadius: 8, color: 'var(--color-danger)', border: '1px solid var(--color-danger)' }}>
            {error}
          </div>
        ) : null}

        <Card title="Dados da dieta">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Objetivo</span>
              <input className={styles.input} value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Ex.: Hipertrofia" />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Observações internas (só o profissional vê)</span>
              <textarea className={styles.input} style={{ resize: 'vertical' }} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            <div>
              <Button size="small" variant="secondary" onClick={() => saveVersion.mutate()} loading={saveVersion.isPending}>
                Salvar dados
              </Button>
            </div>
          </div>
        </Card>

        {problems.length > 0 ? (
          <div className={styles.problems} role="status" aria-label="Pendências para publicar">
            <strong>Pendências para publicar</strong>
            <ul>
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <DietDaysView days={days} />
        <SupplementsSection supplements={version.supplements ?? []} />
        <GuidelinesSection key={version.patientGuidelines ?? ''} guidelines={version.patientGuidelines} />
      </div>
    </DraftEditContext.Provider>
  );
}
