import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { fetchPageBlocks } from '../notionService';
import type { NotionBlock, NotionRichText } from '../types';

// ── Context (token + todo handler propagés à tous les sous-composants) ─────────
type BlockCtxType = {
  token: string;
  onToggleTodo?: (blockId: string, checked: boolean) => void;
};
const BlockCtx = createContext<BlockCtxType>({ token: '' });

// ── Hook : enfants pré-chargés ou fetch lazy ────────────────────────────────
function useBlockChildren(block: NotionBlock, fetchOnMount: boolean) {
  const { token } = useContext(BlockCtx);
  const preloaded = (block as Record<string, unknown>)._children as NotionBlock[] | undefined;
  const [kids, setKids] = useState<NotionBlock[]>(preloaded ?? []);
  const [loading, setLoading] = useState(false);
  // didFetch évite les doubles appels sans provoquer de re-render
  const didFetch = useRef(preloaded !== undefined);

  const doFetch = () => {
    if (didFetch.current || !block.has_children || !token) return;
    didFetch.current = true;
    setLoading(true);
    fetchPageBlocks(token, block.id)
      .then(setKids)
      .catch(() => { /* silencieux */ })
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (fetchOnMount) doFetch(); }, []);

  return { kids, loading, fetch: doFetch };
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function notionColorToCSS(color: string): string {
  const map: Record<string, string> = {
    gray: '#9b9b9b', brown: '#64473a', orange: '#d9730d', yellow: '#dfab01',
    green: '#0f7b6c', blue: '#0b6e99', purple: '#6940a5', pink: '#ad1a72', red: '#e03e3e',
  };
  return map[color] ?? 'inherit';
}

function RichText({ parts }: { parts: NotionRichText[] }) {
  return (
    <>
      {parts.map((part, i) => {
        const ann = part.annotations ?? {};
        if (part.href) {
          return (
            <a key={i} href={part.href} target="_blank" rel="noopener noreferrer"
               style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
              {part.plain_text}
            </a>
          );
        }
        const style: React.CSSProperties = {
          fontWeight: ann.bold ? 700 : undefined,
          fontStyle: ann.italic ? 'italic' : undefined,
          textDecoration: [ann.strikethrough && 'line-through', ann.underline && 'underline'].filter(Boolean).join(' ') || undefined,
          color: ann.color && ann.color !== 'default' && !ann.color.endsWith('_background')
            ? notionColorToCSS(ann.color) : undefined,
          background: ann.color?.endsWith('_background')
            ? notionColorToCSS(ann.color.replace('_background', '')) + '33' : undefined,
        };
        if (ann.code) {
          return (
            <code key={i} style={{
              fontFamily: 'monospace', fontSize: '0.88em', padding: '1px 5px',
              borderRadius: 3, background: 'var(--bg-deep)', color: 'var(--accent)', ...style,
            }}>
              {part.plain_text}
            </code>
          );
        }
        return <span key={i} style={style}>{part.plain_text}</span>;
      })}
    </>
  );
}

function getRT(block: NotionBlock): NotionRichText[] {
  const data = block[block.type] as Record<string, unknown> | undefined;
  return (data?.rich_text as NotionRichText[]) ?? [];
}

