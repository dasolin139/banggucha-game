// ============================================================
// 방구차 (Banggucha) - Maze Flag Capture Game
// ============================================================

const TILE = 32;
const COLS = 25;
const ROWS = 19;
const WIDTH = COLS * TILE;
const HEIGHT = ROWS * TILE;

// Tile types
const EMPTY = 0;
const WALL = 1;
const FLAG = 2;
const PLAYER_START = 3;
const EXIT = 4;

// Directions
const DIR = {
    UP:    { dx: 0, dy: -1 },
    DOWN:  { dx: 0, dy: 1 },
    LEFT:  { dx: -1, dy: 0 },
    RIGHT: { dx: 1, dy: 0 },
};

// ============================================================
// Maze Generator (Recursive Backtracking)
// ============================================================
function generateMaze(cols, rows) {
    // Work with odd dimensions for maze grid
    const mCols = Math.floor(cols / 2);
    const mRows = Math.floor(rows / 2);
    const grid = Array.from({ length: rows }, () => Array(cols).fill(WALL));

    const visited = Array.from({ length: mRows }, () => Array(mCols).fill(false));

    function carve(cx, cy) {
        visited[cy][cx] = true;
        grid[cy * 2 + 1][cx * 2 + 1] = EMPTY;

        const dirs = shuffle([
            { dx: 0, dy: -1 },
            { dx: 0, dy: 1 },
            { dx: -1, dy: 0 },
            { dx: 1, dy: 0 },
        ]);

        for (const d of dirs) {
            const nx = cx + d.dx;
            const ny = cy + d.dy;
            if (nx >= 0 && nx < mCols && ny >= 0 && ny < mRows && !visited[ny][nx]) {
                grid[cy * 2 + 1 + d.dy][cx * 2 + 1 + d.dx] = EMPTY;
                carve(nx, ny);
            }
        }
    }

    carve(0, 0);

    // Open some extra walls for multiple paths (makes it more fun)
    for (let i = 0; i < Math.floor(mCols * mRows * 0.15); i++) {
        const rx = randInt(1, cols - 2);
        const ry = randInt(1, rows - 2);
        if (grid[ry][rx] === WALL) {
            const neighbors = [
                grid[ry - 1]?.[rx],
                grid[ry + 1]?.[rx],
                grid[ry]?.[rx - 1],
                grid[ry]?.[rx + 1],
            ].filter(t => t === EMPTY);
            if (neighbors.length >= 2) {
                grid[ry][rx] = EMPTY;
            }
        }
    }

    return grid;
}

// ============================================================
// Utility
// ============================================================
function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ============================================================
// Game Class
// ============================================================
class BangguchaGame {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = WIDTH;
        this.canvas.height = HEIGHT;

        this.keys = {};
        this.stage = 1;
        this.score = 0;
        this.lives = 3;
        this.running = false;
        this.lastTime = 0;

