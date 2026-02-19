// Schedule PDF export — client-side only (html2canvas + jsPDF)
// No server calls, no cookies, no telemetry, works offline.

import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

// ---------------------------------------------------------------------------
// Settings types & localStorage persistence
// ---------------------------------------------------------------------------

export interface SchedulePrintSettings {
  facilityTitle: string;
  disclaimerText: string;
  showVersion: boolean;
  showTimestamp: boolean;
  showPreparedBy: boolean;
  showSignature: boolean;
  showPageNumbers: boolean;
}

const SETTINGS_KEY = 'plantpulse.schedulePrintSettings.v1';

const DEFAULT_SETTINGS: SchedulePrintSettings = {
  facilityTitle: '',
  disclaimerText: 'UNCONTROLLED COPY: Valid only at time of printing.',
  showVersion: true,
  showTimestamp: true,
  showPreparedBy: true,
  showSignature: true,
  showPageNumbers: true,
};

export function loadPrintSettings(): SchedulePrintSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch {
    // ignore parse errors
  }
  return { ...DEFAULT_SETTINGS };
}

export function savePrintSettings(settings: SchedulePrintSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// ---------------------------------------------------------------------------
// Timestamp helper — includes TZ abbreviation + UTC offset
// Example: "2026-02-19 14:32 CET (UTC+01:00)"
// ---------------------------------------------------------------------------

export function formatExportTimestamp(): string {
  const now = new Date();
  const pad2 = (n: number) => String(n).padStart(2, '0');

  const yyyy = now.getFullYear();
  const mo = pad2(now.getMonth() + 1);
  const dd = pad2(now.getDate());
  const hh = pad2(now.getHours());
  const min = pad2(now.getMinutes());

  // Timezone abbreviation via Intl
  let tzAbbr = '';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZoneName: 'short',
    }).formatToParts(now);
    tzAbbr = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    // fallback: omit abbreviation
  }

  // UTC offset (getTimezoneOffset returns minutes *behind* UTC, so negate)
  const totalOffsetMin = -now.getTimezoneOffset();
  const sign = totalOffsetMin >= 0 ? '+' : '-';
  const absMin = Math.abs(totalOffsetMin);
  const offH = pad2(Math.floor(absMin / 60));
  const offM = pad2(absMin % 60);

  return `${yyyy}-${mo}-${dd} ${hh}:${min} ${tzAbbr} (UTC${sign}${offH}:${offM})`;
}

// ---------------------------------------------------------------------------
// PDF export
// ---------------------------------------------------------------------------

const APP_VERSION = '0.1.0';

/**
 * Capture the visible schedule canvas and generate an A4 landscape PDF.
 *
 * @param canvasElementId  DOM id of the <canvas> rendered by WallboardCanvas
 * @param monthLabel       Human-readable month, e.g. "February 2026"
 */
export async function exportSchedulePdf(
  canvasElementId: string,
  monthLabel: string
): Promise<void> {
  const scheduleEl = document.getElementById(canvasElementId);
  if (!scheduleEl) {
    throw new Error(`Schedule element #${canvasElementId} not found`);
  }

  const settings = loadPrintSettings();

  // --- Capture via html2canvas ---
  const captured = await html2canvas(scheduleEl, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#fff',
  });

  // --- Create PDF: A4 landscape, 8 mm margins ---
  const pageW = 297; // mm
  const pageH = 210;
  const margin = 8;
  const contentW = pageW - margin * 2;

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  // ---- Header ----
  let cursorY = margin;

  // Optional facility title
  if (settings.facilityTitle.trim()) {
    cursorY += 4;
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(60, 60, 60);
    doc.text(settings.facilityTitle.trim(), pageW / 2, cursorY, {
      align: 'center',
    });
    cursorY += 2;
  }

  // Month + Year (always rendered)
  cursorY += 4;
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(monthLabel, pageW / 2, cursorY, { align: 'center' });
  cursorY += 3;

  // Thin separator under header
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.2);
  doc.line(margin, cursorY, pageW - margin, cursorY);
  cursorY += 2;

  const imageTopY = cursorY;

  // ---- Footer zone (calculate height first) ----
  const footerFontSize = 7.5;
  const footerLineH = 3.5;

  let leftLineCount = 0;
  if (settings.showVersion) leftLineCount++;
  if (settings.showTimestamp) leftLineCount++;
  if (settings.showPreparedBy) leftLineCount++;
  if (settings.showSignature) leftLineCount++;

  const minLines = Math.max(leftLineCount, 1);
  const footerTextH = minLines * footerLineH;
  const footerTotalH = footerTextH + 5; // padding around text

  const footerSepY = pageH - margin - footerTotalH;
  const imageBottomY = footerSepY - 2; // 2 mm gap before footer
  const imageAreaH = imageBottomY - imageTopY;

  // ---- Schedule image ----
  const imgAspect = captured.width / captured.height;
  const areaAspect = contentW / imageAreaH;

  let imgW: number;
  let imgH: number;
  if (imgAspect > areaAspect) {
    imgW = contentW;
    imgH = contentW / imgAspect;
  } else {
    imgH = imageAreaH;
    imgW = imageAreaH * imgAspect;
  }

  const imgX = margin + (contentW - imgW) / 2;
  const imgY = imageTopY + (imageAreaH - imgH) / 2;

  const imgData = captured.toDataURL('image/png');
  doc.addImage(imgData, 'PNG', imgX, imgY, imgW, imgH);

  // ---- Footer ----
  // Separator line above footer
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.2);
  doc.line(margin, footerSepY, pageW - margin, footerSepY);

  doc.setFontSize(footerFontSize);
  doc.setTextColor(140, 140, 140);
  doc.setFont('Helvetica', 'normal');

  // Left column — traceability
  let leftY = footerSepY + 3;
  if (settings.showVersion) {
    doc.text(`PlantPulse Scheduler v${APP_VERSION}`, margin, leftY);
    leftY += footerLineH;
  }
  if (settings.showTimestamp) {
    doc.text(`Exported: ${formatExportTimestamp()}`, margin, leftY);
    leftY += footerLineH;
  }
  if (settings.showPreparedBy) {
    doc.text('Prepared by: Unknown', margin, leftY);
    leftY += footerLineH;
  }
  if (settings.showSignature) {
    doc.text('Signature: ____________________', margin, leftY);
  }

  // Center column — disclaimer
  if (settings.disclaimerText.trim()) {
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(140, 140, 140);
    const disclaimerY = footerSepY + 3 + footerTextH / 2;
    doc.text(settings.disclaimerText.trim(), pageW / 2, disclaimerY, {
      align: 'center',
    });
    doc.setFont('Helvetica', 'normal');
  }

  // Right column — page numbers (future-proof loop over all pages)
  if (settings.showPageNumbers) {
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(footerFontSize);
      doc.setTextColor(140, 140, 140);
      doc.setFont('Helvetica', 'normal');
      const pageNumY = footerSepY + 3 + footerTextH / 2;
      doc.text(`Page ${i} of ${totalPages}`, pageW - margin, pageNumY, {
        align: 'right',
      });
    }
  }

  // ---- Save ----
  const filenameMonth = monthLabel.replace(/\s+/g, '_');
  doc.save(`PlantPulse_${filenameMonth}.pdf`);
}
