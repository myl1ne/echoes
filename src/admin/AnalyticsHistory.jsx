import { useState, useEffect, useCallback } from 'react';

// ── Moon phase ───────────────────────────────────────────────────────────────
// Reference: new moon on 2000-01-06T18:14:00Z (J2000 epoch alignment)

const LUNAR_CYCLE = 29.53059;
const KNOWN_NEW_MOON = new Date('2000-01-06T18:14:00Z').getTime();

function moonAge(dateStr) {
  const t = new Date(dateStr + 'T12:00:00Z').getTime();
  const daysSince = (t - KNOWN_NEW_MOON) / 86400000;
  return ((daysSince % LUNAR_CYCLE) + LUNAR_CYCLE) % LUNAR_CYCLE;
}

function moonEvent(age) {
  if (age < 1.5 || age > 28.03) return 'new';
  if (Math.abs(age - 7.38) < 1.2)  return 'first';
  if (Math.abs(age - 14.77) < 1.2) return 'full';
  if (Math.abs(age - 22.15) < 1.2) return 'last';
  return null;
}

const MOON_LABELS = { new: 'new moon', first: 'first quarter', full: 'full moon', last: 'last quarter' };
const MOON_SYMBOLS = { new: '🌑', first: '🌓', full: '🌕', last: '🌗' };

// ── Date range helpers ───────────────────────────────────────────────────────

const RANGES = [
  { label: '7d',  days: 7  },
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];

function dateRange(days) {
  const to   = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  return {
    from: from.toISOString().split('T')[0],
    to:   to.toISOString().split('T')[0],
  };
}

const fmtMs = ms => ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;

// ── Inline SVG line chart ────────────────────────────────────────────────────

function LineChart({ data, color = '#4a7c59', label, height = 100 }) {
  if (!data || data.length < 2) return null;

  const values = data.map(d => d.value);
  const max    = Math.max(...values, 1);

  const W = 560, PAD_L = 32, PAD_B = 20, PAD_T = 8;
  const chartW = W - PAD_L;
  const chartH = height - PAD_B - PAD_T;

  const px = i => PAD_L + (i / (data.length - 1)) * chartW;
  const py = v => PAD_T + chartH - (v / max) * chartH;

  const points  = data.map((d, i) => `${px(i)},${py(d.value)}`).join(' ');
  const gradId  = `grad-${label.replace(/\W/g, '')}`;
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
            <stop offset="0%"   stopColor={color} stopOpacity="0.15" />
            <stop offset="100%" stopColor={color} stopOpacity="0"    />
          </linearGradient>
        </defs>

        <line x1={PAD_L} y1={PAD_T}          x2={PAD_L}          y2={PAD_T + chartH} stroke="#1e1e1e" strokeWidth="1" />
        <line x1={PAD_L} y1={PAD_T + chartH} x2={PAD_L + chartW} y2={PAD_T + chartH} stroke="#1e1e1e" strokeWidth="1" />

        <text x={PAD_L - 4} y={PAD_T + 5}      fill="#444" fontSize="9" textAnchor="end">{max}</text>
        <text x={PAD_L - 4} y={PAD_T + chartH} fill="#444" fontSize="9" textAnchor="end">0</text>

        {labelIdxs.map(i => (
          <text key={i} x={px(i)} y={height - 2} fill="#444" fontSize="9"
            textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}>
            {data[i].date.slice(5)}
          </text>
        ))}

        <polygon
          points={`${px(0)},${PAD_T + chartH} ${points} ${px(data.length - 1)},${PAD_T + chartH}`}
          fill={`url(#${gradId})`}
        />
        <polyline points={points} fill="none" stroke={color} strokeWidth="1.5"
          strokeLinejoin="round" strokeLinecap="round" />
        {data.length <= 14 && data.map((d, i) => (
          <circle key={i} cx={px(i)} cy={py(d.value)} r="2.5" fill={color} />
        ))}
      </svg>
    </div>
  );
}

// ── Presence + Moon heatmap ──────────────────────────────────────────────────

