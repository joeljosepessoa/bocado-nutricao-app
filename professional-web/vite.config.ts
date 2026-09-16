/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Monorepo com npm workspaces: mais de um pacote pode acabar com sua
// própria cópia de react/react-dom em node_modules aninhados. resolve.alias
// força todo mundo a usar exatamente a mesma cópia física (a deste
// workspace) — sem isso, dois React na árvore causam "Invalid hook call".
function localPackageDir(pkg: string): string {
  return fileURLToPath(new URL(`./node_modules/${pkg}`, import.meta.url))
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      react: localPackageDir('react'),
      'react-dom': localPackageDir('react-dom'),
    },
  },
  server: {
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    globals: true,
  },
})
