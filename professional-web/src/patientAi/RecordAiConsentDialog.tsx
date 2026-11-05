import { useState } from 'react';
import * as api from '../api/endpoints';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { apiErrorMessage } from '../dietEditor/draftEdit';

type Method = 'whatsapp' | 'paper' | 'in_person';

const METHODS: Array<{ id: Method; label: string }> = [
  { id: 'whatsapp', label: 'Por WhatsApp ou mensagem' },
  { id: 'paper', label: 'Em papel assinado' },
  { id: 'in_person', label: 'Pessoalmente, na consulta' },
];

/**
 * O profissional registra uma autorização que o paciente já deu fora do app. Só libera com a forma
 * escolhida e a declaração marcada; fica gravado que foi registrado por ele.
 */
export function RecordAiConsentDialog({ clientId, clientName, onDone, onClose }: { clientId: string; clientName: string; onDone: () => void; onClose: () => void }) {
  const [method, setMethod] = useState<Method | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!method || !confirmed) return;
    setSaving(true);
    setError(null);
    try {
      await api.recordPatientAiConsent(clientId, method);
      onDone();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, 'Não foi possível registrar agora. Tente de novo.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Registrar autorização do paciente"
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} loading={saving} disabled={!method || !confirmed}>
            Registrar autorização
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14 }}>
        <p style={{ margin: 0 }}>
          Use só se <strong>{clientName}</strong> já autorizou você a usar os dados dele nas análises automáticas (IA). Fica registrado que foi você quem
          marcou, com a data e a forma. O paciente pode desligar quando quiser no app, em Privacidade e dados.
        </p>
        <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <legend style={{ fontWeight: 600, marginBottom: 6 }}>Como o paciente autorizou?</legend>
          {METHODS.map((m) => (
            <label key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
              <input type="radio" name="ai-consent-method" checked={method === m.id} onChange={() => setMethod(m.id)} />
              {m.label}
            </label>
          ))}
        </fieldset>
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} style={{ marginTop: 3 }} />
          <span>Confirmo que o paciente me autorizou e que guardo essa autorização (mensagem ou papel).</span>
        </label>
        {error ? (
          <div role="alert" style={{ color: 'var(--color-danger)', fontSize: 13 }}>
            {error}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
