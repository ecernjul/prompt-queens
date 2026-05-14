import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import styles from "./Sidebar.module.css";

/**
 * Generic, expandable two-level nav model. The first level shows top-level
 * groups; clicking one expands it to reveal its items. This is the same shape
 * the GapQuest sidebar uses for `category → sub-category`, but renamed so it
 * fits any taxonomy (folders, projects, modules, …).
 */
export interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
}

export interface NavItem {
  key: string;
  label: string;
}

interface SidebarProps {
  groups: NavGroup[];
  selectedGroupKey: string | null;
  selectedItemKey: string | null;
  onSelect: (groupKey: string, itemKey: string | null) => void;
  /** Optional secondary section — e.g. "Recent activity". */
  footer?: ReactNode;
  /** Section label for the groups list. */
  groupsLabel?: string;
}

export function Sidebar({
  groups,
  selectedGroupKey,
  selectedItemKey,
  onSelect,
  footer,
  groupsLabel = "Browse",
}: SidebarProps) {
  const [openKey, setOpenKey] = useState<string | null>(selectedGroupKey);

  // Keep the open group in sync with external selection — when state is
  // restored from history or a "recent" list, the matching group should
  // auto-expand without the user having to click it.
  useEffect(() => {
    if (selectedGroupKey) setOpenKey(selectedGroupKey);
  }, [selectedGroupKey]);

  return (
    <aside className={styles.sidebar} aria-label="Browse">
      <div className={styles.section}>
        <div className={styles.sectionTitle}>{groupsLabel}</div>
        <div className={styles.groupList}>
          {groups.map((group) => {
            const isOpen = openKey === group.key;
            return (
              <div key={group.key}>
                <button
                  className={`${styles.groupButton} ${isOpen ? styles.groupButtonOpen : ""}`}
                  aria-expanded={isOpen}
                  onClick={() => {
                    setOpenKey(isOpen ? null : group.key);
                    onSelect(group.key, null);
                  }}
                >
                  <span>{group.label}</span>
                  <span
                    className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`}
                    aria-hidden
                  >
                    ▶
                  </span>
                </button>
                {isOpen && group.items.length > 0 && (
                  <div className={styles.itemList} role="list">
                    {group.items.map((item) => {
                      const isActive =
                        selectedGroupKey === group.key &&
                        selectedItemKey === item.key;
                      return (
                        <button
                          key={item.key}
                          role="listitem"
                          className={`${styles.itemButton} ${isActive ? styles.itemButtonActive : ""}`}
                          onClick={() => onSelect(group.key, item.key)}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {footer && <div className={styles.section}>{footer}</div>}
    </aside>
  );
}
