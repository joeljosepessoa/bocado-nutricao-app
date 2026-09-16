import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import * as api from '../api/endpoints';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';

export function RegisterPage() {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [professionalRegister, setProfessionalRegister] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (status === 'authenticated') {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    setLoading(true);
    try {
      // O cadastro em si não abre sessão (endpoint compartilhado com o
      // mobile, sem cookie) — depois de criar a conta, autentica pelo
      // fluxo web de verdade, igual a um login normal.
      await api.registerProfessional({
        email,
        password,
        fullName,
        professionalRegister: professionalRegister.trim() || undefined,
      });
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      const message = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      const text = Array.isArray(message) ? message[0] : message;
      setError(text ?? 'Não foi possível concluir o cadastro. Verifique os dados informados.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)', padding: 24 }}>
      <form
        onSubmit={handleSubmit}
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
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Criar conta de profissional</div>
        </div>
        <TextField label="Nome completo" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoFocus />
        <TextField label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <TextField
          label="Registro profissional (opcional)"
          value={professionalRegister}
          onChange={(e) => setProfessionalRegister(e.target.value)}
        />
        <TextField
          label="Senha"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={10}
        />
        <TextField
          label="Confirmar senha"
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
          Criar conta
        </Button>
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', textAlign: 'center' }}>
          Já tem conta? <Link to="/login">Entrar</Link>
        </div>
      </form>
    </div>
  );
}
