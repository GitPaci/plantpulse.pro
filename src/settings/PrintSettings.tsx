'use client';

// Print Settings modal for Schedule PDF export.
// Persists settings to localStorage; enterprise features shown as CTA card.

import { useState, useEffect, useCallback } from 'react';
import {
  loadPrintSettings,
  savePrintSettings,
  type SchedulePrintSettings,
} from '@/utils/exportSchedulePdf';

interface PrintSettingsProps {
  open: boolean;
  onClose: () => void;
}

const TOGGLE_FIELDS = [
  ['showVersion', 'Show version number'],
  ['showTimestamp', 'Show export timestamp'],
  ['showPreparedBy', 'Show "Prepared by"'],
  ['showSignature', 'Show signature line'],
  ['showPageNumbers', 'Show page numbers'],
] as const;

export default function PrintSettings({ open, onClose }: PrintSettingsProps) {
  const [settings, setSettings] = useState<SchedulePrintSettings>(loadPrintSettings);

  // Reload settings each time the modal opens
  useEffect(() => {
    if (open) {
      setSettings(loadPrintSettings());
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  const handleSave = () => {
    savePrintSettings(settings);
    onClose();
  };

  const update = <K extends keyof SchedulePrintSettings>(
    key: K,
    value: SchedulePrintSettings[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  if (!open) return null;

  return (
    <div className="pp-modal-backdrop" onClick={handleBackdropClick}>
      <div className="pp-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="pp-modal-header">
          <h2>Print Settings</h2>
          <button className="pp-modal-close" onClick={onClose} aria-label="Close">
            &#x2715;
          </button>
        </div>

        {/* Body */}
        <div className="pp-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* --- Free editable fields --- */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Header &amp; Footer
            </legend>

            <label className="block">
              <span className="text-xs text-slate-600">Facility Title</span>
              <input
                type="text"
                value={settings.facilityTitle}
                onChange={(e) => update('facilityTitle', e.target.value)}
                placeholder="Leave empty to hide"
                className="mt-1 block w-full rounded border border-[var(--pp-border)] px-2.5 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-[var(--pp-pharma)] focus:outline-none"
              />
            </label>

            <label className="block">
              <span className="text-xs text-slate-600">Disclaimer Text</span>
              <input
                type="text"
                value={settings.disclaimerText}
                onChange={(e) => update('disclaimerText', e.target.value)}
                className="mt-1 block w-full rounded border border-[var(--pp-border)] px-2.5 py-1.5 text-sm text-slate-700 focus:border-[var(--pp-pharma)] focus:outline-none"
              />
            </label>
          </fieldset>

          {/* --- Toggle switches --- */}
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Footer Elements
            </legend>

            {TOGGLE_FIELDS.map(([key, label]) => (
              <label key={key} className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings[key]}
                  onChange={(e) => update(key, e.target.checked)}
                  className="rounded border-slate-300 text-[var(--pp-pharma)] focus:ring-[var(--pp-pharma)]"
                />
                <span className="text-sm text-slate-600">{label}</span>
              </label>
            ))}
          </fieldset>

          {/* --- Enterprise CTA card --- */}
          <div className="pp-naming-erp-cta">
            <div className="pp-naming-erp-header">
              <span className="pp-naming-erp-icon">&#x1F5A8;</span>
              <span className="pp-naming-erp-title">Advanced Print &amp; Branding</span>
              <span className="pp-naming-erp-badge">Enterprise</span>
            </div>
            <p className="pp-naming-erp-desc">
              Company logo, custom color themes, watermark overlay, multi-page export,
              electronic signatures, and document control — tailored to your GxP requirements.
            </p>
            <a
              href="mailto:hello@plantpulse.pro?subject=Enterprise%20Print%20Features%20Inquiry"
              className="pp-naming-erp-link"
            >
              Ask for a quote &rarr; hello@plantpulse.pro
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="pp-modal-footer" style={{ justifyContent: 'flex-end' }}>
          <button className="pp-modal-btn pp-modal-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="pp-modal-btn pp-modal-btn-primary" onClick={handleSave}>
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
