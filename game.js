// === Fearsome Floor Helper - Game Logic ===

const ROWS = 12;
const COLS = 8;

// Directions: [rowDelta, colDelta]
const DIR = {
    up:    [-1,  0],
    down:  [ 1,  0],
    left:  [ 0, -1],
    right: [ 0,  1],
};

// Wall letters for wrapping (rows 0-11 map to letters M,L,K,J,I,H,G,F,E,D,C,B)
const ROW_LETTERS = ['M','L','K','J','I','H','G','F','E','D','C','B'];
// Column letters (cols 0-7 map to A,B,C,D,E,F,G,H)
const COL_LETTERS = ['A','B','C','D','E','F','G','H'];

// Monster movement deck
const MONSTER_DECK_TEMPLATE = [
    { value: 5,  label: '5',  type: 'steps' },
    { value: 7,  label: '7',  type: 'steps' },
    { value: 7,  label: '7',  type: 'steps' },
    { value: 8,  label: '8',  type: 'steps' },
    { value: 8,  label: '8',  type: 'steps' },
    { value: 10, label: '10', type: 'steps' },
    { value: 1,  label: '\u2020',  type: 'hit' },
    { value: 2,  label: '\u2020\u2020', type: 'hit' },
];

// Player colors
const PLAYER_COLORS = [
    '#e74c3c', // red
    '#3498db', // blue
    '#2ecc71', // green
    '#f39c12', // orange
    '#9b59b6', // purple
    '#1abc9c', // teal
    '#e91e63', // pink
];

// Token values: [sideA, sideB] where sideA + sideB = 7
const TOKEN_VALUES = [
    [6, 1],
    [4, 3],
    [3, 4],
    [2, 5],
];

// Cell types
const CELL_EMPTY      = 'empty';
const CELL_STONE      = 'stone';
const CELL_CRYSTAL    = 'crystal';
const CELL_TURN_RIGHT = 'turn-right';
const CELL_TURN_180   = 'turn-180';
const CELL_BLOOD      = 'blood';
const CELL_TELEPORTER = 'teleporter';

// === GAME STATE ===
const state = {
    board: [],
    players: [],
    monster: { row: 0, col: 0, dir: 'down' },
    monsterDeck: [],
    usedCards: [],
    currentCard: null,
    stepsLeft: 0,
    hitsLeft: 0,
    hitsNeeded: 0,
    turn: 1,
    stage: 1,
    cardsDrawn: 0,
    playerCount: 4,
    placeMode: 'select',
    selectedToken: null,
    teleporterPairs: [],
    teleporterPlacing: null,
    monsterPath: [],
    // Snapshot state
    snapshotPreviewCard: null,
    snapshotPredictedPath: null,
};

// === INITIALIZATION ===
function initBoard() {
    state.board = [];
    for (let r = 0; r < ROWS; r++) {
        state.board[r] = [];
        for (let c = 0; c < COLS; c++) {
            state.board[r][c] = CELL_EMPTY;
        }
    }
    state.teleporterPairs = [];
    state.teleporterPlacing = null;
}

function initPlayers(count) {
    state.players = [];
    const tokensPerPlayer = count <= 4 ? 4 : 3;
    const tokenSets = count <= 4
        ? TOKEN_VALUES
        : [TOKEN_VALUES[0], TOKEN_VALUES[2], TOKEN_VALUES[3]];

    for (let p = 0; p < count; p++) {
        const tokens = [];
        for (let t = 0; t < tokensPerPlayer; t++) {
            tokens.push({
                id: `p${p}t${t}`,
                player: p,
                sideA: tokenSets[t][0],
                sideB: tokenSets[t][1],
                currentSide: 0,
                row: -1,
                col: -1,
                onBoard: false,
                exited: false,
                eaten: false,
            });
        }
        state.players.push({
            id: p,
            color: PLAYER_COLORS[p],
            tokens,
            tokensExited: 0,
        });
    }
}

function initMonster() {
    state.monster = { row: 0, col: 0, dir: 'down' };
}

function initDeck() {
    state.monsterDeck = MONSTER_DECK_TEMPLATE.map((c, i) => ({ ...c, id: i, used: false }));
    state.usedCards = [];
    state.currentCard = null;
    state.stepsLeft = 0;
    state.hitsLeft = 0;
    state.hitsNeeded = 0;
    state.cardsDrawn = 0;
}

function newGame() {
    state.playerCount = parseInt(document.getElementById('player-count').value);
    state.turn = 1;
    state.stage = 1;
    state.monsterPath = [];
    state.selectedToken = null;

    initBoard();
    initPlayers(state.playerCount);
    initMonster();
    initDeck();

    placeDefaultSetup();

    clearLog();
    logEvent('New game started with ' + state.playerCount + ' players.', 'info');
    logEvent('Place your tokens on the board (bottom-right entrance).', 'info');
    logEvent('Monster starts at top-left, facing down.', 'monster');

    render();
}

function placeDefaultSetup() {
    const defaultStones = [
        [2, 3], [2, 5],
        [4, 1], [4, 6],
        [6, 2], [6, 4],
        [8, 3], [8, 5],
        [10, 1], [10, 6],
    ];
    defaultStones.forEach(([r, c]) => {
        state.board[r][c] = CELL_STONE;
    });
    state.board[5][3] = CELL_BLOOD;
    state.board[5][4] = CELL_BLOOD;
}

// === RENDERING ===
function render() {
    renderBoard();
    renderDeck();
    renderTurnInfo();
    renderPawnTray();
    renderSelectedIndicator();
    updateButtons();
}

function renderBoard() {
    const boardEl = document.getElementById('game-board');
    boardEl.innerHTML = '';

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.row = r;
            cell.dataset.col = c;

            if (r === 0 && c === 0) cell.classList.add('exit-cell');
            if (r === ROWS - 1 && c === COLS - 1) cell.classList.add('entrance-cell');

            // Monster path highlight
            const pathIdx = state.monsterPath.findIndex(p => p.row === r && p.col === c);
            if (pathIdx >= 0) {
                cell.classList.add('highlight-path');
            }

            // Cell content (tile)
            const tileType = state.board[r][c];
            if (tileType !== CELL_EMPTY) {
                const tileEl = document.createElement('div');
                tileEl.className = tileType;

                if (tileType === CELL_TURN_RIGHT) {
                    tileEl.textContent = '\u21B7';
                } else if (tileType === CELL_TURN_180) {
                    tileEl.textContent = '\u21BA';
                } else if (tileType === CELL_TELEPORTER) {
                    const pairIdx = getTeleporterPairIndex(r, c);
                    tileEl.textContent = pairIdx >= 0 ? String.fromCharCode(65 + pairIdx) : '?';
                }

                cell.appendChild(tileEl);
            }

            // Player tokens
            const tokensHere = getTokensAt(r, c);
            tokensHere.forEach(token => {
                const tokenEl = document.createElement('div');
                tokenEl.className = 'player-token';
                tokenEl.style.backgroundColor = state.players[token.player].color;
                const val = token.currentSide === 0 ? token.sideA : token.sideB;
                tokenEl.textContent = val;

                if (state.selectedToken && state.selectedToken.id === token.id) {
                    cell.classList.add('selected');
                }

                cell.appendChild(tokenEl);
            });

            // Monster
            if (state.monster.row === r && state.monster.col === c) {
                const monsterEl = document.createElement('div');
                monsterEl.className = 'monster';
                monsterEl.textContent = '\uD83D\uDC7E';

                const dirEl = document.createElement('span');
                dirEl.className = 'monster-direction ' + state.monster.dir;
                const dirArrows = { up: '\u25B2', down: '\u25BC', left: '\u25C0', right: '\u25B6' };
                dirEl.textContent = dirArrows[state.monster.dir];
                monsterEl.appendChild(dirEl);

                cell.appendChild(monsterEl);
            }

            cell.addEventListener('click', () => onCellClick(r, c));
            boardEl.appendChild(cell);
        }
    }
}