        this.setupInput();
    }

    setupInput() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.key] = true;
            if (e.key === 'Enter') {
                const startScreen = document.getElementById('start-screen');
                if (!startScreen.classList.contains('hidden')) {
                    this.start();
                }
            }
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
                e.preventDefault();
            }
        });
        window.addEventListener('keyup', (e) => {
            this.keys[e.key] = false;
        });
    }

    start() {
        document.getElementById('start-screen').classList.add('hidden');
        document.getElementById('game-over-screen').classList.add('hidden');
        document.getElementById('stage-clear-screen').classList.add('hidden');

        this.stage = 1;
        this.score = 0;
        this.lives = 3;
        this.initStage();
        this.running = true;
        this.lastTime = performance.now();
        requestAnimationFrame((t) => this.loop(t));
    }

    restart() {
        this.start();
    }

    initStage() {
        this.grid = generateMaze(COLS, ROWS);
        this.flags = [];
        this.enemies = [];
        this.particles = [];
        this.flagCollectAnim = [];

        // Place player at top-left area
        this.player = {
            x: 1,
            y: 1,
            dir: 'RIGHT',
            moveTimer: 0,
            moveDelay: 0.12,
            invincible: 0,
            exhaust: [],
            shootCooldown: 0,
        };
        this.bullets = [];
        this.grid[1][1] = EMPTY;

        // Place exit at bottom-right area
        this.exitPos = { x: COLS - 2, y: ROWS - 2 };
        this.grid[ROWS - 2][COLS - 2] = EMPTY;
        this.exitOpen = false;

        // Place flags
        const flagCount = 4 + this.stage * 2;
        this.totalFlags = flagCount;
        this.collectedFlags = 0;
        let placed = 0;
        let attempts = 0;
        while (placed < flagCount && attempts < 1000) {
            const fx = randInt(1, COLS - 2);
            const fy = randInt(1, ROWS - 2);
            if (this.grid[fy][fx] === EMPTY && !(fx === 1 && fy === 1) && !(fx === COLS - 2 && fy === ROWS - 2)) {
                this.flags.push({ x: fx, y: fy, collected: false, bobPhase: Math.random() * Math.PI * 2 });
                placed++;
            }
            attempts++;
        }
        this.totalFlags = placed;

        // Place enemies
        const enemyCount = Math.min(1 + this.stage, 8);
        for (let i = 0; i < enemyCount; i++) {
            let ex, ey;
            attempts = 0;
            do {
                ex = randInt(3, COLS - 3);
                ey = randInt(3, ROWS - 3);
                attempts++;
            } while ((this.grid[ey][ex] !== EMPTY || (Math.abs(ex - 1) + Math.abs(ey - 1) < 5)) && attempts < 500);

            if (this.grid[ey][ex] === EMPTY) {
                const dirs = Object.values(DIR);
                this.enemies.push({
                    x: ex,
                    y: ey,
                    dir: dirs[randInt(0, 3)],
                    moveTimer: 0,
                    moveDelay: 0.4 - this.stage * 0.02,
                    changeTimer: randInt(2, 5),
                });
            }
        }

        this.updateHUD();
    }

    nextStage() {
        document.getElementById('stage-clear-screen').classList.add('hidden');
        this.stage++;
        this.initStage();
        this.running = true;
        this.lastTime = performance.now();
        requestAnimationFrame((t) => this.loop(t));
    }

    loop(timestamp) {
        if (!this.running) return;

        const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
        this.lastTime = timestamp;

        this.update(dt);
        this.render();

        requestAnimationFrame((t) => this.loop(t));
    }

    // ============================================================
    // Update
    // ============================================================
    update(dt) {
        this.updatePlayer(dt);
        this.updateBullets(dt);
        this.updateEnemies(dt);
        this.updateParticles(dt);
        this.checkCollisions();
        this.updateAnimations(dt);

        if (this.player.invincible > 0) {
            this.player.invincible -= dt;
        }
    }

    updatePlayer(dt) {
        const p = this.player;
        p.moveTimer -= dt;
        p.shootCooldown -= dt;

        if (p.moveTimer <= 0) {
            let dx = 0, dy = 0;
            if (this.keys['ArrowUp'] || this.keys['w'] || this.keys['W']) { dy = -1; p.dir = 'UP'; }
            else if (this.keys['ArrowDown'] || this.keys['s'] || this.keys['S']) { dy = 1; p.dir = 'DOWN'; }
            else if (this.keys['ArrowLeft'] || this.keys['a'] || this.keys['A']) { dx = -1; p.dir = 'LEFT'; }
            else if (this.keys['ArrowRight'] || this.keys['d'] || this.keys['D']) { dx = 1; p.dir = 'RIGHT'; }

            if (dx !== 0 || dy !== 0) {
                const nx = p.x + dx;
                const ny = p.y + dy;
                if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS && this.grid[ny][nx] !== WALL) {
                    p.exhaust.push({
                        x: p.x * TILE + TILE / 2,
                        y: p.y * TILE + TILE / 2,
                        life: 0.5,
                        maxLife: 0.5,
                    });

                    p.x = nx;
                    p.y = ny;
                    p.moveTimer = p.moveDelay;
                }
            }
        }

        // Shoot (Spacebar)
        if ((this.keys[' '] || this.keys['f'] || this.keys['F']) && p.shootCooldown <= 0) {
            this.shoot();
            p.shootCooldown = 0.4;
        }

        // Update exhaust
        p.exhaust = p.exhaust.filter(e => {
            e.life -= dt;
            return e.life > 0;
        });
    }

    shoot() {
        const p = this.player;
        const dirMap = {
            UP:    { dx: 0, dy: -1 },
            DOWN:  { dx: 0, dy: 1 },
            LEFT:  { dx: -1, dy: 0 },
            RIGHT: { dx: 1, dy: 0 },
        };
        const d = dirMap[p.dir];

        this.bullets.push({
            x: p.x * TILE + TILE / 2,
            y: p.y * TILE + TILE / 2,
            vx: d.dx * 280,
            vy: d.dy * 280,
            life: 2.0,
            size: 8,
            wobble: 0,
            trail: [],
        });

        // Recoil smoke at cannon tip
        for (let i = 0; i < 5; i++) {
            this.particles.push({
                x: p.x * TILE + TILE / 2 + d.dx * 16,
                y: p.y * TILE + TILE / 2 + d.dy * 16,
                vx: d.dx * 30 + (Math.random() - 0.5) * 40,
                vy: d.dy * 30 + (Math.random() - 0.5) * 40,
                life: 0.3,
                maxLife: 0.3,
                color: '#88aa44',
                size: randInt(3, 6),
            });
        }
    }

    updateBullets(dt) {
        this.bullets = this.bullets.filter(b => {
            // Save trail position
            b.trail.push({ x: b.x, y: b.y, life: 0.2 });
            b.trail = b.trail.filter(t => { t.life -= dt; return t.life > 0; });

            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.life -= dt;
            b.wobble += dt * 15;
            b.size = 8 + Math.sin(b.wobble) * 2;

            // Grid position
            const gx = Math.floor(b.x / TILE);
            const gy = Math.floor(b.y / TILE);

            // Wall collision
            if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS || this.grid[gy][gx] === WALL) {
                // Wall hit particles
                for (let i = 0; i < 8; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    this.particles.push({
                        x: b.x, y: b.y,
                        vx: Math.cos(angle) * 80,
                        vy: Math.sin(angle) * 80,
                        life: 0.4, maxLife: 0.4,
                        color: ['#88aa44', '#aacc66', '#667733'][randInt(0, 2)],
                        size: randInt(2, 5),
                    });
                }
                return false;
            }

            // Enemy hit detection
            for (let i = this.enemies.length - 1; i >= 0; i--) {
                const enemy = this.enemies[i];
                const ex = enemy.x * TILE + TILE / 2;
                const ey = enemy.y * TILE + TILE / 2;
                const dist = Math.hypot(b.x - ex, b.y - ey);

                if (dist < TILE * 0.7) {
                    // Enemy destroyed!
                    this.score += 200 * this.stage;
                    this.updateHUD();

                    // Big explosion
                    for (let j = 0; j < 20; j++) {
                        const angle = Math.random() * Math.PI * 2;
                        const speed = 60 + Math.random() * 140;
                        this.particles.push({
                            x: ex, y: ey,
                            vx: Math.cos(angle) * speed,
                            vy: Math.sin(angle) * speed,
                            life: 0.7, maxLife: 0.7,
                            color: ['#ff4444', '#ff8800', '#ffcc00', '#88aa44'][randInt(0, 3)],
                            size: randInt(3, 8),
                        });
                    }

                    // Score popup
                    this.flagCollectAnim.push({
                        x: ex, y: ey,
                        time: 0,
                        text: '+' + (200 * this.stage),
                    });

                    this.enemies.splice(i, 1);
                    return false;
                }
            }

            return b.life > 0;
        });
    }

    updateEnemies(dt) {
        for (const enemy of this.enemies) {
            enemy.moveTimer -= dt;
            enemy.changeTimer -= dt;

            if (enemy.changeTimer <= 0) {
                const dirs = Object.values(DIR);
                enemy.dir = dirs[randInt(0, 3)];
                enemy.changeTimer = randInt(2, 5);
            }

            if (enemy.moveTimer <= 0) {
                const nx = enemy.x + enemy.dir.dx;
                const ny = enemy.y + enemy.dir.dy;

                if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS && this.grid[ny][nx] !== WALL) {
                    enemy.x = nx;
                    enemy.y = ny;
                } else {
                    const dirs = Object.values(DIR);
                    enemy.dir = dirs[randInt(0, 3)];
                }
                enemy.moveTimer = enemy.moveDelay;
            }
        }
    }

    updateParticles(dt) {
        this.particles = this.particles.filter(p => {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;
            return p.life > 0;
        });
    }

    updateAnimations(dt) {
        this.flagCollectAnim = this.flagCollectAnim.filter(a => {
            a.time += dt;
            return a.time < 0.6;
        });
    }

    checkCollisions() {
        const p = this.player;

        // Flag collection
        for (const flag of this.flags) {
            if (!flag.collected && flag.x === p.x && flag.y === p.y) {
                flag.collected = true;
                this.collectedFlags++;
                this.score += 100 * this.stage;

                // Sparkle particles
                for (let i = 0; i < 12; i++) {
                    const angle = (Math.PI * 2 * i) / 12;
                    this.particles.push({
                        x: flag.x * TILE + TILE / 2,
                        y: flag.y * TILE + TILE / 2,
                        vx: Math.cos(angle) * 120,
                        vy: Math.sin(angle) * 120,
                        life: 0.5,
                        maxLife: 0.5,
                        color: ['#ffcc00', '#ff6688', '#00ff88'][randInt(0, 2)],
                        size: randInt(2, 5),
                    });
                }

                this.flagCollectAnim.push({
                    x: flag.x * TILE + TILE / 2,
                    y: flag.y * TILE + TILE / 2,
                    time: 0,
                    text: '+' + (100 * this.stage),
                });

                if (this.collectedFlags >= this.totalFlags) {
                    this.exitOpen = true;
                }

                this.updateHUD();
            }
        }

        // Exit check
        if (this.exitOpen && p.x === this.exitPos.x && p.y === this.exitPos.y) {
            this.stageClear();
            return;
        }

        // Enemy collision
        if (p.invincible <= 0) {
            for (const enemy of this.enemies) {
                if (enemy.x === p.x && enemy.y === p.y) {
                    this.playerHit();
                    break;
                }
            }
        }
    }

    playerHit() {
        this.lives--;
        this.updateHUD();

        // Explosion particles
        for (let i = 0; i < 20; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 50 + Math.random() * 150;
            this.particles.push({
                x: this.player.x * TILE + TILE / 2,
                y: this.player.y * TILE + TILE / 2,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 0.8,
                maxLife: 0.8,
                color: ['#ff4444', '#ff8800', '#ffcc00'][randInt(0, 2)],
                size: randInt(3, 7),
            });
        }

        if (this.lives <= 0) {
            this.gameOver();
        } else {
            this.player.x = 1;
            this.player.y = 1;
            this.player.invincible = 2.0;
        }
    }

    stageClear() {
        this.running = false;
        const bonus = this.stage * 500;
        this.score += bonus;

        document.getElementById('clear-score').textContent = `SCORE: ${this.score}`;
        document.getElementById('clear-bonus').textContent = `STAGE BONUS: +${bonus}`;
        document.getElementById('stage-clear-screen').classList.remove('hidden');
    }

    gameOver() {
        this.running = false;
        document.getElementById('final-score').textContent = `FINAL SCORE: ${this.score}`;
        document.getElementById('game-over-screen').classList.remove('hidden');
    }

    updateHUD() {
        document.getElementById('level-display').textContent = `STAGE ${this.stage}`;
        document.getElementById('score-display').textContent = `SCORE: ${this.score}`;
        document.getElementById('flags-display').textContent = `FLAGS: ${this.collectedFlags}/${this.totalFlags}`;
        document.getElementById('lives-display').textContent = `LIVES: ${'♥'.repeat(this.lives)}`;
    }

    // ============================================================
    // Render
    // ============================================================
    render() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, WIDTH, HEIGHT);

        this.renderMaze(ctx);
        this.renderExit(ctx);
        this.renderFlags(ctx);
        this.renderBullets(ctx);
        this.renderEnemies(ctx);
        this.renderPlayer(ctx);
        this.renderParticles(ctx);
        this.renderFlagAnims(ctx);
    }

    renderMaze(ctx) {
        const time = performance.now() / 1000;

        for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS; x++) {
                const px = x * TILE;
                const py = y * TILE;

                if (this.grid[y][x] === WALL) {
                    // Wall with retro brick pattern
                    ctx.fillStyle = '#2a2a4a';
                    ctx.fillRect(px, py, TILE, TILE);

                    ctx.fillStyle = '#3a3a6a';
                    ctx.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);

                    // Brick lines
                    ctx.strokeStyle = '#222244';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(px, py + TILE / 2);
                    ctx.lineTo(px + TILE, py + TILE / 2);
                    ctx.stroke();

                    const offset = (y % 2 === 0) ? TILE / 2 : 0;
                    ctx.beginPath();
                    ctx.moveTo(px + offset, py);
                    ctx.lineTo(px + offset, py + TILE);
                    ctx.stroke();

                    // Highlight edge
                    ctx.fillStyle = '#4a4a7a';
                    ctx.fillRect(px + 1, py + 1, TILE - 2, 2);
                    ctx.fillRect(px + 1, py + 1, 2, TILE - 2);
                } else {
                    // Floor
                    ctx.fillStyle = '#111122';
                    ctx.fillRect(px, py, TILE, TILE);

                    // Subtle floor pattern
                    if ((x + y) % 2 === 0) {
                        ctx.fillStyle = '#151530';
                        ctx.fillRect(px, py, TILE, TILE);
                    }
                }
            }
        }
    }

    renderFlags(ctx) {
        const time = performance.now() / 1000;

        for (const flag of this.flags) {
            if (flag.collected) continue;

            const px = flag.x * TILE;
            const py = flag.y * TILE;
            const bob = Math.sin(time * 3 + flag.bobPhase) * 3;

            // Flag pole
            ctx.fillStyle = '#888';
            ctx.fillRect(px + 6, py + 4 + bob, 2, TILE - 8);

            // Flag cloth
            const wave = Math.sin(time * 5 + flag.bobPhase) * 2;
            ctx.fillStyle = '#ff4444';
            ctx.beginPath();
            ctx.moveTo(px + 8, py + 4 + bob);
            ctx.lineTo(px + 24 + wave, py + 8 + bob);
            ctx.lineTo(px + 22 + wave, py + 14 + bob);
            ctx.lineTo(px + 8, py + 16 + bob);
            ctx.closePath();
            ctx.fill();

            // Flag highlight
            ctx.fillStyle = '#ff6666';
            ctx.beginPath();
            ctx.moveTo(px + 8, py + 4 + bob);
            ctx.lineTo(px + 18 + wave, py + 6 + bob);
            ctx.lineTo(px + 16 + wave, py + 10 + bob);
            ctx.lineTo(px + 8, py + 10 + bob);
            ctx.closePath();
            ctx.fill();

            // Glow
            ctx.save();
            ctx.globalAlpha = 0.15 + Math.sin(time * 4 + flag.bobPhase) * 0.1;
            ctx.fillStyle = '#ff4444';
            ctx.beginPath();
            ctx.arc(px + TILE / 2, py + TILE / 2 + bob, 16, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    renderExit(ctx) {
        const time = performance.now() / 1000;
        const px = this.exitPos.x * TILE;
        const py = this.exitPos.y * TILE;

        if (this.exitOpen) {
            // Open exit - bright portal
            const pulse = 0.6 + Math.sin(time * 4) * 0.4;
            ctx.save();
            ctx.globalAlpha = pulse;
            ctx.fillStyle = '#00ff88';
            ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
            ctx.restore();

            ctx.strokeStyle = '#00ff88';
            ctx.lineWidth = 2;
            ctx.strokeRect(px + 4, py + 4, TILE - 8, TILE - 8);

            // Arrow symbol
            ctx.fillStyle = '#004422';
            ctx.font = '16px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('▶', px + TILE / 2, py + TILE / 2);
        } else {
            // Closed exit - dim
            ctx.fillStyle = '#1a3322';
            ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
            ctx.strokeStyle = '#334433';
            ctx.lineWidth = 1;
            ctx.strokeRect(px + 4, py + 4, TILE - 8, TILE - 8);

            // Lock symbol
            ctx.fillStyle = '#445544';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🔒', px + TILE / 2, py + TILE / 2);
        }
    }

    renderPlayer(ctx) {
        const p = this.player;
        const px = p.x * TILE;
        const py = p.y * TILE;
        const time = performance.now() / 1000;

        // Exhaust particles
        for (const e of p.exhaust) {
            const alpha = e.life / e.maxLife;
            ctx.save();
            ctx.globalAlpha = alpha * 0.6;
            ctx.fillStyle = '#888';
            ctx.beginPath();
            ctx.arc(e.x, e.y, 3 * alpha, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Invincibility blink
        if (p.invincible > 0 && Math.floor(time * 10) % 2 === 0) {
            return;
        }

        // Tank body
        ctx.save();
        ctx.translate(px + TILE / 2, py + TILE / 2);

        let angle = 0;
        if (p.dir === 'UP') angle = -Math.PI / 2;
        else if (p.dir === 'DOWN') angle = Math.PI / 2;
        else if (p.dir === 'LEFT') angle = Math.PI;
        else angle = 0;
        ctx.rotate(angle);

        // Treads
        ctx.fillStyle = '#445544';
        ctx.fillRect(-14, -14, 28, 5);
        ctx.fillRect(-14, 9, 28, 5);

        // Tread detail
        ctx.fillStyle = '#334433';
        for (let i = -12; i < 14; i += 5) {
            ctx.fillRect(i, -14, 2, 5);
            ctx.fillRect(i, 9, 2, 5);
        }

        // Body
        ctx.fillStyle = '#55aa55';
        ctx.fillRect(-10, -10, 20, 20);

        // Body highlight
        ctx.fillStyle = '#66bb66';
        ctx.fillRect(-10, -10, 20, 4);
        ctx.fillRect(-10, -10, 4, 20);

        // Body shadow
        ctx.fillStyle = '#448844';
        ctx.fillRect(-10, 6, 20, 4);
        ctx.fillRect(6, -10, 4, 20);

        // Turret
        ctx.fillStyle = '#44aa44';
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, Math.PI * 2);
        ctx.fill();

        // Cannon
        ctx.fillStyle = '#66cc66';
        ctx.fillRect(4, -2, 12, 4);

        // Cannon tip
        ctx.fillStyle = '#88dd88';
        ctx.fillRect(14, -3, 3, 6);

        ctx.restore();

        // Player glow
        ctx.save();
        ctx.globalAlpha = 0.1;
        ctx.fillStyle = '#00ff88';
        ctx.beginPath();
        ctx.arc(px + TILE / 2, py + TILE / 2, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    renderEnemies(ctx) {
        const time = performance.now() / 1000;

        for (const enemy of this.enemies) {
            const px = enemy.x * TILE;
            const py = enemy.y * TILE;

            ctx.save();
            ctx.translate(px + TILE / 2, py + TILE / 2);

            let angle = 0;
            if (enemy.dir.dy === -1) angle = -Math.PI / 2;
            else if (enemy.dir.dy === 1) angle = Math.PI / 2;
            else if (enemy.dir.dx === -1) angle = Math.PI;
            ctx.rotate(angle);

            // Treads
            ctx.fillStyle = '#554444';
            ctx.fillRect(-14, -14, 28, 5);
            ctx.fillRect(-14, 9, 28, 5);

            // Body
            ctx.fillStyle = '#cc4444';
            ctx.fillRect(-10, -10, 20, 20);

            // Body detail
            ctx.fillStyle = '#dd5555';
            ctx.fillRect(-10, -10, 20, 4);
            ctx.fillRect(-10, -10, 4, 20);

            ctx.fillStyle = '#aa3333';
            ctx.fillRect(-10, 6, 20, 4);

            // Turret
            ctx.fillStyle = '#bb3333';
            ctx.beginPath();
            ctx.arc(0, 0, 6, 0, Math.PI * 2);
            ctx.fill();

            // Cannon
            ctx.fillStyle = '#dd5555';
            ctx.fillRect(4, -2, 10, 4);

            ctx.restore();

            // Enemy danger glow
            ctx.save();
            ctx.globalAlpha = 0.08 + Math.sin(time * 5) * 0.04;
            ctx.fillStyle = '#ff0000';
            ctx.beginPath();
            ctx.arc(px + TILE / 2, py + TILE / 2, 18, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    renderBullets(ctx) {
        const time = performance.now() / 1000;

        for (const b of this.bullets) {
            // Trail (fart gas trail)
            for (const t of b.trail) {
                const alpha = t.life / 0.2;
                ctx.save();
                ctx.globalAlpha = alpha * 0.3;
                ctx.fillStyle = '#88aa44';
                ctx.beginPath();
                ctx.arc(t.x, t.y, 5 * alpha, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }

            // Main fart cloud
            const wobX = Math.sin(b.wobble) * 2;
            const wobY = Math.cos(b.wobble * 1.3) * 2;

            // Outer glow
            ctx.save();
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = '#667733';
            ctx.beginPath();
            ctx.arc(b.x + wobX, b.y + wobY, b.size + 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // Main cloud body (multiple overlapping circles for cloud shape)
            ctx.fillStyle = '#99bb44';
            ctx.beginPath();
            ctx.arc(b.x + wobX, b.y + wobY, b.size, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#aacc55';
            ctx.beginPath();
            ctx.arc(b.x + wobX - 3, b.y + wobY - 2, b.size * 0.7, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#bbdd66';
            ctx.beginPath();
            ctx.arc(b.x + wobX + 2, b.y + wobY + 1, b.size * 0.5, 0, Math.PI * 2);
            ctx.fill();

            // Stink lines
            ctx.save();
            ctx.globalAlpha = 0.5;
            ctx.strokeStyle = '#667733';
            ctx.lineWidth = 1.5;
            for (let i = 0; i < 3; i++) {
                const offset = (i - 1) * 5;
                const wave = Math.sin(time * 8 + i * 2) * 3;
                ctx.beginPath();
                ctx.moveTo(b.x + offset, b.y - b.size - 2);
                ctx.quadraticCurveTo(b.x + offset + wave, b.y - b.size - 8, b.x + offset - wave, b.y - b.size - 14);
                ctx.stroke();
            }
            ctx.restore();
        }
    }

    renderParticles(ctx) {
        for (const p of this.particles) {
            const alpha = p.life / p.maxLife;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    renderFlagAnims(ctx) {
        for (const a of this.flagCollectAnim) {
            const alpha = 1 - a.time / 0.6;
            const offsetY = -a.time * 60;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#ffcc00';
            ctx.font = '10px "Press Start 2P", monospace';
            ctx.textAlign = 'center';
            ctx.fillText(a.text, a.x, a.y + offsetY);
            ctx.restore();
        }
    }
}

// ============================================================
// Initialize
// ============================================================
const game = new BangguchaGame();
