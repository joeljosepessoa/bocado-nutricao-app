import { useState, type FormEvent } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import styles from './AppShell.module.css';
import { useAuth } from '../auth/AuthContext';
import { Icon, type IconName } from '../components/Icon';
import { initials } from '../lib/format';
import logo from '../assets/logo.png';

interface NavItem {
  label: string;
  icon: IconName;
  /** Sem rota: item do novo menu ainda sem tela própria — aparece como "em breve". */
  to?: string;
  end?: boolean;
}

const PROFESSIONAL_NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
  { to: '/clients', label: 'Pacientes', icon: 'users' },
  { label: 'Anamnese', icon: 'clipboard' },
  { label: 'Avaliação', icon: 'ruler' },
  { to: '/agenda', label: 'Agenda', icon: 'calendar' },
  { label: 'Relatórios', icon: 'barChart' },
  { label: 'Inteligência Artificial', icon: 'sparkles' },
  { to: '/plano', label: 'Plano', icon: 'card' },
  { label: 'Configurações', icon: 'settings' },
];

// Fase 15 — mesmo shell, nav diferente por role: admin nunca vê as telas
// clínicas (o backend já barra, isso é só para não oferecer um link morto).
const ADMIN_NAV_ITEMS: NavItem[] = [
  { to: '/admin', label: 'Profissionais', icon: 'users', end: true },
  { to: '/admin/moderation', label: 'Moderação', icon: 'shield' },
  { to: '/admin/metrics', label: 'Métricas', icon: 'barChart' },
];

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const isAdmin = user?.role === 'admin';
  const navItems = isAdmin ? ADMIN_NAV_ITEMS : PROFESSIONAL_NAV_ITEMS;
  const closeDrawer = () => setDrawerOpen(false);

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    const term = search.trim();
    navigate(term ? `/clients?q=${encodeURIComponent(term)}` : '/clients');
  };

  return (
    <div className={styles.shell}>
      {drawerOpen ? <div className={styles.overlay} onClick={closeDrawer} aria-hidden="true" /> : null}

      <aside className={[styles.sidebar, drawerOpen ? styles.sidebarOpen : ''].join(' ')} aria-label="Menu principal">
        <div className={styles.brand}>
          <img src={logo} alt="" className={styles.logo} />
          <div className={styles.brandText}>
            <span className={styles.brandName}>Bocado de Nutrição</span>
            <span className={styles.brandSub}>{isAdmin ? 'Administração' : 'Painel Profissional'}</span>
          </div>
          <button type="button" className={styles.drawerClose} onClick={closeDrawer} aria-label="Fechar menu">
            <Icon name="close" size={18} />
          </button>
        </div>

        <nav className={styles.nav}>
          {navItems.map((item) =>
            item.to ? (
              <NavLink
                key={item.label}
                to={item.to}
                end={item.end}
                onClick={closeDrawer}
                className={({ isActive }) => [styles.navLink, isActive ? styles.navLinkActive : ''].join(' ')}
              >
                <Icon name={item.icon} size={18} />
                <span className={styles.navLabel}>{item.label}</span>
              </NavLink>
            ) : (
              <span key={item.label} className={[styles.navLink, styles.navLinkSoon].join(' ')} aria-disabled="true" title="Em breve">
                <Icon name={item.icon} size={18} />
                <span className={styles.navLabel}>{item.label}</span>
                <span className={styles.srOnly}> (em breve)</span>
              </span>
            ),
          )}
        </nav>

        <div className={styles.userBox}>
          <span className={styles.avatar}>{initials(user?.fullName)}</span>
          <div className={styles.userText}>
            <span className={styles.userName}>{user?.fullName}</span>
            <span className={styles.userRole}>{isAdmin ? 'Administrador' : 'Profissional'}</span>
          </div>
          <button type="button" className={styles.logout} onClick={() => logout()} aria-label="Sair" title="Sair">
            <Icon name="logout" size={18} />
          </button>
        </div>
      </aside>

      <div className={styles.main}>
        <header className={styles.header}>
          <button type="button" className={styles.menuButton} onClick={() => setDrawerOpen(true)} aria-label="Abrir menu">
            <Icon name="menu" size={20} />
          </button>
          {isAdmin ? (
            <div className={styles.headerSpacer} />
          ) : (
            <form className={styles.search} onSubmit={onSearch} role="search">
              <Icon name="search" size={16} />
              <input
                aria-label="Buscar pacientes"
                placeholder="Buscar pacientes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </form>
          )}
          <div className={styles.headerProfile}>
            <span className={styles.avatarSmall}>{initials(user?.fullName)}</span>
            <span className={styles.headerName}>{user?.fullName}</span>
          </div>
        </header>
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
