/**
 * Config de teste unitário — separado de test/jest-e2e.json (que só roda
 * test/*.e2e-spec.ts contra um Postgres real). Primeiro uso: testar
 * S3StorageService com o SDK da AWS mockado, já que não há credencial/
 * infraestrutura S3/R2/MinIO real disponível para testar contra.
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  testEnvironment: 'node',
};
