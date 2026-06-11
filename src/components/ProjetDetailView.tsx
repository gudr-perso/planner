import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { load } from '../persistence';
import { fetchTaches, fetchSousTaches, fetchSuivisProjet, fetchEchanges, fetchDocuments, fetchTempsProjet, fetchPageBlocks } from '../notionService';
import { getDemoStore } from '../demoData';
import type {
  DocumentEntry,
  DocumentsConfig,
  EchangeEntry,
  EchangesConfig,
  NotionBlock,
  NotionRichText,
  SousTacheEntry,
  SousTachesConfig,
  SuiviProjetEntry,
  SuiviProjetConfig,
  TacheEntry,
  TachesConfig,
  TempsProjetConfig,
  TempsProjetEntry,
} from '../types';
import { NotionBlockRenderer } from './NotionBlockRenderer';
import { useResizableRightPanel } from '../hooks/useResizableRightPanel';
import { useAuth } from '../store/useAuthStore';

// ── Helpers partagés ──────────────────────────────────────────────────────────

function notionColor(color?: string): string {
  const map: Record<string, string> = {
    blue: '#3b82f6', green: '#10b981', red: '#ef4444', orange: '#f97316',
    yellow: '#eab308', purple: '#8b5cf6', pink: '#ec4899', gray: '#6b7280',
    brown: '#92400e', default: '#6b7280',
  };
  return color ? (map[color] ?? map.default) : map.default;
}

function Badge({ label, color }: { label: string; color?: string }) {
  if (!label) return null;
  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded text-white text-xs font-medium"
      style={{ background: notionColor(color) }}
    >
      {label}
    </span>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('fr-FR');
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString('fr-FR');
    const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return `${date} ${time}`;
  } catch {
    return iso;
  }
}

// Arrondit une valeur numérique (string brute Notion, ex: "3.666666666667") à N décimales.
// Renvoie '—' si vide ou non numérique. decimals=2 pour les heures, 0 pour les minutes.
function formatNum(v?: string | null, decimals = 2): string {
  if (v == null || v === '') return '—';
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? (v || '—') : n.toFixed(decimals);
}

function LienCell({ url }: { url?: string }) {
  if (!url) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={e => e.stopPropagation()}
      className="hover:opacity-70 transition-opacity"
      style={{ color: 'var(--accent)', fontSize: 13 }}
      title="Ouvrir dans Notion"
    >
      ↗
    </a>
  );
}

function TermineButton({ showTermine, onToggle }: { showTermine: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="text-xs px-2.5 py-1 rounded transition-all"
      style={{
        background: showTermine ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'var(--bg-deep)',
        color: showTermine ? 'var(--accent)' : 'var(--text-muted)',
        border: `1px solid ${showTermine ? 'color-mix(in srgb, var(--accent) 35%, transparent)' : 'var(--border)'}`,
      }}
      title={showTermine ? 'Masquer les terminés' : 'Afficher les terminés'}
    >
      {showTermine ? '🔓' : '🔒'} Terminé
    </button>
  );
}

// ── Shared tab input style ────────────────────────────────────────────────────

const tabInputStyle: React.CSSProperties = {
  fontSize: 11, padding: '3px 7px', borderRadius: 4,
  border: '1px solid var(--border)', background: 'var(--bg-deep)',
  color: 'var(--text)', outline: 'none',
};

// ── Convertit NotionBlock[] en contenu pdfmake ────────────────────────────────

type PdfContent = Record<string, unknown>;

// Roboto ne supporte pas les emoji — on les supprime du texte PDF
function noEmoji(s: string): string {
  return s
    .replace(/\p{Extended_Pictographic}/gu, '')            // emoji pictographiques
    .replace(/[⌀-➿]/g, '')                       // Misc Technical, Symbols, Dingbats
    .replace(/[︀-️]/g, '')                       // variation selectors
    .replace(/‍/g, '')                                // zero-width joiner
    .replace(/⃣/g, '')                                // combining enclosing keycap
    .trim();
}

function richTextToPdf(parts: NotionRichText[]): PdfContent[] {
  if (!parts || parts.length === 0) return [{ text: '' }];
  return parts.map(p => {
    const ann = p.annotations ?? {};
    const obj: PdfContent = { text: noEmoji(p.plain_text ?? '') };
    if (ann.bold) obj.bold = true;
    if (ann.italic) obj.italics = true;
    if (ann.underline) obj.decoration = 'underline';
    if (ann.strikethrough) obj.decoration = 'lineThrough';
    if (ann.code) { obj.font = 'Courier'; obj.fontSize = 8; obj.background = '#F1F5F9'; }
    return obj;
  });
}

function blocksToPdfContent(blocks: NotionBlock[]): PdfContent[] {
  const content: PdfContent[] = [];

  for (const block of blocks) {
    const rt = ((block[block.type] as Record<string, unknown>)?.rich_text as NotionRichText[]) ?? [];
    const rtPdf = richTextToPdf(rt);
    const plainText = rt.map(p => p.plain_text).join('');

    switch (block.type) {
      case 'paragraph':
        content.push({ text: rtPdf.length > 0 ? rtPdf : ' ', margin: [0, 2, 0, 4], fontSize: 10, color: '#1A202C' });
        break;
      case 'heading_1':
        content.push({ text: rtPdf, fontSize: 16, bold: true, margin: [0, 14, 0, 6], color: '#1A202C' });
        break;
      case 'heading_2':
        content.push({ text: rtPdf, fontSize: 13, bold: true, margin: [0, 10, 0, 4], color: '#1A202C' });
        break;
      case 'heading_3':
        content.push({ text: rtPdf, fontSize: 11, bold: true, margin: [0, 8, 0, 3], color: '#1A202C' });
        break;
      case 'bulleted_list_item':
        content.push({ text: [{ text: '• ', color: '#718096' }, ...rtPdf], margin: [8, 1, 0, 1], fontSize: 10, color: '#1A202C' });
        break;
      case 'numbered_list_item':
        content.push({ text: rtPdf, margin: [8, 1, 0, 1], fontSize: 10, color: '#1A202C' });
        break;
      case 'to_do': {
        const checked = !!((block.to_do as Record<string, unknown>)?.checked);
        content.push({ text: [{ text: checked ? '[x] ' : '[ ] ', color: '#718096' }, ...rtPdf], margin: [8, 1, 0, 1], fontSize: 10, color: '#1A202C' });
        break;
      }
      case 'quote':
        content.push({
          table: { widths: [3, '*'], body: [[{ text: '', fillColor: '#718096', border: [false, false, false, false] }, { text: rtPdf, italics: true, color: '#718096', fontSize: 10, border: [false, false, false, false] }]] },
          layout: 'noBorders', margin: [0, 6, 0, 6],
        });
        break;
      case 'callout': {
        const calloutKids = (block as Record<string, unknown>)._children as NotionBlock[] | undefined;
        const calloutChildContent = calloutKids && calloutKids.length > 0 ? blocksToPdfContent(calloutKids) : [];
        const calloutInner: PdfContent[] = [];
        if (rt.length > 0) calloutInner.push({ text: rtPdf, fontSize: 10, color: '#1A202C' });
        calloutInner.push(...calloutChildContent);
        // Pas d'icône emoji (non supportée par Roboto → carré .notdef) :
        // on rend un encadré visible avec barre d'accent + fond teinté.
        content.push({
          table: {
            widths: [3, '*'],
            body: [[
              { text: '', fillColor: '#60A5FA', border: [false, false, false, false] },
              { stack: calloutInner.length > 0 ? calloutInner : [{ text: ' ' }], fillColor: '#EFF6FF', border: [false, false, false, false] },
            ]],
          },
          layout: {
            hLineWidth: () => 0, vLineWidth: () => 0,
            paddingLeft: (i: number) => (i === 0 ? 0 : 8),
            paddingRight: (i: number) => (i === 0 ? 0 : 8),
            paddingTop: () => 6, paddingBottom: () => 6,
          },
          margin: [0, 6, 0, 6],
        });
        break;
      }
      case 'code':
        content.push({ text: noEmoji(plainText) || ' ', font: 'Courier', fontSize: 8, background: '#F1F5F9', margin: [0, 4, 0, 4], color: '#2D3748', preserveLeadingSpaces: true });
        break;
      case 'divider':
        content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: '#E2E8F0' }], margin: [0, 8, 0, 8] });
        break;
      case 'image': {
        const imgData = block.image as Record<string, unknown> | undefined;
        const imgUrl = (imgData?.file as Record<string, unknown>)?.url as string ?? (imgData?.external as Record<string, unknown>)?.url as string;
        if (imgUrl) content.push({ text: `[Image: ${imgUrl}]`, fontSize: 8, color: '#718096', italics: true, margin: [0, 4, 0, 4] });
        break;
      }
      case 'table': {
        const kids = (block as Record<string, unknown>)._children as NotionBlock[] | undefined;
        if (kids && kids.length > 0) {
          const hasColHeader = !!((block.table as Record<string, unknown>)?.has_column_header);
          const tableBody = kids.map((row, rowIdx) => {
            const cells = ((row.table_row as Record<string, unknown>)?.cells as NotionRichText[][]) ?? [];
            return cells.map(cell => ({
              text: noEmoji(cell.map(p => p.plain_text).join('')) || ' ',
              fontSize: 9,
              bold: hasColHeader && rowIdx === 0,
              fillColor: hasColHeader && rowIdx === 0 ? '#F7FAFC' : undefined,
            }));
          });
          if (tableBody.length > 0 && tableBody[0].length > 0) {
            const colCount = tableBody[0].length;
            content.push({
              table: { headerRows: hasColHeader ? 1 : 0, widths: Array(colCount).fill('*'), body: tableBody },
              layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => '#E2E8F0', vLineColor: () => '#E2E8F0' },
              margin: [0, 6, 0, 6],
            });
          }
        }
        break;
      }
      case 'column_list': {
        const cols = (block as Record<string, unknown>)._children as NotionBlock[] | undefined;
        if (cols && cols.length > 0) {
          const colStacks = cols.map(col => {
            const colKids = (col as Record<string, unknown>)._children as NotionBlock[] | undefined;
            return { stack: colKids && colKids.length > 0 ? blocksToPdfContent(colKids) : [{ text: ' ' }], width: '*' };
          });
          content.push({ columns: colStacks, columnGap: 16, margin: [0, 4, 0, 4] } as PdfContent);
        }
        break;
      }
      case 'column':
        break;
      default:
        if (rt.length > 0) content.push({ text: rtPdf, margin: [0, 2, 0, 4], fontSize: 10, color: '#718096' });
    }
  }

  return content;
}

