/* Gantt timeline — axis + rows + bars + today line */

/* Turnaround activities per equipment group — see Process Setup → Turnaround Activities */
const TURNAROUND_ACTIVITIES = {
  'Propagators': [
    { name: 'CIP',              short: 'CIP',  hours: 1 },
    { name: 'Media Preparation', short: 'Media', hours: 2 },
    { name: 'SIP',              short: 'SIP',  hours: 1 },
  ],
  'Pre-filters': [
    { name: 'CIP',              short: 'CIP',  hours: 1 },
    { name: 'Media Preparation', short: 'Media', hours: 4 },
    { name: 'SIP',              short: 'SIP',  hours: 2 },
  ],
  'Fermenters': [
    { name: 'CIP',              short: 'CIP',  hours: 1 },
    { name: 'Media Preparation', short: 'Media', hours: 4 },
    { name: 'SIP',              short: 'SIP',  hours: 2 },
  ],
};

function rowGroup(row) {
  for (const g of EQUIPMENT) if (g.rows.includes(row)) return g.group;
  return null;
}

const BAR_LABELS = {
  'done': 'Done',
  'running': 'Running',
  'scheduled': 'Scheduled',
  'at-risk': 'At risk',
  'blocked': 'Blocked',
  'maintenance': 'Maintenance',
};

