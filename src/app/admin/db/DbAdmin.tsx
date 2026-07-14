'use client';

import { useState } from 'react';
import TableBrowser from './TableBrowser';
import Console from './Console';

interface TableInfo {
  name: string;
  rows: number;
}

export default function DbAdmin({ tables }: { tables: TableInfo[] }) {
  const [tab, setTab] = useState<'browse' | 'sql'>('browse');

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        <button
          type="button"
          className={`btn btn-sm ${tab === 'browse' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setTab('browse')}
        >
          Jelajah Tabel
        </button>
        <button
          type="button"
          className={`btn btn-sm ${tab === 'sql' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setTab('sql')}
        >
          SQL Console
        </button>
      </div>

      {tab === 'browse' ? <TableBrowser tables={tables} /> : <Console tables={tables} />}
    </div>
  );
}
