import { supabaseAdmin } from '../supabase-admin';

export async function runSeedDemoObservasi(log: (s: string) => void): Promise<void> {
  log('Mengambil data kelas_hits dan ketua_kelas...');

  const { data: allKelas } = await supabaseAdmin
    .from('kelas_hits')
    .select('id, name, pengajar_id, gender')
    .order('name');

  if (!allKelas || allKelas.length === 0) {
    log('Tidak ada kelas_hits. Jalankan seed HITS dan seed Kelas HITS terlebih dahulu.');
    return;
  }

  const { data: allKetua } = await supabaseAdmin
    .from('ketua_kelas')
    .select('id, kelas_hits_id')
    .eq('active', true);

  const ketuaMap = new Map((allKetua ?? []).map((k) => [k.kelas_hits_id, k.id]));

  const { data: koorKK } = await supabaseAdmin
    .from('koordinator_ketua_kelas')
    .select('id')
    .limit(1)
    .maybeSingle();

  log('Menghapus demo observasi sebelumnya...');
  await supabaseAdmin.from('tabayyun').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabaseAdmin.from('observasi_kelas').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
  const kondisiOptions: ('KBBS' | 'KMT' | 'JKG' | 'KBLA' | 'LIBUR')[] = ['KBBS', 'KMT', 'JKG', 'KBLA', 'LIBUR'];
  const statusLatihanOptions: ('TAL' | 'PTML' | 'SML')[] = ['TAL', 'PTML', 'SML'];

  let obsCount = 0;
  let tabayyunCount = 0;

  const kelasToSeed = allKelas.slice(0, 20);

  for (let dayOffset = 0; dayOffset < 5; dayOffset++) {
    const d = new Date(today + 'T12:00:00+07:00');
    d.setDate(d.getDate() - dayOffset);
    const dateStr = d.toISOString().slice(0, 10);

    for (let i = 0; i < kelasToSeed.length; i++) {
      const kelas = kelasToSeed[i];
      const ketuaId = ketuaMap.get(kelas.id);
      if (!ketuaId) continue;

      if (dayOffset === 0 && i >= kelasToSeed.length - 5) continue;

      const kondisiIdx = (i + dayOffset) % kondisiOptions.length;
      const kondisi = kondisiIdx === 0 || (dayOffset === 0 && i < 3) ? 'KBBS' : kondisiOptions[kondisiIdx];
      const latihanDiberikan = kondisi !== 'LIBUR' && (i + dayOffset) % 3 !== 0;
      const statusLatihan = latihanDiberikan ? statusLatihanOptions[(i + dayOffset) % 3] : null;

      const { data: obs, error: obsErr } = await supabaseAdmin
        .from('observasi_kelas')
        .upsert({
          kelas_hits_id: kelas.id,
          ketua_kelas_id: ketuaId,
          tanggal: dateStr,
          kondisi,
          pengajar_on_cam: kondisi !== 'LIBUR',
          latihan_mandiri_diberikan: kondisi !== 'LIBUR' ? latihanDiberikan : null,
          status_latihan_val: kondisi !== 'LIBUR' ? statusLatihan : null,
          semua_siswa_selesai_latihan: statusLatihan === 'SML' ? true : statusLatihan === 'PTML' ? false : null,
          catatan: kondisi !== 'KBBS' && kondisi !== 'LIBUR' ? `Demo catatan: ${kondisi} pada ${dateStr}` : null,
        }, { onConflict: 'kelas_hits_id,tanggal' })
        .select('id')
        .maybeSingle();

      if (obsErr) {
        log(`Error insert observasi ${kelas.name} ${dateStr}: ${obsErr.message}`);
        continue;
      }
      obsCount++;

      if (obs && kondisi !== 'KBBS' && kondisi !== 'LIBUR' && koorKK) {
        const deadline = new Date();
        deadline.setHours(deadline.getHours() + 48);

        const status = dayOffset >= 2 ? 'decided' : dayOffset === 1 ? 'awaiting_reason' : 'pending';

        const { data: existingTab } = await supabaseAdmin
          .from('tabayyun')
          .select('id')
          .eq('observasi_id', obs.id)
          .maybeSingle();

        if (!existingTab) {
          await supabaseAdmin.from('tabayyun').insert({
            observasi_id: obs.id,
            pengajar_id: kelas.pengajar_id,
            koordinator_kk_id: koorKK.id,
            status,
            deadline_at: deadline.toISOString(),
            alasan_pengajar: status !== 'pending' ? 'Demo alasan: ada keperluan mendadak' : null,
            alasan_submitted_at: status !== 'pending' ? new Date().toISOString() : null,
            is_udzur_syari: status === 'decided' ? dayOffset % 2 === 0 : null,
            keputusan_catatan: status === 'decided' ? 'Demo keputusan' : null,
            decided_at: status === 'decided' ? new Date().toISOString() : null,
          });
          tabayyunCount++;
        }
      }
    }
  }

  log(`Inserted ${obsCount} observasi, ${tabayyunCount} tabayyun.`);

  log('Menambahkan demo checkin pengajar...');
  let checkinCount = 0;

  for (let dayOffset = 0; dayOffset < 3; dayOffset++) {
    const d = new Date(today + 'T12:00:00+07:00');
    d.setDate(d.getDate() - dayOffset);
    const dateStr = d.toISOString().slice(0, 10);

    for (let i = 0; i < kelasToSeed.length; i++) {
      const kelas = kelasToSeed[i];
      if (dayOffset === 0 && i >= kelasToSeed.length - 3) continue;

      const status = (i + dayOffset) % 5 === 0 ? 'izin' as const : 'hadir' as const;
      const isTerlambat = status === 'hadir' && (i + dayOffset) % 7 === 0;

      const { error: checkinErr } = await supabaseAdmin
        .from('checkin_pengajar')
        .upsert({
          pengajar_id: kelas.pengajar_id,
          kelas_hits_id: kelas.id,
          tanggal: dateStr,
          status,
          checked_in_at: new Date().toISOString(),
          is_terlambat: isTerlambat,
        }, { onConflict: 'pengajar_id,kelas_hits_id,tanggal' });

      if (!checkinErr) checkinCount++;
    }
  }

  log(`Inserted ${checkinCount} checkin pengajar.`);
}
