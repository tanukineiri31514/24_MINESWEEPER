
(() => {
  "use strict";

  const DIFFICULTIES = {
    beginner: { name: "初級", h: 10, w: 10, bombs: 7, cell: 50 },
    intermediate: { name: "中級", h: 16, w: 30, bombs: 35, cell: 30 },
    advanced: { name: "上級", h: 40, w: 60, bombs: 200, cell: 25 }
  };
  const $ = (id) => document.getElementById(id);
  const menuScreen = $("menu-screen");
  const gameScreen = $("game-screen");
  const rulesScreen = $("rules-screen");
  const canvas = $("board");
  const ctx = canvas.getContext("2d");
  const viewport = $("board-viewport");
  const stage = $("board-stage");

  let game = null;
  let timerId = null;
  let currentTab = "game";
  let actionMode = "open";
  let audioContext = null;
  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 2;
  const ZOOM_STEP = 0.1;

  const COLORS = {
    closed: "#718096",
    closedLight: "#8795a8",
    closedDark: "#4b586b",
    opened: "#dce3eb",
    openedEdge: "#aab6c4",
    grid: "#596579",
    bomb: "#df5353",
    flag: "#f06b69",
    text: "#172334"
  };

  // 難易度設定を、難易度選択画面とルール説明にも反映する。
  function updateDifficultyInfo() {
    for (const [mode, cfg] of Object.entries(DIFFICULTIES)) {
      document.querySelectorAll(`[data-bomb-count="${mode}"]`).forEach((element) => {
        element.textContent = cfg.bombs;
      });

      document.querySelectorAll(`[data-rule-bombs="${mode}"]`).forEach((element) => {
        element.textContent = cfg.bombs;
      });
    }
  }

  function switchTab(tab) {
    currentTab = tab;

    document.querySelectorAll("[data-tab]").forEach((button) => {
      button.classList.toggle("active", button.dataset.tab === tab);
    });

    const showGame = tab === "game";
    menuScreen.classList.toggle("hidden", !showGame || game !== null);
    gameScreen.classList.toggle("hidden", !showGame || game === null);
    rulesScreen.classList.toggle("hidden", showGame);
  }

  // 操作モードを切り替える。
  function setActionMode(mode) {
    actionMode = mode;

    document.querySelectorAll("[data-action-mode]").forEach((button) => {
      const selected = button.dataset.actionMode === mode;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });

    $("action-mode-hint").textContent =
      mode === "flag"
        ? "マスをタップすると旗を立てる・外します"
        : "マスをタップすると開きます";
  }

  function createGame(mode) {
    const cfg = DIFFICULTIES[mode];

    game = {
      ...cfg,
      board: Array.from({ length: cfg.h }, () => Array(cfg.w).fill(0)),
      opened: Array.from({ length: cfg.h }, () => Array(cfg.w).fill(false)),
      flags: Array.from({ length: cfg.h }, () => Array(cfg.w).fill(false)),
      generated: false,
      over: false,
      won: false,
      startedAt: null,
      endedAt: null,
      openedCount: 0,
      zoom: 1,
      mode
    };

    switchTab("game");
    setActionMode("open");

    $("current-mode").textContent = cfg.name;
    $("board-size").textContent = `${cfg.h} × ${cfg.w}`;
    $("bomb-count").textContent = String(cfg.bombs).padStart(3, "0");
    $("flag-count").textContent = "000";
    $("timer").textContent = "000";
    $("clear-overlay").classList.add("hidden");
    updateZoomControls();

    setMessage("最初のマスを選んでスタート！");
    renderBoard();
    updateHud();
    stopTimer();
  }

  function placeBombs(firstY, firstX) {
    let placed = 0;

    while (placed < game.bombs) {
      const y = Math.floor(Math.random() * game.h);
      const x = Math.floor(Math.random() * game.w);

      if ((y === firstY && x === firstX) || game.board[y][x] === -1) continue;

      game.board[y][x] = -1;
      placed++;
    }

    // 爆弾座標をキューに入れ、各爆弾の周囲24マスへ1ずつ加算する。
    const queue = [];

    for (let y = 0; y < game.h; y++) {
      for (let x = 0; x < game.w; x++) {
        if (game.board[y][x] === -1) queue.push([y, x]);
      }
    }

    let head = 0;

    while (head < queue.length) {
      const [y, x] = queue[head++];

      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (dy === 0 && dx === 0) continue;

          const ny = y + dy;
          const nx = x + dx;

          if (ny < 0 || ny >= game.h || nx < 0 || nx >= game.w) continue;
          if (game.board[ny][nx] === -1) continue;

          game.board[ny][nx] += 1;
        }
      }
    }
  }

  // 中級・上級は初手の運要素を減らすため、最初のクリック時に
  // クリックしたマスを含む10〜15マスを安全な状態で先に開けておく。
  function openInitialSafeCells(firstY, firstX) {
    if (game.mode === "beginner") return;

    const targetCount = 10 + Math.floor(Math.random() * 6);
    const candidates = [];
    for (let y = 0; y < game.h; y++) {
      for (let x = 0; x < game.w; x++) {
        if ((y !== firstY || x !== firstX) && game.board[y][x] !== -1) {
          candidates.push([y, x]);
        }
      }
    }

    // Fisher-Yatesで候補をシャッフルし、必要な数だけ開く。
    for (let i = candidates.length - 1; i > 0; i--) {
      const k = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[k]] = [candidates[k], candidates[i]];
    }

    // 最初にクリックした1マスは通常のreveal処理で開く。
    for (let i = 0; i < targetCount - 1 && i < candidates.length; i++) {
      const [y, x] = candidates[i];
      game.opened[y][x] = true;
      game.openedCount++;
    }
  }

  function inside(y, x) {
    return y >= 0 && y < game.h && x >= 0 && x < game.w;
  }

  function reveal(y, x) {
    if (!inside(y, x) || game.over || game.opened[y][x] || game.flags[y][x]) return;

    if (!game.generated) {
      placeBombs(y, x);
      openInitialSafeCells(y, x);
      game.generated = true;
      game.startedAt = Date.now();
      startTimer();
    }

    if (game.board[y][x] === -1) {
      game.opened[y][x] = true;
      playSound("bomb");
      finishGame(false);
      return;
    }

    // 0のマスから周囲24マスへ広げるBFS
    const queue = [[y, x]];
    let head = 0;

    while (head < queue.length) {
      const [cy, cx] = queue[head++];

      if (!inside(cy, cx) || game.opened[cy][cx] || game.flags[cy][cx]) continue;
      if (game.board[cy][cx] === -1) continue;

      game.opened[cy][cx] = true;
      game.openedCount++;

      if (game.board[cy][cx] === 0) {
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (dy === 0 && dx === 0) continue;

            const ny = cy + dy;
            const nx = cx + dx;

            if (
              inside(ny, nx) &&
              !game.opened[ny][nx] &&
              !game.flags[ny][nx] &&
              game.board[ny][nx] !== -1
            ) {
              queue.push([ny, nx]);
            }
          }
        }
      }
    }

    if (game.openedCount === game.h * game.w - game.bombs) {
      finishGame(true);
    } else {
      setMessage("爆弾を避けて進もう！");
      playSound("open");
    }

    renderBoard();
    updateHud();
  }

  function toggleFlag(y, x) {
    if (!inside(y, x) || game.over || game.opened[y][x]) return;

    game.flags[y][x] = !game.flags[y][x];

    renderBoard();
    updateHud();
  }

  function finishGame(won) {
    game.over = true;
    game.won = won;
    game.endedAt = Date.now();

    stopTimer();

    if (!won) {
      for (let y = 0; y < game.h; y++) {
        for (let x = 0; x < game.w; x++) {
          if (game.board[y][x] === -1) game.opened[y][x] = true;
        }
      }

      setMessage("ゲームオーバー — もう一度挑戦しよう");
    } else {
      setMessage("クリア！おめでとう！！");
      $("clear-overlay").classList.remove("hidden");
      playSound("clear");
    }

    renderBoard();
    updateHud();
  }

  function updateZoomControls() {
    if (!game) return;
    $("zoom-reset-button").textContent = `${Math.round(game.zoom * 100)}%`;
    $("zoom-out-button").disabled = game.zoom <= MIN_ZOOM;
    $("zoom-in-button").disabled = game.zoom >= MAX_ZOOM;
  }

  function setZoom(nextZoom) {
    if (!game) return;
    const oldCellSize = game.cell * game.zoom;
    const relativeX = (viewport.scrollLeft + viewport.clientWidth / 2) / oldCellSize;
    const relativeY = (viewport.scrollTop + viewport.clientHeight / 2) / oldCellSize;

    game.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(nextZoom * 10) / 10));
    renderBoard();
    updateZoomControls();

    const newCellSize = game.cell * game.zoom;
    viewport.scrollLeft = Math.max(0, relativeX * newCellSize - viewport.clientWidth / 2);
    viewport.scrollTop = Math.max(0, relativeY * newCellSize - viewport.clientHeight / 2);
  }

  // 外部音源を使わずWeb Audio APIで短い効果音を生成する。
  function playSound(type) {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      if (!audioContext) audioContext = new AudioContextClass();
      if (audioContext.state === "suspended") audioContext.resume();

      const now = audioContext.currentTime;
      const master = audioContext.createGain();
      master.connect(audioContext.destination);
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(type === "clear" ? 0.16 : 0.09, now + 0.015);
      master.gain.exponentialRampToValueAtTime(0.0001, now + (type === "clear" ? 0.9 : 0.22));

      if (type === "clear") {
        [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
          const oscillator = audioContext.createOscillator();
          const gain = audioContext.createGain();
          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(frequency, now + index * 0.13);
          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.setValueAtTime(0.55, now + index * 0.13);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.13 + 0.24);
          oscillator.connect(gain);
          gain.connect(master);
          oscillator.start(now + index * 0.13);
          oscillator.stop(now + index * 0.13 + 0.26);
        });
      } else {
        const oscillator = audioContext.createOscillator();
        oscillator.connect(master);
        if (type === "bomb") {
          oscillator.type = "sawtooth";
          oscillator.frequency.setValueAtTime(150, now);
          oscillator.frequency.exponentialRampToValueAtTime(38, now + 0.2);
        } else {
          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(660, now);
          oscillator.frequency.exponentialRampToValueAtTime(440, now + 0.09);
        }
        oscillator.start(now);
        oscillator.stop(now + 0.22);
      }
    } catch (error) {
      // 効果音が使えない環境でもゲーム進行には影響させない。
    }
  }

  function setMessage(message) {
    $("game-message").textContent = message;
  }

  function updateHud() {
    if (!game) return;

    let flags = 0;

    for (const row of game.flags) {
      for (const value of row) {
        if (value) flags++;
      }
    }

    $("flag-count").textContent = String(flags).padStart(3, "0");
    $("bomb-count").textContent = String(game.bombs).padStart(3, "0");
    $("timer").textContent = String(elapsedSeconds()).padStart(3, "0");
  }

  function elapsedSeconds() {
    if (!game || game.startedAt === null) return 0;

    const end = game.endedAt ?? Date.now();
    return Math.floor((end - game.startedAt) / 1000);
  }

  function startTimer() {
    stopTimer();
    timerId = window.setInterval(updateHud, 250);
  }

  function stopTimer() {
    if (timerId !== null) window.clearInterval(timerId);
    timerId = null;
  }

  function drawBomb(x, y, size) {
    ctx.fillStyle = COLORS.bomb;
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size * 0.25, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#9d3038";
    ctx.lineWidth = Math.max(1, size * 0.035);
    ctx.stroke();

    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;

      ctx.beginPath();
      ctx.moveTo(
        x + size / 2 + Math.cos(a) * size * 0.27,
        y + size / 2 + Math.sin(a) * size * 0.27
      );
      ctx.lineTo(
        x + size / 2 + Math.cos(a) * size * 0.36,
        y + size / 2 + Math.sin(a) * size * 0.36
      );
      ctx.stroke();
    }
  }

  function drawFlag(x, y, size) {
    ctx.fillStyle = COLORS.flag;
    ctx.beginPath();
    ctx.moveTo(x + size * 0.30, y + size * 0.20);
    ctx.lineTo(x + size * 0.72, y + size * 0.36);
    ctx.lineTo(x + size * 0.30, y + size * 0.53);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "#f8b1a8";
    ctx.lineWidth = Math.max(1, size * 0.045);
    ctx.beginPath();
    ctx.moveTo(x + size * 0.29, y + size * 0.18);
    ctx.lineTo(x + size * 0.29, y + size * 0.78);
    ctx.lineTo(x + size * 0.72, y + size * 0.78);
    ctx.stroke();
  }

  function renderBoard() {
    if (!game) return;

    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const cellSize = game.cell * game.zoom;
    const cssWidth = game.w * cellSize;
    const cssHeight = game.h * cellSize;

    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    for (let y = 0; y < game.h; y++) {
      for (let x = 0; x < game.w; x++) {
        const px = x * cellSize;
        const py = y * cellSize;
        const size = cellSize;
        const opened = game.opened[y][x];

        ctx.fillStyle = opened ? COLORS.opened : COLORS.closed;
        ctx.fillRect(px, py, size, size);

        if (!opened) {
          ctx.fillStyle = COLORS.closedLight;
          ctx.fillRect(px + 1, py + 1, size - 2, Math.max(2, size * 0.07));

          ctx.fillStyle = COLORS.closedDark;
          ctx.fillRect(
            px + 1,
            py + size - Math.max(3, size * 0.07),
            size - 2,
            Math.max(2, size * 0.07)
          );
        }

        if (opened && game.board[y][x] === -1) {
          drawBomb(px, py, size);
        } else if (opened && game.board[y][x] > 0) {
          const value = game.board[y][x];
          const numberColors = [
            "",
            "#2464d8",
            "#21834a",
            "#d83d42",
            "#7650bd",
            "#a45c32",
            "#168b9b",
            "#27313e",
            "#687386"
          ];

          ctx.fillStyle = numberColors[value] || "#182333";
          ctx.font = `700 ${Math.max(10, Math.floor(size * 0.48))}px "Noto Sans JP", sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(value), px + size / 2, py + size / 2 + 1);
        } else if (!opened && game.flags[y][x]) {
          drawFlag(px, py, size);
        }

        ctx.strokeStyle = opened ? COLORS.openedEdge : COLORS.grid;
        ctx.lineWidth = Math.max(1, size >= 30 ? 1.5 : 1);
        ctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
      }
    }
  }

  function canvasCellFromEvent(event) {
    const rect = canvas.getBoundingClientRect();

    // getBoundingClientRect() はCSSピクセルなので、DPR補正は不要。
    return {
      x: Math.floor((event.clientX - rect.left) / (game.cell * game.zoom)),
      y: Math.floor((event.clientY - rect.top) / (game.cell * game.zoom))
    };
  }

  function handleCell(event, flagMode = false) {
    if (!game || game.over) return;

    const { x, y } = canvasCellFromEvent(event);

    if (!inside(y, x)) return;

    if (flagMode) {
      toggleFlag(y, x);
    } else {
      reveal(y, x);
    }
  }

  // 左クリック・タップ：選択中のモードで操作
  canvas.addEventListener("click", (event) => {
    if (event.button !== 0) return;
    handleCell(event, actionMode === "flag");
  });

  // PCの右クリック：旗を立てる・外す
  canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    handleCell(event, true);
  });

  // 操作モード切り替えボタン
  document.querySelectorAll("[data-action-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      setActionMode(button.dataset.actionMode);
    });
  });

  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });

  document.querySelectorAll("[data-difficulty]").forEach((button) => {
    button.addEventListener("click", () => createGame(button.dataset.difficulty));
  });

  $("zoom-out-button").addEventListener("click", () => {
    if (game) setZoom(game.zoom - ZOOM_STEP);
  });

  $("zoom-in-button").addEventListener("click", () => {
    if (game) setZoom(game.zoom + ZOOM_STEP);
  });

  $("zoom-reset-button").addEventListener("click", () => {
    if (game) setZoom(1);
  });

  $("restart-button").addEventListener("click", () => {
    if (game) createGame(game.mode);
  });

  $("menu-button").addEventListener("click", () => {
    stopTimer();
    game = null;
    switchTab("game");
  });

  $("help-button").addEventListener("click", () => $("help-dialog").showModal());

  // 初期表示時に難易度情報を反映
  updateDifficultyInfo();
  switchTab("game");
  setActionMode("open");

  window.addEventListener("resize", () => {
    if (game) renderBoard();
  });

  // キーボード操作：Rでリスタート、Escapeで難易度選択へ
  window.addEventListener("keydown", (event) => {
    if (!game || $("help-dialog").open) return;

    if (event.key.toLowerCase() === "r") createGame(game.mode);
    if (event.key === "Escape") $("menu-button").click();
  });
})();
