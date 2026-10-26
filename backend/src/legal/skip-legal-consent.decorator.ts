import { SetMetadata } from '@nestjs/common';

export const SKIP_LEGAL_CONSENT_KEY = 'skipLegalConsent';

/**
 * Rota que o paciente pode usar ANTES de aceitar os Termos/Política vigentes: ler e aceitar os
 * documentos, sair, trocar a senha, baixar os próprios dados e excluir a conta (direitos da LGPD
 * não dependem do aceite).
 */
export const SkipLegalConsent = () => SetMetadata(SKIP_LEGAL_CONSENT_KEY, true);
