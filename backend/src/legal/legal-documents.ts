/**
 * Documentos legais vigentes do app do paciente. A versão daqui é independente da versão do app:
 * mudar um texto de forma relevante = subir a versão (ex.: '1.1') — aí todo paciente precisa aceitar
 * de novo (o servidor compara com a versão do último aceite registrado em legal_consents).
 */
export type LegalDocumentKind = 'terms' | 'privacy';

export interface LegalDocumentSection {
  title: string;
  paragraphs: string[];
}

export interface LegalDocument {
  kind: LegalDocumentKind;
  version: string;
  title: string;
  /** Data da versão (AAAA-MM-DD). */
  updatedAt: string;
  intro: string;
  sections: LegalDocumentSection[];
}

export const TERMS_OF_USE: LegalDocument = {
  kind: 'terms',
  version: '1.0',
  title: 'Termos de Uso',
  updatedAt: '2026-10-26',
  intro:
    'Estes Termos explicam como funciona o aplicativo Bocado de Nutrição e as regras para usá-lo. Ao marcar que leu e aceita, você concorda com o que está escrito aqui.',
  sections: [
    {
      title: '1. O que é o aplicativo',
      paragraphs: [
        'O Bocado de Nutrição é o canal entre você e o profissional que faz o seu acompanhamento. Pelo app você vê sua dieta, seus treinos, suas avaliações físicas, seus relatórios e sua evolução, registra informações do dia a dia (como peso, água e treinos realizados) e conversa com seu profissional.',
        'O app não substitui consultas, exames ou atendimento de urgência. Em caso de mal-estar ou emergência, procure um serviço de saúde.',
      ],
    },
    {
      title: '2. Sua conta',
      paragraphs: [
        'O acesso é criado pelo seu profissional. Você é responsável por manter sua senha em segredo e por não compartilhar sua conta com outras pessoas.',
        'Se perceber qualquer uso estranho da sua conta, troque a senha e avise seu profissional.',
      ],
    },
    {
      title: '3. Autorização de uso dos seus dados',
      paragraphs: [
        'Você autoriza o seu profissional a coletar, guardar e usar os seus dados pessoais e de saúde — como anamnese, medidas, peso, dobras cutâneas, composição corporal, fotos de evolução, avaliações físicas, registros de alimentação, água e treinos e as mensagens trocadas no app — para fazer o seu acompanhamento nutricional e de treino, montar e ajustar seu plano e acompanhar a sua evolução ao longo do tempo.',
        'Esses dados são usados somente para o seu acompanhamento. Eles não são vendidos e não são usados para propaganda.',
        'Você pode pedir a qualquer momento uma cópia dos seus dados ou a exclusão da sua conta, pela tela Privacidade e dados.',
      ],
    },
    {
      title: '4. Fotos de evolução',
      paragraphs: [
        'As fotos de evolução servem para comparar o seu corpo ao longo do acompanhamento. Elas ficam guardadas com segurança e são vistas apenas por você e pelo seu profissional. Nunca são publicadas nem usadas em divulgação sem uma autorização separada e por escrito da sua parte.',
        'O compartilhamento das fotos que você mesmo tira no app pode ser ligado ou desligado por você a qualquer momento.',
      ],
    },
    {
      title: '5. Responsabilidades',
      paragraphs: [
        'As orientações de dieta e treino são definidas e revisadas pelo seu profissional. Para que o acompanhamento funcione bem, informe dados verdadeiros e avise sobre mudanças de saúde, medicamentos, alergias ou restrições.',
        'O app pode passar por manutenção ou ficar fora do ar por pouco tempo. Seus dados continuam guardados nesses casos.',
      ],
    },
    {
      title: '6. Encerramento',
      paragraphs: [
        'Você pode parar de usar o app e pedir a exclusão da sua conta quando quiser. Algumas informações podem precisar ser guardadas pelo tempo exigido por lei (por exemplo, registros de atendimento do profissional de saúde).',
      ],
    },
    {
      title: '7. Mudanças nestes Termos',
      paragraphs: [
        'O seu aceite não expira e não precisa ser renovado. Só se estes Termos forem alterados de forma importante o app vai mostrar a nova versão e pedir a sua confirmação.',
      ],
    },
    {
      title: '8. Contato',
      paragraphs: ['Dúvidas sobre estes Termos podem ser enviadas ao seu profissional pela área de Mensagens do app.'],
    },
  ],
};

