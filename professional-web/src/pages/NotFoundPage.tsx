import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div style={{ fontSize: 18, fontWeight: 700 }}>Página não encontrada</div>
      <Link to="/">Voltar ao início</Link>
    </div>
  );
}
