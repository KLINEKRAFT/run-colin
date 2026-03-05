(() => {
  // =========================
  // CONFIG
  // =========================
  const CANVAS_W = 720;
  const CANVAS_H = 1280;

  // Your real per-frame runner size
  const PLAYER_SRC_W = 35;
  const PLAYER_SRC_H = 53;

  // Scale up for phone readability
  const PLAYER_SCALE = 4;                 // 35x53 -> 140x212
  const PLAYER_DRAW_W = PLAYER_SRC_W * PLAYER_SCALE;
  const PLAYER_DRAW_H = PLAYER_SRC_H * PLAYER_SCALE;

  // Ground (feet line)
  const GROUND_Y = 1020;                  // tweak 980–1040

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
  const LANE_GAP = 175;                   // tweak 155–190
  const LANE_SNAP = 20;

  // Spawning
  const SPAWN_MIN = 0.70;
  const SPAWN_MAX = 1.10;
  const OVERHEAD_CHANCE = 0.38;

  // Road drawing
  const ROAD_TILE_DRAW_W = 256;
  const ROAD_STRIP_Y = GROUND_Y - 90;
  const ROAD_STRIP_H = CANVAS_H - ROAD_STRIP_Y;

  // Lives / damage
  const MAX_LIVES = 3;
  const HIT_IFRAME = 0.85; // seconds of invincibility after a hit

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
          if (key === "ob_lowbar") hasLowBar = false; // optional
          else throw e;
        }
      }
    }
  }

  // =========================
  // INPUT (touch + swipe + keyboard)
  // =========================
  const input = {
    jumpHeld: false,
    slideHeld: false,

    justReleased: false,
    releaseX: 0,
    releaseY: 0,

    swipeLeft: false,
    swipeRight: false,
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

  function inRect(p, r) {
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }

  // Swipe detection
  let touchStart = null;
  const SWIPE_MIN = 55;
  const SWIPE_MAX_Y = 65;

  function onDown(e) {
    e.preventDefault();
    const p = pointerPos(e);

    // held buttons (only matter during PLAY)
    if (state === STATE.PLAY && !paused) {
      input.jumpHeld = inRect(p, jumpBtnRect);
      input.slideHeld = inRect(p, slideBtnRect);
    }

    const onButton = (state === STATE.PLAY && !paused) && (input.jumpHeld || input.slideHeld);
    touchStart = { x: p.x, y: p.y, onButton };
  }

  function onUp(e) {
    e.preventDefault();
    const p = pointerPosEnd(e);

    // register a single "click/tap" for UI screens
    input.justReleased = true;
    input.releaseX = p.x;
    input.releaseY = p.y;

    // swipe (lane change) only during PLAY and not paused
    if (touchStart && !touchStart.onButton && state === STATE.PLAY && !paused) {
      const dx = p.x - touchStart.x;
      const dy = p.y - touchStart.y;
      if (Math.abs(dx) >= SWIPE_MIN && Math.abs(dy) <= SWIPE_MAX_Y) {
        if (dx < 0) input.swipeLeft = true;
        if (dx > 0) input.swipeRight = true;
      }
    }

    input.jumpHeld = false;
    input.slideHeld = false;
    touchStart = null;
  }

  canvas.addEventListener("touchstart", onDown, { passive: false });
  canvas.addEventListener("touchend", onUp, { passive: false });
  canvas.addEventListener("mousedown", onDown);
  window.addEventListener("mouseup", onUp);

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp") input.jumpHeld = true;
    if (e.code === "ArrowDown") input.slideHeld = true;
    if (e.code === "ArrowLeft") input.swipeLeft = true;
    if (e.code === "ArrowRight") input.swipeRight = true;
    if (e.code === "KeyP") togglePause();
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp") input.jumpHeld = false;
    if (e.code === "ArrowDown") input.slideHeld = false;
  });

  // =========================
  // GAME STATE
  // =========================
  const STATE = { LOADING: "loading", START: "start", PLAY: "play", GAMEOVER: "gameover" };
  let state = STATE.LOADING;

  let paused = false;

  let speed = START_SPEED;
  let score = 0;
  let roadOffset = 0;

  let lives = MAX_LIVES;
  let iFrameT = 0; // invulnerability timer

  // =========================
  // UI RECTS
  // =========================
  let jumpBtnRect = { x: 0, y: 0, w: 0, h: 0 };
  let slideBtnRect = { x: 0, y: 0, w: 0, h: 0 };

  // Start button hit area (must tap this to start)
  let startBtnRect = { x: 0, y: 0, w: 0, h: 0 };

  // Game over home button hit area (tap to go title)
  let homeBtnRect = { x: 0, y: 0, w: 0, h: 0 };

  // Pause button rect (top-right)
  let pauseBtnRect = { x: 0, y: 0, w: 0, h: 0 };

  function layoutButtons() {
    // your image buttons roughly ~255x110
    const w = 255;
    const h = 110;
    const pad = 28;
    const bottom = CANVAS_H - pad - h;

    slideBtnRect = { x: pad, y: bottom, w, h };
    jumpBtnRect  = { x: CANVAS_W - pad - w, y: bottom, w, h };

    // pause button: small square top-right
    pauseBtnRect = { x: CANVAS_W - 28 - 72, y: 24, w: 72, h: 72 };
  }

  function layoutStartButton() {
    // IMPORTANT: this is why your start was triggering anywhere.
    // Make this smaller and positioned where the START graphic is in start.png.
    // If it still doesn't line up, adjust y and maybe w/h.
    const w = 360;
    const h = 150;
    const x = (CANVAS_W - w) / 2;
    const y = 900; // tweak to match your art
    startBtnRect = { x, y, w, h };
  }

  function layoutGameOverButtons() {
    // Home button hit area (wherever the "home" icon is on your game_over.png)
    // Default: bottom-left region.
    const w = 220;
    const h = 120;
    const x = 40;
    const y = 1040; // tweak to match your art
    homeBtnRect = { x, y, w, h };
  }

  // =========================
  // Player (3 lanes)
  // =========================
  function laneToX(lane) {
    const startCenter = LANE_CENTER_X - LANE_GAP; // lane 0 center
    const laneCenter = startCenter + lane * LANE_GAP;
    return laneCenter - PLAYER_DRAW_W * 0.5;
  }

  const player = {
    lane: 1,
    x: laneToX(1),
    y: GROUND_Y,
    vy: 0,
    onGround: true,
    mode: "run",  // run/jump/slide
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

      // low_bar is ~128x56; draw it wide to read as "slide under"
      const drawW = 260;
      const drawH = 114;

      const x = laneToX(lane) + (PLAYER_DRAW_W - drawW) / 2;
      const y = GROUND_Y - (PLAYER_DRAW_H * 0.78); // tweak 0.72–0.85

      obstacles.push({ kind: "overhead", type, img, lane, x, y, w: drawW, h: drawH });
      return;
    }

    const type = groundObstacleTypes[Math.floor(Math.random() * groundObstacleTypes.length)];
    const img = images[`ob_${type}`];

    const drawW = 140 + Math.random() * 20;
    const drawH = 140 + Math.random() * 20;

    const x = laneToX(lane) + (PLAYER_DRAW_W - drawW) / 2;

    obstacles.push({ kind: "ground", type, img, lane, x, y: GROUND_Y - drawH, w: drawW, h: drawH });
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
  // HITBOXES / COLLISION
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
      // bottom band of the low bar
      const w = ob.w * 0.90;
      const h = ob.h * 0.45;
      const x = ob.x + (ob.w - w) / 2;
      const y = ob.y + ob.h * 0.55;
      return { x, y, w, h };
    }
    // ground obstacle
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
  // PAUSE
  // =========================
  function togglePause() {
    if (state !== STATE.PLAY) return;
    paused = !paused;
    // clear held buttons so it doesn't “auto jump” when resuming
    input.jumpHeld = false;
    input.slideHeld = false;
  }

  // =========================
  // RESET
  // =========================
  function resetGame() {
    paused = false;

    speed = START_SPEED;
    score = 0;
    roadOffset = 0;

    lives = MAX_LIVES;
    iFrameT = 0;

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
    input.justReleased = false;
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

    // brief “blink” while invincible
    const blinking = iFrameT > 0 && Math.floor(iFrameT * 14) % 2 === 0;
    if (blinking) ctx.globalAlpha = 0.55;

    ctx.drawImage(img, Math.round(player.x), Math.round(player.y - PLAYER_DRAW_H), PLAYER_DRAW_W, PLAYER_DRAW_H);
    ctx.globalAlpha = 1;
  }

  function drawObstacles() {
    for (const ob of obstacles) {
      ctx.drawImage(ob.img, Math.round(ob.x), Math.round(ob.y), ob.w, ob.h);
    }
  }

  function drawPauseButton() {
    // Draw a simple pause icon (no asset needed)
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(pauseBtnRect.x, pauseBtnRect.y, pauseBtnRect.w, pauseBtnRect.h);

    ctx.fillStyle = "white";
    const pad = 18;
    const barW = 10;
    const barH = pauseBtnRect.h - pad * 2;
    ctx.fillRect(pauseBtnRect.x + pad, pauseBtnRect.y + pad, barW, barH);
    ctx.fillRect(pauseBtnRect.x + pauseBtnRect.w - pad - barW, pauseBtnRect.y + pad, barW, barH);
  }

  function drawHUD() {
    // SCORE (top-left)
    ctx.font = "44px system-ui";
    ctx.fillStyle = "white";
    ctx.strokeStyle = "black";
    ctx.lineWidth = 6;

    const s = `Score ${Math.floor(score)}`;
    ctx.strokeText(s, 24, 62);
    ctx.fillText(s, 24, 62);

    // LIFE BAR (top-center)
    const barW = 260;
    const barH = 22;
    const x = (CANVAS_W - barW) / 2;
    const y = 30;

    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(x - 6, y - 6, barW + 12, barH + 12);

    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fillRect(x, y, barW, barH);

    const pct = Math.max(0, lives / MAX_LIVES);
    ctx.fillStyle = "rgba(255,80,80,0.95)";
    ctx.fillRect(x, y, Math.floor(barW * pct), barH);

    // Lives text
    ctx.font = "22px system-ui";
    ctx.fillStyle = "white";
    ctx.strokeStyle = "black";
    ctx.lineWidth = 4;
    const lt = `${lives}/${MAX_LIVES}`;
    ctx.strokeText(lt, x + barW + 14, y + 18);
    ctx.fillText(lt, x + barW + 14, y + 18);

    // Pause icon
    drawPauseButton();
  }

  function drawUIButtons() {
    ctx.drawImage(images.slideBtn, slideBtnRect.x, slideBtnRect.y, slideBtnRect.w, slideBtnRect.h);
    ctx.drawImage(images.jumpBtn,  jumpBtnRect.x,  jumpBtnRect.y,  jumpBtnRect.w,  jumpBtnRect.h);
  }

  function drawPausedOverlay() {
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = "white";
    ctx.font = "72px system-ui";
    ctx.strokeStyle = "black";
    ctx.lineWidth = 10;
    const t = "PAUSED";
    const w = ctx.measureText(t).width;
    ctx.strokeText(t, (CANVAS_W - w)/2, 520);
    ctx.fillText(t, (CANVAS_W - w)/2, 520);

    ctx.font = "28px system-ui";
    const t2 = "Tap pause to resume";
    const w2 = ctx.measureText(t2).width;
    ctx.strokeText(t2, (CANVAS_W - w2)/2, 580);
    ctx.fillText(t2, (CANVAS_W - w2)/2, 580);
  }

  function drawStartScreen() {
    ctx.drawImage(images.start, 0, 0, CANVAS_W, CANVAS_H);
    // Debug outline (uncomment if you need to line up start tap area)
    // ctx.strokeStyle = "rgba(255,255,255,0.4)";
    // ctx.lineWidth = 5;
    // ctx.strokeRect(startBtnRect.x, startBtnRect.y, startBtnRect.w, startBtnRect.h);
  }

  function drawGameOverScreen() {
    ctx.drawImage(images.gameOver, 0, 0, CANVAS_W, CANVAS_H);
    // Debug outline (uncomment if you need to line up home area)
    // ctx.strokeStyle = "rgba(255,255,255,0.4)";
    // ctx.lineWidth = 5;
    // ctx.strokeRect(homeBtnRect.x, homeBtnRect.y, homeBtnRect.w, homeBtnRect.h);
  }

  // =========================
  // UPDATE (PLAY)
  // =========================
  function updatePlay(dt) {
    // invincibility timer
    if (iFrameT > 0) iFrameT = Math.max(0, iFrameT - dt);

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

    // smooth lane snap
    const targetX = laneToX(player.lane);
    player.x += (targetX - player.x) * Math.min(1, LANE_SNAP * dt);

    // jump
    if (input.jumpHeld && player.onGround && player.mode !== "slide") {
      player.vy = JUMP_VELOCITY;
      player.onGround = false;
      player.mode = "jump";
      player.animT = 0;
    }

    // slide
    if (input.slideHeld && player.onGround && player.mode !== "slide") {
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
      player.onGround = true;
      if (player.mode === "jump") {
        player.mode = "run";
        player.animT = 0;
      }
    } else {
      player.onGround = false;
    }

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

    // collisions -> damage system (3 hits)
    if (iFrameT <= 0) {
      const pbox = playerHitbox();
      for (const ob of obstacles) {
        const obox = obstacleHitbox(ob);
        if (intersects(pbox, obox)) {
          lives -= 1;
          iFrameT = HIT_IFRAME;

          // optional: remove the obstacle you hit so it doesn't instantly hit again
          ob.x = -9999;

          if (lives <= 0) {
            state = STATE.GAMEOVER;
          }
          break;
        }
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

    // handle UI "clicks"
    const click = input.justReleased ? { x: input.releaseX, y: input.releaseY } : null;
    input.justReleased = false;

    if (state === STATE.LOADING) {
      ctx.fillStyle = "white";
      ctx.font = "40px system-ui";
      ctx.fillText("Loading...", 40, 80);
    }

    if (state === STATE.START) {
      layoutStartButton();
      drawStartScreen();

      // ONLY start if you tapped the Start button area
      if (click && inRect(click, startBtnRect)) {
        resetGame();
        state = STATE.PLAY;
      }
      requestAnimationFrame(loop);
      return;
    }

    if (state === STATE.PLAY) {
      layoutButtons();

      // Pause button click
      if (click && inRect(click, pauseBtnRect)) {
        togglePause();
      }

      drawBackground();
      drawRoad(paused ? 0 : dt);

      if (!paused) {
        updatePlay(dt);
      }

      drawObstacles();
      drawPlayer();
      drawHUD();
      drawUIButtons();

      if (paused) drawPausedOverlay();

      requestAnimationFrame(loop);
      return;
    }

    if (state === STATE.GAMEOVER) {
      layoutGameOverButtons();
      drawGameOverScreen();

      // Tap HOME -> back to title
      if (click && inRect(click, homeBtnRect)) {
        state = STATE.START;
      } else if (click) {
        // Tap anywhere else -> retry (optional behavior)
        resetGame();
        state = STATE.PLAY;
      }

      requestAnimationFrame(loop);
      return;
    }

    requestAnimationFrame(loop);
  }

  // =========================
  // INIT
  // =========================
  layoutButtons();
  layoutStartButton();
  layoutGameOverButtons();

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