function renderDeck() {
    const deckEl = document.querySelector('.deck-cards');
    deckEl.innerHTML = '';

    state.monsterDeck.forEach((card, idx) => {
        const cardEl = document.createElement('div');
        cardEl.className = 'deck-card';
        if (card.used) cardEl.classList.add('used');
        if (card.type === 'hit') cardEl.classList.add('hit');
        cardEl.textContent = card.label;
        cardEl.addEventListener('click', () => {
            if (!card.used) useCard(idx);
        });
        deckEl.appendChild(cardEl);
    });
}

function renderTurnInfo() {
    document.getElementById('turn-number').textContent = state.turn;
    document.getElementById('stage-number').textContent = state.stage;
    document.getElementById('current-card').textContent = state.currentCard
        ? state.currentCard.label : '-';
    document.getElementById('steps-left').textContent = state.stepsLeft;
}

function updateButtons() {
    const hasSteps = state.stepsLeft > 0;
    document.getElementById('btn-step-monster').disabled = !hasSteps;
    document.getElementById('btn-auto-monster').disabled = !hasSteps;
}

// === PAWN TRAY ===
function renderPawnTray() {
    const tray = document.getElementById('pawn-tray');
    tray.innerHTML = '';

    state.players.forEach((player, pIdx) => {
        const row = document.createElement('div');
        row.className = 'pawn-row';

        // Player color indicator + label
        const label = document.createElement('div');
        label.className = 'pawn-player-label';
        label.style.backgroundColor = player.color;
        label.textContent = `P${pIdx + 1}`;
        row.appendChild(label);

        // Token slots
        const slots = document.createElement('div');
        slots.className = 'pawn-slots';

        player.tokens.forEach(token => {
            const slot = document.createElement('div');
            slot.className = 'pawn-slot';

            const circle = document.createElement('div');
            circle.className = 'pawn-circle';
            circle.style.backgroundColor = player.color;

            const val = token.currentSide === 0 ? token.sideA : token.sideB;

            if (token.exited) {
                slot.classList.add('exited');
                circle.textContent = '\u2713';
                circle.title = `${token.sideA}/${token.sideB} - Exited!`;
            } else if (token.eaten) {
                slot.classList.add('dead');
                circle.textContent = '\u2716';
                circle.title = `${token.sideA}/${token.sideB} - Permanently eaten`;
            } else if (token.onBoard) {
                slot.classList.add('on-board');
                circle.textContent = val;
                circle.title = `${token.sideA}/${token.sideB} - On board at (${ROW_LETTERS[token.row]}${COL_LETTERS[token.col]})`;
                // Clicking picks it up from the board
                slot.addEventListener('click', () => {
                    selectTokenFromTray(token);
                });
            } else {
                // Available to place
                slot.classList.add('available');
                circle.textContent = val;
                circle.title = `${token.sideA}/${token.sideB} - Click to place on board`;
                slot.addEventListener('click', () => {
                    selectTokenFromTray(token);
                });
            }

            // Highlight if selected
            if (state.selectedToken && state.selectedToken.id === token.id) {
                slot.classList.add('selected');
            }

            // Side indicator
            const sideTag = document.createElement('span');
            sideTag.className = 'pawn-side-tag';
            if (!token.exited && !token.eaten) {
                sideTag.textContent = `${token.sideA}/${token.sideB}`;
            }

            slot.appendChild(circle);
            slot.appendChild(sideTag);
            slots.appendChild(slot);
        });

        row.appendChild(slots);
        tray.appendChild(row);
    });
}

function renderSelectedIndicator() {
    const el = document.getElementById('selected-indicator');
    if (!state.selectedToken) {
        el.innerHTML = '';
        el.style.display = 'none';
        return;
    }

    el.style.display = 'flex';
    const token = state.selectedToken;
    const player = state.players[token.player];
    const val = token.currentSide === 0 ? token.sideA : token.sideB;

    const dot = document.createElement('span');
    dot.className = 'indicator-dot';
    dot.style.backgroundColor = player.color;
    dot.textContent = val;

    const text = document.createElement('span');
    text.className = 'indicator-text';
    if (token.onBoard) {
        text.textContent = `P${token.player + 1} (${token.sideA}/${token.sideB}) selected - click board to move (max ${val} spaces)`;
    } else {
        text.textContent = `P${token.player + 1} (${token.sideA}/${token.sideB}) selected - click an empty cell to place`;
    }

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'indicator-cancel';
    cancelBtn.textContent = '\u2716';
    cancelBtn.title = 'Deselect';
    cancelBtn.addEventListener('click', () => {
        state.selectedToken = null;
        render();
    });

    el.innerHTML = '';
    el.appendChild(dot);
    el.appendChild(text);
    el.appendChild(cancelBtn);
}

function selectTokenFromTray(token) {
    if (token.exited || token.eaten) return;

    state.selectedToken = token;

    // Auto-switch to select mode so board clicks place/move the token
    state.placeMode = 'select';
    document.querySelectorAll('.place-btn').forEach(b => b.classList.remove('active'));
    const selectBtn = document.querySelector('.place-btn[data-place="select"]');
    if (selectBtn) selectBtn.classList.add('active');

    if (token.onBoard) {
        logEvent(`Selected ${getTokenLabel(token)} on board at (${ROW_LETTERS[token.row]}${COL_LETTERS[token.col]}). Click a cell to move it.`, 'info');
    } else {
        logEvent(`Selected ${getTokenLabel(token)} from tray. Click a cell to place it on the board.`, 'info');
    }
    render();
}

// === CELL CLICK HANDLER ===
function onCellClick(row, col) {
    const mode = state.placeMode;

    if (mode === 'select') {
        handleSelect(row, col);
    } else if (mode === 'monster') {
        handleMonsterPlace(row, col);
    } else if (mode === 'erase') {
        handleErase(row, col);
    } else if (mode === 'teleporter') {
        handleTeleporterPlace(row, col);
    } else {
        handleTilePlace(row, col, mode);
    }

    render();
}

