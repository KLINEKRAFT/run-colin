(() => {
  // =========================
  // CONFIG
  // =========================
  const CANVAS_W = 720;
  const CANVAS_H = 1280;

  // Your REAL source sprite size (per-frame PNG size)
  const PLAYER_SRC_W = 35;
  const PLAYER_SRC_H = 53;

  // Scale up for phone readability (35x53 * 4 = 140x212)
  const PLAYER_SCALE = 4;
  const PLAYER_DRAW_W = PLAYER_SRC_W * PLAYER_SCALE; // 140
  const PLAYER_DRAW_H = PLAYER_SRC_H * PLAYER_SCALE; // 212

  // Ground position (feet line)
  const GROUND_Y = 1020; // tweak 980–1040 if you want

  // Physics
  const GRAVITY = 3400;
  const JUMP_VELOCITY = -1300;
  const SLIDE_DURATION = 0.55;

  // Speed
  const START_SPEED = 600;
  const SPEED_RAMP = 16;

  // Lanes
  const LANES = 3;
  const LANE_CENTER_X = CANVAS_W * 0.5;
  const LANE_GAP = 175;        // tweak 155–190 based on your road look
  const LANE_SNAP = 20;        // snappiness of lane switching

  // Spawning
  const SPAWN_MIN = 0.70;
  const SPAWN_MAX = 1.10;

  // Overhead obstacle chance
  const OVERHEAD_CHANCE = 0.38;

  // Road drawing
  const ROAD_TILE_DRAW_W = 256;
  const ROAD_STRIP_Y = GROUND_Y - 90;
  const ROAD_STRIP_H = CANVAS_H - ROAD_STRIP_Y;

  // =========================
  // CANVAS
  // =========================
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  // =========================
  // ASSET LOADING
  // =========================
  const ASSET_DIR = "assets/";

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load: ${src}`));
      img.src = src;
    });
  }

  const ASSETS = {
    background: ASSET_DIR + "background.png",
    road:       ASSET_DIR + "road.png",
    start:      ASSET_DIR + "start.png",
    gameOver:   ASSET_DIR + "game_over.png",

    jumpBtn:    ASSET_DIR + "jump_button.png",
    slideBtn:   ASSET_DIR + "slide_button.png",

    idle:  [1,2,3,4].map(n => ASSET_DIR + `idle_${n}.png`),
    run:   [1,2,3,4].map(n => ASSET_DIR + `run_${n}.png`),
    jump:  [1,2,3,4].map(n => ASSET_DIR + `jump_${n}.png`),
    slide: [1,2,3].map(n => ASSET_DIR + `slide_${n}.png`),

    obstacles: {
      crate:    ASSET_DIR + "crate.png",
      cone:     ASSET_DIR + "cone.png",
      trashcan: ASSET_DIR + "trashcan.png",
      hydrant:  ASSET_DIR + "hydrant.png",
      lowbar:   ASSET_DIR + "low_bar.png"
    }
  };

  const images = {};
  let hasLowBar = false;

  async function loadAll() {
    const entries = [];

    ["background","road","start","gameOver","jumpBtn","slideBtn"].forEach((k) => {
      entries.push([k, ASSETS[k]]);
    });

    entries.push(["idle", ASSETS.idle]);
    entries.push(["run", ASSETS.run]);
    entries.push(["jump", ASSETS.jump]);
    entries.push(["slide", ASSETS.slide]);

    Object.entries(ASSETS.obstacles).forEach(([k, src]) => {
      entries.push([`ob_${k}`, src]);
    });

    for (const [key, value] of entries) {
      if (Array.isArray(value)) {
        images[key] = [];
        for (const src of value) images[key].push(await loadImage(src));
      } else {
        try {
          images[key] = await loadImage(value);
          if (key === "ob_lowbar") hasLowBar = true;
        } catch (e) {
          if (key === "ob_lowbar") hasLowBar = false;
          else throw e;
        }
      }
    }
  }

  // =========================
  // INPUT (touch + swipe + keyboard)
  // =========================
  const input = {
    jump: false,
    slide: false,
    tapped: false,
    tapX: 0,
    tapY: 0,
    swipeLeft: false,
    swipeRight: false
  };

  function pointerPosFromClient(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);
    return { x, y };
  }

  function pointerPos(e) {
    const isTouch = !!e.touches;
    const t = isTouch ? e.touches[0] : e;
    return pointerPosFromClient(t.clientX, t.clientY);
  }

  function pointerPosEnd(e) {
    if (e.changedTouches && e.changedTouches[0]) {
      const t = e.changedTouches[0];
      return pointerPosFromClient(t.clientX, t.clientY);
    }
    return pointerPos(e);
  }

  let jumpBtnRect = { x: 0, y: 0, w: 0, h: 0 };
  let slideBtnRect = { x: 0, y: 0, w: 0, h: 0 };
  let startBtnRect = { x: 0, y: 0, w: 0, h: 0 };

  function inRect(p, r) {
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }

  // swipe detection
  let touchStart = null;
  const SWIPE_MIN = 55;
  const SWIPE_MAX_Y = 65;

  function onDown(e) {
    e.preventDefault();
    const p = pointerPos(e);

    input.tapped = true;
    input.tapX = p.x;
    input.tapY = p.y;

    if (state === STATE.PLAY) {
      input.jump = inRect(p, jumpBtnRect);
      input.slide = inRect(p, slideBtnRect);
    }

    const onButton = (state === STATE.PLAY) && (input.jump || input.slide);
    touchStart = { x: p.x, y: p.y, onButton };
  }

  function onUp(e) {
    e.preventDefault();
    const p = pointerPosEnd(e);

    if (touchStart && !touchStart.onButton && state === STATE.PLAY) {
      const dx = p.x - touchStart.x;
      const dy = p.y - touchStart.y;
      if (Math.abs(dx) >= SWIPE_MIN && Math.abs(dy) <= SWIPE_MAX_Y) {
        if (dx < 0) input.swipeLeft = true;
        if (dx > 0) input.swipeRight = true;
      }
    }

    input.jump = false;
    input.slide = false;
    touchStart = null;
  }

  canvas.addEventListener("touchstart", onDown, { passive: false });
  canvas.addEventListener("touchend", onUp, { passive: false });
  canvas.addEventListener("mousedown", onDown);
  window.addEventListener("mouseup", onUp);

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp") input.jump = true;
    if (e.code === "ArrowDown") input.slide = true;
    if (e.code === "ArrowLeft") input.swipeLeft = true;
    if (e.code === "ArrowRight") input.swipeRight = true;
    if (e.code === "Enter") input.tapped = true;
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp") input.jump = false;
    if (e.code === "ArrowDown") input.slide = false;
  });

  // =========================
  // GAME STATE
  // =========================
  const STATE = { LOADING: "loading", START: "start", PLAY: "play", GAMEOVER: "gameover" };
  let state = STATE.LOADING;

  let speed = START_SPEED;
  let score = 0;
  let roadOffset = 0;

  // =========================
  // Player (3 lanes)
  // =========================
  function laneToX(lane) {
    const start = LANE_CENTER_X - LANE_GAP; // lane 0 center
    const laneCenter = start + lane * LANE_GAP;
    return laneCenter - PLAYER_DRAW_W * 0.5;
  }

  const player = {
    lane: 1,
    x: laneToX(1),
    y: GROUND_Y,
    vy: 0,
    onGround: true,
    mode: "run",
    animT: 0,
    slideT: 0
  };

  // =========================
  // Obstacles
  // =========================
  const obstacles = [];
  let spawnT = 0;
  let nextSpawn = rand(SPAWN_MIN, SPAWN_MAX);

  function rand(a, b) { return a + Math.random() * (b - a); }

  const groundObstacleTypes = ["crate","cone","trashcan","hydrant"];

  function spawnObstacle() {
    const lane = Math.floor(Math.random() * LANES);
    const doOverhead = Math.random() < OVERHEAD_CHANCE;

    if (doOverhead) {
      const type = hasLowBar ? "lowbar" : "cone";
      const img = images[`ob_${type}`];

      // low_bar source ~128x56 => aspect ~2.285
      // draw it wide so it reads as “slide under”
      const drawW = 260;
      const drawH = Math.round(drawW / 2.285); // ~114

      const x = laneToX(lane) + (PLAYER_DRAW_W - drawW) / 2;

      // Position it so standing collides, sliding clears
      // This is the top-left y:
      const y = GROUND_Y - (PLAYER_DRAW_H * 0.78); // tweak 0.72–0.85 if needed

      obstacles.push({
        kind: "overhead",
        type,
        img,
        lane,
        x,
        y,
        w: drawW,
        h: drawH
      });
      return;
    }

    const type = groundObstacleTypes[Math.floor(Math.random() * groundObstacleTypes.length)];
    const img = images[`ob_${type}`];

    const drawW = 140 + Math.random() * 20;
    const drawH = 140 + Math.random() * 20;
    const x = laneToX(lane) + (PLAYER_DRAW_W - drawW) / 2;

    obstacles.push({
      kind: "ground",
      type,
      img,
      lane,
      x,
      y: GROUND_Y - drawH,
      w: drawW,
      h: drawH
    });
  }

  // =========================
  // UI RECTS
  // =========================
  function layoutButtons() {
    const w = 255;
    const h = 110;
    const pad = 28;
    const bottom = CANVAS_H - pad - h;

    slideBtnRect = { x: pad, y: bottom, w, h };
    jumpBtnRect  = { x: CANVAS_W - pad - w, y: bottom, w, h };
  }

  function layoutStartButton() {
    // hit area over your start.png’s start button
    const w = 360;
    const h = 140;
    const x = (CANVAS_W - w) / 2;
    const y = 900; // adjust if your start button graphic is elsewhere
    startBtnRect = { x, y, w, h };
  }

  // =========================
  // Animations
  // =========================
  const anims = {
    run:  { frames: () => images.run,  fps: 10, loop: true },
    jump: { frames: () => images.jump, fps: 12, loop: false },
    slide:{ frames: () => images.slide,fps: 12, loop: true }
  };

  function getAnimFrame(mode, t) {
    const a = anims[mode] || anims.run;
    const frames = a.frames();
    const idx = Math.floor(t * a.fps);
    if (a.loop) return frames[idx % frames.length];
    return frames[Math.min(idx, frames.length - 1)];
  }

  // =========================
  // HITBOXES (tuned for 35x53 scaled)
  // =========================
  function playerHitbox() {
    const w = PLAYER_DRAW_W * 0.55;
    const h = (player.mode === "slide") ? PLAYER_DRAW_H * 0.30 : PLAYER_DRAW_H * 0.70;
    const x = player.x + (PLAYER_DRAW_W - w) / 2;
    const y = player.y - h;
    return { x, y, w, h };
  }

  function obstacleHitbox(ob) {
    if (ob.kind === "overhead") {
      // bottom band of overhead bar
      const w = ob.w * 0.90;
      const h = ob.h * 0.45;
      const x = ob.x + (ob.w - w) / 2;
      const y = ob.y + ob.h * 0.55;
      return { x, y, w, h };
    }

    const w = ob.w * 0.75;
    const h = ob.h * 0.75;
    const x = ob.x + (ob.w - w) / 2;
    const y = ob.y + (ob.h - h);
    return { x, y, w, h };
  }

  function intersects(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // =========================
  // RESET
  // =========================
  function resetGame() {
    speed = START_SPEED;
    score = 0;
    roadOffset = 0;

    player.lane = 1;
    player.x = laneToX(1);
    player.y = GROUND_Y;
    player.vy = 0;
    player.onGround = true;
    player.mode = "run";
    player.animT = 0;
    player.slideT = 0;

    obstacles.length = 0;
    spawnT = 0;
    nextSpawn = rand(SPAWN_MIN, SPAWN_MAX);

    input.swipeLeft = false;
    input.swipeRight = false;
    input.tapped = false;
  }

  // =========================
  // DRAW
  // =========================
  function drawBackground() {
    ctx.drawImage(images.background, 0, 0, CANVAS_W, CANVAS_H);
  }

  function drawRoad(dt) {
    roadOffset -= speed * dt;
    if (roadOffset <= -ROAD_TILE_DRAW_W) roadOffset += ROAD_TILE_DRAW_W;

    for (let i = -1; i < Math.ceil(CANVAS_W / ROAD_TILE_DRAW_W) + 2; i++) {
      const x = Math.floor(roadOffset + i * ROAD_TILE_DRAW_W);
      ctx.drawImage(images.road, x, ROAD_STRIP_Y, ROAD_TILE_DRAW_W, ROAD_STRIP_H);
    }
  }

  function drawPlayer() {
    const img = getAnimFrame(player.mode, player.animT);
    ctx.drawImage(
      img,
      Math.round(player.x),
      Math.round(player.y - PLAYER_DRAW_H),
      PLAYER_DRAW_W,
      PLAYER_DRAW_H
    );
  }

  function drawObstacles() {
    for (const ob of obstacles) {
      ctx.drawImage(ob.img, Math.round(ob.x), Math.round(ob.y), ob.w, ob.h);
    }
  }

  function drawUI() {
    ctx.drawImage(images.slideBtn, slideBtnRect.x, slideBtnRect.y, slideBtnRect.w, slideBtnRect.h);
    ctx.drawImage(images.jumpBtn,  jumpBtnRect.x,  jumpBtnRect.y,  jumpBtnRect.w,  jumpBtnRect.h);

    ctx.font = "48px system-ui";
    ctx.fillStyle = "white";
    ctx.strokeStyle = "black";
    ctx.lineWidth = 6;
    const txt = `${Math.floor(score)}`;
    ctx.strokeText(txt, 28, 70);
    ctx.fillText(txt, 28, 70);
  }

  function drawStartScreen() {
    ctx.drawImage(images.start, 0, 0, CANVAS_W, CANVAS_H);
  }

  function drawGameOverScreen() {
    ctx.drawImage(images.gameOver, 0, 0, CANVAS_W, CANVAS_H);
  }

  // =========================
  // UPDATE (PLAY)
  // =========================
  function updatePlay(dt) {
    speed += SPEED_RAMP * dt;
    score += speed * dt * 0.02;

    // lane switching
    if (input.swipeLeft) {
      player.lane = Math.max(0, player.lane - 1);
      input.swipeLeft = false;
    }
    if (input.swipeRight) {
      player.lane = Math.min(LANES - 1, player.lane + 1);
      input.swipeRight = false;
    }

    // smooth move to lane
    const targetX = laneToX(player.lane);
    player.x += (targetX - player.x) * Math.min(1, LANE_SNAP * dt);

    // jump
    if (input.jump && player.onGround && player.mode !== "slide") {
      player.vy = JUMP_VELOCITY;
      player.onGround = false;
      player.mode = "jump";
      player.animT = 0;
    }

    // slide
    if (input.slide && player.onGround && player.mode !== "slide") {
      player.mode = "slide";
      player.slideT = SLIDE_DURATION;
      player.animT = 0;
    }

    if (player.mode === "slide") {
      player.slideT -= dt;
      if (player.slideT <= 0) {
        player.mode = "run";
        player.animT = 0;
      }
    }

    // physics
    player.vy += GRAVITY * dt;
    player.y += player.vy * dt;

    if (player.y >= GROUND_Y) {
      player.y = GROUND_Y;
      player.vy = 0;
      if (!player.onGround) {
        player.onGround = true;
        if (player.mode === "jump") {
          player.mode = "run";
          player.animT = 0;
        }
      }
      player.onGround = true;
    } else {
      player.onGround = false;
    }

    // animate
    player.animT += dt;

    // spawn obstacles
    spawnT += dt;
    if (spawnT >= nextSpawn) {
      spawnT = 0;
      nextSpawn = rand(SPAWN_MIN, SPAWN_MAX);
      spawnObstacle();
    }

    // move obstacles
    for (const ob of obstacles) ob.x -= speed * dt;

    // remove offscreen
    while (obstacles.length && obstacles[0].x < -450) obstacles.shift();

    // collision
    const pbox = playerHitbox();
    for (const ob of obstacles) {
      const obox = obstacleHitbox(ob);
      if (intersects(pbox, obox)) {
        state = STATE.GAMEOVER;
        break;
      }
    }
  }

  // =========================
  // MAIN LOOP
  // =========================
  let last = performance.now();

  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    if (state === STATE.LOADING) {
      ctx.fillStyle = "white";
      ctx.font = "40px system-ui";
      ctx.fillText("Loading...", 40, 80);

    } else if (state === STATE.START) {
      drawStartScreen();
      layoutStartButton();

      if (input.tapped) {
        const p = { x: input.tapX, y: input.tapY };
        input.tapped = false;

        if (inRect(p, startBtnRect)) {
          resetGame();
          state = STATE.PLAY;
        }
      }

    } else if (state === STATE.PLAY) {
      drawBackground();
      drawRoad(dt);
      updatePlay(dt);
      drawObstacles();
      drawPlayer();
      layoutButtons();
      drawUI();

    } else if (state === STATE.GAMEOVER) {
      drawGameOverScreen();
      if (input.tapped) {
        input.tapped = false;
        resetGame();
        state = STATE.PLAY;
      }
    }

    requestAnimationFrame(loop);
  }

  // =========================
  // INIT
  // =========================
  layoutButtons();
  layoutStartButton();

  loadAll()
    .then(() => {
      state = STATE.START;
      requestAnimationFrame(loop);
    })
    .catch((err) => {
      console.error(err);
      ctx.fillStyle = "red";
      ctx.font = "24px system-ui";
      ctx.fillText("Asset load error (check filenames/case)", 20, 120);
    });
})();
