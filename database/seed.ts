import { PlanInterval, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Catálogo de planos (Fase 22) — cadastro interno, sem tela de admin
// nesta fase (fora do escopo pedido). Preço em centavos, sem casas
// decimais flutuantes.
const PLANS = [
  { code: 'starter_monthly', name: 'Starter', priceCents: 4_990, interval: PlanInterval.month, trialDays: 14 },
  { code: 'pro_monthly', name: 'Pro', priceCents: 9_990, interval: PlanInterval.month, trialDays: 14 },
  { code: 'pro_yearly', name: 'Pro (anual)', priceCents: 99_900, interval: PlanInterval.year, trialDays: 14 },
];

async function main() {
  for (const plan of PLANS) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      update: { name: plan.name, priceCents: plan.priceCents, interval: plan.interval, trialDays: plan.trialDays },
      create: plan,
    });
  }

  await prisma.protocol.upsert({
    where: { code: 'jackson_pollock_7' },
    update: {},
    create: {
      code: 'jackson_pollock_7',
      name: 'Jackson & Pollock — 7 dobras',
      description:
        'Densidade corporal por Jackson & Pollock (1978, homens; Jackson, Pollock & Ward, 1980, mulheres), ' +
        'convertida para percentual de gordura pela equação de Siri (1961). Protocolo padrão do Bocado de Nutrição.',
      requiredSkinfoldSites: [
        'chest',
        'axillaryMid',
        'triceps',
        'subscapular',
        'abdominal',
        'suprailiac',
        'thigh',
      ],
      sexSpecific: true,
      version: 1,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