function handleSelect(row, col) {
    // If we have a selected token and click an empty(ish) cell, place/move it there
    if (state.selectedToken) {
        const token = state.selectedToken;
        // Clicking the same cell as the token = deselect
        if (token.onBoard && token.row === row && token.col === col) {
            state.selectedToken = null;
            logEvent(`Deselected ${getTokenLabel(token)}.`, 'info');
            return;
        }

        if (token.onBoard) {
            // Move existing token on board
            const maxMove = token.currentSide === 0 ? token.sideA : token.sideB;
            const dist = Math.abs(token.row - row) + Math.abs(token.col - col);

            if (dist <= maxMove && isValidPlayerMove(token, row, col)) {
                moveToken(token, row, col);
            } else {
                logEvent(`Invalid move. Max ${maxMove} spaces orthogonally.`, 'info');
            }
        } else {
            // Place unplaced token on board
            if (isMonsterAt(row, col)) {
                logEvent('Cannot place a pawn on the monster!', 'info');
                return;
            }
            const tile = state.board[row][col];
            if (tile === CELL_STONE || tile === CELL_CRYSTAL || tile === CELL_TURN_RIGHT ||
                tile === CELL_TURN_180 || tile === CELL_TELEPORTER) {
                logEvent('Cannot place a pawn on that tile.', 'info');
                return;
            }
            token.row = row;
            token.col = col;
            token.onBoard = true;
            logEvent(`${getTokenLabel(token)} placed at ${ROW_LETTERS[row]}${COL_LETTERS[col]}.`, 'info');
            flipToken(token);
            state.selectedToken = null;
        }
        return;
    }

    // No token selected - check if clicking a token on the board
    const tokens = getTokensAt(row, col);
    if (tokens.length > 0) {
        state.selectedToken = tokens[0];
        logEvent(`Selected ${getTokenLabel(tokens[0])} at ${ROW_LETTERS[row]}${COL_LETTERS[col]}.`, 'info');
        return;
    }
}

function handleMonsterPlace(row, col) {
    const tile = state.board[row][col];
    if (tile === CELL_STONE || tile === CELL_CRYSTAL) {
        logEvent('Cannot place monster on a stone.', 'info');
        return;
    }
    state.monster.row = row;
    state.monster.col = col;
    logEvent(`Monster placed at ${ROW_LETTERS[row]}${COL_LETTERS[col]}, facing ${state.monster.dir}.`, 'monster');
}

function handleErase(row, col) {
    // Remove pawn first if present
    const tokens = getTokensAt(row, col);
    if (tokens.length > 0) {
        const token = tokens[0];
        token.onBoard = false;
        token.row = -1;
        token.col = -1;
        logEvent(`${getTokenLabel(token)} removed from board.`, 'info');
        return;
    }

    if (state.board[row][col] !== CELL_EMPTY) {
        if (state.board[row][col] === CELL_TELEPORTER) {
            removeTeleporterAt(row, col);
        }
        state.board[row][col] = CELL_EMPTY;
        logEvent(`Cleared tile at (${row},${col}).`, 'info');
    }
}

function handleTilePlace(row, col, type) {
    if (state.board[row][col] === CELL_EMPTY && !isMonsterAt(row, col) && getTokensAt(row, col).length === 0) {
        state.board[row][col] = type;
        logEvent(`Placed ${type} at (${row},${col}).`, 'info');
    }
}

function handleTeleporterPlace(row, col) {
    if (state.board[row][col] !== CELL_EMPTY) return;

    if (!state.teleporterPlacing) {
        state.board[row][col] = CELL_TELEPORTER;
        state.teleporterPlacing = { row, col };
        logEvent(`Teleporter A placed at (${row},${col}). Click for matching pad.`, 'info');
    } else {
        const tp = state.teleporterPlacing;
        const dist = Math.abs(tp.row - row) + Math.abs(tp.col - col);
        if (dist <= 1) {
            logEvent('Teleporters cannot be adjacent! Choose a different space.', 'info');
            return;
        }
        state.board[row][col] = CELL_TELEPORTER;
        state.teleporterPairs.push({
            row1: tp.row, col1: tp.col,
            row2: row, col2: col
        });
        state.teleporterPlacing = null;
        logEvent(`Teleporter pair linked: (${tp.row},${tp.col}) <-> (${row},${col}).`, 'info');
    }
}

// === PLAYER MOVEMENT ===
function moveToken(token, toRow, toCol) {
    if (toRow === 0 && toCol === 0) {
        token.onBoard = false;
        token.exited = true;
        token.row = -1;
        token.col = -1;
        state.players[token.player].tokensExited++;
        logEvent(`${getTokenLabel(token)} has EXITED the dungeon!`, 'info');
        checkWinCondition(token.player);
    } else {
        token.row = toRow;
        token.col = toCol;

        if (state.board[toRow][toCol] === CELL_BLOOD) {
            logEvent(`${getTokenLabel(token)} slides on blood pool!`, 'info');
        }

        logEvent(`${getTokenLabel(token)} moved to ${ROW_LETTERS[toRow]}${COL_LETTERS[toCol]}.`, 'info');
    }

    flipToken(token);
    state.selectedToken = null;
}

function flipToken(token) {
    token.currentSide = token.currentSide === 0 ? 1 : 0;
}

function isValidPlayerMove(token, toRow, toCol) {
    if (toRow < 0 || toRow >= ROWS || toCol < 0 || toCol >= COLS) return false;
    const tokensAtDest = getTokensAt(toRow, toCol);
    if (tokensAtDest.length > 0 && !(toRow === 0 && toCol === 0)) return false;
    if (isMonsterAt(toRow, toCol)) return false;
    if (state.board[toRow][toCol] === CELL_TELEPORTER) return false;
    return true;
}

function checkWinCondition(playerIdx) {
    const player = state.players[playerIdx];
    const needed = state.playerCount <= 4 ? 3 : 2;
    if (player.tokensExited >= needed) {
        logEvent(`PLAYER ${playerIdx + 1} WINS! ${player.tokensExited} tokens escaped!`, 'eaten');
    }
}

// === MONSTER MOVEMENT ===
function useCard(cardIdx) {
    const card = state.monsterDeck[cardIdx];
    if (card.used) return;

    card.used = true;
    state.currentCard = card;
    state.cardsDrawn++;
    state.monsterPath = [];

    if (card.type === 'steps') {
        state.stepsLeft = card.value;
        state.hitsNeeded = 0;
        logEvent(`Monster card: ${card.label} (${card.value} steps)`, 'monster');
    } else {
        state.stepsLeft = 20;
        state.hitsLeft = card.value;
        state.hitsNeeded = card.value;
        logEvent(`Monster card: ${card.label} (move until ${card.value} hit(s), max 20 steps)`, 'monster');
    }

    if (state.cardsDrawn === 7) {
        state.stage = 2;
        logEvent('STAGE 2 begins! Eaten tokens are now permanently removed!', 'eaten');
    }

    if (state.cardsDrawn === 8) {
        state.monsterDeck.forEach(c => c.used = false);
        state.cardsDrawn = 0;
        state.turn++;
        logEvent(`Deck reshuffled. Turn ${state.turn}.`, 'info');
    }

    render();
}

function drawRandomCard() {
    const available = state.monsterDeck.filter(c => !c.used);
    if (available.length === 0) {
        logEvent('All cards used! Deck reshuffles.', 'info');
        state.monsterDeck.forEach(c => c.used = false);
        state.cardsDrawn = 0;
        state.turn++;
        const available2 = state.monsterDeck.filter(c => !c.used);
        const idx = Math.floor(Math.random() * available2.length);
        useCard(state.monsterDeck.indexOf(available2[idx]));
        return;
    }
    const pick = available[Math.floor(Math.random() * available.length)];
    useCard(state.monsterDeck.indexOf(pick));
}

