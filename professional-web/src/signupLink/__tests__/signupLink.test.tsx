import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../api/endpoints';
import { PublicSignupPage } from '../PublicSignupPage';
import { SignupLinkModal } from '../SignupLinkModal';
import { EMPTY_SIGNUP, signupProblems, signupUrl, whatsappText } from '../signupForm';

vi.mock('../../api/endpoints', () => ({
  getPublicSignup: vi.fn(),
  getLegalDocuments: vi.fn(),
  publicSignup: vi.fn(),
  getSignupLink: vi.fn(),
  renewSignupLink: vi.fn(),
  disableSignupLink: vi.fn(),
}));

const DOCS = {
  termsVersion: '1.0',
  privacyVersion: '1.0',
  documents: [
    { kind: 'terms' as const, version: '1.0', title: 'Termos de Uso', updatedAt: '2026-10-26', intro: 'Texto dos termos.', sections: [{ title: '1. Regras', paragraphs: ['Use direito.'] }] },
    { kind: 'privacy' as const, version: '1.0', title: 'Política de Privacidade', updatedAt: '2026-10-26', intro: 'Texto da privacidade.', sections: [] },
  ],
};

const wrap = (ui: React.ReactNode, path = '/') =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/cadastro/:code" element={ui} />
          <Route path="/" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

const VALID = {
  ...EMPTY_SIGNUP,
  fullName: 'Ana Souza',
  email: 'Ana@Exemplo.com',
  emailConfirm: 'ana@exemplo.com ',
  phone: '(11) 98888-7777',
  birthDate: '1990-05-17',
  gender: 'feminino' as const,
  password: 'SenhaBoa123',
  passwordConfirm: 'SenhaBoa123',
  acceptTerms: true,
  acceptPrivacy: true,
};

describe('link de cadastro — regras do formulário', () => {
  it('aceita um cadastro completo e aponta o que falta', () => {
    expect(signupProblems(VALID, '2026-10-29')).toEqual([]);
    expect(signupProblems(EMPTY_SIGNUP, '2026-10-29')).toEqual([
      'Informe seu nome completo (nome e sobrenome).',
      'Informe um e-mail válido.',
      'Informe o celular com DDD.',
      'Informe sua data de nascimento.',
      'Informe seu sexo.',
      'A senha precisa ter pelo menos 10 caracteres, com letra e número.',
      'É preciso aceitar os Termos de Uso.',
      'É preciso confirmar a Política de Privacidade.',
    ]);
    expect(signupProblems({ ...VALID, emailConfirm: 'ana@exemplo.co' }, '2026-10-29')[0]).toContain('Os dois e-mails não são iguais');
    expect(signupProblems({ ...VALID, birthDate: '2026-10-30' }, '2026-10-29')).toEqual(['Data de nascimento inválida.']);
    expect(signupProblems({ ...VALID, passwordConfirm: 'SenhaBoa124' }, '2026-10-29')).toEqual(['As duas senhas não são iguais.']);
  });

  it('monta o link e a mensagem do WhatsApp', () => {
    const url = signupUrl('abc123DEF456', 'https://painel.exemplo.com');
    expect(url).toBe('https://painel.exemplo.com/cadastro/abc123DEF456');
    expect(whatsappText(url)).toContain(url);
  });
});

