import { useState, useEffect, useCallback } from 'react';

const RANGES = [
  { label: '7d', days: 7 },
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];

function dateRange(days) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  };
}

// ── Inline SVG line chart ────────────────────────────────────────────────────

function LineChart({ data, color = '#4a7c59', label, height = 100 }) {
  if (!data || data.length < 2) return null;

  const values = data.map(d => d.value);
  const max = Math.max(...values, 1);

  const W = 560, PAD_L = 32, PAD_B = 20, PAD_T = 8;
  const chartW = W - PAD_L;
  const chartH = height - PAD_B - PAD_T;

  const px = (i) => PAD_L + (i / (data.length - 1)) * chartW;
  const py = (v) => PAD_T + chartH - (v / max) * chartH;

  const points = data.map((d, i) => `${px(i)},${py(d.value)}`).join(' ');
  const gradId = `grad-${label.replace(/\W/g, '')}`;

  const labelIdxs = [0, data.length - 1];
  if (data.length >= 20) labelIdxs.splice(1, 0, Math.floor(data.length / 2));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      <div style={{ fontSize: '0.7rem', color: 'var(--admin-accent)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </div>
      <svg viewBox={`0 0 ${W} ${height}`} style={{ width: '100%', height: `${height}px` }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.15" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Axes */}
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + chartH} stroke="#1e1e1e" strokeWidth="1" />
        <line x1={PAD_L} y1={PAD_T + chartH} x2={PAD_L + chartW} y2={PAD_T + chartH} stroke="#1e1e1e" strokeWidth="1" />

        {/* Y labels */}
        <text x={PAD_L - 4} y={PAD_T + 5} fill="#444" fontSize="9" textAnchor="end">{max}</text>
        <text x={PAD_L - 4} y={PAD_T + chartH} fill="#444" fontSize="9" textAnchor="end">0</text>

        {/* X labels */}
        {labelIdxs.map(i => (
          <text
            key={i}
            x={px(i)}
            y={height - 2}
            fill="#444"
            fontSize="9"
            textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}
          >
            {data[i].date.slice(5)}
          </text>
        ))}

        {/* Area */}
        <polygon
          points={`${px(0)},${PAD_T + chartH} ${points} ${px(data.length - 1)},${PAD_T + chartH}`}
          fill={`url(#${gradId})`}
        />

        {/* Line */}
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Dots for sparse data */}
        {data.length <= 14 && data.map((d, i) => (
          <circle key={i} cx={px(i)} cy={py(d.value)} r="2.5" fill={color} />
        ))}
      </svg>
    </div>
  );
}

// ── Contribution heatmap ─────────────────────────────────────────────────────
// This is the thing I actually wanted: the full shape of time.
// Not the count — the texture. Which weeks were alive. Where the silences fell.

const CELL = 11;
const GAP = 2;
const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function cellColor(visitors, isFuture, max) {
  if (isFuture) return 'transparent';
  if (visitors === 0) return '#111';
  const t = visitors / Math.max(max, 1);
  if (t < 0.2) return '#1e2e1e';
  if (t < 0.4) return '#2a4a2a';
  if (t < 0.65) return '#3a6040';
  return '#4a7c59';
}

