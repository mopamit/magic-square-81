(() => {
  'use strict';

  const SIZE = 4;
  const MAX_LEVEL = 3;
  const HINTS_PER_LEVEL = 3;

  const boardEl = document.getElementById('board');
  const levelEl = document.getElementById('levelValue');
  const scoreEl = document.getElementById('scoreValue');
  const hintsEl = document.getElementById('hintsValue');
  const messageEl = document.getElementById('message');
  const resetBtn = document.getElementById('resetBtn');
  const newGameBtn = document.getElementById('newGameBtn');
  const checkBtn = document.getElementById('checkBtn');
  const hintBtn = document.getElementById('hintBtn');

  const usedBoards = new Set();

  let state = {
    level: 1,
    score: 0,
    hints: HINTS_PER_LEVEL,
    values: [],
    solutionKeep: [],
    keep: [],
    rowTargets: [],
    colTargets: [],
    solved: false
  };

  const ranges = {
    1: { min: -5, max: 6, keepChance: 0.5, absTargetMax: 18 },
    2: { min: -8, max: 8, keepChance: 0.47, absTargetMax: 24 },
    3: { min: -12, max: 12, keepChance: 0.44, absTargetMax: 32 }
  };

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function sum(arr) {
    return arr.reduce((a, b) => a + b, 0);
  }

  function createKeepMask(level) {
    const chance = ranges[level].keepChance;
    let mask;
    let attempts = 0;

    do {
      mask = Array.from({ length: SIZE }, () =>
        Array.from({ length: SIZE }, () => Math.random() < chance)
      );
      attempts++;

      for (let r = 0; r < SIZE; r++) {
        if (!mask[r].some(Boolean)) mask[r][randInt(0, SIZE - 1)] = true;
        if (mask[r].every(Boolean)) mask[r][randInt(0, SIZE - 1)] = false;
      }

      for (let c = 0; c < SIZE; c++) {
        const col = mask.map(row => row[c]);
        if (!col.some(Boolean)) mask[randInt(0, SIZE - 1)][c] = true;
        if (col.every(Boolean)) mask[randInt(0, SIZE - 1)][c] = false;
      }
    } while (attempts < 20 && (mask.flat().filter(Boolean).length < 5 || mask.flat().filter(Boolean).length > 11));

    return mask;
  }

  function createValues(level) {
    const { min, max } = ranges[level];
    let values;
    let attempts = 0;

    do {
      values = Array.from({ length: SIZE }, () =>
        Array.from({ length: SIZE }, () => {
          let n = 0;
          while (n === 0) n = randInt(min, max);
          return n;
        })
      );
      attempts++;
    } while (
      attempts < 60 &&
      !hasEnoughSigns(values)
    );

    return values;
  }

  function hasEnoughSigns(values) {
    const flat = values.flat();
    const positives = flat.filter(v => v > 0).length;
    const negatives = flat.filter(v => v < 0).length;
    return positives >= 5 && negatives >= 5;
  }

  function boardSignature(values, rowTargets, colTargets) {
    return JSON.stringify({ values, rowTargets, colTargets });
  }

  function generatePuzzle(level) {
    const { absTargetMax } = ranges[level];
    let values, solutionKeep, rowTargets, colTargets, signature;
    let tries = 0;

    do {
      values = createValues(level);
      solutionKeep = createKeepMask(level);
      rowTargets = values.map((row, r) => sum(row.filter((_, c) => solutionKeep[r][c])));
      colTargets = Array.from({ length: SIZE }, (_, c) =>
        sum(values.map((row, r) => (solutionKeep[r][c] ? row[c] : 0)))
      );
      signature = boardSignature(values, rowTargets, colTargets);
      tries++;
    } while (
      tries < 300 && (
        rowTargets.some(v => Math.abs(v) > absTargetMax) ||
        colTargets.some(v => Math.abs(v) > absTargetMax) ||
        !rowTargets.some(v => v < 0) ||
        !colTargets.some(v => v < 0) ||
        usedBoards.has(signature)
      )
    );

    usedBoards.add(signature);
    state.values = values;
    state.solutionKeep = solutionKeep;
    state.keep = Array.from({ length: SIZE }, () => Array(SIZE).fill(true));
    state.rowTargets = rowTargets;
    state.colTargets = colTargets;
    state.solved = false;
  }

  function currentRowSums() {
    return state.values.map((row, r) => sum(row.filter((_, c) => state.keep[r][c])));
  }

  function currentColSums() {
    return Array.from({ length: SIZE }, (_, c) =>
      sum(state.values.map((row, r) => (state.keep[r][c] ? row[c] : 0)))
    );
  }

  function isSolved() {
    const rs = currentRowSums();
    const cs = currentColSums();
    return rs.every((v, i) => v === state.rowTargets[i]) && cs.every((v, i) => v === state.colTargets[i]);
  }

  function updateStatus() {
    levelEl.textContent = state.level;
    scoreEl.textContent = state.score;
    hintsEl.textContent = state.hints;
    hintBtn.disabled = state.hints <= 0 || state.solved;
    hintBtn.style.opacity = hintBtn.disabled ? '.55' : '1';
    hintBtn.style.cursor = hintBtn.disabled ? 'not-allowed' : 'pointer';
  }

  function setMessage(text = '', type = '') {
    messageEl.textContent = text;
    messageEl.className = `message ${type}`.trim();
  }

  function renderBoard(showValidation = false) {
    const rs = currentRowSums();
    const cs = currentColSums();
    boardEl.innerHTML = '';

    for (let c = 0; c < SIZE; c++) {
      const target = document.createElement('div');
      target.className = 'target column';
      const matches = cs[c] === state.colTargets[c];
      if (matches) {
        target.classList.add('matched');
      } else if (showValidation) {
        target.classList.add('bad');
      }
      target.textContent = state.colTargets[c];
      target.title = `יעד לטור ${c + 1}`;
      boardEl.appendChild(target);
    }

    const corner = document.createElement('div');
    corner.className = 'corner';
    boardEl.appendChild(corner);

    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = `cell${state.keep[r][c] ? '' : ' removed'}`;
        cell.textContent = state.values[r][c];
        cell.setAttribute('aria-label', `${state.keep[r][c] ? 'מחיקת' : 'החזרת'} המספר ${state.values[r][c]} בשורה ${r + 1}, טור ${c + 1}`);
        cell.dataset.row = r;
        cell.dataset.col = c;
        cell.addEventListener('click', () => toggleCell(r, c));
        boardEl.appendChild(cell);
      }

      const target = document.createElement('div');
      target.className = 'target row';
      const matches = rs[r] === state.rowTargets[r];
      if (matches) {
        target.classList.add('matched');
      } else if (showValidation) {
        target.classList.add('bad');
      }
      target.textContent = state.rowTargets[r];
      target.title = `יעד לשורה ${r + 1}`;
      boardEl.appendChild(target);
    }
  }

  function toggleCell(r, c) {
    if (state.solved) return;
    state.keep[r][c] = !state.keep[r][c];
    setMessage('');
    renderBoard(false);
  }

  function resetLevel() {
    state.keep = Array.from({ length: SIZE }, () => Array(SIZE).fill(true));
    state.solved = false;
    setMessage('הלוח הוחזר למצב ההתחלה.');
    renderBoard(false);
    updateStatus();
  }

  function startNewGame() {
    state.level = 1;
    state.score = 0;
    state.hints = HINTS_PER_LEVEL;
    generatePuzzle(state.level);
    setMessage('משחק חדש התחיל עם לוח חדש. בהצלחה!');
    renderBoard(false);
    updateStatus();
  }

  function nextLevel() {
    if (state.level < MAX_LEVEL) {
      state.level += 1;
      state.hints = HINTS_PER_LEVEL;
      generatePuzzle(state.level);
      setMessage(`מצוין! עברתם לשלב ${state.level}.`, 'success');
      renderBoard(false);
      updateStatus();
    } else {
      setMessage(`כל הכבוד! סיימתם את כל השלבים עם ${state.score} נקודות.`, 'success');
    }
  }

  function checkAnswer() {
    const solved = isSolved();
    renderBoard(true);

    if (solved) {
      if (!state.solved) {
        state.solved = true;
        state.score += Math.max(10, 30 - (HINTS_PER_LEVEL - state.hints) * 5);
        updateStatus();
        setMessage(state.level < MAX_LEVEL ? 'כל השורות והטורים נכונים! עוברים לשלב הבא…' : 'פתרון מושלם!', 'success');
        window.setTimeout(nextLevel, 950);
      }
    } else {
      setMessage('עדיין לא. היעדים האדומים מצביעים על שורות או טורים שדורשים תיקון.', 'error');
    }
  }

  function useHint() {
    if (state.hints <= 0 || state.solved) return;

    const candidates = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (state.keep[r][c] !== state.solutionKeep[r][c]) candidates.push([r, c]);
      }
    }

    if (!candidates.length) {
      setMessage('הבחירות שלכם כבר מתאימות לאחד הפתרונות. נסו לבדוק תשובות.', 'success');
      return;
    }

    const [r, c] = candidates[randInt(0, candidates.length - 1)];
    state.keep[r][c] = state.solutionKeep[r][c];
    state.hints -= 1;
    renderBoard(false);
    updateStatus();

    const cells = [...boardEl.querySelectorAll('.cell')];
    const index = r * SIZE + c;
    if (cells[index]) cells[index].classList.add('correct-flash');

    setMessage(`רמז: המספר ${state.values[r][c]} ${state.keep[r][c] ? 'צריך להישאר' : 'צריך להימחק'} מהלוח.`);
  }

  resetBtn.addEventListener('click', resetLevel);
  newGameBtn.addEventListener('click', startNewGame);
  checkBtn.addEventListener('click', checkAnswer);
  hintBtn.addEventListener('click', useHint);

  startNewGame();
})();
