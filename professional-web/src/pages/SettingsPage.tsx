import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { TextField } from '../components/TextField';

const MAX_NAME_LENGTH = 120;

function errorMessage(err: unknown): string {
  const message = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  if (Array.isArray(message)) return message.join(' ');
  return typeof message === 'string' ? message : 'Não foi possível salvar. Tente de novo.';
}

/**
 * Configurações da conta do profissional. Por ora, o nome que aparece no
 * painel, nos relatórios e para os pacientes. O e-mail é o login e não muda
 * por aqui; pacientes, dietas e treinos da conta não são tocados.
 */
export function SettingsPage() {
  const { user, updateProfile } = useAuth();
  const [name, setName] = useState(user?.fullName ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const trimmed = name.replace(/\s+/g, ' ').trim();
  const changed = trimmed !== (user?.fullName ?? '');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaved(false);
    if (!trimmed) {
      setError('Informe o seu nome.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateProfile(trimmed);
      setName(trimmed);
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
      <h1 style={{ fontSize: 22, margin: 0 }}>Configurações</h1>
      <Card title="Minha conta">
        <form onSubmit={submit} aria-label="Minha conta" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <TextField
            label="Nome"
            value={name}
            maxLength={MAX_NAME_LENGTH}
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
            }}
          />
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>É o nome que aparece no painel, nos relatórios e para os seus pacientes.</div>
          <TextField label="E-mail de acesso" value={user?.email ?? ''} readOnly disabled />
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>O e-mail é o seu login e não pode ser alterado por aqui.</div>
          {error ? (
            <div role="alert" style={{ color: 'var(--color-danger)', fontSize: 13 }}>
              {error}
            </div>
          ) : null}
          {saved ? (
            <div role="status" style={{ color: 'var(--color-success)', fontSize: 13 }}>
              Nome atualizado.
            </div>
          ) : null}
          <div>
            <Button type="submit" loading={saving} disabled={!changed}>
              Salvar
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
