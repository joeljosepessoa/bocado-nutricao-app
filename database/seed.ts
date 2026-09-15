import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
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