// ── CalloutBlock : fetch automatique des enfants au montage ────────────────────
function CalloutBlock({ block }: { block: NotionBlock }) {
  const { onToggleTodo } = useContext(BlockCtx);
  const rt = getRT(block);
  const data = block.callout as Record<string, unknown> | undefined;
  const icon = (data?.icon as Record<string, unknown>)?.emoji as string ?? '💡';
  const { kids, loading } = useBlockChildren(block, true /* fetchOnMount */);

  return (
    <div style={{
      display: 'flex', gap: 10, padding: '10px 14px', margin: '8px 0',
      background: 'var(--bg-deep)', borderRadius: 6, border: '1px solid var(--border)',
    }}>
      <span style={{ fontSize: 16, flexShrink: 0, lineHeight: '1.6' }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {rt.length > 0 && <span style={{ color: 'var(--text)' }}><RichText parts={rt} /></span>}
        {loading && (
          <span className="text-xs animate-pulse" style={{ color: 'var(--text-muted)' }}>…</span>
        )}
        {kids.length > 0 && (
          <NotionBlockRenderer blocks={kids} onToggleTodo={onToggleTodo} />
        )}
      </div>
    </div>
  );
}

// ── ToggleBlock : fetch lazy au premier clic ───────────────────────────────────
function ToggleBlock({ block }: { block: NotionBlock }) {
  const { onToggleTodo, token } = useContext(BlockCtx);
  const [open, setOpen] = useState(false);
  const rt = getRT(block);

  // Initialise avec les enfants pré-chargés si disponibles
  const [kids, setKids] = useState<NotionBlock[]>(
    () => ((block as Record<string, unknown>)._children as NotionBlock[]) ?? []
  );
  const [loading, setLoading] = useState(false);
  const fetched = useRef(
    ((block as Record<string, unknown>)._children as NotionBlock[] | undefined) !== undefined
  );

  const handleToggle = () => {
    // Fetch au premier clic — sans vérifier has_children (parfois faux côté API Notion)
    if (!open && !fetched.current && token) {
      fetched.current = true;
      setLoading(true);
      fetchPageBlocks(token, block.id)
        .then(setKids)
        .catch(() => { /* silencieux */ })
        .finally(() => setLoading(false));
    }
    setOpen(o => !o);
  };

  return (
    <div style={{ margin: '3px 0' }}>
      <div
        style={{ display: 'flex', alignItems: 'flex-start', gap: 6, cursor: 'pointer', userSelect: 'none' }}
        onClick={handleToggle}
      >
        {/* Triangle CSS — indépendant de la police */}
        <span style={{
          display: 'inline-block',
          width: 0, height: 0,
          borderTop: '4px solid transparent',
          borderBottom: '4px solid transparent',
          borderLeft: '6px solid var(--text-muted)',
          marginTop: '0.5em',
          flexShrink: 0,
          transition: 'transform 120ms',
          transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
        }} />
        <span style={{ color: 'var(--text)', fontWeight: 500 }}><RichText parts={rt} /></span>
        {loading && <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>…</span>}
      </div>
      {open && kids.length > 0 && (
        <div style={{ paddingLeft: 22, marginTop: 2 }}>
          <NotionBlockRenderer blocks={kids} onToggleTodo={onToggleTodo} />
        </div>
      )}
    </div>
  );
}

// ── BlockItem ──────────────────────────────────────────────────────────────────
function BlockItem({ block, listIndex }: {
  block: NotionBlock;
  listIndex: number;
}) {
  const { onToggleTodo } = useContext(BlockCtx);
  const rt = getRT(block);

  switch (block.type) {
    case 'paragraph':
      return (
        <p style={{ margin: '2px 0 8px', minHeight: '1.5em', color: 'var(--text)' }}>
          {rt.length > 0 ? <RichText parts={rt} /> : <>&nbsp;</>}
        </p>
      );

    case 'heading_1':
      return (
        <h1 style={{ fontSize: '1.35em', fontWeight: 700, margin: '22px 0 8px', color: 'var(--text)', lineHeight: 1.3 }}>
          <RichText parts={rt} />
        </h1>
      );

    case 'heading_2':
      return (
        <h2 style={{ fontSize: '1.1em', fontWeight: 600, margin: '16px 0 6px', color: 'var(--text)', lineHeight: 1.3 }}>
          <RichText parts={rt} />
        </h2>
      );

    case 'heading_3':
      return (
        <h3 style={{ fontSize: '0.95em', fontWeight: 600, margin: '12px 0 4px', color: 'var(--text)', lineHeight: 1.3 }}>
          <RichText parts={rt} />
        </h3>
      );

    case 'bulleted_list_item': {
      const bulletKids = (block as Record<string, unknown>)._children as NotionBlock[] | undefined;
      return (
        <div style={{ margin: '3px 0', paddingLeft: 6 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{
              marginTop: '0.55em', width: 5, height: 5, borderRadius: '50%',
              background: 'var(--text-muted)', flexShrink: 0,
            }} />
            <span style={{ color: 'var(--text)' }}><RichText parts={rt} /></span>
          </div>
          {bulletKids && bulletKids.length > 0 && (
            <div style={{ paddingLeft: 13 }}>
              <NotionBlockRenderer blocks={bulletKids} />
            </div>
          )}
        </div>
      );
    }

    case 'numbered_list_item': {
      const numKids = (block as Record<string, unknown>)._children as NotionBlock[] | undefined;
      return (
        <div style={{ margin: '3px 0', paddingLeft: 6 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ color: 'var(--text-muted)', flexShrink: 0, minWidth: 18, textAlign: 'right', lineHeight: '1.6' }}>
              {listIndex}.
            </span>
            <span style={{ color: 'var(--text)' }}><RichText parts={rt} /></span>
          </div>
          {numKids && numKids.length > 0 && (
            <div style={{ paddingLeft: 26 }}>
              <NotionBlockRenderer blocks={numKids} />
            </div>
          )}
        </div>
      );
    }

    case 'to_do': {
      const checked = !!((block.to_do as Record<string, unknown>)?.checked);
      const interactive = !!onToggleTodo;
      const todoKids = (block as Record<string, unknown>)._children as NotionBlock[] | undefined;
      return (
        <div style={{ margin: '3px 0', paddingLeft: 6 }}>
          <div
            style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: interactive ? 'pointer' : undefined }}
            onClick={interactive ? () => onToggleTodo!(block.id, !checked) : undefined}
          >
            <span style={{
              width: 15, height: 15, borderRadius: 3,
              border: `1.5px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
              background: checked ? 'var(--accent)' : 'transparent',
              flexShrink: 0, marginTop: 3, display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 120ms, border-color 120ms',
              boxShadow: interactive ? '0 0 0 0 var(--accent)' : undefined,
            }}>
              {checked && <span style={{ color: 'var(--accent-fg)', fontSize: 9, fontWeight: 700, lineHeight: 1 }}>✓</span>}
            </span>
            <span style={{
              color: checked ? 'var(--text-muted)' : 'var(--text)',
              textDecoration: checked ? 'line-through' : undefined,
              userSelect: interactive ? 'none' : undefined,
            }}>
              <RichText parts={rt} />
            </span>
          </div>
          {todoKids && todoKids.length > 0 && (
            <div style={{ paddingLeft: 23 }}>
              <NotionBlockRenderer blocks={todoKids} />
            </div>
          )}
        </div>
      );
    }

    case 'divider':
      return <hr style={{ margin: '14px 0', border: 'none', borderTop: '1px solid var(--border)' }} />;

    case 'callout':
      return <CalloutBlock block={block} />;

    case 'quote':
      return (
        <blockquote style={{
          borderLeft: '3px solid var(--accent)', paddingLeft: 12, margin: '8px 0',
          color: 'var(--text-muted)', fontStyle: 'italic',
        }}>
          <RichText parts={rt} />
        </blockquote>
      );

    case 'code': {
      const data = block.code as Record<string, unknown> | undefined;
      const codeRt = (data?.rich_text as NotionRichText[]) ?? [];
      return (
        <pre style={{
          background: 'var(--bg-deep)', padding: '10px 14px', margin: '8px 0',
          borderRadius: 6, fontSize: '0.82em', fontFamily: 'monospace', overflowX: 'auto',
          border: '1px solid var(--border)', color: 'var(--text)', lineHeight: 1.5,
        }}>
          {codeRt.map(p => p.plain_text).join('')}
        </pre>
      );
    }

    case 'image': {
      const data = block.image as Record<string, unknown> | undefined;
      const url = (data?.file as Record<string, unknown>)?.url as string
        ?? (data?.external as Record<string, unknown>)?.url as string;
      if (!url) return null;
      return <img src={url} alt="" style={{ maxWidth: '100%', borderRadius: 6, margin: '8px 0' }} />;
    }

    case 'toggle':
      return <ToggleBlock block={block} />;

    default:
      if (rt.length > 0) {
        return (
          <p style={{ margin: '2px 0 8px', color: 'var(--text-muted)', fontSize: '0.9em' }}>
            <RichText parts={rt} />
          </p>
        );
      }
      return null;
  }
}

// ── Export principal ──────────────────────────────────────────────────────────
export function NotionBlockRenderer({
  blocks,
  onToggleTodo,
  token,
}: {
  blocks: NotionBlock[];
  onToggleTodo?: (blockId: string, checked: boolean) => void;
  token?: string;
}) {
  // Hérite du contexte parent si pas de token explicite (appels récursifs)
  const parentCtx = useContext(BlockCtx);
  const effectiveToken = token ?? parentCtx.token;
  const effectiveOnToggleTodo = onToggleTodo ?? parentCtx.onToggleTodo;

  let listCounter = 0;

  return (
    <BlockCtx.Provider value={{ token: effectiveToken, onToggleTodo: effectiveOnToggleTodo }}>
      <div style={{ color: 'var(--text)', lineHeight: '1.6', fontSize: 14 }}>
        {blocks.map((block, idx) => {
          if (block.type === 'numbered_list_item') {
            if (idx === 0 || blocks[idx - 1].type !== 'numbered_list_item') listCounter = 0;
            listCounter++;
          } else {
            listCounter = 0;
          }
          return <BlockItem key={block.id} block={block} listIndex={listCounter} />;
        })}
      </div>
    </BlockCtx.Provider>
  );
}
