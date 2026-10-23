import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import * as api from '../api/endpoints';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { apiErrorMessage } from '../dietEditor/draftEdit';
import type { TemplateKind, TemplateSummary } from '../types/api';

const inputStyle = { border: '1px solid var(--color-border)', borderRadius: 8, padding: '8px 10px', font: 'inherit', background: 'var(--color-surface)', color: 'var(--color-text)' } as const;
const fieldStyle = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 } as const;

/** "Salvar como modelo" na aba Dieta/Treino do paciente: copia o que está na tela para a biblioteca. */
export function SaveAsTemplateModal({ kind, clientId, onClose }: { kind: TemplateKind; clientId: string; onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const noun = kind === 'diet' ? 'dieta' : 'treino';
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<TemplateSummary | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const result = await api.createTemplateFromClient(kind, clientId, name.trim(), description.trim() || null);
      await queryClient.invalidateQueries({ queryKey: ['templates', kind] });
      setSaved(result);
    } catch (err) {
      setError(apiErrorMessage(err, 'Não foi possível salvar o modelo.'));
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <Modal
        title="Modelo salvo"
        onClose={onClose}
        actions={
          <>
            <Button variant="ghost" onClick={onClose}>
              Fechar
            </Button>
            <Button onClick={() => navigate(`/modelos/${kind === 'diet' ? 'dietas' : 'treinos'}/${saved.id}`)}>Abrir o modelo</Button>
          </>
        }
      >
        <p style={{ margin: 0 }}>
          "{saved.name}" está na sua biblioteca, em <strong>Modelos</strong>. Agora dá para usar com outros pacientes. A {noun} deste paciente não mudou.
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      title={`Salvar ${noun} como modelo`}
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} loading={saving} disabled={!name.trim()}>
            Salvar modelo
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label style={fieldStyle}>
          <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Nome do modelo *</span>
          <input style={inputStyle} aria-label="Nome do modelo" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label style={fieldStyle}>
          <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Descrição (só você vê)</span>
          <textarea style={inputStyle} aria-label="Descrição" rows={2} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
          Copia a {noun} que está aberta (o rascunho, se houver; senão a publicada). Anotações internas da versão não vão para o modelo.
        </div>
        {error ? (
          <div role="alert" style={{ color: 'var(--color-danger)', fontSize: 13 }}>
            {error}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
