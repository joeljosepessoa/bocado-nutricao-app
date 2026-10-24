import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import * as api from '../api/endpoints';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { apiErrorMessage } from '../dietEditor/draftEdit';
import type { TemplateChatMessage, TemplateKind } from '../types/api';
import styles from './TemplateAiChat.module.css';
import { readChat, writeChat, type ChatBubble } from './chatMemory';

/** O que a tela do modelo devolve depois de aplicar a resposta da IA no editor. */
export interface ChatTurnResult {
  reply: string;
  changed: boolean;
  warnings: string[];
  /** Ex.: "1.780 kcal · P 120 g · C 180 g · G 60 g" (dieta). */
  summary?: string | null;
}

type Bubble = ChatBubble;

const HISTORY_MAX = 30;

const SUGGESTIONS: Record<TemplateKind, string[]> = {
  diet: [
    'Monte uma dieta de 1.800 kcal com 5 refeições para perda de gordura',
    'Dieta de 2.500 kcal para ganho de massa, com dia de treino e dia de descanso',
    'Adicione alternativas de carboidrato no almoço e no jantar',
  ],
  workout: [
    'Treino ABC para hipertrofia, 4 séries de 8 a 12 repetições',
    'Treino full body para iniciante, 3 vezes por semana',
    'Troque os exercícios com barra por halteres',
  ],
};

function httpStatus(err: unknown): number | undefined {
  return (err as { response?: { status?: number } })?.response?.status;
}

/**
 * Conversa com a IA dentro do modelo. Cada pedido vai com o histórico e o modelo como está no editor;
 * quando a IA muda o modelo, a tela aplica no editor (dá para desfazer). Nada é salvo até "Salvar modelo".
 */
export function TemplateAiChat({
  kind,
  memoryKey,
  send,
  blockedReason,
  canUndo,
  onUndo,
}: {
  kind: TemplateKind;
  /** Onde a conversa fica guardada enquanto o painel está aberto (id do modelo, ou "novo-…"). */
  memoryKey: string;
  send: (messages: TemplateChatMessage[]) => Promise<ChatTurnResult>;
  blockedReason: () => string | null;
  canUndo: boolean;
  onUndo: () => void;
}) {
  const [bubbles, setBubbles] = useState<Bubble[]>(() => readChat(memoryKey));
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [needsConsent, setNeedsConsent] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => writeChat(memoryKey, bubbles), [memoryKey, bubbles]);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [bubbles, sending]);

  async function ask(text: string, history: Bubble[]) {
    setSending(true);
    setNotice(null);
    setNeedsConsent(null);
    const messages: TemplateChatMessage[] = [...history.filter((b) => !b.failed), { role: 'professional' as const, text }]
      .map((b) => ({ role: b.role, text: b.text }))
      .slice(-HISTORY_MAX);
    // A conversa enviada precisa começar e terminar com o profissional.
    while (messages.length > 1 && messages[0].role !== 'professional') messages.shift();
    try {
      const result = await send(messages);
      setBubbles((all) => [...all, { role: 'assistant', text: result.reply, warnings: result.warnings, summary: result.summary, changed: result.changed }]);
    } catch (err) {
      const message = apiErrorMessage(err, 'A IA não conseguiu responder agora. Tente de novo.');
      if (httpStatus(err) === 403 && /ativou/.test(message)) {
        setNeedsConsent(text);
        setBubbles((all) => all.slice(0, -1));
        setInput(text);
      } else {
        setBubbles((all) => [...all, { role: 'assistant', text: message, failed: true }]);
      }
    } finally {
      setSending(false);
    }
  }

  function submit(text = input) {
    const message = text.trim();
    if (!message || sending) return;
    const blocked = blockedReason();
    if (blocked) {
      setNotice(blocked);
      return;
    }
    const history = bubbles;
    setBubbles([...history, { role: 'professional', text: message }]);
    setInput('');
    void ask(message, history);
  }

  async function activate() {
    const text = needsConsent;
    if (!text) return;
    await api.acceptProfessionalAiConsent();
    setNeedsConsent(null);
    submit(text);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <aside className={styles.chat} aria-label="Conversa com a IA">
      <div className={styles.chatHeader}>
        <span className={styles.chatTitle}>
          <Icon name="sparkles" size={18} /> Montar com a IA
        </span>
        {canUndo ? (
          <Button size="small" variant="ghost" onClick={onUndo} disabled={sending}>
            Desfazer última mudança
          </Button>
        ) : null}
      </div>

      <div className={styles.messages} ref={listRef} role="log" aria-live="polite">
        {bubbles.length === 0 ? (
          <div className={styles.empty}>
            <span>
              Peça para a IA {kind === 'diet' ? 'montar ou ajustar a dieta' : 'montar ou ajustar o treino'}. O resultado aparece no editor do modelo para você
              conferir.
            </span>
            {SUGGESTIONS[kind].map((suggestion) => (
              <button key={suggestion} type="button" className={styles.suggestion} onClick={() => submit(suggestion)} disabled={sending}>
                {suggestion}
              </button>
            ))}
          </div>
        ) : (
          bubbles.map((bubble, i) => (
            <div key={i} className={[styles.bubble, bubble.role === 'professional' ? styles.mine : bubble.failed ? styles.failed : styles.theirs].join(' ')}>
              {bubble.text}
              {bubble.role === 'assistant' && bubble.changed ? <div className={styles.meta}>✓ Modelo atualizado no editor</div> : null}
              {bubble.summary ? <div className={styles.meta}>{bubble.summary}</div> : null}
              {(bubble.warnings ?? []).map((warning) => (
                <div key={warning} className={styles.warning}>
                  ⚠ {warning}
                </div>
              ))}
            </div>
          ))
        )}
        {sending ? (
          <div className={[styles.bubble, styles.theirs].join(' ')} role="status">
            {kind === 'diet' ? 'Montando a dieta… pode levar até 2 minutos.' : 'Montando o treino… pode levar até 2 minutos.'}
          </div>
        ) : null}
      </div>

      <div className={styles.composer}>
        {notice ? (
          <div role="alert" style={{ fontSize: 12.5, color: 'var(--color-danger)' }}>
            {notice}
          </div>
        ) : null}
        {needsConsent ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5 }}>
            <span>Para usar a IA, ative as ferramentas de IA da sua conta. Nenhum dado de paciente é enviado nesta conversa.</span>
            <div>
              <Button size="small" onClick={activate}>
                Ativar IA para minha conta
              </Button>
            </div>
          </div>
        ) : null}
        <textarea
          aria-label="Mensagem para a IA"
          placeholder={kind === 'diet' ? 'Ex.: troque o lanche da tarde por opções sem lactose' : 'Ex.: aumente o descanso para 90 segundos'}
          value={input}
          maxLength={4000}
          disabled={sending}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className={styles.composerRow}>
          <span className={styles.hint}>Enter envia · Shift+Enter quebra a linha · não escreva dados de paciente</span>
          <Button size="small" onClick={() => submit()} loading={sending} disabled={!input.trim()}>
            Enviar
          </Button>
        </div>
      </div>
    </aside>
  );
}
