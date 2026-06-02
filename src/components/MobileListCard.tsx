import type { CSSProperties, ReactNode } from 'react';

export type CardBadge = { label: string; style?: CSSProperties };
export type CardMeta = { icon?: string; text: ReactNode };

/**
 * Carte empilée pour l'affichage d'une "ligne" de liste sur smartphone.
 * - title : champ principal (gras, tronqué)
 * - badges : badges alignés à droite de la 1re ligne
 * - meta : lignes secondaires atténuées (date, contact, projet…)
 */
export function MobileListCard({
  title,
  badges = [],
  meta = [],
  selected = false,
  onClick,
}: {
  title: ReactNode;
  badges?: CardBadge[];
  meta?: CardMeta[];
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '10px 14px',
        borderBottom: '1px solid var(--border)',
        background: selected
          ? 'color-mix(in srgb, var(--accent) 9%, transparent)'
          : 'transparent',
        cursor: 'pointer',
      }}
    >
      {/* Ligne 1 : titre + badges */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
            flex: 1,
          }}
        >
          {title}
        </span>
        {badges.length > 0 && (
          <span style={{ display: 'flex', gap: 4, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {badges.map((b, i) => (
              <span
                key={i}
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  padding: '1px 6px',
                  borderRadius: 4,
                  whiteSpace: 'nowrap',
                  background: 'color-mix(in srgb, var(--text-muted) 12%, transparent)',
                  color: 'var(--text-muted)',
                  ...b.style,
                }}
              >
                {b.label}
              </span>
            ))}
          </span>
        )}
      </div>

      {/* Lignes meta */}
      {meta.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', marginTop: 4 }}>
          {meta.map((m, i) => (
            <span
              key={i}
              style={{
                fontSize: 10,
                color: 'var(--text-muted)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '100%',
              }}
            >
              {m.icon && <span style={{ marginRight: 3 }}>{m.icon}</span>}
              {m.text}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
