/* Process Setup v2 — minimalist list layout */

const { useState, useMemo, useEffect } = React;

const GROUPS = [
  { id: 'inoculum',     name: 'Inoculum',      vessels: 4 },
  { id: 'propagator',   name: 'Propagator',    vessels: 3 },
  { id: 'prefermenter', name: 'Pre-fermenter', vessels: 3 },
  { id: 'fermenter',    name: 'Fermenter',     vessels: 5 },
];

const VALID_UNITS = [
  { id: 'h', label: 'hours', mins: 60 },
  { id: 'd', label: 'days',  mins: 60 * 24 },
  { id: 'w', label: 'weeks', mins: 60 * 24 * 7 },
];

const initialActivities = {
  inoculum: [
    { id: 'i1', name: 'CIP',               phase: 'pre',  durMin: 60,  validVal: 7,  validUnit: 'd', autoRepeat: true,  desc: 'Alkaline/acid rinse cycle' },
    { id: 'i2', name: 'SIP',               phase: 'pre',  durMin: 45,  validVal: 8,  validUnit: 'h', autoRepeat: true,  desc: 'Steam in Place before media' },
    { id: 'i3', name: 'Media Preparation', phase: 'pre',  durMin: 120, validVal: 24, validUnit: 'h', autoRepeat: false, desc: '' },
  ],
  propagator: [
    { id: 'p1', name: 'CIP',               phase: 'pre',  durMin: 60,  validVal: 7,  validUnit: 'd', autoRepeat: true,  desc: '' },
    { id: 'p2', name: 'Media Preparation', phase: 'pre',  durMin: 120, validVal: 24, validUnit: 'h', autoRepeat: false, desc: '' },
    { id: 'p3', name: 'SIP',               phase: 'pre',  durMin: 60,  validVal: 8,  validUnit: 'h', autoRepeat: true,  desc: '' },
  ],
  prefermenter: [
    { id: 'f1', name: 'CIP',               phase: 'pre',  durMin: 60,  validVal: 7,  validUnit: 'd', autoRepeat: true,  desc: '' },
    { id: 'f2', name: 'Media Preparation', phase: 'pre',  durMin: 240, validVal: 24, validUnit: 'h', autoRepeat: false, desc: '' },
    { id: 'f3', name: 'SIP',               phase: 'pre',  durMin: 120, validVal: 8,  validUnit: 'h', autoRepeat: true,  desc: '' },
  ],
  fermenter: [
    { id: 'g1', name: 'CIP',                    phase: 'pre',  durMin: 60,  validVal: 7,  validUnit: 'd', autoRepeat: true,  desc: 'Required after every batch' },
    { id: 'g2', name: 'Media Preparation',      phase: 'pre',  durMin: 360, validVal: 24, validUnit: 'h', autoRepeat: false, desc: 'Production media prep' },
    { id: 'g3', name: 'SIP',                    phase: 'pre',  durMin: 180, validVal: 8,  validUnit: 'h', autoRepeat: true,  desc: 'Steam in Place after media load' },
    { id: 'g4', name: 'Transfer to Downstream', phase: 'post', durMin: 180, validVal: 0,  validUnit: 'h', autoRepeat: false, desc: 'Harvest transfer to clarification' },
  ],
};

/* ── helpers ────────────────────────────────────────────────── */

function formatDur(mins) {
  if (!mins) return '0m';
  const d = Math.floor(mins / (60 * 24));
  const h = Math.floor((mins - d * 60 * 24) / 60);
  const m = mins % 60;
  const parts = [];
  if (d) parts.push(d + 'd');
  if (h) parts.push(h + 'h');
  if (m) parts.push(m + 'm');
  return parts.join(' ') || '0m';
}

function validMins(val, unit) {
  if (!val) return Infinity;
  const u = VALID_UNITS.find(u => u.id === unit) || VALID_UNITS[0];
  return val * u.mins;
}

function byPhase(activities) {
  return {
    pre:  activities.filter(a => a.phase === 'pre'),
    post: activities.filter(a => a.phase === 'post'),
  };
}

function kindOf(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('cip'))   return 'cip';
  if (n.includes('media')) return 'media';
  if (n.includes('sip'))   return 'sip';
  return 'cip';
}

/* ── icons ──────────────────────────────────────────────────── */
const Ico = {
  close: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>,
  chev: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>,
  clock: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 7v5l3 2" /></svg>,
  infinity: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18.178 8c5.096 0 5.096 8 0 8-5.095 0-7.133-8-12.46-8-4.553 0-4.553 8 0 8 5.327 0 7.365-8 12.46-8" /></svg>,
  repeat: <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m17 1 4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="m7 23-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>,
  trash: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>,
};

