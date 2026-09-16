import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

interface Props {
  children: React.ReactNode;
  // Fase 15: /auth/web/login agora também aceita role=admin (antes só
  // professional), então uma sessão autenticada nem sempre é a de um
  // profissional. Sem esse filtro, um admin cairia nas telas do painel
  // clínico (e receberia 403 do backend em cada chamada) e vice-versa.
  requireRole?: 'professional' | 'admin';
}

export function ProtectedRoute({ children, requireRole }: Props) {
  const { status, user } = useAuth();

  if (status === 'loading') {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        Carregando…
      </div>
    );
  }
  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }
  if (requireRole && user?.role !== requireRole) {
    return <Navigate to={user?.role === 'admin' ? '/admin' : '/'} replace />;
  }
  return <>{children}</>;
}
