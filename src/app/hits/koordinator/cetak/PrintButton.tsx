'use client';

/** Membuka dialog cetak browser — dari sana user memilih "Save as PDF". */
export function PrintButton() {
  return (
    <button type="button" className="btn btn-sm btn-primary no-print" onClick={() => window.print()}>
      Cetak / Simpan PDF
    </button>
  );
}
