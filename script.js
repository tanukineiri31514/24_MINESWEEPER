(() => {
  "use strict";

  const DIFFICULTIES = {
    beginner: { name: "初級", h: 10, w: 10, bombs: 7, cell: 50 },
    intermediate: { name: "中級", h: 16, w: 30, bombs: 35, cell: 30 },
    advanced: { name: "上級", h: 40, w: 60, bombs: 250, cell: 20 }
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
  let pressTimer = null;
  let longPressTriggered = false;
  let pointerStart = null;
  let currentTab = "game";

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
      mode
    };

    switchTab("game");
    $("current-mode").textContent = cfg.name;
    $("board-size").textContent = `${cfg.h} × ${cfg.w}`;
    $("bomb-count").textContent = String(cfg.bombs).padStart(3, "0");
    $("flag-count").textContent = "000";
    $("timer").textContent = "000";
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

    // 爆弾座標をdeque相当のキューに入れ、
    // 各爆弾の周囲24マスへ1ずつ加算する。
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

  function inside(y, x) {
    return y >= 0 && y < game.h && x >= 0 && x < game.w;
  }

  function reveal(y, x) {
    if (!inside(y, x) || game.over || game.opened[y][x] || game.flags[y][x]) return;

    if (!game.generated) {
      placeBombs(y, x);
      game.generated = true;
      game.startedAt = Date.now();
      startTimer();
    }

    if (game.board[y][x] === -1) {
      game.opened[y][x] = true;
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
            if (inside(ny, nx) && !game.opened[ny][nx] && !game.flags[ny][nx] && game.board[ny][nx] !== -1) {
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
      setMessage("CLEAR! おめでとう！");
    }
    renderBoard();
    updateHud();
  }

  function setMessage(message) {
    $("game-message").textContent = message;
  }

  function updateHud() {
    if (!game) return;
    let flags = 0;
    for (const row of game.flags) for (const value of row) if (value) flags++;
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
      ctx.moveTo(x + size / 2 + Math.cos(a) * size * .27, y + size / 2 + Math.sin(a) * size * .27);
      ctx.lineTo(x + size / 2 + Math.cos(a) * size * .36, y + size / 2 + Math.sin(a) * size * .36);
      ctx.stroke();
    }
  }

  function drawFlag(x, y, size) {
    ctx.fillStyle = COLORS.flag;
    ctx.beginPath();
    ctx.moveTo(x + size * .30, y + size * .20);
    ctx.lineTo(x + size * .72, y + size * .36);
    ctx.lineTo(x + size * .30, y + size * .53);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#f8b1a8";
    ctx.lineWidth = Math.max(1, size * .045);
    ctx.beginPath();
    ctx.moveTo(x + size * .29, y + size * .18);
    ctx.lineTo(x + size * .29, y + size * .78);
    ctx.lineTo(x + size * .72, y + size * .78);
    ctx.stroke();
  }

  function renderBoard() {
    if (!game) return;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const cssWidth = game.w * game.cell;
    const cssHeight = game.h * game.cell;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    for (let y = 0; y < game.h; y++) {
      for (let x = 0; x < game.w; x++) {
        const px = x * game.cell;
        const py = y * game.cell;
        const size = game.cell;
        const opened = game.opened[y][x];

        ctx.fillStyle = opened ? COLORS.opened : COLORS.closed;
        ctx.fillRect(px, py, size, size);

        if (!opened) {
          ctx.fillStyle = COLORS.closedLight;
          ctx.fillRect(px + 1, py + 1, size - 2, Math.max(2, size * .07));
          ctx.fillStyle = COLORS.closedDark;
          ctx.fillRect(px + 1, py + size - Math.max(3, size * .07), size - 2, Math.max(2, size * .07));
        }

        if (opened && game.board[y][x] === -1) {
          drawBomb(px, py, size);
        } else if (opened && game.board[y][x] > 0) {
          const value = game.board[y][x];
          const numberColors = ["", "#2464d8", "#21834a", "#d83d42", "#7650bd", "#a45c32", "#168b9b", "#27313e", "#687386"];
          ctx.fillStyle = numberColors[value] || "#182333";
          ctx.font = `700 ${Math.max(10, Math.floor(size * .48))}px "Noto Sans JP", sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(value), px + size / 2, py + size / 2 + 1);
        } else if (!opened && game.flags[y][x]) {
          drawFlag(px, py, size);
        }

        ctx.strokeStyle = opened ? COLORS.openedEdge : COLORS.grid;
        ctx.lineWidth = Math.max(1, size >= 30 ? 1.5 : 1);
        ctx.strokeRect(px + .5, py + .5, size - 1, size - 1);
      }
    }
  }

  function canvasCellFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    // getBoundingClientRect() はCSSピクセルなので、DPR補正は不要。
    return {
      x: Math.floor((event.clientX - rect.left) / game.cell),
      y: Math.floor((event.clientY - rect.top) / game.cell)
    };
  }

  function handleCell(event, flagMode = false) {
    if (!game || game.over) return;
    const { x, y } = canvasCellFromEvent(event);
    if (!inside(y, x)) return;
    if (flagMode) toggleFlag(y, x);
    else reveal(y, x);
  }

  canvas.addEventListener("click", (event) => {
    if (longPressTriggered) {
      longPressTriggered = false;
      return;
    }
    if (event.button === 0) handleCell(event, false);
  });

  canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    handleCell(event, true);
  });

  // スマホ用の長押しで旗を立てる
  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch") return;
    pointerStart = { x: event.clientX, y: event.clientY };
    longPressTriggered = false;
    pressTimer = window.setTimeout(() => {
      longPressTriggered = true;
      handleCell(event, true);
    }, 500);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!pointerStart || event.pointerType !== "touch") return;
    if (Math.abs(event.clientX - pointerStart.x) > 10 || Math.abs(event.clientY - pointerStart.y) > 10) {
      window.clearTimeout(pressTimer);
      pressTimer = null;
    }
  });

  ["pointerup", "pointercancel", "pointerleave"].forEach((type) => {
    canvas.addEventListener(type, () => {
      if (pressTimer !== null) window.clearTimeout(pressTimer);
      pressTimer = null;
      pointerStart = null;
    });
  });

  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });

  document.querySelectorAll("[data-difficulty]").forEach((button) => {
    button.addEventListener("click", () => createGame(button.dataset.difficulty));
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
