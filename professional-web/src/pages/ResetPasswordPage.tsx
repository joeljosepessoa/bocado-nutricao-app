import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as api from '../api/endpoints';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    setLoading(true);
    try {
      await api.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(
        status === 401
          ? 'Este link de redefinição é inválido ou já expirou. Solicite um novo.'
          : 'Não foi possível redefinir a senha. Verifique os dados informados.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)', padding: 24 }}>
      <div
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: 32,
          width: 380,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-primary-dark)' }}>Bocado de Nutrição</div>
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Redefinir senha</div>
        </div>

        {!token ? (
          <div style={{ fontSize: 14, color: 'var(--color-danger)' }}>
            Link incompleto — faltou o token de redefinição. Solicite um novo link.
          </div>
        ) : done ? (
          <div style={{ fontSize: 14, color: 'var(--color-text)' }}>
            Senha redefinida. Todas as sessões anteriores foram encerradas — entre novamente com a nova senha.
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <TextField label="Nova senha" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} autoFocus />
            <TextField
              label="Confirmar nova senha"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
              A senha precisa ter pelo menos 10 caracteres, com letra e número.
            </div>
            {error ? <div style={{ color: 'var(--color-danger)', fontSize: 13 }}>{error}</div> : null}
            <Button type="submit" loading={loading}>
              Redefinir senha
            </Button>
          </form>
        )}

        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', textAlign: 'center' }}>
          <Link to="/login">Voltar para o login</Link>
        </div>
      </div>
    </div>
  );
}
