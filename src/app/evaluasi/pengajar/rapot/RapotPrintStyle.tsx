import type { ReactElement } from 'react';

// Gaya cetak bersama untuk semua lembar rapot A4 (berkala & ujian).
//
// Kenapa perlu: `globals.css` memasang `@page { size: A4 landscape; margin: 10mm }`
// untuk halaman "cetak" modul lain. Lembar rapot ini potret 794×1123px, jadi tanpa
// override hasilnya meluber — terpotong ke samping dan menyisakan halaman kosong.
//
// Trik penting:
// - `@page` dideklarasikan ulang (potret, margin 0). Karena <style> ini dirender di
//   dalam body — setelah globals.css di <head> — deklarasinya menang di cascade.
// - Ukuran lembar dipaksa dalam mm, bukan px. 794px/1123px hanya *mendekati* A4
//   (794.9×1122.5px @96dpi); selisih pecahan itu cukup untuk melahirkan halaman
//   kedua yang kosong. 210mm × 296mm selalu muat dalam satu halaman.
// - `overflow: hidden` menjaga lembar tetap satu halaman bila ada 1–2px kelebihan.
export default function RapotPrintStyle(): ReactElement {
  return (
    <style>{`
      .a4-stack { display: flex; flex-direction: column; align-items: center; gap: 20px; }
      .a4-sheet { margin: 0 auto; box-shadow: 0 1px 3px rgba(20,18,14,0.10), 0 8px 28px -12px rgba(20,18,14,0.20); }

      @media screen {
        /* Lembar 794px lebih lebar dari layar HP — biarkan wrapper yang menggeser,
           jangan biarkan <body> ikut melebar. */
        .a4-print-wrap { background: #f4f2ed; padding: 16px 12px 96px; overflow-x: auto; }
      }

      @media print {
        @page { size: A4 portrait; margin: 0; }
        html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
        .noprint, .no-print { display: none !important; }
        .a4-print-wrap { background: #fff !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; }
        .a4-stack { display: block !important; gap: 0 !important; }
        .a4-sheet {
          width: 210mm !important;
          height: 296mm !important;
          min-height: 0 !important;
          max-width: none !important;
          margin: 0 !important;
          overflow: hidden;
          transform: none !important;
          box-shadow: none !important;
          break-inside: avoid;
          page-break-inside: avoid;
          break-after: page;
          page-break-after: always;
        }
        .a4-sheet:last-child { break-after: auto; page-break-after: auto; }

        /* Pita status ("RAPOT DICABUT") ikut tercetak. Ia memakan ~10mm di
           halaman pertama, jadi lembar tepat di bawahnya dipendekkan supaya
           tidak mendorong 1 halaman kosong. */
        .a4-banner {
          width: 210mm !important;
          max-width: none !important;
          margin: 0 !important;
          border-radius: 0 !important;
          break-after: avoid;
          page-break-after: avoid;
        }
        .a4-banner + .a4-sheet,
        .a4-banner + .a4-stack > .a4-sheet:first-child { height: 286mm !important; }
      }
    `}</style>
  );
}
