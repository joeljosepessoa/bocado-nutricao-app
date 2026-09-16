import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

/**
 * Bootstrap do PRIMEIRO admin (Fase 15) — nunca um endpoint HTTP, só este
 * script local. Mesmo custo de bcrypt de PasswordService (backend/src/auth/
 * password.service.ts) e a mesma regra de senha de reset-password.dto.ts.
 *
 * Uso (a partir de backend/):
 *   ADMIN_BOOTSTRAP_EMAIL=admin@bocadodenutricao.com.br \
 *   ADMIN_BOOTSTRAP_PASSWORD='SenhaForte123' \
 *   npm run admin:bootstrap
 *
 * Idempotente por design: se JÁ existir qualquer conta com role=admin, o
 * script não faz nada e não cria uma segunda — não há, nesta fase, nenhuma
 * forma de criar um admin adicional (decisão aprovada: sem endpoint
 * público). Rodar de novo depois que o primeiro admin existe é sempre um
 * no-op seguro.
 */

const BCRYPT_COST = 12;
const PASSWORD_MIN_LENGTH = 10;
const PASSWORD_PATTERN = /(?=.*[A-Za-z])(?=.*\d)/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface BootstrapAdminEnv {
  email?: string;
  password?: string;
  fullName?: string;
}

export interface BootstrapAdminResult {
  created: boolean;
  adminId?: string;
}

export async function bootstrapAdmin(prisma: PrismaClient, env: BootstrapAdminEnv = {}): Promise<BootstrapAdminResult> {
  // Configuração é validada sempre, mesmo quando o resultado prático será
  // um no-op (admin já existe) — um erro de configuração deve ficar visível
  // de imediato, nunca mascarado silenciosamente por já existir um admin.
  const { email, password, fullName = 'Administrador' } = env;
  if (!email || !password) {
    throw new Error(
      'Bootstrap de admin exige ADMIN_BOOTSTRAP_EMAIL e ADMIN_BOOTSTRAP_PASSWORD nas variáveis de ambiente.',
    );
  }
  if (!EMAIL_PATTERN.test(email)) {
    throw new Error('ADMIN_BOOTSTRAP_EMAIL não é um e-mail válido.');
  }
  if (password.length < PASSWORD_MIN_LENGTH || !PASSWORD_PATTERN.test(password)) {
    throw new Error('ADMIN_BOOTSTRAP_PASSWORD deve ter pelo menos 10 caracteres, com letra e número.');
  }

  const existingAdmin = await prisma.user.findFirst({ where: { role: Role.admin } });
  if (existingAdmin) {
    return { created: false };
  }

  const existingEmail = await prisma.user.findUnique({ where: { email } });
  if (existingEmail) {
    throw new Error('Já existe uma conta com o e-mail informado em ADMIN_BOOTSTRAP_EMAIL.');
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const admin = await prisma.user.create({
    data: { email, passwordHash, fullName, role: Role.admin },
  });

  return { created: true, adminId: admin.id };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const result = await bootstrapAdmin(prisma, {
      email: process.env.ADMIN_BOOTSTRAP_EMAIL,
      password: process.env.ADMIN_BOOTSTRAP_PASSWORD,
      fullName: process.env.ADMIN_BOOTSTRAP_NAME,
    });
    console.log(result.created ? 'Conta admin criada com sucesso.' : 'Já existe uma conta admin — nada a fazer.');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
