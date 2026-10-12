import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../api/endpoints';
import { AuthProvider, useAuth } from '../../auth/AuthContext';
import { authReducer, initialAuthState } from '../../auth/authReducer';
import { SettingsPage } from '../SettingsPage';

vi.mock('../../api/endpoints', () => ({
  login: vi.fn(),
  logout: vi.fn(),
  refresh: vi.fn(),
  updateMyProfile: vi.fn(),
}));

vi.mock('../../api/client', () => ({
  configureAuthHandlers: vi.fn(),
  setAccessToken: vi.fn(),
  cancelProactiveTokenRefresh: vi.fn(),
}));

/** O que o resto do painel mostra (saudação do Dashboard, canto do menu). */
function Greeting() {
  const { user, accessToken } = useAuth();
  return (
    <div>
      <span data-testid="greeting">{user?.fullName}</span>
      <span data-testid="token">{accessToken}</span>
    </div>
  );
}

async function renderLoggedIn() {
  vi.mocked(api.refresh).mockResolvedValue({ accessToken: 'tok-1', user: { id: 'prof-1', email: 'joel@example.com', fullName: 'teste', role: 'professional' } });
  render(
    <AuthProvider>
      <AuthGate />
    </AuthProvider>,
  );
  await screen.findByRole('form', { name: 'Minha conta' });
}

function AuthGate() {
  const { status } = useAuth();
  if (status !== 'authenticated') return null;
  return (
    <>
      <Greeting />
      <SettingsPage />
    </>
  );
}

describe('Configurações — nome da conta do profissional', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('troca "teste" por "Joel": salva pela API e o painel passa a mostrar o nome novo, na mesma sessão', async () => {
    const user = userEvent.setup();
    vi.mocked(api.updateMyProfile).mockResolvedValue({ user: { fullName: 'Joel', email: 'joel@example.com' } });
    await renderLoggedIn();

    const name = screen.getByLabelText('Nome');
    expect(name).toHaveValue('teste');
    expect(screen.getByLabelText('E-mail de acesso')).toHaveValue('joel@example.com');
    expect(screen.getByLabelText('E-mail de acesso')).toBeDisabled();
    // Sem mudança não há o que salvar.
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();

    await user.clear(name);
    await user.type(name, '  Joel ');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(api.updateMyProfile).toHaveBeenCalledWith('Joel'));
    expect(await screen.findByRole('status')).toHaveTextContent('Nome atualizado.');
    expect(screen.getByTestId('greeting')).toHaveTextContent('Joel');
    expect(screen.getByTestId('token')).toHaveTextContent('tok-1');
    expect(name).toHaveValue('Joel');
  });

  it('nome em branco não é enviado; erro do servidor aparece e o nome antigo continua', async () => {
    const user = userEvent.setup();
    await renderLoggedIn();
    const name = screen.getByLabelText('Nome');

    await user.clear(name);
    await user.type(name, '   ');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Informe o seu nome.');
    expect(api.updateMyProfile).not.toHaveBeenCalled();

    vi.mocked(api.updateMyProfile).mockRejectedValue({ response: { data: { message: ['O nome pode ter no máximo 120 caracteres.'] } } });
    await user.clear(name);
    await user.type(name, 'Joel Pessoa');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('O nome pode ter no máximo 120 caracteres.');
    expect(screen.getByTestId('greeting')).toHaveTextContent('teste');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('authReducer — PROFILE_UPDATED', () => {
  it('muda só o nome exibido; sessão, token e demais dados seguem iguais', () => {
    const logged = authReducer(initialAuthState, {
      type: 'LOGIN_SUCCESS',
      user: { id: 'prof-1', email: 'joel@example.com', fullName: 'teste', role: 'professional' },
      accessToken: 'tok',
    });
    expect(authReducer(logged, { type: 'PROFILE_UPDATED', fullName: 'Joel' })).toEqual({
      status: 'authenticated',
      accessToken: 'tok',
      user: { id: 'prof-1', email: 'joel@example.com', fullName: 'Joel', role: 'professional' },
    });
    // Sem sessão não há o que renomear.
    expect(authReducer(initialAuthState, { type: 'PROFILE_UPDATED', fullName: 'Joel' })).toEqual(initialAuthState);
  });
});
