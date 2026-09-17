import { NavLink, Outlet } from 'react-router-dom';
import styles from './AppShell.module.css';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';

const PROFESSIONAL_NAV_ITEMS = [
  { to: '/', label: 'Início', end: true },
  { to: '/clients', label: 'Clientes', end: false },
  { to: '/agenda', label: 'Agenda', end: false },
  { to: '/plano', label: 'Plano', end: false },
];

// Fase 15 — mesmo shell, nav diferente por role: admin nunca vê as telas
// clínicas (o backend já barra, isso é só para não oferecer um link morto).
const ADMIN_NAV_ITEMS = [
  { to: '/admin', label: 'Profissionais', end: true },
  { to: '/admin/moderation', label: 'Moderação', end: false },
  { to: '/admin/metrics', label: 'Métricas', end: false },
];

export function AppShell() {
  const { user, logout } = useAuth();
  const navItems = user?.role === 'admin' ? ADMIN_NAV_ITEMS : PROFESSIONAL_NAV_ITEMS;

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>Bocado de Nutrição{user?.role === 'admin' ? ' — Admin' : ''}</div>
        <nav className={styles.nav}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => [styles.navLink, isActive ? styles.navLinkActive : ''].join(' ')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className={styles.main}>
        <header className={styles.header}>
          <div />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{user?.fullName}</span>
            <Button variant="ghost" size="small" onClick={() => logout()}>
              Sair
            </Button>
          </div>
        </header>
        <div className={styles.content}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
