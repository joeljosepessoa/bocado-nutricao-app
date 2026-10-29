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

  // Mesmos protocolos que a migration 20261029150000_more_skinfold_protocols cadastra.
  const MORE_PROTOCOLS = [
    { code: 'jackson_pollock_3', name: 'Jackson & Pollock — 3 dobras', sites: ['chest', 'abdominal', 'thigh', 'triceps', 'suprailiac'], sexSpecific: true },
    { code: 'guedes_3', name: 'Guedes — 3 dobras', sites: ['triceps', 'suprailiac', 'abdominal', 'thigh', 'subscapular'], sexSpecific: true },
    { code: 'durnin_womersley_4', name: 'Durnin & Womersley — 4 dobras', sites: ['biceps', 'triceps', 'subscapular', 'suprailiac'], sexSpecific: true },
    { code: 'faulkner_4', name: 'Faulkner — 4 dobras', sites: ['triceps', 'subscapular', 'suprailiac', 'abdominal'], sexSpecific: false },
  ];
  for (const p of MORE_PROTOCOLS) {
    await prisma.protocol.upsert({
      where: { code: p.code },
      update: {},
      create: { code: p.code, name: p.name, description: p.name, requiredSkinfoldSites: p.sites, sexSpecific: p.sexSpecific, version: 1 },
    });
  }
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
