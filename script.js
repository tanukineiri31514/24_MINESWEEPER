
(() => {
  "use strict";

  const DIFFICULTIES = {
    beginner: { name: "初級", h: 10, w: 10, bombs: 7, cell: 50 },
    intermediate: { name: "中級", h: 16, w: 30, bombs: 35, cell: 30 },
    advanced: { name: "上級", h: 40, w: 60, bombs: 150, cell: 20 }
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

  // 現在選択しているタブ
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

  // タブの表示を切り替える
  function switchTab(tab) {
    currentTab = tab;

    document.querySelectorAll("[data-tab]").forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.tab === tab
      );
    });

    // ゲームタブの場合
    if (tab === "game") {
      rulesScreen.classList.add("hidden");

      if (game === null) {
        menuScreen.classList.remove("hidden");
        gameScreen.classList.add("hidden");
      } else {
        menuScreen.classList.add("hidden");
        gameScreen.classList.remove("hidden");
      }
    }

    // ルール説明タブの場合
    else if (tab === "rules") {
      menuScreen.classList.add("hidden");
      gameScreen.classList.add("hidden");
      rulesScreen.classList.remove("hidden");
    }
  }

  // タブ切り替えイベント
  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      switchTab(button.dataset.tab);
    });
  });

  // ゲームを作成する
  function createGame(mode) {
    const cfg = DIFFICULTIES[mode];

    game = {
      ...cfg,
      board: Array.from(
        { length: cfg.h },
        () => Array(cfg.w).fill(0)
      ),
      opened: Array.from(
        { length: cfg.h },
        () => Array(cfg.w).fill(false)
      ),
      flags: Array.from(
        { length: cfg.h },
        () => Array(cfg.w).fill(false)
      ),
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

  // 爆弾を配置する
  function placeBombs(firstY, firstX) {
    let placed = 0;

    while (placed < game.bombs) {
      const y = Math.floor(Math.random() * game.h);
      const x = Math.floor(Math.random() * game.w);

      if (
        (y === firstY && x === firstX) ||
        game.board[y][x] === -1
      ) {
        continue;
      }

      game.board[y][x] = -1;
      placed++;
    }

    // 爆弾座標をキューに入れる
    const queue = [];

    for (let y = 0; y < game.h; y++) {
      for (let x = 0; x < game.w; x++) {
        if (game.board[y][x] === -1) {
          queue.push([y, x]);
        }
      }
    }

    // 爆弾の周囲24マスへ1ずつ加算する
    let head = 0;

    while (head < queue.length) {
      const [y, x] = queue[head++];

      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (dy === 0 && dx === 0) continue;

          const ny = y + dy;
          const nx = x + dx;

          if (
            ny < 0 ||
            ny >= game.h ||
            nx < 0 ||
            nx >= game.w
          ) {
            continue;
          }

          if (game.board[ny][nx] === -1) continue;

          game.board[ny][nx] += 1;
        }
      }
    }
  }

  // 盤面内か確認する
  function inside(y, x) {
    return (
      y >= 0 &&
      y < game.h &&
      x >= 0 &&
      x < game.w
    );
  }

  // マスを開く
  function reveal(y, x) {
    if (
      !inside(y, x) ||
      game.over ||
      game.opened[y][x] ||
      game.flags[y][x]
    ) {
      return;
    }

    // 初回クリック時に爆弾を配置する
    if (!game.generated) {
      placeBombs(y, x);

      game.generated = true;
      game.startedAt = Date.now();

      startTimer();
    }

    // 爆弾を踏んだ場合
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

      if (
        !inside(cy, cx) ||
        game.opened[cy][cx] ||
        game.flags[cy][cx]
      ) {
        continue;
      }

      if (game.board[cy][cx] === -1) continue;

      game.opened[cy][cx] = true;
      game.openedCount++;

      // 数字が0なら周囲24マスを追加する
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

    // クリア判定
    if (game.openedCount === game.h * game.w - game.bombs) {
      finishGame(true);
    } else {
      setMessage("爆弾を避けて進もう！");
    }

    renderBoard();
    updateHud();
  }

  // 旗を立てる・外す
  function toggleFlag(y, x) {
    if (
      !inside(y, x) ||
      game.over ||
      game.opened[y][x]
    ) {
      return;
    }

    game.flags[y][x] = !game.flags[y][x];

    renderBoard();
    updateHud();
  }

  // ゲーム終了
  function finishGame(won) {
    game.over = true;
    game.won = won;
    game.endedAt = Date.now();

    stopTimer();

    if (!won) {
      // 爆弾をすべて表示する
      for (let y = 0; y < game.h; y++) {
        for (let x = 0; x < game.w; x++) {
          if (game.board[y][x] === -1) {
            game.opened[y][x] = true;
          }
        }
      }

      setMessage("ゲームオーバー — もう一度挑戦しよう");
    } else {
      setMessage("CLEAR! おめでとう！");
    }

    renderBoard();
    updateHud();
  }

  // メッセージを変更する
  function setMessage(message) {
    $("game-message").textContent = message;
  }

  // HUDを更新する
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

  // 経過時間を取得する
  function elapsedSeconds() {
    if (!game || game.startedAt === null) return 0;

    const end = game.endedAt ?? Date.now();

    return Math.floor((end - game.startedAt) / 1000);
  }

  // タイマー開始
  function startTimer() {
    stopTimer();

    timerId = window.setInterval(updateHud, 250);
  }

  // タイマー停止
  function stopTimer() {
    if (timerId !== null) {
      window.clearInterval(timerId);
    }

    timerId = null;
  }

  // 爆弾を描画する
  function drawBomb(x, y, size) {
    ctx.fillStyle = COLORS.bomb;

    ctx.beginPath();

    ctx.arc(
      x + size / 2,
      y + size / 2,
      size * 0.25,
      0,
      Math.PI * 2
    );

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

  // 旗を描画する
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

  // 盤面を描画する
  function renderBoard() {
    if (!game) return;

    const dpr = Math.max(
      1,
      Math.min(2, window.devicePixelRatio || 1)
    );

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

          ctx.fillRect(
            px + 1,
            py + 1,
            size - 2,
            Math.max(2, size * 0.07)
          );

          ctx.fillStyle = COLORS.closedDark;

          ctx.fillRect(
            px + 1,
            py + size - Math.max(3, size * 0.07),
            size - 2,
            Math.max(2, size * 0.07)
          );
        }

        // 爆弾
        if (opened && game.board[y][x] === -1) {
          drawBomb(px, py, size);
        }

        // 数字
        else if (opened && game.board[y][x] > 0) {
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

          ctx.font =
            `700 ${Math.max(10, Math.floor(size * 0.48))}px "Noto Sans JP", sans-serif`;

          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          ctx.fillText(
            String(value),
            px + size / 2,
            py + size / 2 + 1
          );
        }

        // 旗
        else if (!opened && game.flags[y][x]) {
          drawFlag(px, py, size);
        }

        // マスの枠線
        ctx.strokeStyle = opened ? COLORS.openedEdge : COLORS.grid;

        ctx.lineWidth = Math.max(
          1,
          size >= 30 ? 1.5 : 1
        );

        ctx.strokeRect(
          px + 0.5,
          py + 0.5,
          size - 1,
          size - 1
        );
      }
    }
  }

  // マウス位置からマスの座標を取得する
  function canvasCellFromEvent(event) {
    const rect = canvas.getBoundingClientRect();

    return {
      x: Math.floor((event.clientX - rect.left) / game.cell),
      y: Math.floor((event.clientY - rect.top) / game.cell)
    };
  }

  // マスを操作する
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

  // 左クリック
  canvas.addEventListener("click", (event) => {
    if (longPressTriggered) {
      longPressTriggered = false;
      return;
    }

    if (event.button === 0) {
      handleCell(event, false);
    }
  });

  // 右クリック
  canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();

    handleCell(event, true);
  });

  // スマホ用の長押しで旗を立てる
  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch") return;

    pointerStart = {
      x: event.clientX,
      y: event.clientY
    };

    longPressTriggered = false;

    pressTimer = window.setTimeout(() => {
      longPressTriggered = true;

      handleCell(event, true);
    }, 500);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!pointerStart || event.pointerType !== "touch") return;

    if (
      Math.abs(event.clientX - pointerStart.x) > 10 ||
      Math.abs(event.clientY - pointerStart.y) > 10
    ) {
      window.clearTimeout(pressTimer);
      pressTimer = null;
    }
  });

  ["pointerup", "pointercancel", "pointerleave"].forEach((type) => {
    canvas.addEventListener(type, () => {
      if (pressTimer !== null) {
        window.clearTimeout(pressTimer);
      }

      pressTimer = null;
      pointerStart = null;
    });
  });

  // 難易度選択
  document.querySelectorAll("[data-difficulty]").forEach((button) => {
    button.addEventListener("click", () => {
      createGame(button.dataset.difficulty);
    });
  });

  // リスタート
  $("restart-button").addEventListener("click", () => {
    if (game) {
      createGame(game.mode);
    }
  });

  // 難易度選択に戻る
  $("menu-button").addEventListener("click", () => {
    stopTimer();

    game = null;

    switchTab("game");
  });

  // ウィンドウサイズ変更
  window.addEventListener("resize", () => {
    if (game) {
      renderBoard();
    }
  });

  // キーボード操作
  // R：リスタート
  // Escape：難易度選択へ戻る
  window.addEventListener("keydown", (event) => {
    if (!game) return;

    if (event.key.toLowerCase() === "r") {
      createGame(game.mode);
    }

    if (event.key === "Escape") {
      $("menu-button").click();
    }
  });

})();
