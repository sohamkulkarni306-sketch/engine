/* =========================================================
   THE ENGINE — BUILD YOUR OWN ENGINE
   Parametric engine designer: live blueprint spec sheet,
   dimensioned SVG diagrams, contextual engineering tips,
   and a real-time 3D kinematic simulation (Three.js).
   ========================================================= */
(() => {
  const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
  const lerp = (a,b,t) => a + (b-a)*t;

  // ---------------- DOM refs ----------------
  const el = (id) => document.getElementById(id);
  const layoutSelect = el('layoutSelect');
  const cylSelect = el('cylSelect');
  const bankAngle = el('bankAngle');
  const bankAngleVal = el('bankAngleVal');
  const bankAngleNote = el('bankAngleNote');
  const bore = el('bore'), boreVal = el('boreVal');
  const stroke = el('stroke'), strokeVal = el('strokeVal');
  const compRatio = el('compRatio'), compRatioVal = el('compRatioVal');
  const induction = el('induction');
  const boost = el('boost'), boostVal = el('boostVal');
  const redline = el('redline'), redlineVal = el('redlineVal');
  const material = el('material');
  const fuel = el('fuel');
  const presetBtns = document.querySelectorAll('.preset-btn');

  const statDisp = el('statDisp'), statHP = el('statHP'), statTQ = el('statTQ'), statRPM = el('statRPM');
  const rpmSlider = el('rpmSlider'), rpmSliderVal = el('rpmSliderVal');
  const autoRevBtn = el('autoRevBtn'), camResetBtn = el('camResetBtn');
  const bpSpec = el('bpSpec'), tipsList = el('tipsList');
  const svgBore = el('svgBore'), svgStroke = el('svgStroke'), svgBank = el('svgBank');
  const bankDiagramWrap = el('bankDiagramWrap');
  const viewportWrap = document.querySelector('.viewport-wrap');
  const canvas = el('engineCanvas');

  // ---------------- reference data ----------------
  const CYL_OPTIONS = {
    inline: [2,3,4,5,6],
    v: [4,6,8,10,12,16],
    flat: [4,6,8,12],
    w: [8,12,16],
  };
  const IDEAL_BANK = {
    v: {4:90, 6:60, 8:90, 10:72, 12:60, 16:45},
    w: {8:72, 12:60, 16:90},
  };
  const MATERIALS = {
    cast_iron:        { name:'Cast Iron',              weightFactor:1.35, color:0x3a3d40, note:'heavy but tough and cheap, and it tolerates heat abuse well' },
    aluminum:         { name:'Aluminum Alloy',          weightFactor:0.68, color:0x9aa4ac, note:'light and sheds heat fast, but needs iron or coated liners for cylinder durability' },
    forged_sleeved:   { name:'Forged Steel Sleeved',    weightFactor:0.95, color:0x6b7480, note:'an aluminum block with forged-steel-sleeved cylinders — handles high boost and high rpm with real margin' },
    titanium_composite:{ name:'Titanium Composite',     weightFactor:0.42, color:0xC9A227, note:'exotic, extremely light and heat-tolerant, at a steep machining cost' },
  };
  const FUELS = {
    '87':    { name:'Regular 87 Octane',       safeNA:10.2, safeBoost:8.8 },
    '91':    { name:'Premium 91–93 Octane',    safeNA:11.8, safeBoost:10.0 },
    'e85':   { name:'E85 Ethanol',             safeNA:13.5, safeBoost:11.5 },
    'diesel':{ name:'Diesel',                  safeNA:22,   safeBoost:18 },
  };
  const PRESETS = {
    economy: { layout:'inline', cylinders:4, bankAngle:0,  bore:74,  stroke:81, compRatio:11.0, induction:'na',    boost:0,  redline:6500, material:'aluminum',          fuel:'87' },
    muscle:  { layout:'v',      cylinders:8, bankAngle:90, bore:102, stroke:92, compRatio:10.2, induction:'na',    boost:0,  redline:6500, material:'cast_iron',         fuel:'91' },
    exotic:  { layout:'v',      cylinders:12,bankAngle:60, bore:89,  stroke:77, compRatio:12.3, induction:'na',    boost:0,  redline:8900, material:'forged_sleeved',    fuel:'91' },
    rally:   { layout:'flat',   cylinders:4, bankAngle:180,bore:86,  stroke:86, compRatio:10.8, induction:'turbo', boost:16, redline:7000, material:'aluminum',          fuel:'91' },
    hyper:   { layout:'w',      cylinders:16,bankAngle:90, bore:86,  stroke:86, compRatio:9.5,  induction:'turbo', boost:22, redline:6800, material:'titanium_composite',fuel:'91' },
  };

  function idealBankAngle(layout, cyl){
    if (layout === 'v') return IDEAL_BANK.v[cyl] || 60;
    if (layout === 'w') return IDEAL_BANK.w[cyl] || 72;
    return layout === 'flat' ? 180 : 0;
  }

  // ---------------- state ----------------
  const S = {
    layout:'v', cylinders:6, bankAngle:60,
    bore:86, stroke:86, compRatio:10.5,
    induction:'na', boost:0, redline:7000,
    material:'aluminum', fuel:'91',
    rpm:800,
  };
  let riskFlag = false;

  // ---------------- formulas ----------------
  function computeAll(){
    const ccPerCyl = Math.PI * Math.pow(S.bore/2, 2) * S.stroke / 1000;
    const dispL = (ccPerCyl * S.cylinders) / 1000;
    const crankRadius = S.stroke / 2;
    const firingInterval = 720 / S.cylinders;
    const mat = MATERIALS[S.material];
    const weightKg = Math.round((45 + S.cylinders*11 + dispL*9) * mat.weightFactor);
    const rpmFactor = S.redline / 7000;
    let hp = dispL * 62 * rpmFactor;
    if (S.induction === 'turbo') hp *= (1 + S.boost/14.7*0.65);
    if (S.induction === 'super') hp *= (1 + S.boost/14.7*0.55);
    hp = Math.round(hp);
    const torque = Math.round(hp * 5252 / S.redline);
    return { dispL, crankRadius, firingInterval, weightKg, hp, torque };
  }

  // ---------------- blueprint spec sheet ----------------
  function renderSpec(computed){
    const mat = MATERIALS[S.material], f = FUELS[S.fuel];
    const bankLabel = S.layout==='inline' ? '0° (single bank)' : S.layout==='flat' ? '180° (opposed)' : S.bankAngle+'°';
    const rows = [
      ['Layout', S.layout.toUpperCase()],
      ['Cylinders', S.cylinders],
      ['Bore', S.bore+' mm'],
      ['Stroke', S.stroke+' mm'],
      ['Crank Radius', computed.crankRadius.toFixed(1)+' mm'],
      ['Bank Angle', bankLabel],
      ['Firing Interval', computed.firingInterval.toFixed(1)+'°'],
      ['Compression', S.compRatio.toFixed(1)+':1'],
      ['Displacement', computed.dispL.toFixed(2)+' L', true],
      ['Induction', S.induction==='na' ? 'Naturally Aspirated' : S.induction==='turbo' ? 'Turbocharged' : 'Supercharged'],
      ['Boost', S.induction==='na' ? '—' : S.boost+' psi'],
      ['Redline', S.redline+' rpm'],
      ['Material', mat.name],
      ['Fuel', f.name],
      ['Est. Weight', computed.weightKg+' kg'],
    ];
    bpSpec.innerHTML = rows.map(([k,v,hl]) => `<div><b>${k}</b><span${hl?' class="hl"':''}>${v}</span></div>`).join('');
  }

  // ---------------- blueprint diagrams ----------------
  function renderDiagrams(){
    const r = 18 + (S.bore-60)*0.82;
    const cx = 100, cy = 80;
    svgBore.innerHTML = `
      <line x1="10" y1="${cy}" x2="270" y2="${cy}" stroke="#C9CBC3" stroke-width="1" stroke-dasharray="2,3"/>
      <line x1="${cx}" y1="10" x2="${cx}" y2="150" stroke="#C9CBC3" stroke-width="1" stroke-dasharray="2,3"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#14181C" stroke-width="2"/>
      <line x1="${cx-r}" y1="${cy}" x2="${cx+r}" y2="${cy}" stroke="#FF3B1F" stroke-width="1.5"/>
      <line x1="${cx-r}" y1="${cy-6}" x2="${cx-r}" y2="${cy+6}" stroke="#FF3B1F" stroke-width="1.5"/>
      <line x1="${cx+r}" y1="${cy-6}" x2="${cx+r}" y2="${cy+6}" stroke="#FF3B1F" stroke-width="1.5"/>
      <text x="${cx+r+16}" y="${cy+4}" font-size="13" fill="#14181C">⌀ ${S.bore} mm</text>
    `;

    const sH = 40 + (S.stroke-55)*1.05;
    const w = 30 + (S.bore-60)*0.28;
    const topY = 18, cylBotY = topY + sH + 16;
    const crankCx = 140, crankCy = cylBotY + 34;
    const crankR = 14 + (S.stroke-55)*0.28;
    const pinX = crankCx + crankR, pinY = crankCy;
    svgStroke.innerHTML = `
      <rect x="${140-w/2}" y="${topY}" width="${w}" height="${sH+16}" fill="none" stroke="#14181C" stroke-width="2"/>
      <rect x="${140-w/2+3}" y="${topY+6}" width="${w-6}" height="14" fill="#9aa4ac" stroke="#14181C" stroke-width="1"/>
      <line x1="140" y1="${topY+13}" x2="${pinX}" y2="${pinY}" stroke="#5B6672" stroke-width="3"/>
      <circle cx="${crankCx}" cy="${crankCy}" r="${crankR}" fill="none" stroke="#C9CBC3" stroke-width="1" stroke-dasharray="2,3"/>
      <circle cx="${pinX}" cy="${pinY}" r="5" fill="#FF3B1F"/>
      <line x1="${crankCx}" y1="${crankCy}" x2="${pinX}" y2="${pinY}" stroke="#FF3B1F" stroke-width="1.5"/>
      <text x="${crankCx-14}" y="${crankCy-crankR-8}" font-size="11" fill="#FF3B1F">R ${ (S.stroke/2).toFixed(1) } mm</text>
      <line x1="${140+w/2+16}" y1="${topY}" x2="${140+w/2+16}" y2="${cylBotY}" stroke="#14181C" stroke-width="1"/>
      <line x1="${140+w/2+11}" y1="${topY}" x2="${140+w/2+21}" y2="${topY}" stroke="#14181C" stroke-width="1"/>
      <line x1="${140+w/2+11}" y1="${cylBotY}" x2="${140+w/2+21}" y2="${cylBotY}" stroke="#14181C" stroke-width="1"/>
      <text x="${140+w/2+26}" y="${(topY+cylBotY)/2+4}" font-size="12" fill="#14181C">Stroke ${S.stroke} mm</text>
    `;

    const cx2 = 140, apexY = 150, armLen = 105;
    if (S.layout === 'inline'){
      svgBank.innerHTML = `
        <line x1="${cx2}" y1="${apexY}" x2="${cx2}" y2="${apexY-armLen}" stroke="#14181C" stroke-width="3"/>
        <circle cx="${cx2}" cy="${apexY}" r="4" fill="#FF3B1F"/>
        <text x="${cx2+12}" y="${apexY-armLen/2}" font-size="13" fill="#14181C">0° — single bank</text>`;
      bankDiagramWrap.style.display = '';
    } else if (S.layout === 'flat'){
      svgBank.innerHTML = `
        <line x1="${cx2-armLen}" y1="${apexY-50}" x2="${cx2+armLen}" y2="${apexY-50}" stroke="#14181C" stroke-width="3"/>
        <circle cx="${cx2}" cy="${apexY-50}" r="4" fill="#FF3B1F"/>
        <text x="${cx2-52}" y="${apexY-62}" font-size="13" fill="#14181C">180° — horizontally opposed</text>`;
      bankDiagramWrap.style.display = '';
    } else {
      const half = (S.bankAngle/2) * Math.PI/180;
      const x1 = cx2 - armLen*Math.sin(half), y1 = apexY - armLen*Math.cos(half);
      const x2 = cx2 + armLen*Math.sin(half), y2 = apexY - armLen*Math.cos(half);
      const arcR = 34;
      const ax1 = cx2 - arcR*Math.sin(half), ay1 = apexY - arcR*Math.cos(half);
      const ax2 = cx2 + arcR*Math.sin(half), ay2 = apexY - arcR*Math.cos(half);
      const largeArc = S.bankAngle > 180 ? 1 : 0;
      svgBank.innerHTML = `
        <line x1="${cx2}" y1="${apexY}" x2="${x1}" y2="${y1}" stroke="#14181C" stroke-width="3"/>
        <line x1="${cx2}" y1="${apexY}" x2="${x2}" y2="${y2}" stroke="#14181C" stroke-width="3"/>
        <path d="M ${ax1} ${ay1} A ${arcR} ${arcR} 0 ${largeArc} 1 ${ax2} ${ay2}" fill="none" stroke="#FF3B1F" stroke-width="2"/>
        <circle cx="${cx2}" cy="${apexY}" r="4" fill="#FF3B1F"/>
        <text x="${cx2-18}" y="${apexY-arcR-10}" font-size="14" fill="#FF3B1F" font-weight="700">${S.bankAngle}°</text>
        ${S.layout==='w' ? `<text x="${cx2-98}" y="${apexY+18}" font-size="10.5" fill="#5B6672">W = two narrow-angle bank pairs joined at this angle</text>` : ''}
      `;
      bankDiagramWrap.style.display = '';
    }
  }

  // ---------------- engineer's tips ----------------
  function renderTips(computed){
    const tips = [];
    const mat = MATERIALS[S.material];
    const f = FUELS[S.fuel];

    // oil
    let oilRec, oilReason;
    if (S.induction !== 'na'){
      oilRec = '5W-40 or 5W-50 full synthetic';
      oilReason = 'Boosted engines run hotter oil and harder-working bearings — a shear-stable full synthetic protects the turbo/supercharger bearings and resists coking.';
    } else if (S.redline >= 8500){
      oilRec = '0W-20 or 5W-30 full synthetic';
      oilReason = 'A high-revving naturally aspirated engine wants a thin, low-friction oil that flows instantly on cold start and doesn\u2019t rob power up top.';
    } else if (computed.dispL > 4.5 && S.redline < 6000){
      oilRec = '15W-40 heavy-duty synthetic blend';
      oilReason = 'Large-displacement, low-revving engines like this benefit from a heavier film protecting the big-end bearings under high torque loads.';
    } else {
      oilRec = '5W-30 full synthetic';
      oilReason = 'A balanced, general-purpose viscosity — good cold-start flow without sacrificing much high-load protection.';
    }
    tips.push({ level:'info', title:'Recommended oil: '+oilRec, text:oilReason });

    // material
    if ((S.boost > 15 || S.redline > 9000) && S.material === 'cast_iron'){
      tips.push({ level:'warn', title:'Block material is a limiting factor', text:`Cast iron is tough, but its extra reciprocating mass and lower thermal conductivity work against you at ${S.redline} rpm / ${S.boost} psi. Forged Steel Sleeved or Titanium Composite would give this build real margin.` });
    } else if (S.material === 'aluminum' && S.boost > 20){
      tips.push({ level:'warn', title:'Aluminum under heavy boost', text:`At ${S.boost} psi a plain aluminum block can distort over time. Forged-steel cylinder sleeves keep the light weight while adding the strength this boost level needs.` });
    } else {
      tips.push({ level:'ok', title:mat.name+' is a solid match here', text:`${mat.note[0].toUpperCase()+mat.note.slice(1)} — well suited to this power level and rpm range.` });
    }

    // bank angle
    if (S.layout === 'v' || S.layout === 'w'){
      const ideal = idealBankAngle(S.layout, S.cylinders);
      const diff = Math.abs(S.bankAngle - ideal);
      if (diff <= 6){
        tips.push({ level:'ok', title:'Bank angle is well balanced', text:`${S.bankAngle}° sits right by the ${ideal}° textbook angle for a ${S.cylinders}-cylinder ${S.layout.toUpperCase()}, giving smooth, evenly-spaced firing pulses.` });
      } else {
        tips.push({ level:'warn', title:'Bank angle will add vibration', text:`${S.bankAngle}° is ${Math.round(diff)}° off the ${ideal}° ideal for this layout — expect uneven firing intervals. A balance shaft helps, or move the angle closer to ${ideal}°.` });
      }
    }

    // compression vs fuel
    const safeCR = S.induction === 'na' ? f.safeNA : f.safeBoost;
    if (S.compRatio > safeCR){
      tips.push({ level:'warn', title:'Detonation risk on this fuel', text:`${S.compRatio.toFixed(1)}:1 is above the safe ceiling (~${safeCR.toFixed(1)}:1) for ${f.name}${S.induction!=='na'?' under boost':''}. Lower the compression, richen the tune under load, or move to a higher-octane fuel.` });
    } else {
      tips.push({ level:'ok', title:'Compression ratio is safe for this fuel', text:`${S.compRatio.toFixed(1)}:1 leaves comfortable margin below the ~${safeCR.toFixed(1)}:1 ceiling for ${f.name}.` });
    }

    // cooling
    if (S.induction !== 'na' || computed.hp > 400){
      tips.push({ level:'info', title:'Plan for extra cooling', text:`At an estimated ${computed.hp} hp, size up the radiator and add an oil cooler — ${S.induction!=='na'?'boosted':'high-output'} engines reject far more heat than the block alone can shed.` });
    }

    // valvetrain
    if (S.redline > 8000){
      tips.push({ level:'info', title:'Upgrade the valvetrain for this redline', text:'Past 8,000 rpm, stock valve springs and retainers risk float. Titanium retainers and lighter valves cut reciprocating mass so the valves keep tracking the cam.' });
    }

    // displacement class
    let appText;
    if (computed.dispL < 2) appText = 'a compact, efficient engine suited to economy cars and lightweight hot hatches.';
    else if (computed.dispL < 4) appText = 'a versatile mid-size engine — comfortably at home in a sports coupe or performance sedan.';
    else if (computed.dispL < 6) appText = 'a big, torque-rich engine built for muscle cars, GT cruisers or trucks.';
    else appText = 'a large-displacement flagship engine — exotic hypercar or heavy-duty territory.';
    tips.push({ level:'info', title:computed.dispL.toFixed(1)+'L class', text:'At this size, you\u2019ve built '+appText });

    riskFlag = tips.some(t => t.level === 'warn');

    const icon = { warn:'⚠', ok:'✓', info:'ℹ' };
    tipsList.innerHTML = tips.slice(0,7).map(t => `
      <div class="tip-card ${t.level}">
        <h4><span class="tip-icon">${icon[t.level]}</span> ${t.title}</h4>
        <p>${t.text}</p>
      </div>
    `).join('');
  }

  function updateHUDStats(computed){
    statDisp.textContent = computed.dispL.toFixed(2)+' L';
    statHP.textContent = computed.hp+' hp';
    statTQ.textContent = computed.torque+' lb-ft';
  }

  // ================= THREE.JS SIMULATION =================
  let renderer, scene, camera, engineGroup, crankMesh;
  let enginePistons = [];
  let hasThree = (typeof THREE !== 'undefined');
  const camState = { theta:0.7, phi:1.05, radius:420 };
  const camTarget = hasThree ? new THREE.Vector3(0,10,0) : null;

  function updateCameraFromState(){
    if (!camera) return;
    const { theta, phi, radius } = camState;
    camera.position.set(
      camTarget.x + radius*Math.sin(phi)*Math.sin(theta),
      camTarget.y + radius*Math.cos(phi),
      camTarget.z + radius*Math.sin(phi)*Math.cos(theta)
    );
    camera.lookAt(camTarget);
  }

  function makeSoftCircleTexture(){
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32,32,0,32,32,32);
    grad.addColorStop(0,'rgba(255,255,255,0.9)');
    grad.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0,0,64,64);
    return new THREE.CanvasTexture(c);
  }

  let smokeTexture, smokeParticles = [], smokeTimer = 0;
  let exhaustTip = null;

  function initThree(){
    if (!hasThree){
      viewportWrap.innerHTML = '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#8B9096;font-family:var(--mono);font-size:.85rem;text-align:center;padding:20px;">3D preview needs an internet connection to load the Three.js library.<br>The blueprint and tips panels still work fully offline.</div>';
      return;
    }
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x14181C);

    const rect = viewportWrap.getBoundingClientRect();
    camera = new THREE.PerspectiveCamera(42, rect.width/Math.max(1,rect.height), 1, 4000);
    updateCameraFromState();

    renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
    renderer.setSize(rect.width, rect.height, false);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const d1 = new THREE.DirectionalLight(0xffffff, 0.95); d1.position.set(220,320,180); scene.add(d1);
    const d2 = new THREE.DirectionalLight(0xff8b5a, 0.32); d2.position.set(-220,120,-200); scene.add(d2);

    const grid = new THREE.GridHelper(700, 30, 0x3a3f45, 0x22262b);
    grid.position.y = -78;
    scene.add(grid);

    smokeTexture = makeSoftCircleTexture();

    // pointer orbit controls
    let dragging = false, lastX = 0, lastY = 0;
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', (e) => {
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      camState.theta -= dx*0.0065;
      camState.phi = clamp(camState.phi - dy*0.0065, 0.28, Math.PI-0.28);
      updateCameraFromState();
    });
    canvas.addEventListener('pointerup', () => { dragging = false; });
    canvas.addEventListener('pointercancel', () => { dragging = false; });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      camState.radius = clamp(camState.radius + e.deltaY*0.45, 150, 900);
      updateCameraFromState();
    }, { passive:false });

    camResetBtn.addEventListener('click', () => {
      camState.theta = 0.7; camState.phi = 1.05; camState.radius = 420;
      updateCameraFromState();
    });

    if (window.ResizeObserver){
      new ResizeObserver(() => onViewportResize()).observe(viewportWrap);
    }
    window.addEventListener('resize', onViewportResize);

    buildEngine();
    lastT = performance.now();
    requestAnimationFrame(animate);
  }

  function onViewportResize(){
    if (!renderer) return;
    const rect = viewportWrap.getBoundingClientRect();
    const w = Math.max(280, rect.width), h = Math.max(300, rect.height);
    camera.aspect = w/h; camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  function disposeGroup(group){
    group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material){
        if (Array.isArray(obj.material)) obj.material.forEach(m=>m.dispose());
        else obj.material.dispose();
      }
    });
  }

  function buildEngine(){
    if (!hasThree || !scene) return;
    if (engineGroup){ scene.remove(engineGroup); disposeGroup(engineGroup); }
    engineGroup = new THREE.Group();
    enginePistons = [];

    const mat = MATERIALS[S.material];
    const blockMat = new THREE.MeshStandardMaterial({ color: mat.color, metalness:0.6, roughness:0.42 });
    const pistonMat = new THREE.MeshStandardMaterial({ color:0xB8BCC0, metalness:0.8, roughness:0.22 });
    const cylMat = new THREE.MeshStandardMaterial({ color:0x1a1d20, metalness:0.4, roughness:0.5, side:THREE.DoubleSide });
    const crankMatM = new THREE.MeshStandardMaterial({ color:0xFF3B1F, metalness:0.55, roughness:0.35 });

    // bank angle set (radians, signed) per layout
    let banks;
    if (S.layout === 'inline') banks = [0];
    else if (S.layout === 'flat') banks = [-Math.PI/2, Math.PI/2];
    else {
      const half = (S.bankAngle/2) * Math.PI/180;
      if (S.layout === 'v') banks = [-half, half];
      else { const n = 7*Math.PI/180; banks = [-half-n, -half+n, half-n, half+n]; } // W: two narrow-angle pairs
    }

    const perBank = new Array(banks.length).fill(0);
    for (let i=0;i<S.cylinders;i++) perBank[i % banks.length]++;

    const spacing = 34;
    const maxPerBank = Math.max(...perBank);
    const length = (maxPerBank-1)*spacing + 70;

    const blockGeo = new THREE.BoxGeometry(length, 46, 64);
    engineGroup.add(new THREE.Mesh(blockGeo, blockMat));

    // crankshaft (spins around its own long axis via a pivot)
    const crankPivot = new THREE.Object3D();
    crankPivot.rotation.z = Math.PI/2;
    crankPivot.position.set(0, -30, 0);
    const crankGeo = new THREE.CylinderGeometry(7, 7, length+16, 14);
    crankMesh = new THREE.Mesh(crankGeo, crankMatM);
    crankPivot.add(crankMesh);
    engineGroup.add(crankPivot);

    // exhaust pipe (rear) — reference point for smoke
    const exGeo = new THREE.CylinderGeometry(6, 6, 34, 10);
    const exMesh = new THREE.Mesh(exGeo, new THREE.MeshStandardMaterial({color:0x2a2d30, metalness:0.5, roughness:0.5}));
    exMesh.rotation.z = Math.PI/2.4;
    exMesh.position.set(length/2+18, -18, 30);
    engineGroup.add(exMesh);
    exhaustTip = new THREE.Vector3(length/2+34, -22, 34);

    const pistonAmplitude = clamp(6 + S.stroke*0.14, 8, 20);

    let cylCounter = 0;
    for (let b=0; b<banks.length; b++){
      const count = perBank[b];
      const startX = -(count-1)*spacing/2;
      for (let i=0;i<count;i++){
        const xPos = startX + i*spacing;
        const pivot = new THREE.Object3D();
        pivot.position.set(xPos, 23, 0);
        pivot.rotation.x = banks[b];
        engineGroup.add(pivot);

        const cylGeo = new THREE.CylinderGeometry(12, 12, 46, 16, 1, true);
        const cylMesh = new THREE.Mesh(cylGeo, cylMat);
        cylMesh.position.y = 23;
        pivot.add(cylMesh);

        const pistonGeo = new THREE.CylinderGeometry(10, 10, 13, 16);
        const pistonMesh = new THREE.Mesh(pistonGeo, pistonMat);
        pivot.add(pistonMesh);

        const phase = (cylCounter % S.cylinders) * (2*Math.PI/S.cylinders);
        enginePistons.push({ mesh: pistonMesh, phase, base: 23, amp: pistonAmplitude });
        cylCounter++;
      }
    }

    scene.add(engineGroup);
  }

  function spawnSmoke(){
    if (!hasThree || smokeParticles.length > 34) return;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: smokeTexture, transparent:true, depthWrite:false,
      color: riskFlag ? 0x2a2a2a : 0xB8BABC, opacity:0.5
    }));
    spr.position.set(
      exhaustTip.x + (Math.random()-0.5)*6,
      exhaustTip.y + (Math.random()-0.5)*4,
      exhaustTip.z + (Math.random()-0.5)*6
    );
    spr.scale.setScalar(9 + Math.random()*5);
    scene.add(spr);
    smokeParticles.push({ sprite:spr, life:1.3+Math.random()*0.6, maxLife:1.9, vy:15+Math.random()*10 });
  }

  function updateSmoke(dt){
    for (let i=smokeParticles.length-1;i>=0;i--){
      const p = smokeParticles[i];
      p.sprite.position.y += p.vy*dt;
      p.sprite.scale.multiplyScalar(1+dt*0.35);
      p.life -= dt;
      p.sprite.material.opacity = Math.max(0, p.life/p.maxLife) * 0.5;
      if (p.life <= 0){
        scene.remove(p.sprite);
        p.sprite.material.dispose();
        smokeParticles.splice(i,1);
      }
    }
  }

  let crankAngle = 0, lastT = 0, autoRev = false, autoPhase = 0;

  function animate(t){
    requestAnimationFrame(animate);
    const dt = Math.min(0.033, (t-lastT)/1000) || 0;
    lastT = t;

    if (autoRev){
      autoPhase += dt*0.55;
      const k = (Math.sin(autoPhase)+1)/2;
      S.rpm = Math.round(800 + k*(S.redline-800));
      rpmSlider.value = S.rpm;
      rpmSliderVal.textContent = S.rpm+' rpm';
    }

    const visualAngVel = clamp(S.rpm/60*2*Math.PI*0.02, 0.15, 3.4);
    crankAngle += visualAngVel*dt;
    if (crankMesh) crankMesh.rotation.y += visualAngVel*dt;

    for (const p of enginePistons){
      p.mesh.position.y = p.base + p.amp*0.5*Math.cos(crankAngle - p.phase);
    }

    smokeTimer -= dt;
    if (smokeTimer <= 0){
      spawnSmoke();
      smokeTimer = clamp(0.22 - S.rpm/60000, 0.035, 0.22);
    }
    updateSmoke(dt);

    statRPM.textContent = Math.round(S.rpm);

    if (renderer) renderer.render(scene, camera);
  }

  // ---------------- pipeline ----------------
  function updatePanels(){
    const computed = computeAll();
    renderSpec(computed);
    renderDiagrams();
    renderTips(computed);
    updateHUDStats(computed);
    return computed;
  }
  function fullUpdate(){
    updatePanels();
    buildEngine();
  }

  function populateCylOptions(layout){
    const opts = CYL_OPTIONS[layout];
    cylSelect.innerHTML = opts.map(c => `<option value="${c}">${c}</option>`).join('');
    const chosen = opts.includes(S.cylinders) ? S.cylinders : opts[Math.floor(opts.length/2)];
    cylSelect.value = chosen;
    S.cylinders = chosen;
  }

  function updateBankAngleNote(){
    if (S.layout === 'inline'){
      bankAngleNote.textContent = 'Single bank — there\u2019s no V angle to balance.';
    } else if (S.layout === 'flat'){
      bankAngleNote.textContent = 'Fixed at 180° — horizontally opposed cylinders give inherently excellent primary balance.';
    } else {
      const ideal = idealBankAngle(S.layout, S.cylinders);
      bankAngleNote.textContent = `Ideal for a ${S.cylinders}-cylinder ${S.layout.toUpperCase()} is close to ${ideal}° for smooth, even firing.`;
    }
  }

  function syncBankAngleAvailability(){
    if (S.layout === 'inline'){
      bankAngle.disabled = true; S.bankAngle = 0; bankAngle.value = 15; bankAngleVal.textContent = '0°';
    } else if (S.layout === 'flat'){
      bankAngle.disabled = true; S.bankAngle = 180; bankAngleVal.textContent = '180° (fixed)';
    } else {
      bankAngle.disabled = false;
      const ideal = idealBankAngle(S.layout, S.cylinders);
      S.bankAngle = ideal; bankAngle.value = ideal; bankAngleVal.textContent = ideal+'°';
    }
    updateBankAngleNote();
  }

  function onLayoutChange(){
    S.layout = layoutSelect.value;
    populateCylOptions(S.layout);
    syncBankAngleAvailability();
    fullUpdate();
  }

  function syncControlsFromS(){
    layoutSelect.value = S.layout;
    populateCylOptions(S.layout);
    cylSelect.value = S.cylinders;
    syncBankAngleAvailability();
    if (S.layout === 'v' || S.layout === 'w'){ bankAngle.value = S.bankAngle; bankAngleVal.textContent = S.bankAngle+'°'; updateBankAngleNote(); }
    bore.value = S.bore; boreVal.textContent = S.bore+' mm';
    stroke.value = S.stroke; strokeVal.textContent = S.stroke+' mm';
    compRatio.value = S.compRatio; compRatioVal.textContent = S.compRatio.toFixed(1)+':1';
    induction.value = S.induction;
    boost.disabled = (S.induction === 'na');
    boost.value = S.boost; boostVal.textContent = S.boost+' psi';
    redline.value = S.redline; redlineVal.textContent = S.redline+' rpm';
    material.value = S.material;
    fuel.value = S.fuel;
  }

  function applyPreset(name){
    Object.assign(S, PRESETS[name]);
    S.rpm = 800;
    syncControlsFromS();
    fullUpdate();
  }

  // ---------------- wire up events ----------------
  layoutSelect.addEventListener('change', onLayoutChange);
  cylSelect.addEventListener('change', () => {
    S.cylinders = +cylSelect.value;
    syncBankAngleAvailability();
    fullUpdate();
  });
  bankAngle.addEventListener('input', () => {
    S.bankAngle = +bankAngle.value;
    bankAngleVal.textContent = S.bankAngle+'°';
    updateBankAngleNote();
    fullUpdate();
  });
  bore.addEventListener('input', () => { S.bore = +bore.value; boreVal.textContent = S.bore+' mm'; fullUpdate(); });
  stroke.addEventListener('input', () => { S.stroke = +stroke.value; strokeVal.textContent = S.stroke+' mm'; fullUpdate(); });
  compRatio.addEventListener('input', () => { S.compRatio = +compRatio.value; compRatioVal.textContent = S.compRatio.toFixed(1)+':1'; fullUpdate(); });
  induction.addEventListener('change', () => {
    S.induction = induction.value;
    boost.disabled = (S.induction === 'na');
    if (S.induction === 'na'){ S.boost = 0; boost.value = 0; boostVal.textContent = '0 psi'; }
    fullUpdate();
  });
  boost.addEventListener('input', () => { S.boost = +boost.value; boostVal.textContent = S.boost+' psi'; fullUpdate(); });
  redline.addEventListener('input', () => {
    S.redline = +redline.value; redlineVal.textContent = S.redline+' rpm';
    rpmSlider.max = S.redline;
    if (S.rpm > S.redline){ S.rpm = S.redline; rpmSlider.value = S.rpm; rpmSliderVal.textContent = S.rpm+' rpm'; }
    fullUpdate();
  });
  material.addEventListener('change', () => { S.material = material.value; fullUpdate(); });
  fuel.addEventListener('change', () => { S.fuel = fuel.value; fullUpdate(); });

  rpmSlider.addEventListener('input', () => {
    S.rpm = +rpmSlider.value;
    rpmSliderVal.textContent = S.rpm+' rpm';
    autoRev = false;
    autoRevBtn.textContent = '▶'; autoRevBtn.classList.remove('on');
  });
  autoRevBtn.addEventListener('click', () => {
    autoRev = !autoRev;
    autoRevBtn.textContent = autoRev ? '⏸' : '▶';
    autoRevBtn.classList.toggle('on', autoRev);
  });

  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
  });

  // ---------------- init ----------------
  rpmSlider.max = S.redline;
  syncControlsFromS();
  updatePanels();
  initThree();
})();
