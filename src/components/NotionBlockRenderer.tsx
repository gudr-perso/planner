import type { NotionBlock, NotionRichText } from '../types';

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
          background: ann.color?.endsWith('_background') ? notionColorToCSS(ann.color.replace('_background', '')) + '33' : undefined,
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

function BlockItem({ block, listIndex, onToggleTodo }: {
  block: NotionBlock;
  listIndex: number;
  onToggleTodo?: (blockId: string, checked: boolean) => void;
}) {
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

    case 'bulleted_list_item':
      return (
        <div style={{ display: 'flex', gap: 8, margin: '3px 0', paddingLeft: 6 }}>
          <span style={{
            marginTop: '0.55em', width: 5, height: 5, borderRadius: '50%',
            background: 'var(--text-muted)', flexShrink: 0,
          }} />
          <span style={{ color: 'var(--text)' }}><RichText parts={rt} /></span>
        </div>
      );

    case 'numbered_list_item':
      return (
        <div style={{ display: 'flex', gap: 8, margin: '3px 0', paddingLeft: 6 }}>
          <span style={{ color: 'var(--text-muted)', flexShrink: 0, minWidth: 18, textAlign: 'right', lineHeight: '1.6' }}>
            {listIndex}.
          </span>
          <span style={{ color: 'var(--text)' }}><RichText parts={rt} /></span>
        </div>
      );

    case 'to_do': {
      const checked = !!((block.to_do as Record<string, unknown>)?.checked);
      const interactive = !!onToggleTodo;
      return (
        <div
          style={{ display: 'flex', gap: 8, margin: '3px 0', paddingLeft: 6, alignItems: 'flex-start', cursor: interactive ? 'pointer' : undefined }}
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
      );
    }

    case 'divider':
      return <hr style={{ margin: '14px 0', border: 'none', borderTop: '1px solid var(--border)' }} />;

    case 'callout': {
      const data = block.callout as Record<string, unknown> | undefined;
      const icon = (data?.icon as Record<string, unknown>)?.emoji as string ?? '💡';
      return (
        <div style={{
          display: 'flex', gap: 10, padding: '10px 14px', margin: '8px 0',
          background: 'var(--bg-deep)', borderRadius: 6, border: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 16, flexShrink: 0, lineHeight: '1.6' }}>{icon}</span>
          <span style={{ color: 'var(--text)' }}><RichText parts={rt} /></span>
        </div>
      );
    }

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

export function NotionBlockRenderer({
  blocks,
  onToggleTodo,
}: {
  blocks: NotionBlock[];
  onToggleTodo?: (blockId: string, checked: boolean) => void;
}) {
  let listCounter = 0;

  return (
    <div style={{ color: 'var(--text)', lineHeight: '1.6', fontSize: 14 }}>
      {blocks.map((block, idx) => {
        if (block.type === 'numbered_list_item') {
          if (idx === 0 || blocks[idx - 1].type !== 'numbered_list_item') listCounter = 0;
          listCounter++;
        } else {
          listCounter = 0;
        }
        return <BlockItem key={block.id} block={block} listIndex={listCounter} onToggleTodo={onToggleTodo} />;
      })}
    </div>
  );
}