export const PRIVACY_POLICY: LegalDocument = {
  kind: 'privacy',
  version: '1.0',
  title: 'Política de Privacidade',
  updatedAt: '2026-10-26',
  intro:
    'Esta Política explica quais dados são tratados no Bocado de Nutrição, para quê, com quem são compartilhados e quais são os seus direitos, de acordo com a Lei Geral de Proteção de Dados (Lei 13.709/2018 — LGPD).',
  sections: [
    {
      title: '1. Quais dados tratamos',
      paragraphs: [
        'Dados de cadastro: nome, e-mail, telefone, data de nascimento e sexo.',
        'Dados de saúde e acompanhamento: anamnese, peso, medidas, dobras cutâneas, composição corporal, fotos de evolução, avaliações físicas, plano alimentar, treinos e registros que você faz no app.',
        'Dados de uso: data e hora de acesso, versão do app e informações técnicas necessárias para manter sua conta segura.',
      ],
    },
    {
      title: '2. Para que usamos',
      paragraphs: [
        'Para fazer o seu acompanhamento nutricional e de treino, montar e ajustar o seu plano, acompanhar a sua evolução, gerar seus relatórios, permitir a conversa com o seu profissional, enviar lembretes e avisos que você escolheu receber e manter o app funcionando com segurança.',
        'Dados de saúde são dados sensíveis e são tratados apenas para a prestação do seu acompanhamento, com o seu consentimento.',
      ],
    },
    {
      title: '3. Quem vê os seus dados',
      paragraphs: [
        'Você e o profissional responsável pelo seu acompanhamento. Dados técnicos da avaliação física (como dobras cutâneas e medidas brutas) ficam com o profissional; no app você vê os indicadores que ele liberar.',
      ],
    },
    {
      title: '4. Ferramentas e fornecedores',
      paragraphs: [
        'Para funcionar, o app usa fornecedores de tecnologia contratados, como serviços de hospedagem, armazenamento de arquivos, envio de notificações e processamento de dados. Alguns recursos usam ferramentas automatizadas para organizar informações e preparar resumos que apoiam o trabalho do seu profissional — as decisões sobre o seu plano são sempre do profissional.',
        'Esses fornecedores só acessam o necessário para prestar o serviço e são obrigados a proteger os dados. Alguns podem estar fora do Brasil, sempre com as garantias exigidas pela LGPD.',
      ],
    },
    {
      title: '5. Segurança',
      paragraphs: [
        'Os dados trafegam de forma criptografada, as senhas são guardadas de forma protegida e o acesso é restrito. As fotos e arquivos são abertos por links temporários.',
      ],
    },
    {
      title: '6. Por quanto tempo guardamos',
      paragraphs: [
        'Enquanto durar o seu acompanhamento e, depois disso, pelo tempo exigido por lei ou necessário para o profissional cumprir suas obrigações. Quando você pede a exclusão da conta, seus dados de identificação são removidos do app.',
      ],
    },
    {
      title: '7. Seus direitos',
      paragraphs: [
        'Você pode: confirmar se tratamos seus dados e acessá-los; corrigir dados incompletos ou desatualizados; pedir uma cópia dos seus dados; pedir a exclusão da conta; revogar consentimentos opcionais; e saber com quem os dados são compartilhados.',
        'Na tela Privacidade e dados você baixa uma cópia dos seus dados, gerencia as autorizações opcionais e pode excluir a sua conta. Os demais pedidos podem ser feitos ao seu profissional pela área de Mensagens.',
      ],
    },
    {
      title: '8. Mudanças nesta Política',
      paragraphs: ['Se esta Política mudar de forma importante, o app vai mostrar a nova versão e pedir a sua confirmação.'],
    },
  ],
};

export const CURRENT_LEGAL_DOCUMENTS: Record<LegalDocumentKind, LegalDocument> = {
  terms: TERMS_OF_USE,
  privacy: PRIVACY_POLICY,
};

export const CURRENT_TERMS_VERSION = TERMS_OF_USE.version;
export const CURRENT_PRIVACY_VERSION = PRIVACY_POLICY.version;
