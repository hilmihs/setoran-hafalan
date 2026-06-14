import type { CSSProperties, ReactNode } from 'react';

export function SectionHeader({
  title, right, style,
}: { title: ReactNode; right?: ReactNode; style?: CSSProperties }) {
  return (
    <div className="section-row" style={style}>
      <div className="t-tiny">{title}</div>
      {right != null && <div className="t-small">{right}</div>}
    </div>
  );
}
