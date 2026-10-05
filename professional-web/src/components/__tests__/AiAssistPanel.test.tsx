import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../api/endpoints';
import { AiAssistPanel } from '../AiAssistPanel';

vi.mock('../../api/endpoints', () => ({ acceptProfessionalAiConsent: vi.fn() }));

const CLIENT_CONSENT_MESSAGE =
  'O cliente ainda não autorizou o processamento de dados por IA. Peça ao cliente que acesse Privacidade e dados no aplicativo e autorize o uso de inteligência artificial.';

describe('AiAssistPanel — consentimento', () => {
  beforeEach(() => vi.clearAllMocks());

  it('falta o consentimento DA CLIENTE: mostra a orientação e não oferece consentir em nome dela', async () => {
    const user = userEvent.setup();
    const generate = vi.fn().mockRejectedValue({ response: { status: 403, data: { message: CLIENT_CONSENT_MESSAGE } } });
    render(<AiAssistPanel title="Rascunho" helperText="IA" generate={generate} />);

    await user.click(screen.getByRole('button', { name: 'Gerar com IA' }));

    expect(await screen.findByText(CLIENT_CONSENT_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ativar assistente de IA/ })).not.toBeInTheDocument();
    expect(api.acceptProfessionalAiConsent).not.toHaveBeenCalled();
  });

  it('falta a ativação DO PROFISSIONAL: oferece ativar só para a própria conta', async () => {
    const user = userEvent.setup();
    const generate = vi.fn().mockRejectedValue({ response: { status: 403, data: { message: 'Você ainda não ativou as ferramentas de IA para sua conta.' } } });
    render(<AiAssistPanel title="Rascunho" helperText="IA" generate={generate} />);

    await user.click(screen.getByRole('button', { name: 'Gerar com IA' }));
    expect(await screen.findByRole('button', { name: 'Ativar assistente de IA para minha conta' })).toBeInTheDocument();
  });
});