function stepMonster() {
    if (state.stepsLeft <= 0) return;
    if (state.hitsNeeded > 0 && state.hitsLeft <= 0) {
        state.stepsLeft = 0;
        render();
        return;
    }

    const monster = state.monster;
    const result = monsterLookAndDecide(monster);

    logEvent(`Monster at (${monster.row},${monster.col}) facing ${monster.dir}: ${result.reason}`, 'monster');

    monster.dir = result.newDir;

    const [dr, dc] = DIR[monster.dir];
    let newRow = monster.row + dr;
    let newCol = monster.col + dc;

    const currentTile = state.board[monster.row][monster.col];
    if (currentTile === CELL_TURN_RIGHT || currentTile === CELL_TURN_180) {
        if (result.reason.includes('no target') || result.reason.includes('confused')) {
            if (currentTile === CELL_TURN_RIGHT) {
                monster.dir = turnRight(monster.dir);
                logEvent(`Turning stone: monster turns RIGHT, now facing ${monster.dir}`, 'monster');
            } else {
                monster.dir = turn180(monster.dir);
                logEvent(`Turning stone: monster turns 180\u00B0, now facing ${monster.dir}`, 'monster');
            }
            const [dr2, dc2] = DIR[monster.dir];
            newRow = monster.row + dr2;
            newCol = monster.col + dc2;
        }
    }

    if (newRow < 0 || newRow >= ROWS || newCol < 0 || newCol >= COLS) {
        const wrapped = wrapPosition(newRow, newCol, monster.dir);
        newRow = wrapped.row;
        newCol = wrapped.col;
        logEvent(`Monster wraps through wall to (${newRow},${newCol})`, 'monster');
    }

    const targetTile = state.board[newRow] && state.board[newRow][newCol];
    if (targetTile === CELL_STONE || targetTile === CELL_CRYSTAL) {
        const pushResult = pushStone(newRow, newCol, monster.dir);
        if (!pushResult) {
            logEvent(`Monster pushes stone at (${newRow},${newCol}) but it can't move.`, 'monster');
        } else {
            logEvent(`Monster pushes stone from (${newRow},${newCol})`, 'monster');
        }
    }

    if (state.board[newRow] && state.board[newRow][newCol] === CELL_BLOOD) {
        logEvent(`Monster slides on blood pool at (${newRow},${newCol})!`, 'monster');
        const slideResult = slideOnBlood(newRow, newCol, monster.dir);
        newRow = slideResult.row;
        newCol = slideResult.col;
    }

    if (state.board[newRow] && state.board[newRow][newCol] === CELL_TELEPORTER) {
        const dest = getMatchingTeleporter(newRow, newCol);
        if (dest) {
            logEvent(`Monster teleports from (${newRow},${newCol}) to (${dest.row},${dest.col})!`, 'monster');
            newRow = dest.row;
            newCol = dest.col;
        }
    }

    monster.row = newRow;
    monster.col = newCol;
    state.monsterPath.push({ row: newRow, col: newCol });
    state.stepsLeft--;

    const caughtTokens = getTokensAt(newRow, newCol);
    caughtTokens.forEach(token => {
        eatToken(token);
        if (state.hitsNeeded > 0) {
            state.hitsLeft--;
            if (state.hitsLeft <= 0) {
                state.stepsLeft = 0;
            }
        }
    });

    if (state.stepsLeft <= 0) {
        logEvent('Monster movement complete.', 'monster');
        state.currentCard = null;
    }

    render();
}

function autoMoveMonster() {
    const delay = 400;
    function doStep() {
        if (state.stepsLeft > 0) {
            stepMonster();
            setTimeout(doStep, delay);
        }
    }
    doStep();
}

// === MONSTER AI: LOOK AND DECIDE ===
function monsterLookAndDecide(monster) {
    const ahead = monster.dir;
    const leftDir = turnLeft(ahead);
    const rightDir = turnRight90(ahead);

    const aheadTarget = lookInDirection(monster.row, monster.col, ahead);
    const leftTarget  = lookInDirection(monster.row, monster.col, leftDir);
    const rightTarget = lookInDirection(monster.row, monster.col, rightDir);

    const candidates = [];
    if (aheadTarget) candidates.push({ dir: ahead, dist: aheadTarget.dist, target: aheadTarget });
    if (leftTarget)  candidates.push({ dir: leftDir, dist: leftTarget.dist, target: leftTarget });
    if (rightTarget) candidates.push({ dir: rightDir, dist: rightTarget.dist, target: rightTarget });

    if (candidates.length === 0) {
        return { newDir: ahead, reason: 'no target visible, continuing straight' };
    }

    const minDist = Math.min(...candidates.map(c => c.dist));
    const closest = candidates.filter(c => c.dist === minDist);

    if (closest.length === 1) {
        return {
            newDir: closest[0].dir,
            reason: `sees target at distance ${closest[0].dist} to the ${closest[0].dir}, turning ${closest[0].dir}`
        };
    }

    return {
        newDir: ahead,
        reason: `confused (${closest.length} targets at distance ${minDist}), continuing straight`
    };
}

function lookInDirection(fromRow, fromCol, dir) {
    const [dr, dc] = DIR[dir];
    let r = fromRow + dr;
    let c = fromCol + dc;
    let dist = 1;

    while (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
        const tile = state.board[r][c];

        if (tile === CELL_STONE || tile === CELL_TURN_RIGHT || tile === CELL_TURN_180) {
            return null;
        }

        const tokens = getTokensAt(r, c);
        if (tokens.length > 0) {
            return { row: r, col: c, dist, token: tokens[0] };
        }

        r += dr;
        c += dc;
        dist++;
    }

    return null;
}

// === STONE PUSHING ===
function pushStone(stoneRow, stoneCol, dir) {
    const [dr, dc] = DIR[dir];
    const behindRow = stoneRow + dr;
    const behindCol = stoneCol + dc;

    if (behindRow < 0 || behindRow >= ROWS || behindCol < 0 || behindCol >= COLS) {
        state.board[stoneRow][stoneCol] = CELL_EMPTY;
        logEvent(`Stone pushed off the board from (${stoneRow},${stoneCol})!`, 'monster');
        return true;
    }

    const behindTile = state.board[behindRow][behindCol];

    if (behindTile === CELL_BLOOD) {
        state.board[stoneRow][stoneCol] = CELL_EMPTY;
        const slideEnd = slideOnBlood(behindRow, behindCol, dir);
        if (state.board[slideEnd.row][slideEnd.col] === CELL_EMPTY) {
            state.board[slideEnd.row][slideEnd.col] = state.board[stoneRow][stoneCol] === CELL_CRYSTAL ? CELL_CRYSTAL : CELL_STONE;
        }
        return true;
    }

    if (behindTile !== CELL_EMPTY) {
        const crushed = getTokensAt(behindRow, behindCol);
        crushed.forEach(t => eatToken(t));
        return false;
    }

    state.board[behindRow][behindCol] = state.board[stoneRow][stoneCol];
    state.board[stoneRow][stoneCol] = CELL_EMPTY;

    const crushed = getTokensAt(behindRow, behindCol);
    crushed.forEach(t => {
        eatToken(t);
        logEvent(`${getTokenLabel(t)} crushed by pushed stone!`, 'eaten');
    });

    return true;
}

