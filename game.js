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
    board: [],         // 2D array [row][col] of cell type
    players: [],       // array of player objects
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
    teleporterPairs: [], // [{row1,col1,row2,col2}]
    teleporterPlacing: null, // temporary first teleporter coords
    monsterPath: [],
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
                currentSide: 0, // 0 = sideA showing
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
    // Monster starts at top-left (row 0, col 0), facing down (toward M on opposite wall)
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

    // Place default stones for basic setup
    placeDefaultSetup();

    clearLog();
    logEvent('New game started with ' + state.playerCount + ' players.', 'info');
    logEvent('Place your tokens on the board (bottom-right entrance).', 'info');
    logEvent('Monster starts at top-left, facing down.', 'monster');

    render();
}

function placeDefaultSetup() {
    // Basic setup: a few stones scattered for a default game
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

    // Blood pools
    state.board[5][3] = CELL_BLOOD;
    state.board[5][4] = CELL_BLOOD;
}

// === RENDERING ===
function render() {
    renderBoard();
    renderDeck();
    renderTurnInfo();
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

            // Exit cell (top-left corner)
            if (r === 0 && c === 0) {
                cell.classList.add('exit-cell');
            }

            // Entrance area (bottom-right)
            if (r === ROWS - 1 && c === COLS - 1) {
                cell.classList.add('entrance-cell');
            }

            // Monster path highlight
            if (state.monsterPath.some(p => p.row === r && p.col === c)) {
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

                // Direction indicator
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
            if (!card.used) {
                useCard(idx);
            }
        });
        deckEl.appendChild(cardEl);
    });
}

function renderTurnInfo() {
    document.getElementById('turn-number').textContent = state.turn;
    document.getElementById('stage-number').textContent = state.stage;
    document.getElementById('current-card').textContent = state.currentCard
        ? state.currentCard.label
        : '-';
    document.getElementById('steps-left').textContent = state.stepsLeft;
}

function updateButtons() {
    const hasSteps = state.stepsLeft > 0;
    document.getElementById('btn-step-monster').disabled = !hasSteps;
    document.getElementById('btn-auto-monster').disabled = !hasSteps;
}

