(() => {
    const canvas = document.getElementById("game");
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    // =========================
    // CONFIG
    // =========================
    const GAME_W = 720;
    const GAME_H = 1280;
    const GROUND_Y = 1020; // The "feet" line for your runner
    
    const BASE_SPEED = 450; 
    const SPEED_INC = 8;
    const GRAVITY = 3400;
    const JUMP_FORCE = -1300;

    const ASSET_DIR = "assets/";
    const IMAGES = {};
    const ASSET_LIST = {
        background: "background.png", road: "road.png", start: "start.png", 
        gameOver: "game_over.png", jumpBtn: "jump_button.png", slideBtn: "slide_button.png",
        cone: "cone.png", crate: "crate.png", hydrant: "hydrant.png", 
        trashcan: "trashcan.png", lowbar: "low_bar.png"
    };

    const ANIMS = {
        run: ["run_1.png", "run_2.png", "run_3.png", "run_4.png"],
        jump: ["jump_1.png", "jump_2.png", "jump_3.png", "jump_4.png"],
        slide: ["slide_1.png", "slide_2.png", "slide_3.png"]
    };

    // =========================
    // STATE
    // =========================
    let state = 'START';
    let speed = BASE_SPEED;
    let score = 0;
    let lives = 3;
    let iFrames = 0;
    let obstacles = [];
    let bgScroll = 0;
    let roadScroll = 0;
    let warmupTimer = 5; // 5-second delay before obstacles

    const player = {
        x: 100, // Fixed horizontal position
        y: GROUND_Y,
        vy: 0,
        w: 140, h: 212,
        mode: 'run',
        animFrame: 0, animTimer: 0, slideTimer: 0
    };

    // =========================
    // ENGINE
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
        requestAnimationFrame(loop);
    }

    function spawn() {
        if (warmupTimer > 0) return; // No spawning during warmup

        const types = ['cone', 'crate', 'hydrant', 'trashcan', 'lowbar'];
        const type = types[Math.floor(Math.random() * types.length)];
        
        obstacles.push({
            type,
            x: GAME_W + 100, // Start off-screen to the right
            y: type === 'lowbar' ? GROUND_Y - 180 : GROUND_Y - 120,
            w: type === 'lowbar' ? 220 : 120,
            h: 120,
            hit: false
        });
    }

    function update(dt) {
        if (state !== 'PLAY') return;

        if (warmupTimer > 0) warmupTimer -= dt; // Countdown warmup

        speed += SPEED_INC * dt;
        score += speed * dt * 0.01;
        if (iFrames > 0) iFrames -= dt;

        // Background/Road Scrolling (Right to Left)
        bgScroll -= (speed * 0.5) * dt;
        roadScroll -= speed * dt;
        if (bgScroll <= -GAME_W) bgScroll = 0;
        if (roadScroll <= -720) roadScroll = 0;

        // Player Physics
        player.vy += GRAVITY * dt;
        player.y += player.vy * dt;
        if (player.y > GROUND_Y) {
            player.y = GROUND_Y;
            player.vy = 0;
            if (player.mode === 'jump') player.mode = 'run';
        }

        if (player.mode === 'slide') {
            player.slideTimer -= dt;
            if (player.slideTimer <= 0) player.mode = 'run';
        }

        // Animation
        player.animTimer += dt * 10;
        player.animFrame = Math.floor(player.animTimer) % IMAGES[player.mode].length;

        // Spawning
        if (Math.random() < 0.02 && obstacles.length < 3) {
            const lastOb = obstacles[obstacles.length - 1];
            if (!lastOb || (GAME_W - lastOb.x) > 400) spawn();
        }

        // Obstacle movement & Collision
        obstacles.forEach((ob, i) => {
            ob.x -= speed * dt; // Move left

            // Collision Check
            const px = player.x + 20;
            const py = player.y - (player.mode === 'slide' ? 100 : player.h);
            const pw = player.w - 40;
            const ph = player.mode === 'slide' ? 100 : player.h;

            if (ob.x < px + pw && ob.x + ob.w > px && ob.y - ob.h < py + ph && ob.y > py) {
                if (iFrames <= 0 && !ob.hit) {
                    if (!(ob.type === 'lowbar' && player.mode === 'slide')) {
                        lives--;
                        iFrames = 1.5;
                        ob.hit = true;
                        if (lives <= 0) state = 'GAMEOVER';
                    }
                }
            }
        });

        obstacles = obstacles.filter(ob => ob.x + ob.w > -100);
    }

    function draw() {
        ctx.clearRect(0, 0, GAME_W, GAME_H);

        // Draw Background Layered
        ctx.drawImage(IMAGES.background, bgScroll, 0, GAME_W, GAME_H);
        ctx.drawImage(IMAGES.background, bgScroll + GAME_W, 0, GAME_W, GAME_H);

        // Draw Road
        const roadY = GROUND_Y - 80;
        ctx.drawImage(IMAGES.road, roadScroll, roadY, 720, 300);
        ctx.drawImage(IMAGES.road, roadScroll + 720, roadY, 720, 300);

        // Draw Obstacles
        obstacles.forEach(ob => {
            ctx.drawImage(IMAGES[ob.type], ob.x, ob.y - ob.h, ob.w, ob.h);
        });

        // Draw Player
        const pImg = IMAGES[player.mode][player.animFrame];
        if (iFrames > 0 && Math.floor(Date.now() / 100) % 2 === 0) ctx.globalAlpha = 0.5;
        ctx.drawImage(pImg, player.x, player.y - player.h, player.w, player.h);
        ctx.globalAlpha = 1;

        // UI
        ctx.drawImage(IMAGES.slideBtn, 40, 1120, 280, 120);
        ctx.drawImage(IMAGES.jumpBtn, 400, 1120, 280, 120);

        if (state === 'START') ctx.drawImage(IMAGES.start, 0, 0, GAME_W, GAME_H);
        if (state === 'GAMEOVER') ctx.drawImage(IMAGES.gameOver, 0, 0, GAME_W, GAME_H);
    }

    function loop(now) {
        const dt = Math.min(0.032, (now - lastTime) / 1000);
        lastTime = now;
        update(dt);
        draw();
        requestAnimationFrame(loop);
    }

    // Input
    canvas.addEventListener('touchstart', e => {
        const rect = canvas.getBoundingClientRect();
        const tx = (e.touches[0].clientX - rect.left) * (GAME_W / rect.width);
        const ty = (e.touches[0].clientY - rect.top) * (GAME_H / rect.height);
        
        if (state !== 'PLAY') {
            state = 'PLAY';
            lives = 3; score = 0; speed = BASE_SPEED; obstacles = []; warmupTimer = 5;
            return;
        }
        if (ty > 1100) {
            if (tx < GAME_W / 2) { player.mode = 'slide'; player.slideTimer = 0.7; }
            else if (player.y >= GROUND_Y) { player.vy = JUMP_FORCE; player.mode = 'jump'; }
        }
    });

    let lastTime = 0;
    init();
})();
