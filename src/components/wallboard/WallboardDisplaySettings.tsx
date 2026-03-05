'use client';

// Wallboard Display Settings — standalone modal for configuring which
// equipment groups appear on the Wallboard. Same UI as the Wallboard Display
// tab in Equipment Setup, but accessible directly from the Wallboard toolbar.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { usePlantPulseStore } from '@/lib/store';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function WallboardDisplaySettings({ open, onClose }: Props) {
  const machines = usePlantPulseStore((s) => s.machines);
  const equipmentGroups = usePlantPulseStore((s) => s.equipmentGroups);
  const wallboardEquipmentGroups = usePlantPulseStore((s) => s.wallboardEquipmentGroups);
  const setWallboardEquipmentGroups = usePlantPulseStore((s) => s.setWallboardEquipmentGroups);

  const [draftGroups, setDraftGroups] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);

  // Reset draft when modal opens
  useEffect(() => {
    if (open) {
      setDraftGroups(new Set(wallboardEquipmentGroups));
      setDirty(false);
    }
  }, [open, wallboardEquipmentGroups]);

  const sortedEqGroups = useMemo(
    () => [...equipmentGroups].sort((a, b) => a.displayOrder - b.displayOrder),
    [equipmentGroups]
  );

  const toggleGroup = useCallback((groupId: string) => {
    setDraftGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
    setDirty(true);
  }, []);

  const machineCount = useMemo(() => {
    let total = 0;
    for (const m of machines) {
      if (draftGroups.has(m.group)) total++;
    }
    return total;
  }, [machines, draftGroups]);

  function handleSave() {
    setWallboardEquipmentGroups([...draftGroups]);
    setDirty(false);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="pp-modal-backdrop" onClick={onClose}>
      <div
        className="pp-modal"
        style={{ maxWidth: 520, width: '90vw' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="pp-modal-header">
          <h2 className="pp-modal-title">Wallboard Display</h2>
          <button className="pp-modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="pp-modal-body" style={{ padding: '16px 20px' }}>
          <p className="pp-process-help">
            Choose which equipment groups appear on the Wallboard.
            The wallboard is focused on shopfloor shift handover — typically
            lab-scale inoculum vessels are excluded.
          </p>

          <div className="pp-wallboard-summary">
            {machineCount} machine{machineCount !== 1 ? 's' : ''} visible
            &nbsp;&middot;&nbsp;
            {draftGroups.size} of {equipmentGroups.length} groups selected
          </div>

          <div className="pp-wallboard-group-list">
            {sortedEqGroups.map((eg) => {
              const checked = draftGroups.has(eg.id);
              const groupMachines = machines
                .filter((m) => m.group === eg.id)
                .sort((a, b) => a.displayOrder - b.displayOrder);
              const machineNames = groupMachines.map((m) => m.name);

              return (
                <label
                  key={eg.id}
                  className={`pp-wallboard-group-card ${checked ? 'selected' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleGroup(eg.id)}
                    className="pp-wallboard-checkbox"
                  />
                  <div className="pp-wallboard-group-info">
                    <span className="pp-wallboard-group-name">
                      {eg.name}
                      <span className="pp-setup-badge" style={{ marginLeft: 6 }}>{eg.shortName}</span>
                    </span>
                    <span className="pp-wallboard-group-machines">
                      {groupMachines.length === 0
                        ? 'No machines'
                        : machineNames.length <= 6
                          ? machineNames.join(', ')
                          : `${machineNames.slice(0, 5).join(', ')} +${machineNames.length - 5} more`
                      }
                    </span>
                  </div>
                  <span className="pp-wallboard-group-count">
                    {groupMachines.length}
                  </span>
                </label>
              );
            })}
          </div>

          {draftGroups.size === 0 && (
            <div className="pp-process-shutdown-warning" style={{ marginTop: 8 }}>
              <span className="pp-process-shutdown-warning-icon">&#9888;</span>
              <span>No groups selected — the wallboard will be empty.</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pp-modal-footer">
          {dirty && (
            <span className="pp-modal-dirty-indicator">Unsaved changes</span>
          )}
          <div style={{ flex: 1 }} />
          <button className="pp-modal-btn pp-modal-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="pp-modal-btn pp-modal-btn-primary"
            onClick={handleSave}
            disabled={!dirty}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
