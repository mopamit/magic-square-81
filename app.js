(() => {
  'use strict';

  /* =========================================================
     ריבוע קסם – תרגול חיבור מספרים מכוונים (פריזמה)
     כל הערכים נשמרים כמספרים שלמים ב"יחידות":
       רמה רגילה – יחידה = 1
       רמה מתקדמת – יחידה = 1/4 (כך אין שגיאות נקודה צפה)
     ========================================================= */

  const SOUNDS = {
    success:'assets/sounds/Magical_sparkle_sound.mp3', // שורה/טור הפכו לנכונים
    error:  'assets/sounds/Cartoon_boing.mp3',         // "סיימתי" כשהלוח עוד לא פתור
    finish: 'assets/sounds/Celebration_music.mp3'      // שלב הושלם / סיום המשחק
  };

  // maxSingles = מקסימום שורות/טורים שבהם נשאר מספר אחד בלבד.
  // maxAllPositive = מקסימום שורות/טורים (עם 2+ מספרים) שבהם כל המספרים שנשארו חיוביים.
  const LEVELS = {
    regular: [
      { size: 3, min: -7,  max: 7,  targetMax: 15, maxSingles: 1, maxAllPositive: 1, keep: [4, 6] },
      { size: 4, min: -9,  max: 9,  targetMax: 22, maxSingles: 2, maxAllPositive: 1, keep: [8, 11] },
      { size: 4, min: -14, max: 14, targetMax: 32, maxSingles: 1, maxAllPositive: 0, keep: [8, 11] }
    ],
    // nonInt = טווח מספר התאים שאינם שלמים (שברים או עשרוניים – לא שניהם באותו לוח)
    advanced: [
      { size: 3, intMax: 6, targetMax: 12, maxSingles: 1, maxAllPositive: 1, keep: [4, 6], nonInt: [2, 3] },
      { size: 4, intMax: 7, targetMax: 18, maxSingles: 2, maxAllPositive: 1, keep: [8, 11], nonInt: [5, 7] },
      { size: 4, intMax: 8, targetMax: 22, maxSingles: 1, maxAllPositive: 0, keep: [8, 11], nonInt: [8, 11] }
    ]
  };
  const HINTS_PER_LEVEL = 3;

  const $ = id => document.getElementById(id);
  const boardEl = $('board');
  const messageEl = $('message');
  const hintBtn = $('hintBtn');

  let mode = 'regular';
  let muted = false;
  let busy = false; // נעילה בזמן פופ־אפ השלב
  const usedBoards = new Set();

  const state = {
    level: 0, score: 0, hints: HINTS_PER_LEVEL, hintsUsed: 0,
    size: 3, unit: 1, kind: 'int',
    values: [], solution: [], keep: [], rowT: [], colT: []
  };

  /* ---------------- עזרים ---------------- */
  const randInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const pick = arr => arr[randInt(0, arr.length - 1)];
  const sum = arr => arr.reduce((a, b) => a + b, 0);
  const grid = (n, f) => Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => f(r, c)));
  const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));

  /* ---------------- תצוגת מספרים ---------------- */
  // <span class="m" dir="ltr"> עם המספר בכתיב מתמטי: מינוס אמיתי, שבר פשוט או מספר מעורב.
  function numNode(units, unit = state.unit, kind = state.kind) {
    const span = document.createElement('span');
    span.className = 'm';
    span.dir = 'ltr';
    const n = Math.abs(units);
    const sign = units < 0 ? '−' : '';
    if (unit === 1 || n % unit === 0) { span.textContent = sign + n / unit; return span; }
    if (kind === 'decimal') { span.textContent = sign + String(n / unit); return span; }
    const whole = Math.floor(n / unit);
    let num = n % unit, den = unit;
    const g = gcd(num, den); num /= g; den /= g;
    const lead = sign + (whole ? whole : '');
    if (lead) span.append(document.createTextNode(lead));
    const fr = document.createElement('span');
    fr.className = 'frac';
    const t = document.createElement('span'); t.textContent = num;
    const b = document.createElement('span'); b.textContent = den;
    fr.append(t, b);
    span.append(fr);
    return span;
  }
  function numText(units) { // לקריאת מסך ולהודעות טקסט
    const u = state.unit, n = Math.abs(units), s = units < 0 ? 'מינוס ' : '';
    if (u === 1 || n % u === 0) return s + n / u;
    if (state.kind === 'decimal') return s + n / u;
    const whole = Math.floor(n / u); let num = n % u, den = u;
    const g = gcd(num, den); num /= g; den /= g;
    return s + (whole ? whole + ' ו־' : '') + num + '/' + den;
  }

  /* ---------------- מחולל לוחות ---------------- */
  function makeValues(cfg) {
    const S = cfg.size;
    if (mode === 'regular') {
      return grid(S, () => { let v = 0; while (v === 0) v = randInt(cfg.min, cfg.max); return v; });
    }
    const nonIntCount = randInt(cfg.nonInt[0], cfg.nonInt[1]);
    const idx = Array.from({ length: S * S }, (_, i) => i).sort(() => Math.random() - 0.5);
    const nonIntSet = new Set(idx.slice(0, nonIntCount));
    return grid(S, (r, c) => {
      const sign = Math.random() < 0.5 ? -1 : 1;
      if (nonIntSet.has(r * S + c)) {
        const whole = randInt(0, 3);
        const part = pick([1, 2, 3, 2]); // רבע / חצי / שלושה רבעים
        return sign * (whole * 4 + part);
      }
      return sign * 4 * randInt(1, cfg.intMax);
    });
  }

  function makeMask(cfg) {
    const S = cfg.size;
    const p = (cfg.keep[0] + cfg.keep[1]) / 2 / (S * S);
    return grid(S, () => Math.random() < p);
  }

  function lines(S) {
    const out = [];
    for (let r = 0; r < S; r++) out.push({ type: 'row', i: r });
    for (let c = 0; c < S; c++) out.push({ type: 'col', i: c });
    return out;
  }
  const lineVals = (m, L) => (L.type === 'row' ? m[L.i] : m.map(row => row[L.i]));

  function maskOk(values, mask, cfg) {
    const S = cfg.size;
    const kept = mask.flat().filter(Boolean).length;
    if (kept < cfg.keep[0] || kept > cfg.keep[1]) return false;
    let singles = 0, allPos = 0;
    for (const L of lines(S)) {
      const k = lineVals(mask, L), v = lineVals(values, L);
      const n = k.filter(Boolean).length;
      if (n === 0 || n === S) return false;      // בכל שורה/טור: לפחות אחד נשאר ולפחות אחד נמחק
      if (n === 1) singles++;
      if (n >= 2 && v.filter((_, j) => k[j]).every(x => x > 0)) allPos++;
    }
    return singles <= cfg.maxSingles && allPos <= cfg.maxAllPositive;
  }

  // ספירת פתרונות (עד limit). לוח עם פתרון יחיד = הוגן, והרמז תמיד מוביל אליו.
  function countSolutions(values, rowT, colT, limit = 2) {
    const S = values.length;
    const rowOptions = values.map((row, r) => {
      const opts = [];
      for (let m = 0; m < (1 << S); m++) {
        let s = 0; for (let c = 0; c < S; c++) if (m & (1 << c)) s += row[c];
        if (s === rowT[r]) opts.push(m);
      }
      return opts;
    });
    let count = 0;
    const colSum = new Array(S).fill(0);
    (function rec(r) {
      if (r === S) { if (colSum.every((s, c) => s === colT[c])) count++; return; }
      for (const m of rowOptions[r]) {
        for (let c = 0; c < S; c++) if (m & (1 << c)) colSum[c] += values[r][c];
        rec(r + 1);
        for (let c = 0; c < S; c++) if (m & (1 << c)) colSum[c] -= values[r][c];
        if (count >= limit) return;
      }
    })(0);
    return count;
  }

  function generate() {
    const cfg = LEVELS[mode][state.level];
    const S = cfg.size;
    state.size = S;
    state.unit = mode === 'regular' ? 1 : 4;
    state.kind = mode === 'regular' ? 'int' : pick(['fraction', 'decimal']);
    const tMax = cfg.targetMax * state.unit;

    let best = null;
    for (let attempt = 0; attempt < 6000; attempt++) {
      const values = makeValues(cfg);
      const flat = values.flat();
      const pos = flat.filter(v => v > 0).length, neg = flat.length - pos;
      if (pos < Math.floor(flat.length / 3) || neg < Math.floor(flat.length / 3)) continue;

      let mask = null;
      for (let t = 0; t < 80 && !mask; t++) { const m = makeMask(cfg); if (maskOk(values, m, cfg)) mask = m; }
      if (!mask) continue;

      const rowT = values.map((row, r) => sum(row.filter((_, c) => mask[r][c])));
      const colT = Array.from({ length: S }, (_, c) => sum(values.map((row, r) => (mask[r][c] ? row[c] : 0))));
      if (rowT.concat(colT).some(t => Math.abs(t) > tMax)) continue;
      if (!rowT.some(t => t < 0) || !colT.some(t => t < 0)) continue;
      const sig = JSON.stringify([values, rowT, colT]);
      if (usedBoards.has(sig)) continue;

      const cand = { values, mask, rowT, colT, sig };
      if (countSolutions(values, rowT, colT, 2) === 1) { best = cand; break; }
      if (!best) best = cand; // גיבוי נדיר: הבדיקה ממילא לפי סכומים, לא לפי הפתרון השמור
    }

    usedBoards.add(best.sig);
    Object.assign(state, {
      values: best.values, solution: best.mask, rowT: best.rowT, colT: best.colT,
      keep: grid(S, () => true), hints: HINTS_PER_LEVEL, hintsUsed: 0
    });
  }

  /* ---------------- מצב הלוח ---------------- */
  const rowSums = () => state.values.map((row, r) => sum(row.filter((_, c) => state.keep[r][c])));
  const colSums = () => Array.from({ length: state.size }, (_, c) =>
    sum(state.values.map((row, r) => (state.keep[r][c] ? row[c] : 0))));
  const matchedFlags = () => {
    const rs = rowSums(), cs = colSums();
    return rs.map((s, i) => s === state.rowT[i]).concat(cs.map((s, i) => s === state.colT[i]));
  };
  const isSolved = () => matchedFlags().every(Boolean);

  /* ---------------- ציור ---------------- */
  function sizeCells() {
    const S = state.size;
    const narrow = window.innerWidth < 760;
    const avail = Math.min(window.innerWidth - (narrow ? 50 : 90), 620);
    const gap = narrow ? 7 : 10;
    const ideal = S === 3 ? 86 : 74;
    const cell = Math.max(44, Math.min(ideal, Math.floor((avail - gap * S) / (S + 1))));
    boardEl.style.setProperty('--cell', cell + 'px');
  }

  function buildBoard(el, values, keep, rowT, colT, opts = {}) {
    const S = values.length;
    el.innerHTML = '';
    el.style.gridTemplateColumns = `repeat(${S + 1}, var(--cell))`;
    const rs = values.map((row, r) => sum(row.filter((_, c) => keep[r][c])));
    const cs = Array.from({ length: S }, (_, c) => sum(values.map((row, r) => (keep[r][c] ? row[c] : 0))));
    const showMatch = opts.live !== false;

    for (let c = 0; c < S; c++) {
      const t = document.createElement('div');
      t.className = 'target column' + (showMatch && cs[c] === colT[c] ? ' matched' : '');
      t.append(numNode(colT[c], opts.unit, opts.kind));
      if (opts.interactive) t.setAttribute('aria-label', `יעד הטור ${c + 1}: ${numText(colT[c])}${showMatch && cs[c] === colT[c] ? ', מתאים' : ''}`);
      el.append(t);
    }
    el.append(Object.assign(document.createElement('div'), { className: 'corner' }));

    for (let r = 0; r < S; r++) {
      for (let c = 0; c < S; c++) {
        const cell = document.createElement(opts.interactive ? 'button' : 'div');
        cell.className = 'cell' + (keep[r][c] ? '' : ' removed');
        cell.append(numNode(values[r][c], opts.unit, opts.kind));
        if (opts.interactive) {
          cell.type = 'button';
          cell.dataset.idx = r * S + c;
          cell.setAttribute('aria-label',
            `${keep[r][c] ? 'מחיקת' : 'החזרת'} המספר ${numText(values[r][c])}, שורה ${r + 1}, טור ${c + 1}`);
          cell.addEventListener('click', () => toggleCell(r, c));
        }
        el.append(cell);
      }
      const t = document.createElement('div');
      t.className = 'target row' + (showMatch && rs[r] === rowT[r] ? ' matched' : '');
      t.append(numNode(rowT[r], opts.unit, opts.kind));
      if (opts.interactive) t.setAttribute('aria-label', `יעד השורה ${r + 1}: ${numText(rowT[r])}${showMatch && rs[r] === rowT[r] ? ', מתאים' : ''}`);
      el.append(t);
    }
  }

  function render(focusIdx) {
    sizeCells();
    buildBoard(boardEl, state.values, state.keep, state.rowT, state.colT, { interactive: true });
    if (focusIdx != null) { const b = boardEl.querySelector(`[data-idx="${focusIdx}"]`); if (b) b.focus({ preventScroll: true }); }
  }

  function updateStatus() {
    $('levelValue').textContent = `${state.level + 1}/${LEVELS[mode].length}`;
    $('scoreValue').textContent = state.score;
    $('hintsValue').textContent = state.hints;
    hintBtn.disabled = state.hints <= 0 || busy;
  }

  function setMessage(text = '', type = '') {
    messageEl.textContent = text;
    messageEl.className = ('message ' + type).trim();
  }

  /* ---------------- צלילים (מתיקיית prisma) ---------------- */
  let current = null;
  function play(name) {
    if (muted) return;
    try {
      if (current) { current.pause(); current.currentTime = 0; }
      current = new Audio(SOUNDS[name]);
      current.volume = name === 'finish' ? 0.7 : 0.5;
      current.play().catch(() => {});
    } catch (e) { /* המשחק עובד גם בלי צליל */ }
  }
  function stopSound() { if (current) { current.pause(); current = null; } }

  /* ---------------- פעולות ---------------- */
  function toggleCell(r, c) {
    if (busy) return;
    const before = matchedFlags();
    state.keep[r][c] = !state.keep[r][c];
    const after = matchedFlags();
    render(r * state.size + c);
    const newly = after.some((m, i) => m && !before[i]);
    if (after.every(Boolean)) setMessage('כל השורות והטורים מתאימים! לחצו על "סיימתי".', 'success');
    else setMessage('');
    if (newly) play('success');
  }

  function resetBoard() {
    if (busy) return;
    state.keep = grid(state.size, () => true);
    setMessage('הלוח חזר למצב ההתחלה.');
    render();
  }

  function useHint() {
    if (busy || state.hints <= 0) return;
    const S = state.size;
    const wrong = [];
    for (let r = 0; r < S; r++) for (let c = 0; c < S; c++)
      if (state.keep[r][c] !== state.solution[r][c]) wrong.push([r, c]);
    if (!wrong.length) { setMessage('הלוח כבר פתור – לחצו על "סיימתי".', 'success'); return; }
    const toDelete = wrong.filter(([r, c]) => state.keep[r][c]); // עדיפות: מספר שצריך למחוק
    const [r, c] = pick(toDelete.length ? toDelete : wrong);
    state.hints--; state.hintsUsed++;
    const before = matchedFlags();
    state.keep[r][c] = state.solution[r][c];
    render();
    updateStatus();
    const cell = boardEl.querySelector(`[data-idx="${r * S + c}"]`);
    if (cell) cell.classList.add('flash');
    setMessage(`רמז: המספר ${numText(state.values[r][c])} (שורה ${r + 1}, טור ${c + 1}) ${state.keep[r][c] ? 'צריך להישאר' : 'צריך להימחק'}.`);
    if (matchedFlags().some((m, i) => m && !before[i])) play('success');
  }

  const stagePoints = () => Math.max(10, 30 - state.hintsUsed * 5);

  function done() {
    if (busy) return;
    if (!isSolved()) {
      play('error');
      setMessage('עדיין לא. בדקו את התרגילים המסומנים ב־✗.', 'error');
      openList(true);
      return;
    }
    busy = true;
    const pts = stagePoints();
    state.score += pts;
    updateStatus();
    setMessage('');
    play('finish');
    showStagePopup(state.level === LEVELS[mode].length - 1, pts);
  }

  function showStagePopup(last, pts) {
    $('stageIcon').src = last ? 'assets/trophy_rounded_rect.svg' : 'assets/star_rounded_rect.svg';
    $('stageTitle').textContent = last ? 'כל הכבוד! סיימתם את כל השלבים' : `שלב ${state.level + 1} הושלם!`;
    $('stageText').textContent = last
      ? `צברתם ${state.score} נקודות ב${mode === 'regular' ? 'רמה הרגילה' : 'רמה המתקדמת'}.`
      : `קיבלתם ${pts} נקודות. בשלב הבא מחכה לוח חדש${LEVELS[mode][state.level + 1].size > state.size ? ' וגדול יותר' : ''}.`;
    $('stageNextLabel').textContent = last ? 'משחק חדש' : 'לשלב הבא';
    $('stageNextIcon').src = last ? 'assets/restart_rounded_rect.svg' : 'assets/nav_forward_rounded_rect.svg';
    $('stageOverlay').hidden = false;
    $('stageNextBtn').focus();
    $('stageNextBtn').onclick = () => {
      $('stageOverlay').hidden = true;
      busy = false;
      stopSound();
      if (last) startGame(); else { state.level++; startLevel(); }
    };
  }

  function startLevel() {
    generate();
    render();
    updateStatus();
    setMessage(state.level === 0
      ? 'מחקו מספרים כך שסכום כל שורה וכל טור יהיה שווה ליעד.'
      : `שלב ${state.level + 1}: לוח חדש. בהצלחה!`);
  }

  function startGame() {
    state.level = 0;
    state.score = 0;
    busy = false;
    $('stageOverlay').hidden = true;
    stopSound();
    startLevel();
  }

  /* ---------------- רשימת התרגילים ---------------- */
  // 2 + 3 + (−3) + (−2) = 0 : מחוברים שליליים (מלבד הראשון) בסוגריים
  function op(ch) { return Object.assign(document.createElement('span'), { className: 'op', textContent: ch }); }
  function exerciseExpr(vals, total) {
    const span = document.createElement('span');
    span.className = 'm expr';
    span.dir = 'ltr';
    if (!vals.length) { span.textContent = '—'; return span; }
    vals.forEach((v, i) => {
      if (i > 0) span.append(op('+'));
      if (i > 0 && v < 0) {
        const g = Object.assign(document.createElement('span'), { className: 'paren' });
        g.append('(', numNode(v), ')');
        span.append(g);
      } else span.append(numNode(v));
    });
    span.append(op('='), numNode(total));
    return span;
  }

  function openList(fromDone = false) {
    const list = $('exerciseList');
    list.innerHTML = '';
    const S = state.size;
    let okCount = 0;
    lines(S).forEach(L => {
      const k = lineVals(state.keep, L);
      const vals = lineVals(state.values, L).filter((_, j) => k[j]);
      const target = L.type === 'row' ? state.rowT[L.i] : state.colT[L.i];
      const s = sum(vals);
      const ok = vals.length > 0 && s === target;
      if (ok) okCount++;
      const li = document.createElement('li');
      li.className = ok ? 'ok' : 'bad';
      const label = Object.assign(document.createElement('span'), { className: 'ex-label', textContent: `${L.type === 'row' ? 'שורה' : 'טור'} ${L.i + 1}` });
      const expr = Object.assign(document.createElement('span'), { className: 'ex-expr' });
      expr.append(exerciseExpr(vals, s));
      li.append(label, expr);
      if (!ok) {
        const tg = Object.assign(document.createElement('span'), { className: 'ex-target' });
        tg.append(document.createTextNode('היעד: '), numNode(target));
        li.append(tg);
      }
      const mark = Object.assign(document.createElement('span'), { className: 'ex-mark', textContent: ok ? '✓' : '✗' });
      mark.setAttribute('aria-label', ok ? 'נכון' : 'לא נכון');
      li.append(mark);
      list.append(li);
    });
    const total = 2 * S;
    const note = $('listNote');
    note.textContent = okCount === total
      ? `כל ${total} התרגילים נכונים!`
      : `${okCount} מתוך ${total} התרגילים נכונים.${fromDone ? ' תקנו את המסומנים ב־✗ ונסו שוב.' : ''}`;
    note.className = 'list-note ' + (okCount === total ? 'ok' : 'bad');
    $('listDialog').showModal();
  }

  /* ---------------- דוגמה פתורה (בעזרה) ---------------- */
  function buildExample() {
    const values = [[2, -4, 5], [-3, 6, 1], [4, -1, -2]];
    const sol = [[true, false, true], [true, true, false], [false, true, true]];
    const rowT = [7, 3, -3], colT = [-1, 5, 3];
    const o = { unit: 1, kind: 'int' };
    buildBoard($('exampleQ'), values, grid(3, () => true), rowT, colT, { ...o, live: false });
    buildBoard($('exampleA'), values, sol, rowT, colT, o);
    const ul = $('exampleLines');
    ul.innerHTML = '';
    [['שורה 1', [2, 5], 7], ['שורה 3', [-1, -2], -3], ['טור 1', [2, -3], -1], ['טור 2', [6, -1], 5]]
      .forEach(([lab, vals, s]) => {
        const li = document.createElement('li');
        const e = document.createElement('span'); e.className = 'm expr'; e.dir = 'ltr';
        vals.forEach((v, i) => {
          if (i) e.append(op('+'));
          const t = (v < 0 ? '−' : '') + Math.abs(v);
          if (i && v < 0) e.append(Object.assign(document.createElement('span'), { className: 'paren', textContent: `(${t})` }));
          else e.append(Object.assign(document.createElement('span'), { textContent: t }));
        });
        e.append(op('='), Object.assign(document.createElement('span'), { textContent: (s < 0 ? '−' : '') + Math.abs(s) }));
        const mk = Object.assign(document.createElement('span'), { className: 'ok-mark', textContent: '✓' });
        li.append(Object.assign(document.createElement('strong'), { textContent: lab + ':' }), e, mk);
        ul.append(li);
      });
  }

  /* ---------------- אירועים ---------------- */
  document.querySelectorAll('[data-mode]').forEach(btn => btn.addEventListener('click', () => {
    if (mode === btn.dataset.mode) return;
    mode = btn.dataset.mode;
    document.querySelectorAll('[data-mode]').forEach(b => {
      const sel = b.dataset.mode === mode;
      b.classList.toggle('selected', sel);
      b.setAttribute('aria-pressed', String(sel));
    });
    startGame();
  }));
  $('resetBtn').addEventListener('click', resetBoard);
  hintBtn.addEventListener('click', useHint);
  $('doneBtn').addEventListener('click', done);
  $('listBtn').addEventListener('click', () => openList(false));
  $('newGameBtn').addEventListener('click', startGame);
  $('helpBtn').addEventListener('click', () => $('helpDialog').showModal());
  $('soundBtn').addEventListener('click', () => {
    muted = !muted;
    if (muted) stopSound();
    $('soundImg').src = muted ? 'assets/mute_rounded_rect.svg' : 'assets/speaker_rounded_rect.svg';
    const label = muted ? 'הפעלת צליל' : 'השתקה';
    $('soundBtn').setAttribute('aria-pressed', String(muted));
    $('soundBtn').setAttribute('aria-label', label);
    $('soundBtn').title = label;
  });
  document.querySelectorAll('dialog').forEach(d => {
    d.querySelector('[data-close]').addEventListener('click', () => d.close());
    d.addEventListener('click', e => { if (e.target === d) d.close(); });
  });
  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(sizeCells, 120); });

  // לבדיקות אוטומטיות בלבד
  window.__ms = { state, LEVELS, countSolutions, isSolved, matchedFlags, setMode: m => { mode = m; }, generate };

  buildExample();
  startGame();
})();
