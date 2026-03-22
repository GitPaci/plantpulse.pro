'use client';

// Equipment Setup modal — configure machines, equipment groups, product lines.
// Product lines drive display groups on the timeline (auto-derived on Save).
// Changes are held in local draft state and applied on Save.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePlantPulseStore, generateId } from '@/lib/store';
import type { Machine, MachineDisplayGroup, EquipmentGroup, MachineDowntime, ProductLine, RecurringDowntimeRule, RecurrenceType } from '@/lib/types';
import { isMachineUnavailable, hasMachineDowntime, isRecurringRuleExpired } from '@/lib/types';

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

function toDateLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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

type Tab = 'machines' | 'equipmentGroups' | 'productLines' | 'wallboard';

interface Props {
  open: boolean;
  onClose: () => void;
  /** When set, opens with this machine already in edit mode (Planner label click). */
  initialEditMachineId?: string | null;
  /** When set, auto-scrolls to this section within the machine's edit panel (e.g. 'unavailability'). */
  initialFocusSection?: string | null;
}

// ─── Component ─────────────────────────────────────────────────────────

export default function EquipmentSetup({ open, onClose, initialEditMachineId, initialFocusSection }: Props) {
  const machines = usePlantPulseStore((s) => s.machines);
  const equipmentGroups = usePlantPulseStore((s) => s.equipmentGroups);
  const productLines = usePlantPulseStore((s) => s.productLines);
  const setMachines = usePlantPulseStore((s) => s.setMachines);
  const setMachineGroups = usePlantPulseStore((s) => s.setMachineGroups);
  const setEquipmentGroups = usePlantPulseStore((s) => s.setEquipmentGroups);
  const setProductLines = usePlantPulseStore((s) => s.setProductLines);
  const wallboardEquipmentGroups = usePlantPulseStore((s) => s.wallboardEquipmentGroups);
  const setWallboardEquipmentGroups = usePlantPulseStore((s) => s.setWallboardEquipmentGroups);

  // Local draft state — changes are buffered here until Save
  const [draftMachines, setDraftMachines] = useState<Machine[]>([]);
  const [draftEquipmentGroups, setDraftEquipmentGroups] = useState<EquipmentGroup[]>([]);
  const [draftProductLines, setDraftProductLines] = useState<ProductLine[]>([]);
  const [draftWallboardGroups, setDraftWallboardGroups] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<Tab>('machines');
  const [filterLine, setFilterLine] = useState<string>('all');
  const [filterGroup, setFilterGroup] = useState<string>('all');
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
      setDraftWallboardGroups(new Set(wallboardEquipmentGroups));
      setDirty(false);

      // If opened with a specific machine to edit, activate it
      if (initialEditMachineId) {
        setActiveTab('machines');
        setEditingId(initialEditMachineId);
        // Set filters so the machine is visible
        const targetMachine = machines.find((m) => m.id === initialEditMachineId);
        if (targetMachine) {
          setFilterGroup(targetMachine.group || 'all');
          setFilterLine(targetMachine.productLine || 'all');
        }
        // Scroll to the machine row after render
        requestAnimationFrame(() => {
          const el = document.querySelector(`[data-machine-id="${initialEditMachineId}"]`);
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // If a focus section is specified, scroll to it after the machine row is visible
          if (initialFocusSection === 'unavailability') {
            requestAnimationFrame(() => {
              const panel = el?.querySelector('.pp-downtime-panel');
              if (panel) {
                panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            });
          }
        });
      } else {
        setEditingId(null);
      }
    }
  }, [open, machines, equipmentGroups, productLines, wallboardEquipmentGroups, initialEditMachineId, initialFocusSection]);

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
    const newId = generateId('M-');
    // Inherit from active filters so the new machine lands in the right group
    const targetGroup = filterGroup !== 'all' ? filterGroup : (sortedEqGroups[0]?.id ?? '');
    const targetLine = filterLine !== 'all' && filterLine !== 'none' ? filterLine : undefined;

    // Find siblings with same group + product line, insert right after them
    const siblings = draftMachines
      .filter((m) => m.group === targetGroup && m.productLine === targetLine)
      .sort((a, b) => a.displayOrder - b.displayOrder);

    let insertOrder: number;
    if (siblings.length > 0) {
      const lastSibling = siblings[siblings.length - 1];
      // Find the next machine after the last sibling to insert between
      const allSorted = [...draftMachines].sort((a, b) => a.displayOrder - b.displayOrder);
      const lastIdx = allSorted.findIndex((m) => m.id === lastSibling.id);
      if (lastIdx >= 0 && lastIdx < allSorted.length - 1) {
        // Insert halfway between last sibling and the next machine
        insertOrder = (lastSibling.displayOrder + allSorted[lastIdx + 1].displayOrder) / 2;
      } else {
        insertOrder = lastSibling.displayOrder + 1;
      }
    } else {
      // No siblings — find machines in same group (any line) and insert after them
      const groupSiblings = draftMachines
        .filter((m) => m.group === targetGroup)
        .sort((a, b) => a.displayOrder - b.displayOrder);
      if (groupSiblings.length > 0) {
        const last = groupSiblings[groupSiblings.length - 1];
        const allSorted = [...draftMachines].sort((a, b) => a.displayOrder - b.displayOrder);
        const lastIdx = allSorted.findIndex((m) => m.id === last.id);
        if (lastIdx >= 0 && lastIdx < allSorted.length - 1) {
          insertOrder = (last.displayOrder + allSorted[lastIdx + 1].displayOrder) / 2;
        } else {
          insertOrder = last.displayOrder + 1;
        }
      } else {
        insertOrder = draftMachines.length > 0
          ? Math.max(...draftMachines.map((m) => m.displayOrder)) + 1
          : 1;
      }
    }

    const newMachine: Machine = {
      id: newId,
      name: newId,
      group: targetGroup,
      productLine: targetLine,
      displayOrder: insertOrder,
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
    value: Date | string | boolean | undefined
  ) {
    setMachineDowntime(id, { ...current, [field]: value });
  }

  // ── Recurring downtime editing ─────────────────────────────────────

  function addRecurringRule(machineId: string) {
    const now = new Date();
    const rule: RecurringDowntimeRule = {
      id: generateId('rd-'),
      recurrenceType: 'weekly',
      dayOfWeek: 5, // Friday
      startHour: 8,
      startMinute: 0,
      durationHours: 4,
      startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
      reason: '',
    };
    setDraftMachines((prev) =>
      prev.map((m) => {
        if (m.id !== machineId) return m;
        return { ...m, recurringDowntime: [...(m.recurringDowntime || []), rule] };
      })
    );
    setDirty(true);
  }

  function removeRecurringRule(machineId: string, ruleId: string) {
    setDraftMachines((prev) =>
      prev.map((m) => {
        if (m.id !== machineId) return m;
        return {
          ...m,
          recurringDowntime: (m.recurringDowntime || []).filter((r) => r.id !== ruleId),
        };
      })
    );
    setDirty(true);
  }

  function updateRecurringRule(
    machineId: string,
    ruleId: string,
    updates: Partial<RecurringDowntimeRule>
  ) {
    setDraftMachines((prev) =>
      prev.map((m) => {
        if (m.id !== machineId) return m;
        return {
          ...m,
          recurringDowntime: (m.recurringDowntime || []).map((r) =>
            r.id === ruleId ? { ...r, ...updates } : r
          ),
        };
      })
    );
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

  // ── Product line editing ───────────────────────────────────────────

  function addProductLine() {
    const nextOrder =
      draftProductLines.length > 0
        ? Math.max(...draftProductLines.map((pl) => pl.displayOrder)) + 1
        : 1;
    const newId = generateId('PL-');
    setDraftProductLines((prev) => [
      ...prev,
      { id: newId, name: 'New Line', shortName: 'NEW', displayOrder: nextOrder, stageDefaults: [] },
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

  // ── Wallboard group toggle ─────────────────────────────────────────

  function toggleWallboardGroup(groupId: string) {
    setDraftWallboardGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
    setDirty(true);
  }

  // Machine count per equipment group for wallboard preview
  const wallboardMachineCount = useMemo(() => {
    let total = 0;
    for (const m of draftMachines) {
      if (draftWallboardGroups.has(m.group)) total++;
    }
    return total;
  }, [draftMachines, draftWallboardGroups]);

  // ── Save / Cancel ──────────────────────────────────────────────────

  function handleSave() {
    // Auto-derive display groups from product lines + machine assignments
    const derivedGroups = buildDisplayGroups(draftProductLines, draftMachines);

    setMachines(draftMachines);
    setMachineGroups(derivedGroups);
    setEquipmentGroups(draftEquipmentGroups);
    setProductLines(draftProductLines);
    setWallboardEquipmentGroups([...draftWallboardGroups]);
    setDirty(false);
  }

  function handleCancel() {
    onClose();
  }

  // ── Filter ─────────────────────────────────────────────────────────

  const filteredMachines = draftMachines
    .filter((m) => filterLine === 'all' || m.productLine === filterLine || (!m.productLine && filterLine === 'none'))
    .filter((m) => filterGroup === 'all' || m.group === filterGroup)
    .sort((a, b) => a.displayOrder - b.displayOrder);

  // Build visual group sections: group machines by equipment group + product line
  const machinesSectioned = useMemo(() => {
    const sectionMap = new Map<string, { groupId: string; groupName: string; lineName: string; machines: Machine[] }>();

    // Build sections in equipment group display order, then product line display order
    const eqGroupOrder: Record<string, number> = {};
    for (const eg of sortedEqGroups) eqGroupOrder[eg.id] = eg.displayOrder;
    const plOrder: Record<string, number> = {};
    for (const pl of sortedProductLines) plOrder[pl.id] = pl.displayOrder;

    for (const m of filteredMachines) {
      const lineKey = m.productLine || '__none__';
      const key = `${m.group}::${lineKey}`;
      if (!sectionMap.has(key)) {
        const lineName = m.productLine
          ? (draftProductLines.find((pl) => pl.id === m.productLine)?.shortName
             || draftProductLines.find((pl) => pl.id === m.productLine)?.name
             || m.productLine)
          : 'Unassigned';
        sectionMap.set(key, {
          groupId: m.group,
          groupName: eqGroupNameById[m.group] || m.group,
          lineName,
          machines: [],
        });
      }
      sectionMap.get(key)!.machines.push(m);
    }

    // Sort sections: by equipment group order, then by product line order
    return [...sectionMap.values()].sort((a, b) => {
      const ga = eqGroupOrder[a.groupId] ?? 999;
      const gb = eqGroupOrder[b.groupId] ?? 999;
      if (ga !== gb) return ga - gb;
      const la = a.lineName === 'Unassigned' ? 999 : (plOrder[a.machines[0]?.productLine || ''] ?? 998);
      const lb = b.lineName === 'Unassigned' ? 999 : (plOrder[b.machines[0]?.productLine || ''] ?? 998);
      return la - lb;
    });
  }, [filteredMachines, eqGroupNameById, sortedEqGroups, sortedProductLines, draftProductLines]);

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
          <button
            className={`pp-modal-tab ${activeTab === 'wallboard' ? 'active' : ''}`}
            onClick={() => { setActiveTab('wallboard'); setEditingId(null); }}
          >
            Wallboard Display
          </button>
        </div>

        {/* Body */}
        <div className="pp-modal-body">
          {/* ── Machines tab ─────────────────────────────────────── */}
          {activeTab === 'machines' && (
            <>
              <div className="pp-setup-filter-bar">
                <label className="pp-setup-filter-label">Group:</label>
                <select
                  value={filterGroup}
                  onChange={(e) => setFilterGroup(e.target.value)}
                  className="pp-setup-select"
                >
                  <option value="all">All groups</option>
                  {sortedEqGroups.map((eg) => (
                    <option key={eg.id} value={eg.id}>{eg.name}</option>
                  ))}
                </select>
                <label className="pp-setup-filter-label">Line:</label>
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
                {machinesSectioned.map((section, sIdx) => (
                  <div key={`${section.groupId}::${section.lineName}`}>
                    {/* Section header — shown when viewing multiple sections */}
                    {machinesSectioned.length > 1 && (
                      <div className="pp-setup-section-header">
                        {section.groupName}
                        <span className="pp-setup-section-separator">/</span>
                        {section.lineName}
                        <span className="pp-setup-section-count">{section.machines.length}</span>
                      </div>
                    )}
                    {section.machines.map((m, idx) => {
                  const isEditing = editingId === m.id;
                  const hasRelevantDowntime = hasMachineDowntime(m);
                  const isCurrentlyDown = isMachineUnavailable(m);
                  const recurringCount = (m.recurringDowntime || []).length;
                  const downtimeTitle = hasRelevantDowntime
                    ? isCurrentlyDown
                      ? `Unavailable${m.downtime?.reason ? ': ' + m.downtime.reason : ''}${recurringCount ? ` (+${recurringCount} recurring rule${recurringCount > 1 ? 's' : ''})` : ''}`
                      : `Downtime scheduled${m.downtime?.reason ? ': ' + m.downtime.reason : ''}${recurringCount ? ` (+${recurringCount} recurring rule${recurringCount > 1 ? 's' : ''})` : ''}`
                    : undefined;

                  return (
                  <div key={m.id} className="pp-setup-row-wrapper" data-machine-id={m.id}>
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
                        {/* ── One-time unavailability ── */}
                        <div className="pp-downtime-header">
                          <span className="pp-downtime-label">One-time Unavailability</span>
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
                            <div className="pp-downtime-toggles">
                              <label className="pp-downtime-toggle-label">
                                <input
                                  type="checkbox"
                                  checked={m.downtime.blocksPlanning !== false}
                                  onChange={(e) =>
                                    updateDowntimeField(m.id, m.downtime!, 'blocksPlanning', e.target.checked)
                                  }
                                  className="rounded border-slate-300 text-[var(--pp-pharma)] focus:ring-[var(--pp-pharma)]"
                                />
                                <span>Affects Planning</span>
                              </label>
                              <label className="pp-downtime-toggle-label">
                                <input
                                  type="checkbox"
                                  checked={m.downtime.notifyShift === true}
                                  onChange={(e) =>
                                    updateDowntimeField(m.id, m.downtime!, 'notifyShift', e.target.checked)
                                  }
                                  className="rounded border-slate-300 text-[var(--pp-pharma)] focus:ring-[var(--pp-pharma)]"
                                />
                                <span>Notify Shift</span>
                              </label>
                            </div>
                          </div>
                        )}

                        {/* ── Recurring unavailability ── */}
                        <div className="pp-downtime-header" style={{ marginTop: 10 }}>
                          <span className="pp-downtime-label">Recurring Unavailability</span>
                          <button
                            className="pp-setup-add-btn pp-downtime-add-btn"
                            onClick={() => addRecurringRule(m.id)}
                          >
                            + Add rule
                          </button>
                        </div>

                        {(m.recurringDowntime || []).length === 0 && (
                          <div className="pp-downtime-recurring-empty">
                            No recurring rules. Add one for scheduled maintenance blocks.
                          </div>
                        )}

                        {(m.recurringDowntime || []).map((rule) => {
                          const expired = isRecurringRuleExpired(rule);
                          return (
                            <div
                              key={rule.id}
                              className={`pp-downtime-recurring-card${expired ? ' expired' : ''}`}
                            >
                              <div className="pp-downtime-recurring-row">
                                <div className="pp-downtime-field">
                                  <label className="pp-downtime-field-label">Repeats</label>
                                  <select
                                    value={rule.recurrenceType}
                                    onChange={(e) =>
                                      updateRecurringRule(m.id, rule.id, {
                                        recurrenceType: e.target.value as RecurrenceType,
                                        ...(e.target.value === 'weekly' ? { dayOfWeek: 5 } : { dayOfMonth: 1 }),
                                      })
                                    }
                                    className="pp-setup-select pp-downtime-select"
                                  >
                                    <option value="weekly">Weekly</option>
                                    <option value="monthly">Monthly</option>
                                  </select>
                                </div>

                                {rule.recurrenceType === 'weekly' && (
                                  <div className="pp-downtime-field">
                                    <label className="pp-downtime-field-label">Day</label>
                                    <select
                                      value={rule.dayOfWeek ?? 5}
                                      onChange={(e) =>
                                        updateRecurringRule(m.id, rule.id, { dayOfWeek: Number(e.target.value) })
                                      }
                                      className="pp-setup-select pp-downtime-select"
                                    >
                                      <option value={1}>Monday</option>
                                      <option value={2}>Tuesday</option>
                                      <option value={3}>Wednesday</option>
                                      <option value={4}>Thursday</option>
                                      <option value={5}>Friday</option>
                                      <option value={6}>Saturday</option>
                                      <option value={0}>Sunday</option>
                                    </select>
                                  </div>
                                )}

                                {rule.recurrenceType === 'monthly' && (
                                  <div className="pp-downtime-field">
                                    <label className="pp-downtime-field-label">Day of month</label>
                                    <input
                                      type="number"
                                      min={1}
                                      max={31}
                                      value={rule.dayOfMonth ?? 1}
                                      onChange={(e) =>
                                        updateRecurringRule(m.id, rule.id, {
                                          dayOfMonth: Math.max(1, Math.min(31, Number(e.target.value) || 1)),
                                        })
                                      }
                                      className="pp-setup-input pp-downtime-num-input"
                                    />
                                  </div>
                                )}

                                <div className="pp-downtime-field">
                                  <label className="pp-downtime-field-label">Start time</label>
                                  <input
                                    type="time"
                                    value={`${String(rule.startHour).padStart(2, '0')}:${String(rule.startMinute).padStart(2, '0')}`}
                                    onChange={(e) => {
                                      const [h, min] = e.target.value.split(':').map(Number);
                                      updateRecurringRule(m.id, rule.id, {
                                        startHour: h ?? 0,
                                        startMinute: min ?? 0,
                                      });
                                    }}
                                    className="pp-setup-input pp-downtime-time-input"
                                  />
                                </div>

                                <div className="pp-downtime-field">
                                  <label className="pp-downtime-field-label">Duration (h)</label>
                                  <input
                                    type="number"
                                    min={0.5}
                                    step={0.5}
                                    value={rule.durationHours}
                                    onChange={(e) =>
                                      updateRecurringRule(m.id, rule.id, {
                                        durationHours: Math.max(0.5, Number(e.target.value) || 0.5),
                                      })
                                    }
                                    className="pp-setup-input pp-downtime-num-input"
                                  />
                                </div>
                              </div>

                              <div className="pp-downtime-recurring-row">
                                <div className="pp-downtime-field">
                                  <label className="pp-downtime-field-label">Effective from</label>
                                  <input
                                    type="date"
                                    value={toDateLocal(rule.startDate)}
                                    onChange={(e) => {
                                      const d = e.target.value ? new Date(e.target.value + 'T00:00:00') : null;
                                      if (d && !isNaN(d.getTime()))
                                        updateRecurringRule(m.id, rule.id, { startDate: d });
                                    }}
                                    className="pp-setup-input pp-downtime-date-input"
                                  />
                                </div>
                                <div className="pp-downtime-field">
                                  <label className="pp-downtime-field-label">
                                    Until
                                    {!rule.endDate && (
                                      <span className="pp-downtime-indefinite">(no end)</span>
                                    )}
                                  </label>
                                  <div className="pp-downtime-end-row">
                                    <input
                                      type="date"
                                      value={rule.endDate ? toDateLocal(rule.endDate) : ''}
                                      onChange={(e) => {
                                        const d = e.target.value ? new Date(e.target.value + 'T23:59:59') : null;
                                        updateRecurringRule(m.id, rule.id, { endDate: d ?? undefined });
                                      }}
                                      className="pp-setup-input pp-downtime-date-input"
                                      placeholder="No end date"
                                    />
                                    {rule.endDate && (
                                      <button
                                        className="pp-setup-action-btn"
                                        onClick={() => updateRecurringRule(m.id, rule.id, { endDate: undefined })}
                                        title="Set to indefinite"
                                      >
                                        &infin;
                                      </button>
                                    )}
                                  </div>
                                </div>
                                <div className="pp-downtime-field" style={{ flex: 1 }}>
                                  <label className="pp-downtime-field-label">Reason</label>
                                  <input
                                    type="text"
                                    value={rule.reason || ''}
                                    onChange={(e) =>
                                      updateRecurringRule(m.id, rule.id, { reason: e.target.value })
                                    }
                                    className="pp-setup-input"
                                    placeholder="e.g. Weekly CIP, Monthly inspection"
                                  />
                                </div>
                                <div className="pp-downtime-field" style={{ justifyContent: 'flex-end' }}>
                                  <button
                                    className="pp-setup-action-btn pp-setup-delete-btn"
                                    onClick={() => removeRecurringRule(m.id, rule.id)}
                                    title="Remove rule"
                                  >
                                    Del
                                  </button>
                                </div>
                              </div>

                              <div className="pp-downtime-toggles">
                                <label className="pp-downtime-toggle-label">
                                  <input
                                    type="checkbox"
                                    checked={rule.blocksPlanning !== false}
                                    onChange={(e) =>
                                      updateRecurringRule(m.id, rule.id, { blocksPlanning: e.target.checked })
                                    }
                                    className="rounded border-slate-300 text-[var(--pp-pharma)] focus:ring-[var(--pp-pharma)]"
                                  />
                                  <span>Affects Planning</span>
                                </label>
                                <label className="pp-downtime-toggle-label">
                                  <input
                                    type="checkbox"
                                    checked={rule.notifyShift === true}
                                    onChange={(e) =>
                                      updateRecurringRule(m.id, rule.id, { notifyShift: e.target.checked })
                                    }
                                    className="rounded border-slate-300 text-[var(--pp-pharma)] focus:ring-[var(--pp-pharma)]"
                                  />
                                  <span>Notify Shift</span>
                                </label>
                              </div>

                              <div className="pp-downtime-recurring-summary">
                                {rule.recurrenceType === 'weekly'
                                  ? `Every ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][rule.dayOfWeek ?? 0]}`
                                  : `Day ${rule.dayOfMonth ?? 1} of each month`}
                                {`, ${String(rule.startHour).padStart(2, '0')}:${String(rule.startMinute).padStart(2, '0')} for ${rule.durationHours}h`}
                                {expired && <span className="pp-downtime-expired-badge">Expired</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  );
                    })}
                  </div>
                ))}
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
                          <>
                            <input
                              type="text"
                              value={pl.name}
                              onChange={(e) => updateDraftProductLine(pl.id, { name: e.target.value })}
                              className="pp-setup-input pp-setup-group-name-input"
                              placeholder="Full name"
                              autoFocus
                            />
                            <input
                              type="text"
                              value={pl.shortName}
                              onChange={(e) => updateDraftProductLine(pl.id, { shortName: e.target.value })}
                              className="pp-setup-input"
                              style={{ width: 64 }}
                              placeholder="Short"
                              maxLength={3}
                              title="Short name (1–3 letters) for toolbar chips and batch labels"
                            />
                          </>
                        ) : (
                          <span
                            className="pp-setup-clickable"
                            style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}
                            onClick={() => setEditingId(pl.id)}
                            title="Click to edit"
                          >
                            {pl.name}
                            <span className="pp-setup-badge">{pl.shortName}</span>
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

          {/* ── Wallboard Display tab ──────────────────────────────── */}
          {activeTab === 'wallboard' && (
            <div className="pp-wallboard-tab">
              <p className="pp-process-help">
                Choose which equipment groups appear on the Wallboard.
                The wallboard is focused on shopfloor shift handover — typically
                lab-scale inoculum vessels are excluded.
              </p>

              <div className="pp-wallboard-summary">
                {wallboardMachineCount} machine{wallboardMachineCount !== 1 ? 's' : ''} visible
                &nbsp;&middot;&nbsp;
                {draftWallboardGroups.size} of {draftEquipmentGroups.length} groups selected
              </div>

              <div className="pp-wallboard-group-list">
                {sortedEqGroups.map((eg) => {
                  const checked = draftWallboardGroups.has(eg.id);
                  const groupMachines = draftMachines.filter((m) => m.group === eg.id);
                  const machineNames = groupMachines
                    .sort((a, b) => a.displayOrder - b.displayOrder)
                    .map((m) => m.name);

                  return (
                    <label
                      key={eg.id}
                      className={`pp-wallboard-group-card ${checked ? 'selected' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleWallboardGroup(eg.id)}
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

              {draftWallboardGroups.size === 0 && (
                <div className="pp-process-shutdown-warning" style={{ marginTop: 8 }}>
                  <span className="pp-process-shutdown-warning-icon">&#9888;</span>
                  <span>No groups selected — the wallboard will be empty.</span>
                </div>
              )}
            </div>
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
