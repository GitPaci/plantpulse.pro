'use client';

// Equipment Setup modal — configure machines, groups, and product line assignments
// Changes are held in local draft state and applied on Save.

import { useState, useEffect, useCallback } from 'react';
import { usePlantPulseStore, generateId } from '@/lib/store';
import type { Machine, MachineGroup, MachineDisplayGroup } from '@/lib/types';

// ─── Constants ─────────────────────────────────────────────────────────

const GROUP_LABELS: Record<MachineGroup, string> = {
  propagator: 'Propagator',
  pre_fermenter: 'Pre-fermenter',
  fermenter: 'Fermenter',
  inoculum: 'Inoculum',
};

const GROUP_OPTIONS: MachineGroup[] = ['inoculum', 'propagator', 'pre_fermenter', 'fermenter'];

// ─── Types ─────────────────────────────────────────────────────────────

type Tab = 'machines' | 'groups';

interface Props {
  open: boolean;
  onClose: () => void;
}

// ─── Component ─────────────────────────────────────────────────────────

export default function EquipmentSetup({ open, onClose }: Props) {
  const machines = usePlantPulseStore((s) => s.machines);
  const machineGroups = usePlantPulseStore((s) => s.machineGroups);
  const productLines = usePlantPulseStore((s) => s.productLines);
  const setMachines = usePlantPulseStore((s) => s.setMachines);
  const setMachineGroups = usePlantPulseStore((s) => s.setMachineGroups);

  // Local draft state — changes are buffered here until Save
  const [draftMachines, setDraftMachines] = useState<Machine[]>([]);
  const [draftGroups, setDraftGroups] = useState<MachineDisplayGroup[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('machines');
  const [filterLine, setFilterLine] = useState<string>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // Reset draft when modal opens
  useEffect(() => {
    if (open) {
      setDraftMachines([...machines]);
      setDraftGroups(machineGroups.map((g) => ({ ...g, machineIds: [...g.machineIds] })));
      setEditingId(null);
      setDirty(false);
    }
  }, [open, machines, machineGroups]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // ── Machine editing ────────────────────────────────────────────────

  const updateDraftMachine = useCallback(
    (id: string, updates: Partial<Machine>) => {
      setDraftMachines((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
      );
      setDirty(true);
    },
    []
  );

  function addMachine() {
    const nextOrder =
      draftMachines.length > 0
        ? Math.max(...draftMachines.map((m) => m.displayOrder)) + 1
        : 1;
    const newId = generateId('M-');
    const newMachine: Machine = {
      id: newId,
      name: newId,
      group: 'fermenter',
      productLine: productLines[0]?.id,
      displayOrder: nextOrder,
    };
    setDraftMachines((prev) => [...prev, newMachine]);
    setEditingId(newId);
    setDirty(true);
  }

  function removeMachine(id: string) {
    setDraftMachines((prev) => prev.filter((m) => m.id !== id));
    // Also remove from draft groups
    setDraftGroups((prev) =>
      prev.map((g) => ({
        ...g,
        machineIds: g.machineIds.filter((mid) => mid !== id),
      }))
    );
    if (editingId === id) setEditingId(null);
    setDirty(true);
  }

  function moveMachine(id: string, direction: 'up' | 'down') {
    setDraftMachines((prev) => {
      const sorted = [...prev].sort((a, b) => a.displayOrder - b.displayOrder);
      const idx = sorted.findIndex((m) => m.id === id);
      if (idx < 0) return prev;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= sorted.length) return prev;
      // Swap display orders
      const orderA = sorted[idx].displayOrder;
      const orderB = sorted[swapIdx].displayOrder;
      return prev.map((m) => {
        if (m.id === sorted[idx].id) return { ...m, displayOrder: orderB };
        if (m.id === sorted[swapIdx].id) return { ...m, displayOrder: orderA };
        return m;
      });
    });
    setDirty(true);
  }

  // ── Group editing ──────────────────────────────────────────────────

  function addGroup() {
    const newId = generateId('GRP-');
    setDraftGroups((prev) => [
      ...prev,
      { id: newId, name: 'New Group', machineIds: [] },
    ]);
    setDirty(true);
  }

  function removeGroup(id: string) {
    setDraftGroups((prev) => prev.filter((g) => g.id !== id));
    setDirty(true);
  }

  function updateGroupName(id: string, name: string) {
    setDraftGroups((prev) =>
      prev.map((g) => (g.id === id ? { ...g, name } : g))
    );
    setDirty(true);
  }

  function toggleMachineInGroup(groupId: string, machineId: string) {
    setDraftGroups((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g;
        const has = g.machineIds.includes(machineId);
        return {
          ...g,
          machineIds: has
            ? g.machineIds.filter((mid) => mid !== machineId)
            : [...g.machineIds, machineId],
        };
      })
    );
    setDirty(true);
  }

  // ── Save / Cancel ──────────────────────────────────────────────────

  function handleSave() {
    setMachines(draftMachines);
    setMachineGroups(draftGroups);
    setDirty(false);
    onClose();
  }

  function handleCancel() {
    onClose();
  }

  // ── Filter ─────────────────────────────────────────────────────────

  const filteredMachines = draftMachines
    .filter((m) => filterLine === 'all' || m.productLine === filterLine || (!m.productLine && filterLine === 'none'))
    .sort((a, b) => a.displayOrder - b.displayOrder);

  // ── Render ─────────────────────────────────────────────────────────

  if (!open) return null;

  return (
    <div className="pp-modal-backdrop" onClick={handleCancel}>
      <div
        className="pp-modal pp-modal-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Equipment Setup"
      >
        {/* Header */}
        <div className="pp-modal-header">
          <h2>Equipment Setup</h2>
          <button className="pp-modal-close" onClick={handleCancel} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="pp-modal-tabs">
          <button
            className={`pp-modal-tab ${activeTab === 'machines' ? 'active' : ''}`}
            onClick={() => setActiveTab('machines')}
          >
            Machines ({draftMachines.length})
          </button>
          <button
            className={`pp-modal-tab ${activeTab === 'groups' ? 'active' : ''}`}
            onClick={() => setActiveTab('groups')}
          >
            Display Groups ({draftGroups.length})
          </button>
        </div>

        {/* Body */}
        <div className="pp-modal-body">
          {activeTab === 'machines' && (
            <>
              {/* Filter bar */}
              <div className="pp-setup-filter-bar">
                <label className="pp-setup-filter-label">Product line:</label>
                <select
                  value={filterLine}
                  onChange={(e) => setFilterLine(e.target.value)}
                  className="pp-setup-select"
                >
                  <option value="all">All lines</option>
                  {productLines.map((pl) => (
                    <option key={pl.id} value={pl.id}>{pl.name}</option>
                  ))}
                  <option value="none">Unassigned</option>
                </select>
                <div style={{ flex: 1 }} />
                <button className="pp-setup-add-btn" onClick={addMachine}>
                  + Add Machine
                </button>
              </div>

              {/* Machine list */}
              <div className="pp-setup-list">
                <div className="pp-setup-list-header">
                  <span className="pp-setup-col-order">#</span>
                  <span className="pp-setup-col-name">Name</span>
                  <span className="pp-setup-col-group">Group</span>
                  <span className="pp-setup-col-line">Product Line</span>
                  <span className="pp-setup-col-actions">Actions</span>
                </div>
                {filteredMachines.length === 0 && (
                  <div className="pp-setup-empty">No machines match the current filter.</div>
                )}
                {filteredMachines.map((m, idx) => (
                  <div
                    key={m.id}
                    className={`pp-setup-row ${editingId === m.id ? 'editing' : ''}`}
                  >
                    <span className="pp-setup-col-order">
                      <button
                        className="pp-setup-move-btn"
                        onClick={() => moveMachine(m.id, 'up')}
                        disabled={idx === 0}
                        title="Move up"
                      >
                        &uarr;
                      </button>
                      <button
                        className="pp-setup-move-btn"
                        onClick={() => moveMachine(m.id, 'down')}
                        disabled={idx === filteredMachines.length - 1}
                        title="Move down"
                      >
                        &darr;
                      </button>
                    </span>

                    <span className="pp-setup-col-name">
                      {editingId === m.id ? (
                        <input
                          type="text"
                          value={m.name}
                          onChange={(e) => updateDraftMachine(m.id, { name: e.target.value })}
                          className="pp-setup-input"
                          autoFocus
                        />
                      ) : (
                        <span
                          className="pp-setup-clickable"
                          onClick={() => setEditingId(m.id)}
                          title="Click to edit"
                        >
                          {m.name}
                        </span>
                      )}
                    </span>

                    <span className="pp-setup-col-group">
                      {editingId === m.id ? (
                        <select
                          value={m.group}
                          onChange={(e) =>
                            updateDraftMachine(m.id, { group: e.target.value as MachineGroup })
                          }
                          className="pp-setup-select-sm"
                        >
                          {GROUP_OPTIONS.map((g) => (
                            <option key={g} value={g}>{GROUP_LABELS[g]}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="pp-setup-badge">{GROUP_LABELS[m.group]}</span>
                      )}
                    </span>

                    <span className="pp-setup-col-line">
                      {editingId === m.id ? (
                        <select
                          value={m.productLine || ''}
                          onChange={(e) =>
                            updateDraftMachine(m.id, {
                              productLine: e.target.value || undefined,
                            })
                          }
                          className="pp-setup-select-sm"
                        >
                          <option value="">None</option>
                          {productLines.map((pl) => (
                            <option key={pl.id} value={pl.id}>{pl.name}</option>
                          ))}
                        </select>
                      ) : (
                        <span>
                          {productLines.find((pl) => pl.id === m.productLine)?.name || '—'}
                        </span>
                      )}
                    </span>

                    <span className="pp-setup-col-actions">
                      {editingId === m.id ? (
                        <button
                          className="pp-setup-action-btn pp-setup-done-btn"
                          onClick={() => setEditingId(null)}
                          title="Done editing"
                        >
                          Done
                        </button>
                      ) : (
                        <button
                          className="pp-setup-action-btn"
                          onClick={() => setEditingId(m.id)}
                          title="Edit"
                        >
                          Edit
                        </button>
                      )}
                      <button
                        className="pp-setup-action-btn pp-setup-delete-btn"
                        onClick={() => removeMachine(m.id)}
                        title="Delete"
                      >
                        Del
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {activeTab === 'groups' && (
            <>
              <div className="pp-setup-filter-bar">
                <span className="pp-setup-filter-label">
                  Display groups control how machines are organized on the timeline.
                </span>
                <div style={{ flex: 1 }} />
                <button className="pp-setup-add-btn" onClick={addGroup}>
                  + Add Group
                </button>
              </div>

              <div className="pp-setup-groups">
                {draftGroups.map((g) => (
                  <div key={g.id} className="pp-setup-group-card">
                    <div className="pp-setup-group-header">
                      <input
                        type="text"
                        value={g.name}
                        onChange={(e) => updateGroupName(g.id, e.target.value)}
                        className="pp-setup-input pp-setup-group-name-input"
                      />
                      <span className="pp-setup-group-count">
                        {g.machineIds.length} machines
                      </span>
                      <button
                        className="pp-setup-action-btn pp-setup-delete-btn"
                        onClick={() => removeGroup(g.id)}
                        title="Delete group"
                      >
                        Del
                      </button>
                    </div>
                    <div className="pp-setup-group-machines">
                      {draftMachines
                        .sort((a, b) => a.displayOrder - b.displayOrder)
                        .map((m) => (
                          <label key={m.id} className="pp-setup-group-checkbox">
                            <input
                              type="checkbox"
                              checked={g.machineIds.includes(m.id)}
                              onChange={() => toggleMachineInGroup(g.id, m.id)}
                            />
                            <span>{m.name}</span>
                            <span className="pp-setup-group-checkbox-tag">
                              {GROUP_LABELS[m.group]}
                            </span>
                          </label>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="pp-modal-footer">
          {dirty && (
            <span className="pp-modal-dirty-indicator">Unsaved changes</span>
          )}
          <div style={{ flex: 1 }} />
          <button className="pp-modal-btn pp-modal-btn-secondary" onClick={handleCancel}>
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
