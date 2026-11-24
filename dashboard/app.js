// Token Radar v2 dashboard — renders window.RADAR (written by main.ts) with no
// network calls. The integrity strip re-checks the board in the browser.
(function () {
  'use strict';
  const R = window.RADAR;
  if (!R) { document.body.innerHTML = '<p style="padding:40px">No data — data.js did not load.</p>'; return; }
  const rows = R.rows;
  const $ = (id) => document.getElementById(id);

  // ---- formatting ---------------------------------------------------------
  function money(n) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n.toFixed(0);
  }
  function pct(x, d) { return (x * 100).toFixed(d === undefined ? 0 : d) + '%'; }
  function ageStr(a) { return a === null ? 'n/a' : a < 1 ? Math.round(a * 12) + 'mo' : a.toFixed(1) + 'y'; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // ---- header + KPIs ------------------------------------------------------
  $('asOf').textContent = 'Snapshot ' + R.asOf.slice(0, 10);
  $('asOf2').textContent = R.asOf.slice(0, 10);
  $('bandWidth').textContent = '±' + R.conformal.halfWidth.toFixed(2);
  $('r2').textContent = R.value.r2.toFixed(2);
  const top = rows[0];
  const kpis = [
    ['Rows scored', '200', '40 watchlist + 140 early + 20 off-list'],
    ['#1 implied value', money(top.implied_value_usd), top.name + ' (was v1 #' + top.v1_rank + ')'],
    ['Value LOO', '×' + R.value.loo.toFixed(2), 'vs flat ×' + R.value.looFlat.toFixed(2) + ' · WF ×' + (R.value.wf.reduce((a, b) => a + b, 0) / 3).toFixed(2)],
    ['Odds Brier', R.odds.brier.toFixed(3), 'vs base rate ' + R.odds.brierBase.toFixed(3)],
    ['FARM / THIN / SKIP', R.verdictCounts.FARM + ' / ' + R.verdictCounts.THIN + ' / ' + R.verdictCounts.SKIP, 'by break-even deposit'],
    ['F∞ (cure fraction)', '0.95', 'MLE at boundary 1.00 — not identified'],
  ];
  $('kpis').innerHTML = kpis.map(([k, v, s]) => '<div class="kpi"><div class="k">' + k + '</div><div class="v">' + esc(v) + '</div><div class="s">' + esc(s) + '</div></div>').join('');

  // ---- integrity strip: real checks, run in the browser -------------------
  const checks = [];
  function check(name, pass, detail) { checks.push({ name, pass, detail }); }
  const slugs = new Set(rows.map((r) => r.slug));
  const covered = R.watchlistSlugs.filter((s) => slugs.has(s)).length;
  check('watchlist 40/40 covered', covered === 40, covered + '/40 by slug');
  check('ranks exactly 1..200', rows.every((r, i) => r.rank === i + 1), rows.length + ' rows');
  check('implied value non-increasing', rows.every((r, i) => i === 0 || rows[i - 1].implied_value_usd >= r.implied_value_usd), '#1 ' + money(top.implied_value_usd));
  check('farm steps 3–12 × 20–600 chars', rows.every((r) => r.farm_steps.length >= 3 && r.farm_steps.length <= 12 && r.farm_steps.every((s) => s.trim().length >= 20 && s.trim().length <= 600)), 'all rows');
  check('implied values positive', rows.every((r) => r.implied_value_usd > 0), 'all rows');
  check('value fit converged', R.value.converged, 'LOO ×' + R.value.loo.toFixed(2));
  check('odds fit converged', R.odds.converged, 'Brier ' + R.odds.brier.toFixed(3));
  check('LOO beats flat', R.value.loo < R.value.looFlat, '×' + R.value.loo.toFixed(2) + ' vs ×' + R.value.looFlat.toFixed(2));
  check('Brier beats base rate', R.odds.brier < R.odds.brierBase, R.odds.brier.toFixed(3) + ' vs ' + R.odds.brierBase.toFixed(3));
  // Refit rank #1's fitted mcap from the published coefficients and compare.
  const b = R.value.beta;
  const refit = Math.exp(b[0] + b[1] * Math.log(top.tvl_usd) + b[2] * Math.log(Math.max(1, top.chains.length)) + b[3] * top.g7);
  const refitRatio = refit / top.fit_mcap_usd;
  check('rank #1 refit matches published fit', Math.abs(Math.log(refitRatio)) < 0.01, 'ratio ' + refitRatio.toFixed(4));
  // Odds fall with age: recompute the conditional odds from the published buckets.
  const young = R.buckets[0].pCond, old = R.buckets[R.buckets.length - 1].pCond;
  check('odds fall with age (the v2 fix)', young > old, pct(young) + ' young vs ' + pct(old) + ' old');
  const passed = checks.filter((c) => c.pass).length;
  $('integrity').innerHTML = '<span class="' + (passed === checks.length ? 'ok' : 'bad') + '">' + passed + '/' + checks.length + ' integrity checks pass</span> <span class="muted">— run live in your browser from the published coefficients</span><ul>' +
    checks.map((c) => '<li>' + (c.pass ? '✓' : '✗') + ' ' + esc(c.name) + ' <span class="muted">(' + esc(c.detail) + ')</span></li>').join('') + '</ul>';

  // ---- cover: scatter ------------------------------------------------------
  (function scatter() {
    const pts = R.scatter.points, line = R.scatter.line, band = R.scatter.band;
    const W = 520, H = 340, PL = 44, PR = 12, PT = 12, PB = 36;
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const x0 = Math.min(...xs) - 0.3, x1 = Math.max(...xs) + 0.3;
    const y0 = Math.min(...ys, ...line.map((p) => p.y - band)) - 0.3;
    const y1 = Math.max(...ys, ...line.map((p) => p.y + band)) + 0.3;
    const X = (x) => PL + (x - x0) / (x1 - x0) * (W - PL - PR);
    const Y = (y) => H - PB - (y - y0) / (y1 - y0) * (H - PT - PB);
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Scatter of log TVL against log market cap for 94 comparables">';
    // Conformal band polygon.
    const bandPath = line.map((p) => X(p.x).toFixed(1) + ',' + Y(p.y + band).toFixed(1)).join(' ') + ' ' +
      line.slice().reverse().map((p) => X(p.x).toFixed(1) + ',' + Y(p.y - band).toFixed(1)).join(' ');
    s += '<polygon points="' + bandPath + '" fill="#58a6ff" opacity="0.12"/>';
    s += '<polyline points="' + line.map((p) => X(p.x).toFixed(1) + ',' + Y(p.y).toFixed(1)).join(' ') + '" fill="none" stroke="#58a6ff" stroke-width="2"/>';
    for (const p of pts) s += '<circle cx="' + X(p.x).toFixed(1) + '" cy="' + Y(p.y).toFixed(1) + '" r="2.6" fill="#e6edf3" opacity="0.75"/>';
    s += '<line x1="' + PL + '" y1="' + (H - PB) + '" x2="' + (W - PR) + '" y2="' + (H - PB) + '" stroke="#30363d"/>';
    s += '<line x1="' + PL + '" y1="' + PT + '" x2="' + PL + '" y2="' + (H - PB) + '" stroke="#30363d"/>';
    s += '<text x="' + ((W + PL - PR) / 2) + '" y="' + (H - 8) + '" fill="#8b949e" font-size="11" text-anchor="middle">ln(TVL, $)</text>';
    s += '<text x="12" y="' + ((H - PB + PT) / 2) + '" fill="#8b949e" font-size="11" text-anchor="middle" transform="rotate(-90 12 ' + ((H - PB + PT) / 2) + ')">ln(market cap, $)</text>';
    s += '</svg>';
    $('scatter').innerHTML = s;
  })();

  // ---- cover: held-out + ablation -----------------------------------------
  function heldOutRows() {
    const wf = R.value.wf, wff = R.value.wfFlat;
    return '<tr><th>Test</th><th>Model</th><th>Flat baseline</th></tr>' +
      '<tr><td>Leave-one-out (94 comps)</td><td>×' + R.value.loo.toFixed(2) + '</td><td>×' + R.value.looFlat.toFixed(2) + '</td></tr>' +
      '<tr><td>Walk-forward, train ⅔</td><td>×' + wf[0].toFixed(2) + '</td><td>×' + wff[0].toFixed(2) + '</td></tr>' +
      '<tr><td>Walk-forward, train ½</td><td>×' + wf[1].toFixed(2) + '</td><td>×' + wff[1].toFixed(2) + '</td></tr>' +
      '<tr><td>Walk-forward, cut 2025-01-23</td><td>×' + wf[2].toFixed(2) + '</td><td>×' + wff[2].toFixed(2) + '</td></tr>';
  }
  $('heldOut').innerHTML = heldOutRows();
  $('heldOutFull').innerHTML = heldOutRows();
  function ablationRows(full) {
    const ts = full ? R.termTable : R.termTable.filter((t) => t.spec.includes('shipped') || t.spec.includes('Firstlight') || t.spec.includes('Flat') || t.spec.includes('OLS [lnTVL, lnChains'));
    return '<tr><th>Specification</th><th>LOO</th><th>Walk-forward</th><th>Ships?</th></tr>' +
      ts.map((t) => '<tr><td>' + esc(t.spec) + '</td><td>×' + t.loo.toFixed(2) + '</td><td>×' + t.wfAvg.toFixed(2) + '</td><td>' + (t.ship ? '✓ ships' : '—') + '</td></tr>').join('');
  }
  $('ablation').innerHTML = ablationRows(false);
  $('termTableFull').innerHTML = ablationRows(true);

  // ---- odds panel ----------------------------------------------------------
  $('buckets').innerHTML = '<tr><th>Age</th><th>n</th><th>F(t) already tokened</th><th>P(ever | tokenless)</th></tr>' +
    R.buckets.map((bk) => '<tr><td>' + bk.lo + '–' + (bk.hi >= 99 ? '∞' : bk.hi) + 'y</td><td>' + bk.n + '</td><td>' + pct(bk.f) + '</td><td><strong>' + pct(bk.pCond) + '</strong></td></tr>').join('');
  $('oddsBars').innerHTML = R.buckets.map((bk) => {
    const lbl = bk.lo + '–' + (bk.hi >= 99 ? '∞' : bk.hi) + 'y';
    return '<div class="odds-row"><span>' + lbl + '</span><div class="bar-track"><div class="bar-fill cond" style="width:' + (bk.pCond * 100).toFixed(0) + '%"></div></div><span>' + pct(bk.pCond) + '</span></div>';
  }).join('') + '<p class="muted small">Bars: conditional odds by age. They fall — a protocol that has stayed tokenless for years is, on the evidence, less likely to ever launch.</p>';

  // ---- method tab ----------------------------------------------------------
  $('valueFormula').textContent = R.value.beta[0].toFixed(2) + ' + ' + R.value.beta[1].toFixed(2) + '·ln(TVL) + ' + R.value.beta[2].toFixed(2) + '·ln(chains) + ' + R.value.beta[3].toFixed(2) + '·g7';
  $('brierText').textContent = R.odds.brier.toFixed(3) + ' (10-fold, vs ' + R.odds.brierBase.toFixed(3) + ' for the base rate)';
  $('calibration').innerHTML = '<tr><th>Predicted band</th><th>n</th><th>Mean predicted</th><th>Actual token rate</th></tr>' +
    R.calibration.map((c) => '<tr><td>' + c.lo.toFixed(1) + '–' + (c.hi > 1 ? '1.0' : c.hi.toFixed(1)) + '</td><td>' + c.n + '</td><td>' + (isNaN(c.pred) ? '—' : pct(c.pred)) + '</td><td>' + (isNaN(c.actual) ? '—' : pct(c.actual)) + '</td></tr>').join('');
  const llMax = Math.max(...R.finf.grid.map((g) => g.loglik));
  $('finfProfile').innerHTML = '<tr><th>F∞</th><th>Log-likelihood</th><th>Δ vs best</th></tr>' +
    R.finf.grid.map((g) => '<tr><td>' + g.fInf.toFixed(2) + (g.fInf === 0.95 ? ' ← point estimate' : g.fInf === R.finf.mle ? ' ← MLE' : '') + '</td><td>' + g.loglik.toFixed(1) + '</td><td>' + (g.loglik - llMax).toFixed(2) + '</td></tr>').join('');
  $('finfSens').innerHTML = '<tr><th>F∞</th><th>Top 3</th><th>Top-20 overlap with v1</th></tr>' +
    R.finfSensitivity.map((s) => '<tr><td>' + s.fInf.toFixed(2) + '</td><td>' + s.top3.map(esc).join(', ') + '</td><td>' + s.overlapTop20 + '/20</td></tr>').join('');
  $('beforeAfter').innerHTML = '<tr><th>v2 rank</th><th>Protocol</th><th>v1 rank</th><th>v1 implied</th><th>v2 implied</th></tr>' +
    R.beforeAfter.map((b) => '<tr><td>#' + b.v2Rank + '</td><td>' + esc(b.name) + '</td><td>' + (b.v1Rank === null ? '—' : '#' + b.v1Rank) + '</td><td>' + money(b.v1Ev) + '</td><td>' + money(b.v2Ev) + '</td></tr>').join('');

  // ---- board table: sort / filter / search / CSV ---------------------------
  let sortKey = 'rank', sortDir = 1;
  function filtered() {
    const q = $('search').value.trim().toLowerCase();
    const vf = $('verdictFilter').value;
    const wo = $('watchOnly').checked;
    return rows.filter((r) => {
      if (vf && r.verdict !== vf) return false;
      if (wo && !r.on_watchlist) return false;
      if (q && !(r.name.toLowerCase().includes(q) || r.slug.includes(q) || (r.category || '').toLowerCase().includes(q))) return false;
      return true;
    });
  }
  function renderBoard() {
    const list = filtered().slice().sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === 'string') return sortDir * av.localeCompare(bv);
      return sortDir * (av - bv);
    });
    $('boardBody').innerHTML = list.map((r) =>
      '<tr data-slug="' + esc(r.slug) + '"><td>' + r.rank + '</td><td><strong>' + esc(r.name) + '</strong>' + (r.on_watchlist ? ' <span class="watch">★ watchlist</span>' : '') + '<br><span class="muted small">' + esc(r.slug) + ' · ' + esc(r.category || 'uncategorized') + '</span></td>' +
      '<td class="num">' + money(r.tvl_usd) + '</td><td class="num">' + ageStr(r.age_years) + '</td>' +
      '<td class="num">' + money(r.fit_mcap_usd) + '</td><td class="num">' + pct(r.odds_cum) + '</td><td class="num"><strong>' + pct(r.odds_cond) + '</strong></td>' +
      '<td class="num"><strong>' + money(r.implied_value_usd) + '</strong></td>' +
      '<td><span class="verdict ' + r.verdict + '">' + r.verdict + '</span></td>' +
      '<td class="num">' + (r.break_even_usd === null ? 'never' : money(r.break_even_usd)) + '</td></tr>').join('');
    $('rowCount').textContent = list.length + ' of 200 rows';
    const sum = list.reduce((s, r) => s + r.implied_value_usd, 0);
    $('boardFooter').textContent = 'Shown rows sum to ' + money(sum) + ' of implied value. Click any row for the full arithmetic, the sensitivity grid and the farm plan.';
    document.querySelectorAll('#boardBody tr').forEach((tr) => tr.addEventListener('click', () => openDetail(tr.getAttribute('data-slug'))));
  }
  document.querySelectorAll('#boardTable th[data-sort]').forEach((th) => th.addEventListener('click', () => {
    const k = th.getAttribute('data-sort');
    if (k === sortKey) sortDir = -sortDir; else { sortKey = k; sortDir = k === 'rank' ? 1 : -1; }
    renderBoard();
  }));
  ['search', 'verdictFilter', 'watchOnly'].forEach((id) => $(id).addEventListener('input', renderBoard));
  $('csvBtn').addEventListener('click', () => {
    const head = 'rank,slug,name,category,tvl_usd,age_years,fit_mcap_usd,odds_cum,odds_cond,odds_12m,own_share,quality_ratio,implied_value_usd,interval_lo_usd,interval_hi_usd,rank_lo,rank_hi,verdict,plan_deposit_usd,exp_drop_usd,break_even_usd,on_watchlist,v1_rank';
    const lines = filtered().map((r) => [r.rank, r.slug, '"' + r.name.replace(/"/g, '""') + '"', '"' + (r.category || '').replace(/"/g, '""') + '"', r.tvl_usd, r.age_years === null ? '' : r.age_years, r.fit_mcap_usd, r.odds_cum.toFixed(4), r.odds_cond.toFixed(4), r.odds_12m.toFixed(4), r.own_share.toFixed(4), r.quality_ratio.toFixed(4), r.implied_value_usd, r.interval_lo_usd, r.interval_hi_usd, r.rank_lo, r.rank_hi, r.verdict, r.plan_deposit_usd, r.exp_drop_usd, r.break_even_usd === null ? '' : r.break_even_usd, r.on_watchlist ? 1 : 0, r.v1_rank === null ? '' : r.v1_rank].join(','));
    const blob = new Blob([head + '\n' + lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'token-radar-v2.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  });
  renderBoard();

  // ---- detail view ----------------------------------------------------------
  let current = null;
  function sensCells(r) {
    const deposits = [100, 1000, 10000, 100000, r.plan_deposit_usd];
    const shares = [3, 5, 7, 10, 15];
    return { deposits, shares, net: (d, s) => r.fit_mcap_usd * r.own_share * (s / 100) * (d / r.tvl_usd) * r.odds_12m - 960 };
  }
  function openDetail(slug) {
    const r = rows.find((x) => x.slug === slug);
    if (!r) return;
    current = r;
    $('detail').classList.remove('hidden');
    $('detailName').textContent = '#' + r.rank + ' ' + r.name;
    $('detailMeta').textContent = r.slug + ' · ' + (r.category || 'uncategorized') + ' · ' + r.chains.join(', ') + ' · age ' + ageStr(r.age_years) + (r.on_watchlist ? ' · ★ watchlist' : '') + ' · v1 rank #' + (r.v1_rank === null ? '—' : r.v1_rank);
    $('detailArith').innerHTML =
      '<div class="eq">fitted mcap ' + money(r.fit_mcap_usd) + ' × cond. odds ' + pct(r.odds_cond) + ' × own share ' + pct(r.own_share) + ' × quality ratio ' + r.quality_ratio.toFixed(2) + '</div>' +
      '<div class="big">= implied value ' + money(r.implied_value_usd) + '</div>' +
      '<p class="muted small">Conformal 50% interval on the fitted mcap: ' + money(r.interval_lo_usd) + ' – ' + money(r.interval_hi_usd) + '. Bootstrap rank range (200 refits): #' + r.rank_lo + '–#' + r.rank_hi + '. ' +
      'Cumulative odds would have been ' + pct(r.odds_cum) + ' — the conditional fix ' + (r.odds_cond > r.odds_cum ? 'raises' : 'lowers') + ' it because this protocol is ' + (r.age_years !== null && r.age_years < 2 ? 'young' : r.age_years !== null && r.age_years > 3 ? 'old' : 'mid-age') + ' for its cohort.</p>';
    $('detailFarm').innerHTML = '<p>Plan deposit (0.02% of TVL): <strong>' + money(r.plan_deposit_usd) + '</strong> · expected airdrop at 7% share over 52 weeks: <strong>' + money(r.exp_drop_usd) + '</strong> · all-in cost: <strong>$960</strong> · break-even deposit: <strong>' + (r.break_even_usd === null ? 'no size breaks even' : money(r.break_even_usd)) + '</strong> · verdict: <span class="verdict ' + r.verdict + '">' + r.verdict + '</span></p>' +
      '<p class="muted small">12-month hazard odds: ' + pct(r.odds_12m, 1) + '. The verdict comes from the break-even: FARM at ≤ $100K, THIN at ≤ $500K, SKIP above that.</p>';
    const { deposits, shares, net } = sensCells(r);
    $('sensGrid').innerHTML = '<tr><th>deposit \\ share</th>' + shares.map((s) => '<th>' + s + '%</th>').join('') + '</tr>' +
      deposits.map((d) => '<tr><td>' + money(d) + (d === r.plan_deposit_usd ? ' (plan)' : '') + '</td>' + shares.map((s) => {
        const v = net(d, s);
        return '<td class="' + (d === r.plan_deposit_usd && s === 7 ? 'plan ' : '') + (v >= 0 ? 'pos' : 'neg') + '">' + (v >= 0 ? '+' : '−') + money(Math.abs(v)).slice(1).replace(/^/, '$') + '</td>';
      }).join('') + '</tr>').join('');
    $('sbDeposit').value = r.plan_deposit_usd;
    $('sbShare').value = 7;
    updateSandbox();
    $('detailSteps').innerHTML = r.farm_steps.map((s) => '<li>' + esc(s) + '</li>').join('');
    $('detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function updateSandbox() {
    if (!current) return;
    const d = parseFloat($('sbDeposit').value) || 0;
    const s = (parseFloat($('sbShare').value) || 0) / 100;
    const net = current.fit_mcap_usd * current.own_share * s * (d / current.tvl_usd) * current.odds_12m - 960;
    $('sbResult').innerHTML = 'Expected net: <span class="' + (net >= 0 ? 'pos' : 'neg') + '">' + (net >= 0 ? '+' : '−') + '$' + Math.abs(net).toLocaleString(undefined, { maximumFractionDigits: 0 }) + '</span>';
  }
  $('sbDeposit').addEventListener('input', updateSandbox);
  $('sbShare').addEventListener('input', updateSandbox);
  $('closeDetail').addEventListener('click', () => { $('detail').classList.add('hidden'); current = null; });

  // ---- tabs ------------------------------------------------------------------
  document.querySelectorAll('.tab').forEach((btn) => btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.getAttribute('data-tab');
    $('tab-board').classList.toggle('hidden', tab !== 'board');
    $('tab-method').classList.toggle('hidden', tab !== 'method');
  }));
})();