// === CELL CLICK HANDLER ===
function onCellClick(row, col) {
    const mode = state.placeMode;

    if (mode === 'select') {
        handleSelect(row, col);
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
    // Check if there's a token here
    const tokens = getTokensAt(row, col);
    if (tokens.length > 0) {
        state.selectedToken = tokens[0];
        logEvent(`Selected ${getTokenLabel(tokens[0])}`, 'info');
        return;
    }

    // If a token is selected, try to move it here
    if (state.selectedToken) {
        const token = state.selectedToken;
        if (token.onBoard) {
            // Move existing token
            const maxMove = token.currentSide === 0 ? token.sideA : token.sideB;
            const dist = Math.abs(token.row - row) + Math.abs(token.col - col);

            if (dist <= maxMove && isValidPlayerMove(token, row, col)) {
                moveToken(token, row, col);
            } else {
                logEvent(`Invalid move. Max ${maxMove} spaces orthogonally.`, 'info');
            }
        } else {
            // Place token on board (entrance area)
            token.row = row;
            token.col = col;
            token.onBoard = true;
            logEvent(`${getTokenLabel(token)} placed on board at (${row},${col}).`, 'info');
            flipToken(token);
            state.selectedToken = null;
        }
        return;
    }

    // Check for unplaced tokens to highlight
    const unplaced = getAllUnplacedTokens();
    if (unplaced.length > 0) {
        state.selectedToken = unplaced[0];
        logEvent(`Selected unplaced ${getTokenLabel(unplaced[0])}. Click a cell to place it.`, 'info');
    }
}

function handleErase(row, col) {
    if (state.board[row][col] !== CELL_EMPTY) {
        // Remove teleporter pair tracking
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
        // Check not adjacent
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
    // Check for exit
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

        // Blood pool sliding
        if (state.board[toRow][toCol] === CELL_BLOOD) {
            logEvent(`${getTokenLabel(token)} slides on blood pool!`, 'info');
            // Tokens slide through blood in a straight line - handled by the player choosing direction
        }

        logEvent(`${getTokenLabel(token)} moved to (${toRow},${toCol}).`, 'info');
    }

    flipToken(token);
    state.selectedToken = null;
}

function flipToken(token) {
    token.currentSide = token.currentSide === 0 ? 1 : 0;
}

function isValidPlayerMove(token, toRow, toCol) {
    if (toRow < 0 || toRow >= ROWS || toCol < 0 || toCol >= COLS) return false;

    // Cannot end on another player token
    const tokensAtDest = getTokensAt(toRow, toCol);
    if (tokensAtDest.length > 0 && !(toRow === 0 && toCol === 0)) return false;

    // Cannot end on monster
    if (isMonsterAt(toRow, toCol)) return false;

    // Cannot end on teleporter (players can't step on them)
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
        state.stepsLeft = 20; // max for hit cards
        state.hitsLeft = card.value;
        state.hitsNeeded = card.value;
        logEvent(`Monster card: ${card.label} (move until ${card.value} hit(s), max 20 steps)`, 'monster');
    }

    // Check stage transition (after 7 cards drawn, start stage 2 & reshuffle)
    if (state.cardsDrawn === 7) {
        state.stage = 2;
        logEvent('STAGE 2 begins! Eaten tokens are now permanently removed!', 'eaten');
    }

    if (state.cardsDrawn === 8) {
        // Reshuffle deck
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

    // Apply new direction
    monster.dir = result.newDir;

    // Move one step
    const [dr, dc] = DIR[monster.dir];
    let newRow = monster.row + dr;
    let newCol = monster.col + dc;

    // Check for turning stones BEFORE moving (monster is on the turning stone space)
    const currentTile = state.board[monster.row][monster.col];
    if (currentTile === CELL_TURN_RIGHT || currentTile === CELL_TURN_180) {
        // Turning stone only activates if no player was visible
        if (result.reason.includes('no target') || result.reason.includes('confused')) {
            if (currentTile === CELL_TURN_RIGHT) {
                monster.dir = turnRight(monster.dir);
                logEvent(`Turning stone: monster turns RIGHT, now facing ${monster.dir}`, 'monster');
            } else {
                monster.dir = turn180(monster.dir);
                logEvent(`Turning stone: monster turns 180°, now facing ${monster.dir}`, 'monster');
            }
            const [dr2, dc2] = DIR[monster.dir];
            newRow = monster.row + dr2;
            newCol = monster.col + dc2;
        }
    }

    // Wall wrapping
    if (newRow < 0 || newRow >= ROWS || newCol < 0 || newCol >= COLS) {
        const wrapped = wrapPosition(newRow, newCol, monster.dir);
        newRow = wrapped.row;
        newCol = wrapped.col;
        logEvent(`Monster wraps through wall to (${newRow},${newCol})`, 'monster');
    }

    // Check if new position has a stone
    const targetTile = state.board[newRow] && state.board[newRow][newCol];
    if (targetTile === CELL_STONE || targetTile === CELL_CRYSTAL) {
        // Push the stone
        const pushResult = pushStone(newRow, newCol, monster.dir);
        if (!pushResult) {
            // Can't push - the monster's step still counts but it stays in place
            logEvent(`Monster pushes stone at (${newRow},${newCol}) but it can't move.`, 'monster');
        } else {
            logEvent(`Monster pushes stone from (${newRow},${newCol})`, 'monster');
        }
    }

    // Check for turning stones that cannot be pushed
    if (targetTile === CELL_TURN_RIGHT || targetTile === CELL_TURN_180) {
        // Monster enters the turning stone space
        // Will be processed on next step
    }

    // Blood pool sliding
    if (state.board[newRow] && state.board[newRow][newCol] === CELL_BLOOD) {
        logEvent(`Monster slides on blood pool at (${newRow},${newCol})!`, 'monster');
        const slideResult = slideOnBlood(newRow, newCol, monster.dir);
        newRow = slideResult.row;
        newCol = slideResult.col;
        // Monster doesn't look left/right while sliding - extra steps consumed
        const slideSteps = Math.abs(slideResult.row - monster.row) + Math.abs(slideResult.col - monster.col);
        // The slide counts as part of the movement
    }

    // Teleporter
    if (state.board[newRow] && state.board[newRow][newCol] === CELL_TELEPORTER) {
        const dest = getMatchingTeleporter(newRow, newCol);
        if (dest) {
            logEvent(`Monster teleports from (${newRow},${newCol}) to (${dest.row},${dest.col})!`, 'monster');
            newRow = dest.row;
            newCol = dest.col;
            // Monster looks left/right after teleporting (handled on next step)
        }
    }

    // Move monster
    monster.row = newRow;
    monster.col = newCol;
    state.monsterPath.push({ row: newRow, col: newCol });
    state.stepsLeft--;

    // Check if monster catches a player
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

    // Look in three directions: ahead, left, right
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

    // Find closest
    const minDist = Math.min(...candidates.map(c => c.dist));
    const closest = candidates.filter(c => c.dist === minDist);

    if (closest.length === 1) {
        return {
            newDir: closest[0].dir,
            reason: `sees target at distance ${closest[0].dist} to the ${closest[0].dir}, turning ${closest[0].dir}`
        };
    }

    // Tie - monster is confused, continues straight
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

        // Stones block line of sight (but NOT crystal stones)
        if (tile === CELL_STONE || tile === CELL_TURN_RIGHT || tile === CELL_TURN_180) {
            return null; // blocked
        }

        // Crystal stones do NOT block sight
        // Teleporters are flat, don't block sight
        // Blood pools don't block sight

        // Check for player tokens
        const tokens = getTokensAt(r, c);
        if (tokens.length > 0) {
            return { row: r, col: c, dist, token: tokens[0] };
        }

        r += dr;
        c += dc;
        dist++;
    }

    return null; // nothing seen before hitting board edge
}

