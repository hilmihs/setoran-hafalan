import 'server-only';
import { randomBytes } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { Gender, KsHariIdx, KsPeriode } from '@/types/db';
import { catatKs } from '@/lib/ketersediaan-log';
import {
  adalahRedirect,
  ambilHalaqahDetail,
  ambilIdBaru,
  cariGuru,
  cariHalaqah,
  cariMurid,
  kirim,
  tilawahTerkonfigurasi,
  TilawahError,
} from './client';
import type {
  BuatHalaqahBody,
  BuatMuridBody,
  BuatPertemuanBody,
  EnrolMuridBody,
  TilawahEnvelope,
} from './types';
import { sesiDariSlot } from '@/lib/ketersediaan-slot';
import {
  jamPadaTanggal,
  jumlahPertemuanUntuk,
  namaPertemuan,
  rentangPertemuan,
  tanggalPertemuan,
} from '@/lib/ketersediaan-pertemuan';

/**
 * Pengiriman halaqah & peserta ke CMS tilawah.
 *
 * Bekerja lewat outbox per langkah, bukan satu transaksi besar. Alasannya nyata:
 * sesi Laravel dapat kedaluwarsa di tengah jalan, dan CMS tidak menyediakan
 * endpoint hapus — tidak ada cara membatalkan yang terlanjur terkirim. Jadi tiap
 * langkah harus aman diulang dan aman berhenti di tengah.
 *
 * Dua jebakan CMS yang ditangani di sini, keduanya terdokumentasi di API_MAP:
 *   · `halaqah` dan `users` menolak HTTP PUT (405) — update wajib POST ke /{id}
 *     dengan field `_method: "PUT"` (method spoofing Laravel).
 *   · `halaqah_id` pada payload CREATE user TIDAK meng-enrol murid. Enrolment
 *     adalah panggilan kedua, dan `move_reason` wajib diisi (422 bila kosong).
 */

const tunggu = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ALASAN_PINDAH = 'Pembentukan halaqah dari sistem ketersediaan mengajar Maahir';

/** Susun antrean pengiriman untuk satu usulan yang sudah dikonfirmasi. */
export async function antrekanPengiriman(usulanId: string): Promise<void> {
  const { data: adaOutbox } = await supabaseAdmin
    .from('ks_outbox')
    .select('id')
    .eq('usulan_id', usulanId)
    .limit(1);
  if ((adaOutbox ?? []).length > 0) return; // idempoten: jangan menumpuk antrean

  // Kegagalan menyisipkan antrean TIDAK boleh lewat diam-diam. Pernah terjadi:
  // batasan `aksi` belum memuat 'buat_pertemuan', keempat sisipan gagal tanpa
  // suara, dan halaqah terkirim tanpa satu pun pertemuan — tidak ada yang tahu
  // sampai kelasnya dibuka dan ternyata tak bisa diabsen.
  const sisip = async (baris: Record<string, unknown>) => {
    const { error } = await supabaseAdmin.from('ks_outbox').insert(baris);
    if (error) {
      throw new Error(`gagal menyusun antrean pengiriman (${baris.aksi}): ${error.message}`);
    }
  };

  await sisip({ usulan_id: usulanId, aksi: 'buat_halaqah', urutan: 0, payload: {} });

  // Pertemuan dibuat SEBELUM enrolmen supaya kelasnya sudah utuh saat murid
  // mendarat. Tidak ada endpoint bulk, jadi satu baris antrean per pertemuan —
  // itu juga yang membuat kegagalan di tengah bisa dilanjutkan, bukan diulang.
  const { data: usulan } = await supabaseAdmin
    .from('ks_usulan')
    .select('level, periode:periode_id(jumlah_pertemuan_dasar, jumlah_pertemuan_lanjutan)')
    .eq('id', usulanId)
    .maybeSingle();
  const aturan = usulan?.periode as
    | { jumlah_pertemuan_dasar: number; jumlah_pertemuan_lanjutan: number }
    | null
    | undefined;
  const jumlahPertemuan = aturan ? jumlahPertemuanUntuk(aturan, String(usulan?.level ?? '')) : 0;

  let urutan = 1;
  for (let i = 1; i <= jumlahPertemuan; i++) {
    await sisip({ usulan_id: usulanId, aksi: 'buat_pertemuan', urutan: urutan++, payload: { ke: i } });
  }

  const { data: peserta } = await supabaseAdmin
    .from('ks_usulan_peserta')
    .select('id')
    .eq('usulan_id', usulanId);

  for (const p of (peserta ?? []) as { id: string }[]) {
    await sisip({ usulan_id: usulanId, peserta_id: p.id, aksi: 'enrol', urutan: urutan++, payload: {} });
  }
}