/* ── List row ───────────────────────────────────────────────── */

function Row({ act, idx, selected, onSelect }) {
  const noExpiry = !act.validVal;
  const tight = act.validVal && validMins(act.validVal, act.validUnit) <= 8 * 60;
  return (
    <div
      className={`list-row ${act.phase} ${selected ? 'selected' : ''}`}
      onClick={() => onSelect(act.id)}
    >
      <div className="row-num">{idx + 1}</div>
      <div className="row-name">
        <span className="row-name-text">{act.name}</span>
      </div>
      <div className="row-dur">{formatDur(act.durMin)}</div>
      <div className={`row-valid ${noExpiry ? 'none' : tight ? 'warn' : ''}`} title={noExpiry ? 'No expiry — always valid' : `Valid ${act.validVal}${act.validUnit} after completion`}>
        <span className="ico">{noExpiry ? Ico.infinity : Ico.clock}</span>
        <span>{noExpiry ? '—' : `${act.validVal}${act.validUnit}`}</span>
        {!noExpiry && (
          <span className={`repeat ${act.autoRepeat ? 'on' : ''}`} title={act.autoRepeat ? 'Auto-repeats if expired' : 'Does not auto-repeat'}>
            {Ico.repeat}
          </span>
        )}
      </div>
      <div className="row-chev">{Ico.chev}</div>
    </div>
  );
}

/* ── Inline editor (expanded row) ───────────────────────────── */