function GanttAxis({ windowStart, windowEnd, pxPerHour }) {
  const totalHours = windowEnd - windowStart;
  const days = [];
  for (let h = windowStart; h < windowEnd; h += DAY) {
    const d = dateFromHour(h);
    days.push({ hour: h, date: d });
  }
  // Month spans
  const months = [];
  let curMonth = null;
  for (const d of days) {
    const key = d.date.getMonth();
    if (curMonth && curMonth.key === key) {
      curMonth.endHour = d.hour + DAY;
    } else {
      curMonth = { key, label: d.date.toLocaleString('en-US', { month: 'long' }), startHour: d.hour, endHour: d.hour + DAY };
      months.push(curMonth);
    }
  }
  const nowDate = dateFromHour(NOW_HOUR);
  const shifts = shiftSegments(windowStart, windowEnd);

  return (
    <div className="gantt-axis">
      <div className="shift-ribbon">
        {shifts.map((s, i) => {
          const left = (s.start - windowStart) * pxPerHour;
          const width = (s.end - s.start) * pxPerHour;
          const isNow = NOW_HOUR >= s.start && NOW_HOUR < s.end;
          const showLabel = width > 28;
          return (
            <div
              key={i}
              className={`shift-seg team-${s.team} ${isNow ? 'now' : ''}`}
              style={{ left, width }}
              title={`Team ${s.team} · ${fmtDate(dateFromHour(s.start), { hour: true })} → ${fmtDate(dateFromHour(s.end), { hour: true })}`}
            >
              {showLabel && s.team}
            </div>
          );
        })}
      </div>
      <div className="axis-months">
        {months.map((m, i) => (
          <div key={i} className="axis-month" style={{
            left: (m.startHour - windowStart) * pxPerHour,
            width: (m.endHour - m.startHour) * pxPerHour,
            position: 'absolute'
          }}>{m.label}</div>
        ))}
      </div>
      <div className="axis-days">
        {days.map((d, i) => {
          const dow = d.date.getDay();
          const isWknd = dow === 0 || dow === 6;
          const isToday = d.date.toDateString() === nowDate.toDateString();
          return (
            <div
              key={i}
              className={`axis-day ${isWknd ? 'weekend' : ''} ${isToday ? 'today' : ''}`}
              style={{ width: DAY * pxPerHour, flex: '0 0 auto' }}
            >
              {d.date.getDate()}
              <span className="dn">{d.date.toLocaleString('en-US', { weekday: 'short' }).slice(0, 2)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EquipmentRail({ rows, utilByRow, onRowClick }) {
  return (
    <div className="rail">
      {EQUIPMENT.map((grp, gi) => (
        <div key={gi} className="rail-group">
          <div className="rail-group-header">
            <span>{grp.group}</span>
            <span className="count">{grp.rows.length}</span>
          </div>
          {grp.rows.map(r => {
            const u = utilByRow[r] || 0;
            return (
              <div key={r} className="rail-row" onClick={() => onRowClick && onRowClick(r)}>
                <span className="row-name">
                  <span className="code">{r}</span>
                </span>
                <span className="row-util">{Math.round(u * 100)}%</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function BatchBar({ b, windowStart, pxPerHour, selected, onSelect, onHover, onLeave }) {
  const left = (b.start - windowStart) * pxPerHour;
  const width = (b.end - b.start) * pxPerHour;
  if (width < 0.5) return null;
  const label = b.chain === 'MAINT' || b.chain === 'BLK-001'
    ? (b.chain === 'MAINT' ? 'MAINT' : b.chain)
    : b.chain;
  return (
    <div
      className={`bar ${b.status} ${selected ? 'selected' : ''}`}
      style={{ left, width }}
      onClick={(e) => { e.stopPropagation(); onSelect(b); }}
      onMouseEnter={(e) => onHover(b, e)}
      onMouseMove={(e) => onHover(b, e)}
      onMouseLeave={onLeave}
      title=""
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      {b.progress > 0 && b.progress < 1 && (
        <span className="bar-progress" style={{ width: `${b.progress * 100}%` }} />
      )}
    </div>
  );
}

function TurnaroundMarkers({ batches, row, windowStart, windowEnd, pxPerHour }) {
  const group = rowGroup(row);
  const activities = TURNAROUND_ACTIVITIES[group];
  if (!activities) return null;

  // Find consecutive batches on this row (sorted by start), insert turnaround
  // after each batch that has a non-maintenance successor.
  const sorted = batches
    .filter(b => b.status !== 'maintenance' && b.status !== 'blocked')
    .slice()
    .sort((a, b) => a.start - b.start);

  const markers = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const cur = sorted[i];
    const next = sorted[i + 1];
    const gap = next.start - cur.end;
    if (gap <= 0) continue;
    const totalNeeded = activities.reduce((s, a) => s + a.hours, 0);
    // Show only when gap can reasonably fit the activities (or close to it).
    if (gap < totalNeeded - 0.5) continue;
    let cursor = cur.end;
    for (const a of activities) {
      const startH = cursor;
      const endH = cursor + a.hours;
      cursor = endH;
      if (endH <= windowStart || startH >= windowEnd) continue;
      const left = (startH - windowStart) * pxPerHour;
      const width = a.hours * pxPerHour;
      if (width < 0.5) continue;
      const showShort = width >= 22;
      const showLong = width >= 60;
      markers.push(
        <div
          key={`${cur.id}-ta-${a.short}`}
          className={`turnaround turnaround-${a.short.toLowerCase()}`}
          style={{ left, width }}
          title={`${a.name} · ${a.hours}h · between ${cur.chain} and ${next.chain}`}
        >
          {showShort && (
            <span className="turnaround-label">
              {showLong ? a.name : a.short}
            </span>
          )}
        </div>
      );
    }
  }
  return <>{markers}</>;
}

function GanttCanvas({ windowStart, windowEnd, pxPerHour, batches, selectedId, onSelect, onHover, onLeave }) {
  const totalHours = windowEnd - windowStart;
  const widthPx = totalHours * pxPerHour;

  // batches by row
  const byRow = React.useMemo(() => {
    const m = {};
    for (const b of batches) {
      if (b.end <= windowStart || b.start >= windowEnd) continue;
      if (!m[b.row]) m[b.row] = [];
      m[b.row].push(b);
    }
    return m;
  }, [batches, windowStart, windowEnd]);

  // Weekend bands
  const weekendBands = [];
  for (let h = windowStart; h < windowEnd; h += DAY) {
    const d = dateFromHour(h);
    const dow = d.getDay();
    if (dow === 6) weekendBands.push({ start: h, end: Math.min(h + 2 * DAY, windowEnd) });
  }

  // Grid lines (daily)
  const gridLines = [];
  for (let h = windowStart + DAY; h < windowEnd; h += DAY) {
    const d = dateFromHour(h);
    const isWeekStart = d.getDay() === 1;
    gridLines.push({ hour: h, week: isWeekStart });
  }

  const nowLeft = (NOW_HOUR - windowStart) * pxPerHour;

  return (
    <div className="canvas" style={{ width: widthPx }}>
      {/* Weekend bands */}
      {weekendBands.map((w, i) => (
        <div key={`w${i}`} className="weekend-band"
          style={{ left: (w.start - windowStart) * pxPerHour, width: (w.end - w.start) * pxPerHour }} />
      ))}
      {/* Grid lines */}
      {gridLines.map((g, i) => (
        <div key={`g${i}`} className={`grid-line ${g.week ? 'week' : ''}`}
          style={{ left: (g.hour - windowStart) * pxPerHour }} />
      ))}
      {/* Today line */}
      {NOW_HOUR >= windowStart && NOW_HOUR <= windowEnd && (
        <div className="today-line" style={{ left: nowLeft }} />
      )}

      {EQUIPMENT.map((grp, gi) => (
        <div key={gi} className="canvas-group">
          <div className="canvas-group-spacer" />
          {grp.rows.map((r, ri) => (
            <div key={r} className={`canvas-row ${ri % 2 ? 'alt' : ''}`}>
              <TurnaroundMarkers
                batches={byRow[r] || []}
                row={r}
                windowStart={windowStart}
                windowEnd={windowEnd}
                pxPerHour={pxPerHour}
              />
              {(byRow[r] || []).map(b => (
                <BatchBar
                  key={b.id}
                  b={b}
                  windowStart={windowStart}
                  pxPerHour={pxPerHour}
                  selected={selectedId === b.id}
                  onSelect={onSelect}
                  onHover={onHover}
                  onLeave={onLeave}
                />
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

window.GanttAxis = GanttAxis;
window.EquipmentRail = EquipmentRail;
window.GanttCanvas = GanttCanvas;