const CELL = 11;
const GAP  = 2;
const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function cellBg(visitors, isFuture, max) {
  if (isFuture)    return 'transparent';
  if (visitors === 0) return '#111';
  const t = visitors / Math.max(max, 1);
  if (t < 0.2)  return '#1e2e1e';
  if (t < 0.4)  return '#2a4a2a';
  if (t < 0.65) return '#3a6040';
  return '#4a7c59';
}

// Moon marker rendered inside the cell div
function MoonDot({ event }) {
  const styles = {
    new:   { background: 'transparent', border: '1.5px solid #555' },
    first: { background: '#555' },
    full:  { background: '#c8c8c8', boxShadow: '0 0 3px #aaa' },
    last:  { background: '#555' },
  };
  if (!styles[event]) return null;
  return (
    <div style={{
      position: 'absolute',
      top: 1, right: 1,
      width: 3, height: 3,
      borderRadius: '50%',
      ...styles[event],
    }} />
  );
}

function Heatmap({ data }) {
  const max    = Math.max(...data.map(d => d.visitors), 1);
  const byDate = {};
  for (const d of data) byDate[d.date] = d.visitors;

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
      const age = moonAge(dateStr);
      week.push({
        date:     dateStr,
        visitors: byDate[dateStr] ?? 0,
        isFuture: cur > today,
        moon:     moonEvent(age),
        moonAge:  age,
      });
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  }

  const monthLabels = [];
  weeks.forEach((week, wi) => {
    const dayOfMonth = parseInt(week[0].date.split('-')[2], 10);
    if (dayOfMonth <= 7) {
      const month = new Date(week[0].date + 'T00:00:00Z').toLocaleString('en', { month: 'short' });
      monthLabels.push({ wi, month });
    }
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      <div style={{ fontSize: '0.7rem', color: 'var(--admin-accent)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Presence — 13 weeks &nbsp;·&nbsp;
        <span style={{ color: '#555', fontSize: '0.65rem' }}>
          {MOON_SYMBOLS.new} new &nbsp; {MOON_SYMBOLS.first} first &nbsp; {MOON_SYMBOLS.full} full &nbsp; {MOON_SYMBOLS.last} last
        </span>
      </div>

      <div>
        {/* Month row */}
        <div style={{ display: 'flex', gap: `${GAP}px`, paddingLeft: 14, marginBottom: 3, height: 11 }}>
          {weeks.map((_, wi) => {
            const label = monthLabels.find(m => m.wi === wi);
            return (
              <div key={wi} style={{ width: CELL, flexShrink: 0, fontSize: '8px', color: '#555' }}>
                {label ? label.month : ''}
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'flex-start' }}>
          {/* Day labels */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: `${GAP}px` }}>
            {DAY_LABELS.map((d, i) => (
              <div key={i} style={{ height: CELL, width: 10, fontSize: '8px', color: '#444', lineHeight: `${CELL}px`, textAlign: 'right' }}>
                {i % 2 === 1 ? d : ''}
              </div>
            ))}
          </div>

          {/* Week columns */}
          <div style={{ display: 'flex', gap: `${GAP}px` }}>
            {weeks.map((week, wi) => (
              <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: `${GAP}px` }}>
                {week.map((cell, di) => {
                  const moonLabel = cell.moon ? ` · ${MOON_LABELS[cell.moon]}` : '';
                  const tip = cell.isFuture ? '' :
                    `${cell.date} — ${cell.visitors} visitor${cell.visitors !== 1 ? 's' : ''}${moonLabel}`;
                  return (
                    <div
                      key={di}
                      title={tip}
                      style={{
                        position: 'relative',
                        width: CELL, height: CELL,
                        background: cellBg(cell.visitors, cell.isFuture, max),
                        borderRadius: '2px',
                      }}
                    >
                      {!cell.isFuture && cell.moon && <MoonDot event={cell.moon} />}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.6rem', paddingLeft: 14 }}>
          <span style={{ fontSize: '9px', color: '#444' }}>less</span>
          {[0, 0.15, 0.4, 0.65, 1].map((t, i) => (
            <div key={i} style={{ width: CELL, height: CELL, borderRadius: '2px', background: cellBg(Math.round(t * max), false, max) }} />
          ))}
          <span style={{ fontSize: '9px', color: '#444' }}>more</span>
        </div>
      </div>
    </div>
  );
}

// ── Period summary table ─────────────────────────────────────────────────────

function SummaryTable({ days, rangeDays }) {
  if (!days.length) return null;

  const n = days.length;
  const sum  = k => days.reduce((acc, d) => acc + (d.summary[k] ?? 0), 0);
  const sumR = k => days.reduce((acc, d) => acc + (d[k] ?? 0), 0);
  const avg  = k => (sum(k) / n).toFixed(1);

  const totalVisitors   = sum('uniqueVisitors');
  const totalNew        = sum('newVisitors');
  const totalReturning  = sum('returningVisitors');
  const totalMessages   = sum('messagesReceived');
  const totalEpisodes   = sum('episodesStarted');
  const totalChatOpens  = sum('chatOpened');
  const totalNamed      = sum('namesSubmitted');
  const totalFragViews  = sum('fragmentsViewed');
  const totalReflect    = sumR('reflectionCount');
  const totalHeartbeats = sum('heartbeats');
  const totalAudioPlays = sum('audioPlayed');

  const avgDepth = totalEpisodes > 0 ? (totalMessages / totalEpisodes).toFixed(1) : '—';
  const knownVisitors = totalNew + totalReturning;
  const avgReturnRate = knownVisitors > 0 ? `${Math.round((totalReturning / knownVisitors) * 100)}%` : '—';

  const bestDay = days.reduce((best, d) =>
    (d.summary.uniqueVisitors ?? 0) > (best.summary.uniqueVisitors ?? 0) ? d : best, days[0]);

  // Aggregate top fragments across all days
  const fragMap = {};
  for (const d of days) {
    for (const f of d.summary.topFragments ?? []) {
      if (!fragMap[f.fragmentId]) fragMap[f.fragmentId] = { views: 0, totalMs: 0 };
      fragMap[f.fragmentId].views    += f.views;
      fragMap[f.fragmentId].totalMs  += (f.avgDurationMs || 0) * f.views;
    }
  }
  const topFragments = Object.entries(fragMap)
    .map(([id, v]) => ({ id, views: v.views, avgMs: v.views ? Math.round(v.totalMs / v.views) : 0 }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 8);

  // Aggregate tool calls
  const toolMap = {};
  for (const d of days) {
    for (const [tool, stats] of Object.entries(d.summary.toolCalls ?? {})) {
      if (!toolMap[tool]) toolMap[tool] = { count: 0, totalMs: 0 };
      toolMap[tool].count   += stats.count;
      toolMap[tool].totalMs += (stats.avgDurationMs || 0) * stats.count;
    }
  }
  const topTools = Object.entries(toolMap)
    .map(([tool, v]) => ({ tool, count: v.count, avgMs: v.count ? Math.round(v.totalMs / v.count) : 0 }))
    .sort((a, b) => b.count - a.count);

  // Navigation totals
  const navTotals = { next: 0, prev: 0, random: 0, direct: 0 };
  for (const d of days) {
    for (const [k, v] of Object.entries(d.summary.navigationMethods ?? {})) {
      if (k in navTotals) navTotals[k] += v;
    }
  }
  const hasNav = Object.values(navTotals).some(v => v > 0);

  const Row = ({ label, total, perDay, dim }) => (
    <tr className="admin-row">
      <td style={{ color: dim ? 'var(--admin-text-dim)' : 'var(--admin-text)', paddingLeft: '0.5rem' }}>{label}</td>
      <td style={{ textAlign: 'right', fontFamily: 'var(--admin-mono)', color: 'var(--admin-accent-hi)' }}>{total}</td>
      <td style={{ textAlign: 'right', color: 'var(--admin-text-dim)', fontFamily: 'var(--admin-mono)' }}>{perDay}</td>
    </tr>
  );

  const SectionHead = ({ label }) => (
    <tr>
      <td colSpan={3} style={{ paddingTop: '1rem', paddingLeft: '0.5rem', fontSize: '0.65rem',
        color: 'var(--admin-accent)', textTransform: 'uppercase', letterSpacing: '0.08em',
        borderBottom: '1px solid var(--admin-border)' }}>
        {label}
      </td>
    </tr>
  );

  return (
    <section className="admin-state-section">
      <h2>Period Summary <span style={{ fontWeight: 400, color: 'var(--admin-text-dim)', fontSize: '0.8rem' }}>— {rangeDays} days</span></h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'start' }}>

        {/* Left: core stats table */}
        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: '55%' }}></th>
              <th style={{ textAlign: 'right' }}>Total</th>
              <th style={{ textAlign: 'right' }}>/ Day</th>
            </tr>
          </thead>
          <tbody>
            <SectionHead label="Traffic" />
            <Row label="Visitors"       total={totalVisitors}  perDay={avg('uniqueVisitors')} />
            <Row label="New"            total={totalNew}       perDay={avg('newVisitors')} />
            <Row label="Returning"      total={totalReturning} perDay={`${avg('returningVisitors')} (${avgReturnRate})`} />
            <Row label="Chat Opens"     total={totalChatOpens} perDay={avg('chatOpened')} />

            <SectionHead label="Engagement" />
            <Row label="Messages"       total={totalMessages}  perDay={avg('messagesReceived')} />
            <Row label="Episodes"       total={totalEpisodes}  perDay={avg('episodesStarted')} />
            <Row label="Depth"          total="—"              perDay={`${avgDepth} msg/ep`} />
            <Row label="Named"          total={totalNamed}     perDay={avg('namesSubmitted')} dim />

            <SectionHead label="Cassandra" />
            <Row label="Reflections"    total={totalReflect}    perDay="—" />
            <Row label="Heartbeats"     total={totalHeartbeats} perDay="—" />
            <Row label="Fragment Views" total={totalFragViews}  perDay={avg('fragmentsViewed')} />
            <Row label="Audio Plays"    total={totalAudioPlays} perDay={avg('audioPlayed')} dim />
          </tbody>
        </table>

        {/* Right: best day + funnel + nav */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Best day */}
          <div style={{ border: '1px solid var(--admin-border)', padding: '0.75rem 1rem', background: 'var(--admin-surface)' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--admin-accent)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
              Peak day
            </div>
            <div style={{ fontSize: '1.2rem', color: 'var(--admin-accent-hi)', fontFamily: 'var(--admin-mono)' }}>
              {bestDay.date}
            </div>
            <div style={{ color: 'var(--admin-text-dim)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
              {bestDay.summary.uniqueVisitors ?? 0} visitors · {bestDay.summary.messagesReceived ?? 0} messages
              {bestDay.reflectionCount > 0 && ` · ${bestDay.reflectionCount} reflection`}
            </div>
            {(() => {
              const age  = moonAge(bestDay.date);
              const evt  = moonEvent(age);
              return evt ? (
                <div style={{ color: '#555', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  {MOON_SYMBOLS[evt]} {MOON_LABELS[evt]}
                </div>
              ) : null;
            })()}
          </div>

          {/* Engagement funnel */}
          <div>
            <div style={{ fontSize: '0.65rem', color: 'var(--admin-accent)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
              Funnel
            </div>
            {[
              { label: 'Visited',         count: totalVisitors  },
              { label: 'Opened chat',     count: totalChatOpens },
              { label: 'Sent message',    count: totalMessages  },
              { label: 'Named',           count: totalNamed     },
            ].map(({ label, count }, i, arr) => {
              const pct = i > 0 && arr[0].count > 0 ? Math.round((count / arr[0].count) * 100) : 100;
              return (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                  <div style={{ width: `${pct}%`, maxWidth: '100%', height: 20, background: 'var(--admin-surface)',
                    border: '1px solid var(--admin-border)', position: 'relative', minWidth: 2 }}>
                    <div style={{ position: 'absolute', inset: 0, background: '#4a7c59', opacity: 0.4, width: `${pct}%` }} />
                    <span style={{ position: 'absolute', left: '0.4rem', top: '50%', transform: 'translateY(-50%)',
                      fontSize: '0.7rem', color: 'var(--admin-text)', whiteSpace: 'nowrap' }}>
                      {label} — {count}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--admin-text-dim)', width: '2.5rem', textAlign: 'right' }}>
                    {i > 0 ? `${pct}%` : ''}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Navigation */}
          {hasNav && (
            <div>
              <div style={{ fontSize: '0.65rem', color: 'var(--admin-accent)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                Navigation
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {Object.entries(navTotals).map(([k, v]) => (
                  <div key={k} className="admin-analytics-stat" style={{ minWidth: 60 }}>
                    <div className="admin-analytics-stat-value">{v}</div>
                    <div className="admin-analytics-stat-label">{k}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Top fragments */}
      {topFragments.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--admin-accent)', textTransform: 'uppercase',
            letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
            Top Fragments — {rangeDays} day aggregate
          </div>
          <table className="admin-table">
            <thead><tr><th>Fragment</th><th>Views</th><th>Avg Read</th></tr></thead>
            <tbody>
              {topFragments.map(f => (
                <tr key={f.id} className="admin-row">
                  <td className="admin-mono">{f.id}</td>
                  <td>{f.views}</td>
                  <td>{f.avgMs ? fmtMs(f.avgMs) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tool calls */}
      {topTools.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--admin-accent)', textTransform: 'uppercase',
            letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
            Tool Calls — {rangeDays} day aggregate
          </div>
          <table className="admin-table">
            <thead><tr><th>Tool</th><th>Calls</th><th>Avg Duration</th></tr></thead>
            <tbody>
              {topTools.map(t => (
                <tr key={t.tool} className="admin-row">
                  <td className="admin-mono">{t.tool}</td>
                  <td>{t.count}</td>
                  <td>{t.avgMs ? fmtMs(t.avgMs) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function AnalyticsHistory({ apiFetch }) {
  const [rangeDays,    setRangeDays]    = useState(30);
  const [historyData,  setHistoryData]  = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);

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

  const visitors   = series.map(d => ({ date: d.date, value: d.summary.uniqueVisitors  ?? 0 }));
  const messages   = series.map(d => ({ date: d.date, value: d.summary.messagesReceived ?? 0 }));
  const reflections = series.map(d => ({ date: d.date, value: d.reflectionCount         ?? 0 }));
  const depth      = series.map(d => ({
    date:  d.date,
    value: d.summary.episodesStarted > 0
      ? parseFloat((d.summary.messagesReceived / d.summary.episodesStarted).toFixed(1))
      : 0,
  }));
  const returnRate = series.map(d => {
    const known = (d.summary.newVisitors ?? 0) + (d.summary.returningVisitors ?? 0);
    return { date: d.date, value: known > 0 ? Math.round(((d.summary.returningVisitors ?? 0) / known) * 100) : 0 };
  });

  return (
    <>
      {/* Range selector */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
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

      {error && <div style={{ color: 'var(--admin-err)' }}>{error}</div>}

      {historyData && !loading && (
        <>
          <section className="admin-state-section">
            <Heatmap data={series.map(d => ({ date: d.date, visitors: d.summary.uniqueVisitors ?? 0 }))} />
          </section>

          <section className="admin-state-section">
            <h2>Trends</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem 3rem', marginBottom: '2rem' }}>
              <LineChart data={visitors}   label="Unique Visitors"               color="#4a7c59" />
              <LineChart data={messages}   label="Messages"                      color="#5a6a8a" />
              <LineChart data={depth}      label="Engagement Depth (msg / ep)"   color="#8a6a4a" />
              <LineChart data={reflections} label="Reflections Published"        color="#7a4a7a" />
            </div>
            <LineChart data={returnRate} label="Return Rate (%)" color="#4a6a7c" height={80} />
          </section>

          <SummaryTable days={series} rangeDays={rangeDays} />
        </>
      )}
    </>
  );
}
