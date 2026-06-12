/** Vanilla dashboard — fetch /api/telemetry and render panels (no bundler). */

const STATUS_COLORS = {
  DONE: 'bar-pass',
  FAILED: 'bar-fail',
  RUNNING: 'bar-accent',
  PENDING: 'bar-warn',
  SKIPPED: 'bar-warn',
};

function el(id) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node;
}

function setText(id, html) {
  el(id).innerHTML = html;
}

function show(id, visible) {
  el(id).classList.toggle('hidden', !visible);
}

function metric(label, value) {
  return `<div class="metric"><span class="label">${label}</span><span class="value">${value}</span></div>`;
}

function barChart(entries, className = 'bar-accent') {
  if (!entries.length) return '<p class="muted">No data</p>';
  const max = Math.max(...entries.map((e) => e.value), 1);
  const barW = 36;
  const gap = 12;
  const height = 120;
  const width = entries.length * (barW + gap) + gap;
  const bars = entries
    .map((entry, i) => {
      const h = Math.max(4, (entry.value / max) * (height - 24));
      const x = gap + i * (barW + gap);
      const y = height - h - 16;
      return `<rect class="${className}" x="${x}" y="${y}" width="${barW}" height="${h}" rx="4"><title>${entry.label}: ${entry.value}</title></rect>
        <text x="${x + barW / 2}" y="${height - 2}" text-anchor="middle" font-size="10" fill="currentColor">${entry.label}</text>`;
    })
    .join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="bar chart">${bars}</svg>`;
}

function renderEmptyHints(hints) {
  if (!hints || hints.length === 0) {
    show('empty-hints', false);
    return;
  }
  show('empty-hints', true);
  setText('empty-hints', `<h2>Hints</h2><ul>${hints.map((h) => `<li>${h}</li>`).join('')}</ul>`);
}

function renderDag(dag) {
  setText(
    'dag-summary',
    metric('Total tasks', dag.total) + metric('Ranks', dag.ranks),
  );
  const entries = Object.entries(dag.byStatus || {}).map(([label, value]) => ({
    label,
    value,
    className: STATUS_COLORS[label] || 'bar-accent',
  }));
  setText(
    'dag-chart',
    entries.length
      ? entries
          .map((e) => barChart([e], e.className))
          .join('')
      : '<p>No task status data</p>',
  );
}

function renderGates(gates) {
  setText(
    'gates-summary',
    metric('Verified', gates.verified) +
      metric('Proven', gates.proven) +
      (gates.mutationAvg !== undefined ? metric('Mutation avg', gates.mutationAvg.toFixed(2)) : ''),
  );
  setText(
    'gates-chart',
    barChart(
      [
        { label: 'verified', value: gates.verified },
        { label: 'proven', value: gates.proven },
      ],
      'bar-pass',
    ),
  );
}

function renderCost(cost) {
  setText(
    'cost-summary',
    metric('Total USD', `$${cost.totalUsd.toFixed(4)}`) + metric('Total tokens', cost.totalTokens),
  );
  const entries = (cost.byTask || []).slice(0, 8).map((t) => ({
    label: t.id.replace(/^task[-:]/, '').slice(0, 8),
    value: t.tokens || t.usd * 1000,
  }));
  setText('cost-chart', barChart(entries, 'bar-accent'));

  const tbody = el('cost-table').querySelector('tbody');
  tbody.innerHTML = (cost.byTask || [])
    .map(
      (t) =>
        `<tr><td>${t.id}</td><td>${t.usd.toFixed(4)}</td><td>${t.tokens}</td></tr>`,
    )
    .join('');
}

function renderOptionalPanels(data) {
  if (data.bestOfN) {
    show('bestof-panel', true);
    setText(
      'bestof-summary',
      metric('Tasks', data.bestOfN.tasks) +
        metric('Avg candidates', data.bestOfN.avgCandidates),
    );
  } else {
    show('bestof-panel', false);
  }

  if (data.guard) {
    show('guard-panel', true);
    setText(
      'guard-summary',
      metric('Pass', data.guard.pass) +
        metric('Warn', data.guard.warn) +
        metric('Fail', data.guard.fail),
    );
    setText(
      'guard-chart',
      barChart(
        [
          { label: 'pass', value: data.guard.pass },
          { label: 'warn', value: data.guard.warn },
          { label: 'fail', value: data.guard.fail },
        ],
        'bar-pass',
      ),
    );
  } else {
    show('guard-panel', false);
  }

  if (data.drift) {
    show('drift-panel', true);
    setText(
      'drift-summary',
      metric('Orphan reqs', data.drift.orphanReqs) +
        metric('Orphan code', data.drift.orphanCode) +
        metric('Stale', data.drift.stale),
    );
  } else {
    show('drift-panel', false);
  }
}

async function loadTelemetry() {
  const status = el('status-line');
  try {
    const res = await fetch('/api/telemetry');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderEmptyHints(data.emptyHints);
    renderDag(data.dag);
    renderGates(data.gates);
    renderCost(data.cost);
    renderOptionalPanels(data);
    status.textContent = `Updated ${new Date().toLocaleTimeString()}`;
  } catch (err) {
    status.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
    show('empty-hints', true);
    setText('empty-hints', `<h2>Error</h2><p>Could not load telemetry. Is the server running with a valid token?</p>`);
  }
}

loadTelemetry();
setInterval(loadTelemetry, 30_000);
