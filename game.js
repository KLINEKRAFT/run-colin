(() => {
    const canvas = document.getElementById("game");
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    // =========================
    // CONFIG (Side-Scrolling)
    // =========================
    const GAME_W = 720;
    const GAME_H = 1280;
    const GROUND_Y = 1040; // Keeps the runner near the bottom of the tall screen
    
    const BASE_SPEED = 450; 
    const SPEED_INC = 10;
    const GRAVITY = 3400;
    const JUMP_FORCE = -1300;

    const ASSET_DIR = "assets/";
    const IMAGES = {};
    const ASSET_LIST = {
        background: "background.png", 
        road: "road.png", 
        start: "start.png", 
        gameOver: "game_over.png", 
        jumpBtn: "jump_button.png", 
        slideBtn: "slide_button.png",
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
    
    // Horizontal scroll offsets
    let bgScrollX = 0;
    let roadScrollX = 0;
    let warmupTimer = 5; // 5-second delay before obstacles start

    const player = {
        x: 100, // Fixed X position for side-scroller
        y: GROUND_Y,
        vy: 0,
        w: 140, h: 212,
        mode: 'run',
        animFrame: 0, animTimer: 0, slideTimer: 0
    };

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
        if (warmupTimer > 0) return;

        const types = ['cone', 'crate', 'hydrant', 'trashcan', 'lowbar'];
        const type = types[Math.floor(Math.random() * types.length)];
        
        obstacles.push({
            type,
            x: GAME_W + 100, // Spawn at the right edge
            y: type === 'lowbar' ? GROUND_Y - 180 : GROUND_Y,
            w: type === 'lowbar' ? 220 : 120,
            h: 120,
            hit: false
        });
    }

    function update(dt) {
        if (state !== 'PLAY') return;

        if (warmupTimer > 0) warmupTimer -= dt;

        speed += SPEED_INC * dt;
        score += speed * dt * 0.01;
        if (iFrames > 0) iFrames -= dt;

        // HORIZONTAL SCROLL LOGIC
        // Road moves left at full speed, background moves slower for depth
        bgScrollX -= (speed * 0.4) * dt;
        roadScrollX -= speed * dt;

        // Reset loops
        if (bgScrollX <= -GAME_W) bgScrollX = 0;
        if (roadScrollX <= -GAME_W) roadScrollX = 0;

        // Physics
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

        player.animTimer += dt * 10;
        player.animFrame = Math.floor(player.animTimer) % IMAGES[player.mode].length;

        // Spawning based on distance
        if (Math.random() < 0.02 && (obstacles.length === 0 || (GAME_W - obstacles[obstacles.length-1].x) > 450)) {
            spawn();
        }

        // Obstacle movement (Right to Left)
        obstacles.forEach(ob => {
            ob.x -= speed * dt;

            // Collision
            const px = player.x + 30;
            const py = player.y - (player.mode === 'slide' ? 100 : player.h);
            if (ob.x < px + 80 && ob.x + ob.w > px && ob.y - ob.h < py + (player.mode === 'slide' ? 100 : player.h) && ob.y > py) {
                if (iFrames <= 0 && !ob.hit) {
                    if (!(ob.type === 'lowbar' && player.mode === 'slide')) {
                        lives--; iFrames = 1.5; ob.hit = true;
                        if (lives <= 0) state = 'GAMEOVER';
                    }
                }
            }
        });

        obstacles = obstacles.filter(ob => ob.x + ob.w > -100);
    }

    function draw() {
        ctx.clearRect(0, 0, GAME_W, GAME_H);

        // Draw Parallax Background (Horizontal)
        ctx.drawImage(IMAGES.background, bgScrollX, 0, GAME_W, GAME_H);
        ctx.drawImage(IMAGES.background, bgScrollX + GAME_W, 0, GAME_W, GAME_H);

        // Draw Road (Horizontal)
        const roadHeight = 300;
        ctx.drawImage(IMAGES.road, roadScrollX, GROUND_Y - 60, GAME_W, roadHeight);
        ctx.drawImage(IMAGES.road, roadScrollX + GAME_W, GROUND_Y - 60, GAME_W, roadHeight);

        obstacles.forEach(ob => ctx.drawImage(IMAGES[ob.type], ob.x, ob.y - ob.h, ob.w, ob.h));

        const pImg = IMAGES[player.mode][player.animFrame];
        if (iFrames > 0 && Math.floor(Date.now() / 100) % 2 === 0) ctx.globalAlpha = 0.5;
        ctx.drawImage(pImg, player.x, player.y - player.h, player.w, player.h);
        ctx.globalAlpha = 1;

        // HUD
        ctx.drawImage(IMAGES.slideBtn, 40, 1120, 280, 120);
        ctx.drawImage(IMAGES.jumpBtn, 400, 1120, 280, 120);
        ctx.fillStyle = "white"; ctx.font = "bold 40px Arial";
        ctx.fillText(`Score: ${Math.floor(score)}`, 40, 60);
        ctx.fillText(`Lives: ${lives}`, 550, 60);

        if (state === 'START') ctx.drawImage(IMAGES.start, 0, 0, GAME_W, GAME_H);
        if (state === 'GAMEOVER') ctx.drawImage(IMAGES.gameOver, 0, 0, GAME_W, GAME_H);
    }

    let lastTime = 0;
    function loop(now) {
        const dt = Math.min(0.032, (now - lastTime) / 1000); // Use deltaTime for smooth movement
        lastTime = now;
        update(dt);
        draw();
        requestAnimationFrame(loop);
    }

    canvas.addEventListener('touchstart', e => {
        const r = canvas.getBoundingClientRect(); // Map touch to internal 720x1280 scale
        const tx = (e.touches[0].clientX - r.left) * (GAME_W / r.width);
        const ty = (e.touches[0].clientY - r.top) * (GAME_H / r.height);
        
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

    init();
})();
