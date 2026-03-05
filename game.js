(() => {
    const canvas = document.getElementById("game");
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    // =========================
    // CONFIG & TUNING
    // =========================
    const GAME_W = 720;
    const GAME_H = 1280;
    const GROUND_Y = 1050;
    const LANES = [180, 360, 540]; // Fixed X positions for 3 lanes
    
    // Physics
    const GRAVITY = 3500;
    const JUMP_FORCE = -1400;
    const BASE_SPEED = 700;
    const MAX_SPEED = 1800;
    const SPEED_INC = 15; // Speed increase per second

    // Assets
    const ASSET_DIR = "assets/";
    const IMAGES = {};
    const ASSET_LIST = {
        background: "background.png",
        road: "road.png",
        start: "start.png",
        gameOver: "game_over.png",
        jumpBtn: "jump_button.png",
        slideBtn: "slide_button.png",
        // Obstacles from your screenshot
        cone: "cone.png",
        crate: "crate.png",
        hydrant: "hydrant.png",
        trashcan: "trashcan.png",
        lowbar: "low_bar.png"
    };

    // Animation sequences
    const ANIMS = {
        run: ["run_1.png", "run_2.png", "run_3.png", "run_4.png"],
        jump: ["jump_1.png", "jump_2.png", "jump_3.png", "jump_4.png"],
        slide: ["slide_1.png", "slide_2.png", "slide_3.png"],
        idle: ["idle_1.png", "idle_2.png", "idle_3.png", "idle_4.png"]
    };

    // =========================
    // STATE MGT
    // =========================
    let state = 'LOADING';
    let score = 0;
    let speed = BASE_SPEED;
    let worldDist = 0;
    let lastSpawnDist = 0;
    let obstacles = [];
    let lives = 3;
    let iFrames = 0;

    const player = {
        lane: 1,
        x: LANES[1],
        y: GROUND_Y,
        vy: 0,
        w: 140,
        h: 212,
        mode: 'run',
        animFrame: 0,
        animTimer: 0,
        slideTimer: 0
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

        for (let key in ASSET_LIST) IMAGES[key] = await load(ASSET_LIST[key]);
        for (let key in ANIMS) {
            IMAGES[key] = await Promise.all(ANIMS[key].map(src => load(src)));
        }
        
        state = 'START';
        requestAnimationFrame(loop);
    }

    // =========================
    // INPUT HANDLING
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

        // Buttons
        if (touchY > 1000) {
            if (touchX < GAME_W / 2) triggerSlide();
            else triggerJump();
        }
    });

    // Swipe for lanes
    canvas.addEventListener('touchend', e => {
        const rect = canvas.getBoundingClientRect();
        const endX = (e.changedTouches[0].clientX - rect.left) * (GAME_W / rect.width);
        if (Math.abs(endX - touchX) > 50) {
            if (endX < touchX) player.lane = Math.max(0, player.lane - 1);
            else player.lane = Math.min(2, player.lane + 1);
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
            player.slideTimer = 0.6;
        }
    }

    function reset() {
        score = 0;
        speed = BASE_SPEED;
        worldDist = 0;
        obstacles = [];
        lives = 3;
        player.lane = 1;
        player.y = GROUND_Y;
    }

    // =========================
    // GAME ENGINE
    // =========================
    function spawn() {
        const lane = Math.floor(Math.random() * 3);
        const types = ['cone', 'crate', 'hydrant', 'trashcan', 'lowbar'];
        const type = types[Math.floor(Math.random() * types.length)];
        
        obstacles.push({
            type,
            lane,
            dist: worldDist + 1500, // Spawn well ahead
            w: type === 'lowbar' ? 220 : 120,
            h: type === 'lowbar' ? 100 : 120,
            y: type === 'lowbar' ? GROUND_Y - 180 : GROUND_Y
        });
    }

    let lastTime = 0;
    function loop(now) {
        const dt = Math.min(0.032, (now - lastTime) / 1000);
        lastTime = now;

        update(dt);
        draw();
        requestAnimationFrame(loop);
    }

    function update(dt) {
        if (state !== 'PLAY') return;

        speed = Math.min(MAX_SPEED, speed + SPEED_INC * dt);
        worldDist += speed * dt;
        score += dt * 10;
        if (iFrames > 0) iFrames -= dt;

        // Lane movement
        const targetX = LANES[player.lane];
        player.x += (targetX - player.x) * 15 * dt;

        // Physics
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

        // Animation
        player.animTimer += dt * (speed / 100);
        player.animFrame = Math.floor(player.animTimer) % IMAGES[player.mode].length;

        // Spawning logic (Based on distance, not time!)
        if (worldDist - lastSpawnDist > 800) {
            spawn();
            lastSpawnDist = worldDist;
        }

        // Obstacles & Collision
        obstacles.forEach((ob, i) => {
            const obX = LANES[ob.lane];
            const screenY = ob.y - (ob.dist - worldDist); // Simple pseudo-3D perspective

            // Collision check
            if (ob.dist - worldDist < 50 && ob.dist - worldDist > -50 && ob.lane === player.lane) {
                let hit = true;
                if (ob.type === 'lowbar' && player.mode === 'slide') hit = false;
                if (hit && iFrames <= 0) {
                    lives--;
                    iFrames = 1.5;
                    if (lives <= 0) state = 'GAMEOVER';
                }
            }
        });
        
        // Cleanup
        obstacles = obstacles.filter(ob => ob.dist - worldDist > -200);
    }

    function draw() {
        ctx.clearRect(0, 0, GAME_W, GAME_H);

        if (state === 'START') {
            ctx.drawImage(IMAGES.start, 0, 0, GAME_W, GAME_H);
            return;
        }

        // Background & Road
        ctx.drawImage(IMAGES.background, 0, 0, GAME_W, GAME_H);
        const roadShift = (worldDist % 600);
        ctx.drawImage(IMAGES.road, 0, 0, 720, 1280);

        // Draw Obstacles
        obstacles.forEach(ob => {
            const relDist = ob.dist - worldDist;
            const sizeMod = Math.max(0.2, 1 - (relDist / 2000));
            const drawW = ob.w * sizeMod;
            const drawH = ob.h * sizeMod;
            const drawX = LANES[ob.lane] - drawW / 2;
            const drawY = ob.y - drawH;
            
            ctx.globalAlpha = Math.min(1, 2 - (relDist / 1000));
            ctx.drawImage(IMAGES[ob.type], drawX, drawY, drawW, drawH);
        });
        ctx.globalAlpha = 1;

        // Draw Player
        const pImg = IMAGES[player.mode][player.animFrame];
        if (iFrames > 0 && Math.floor(now / 100) % 2 === 0) ctx.globalAlpha = 0.5;
        ctx.drawImage(pImg, player.x - player.w/2, player.y - player.h, player.w, player.h);
        ctx.globalAlpha = 1;

        // HUD
        ctx.drawImage(IMAGES.slideBtn, 20, 1100, 300, 140);
        ctx.drawImage(IMAGES.jumpBtn, 400, 1100, 300, 140);
        
        ctx.fillStyle = "white";
        ctx.font = "bold 40px Arial";
        ctx.fillText(`SCORE: ${Math.floor(score)}`, 40, 60);
        ctx.fillText(`LIVES: ${lives}`, 550, 60);

        if (state === 'GAMEOVER') {
            ctx.drawImage(IMAGES.gameOver, 0, 0, GAME_W, GAME_H);
        }
    }

    init();
})();
