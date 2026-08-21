'use client';

import { useCallback, useRef, useState } from 'react';
import type { Gender } from '@/types/db';
import {
  scoreOf,
  tierOf,
  initials,
  emptyCounts,
  JALIY,
  KHAFIY,
  AMBANG,
  JENIS,
  type Jenis,
  type LahnCounts,
} from '@/lib/evaluasi';
import { Setup } from './screens/Setup';
import { Daftar } from './screens/Daftar';
import { Nilai } from './screens/Nilai';
import { Ringkasan } from './screens/Ringkasan';
import { Rapor } from './screens/Rapor';

// ── Types shared with the RSC page ──
export interface EvPeserta {
  id: string;
  nama: string;
  is_ketua: boolean;
  urutan: number;
}
export interface EvSesi {
  id: string;
  jenis: Jenis;
  nomor_sesi: number;
  tgl_jadwal: string | null;
  surat: string;
  ayat_mulai: number;
  ayat_selesai: number;
  ambang: number;
  status: 'draft' | 'terkirim';
}
export interface EvWork {
  counts: LahnCounts;
  catatan: string;
  ayat: number | null;
  done: boolean;
  confirmed: boolean;
  hadir: boolean;
}
export interface EvConfig {
  nama_qn: string;
  nama_pb: string;
  ujian_attempts: number;
  jadwal: { qn: string[]; pb: string[]; ujian: string[] };
}
export interface EvaluasiInitial {
  pengajarName: string;
  halaqah: {
    id: string;
    nama: string;
    gender: Gender;
    mustawa: number | null;
    ambang_ujian: number;
    pesertaCount: number;
  };
  config: EvConfig;
  peserta: EvPeserta[];
  sesiList: EvSesi[];
  work: Record<string, EvWork>;
  currentSession: Record<Jenis, number>;
}

export type Screen = 'p-home' | 'p-setup' | 'p-daftar' | 'p-nilai' | 'p-ringkasan' | 'p-rapor';
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

// Tile-color arrays (presentation, ported from mockup).
export const JALIY_SHADES = ['oklch(0.97 0.02 25)', 'oklch(0.93 0.05 25)', 'oklch(0.88 0.08 25)', 'oklch(0.82 0.11 25)', 'oklch(0.75 0.14 25)'];
export const JALIY_BORDERS = ['oklch(0.86 0.07 25)', 'oklch(0.80 0.09 25)', 'oklch(0.74 0.11 25)', 'oklch(0.68 0.13 25)', 'oklch(0.60 0.15 25)'];
export const KHAFIY_SHADES = ['#ffffff', 'oklch(0.96 0.02 85)', 'oklch(0.92 0.04 85)', 'oklch(0.87 0.06 85)', 'oklch(0.82 0.08 85)'];
export const KHAFIY_BORDERS = ['#e8e4dc', 'oklch(0.88 0.05 85)', 'oklch(0.84 0.07 85)', 'oklch(0.78 0.09 85)', 'oklch(0.72 0.11 85)'];

export interface Tile {
  key: string;
  label: string;
  count: number;
  tileBg: string;
  tileBorder: string;
  textColor: string;
  showMinus: boolean;
  tap: () => void;
  minus: (e: React.MouseEvent) => void;
  setCount: (e: React.ChangeEvent<HTMLInputElement>) => void;
  stop: (e: React.MouseEvent) => void;
}

const JENIS_SHORT: Record<Jenis, string> = { qn: 'QN', pb: 'PB', ujian: 'Ujian' };