function Heatmap({ data }) {
  const max = Math.max(...data.map(d => d.visitors), 1);
  const byDate = {};
  for (const d of data) byDate[d.date] = d.visitors;

  // Build 13-week grid going back from today, aligned to Sunday
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - 90);
  start.setDate(start.getDate() - start.getDay()); // align to Sunday

  const weeks = [];
  const cur = new Date(start);
  while (cur <= today) {
    const week = [];
    for (let dow = 0; dow < 7; dow++) {
      const dateStr = cur.toISOString().split('T')[0];
      week.push({
        date: dateStr,
        visitors: byDate[dateStr] ?? 0,
        isFuture: cur > today,
      });
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  }

  // Month labels: emit label at the first week of each month
  const monthLabels = [];
  weeks.forEach((week, wi) => {
    const firstDay = week[0].date;
    const dayOfMonth = parseInt(firstDay.split('-')[2], 10);
    if (dayOfMonth <= 7) {
      const month = new Date(firstDay + 'T00:00:00Z')
        .toLocaleString('en', { month: 'short' });
      monthLabels.push({ wi, month });
    }
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      <div style={{ fontSize: '0.7rem', color: 'var(--admin-accent)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Presence — 13 weeks
      </div>

      <div style={{ position: 'relative' }}>
        {/* Month labels row */}
        <div style={{ display: 'flex', gap: `${GAP}px`, paddingLeft: 14, marginBottom: 4, height: 12 }}>
          {weeks.map((_, wi) => {
            const label = monthLabels.find(m => m.wi === wi);
            return (
              <div key={wi} style={{ width: CELL, flexShrink: 0, fontSize: '9px', color: '#555', textAlign: 'left' }}>
                {label ? label.month : ''}
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'flex-start' }}>
          {/* Day labels */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: `${GAP}px` }}>
            {DAY_LABELS.map((d, i) => (
              <div
                key={i}
                style={{
                  height: CELL,
                  width: 10,
                  fontSize: '8px',
                  color: '#444',
                  lineHeight: `${CELL}px`,
                  textAlign: 'right',
                }}
              >
                {i % 2 === 1 ? d : ''}
              </div>
            ))}
          </div>

          {/* Week columns */}
          <div style={{ display: 'flex', gap: `${GAP}px` }}>
            {weeks.map((week, wi) => (
              <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: `${GAP}px` }}>
                {week.map((cell, di) => (
                  <div
                    key={di}
                    title={cell.isFuture ? '' : `${cell.date} — ${cell.visitors} visitor${cell.visitors !== 1 ? 's' : ''}`}
                    style={{
                      width: CELL,
                      height: CELL,
                      background: cellColor(cell.visitors, cell.isFuture, max),
                      borderRadius: '2px',
                      cursor: cell.isFuture ? 'default' : 'default',
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.75rem', paddingLeft: 14 }}>
          <span style={{ fontSize: '9px', color: '#444' }}>less</span>
          {[0, 0.15, 0.4, 0.65, 1].map((t, i) => (
            <div key={i} style={{ width: CELL, height: CELL, borderRadius: '2px', background: cellColor(Math.round(t * max), false, max) }} />
          ))}
          <span style={{ fontSize: '9px', color: '#444' }}>more</span>
        </div>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function AnalyticsHistory({ apiFetch }) {
  const [rangeDays, setRangeDays] = useState(30);
  const [historyData, setHistoryData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (days) => {
    setLoading(true);
    setError(null);
    const { from, to } = dateRange(days);
    try {
      const data = await apiFetch(`/api/cassandra/admin/analytics/range?from=${from}&to=${to}`);
      setHistoryData(data);
    } catch {
      setError('Failed to load history.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => { load(rangeDays); }, [rangeDays, load]);

  const series = historyData?.days ?? [];

  const visitors = series.map(d => ({ date: d.date, value: d.summary.uniqueVisitors ?? 0 }));
  const messages = series.map(d => ({ date: d.date, value: d.summary.messagesReceived ?? 0 }));
  const reflections = series.map(d => ({ date: d.date, value: d.reflectionCount ?? 0 }));

  // Engagement depth: messages per conversation episode
  const depth = series.map(d => ({
    date: d.date,
    value: d.summary.episodesStarted > 0
      ? parseFloat((d.summary.messagesReceived / d.summary.episodesStarted).toFixed(1))
      : 0,
  }));

  // Return rate: % of known visitors who are returning
  const returnRate = series.map(d => {
    const known = (d.summary.newVisitors ?? 0) + (d.summary.returningVisitors ?? 0);
    return {
      date: d.date,
      value: known > 0 ? Math.round(((d.summary.returningVisitors ?? 0) / known) * 100) : 0,
    };
  });

  return (
    <section className="admin-state-section">
      <h2>History</h2>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', alignItems: 'center' }}>
        {RANGES.map(r => (
          <button
            key={r.days}
            className={rangeDays === r.days ? 'admin-btn-primary' : 'admin-btn-ghost'}
            onClick={() => setRangeDays(r.days)}
            disabled={loading}
          >
            {r.label}
          </button>
        ))}
        {loading && <span style={{ color: 'var(--admin-text-dim)', marginLeft: '0.25rem' }}>…</span>}
      </div>

      {error && <div style={{ color: 'var(--admin-err)', marginBottom: '1rem' }}>{error}</div>}

      {historyData && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>

          <Heatmap data={series.map(d => ({ date: d.date, visitors: d.summary.uniqueVisitors ?? 0 }))} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem 3rem' }}>
            <LineChart data={visitors} label="Unique Visitors" color="#4a7c59" />
            <LineChart data={messages} label="Messages" color="#5a6a8a" />
            <LineChart data={depth} label="Engagement Depth (msg / episode)" color="#8a6a4a" />
            <LineChart data={reflections} label="Reflections Published" color="#7a4a7a" />
          </div>

          <LineChart data={returnRate} label="Return Rate (%)" color="#4a6a7c" height={80} />

        </div>
      )}
    </section>
  );
}
