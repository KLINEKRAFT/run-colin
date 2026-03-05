(() => {
    const canvas = document.getElementById("game");
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    // =========================
    // CONFIG
    // =========================
    const GAME_W = 720;
    const GAME_H = 1280;
    
    // Adjusted GROUND_Y so obstacles sit on the actual road texture
    const GROUND_Y = 880; 
    
    const BASE_SPEED = 450; 
    const SPEED_INC = 10;
    const GRAVITY = 3600;
    const JUMP_FORCE = -1400;

    const ASSET_DIR = "assets/";
    const IMAGES = {};
    const ASSET_LIST = {
        background: "background.png", 
        road: "road.png", 
        start: "start.png", 
        gameOver: "game_over.png", 
        jumpBtn: "jump_button.png", 
        slideBtn: "slide_button.png",
        cone: "cone.png", 
        crate: "crate.png", 
        hydrant: "hydrant.png", 
        trashcan: "trashcan.png"
        // low_bar removed per request
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
    let bgX = 0;
    let roadX = 0;
    let warmup = 5.0;

    const player = {
        x: 100, 
        y: GROUND_Y,
        vy: 0,
        w: 160, h: 240, // Scaled slightly for better visibility
        mode: 'run',
        frame: 0, timer: 0, slideT: 0
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
        if (warmup > 0) return;
        const types = ['cone', 'crate', 'hydrant', 'trashcan'];
        const t = types[Math.floor(Math.random() * types.length)];
        
        obstacles.push({
            type: t,
            x: GAME_W + 100,
            y: GROUND_Y, // Obstacles now share the same ground line as player
            w: 110,
            h: 110,
            hit: false
        });
    }

    function update(dt) {
        if (state !== 'PLAY') return;
        if (warmup > 0) warmup -= dt;

        speed += SPEED_INC * dt;
        score += speed * dt * 0.01;
        if (iFrames > 0) iFrames -= dt;

        // Corrected Horizontal Scrolling
        bgX -= (speed * 0.5) * dt;
        roadX -= speed * dt;

        // Reset positions to prevent gaps (using 1px overlap to hide seams)
        if (bgX <= -GAME_W) bgX += GAME_W;
        if (roadX <= -GAME_W) roadX += GAME_W;

        // Physics
        player.vy += GRAVITY * dt;
        player.y += player.vy * dt;
        if (player.y > GROUND_Y) {
            player.y = GROUND_Y;
            player.vy = 0;
            if (player.mode === 'jump') player.mode = 'run';
        }

        if (player.mode === 'slide') {
            player.slideT -= dt;
            if (player.slideT <= 0) player.mode = 'run';
        }

        player.timer += dt * 10;
        player.frame = Math.floor(player.timer) % IMAGES[player.mode].length;

        // Spawn Logic
        if (Math.random() < 0.02 && (obstacles.length === 0 || (GAME_W - obstacles[obstacles.length-1].x) > 500)) {
            spawn();
        }

        obstacles.forEach(ob => {
            ob.x -= speed * dt;
            // Collision Detection
            const px = player.x + 40;
            const py = player.y - (player.mode === 'slide' ? 100 : player.h * 0.8);
            if (ob.x < px + 80 && ob.x + ob.w > px && ob.y - ob.h < py + 150 && ob.y > py) {
                if (iFrames <= 0 && !ob.hit) {
                    lives--; iFrames = 1.5; ob.hit = true;
                    if (lives <= 0) state = 'GAMEOVER';
                }
            }
        });

        obstacles = obstacles.filter(ob => ob.x + ob.w > -100);
    }

    function draw() {
        ctx.clearRect(0, 0, GAME_W, GAME_H);

        // Draw Background (Tiled)
        ctx.drawImage(IMAGES.background, Math.floor(bgX), 0, GAME_W, GAME_H);
        ctx.drawImage(IMAGES.background, Math.floor(bgX + GAME_W), 0, GAME_W, GAME_H);

        // Draw Road (Tiled and seated lower)
        const roadDrawY = 750; 
        ctx.drawImage(IMAGES.road, Math.floor(roadX), roadDrawY, GAME_W, 530);
        ctx.drawImage(IMAGES.road, Math.floor(roadX + GAME_W), roadDrawY, GAME_W, 530);

        // Draw Obstacles
        obstacles.forEach(ob => {
            ctx.drawImage(IMAGES[ob.type], Math.round(ob.x), Math.round(ob.y - ob.h), ob.w, ob.h);
        });

        // Draw Player
        const pImg = IMAGES[player.mode][player.frame];
        if (iFrames > 0 && Math.floor(Date.now() / 100) % 2 === 0) ctx.globalAlpha = 0.5;
        ctx.drawImage(pImg, Math.round(player.x), Math.round(player.y - player.h), player.w, player.h);
        ctx.globalAlpha = 1;

        // UI Buttons (Lowered for better thumb reach)
        ctx.drawImage(IMAGES.slideBtn, 40, 1120, 300, 130);
        ctx.drawImage(IMAGES.jumpBtn, 380, 1120, 300, 130);
        
        ctx.fillStyle = "white"; ctx.font = "bold 40px Arial";
        ctx.fillText(`Score: ${Math.floor(score)}`, 40, 60);
        ctx.fillText(`Lives: ${lives}`, 550, 60);

        if (state === 'START') ctx.drawImage(IMAGES.start, 0, 0, GAME_W, GAME_H);
        if (state === 'GAMEOVER') ctx.drawImage(IMAGES.gameOver, 0, 0, GAME_W, GAME_H);
    }

    let lastTime = 0;
    function loop(now) {
        const dt = Math.min(0.032, (now - lastTime) / 1000);
        lastTime = now;
        update(dt);
        draw();
        requestAnimationFrame(loop);
    }

    canvas.addEventListener('touchstart', e => {
        const r = canvas.getBoundingClientRect();
        const tx = (e.touches[0].clientX - r.left) * (GAME_W / r.width);
        const ty = (e.touches[0].clientY - r.top) * (GAME_H / r.height);
        
        if (state !== 'PLAY') {
            state = 'PLAY';
            lives = 3; score = 0; speed = BASE_SPEED; obstacles = []; warmup = 5.0;
            return;
        }
        if (ty > 1000) {
            if (tx < GAME_W / 2) { player.mode = 'slide'; player.slideT = 0.7; }
            else if (player.y >= GROUND_Y) { player.vy = JUMP_FORCE; player.mode = 'jump'; }
        }
    });

    init();
})();
