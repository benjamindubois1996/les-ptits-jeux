import EventBus     from '../../js/core/EventBus.js';
import ScoreService from '../../js/services/ScoreService.js';
import BaseGame     from '../../js/core/BaseGame.js';

export default class Sudoku extends BaseGame {

  constructor(config) {
    super(config);
    this.state          = this._buildFullState();
    this._timerInterval = null;
  }

  _gameId() { return 'sudoku'; }

  /* ============================================================
     CYCLE DE VIE
     ============================================================ */

  async init() {
    this._setupEventBusBindings();
    this._bindControls();
    this.state.status = 'idle';
    EventBus.emit('game:ready', { gameId: this._gameId() });
    EventBus.emit('game:tick',  { state: this.state, action: 'start' });
  }

  destroy() {
    super.destroy();
    this._stopTimer();
    this._unbindControls();
  }

  restart() {
    this._stopTimer();
    this.state = { ...this._buildFullState(), status: 'idle' };
    EventBus.emit('game:tick', { state: this.state, action: 'restart' });
  }

  _onPause()  { this._stopTimer(); }
  _onResume() { this._startTimer(); }

  /* ============================================================
     ACTIONS
     ============================================================ */

  start(options = {}) {
    this._stopTimer();
    const mode       = options.mode       ?? 'basique';
    const difficulty = options.difficulty ?? 'moyen';

    const solution = this._generateSolution();
    const grid     = this._createPuzzle(solution, difficulty);
    const given    = grid.map(row => row.map(v => v !== 0));

    this.state = {
      ...this._buildFullState(),
      status: 'playing',
      mode, difficulty,
      grid, solution, given,
    };

    this._startTimer();
    EventBus.emit('game:tick', { state: this.state, action: 'new-game' });
  }

  selectCell(row, col) {
    if (this.state.status !== 'playing') return;
    this.state.selected = { row, col };
    EventBus.emit('game:tick', { state: this.state, action: 'select' });
  }

  inputNumber(n) {
    const { state } = this;
    if (state.status !== 'playing') return;
    if (!state.selected) return;
    const { row, col } = state.selected;
    if (state.given[row][col]) return;

    if (n !== state.solution[row][col]) state.errors++;
    state.grid[row][col] = n;
    state.conflicts = [...this._computeConflicts(state.grid)];
    EventBus.emit('game:tick', { state, action: 'input' });

    if (state.conflicts.length === 0 && this._isComplete(state)) this._onWon();
  }

  clearCell() {
    const { state } = this;
    if (state.status !== 'playing') return;
    if (!state.selected) return;
    const { row, col } = state.selected;
    if (state.given[row][col]) return;

    state.grid[row][col] = 0;
    state.conflicts = [...this._computeConflicts(state.grid)];
    EventBus.emit('game:tick', { state, action: 'input' });
  }

  moveSelection(dRow, dCol) {
    const { state } = this;
    if (state.status !== 'playing') return;
    const cur = state.selected ?? { row: 0, col: 0 };
    state.selected = {
      row: Math.max(0, Math.min(8, cur.row + dRow)),
      col: Math.max(0, Math.min(8, cur.col + dCol)),
    };
    EventBus.emit('game:tick', { state, action: 'select' });
  }

  /* ============================================================
     TIMER
     ============================================================ */

  _startTimer() {
    this._timerInterval = setInterval(() => {
      if (this.state.status === 'playing') {
        this.state.timer++;
        EventBus.emit('game:tick', { state: this.state, action: 'timer' });
      }
    }, 1000);
  }

  _stopTimer() {
    if (this._timerInterval) { clearInterval(this._timerInterval); this._timerInterval = null; }
  }

  /* ============================================================
     VICTOIRE
     ============================================================ */

  _onWon() {
    this._stopTimer();
    const { state } = this;
    const cfg   = this.config.scoring;
    const score = Math.max(cfg.minScore, cfg.baseScore - state.timer * cfg.timePenalty);
    state.score  = score;
    state.status = 'won';
    ScoreService.submit('sudoku', score);
    EventBus.emit('game:won', {
      score,
      timer: state.timer,
      best:  ScoreService.getBest('sudoku'),
    });
  }

  /* ============================================================
     GÉNÉRATION DU SUDOKU
     ============================================================ */

  _generateSolution() {
    const grid = Array.from({ length: 9 }, () => Array(9).fill(0));
    this._fillGrid(grid);
    return grid;
  }

