// Main Application: Scene, Lighting, Camera Modes, Raycasting Switches, Minimap, Input & HUD
(function () {
  const canvasContainer = document.getElementById("canvas-wrap");
  const minimapCanvas = document.getElementById("minimap");
  const minimapCtx = minimapCanvas.getContext("2d");

  // HUD elements
  const speedValueEl = document.getElementById("speed-value");
  const edgeNameEl = document.getElementById("edge-name");
  const throttleSlider = document.getElementById("throttle-slider");
  const throttlePctEl = document.getElementById("throttle-pct");
  const reverseBtn = document.getElementById("btn-reverse");
  const brakeBtn = document.getElementById("btn-brake");
  const estopBtn = document.getElementById("btn-estop");
  const whistleBtn = document.getElementById("btn-whistle");
  const cameraBtn = document.getElementById("btn-camera");
  const muteBtn = document.getElementById("btn-mute");
  const viewCrossingBtn = document.getElementById("btn-view-crossing");
  const spawnRogueBtn = document.getElementById("btn-spawn-rogue");
  const simCrashBtn = document.getElementById("btn-sim-crash");
  const rerailBtn = document.getElementById("btn-rerail");
  const heliRerailBtn = document.getElementById("btn-heli-rerail");
  const helpBtn = document.getElementById("btn-help");
  const helpModalEl = document.getElementById("help-modal");
  const helpCloseBtn = document.getElementById("help-close");
  const helpOkBtn = document.getElementById("help-ok");
  const flipAheadBtn = document.getElementById("btn-flip-ahead");
  const switchBarEl = document.getElementById("switch-bar");
  const toastEl = document.getElementById("toast");

  // Scene & Renderer
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9bd0ec);
  scene.fog = new THREE.FogExp2(0x9bd0ec, 0.00038);

  const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.5, 2800);
  camera.position.set(0, 290, 410);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  canvasContainer.appendChild(renderer.domElement);

  // Procedural bright daytime IBL environment map applied ONLY to 3D train materials
  // so metallic PBR trains stay crisp & vibrant without washing out the terrain or sky.
  (function setupTrainEnvironment() {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0xc5e5fb);
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(50, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
      new THREE.MeshBasicMaterial({ color: 0xe6f5ff, side: THREE.BackSide })
    );
    envScene.add(sky);
    const ground = new THREE.Mesh(
      new THREE.SphereGeometry(50, 16, 12, 0, Math.PI * 2, Math.PI * 0.48, Math.PI * 0.52),
      new THREE.MeshBasicMaterial({ color: 0x7cb862, side: THREE.BackSide })
    );
    envScene.add(ground);
    const sunDisc = new THREE.Mesh(
      new THREE.SphereGeometry(4, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xfff8dc })
    );
    sunDisc.position.set(22, 30, 18);
    envScene.add(sunDisc);
    window.__trainEnvTexture = pmrem.fromScene(envScene, 0.04).texture;
    pmrem.dispose();
  })();

  // Controls
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = false;
  controls.panSpeed = 2.8;
  controls.zoomSpeed = 1.35;
  controls.keyPanSpeed = 16.0;
  controls.maxPolarAngle = Math.PI * 0.46;
  controls.minDistance = 4;
  controls.maxDistance = 1020;
  controls.target.set(0, 0, 12);

  // Lighting (restored rich green meadow & blue sky balance)
  const hemiLight = new THREE.HemisphereLight(0xdff4ff, 0x51783c, 0.72);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xfff5dc, 1.15);
  sunLight.position.set(250, 370, 210);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 20;
  sunLight.shadow.camera.far = 1350;
  const d = 540;
  sunLight.shadow.camera.left = -d;
  sunLight.shadow.camera.right = d;
  sunLight.shadow.camera.top = d;
  sunLight.shadow.camera.bottom = -d;
  sunLight.shadow.bias = -0.0005;
  scene.add(sunLight);

  // Build World
  const audio = new TrainAudio();
  const track = new TrackNetwork();
  track.build3D(scene);

  const traffic = new HighwayTrafficSystem(track);
  const scenery = new SodorScenery(track, traffic);
  scenery.build(scene);
  traffic.build(scene);

  const rescueHeli = new RescueHelicopter(scene);
  const train = new SteamTrain(track, scene);
  train.onBeforeRecover = () => {
    if (rescueHeli.phase !== "depart") rescueHeli.cancel();
  };
  train.onDerailChange = (isDerailed) => {
    if (rerailBtn) rerailBtn.classList.toggle("hidden", !isDerailed);
    if (heliRerailBtn) heliRerailBtn.classList.toggle("hidden", !isDerailed);
    if (isDerailed) {
      throttleSlider.value = 0;
      throttlePctEl.textContent = "0%";
      speedValueEl.textContent = "0";
    }
  };

  // Camera modes: 'orbit' (沙盘俯瞰), 'follow' (跟随小火车), 'cab' (车头视角)
  let cameraMode = "orbit";
  const cameraModes = [
    { id: "orbit", label: "视角：沙盘上帝" },
    { id: "follow", label: "视角：跟随小火车" },
    { id: "cab", label: "视角：车头驾驶" },
  ];
  let prevTrainPos = train.getWorldPosition();

  // Toast helper
  let toastTimer = null;
  function showToast(msg, durationMs = 2000) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), durationMs);
  }

  // Build HUD Switch Buttons
  const switchBtns = {};
  function renderSwitchButtons() {
    switchBarEl.innerHTML = "";
    track.switches.forEach((sw, idx) => {
      const btn = document.createElement("button");
      btn.className = "switch-btn";
      btn.title = `快捷键 ${idx + 1} 或直接点击 3D 道岔`;
      btn.addEventListener("click", () => handleToggleSwitch(sw.id));
      switchBarEl.appendChild(btn);
      switchBtns[sw.id] = btn;
    });
    refreshSwitchHUD();
  }

  function refreshSwitchHUD() {
    track.switches.forEach((sw) => {
      const state = track.getSwitchState(sw);
      const isMain = state === 0;
      const btn = switchBtns[sw.id];
      if (!btn) return;
      if (btn.dataset.state === String(state)) return;
      btn.dataset.state = String(state);
      btn.classList.toggle("branch", !isMain);
      btn.innerHTML = `
        <span class="sw-dot ${isMain ? "main" : "branch"}"></span>
        <span class="sw-id">${sw.id}</span>
        <span class="sw-route">${sw.labels[state]}</span>
      `;
    });
  }

  function handleToggleSwitch(switchId) {
    const sw = track.switches.find((s) => s.id === switchId);
    if (!sw) return;
    const state = track.toggleSwitch(switchId);
    audio.playSwitchClack();
    refreshSwitchHUD();
    showToast(`${sw.id} 已切换至：${sw.labels[state]}`);
  }

  renderSwitchButtons();

  // 3D Raycasting for clicking switches directly on the diorama
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let pointerDownPos = { x: 0, y: 0 };

  renderer.domElement.addEventListener("pointerdown", (e) => {
    pointerDownPos = { x: e.clientX, y: e.clientY };
  });

  renderer.domElement.addEventListener("pointermove", (e) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const faceTargets = train.thomasFaceHitTargets || [];
    const hits = raycaster.intersectObjects([...faceTargets, ...track.switchMeshes], false);
    renderer.domElement.style.cursor = hits.length > 0 ? "pointer" : "grab";
  });

  renderer.domElement.addEventListener("pointerup", (e) => {
    if (e.button !== 0) return;
    const moved = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
    if (moved > 6) return; // Was dragging orbit camera

    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const faceTargets = train.thomasFaceHitTargets || [];
    const hits = raycaster.intersectObjects([...faceTargets, ...track.switchMeshes], false);
    if (hits.length > 0) {
      const hitObj = hits[0].object;
      if (hitObj.userData && hitObj.userData.isThomasFace) {
        const expr = train.cycleThomasFace();
        audio.playThomasExpressionVoice(expr);
        showToast(`${expr.emoji} 托马斯 [${expr.label}]：“${expr.line}”`, 3600);
        return;
      }
      const switchId = hitObj.userData.switchId;
      if (switchId) {
        handleToggleSwitch(switchId);
      }
    }
  });

  // Minimap click to toggle switch
  function worldToMap(x, z) {
    const w = minimapCanvas.width;
    const h = minimapCanvas.height;
    const pad = 14;
    const S = track.mapScale || 5.0;
    const halfW = 104 * S;
    const halfH = 74 * S;
    const mx = ((x + halfW) / (halfW * 2)) * (w - pad * 2) + pad;
    const my = ((z + halfH) / (halfH * 2)) * (h - pad * 2) + pad;
    return { x: mx, y: my };
  }

  minimapCanvas.addEventListener("click", (e) => {
    const rect = minimapCanvas.getBoundingClientRect();
    const scaleX = minimapCanvas.width / rect.width;
    const scaleY = minimapCanvas.height / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top) * scaleY;

    for (const sw of track.switches) {
      const node = track.nodes[sw.nodeId];
      const p = worldToMap(node.pos.x, node.pos.z);
      if (Math.hypot(cx - p.x, cy - p.y) < 14) {
        handleToggleSwitch(sw.id);
        return;
      }
    }
  });

  function drawMinimap() {
    const w = minimapCanvas.width;
    const h = minimapCanvas.height;
    const ctx = minimapCtx;

    ctx.clearRect(0, 0, w, h);

    // Coastal cove hint
    const S = track.mapScale || 3.0;
    const cove = worldToMap(58 * S, -4 * S);
    ctx.fillStyle = "rgba(43, 142, 196, 0.25)";
    ctx.beginPath();
    ctx.ellipse(cove.x, cove.y, 26, 36, 0, 0, Math.PI * 2);
    ctx.fill();

    // Draw Western Highway & Roundabouts
    if (traffic) {
      const pEast = traffic.toWorld(traffic.tEast, 0, 0);
      const pWest = traffic.toWorld(traffic.tWest, 0, 0);
      const mE = worldToMap(pEast.x, pEast.z);
      const mW = worldToMap(pWest.x, pWest.z);
      ctx.beginPath();
      ctx.moveTo(mE.x, mE.y);
      ctx.lineTo(mW.x, mW.y);
      ctx.strokeStyle = "rgba(148, 163, 184, 0.65)";
      ctx.lineWidth = 3.2;
      ctx.lineCap = "round";
      ctx.stroke();

      // Draw level crossing signal indicators
      for (const c of traffic.crossings) {
        const mc = worldToMap(c.pos.x, c.pos.z);
        ctx.fillStyle = c.gateActive ? "#ef4444" : "#94a3b8";
        ctx.beginPath();
        ctx.arc(mc.x, mc.y, c.gateActive ? 3.8 : 2.6, 0, Math.PI * 2);
        ctx.fill();
      }

      // Highlight any rogue gate-runner on the minimap
      for (const v of traffic.vehicles) {
        if (!v.isRogue && v.state !== "crashing") continue;
        const mv = worldToMap(v.mesh.position.x, v.mesh.position.z);
        ctx.fillStyle = v.state === "crashing" ? "#f97316" : "#ff2d55";
        ctx.beginPath();
        ctx.arc(mv.x, mv.y, 3.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw all track edges (neutral base)
    for (const edge of track.edgeList) {
      ctx.beginPath();
      edge.points.forEach((pt, i) => {
        const m = worldToMap(pt.x, pt.z);
        if (i === 0) ctx.moveTo(m.x, m.y);
        else ctx.lineTo(m.x, m.y);
      });
      ctx.strokeStyle = edge.group === "siding" ? "rgba(215, 175, 110, 0.4)" : "rgba(215, 224, 235, 0.5)";
      ctx.lineWidth = 2.4;
      ctx.stroke();
    }

    // Highlight the leading segment of each switch's active branch in matching green/amber
    for (const sw of track.switches) {
      const node = track.nodes[sw.nodeId];
      const stateIdx = track.getSwitchState(sw);
      const list = sw.side === "out" ? node.outEdges : node.inEdges;
      const edge = track.edges[list[stateIdx]];
      if (!edge || !edge.points.length) continue;

      const pts = edge.points;
      const fromEnd = edge.to === sw.nodeId;
      const maxSteps = Math.max(4, Math.floor(pts.length * 0.42));
      const maxPxLen = 24;

      ctx.beginPath();
      let prev = null;
      let accPx = 0;
      for (let step = 0; step <= maxSteps; step++) {
        const idx = fromEnd ? pts.length - 1 - step : step;
        if (idx < 0 || idx >= pts.length) break;
        const m = worldToMap(pts[idx].x, pts[idx].z);
        if (step === 0) {
          ctx.moveTo(m.x, m.y);
        } else {
          accPx += Math.hypot(m.x - prev.x, m.y - prev.y);
          ctx.lineTo(m.x, m.y);
          if (accPx >= maxPxLen) break;
        }
        prev = m;
      }
      ctx.strokeStyle = stateIdx === 0 ? "#22c55e" : "#f59e0b";
      ctx.lineWidth = 3.4;
      ctx.lineCap = "round";
      ctx.stroke();
    }

    // Draw switch nodes
    for (const sw of track.switches) {
      const node = track.nodes[sw.nodeId];
      const m = worldToMap(node.pos.x, node.pos.z);
      const isMain = track.getSwitchState(sw) === 0;
      ctx.fillStyle = isMain ? "#22c55e" : "#f59e0b";
      ctx.beginPath();
      ctx.arc(m.x, m.y, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = "#f8fafc";
      ctx.font = "bold 9px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(sw.id, m.x, m.y - 8);
    }

    // Draw coaches & loco
    for (const cm of train.coachMeshes) {
      const mp = worldToMap(cm.position.x, cm.position.z);
      ctx.fillStyle = "#e68a38";
      ctx.beginPath();
      ctx.arc(mp.x, mp.y, 3.6, 0, Math.PI * 2);
      ctx.fill();
    }
    const lp = train.getWorldPosition();
    const lmp = worldToMap(lp.x, lp.z);
    ctx.fillStyle = "#38bdf8";
    ctx.beginPath();
    ctx.arc(lmp.x, lmp.y, 5.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }

  // Input bindings (Keyboard + HUD)
  const keys = {};
  window.addEventListener("keydown", (e) => {
    const tag = e.target && e.target.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    const modalEl = document.getElementById("custom-builder-modal");
    if (modalEl && !modalEl.classList.contains("hidden")) {
      if (e.key === "Escape") modalEl.classList.add("hidden");
      return;
    }
    if (helpModalEl && !helpModalEl.classList.contains("hidden")) {
      if (e.key === "Escape") helpModalEl.classList.add("hidden");
      return;
    }
    const k = e.key.toLowerCase();
    if (["arrowup", "arrowdown", " "].includes(k)) {
      e.preventDefault();
    }
    if (keys[k]) return;
    keys[k] = true;

    if (k === "h") {
      train.whistleActive = true;
      audio.startWhistle();
      traffic.tryWhistleWarn(train, showToast);
    } else if (k === " ") {
      train.braking = true;
      train.throttle = 0;
      throttleSlider.value = 0;
      audio.playBrakeHiss();
    } else if (k === "x") {
      triggerEmergencyStop();
    } else if (k === "f") {
      const st = train.getCurrentStateForSwitchLookup();
      const sw = track.findNearestSwitchAhead(st.edgeId, st.s, st.dir);
      if (sw) handleToggleSwitch(sw.id);
    } else if (/^[1-8]$/.test(k)) {
      const targetId = k === "7" || k === "8" ? "S8" : `S${k}`;
      if (track.switches.some((s) => s.id === targetId)) handleToggleSwitch(targetId);
    } else if (k === "v") {
      cycleCameraMode();
    } else if (k === "m") {
      toggleMute();
    } else if (k === "r") {
      toggleReverse();
    } else if (k === "g") {
      triggerRogueCar();
    } else if (k === "c") {
      triggerCrashSim();
    } else if (k === "z") {
      rerailTrain();
    } else if (k === "u") {
      heliRerailTrain();
    }
  });

  window.addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    keys[k] = false;
    if (k === "h") {
      train.whistleActive = false;
      audio.stopWhistle();
    } else if (k === " ") {
      train.braking = false;
    }
  });

  throttleSlider.addEventListener("input", () => {
    audio.ensureContext();
    if (train.derailed) {
      throttleSlider.value = 0;
      showToast("火车已脱轨，请先点击「🚂 一键复轨 (Z)」！");
      return;
    }
    train.throttle = parseFloat(throttleSlider.value) / 100;
    train.braking = false;
  });

  function toggleReverse() {
    audio.ensureContext();
    if (Math.abs(train.speed) > 1.2) {
      showToast("请先减速停稳后再切换倒车档");
      return;
    }
    train.reverseGear = !train.reverseGear;
    reverseBtn.classList.toggle("active", train.reverseGear);
    reverseBtn.textContent = train.reverseGear ? "档位：倒车 R" : "档位：前进 D";
    showToast(train.reverseGear ? "已挂入倒车档 (R)" : "已挂入前进档 (D)");
  }

  reverseBtn.addEventListener("click", toggleReverse);

  brakeBtn.addEventListener("pointerdown", () => {
    train.braking = true;
    train.throttle = 0;
    throttleSlider.value = 0;
    audio.playBrakeHiss();
  });
  window.addEventListener("pointerup", () => {
    if (!keys[" "]) train.braking = false;
  });

  function triggerEmergencyStop() {
    audio.ensureContext();
    train.emergencyStop();
    throttleSlider.value = 0;
    throttlePctEl.textContent = "0%";
    speedValueEl.textContent = "0";
    audio.playBrakeHiss();
    showToast("紧急制动已触发，列车瞬间停稳！");
  }

  if (estopBtn) {
    estopBtn.addEventListener("click", triggerEmergencyStop);
  }

  whistleBtn.addEventListener("pointerdown", () => {
    train.whistleActive = true;
    audio.startWhistle();
    traffic.tryWhistleWarn(train, showToast);
  });
  window.addEventListener("pointerup", () => {
    if (!keys["h"] && train.whistleActive) {
      train.whistleActive = false;
      audio.stopWhistle();
    }
  });

  flipAheadBtn.addEventListener("click", () => {
    const st = train.getCurrentStateForSwitchLookup();
    const sw = track.findNearestSwitchAhead(st.edgeId, st.s, st.dir);
    if (sw) handleToggleSwitch(sw.id);
  });

  function cycleCameraMode() {
    const idx = (cameraModes.findIndex((m) => m.id === cameraMode) + 1) % cameraModes.length;
    cameraMode = cameraModes[idx].id;
    cameraBtn.textContent = cameraModes[idx].label;
    if (cameraMode === "orbit") {
      camera.up.set(0, 1, 0);
      controls.enabled = true;
      controls.target.set(0, 0, 12);
      camera.position.set(0, 290, 410);
    } else if (cameraMode === "follow") {
      camera.up.set(0, 1, 0);
      controls.enabled = true;
      const p = train.getWorldPosition();
      controls.target.copy(p);
      camera.position.set(p.x - 24, p.y + 20, p.z + 28);
    } else if (cameraMode === "cab") {
      controls.enabled = false;
    }
    showToast(cameraModes[idx].label);
  }
  cameraBtn.addEventListener("click", cycleCameraMode);

  function toggleMute() {
    const next = !audio.muted;
    audio.setMuted(next);
    muteBtn.textContent = next ? "音效：关" : "音效：开";
    muteBtn.classList.toggle("muted", next);
  }
  muteBtn.addEventListener("click", toggleMute);

  function focusCrossingView() {
    const e6c = traffic.crossings.find((c) => c.id === "E6") || traffic.crossings[0];
    if (!e6c) return;
    camera.up.set(0, 1, 0);
    cameraMode = "orbit";
    cameraBtn.textContent = cameraModes[0].label;
    controls.enabled = true;
    controls.target.set(e6c.pos.x, 1.2, e6c.pos.z);
    camera.position.set(e6c.pos.x + 36, 22, e6c.pos.z + 38);
    controls.update();
    showToast(`镜头已定位至 ${e6c.label}`);
  }
  if (viewCrossingBtn) {
    viewCrossingBtn.addEventListener("click", focusCrossingView);
  }

  function triggerRogueCar() {
    audio.ensureContext();
    const ok = traffic.triggerRogueVehicle(train, audio, showToast, false);
    if (!ok) {
      showToast("当前道路暂无可放行的车辆，请稍后再试");
    }
  }
  if (spawnRogueBtn) {
    spawnRogueBtn.addEventListener("click", triggerRogueCar);
  }

  function triggerCrashSim() {
    audio.ensureContext();
    const res = traffic.triggerCrashSimulation(train, audio, showToast);
    if (!res) {
      showToast("暂无法启动模拟，请稍后再试");
      return;
    }
    throttleSlider.value = 100;
    throttlePctEl.textContent = "100%";
    reverseBtn.classList.remove("active");
    reverseBtn.textContent = "档位：前进 D";

    // Respect the currently selected camera mode ("orbit" / "follow" / "cab")!
    const c = res.crossing;
    if (cameraMode === "orbit") {
      camera.up.set(0, 1, 0);
      controls.enabled = true;
      controls.target.set(c.pos.x, 1.5, c.pos.z - 4);
      camera.position.set(c.pos.x + 36, 22, c.pos.z + 34);
      controls.update();
    } else if (cameraMode === "follow") {
      camera.up.set(0, 1, 0);
      controls.enabled = true;
      const p = train.getWorldPosition();
      const fwd = new THREE.Vector3(0, 0, 1);
      if (train.locoMesh) fwd.applyQuaternion(train.locoMesh.quaternion).setY(0).normalize();
      const side = new THREE.Vector3(-fwd.z, 0, fwd.x).normalize();
      controls.target.copy(p);
      camera.position.copy(p).addScaledVector(fwd, -22).addScaledVector(side, 15).add(new THREE.Vector3(0, 14, 0));
      controls.update();
    } else if (cameraMode === "cab") {
      controls.enabled = false;
    }
    prevTrainPos.copy(train.getWorldPosition());
  }
  if (simCrashBtn) {
    simCrashBtn.addEventListener("click", triggerCrashSim);
  }

  function rerailTrain() {
    audio.ensureContext();
    if (!train.derailed) {
      showToast("小火车正稳稳地跑在轨道上呢！");
      return;
    }
    rescueHeli.cancel();
    train.recoverFromDerailment(false, audio);
    traffic.repairAllBarriers();
    throttleSlider.value = 0;
    throttlePctEl.textContent = "0%";
    speedValueEl.textContent = "0";
    showToast("🚂 一键复轨成功！小火车已重新摆正上轨，可以再出发啦！", 3200);
  }
  if (rerailBtn) {
    rerailBtn.addEventListener("click", rerailTrain);
  }

  function heliRerailTrain() {
    audio.ensureContext();
    if (!train.derailed) {
      showToast("小火车正稳稳地跑在轨道上，暂时不需要救援直升机！");
      return;
    }
    if (rescueHeli.active && rescueHeli.phase !== "depart") {
      showToast("🚁 救援直升机正在吊装复轨中，请耐心观看~");
      return;
    }
    // Frame scenic aerial rescue view if currently in cab mode
    if (cameraMode === "cab") {
      const p = train.getWorldPosition();
      camera.up.set(0, 1, 0);
      cameraMode = "orbit";
      cameraBtn.textContent = cameraModes[0].label;
      controls.enabled = true;
      controls.target.set(p.x, 3, p.z);
      camera.position.set(p.x + 38, 28, p.z + 36);
      controls.update();
    }
    rescueHeli.startAutoRescue(train, audio, showToast, () => {
      traffic.repairAllBarriers();
    });
  }
  if (heliRerailBtn) {
    heliRerailBtn.addEventListener("click", heliRerailTrain);
  }

  if (helpBtn && helpModalEl) {
    helpBtn.addEventListener("click", () => helpModalEl.classList.remove("hidden"));
    if (helpCloseBtn) helpCloseBtn.addEventListener("click", () => helpModalEl.classList.add("hidden"));
    if (helpOkBtn) helpOkBtn.addEventListener("click", () => helpModalEl.classList.add("hidden"));
    helpModalEl.addEventListener("click", (e) => {
      if (e.target === helpModalEl) helpModalEl.classList.add("hidden");
    });
  }

  // Resize
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Animation Loop
  let lastTime = performance.now();
  let hudTick = 0;

  function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    // Keyboard smooth throttle adjustment
    if (keys["w"] || keys["arrowup"]) {
      audio.ensureContext();
      if (!train.derailed) {
        train.braking = false;
        train.throttle = Math.min(1, train.throttle + dt * 0.75);
        throttleSlider.value = Math.round(train.throttle * 100);
      }
    }
    if (keys["s"] || keys["arrowdown"]) {
      audio.ensureContext();
      if (!train.derailed) {
        if (train.throttle > 0.02) {
          train.throttle = Math.max(0, train.throttle - dt * 1.1);
          throttleSlider.value = Math.round(train.throttle * 100);
        } else {
          train.braking = true;
        }
      }
    } else if (!keys[" "] && !brakeBtn.matches(":active")) {
      train.braking = false;
    }

    const { hitBuffer } = train.update(dt, audio);
    if (hitBuffer) {
      showToast("已抵达尽头车挡！可按 R 挂倒车档驶出");
    }
    track.update(dt);
    scenery.update(dt);
    traffic.update(dt, train, audio, showToast);
    rescueHeli.update(dt);

    // Camera updates (adaptive pan speed so right-click dragging feels brisk at all zoom levels on 5x map)
    if (cameraMode !== "cab") {
      const camDist = camera.position.distanceTo(controls.target);
      controls.panSpeed = Math.max(2.6, Math.min(4.8, 2.4 + 90 / Math.max(20, camDist)));
    }
    const curTrainPos = train.getWorldPosition();
    if (cameraMode === "follow") {
      const delta = curTrainPos.clone().sub(prevTrainPos);
      camera.position.add(delta);
      controls.target.add(delta);
      controls.update();
    } else if (cameraMode === "cab") {
      const cab = train.getCabView();
      if (cab.up) camera.up.copy(cab.up);
      camera.position.copy(cab.eye);
      camera.lookAt(cab.look);
    } else {
      controls.update();
    }
    if (cameraMode !== "cab") {
      const S = track.mapScale || 5.0;
      const boundX = 112 * S;
      const boundZ = 80 * S;
      const clampedX = Math.max(-boundX, Math.min(boundX, controls.target.x));
      const clampedY = Math.max(0, Math.min(18, controls.target.y));
      const clampedZ = Math.max(-boundZ, Math.min(boundZ, controls.target.z));
      if (clampedX !== controls.target.x || clampedY !== controls.target.y || clampedZ !== controls.target.z) {
        camera.position.x += clampedX - controls.target.x;
        camera.position.y += clampedY - controls.target.y;
        camera.position.z += clampedZ - controls.target.z;
        controls.target.set(clampedX, clampedY, clampedZ);
      }
    }
    prevTrainPos.copy(curTrainPos);

    // Update HUD at ~15Hz
    hudTick += dt;
    if (hudTick >= 0.065) {
      hudTick = 0;
      const kmh = Math.round(Math.abs(train.speed) * 4.2);
      speedValueEl.textContent = kmh;
      throttlePctEl.textContent = `${Math.round(train.throttle * 100)}%`;
      edgeNameEl.textContent = train.getCurrentEdgeName();
      refreshSwitchHUD();
      drawMinimap();
    }

    renderer.render(scene, camera);
  }

  // --- Train Presets & Custom Train Builder UI ---
  (function initFleetAndBuilder() {
    const lib = window.TrainModelLibrary;
    if (!lib) return;

    const presetSelect = document.getElementById("preset-select");
    const openBuilderBtn = document.getElementById("btn-open-builder");
    const loadingBadge = document.getElementById("model-loading-badge");

    const modal = document.getElementById("custom-builder-modal");
    const closeBtn = document.getElementById("builder-close");
    const cancelBtn = document.getElementById("builder-cancel");
    const applyBtn = document.getElementById("builder-apply");
    const locoSelect = document.getElementById("builder-loco-select");
    const countNoteEl = document.getElementById("builder-count-note");
    const countPresetsEl = document.getElementById("builder-count-presets");
    const countInput = document.getElementById("builder-count-input");
    const tailOptionRow = document.getElementById("builder-tail-option-row");
    const emuTailChk = document.getElementById("builder-emu-tail-chk");
    const unifiedCarSelect = document.getElementById("builder-unified-car");
    const fillAllBtn = document.getElementById("builder-fill-all");
    const carSlotsEl = document.getElementById("builder-car-slots");
    const liveryContainerEl = document.getElementById("builder-livery-container");
    const df4dLiverySection = document.getElementById("builder-df4d-livery-section");
    const hxd3dLiverySection = document.getElementById("builder-hxd3d-livery-section");
    const hxd3dLiveryBadge = document.getElementById("hxd3d-livery-badge");
    const hxd3dLiveryButtons = Array.from(document.querySelectorAll("[data-hxd3d-color]"));
    const mark3LiverySection = document.getElementById("builder-mark3-livery-section");
    const syncDf4dToMark3Btn = document.getElementById("btn-sync-df4d-to-mark3");
    const syncMark3FromDf4dBtn = document.getElementById("btn-sync-mark3-from-df4d");

    function setLoading(msg) {
      if (!loadingBadge) return;
      if (msg) {
        loadingBadge.textContent = msg;
        loadingBadge.classList.remove("hidden");
      } else {
        loadingBadge.classList.add("hidden");
      }
    }

    async function applyComposition(config, labelMsg) {
      try {
        const ok = await train.setTrainComposition(config, setLoading);
        if (ok) {
          prevTrainPos = train.getWorldPosition();
          if (labelMsg) showToast(labelMsg);
        }
      } catch (err) {
        console.error(err);
        setLoading("");
        showToast("模型加载失败，请检查控制台");
      }
    }

    // Populate Preset Selector
    lib.PRESETS.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      presetSelect.appendChild(opt);
    });
    const customOpt = document.createElement("option");
    customOpt.value = "__custom__";
    customOpt.textContent = "★ 当前自定义编组";
    customOpt.disabled = true;
    presetSelect.appendChild(customOpt);

    presetSelect.addEventListener("change", () => {
      const p = lib.getPreset(presetSelect.value);
      applyComposition(
        {
          locoId: p.locoId,
          cars: p.cars,
          df4dLivery: p.df4dLivery,
          mark3Livery: p.mark3Livery,
          hxd3dLivery: p.hxd3dLivery,
        },
        `已切换编组：${p.name}`
      );
    });

    // Populate Builder Loco & Unified Car selects
    lib.LOCO_CATALOG.forEach((loco) => {
      const opt = document.createElement("option");
      opt.value = loco.id;
      opt.textContent = loco.name;
      locoSelect.appendChild(opt);
    });
    lib.CAR_CATALOG.forEach((car) => {
      const opt = document.createElement("option");
      opt.value = car.id;
      opt.textContent = `[${car.category}] ${car.name}`;
      unifiedCarSelect.appendChild(opt);
    });

    const LIVERY_STORAGE_KEY = "sodor_custom_liveries_v1";
    function loadSavedLiveries() {
      try {
        const raw = localStorage.getItem(LIVERY_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          return {
            df4d: lib.cloneLivery(parsed.df4d, lib.DEFAULT_DF4D_LIVERY),
            mark3: lib.cloneLivery(parsed.mark3, lib.DEFAULT_MARK3_LIVERY),
            hxd3d: parsed.hxd3d === "blue" ? "blue" : "red",
          };
        }
      } catch (_) {}
      return {
        df4d: lib.cloneLivery(lib.DEFAULT_DF4D_LIVERY),
        mark3: lib.cloneLivery(lib.DEFAULT_MARK3_LIVERY),
        hxd3d: "red",
      };
    }

    function saveLiveries(df4dColors, mark3Colors, hxd3dColor) {
      try {
        localStorage.setItem(
          LIVERY_STORAGE_KEY,
          JSON.stringify({ df4d: df4dColors, mark3: mark3Colors, hxd3d: hxd3dColor || "red" })
        );
      } catch (_) {}
    }

    const initialSaved = loadSavedLiveries();
    let draftLocoId = "thomas";
    let draftCars = ["thomas_coach", "thomas_coach"]; // cars behind head (total = 1 + draftCars.length)
    let draftDf4dLivery = initialSaved.df4d;
    let draftMark3Livery = initialSaved.mark3;
    let draftHxd3dLivery = initialSaved.hxd3d;

    function createLiveryPanelController({
      badgeEl,
      presetsEl,
      previewEl,
      pickersEl,
      getColors,
      setColors,
    }) {
      const previewBands = {};
      lib.LIVERY_ZONES.forEach((zone) => {
        const band = document.createElement("div");
        band.className = `livery-preview-band livery-preview-${zone.key}`;
        band.title = `${zone.label}（${zone.hint}）`;
        previewEl.appendChild(band);
        previewBands[zone.key] = band;
      });

      const presetButtons = new Map();
      lib.LIVERY_PRESETS.forEach((preset) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "livery-preset-btn";
        const swatch = document.createElement("span");
        swatch.className = "livery-preset-swatch";
        ["roof", "upper", "lower"].forEach((k) => {
          const s = document.createElement("span");
          s.style.backgroundColor = preset.colors[k];
          swatch.appendChild(s);
        });
        const label = document.createElement("span");
        label.textContent = preset.name;
        btn.appendChild(swatch);
        btn.appendChild(label);
        btn.addEventListener("click", () => {
          setColors(lib.cloneLivery(preset.colors));
          syncUI();
        });
        presetsEl.appendChild(btn);
        presetButtons.set(preset.id, btn);
      });

      const pickerInputs = {};
      const pickerHexEls = {};
      lib.LIVERY_ZONES.forEach((zone) => {
        const item = document.createElement("label");
        item.className = "livery-picker-item";
        item.title = `${zone.label}：${zone.hint}`;

        const input = document.createElement("input");
        input.type = "color";
        input.addEventListener("input", () => {
          const next = lib.cloneLivery(getColors());
          next[zone.key] = input.value.toLowerCase();
          setColors(next);
          syncUI();
        });

        const meta = document.createElement("span");
        meta.className = "livery-picker-meta";
        const lbl = document.createElement("span");
        lbl.className = "livery-picker-label";
        lbl.textContent = zone.label;
        const hex = document.createElement("span");
        hex.className = "livery-picker-hex";
        meta.appendChild(lbl);
        meta.appendChild(hex);

        item.appendChild(input);
        item.appendChild(meta);
        pickersEl.appendChild(item);
        pickerInputs[zone.key] = input;
        pickerHexEls[zone.key] = hex;
      });

      function syncUI() {
        const colors = getColors();
        lib.LIVERY_ZONES.forEach((zone) => {
          const val = colors[zone.key];
          if (previewBands[zone.key]) previewBands[zone.key].style.backgroundColor = val;
          if (pickerInputs[zone.key]) pickerInputs[zone.key].value = val;
          if (pickerHexEls[zone.key]) pickerHexEls[zone.key].textContent = val.toUpperCase();
        });
        const matchedId = lib.findMatchingLiveryPresetId(colors);
        presetButtons.forEach((btn, id) => {
          btn.classList.toggle("active", id === matchedId);
        });
        const matchedPreset = lib.LIVERY_PRESETS.find((p) => p.id === matchedId);
        badgeEl.textContent = matchedPreset ? matchedPreset.name : "自定义配色";
      }

      return { syncUI };
    }

    const df4dLiveryPanel = createLiveryPanelController({
      badgeEl: document.getElementById("df4d-livery-badge"),
      presetsEl: document.getElementById("df4d-livery-presets"),
      previewEl: document.getElementById("df4d-livery-preview"),
      pickersEl: document.getElementById("df4d-livery-pickers"),
      getColors: () => draftDf4dLivery,
      setColors: (c) => {
        draftDf4dLivery = c;
      },
    });

    const mark3LiveryPanel = createLiveryPanelController({
      badgeEl: document.getElementById("mark3-livery-badge"),
      presetsEl: document.getElementById("mark3-livery-presets"),
      previewEl: document.getElementById("mark3-livery-preview"),
      pickersEl: document.getElementById("mark3-livery-pickers"),
      getColors: () => draftMark3Livery,
      setColors: (c) => {
        draftMark3Livery = c;
      },
    });

    syncDf4dToMark3Btn.addEventListener("click", () => {
      draftMark3Livery = lib.cloneLivery(draftDf4dLivery);
      mark3LiveryPanel.syncUI();
      showToast("已将 DF4D 机车配色同步到客车");
    });

    syncMark3FromDf4dBtn.addEventListener("click", () => {
      draftMark3Livery = lib.cloneLivery(draftDf4dLivery);
      mark3LiveryPanel.syncUI();
      showToast("已将 DF4D 机车配色同步到客车");
    });

    function syncHxd3dLiveryUI() {
      const isBlue = draftHxd3dLivery === "blue";
      if (hxd3dLiveryBadge) hxd3dLiveryBadge.textContent = isBlue ? "天蓝涂装" : "经典中国红";
      hxd3dLiveryButtons.forEach((btn) => {
        btn.classList.toggle("active", btn.getAttribute("data-hxd3d-color") === draftHxd3dLivery);
      });
    }

    hxd3dLiveryButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        draftHxd3dLivery = btn.getAttribute("data-hxd3d-color") === "blue" ? "blue" : "red";
        syncHxd3dLiveryUI();
      });
    });

    function updateLiveryPanelsVisibility() {
      const showDf4d = draftLocoId === "df4d";
      const showHxd3d = draftLocoId === "hxd3d";
      const showMark3 = draftCars.some((cid) => cid === "mark3_std" || cid === "mark3_buffet");
      const showBoth = showDf4d && showMark3;
      liveryContainerEl.classList.toggle("hidden", !showDf4d && !showHxd3d && !showMark3);
      df4dLiverySection.classList.toggle("hidden", !showDf4d);
      hxd3dLiverySection.classList.toggle("hidden", !showHxd3d);
      mark3LiverySection.classList.toggle("hidden", !showMark3);
      syncDf4dToMark3Btn.classList.toggle("hidden", !showBoth);
      syncMark3FromDf4dBtn.classList.toggle("hidden", !showBoth);
      if (showDf4d) df4dLiveryPanel.syncUI();
      if (showHxd3d) syncHxd3dLiveryUI();
      if (showMark3) mark3LiveryPanel.syncUI();
    }

    function syncUnifiedCarOptions(preferredId) {
      const compatible = lib.getCompatibleCars(draftLocoId);
      const prev = preferredId || unifiedCarSelect.value;
      unifiedCarSelect.innerHTML = "";
      compatible.forEach((car) => {
        const opt = document.createElement("option");
        opt.value = car.id;
        opt.textContent = `[${car.category}] ${car.name}`;
        unifiedCarSelect.appendChild(opt);
      });
      const validIds = new Set(compatible.map((c) => c.id));
      const locoMeta = lib.getLocoMeta(draftLocoId);
      if (validIds.has(prev)) {
        unifiedCarSelect.value = prev;
      } else if (locoMeta.defaultCarId && validIds.has(locoMeta.defaultCarId)) {
        unifiedCarSelect.value = locoMeta.defaultCarId;
      } else if (compatible.length > 0) {
        unifiedCarSelect.value = compatible[0].id;
      }
      return compatible;
    }

    function renderBuilderUI() {
      const locoMeta = lib.getLocoMeta(draftLocoId);
      const isEmu = !!locoMeta.headIsPassengerUnit;
      const compatibleCars = syncUnifiedCarOptions();
      draftCars = lib.sanitizeCarsForLoco(draftLocoId, draftCars);
      const totalCount = 1 + draftCars.length;

      locoSelect.value = draftLocoId;
      countInput.value = totalCount;
      countInput.min = isEmu ? 2 : 1;

      tailOptionRow.classList.toggle("hidden", !isEmu);
      countNoteEl.textContent = isEmu
        ? `（动车组头车自带客厢计入总节数：第1节头车 + ${draftCars.length}节拖/尾车 = 共${totalCount}节）`
        : `（第1节${locoMeta.shortName}车头 + ${draftCars.length}节车厢 = 共${totalCount}节）`;

      // Render quick total count pills
      const quickCounts = isEmu ? [4, 8, 12, 16] : [1, 4, 8, 12, 16];
      countPresetsEl.innerHTML = "";
      quickCounts.forEach((n) => {
        const pill = document.createElement("button");
        pill.type = "button";
        pill.className = "count-pill" + (totalCount === n ? " active" : "");
        pill.textContent = isEmu && n === 16 ? "16节(重联)" : `${n}节`;
        pill.addEventListener("click", () => setTotalCarCount(n));
        countPresetsEl.appendChild(pill);
      });

      // Render per-car slots (Car #1 head + Car #2..N trailing cars)
      carSlotsEl.innerHTML = "";

      const headRow = document.createElement("div");
      headRow.className = "car-slot-row is-head";
      const headTag = document.createElement("span");
      headTag.className = "car-slot-tag";
      headTag.textContent = isEmu ? "第 1 节 (动车头)" : "第 1 节 (机车头)";
      const headName = document.createElement("div");
      headName.className = "car-slot-head-name";
      headName.textContent = locoMeta.name;
      headRow.appendChild(headTag);
      headRow.appendChild(headName);
      carSlotsEl.appendChild(headRow);

      draftCars.forEach((cid, idx) => {
        const row = document.createElement("div");
        row.className = "car-slot-row";
        const tag = document.createElement("span");
        tag.className = "car-slot-tag";
        if (cid.endsWith("_head")) {
          tag.textContent = `第 ${idx + 2} 节 (重联车头)`;
        } else if (cid.endsWith("_tail") || (isEmu && emuTailChk.checked && idx === draftCars.length - 1)) {
          tag.textContent = `第 ${idx + 2} 节 (尾车)`;
        } else {
          tag.textContent = `第 ${idx + 2} 节 (车厢)`;
        }

        const sel = document.createElement("select");
        compatibleCars.forEach((c) => {
          const o = document.createElement("option");
          o.value = c.id;
          o.textContent = `[${c.category}] ${c.name}`;
          sel.appendChild(o);
        });
        sel.value = cid;
        sel.addEventListener("change", () => {
          draftCars[idx] = sel.value;
          updateLiveryPanelsVisibility();
        });

        row.appendChild(tag);
        row.appendChild(sel);
        carSlotsEl.appendChild(row);
      });

      updateLiveryPanelsVisibility();
    }

    function setTotalCarCount(n) {
      const locoMeta = lib.getLocoMeta(draftLocoId);
      const isEmu = !!locoMeta.headIsPassengerUnit;
      const minTotal = isEmu ? 2 : 1;
      const clamped = Math.max(minTotal, Math.min(16, Math.round(n || minTotal)));
      const trailingCount = clamped - 1;
      const fillCar = unifiedCarSelect.value || locoMeta.defaultCarId || "mark3_std";

      if (isEmu) {
        const midCar = locoMeta.defaultCarId;
        const tailCar = emuTailChk.checked && locoMeta.tailCarId ? locoMeta.tailCarId : midCar;
        if (clamped === 16 && locoMeta.tailCarId) {
          // 16-car double-coupled 8+8 trainset:
          // Unit 1: Car 1 head + Cars 2..7 mid + Car 8 tail | Unit 2: Car 9 head + Cars 10..15 mid + Car 16 tail
          draftCars = [
            midCar, midCar, midCar, midCar, midCar, midCar,
            locoMeta.tailCarId,
            draftLocoId,
            midCar, midCar, midCar, midCar, midCar, midCar,
            tailCar,
          ];
        } else {
          const nextCars = [];
          for (let i = 0; i < trailingCount; i++) {
            nextCars.push(i === trailingCount - 1 ? tailCar : midCar);
          }
          draftCars = nextCars;
        }
      } else {
        while (draftCars.length < trailingCount) {
          draftCars.push(fillCar);
        }
        if (draftCars.length > trailingCount) {
          draftCars = draftCars.slice(0, trailingCount);
        }
      }
      renderBuilderUI();
    }

    locoSelect.addEventListener("change", () => {
      draftLocoId = locoSelect.value;
      const locoMeta = lib.getLocoMeta(draftLocoId);
      const defaultCar = locoMeta.defaultCarId || "mark3_std";
      syncUnifiedCarOptions(defaultCar);

      const curTotal = Math.max(locoMeta.headIsPassengerUnit ? 8 : 1, 1 + draftCars.length);
      if (locoMeta.headIsPassengerUnit) {
        setTotalCarCount(curTotal);
        return;
      } else {
        draftCars = draftCars.map(() => defaultCar);
        if (draftCars.length === 0) draftCars = [defaultCar, defaultCar];
      }
      renderBuilderUI();
    });

    emuTailChk.addEventListener("change", () => {
      const locoMeta = lib.getLocoMeta(draftLocoId);
      if (locoMeta.headIsPassengerUnit && draftCars.length > 0) {
        draftCars[draftCars.length - 1] =
          emuTailChk.checked && locoMeta.tailCarId ? locoMeta.tailCarId : locoMeta.defaultCarId;
        renderBuilderUI();
      }
    });

    countInput.addEventListener("change", () => {
      setTotalCarCount(parseInt(countInput.value, 10));
    });

    fillAllBtn.addEventListener("click", () => {
      const cid = unifiedCarSelect.value;
      draftCars = draftCars.map(() => cid);
      renderBuilderUI();
    });

    function openModal() {
      const cur = train.currentComposition || { locoId: "thomas", cars: ["thomas_coach", "thomas_coach"] };
      draftLocoId = cur.locoId;
      draftCars = cur.cars.slice();
      const saved = loadSavedLiveries();
      draftDf4dLivery = cur.df4dLivery
        ? lib.cloneLivery(cur.df4dLivery, lib.DEFAULT_DF4D_LIVERY)
        : saved.df4d;
      draftMark3Livery = cur.mark3Livery
        ? lib.cloneLivery(cur.mark3Livery, lib.DEFAULT_MARK3_LIVERY)
        : saved.mark3;
      draftHxd3dLivery = cur.hxd3dLivery === "blue" ? "blue" : (cur.hxd3dLivery === "red" ? "red" : saved.hxd3d);
      const locoMeta = lib.getLocoMeta(draftLocoId);
      syncUnifiedCarOptions(locoMeta.defaultCarId || "mark3_std");
      renderBuilderUI();
      modal.classList.remove("hidden");
    }

    function closeModal() {
      modal.classList.add("hidden");
    }

    openBuilderBtn.addEventListener("click", openModal);
    closeBtn.addEventListener("click", closeModal);
    cancelBtn.addEventListener("click", closeModal);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });

    applyBtn.addEventListener("click", async () => {
      const locoMeta = lib.getLocoMeta(draftLocoId);
      const total = 1 + draftCars.length;
      const df4dLivery = lib.cloneLivery(draftDf4dLivery, lib.DEFAULT_DF4D_LIVERY);
      const mark3Livery = lib.cloneLivery(draftMark3Livery, lib.DEFAULT_MARK3_LIVERY);
      const hxd3dLivery = draftHxd3dLivery === "blue" ? "blue" : "red";
      saveLiveries(df4dLivery, mark3Livery, hxd3dLivery);
      presetSelect.value = "__custom__";
      closeModal();
      await applyComposition(
        {
          locoId: draftLocoId,
          cars: draftCars,
          df4dLivery,
          mark3Livery,
          hxd3dLivery,
        },
        `已生成编组：${locoMeta.shortName}（共 ${total} 节含车头）`
      );
    });
  })();

  drawMinimap();
  requestAnimationFrame(animate);
})();