export interface HasilProses {
  diproses: number;
  terkirim: number;
  gagal: number;
  percobaan: boolean;
  pesan: string[];
}

/**
 * Proses antrean sebuah periode.
 *
 * Bila `periode.kirim_nyata` mati, fungsi ini tetap MENYUSUN payload lengkap dan
 * menyimpannya, tetapi tidak memanggil CMS sama sekali. Itulah mode
 * kirim-percobaan: koordinator dapat memeriksa persis apa yang akan dikirim
 * sebelum ada yang tidak bisa ditarik kembali.
 */
export async function prosesOutbox(
  periode: KsPeriode,
  opts: { batas?: number } = {}
): Promise<HasilProses> {
  const batas = opts.batas ?? 50;
  const hasil: HasilProses = {
    diproses: 0,
    terkirim: 0,
    gagal: 0,
    percobaan: !periode.kirim_nyata,
    pesan: [],
  };

  if (periode.kirim_nyata && !tilawahTerkonfigurasi()) {
    hasil.pesan.push('Kredensial CMS tilawah belum diset — pengiriman dihentikan.');
    return hasil;
  }
  if (!periode.tilawah_batch_id) {
    hasil.pesan.push('Batch tujuan CMS tilawah belum ditetapkan.');
    return hasil;
  }

  const { data: usulanPeriode } = await supabaseAdmin
    .from('ks_usulan')
    .select('id')
    .eq('periode_id', periode.id)
    .in('status', ['dikonfirmasi', 'dikirim', 'gagal']);
  const usulanIds = new Set(((usulanPeriode ?? []) as { id: string }[]).map((u) => u.id));
  if (usulanIds.size === 0) return hasil;

  const { data: antre } = await supabaseAdmin
    .from('ks_outbox')
    .select('id, usulan_id, peserta_id, aksi, urutan, status, percobaan, payload')
    .eq('status', 'antre')
    .order('urutan', { ascending: true })
    .limit(500);

  const baris = ((antre ?? []) as {
    id: string;
    usulan_id: string;
    peserta_id: string | null;
    aksi: string;
    urutan: number;
    percobaan: number;
    payload: Record<string, unknown> | null;
  }[])
    .filter((b) => usulanIds.has(b.usulan_id))
    .slice(0, batas);

  for (const b of baris) {
    hasil.diproses++;
    try {
      const payload =
        b.aksi === 'buat_halaqah'
          ? await susunPayloadHalaqah(periode, b.usulan_id)
          : b.aksi === 'buat_pertemuan'
            ? await susunPayloadPertemuan(periode, b.usulan_id, Number(b.payload?.ke ?? 0))
            : await susunPayloadEnrol(periode, b.peserta_id!);

      // Simpan payload lebih dulu. Bila pengiriman gagal, inilah satu-satunya
      // bahan diagnosis — dan bila CMS ternyata sudah menerimanya, isi payload
      // yang tercatat memudahkan mencocokkan baris yang terlanjur terbuat.
      await supabaseAdmin
        .from('ks_outbox')
        .update({ payload, updated_at: new Date().toISOString() })
        .eq('id', b.id);

      // Mode percobaan berhenti di sini: payload sudah tersimpan di atas, dan
      // tidak ada panggilan keluar sama sekali.
      if (!periode.kirim_nyata) continue;

      const respons =
        b.aksi === 'buat_halaqah'
          ? await kirimHalaqah(b.usulan_id, payload as BuatHalaqahBody)
          : b.aksi === 'buat_pertemuan'
            ? await kirim<TilawahEnvelope<unknown>>('/api/pertemuans', payload as BuatPertemuanBody)
            : await kirimEnrol(periode, b.peserta_id!, payload as PayloadEnrol);

      // Jeda kecil antar-kiriman. Satu halaqah bisa berarti 22 panggilan
      // pertemuan berturut-turut ke server produksi yang kecil; menghajarnya
      // tanpa jeda tidak sopan dan mengundang pemutusan di tengah jalan.
      await tunggu(150);

      await supabaseAdmin
        .from('ks_outbox')
        .update({
          respons,
          status: 'terkirim',
          percobaan: b.percobaan + 1,
          terkirim_pada: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', b.id);
      hasil.terkirim++;
    } catch (e) {
      const pesan = e instanceof TilawahError ? `${e.message} (${e.status})` : (e as Error).message;
      hasil.gagal++;
      hasil.pesan.push(`${b.aksi}: ${pesan}`);
      await supabaseAdmin
        .from('ks_outbox')
        .update({
          status: b.percobaan + 1 >= 3 ? 'gagal' : 'antre',
          percobaan: b.percobaan + 1,
          error_terakhir: pesan,
          updated_at: new Date().toISOString(),
        })
        .eq('id', b.id);
    }
  }

  await tandaiUsulanSelesai(usulanIds);

  await catatKs({
    periode_id: periode.id,
    entitas: 'ks_outbox',
    aksi: periode.kirim_nyata ? 'proses_outbox' : 'proses_outbox_percobaan',
    sesudah: { diproses: hasil.diproses, terkirim: hasil.terkirim, gagal: hasil.gagal },
  });

  return hasil;
}

// ── Penyusunan payload ─────────────────────────────────────────────────────

async function susunPayloadHalaqah(periode: KsPeriode, usulanId: string): Promise<BuatHalaqahBody> {
  const { data: u } = await supabaseAdmin
    .from('ks_usulan')
    .select(
      'id, level, nama_halaqah, slot_id, pengajar_id, slot:slot_id(label, mode, kelompok), pengajar:pengajar_id(name, whatsapp_number)'
    )
    .eq('id', usulanId)
    .maybeSingle();
  if (!u) throw new Error('Usulan tidak ditemukan.');

  const slot = u.slot as { label: string; mode: string; kelompok: Gender } | null;
  const pengajar = u.pengajar as { name: string; whatsapp_number: string } | null;
  if (!slot) throw new Error('Slot usulan tidak ditemukan.');
  if (!pengajar) throw new Error('Pengajar usulan belum ditetapkan.');

  const batchId = periode.tilawah_batch_id!;

  const { data: slotMap } = await supabaseAdmin
    .from('ks_tilawah_slot_map')
    .select('day_id, session_id, usulan_otomatis')
    .eq('tilawah_batch_id', batchId)
    .eq('slot_id', u.slot_id as string)
    .maybeSingle();
  if (!slotMap) {
    // Ditahan, bukan ditebak: nomor day_id/session_id tidak dapat diturunkan
    // dari teks, dan salah nomor berarti halaqah terjadwal pada hari yang keliru.
    throw new Error(`Slot "${slot.label}" belum dipetakan ke day_id/session_id CMS tilawah.`);
  }

  const { data: levelMap } = await supabaseAdmin
    .from('ks_tilawah_level_map')
    .select('level_id')
    .eq('tilawah_batch_id', batchId)
    .eq('level_nama', u.level as string)
    .maybeSingle();
  if (!levelMap) throw new Error(`Level "${u.level}" belum dipetakan ke level_id CMS tilawah.`);

  const guruId = await cariGuruId(batchId, pengajar.name, pengajar.whatsapp_number);

  return {
    batch_id: batchId,
    name: (u.nama_halaqah as string | null) ?? (await namaHalaqahBaru(periode, slot.kelompok)),
    type: slot.mode === 'offline' ? 'offline' : 'online',
    level_id: levelMap.level_id as number,
    day_id: slotMap.day_id as number,
    session_id: slotMap.session_id as number,
    description: `Dibentuk dari ketersediaan mengajar Maahir — ${slot.label}`,
    user_id: guruId,
    status: 1,
  };
}

/**
 * Payload satu pertemuan ke-`ke` (1-based).
 *
 * Tanggalnya diturunkan dari tanggal mulai halaqah + hari slot, mengikuti pola
 * yang sudah dipakai di CMS: berturut-turut pada hari slot, tanpa melompati
 * libur. Penyesuaian libur dilakukan koordinator langsung di CMS.
 */
async function susunPayloadPertemuan(
  periode: KsPeriode,
  usulanId: string,
  ke: number
): Promise<BuatPertemuanBody> {
  const { data: u } = await supabaseAdmin
    .from('ks_usulan')
    .select(
      'id, tanggal_mulai, tilawah_halaqah_id, slot:slot_id(label, hari_idx, waktu_mulai, waktu_selesai, mode, lokasi), pengajar:pengajar_id(name, whatsapp_number)'
    )
    .eq('id', usulanId)
    .maybeSingle();
  if (!u) throw new Error('Usulan tidak ditemukan.');
  if (ke < 1) throw new Error('Nomor pertemuan tidak sah.');

  const slot = u.slot as {
    label: string;
    hari_idx: KsHariIdx[];
    waktu_mulai: string;
    waktu_selesai: string;
    mode: string;
    lokasi: string | null;
  } | null;
  const pengajar = u.pengajar as { name: string; whatsapp_number: string } | null;
  if (!slot) throw new Error('Slot usulan tidak ditemukan.');
  if (!pengajar) throw new Error('Pengajar usulan belum ditetapkan.');

  const mulai = u.tanggal_mulai as string | null;
  if (!mulai) throw new Error('Tanggal mulai halaqah belum ditetapkan.');

  const halaqahId = u.tilawah_halaqah_id as number | null;
  if (!halaqahId) {
    throw new Error('Halaqah belum terbentuk di CMS tilawah — jalankan langkahnya lebih dulu.');
  }

  const tanggal = tanggalPertemuan(mulai, slot.hari_idx, ke)[ke - 1];
  if (!tanggal) throw new Error(`Tanggal pertemuan ke-${ke} tidak dapat dihitung.`);

  // Kelas dua waktu: jam pertemuan mengikuti hari tanggalnya.
  const jam = jamPadaTanggal(tanggal, sesiDariSlot(slot));
  if (!jam) throw new Error(`Jam pertemuan ke-${ke} (${tanggal}) tidak dapat ditentukan dari jadwal "${slot.label}".`);
  const rentang = rentangPertemuan(tanggal, jam.mulai, jam.selesai);
  if (!rentang) {
    throw new Error('Jam selesai tidak lebih besar dari jam mulai — CMS menolak pertemuan seperti itu.');
  }

  const batchId = periode.tilawah_batch_id!;
  const guruId = await cariGuruId(batchId, pengajar.name, pengajar.whatsapp_number);

  return {
    name: namaPertemuan(ke),
    order: ke,
    type: slot.mode === 'offline' ? 'offline' : 'online',
    start_session_date: rentang.mulai,
    end_session_date: rentang.selesai,
    guru_id: guruId,
    online_url: '',
    offline_place: slot.mode === 'offline' ? (slot.lokasi ?? '') : '',
    notes: '',
    task_name: '',
    task_description: '',
    task_due: null,
    status: 1,
    moduls: [],
    schedule_date: tanggal,
    halaqah_id: halaqahId,
    batch_id: batchId,
  };
}

interface PayloadEnrol {
  nama: string;
  phone: string;
  gender: 1 | 2;
  email: string;
  halaqah_id: number | null;
  move_reason: string;
}

async function susunPayloadEnrol(periode: KsPeriode, pesertaId: string): Promise<PayloadEnrol> {
  const { data: p } = await supabaseAdmin
    .from('ks_usulan_peserta')
    .select('id, usulan_id, pendaftar:pendaftar_id(nama, wa_normal, gender), usulan:usulan_id(tilawah_halaqah_id)')
    .eq('id', pesertaId)
    .maybeSingle();
  if (!p) throw new Error('Peserta tidak ditemukan.');

  const pendaftar = p.pendaftar as { nama: string; wa_normal: string | null; gender: Gender | null } | null;
  const usulan = p.usulan as { tilawah_halaqah_id: number | null } | null;
  if (!pendaftar) throw new Error('Data pendaftar tidak ditemukan.');
  if (!pendaftar.wa_normal) throw new Error(`Pendaftar "${pendaftar.nama}" tidak punya nomor WA yang sah.`);

  const phone = `62${pendaftar.wa_normal}`;
  return {
    nama: pendaftar.nama,
    phone,
    gender: pendaftar.gender === 'akhwat' ? 2 : 1,
    // Email dipalsukan karena CMS mewajibkannya (422 bila kosong) meski banyak
    // murid lama bernilai null hasil impor.
    email: `${phone}@murid.hits`,
    halaqah_id: usulan?.tilawah_halaqah_id ?? null,
    move_reason: ALASAN_PINDAH,
  };
}

/**
 * Nomor halaqah berikutnya untuk periode & kelompok ini. Mengikuti pola nama
 * yang sudah dipakai ("HITS 001 AKHWAT JUNI") sehingga tidak perlu diketik.
 */
async function namaHalaqahBaru(periode: KsPeriode, kelompok: Gender): Promise<string> {
  const { data } = await supabaseAdmin
    .from('ks_usulan')
    .select('id, nama_halaqah')
    .eq('periode_id', periode.id);
  const sudah = ((data ?? []) as { nama_halaqah: string | null }[]).filter((r) => r.nama_halaqah).length;
  const label = periode.nama.replace(/[^a-zA-Z0-9 ]+/g, '').trim().toUpperCase();
  return `HITS ${String(sudah + 1).padStart(3, '0')} ${kelompok === 'ikhwan' ? 'IKHWAN' : 'AKHWAT'} ${label}`;
}

/**
 * Cari user_id guru di CMS. Cocokkan lewat nomor telepon dulu — nama sering
 * berbeda ejaan antar sistem, nomor tidak.
 */
async function cariGuruId(batchId: number, nama: string, wa: string): Promise<number> {
  const digit = wa.replace(/\D/g, '').replace(/^62/, '').replace(/^0+/, '');
  const kandidat = [...(await cariGuru(batchId, digit)), ...(await cariGuru(batchId, nama))];
  const lewatNomor = kandidat.find((u) => (u.phone ?? '').replace(/\D/g, '').endsWith(digit));
  if (lewatNomor) return lewatNomor.id;
  const lewatNama = kandidat.find((u) => u.name.trim().toLowerCase() === nama.trim().toLowerCase());
  if (lewatNama) return lewatNama.id;
  throw new Error(
    `Guru "${nama}" belum terdaftar di batch CMS tilawah ini. Daftarkan dulu di CMS, lalu ulangi pengiriman.`
  );
}

// ── Pengiriman ─────────────────────────────────────────────────────────────

async function kirimHalaqah(usulanId: string, body: BuatHalaqahBody): Promise<unknown> {
  const res = await kirim<TilawahEnvelope<Record<string, unknown>>>('/api/halaqah', body);

  // Redirect berarti mutasi bergaya Inertia yang biasanya BERHASIL. Jangan
  // menganggapnya gagal: mengulang akan membuat halaqah ganda, dan endpoint
  // hapus CMS membalas 500. Pastikan lewat pembacaan ulang berdasarkan nama.
  let id = adalahRedirect(res) ? null : ambilIdBaru(res);
  if (!id) {
    const cocok = (await cariHalaqah(body.batch_id, body.name)).filter(
      (h) => h.name.trim() === body.name.trim()
    );
    if (cocok.length === 1) id = cocok[0].id;
    else if (cocok.length > 1) {
      throw new Error(
        `Ada ${cocok.length} halaqah bernama "${body.name}" di batch ini — kemungkinan kiriman ganda. `
          + 'Bereskan manual di CMS sebelum melanjutkan.'
      );
    }
  }
  if (!id) {
    throw new Error(
      'CMS tilawah tidak mengembalikan id halaqah dan halaqahnya tidak ditemukan saat dibaca ulang. '
        + 'Periksa daftar halaqah di CMS sebelum mengulang.'
    );
  }

  await supabaseAdmin
    .from('ks_usulan')
    .update({
      tilawah_halaqah_id: id,
      nama_halaqah: body.name,
      status: 'dikirim',
      updated_at: new Date().toISOString(),
    })
    .eq('id', usulanId);
  return res;
}

async function kirimEnrol(
  periode: KsPeriode,
  pesertaId: string,
  payload: PayloadEnrol
): Promise<unknown> {
  const batchId = periode.tilawah_batch_id!;

  // Halaqah harus sudah ada: baris enrol selalu berurutan setelah buat_halaqah.
  const { data: p } = await supabaseAdmin
    .from('ks_usulan_peserta')
    .select('usulan:usulan_id(tilawah_halaqah_id)')
    .eq('id', pesertaId)
    .maybeSingle();
  const halaqahId = (p?.usulan as { tilawah_halaqah_id: number | null } | null)?.tilawah_halaqah_id;
  if (!halaqahId) throw new Error('Halaqah belum terbentuk di CMS tilawah — jalankan langkahnya lebih dulu.');

  const digit = payload.phone.replace(/\D/g, '').replace(/^62/, '');
  const adaMurid = (await cariMurid(batchId, digit)).find((u) =>
    (u.phone ?? '').replace(/\D/g, '').endsWith(digit)
  );

  let userId: number;
  if (adaMurid) {
    userId = adaMurid.id;
  } else {
    // Sandi acak dan tidak dibagikan: CMS tilawah hanya diakses pengajar, murid
    // tidak memerlukannya. Pola lama `password = nomor HP` tidak dipakai — nomor
    // HP bukan rahasia, dan di sini akun diterbitkan ratusan sekaligus.
    const sandi = randomBytes(18).toString('base64url');
    const body: BuatMuridBody = {
      name: payload.nama,
      email: payload.email,
      phone: payload.phone,
      user_code: '',
      gender: payload.gender,
      role: 'murid',
      bio: '',
      wag: 'Belum',
      halaqah_id: null,
      old_halaqah_id: null,
      move_reason: '',
      password: sandi,
      password_confirmation: sandi,
      batch_id: batchId,
      meta: { bio: '', wag: 'Belum' },
    };
    const res = await kirim<TilawahEnvelope<Record<string, unknown>>>('/api/users', body);

    // POST /api/users terbukti membalas 302 ke akar sambil tetap membuat akun.
    // Karena itu id dipastikan lewat pencarian ulang berdasarkan nomor telepon,
    // bukan diambil dari badan respons yang memang tidak ada.
    let id = adalahRedirect(res) ? null : ambilIdBaru(res);
    if (!id) {
      const cocok = (await cariMurid(batchId, digit)).filter((u) =>
        (u.phone ?? '').replace(/\D/g, '').endsWith(digit)
      );
      if (cocok.length === 1) id = cocok[0].id;
      else if (cocok.length > 1) {
        throw new Error(
          `Ada ${cocok.length} murid dengan nomor berakhiran ${digit} di batch ini — kemungkinan akun ganda. `
            + 'Bereskan manual di CMS sebelum melanjutkan.'
        );
      }
    }
    if (!id) {
      throw new Error(
        'Akun murid tidak ditemukan setelah dibuat. Periksa daftar murid di CMS sebelum mengulang.'
      );
    }
    userId = id;
  }

  // Panggilan kedua — inilah yang benar-benar meng-enrol. halaqah_id pada
  // pembuatan user tidak berpengaruh terhadap pivot halaqah.
  const enrol: EnrolMuridBody = {
    _method: 'PUT',
    name: payload.nama,
    email: payload.email,
    phone: payload.phone,
    user_code: '',
    gender: payload.gender,
    role: 'murid',
    bio: '',
    wag: 'Belum',
    batch_id: batchId,
    halaqah_id: halaqahId,
    old_halaqah_id: null,
    move_reason: payload.move_reason,
    meta: { bio: '', wag: 'Belum' },
  };
  const res = await kirim<TilawahEnvelope<unknown>>(`/api/users/${userId}`, enrol);

  // Bila CMS membalas redirect, badan respons tidak menyatakan apa pun tentang
  // keberhasilan. Menandai "terenroll" atas dasar tebakan berbahaya: koordinator
  // akan mengira murid sudah masuk padahal belum. Jadi dibaca ulang.
  if (adalahRedirect(res)) {
    const detail = await ambilHalaqahDetail(halaqahId);
    const masuk = detail?.users.some((u) => u.id === userId) ?? false;
    if (!masuk) {
      throw new Error(
        `Murid #${userId} tidak terlihat di halaqah #${halaqahId} setelah enrolment. `
          + 'Periksa di CMS sebelum mengulang.'
      );
    }
  }

  await supabaseAdmin
    .from('ks_usulan_peserta')
    .update({ status: 'terenroll', tilawah_user_id: userId, updated_at: new Date().toISOString() })
    .eq('id', pesertaId);

  return res;
}

/** Tandai usulan yang seluruh antreannya sudah tuntas. */
async function tandaiUsulanSelesai(usulanIds: ReadonlySet<string>): Promise<void> {
  for (const id of usulanIds) {
    const { data: sisa } = await supabaseAdmin
      .from('ks_outbox')
      .select('id, status')
      .eq('usulan_id', id);
    const baris = (sisa ?? []) as { status: string }[];
    if (baris.length === 0) continue;
    if (baris.some((b) => b.status === 'antre')) continue;
    const adaGagal = baris.some((b) => b.status === 'gagal');
    await supabaseAdmin
      .from('ks_usulan')
      .update({ status: adaGagal ? 'gagal' : 'dikirim', updated_at: new Date().toISOString() })
      .eq('id', id)
      .in('status', ['dikonfirmasi', 'dikirim', 'gagal']);
  }
}
