import type { Request } from 'express';
import type { RequestMeta } from './refresh-token.service';

export function extractMeta(req: Request): RequestMeta {
  return { userAgent: req.headers['user-agent'], ipAddress: req.ip };
}

// Limite baixo por padrão (produção); testes e2e sobem esse teto via
// AUTH_THROTTLE_LIMIT para não travar a própria suíte. Compartilhado pelos
// controllers de auth mobile e web — o mesmo motivo vale para os dois.
export const AUTH_THROTTLE_LIMIT = Number(process.env.AUTH_THROTTLE_LIMIT ?? 5);
