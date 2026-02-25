'use client';

// Equipment Setup modal — configure machines, equipment groups, display groups,
// and product line assignments. Equipment groups are fully user-configurable.
// Changes are held in local draft state and applied on Save.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePlantPulseStore, generateId } from '@/lib/store';
import type { Machine, MachineDisplayGroup, EquipmentGroup } from '@/lib/types';

// ─── Types ─────────────────────────────────────────────────────────────

type Tab = 'machines' | 'equipmentGroups' | 'displayGroups';

interface Props {
  open: boolean;
  onClose: () => void;
}

// ─── Component ─────────────────────────────────────────────────────────

export default function EquipmentSetup({ open, onClose }: Props) {
  const machines = usePlantPulseStore((s) => s.machines);
  const machineGroups = usePlantPulseStore((s) => s.machineGroups);
  const equipmentGroups = usePlantPulseStore((s) => s.equipmentGroups);
  const productLines = usePlantPulseStore((s) => s.productLines);
  const setMachines = usePlantPulseStore((s) => s.setMachines);
  const setMachineGroups = usePlantPulseStore((s) => s.setMachineGroups);
  const setEquipmentGroups = usePlantPulseStore((s) => s.setEquipmentGroups);

  // Local draft state — changes are buffered here until Save
  const [draftMachines, setDraftMachines] = useState<Machine[]>([]);
  const [draftDisplayGroups, setDraftDisplayGroups] = useState<MachineDisplayGroup[]>([]);
  const [draftEquipmentGroups, setDraftEquipmentGroups] = useState<EquipmentGroup[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('machines');
  const [filterLine, setFilterLine] = useState<string>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // Sorted equipment groups for consistent dropdown/display order
  const sortedEqGroups = useMemo(
    () => [...draftEquipmentGroups].sort((a, b) => a.displayOrder - b.displayOrder),
    [draftEquipmentGroups]
  );

  // Build lookup: equipment group id → display name
  const eqGroupNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const eg of draftEquipmentGroups) {
      map[eg.id] = eg.name;
    }
    return map;
  }, [draftEquipmentGroups]);

  // Reset draft when modal opens
  useEffect(() => {
    if (open) {
      setDraftMachines([...machines]);
      setDraftDisplayGroups(machineGroups.map((g) => ({ ...g, machineIds: [...g.machineIds] })));
      setDraftEquipmentGroups(equipmentGroups.map((eg) => ({ ...eg })));
      setEditingId(null);
      setDirty(false);
    }
  }, [open, machines, machineGroups, equipmentGroups]);

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
    const defaultGroup = sortedEqGroups[0]?.id ?? '';
    const newMachine: Machine = {
      id: newId,
      name: newId,
      group: defaultGroup,
      productLine: productLines[0]?.id,
      displayOrder: nextOrder,
    };
    setDraftMachines((prev) => [...prev, newMachine]);
    setEditingId(newId);
    setDirty(true);
  }

  function removeMachine(id: string) {
    setDraftMachines((prev) => prev.filter((m) => m.id !== id));
    setDraftDisplayGroups((prev) =>
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

  // ── Equipment group editing ────────────────────────────────────────

  function addEquipmentGroup() {
    const nextOrder =
      draftEquipmentGroups.length > 0
        ? Math.max(...draftEquipmentGroups.map((eg) => eg.displayOrder)) + 1
        : 0;
    const newId = generateId('eg-');
    setDraftEquipmentGroups((prev) => [
      ...prev,
      { id: newId, name: 'New Group', shortName: 'NEW', displayOrder: nextOrder },
    ]);
    setEditingId(newId);
    setDirty(true);
  }

  function removeEquipmentGroup(id: string) {
    setDraftEquipmentGroups((prev) => prev.filter((eg) => eg.id !== id));
    if (editingId === id) setEditingId(null);
    setDirty(true);
  }

  function updateDraftEquipmentGroup(id: string, updates: Partial<EquipmentGroup>) {
    setDraftEquipmentGroups((prev) =>
      prev.map((eg) => (eg.id === id ? { ...eg, ...updates } : eg))
    );
    setDirty(true);
  }

  function moveEquipmentGroup(id: string, direction: 'up' | 'down') {
    setDraftEquipmentGroups((prev) => {
      const sorted = [...prev].sort((a, b) => a.displayOrder - b.displayOrder);
      const idx = sorted.findIndex((eg) => eg.id === id);
      if (idx < 0) return prev;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= sorted.length) return prev;
      const orderA = sorted[idx].displayOrder;
      const orderB = sorted[swapIdx].displayOrder;
      return prev.map((eg) => {
        if (eg.id === sorted[idx].id) return { ...eg, displayOrder: orderB };
        if (eg.id === sorted[swapIdx].id) return { ...eg, displayOrder: orderA };
        return eg;
      });
    });
    setDirty(true);
  }

  // ── Display group editing ──────────────────────────────────────────

  function addDisplayGroup() {
    const newId = generateId('GRP-');
    setDraftDisplayGroups((prev) => [
      ...prev,
      { id: newId, name: 'New Group', machineIds: [] },
    ]);
    setDirty(true);
  }

  function removeDisplayGroup(id: string) {
    setDraftDisplayGroups((prev) => prev.filter((g) => g.id !== id));
    setDirty(true);
  }

  function updateDisplayGroupName(id: string, name: string) {
    setDraftDisplayGroups((prev) =>
      prev.map((g) => (g.id === id ? { ...g, name } : g))
    );
    setDirty(true);
  }

  function toggleMachineInDisplayGroup(groupId: string, machineId: string) {
    setDraftDisplayGroups((prev) =>
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
    setMachineGroups(draftDisplayGroups);
    setEquipmentGroups(draftEquipmentGroups);
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

  // Count machines per equipment group for the badge
  const machineCountByEqGroup = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of draftMachines) {
      counts[m.group] = (counts[m.group] || 0) + 1;
    }
    return counts;
  }, [draftMachines]);

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
            onClick={() => { setActiveTab('machines'); setEditingId(null); }}
          >
            Machines ({draftMachines.length})
          </button>
          <button
            className={`pp-modal-tab ${activeTab === 'equipmentGroups' ? 'active' : ''}`}
            onClick={() => { setActiveTab('equipmentGroups'); setEditingId(null); }}
          >
            Equipment Groups ({draftEquipmentGroups.length})
          </button>
          <button
            className={`pp-modal-tab ${activeTab === 'displayGroups' ? 'active' : ''}`}
            onClick={() => { setActiveTab('displayGroups'); setEditingId(null); }}
          >
            Display Groups ({draftDisplayGroups.length})
          </button>
        </div>

        {/* Body */}
        <div className="pp-modal-body">
          {/* ── Machines tab ─────────────────────────────────────── */}
          {activeTab === 'machines' && (
            <>
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
                            updateDraftMachine(m.id, { group: e.target.value })
                          }
                          className="pp-setup-select-sm"
                        >
                          {sortedEqGroups.map((eg) => (
                            <option key={eg.id} value={eg.id}>{eg.name}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="pp-setup-badge">
                          {eqGroupNameById[m.group] || m.group}
                        </span>
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

          {/* ── Equipment Groups tab ─────────────────────────────── */}
          {activeTab === 'equipmentGroups' && (
            <>
              <div className="pp-setup-filter-bar">
                <span className="pp-setup-filter-label">
                  Equipment groups classify machines by type (e.g. Propagator, Fermenter).
                  They appear as filter buttons on the Schedule view.
                </span>
                <div style={{ flex: 1 }} />
                <button className="pp-setup-add-btn" onClick={addEquipmentGroup}>
                  + Add Group
                </button>
              </div>

              <div className="pp-setup-list">
                <div className="pp-setup-list-header">
                  <span className="pp-setup-col-order">#</span>
                  <span className="pp-setup-col-name">Name</span>
                  <span className="pp-setup-col-group">Short Name</span>
                  <span className="pp-setup-col-line">Machines</span>
                  <span className="pp-setup-col-actions">Actions</span>
                </div>
                {sortedEqGroups.length === 0 && (
                  <div className="pp-setup-empty">No equipment groups defined. Add one to get started.</div>
                )}
                {sortedEqGroups.map((eg, idx) => (
                  <div
                    key={eg.id}
                    className={`pp-setup-row ${editingId === eg.id ? 'editing' : ''}`}
                  >
                    <span className="pp-setup-col-order">
                      <button
                        className="pp-setup-move-btn"
                        onClick={() => moveEquipmentGroup(eg.id, 'up')}
                        disabled={idx === 0}
                        title="Move up"
                      >
                        &uarr;
                      </button>
                      <button
                        className="pp-setup-move-btn"
                        onClick={() => moveEquipmentGroup(eg.id, 'down')}
                        disabled={idx === sortedEqGroups.length - 1}
                        title="Move down"
                      >
                        &darr;
                      </button>
                    </span>

                    <span className="pp-setup-col-name">
                      {editingId === eg.id ? (
                        <input
                          type="text"
                          value={eg.name}
                          onChange={(e) => updateDraftEquipmentGroup(eg.id, { name: e.target.value })}
                          className="pp-setup-input"
                          autoFocus
                        />
                      ) : (
                        <span
                          className="pp-setup-clickable"
                          onClick={() => setEditingId(eg.id)}
                          title="Click to edit"
                        >
                          {eg.name}
                        </span>
                      )}
                    </span>

                    <span className="pp-setup-col-group">
                      {editingId === eg.id ? (
                        <input
                          type="text"
                          value={eg.shortName}
                          onChange={(e) => updateDraftEquipmentGroup(eg.id, { shortName: e.target.value })}
                          className="pp-setup-input"
                          style={{ maxWidth: 80 }}
                          maxLength={6}
                        />
                      ) : (
                        <span className="pp-setup-badge">{eg.shortName}</span>
                      )}
                    </span>

                    <span className="pp-setup-col-line">
                      <span className="text-xs text-[var(--pp-muted)]">
                        {machineCountByEqGroup[eg.id] || 0} assigned
                      </span>
                    </span>

                    <span className="pp-setup-col-actions">
                      {editingId === eg.id ? (
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
                          onClick={() => setEditingId(eg.id)}
                          title="Edit"
                        >
                          Edit
                        </button>
                      )}
                      <button
                        className="pp-setup-action-btn pp-setup-delete-btn"
                        onClick={() => removeEquipmentGroup(eg.id)}
                        title="Delete group"
                      >
                        Del
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── Display Groups tab ───────────────────────────────── */}
          {activeTab === 'displayGroups' && (
            <>
              <div className="pp-setup-filter-bar">
                <span className="pp-setup-filter-label">
                  Display groups control how machines are organized on the timeline.
                </span>
                <div style={{ flex: 1 }} />
                <button className="pp-setup-add-btn" onClick={addDisplayGroup}>
                  + Add Group
                </button>
              </div>

              <div className="pp-setup-groups">
                {draftDisplayGroups.map((g) => (
                  <div key={g.id} className="pp-setup-group-card">
                    <div className="pp-setup-group-header">
                      <input
                        type="text"
                        value={g.name}
                        onChange={(e) => updateDisplayGroupName(g.id, e.target.value)}
                        className="pp-setup-input pp-setup-group-name-input"
                      />
                      <span className="pp-setup-group-count">
                        {g.machineIds.length} machines
                      </span>
                      <button
                        className="pp-setup-action-btn pp-setup-delete-btn"
                        onClick={() => removeDisplayGroup(g.id)}
                        title="Delete group"
                      >
                        Del
                      </button>
                    </div>
                    <div className="pp-setup-group-machines">
                      {[...draftMachines]
                        .sort((a, b) => a.displayOrder - b.displayOrder)
                        .map((m) => (
                          <label key={m.id} className="pp-setup-group-checkbox">
                            <input
                              type="checkbox"
                              checked={g.machineIds.includes(m.id)}
                              onChange={() => toggleMachineInDisplayGroup(g.id, m.id)}
                            />
                            <span>{m.name}</span>
                            <span className="pp-setup-group-checkbox-tag">
                              {eqGroupNameById[m.group] || m.group}
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