// === STONE PUSHING ===
function pushStone(stoneRow, stoneCol, dir) {
    const [dr, dc] = DIR[dir];
    const behindRow = stoneRow + dr;
    const behindCol = stoneCol + dc;

    // Stone pushed off board
    if (behindRow < 0 || behindRow >= ROWS || behindCol < 0 || behindCol >= COLS) {
        state.board[stoneRow][stoneCol] = CELL_EMPTY;
        logEvent(`Stone pushed off the board from (${stoneRow},${stoneCol})!`, 'monster');

        // Check if any players were behind the stone (crushed)
        return true;
    }

    const behindTile = state.board[behindRow][behindCol];

    // Blood pool - stone slides
    if (behindTile === CELL_BLOOD) {
        state.board[stoneRow][stoneCol] = CELL_EMPTY;
        const slideEnd = slideOnBlood(behindRow, behindCol, dir);
        if (state.board[slideEnd.row][slideEnd.col] === CELL_EMPTY) {
            state.board[slideEnd.row][slideEnd.col] = state.board[stoneRow][stoneCol] === CELL_CRYSTAL ? CELL_CRYSTAL : CELL_STONE;
        }
        return true;
    }

    // Cannot push into another stone or immovable object
    if (behindTile !== CELL_EMPTY) {
        // Check if there's a player there (crushed!)
        const crushed = getTokensAt(behindRow, behindCol);
        crushed.forEach(t => eatToken(t));
        return false;
    }

    // Push the stone
    state.board[behindRow][behindCol] = state.board[stoneRow][stoneCol];
    state.board[stoneRow][stoneCol] = CELL_EMPTY;

    // Check if players at the pushed destination get crushed
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

    // Check if we went off board or hit a wall
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) {
        // Stay at last blood space
        return { row: r - dr, col: c - dc };
    }

    // If the space beyond blood is occupied by immovable object, stay at end of blood
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
        // Return to entrance
        token.row = -1;
        token.col = -1;
        token.currentSide = 0;
        logEvent(`${getTokenLabel(token)} returns to entrance (Stage 1).`, 'info');
    } else {
        // Permanently removed
        token.eaten = true;
        token.row = -1;
        token.col = -1;
        logEvent(`${getTokenLabel(token)} permanently removed (Stage 2)!`, 'eaten');
    }
}

// === WALL WRAPPING ===
function wrapPosition(row, col, dir) {
    // Monster wraps to opposite side with matching letter
    if (dir === 'up' && row < 0) {
        return { row: ROWS - 1, col };
    }
    if (dir === 'down' && row >= ROWS) {
        return { row: 0, col };
    }
    if (dir === 'left' && col < 0) {
        return { row, col: COLS - 1 };
    }
    if (dir === 'right' && col >= COLS) {
        return { row, col: 0 };
    }
    return { row, col };
}

// === TELEPORTER ===
function getMatchingTeleporter(row, col) {
    for (const pair of state.teleporterPairs) {
        if (pair.row1 === row && pair.col1 === col) {
            return { row: pair.row2, col: pair.col2 };
        }
        if (pair.row2 === row && pair.col2 === col) {
            return { row: pair.row1, col: pair.col1 };
        }
    }
    return null;
}

function getTeleporterPairIndex(row, col) {
    for (let i = 0; i < state.teleporterPairs.length; i++) {
        const pair = state.teleporterPairs[i];
        if ((pair.row1 === row && pair.col1 === col) ||
            (pair.row2 === row && pair.col2 === col)) {
            return i;
        }
    }
    return -1;
}

function removeTeleporterAt(row, col) {
    const idx = getTeleporterPairIndex(row, col);
    if (idx >= 0) {
        const pair = state.teleporterPairs[idx];
        // Also remove the matching teleporter
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
            if (t.onBoard && t.row === row && t.col === col) {
                result.push(t);
            }
        });
    });
    return result;
}

function getAllUnplacedTokens() {
    const result = [];
    state.players.forEach(p => {
        p.tokens.forEach(t => {
            if (!t.onBoard && !t.exited && !t.eaten) {
                result.push(t);
            }
        });
    });
    return result;
}

function isMonsterAt(row, col) {
    return state.monster.row === row && state.monster.col === col;
}

function getTokenLabel(token) {
    const playerNum = token.player + 1;
    const val = token.currentSide === 0 ? token.sideA : token.sideB;
    return `P${playerNum}(${token.sideA}/${token.sideB})`;
}

// === LOGGING ===
function logEvent(message, type) {
    const logEl = document.getElementById('event-log');
    const entry = document.createElement('div');
    entry.className = 'log-entry ' + (type || '');
    entry.textContent = message;
    logEl.insertBefore(entry, logEl.firstChild);

    // Keep log manageable
    while (logEl.children.length > 100) {
        logEl.removeChild(logEl.lastChild);
    }
}

function clearLog() {
    document.getElementById('event-log').innerHTML = '';
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

    // Start the game
    newGame();
});
