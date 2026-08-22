/* =========================================================
   THE ENGINE — DRIFT LAB
   Endless top-down drift & stunt game. Chaining drifts and
   clearing ramps earns XP; leveling up permanently raises
   top speed, acceleration and structural "strength".
   ========================================================= */
(() => {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const shell = document.getElementById('gameShell');
  const startScreen = document.getElementById('startScreen');
  const startBtn = document.getElementById('startBtn');
  const centerMsg = document.getElementById('centerMsg');
  const gameOverScreen = document.getElementById('gameOverScreen');
  const gameOverRestartBtn = document.getElementById('gameOverRestartBtn');
  const finalScoreEl = document.getElementById('finalScore');
  const finalHighScoreEl = document.getElementById('finalHighScore');

  let highscore = 0;

  const hud = {
    speed: document.getElementById('hudSpeed'),
    power: document.getElementById('hudPower'),
    level: document.getElementById('hudLevel'),
    score: document.getElementById('hudScore'),
    highscore: document.getElementById('hudHighScore'),
    xpBar: document.getElementById('xpBar'),
    strengthBar: document.getElementById('strengthBar'),
    driftBar: document.getElementById('driftBar'),
  };

  let W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 2);

  function resize(){
    const rect = shell.getBoundingClientRect();
    W = Math.max(320, Math.floor(rect.width));
    H = Math.max(420, Math.floor(rect.height));
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR,0,0,DPR,0,0);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------------- game state ----------------
  const G = {
    running: false,
    paused: false,
    scrollY: 0,
    speed: 0,
    baseMaxSpeed: 230,
    accel: 140,
    handling: 560,
    strength: 100,
    maxStrength: 100,
    level: 1,
    xp: 0,
    xpToNext: 140,
    score: 0,
    playerOffset: 0,
    playerVX: 0,
    steer: 0,
    driftHeld: false,
    isDrifting: false,
    driftCharge: 0,
    driftMax: 150,
    combo: 1,
    comboTimer: 0,
    carAngle: 0,
    shake: 0,
    boostTimer: 0,
    airborne: false,
    stuntTimer: 0,
    stuntDur: 1.05,
    stuntRotation: 0,
    stuntSpins: 1,
    obstacles: [],
    trees: [],
    particles: [],
    distSinceSpawn: 9999,
    distSinceTree: 200,
    roadHalf: 170,
    crashing: false,
    crashTimer: 0,
    crashDur: 0.75,
    gameOver: false,
  };

  const keys = {};
  window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
    if (['arrowleft','arrowright','arrowup','arrowdown',' '].includes(e.key.toLowerCase())) e.preventDefault();
    if (e.key.toLowerCase() === 'p' && G.running && !G.gameOver) togglePause();
    if (e.key === 'Enter' && G.gameOver) restartRun();
  });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

  // touch support: left/right half of screen steers, hold anywhere = drift
  let touchActive = false;
  canvas.addEventListener('touchstart', (e) => {
    touchActive = true;
    const t = e.touches[0];
    keys.__touchX = t.clientX;
    G.driftHeld = true;
  }, {passive:true});
  canvas.addEventListener('touchmove', (e) => {
    keys.__touchX = e.touches[0].clientX;
  }, {passive:true});
  canvas.addEventListener('touchend', () => { touchActive = false; G.driftHeld = false; keys.__touchX = null; }, {passive:true});

  function readSteer(){
    let s = 0;
    if (keys['arrowleft'] || keys['a']) s -= 1;
    if (keys['arrowright'] || keys['d']) s += 1;
    if (touchActive && keys.__touchX != null){
      s = (keys.__touchX - W/2) / (W*0.32);
      s = Math.max(-1, Math.min(1, s));
    }
    G.driftHeld = keys[' '] || keys['shift'] || touchActive;
    return s;
  }

  // ---------------- road curve ----------------
  function curveX(depth){
    const diff = 1 + Math.min(1.2, (G.level - 1) * 0.06);
    return (95 * Math.sin(depth * 0.0016) + 55 * Math.sin(depth * 0.0042 + 1.3)) * diff;
  }
  function roadCenter(depth){ return W/2 + curveX(depth); }

  // ---------------- helpers ----------------
  const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
  const lerp = (a,b,t) => a + (b-a)*t;

  function addParticle(p){ G.particles.push(p); }

  function spawnSmoke(x,y,dir){
    for (let i=0;i<2;i++){
      addParticle({
        x: x + (Math.random()-0.5)*10, y: y + (Math.random()-0.5)*6,
        vx: (Math.random()-0.5)*24 - dir*30, vy: 40 + Math.random()*30,
        life: 0.5 + Math.random()*0.4, maxLife: 0.9, size: 10 + Math.random()*14,
        color: 'rgba(210,210,210,ALPHA)', noGravity:true
      });
    }
  }
  function spawnSparks(x,y){
    for (let i=0;i<14;i++){
      const a = Math.random()*Math.PI*2, sp = 60+Math.random()*140;
      addParticle({
        x,y, vx: Math.cos(a)*sp, vy: Math.sin(a)*sp - 40,
        life: 0.35+Math.random()*0.3, maxLife:0.6, size: 2+Math.random()*3,
        color: Math.random()>0.5 ? 'rgba(255,177,0,ALPHA)' : 'rgba(255,59,31,ALPHA)'
      });
    }
  }
  function spawnDust(x,y){
    addParticle({ x,y, vx:(Math.random()-0.5)*20, vy: 30+Math.random()*20,
      life:0.6, maxLife:0.6, size:14+Math.random()*10, color:'rgba(196,176,132,ALPHA)', noGravity:true });
  }
  function spawnBlackSmoke(x,y,burst){
    const n = burst ? 10 : 2;
    for (let i=0;i<n;i++){
      addParticle({
        x: x + (Math.random()-0.5)*14, y: y + (Math.random()-0.5)*10,
        vx: (Math.random()-0.5)*40, vy: -50 - Math.random()*50,
        life: 0.8 + Math.random()*0.7, maxLife: 1.5, size: 12 + Math.random()*20,
        color: 'rgba(24,24,24,ALPHA)', noGravity:true
      });
    }
  }

  // ---------------- messaging ----------------
  let msgTimer = null;
  function showCenterMsg(text, cls){
    centerMsg.textContent = text;
    centerMsg.className = 'hud-center-msg show ' + (cls === 'level' ? 'level-pop' : 'combo-pop');
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { centerMsg.classList.remove('show'); }, 1100);
  }

  // ---------------- leveling ----------------
  function addXP(amount){
    if (amount <= 0) return;
    G.xp += amount;
    while (G.xp >= G.xpToNext){
      G.xp -= G.xpToNext;
      levelUp();
    }
  }
  function levelUp(){
    G.level += 1;
    G.xpToNext = Math.round(G.xpToNext * 1.16 + 24);
    G.baseMaxSpeed += 16;
    G.accel += 9;
    G.handling += 18;
    G.maxStrength += 6;
    G.strength = G.maxStrength;
    G.shake = Math.max(G.shake, 6);
    showCenterMsg('LEVEL ' + G.level + ' — ENGINE UPGRADED', 'level');
  }

  // ---------------- obstacles ----------------
  function spawnObstacle(){
    const aheadDepth = G.scrollY + 900 + Math.random()*500;
    const isRamp = Math.random() < 0.2;
    const margin = 46;
    let rel;
    if (isRamp){
      rel = (Math.random()-0.5) * (G.roadHalf*0.6);
    } else {
      rel = (Math.random()-0.5) * 2 * (G.roadHalf - margin);
    }
    G.obstacles.push({ depth: aheadDepth, rel, type: isRamp ? 'ramp' : 'cone', hit:false });
  }

  // ---------------- roadside trees ----------------
  function spawnTree(){
    const aheadDepth = G.scrollY + 300 + Math.random()*1300;
    const side = Math.random() < 0.5 ? -1 : 1;
    const rel = side * (G.roadHalf + 44 + Math.random()*170);
    G.trees.push({
      depth: aheadDepth, rel,
      kind: Math.random() < 0.55 ? 'pine' : 'round',
      size: 0.7 + Math.random()*0.9,
    });
  }

  function triggerCrash(){
    if (G.airborne || G.crashing || G.gameOver) return; // flying over hazards is safe — reward for stunts
    G.crashing = true;
    G.crashTimer = G.crashDur;
    G.shake = 18;
    G.combo = 1;
    G.comboTimer = 0;
    G.isDrifting = false;
    G.driftCharge = 0;
    const px = roadCenter(G.scrollY) + G.playerOffset;
    spawnSparks(px, H-130);
    spawnBlackSmoke(px, H-140, true);
  }

  function finishCrash(){
    G.crashing = false;
    G.gameOver = true;
    if (G.score > highscore) highscore = G.score;
    finalScoreEl.textContent = Math.round(G.score).toLocaleString();
    finalHighScoreEl.textContent = Math.round(highscore).toLocaleString();
    gameOverScreen.classList.remove('hidden');
  }

  function restartRun(){
    gameOverScreen.classList.add('hidden');
    centerMsg.classList.remove('show');
    Object.assign(G, {
      scrollY: 0, speed: 0,
      baseMaxSpeed: 230, accel: 140, handling: 560,
      strength: 100, maxStrength: 100,
      level: 1, xp: 0, xpToNext: 140, score: 0,
      playerOffset: 0, playerVX: 0, steer: 0,
      isDrifting: false, driftCharge: 0,
      combo: 1, comboTimer: 0, carAngle: 0, shake: 0, boostTimer: 0,
      airborne: false, stuntTimer: 0, stuntRotation: 0, stuntSpins: 1,
      obstacles: [], trees: [], particles: [],
      distSinceSpawn: 400, distSinceTree: 200,
      crashing: false, crashTimer: 0, gameOver: false,
    });
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) pauseBtn.textContent = '⏸';
    G.paused = false;
    last = performance.now();
  }

  function triggerStunt(){
    if (G.airborne) return;
    G.airborne = true;
    G.stuntTimer = G.stuntDur;
    G.stuntRotation = 0;
    G.stuntSpins = Math.abs(G.steer) > 0.35 ? 2 : 1;
    G.speed = Math.min(currentMaxSpeed()*1.2, G.speed + 60);
  }

  function landStunt(){
    G.airborne = false;
    const bonus = Math.round(70 * G.stuntSpins * G.combo);
    G.score += bonus;
    addXP(28 * G.stuntSpins);
    G.combo = Math.min(6, G.combo + 1);
    G.comboTimer = 4.2;
    showCenterMsg('+' + bonus + ' STUNT', 'combo');
  }

  function bankDrift(){
    if (G.driftCharge > 6){
      const gained = Math.round(G.driftCharge * 2.1 * G.combo);
      G.score += gained;
      addXP(G.driftCharge * 0.55);
      G.boostTimer = 1.3;
      G.combo = Math.min(6, G.combo + 0.5);
      G.comboTimer = 3.6;
      if (gained > 40) showCenterMsg('+' + gained + ' DRIFT', 'combo');
    }
    G.driftCharge = 0;
    G.isDrifting = false;
  }

  function currentMaxSpeed(){
    let m = G.baseMaxSpeed;
    if (G.boostTimer > 0) m *= 1.18;
    return m;
  }

  // ---------------- pause / start ----------------
  function togglePause(){
    G.paused = !G.paused;
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) pauseBtn.textContent = G.paused ? '▶' : '⏸';
    if (G.paused){ centerMsg.textContent = 'PAUSED'; centerMsg.className = 'hud-center-msg show level-pop'; }
    else { centerMsg.classList.remove('show'); }
  }

  const pauseBtn = document.getElementById('pauseBtn');
  const restartBtn = document.getElementById('restartBtn');
  if (pauseBtn) pauseBtn.addEventListener('click', () => { if (G.running && !G.gameOver) togglePause(); });
  if (restartBtn) restartBtn.addEventListener('click', () => { restartRun(); });
  if (gameOverRestartBtn) gameOverRestartBtn.addEventListener('click', () => { restartRun(); });

  startBtn.addEventListener('click', () => {
    startScreen.classList.add('hidden');
    G.running = true;
    G.paused = false;
    last = performance.now();
    requestAnimationFrame(loop);
  });

  // ---------------- update ----------------
  let last = 0;

  function updateParticles(dt){
    for (let i = G.particles.length-1; i>=0; i--){
      const p = G.particles[i];
      p.x += p.vx*dt; p.y += p.vy*dt;
      if (!p.noGravity) p.vy += 30*dt;
      p.life -= dt;
      if (p.life <= 0) G.particles.splice(i,1);
    }
  }

  function updateCrash(dt){
    G.speed = Math.max(0, G.speed - 300*dt);
    G.scrollY += G.speed*dt;
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt*20);
    const px = roadCenter(G.scrollY) + G.playerOffset;
    if (Math.random() < 0.85) spawnBlackSmoke(px, H-140);
    updateParticles(dt);
    G.crashTimer -= dt;
    if (G.crashTimer <= 0) finishCrash();
  }

  function updateWreck(dt){
    // ambient damage smoke + settling particles while the game-over screen is up
    const px = roadCenter(G.scrollY) + G.playerOffset;
    if (Math.random() < 0.1) spawnBlackSmoke(px, H-140);
    updateParticles(dt);
  }

  function update(dt){
    if (G.crashing){ updateCrash(dt); return; }

    G.steer = readSteer();

    // lateral movement
    const targetVX = G.steer * G.handling * (G.isDrifting ? 1.55 : 1);
    G.playerVX = lerp(G.playerVX, targetVX, Math.min(1, dt*9));
    G.playerOffset += G.playerVX * dt;

    // drift logic
    const canDrift = G.driftHeld && Math.abs(G.steer) > 0.2 && G.speed > 70 && !G.airborne;
    if (canDrift){
      G.isDrifting = true;
      G.driftCharge = Math.min(G.driftMax, G.driftCharge + dt * (36 + G.speed*0.14));
      const rearX = roadCenter(G.scrollY) + G.playerOffset - G.steer*14;
      spawnSmoke(rearX, H-108, G.steer);
    } else if (G.isDrifting){
      bankDrift();
    }

    // visual tilt
    const targetAngle = (G.isDrifting ? G.steer*0.5 : G.steer*0.16);
    G.carAngle = lerp(G.carAngle, targetAngle, Math.min(1, dt*7));

    // off-road check
    const offroad = Math.abs(G.playerOffset) > G.roadHalf;
    if (offroad){
      G.playerOffset = clamp(G.playerOffset, -(G.roadHalf+70), G.roadHalf+70);
      if (Math.random() < 0.6) spawnDust(roadCenter(G.scrollY)+G.playerOffset, H-120);
    }

    // speed
    const target = offroad ? currentMaxSpeed()*0.45 : currentMaxSpeed();
    if (G.speed < target) G.speed = Math.min(target, G.speed + G.accel*dt);
    else G.speed = Math.max(target, G.speed - G.accel*1.6*dt);

    if (G.boostTimer > 0) G.boostTimer -= dt;
    if (G.comboTimer > 0){ G.comboTimer -= dt; if (G.comboTimer <= 0) G.combo = 1; }

    // airborne / stunt
    if (G.airborne){
      G.stuntTimer -= dt;
      const progress = 1 - Math.max(0, G.stuntTimer/G.stuntDur);
      G.stuntRotation = progress * Math.PI*2*G.stuntSpins;
      if (G.stuntTimer <= 0) landStunt();
    }

    // world scroll — speed drives how fast the road & scenery fly past
    G.scrollY += G.speed * dt;
    G.score += G.speed * dt * 0.018;

    // strength (structural rating) trickles toward its level-based max
    G.strength = Math.min(G.maxStrength, G.strength + dt*2.2);

    // obstacles — spawn faster and denser as score climbs
    G.distSinceSpawn -= G.speed*dt;
    const spawnGap = clamp(620 - G.score*0.055 - G.level*6, 190, 620);
    if (G.distSinceSpawn <= 0){
      spawnObstacle();
      if (Math.random() < clamp(G.score/5200, 0, 0.5)) spawnObstacle();
      G.distSinceSpawn = spawnGap + Math.random()*200;
    }

    // roadside trees — denser the faster you're going
    G.distSinceTree -= G.speed*dt;
    const treeGap = clamp(180 - G.speed*0.32, 24, 180);
    if (G.distSinceTree <= 0){
      spawnTree();
      if (Math.random() < 0.65) spawnTree();
      G.distSinceTree = treeGap + Math.random()*50;
    }
    for (let i = G.trees.length-1; i>=0; i--){
      const t = G.trees[i];
      const ahead = t.depth - G.scrollY;
      if (ahead < -140){ G.trees.splice(i,1); continue; }
      t._x = roadCenter(t.depth) + t.rel;
      t._y = (H-130) - ahead;
      t._scale = clamp(0.4 + (1 - Math.min(1, ahead/1500))*1.15, 0.4, 1.7) * t.size;
    }

    const playerX = roadCenter(G.scrollY) + G.playerOffset;
    for (let i = G.obstacles.length-1; i>=0; i--){
      const o = G.obstacles[i];
      const ahead = o.depth - G.scrollY;
      if (ahead < -80){ G.obstacles.splice(i,1); continue; }
      o._x = roadCenter(o.depth) + o.rel;
      o._y = (H-130) - ahead;
      o._scale = clamp(0.55 + (1 - Math.min(1, ahead/1100))*0.75, 0.55, 1.3);
      if (!o.hit && ahead < 46 && ahead > -46){
        const dx = Math.abs(o._x - playerX);
        const hitR = o.type === 'ramp' ? 74 : 34;
        if (dx < hitR){
          o.hit = true;
          if (o.type === 'ramp') triggerStunt(); else triggerCrash();
        }
      }
    }

    updateParticles(dt);

    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt*26);
  }

  // ---------------- render ----------------
  function drawRoad(){
    ctx.fillStyle = '#2E4A2F';
    ctx.fillRect(0,0,W,H);

    const top = 40;
    for (let y = H; y >= top; y -= 5){
      const ahead = (H-130) - y;
      const depth = G.scrollY + ahead;
      const cx = roadCenter(depth);
      const shade = clamp(1 - ahead/1400, 0.35, 1);
      ctx.fillStyle = `rgba(58,60,64,${0.55+shade*0.45})`;
      ctx.fillRect(cx - G.roadHalf, y-5, G.roadHalf*2, 6);
      // rumble edges
      ctx.fillStyle = (Math.floor(depth/40)%2===0) ? '#D6D6D6' : '#B23B2A';
      ctx.fillRect(cx - G.roadHalf - 8, y-5, 8, 6);
      ctx.fillRect(cx + G.roadHalf, y-5, 8, 6);
      // dashed center line
      if (Math.floor(depth/46)%2===0){
        ctx.fillStyle = `rgba(243,241,234,${0.65*shade})`;
        ctx.fillRect(cx-3, y-5, 6, 6);
      }
    }
  }

  function drawTrees(){
    for (const t of G.trees){
      if (t._y < -80 || t._y > H+100) continue;
      ctx.save();
      ctx.translate(t._x, t._y);
      ctx.scale(t._scale, t._scale);
      ctx.fillStyle = 'rgba(0,0,0,.22)';
      ctx.beginPath(); ctx.ellipse(0, 20, 16, 5, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#5B3A22';
      ctx.fillRect(-4, -2, 8, 20);
      if (t.kind === 'pine'){
        ctx.fillStyle = '#2E6B36';
        for (let i=0;i<3;i++){
          const w = 30 - i*8, yy = -8 - i*15;
          ctx.beginPath();
          ctx.moveTo(0, yy-18); ctx.lineTo(w/2, yy); ctx.lineTo(-w/2, yy); ctx.closePath();
          ctx.fill();
        }
      } else {
        ctx.fillStyle = '#3C7A42';
        ctx.beginPath(); ctx.arc(0,-20,19,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = '#4F8F55';
        ctx.beginPath(); ctx.arc(-7,-27,13,0,Math.PI*2); ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawObstacles(){
    for (const o of G.obstacles){
      if (o._y < 20 || o._y > H+40) continue;
      ctx.save();
      ctx.translate(o._x, o._y);
      ctx.scale(o._scale, o._scale);
      if (o.type === 'ramp'){
        ctx.fillStyle = '#1c1c1c';
        ctx.fillRect(-46, -6, 92, 14);
        ctx.fillStyle = '#FFB100';
        for (let i=-40;i<40;i+=16) ctx.fillRect(i,-6,8,14);
        ctx.fillStyle = 'rgba(255,177,0,.85)';
        ctx.fillRect(-46,-16,92,10);
      } else {
        ctx.beginPath();
        ctx.moveTo(0,-16); ctx.lineTo(12,10); ctx.lineTo(-12,10); ctx.closePath();
        ctx.fillStyle = '#FF6A1F'; ctx.fill();
        ctx.fillStyle = '#F3F1EA'; ctx.fillRect(-9,2,18,4);
        ctx.fillStyle = 'rgba(0,0,0,.25)';
        ctx.beginPath(); ctx.ellipse(0,14,13,4,0,0,Math.PI*2); ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawParticles(){
    for (const p of G.particles){
      const a = Math.max(0, p.life/p.maxLife);
      ctx.fillStyle = p.color.replace('ALPHA', (a*0.8).toFixed(2));
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size*(0.5+a*0.5), 0, Math.PI*2);
      ctx.fill();
    }
  }

  function drawCar(){
    const x = roadCenter(G.scrollY) + G.playerOffset;
    const y = H - 130;
    const hop = G.airborne ? Math.sin(Math.min(Math.PI, (1-(G.stuntTimer/G.stuntDur))*Math.PI))*34 : 0;
    const scale = 1 + (hop/34)*0.28;

    // shadow
    ctx.save();
    ctx.translate(x, y + 22);
    ctx.scale(1,0.4);
    ctx.beginPath();
    ctx.fillStyle = `rgba(0,0,0,${0.32*(1-(hop/60))})`;
    ctx.arc(0,0, 26, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(x, y - hop);
    ctx.rotate(G.carAngle + (G.airborne ? G.stuntRotation : 0));
    ctx.scale(scale, scale);

    // body
    const grad = ctx.createLinearGradient(-16,-30,16,30);
    grad.addColorStop(0, '#FF5A38');
    grad.addColorStop(1, '#C92A11');
    ctx.fillStyle = grad;
    roundRect(ctx, -15, -30, 30, 60, 8);
    ctx.fill();

    // windshield
    ctx.fillStyle = 'rgba(20,24,28,.85)';
    roundRect(ctx, -10, -16, 20, 20, 4); ctx.fill();

    // headlights
    ctx.fillStyle = G.boostTimer>0 ? '#FFF3C4' : '#FFE59A';
    ctx.fillRect(-13,-29,7,6); ctx.fillRect(6,-29,7,6);

    // taillights
    ctx.fillStyle = G.isDrifting || G.boostTimer>0 ? '#FF3B1F' : '#8a1c0f';
    ctx.fillRect(-13,24,7,5); ctx.fillRect(6,24,7,5);

    // side stripe
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.fillRect(-2,-28,4,56);

    ctx.restore();
  }

  function roundRect(c,x,y,w,h,r){
    c.beginPath();
    c.moveTo(x+r,y);
    c.arcTo(x+w,y,x+w,y+h,r);
    c.arcTo(x+w,y+h,x,y+h,r);
    c.arcTo(x,y+h,x,y,r);
    c.arcTo(x,y,x+w,y,r);
    c.closePath();
  }

  function render(){
    ctx.save();
    if (G.shake > 0){
      ctx.translate((Math.random()-0.5)*G.shake, (Math.random()-0.5)*G.shake);
    }
    drawRoad();
    drawTrees();
    drawObstacles();
    drawCar();
    drawParticles();

    // vignette
    const vg = ctx.createRadialGradient(W/2,H*0.55,H*0.25,W/2,H*0.55,H*0.85);
    vg.addColorStop(0,'rgba(0,0,0,0)');
    vg.addColorStop(1,'rgba(0,0,0,.38)');
    ctx.fillStyle = vg;
    ctx.fillRect(0,0,W,H);
    ctx.restore();
  }

  function updateHUD(){
    hud.speed.innerHTML = Math.round(G.speed*0.92) + ' <span style="font-size:.9rem;">km/h</span>';
    const hp = Math.round(110 + G.level*38 + (G.boostTimer>0?45:0));
    hud.power.innerHTML = hp + ' <span style="font-size:.9rem;">hp</span>';
    hud.level.textContent = G.level;
    hud.score.textContent = Math.round(G.score).toLocaleString();
    hud.highscore.textContent = Math.round(Math.max(highscore, G.score)).toLocaleString();
    hud.xpBar.style.width = clamp(G.xp / G.xpToNext * 100, 0, 100) + '%';
    hud.strengthBar.style.width = clamp(G.strength / G.maxStrength * 100, 0, 100) + '%';
    hud.driftBar.style.width = clamp(G.driftCharge / G.driftMax * 100, 0, 100) + '%';
  }

  function loop(now){
    if (!G.running) return;
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    if (G.gameOver){
      updateWreck(dt);
    } else if (!G.paused){
      update(dt);
      updateHUD();
    }
    render();
    requestAnimationFrame(loop);
  }

  render(); // initial frame behind start screen
})();