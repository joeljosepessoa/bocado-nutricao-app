import React, { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import * as api from '../api/endpoints';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';

export function ForgotPasswordPage() {
  const { status } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  if (status === 'authenticated') {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.requestPasswordReset(email);
    } finally {
      // Sempre a mesma resposta na tela, exista ou não o e-mail — o
      // backend já responde igual nos dois casos; a UI segue a mesma regra.
      setLoading(false);
      setSent(true);
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
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Esqueci minha senha</div>
        </div>

        {sent ? (
          <div style={{ fontSize: 14, color: 'var(--color-text)' }}>
            Se esse e-mail estiver cadastrado, você vai receber um link para redefinir sua senha em instantes.
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <TextField label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            <Button type="submit" loading={loading}>
              Enviar link de redefinição
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
