import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext';
import * as api from '../../api/endpoints';
import { cancelProactiveTokenRefresh, setAccessToken } from '../../api/client';
import { clearAllEvaluationDrafts } from '../../utils/evaluationDraft';
import type { WebSession } from '../../types/api';

vi.mock('../../api/endpoints', () => ({
  login: vi.fn(),
  logout: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('../../api/client', () => ({
  configureAuthHandlers: vi.fn(),
  setAccessToken: vi.fn(),
  cancelProactiveTokenRefresh: vi.fn(),
}));

vi.mock('../../utils/evaluationDraft', () => ({
  clearAllEvaluationDrafts: vi.fn(),
}));

function Consumer() {
  const { status, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <button onClick={() => login('prof@example.com', 'senha123')}>entrar</button>
      <button onClick={() => logout()}>sair</button>
    </div>
  );
}

function makeSession(): WebSession {
  return {
    user: { id: 'prof-1', email: 'prof@example.com', fullName: 'Profissional Teste', role: 'professional' },
    accessToken: 'access-token',
  };
}

describe('AuthContext — logout limpa rascunhos e cancela renovação proativa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.refresh).mockRejectedValue(new Error('sem sessão'));
  });

  afterEach(() => {
    cleanup();
  });

  it('logout chama clearAllEvaluationDrafts e cancelProactiveTokenRefresh', async () => {
    vi.mocked(api.login).mockResolvedValue(makeSession());
    vi.mocked(api.logout).mockResolvedValue(undefined);

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));

    fireEvent.click(screen.getByText('entrar'));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));

    fireEvent.click(screen.getByText('sair'));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));

    expect(clearAllEvaluationDrafts).toHaveBeenCalledTimes(1);
    expect(cancelProactiveTokenRefresh).toHaveBeenCalled();
    expect(setAccessToken).toHaveBeenCalledWith(null);
  });

  it('cancela o timer de renovação proativa ao desmontar o AuthProvider', async () => {
    const { unmount } = render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));
    vi.mocked(cancelProactiveTokenRefresh).mockClear();

    unmount();

    expect(cancelProactiveTokenRefresh).toHaveBeenCalledTimes(1);
  });
});
