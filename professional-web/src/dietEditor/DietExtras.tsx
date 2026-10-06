import { useState } from 'react';
import * as api from '../api/endpoints';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { DietSupplement } from '../types/api';
import styles from './DietStructure.module.css';
import { useDraftEdit } from './draftEdit';
import { SupplementModal, type SupplementValues } from './StructureModals';
import { reorderPatches, supplementQuantityText } from './structure';

/** Suplementação (não exige alimento do catálogo). Somente leitura fora do rascunho. */
export function SupplementsSection({ supplements }: { supplements: DietSupplement[] }) {
  const edit = useDraftEdit();
  const [modal, setModal] = useState<{ type: 'add' } | { type: 'edit' | 'delete'; supplement: DietSupplement } | null>(null);
  if (!edit && supplements.length === 0) return null;

  const payload = (v: SupplementValues) => ({
    name: v.name,
    quantity: v.quantity,
    quantityMax: v.quantityMax,
    unitText: v.unitText,
    timing: v.timing,
    notes: v.notes,
  });

  const move = (from: number, to: number) => {
    if (!edit) return;
    const patches = reorderPatches(supplements, from, to);
    void edit.run(async () => {
      for (const p of patches) await api.updateDietSupplement(edit.ref, p.id, { order: p.order });
    }, 'Não foi possível reordenar a suplementação.');
  };

  return (
    <section aria-label="Suplementação">
      <Card title="Suplementação">
        {supplements.length === 0 ? <div className={styles.muted}>Nenhum suplemento.</div> : null}
        <div>
          {supplements.map((s, i) => (
            <div key={s.id} className={styles.supplement}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</div>
                {supplementQuantityText(s) ? <div style={{ fontSize: 13 }}>{supplementQuantityText(s)}</div> : null}
                {s.timing ? <div className={styles.muted}>{s.timing}</div> : null}
                {s.notes ? <div className={styles.muted}>{s.notes}</div> : null}
              </div>
              {edit ? (
                <div className={styles.actions}>
                  {supplements.length > 1 ? (
                    <>
                      <button type="button" className={styles.iconButton} aria-label={`Mover ${s.name} para cima`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                        ↑
                      </button>
                      <button
                        type="button"
                        className={styles.iconButton}
                        aria-label={`Mover ${s.name} para baixo`}
                        disabled={i === supplements.length - 1}
                        onClick={() => move(i, i + 1)}
                      >
                        ↓
                      </button>
                    </>
                  ) : null}
                  <Button size="small" variant="ghost" aria-label={`Editar ${s.name}`} onClick={() => setModal({ type: 'edit', supplement: s })}>
                    Editar
                  </Button>
                  <Button size="small" variant="ghost" aria-label={`Remover ${s.name}`} onClick={() => setModal({ type: 'delete', supplement: s })}>
                    Remover
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
        {edit ? (
          <div>
            <Button size="small" variant="secondary" onClick={() => setModal({ type: 'add' })}>
              + Suplemento
            </Button>
          </div>
        ) : null}
      </Card>

      {edit && modal?.type === 'add' ? (
        <SupplementModal
          onClose={() => setModal(null)}
          onSubmit={(v) => edit.run(() => api.createDietSupplement(edit.ref, payload(v)), 'Não foi possível adicionar o suplemento.')}
        />
      ) : null}
      {edit && modal?.type === 'edit' ? (
        <SupplementModal
          supplement={modal.supplement}
          onClose={() => setModal(null)}
          onSubmit={(v) => edit.run(() => api.updateDietSupplement(edit.ref, modal.supplement.id, payload(v)), 'Não foi possível salvar o suplemento.')}
        />
      ) : null}
      {edit && modal?.type === 'delete' ? (
        <ConfirmDialog
          title="Remover este suplemento?"
          description={`"${modal.supplement.name}" sai deste rascunho.`}
          confirmLabel="Remover suplemento"
          danger
          onConfirm={() => edit.run(() => api.deleteDietSupplement(edit.ref, modal.supplement.id), 'Não foi possível remover o suplemento.')}
          onClose={() => setModal(null)}
        />
      ) : null}
    </section>
  );
}

/** Orientações AO PACIENTE (`patientGuidelines`) — separadas das observações internas (`notes`). */
export function GuidelinesSection({ guidelines }: { guidelines: string | null | undefined }) {
  const edit = useDraftEdit();
  const [text, setText] = useState(guidelines ?? '');
  const [saving, setSaving] = useState(false);
  if (!edit && !guidelines?.trim()) return null;

  return (
    <section aria-label="Orientações ao paciente">
      <Card title="Orientações ao paciente">
        {edit ? (
          <>
            <textarea
              className={styles.input}
              aria-label="Orientações ao paciente"
              rows={6}
              style={{ resize: 'vertical' }}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ex.: Beber 2,5 L de água por dia…"
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Button
                size="small"
                variant="secondary"
                loading={saving}
                disabled={text === (guidelines ?? '')}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await edit.run(
                      () => api.updateDietVersion(edit.ref.clientId, edit.ref.dietId, edit.ref.versionId, { patientGuidelines: text.trim() ? text : null }),
                      'Não foi possível salvar as orientações.',
                    );
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                Salvar orientações
              </Button>
              <span className={styles.muted}>O paciente vê este texto no aplicativo.</span>
            </div>
          </>
        ) : (
          <div className={styles.guidelines}>{guidelines}</div>
        )}
      </Card>
    </section>
  );
}
