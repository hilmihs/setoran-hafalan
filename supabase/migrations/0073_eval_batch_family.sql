-- 0073_eval_batch_family.sql
-- Pisahkan "program" dari "batch" di mirror eval_batch.
--
-- eval_batch selama ini menyimpan satu baris per slug hilmihs, sehingga satu
-- program yang punya banyak angkatan ("HITS Reguler") tampak sebagai beberapa
-- program berbeda. Sumbernya sendiri sudah memisahkan keduanya lewat
-- SrcProgram.batch = { family, label, order }; tiga kolom ini memirrornya.
--
-- family sengaja TANPA foreign key ke eval_batch(id): nilainya bisa menunjuk
-- slug yang belum tersinkron pada urutan pull tertentu, dan sumber
-- memperlakukannya sebagai label pengelompokan, bukan referensi baris.
--
-- Program berangkatan tunggal (DPQ, RBI, HKM Presensi, ...) mengirim
-- batch: null → family = slug-nya sendiri, batch_label/batch_order null.

begin;

alter table eval_batch add column if not exists family      text;
alter table eval_batch add column if not exists batch_label text;
alter table eval_batch add column if not exists batch_order smallint;

-- Backfill: sebelum sync pertama, tiap baris jadi family beranggota tunggal.
update eval_batch set family = id where family is null;

alter table eval_batch alter column family set not null;

create index if not exists idx_eval_batch_family on eval_batch(family);

commit;
