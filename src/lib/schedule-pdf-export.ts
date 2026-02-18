// Schedule PDF Export — Single-page A4 landscape PDF of the current schedule view
// Used only by the Schedule (inoculum) page

import { jsPDF } from 'jspdf';
import { format } from 'date-fns';

// A4 landscape dimensions in mm
const PAGE_WIDTH = 297;
const PAGE_HEIGHT = 210;
const MARGIN = 10;
const FOOTER_HEIGHT = 26;

const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const CONTENT_HEIGHT = PAGE_HEIGHT - 2 * MARGIN - FOOTER_HEIGHT;

/**
 * Export the schedule canvas as a single-page A4 landscape PDF.
 * The canvas image is scaled to fit within the content area while
 * preserving aspect ratio. A required footer is placed at the bottom.
 */
export function exportSchedulePdf(canvas: HTMLCanvasElement): void {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  // Capture canvas at full resolution (includes devicePixelRatio scaling)
  const imgData = canvas.toDataURL('image/png');

  // Scale image to fit content area while preserving aspect ratio
  const canvasAspect = canvas.width / canvas.height;
  const contentAspect = CONTENT_WIDTH / CONTENT_HEIGHT;

  let imgWidth: number;
  let imgHeight: number;

  if (canvasAspect > contentAspect) {
    // Canvas is wider relative to content — fit to width
    imgWidth = CONTENT_WIDTH;
    imgHeight = CONTENT_WIDTH / canvasAspect;
  } else {
    // Canvas is taller relative to content — fit to height
    imgHeight = CONTENT_HEIGHT;
    imgWidth = CONTENT_HEIGHT * canvasAspect;
  }

  // Center the image horizontally within content area
  const imgX = MARGIN + (CONTENT_WIDTH - imgWidth) / 2;
  const imgY = MARGIN;

  doc.addImage(imgData, 'PNG', imgX, imgY, imgWidth, imgHeight);

  // ── Footer ──────────────────────────────────────────────────────────────

  const footerY = PAGE_HEIGHT - MARGIN - FOOTER_HEIGHT;

  // Separator line
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, footerY, PAGE_WIDTH - MARGIN, footerY);

  // Footer text — visually secondary (grey, small font)
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);

  const printDate = format(new Date(), 'yyyy-MM-dd HH:mm');

  const footerLines = [
    'Printed by PlantPulse \u2014 valid only on the print date',
    `Print date: ${printDate}`,
    'Signature: __________________________',
    'Disclaimer: Consult the applicable internal procedure for correct use.',
  ];

  let textY = footerY + 4;
  for (const line of footerLines) {
    doc.text(line, MARGIN, textY);
    textY += 5;
  }

  // Save as single-page PDF
  doc.save(`PlantPulse-Schedule-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}
