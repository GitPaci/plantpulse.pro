'use client';

// Equipment Setup modal — configure machines, equipment groups, product lines.
// Product lines drive display groups on the timeline (auto-derived on Save).
// Changes are held in local draft state and applied on Save.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePlantPulseStore, generateId } from '@/lib/store';
import type { Machine, MachineDisplayGroup, EquipmentGroup, MachineDowntime, ProductLine } from '@/lib/types';
import { isMachineUnavailable, hasMachineDowntime } from '@/lib/types';

// ─── Date helpers for datetime-local inputs ────────────────────────────

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// ─── Auto-derive display groups from product lines + machine assignments ─

function buildDisplayGroups(
  pLines: ProductLine[],
  machines: Machine[],
): MachineDisplayGroup[] {
  return [...pLines]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((pl) => ({
      id: pl.id,
      name: pl.name,
      machineIds: machines
        .filter((m) => m.productLine === pl.id)
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((m) => m.id),
    }))
    .filter((g) => g.machineIds.length > 0);
}

// ─── Types ─────────────────────────────────────────────────────────────

type Tab = 'machines' | 'equipmentGroups' | 'productLines';

interface Props {
  open: boolean;
  onClose: () => void;
}

// ─── Component ─────────────────────────────────────────────────────────

export default function EquipmentSetup({ open, onClose }: Props) {
  const machines = usePlantPulseStore((s) => s.machines);
  const equipmentGroups = usePlantPulseStore((s) => s.equipmentGroups);
  const productLines = usePlantPulseStore((s) => s.productLines);
  const setMachines = usePlantPulseStore((s) => s.setMachines);
  const setMachineGroups = usePlantPulseStore((s) => s.setMachineGroups);
  const setEquipmentGroups = usePlantPulseStore((s) => s.setEquipmentGroups);
  const setProductLines = usePlantPulseStore((s) => s.setProductLines);

  // Local draft state — changes are buffered here until Save
  const [draftMachines, setDraftMachines] = useState<Machine[]>([]);
  const [draftEquipmentGroups, setDraftEquipmentGroups] = useState<EquipmentGroup[]>([]);
  const [draftProductLines, setDraftProductLines] = useState<ProductLine[]>([]);
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

  // Sorted product lines
  const sortedProductLines = useMemo(
    () => [...draftProductLines].sort((a, b) => a.displayOrder - b.displayOrder),
    [draftProductLines]
  );

  // Reset draft when modal opens
  useEffect(() => {
    if (open) {
      setDraftMachines([...machines]);
      setDraftEquipmentGroups(equipmentGroups.map((eg) => ({ ...eg })));
      setDraftProductLines(productLines.map((pl) => ({
        ...pl,
        stageDefaults: pl.stageDefaults.map((sd) => ({ ...sd })),
      })));
      setEditingId(null);
      setDirty(false);
    }
  }, [open, machines, equipmentGroups, productLines]);

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
      productLine: sortedProductLines[0]?.id,
      displayOrder: nextOrder,
    };
    setDraftMachines((prev) => [...prev, newMachine]);
    setEditingId(newId);
    setDirty(true);
  }

  function removeMachine(id: string) {
    setDraftMachines((prev) => prev.filter((m) => m.id !== id));
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

  // ── Machine downtime editing ─────────────────────────────────────────

  function setMachineDowntime(id: string, downtime: MachineDowntime | undefined) {
    updateDraftMachine(id, { downtime });
  }

  function addDowntime(id: string) {
    setMachineDowntime(id, {
      startDate: new Date(),
      endDate: undefined,
      reason: '',
    });
  }

  function clearDowntime(id: string) {
    setMachineDowntime(id, undefined);
  }

  function updateDowntimeField(
    id: string,
    current: MachineDowntime,
    field: keyof MachineDowntime,
    value: Date | string | undefined
  ) {
    setMachineDowntime(id, { ...current, [field]: value });
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

  // ── Product line editing ───────────────────────────────────────────

  function addProductLine() {
    const nextOrder =
      draftProductLines.length > 0
        ? Math.max(...draftProductLines.map((pl) => pl.displayOrder)) + 1
        : 1;
    const newId = generateId('PL-');
    setDraftProductLines((prev) => [
      ...prev,
      { id: newId, name: 'New Line', displayOrder: nextOrder, stageDefaults: [] },
    ]);
    setEditingId(newId);
    setDirty(true);
  }

  function removeProductLine(id: string) {
    setDraftProductLines((prev) => prev.filter((pl) => pl.id !== id));
    // Unassign machines from the deleted product line
    setDraftMachines((prev) =>
      prev.map((m) => (m.productLine === id ? { ...m, productLine: undefined } : m))
    );
    if (editingId === id) setEditingId(null);
    setDirty(true);
  }

  function updateDraftProductLine(id: string, updates: Partial<ProductLine>) {
    setDraftProductLines((prev) =>
      prev.map((pl) => (pl.id === id ? { ...pl, ...updates } : pl))
    );
    setDirty(true);
  }

  function moveProductLine(id: string, direction: 'up' | 'down') {
    setDraftProductLines((prev) => {
      const sorted = [...prev].sort((a, b) => a.displayOrder - b.displayOrder);
      const idx = sorted.findIndex((pl) => pl.id === id);
      if (idx < 0) return prev;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= sorted.length) return prev;
      const orderA = sorted[idx].displayOrder;
      const orderB = sorted[swapIdx].displayOrder;
      return prev.map((pl) => {
        if (pl.id === sorted[idx].id) return { ...pl, displayOrder: orderB };
        if (pl.id === sorted[swapIdx].id) return { ...pl, displayOrder: orderA };
        return pl;
      });
    });
    setDirty(true);
  }

  // ── Save / Cancel ──────────────────────────────────────────────────

  function handleSave() {
    // Auto-derive display groups from product lines + machine assignments
    const derivedGroups = buildDisplayGroups(draftProductLines, draftMachines);

    setMachines(draftMachines);
    setMachineGroups(derivedGroups);
    setEquipmentGroups(draftEquipmentGroups);
    setProductLines(draftProductLines);
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

  // Machines grouped by product line (for Product Lines tab preview)
  const machinesByProductLine = useMemo(() => {
    const map: Record<string, Machine[]> = {};
    for (const m of draftMachines) {
      if (m.productLine) {
        if (!map[m.productLine]) map[m.productLine] = [];
        map[m.productLine].push(m);
      }
    }
    // Sort machines within each group
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.displayOrder - b.displayOrder);
    }
    return map;
  }, [draftMachines]);

  const unassignedMachines = useMemo(
    () => draftMachines.filter((m) => !m.productLine).sort((a, b) => a.displayOrder - b.displayOrder),
    [draftMachines]
  );

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
            className={`pp-modal-tab ${activeTab === 'productLines' ? 'active' : ''}`}
            onClick={() => { setActiveTab('productLines'); setEditingId(null); }}
          >
            Product Lines ({draftProductLines.length})
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
                  {sortedProductLines.map((pl) => (
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
                {filteredMachines.map((m, idx) => {
                  const isEditing = editingId === m.id;
                  const hasRelevantDowntime = hasMachineDowntime(m);
                  const isCurrentlyDown = isMachineUnavailable(m);
                  const downtimeTitle = hasRelevantDowntime
                    ? isCurrentlyDown
                      ? `Unavailable${m.downtime?.reason ? ': ' + m.downtime.reason : ''}`
                      : `Downtime scheduled${m.downtime?.reason ? ': ' + m.downtime.reason : ''}`
                    : undefined;

                  return (
                  <div key={m.id} className="pp-setup-row-wrapper">
                    <div className={`pp-setup-row ${isEditing ? 'editing' : ''}`}>
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
                        <span className="pp-setup-name-with-indicator">
                          {hasRelevantDowntime && (
                            <span
                              className={`pp-downtime-dot ${isCurrentlyDown ? 'active' : 'scheduled'}`}
                              title={downtimeTitle}
                            />
                          )}
                          {isEditing ? (
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
                      </span>

                      <span className="pp-setup-col-group">
                        {isEditing ? (
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
                        {isEditing ? (
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
                            {sortedProductLines.map((pl) => (
                              <option key={pl.id} value={pl.id}>{pl.name}</option>
                            ))}
                          </select>
                        ) : (
                          <span>
                            {draftProductLines.find((pl) => pl.id === m.productLine)?.name || '—'}
                          </span>
                        )}
                      </span>

                      <span className="pp-setup-col-actions">
                        {isEditing ? (
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

                    {/* Downtime editor — shown when editing this machine */}
                    {isEditing && (
                      <div className="pp-downtime-panel">
                        <div className="pp-downtime-header">
                          <span className="pp-downtime-label">Unavailability</span>
                          {!m.downtime ? (
                            <button
                              className="pp-setup-add-btn pp-downtime-add-btn"
                              onClick={() => addDowntime(m.id)}
                            >
                              + Set unavailable
                            </button>
                          ) : (
                            <button
                              className="pp-setup-action-btn pp-setup-delete-btn"
                              onClick={() => clearDowntime(m.id)}
                              title="Clear downtime"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                        {m.downtime && (
                          <div className="pp-downtime-fields">
                            <div className="pp-downtime-field">
                              <label className="pp-downtime-field-label">From</label>
                              <input
                                type="datetime-local"
                                value={toDatetimeLocal(m.downtime.startDate)}
                                onChange={(e) => {
                                  const d = fromDatetimeLocal(e.target.value);
                                  if (d) updateDowntimeField(m.id, m.downtime!, 'startDate', d);
                                }}
                                className="pp-setup-input pp-downtime-date-input"
                              />
                            </div>
                            <div className="pp-downtime-field">
                              <label className="pp-downtime-field-label">
                                Until
                                {!m.downtime.endDate && (
                                  <span className="pp-downtime-indefinite">(indefinite)</span>
                                )}
                              </label>
                              <div className="pp-downtime-end-row">
                                <input
                                  type="datetime-local"
                                  value={m.downtime.endDate ? toDatetimeLocal(m.downtime.endDate) : ''}
                                  onChange={(e) => {
                                    const d = fromDatetimeLocal(e.target.value);
                                    updateDowntimeField(m.id, m.downtime!, 'endDate', d ?? undefined);
                                  }}
                                  className="pp-setup-input pp-downtime-date-input"
                                  placeholder="Leave empty for indefinite"
                                />
                                {m.downtime.endDate && (
                                  <button
                                    className="pp-setup-action-btn"
                                    onClick={() => updateDowntimeField(m.id, m.downtime!, 'endDate', undefined)}
                                    title="Set to indefinite"
                                  >
                                    &infin;
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="pp-downtime-field">
                              <label className="pp-downtime-field-label">Reason</label>
                              <input
                                type="text"
                                value={m.downtime.reason || ''}
                                onChange={(e) =>
                                  updateDowntimeField(m.id, m.downtime!, 'reason', e.target.value)
                                }
                                className="pp-setup-input"
                                placeholder="e.g. CIP rebuild, Inspection"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ── Equipment Groups tab ─────────────────────────────── */}
          {activeTab === 'equipmentGroups' && (
            <>
              <div className="pp-setup-desc-bar">
                <p className="pp-setup-desc-text">
                  Equipment groups classify machines by type
                  (e.g. Propagator, Fermenter).<br />
                  They appear as filter buttons on the Schedule view.
                </p>
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

          {/* ── Product Lines tab ─────────────────────────────────── */}
          {activeTab === 'productLines' && (
            <>
              <div className="pp-setup-desc-bar">
                <p className="pp-setup-desc-text">
                  Product lines group machines on the timeline. Assigning a machine
                  to a product line (in the Machines tab) automatically places it in
                  the corresponding timeline group.
                </p>
                <button className="pp-setup-add-btn" onClick={addProductLine}>
                  + Add Line
                </button>
              </div>

              <div className="pp-setup-groups">
                {sortedProductLines.map((pl, idx) => {
                  const plMachines = machinesByProductLine[pl.id] || [];
                  const isEditing = editingId === pl.id;
                  return (
                    <div key={pl.id} className={`pp-setup-group-card ${isEditing ? 'editing' : ''}`}>
                      <div className="pp-setup-group-header">
                        <span className="pp-setup-col-order" style={{ width: 'auto', marginRight: 4 }}>
                          <button
                            className="pp-setup-move-btn"
                            onClick={() => moveProductLine(pl.id, 'up')}
                            disabled={idx === 0}
                            title="Move up"
                          >
                            &uarr;
                          </button>
                          <button
                            className="pp-setup-move-btn"
                            onClick={() => moveProductLine(pl.id, 'down')}
                            disabled={idx === sortedProductLines.length - 1}
                            title="Move down"
                          >
                            &darr;
                          </button>
                        </span>
                        {isEditing ? (
                          <input
                            type="text"
                            value={pl.name}
                            onChange={(e) => updateDraftProductLine(pl.id, { name: e.target.value })}
                            className="pp-setup-input pp-setup-group-name-input"
                            autoFocus
                          />
                        ) : (
                          <span
                            className="pp-setup-clickable"
                            style={{ fontWeight: 500 }}
                            onClick={() => setEditingId(pl.id)}
                            title="Click to rename"
                          >
                            {pl.name}
                          </span>
                        )}
                        <span className="pp-setup-group-count">
                          {plMachines.length} machines
                        </span>
                        {isEditing ? (
                          <button
                            className="pp-setup-action-btn pp-setup-done-btn"
                            onClick={() => setEditingId(null)}
                            title="Done"
                          >
                            Done
                          </button>
                        ) : (
                          <button
                            className="pp-setup-action-btn"
                            onClick={() => setEditingId(pl.id)}
                            title="Edit"
                          >
                            Edit
                          </button>
                        )}
                        <button
                          className="pp-setup-action-btn pp-setup-delete-btn"
                          onClick={() => removeProductLine(pl.id)}
                          title="Delete product line"
                        >
                          Del
                        </button>
                      </div>
                      <div className="pp-setup-group-machines">
                        {plMachines.length === 0 ? (
                          <span className="text-xs text-[var(--pp-muted)]" style={{ padding: '4px 0' }}>
                            No machines assigned. Use the Machines tab to assign equipment to this line.
                          </span>
                        ) : (
                          plMachines.map((m) => (
                            <span key={m.id} className="pp-setup-pl-machine-chip">
                              {hasMachineDowntime(m) && (
                                <span
                                  className={`pp-downtime-dot ${isMachineUnavailable(m) ? 'active' : 'scheduled'}`}
                                  title={m.downtime?.reason || 'Downtime'}
                                />
                              )}
                              {m.name}
                              <span className="pp-setup-group-checkbox-tag">
                                {eqGroupNameById[m.group] || m.group}
                              </span>
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}

                {unassignedMachines.length > 0 && (
                  <div className="pp-setup-group-card" style={{ opacity: 0.7 }}>
                    <div className="pp-setup-group-header">
                      <span style={{ fontWeight: 500, color: 'var(--pp-muted)' }}>Unassigned</span>
                      <span className="pp-setup-group-count">
                        {unassignedMachines.length} machines
                      </span>
                    </div>
                    <div className="pp-setup-group-machines">
                      {unassignedMachines.map((m) => (
                        <span key={m.id} className="pp-setup-pl-machine-chip">
                          {m.name}
                          <span className="pp-setup-group-checkbox-tag">
                            {eqGroupNameById[m.group] || m.group}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
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