// === BLOOD POOL SLIDING ===
function slideOnBlood(row, col, dir) {
    const [dr, dc] = DIR[dir];
    let r = row;
    let c = col;

    while (r >= 0 && r < ROWS && c >= 0 && c < COLS && state.board[r][c] === CELL_BLOOD) {
        r += dr;
        c += dc;
    }

    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) {
        return { row: r - dr, col: c - dc };
    }

    if (state.board[r][c] !== CELL_EMPTY && state.board[r][c] !== CELL_BLOOD) {
        return { row: r - dr, col: c - dc };
    }

    return { row: r, col: c };
}

// === EATING ===
function eatToken(token) {
    if (!token.onBoard) return;

    logEvent(`${getTokenLabel(token)} has been EATEN by the monster!`, 'eaten');
    token.onBoard = false;

    if (state.stage === 1) {
        token.row = -1;
        token.col = -1;
        token.currentSide = 0;
        logEvent(`${getTokenLabel(token)} returns to entrance (Stage 1).`, 'info');
    } else {
        token.eaten = true;
        token.row = -1;
        token.col = -1;
        logEvent(`${getTokenLabel(token)} permanently removed (Stage 2)!`, 'eaten');
    }
}

// === WALL WRAPPING ===
function wrapPosition(row, col, dir) {
    if (dir === 'up' && row < 0) return { row: ROWS - 1, col };
    if (dir === 'down' && row >= ROWS) return { row: 0, col };
    if (dir === 'left' && col < 0) return { row, col: COLS - 1 };
    if (dir === 'right' && col >= COLS) return { row, col: 0 };
    return { row, col };
}

// === TELEPORTER ===
function getMatchingTeleporter(row, col) {
    for (const pair of state.teleporterPairs) {
        if (pair.row1 === row && pair.col1 === col) return { row: pair.row2, col: pair.col2 };
        if (pair.row2 === row && pair.col2 === col) return { row: pair.row1, col: pair.col1 };
    }
    return null;
}

function getTeleporterPairIndex(row, col) {
    for (let i = 0; i < state.teleporterPairs.length; i++) {
        const pair = state.teleporterPairs[i];
        if ((pair.row1 === row && pair.col1 === col) ||
            (pair.row2 === row && pair.col2 === col)) return i;
    }
    return -1;
}

function removeTeleporterAt(row, col) {
    const idx = getTeleporterPairIndex(row, col);
    if (idx >= 0) {
        const pair = state.teleporterPairs[idx];
        if (pair.row1 === row && pair.col1 === col) {
            state.board[pair.row2][pair.col2] = CELL_EMPTY;
        } else {
            state.board[pair.row1][pair.col1] = CELL_EMPTY;
        }
        state.teleporterPairs.splice(idx, 1);
    }
    if (state.teleporterPlacing &&
        state.teleporterPlacing.row === row &&
        state.teleporterPlacing.col === col) {
        state.teleporterPlacing = null;
    }
}

// === DIRECTION HELPERS ===
function turnLeft(dir) {
    const order = ['up', 'left', 'down', 'right'];
    return order[(order.indexOf(dir) + 1) % 4];
}

function turnRight(dir) {
    const order = ['up', 'right', 'down', 'left'];
    return order[(order.indexOf(dir) + 1) % 4];
}

function turnRight90(dir) {
    const order = ['up', 'right', 'down', 'left'];
    return order[(order.indexOf(dir) + 1) % 4];
}

function turn180(dir) {
    const map = { up: 'down', down: 'up', left: 'right', right: 'left' };
    return map[dir];
}

// === UTILITY ===
function getTokensAt(row, col) {
    const result = [];
    state.players.forEach(p => {
        p.tokens.forEach(t => {
            if (t.onBoard && t.row === row && t.col === col) result.push(t);
        });
    });
    return result;
}

function getAllUnplacedTokens() {
    const result = [];
    state.players.forEach(p => {
        p.tokens.forEach(t => {
            if (!t.onBoard && !t.exited && !t.eaten) result.push(t);
        });
    });
    return result;
}

function isMonsterAt(row, col) {
    return state.monster.row === row && state.monster.col === col;
}

function getTokenLabel(token) {
    return `P${token.player + 1}(${token.sideA}/${token.sideB})`;
}

// === LOGGING ===
function logEvent(message, type) {
    const logEl = document.getElementById('event-log');
    const entry = document.createElement('div');
    entry.className = 'log-entry ' + (type || '');
    entry.textContent = message;
    logEl.insertBefore(entry, logEl.firstChild);
    while (logEl.children.length > 100) logEl.removeChild(logEl.lastChild);
}

function clearLog() {
    document.getElementById('event-log').innerHTML = '';
}

// =====================================================
// === SNAPSHOT & PREDICT SYSTEM (Canvas Rendering) ===
// =====================================================

const SNAP_CELL = 56; // px per cell in snapshot
const SNAP_PAD = 28;  // label margin
const SNAP_CANVAS_W = SNAP_PAD + COLS * SNAP_CELL + SNAP_PAD;
const SNAP_CANVAS_H = SNAP_PAD + ROWS * SNAP_CELL + SNAP_PAD;

// Colors for canvas drawing
const C = {
    bg:       '#1a1a2e',
    cellBg:   '#2a2a3e',
    grid:     '#111',
    exit:     '#2ecc71',
    entrance: '#e67e22',
    stone:    '#666',
    stoneBdr: '#888',
    crystal:  '#64b4ff',
    crystBdr: '#8ad4ff',
    turnR:    '#a88932',
    turnRBg:  '#5a4a2a',
    turn180:  '#cc4444',
    turn180Bg:'#4a2a2a',
    blood1:   '#8b0000',
    blood2:   '#cc0000',
    tele1:    '#9b59b6',
    tele2:    '#6c3483',
    teleBdr:  '#bb77dd',
    monster:  '#e94560',
    monsterBg:'#222',
    text:     '#eee',
    textDim:  '#aaa',
    pathLine: '#e94560',
    pathDot:  '#ff6b81',
    pathStart:'#f1c40f',
    eatX:     '#ff0000',
};