function genderLabel(g: Gender): string {
  return g === 'ikhwan' ? 'Ikhwan' : 'Akhwat';
}
function fmtTgl(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtBulan(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
}
function workKey(id: string, jenis: Jenis, session: number): string {
  return `${id}|${jenis}|${session}`;
}
function defaultWork(ayat: number): EvWork {
  return { counts: emptyCounts(), catatan: '', ayat, done: false, confirmed: false, hadir: true };
}

export function EvaluasiPengajarApp({ initial }: { initial: EvaluasiInitial }) {
  const { halaqah, config, peserta } = initial;

  const [screen, setScreen] = useState<Screen>('p-home');
  const [jenis, setJenis] = useState<Jenis>('qn');
  const [activeSession, setActiveSession] = useState<number>(initial.currentSession.qn);
  const [included, setIncluded] = useState<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {};
    for (const p of peserta) out[p.id] = true;
    return out;
  });
  const [activeIdx, setActiveIdx] = useState(0);
  const [work, setWork] = useState<Record<string, EvWork>>(initial.work);
  const [raporId, setRaporId] = useState<string | null>(null);
  const [waOpen, setWaOpen] = useState(false);
  const [surat, setSurat] = useState('Al-Baqarah');
  const [ayatMulai, setAyatMulai] = useState<number>(142);
  const [ayatSelesai, setAyatSelesai] = useState<number>(157);
  const [statuses, setStatuses] = useState<Record<string, SaveStatus>>({});
  const [sentSesi, setSentSesi] = useState<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {};
    for (const s of initial.sesiList) if (s.status === 'terkirim') out[`${s.jenis}|${s.nomor_sesi}`] = true;
    return out;
  });
  const [kirimStatus, setKirimStatus] = useState<SaveStatus>('idle');

  const maxSessions: Record<Jenis, number> = {
    qn: 4,
    pb: 4,
    ujian: config.ujian_attempts,
  };

  // Refs untuk baca state terbaru di dalam callback async (debounce).
  const workRef = useRef(work);
  workRef.current = work;
  const includedRef = useRef(included);
  includedRef.current = included;
  const sesiIdRef = useRef<Record<string, string>>(
    Object.fromEntries(initial.sesiList.map((s) => [`${s.jenis}|${s.nomor_sesi}`, s.id]))
  );
  const setupRef = useRef({ surat, ayatMulai, ayatSelesai });
  setupRef.current = { surat, ayatMulai, ayatSelesai };
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const getWork = useCallback(
    (id: string, j: Jenis, session: number): EvWork => {
      const sesi = initial.sesiList.find((s) => s.jenis === j && s.nomor_sesi === session);
      return workRef.current[workKey(id, j, session)] ?? defaultWork(sesi?.ayat_mulai ?? ayatMulai);
    },
    [initial.sesiList, ayatMulai]
  );

  const setStatus = useCallback((key: string, st: SaveStatus) => {
    setStatuses((prev) => ({ ...prev, [key]: st }));
  }, []);

  // Pastikan sesi ada di server; kembalikan sesi_id (atau null bila gagal).
  const ensureSesiId = useCallback(
    async (j: Jenis, session: number): Promise<string | null> => {
      const skey = `${j}|${session}`;
      const cached = sesiIdRef.current[skey];
      if (cached) return cached;
      try {
        const su = setupRef.current;
        const res = await fetch('/api/evaluasi/sesi/upsert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            halaqah_id: halaqah.id,
            jenis: j,
            nomor_sesi: session,
            tgl_jadwal: config.jadwal[j]?.[session - 1] ?? null,
            surat: su.surat,
            ayat_mulai: su.ayatMulai,
            ayat_selesai: su.ayatSelesai,
            ambang: j === 'ujian' ? halaqah.ambang_ujian : AMBANG,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.sesi_id) return null;
        sesiIdRef.current[skey] = json.sesi_id;
        return json.sesi_id as string;
      } catch {
        return null;
      }
    },
    [halaqah.id, halaqah.ambang_ujian, config.jadwal]
  );

  // Simpan satu baris nilai ke server (optimistic; tidak memblokir navigasi).
  const saveNilai = useCallback(
    async (id: string, j: Jenis, session: number, override: { done?: boolean; hadir?: boolean } = {}) => {
      const key = workKey(id, j, session);
      const sesiId = await ensureSesiId(j, session);
      if (!sesiId) {
        setStatus(key, 'error');
        return;
      }
      const w = getWork(id, j, session);
      const hadir = override.hadir ?? includedRef.current[id] !== false;
      setStatus(key, 'saving');
      try {
        const res = await fetch('/api/evaluasi/nilai/upsert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sesi_id: sesiId,
            peserta_id: id,
            hadir,
            ayat_terakhir: w.ayat,
            counts: w.counts,
            catatan: w.catatan,
            confirmed: w.confirmed,
            done: override.done ?? w.done,
          }),
        });
        if (!res.ok) throw new Error('save failed');
        setStatus(key, 'saved');
      } catch {
        setStatus(key, 'error');
      }
    },
    [ensureSesiId, getWork, setStatus]
  );

  const scheduleSave = useCallback(
    (id: string, j: Jenis, session: number) => {
      const key = workKey(id, j, session);
      setStatus(key, 'idle');
      if (timers.current[key]) clearTimeout(timers.current[key]);
      timers.current[key] = setTimeout(() => saveNilai(id, j, session), 700);
    },
    [saveNilai, setStatus]
  );

  const updateWork = useCallback(
    (id: string, j: Jenis, session: number, patch: Partial<EvWork>, opts: { save?: boolean } = { save: true }) => {
      const key = workKey(id, j, session);
      setWork((prev) => {
        const sesi = initial.sesiList.find((s) => s.jenis === j && s.nomor_sesi === session);
        const existing = prev[key] ?? defaultWork(sesi?.ayat_mulai ?? ayatMulai);
        return { ...prev, [key]: { ...existing, ...patch } };
      });
      if (opts.save !== false) scheduleSave(id, j, session);
    },
    [initial.sesiList, ayatMulai, scheduleSave]
  );

  const bump = useCallback(
    (id: string, j: Jenis, session: number, k: string, d: number) => {
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(8);
      const cur = getWork(id, j, session).counts[k] || 0;
      updateWork(id, j, session, { counts: { ...getWork(id, j, session).counts, [k]: Math.max(0, cur + d) } });
    },
    [getWork, updateWork]
  );
  const setCount = useCallback(
    (id: string, j: Jenis, session: number, k: string, v: string) => {
      const n = Math.max(0, parseInt(v, 10) || 0);
      updateWork(id, j, session, { counts: { ...getWork(id, j, session).counts, [k]: n } });
    },
    [getWork, updateWork]
  );

  function tileRow(
    id: string,
    j: Jenis,
    session: number,
    k: string,
    label: string,
    shades: string[],
    borders: string[],
    textColor: string
  ): Tile {
    const count = getWork(id, j, session).counts[k] || 0;
    const i = Math.min(count, 4);
    return {
      key: k,
      label,
      count,
      tileBg: shades[i],
      tileBorder: borders[i],
      textColor,
      showMinus: count > 0,
      tap: () => bump(id, j, session, k, 1),
      minus: (e) => {
        e.stopPropagation();
        bump(id, j, session, k, -1);
      },
      setCount: (e) => {
        const digits = String(e.target.value).replace(/[^0-9]/g, '');
        setCount(id, j, session, k, digits === '' ? '0' : digits);
      },
      stop: (e) => e.stopPropagation(),
    };
  }

  const nav = (s: Screen) => setScreen(s);

  // Mulai penilaian dari kartu home: set jenis+sesi, muat surat/ayat dari sesi bila ada.
  const startJenis = (j: Jenis) => {
    const session = initial.currentSession[j];
    const sesi = initial.sesiList.find((s) => s.jenis === j && s.nomor_sesi === session);
    setJenis(j);
    setActiveSession(session);
    setSurat(sesi?.surat ?? 'Al-Baqarah');
    setAyatMulai(sesi?.ayat_mulai ?? 142);
    setAyatSelesai(sesi?.ayat_selesai ?? 157);
    setScreen('p-setup');
  };

  const pickSession = (n: number) => {
    const sesi = initial.sesiList.find((s) => s.jenis === jenis && s.nomor_sesi === n);
    setActiveSession(n);
    if (sesi) {
      setSurat(sesi.surat);
      setAyatMulai(sesi.ayat_mulai);
      setAyatSelesai(sesi.ayat_selesai);
    }
  };

  const toggleIncluded = (id: string) => {
    const next = !(included[id] !== false);
    setIncluded((prev) => ({ ...prev, [id]: next }));
    // Best-effort: rekam kehadiran agar "kirim" bisa mengecualikan yang tidak hadir.
    void saveNilai(id, jenis, activeSession, { hadir: next });
  };

  // ── Derived values (mirror renderVals) ──
  const isUjian = jenis === 'ujian';
  const trackName = (j: Jenis): string =>
    j === 'ujian' ? 'Ujian Akhir' : j === 'qn' ? config.nama_qn : config.nama_pb;
  const jl = trackName(jenis);
  const ambangJenis = isUjian ? halaqah.ambang_ujian : AMBANG;

  const includedPeserta = peserta.filter((p) => included[p.id] !== false);
  const selesaiCount = includedPeserta.filter((p) => getWork(p.id, jenis, activeSession).done).length;

  const activeP = peserta[activeIdx] ?? peserta[0];

  const headerMeta = `${halaqah.nama} · ${genderLabel(halaqah.gender)} · Mustawa ${halaqah.mustawa ?? '—'} · ${halaqah.pesertaCount} peserta`;

  // Home cards.
  const dotColorsDone = { qn: 'oklch(0.58 0.09 165)', pb: 'oklch(0.55 0.10 210)', ujian: 'oklch(0.58 0.09 165)' };
  const homeCards = (['qn', 'pb', 'ujian'] as Jenis[]).map((j) => {
    const cur = initial.currentSession[j];
    const max = maxSessions[j];
    const sentKeyOf = (n: number) => sentSesi[`${j}|${n}`];
    const dots = Array.from({ length: max }, (_, i) => i + 1).map((n) => ({
      key: `d${n}`,
      color: sentKeyOf(n) || n < cur ? dotColorsDone[j] : n === cur ? 'oklch(0.78 0.10 80)' : '#e8e4dc',
    }));
    const bg = j === 'qn' ? 'oklch(0.96 0.025 165)' : j === 'pb' ? 'oklch(0.96 0.03 210)' : 'oklch(0.96 0.035 85)';
    const border = j === 'qn' ? 'oklch(0.88 0.045 165)' : j === 'pb' ? 'oklch(0.87 0.05 210)' : 'oklch(0.88 0.07 82)';
    return {
      key: j,
      icon: j === 'qn' ? '📖' : j === 'pb' ? '📝' : '🎓',
      title: trackName(j),
      desc: `Sesi ${cur} dari ${max} · ${fmtTgl(config.jadwal[j]?.[cur - 1])}`,
      bg,
      border,
      dots,
      start: () => startJenis(j),
    };
  });

  // Riwayat: sesi terkirim.
  const riwayat = initial.sesiList
    .filter((s) => s.status === 'terkirim')
    .sort((a, b) => (a.jenis === b.jenis ? a.nomor_sesi - b.nomor_sesi : a.jenis.localeCompare(b.jenis)))
    .map((s) => {
      const rows = peserta
        .map((p) => getWork(p.id, s.jenis, s.nomor_sesi))
        .filter((w) => w.done && w.hadir !== false);
      const scores = rows.map((w) => scoreOf(w.counts).skor);
      const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
      return {
        key: s.id,
        label: `${JENIS_SHORT[s.jenis]} Sesi ${s.nomor_sesi} — ${fmtBulan(s.tgl_jadwal)}`,
        hadirCount: rows.length,
        total: peserta.length,
        avg,
      };
    });

  // Daftar items.
  const daftarItems = peserta.map((p, i) => {
    const rec = getWork(p.id, jenis, activeSession);
    const sc = scoreOf(rec.counts);
    const tier = tierOf(sc.skor);
    const inc = included[p.id] !== false;
    return {
      key: p.id,
      nama: p.nama,
      ketua: p.is_ketua ? ' 👑' : '',
      initial: initials(p.nama),
      toggle: () => toggleIncluded(p.id),
      checkMark: inc ? '✓' : '',
      checkBg: inc ? 'oklch(0.58 0.09 165)' : '#ffffff',
      checkBorder: inc ? 'oklch(0.58 0.09 165)' : '#d8d3c8',
      rowOpacity: inc ? 1 : 0.45,
      buka: () => {
        setActiveIdx(i);
        setScreen('p-nilai');
      },
      statusText: !inc ? 'Tidak hadir' : rec.done ? tier.label : 'Belum dinilai',
      showSkor: inc && rec.done,
      skor: sc.skor,
      skorColor: tier.color,
    };
  });

  // Nilai (peserta aktif).
  const nilaiRec = getWork(activeP.id, jenis, activeSession);
  const nilaiSc = scoreOf(nilaiRec.counts);
  const nilaiTier = tierOf(nilaiSc.skor);
  const jaliyRows = JALIY.map((d) =>
    tileRow(activeP.id, jenis, activeSession, d.key, d.label, JALIY_SHADES, JALIY_BORDERS, 'oklch(0.46 0.14 25)')
  );
  const khafiyRows = KHAFIY.map((d) =>
    tileRow(activeP.id, jenis, activeSession, d.key, d.label, KHAFIY_SHADES, KHAFIY_BORDERS, 'oklch(0.48 0.10 75)')
  );
  const ayatVal = nilaiRec.ayat ?? ayatMulai;
  const ayatSpan = Math.max(1, ayatSelesai - ayatMulai);
  const ayatPct = Math.min(100, Math.max(0, Math.round(((ayatVal - ayatMulai) / ayatSpan) * 100)));
  const lulus = nilaiSc.skor >= ambangJenis;

  // Ringkasan.
  const ringkasanItems = includedPeserta
    .filter((p) => getWork(p.id, jenis, activeSession).done)
    .map((p) => {
      const r = getWork(p.id, jenis, activeSession);
      const scc = scoreOf(r.counts);
      const t = tierOf(scc.skor);
      return {
        key: p.id,
        nama: p.nama,
        initial: initials(p.nama),
        skor: scc.skor,
        skorColor: t.color,
        tierLabel: t.label,
        lihat: () => {
          setRaporId(p.id);
          setScreen('p-rapor');
        },
      };
    });
  const ringkasanScores = ringkasanItems.map((x) => x.skor);
  const rataRata = ringkasanScores.length
    ? Math.round(ringkasanScores.reduce((a, b) => a + b, 0) / ringkasanScores.length)
    : 0;
  const waText =
    `Rekap ${jl} — Halaqah ${halaqah.nama}\n` +
    `${fmtBulan(config.jadwal[jenis]?.[activeSession - 1]) || ''}\n\n` +
    ringkasanItems.map((x) => `• ${x.nama}: ${x.skor}`).join('\n') +
    `\n\nRata-rata: ${rataRata}`;

  const currentSesiKey = `${jenis}|${activeSession}`;
  const alreadySent = !!sentSesi[currentSesiKey];

  const kirim = async () => {
    setKirimStatus('saving');
    const sesiId = await ensureSesiId(jenis, activeSession);
    if (!sesiId) {
      setKirimStatus('error');
      return;
    }
    try {
      const res = await fetch('/api/evaluasi/kirim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sesi_id: sesiId }),
      });
      if (!res.ok) throw new Error('kirim failed');
      setSentSesi((prev) => ({ ...prev, [currentSesiKey]: true }));
      setKirimStatus('saved');
    } catch {
      setKirimStatus('error');
    }
  };

  // Rapor (peserta terpilih).
  const rId = raporId ?? activeP.id;
  const rPeserta = peserta.find((p) => p.id === rId) ?? activeP;
  const rRec = getWork(rId, jenis, activeSession);
  const rSc = scoreOf(rRec.counts);
  const rTier = tierOf(rSc.skor);
  const rincian = [...JALIY, ...KHAFIY]
    .filter((d) => (rRec.counts[d.key] || 0) > 0)
    .map((d) => ({
      key: d.key,
      label: d.label,
      count: rRec.counts[d.key],
      tag: d.group === 'jaliy' ? 'Jaliy' : 'Khafiy',
      tagColor: d.group === 'jaliy' ? 'oklch(0.46 0.14 25)' : 'oklch(0.48 0.10 75)',
    }));
  // Histori skor per jenis (untuk 3 track chart). Panjang 4 agar geometri sama.
  const buildHistory = (j: Jenis): (number | null)[] =>
    [1, 2, 3, 4].map((n) => {
      const w = workRef.current[workKey(rId, j, n)];
      if (!w || !w.done) return null;
      return scoreOf(w.counts).skor;
    });
  const raporTracks = [
    { jenis: 'qn' as Jenis, label: `Progres ${config.nama_qn}`, history: buildHistory('qn') },
    { jenis: 'pb' as Jenis, label: `Progres ${config.nama_pb}`, history: buildHistory('pb') },
    { jenis: 'ujian' as Jenis, label: 'Progres Ujian Akhir', history: buildHistory('ujian') },
  ];

  const shellStyle: React.CSSProperties = {
    maxWidth: 460,
    margin: '0 auto',
    minHeight: '100vh',
    background: '#f4f2ed',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 0 0 1px #e8e4dc',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f4f2ed' }}>
      <style>{`
        .ev-press { transition: transform 0.06s ease; }
        .ev-press:active { transform: scale(0.96); }
        .ev-tile:active { transform: scale(0.95); }
        .ev-tile-sm:active { transform: scale(0.96); }
        .ev-step:active { transform: scale(0.92); }
        .ev-minus:active { transform: scale(0.88); }
        .ev-dark:hover { background: #2a2722 !important; }
        .ev-ghost:hover { background: #faf8f4 !important; }
        .ev-num::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
      `}</style>
      <div style={shellStyle}>
        {screen === 'p-home' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', background: '#ffffff', borderBottom: '1px solid #e8e4dc' }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#efece5', color: '#44423d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>
                {initials(initial.pengajarName)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>{initial.pengajarName}</div>
                <div style={{ fontSize: 11, color: '#7a766f', marginTop: 1 }}>{headerMeta}</div>
              </div>
            </div>

            <div style={{ padding: '18px 16px 0' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#7a766f', marginBottom: 10 }}>
                Mulai penilaian · 4 sesi tiap level
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {homeCards.map((hc) => (
                  <button
                    key={hc.key}
                    onClick={hc.start}
                    className="ev-press"
                    style={{ textAlign: 'left', width: '100%', padding: 16, borderRadius: 14, border: `1.5px solid ${hc.border}`, background: hc.bg, cursor: 'pointer', font: 'inherit', display: 'flex', alignItems: 'center', gap: 14 }}
                  >
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>{hc.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#1b1a17' }}>{hc.title}</div>
                      <div style={{ fontSize: 12, color: '#7a766f', marginTop: 2 }}>{hc.desc}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      {hc.dots.map((d) => (
                        <span key={d.key} style={{ width: 8, height: 8, borderRadius: '50%', background: d.color }} />
                      ))}
                    </div>
                    <span style={{ fontSize: 18, color: '#a8a39a' }}>→</span>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ padding: '20px 16px 0' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#7a766f', marginBottom: 10 }}>Riwayat sesi</div>
              {riwayat.length === 0 ? (
                <div style={{ background: '#ffffff', border: '1px solid #e8e4dc', borderRadius: 12, padding: '14px', fontSize: 12, color: '#a8a39a' }}>
                  Belum ada sesi yang dikirim.
                </div>
              ) : (
                <div style={{ background: '#ffffff', border: '1px solid #e8e4dc', borderRadius: 12, overflow: 'hidden' }}>
                  {riwayat.map((r, i) => (
                    <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: i < riwayat.length - 1 ? '1px solid #e8e4dc' : 'none' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'oklch(0.62 0.11 150)', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{r.label}</div>
                        <div style={{ fontSize: 11, color: '#a8a39a', marginTop: 1 }}>
                          {r.hadirCount}/{r.total} peserta · rata-rata {r.avg ?? '—'}
                        </div>
                      </div>
                      <button style={{ height: 28, padding: '0 10px', borderRadius: 7, border: '1px solid #d8d3c8', background: '#ffffff', font: 'inherit', fontSize: 11, fontWeight: 600, color: '#44423d', cursor: 'pointer' }}>PDF</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ height: 24 }} />
          </>
        )}

        {screen === 'p-setup' && (
          <Setup
            judul={`${jl} — Setup`}
            sesiLabel={`Sesi ${activeSession} dari ${maxSessions[jenis]} · dijadwalkan ${fmtTgl(config.jadwal[jenis]?.[activeSession - 1])}`}
            halaqahLine={`${halaqah.nama} · ${genderLabel(halaqah.gender)} · Mustawa ${halaqah.mustawa ?? '—'}`}
            pesertaCount={halaqah.pesertaCount}
            isUjian={isUjian}
            ambangUjian={halaqah.ambang_ujian}
            mustawa={halaqah.mustawa}
            maxSessions={maxSessions[jenis]}
            activeSession={activeSession}
            pickSession={pickSession}
            surat={surat}
            setSurat={setSurat}
            ayatMulai={ayatMulai}
            setAyatMulai={setAyatMulai}
            ayatSelesai={ayatSelesai}
            setAyatSelesai={setAyatSelesai}
            back={() => nav('p-home')}
            lanjut={async () => {
              await ensureSesiId(jenis, activeSession);
              nav('p-daftar');
            }}
          />
        )}

        {screen === 'p-daftar' && (
          <Daftar
            judul={jl}
            sub={`Sesi ${activeSession} dari ${maxSessions[jenis]} · ${surat} ${ayatMulai}–${ayatSelesai}`}
            items={daftarItems}
            selesai={selesaiCount}
            total={includedPeserta.length}
            progressPct={includedPeserta.length ? Math.round((selesaiCount / includedPeserta.length) * 100) : 0}
            tombolLabel={
              selesaiCount === includedPeserta.length && includedPeserta.length > 0
                ? 'Lihat ringkasan sesi'
                : selesaiCount === 0
                ? 'Mulai menilai'
                : 'Lanjutkan menilai'
            }
            back={() => nav('p-setup')}
            mulai={() => {
              if (selesaiCount === includedPeserta.length && includedPeserta.length > 0) {
                nav('p-ringkasan');
                return;
              }
              const nextIdx = peserta.findIndex(
                (p) => included[p.id] !== false && !getWork(p.id, jenis, activeSession).done
              );
              setActiveIdx(nextIdx >= 0 ? nextIdx : 0);
              setScreen('p-nilai');
            }}
          />
        )}

        {screen === 'p-nilai' && (
          <Nilai
            nama={activeP.nama}
            pos={activeIdx + 1}
            totalPeserta={peserta.length}
            surat={surat}
            ayat={ayatVal}
            ayatPct={ayatPct}
            prevAyat={() =>
              updateWork(activeP.id, jenis, activeSession, { ayat: Math.max(ayatMulai, ayatVal - 1) })
            }
            nextAyat={() =>
              updateWork(activeP.id, jenis, activeSession, { ayat: Math.min(ayatSelesai, ayatVal + 1) })
            }
            ringGradient={`conic-gradient(${nilaiTier.color} ${nilaiSc.skor}%, #e8e4dc 0)`}
            skor={nilaiSc.skor}
            skorColor={nilaiTier.color}
            tierLabel={nilaiTier.label}
            hitungan={`${nilaiSc.jaliyCount} jaliy (−${nilaiSc.jaliyCount * 6}) · ${nilaiSc.khafiyCount} khafiy (−${nilaiSc.khafiyCount * 2})`}
            ambang={ambangJenis}
            isUjian={isUjian}
            lulusLabel={lulus ? 'LULUS' : 'MENGULANG'}
            lulusBg={lulus ? 'oklch(0.96 0.035 150)' : 'oklch(0.96 0.03 25)'}
            lulusBorder={lulus ? 'oklch(0.85 0.06 150)' : 'oklch(0.86 0.07 25)'}
            lulusColor={lulus ? 'oklch(0.40 0.10 150)' : 'oklch(0.46 0.14 25)'}
            confirmed={!!nilaiRec.confirmed}
            toggleConfirm={() =>
              updateWork(activeP.id, jenis, activeSession, { confirmed: !nilaiRec.confirmed })
            }
            jaliy={jaliyRows}
            khafiy={khafiyRows}
            catatan={nilaiRec.catatan}
            setCatatan={(v) => updateWork(activeP.id, jenis, activeSession, { catatan: v })}
            isFirst={activeIdx === 0}
            prevPeserta={() => setActiveIdx(Math.max(0, activeIdx - 1))}
            simpanDisabled={isUjian && !nilaiRec.confirmed}
            simpanLabel={activeIdx === peserta.length - 1 ? 'Simpan & selesai' : 'Simpan & peserta berikutnya →'}
            status={statuses[workKey(activeP.id, jenis, activeSession)] ?? 'idle'}
            simpanLanjut={() => {
              updateWork(activeP.id, jenis, activeSession, { done: true }, { save: false });
              void saveNilai(activeP.id, jenis, activeSession, { done: true });
              let nextIdx = -1;
              for (let j = activeIdx + 1; j < peserta.length; j++) {
                if (included[peserta[j].id] !== false) {
                  nextIdx = j;
                  break;
                }
              }
              if (nextIdx >= 0) setActiveIdx(nextIdx);
              else nav('p-daftar');
            }}
            back={() => nav('p-daftar')}
          />
        )}

        {screen === 'p-ringkasan' && (
          <Ringkasan
            rata={rataRata}
            standarCount={ringkasanScores.filter((x) => x >= AMBANG).length}
            bawahCount={ringkasanScores.filter((x) => x < AMBANG).length}
            items={ringkasanItems}
            waOpen={waOpen}
            openWa={() => setWaOpen(true)}
            closeWa={() => setWaOpen(false)}
            waText={waText}
            kirim={kirim}
            kirimDisabled={selesaiCount < includedPeserta.length || alreadySent || kirimStatus === 'saving'}
            kirimLabel={alreadySent || kirimStatus === 'saved' ? 'Terkirim ke sistem ✓' : kirimStatus === 'saving' ? 'Mengirim…' : 'Kirim semua ke sistem'}
            offlineNote={
              kirimStatus === 'error'
                ? 'Gagal mengirim — periksa koneksi lalu coba lagi.'
                : selesaiCount < includedPeserta.length
                ? 'Beberapa peserta belum dinilai — belum bisa dikirim.'
                : 'Semua data tersimpan, siap dikirim.'
            }
            back={() => nav('p-daftar')}
          />
        )}

        {screen === 'p-rapor' && (
          <Rapor
            nama={rPeserta.nama}
            meta={`Halaqah ${halaqah.nama} · ${jl} · Sesi ${activeSession} · ${fmtBulan(config.jadwal[jenis]?.[activeSession - 1]) || ''}`}
            isUjian={isUjian}
            lulusLabel={rSc.skor >= halaqah.ambang_ujian ? 'LULUS' : 'MENGULANG'}
            lulusBg={rSc.skor >= halaqah.ambang_ujian ? 'oklch(0.96 0.035 150)' : 'oklch(0.96 0.03 25)'}
            lulusColor={rSc.skor >= halaqah.ambang_ujian ? 'oklch(0.40 0.10 150)' : 'oklch(0.46 0.14 25)'}
            skor={rSc.skor}
            skorColor={rTier.color}
            tierLabel={rTier.label}
            tracks={raporTracks}
            rincian={rincian}
            catatan={rRec.catatan || '—'}
            back={() => nav('p-ringkasan')}
          />
        )}
      </div>
    </div>
  );
}
