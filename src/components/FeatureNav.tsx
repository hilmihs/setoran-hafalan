import { getAllAccesses } from '@/lib/session';
import { featureLinksFor } from '@/lib/feature-links';

/**
 * Nav bar lintas-fitur: tampilkan link ke semua fitur yang session ini punya akses.
 * Server component — render di bawah topbar tiap halaman fitur.
 */
export async function FeatureNav({ current }: { current: string }) {
  const accesses = await getAllAccesses();
  const links = featureLinksFor(accesses);

  if (links.length <= 1) return null;

  return (
    <nav
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        marginBottom: 16,
        borderBottom: '1px solid var(--line)',
        paddingBottom: 10,
      }}
    >
      {links.map((l) =>
        l.href === current ? (
          <span
            key={l.href}
            className="btn btn-sm"
            style={{ background: 'var(--primary)', color: '#fff', cursor: 'default' }}
          >
            {l.navLabel}
          </span>
        ) : (
          <a key={l.href} href={l.href} className="btn btn-sm btn-ghost">
            {l.navLabel}
          </a>
        )
      )}
      <a href="/" className="btn btn-sm btn-ghost">
        Menu Utama
      </a>
    </nav>
  );
}
