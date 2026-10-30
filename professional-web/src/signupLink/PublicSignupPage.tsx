import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import * as api from '../api/endpoints';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { apiErrorMessage } from '../dietEditor/draftEdit';
import type { LegalDocument } from '../types/api';
import { EMPTY_SIGNUP, signupProblems, todayInput, type SignupValues } from './signupForm';

function Frame({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', padding: '24px 16px', boxSizing: 'border-box', display: 'flex', justifyContent: 'center' }}>
      <main
        style={{
          width: '100%',
          maxWidth: 460,
          alignSelf: 'flex-start',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: 'clamp(20px, 5vw, 32px)',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-primary-dark)' }}>Bocado de Nutrição</div>
        {children}
      </main>
    </div>
  );
}

function DocumentText({ doc }: { doc: LegalDocument }) {
  return (
    <div
      style={{
        maxHeight: 260,
        overflowY: 'auto',
        fontSize: 13,
        lineHeight: 1.5,
        padding: 12,
        borderRadius: 8,
        background: 'var(--color-bg)',
        color: 'var(--color-text)',
      }}
    >
      <p style={{ margin: '0 0 8px' }}>{doc.intro}</p>
      {doc.sections.map((section) => (
        <div key={section.title}>
          <strong>{section.title}</strong>
          {section.paragraphs.map((p) => (
            <p key={p} style={{ margin: '4px 0 8px' }}>
              {p}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}

function Consent({ checked, onChange, label, doc }: { checked: boolean; onChange: (v: boolean) => void; label: string; doc?: LegalDocument }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14 }}>
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 3 }} />
        <span>
          {label}
          {doc ? (
            <>
              {' '}
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                style={{ border: 0, padding: 0, background: 'none', color: 'var(--color-primary-dark)', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}
              >
                {open ? 'fechar' : 'ler'}
              </button>
            </>
          ) : null}
        </span>
      </label>
      {open && doc ? <DocumentText doc={doc} /> : null}
    </div>
  );
}

const select = {
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  padding: '8px 10px',
  fontSize: 14,
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
} as const;

/** /cadastro/:code — página pública: o paciente cria a própria conta no link do profissional. */
export function PublicSignupPage() {
  const { code = '' } = useParams<{ code: string }>();
  const link = useQuery({ queryKey: ['public-signup', code], queryFn: () => api.getPublicSignup(code), retry: false });
  const legal = useQuery({ queryKey: ['legal-documents'], queryFn: api.getLegalDocuments, retry: 1 });
  const [values, setValues] = useState<SignupValues>(EMPTY_SIGNUP);
  const [problems, setProblems] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<{ email: string; professionalName: string } | null>(null);

  const set = <K extends keyof SignupValues>(key: K, value: SignupValues[K]) => setValues((v) => ({ ...v, [key]: value }));
  const terms = legal.data?.documents.find((d) => d.kind === 'terms');
  const privacy = legal.data?.documents.find((d) => d.kind === 'privacy');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const found = signupProblems(values);
    if (!legal.data) found.push('Não foi possível carregar os Termos de Uso. Recarregue a página.');
    setProblems(found);
    if (found.length > 0 || !legal.data) return;
    setSending(true);
    try {
      const result = await api.publicSignup(code, {
        fullName: values.fullName.trim(),
        email: values.email.trim(),
        password: values.password,
        birthDate: values.birthDate,
        phone: values.phone.trim(),
        gender: values.gender || undefined,
        acceptTerms: true,
        acceptPrivacy: true,
        termsVersion: legal.data.termsVersion,
        privacyVersion: legal.data.privacyVersion,
      });
      setDone(result);
    } catch (err) {
      setProblems([apiErrorMessage(err, 'Não foi possível fazer o cadastro agora. Tente de novo em alguns minutos.')]);
    } finally {
      setSending(false);
    }
  }

  if (link.isLoading) {
    return (
      <Frame>
        <p style={{ margin: 0 }}>Carregando…</p>
      </Frame>
    );
  }
  if (link.isError || !link.data) {
    return (
      <Frame>
        <h1 style={{ fontSize: 18, margin: 0 }}>Link de cadastro inválido</h1>
        <p style={{ margin: 0, fontSize: 14 }}>
          {apiErrorMessage(link.error, 'Este link de cadastro não existe mais. Peça um link novo ao seu nutricionista.')}
        </p>
      </Frame>
    );
  }
  if (done) {
    return (
      <Frame>
        <h1 style={{ fontSize: 20, margin: 0 }}>Cadastro feito! 🎉</h1>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>
          Agora você já faz parte dos pacientes de <strong>{done.professionalName}</strong>.
        </p>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>
          Baixe o app <strong>Bocado de Nutrição</strong> e entre com o e-mail <strong style={{ overflowWrap: 'anywhere' }}>{done.email}</strong> e a senha que
          você acabou de criar. Se ainda não tem o app, peça o link de instalação ao seu nutricionista.
        </p>
      </Frame>
    );
  }

  return (
    <Frame>
      <div>
        <h1 style={{ fontSize: 18, margin: 0 }}>Seu cadastro</h1>
        <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--color-text-secondary)' }}>
          Acompanhamento com <strong style={{ color: 'var(--color-text)' }}>{link.data.professionalName}</strong>
        </p>
      </div>
      <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <TextField label="Nome completo" autoComplete="name" value={values.fullName} onChange={(e) => set('fullName', e.target.value)} />
        <TextField label="E-mail" type="email" autoComplete="email" inputMode="email" value={values.email} onChange={(e) => set('email', e.target.value)} />
        <TextField
          label="Confirme o e-mail"
          type="email"
          autoComplete="off"
          inputMode="email"
          value={values.emailConfirm}
          onChange={(e) => set('emailConfirm', e.target.value)}
          onPaste={(e) => e.preventDefault()}
        />
        <TextField label="Celular com DDD (WhatsApp)" type="tel" autoComplete="tel" inputMode="tel" value={values.phone} onChange={(e) => set('phone', e.target.value)} />
        <TextField label="Data de nascimento" type="date" max={todayInput()} value={values.birthDate} onChange={(e) => set('birthDate', e.target.value)} />
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>Sexo</span>
          <select style={select} value={values.gender} onChange={(e) => set('gender', e.target.value as SignupValues['gender'])}>
            <option value="">Escolha…</option>
            <option value="feminino">Feminino</option>
            <option value="masculino">Masculino</option>
            <option value="outro">Outro</option>
          </select>
        </label>
        <TextField label="Crie uma senha" type="password" autoComplete="new-password" value={values.password} onChange={(e) => set('password', e.target.value)} />
        <TextField label="Repita a senha" type="password" autoComplete="new-password" value={values.passwordConfirm} onChange={(e) => set('passwordConfirm', e.target.value)} />
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: -6 }}>Pelo menos 10 caracteres, com letra e número.</div>

        <Consent checked={values.acceptTerms} onChange={(v) => set('acceptTerms', v)} label="Li e aceito os Termos de Uso." doc={terms} />
        <Consent checked={values.acceptPrivacy} onChange={(v) => set('acceptPrivacy', v)} label="Li e estou ciente da Política de Privacidade." doc={privacy} />

        {problems.length > 0 ? (
          <ul role="alert" style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--color-danger)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : null}
        <Button type="submit" loading={sending}>
          Criar meu cadastro
        </Button>
      </form>
    </Frame>
  );
}
