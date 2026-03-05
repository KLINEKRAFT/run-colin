(() => {
  // =========================
  // CONFIG
  // =========================
  const CANVAS_W = 720;
  const CANVAS_H = 1280;
  const PLAYER_SRC_W = 35;
  const PLAYER_SRC_H = 53;
  const PLAYER_SCALE = 4;
  const PLAYER_DRAW_W = PLAYER_SRC_W * PLAYER_SCALE;
  const PLAYER_DRAW_H = PLAYER_SRC_H * PLAYER_SCALE;
  const GROUND_Y = 1020;
  const GRAVITY = 3400;
  const JUMP_VELOCITY = -1300;
  const SLIDE_DURATION = 0.55;
  const START_SPEED = 600;
  const SPEED_RAMP = 16;
  const LANES = 3;
  const LANE_CENTER_X = CANVAS_W * 0.5;
  const LANE_GAP = 175;
  const LANE_SNAP = 20;
  const SPAWN_MIN = 0.70;
  const SPAWN_MAX = 1.10;
  const OVERHEAD_CHANCE = 0.38;
  const ROAD_TILE_DRAW_W = 256;
  const ROAD_STRIP_Y = GROUND_Y - 90;
  const ROAD_STRIP_H = CANVAS_H - ROAD_STRIP_Y;
  const MAX_LIVES = 3;
  const HIT_IFRAME = 0.85;

  // =========================
  // CANVAS & UTILS
  // =========================
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  // Cache rect for input to avoid calling getBoundingClientRect every frame
  let canvasRect = canvas.getBoundingClientRect();
  window.addEventListener('resize', () => {
    canvasRect = canvas.getBoundingClientRect();
  });

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
    road: ASSET_DIR + "road.png",
    start: ASSET_DIR + "start.png",
    gameOver: ASSET_DIR + "game_over.png",
    jumpBtn: ASSET_DIR + "jump_button.png",
    slideBtn: ASSET_DIR + "slide_button.png",
    idle: [1, 2, 3, 4].map(n => ASSET_DIR + `idle_${n}.png`),
    run: [1, 2, 3, 4].map(n => ASSET_DIR + `run_${n}.png`),
    jump: [1, 2, 3, 4].map(n => ASSET_DIR + `jump_${n}.png`),
    slide: [1, 2, 3].map(n => ASSET_DIR + `slide_${n}.png`),
    obstacles: {
      crate: ASSET_DIR + "crate.png",
      cone: ASSET_DIR + "cone.png",
      trashcan: ASSET_DIR + "trashcan.png",
      hydrant: ASSET_DIR + "hydrant.png",
      lowbar: ASSET_DIR + "low_bar.png"
    }
  };

  const images = {};
  let hasLowBar = false;

  async function loadAll() {
    const entries = [];
    ["background", "road", "start", "gameOver", "jumpBtn", "slideBtn"].forEach((k) => {
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
  // INPUT
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
    // Use cached canvasRect
    const x = (clientX - canvasRect.left) * (CANVAS_W / canvasRect.width);
    const y = (clientY - canvasRect.top) * (CANVAS_H / canvasRect.height);
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

  let touchStart = null;
  const SWIPE_MIN = 55;
  const SWIPE_MAX_Y = 65;

  function onDown(e) {
    if (e.cancelable) e.preventDefault();
    const p = pointerPos(e);
    if (state === STATE.PLAY && !paused) {
      input.jumpHeld = inRect(p, jumpBtnRect);
      input.slideHeld = inRect(p, slideBtnRect);
    }
    const onButton = (state === STATE.PLAY && !paused) && (input.jumpHeld || input.slideHeld);
    touchStart = { x: p.x, y: p.y, onButton };
  }

  function onUp(e) {
    if (e.cancelable) e.preventDefault();
    const p = pointerPosEnd(e);
    input.justReleased = true;
    input.releaseX = p.x;
    input.releaseY = p.y;
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
  // GAME STATE & RECTS
  // =========================
  const STATE = { LOADING: "loading", START: "start", PLAY: "play", GAMEOVER: "gameover" };
  let state = STATE.LOADING;
  let paused = false;
  let speed = START_SPEED;
  let score = 0;
  let roadOffset = 0;
  let lives = MAX_LIVES;
  let iFrameT = 0;

  let jumpBtnRect, slideBtnRect, startBtnRect, homeBtnRect, pauseBtnRect;

  function initLayouts() {
    const w = 255;
    const h = 110;
    const pad = 28;
    const bottom = CANVAS_H - pad - h;
    slideBtnRect = { x: pad, y: bottom, w, h };
    jumpBtnRect = { x: CANVAS_W - pad - w, y: bottom, w, h };
    pauseBtnRect = { x: CANVAS_W - 28 - 72, y: 24, w: 72, h: 72 };

    const sw = 360, sh = 150;
    startBtnRect = { x: (CANVAS_W - sw) / 2, y: 900, w: sw, h: sh };

    const hw = 220, hh = 120;
    homeBtnRect = { x: 40, y: 1040, w: hw, h: hh };
  }

  function laneToX(lane) {
    const startCenter = LANE_CENTER_X - LANE_GAP;
    return (startCenter + lane * LANE_GAP) - PLAYER_DRAW_W * 0.5;
  }

  const player = {
    lane: 1, x: laneToX(1), y: GROUND_Y, vy: 0,
    onGround: true, mode: "run", animT: 0, slideT: 0
  };

  const obstacles = [];
  let spawnT = 0;
  let nextSpawn = 0;
  const rand = (a, b) => a + Math.random() * (b - a);
  const groundObstacleTypes = ["crate", "cone", "trashcan", "hydrant"];

  function spawnObstacle() {
    const lane = Math.floor(Math.random() * LANES);
    const doOverhead = Math.random() < OVERHEAD_CHANCE;
    if (doOverhead) {
      const type = hasLowBar ? "lowbar" : "cone";
      const img = images[`ob_${type}`];
      const drawW = 260, drawH = 114;
      const x = laneToX(lane) + (PLAYER_DRAW_W - drawW) / 2;
      const y = GROUND_Y - (PLAYER_DRAW_H * 0.78);
      obstacles.push({ kind: "overhead", type, img, lane, x, y, w: drawW, h: drawH });
    } else {
      const type = groundObstacleTypes[Math.floor(Math.random() * groundObstacleTypes.length)];
      const img = images[`ob_${type}`];
      const drawW = 140 + Math.random() * 20, drawH = 140 + Math.random() * 20;
      const x = laneToX(lane) + (PLAYER_DRAW_W - drawW) / 2;
      obstacles.push({ kind: "ground", type, img, lane, x, y: GROUND_Y - drawH, w: drawW, h: drawH });
    }
  }

  const anims = {
    run: { frames: () => images.run, fps: 10, loop: true },
    jump: { frames: () => images.jump, fps: 12, loop: false },
    slide: { frames: () => images.slide, fps: 12, loop: true }
  };

  function getAnimFrame(mode, t) {
    const a = anims[mode] || anims.run;
    const frames = a.frames();
    const idx = Math.floor(t * a.fps);
    return a.loop ? frames[idx % frames.length] : frames[Math.min(idx, frames.length - 1)];
  }

  function playerHitbox() {
    const w = PLAYER_DRAW_W * 0.55;
    const h = (player.mode === "slide") ? PLAYER_DRAW_H * 0.30 : PLAYER_DRAW_H * 0.70;
    return { x: player.x + (PLAYER_DRAW_W - w) / 2, y: player.y - h, w, h };
  }

  function obstacleHitbox(ob) {
    if (ob.kind === "overhead") {
      const w = ob.w * 0.90, h = ob.h * 0.45;
      return { x: ob.x + (ob.w - w) / 2, y: ob.y + ob.h * 0.55, w, h };
    }
    const w = ob.w * 0.75, h = ob.h * 0.75;
    return { x: ob.x + (ob.w - w) / 2, y: ob.y + (ob.h - h), w, h };
  }

  function intersects(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function togglePause() {
    if (state === STATE.PLAY) {
      paused = !paused;
      input.jumpHeld = input.slideHeld = false;
    }
  }

  function resetGame() {
    paused = false; speed = START_SPEED; score = 0; roadOffset = 0; lives = MAX_LIVES; iFrameT = 0;
    player.lane = 1; player.x = laneToX(1); player.y = GROUND_Y; player.vy = 0;
    player.onGround = true; player.mode = "run"; player.animT = 0; player.slideT = 0;
    obstacles.length = 0; spawnT = 0; nextSpawn = rand(SPAWN_MIN, SPAWN_MAX);
    input.swipeLeft = input.swipeRight = input.justReleased = false;
  }

  // =========================
  // DRAWING
  // =========================
  function drawRoad(dt) {
    roadOffset -= speed * dt;
    if (roadOffset <= -ROAD_TILE_DRAW_W) roadOffset += ROAD_TILE_DRAW_W;
    for (let i = -1; i < Math.ceil(CANVAS_W / ROAD_TILE_DRAW_W) + 2; i++) {
      ctx.drawImage(images.road, Math.floor(roadOffset + i * ROAD_TILE_DRAW_W), ROAD_STRIP_Y, ROAD_TILE_DRAW_W, ROAD_STRIP_H);
    }
  }

  function drawPlayer() {
    const img = getAnimFrame(player.mode, player.animT);
    if (iFrameT > 0 && Math.floor(iFrameT * 14) % 2 === 0) ctx.globalAlpha = 0.55;
    ctx.drawImage(img, Math.round(player.x), Math.round(player.y - PLAYER_DRAW_H), PLAYER_DRAW_W, PLAYER_DRAW_H);
    ctx.globalAlpha = 1;
  }

  function drawHUD() {
    ctx.font = "44px system-ui"; ctx.fillStyle = "white"; ctx.strokeStyle = "black"; ctx.lineWidth = 6;
    const s = `Score ${Math.floor(score)}`;
    ctx.strokeText(s, 24, 62); ctx.fillText(s, 24, 62);
    const barW = 260, barH = 22, x = (CANVAS_W - barW) / 2, y = 30;
    ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(x - 6, y - 6, barW + 12, barH + 12);
    ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.fillRect(x, y, barW, barH);
    ctx.fillStyle = "rgba(255,80,80,0.95)"; ctx.fillRect(x, y, Math.floor(barW * (lives / MAX_LIVES)), barH);
    // Pause btn
    ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(pauseBtnRect.x, pauseBtnRect.y, pauseBtnRect.w, pauseBtnRect.h);
    ctx.fillStyle = "white";
    ctx.fillRect(pauseBtnRect.x + 18, pauseBtnRect.y + 18, 10, pauseBtnRect.h - 36);
    ctx.fillRect(pauseBtnRect.x + pauseBtnRect.w - 28, pauseBtnRect.y + 18, 10, pauseBtnRect.h - 36);
  }

  // =========================
  // LOOP
  // =========================
  let last = performance.now();

  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    const click = input.justReleased ? { x: input.releaseX, y: input.releaseY } : null;
    input.justReleased = false;

    if (state === STATE.START) {
      ctx.drawImage(images.start, 0, 0, CANVAS_W, CANVAS_H);
      if (click && inRect(click, startBtnRect)) { resetGame(); state = STATE.PLAY; }
    } 
    else if (state === STATE.PLAY) {
      if (click && inRect(click, pauseBtnRect)) togglePause();
      ctx.drawImage(images.background, 0, 0, CANVAS_W, CANVAS_H);
      drawRoad(paused ? 0 : dt);
      if (!paused) {
        if (iFrameT > 0) iFrameT = Math.max(0, iFrameT - dt);
        speed += SPEED_RAMP * dt; score += speed * dt * 0.02;
        if (input.swipeLeft) { player.lane = Math.max(0, player.lane - 1); input.swipeLeft = false; }
        if (input.swipeRight) { player.lane = Math.min(LANES - 1, player.lane + 1); input.swipeRight = false; }
        player.x += (laneToX(player.lane) - player.x) * Math.min(1, LANE_SNAP * dt);
        if (input.jumpHeld && player.onGround && player.mode !== "slide") {
          player.vy = JUMP_VELOCITY; player.onGround = false; player.mode = "jump"; player.animT = 0;
        }
        if (input.slideHeld && player.onGround && player.mode !== "slide") {
          player.mode = "slide"; player.slideT = SLIDE_DURATION; player.animT = 0;
        }
        if (player.mode === "slide") {
          player.slideT -= dt;
          if (player.slideT <= 0) { player.mode = "run"; player.animT = 0; }
        }
        player.vy += GRAVITY * dt; player.y += player.vy * dt;
        if (player.y >= GROUND_Y) {
          player.y = GROUND_Y; player.vy = 0; player.onGround = true;
          if (player.mode === "jump") { player.mode = "run"; player.animT = 0; }
        }
        player.animT += dt;
        spawnT += dt;
        if (spawnT >= nextSpawn) { spawnT = 0; nextSpawn = rand(SPAWN_MIN, SPAWN_MAX); spawnObstacle(); }
        for (const ob of obstacles) {
          ob.x -= speed * dt;
          if (iFrameT <= 0 && intersects(playerHitbox(), obstacleHitbox(ob))) {
            lives--; iFrameT = HIT_IFRAME; ob.x = -9999;
            if (lives <= 0) state = STATE.GAMEOVER;
          }
        }
        while (obstacles.length && obstacles[0].x < -450) obstacles.shift();
      }
      for (const ob of obstacles) ctx.drawImage(ob.img, Math.round(ob.x), Math.round(ob.y), ob.w, ob.h);
      drawPlayer();
      drawHUD();
      ctx.drawImage(images.slideBtn, slideBtnRect.x, slideBtnRect.y, slideBtnRect.w, slideBtnRect.h);
      ctx.drawImage(images.jumpBtn, jumpBtnRect.x, jumpBtnRect.y, jumpBtnRect.w, jumpBtnRect.h);
      if (paused) {
        ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.fillStyle = "white"; ctx.font = "72px system-ui"; ctx.strokeText("PAUSED", 240, 520); ctx.fillText("PAUSED", 240, 520);
      }
    } 
    else if (state === STATE.GAMEOVER) {
      ctx.drawImage(images.gameOver, 0, 0, CANVAS_W, CANVAS_H);
      if (click && inRect(click, homeBtnRect)) state = STATE.START;
      else if (click) { resetGame(); state = STATE.PLAY; }
    }

    requestAnimationFrame(loop);
  }

  initLayouts();
  loadAll().then(() => {
    state = STATE.START;
    requestAnimationFrame(loop);
  }).catch(console.error);
})();
})();