  _fillGrid(grid) {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (grid[r][c] !== 0) continue;
        const nums = this._shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9]);
        for (const n of nums) {
          if (this._canPlace(grid, r, c, n)) {
            grid[r][c] = n;
            if (this._fillGrid(grid)) return true;
            grid[r][c] = 0;
          }
        }
        return false;
      }
    }
    return true;
  }

  _createPuzzle(solution, difficulty) {
    const removals = this.config.gameplay.removals[difficulty];
    const puzzle   = solution.map(row => [...row]);
    const cells    = this._shuffled([...Array(81).keys()]);
    let removed    = 0;

    for (const idx of cells) {
      if (removed >= removals) break;
      const r = Math.floor(idx / 9);
      const c = idx % 9;
      const backup = puzzle[r][c];
      puzzle[r][c] = 0;

      if (this._countSolutions(puzzle.map(row => [...row]), 0, 0, 0) === 1) {
        removed++;
      } else {
        puzzle[r][c] = backup;
      }
    }

    return puzzle;
  }

  _countSolutions(grid, r, c, count) {
    if (count > 1) return count;
    if (r === 9)   return count + 1;
    const nr = c === 8 ? r + 1 : r;
    const nc = c === 8 ? 0     : c + 1;
    if (grid[r][c] !== 0) return this._countSolutions(grid, nr, nc, count);
    for (let n = 1; n <= 9; n++) {
      if (this._canPlace(grid, r, c, n)) {
        grid[r][c] = n;
        count = this._countSolutions(grid, nr, nc, count);
        grid[r][c] = 0;
        if (count > 1) return count;
      }
    }
    return count;
  }

  _canPlace(grid, row, col, n) {
    for (let i = 0; i < 9; i++) {
      if (grid[row][i] === n) return false;
      if (grid[i][col] === n) return false;
    }
    const br = Math.floor(row / 3) * 3;
    const bc = Math.floor(col / 3) * 3;
    for (let r = br; r < br + 3; r++) {
      for (let c = bc; c < bc + 3; c++) {
        if (grid[r][c] === n) return false;
      }
    }
    return true;
  }

  /* ============================================================
     CONFLITS & VICTOIRE
     ============================================================ */

  _computeConflicts(grid) {
    const conflicts = new Set();
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const n = grid[r][c];
        if (n === 0) continue;
        for (let i = 0; i < 9; i++) {
          if (i !== c && grid[r][i] === n) { conflicts.add(`${r},${c}`); conflicts.add(`${r},${i}`); }
          if (i !== r && grid[i][c] === n) { conflicts.add(`${r},${c}`); conflicts.add(`${i},${c}`); }
        }
        const br = Math.floor(r / 3) * 3;
        const bc = Math.floor(c / 3) * 3;
        for (let r2 = br; r2 < br + 3; r2++) {
          for (let c2 = bc; c2 < bc + 3; c2++) {
            if ((r2 !== r || c2 !== c) && grid[r2][c2] === n) {
              conflicts.add(`${r},${c}`); conflicts.add(`${r2},${c2}`);
            }
          }
        }
      }
    }
    return conflicts;
  }

  _isComplete(state) {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (state.grid[r][c] !== state.solution[r][c]) return false;
      }
    }
    return true;
  }

  /* ============================================================
     ÉTAT
     ============================================================ */

  _buildFullState() {
    return {
      status:     'loading',
      mode:       'basique',
      difficulty: 'moyen',
      grid:       [],
      solution:   [],
      given:      [],
      selected:   null,
      conflicts:  [],
      errors:     0,
      timer:      0,
      score:      0,
    };
  }

  /* ============================================================
     CONTRÔLES
     ============================================================ */

  _bindControls() {
    this._onKeyDown = (e) => {
      const keys = this.config.controls.keyboard;
      if (keys.restart.includes(e.code)) { e.preventDefault(); EventBus.emit('game:restart'); return; }
      if (keys.pause.includes(e.code))   { e.preventDefault(); EventBus.emit('game:pause-toggle'); return; }
      if (this.state.status !== 'playing') return;

      if (e.code === 'ArrowUp')              { e.preventDefault(); this.moveSelection(-1,  0); return; }
      if (e.code === 'ArrowDown')            { e.preventDefault(); this.moveSelection( 1,  0); return; }
      if (e.code === 'ArrowLeft')            { e.preventDefault(); this.moveSelection( 0, -1); return; }
      if (e.code === 'ArrowRight')           { e.preventDefault(); this.moveSelection( 0,  1); return; }
      if (e.code === 'Delete' || e.code === 'Backspace') { e.preventDefault(); this.clearCell(); return; }
      if (/^Digit[1-9]$/.test(e.code))      { e.preventDefault(); this.inputNumber(parseInt(e.code[5])); return; }
      if (/^Numpad[1-9]$/.test(e.code))     { e.preventDefault(); this.inputNumber(parseInt(e.code[6])); return; }
      if (/^[1-9]$/.test(e.key))            { e.preventDefault(); this.inputNumber(parseInt(e.key)); }
    };
    window.addEventListener('keydown', this._onKeyDown);
  }

  _unbindControls() {
    if (this._onKeyDown) window.removeEventListener('keydown', this._onKeyDown);
  }

  /* ============================================================
     UTILITAIRES
     ============================================================ */

  _shuffled(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}
