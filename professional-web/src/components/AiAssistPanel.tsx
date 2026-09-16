import { useState } from 'react';
import { Card } from './Card';
import { Button } from './Button';
import * as api from '../api/endpoints';
import type { AiGenerationResult } from '../types/api';

type Status = 'idle' | 'loading' | 'needsConsent' | 'ready' | 'error';

interface Props {
  title: string;
  helperText: string;
  generate: () => Promise<AiGenerationResult>;
  /** Presente só quando há um campo real para receber o texto (ex.: nota) — explicar/narrar não têm "usar". */
  onUse?: (text: string) => void;
  editable?: boolean;
}

/**
 * Componente único para as 3 funcionalidades aprovadas da Fase 12 — sempre
 * o mesmo ciclo: gerar → visualizar (rotulado "gerado por IA") → editar
 * (quando aplicável) → usar/descartar. Nunca salva nada sozinho.
 */
export function AiAssistPanel({ title, helperText, generate, onUse, editable = false }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [consentReason, setConsentReason] = useState<string | null>(null);
  const [consenting, setConsenting] = useState(false);

  async function handleGenerate() {
    setStatus('loading');
    setError(null);
    try {
      const result = await generate();
      setText(result.text);
      setStatus('ready');
    } catch (err) {
      const httpStatus = (err as { response?: { status?: number } })?.response?.status;
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      if (httpStatus === 403) {
        // A mensagem do backend já diz QUAL consentimento falta (o do
        // profissional ou o do cliente) — nunca reaproveitar um texto fixo
        // aqui, senão "ative sua conta" continua aparecendo depois de já
        // ter sido ativada (bug visto no teste manual desta função).
        setConsentReason(message ?? null);
        setStatus('needsConsent');
        return;
      }
      setError(message ?? 'Não foi possível gerar agora.');
      setStatus('error');
    }
  }

  async function handleActivateConsent() {
    setConsenting(true);
    try {
      await api.acceptProfessionalAiConsent();
      await handleGenerate();
    } finally {
      setConsenting(false);
    }
  }

  return (
    <Card title={title}>
      <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '0 0 8px' }}>{helperText}</p>

      {status === 'idle' || status === 'error' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Button onClick={handleGenerate}>Gerar com IA</Button>
          {error ? <div style={{ color: 'var(--color-danger)', fontSize: 13 }}>{error}</div> : null}
        </div>
      ) : null}

      {status === 'needsConsent' ? (
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ margin: 0 }}>{consentReason ?? 'É necessário consentimento de IA para usar este recurso.'}</p>
          {consentReason?.includes('sua conta') ? (
            <Button onClick={handleActivateConsent} loading={consenting}>
              Ativar assistente de IA para minha conta
            </Button>
          ) : (
            <>
              <p style={{ margin: 0, fontStyle: 'italic' }}>
                O cliente precisa consentir pelo próprio aplicativo — nenhuma ação por aqui resolve isso agora.
              </p>
              <Button variant="ghost" onClick={handleGenerate}>
                Tentar novamente
              </Button>
            </>
          )}
        </div>
      ) : null}

      {status === 'loading' ? <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Gerando…</div> : null}

      {status === 'ready' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-accent)', textTransform: 'uppercase' }}>
            Conteúdo gerado por IA — revise antes de utilizar
          </div>
          {editable ? (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              style={{
                width: '100%',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                padding: 8,
                fontFamily: 'inherit',
                fontSize: 13,
              }}
            />
          ) : (
            <div
              style={{
                fontSize: 13,
                whiteSpace: 'pre-wrap',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                padding: 10,
              }}
            >
              {text}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {onUse ? <Button onClick={() => { onUse(text); setStatus('idle'); }}>Usar este texto</Button> : null}
            <Button variant="secondary" onClick={() => setStatus('idle')}>
              Descartar
            </Button>
            <Button variant="ghost" onClick={handleGenerate}>
              Gerar novamente
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
