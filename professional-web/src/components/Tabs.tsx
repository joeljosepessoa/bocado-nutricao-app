import styles from './Tabs.module.css';

export interface TabItem {
  key: string;
  label: string;
}

export function Tabs({ items, activeKey, onChange }: { items: TabItem[]; activeKey: string; onChange: (key: string) => void }) {
  return (
    <div className={styles.row}>
      {items.map((item) => (
        <button
          key={item.key}
          className={[styles.tab, item.key === activeKey ? styles.tabActive : ''].join(' ')}
          onClick={() => onChange(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
