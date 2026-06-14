import Link from 'next/link';
import { Initials } from '@/components/icons';

export type PodiumItem = { id: string; name: string; sub?: string; score: number | null };

export function Podium({
  items, href, colorFor,
}: {
  items: PodiumItem[];
  href: (id: string) => string;
  colorFor: (score: number | null) => string;
}) {
  if (items.length === 0) return null;
  const order = [items[1], items[0], items[2]].filter(Boolean) as PodiumItem[];
  return (
    <div className="podium" style={{ marginBottom: 20 }}>
      {order.map((it) => {
        const rank = items[0] === it ? 1 : items[1] === it ? 2 : 3;
        const isFirst = rank === 1;
        return (
          <Link key={it.id} href={href(it.id)} prefetch={false}
            style={{ textDecoration: 'none', flex: 1, maxWidth: 200 }}>
            <div className={`podium-card${isFirst ? ' first' : ''}`}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--kuning-ink)', marginBottom: 6 }}>
                #{rank}
                {isFirst && (
                  <span style={{ marginLeft: 5, fontSize: 10, background: 'var(--kuning)', color: '#fff', padding: '1px 5px', borderRadius: 4 }}>Terbaik</span>
                )}
              </div>
              <div className="avatar" style={{ width: 40, height: 40, fontSize: 14, margin: '0 auto 8px', background: 'var(--accent-tint)', color: 'var(--accent-2)' }}>
                <Initials name={it.name} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink)' }}>{it.name}</div>
              {it.sub && (
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.sub}</div>
              )}
              <div className="t-mono" style={{ fontSize: 20, fontWeight: 700, marginTop: 8, color: colorFor(it.score) }}>
                {it.score !== null ? it.score.toFixed(1) : '—'}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