/** Render the current board state onto a canvas and return the canvas element. */
function renderBoardToCanvas(predictedPath, predictedEvents) {
    const canvas = document.createElement('canvas');
    canvas.width = SNAP_CANVAS_W;
    canvas.height = SNAP_CANVAS_H;
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid background
    ctx.fillStyle = C.grid;
    ctx.fillRect(SNAP_PAD, SNAP_PAD, COLS * SNAP_CELL, ROWS * SNAP_CELL);

    // Labels
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.textDim;

    for (let c = 0; c < COLS; c++) {
        const x = SNAP_PAD + c * SNAP_CELL + SNAP_CELL / 2;
        ctx.fillText(COL_LETTERS[c], x, SNAP_PAD / 2);
        ctx.fillText(COL_LETTERS[c], x, SNAP_PAD + ROWS * SNAP_CELL + SNAP_PAD / 2);
    }
    for (let r = 0; r < ROWS; r++) {
        const y = SNAP_PAD + r * SNAP_CELL + SNAP_CELL / 2;
        ctx.fillText(ROW_LETTERS[r], SNAP_PAD / 2, y);
        ctx.fillText(ROW_LETTERS[r], SNAP_PAD + COLS * SNAP_CELL + SNAP_PAD / 2, y);
    }

    // Draw cells
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const x = SNAP_PAD + c * SNAP_CELL + 1;
            const y = SNAP_PAD + r * SNAP_CELL + 1;
            const w = SNAP_CELL - 2;
            const h = SNAP_CELL - 2;

            // Cell background
            if (r === 0 && c === 0) {
                ctx.fillStyle = '#1a5c2a';
                ctx.fillRect(x, y, w, h);
                ctx.strokeStyle = C.exit;
                ctx.lineWidth = 2;
                ctx.strokeRect(x, y, w, h);
            } else if (r === ROWS - 1 && c === COLS - 1) {
                ctx.fillStyle = '#5c3a1a';
                ctx.fillRect(x, y, w, h);
                ctx.strokeStyle = C.entrance;
                ctx.lineWidth = 2;
                ctx.strokeRect(x, y, w, h);
            } else {
                ctx.fillStyle = C.cellBg;
                ctx.fillRect(x, y, w, h);
            }

            // Tile
            const tile = state.board[r][c];
            const cx = x + w / 2;
            const cy = y + h / 2;
            const tw = w * 0.8;
            const th = h * 0.8;
            const tx = cx - tw / 2;
            const ty = cy - th / 2;

            if (tile === CELL_STONE) {
                ctx.fillStyle = C.stone;
                roundRect(ctx, tx, ty, tw, th, 4);
                ctx.fill();
                ctx.strokeStyle = C.stoneBdr;
                ctx.lineWidth = 2;
                roundRect(ctx, tx, ty, tw, th, 4);
                ctx.stroke();
            } else if (tile === CELL_CRYSTAL) {
                ctx.fillStyle = 'rgba(100,180,255,0.4)';
                roundRect(ctx, tx, ty, tw, th, 4);
                ctx.fill();
                ctx.strokeStyle = C.crystal;
                ctx.lineWidth = 2;
                roundRect(ctx, tx, ty, tw, th, 4);
                ctx.stroke();
            } else if (tile === CELL_TURN_RIGHT) {
                ctx.fillStyle = C.turnRBg;
                roundRect(ctx, tx, ty, tw, th, 4);
                ctx.fill();
                ctx.strokeStyle = C.turnR;
                ctx.lineWidth = 2;
                roundRect(ctx, tx, ty, tw, th, 4);
                ctx.stroke();
                ctx.fillStyle = '#f0d060';
                ctx.font = 'bold 18px sans-serif';
                ctx.fillText('\u21B7', cx, cy + 1);
            } else if (tile === CELL_TURN_180) {
                ctx.fillStyle = C.turn180Bg;
                roundRect(ctx, tx, ty, tw, th, 4);
                ctx.fill();
                ctx.strokeStyle = C.turn180;
                ctx.lineWidth = 2;
                roundRect(ctx, tx, ty, tw, th, 4);
                ctx.stroke();
                ctx.fillStyle = '#ff6666';
                ctx.font = 'bold 18px sans-serif';
                ctx.fillText('\u21BA', cx, cy + 1);
            } else if (tile === CELL_BLOOD) {
                const grad = ctx.createLinearGradient(x, y, x + w, y + h);
                grad.addColorStop(0, C.blood1);
                grad.addColorStop(1, C.blood2);
                ctx.fillStyle = grad;
                ctx.fillRect(x, y, w, h);
            } else if (tile === CELL_TELEPORTER) {
                const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, tw / 2);
                grad.addColorStop(0, C.tele1);
                grad.addColorStop(1, C.tele2);
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(cx, cy, tw / 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = C.teleBdr;
                ctx.lineWidth = 2;
                ctx.stroke();
                const pairIdx = getTeleporterPairIndex(r, c);
                if (pairIdx >= 0) {
                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 12px sans-serif';
                    ctx.fillText(String.fromCharCode(65 + pairIdx), cx, cy + 1);
                }
            }

            // Player tokens
            const tokensHere = getTokensAt(r, c);
            tokensHere.forEach((token, ti) => {
                const tokenR = w * 0.32;
                const offsetX = tokensHere.length > 1 ? (ti - 0.5) * tokenR : 0;
                ctx.fillStyle = state.players[token.player].color;
                ctx.beginPath();
                ctx.arc(cx + offsetX, cy, tokenR, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.5)';
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 13px sans-serif';
                const val = token.currentSide === 0 ? token.sideA : token.sideB;
                ctx.fillText(val, cx + offsetX, cy + 1);
            });

            // Monster
            if (state.monster.row === r && state.monster.col === c) {
                drawMonsterOnCanvas(ctx, cx, cy, w, state.monster.dir);
            }
        }
    }

    // Draw predicted path overlay
    if (predictedPath && predictedPath.length > 0) {
        drawPredictedPath(ctx, predictedPath, predictedEvents);
    }

    // Title bar at top
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, canvas.width, SNAP_PAD);
    ctx.fillStyle = C.text;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    const cardLabel = state.snapshotPreviewCard ? `Card: ${state.snapshotPreviewCard.label}` : '';
    ctx.fillText(`Fearsome Floor  |  Turn ${state.turn}  |  Stage ${state.stage}  ${cardLabel}`, 6, SNAP_PAD / 2 + 1);
    ctx.textAlign = 'center'; // reset

    return canvas;
}

function drawMonsterOnCanvas(ctx, cx, cy, cellW, dir) {
    const s = cellW * 0.4;
    ctx.fillStyle = C.monsterBg;
    roundRect(ctx, cx - s, cy - s, s * 2, s * 2, 5);
    ctx.fill();
    ctx.strokeStyle = C.monster;
    ctx.lineWidth = 2;
    roundRect(ctx, cx - s, cy - s, s * 2, s * 2, 5);
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = '20px sans-serif';
    ctx.fillText('\uD83D\uDC7E', cx, cy + 2);

    // Direction arrow
    const dirArrows = { up: '\u25B2', down: '\u25BC', left: '\u25C0', right: '\u25B6' };
    ctx.fillStyle = C.monster;
    ctx.font = 'bold 10px sans-serif';
    const arrowOff = s + 5;
    const positions = {
        up:    [cx, cy - arrowOff],
        down:  [cx, cy + arrowOff + 2],
        left:  [cx - arrowOff - 2, cy],
        right: [cx + arrowOff + 2, cy],
    };
    const [ax, ay] = positions[dir];
    ctx.fillText(dirArrows[dir], ax, ay);
}