// ── Panneau détail ────────────────────────────────────────────────────────────

function DetailPanel({
  title,
  url,
  sharedUrl,
  date,
  projet,
  blocks,
  blocksLoading,
  blocksError,
  isClient,
  onClose,
}: {
  title: string;
  url: string | null;
  sharedUrl?: string | null;
  date?: string | null;
  projet?: string | null;
  blocks: NotionBlock[];
  blocksLoading: boolean;
  blocksError: string | null;
  isClient?: boolean;
  onClose: () => void;
}) {
  const [exporting, setExporting] = useState(false);

  async function handleExportPdf() {
    if (exporting) return;
    setExporting(true);
    try {
      const pdfMakeModule  = await import('pdfmake/build/pdfmake');
      const pdfFontsModule = await import('pdfmake/build/vfs_fonts');
      const pdfMake  = pdfMakeModule.default ?? pdfMakeModule;
      const pdfFonts = pdfFontsModule.default ?? pdfFontsModule;
      pdfMake.vfs = pdfFonts.pdfMake?.vfs ?? pdfFonts.vfs ?? (pdfFonts as unknown as Record<string, string>);

      // Enrichissement récursif de l'arbre de blocs pour le PDF : on descend à
      // tous les niveaux (column_list → column → callout → paragraphes…), sinon
      // le détail des blocs imbriqués (ex. callouts dans des colonnes) est perdu.
      // `column`/`column_list` sont fetchés même si has_children est absent/faux.
      const MAX_DEPTH = 8;
      const enrichTree = async (list: NotionBlock[], depth: number): Promise<NotionBlock[]> => {
        if (depth >= MAX_DEPTH) return list;
        return Promise.all(list.map(async b => {
          const forceFetch = b.type === 'column' || b.type === 'column_list';
          let kids = (b as Record<string, unknown>)._children as NotionBlock[] | undefined;
          if ((b.has_children || forceFetch) && (!kids || kids.length === 0)) {
            try {
              kids = await fetchPageBlocks(b.id);
            } catch {
              kids = kids ?? [];
            }
          }
          if (kids && kids.length > 0) {
            const enrichedKids = await enrichTree(kids, depth + 1);
            return { ...b, _children: enrichedKids } as NotionBlock;
          }
          return b;
        }));
      };
      const enrichedBlocks = await enrichTree(blocks, 0);

      const contentBlocks = blocksToPdfContent(enrichedBlocks);

      const now = new Date();
      const genTs = now.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const metaLine: PdfContent[] = [];
      if (projet) metaLine.push({ text: `Projet : ${projet}`, fontSize: 9, color: '#718096', margin: [0, 0, 16, 0] });
      if (date) metaLine.push({ text: `Date : ${formatDate(date)}`, fontSize: 9, color: '#718096', margin: [0, 0, 0, 0] });

      const docDef = {
        pageSize: 'A4' as const,
        pageMargins: [40, 55, 40, 50] as [number, number, number, number],
        header: (_page: number, _count: number) => ({
          text: title,
          fontSize: 9, color: '#718096', margin: [40, 18, 40, 0], alignment: 'left' as const,
        }),
        footer: (currentPage: number, pageCount: number) => ({
          text: `${currentPage} / ${pageCount}`,
          fontSize: 8, color: '#A0AEC0', alignment: 'center' as const, margin: [0, 8, 0, 0],
        }),
        content: [
          { text: title, fontSize: 20, bold: true, color: '#1A202C', margin: [0, 0, 0, metaLine.length > 0 ? 6 : 4] },
          ...(metaLine.length > 0 ? [{ columns: metaLine, margin: [0, 0, 0, 4] as [number,number,number,number] }] : []),
          { text: `Généré le ${genTs}`, fontSize: 8, color: '#A0AEC0', italics: true, margin: [0, 0, 0, 16] },
          ...contentBlocks,
        ],
        defaultStyle: { fontSize: 10, color: '#1A202C', lineHeight: 1.4 },
      };

      const safeTitle = title.replace(/[/\\:*?"<>|]/g, '_').slice(0, 60);
      pdfMake.createPdf(docDef as Record<string, unknown>).download(`${safeTitle}.pdf`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <div
        className="px-5 py-4 shrink-0 flex items-start justify-between gap-4"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex-1 min-w-0">
          <h2
            className="font-bold mb-2"
            style={{ color: 'var(--text)', fontSize: 14, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {title}
          </h2>
          <div className="flex flex-wrap gap-3">
            {url && !isClient && (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="text-xs hover:underline"
                style={{ color: 'var(--accent)' }}
              >
                Ouvrir dans Notion ↗
              </a>
            )}
            {sharedUrl && (
              <a
                href={sharedUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs hover:underline"
                style={{ color: 'var(--accent)' }}
              >
                URL partagée ↗
              </a>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          {blocks.length > 0 && (
            <button
              onClick={handleExportPdf}
              disabled={exporting}
              title="Télécharger en PDF"
              style={{ fontSize: 12, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-deep)', color: exporting ? 'var(--text-muted)' : 'var(--text)', cursor: exporting ? 'default' : 'pointer', opacity: exporting ? 0.6 : 1 }}
            >
              {exporting ? '…PDF' : '↓ PDF'}
            </button>
          )}
          <button
            onClick={onClose}
            title="Fermer"
            style={{ color: 'var(--text-muted)', fontSize: 15, background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      </div>
      <div className="themed-scroll flex-1 overflow-y-auto px-5 py-5">
        {projet && (
          <div className="flex flex-wrap gap-6 mb-4 pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>Projet</span> — {projet}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>Date</span> — {date ? formatDate(date) : '—'}
            </span>
          </div>
        )}
        {blocksLoading ? (
          <p className="text-xs animate-pulse" style={{ color: 'var(--text-muted)' }}>Chargement…</p>
        ) : blocksError ? (
          <p className="text-xs" style={{ color: 'var(--color-error)' }}>⚠ {blocksError}</p>
        ) : blocks.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>(Page vide)</p>
        ) : (
          <NotionBlockRenderer blocks={blocks} />
        )}
      </div>
    </>
  );
}

// ── Props principal ───────────────────────────────────────────────────────────

interface Props {
  projetId: string;
  projetNom: string;
  projetCode?: string;
  refreshKey?: number;
  onBack: () => void;
}

type TabId = 'taches' | 'sousTaches' | 'suivi' | 'echanges' | 'documents' | 'temps';

// ── Composant principal ───────────────────────────────────────────────────────

export default function ProjetDetailView({ projetId, projetNom, projetCode, refreshKey = 0, onBack }: Props) {
  const { user } = useAuth();
  const isClient = !!user?.client_code;
  const [activeTab, setActiveTab] = useState<TabId>('taches');

  // Tâches partagées (chargées une fois, utilisées par les sous-onglets)
  const [taches, setTaches] = useState<TacheEntry[]>([]);
  const [tachesLoading, setTachesLoading] = useState(true);
  const [tachesError, setTachesError] = useState('');

  // Panneau détail partagé
  const { width: detailWidth, containerRef, onMouseDown: onPanelResize } =
    useResizableRightPanel('projetDetailWidth', 480);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTitle, setSelectedTitle] = useState('');
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [selectedSharedUrl, setSelectedSharedUrl] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedProjet, setSelectedProjet] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<NotionBlock[]>([]);
  const [blocksLoading, setBlocksLoading] = useState(false);
  const [blocksError, setBlocksError] = useState<string | null>(null);

  // Chargement des tâches du projet
  useEffect(() => {
    const config = load<TachesConfig>('tachesConfig', {
      databaseId: '', nomField: 'Name', canalField: '', statutField: '',
      prioriteField: '', dateEcheanceField: '', planifieLeField: '',
      projetField: '', statutTermineValue: 'Terminé', suiviField: '',
    });
    if (!config.databaseId) {
      const demo = getDemoStore();
      if (demo?.capProjects[projetId]) setTaches(demo.capProjects[projetId].taches);
      setTachesLoading(false);
      return;
    }
    setTachesLoading(true);
    setTachesError('');
    fetchTaches(config, projetId)
      .then(data => { setTaches(data); })
      .catch(e => setTachesError(String(e)))
      .finally(() => setTachesLoading(false));
  }, [projetId, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const tacheIdToName = useMemo(
    () => new Map(taches.map(t => [t.id, t.nom])),
    [taches],
  );

  const openDetail = useCallback((id: string, title: string, url?: string, sharedUrl?: string, date?: string, projet?: string) => {
    setSelectedId(id);
    setSelectedTitle(title);
    setSelectedUrl(url ?? null);
    setSelectedSharedUrl(sharedUrl ?? null);
    setSelectedDate(date ?? null);
    setSelectedProjet(projet ?? null);
    const demoBlocks = getDemoStore()?.blocks[id];
    if (demoBlocks) { setBlocks(demoBlocks); setBlocksLoading(false); return; }
    setBlocks([]);
    setBlocksError(null);
    setBlocksLoading(true);
    fetchPageBlocks(id)
      .then(setBlocks)
      .catch(e => setBlocksError((e as Error).message))
      .finally(() => setBlocksLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const closeDetail = useCallback(() => {
    setSelectedId(null);
    setSelectedSharedUrl(null);
    setSelectedDate(null);
    setSelectedProjet(null);
    setBlocks([]);
    setBlocksError(null);
  }, []);

  function handleTabChange(tab: TabId) {
    setActiveTab(tab);
    closeDetail();
  }

  const allTabs: Array<{ id: TabId; label: string; clientHidden?: boolean }> = [
    { id: 'taches', label: 'Tâches' },
    { id: 'sousTaches', label: 'Sous-tâches' },
    { id: 'suivi', label: 'Suivi', clientHidden: true },
    { id: 'echanges', label: 'Echanges', clientHidden: true },
    { id: 'documents', label: 'Documents' },
    { id: 'temps', label: 'Temps' },
  ];
  const tabs = allTabs.filter(t => !isClient || !t.clientHidden);

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b shrink-0"
        style={{ borderColor: 'var(--border)' }}
      >
        <button
          onClick={onBack}
          className="text-xs px-2 py-1 rounded shrink-0"
          style={{ background: 'var(--border)', color: 'var(--text)' }}
        >
          ← Projets
        </button>
        <h1 className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
          {projetNom || '(sans nom)'}
        </h1>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 px-4 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className="text-xs px-4 py-2 font-medium transition"
            style={{
              color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Contenu */}
      <div ref={containerRef} className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-hidden">
          {activeTab === 'taches' && (
            <TachesTab
              taches={taches}
              loading={tachesLoading}
              error={tachesError}
              isClient={isClient}
              selectedId={selectedId}
              onSelectRow={openDetail}
            />
          )}
          {activeTab === 'sousTaches' && (
            <SousTachesTab
              projetId={projetId}
              projetCode={projetCode}
              tacheIdToName={tacheIdToName}
              tachesReady={!tachesLoading}
              refreshKey={refreshKey}
              isClient={isClient}
              selectedId={selectedId}
              onSelectRow={openDetail}
            />
          )}
          {activeTab === 'suivi' && !isClient && (
            <SuiviProjetTab
              projetId={projetId}
              projetCode={projetCode}
              tacheIdToName={tacheIdToName}
              tachesReady={!tachesLoading}
              refreshKey={refreshKey}
              selectedId={selectedId}
              onSelectRow={openDetail}
            />
          )}
          {activeTab === 'echanges' && !isClient && (
            <EchangesTab
              projetId={projetId}
              projetCode={projetCode}
              refreshKey={refreshKey}
              selectedId={selectedId}
              onSelectRow={openDetail}
            />
          )}
          {activeTab === 'documents' && (
            <DocumentsTab
              projetId={projetId}
              projetCode={projetCode}
              refreshKey={refreshKey}
              isClient={isClient}
              selectedId={selectedId}
              onSelectRow={openDetail}
            />
          )}
          {activeTab === 'temps' && (
            <TempsProjetTab
              projetId={projetId}
              projetCode={projetCode}
              tacheIdToName={tacheIdToName}
              tachesReady={!tachesLoading}
              refreshKey={refreshKey}
              isClient={isClient}
              selectedId={selectedId}
              onSelectRow={openDetail}
            />
          )}
        </div>

        {/* Poignée de redimensionnement */}
        {selectedId && (
          <div
            className="w-1 shrink-0 cursor-col-resize transition-colors"
            style={{ background: 'var(--border)' }}
            onMouseDown={onPanelResize}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--border)'; }}
            title="Redimensionner"
          />
        )}

        {/* Panneau détail */}
        {selectedId && (
          <div className="flex flex-col overflow-hidden" style={{ width: detailWidth, flexShrink: 0 }}>
            <DetailPanel
              title={selectedTitle}
              url={selectedUrl}
              sharedUrl={selectedSharedUrl}
              date={selectedDate}
              projet={selectedProjet}
              blocks={blocks}
              blocksLoading={blocksLoading}
              blocksError={blocksError}
              isClient={isClient}
              onClose={closeDetail}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── TachesTab ─────────────────────────────────────────────────────────────────

function TachesTab({
  taches,
  loading,
  error,
  isClient,
  selectedId,
  onSelectRow,
}: {
  taches: TacheEntry[];
  loading: boolean;
  error: string;
  isClient?: boolean;
  selectedId: string | null;
  onSelectRow: (id: string, title: string, url?: string) => void;
}) {
  const config = load<TachesConfig>('tachesConfig', {
    databaseId: '', nomField: 'Name', canalField: '', statutField: '',
    prioriteField: '', dateEcheanceField: '', planifieLeField: '',
    projetField: '', statutTermineValue: 'Terminé', suiviField: '',
  });

  const [showTermine, setShowTermine] = useState(false);
  const [sort, setSort] = useState<{
    col: 'nom' | 'canal' | 'statut' | 'priorite';
    dir: 'asc' | 'desc';
  }>({ col: 'nom', dir: 'asc' });

  const filtered = useMemo(() =>
    showTermine ? taches : taches.filter(t => t.statut !== config.statutTermineValue),
    [taches, showTermine, config.statutTermineValue],
  );

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const va = String(a[sort.col] ?? '');
    const vb = String(b[sort.col] ?? '');
    return sort.dir === 'asc' ? va.localeCompare(vb, 'fr') : vb.localeCompare(va, 'fr');
  }), [filtered, sort]);

  function toggleSort(col: typeof sort.col) {
    setSort(s => ({ col, dir: s.col === col && s.dir === 'asc' ? 'desc' : 'asc' }));
  }

  const colHeaders: Array<{ key: typeof sort.col; label: string }> = [
    { key: 'nom', label: 'Nom' },
    { key: 'canal', label: 'Canal' },
    { key: 'statut', label: 'Statut' },
    { key: 'priorite', label: 'Priorité' },
  ];

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex items-center gap-3 px-4 py-2 border-b shrink-0"
        style={{ borderColor: 'var(--border)' }}
      >
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {filtered.length} tâche{filtered.length !== 1 ? 's' : ''}
        </span>
        <div className="ml-auto">
          <TermineButton showTermine={showTermine} onToggle={() => setShowTermine(v => !v)} />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {loading && <p className="text-xs px-4 py-3" style={{ color: 'var(--text-muted)' }}>Chargement…</p>}
        {error && <p className="text-xs px-4 py-3" style={{ color: 'var(--color-error, #e53e3e)' }}>{error}</p>}
        {!loading && !error && (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                {colHeaders.map(({ key, label }) => (
                  <th
                    key={key}
                    onClick={() => toggleSort(key)}
                    className="text-left px-3 py-2 cursor-pointer select-none font-medium"
                  >
                    {label}{sort.col === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                ))}
                {!isClient && <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--text-muted)' }}>Suivi</th>}
                {!isClient && <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--text-muted)' }}>Lien</th>}
              </tr>
            </thead>
            <tbody>
              {sorted.map(t => (
                <tr
                  key={t.id}
                  onClick={() => onSelectRow(t.id, t.nom, t.notion_url)}
                  className="cursor-pointer"
                  style={{
                    borderBottom: '1px solid var(--border)',
                    background: selectedId === t.id
                      ? 'color-mix(in srgb, var(--accent) 9%, transparent)'
                      : undefined,
                  }}
                  onMouseEnter={e => {
                    if (selectedId !== t.id) e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 4%, transparent)';
                  }}
                  onMouseLeave={e => {
                    if (selectedId !== t.id) e.currentTarget.style.background = '';
                  }}
                >
                  <td className="px-3 py-2 font-medium" style={{ color: 'var(--text)' }}>{t.nom || '(sans nom)'}</td>
                  <td className="px-3 py-2"><Badge label={t.canal} color={t.canalColor} /></td>
                  <td className="px-3 py-2"><Badge label={t.statut} color={t.statutColor} /></td>
                  <td className="px-3 py-2"><Badge label={t.priorite} color={t.prioriteColor} /></td>
                  {!isClient && <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{t.suivis.join(', ') || '—'}</td>}
                  {!isClient && <td className="px-3 py-2"><LienCell url={t.notion_url} /></td>}
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={isClient ? 4 : 6} className="px-3 py-4 text-center" style={{ color: 'var(--text-muted)' }}>
                    Aucune tâche{!showTermine ? ' en cours' : ''}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── SousTachesTab ─────────────────────────────────────────────────────────────

function SousTacheRow({ e, isClient, selectedId, onSelectRow }: {
  e: SousTacheEntry;
  isClient?: boolean;
  selectedId: string | null;
  onSelectRow: (id: string, title: string, url?: string) => void;
}) {
  return (
    <tr
      onClick={() => onSelectRow(e.id, e.nom, e.notion_url)}
      className="cursor-pointer"
      style={{
        borderBottom: '1px solid var(--border)',
        background: selectedId === e.id ? 'color-mix(in srgb, var(--accent) 9%, transparent)' : undefined,
      }}
      onMouseEnter={ev => { if (selectedId !== e.id) ev.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 4%, transparent)'; }}
      onMouseLeave={ev => { if (selectedId !== e.id) ev.currentTarget.style.background = ''; }}
    >
      <td className="px-3 py-2 font-medium" style={{ color: 'var(--text)' }}>{e.nom || '(sans nom)'}</td>
      <td className="px-3 py-2"><Badge label={e.statut} color={e.statutColor} /></td>
      <td className="px-3 py-2"><Badge label={e.priorite} color={e.prioriteColor} /></td>
      <td className="px-3 py-2"><Badge label={e.canal} color={e.canalColor} /></td>
      <td className="px-3 py-2"><Badge label={e.affecte} color={e.affecteColor} /></td>
      <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{formatDate(e.date)}</td>
      <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{formatDate(e.dateEcheance)}</td>
      <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{e.tacheNoms.join(', ') || '—'}</td>
      {!isClient && <td className="px-3 py-2"><LienCell url={e.notion_url} /></td>}
    </tr>
  );
}

function SousTachesTab({
  projetId,
  projetCode,
  tacheIdToName,
  tachesReady,
  refreshKey,
  isClient,
  selectedId,
  onSelectRow,
}: {
  projetId: string;
  projetCode?: string;
  tacheIdToName: Map<string, string>;
  tachesReady: boolean;
  refreshKey: number;
  isClient?: boolean;
  selectedId: string | null;
  onSelectRow: (id: string, title: string, url?: string) => void;
}) {
  const config = load<SousTachesConfig>('sousTachesConfig', {
    databaseId: '', nomField: 'Name', statutField: '', prioriteField: '',
    canalField: '', dateField: '', dateEcheanceField: '', tacheField: '', statutTermineValue: 'Terminé',
  });

  const [entries, setEntries] = useState<SousTacheEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showTermine, setShowTermine] = useState(false);
  const [sort, setSort] = useState<{ col: 'nom' | 'statut' | 'priorite' | 'canal' | 'affecte' | 'date' | 'dateEcheance'; dir: 'asc' | 'desc' }>({ col: 'nom', dir: 'asc' });
  const [groupByTache, setGroupByTache] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filterNom, setFilterNom] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterPriorite, setFilterPriorite] = useState('');
  const [filterCanal, setFilterCanal] = useState('');
  const [filterAffecte, setFilterAffecte] = useState('');
  const [filterTacheLiee, setFilterTacheLiee] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  useEffect(() => {
    if (!config.databaseId) {
      const demo = getDemoStore();
      if (demo?.capProjects[projetId]) setEntries(demo.capProjects[projetId].sousTaches);
      setLoading(false);
      return;
    }
    if (!tachesReady) return;
    setLoading(true);
    fetchSousTaches(config, tacheIdToName, projetId, projetCode)
      .then(setEntries)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [tachesReady, config.databaseId, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const allStatuts = useMemo(() => [...new Set(entries.map(e => e.statut).filter(Boolean))].sort(), [entries]);
  const allPriorites = useMemo(() => [...new Set(entries.map(e => e.priorite).filter(Boolean))].sort(), [entries]);
  const allCanauxST = useMemo(() => [...new Set(entries.map(e => e.canal).filter(Boolean))].sort(), [entries]);
  const allAffectesST = useMemo(() => [...new Set(entries.map(e => e.affecte).filter(Boolean))].sort(), [entries]);

  const filteredByFilters = useMemo(() => entries.filter(e => {
    if (filterNom && !e.nom.toLowerCase().includes(filterNom.toLowerCase())) return false;
    if (filterStatut && e.statut !== filterStatut) return false;
    if (filterPriorite && e.priorite !== filterPriorite) return false;
    if (filterCanal && e.canal !== filterCanal) return false;
    if (filterAffecte && e.affecte !== filterAffecte) return false;
    if (filterTacheLiee && !e.tacheNoms.some(t => t.toLowerCase().includes(filterTacheLiee.toLowerCase()))) return false;
    if (filterDateFrom && (e.date ?? '') < filterDateFrom) return false;
    if (filterDateTo && (e.date ?? '') > filterDateTo) return false;
    return true;
  }), [entries, filterNom, filterStatut, filterPriorite, filterCanal, filterAffecte, filterTacheLiee, filterDateFrom, filterDateTo]);

  const filtered = useMemo(() =>
    showTermine ? filteredByFilters : filteredByFilters.filter(e => e.statut !== config.statutTermineValue),
    [filteredByFilters, showTermine, config.statutTermineValue],
  );

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const isDateCol = sort.col === 'date' || sort.col === 'dateEcheance';
    const va = isDateCol ? (a[sort.col] ?? '') : String(a[sort.col] ?? '');
    const vb = isDateCol ? (b[sort.col] ?? '') : String(b[sort.col] ?? '');
    return sort.dir === 'asc' ? va.localeCompare(vb, 'fr') : vb.localeCompare(va, 'fr');
  }), [filtered, sort]);

  const grouped = useMemo(() => {
    if (!groupByTache) return null;
    const map = new Map<string, SousTacheEntry[]>();
    for (const e of sorted) {
      const key = e.tacheNoms[0] ?? '(Sans tâche)';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'fr'));
  }, [sorted, groupByTache]);

  function toggleSort(col: typeof sort.col) {
    setSort(s => ({ col, dir: s.col === col && s.dir === 'asc' ? 'desc' : 'asc' }));
  }

  if (!config.databaseId) {
    return <EmptyConfig message="Configurez la base Sous-tâches dans les Paramètres > CAP CONSULTING." />;
  }

  const colHeaders: Array<{ key: typeof sort.col; label: string }> = [
    { key: 'nom', label: 'Nom' },
    { key: 'statut', label: 'Statut' },
    { key: 'priorite', label: 'Priorité' },
    { key: 'canal', label: 'Canal' },
    { key: 'affecte', label: 'Affecté à' },
    { key: 'date', label: 'Date' },
    { key: 'dateEcheance', label: 'Échéance' },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-2 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {filtered.length} sous-tâche{filtered.length !== 1 ? 's' : ''}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowFilters(v => !v)}
            className="text-xs px-2 py-1 rounded"
            style={{
              background: showFilters ? 'var(--accent)' : 'var(--border)',
              color: showFilters ? 'var(--accent-fg)' : 'var(--text)',
            }}
          >
            ▼ Filtres
          </button>
          <button
            onClick={() => setGroupByTache(v => !v)}
            className="text-xs px-2 py-1 rounded"
            style={{
              background: groupByTache ? 'var(--accent)' : 'var(--border)',
              color: groupByTache ? 'var(--accent-fg)' : 'var(--text)',
            }}
            title="Regrouper par tâche"
          >
            ⊞ Par tâche
          </button>
          <TermineButton showTermine={showTermine} onToggle={() => setShowTermine(v => !v)} />
        </div>
      </div>
      {showFilters && (
        <div style={{ display: 'flex', gap: 6, padding: '6px 12px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', alignItems: 'center', background: 'var(--bg-deep)' }}>
          <input style={{ ...tabInputStyle, width: 140 }} placeholder="Nom…" value={filterNom} onChange={e => setFilterNom(e.target.value)} />
          <select style={{ ...tabInputStyle, width: 120 }} value={filterStatut} onChange={e => setFilterStatut(e.target.value)}>
            <option value="">Statut</option>
            {allStatuts.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <select style={{ ...tabInputStyle, width: 120 }} value={filterPriorite} onChange={e => setFilterPriorite(e.target.value)}>
            <option value="">Priorité</option>
            {allPriorites.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <select style={{ ...tabInputStyle, width: 110 }} value={filterCanal} onChange={e => setFilterCanal(e.target.value)}>
            <option value="">Canal</option>
            {allCanauxST.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <select style={{ ...tabInputStyle, width: 130 }} value={filterAffecte} onChange={e => setFilterAffecte(e.target.value)}>
            <option value="">Affecté à</option>
            {allAffectesST.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <input style={{ ...tabInputStyle, width: 130 }} placeholder="Tâche liée…" value={filterTacheLiee} onChange={e => setFilterTacheLiee(e.target.value)} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input id="sous-taches-date-from" type="date" style={{ ...tabInputStyle, width: 130, paddingRight: 26 }} value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
            <span onClick={() => (document.getElementById('sous-taches-date-from') as HTMLInputElement)?.showPicker?.()} style={{ position: 'absolute', right: 7, cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)' }}>📅</span>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>→</span>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input id="sous-taches-date-to" type="date" style={{ ...tabInputStyle, width: 130, paddingRight: 26 }} value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
            <span onClick={() => (document.getElementById('sous-taches-date-to') as HTMLInputElement)?.showPicker?.()} style={{ position: 'absolute', right: 7, cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)' }}>📅</span>
          </div>
          {(filterNom || filterStatut || filterPriorite || filterCanal || filterAffecte || filterTacheLiee || filterDateFrom || filterDateTo) && (
            <button onClick={() => { setFilterNom(''); setFilterStatut(''); setFilterPriorite(''); setFilterCanal(''); setFilterAffecte(''); setFilterTacheLiee(''); setFilterDateFrom(''); setFilterDateTo(''); }}
              style={{ ...tabInputStyle, cursor: 'pointer', color: 'var(--accent)' }}>✕ Effacer</button>
          )}
        </div>
      )}
      <div className="flex-1 overflow-auto">
        {loading && <p className="text-xs px-4 py-3" style={{ color: 'var(--text-muted)' }}>Chargement…</p>}
        {error && <p className="text-xs px-4 py-3" style={{ color: 'var(--color-error, #e53e3e)' }}>{error}</p>}
        {!loading && !error && (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                {colHeaders.map(({ key, label }) => (
                  <th key={key} onClick={() => toggleSort(key)} className="text-left px-3 py-2 cursor-pointer select-none font-medium">
                    {label}{sort.col === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                ))}
                <th className="text-left px-3 py-2 font-medium">Tâche liée</th>
                {!isClient && <th className="text-left px-3 py-2 font-medium">Lien</th>}
              </tr>
            </thead>
            <tbody>
              {grouped
                ? grouped.map(([tacheNom, rows]) => (
                    <React.Fragment key={`grp-${tacheNom}`}>
                      <tr>
                        <td colSpan={isClient ? 8 : 9} style={{
                          padding: '4px 12px', fontWeight: 700, fontSize: 11,
                          background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                          color: 'var(--accent)', borderTop: '1px solid var(--border)',
                        }}>
                          {tacheNom}
                          <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>
                            {rows.length} sous-tâche{rows.length !== 1 ? 's' : ''}
                          </span>
                        </td>
                      </tr>
                      {rows.map(e => <SousTacheRow key={e.id} e={e} isClient={isClient} selectedId={selectedId} onSelectRow={onSelectRow} />)}
                    </React.Fragment>
                  ))
                : sorted.map(e => <SousTacheRow key={e.id} e={e} isClient={isClient} selectedId={selectedId} onSelectRow={onSelectRow} />)
              }
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={isClient ? 8 : 9} className="px-3 py-4 text-center" style={{ color: 'var(--text-muted)' }}>
                    Aucune sous-tâche{!showTermine ? ' en cours' : ''}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── SuiviProjetTab ────────────────────────────────────────────────────────────

function SuiviProjetTab({
  projetId,
  projetCode,
  tacheIdToName,
  tachesReady,
  refreshKey,
  selectedId,
  onSelectRow,
}: {
  projetId: string;
  projetCode?: string;
  tacheIdToName: Map<string, string>;
  tachesReady: boolean;
  refreshKey: number;
  selectedId: string | null;
  onSelectRow: (id: string, title: string, url?: string) => void;
}) {
  const config = load<SuiviProjetConfig>('suiviProjetConfig', {
    databaseId: '', nomField: 'Name', dateField: '', statutField: '',
    tacheField: '', statutTermineValue: 'Terminé',
  });

  const [entries, setEntries] = useState<SuiviProjetEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showTermine, setShowTermine] = useState(false);
  const [sort, setSort] = useState<{ col: 'nom' | 'date' | 'statut'; dir: 'asc' | 'desc' }>({ col: 'date', dir: 'desc' });

  useEffect(() => {
    if (!config.databaseId) {
      const demo = getDemoStore();
      if (demo?.capProjects[projetId]) setEntries(demo.capProjects[projetId].suiviProjets);
      setLoading(false);
      return;
    }
    if (!tachesReady) return;
    setLoading(true);
    fetchSuivisProjet(config, tacheIdToName, projetId, projetCode)
      .then(setEntries)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [tachesReady, config.databaseId, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() =>
    showTermine ? entries : entries.filter(e => e.statut !== config.statutTermineValue),
    [entries, showTermine, config.statutTermineValue],
  );

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const va = sort.col === 'date' ? (a.date ?? '') : String(a[sort.col] ?? '');
    const vb = sort.col === 'date' ? (b.date ?? '') : String(b[sort.col] ?? '');
    return sort.dir === 'asc' ? va.localeCompare(vb, 'fr') : vb.localeCompare(va, 'fr');
  }), [filtered, sort]);

  function toggleSort(col: typeof sort.col) {
    setSort(s => ({ col, dir: s.col === col && s.dir === 'asc' ? 'desc' : 'asc' }));
  }

  if (!config.databaseId) {
    return <EmptyConfig message="Configurez la base Suivi dans les Paramètres > CAP CONSULTING." />;
  }

  const colHeaders: Array<{ key: typeof sort.col; label: string }> = [
    { key: 'nom', label: 'Nom' },
    { key: 'date', label: 'Date' },
    { key: 'statut', label: 'Statut' },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-2 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {filtered.length} suivi{filtered.length !== 1 ? 's' : ''}
        </span>
        <div className="ml-auto">
          <TermineButton showTermine={showTermine} onToggle={() => setShowTermine(v => !v)} />
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {loading && <p className="text-xs px-4 py-3" style={{ color: 'var(--text-muted)' }}>Chargement…</p>}
        {error && <p className="text-xs px-4 py-3" style={{ color: 'var(--color-error, #e53e3e)' }}>{error}</p>}
        {!loading && !error && (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                {colHeaders.map(({ key, label }) => (
                  <th key={key} onClick={() => toggleSort(key)} className="text-left px-3 py-2 cursor-pointer select-none font-medium">
                    {label}{sort.col === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                ))}
                <th className="text-left px-3 py-2 font-medium">Tâche liée</th>
                <th className="text-left px-3 py-2 font-medium">Lien</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(e => (
                <tr
                  key={e.id}
                  onClick={() => onSelectRow(e.id, e.nom, e.notion_url)}
                  className="cursor-pointer"
                  style={{
                    borderBottom: '1px solid var(--border)',
                    background: selectedId === e.id ? 'color-mix(in srgb, var(--accent) 9%, transparent)' : undefined,
                  }}
                  onMouseEnter={ev => { if (selectedId !== e.id) ev.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 4%, transparent)'; }}
                  onMouseLeave={ev => { if (selectedId !== e.id) ev.currentTarget.style.background = ''; }}
                >
                  <td className="px-3 py-2 font-medium" style={{ color: 'var(--text)' }}>{e.nom || '(sans nom)'}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{formatDate(e.date)}</td>
                  <td className="px-3 py-2"><Badge label={e.statut} color={e.statutColor} /></td>
                  <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{e.tacheNoms.join(', ') || '—'}</td>
                  <td className="px-3 py-2"><LienCell url={e.notion_url} /></td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center" style={{ color: 'var(--text-muted)' }}>
                    Aucun suivi{!showTermine ? ' en cours' : ''}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── EchangesTab ───────────────────────────────────────────────────────────────

function EchangesTab({
  projetId,
  projetCode,
  refreshKey,
  selectedId,
  onSelectRow,
}: {
  projetId: string;
  projetCode?: string;
  refreshKey: number;
  selectedId: string | null;
  onSelectRow: (id: string, title: string, url?: string) => void;
}) {
  const config = load<EchangesConfig>('echangesConfig', {
    databaseId: '', nomField: 'Name', dateField: '', canalField: '',
    contactField: '', projetField: '', suiviField: '', tacheField: '',
  });

  const [entries, setEntries] = useState<EchangeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sort, setSort] = useState<{ col: 'nom' | 'date' | 'canal' | 'contact' | 'suivi' | 'tacheNoms'; dir: 'asc' | 'desc' }>({ col: 'date', dir: 'desc' });
  const [showFilters, setShowFilters] = useState(false);
  const [filterNom, setFilterNom] = useState('');
  const [filterCanal, setFilterCanal] = useState('');
  const [filterContact, setFilterContact] = useState('');
  const [filterSuivi, setFilterSuivi] = useState('');
  const [filterTache, setFilterTache] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  useEffect(() => {
    if (!config.databaseId) {
      const demo = getDemoStore();
      if (demo?.capProjects[projetId]) setEntries(demo.capProjects[projetId].echanges);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchEchanges(config, projetId, projetCode)
      .then(setEntries)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [projetId, config.databaseId, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const allCanaux = useMemo(() => [...new Set(entries.map(e => e.canal).filter(Boolean))].sort(), [entries]);

  const filtered = useMemo(() => entries.filter(e => {
    if (filterNom && !e.nom.toLowerCase().includes(filterNom.toLowerCase())) return false;
    if (filterCanal && e.canal !== filterCanal) return false;
    if (filterContact && !e.contact.some(c => c.toLowerCase().includes(filterContact.toLowerCase()))) return false;
    if (filterSuivi && !e.suivi.some(s => s.toLowerCase().includes(filterSuivi.toLowerCase()))) return false;
    if (filterTache && !e.tacheNoms.some(t => t.toLowerCase().includes(filterTache.toLowerCase()))) return false;
    if (filterDateFrom && (e.date ?? '') < filterDateFrom) return false;
    if (filterDateTo && (e.date ?? '') > filterDateTo) return false;
    return true;
  }), [entries, filterNom, filterCanal, filterContact, filterSuivi, filterTache, filterDateFrom, filterDateTo]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    let va: string, vb: string;
    if (sort.col === 'date') {
      va = a.date ?? ''; vb = b.date ?? '';
    } else if (sort.col === 'contact' || sort.col === 'suivi' || sort.col === 'tacheNoms') {
      va = a[sort.col][0] ?? ''; vb = b[sort.col][0] ?? '';
    } else {
      va = String(a[sort.col] ?? ''); vb = String(b[sort.col] ?? '');
    }
    return sort.dir === 'asc' ? va.localeCompare(vb, 'fr') : vb.localeCompare(va, 'fr');
  }), [filtered, sort]);

  function toggleSort(col: typeof sort.col) {
    setSort(s => ({ col, dir: s.col === col && s.dir === 'asc' ? 'desc' : 'asc' }));
  }

  if (!config.databaseId) {
    return <EmptyConfig message="Configurez la base Echanges dans les Paramètres > CAP CONSULTING." />;
  }

  const colHeaders: Array<{ key: typeof sort.col; label: string }> = [
    { key: 'nom', label: 'Nom' },
    { key: 'date', label: 'Date' },
    { key: 'canal', label: 'Canal' },
    { key: 'contact', label: 'Contact' },
    { key: 'suivi', label: 'Suivi' },
    { key: 'tacheNoms', label: 'Tâche' },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-2 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {sorted.length} échange{sorted.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={() => setShowFilters(v => !v)}
          className="text-xs px-2 py-1 rounded ml-auto"
          style={{
            background: showFilters ? 'var(--accent)' : 'var(--border)',
            color: showFilters ? 'var(--accent-fg)' : 'var(--text)',
          }}
        >
          ▼ Filtres
        </button>
      </div>
      {showFilters && (
        <div style={{ display: 'flex', gap: 6, padding: '6px 12px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', alignItems: 'center', background: 'var(--bg-deep)' }}>
          <input style={{ ...tabInputStyle, width: 140 }} placeholder="Nom…" value={filterNom} onChange={e => setFilterNom(e.target.value)} />
          <select style={{ ...tabInputStyle, width: 130 }} value={filterCanal} onChange={e => setFilterCanal(e.target.value)}>
            <option value="">Canal</option>
            {allCanaux.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <input style={{ ...tabInputStyle, width: 130 }} placeholder="Contact…" value={filterContact} onChange={e => setFilterContact(e.target.value)} />
          <input style={{ ...tabInputStyle, width: 130 }} placeholder="Suivi…" value={filterSuivi} onChange={e => setFilterSuivi(e.target.value)} />
          <input style={{ ...tabInputStyle, width: 130 }} placeholder="Tâche…" value={filterTache} onChange={e => setFilterTache(e.target.value)} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input id="echanges-date-from" type="date" style={{ ...tabInputStyle, width: 130, paddingRight: 26 }} value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
            <span onClick={() => (document.getElementById('echanges-date-from') as HTMLInputElement)?.showPicker?.()} style={{ position: 'absolute', right: 7, cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)' }}>📅</span>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>→</span>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input id="echanges-date-to" type="date" style={{ ...tabInputStyle, width: 130, paddingRight: 26 }} value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
            <span onClick={() => (document.getElementById('echanges-date-to') as HTMLInputElement)?.showPicker?.()} style={{ position: 'absolute', right: 7, cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)' }}>📅</span>
          </div>
          {(filterNom || filterCanal || filterContact || filterSuivi || filterTache || filterDateFrom || filterDateTo) && (
            <button onClick={() => { setFilterNom(''); setFilterCanal(''); setFilterContact(''); setFilterSuivi(''); setFilterTache(''); setFilterDateFrom(''); setFilterDateTo(''); }}
              style={{ ...tabInputStyle, cursor: 'pointer', color: 'var(--accent)' }}>✕ Effacer</button>
          )}
        </div>
      )}
      <div className="flex-1 overflow-auto">
        {loading && <p className="text-xs px-4 py-3" style={{ color: 'var(--text-muted)' }}>Chargement…</p>}
        {error && <p className="text-xs px-4 py-3" style={{ color: 'var(--color-error, #e53e3e)' }}>{error}</p>}
        {!loading && !error && (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                {colHeaders.map(({ key, label }) => (
                  <th key={key} onClick={() => toggleSort(key)} className="text-left px-3 py-2 cursor-pointer select-none font-medium">
                    {label}{sort.col === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                ))}
                <th className="text-left px-3 py-2 font-medium">Lien</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(e => (
                <tr
                  key={e.id}
                  onClick={() => onSelectRow(e.id, e.nom, e.notion_url)}
                  className="cursor-pointer"
                  style={{
                    borderBottom: '1px solid var(--border)',
                    background: selectedId === e.id ? 'color-mix(in srgb, var(--accent) 9%, transparent)' : undefined,
                  }}
                  onMouseEnter={ev => { if (selectedId !== e.id) ev.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 4%, transparent)'; }}
                  onMouseLeave={ev => { if (selectedId !== e.id) ev.currentTarget.style.background = ''; }}
                >
                  <td className="px-3 py-2 font-medium" style={{ color: 'var(--text)' }}>{e.nom || '(sans nom)'}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{formatDate(e.date)}</td>
                  <td className="px-3 py-2"><Badge label={e.canal} color={e.canalColor} /></td>
                  <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{e.contact.join(', ') || '—'}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{e.suivi.join(', ') || '—'}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{e.tacheNoms.join(', ') || '—'}</td>
                  <td className="px-3 py-2"><LienCell url={e.notion_url} /></td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center" style={{ color: 'var(--text-muted)' }}>
                    Aucun échange.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── DocumentsTab ──────────────────────────────────────────────────────────────

function DocumentsTab({
  projetId,
  projetCode,
  refreshKey,
  isClient,
  selectedId,
  onSelectRow,
}: {
  projetId: string;
  projetCode?: string;
  refreshKey: number;
  isClient?: boolean;
  selectedId: string | null;
  onSelectRow: (id: string, title: string, url?: string, sharedUrl?: string, date?: string, projet?: string) => void;
}) {
  const config = load<DocumentsConfig>('documentsConfig', {
    databaseId: '', nomField: 'Name', statutField: '',
  });

  const [entries, setEntries] = useState<DocumentEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sort, setSort] = useState<{ col: 'nom' | 'statut' | 'date' | 'projet'; dir: 'asc' | 'desc' }>({ col: 'nom', dir: 'asc' });
  const [showFilters, setShowFilters] = useState(false);
  const [filterNom, setFilterNom] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterProjet, setFilterProjet] = useState('');

  useEffect(() => {
    if (!config.databaseId) {
      const demo = getDemoStore();
      if (demo?.capProjects[projetId]) setEntries(demo.capProjects[projetId].documents);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchDocuments(config, projetId, projetCode)
      .then(setEntries)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [projetId, config.databaseId, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const allStatuts = useMemo(() => [...new Set(entries.map(e => e.statut).filter(Boolean))].sort(), [entries]);
  const allProjets = useMemo(() => [...new Set(entries.map(e => e.projet).filter((p): p is string => !!p))].sort(), [entries]);

  const filtered = useMemo(() => entries.filter(e => {
    if (isClient && e.statut !== 'Transmis') return false;
    if (filterNom && !e.nom.toLowerCase().includes(filterNom.toLowerCase())) return false;
    if (filterStatut && e.statut !== filterStatut) return false;
    if (filterProjet && e.projet !== filterProjet) return false;
    return true;
  }), [entries, isClient, filterNom, filterStatut, filterProjet]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const va = String(a[sort.col] ?? '');
    const vb = String(b[sort.col] ?? '');
    return sort.dir === 'asc' ? va.localeCompare(vb, 'fr') : vb.localeCompare(va, 'fr');
  }), [filtered, sort]);

  function toggleSort(col: typeof sort.col) {
    setSort(s => ({ col, dir: s.col === col && s.dir === 'asc' ? 'desc' : 'asc' }));
  }

  if (!config.databaseId && !entries.length) {
    return <EmptyConfig message="Configurez la base Documents dans les Paramètres > CAP CONSULTING." />;
  }

  const colHeaders: Array<{ key: typeof sort.col; label: string }> = [
    { key: 'nom', label: 'Nom' },
    { key: 'statut', label: 'Statut' },
    ...(config.projetNomField ? [{ key: 'projet' as const, label: 'Projet' }] : []),
    { key: 'date', label: 'Date' },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-2 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {filtered.length} document{filtered.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={() => setShowFilters(v => !v)}
          className="text-xs px-2 py-1 rounded ml-auto"
          style={{
            background: showFilters ? 'var(--accent)' : 'var(--border)',
            color: showFilters ? 'var(--accent-fg)' : 'var(--text)',
          }}
        >
          ▼ Filtres
        </button>
      </div>
      {showFilters && (
        <div style={{ display: 'flex', gap: 6, padding: '6px 12px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', alignItems: 'center', background: 'var(--bg-deep)' }}>
          <input style={{ ...tabInputStyle, width: 160 }} placeholder="Nom…" value={filterNom} onChange={e => setFilterNom(e.target.value)} />
          <select style={{ ...tabInputStyle, width: 140 }} value={filterStatut} onChange={e => setFilterStatut(e.target.value)}>
            <option value="">Statut</option>
            {allStatuts.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          {allProjets.length > 0 && (
            <select style={{ ...tabInputStyle, width: 160 }} value={filterProjet} onChange={e => setFilterProjet(e.target.value)}>
              <option value="">Projet</option>
              {allProjets.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          )}
          {(filterNom || filterStatut || filterProjet) && (
            <button onClick={() => { setFilterNom(''); setFilterStatut(''); setFilterProjet(''); }}
              style={{ ...tabInputStyle, cursor: 'pointer', color: 'var(--accent)' }}>✕ Effacer</button>
          )}
        </div>
      )}
      <div className="flex-1 overflow-auto">
        {loading && <p className="text-xs px-4 py-3" style={{ color: 'var(--text-muted)' }}>Chargement…</p>}
        {error && <p className="text-xs px-4 py-3" style={{ color: 'var(--color-error, #e53e3e)' }}>{error}</p>}
        {!loading && !error && (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                {colHeaders.map(({ key, label }) => (
                  <th key={key} onClick={() => toggleSort(key)} className="text-left px-3 py-2 cursor-pointer select-none font-medium">
                    {label}{sort.col === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                ))}
                {!isClient && <th className="text-left px-3 py-2 font-medium">Notion</th>}
                <th className="text-left px-3 py-2 font-medium">URL partagée</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(e => (
                <tr
                  key={e.id}
                  onClick={() => onSelectRow(e.id, e.nom, e.notion_url, e.notionUrlShared, e.date ?? undefined, e.projet)}
                  className="cursor-pointer"
                  style={{
                    borderBottom: '1px solid var(--border)',
                    background: selectedId === e.id ? 'color-mix(in srgb, var(--accent) 9%, transparent)' : undefined,
                  }}
                  onMouseEnter={ev => { if (selectedId !== e.id) ev.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 4%, transparent)'; }}
                  onMouseLeave={ev => { if (selectedId !== e.id) ev.currentTarget.style.background = ''; }}
                >
                  <td className="px-3 py-2 font-medium" style={{ color: 'var(--text)' }}>{e.nom || '(sans nom)'}</td>
                  <td className="px-3 py-2"><Badge label={e.statut} color={e.statutColor} /></td>
                  {config.projetNomField && <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{e.projet || '—'}</td>}
                  <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{formatDate(e.date ?? null)}</td>
                  {!isClient && <td className="px-3 py-2"><LienCell url={e.notion_url} /></td>}
                  <td className="px-3 py-2"><LienCell url={e.notionUrlShared} /></td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={colHeaders.length + (isClient ? 1 : 2)} className="px-3 py-4 text-center" style={{ color: 'var(--text-muted)' }}>
                    Aucun document.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── TempsProjetTab ────────────────────────────────────────────────────────────

type TempsGroupLevel = 'none' | 'jour' | 'semaine' | 'mois' | 'tache';

function getISOWeekYear(date: Date): { week: number; year: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return {
    week: Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7),
    year: d.getUTCFullYear(),
  };
}

function getTempsGroupKey(e: TempsProjetEntry, level: TempsGroupLevel): string {
  if (level === 'none') return '';
  if (level === 'tache') return e.tacheNoms[0] ?? '(Sans tâche)';
  const d = e.debut ? new Date(e.debut) : null;
  if (!d || isNaN(d.getTime())) return '(Sans date)';
  if (level === 'jour') return d.toISOString().slice(0, 10);
  if (level === 'semaine') {
    const { week, year } = getISOWeekYear(d);
    return `${year}-W${String(week).padStart(2, '0')}`;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getTempsGroupLabel(key: string, level: TempsGroupLevel): string {
  if (level === 'tache' || key === '(Sans date)' || key === '(Sans tâche)') return key;
  if (level === 'jour') {
    const d = new Date(key + 'T12:00:00');
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  if (level === 'semaine') {
    const m = key.match(/^(\d{4})-W(\d+)$/);
    if (m) return `Semaine ${parseInt(m[2])} – ${m[1]}`;
    return key;
  }
  // mois
  const [y, mo] = key.split('-');
  return new Date(parseInt(y), parseInt(mo) - 1, 1)
    .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

function TempsRow({ e, isClient, selectedId, onSelectRow }: {
  e: TempsProjetEntry;
  isClient?: boolean;
  selectedId: string | null;
  onSelectRow: (id: string, title: string, url?: string) => void;
}) {
  return (
    <tr
      onClick={() => onSelectRow(e.id, e.description, e.notion_url)}
      className="cursor-pointer"
      style={{
        borderBottom: '1px solid var(--border)',
        background: selectedId === e.id ? 'color-mix(in srgb, var(--accent) 9%, transparent)' : undefined,
      }}
      onMouseEnter={ev => { if (selectedId !== e.id) ev.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 4%, transparent)'; }}
      onMouseLeave={ev => { if (selectedId !== e.id) ev.currentTarget.style.background = ''; }}
    >
      <td className="px-3 py-2 font-medium" style={{ color: 'var(--text)' }}>{e.description || '(sans titre)'}</td>
      <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{formatDateTime(e.debut)}</td>
      <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{formatDateTime(e.fin)}</td>
      <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{formatNum(e.dureeMin, 0)}</td>
      <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{formatNum(e.dureeH)}</td>
      <td className="px-3 py-2" style={{ color: 'var(--text-muted)', fontWeight: e.facturableH ? 600 : undefined }}>{formatNum(e.facturableH)}</td>
      <td className="px-3 py-2" style={{ color: 'var(--text-muted)' }}>{e.tacheNoms.join(', ') || '—'}</td>
      {!isClient && <td className="px-3 py-2"><LienCell url={e.notion_url} /></td>}
    </tr>
  );
}

function TempsProjetTab({
  projetId,
  projetCode,
  tacheIdToName,
  tachesReady,
  refreshKey,
  isClient,
  selectedId,
  onSelectRow,
}: {
  projetId: string;
  projetCode?: string;
  tacheIdToName: Map<string, string>;
  tachesReady: boolean;
  refreshKey: number;
  isClient?: boolean;
  selectedId: string | null;
  onSelectRow: (id: string, title: string, url?: string) => void;
}) {
  const config = load<TempsProjetConfig>('tempsProjetConfig', {
    databaseId: '', descriptionField: 'Name', debutField: '', finField: '',
    dureeMinField: '', dureeHField: '', tacheField: '',
  });

  const [entries, setEntries] = useState<TempsProjetEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sort, setSort] = useState<{ col: 'description' | 'debut' | 'fin' | 'dureeMin' | 'dureeH'; dir: 'asc' | 'desc' }>({ col: 'debut', dir: 'desc' });
  const [groupLevel1, setGroupLevel1] = useState<TempsGroupLevel>('none');
  const [groupLevel2, setGroupLevel2] = useState<TempsGroupLevel>('none');
  const [showFilters, setShowFilters] = useState(false);
  const [filterDescription, setFilterDescription] = useState('');
  const [filterTache, setFilterTache] = useState('');
  const [filterDebutFrom, setFilterDebutFrom] = useState('');
  const [filterDebutTo, setFilterDebutTo] = useState('');

  useEffect(() => {
    if (!config.databaseId) {
      const demo = getDemoStore();
      if (demo?.capProjects[projetId]) setEntries(demo.capProjects[projetId].tempsProjets);
      setLoading(false);
      return;
    }
    if (!tachesReady) return;
    setLoading(true);
    fetchTempsProjet(config, tacheIdToName, projetId, projetCode)
      .then(setEntries)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [tachesReady, config.databaseId, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => entries.filter(e => {
    if (filterDescription && !e.description.toLowerCase().includes(filterDescription.toLowerCase())) return false;
    if (filterTache && !e.tacheNoms.some(t => t.toLowerCase().includes(filterTache.toLowerCase()))) return false;
    if (filterDebutFrom && (e.debut ?? '') < filterDebutFrom) return false;
    if (filterDebutTo && (e.debut ?? '') > filterDebutTo) return false;
    return true;
  }), [entries, filterDescription, filterTache, filterDebutFrom, filterDebutTo]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const va = (sort.col === 'debut' || sort.col === 'fin') ? (a[sort.col] ?? '') : String(a[sort.col] ?? '');
    const vb = (sort.col === 'debut' || sort.col === 'fin') ? (b[sort.col] ?? '') : String(b[sort.col] ?? '');
    return sort.dir === 'asc' ? va.localeCompare(vb, 'fr') : vb.localeCompare(va, 'fr');
  }), [filtered, sort]);

  const grouped = useMemo(() => {
    if (groupLevel1 === 'none') return null;
    const map = new Map<string, TempsProjetEntry[]>();
    for (const e of sorted) {
      const k = getTempsGroupKey(e, groupLevel1);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    }
    const sorted1 = [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'fr'));
    return sorted1.map(([key, entries]) => {
      const sub = groupLevel2 === 'none' ? null : (() => {
        const subMap = new Map<string, TempsProjetEntry[]>();
        for (const e of entries) {
          const k2 = getTempsGroupKey(e, groupLevel2);
          if (!subMap.has(k2)) subMap.set(k2, []);
          subMap.get(k2)!.push(e);
        }
        return [...subMap.entries()]
          .sort(([a], [b]) => a.localeCompare(b, 'fr'))
          .map(([k2, rows]) => ({ key: k2, label: getTempsGroupLabel(k2, groupLevel2), entries: rows }));
      })();
      return { key, label: getTempsGroupLabel(key, groupLevel1), entries, sub };
    });
  }, [sorted, groupLevel1, groupLevel2]);

  function toggleSort(col: typeof sort.col) {
    setSort(s => ({ col, dir: s.col === col && s.dir === 'asc' ? 'desc' : 'asc' }));
  }

  if (!config.databaseId) {
    return <EmptyConfig message="Configurez la base Temps dans les Paramètres > CAP CONSULTING." />;
  }

  const showFacturableH = !!config.facturableHField;

  const colHeaders: Array<{ key: typeof sort.col; label: string }> = [
    { key: 'description', label: 'Description' },
    { key: 'debut', label: 'Début session' },
    { key: 'fin', label: 'Fin session' },
    { key: 'dureeMin', label: 'Durée (min)' },
    { key: 'dureeH', label: 'Durée (h)' },
  ];

  function parseH(v: string): number { const n = parseFloat(v.replace(',', '.')); return isNaN(n) ? 0 : n; }
  function sumDureeH(rows: TempsProjetEntry[]): number { return rows.reduce((s, e) => s + parseH(e.dureeH), 0); }
  function sumFactH(rows: TempsProjetEntry[]): number { return rows.reduce((s, e) => s + parseH(e.facturableH ?? ''), 0); }
  function fmtH(n: number): string { return n.toFixed(2); }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-2 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {sorted.length} session{sorted.length !== 1 ? 's' : ''}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowFilters(v => !v)}
            className="text-xs px-2 py-1 rounded"
            style={{
              background: showFilters ? 'var(--accent)' : 'var(--border)',
              color: showFilters ? 'var(--accent-fg)' : 'var(--text)',
            }}
          >
            ▼ Filtres
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>⊞</span>
            <select
              value={groupLevel1}
              onChange={ev => {
                const v = ev.target.value as TempsGroupLevel;
                setGroupLevel1(v);
                if (v === 'none') setGroupLevel2('none');
              }}
              className="text-xs py-1 rounded"
              style={{
                padding: '2px 6px',
                background: groupLevel1 !== 'none' ? 'var(--accent)' : 'var(--border)',
                color: groupLevel1 !== 'none' ? 'var(--accent-fg)' : 'var(--text)',
                border: 'none',
                cursor: 'pointer',
              }}
              title="Grouper par"
            >
              <option value="none">Par…</option>
              <option value="jour">Jour</option>
              <option value="semaine">Semaine</option>
              <option value="mois">Mois</option>
              <option value="tache">Tâche</option>
            </select>
            {groupLevel1 !== 'none' && (
              <>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>puis</span>
                <select
                  value={groupLevel2}
                  onChange={ev => setGroupLevel2(ev.target.value as TempsGroupLevel)}
                  className="text-xs py-1 rounded"
                  style={{
                    padding: '2px 6px',
                    background: groupLevel2 !== 'none' ? 'var(--accent)' : 'var(--border)',
                    color: groupLevel2 !== 'none' ? 'var(--accent-fg)' : 'var(--text)',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                  title="Puis grouper par"
                >
                  <option value="none">—</option>
                  <option value="jour">Jour</option>
                  <option value="semaine">Semaine</option>
                  <option value="mois">Mois</option>
                  <option value="tache">Tâche</option>
                </select>
              </>
            )}
          </div>
        </div>
      </div>
      {showFilters && (
        <div style={{ display: 'flex', gap: 6, padding: '6px 12px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', alignItems: 'center', background: 'var(--bg-deep)' }}>
          <input style={{ ...tabInputStyle, width: 160 }} placeholder="Description…" value={filterDescription} onChange={e => setFilterDescription(e.target.value)} />
          <input style={{ ...tabInputStyle, width: 140 }} placeholder="Tâche…" value={filterTache} onChange={e => setFilterTache(e.target.value)} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Début :</span>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input id="temps-debut-from" type="date" style={{ ...tabInputStyle, width: 130, paddingRight: 26 }} value={filterDebutFrom} onChange={e => setFilterDebutFrom(e.target.value)} />
            <span onClick={() => (document.getElementById('temps-debut-from') as HTMLInputElement)?.showPicker?.()} style={{ position: 'absolute', right: 7, cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)' }}>📅</span>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>→</span>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input id="temps-debut-to" type="date" style={{ ...tabInputStyle, width: 130, paddingRight: 26 }} value={filterDebutTo} onChange={e => setFilterDebutTo(e.target.value)} />
            <span onClick={() => (document.getElementById('temps-debut-to') as HTMLInputElement)?.showPicker?.()} style={{ position: 'absolute', right: 7, cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)' }}>📅</span>
          </div>
          {(filterDescription || filterTache || filterDebutFrom || filterDebutTo) && (
            <button onClick={() => { setFilterDescription(''); setFilterTache(''); setFilterDebutFrom(''); setFilterDebutTo(''); }}
              style={{ ...tabInputStyle, cursor: 'pointer', color: 'var(--accent)' }}>✕ Effacer</button>
          )}
        </div>
      )}
      <div className="flex-1 overflow-auto">
        {loading && <p className="text-xs px-4 py-3" style={{ color: 'var(--text-muted)' }}>Chargement…</p>}
        {error && <p className="text-xs px-4 py-3" style={{ color: 'var(--color-error, #e53e3e)' }}>{error}</p>}
        {!loading && !error && (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                {colHeaders.map(({ key, label }) => (
                  <th key={key} onClick={() => toggleSort(key)} className="text-left px-3 py-2 cursor-pointer select-none font-medium">
                    {label}{sort.col === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                ))}
                {showFacturableH && <th className="text-left px-3 py-2 font-medium">Facturable (h)</th>}
                <th className="text-left px-3 py-2 font-medium">Tâches</th>
                {!isClient && <th className="text-left px-3 py-2 font-medium">Lien</th>}
              </tr>
            </thead>
            <tbody>
              {grouped
                ? grouped.map(({ key, label, entries, sub }) => (
                    <React.Fragment key={`g1-${key}`}>
                      {/* Niveau 1 */}
                      <tr style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', borderTop: '2px solid color-mix(in srgb, var(--accent) 25%, transparent)' }}>
                        <td colSpan={4} style={{ padding: '5px 12px', fontWeight: 700, fontSize: 11, color: 'var(--accent)' }}>
                          {label}
                          <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>
                            {entries.length} session{entries.length !== 1 ? 's' : ''}
                          </span>
                        </td>
                        <td className="px-3 py-1" style={{ color: 'var(--accent)', fontSize: 11, fontWeight: 700 }}>{fmtH(sumDureeH(entries))} h</td>
                        {showFacturableH && <td className="px-3 py-1" style={{ color: 'var(--accent)', fontSize: 11, fontWeight: 700 }}>{fmtH(sumFactH(entries))} h</td>}
                        <td colSpan={isClient ? 1 : 2} />
                      </tr>
                      {sub
                        ? sub.map(({ key: k2, label: l2, entries: rows }) => (
                            <React.Fragment key={`g2-${k2}`}>
                              {/* Niveau 2 */}
                              <tr style={{ background: 'color-mix(in srgb, var(--accent) 5%, transparent)', borderTop: '1px solid var(--border)' }}>
                                <td colSpan={4} style={{ padding: '3px 28px', fontWeight: 600, fontSize: 11, color: 'var(--text-muted)' }}>
                                  {l2}
                                  <span style={{ fontWeight: 400, marginLeft: 8 }}>
                                    {rows.length} session{rows.length !== 1 ? 's' : ''}
                                  </span>
                                </td>
                                <td className="px-3 py-1" style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600 }}>{fmtH(sumDureeH(rows))} h</td>
                                {showFacturableH && <td className="px-3 py-1" style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600 }}>{fmtH(sumFactH(rows))} h</td>}
                                <td colSpan={isClient ? 1 : 2} />
                              </tr>
                              {rows.map(e => <TempsRow key={e.id} e={e} isClient={isClient} selectedId={selectedId} onSelectRow={onSelectRow} />)}
                            </React.Fragment>
                          ))
                        : entries.map(e => <TempsRow key={e.id} e={e} isClient={isClient} selectedId={selectedId} onSelectRow={onSelectRow} />)
                      }
                    </React.Fragment>
                  ))
                : sorted.map(e => <TempsRow key={e.id} e={e} isClient={isClient} selectedId={selectedId} onSelectRow={onSelectRow} />)
              }
              {sorted.length > 0 && showFacturableH && (
                <tr style={{ background: 'color-mix(in srgb, var(--accent) 16%, transparent)', borderTop: '2px solid color-mix(in srgb, var(--accent) 30%, transparent)' }}>
                  <td colSpan={4} className="px-3 py-2" style={{ fontWeight: 700, fontSize: 11, color: 'var(--text)' }}>Total</td>
                  <td className="px-3 py-2" style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 11 }}>{fmtH(sumDureeH(sorted))} h</td>
                  <td className="px-3 py-2" style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 11 }}>{fmtH(sumFactH(sorted))} h</td>
                  <td colSpan={isClient ? 1 : 2} />
                </tr>
              )}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={showFacturableH ? (isClient ? 7 : 8) : (isClient ? 6 : 7)} className="px-3 py-4 text-center" style={{ color: 'var(--text-muted)' }}>
                    Aucune session de temps.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── EmptyConfig ───────────────────────────────────────────────────────────────

function EmptyConfig({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-full px-6">
      <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>{message}</p>
    </div>
  );
}
