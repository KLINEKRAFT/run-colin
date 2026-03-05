(() => {
  // =========================
  // CONFIG
  // =========================
  const CANVAS_W = 720;
  const CANVAS_H = 1280;

  const PLAYER_DRAW_W = 160;
  const PLAYER_DRAW_H = 160;

  const ROAD_TILE_SRC_W = 128;
  const ROAD_TILE_SRC_H = 128;

  const GROUND_Y = 1000;

  const GRAVITY = 3200;
  const JUMP_VELOCITY = -1200;
  const SLIDE_DURATION = 0.55;

  const START_SPEED = 520;
  const SPEED_RAMP = 10;

  const SPAWN_MIN = 0.8;
  const SPAWN_MAX = 1.45;

  // =========================
  // CANVAS
  // =========================
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  // =========================
  // ASSET LOADING
  // =========================
  const ASSET_DIR = "assets/"; // <— IMPORTANT CHANGE

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
      hydrant:  ASSET_DIR + "hydrant.png"
    }
  };

  const images = {};

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
        images[key] = await loadImage(value);
      }
    }
  }

  // =========================
  // INPUT (touch + keyboard)
  // =========================
  const input = { jump: false, slide: false, tapped: false };

  function pointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    const isTouch = !!e.touches;
    const clientX = isTouch ? e.touches[0].clientX : e.clientX;
    const clientY = isTouch ? e.touches[0].clientY : e.clientY;
    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);
    return { x, y };
  }

  let jumpBtnRect = { x: 0, y: 0, w: 0, h: 0 };
  let slideBtnRect = { x: 0, y: 0, w: 0, h: 0 };

  function inRect(p, r) {
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }

  function onDown(e) {
    e.preventDefault();
    input.tapped = true;

    const p = pointerPos(e);
    input.jump = inRect(p, jumpBtnRect);
    input.slide = inRect(p, slideBtnRect);
  }
  function onUp(e) {
    e.preventDefault();
    input.jump = false;
    input.slide = false;
  }

  canvas.addEventListener("touchstart", onDown, { passive: false });
  canvas.addEventListener("touchend", onUp, { passive: false });
  canvas.addEventListener("mousedown", onDown);
  window.addEventListener("mouseup", onUp);

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp") input.jump = true;
    if (e.code === "ArrowDown") input.slide = true;
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

  const player = {
    x: 160,
    y: GROUND_Y,
    vy: 0,
    onGround: true,
    mode: "run", // idle/run/jump/slide
    animT: 0,
    slideT: 0
  };

  const obstacles = [];
  let spawnT = 0;
  let nextSpawn = rand(SPAWN_MIN, SPAWN_MAX);

  function rand(a, b) { return a + Math.random() * (b - a); }

  function resetGame() {
    speed = START_SPEED;
    score = 0;
    roadOffset = 0;

    player.y = GROUND_Y;
    player.vy = 0;
    player.onGround = true;
    player.mode = "run";
    player.animT = 0;
    player.slideT = 0;

    obstacles.length = 0;
    spawnT = 0;
    nextSpawn = rand(SPAWN_MIN, SPAWN_MAX);
  }

  // =========================
  // ANIMATION HELPERS
  // =========================
  const anims = {
    idle: { frames: () => images.idle, fps: 6, loop: true },
    run:  { frames: () => images.run,  fps: 10, loop: true },
    jump: { frames: () => images.jump, fps: 12, loop: false },
    slide:{ frames: () => images.slide,fps: 12, loop: true }
  };

  function getAnimFrame(mode, t) {
    const a = anims[mode];
    const frames = a.frames();
    const idx = Math.floor(t * a.fps);

    if (a.loop) return frames[idx % frames.length];
    return frames[Math.min(idx, frames.length - 1)];
  }

  // =========================
  // COLLISION BOXES
  // =========================
  function playerHitbox() {
    // Smaller than sprite for fair collisions
    const w = PLAYER_DRAW_W * 0.55;
    const h = (player.mode === "slide") ? PLAYER_DRAW_H * 0.35 : PLAYER_DRAW_H * 0.65;
    const x = player.x + (PLAYER_DRAW_W - w) / 2;
    const y = player.y - h; // anchored at feet
    return { x, y, w, h };
  }

  function obstacleHitbox(ob) {
    // obstacles are drawn 128px tall-ish, but we keep hitbox reasonable
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
  // SPAWN OBSTACLES
  // =========================
  const obstacleTypes = ["crate","cone","trashcan","hydrant"];

  function spawnObstacle() {
    const type = obstacleTypes[Math.floor(Math.random() * obstacleTypes.length)];
    const img = images[`ob_${type}`];

    // Draw obstacles larger than 64px for phone readability
    const drawW = 140;
    const drawH = 140;

    obstacles.push({
      type,
      img,
      x: CANVAS_W + 100,
      y: GROUND_Y - drawH,
      w: drawW,
      h: drawH
    });
  }

  // =========================
  // UI BUTTON RECTS
  // =========================
  function layoutButtons() {
    // You said buttons are about 255x109 (close enough)
    const w = 255;
    const h = 110;

    const pad = 28;
    const bottom = CANVAS_H - pad - h;

    slideBtnRect = { x: pad, y: bottom, w, h };
    jumpBtnRect  = { x: CANVAS_W - pad - w, y: bottom, w, h };
  }

  // =========================
  // DRAW
  // =========================
  function drawBackground() {
    ctx.drawImage(images.background, 0, 0, CANVAS_W, CANVAS_H);
  }

  function drawRoad(dt) {
    // Repeat the road tile across the width
    // We draw it as a strip at the bottom area
    const stripY = GROUND_Y - 80;         // adjust to match your background road position
    const stripH = CANVAS_H - stripY;

    // Move road
    roadOffset -= speed * dt;
    const tileW = 256; // draw size per tile (bigger than src)
    const tileH = 256;

    if (roadOffset <= -tileW) roadOffset += tileW;

    for (let i = -1; i < Math.ceil(CANVAS_W / tileW) + 2; i++) {
      const x = Math.floor(roadOffset + i * tileW);
      ctx.drawImage(images.road, x, stripY, tileW, stripH);
    }
  }

  function drawPlayer(dt) {
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
    // Buttons
    ctx.drawImage(images.slideBtn, slideBtnRect.x, slideBtnRect.y, slideBtnRect.w, slideBtnRect.h);
    ctx.drawImage(images.jumpBtn,  jumpBtnRect.x,  jumpBtnRect.y,  jumpBtnRect.w,  jumpBtnRect.h);

    // Minimal score text (optional). Remove if you truly want none.
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
  // UPDATE
  // =========================
  function updatePlay(dt) {
    // ramp speed
    speed += SPEED_RAMP * dt;

    // score by distance
    score += speed * dt * 0.02;

    // input actions
    if (input.jump && player.onGround && player.mode !== "slide") {
      player.vy = JUMP_VELOCITY;
      player.onGround = false;
      player.mode = "jump";
      player.animT = 0;
    }

    if (input.slide && player.onGround && player.mode !== "slide") {
      player.mode = "slide";
      player.slideT = SLIDE_DURATION;
      player.animT = 0;
    }

    // slide timer
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

    // if jumping animation finished, keep last frame until landing
    if (!player.onGround && player.mode !== "jump") {
      player.mode = "jump";
    }
    if (player.onGround && player.mode === "jump") {
      player.mode = "run";
      player.animT = 0;
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
    while (obstacles.length && obstacles[0].x < -300) obstacles.shift();

    // collisions
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
      // simple loading screen
      ctx.fillStyle = "white";
      ctx.font = "40px system-ui";
      ctx.fillText("Loading...", 40, 80);

    } else if (state === STATE.START) {
      drawStartScreen();
      // tap anywhere to start
      if (input.tapped) {
        input.tapped = false;
        resetGame();
        state = STATE.PLAY;
      }

    } else if (state === STATE.PLAY) {
      drawBackground();
      drawRoad(dt);
      updatePlay(dt);
      drawObstacles();
      drawPlayer(dt);
      layoutButtons();
      drawUI();

    } else if (state === STATE.GAMEOVER) {
      drawGameOverScreen();
      // tap anywhere to retry
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

  loadAll()
    .then(() => {
      state = STATE.START;
      requestAnimationFrame(loop);
    })
    .catch((err) => {
      console.error(err);
      state = STATE.LOADING;
      ctx.fillStyle = "red";
      ctx.font = "24px system-ui";
      ctx.fillText("Asset load error (check filenames/case)", 20, 120);
    });

})();