import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../api/endpoints';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { apiErrorMessage } from '../dietEditor/draftEdit';
import { signupUrl, whatsappText } from './signupForm';

const note = { fontSize: 13, color: 'var(--color-text-secondary)', margin: 0 } as const;

/** Ligar, copiar, mandar pelo WhatsApp, trocar ou desligar o link de cadastro do paciente. */
export function SignupLinkModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: ['signup-link'], queryFn: api.getSignupLink });
  const [confirm, setConfirm] = useState<'renew' | 'disable' | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const done = (value: { code: string | null }) => {
    queryClient.setQueryData(['signup-link'], value);
    setConfirm(null);
    setCopied(false);
    setError(null);
  };
  const renew = useMutation({ mutationFn: api.renewSignupLink, onSuccess: done, onError: (err) => setError(apiErrorMessage(err, 'Não foi possível gerar o link.')) });
  const disable = useMutation({ mutationFn: api.disableSignupLink, onSuccess: done, onError: (err) => setError(apiErrorMessage(err, 'Não foi possível desligar o link.')) });

  const code = data?.code ?? null;
  const url = code ? signupUrl(code) : '';

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      (document.getElementById('signup-link-url') as HTMLInputElement | null)?.select();
    }
  }

  return (
    <Modal title="Link de cadastro do paciente" onClose={onClose} actions={<Button variant="ghost" onClick={onClose}>Fechar</Button>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ margin: 0, fontSize: 14 }}>
          Mande este link para o paciente: ele mesmo preenche nome, e-mail, celular, data de nascimento e cria a senha. O e-mail fica do jeito que ele
          digitou (e confirmou), e ele entra na sua lista de pacientes na hora.
        </p>

        {isLoading ? (
          <p style={note}>Carregando…</p>
        ) : isError ? (
          <p role="alert" style={{ ...note, color: 'var(--color-danger)' }}>
            Não foi possível carregar o link.
          </p>
        ) : !code ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
            <p style={note}>O link está desligado.</p>
            <Button onClick={() => renew.mutate()} loading={renew.isPending}>
              Ativar link de cadastro
            </Button>
          </div>
        ) : (
          <>
            <input
              id="signup-link-url"
              aria-label="Link de cadastro"
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                fontFamily: 'monospace',
                fontSize: 13.5,
                padding: '10px 12px',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                background: 'var(--color-bg)',
                color: 'var(--color-text)',
              }}
            />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button onClick={copy}>{copied ? 'Copiado!' : 'Copiar link'}</Button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(whatsappText(url))}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text)',
                  textDecoration: 'none',
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                Enviar pelo WhatsApp
              </a>
            </div>

            {confirm ? (
              <div role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 10, background: 'var(--color-bg)' }}>
                <span style={{ fontSize: 13.5 }}>
                  {confirm === 'renew'
                    ? 'O link atual vai parar de funcionar e um novo será criado. Quem já se cadastrou continua normalmente.'
                    : 'Ninguém mais consegue se cadastrar pelo link até você ativar de novo. Quem já se cadastrou continua normalmente.'}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  {confirm === 'renew' ? (
                    <Button size="small" onClick={() => renew.mutate()} loading={renew.isPending}>
                      Gerar link novo
                    </Button>
                  ) : (
                    <Button size="small" variant="danger" onClick={() => disable.mutate()} loading={disable.isPending}>
                      Desligar link
                    </Button>
                  )}
                  <Button size="small" variant="ghost" onClick={() => setConfirm(null)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button size="small" variant="secondary" onClick={() => setConfirm('renew')}>
                  Gerar link novo
                </Button>
                <Button size="small" variant="ghost" onClick={() => setConfirm('disable')}>
                  Desligar link
                </Button>
              </div>
            )}
            <p style={note}>
              Quem se cadastrar aparece na lista com o selo “Pelo link” e nos Avisos do início. Se o link chegar a quem não devia, gere um novo: o antigo para
              de funcionar na hora.
            </p>
          </>
        )}
        {error ? (
          <p role="alert" style={{ ...note, color: 'var(--color-danger)' }}>
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
