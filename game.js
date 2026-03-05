(() => {
    const canvas = document.getElementById("game");
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    // =========================
    // CONFIG
    // =========================
    const GAME_W = 720;
    const GAME_H = 1280;
    
    // Adjusted GROUND_Y to sit exactly on the road pavement line
    const GROUND_Y = 1010; 
    
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
    let particles = []; 
    let bgX = 0;
    let roadX = 0;
    let warmup = 5.0;

    const player = {
        x: 100, 
        y: GROUND_Y,
        vy: 0,
        w: 160, h: 240,
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
        for (let key in ANIMS) IMAGES[key] = await Promise.all(ANIMS[key].map(src => load(src)));
        requestAnimationFrame(loop);
    }

    // =========================
    // DUST SYSTEM
    // =========================
    function createDust() {
        if (player.y >= GROUND_Y && player.mode === 'run') {
            particles.push({
                x: player.x + 30,
                y: player.y - 5,
                size: Math.random() * 6 + 2,
                opacity: 0.6,
                vx: -speed * 0.3,
                vy: -Math.random() * 30
            });
        }
    }

    function spawn() {
        if (warmup > 0) return;
        const types = ['cone', 'crate', 'hydrant', 'trashcan'];
        const t = types[Math.floor(Math.random() * types.length)];
        
        obstacles.push({
            type: t,
            x: GAME_W + 100,
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

        bgX -= (speed * 0.5) * dt;
        roadX -= speed * dt;
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

        // Dust
        if (Math.random() < 0.2) createDust();
        particles.forEach(p => {
            p.x += p.vx * dt; p.y += p.vy * dt;
            p.opacity -= dt * 1.5; p.size += dt * 5;
        });
        particles = particles.filter(p => p.opacity > 0);

        // Obstacles
        if (Math.random() < 0.02 && (obstacles.length === 0 || (GAME_W - obstacles[obstacles.length-1].x) > 500)) {
            spawn();
        }

        obstacles.forEach(ob => {
            ob.x -= speed * dt;
            // Collision Logic aligned with feet
            const px = player.x + 40;
            const py = player.y - (player.mode === 'slide' ? 100 : 180);
            if (ob.x < px + 80 && ob.x + ob.w > px && (GROUND_Y - ob.h) < py + 180 && GROUND_Y > py) {
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

        // Background & Road
        ctx.drawImage(IMAGES.background, Math.floor(bgX), 0, GAME_W, GAME_H);
        ctx.drawImage(IMAGES.background, Math.floor(bgX + GAME_W), 0, GAME_W, GAME_H);
        
        const roadY = 930; 
        ctx.drawImage(IMAGES.road, Math.floor(roadX), roadY, GAME_W, 350);
        ctx.drawImage(IMAGES.road, Math.floor(roadX + GAME_W), roadY, GAME_W, 350);

        // Dust
        particles.forEach(p => {
            ctx.globalAlpha = p.opacity; ctx.fillStyle = "#CCC";
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
        });
        ctx.globalAlpha = 1.0;

        // Obstacles: Draw using GROUND_Y - height to pin them to the floor
        obstacles.forEach(ob => {
            ctx.drawImage(IMAGES[ob.type], Math.round(ob.x), Math.round(GROUND_Y - ob.h), ob.w, ob.h);
        });

        // Player: Draw using player.y - height
        const pImg = IMAGES[player.mode][player.frame];
        if (iFrames > 0 && Math.floor(Date.now() / 100) % 2 === 0) ctx.globalAlpha = 0.5;
        ctx.drawImage(pImg, Math.round(player.x), Math.round(player.y - player.h), player.w, player.h);
        ctx.globalAlpha = 1;

        // HUD
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
        if (state !== 'PLAY') { state = 'PLAY'; lives = 3; score = 0; speed = BASE_SPEED; obstacles = []; warmup = 5.0; return; }
        if (ty > 1000) {
            if (tx < GAME_W / 2) { player.mode = 'slide'; player.slideT = 0.7; }
            else if (player.y >= GROUND_Y) { player.vy = JUMP_FORCE; player.mode = 'jump'; }
        }
    });

    init();
})();
