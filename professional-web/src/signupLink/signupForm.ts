export interface SignupValues {
  fullName: string;
  email: string;
  emailConfirm: string;
  phone: string;
  birthDate: string;
  gender: '' | 'masculino' | 'feminino' | 'outro';
  password: string;
  passwordConfirm: string;
  acceptTerms: boolean;
  acceptPrivacy: boolean;
}

export const EMPTY_SIGNUP: SignupValues = {
  fullName: '',
  email: '',
  emailConfirm: '',
  phone: '',
  birthDate: '',
  gender: '',
  password: '',
  passwordConfirm: '',
  acceptTerms: false,
  acceptPrivacy: false,
};

/** Endereço da página pública de cadastro deste painel. */
export const signupUrl = (code: string, origin: string = window.location.origin) => `${origin}/cadastro/${code}`;

/** Mensagem pronta para o WhatsApp com o link. */
export const whatsappText = (url: string) =>
  `Olá! Para começar seu acompanhamento, faça seu cadastro neste link: ${url}\n\n` +
  'Depois é só baixar o app Bocado de Nutrição e entrar com o e-mail e a senha que você criou.';

const EMAIL =/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Hoje no formato do campo de data (horário local). */
export function todayInput(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** O que falta ou está errado, na ordem dos campos. Vazio = pode enviar. */
export function signupProblems(v: SignupValues, today: string = todayInput()): string[] {
  const problems: string[] = [];
  const name = v.fullName.trim().replace(/\s+/g, ' ');
  if (name.length < 3 || !name.includes(' ')) problems.push('Informe seu nome completo (nome e sobrenome).');
  const email = v.email.trim();
  if (!EMAIL.test(email)) problems.push('Informe um e-mail válido.');
  else if (email.toLowerCase() !== v.emailConfirm.trim().toLowerCase()) problems.push('Os dois e-mails não são iguais. Confira com calma: é com ele que você vai entrar no app.');
  if (v.phone.replace(/\D/g, '').length < 10) problems.push('Informe o celular com DDD.');
  if (!v.birthDate) problems.push('Informe sua data de nascimento.');
  else if (v.birthDate > today || v.birthDate < '1900-01-01') problems.push('Data de nascimento inválida.');
  if (!v.gender) problems.push('Informe seu sexo.');
  if (v.password.length < 10 || !/[A-Za-z]/.test(v.password) || !/\d/.test(v.password)) problems.push('A senha precisa ter pelo menos 10 caracteres, com letra e número.');
  else if (v.password !== v.passwordConfirm) problems.push('As duas senhas não são iguais.');
  if (!v.acceptTerms) problems.push('É preciso aceitar os Termos de Uso.');
  if (!v.acceptPrivacy) problems.push('É preciso confirmar a Política de Privacidade.');
  return problems;
}
