import { supabaseAdmin } from './supabase-admin';
import { scaleKehadiran } from './scales';

const TZ = 'Asia/Jakarta';

const HARI_MAP: Record<string, number> = {
  senin: 1, selasa: 2, rabu: 3, kamis: 4,
  jumat: 5, sabtu: 6, minggu: 0,
};

function jakartaToday(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: TZ });
}

function jakartaNow(): Date {
  const nowStr = new Date().toLocaleString('sv-SE', { timeZone: TZ });
  return new Date(nowStr);
}

function dayOfWeek(dateStr: string): number {
  const d = new Date(dateStr + 'T12:00:00+07:00');
  return d.getDay();
}

function hariToNumber(hari: string): number {
  return HARI_MAP[hari.toLowerCase()] ?? -1;
}

export interface ProgramToday {
  type: 'program' | 'kelas_maahir';
  id: string;
  name: string;
  waktu_mulai: string;
  waktu_selesai: string;
  tanggal: string;
}

export async function getProgramsForDate(
  pengajarId: string,
  dateStr: string
): Promise<ProgramToday[]> {
  const dow = dayOfWeek(dateStr);
  const result: ProgramToday[] = [];

  const { data: programs } = await supabaseAdmin
    .from('program_kehadiran')
    .select('id, name, hari, waktu_mulai, waktu_selesai')
    .eq('active', true);

  if (programs) {
    for (const p of programs) {
      const matchDay = (p.hari as string[]).some(
        (h) => hariToNumber(h) === dow
      );
      if (matchDay) {
        const { data: libur } = await supabaseAdmin
          .from('libur_program')
          .select('id')
          .eq('program_id', p.id)
          .eq('tanggal', dateStr)
          .maybeSingle();
        if (!libur) {
          result.push({
            type: 'program',
            id: p.id,
            name: p.name,
            waktu_mulai: p.waktu_mulai,
            waktu_selesai: p.waktu_selesai,
            tanggal: dateStr,
          });
        }
      }
    }
  }

  const { data: kelasRows } = await supabaseAdmin
    .from('kelas_hits')
    .select('id, name, jadwal_hari, jadwal_waktu_mulai, jadwal_waktu_selesai')
    .eq('pengajar_id', pengajarId);

  if (kelasRows) {
    for (const k of kelasRows) {
      if (k.jadwal_hari && hariToNumber(k.jadwal_hari) === dow) {
        const { data: libur } = await supabaseAdmin
          .from('libur_program')
          .select('id')
          .eq('kelas_hits_id', k.id)
          .eq('tanggal', dateStr)
          .maybeSingle();
        if (!libur) {
          result.push({
            type: 'kelas_maahir',
            id: k.id,
            name: `Kelas Maahir — ${k.name}`,
            waktu_mulai: k.jadwal_waktu_mulai ?? '16:00',
            waktu_selesai: k.jadwal_waktu_selesai ?? '19:00',
            tanggal: dateStr,
          });
        }
      }
    }
  }

  return result;
}

export function deriveIsTerlambat(
  checkinTime: Date,
  waktuMulai: string,
  tanggal: string
): boolean {
  const [h, m] = waktuMulai.split(':').map(Number);
  const startTime = new Date(`${tanggal}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+07:00`);
  return checkinTime > startTime;
}

export function isAlpa(
  waktuSelesai: string,
  tanggal: string
): boolean {
  const now = jakartaNow();
  const [h, m] = waktuSelesai.split(':').map(Number);
  const endTime = new Date(`${tanggal}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+07:00`);
  return now > endTime;
}

export async function getUnfilledDates(
  pengajarId: string,
  maxBackfill = 5
): Promise<ProgramToday[]> {
  const today = jakartaToday();
  const unfilled: ProgramToday[] = [];

  for (let i = 1; i <= 14 && unfilled.length < maxBackfill; i++) {
    const d = new Date(today + 'T12:00:00+07:00');
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);

    const programs = await getProgramsForDate(pengajarId, dateStr);

    for (const prog of programs) {
      if (unfilled.length >= maxBackfill) break;

      const existing = prog.type === 'program'
        ? await supabaseAdmin
            .from('checkin_pengajar')
            .select('id')
            .eq('pengajar_id', pengajarId)
            .eq('program_id', prog.id)
            .eq('tanggal', dateStr)
            .maybeSingle()
        : await supabaseAdmin
            .from('checkin_pengajar')
            .select('id')
            .eq('pengajar_id', pengajarId)
            .eq('kelas_hits_id', prog.id)
            .eq('tanggal', dateStr)
            .maybeSingle();

      if (!existing.data) {
        unfilled.push(prog);
      }
    }
  }

  return unfilled.reverse();
}

export async function calculateMonthlyAttendancePercent(
  pengajarId: string,
  opts: { programId?: string; kelasHitsId?: string },
  yearMonth: string
): Promise<number> {
  const [year, month] = yearMonth.split('-').map(Number);
  const startDate = `${yearMonth}-01`;
  const endDate = new Date(year, month, 0).toISOString().slice(0, 10);

  let query = supabaseAdmin
    .from('checkin_pengajar')
    .select('id, status, invalidated_at')
    .eq('pengajar_id', pengajarId)
    .gte('tanggal', startDate)
    .lte('tanggal', endDate)
    .is('invalidated_at', null);

  if (opts.programId) {
    query = query.eq('program_id', opts.programId);
  } else if (opts.kelasHitsId) {
    query = query.eq('kelas_hits_id', opts.kelasHitsId);
  }

  const { data: checkins } = await query;
  if (!checkins || checkins.length === 0) return 0;

  const totalSessions = checkins.length;
  const hadirCount = checkins.filter((c) => c.status === 'hadir').length;
  return Math.round((hadirCount / totalSessions) * 100);
}

export function attendancePercentToScale(
  percent: number
): 0 | 1 | 2 | 3 | 4 {
  return scaleKehadiran(percent);
}
