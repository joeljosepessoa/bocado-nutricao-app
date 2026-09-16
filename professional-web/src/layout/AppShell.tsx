import { NavLink, Outlet } from 'react-router-dom';
import styles from './AppShell.module.css';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';

const NAV_ITEMS = [
  { to: '/', label: 'Início', end: true },
  { to: '/clients', label: 'Clientes', end: false },
];

export function AppShell() {
  const { user, logout } = useAuth();

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>Bocado de Nutrição</div>
        <nav className={styles.nav}>
          {NAV_ITEMS.map((item) => (
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
