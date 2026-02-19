'use client';

// Print Settings modal for Schedule PDF export.
// Persists settings to localStorage; enterprise fields are visible but disabled.

import { useState, useEffect, useCallback, useRef } from 'react';
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

const ENTERPRISE_FIELDS = [
  'Company logo (top-left)',
  'Custom corporate color theme',
  'Custom footer text presets',
  'Watermark overlay',
  'Multi-page export',
  'Automatic user ID from SSO',
  'Electronic signatures',
  'Document control number / revision',
];

export default function PrintSettings({ open, onClose }: PrintSettingsProps) {
  const [settings, setSettings] = useState<SchedulePrintSettings>(loadPrintSettings);
  const overlayRef = useRef<HTMLDivElement>(null);

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

  // Close on overlay click
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) onClose();
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
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30"
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--pp-border)]">
          <h2 className="text-sm font-semibold text-[var(--pp-pharma)]">
            Print Settings
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-lg leading-none"
            aria-label="Close settings"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-5">
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

          {/* --- Enterprise-locked fields (visible but disabled) --- */}
          <fieldset className="space-y-2 opacity-60">
            <legend className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-2">
              Enterprise Features
              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 normal-case tracking-normal">
                Enterprise
              </span>
            </legend>

            {ENTERPRISE_FIELDS.map((label) => (
              <label
                key={label}
                className="flex items-center gap-2.5 cursor-not-allowed"
                title="Available in Enterprise — contact us for custom branding and multi-site deployment."
              >
                <input
                  type="checkbox"
                  disabled
                  className="rounded border-slate-300 opacity-50"
                />
                <span className="text-sm text-slate-400">{label}</span>
                <span className="ml-auto inline-block px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-100 text-slate-400">
                  Enterprise
                </span>
              </label>
            ))}
          </fieldset>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--pp-border)]">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded border border-[var(--pp-border)] text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1.5 text-xs rounded bg-[var(--pp-pharma)] text-white hover:opacity-90"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