describe('página pública de cadastro', () => {
  beforeEach(() => {
    vi.mocked(api.getPublicSignup).mockReset().mockResolvedValue({ professionalName: 'Nutri Teste' });
    vi.mocked(api.getLegalDocuments).mockReset().mockResolvedValue(DOCS);
    vi.mocked(api.publicSignup).mockReset().mockResolvedValue({ email: 'ana@exemplo.com', professionalName: 'Nutri Teste' });
  });

  it('preenche, aceita os termos e mostra como entrar no app', async () => {
    wrap(<PublicSignupPage />, '/cadastro/abc123DEF456');
    expect(await screen.findByText('Nutri Teste')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Criar meu cadastro' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Informe seu nome completo');
    expect(api.publicSignup).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('Nome completo'), 'Ana Souza');
    await userEvent.type(screen.getByLabelText('E-mail'), 'Ana@Exemplo.com');
    await userEvent.type(screen.getByLabelText('Confirme o e-mail'), 'ana@exemplo.com');
    await userEvent.type(screen.getByLabelText('Celular com DDD (WhatsApp)'), '11988887777');
    await userEvent.type(screen.getByLabelText('Data de nascimento'), '1990-05-17');
    await userEvent.selectOptions(screen.getByLabelText('Sexo'), 'feminino');
    await userEvent.type(screen.getByLabelText('Crie uma senha'), 'SenhaBoa123');
    await userEvent.type(screen.getByLabelText('Repita a senha'), 'SenhaBoa123');
    await userEvent.click(screen.getAllByRole('button', { name: 'ler' })[0]);
    expect(screen.getByText('Texto dos termos.')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/Li e aceito os Termos de Uso/));
    await userEvent.click(screen.getByLabelText(/Li e estou ciente da Política de Privacidade/));
    await userEvent.click(screen.getByRole('button', { name: 'Criar meu cadastro' }));

    await waitFor(() => expect(api.publicSignup).toHaveBeenCalled());
    expect(vi.mocked(api.publicSignup).mock.calls[0]).toEqual([
      'abc123DEF456',
      {
        fullName: 'Ana Souza',
        email: 'Ana@Exemplo.com',
        password: 'SenhaBoa123',
        birthDate: '1990-05-17',
        phone: '11988887777',
        gender: 'feminino',
        acceptTerms: true,
        acceptPrivacy: true,
        termsVersion: '1.0',
        privacyVersion: '1.0',
      },
    ]);
    expect(await screen.findByText('Cadastro feito! 🎉')).toBeInTheDocument();
    expect(screen.getByText('ana@exemplo.com')).toBeInTheDocument();
  });

  it('link que não vale mais mostra o aviso', async () => {
    vi.mocked(api.getPublicSignup).mockRejectedValue({ response: { status: 404, data: { message: 'Este link de cadastro não existe mais. Peça um link novo ao seu nutricionista.' } } });
    wrap(<PublicSignupPage />, '/cadastro/velho1234567');
    expect(await screen.findByText('Link de cadastro inválido')).toBeInTheDocument();
    expect(screen.getByText(/Peça um link novo/)).toBeInTheDocument();
  });
});

describe('janela do link de cadastro no painel', () => {
  beforeEach(() => {
    vi.mocked(api.getSignupLink).mockReset().mockResolvedValue({ code: null });
    vi.mocked(api.renewSignupLink).mockReset().mockResolvedValue({ code: 'novoCodigo12' });
    vi.mocked(api.disableSignupLink).mockReset().mockResolvedValue({ code: null });
  });

  it('ativa, gera um novo com confirmação e desliga', async () => {
    wrap(<SignupLinkModal onClose={() => undefined} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Ativar link de cadastro' }));
    expect(await screen.findByLabelText('Link de cadastro')).toHaveValue(`${window.location.origin}/cadastro/novoCodigo12`);
    expect(screen.getByRole('link', { name: 'Enviar pelo WhatsApp' }).getAttribute('href')).toContain('https://wa.me/?text=');

    vi.mocked(api.renewSignupLink).mockResolvedValue({ code: 'outroCodigo3' });
    await userEvent.click(screen.getByRole('button', { name: 'Gerar link novo' }));
    expect(screen.getByRole('alert')).toHaveTextContent('O link atual vai parar de funcionar');
    await userEvent.click(screen.getByRole('button', { name: 'Gerar link novo' }));
    expect(await screen.findByLabelText('Link de cadastro')).toHaveValue(`${window.location.origin}/cadastro/outroCodigo3`);

    await userEvent.click(screen.getByRole('button', { name: 'Desligar link' }));
    await userEvent.click(screen.getByRole('button', { name: 'Desligar link' }));
    expect(await screen.findByRole('button', { name: 'Ativar link de cadastro' })).toBeInTheDocument();
    expect(api.disableSignupLink).toHaveBeenCalledTimes(1);
  });
});