function InlineEditor({ act, allActivities, onChange, onDelete }) {
  const { pre, post } = byPhase(allActivities);
  const phaseList = act.phase === 'pre' ? pre : post;
  const idxInPhase = phaseList.findIndex(a => a.id === act.id);
  const prevAct = idxInPhase > 0 ? phaseList[idxInPhase - 1] : null;
  const nextAct = idxInPhase < phaseList.length - 1 ? phaseList[idxInPhase + 1] : null;

  const days = Math.floor(act.durMin / (60 * 24));
  const hours = Math.floor((act.durMin - days * 60 * 24) / 60);
  const mins = act.durMin % 60;
  const setDur = (d, h, m) =>
    onChange({ ...act, durMin: Math.max(0, d * 60 * 24 + h * 60 + m) });

  return (
    <div className={`list-row-edit ${act.phase}`}>
      <div className="field col-4">
        <label className="field-label">Name</label>
        <input className="text-input" value={act.name}
          onChange={e => onChange({ ...act, name: e.target.value })} />
      </div>

      <div className="field col-4">
        <label className="field-label">When</label>
        <div className="seg">
          <button
            className={act.phase === 'pre' ? 'active pre' : ''}
            onClick={() => onChange({ ...act, phase: 'pre' })}
          >
            <span className="seg-swatch pre" />Before batch
          </button>
          <button
            className={act.phase === 'post' ? 'active post' : ''}
            onClick={() => onChange({ ...act, phase: 'post' })}
          >
            <span className="seg-swatch post" />After batch
          </button>
        </div>
      </div>

      <div className="field col-4">
        <label className="field-label">Duration</label>
        <div className="dur-row">
          <input type="number" min="0" className="number-input" value={days}
            onChange={e => setDur(+e.target.value || 0, hours, mins)} />
          <span className="dur-unit">d</span>
          <input type="number" min="0" max="23" className="number-input" value={hours}
            onChange={e => setDur(days, +e.target.value || 0, mins)} />
          <span className="dur-unit">h</span>
          <input type="number" min="0" max="59" className="number-input" value={mins}
            onChange={e => setDur(days, hours, +e.target.value || 0)} />
          <span className="dur-unit">m</span>
        </div>
      </div>

      <div className="field col-6">
        <label className="field-label">Validity window</label>
        <div className="validity-row">
          <label className="toggle-row">
            <span
              className={`toggle ${act.validVal > 0 ? 'on' : ''}`}
              onClick={() => onChange({ ...act, validVal: act.validVal > 0 ? 0 : (act.phase === 'pre' ? 24 : 0), validUnit: act.validUnit || 'h' })}
            />
            <span>{act.validVal > 0 ? 'Expires' : 'No expiry'}</span>
          </label>
          <div className={`validity-controls ${act.validVal > 0 ? '' : 'disabled'}`}>
            <input type="number" min="1" value={act.validVal || ''}
              onChange={e => onChange({ ...act, validVal: +e.target.value || 0 })} />
            <select value={act.validUnit}
              onChange={e => onChange({ ...act, validUnit: e.target.value })}>
              {VALID_UNITS.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
            </select>
          </div>
        </div>
        {act.validVal > 0 && (
          <label className="toggle-row" style={{ marginTop: 6 }}>
            <span
              className={`toggle ${act.autoRepeat ? 'on' : ''}`}
              onClick={() => onChange({ ...act, autoRepeat: !act.autoRepeat })}
            />
            <span>Auto-repeat if expired before next batch</span>
          </label>
        )}
      </div>

      <div className="field col-6">
        <label className="field-label">Sequence</label>
        <div className="field-hint">
          {prevAct
            ? <>Runs <strong>after {prevAct.name}</strong>.</>
            : <>First {act.phase === 'pre' ? 'pre-batch' : 'post-batch'} activity.</>}
          {nextAct && <> Must finish before <strong>{nextAct.name}</strong>.</>}
          {!nextAct && act.phase === 'pre' && <> Must finish before the batch starts.</>}
          {!nextAct && act.phase === 'post' && <> Must finish before the next batch's turnaround can begin.</>}
        </div>
        {act.desc && (
          <div className="field-hint" style={{ marginTop: 4, fontStyle: 'italic', color: 'var(--ink-2)' }}>
            "{act.desc}"
          </div>
        )}
      </div>

      <div className="edit-foot">
        <button className="danger-btn" onClick={() => onDelete(act.id)}>
          {Ico.trash} Remove
        </button>
      </div>
    </div>
  );
}

/* ── Sections (Pre / Post) ──────────────────────────────────── */

function Section({ phase, activities, selectedId, onSelect, onAdd, onChange, onDelete, allActivities }) {
  const total = activities.reduce((s, a) => s + a.durMin, 0);
  const isPre = phase === 'pre';
  return (
    <div className="list-section">
      <div className="list-section-head">
        <div className={`list-section-title ${phase}`}>
          <span className="phase-dot" />
          {isPre ? 'Before batch · Turnaround' : 'After batch · Handoff'}
        </div>
        <div className="list-section-meta">
          {activities.length} {activities.length === 1 ? 'activity' : 'activities'}
          {total > 0 && ` · ${formatDur(total)} total`}
        </div>
      </div>
      <div className="list-table">
        {activities.length === 0 && (
          <div className="list-empty">
            {isPre
              ? 'No pre-batch activities. Add CIP, media prep, or SIP below.'
              : 'No post-batch activities. e.g. Transfer to Downstream.'}
          </div>
        )}
        {activities.map((a, i) => (
          <React.Fragment key={a.id}>
            <Row act={a} idx={i} selected={a.id === selectedId} onSelect={onSelect} />
            {a.id === selectedId && (
              <InlineEditor
                act={a}
                allActivities={allActivities}
                onChange={onChange}
                onDelete={onDelete}
              />
            )}
          </React.Fragment>
        ))}
        <button className="list-add" onClick={() => onAdd(phase)}>
          <span className="plus">+</span> Add {isPre ? 'pre-batch' : 'post-batch'} activity
        </button>
      </div>
    </div>
  );
}

/* ── Summary strip ──────────────────────────────────────────── */

function SummaryStrip({ activities }) {
  const { pre, post } = byPhase(activities);
  const BATCH_MIN = 96 * 60;
  const totalPre = pre.reduce((s, a) => s + a.durMin, 0);
  const totalPost = post.reduce((s, a) => s + a.durMin, 0);
  const total = totalPre + BATCH_MIN + totalPost;

  const segs = [
    ...pre.map(a => ({ name: a.name, min: a.durMin, kind: kindOf(a.name) })),
    { name: 'Batch', min: BATCH_MIN, kind: 'batch' },
    ...post.map(a => ({ name: a.name, min: a.durMin, kind: 'post' })),
  ];

  return (
    <div>
      <div className="summary-strip" title="Composed timeline preview">
        {segs.map((s, i) => {
          const w = (s.min / total) * 100;
          return (
            <div
              key={i}
              className={`ss-seg ${s.kind}`}
              style={{ width: `${w}%` }}
              title={`${s.name} · ${formatDur(s.min)}`}
            >
              {w > 8 ? (s.kind === 'batch' ? 'BATCH' : s.name) : ''}
            </div>
          );
        })}
      </div>
      <div className="summary-caption">
        <span>{formatDur(totalPre)} turnaround → 96h batch{totalPost > 0 && ` → ${formatDur(totalPost)} handoff`}</span>
        <span>cycle {formatDur(total)}</span>
      </div>
    </div>
  );
}

/* ── Root ───────────────────────────────────────────────────── */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "showSummary": true,
  "showBatchDivider": true,
  "groupId": "fermenter"
}/*EDITMODE-END*/;

function ProcessSetup() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [groupId, setGroupId] = useState(t.groupId || 'fermenter');
  const [activities, setActivities] = useState(initialActivities);
  const [selectedId, setSelectedId] = useState('g1');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (t.groupId && t.groupId !== groupId) setGroupId(t.groupId);
  }, [t.groupId]);

  const group = GROUPS.find(g => g.id === groupId);
  const list = activities[groupId];
  const { pre, post } = byPhase(list);
  const selected = list.find(a => a.id === selectedId);

  useEffect(() => {
    if (!selected) setSelectedId(list[0]?.id);
  }, [groupId]);

  const setList = (next) => {
    setActivities(p => ({ ...p, [groupId]: next }));
    setDirty(true);
  };

  const updateAct = (next) => setList(list.map(a => a.id === next.id ? next : a));

  const addAct = (phase) => {
    const id = `${groupId[0]}${Date.now().toString(36)}`;
    const newAct = {
      id, name: 'New activity', phase,
      durMin: 60, validVal: phase === 'pre' ? 24 : 0, validUnit: 'h',
      autoRepeat: phase === 'pre', desc: '',
    };
    setList([...list, newAct]);
    setSelectedId(id);
  };

  const deleteAct = (id) => {
    const nextList = list.filter(a => a.id !== id);
    setList(nextList);
    if (selectedId === id) setSelectedId(nextList[0]?.id);
  };

  const close = () => {};

  return (
    <div className="scene-stage">
      <div className="ps-modal" data-screen-label="Process Setup">
        {/* Header */}
        <div className="ps-head">
          <h2>Process Setup</h2>
          <button className="ps-x" onClick={close} aria-label="Close">{Ico.close}</button>
        </div>

        {/* Tabs */}
        <div className="ps-tabs">
          {['Stage Types', 'Stage Defaults', 'Turnaround Activities', 'Shutdowns', 'Naming'].map(tab => (
            <button key={tab} className={`ps-tab ${tab === 'Turnaround Activities' ? 'active' : ''}`}>{tab}</button>
          ))}
        </div>

        {/* Body */}
        <div className="ps-body">
          <p className="ps-blurb">
            Activities that must fit between consecutive batches on the same vessel. Define them
            in the order they run, with a validity window so the scheduler can repeat them if they
            expire before the next batch is ready.
          </p>

          {/* Group switcher */}
          <div className="group-bar">
            <div className="group-seg">
              {GROUPS.map(g => (
                <button
                  key={g.id}
                  className={g.id === groupId ? 'active' : ''}
                  onClick={() => { setGroupId(g.id); setTweak('groupId', g.id); }}
                >
                  {g.name}
                  <span className="gp-count">{activities[g.id].length}</span>
                </button>
              ))}
            </div>
            <span className="group-vessels">{group.vessels} vessels</span>
          </div>

          {/* Summary strip */}
          {t.showSummary && <SummaryStrip activities={list} />}

          {/* Pre-batch */}
          <Section
            phase="pre"
            activities={pre}
            allActivities={list}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onAdd={addAct}
            onChange={updateAct}
            onDelete={deleteAct}
          />

          {/* Batch divider */}
          {t.showBatchDivider && (
            <div className="batch-divider">
              <span className="line" />
              <span className="pip"><span className="pip-dot" /> Production Batch</span>
              <span className="line" />
            </div>
          )}

          {/* Post-batch */}
          <Section
            phase="post"
            activities={post}
            allActivities={list}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onAdd={addAct}
            onChange={updateAct}
            onDelete={deleteAct}
          />
        </div>

        {/* Footer */}
        <div className="ps-foot">
          <span className={`ps-foot-status ${dirty ? 'dirty' : ''}`}>
            {dirty ? <><span className="dot" /> Unsaved changes</> : 'No changes'}
          </span>
          <div className="ps-foot-spacer" />
          <button className="btn">Cancel</button>
          <button className="btn primary" disabled={!dirty}>Save</button>
        </div>
      </div>

      {/* Tweaks panel */}
      <TweaksPanel title="Tweaks">
        <TweakSection label="Layout" />
        <TweakToggle label="Summary timeline" value={t.showSummary}
          onChange={(v) => setTweak('showSummary', v)} />
        <TweakToggle label="Batch divider" value={t.showBatchDivider}
          onChange={(v) => setTweak('showBatchDivider', v)} />
        <TweakSection label="Equipment group" />
        <TweakRadio
          label="Active"
          value={t.groupId}
          options={GROUPS.map(g => g.id)}
          onChange={(v) => setTweak('groupId', v)}
        />
      </TweaksPanel>
    </div>
  );
}

window.ProcessSetup = ProcessSetup;