function drawPredictedPath(ctx, path, events) {
    if (path.length === 0) return;

    const toCoord = (r, c) => ({
        x: SNAP_PAD + c * SNAP_CELL + SNAP_CELL / 2,
        y: SNAP_PAD + r * SNAP_CELL + SNAP_CELL / 2,
    });

    // Draw path line with glow
    ctx.save();
    ctx.shadowColor = C.pathLine;
    ctx.shadowBlur = 8;
    ctx.strokeStyle = C.pathLine;
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.globalAlpha = 0.85;

    ctx.beginPath();
    const start = toCoord(state.monster.row, state.monster.col);
    ctx.moveTo(start.x, start.y);
    path.forEach(p => {
        const pt = toCoord(p.row, p.col);
        ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();
    ctx.restore();

    // Draw step numbers on each cell
    path.forEach((p, i) => {
        const pt = toCoord(p.row, p.col);

        // Step circle
        ctx.fillStyle = 'rgba(233, 69, 96, 0.7)';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y - SNAP_CELL * 0.3, 10, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(i + 1, pt.x, pt.y - SNAP_CELL * 0.3);
    });

    // Draw start marker
    ctx.fillStyle = C.pathStart;
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('START', start.x, start.y - SNAP_CELL * 0.3);

    // Draw end marker
    if (path.length > 0) {
        const endPt = toCoord(path[path.length - 1].row, path[path.length - 1].col);
        ctx.fillStyle = C.pathLine;
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText('END', endPt.x, endPt.y + SNAP_CELL * 0.38);
    }

    // Draw eat markers
    if (events) {
        events.forEach(ev => {
            if (ev.type === 'eat') {
                const pt = toCoord(ev.row, ev.col);
                ctx.strokeStyle = C.eatX;
                ctx.lineWidth = 3;
                ctx.globalAlpha = 0.9;
                const sz = 10;
                ctx.beginPath();
                ctx.moveTo(pt.x - sz, pt.y - sz);
                ctx.lineTo(pt.x + sz, pt.y + sz);
                ctx.moveTo(pt.x + sz, pt.y - sz);
                ctx.lineTo(pt.x - sz, pt.y + sz);
                ctx.stroke();
                ctx.globalAlpha = 1;
            }
        });
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

// =========================================
// === MONSTER PATH PREDICTION (no-mutate)
// =========================================

/**
 * Simulate the full monster path for a given card WITHOUT mutating game state.
 * Returns { path: [{row,col,dir}], events: [{type,row,col,detail}], log: [string] }
 */
function predictMonsterPath(card) {
    // Deep-copy the mutable parts of state we need
    const simBoard = state.board.map(row => [...row]);
    const simMonster = { ...state.monster };
    const simTokens = [];
    state.players.forEach(p => {
        p.tokens.forEach(t => {
            if (t.onBoard) {
                simTokens.push({ ...t });
            }
        });
    });
    const simTeleporterPairs = state.teleporterPairs.map(p => ({ ...p }));

    let stepsLeft, hitsLeft, hitsNeeded;
    if (card.type === 'steps') {
        stepsLeft = card.value;
        hitsNeeded = 0;
        hitsLeft = 0;
    } else {
        stepsLeft = 20;
        hitsLeft = card.value;
        hitsNeeded = card.value;
    }

    const path = [];
    const events = [];
    const log = [];

    // Helper: find tokens at position in sim
    function simGetTokensAt(r, c) {
        return simTokens.filter(t => t.onBoard && t.row === r && t.col === c);
    }

    // Helper: look in direction using simBoard
    function simLook(fromRow, fromCol, dir) {
        const [dr, dc] = DIR[dir];
        let r = fromRow + dr, c = fromCol + dc, dist = 1;
        while (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
            const tile = simBoard[r][c];
            if (tile === CELL_STONE || tile === CELL_TURN_RIGHT || tile === CELL_TURN_180) return null;
            const toks = simGetTokensAt(r, c);
            if (toks.length > 0) return { row: r, col: c, dist };
            r += dr; c += dc; dist++;
        }
        return null;
    }

    function simDecide(monster) {
        const ahead = monster.dir;
        const leftDir = turnLeft(ahead);
        const rightDir = turnRight90(ahead);
        const aT = simLook(monster.row, monster.col, ahead);
        const lT = simLook(monster.row, monster.col, leftDir);
        const rT = simLook(monster.row, monster.col, rightDir);

        const cands = [];
        if (aT) cands.push({ dir: ahead, dist: aT.dist });
        if (lT) cands.push({ dir: leftDir, dist: lT.dist });
        if (rT) cands.push({ dir: rightDir, dist: rT.dist });

        if (cands.length === 0) return { newDir: ahead, noTarget: true };
        const minD = Math.min(...cands.map(c => c.dist));
        const closest = cands.filter(c => c.dist === minD);
        if (closest.length === 1) return { newDir: closest[0].dir, noTarget: false };
        return { newDir: ahead, noTarget: false, confused: true };
    }

    function simMatchingTeleporter(r, c) {
        for (const p of simTeleporterPairs) {
            if (p.row1 === r && p.col1 === c) return { row: p.row2, col: p.col2 };
            if (p.row2 === r && p.col2 === c) return { row: p.row1, col: p.col1 };
        }
        return null;
    }

    function simSlideBlood(row, col, dir) {
        const [dr, dc] = DIR[dir];
        let r = row, c = col;
        while (r >= 0 && r < ROWS && c >= 0 && c < COLS && simBoard[r][c] === CELL_BLOOD) {
            r += dr; c += dc;
        }
        if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return { row: r - dr, col: c - dc };
        if (simBoard[r][c] !== CELL_EMPTY) return { row: r - dr, col: c - dc };
        return { row: r, col: c };
    }

    function simPushStone(sr, sc, dir) {
        const [dr, dc] = DIR[dir];
        const br = sr + dr, bc = sc + dc;
        if (br < 0 || br >= ROWS || bc < 0 || bc >= COLS) {
            simBoard[sr][sc] = CELL_EMPTY;
            return true;
        }
        if (simBoard[br][bc] === CELL_BLOOD) {
            const origTile = simBoard[sr][sc];
            simBoard[sr][sc] = CELL_EMPTY;
            const se = simSlideBlood(br, bc, dir);
            if (simBoard[se.row][se.col] === CELL_EMPTY) simBoard[se.row][se.col] = origTile;
            return true;
        }
        if (simBoard[br][bc] !== CELL_EMPTY) return false;
        simBoard[br][bc] = simBoard[sr][sc];
        simBoard[sr][sc] = CELL_EMPTY;
        return true;
    }

    // Main simulation loop
    while (stepsLeft > 0) {
        if (hitsNeeded > 0 && hitsLeft <= 0) break;

        const decision = simDecide(simMonster);
        simMonster.dir = decision.newDir;

        // Turning stone check
        const curTile = simBoard[simMonster.row][simMonster.col];
        if ((curTile === CELL_TURN_RIGHT || curTile === CELL_TURN_180) &&
            (decision.noTarget || decision.confused)) {
            if (curTile === CELL_TURN_RIGHT) {
                simMonster.dir = turnRight(simMonster.dir);
                log.push(`Step ${path.length + 1}: Turning stone turns monster RIGHT`);
            } else {
                simMonster.dir = turn180(simMonster.dir);
                log.push(`Step ${path.length + 1}: Turning stone turns monster 180\u00B0`);
            }
        }

        const [dr, dc] = DIR[simMonster.dir];
        let nr = simMonster.row + dr;
        let nc = simMonster.col + dc;

        // Wall wrap
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) {
            const w = wrapPosition(nr, nc, simMonster.dir);
            nr = w.row; nc = w.col;
            log.push(`Step ${path.length + 1}: Wraps through wall to (${nr},${nc})`);
        }

        // Stone push
        const tgtTile = simBoard[nr] && simBoard[nr][nc];
        if (tgtTile === CELL_STONE || tgtTile === CELL_CRYSTAL) {
            simPushStone(nr, nc, simMonster.dir);
            log.push(`Step ${path.length + 1}: Pushes stone at (${nr},${nc})`);
        }

        // Blood slide
        if (simBoard[nr] && simBoard[nr][nc] === CELL_BLOOD) {
            const sl = simSlideBlood(nr, nc, simMonster.dir);
            log.push(`Step ${path.length + 1}: Slides on blood from (${nr},${nc}) to (${sl.row},${sl.col})`);
            nr = sl.row; nc = sl.col;
        }

        // Teleporter
        if (simBoard[nr] && simBoard[nr][nc] === CELL_TELEPORTER) {
            const dest = simMatchingTeleporter(nr, nc);
            if (dest) {
                log.push(`Step ${path.length + 1}: Teleports to (${dest.row},${dest.col})`);
                nr = dest.row; nc = dest.col;
            }
        }

        simMonster.row = nr;
        simMonster.col = nc;
        path.push({ row: nr, col: nc, dir: simMonster.dir });
        stepsLeft--;

        // Eat check
        const caught = simGetTokensAt(nr, nc);
        caught.forEach(t => {
            t.onBoard = false;
            const pLabel = `P${t.player + 1}(${t.sideA}/${t.sideB})`;
            log.push(`Step ${path.length}: EATS ${pLabel} at (${nr},${nc})!`);
            events.push({ type: 'eat', row: nr, col: nc, detail: pLabel });
            if (hitsNeeded > 0) {
                hitsLeft--;
                if (hitsLeft <= 0) stepsLeft = 0;
            }
        });

        if (!decision.noTarget && !decision.confused) {
            log.push(`Step ${path.length}: Sees target, turns ${simMonster.dir}`);
        } else if (decision.confused) {
            log.push(`Step ${path.length}: Confused (tie), continues ${simMonster.dir}`);
        }
    }

    return { path, events, log };
}

// =============================================
// === SNAPSHOT MODAL UI
// =============================================

function openSnapshotModal() {
    document.getElementById('snapshot-modal').classList.add('open');
    state.snapshotPreviewCard = null;
    state.snapshotPredictedPath = null;
    renderSnapshotCardPicker();
    renderSnapshotPreview();
}

function closeSnapshotModal() {
    document.getElementById('snapshot-modal').classList.remove('open');
}

function renderSnapshotCardPicker() {
    const container = document.getElementById('snap-card-picker');
    container.innerHTML = '';

    // "No card" option (just snapshot the board)
    const noneBtn = document.createElement('button');
    noneBtn.className = 'snap-card-btn' + (state.snapshotPreviewCard === null ? ' active' : '');
    noneBtn.textContent = 'None';
    noneBtn.title = 'Snapshot without monster prediction';
    noneBtn.addEventListener('click', () => {
        state.snapshotPreviewCard = null;
        state.snapshotPredictedPath = null;
        renderSnapshotCardPicker();
        renderSnapshotPreview();
    });
    container.appendChild(noneBtn);

    // One button per card value
    MONSTER_DECK_TEMPLATE.forEach((tmpl, idx) => {
        const btn = document.createElement('button');
        const isActive = state.snapshotPreviewCard && state.snapshotPreviewCard.idx === idx;
        btn.className = 'snap-card-btn' + (isActive ? ' active' : '') + (tmpl.type === 'hit' ? ' hit' : '');
        btn.textContent = tmpl.label;
        btn.title = tmpl.type === 'steps' ? `${tmpl.value} steps` : `${tmpl.value} hit(s), max 20 steps`;
        btn.addEventListener('click', () => {
            state.snapshotPreviewCard = { ...tmpl, idx };
            const prediction = predictMonsterPath(tmpl);
            state.snapshotPredictedPath = prediction;
            renderSnapshotCardPicker();
            renderSnapshotPreview();
        });
        container.appendChild(btn);
    });
}

function renderSnapshotPreview() {
    const previewArea = document.getElementById('snap-preview');
    previewArea.innerHTML = '';

    const prediction = state.snapshotPredictedPath;
    const canvas = renderBoardToCanvas(
        prediction ? prediction.path : null,
        prediction ? prediction.events : null,
    );
    canvas.id = 'snap-canvas';
    previewArea.appendChild(canvas);

    // Log
    const logArea = document.getElementById('snap-log');
    logArea.innerHTML = '';
    if (prediction && prediction.log.length > 0) {
        prediction.log.forEach(msg => {
            const div = document.createElement('div');
            div.className = 'snap-log-entry';
            if (msg.includes('EATS')) div.classList.add('eaten');
            div.textContent = msg;
            logArea.appendChild(div);
        });
    } else {
        const div = document.createElement('div');
        div.className = 'snap-log-entry';
        div.textContent = 'Select a monster card above to preview the predicted movement path.';
        logArea.appendChild(div);
    }
}

function downloadSnapshot() {
    const canvas = document.getElementById('snap-canvas');
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = `fearsome-floor-turn${state.turn}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
}

async function shareSnapshot() {
    const canvas = document.getElementById('snap-canvas');
    if (!canvas) return;

    // Build share text
    let text = `Fearsome Floor - Turn ${state.turn}, Stage ${state.stage}`;
    if (state.snapshotPreviewCard) {
        text += ` | Monster card: ${state.snapshotPreviewCard.label}`;
    }
    if (state.snapshotPredictedPath) {
        const eats = state.snapshotPredictedPath.events.filter(e => e.type === 'eat');
        if (eats.length > 0) {
            text += ` | Eats: ${eats.map(e => e.detail).join(', ')}`;
        }
        text += ` | ${state.snapshotPredictedPath.path.length} steps`;
    }

    // Try Web Share API with image
    if (navigator.canShare) {
        try {
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            const file = new File([blob], 'fearsome-floor.png', { type: 'image/png' });
            if (navigator.canShare({ files: [file] })) {
                await navigator.share({
                    title: 'Fearsome Floor Helper',
                    text,
                    files: [file],
                });
                return;
            }
        } catch (err) {
            if (err.name === 'AbortError') return; // user cancelled
        }
    }

    // Fallback: copy image to clipboard
    try {
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
        ]);
        showToast('Board image copied to clipboard!');
    } catch (err) {
        // Final fallback: just download
        downloadSnapshot();
        showToast('Share not supported - image downloaded instead.');
    }
}

function showToast(msg) {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}

// === EVENT LISTENERS ===
document.addEventListener('DOMContentLoaded', () => {
    // Tabs
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.tab).classList.add('active');
        });
    });

    // Place mode buttons
    document.querySelectorAll('.place-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.place-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.placeMode = btn.dataset.place;
        });
    });

    // Game buttons
    document.getElementById('btn-new-game').addEventListener('click', newGame);
    document.getElementById('btn-reset-board').addEventListener('click', () => {
        initBoard();
        placeDefaultSetup();
        logEvent('Board reset to default layout.', 'info');
        render();
    });
    document.getElementById('btn-draw-card').addEventListener('click', drawRandomCard);
    document.getElementById('btn-step-monster').addEventListener('click', stepMonster);
    document.getElementById('btn-auto-monster').addEventListener('click', autoMoveMonster);

    // Direction buttons
    document.querySelectorAll('.dir-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            state.monster.dir = btn.dataset.dir;
            logEvent(`Monster direction set to ${btn.dataset.dir}.`, 'monster');
            render();
        });
    });

    // Snapshot modal
    document.getElementById('btn-snapshot').addEventListener('click', openSnapshotModal);
    document.getElementById('snap-close').addEventListener('click', closeSnapshotModal);
    document.getElementById('snap-download').addEventListener('click', downloadSnapshot);
    document.getElementById('snap-share').addEventListener('click', shareSnapshot);

    // Close modal on backdrop click
    document.getElementById('snapshot-modal').addEventListener('click', (e) => {
        if (e.target.id === 'snapshot-modal') closeSnapshotModal();
    });

    // Start the game
    newGame();
});
