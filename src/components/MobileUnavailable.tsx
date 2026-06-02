/**
 * Page affichée sur tablette/mobile pour les vues qui nécessitent un grand écran
 * (Calendrier, Gantt, Semaines).
 */
export function MobileUnavailable({ viewName = 'Cette vue' }: { viewName?: string }) {
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      padding: '40px 24px',
      background: 'var(--bg)',
      textAlign: 'center',
    }}>
      <span style={{ fontSize: 48, lineHeight: 1 }}>🖥️</span>
      <div>
        <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 8px' }}>
          {viewName} nécessite un écran plus large
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
          Ouvrez l'application sur ordinateur ou tablette en mode paysage pour accéder au planning.
        </p>
      </div>
    </div>
  );
}
