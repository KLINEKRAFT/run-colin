(() => {
    const canvas = document.getElementById("game");
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    // =========================
    // CONFIG & TUNING
    // =========================
    const GAME_W = 720;
    const GAME_H = 1280;
    const GROUND_Y = 1050; // tweak 1000-1100
    const LANES = [160, 360, 560]; // Spacing between 3 lanes
    
    // Physics
    const GRAVITY = 3500;
    const JUMP_FORCE = -1400;
    const BASE_SPEED = 450; // Much slower start! (was 700)
    const MAX_SPEED = 1800;
    const SPEED_INC = 8; // Slower acceleration (was 15)

    // Spawning (classic city assets)
    const ASSET_DIR = "assets/";
    const IMAGES = {};
    const ASSET_LIST = {
        background: "background.png", road: "road.png", start: "start.png", gameOver: "game_over.png",
        jumpBtn: "jump_button.png", slideBtn: "slide_button.png",
        // Obstacles (screenshot list)
        cone: "cone.png", crate: "crate.png", hydrant: "hydrant.png", trashcan: "trashcan.png", lowbar: "low_bar.png"
    };

    // Animation frames (must match filenames exactly)
    const ANIMS = {
        run: ["run_1.png", "run_2.png", "run_3.png", "run_4.png"],
        jump: ["jump_1.png", "jump_2.png", "jump_3.png", "jump_4.png"],
        slide: ["slide_1.png", "slide_2.png", "slide_3.png"],
        idle: ["idle_1.png", "idle_2.png", "idle_3.png", "idle_4.png"]
    };

    // =========================
    // GAME STATE MGT
    // =========================
    let state = 'LOADING';
    let speed = BASE_SPEED;
    let score = 0;
    let lives = 3;
    let iFrames = 0; // invincibility time after hit
    let obstacles = [];

    // Warmup timer: 5 seconds before obstacles start
    let gameState = { warmupTimer: 5, lastSpawnDist: 0, roadDist: 0 };

    const player = {
        lane: 1, // center lane
        x: LANES[1], y: GROUND_Y, vy: 0,
        w: 140, h: 212, // display size
        mode: 'run', // run/jump/slide/idle
        animFrame: 0, animTimer: 0, slideTimer: 0
    };

    // =========================
    // LOAD ASSETS
    // =========================
    async function init() {
        const load = (src) => new Promise(r => {
            const img = new Image();
            img.onload = () => r(img);
            img.src = ASSET_DIR + src;
        });

        // Load static images
        for (let key in ASSET_LIST) IMAGES[key] = await load(ASSET_LIST[key]);
        
        // Load animations
        for (let key in ANIMS) {
            IMAGES[key] = await Promise.all(ANIMS[key].map(src => load(src)));
        }
        
        state = 'START';
        requestAnimationFrame(loop);
    }

    // =========================
    // INPUT (TOUCH MAPPING)
    // =========================
    let touchX = 0, touchY = 0;
    canvas.addEventListener('touchstart', e => {
        const rect = canvas.getBoundingClientRect();
        touchX = (e.touches[0].clientX - rect.left) * (GAME_W / rect.width);
        touchY = (e.touches[0].clientY - rect.top) * (GAME_H / rect.height);
        
        if (state !== 'PLAY') {
            reset();
            state = 'PLAY';
            return;
        }

        // Action Buttons (slide on left, jump on right)
        if (touchY > GAME_H * 0.8) {
            if (touchX < GAME_W / 2) triggerSlide();
            else triggerJump();
        }
    });

    // Swipe detection (lane change)
    canvas.addEventListener('touchend', e => {
        const rect = canvas.getBoundingClientRect();
        const endX = (e.changedTouches[0].clientX - rect.left) * (GAME_W / rect.width);
        const swipeDist = 60; // minimum required swipe
        if (Math.abs(endX - touchX) > swipeDist) {
            if (endX < touchX) player.lane = Math.max(0, player.lane - 1); // left
            else player.lane = Math.min(2, player.lane + 1); // right
        }
    });

    function triggerJump() {
        if (player.y >= GROUND_Y) {
            player.vy = JUMP_FORCE;
            player.mode = 'jump';
        }
    }

    function triggerSlide() {
        if (player.y >= GROUND_Y) {
            player.mode = 'slide';
            player.slideTimer = 0.6; // seconds of slide
        }
    }

    function reset() {
        speed = BASE_SPEED;
        score = 0; lives = 3; iFrames = 0;
        obstacles = [];
        player.lane = 1;
        player.y = GROUND_Y;
        player.mode = 'run';
        gameState.warmupTimer = 5; // Reset warmup
        gameState.lastSpawnDist = 0;
        gameState.roadDist = 0;
    }

    // =========================
    // MAIN LOOP
    // =========================
    let lastTime = 0;
    function loop(now) {
        const dt = Math.min(0.032, (now - lastTime) / 1000);
        lastTime = now;
        update(dt);
        draw(now);
        requestAnimationFrame(loop);
    }

    function update(dt) {
        if (state !== 'PLAY') return;

        speed = Math.min(MAX_SPEED, speed + SPEED_INC * dt);
        gameState.roadDist += speed * dt;
        score += dt * 10;
        if (iFrames > 0) iFrames -= dt;

        // Lane movement (smooth snapping)
        const targetX = LANES[player.lane];
        player.x += (targetX - player.x) * 15 * dt;

        // Gravity/Jump
        player.vy += GRAVITY * dt;
        player.y += player.vy * dt;
        if (player.y > GROUND_Y) {
            player.y = GROUND_Y;
            player.vy = 0;
            if (player.mode === 'jump') player.mode = 'run';
        }

        // Slide logic
        if (player.mode === 'slide') {
            player.slideTimer -= dt;
            if (player.slideTimer <= 0) player.mode = 'run';
        }

        // Animation timing
        player.animTimer += dt * (speed / 100);
        player.animFrame = Math.floor(player.animTimer) % IMAGES[player.mode].length;

        // Spawning Logic (Fixed: Spawn only at top, and only after 5s delay)
        if (gameState.warmupTimer > 0) {
            gameState.warmupTimer -= dt;
        } else {
            // Distance-based spawning ensures consistent gaps
            if (gameState.roadDist - gameState.lastSpawnDist > 850) {
                spawnObstacle();
                gameState.lastSpawnDist = gameState.roadDist;
            }
        }

        // Obstacles & Collision
        obstacles.forEach((ob, i) => {
            // Move obstacles toward the player based on speed
            ob.relativeY += speed * dt;

            // Simple pseudo-3D perspective (grow as they approach)
            const perspectiveStart = GAME_H * 0.3; // Obstacles appear high up
            const perspectiveRange = GROUND_Y - perspectiveStart;
            ob.drawSizeMod = Math.max(0.2, Math.min(1.0, (ob.relativeY - perspectiveStart) / perspectiveRange));
            
            ob.drawY = ob.relativeY; // Use the movement calculation directly
            ob.drawX = LANES[ob.lane]; // Fixed lane position

            // Collision check (when obstacle is at player's depth)
            const playerDepth = GROUND_Y;
            if (Math.abs(ob.drawY - playerDepth) < 60 && ob.lane === player.lane && ob.canHit) {
                let hit = true;
                if (ob.type === 'lowbar' && player.mode === 'slide') hit = false;
                
                if (hit && iFrames <= 0) {
                    lives--;
                    iFrames = 1.5;
                    ob.canHit = false; // Prevents hitting same obstacle again
                    if (lives <= 0) state = 'GAMEOVER';
                }
            }
        });
        
        // Cleanup old obstacles
        obstacles = obstacles.filter(ob => ob.drawY < GAME_H + 200);
    }

    function spawnObstacle() {
        const lane = Math.floor(Math.random() * 3);
        const types = ['cone', 'crate', 'hydrant', 'trashcan', 'lowbar'];
        const type = types[Math.floor(Math.random() * types.length)];
        
        obstacles.push({
            type, lane,
            relativeY: -200, // Fixed start point high above the screen (was worldDist)
            w: type === 'lowbar' ? 220 : 120,
            h: type === 'lowbar' ? 100 : 120,
            canHit: true,
            drawSizeMod: 0.2 // Starts small
        });
    }

    function draw(now) {
        ctx.clearRect(0, 0, GAME_W, GAME_H);

        if (state === 'START') {
            ctx.drawImage(IMAGES.start, 0, 0, GAME_W, GAME_H);
            return;
        }

        // Environment
        ctx.drawImage(IMAGES.background, 0, 0, GAME_W, GAME_H);
        const roadShift = (gameState.roadDist % 600); // Simple scrolling texture
        ctx.drawImage(IMAGES.road, 0, roadShift - 1280, GAME_W, 1280 * 2);

        // Draw Obstacles (draw back-to-front for correct layering)
        obstacles.forEach(ob => {
            const drawW = ob.w * ob.drawSizeMod;
            const drawH = ob.h * ob.drawSizeMod;
            const drawX = ob.drawX - drawW / 2;
            const drawY = ob.drawY - drawH;
            
            ctx.globalAlpha = Math.max(0.1, ob.drawSizeMod); // Fade-in effect
            ctx.drawImage(IMAGES[ob.type], Math.round(drawX), Math.round(drawY), Math.round(drawW), Math.round(drawH));
        });
        ctx.globalAlpha = 1;

        // Draw Player (draw player last so obstacles pass behind)
        const pImg = IMAGES[player.mode][player.animFrame];
        // Brief blinking effect after taking damage
        if (iFrames > 0 && Math.floor(now / 100) % 2 === 0) ctx.globalAlpha = 0.5;
        
        // Ensure rounded coordinates for crisp pixel art
        ctx.drawImage(pImg, Math.round(player.x - player.w/2), Math.round(player.y - player.h), player.w, player.h);
        ctx.globalAlpha = 1;

        // HUD (City assets)
        ctx.drawImage(IMAGES.slideBtn, 20, 1100, 300, 140);
        ctx.drawImage(IMAGES.jumpBtn, 400, 1100, 300, 140);
        
        ctx.fillStyle = "white";
        ctx.font = "bold 44px Arial";
        ctx.textAlign = "left";
        ctx.fillText(`SCORE: ${Math.floor(score)}`, 40, 60);
        ctx.textAlign = "right";
        ctx.fillText(`LIVES: ${lives}`, 680, 60);

        if (state === 'GAMEOVER') {
            ctx.drawImage(IMAGES.gameOver, 0, 0, GAME_W, GAME_H);
        }
    }

    init();
})();
