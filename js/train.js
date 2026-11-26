// Thomas iconic facial expressions (index 0 = default classic cheerful smile)
const THOMAS_EXPRESSIONS = [
  {
    id: "happy",
    label: "经典笑脸",
    emoji: "😊",
    line: "嘟嘟！我是托马斯，今天也要做一辆有用的小火车！",
    voicePitch: 1.28,
    voiceRate: 1.04,
  },
  {
    id: "cheeky",
    label: "调皮得意",
    emoji: "😏",
    line: "嘿嘿，看我跑得多稳，连海风都追不上我呢！",
    voicePitch: 1.32,
    voiceRate: 1.08,
  },
  {
    id: "excited",
    label: "兴奋开心",
    emoji: "🤩",
    line: "太棒啦！全速前进，准点到达每一座车站！",
    voicePitch: 1.38,
    voiceRate: 1.12,
  },
  {
    id: "surprised",
    label: "惊讶哇塞",
    emoji: "😲",
    line: "哇呀！前面是不是要扳道岔转弯啦？",
    voicePitch: 1.42,
    voiceRate: 1.08,
  },
  {
    id: "angry",
    label: "认真鼓腮",
    emoji: "😠",
    line: "哼！不准再戳我鼻子啦，我要专心拉客车厢咯！",
    voicePitch: 1.05,
    voiceRate: 1.02,
  },
];

// Articulated 3D Toy Steam Locomotive + Passenger Coaches + Smoke Particles
class SteamTrain {
  constructor(trackNetwork, scene) {
    this.track = trackNetwork;
    this.scene = scene;

    // Driving physics state
    this.speed = 0; // world units/sec (+ forward, - reverse)
    this.throttle = 0; // -1..+1 (user target power)
    this.braking = false;
    this.reverseGear = false;
    this.maxSpeed = 16.5; // ~60 km/h toy scale
    this.maxReverseSpeed = 9.0;
    this.wheelAngle = 0;
    this.whistleActive = false;

    // Exact track cursor & edge trail for articulated coaches
    // Start parked at Knapford Station (E0, len=90) facing East
    this.trail = [{ edgeId: "E0", dir: 1 }];
    this.headIdx = 0;
    this.headS = 62.0; // front loco center

    this.coachOffsets = [4.35, 8.35]; // distances behind loco center
    this.locoLength = 4.4;
    this.headHalfLen = 2.2;
    this.locoBogieSpan = 1.4;
    this.coachMetas = [
      { halfLen: 1.7, bogieSpan: 1.0, role: "thomas_coach", couplerY: 0.78 },
      { halfLen: 1.7, bogieSpan: 1.0, role: "thomas_coach", couplerY: 0.78 },
    ];
    this.couplerMeshes = [];
    this.requiredTrailLength = 30;
    this.currentComposition = {
      locoId: "thomas",
      cars: ["thomas_coach", "thomas_coach"],
    };
    this.locoHasSmoke = true;
    this.smokeLocalOffset = new THREE.Vector3(0, 2.74, 1.48);
    this.whistleLocalOffset = new THREE.Vector3(0.22, 2.37, -0.35);
    this.cabLocalOffset = new THREE.Vector3(0, 2.55, 1.85);
    this.locoMixer = null;
    this.buildGeneration = 0;

    // Thomas interactive expression state (starts on classic happy smile)
    this.thomasExpressionIndex = 0;
    this.thomasFaceHitTargets = [];
    this.thomasFaceGroup = null;
    this.thomasFaceCanvas = null;
    this.thomasFaceCtx = null;
    this.thomasFaceTex = null;
    this.thomasFaceBounce = 0;

    this.locoMesh = null;
    this.coachMeshes = [];
    this.locoWheels = [];
    this.extraLocoWheels = [];
    this.coachWheels = [];
    this.rodMeshes = [];
    this.crossheadMeshes = [];
    this.mainRodMeshes = [];
    this.crhDoorUniforms = [];
    this.smokePool = [];
    this.smokeTimer = 0;

    // Derailment, tip-over & coach decoupling state
    this.derailed = false;
    this.derailAge = 0;
    this.derailUnits = [];
    this.derailSpeedThreshold = 11.0; // ~46 km/h: fast train + heavy truck => derailment
    this.onDerailChange = null;
    this.onBeforeRecover = null;
    this._poseHelper = new THREE.Object3D();

    this.buildTrainMeshes();
    this.buildSmokePool();
    this.syncTransforms();
  }

  clearRollingStock() {
    if (this.onBeforeRecover) this.onBeforeRecover();
    this.derailed = false;
    this.derailAge = 0;
    this.derailUnits = [];
    if (this.onDerailChange) this.onDerailChange(false);
    if (this.locoMesh) {
      this.scene.remove(this.locoMesh);
      this.locoMesh = null;
    }
    if (this.thomasFaceTex) {
      this.thomasFaceTex.dispose();
      this.thomasFaceTex = null;
    }
    this.thomasFaceHitTargets = [];
    this.thomasFaceGroup = null;
    this.thomasFaceCanvas = null;
    this.thomasFaceCtx = null;
    this.thomasFaceBounce = 0;
    for (const cm of this.coachMeshes) {
      this.scene.remove(cm);
    }
    for (const cpl of this.couplerMeshes) {
      this.scene.remove(cpl.mesh);
    }
    this.coachMeshes = [];
    this.coachOffsets = [];
    this.coachMetas = [];
    this.couplerMeshes = [];
    this.locoWheels = [];
    this.extraLocoWheels = [];
    this.coachWheels = [];
    this.rodMeshes = [];
    this.crossheadMeshes = [];
    this.mainRodMeshes = [];
    this.crhDoorUniforms = [];
    if (this.locoMixer) {
      this.locoMixer.stopAllAction();
      this.locoMixer = null;
    }
  }

  createThomasCoachMesh() {
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.55, metalness: 0.35 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0xcdd5df, roughness: 0.22, metalness: 0.88 });
    const darkSteelMat = new THREE.MeshStandardMaterial({ color: 0x525a66, roughness: 0.35, metalness: 0.75 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xf0c14b, roughness: 0.25, metalness: 0.8 });
    const creamMat = new THREE.MeshStandardMaterial({ color: 0xf6eedb, roughness: 0.65 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x9bd4eb, roughness: 0.15, metalness: 0.2 });
    const coachMat = new THREE.MeshStandardMaterial({ color: 0xd97724, roughness: 0.5 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x3a4149, roughness: 0.65 });

    const halfGauge = 0.575;
    const railTopY = 0.285;
    const coachWheelR = 0.24;
    const coachWheelY = railTopY + coachWheelR;
    const coachLift = 0.22;

    const coach = new THREE.Group();
    const cChassis = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.22, 3.3), blackMat);
    cChassis.position.set(0, 0.52 + coachLift, 0);
    cChassis.castShadow = true;
    coach.add(cChassis);

    const bodyLower = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.78, 3.2), coachMat);
    bodyLower.position.set(0, 1.0 + coachLift, 0);
    bodyLower.castShadow = true;
    coach.add(bodyLower);

    const bodyUpper = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.55, 3.18), creamMat);
    bodyUpper.position.set(0, 1.65 + coachLift, 0);
    bodyUpper.castShadow = true;
    coach.add(bodyUpper);

    for (const wz of [-1.0, -0.35, 0.35, 1.0]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.34, 0.42), glassMat);
      win.position.set(0, 1.65 + coachLift, wz);
      coach.add(win);
    }

    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.2, 3.34), roofMat);
    roof.position.set(0, 2.02 + coachLift, 0);
    roof.castShadow = true;
    coach.add(roof);

    for (const wz of [-1.0, 1.0]) {
      const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, halfGauge * 2, 10), darkSteelMat);
      axle.rotation.z = Math.PI / 2;
      axle.position.set(0, coachWheelY, wz);
      coach.add(axle);

      for (const sideSign of [-1, 1]) {
        const wPivot = this.createRailwayWheel({
          radius: coachWheelR,
          flangeExtra: 0.055,
          treadWidth: 0.09,
          spokeCount: 8,
          rimMat: steelMat,
          centerMat: darkSteelMat,
          hubMat: brassMat,
          crankRadius: 0,
          sideSign,
        });
        wPivot.position.set(sideSign * halfGauge, coachWheelY, wz);
        coach.add(wPivot);
        this.coachWheels.push(wPivot);

        const axleBox = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.16), blackMat);
        axleBox.position.set(sideSign * (halfGauge + 0.085), coachWheelY, wz);
        coach.add(axleBox);

        const spring = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.42), blackMat);
        spring.position.set(sideSign * (halfGauge + 0.085), coachWheelY + 0.11, wz);
        coach.add(spring);
      }
    }

    const coupler = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.7), blackMat);
    coupler.position.set(0, 0.56 + coachLift, 1.9);
    coach.add(coupler);

    return coach;
  }

  async setTrainComposition(config, onStatus) {
    const lib = window.TrainModelLibrary;
    if (!lib) throw new Error("TrainModelLibrary 未初始化");

    const locoId = config.locoId || "thomas";
    const rawCars = Array.isArray(config.cars) ? config.cars.slice() : [];
    const cars = lib.sanitizeCarsForLoco ? lib.sanitizeCarsForLoco(locoId, rawCars) : rawCars;
    const df4dLivery = lib.cloneLivery
      ? lib.cloneLivery(config.df4dLivery, lib.DEFAULT_DF4D_LIVERY)
      : null;
    const mark3Livery = lib.cloneLivery
      ? lib.cloneLivery(config.mark3Livery, lib.DEFAULT_MARK3_LIVERY)
      : null;
    const hxd3dLivery = config.hxd3dLivery === "blue" ? "blue" : "red";
    const gen = ++this.buildGeneration;

    const locoMeta = lib.getLocoMeta(locoId);
    const neededModelIds = new Set();
    if (!locoMeta.isProcedural) neededModelIds.add(locoId);
    for (const cid of cars) {
      const cm = lib.getCarMeta(cid);
      if (!cm.isProcedural) neededModelIds.add(cid);
    }

    if (neededModelIds.size > 0 && onStatus) {
      onStatus("正在加载 3D 列车模型...");
    }

    const loadedMap = new Map();
    await Promise.all(
      Array.from(neededModelIds).map(async (id) => {
        const entry = await lib.ensureModelLoaded(id);
        loadedMap.set(id, entry);
      })
    );

    if (gen !== this.buildGeneration) return false; // Superseded by newer click

    // Rebuild rolling stock cleanly
    this.clearRollingStock();

    let locoLen = locoMeta.length || 4.4;
    let locoBogie = locoMeta.bogieSpan || 1.4;
    let locoHalfSpanZ = locoLen * 0.5;
    let locoRole = "loco";
    if (locoMeta.isProcedural) {
      this.buildThomasLocoOnly();
      locoLen = 4.4;
      locoBogie = 1.4;
    } else {
      const entry = loadedMap.get(locoId);
      if (entry && entry.size) {
        locoHalfSpanZ = entry.size.z * 0.5;
      }
      const initialDoorClosed = Math.abs(this.speed) < 0.08 && Math.abs(this.throttle) < 0.02 ? 0.0 : 1.0;
      const inst = lib.instantiateFromLoaded(entry, {
        liveryColors: locoId === "df4d" ? df4dLivery : undefined,
        hxd3dLivery: locoId === "hxd3d" ? hxd3dLivery : undefined,
        initialDoorClosed,
      });
      if (inst.doorUniform) {
        this.crhDoorUniforms.push(inst.doorUniform);
      }
      this.locoMesh = inst.mesh;
      this.locoMixer = inst.mixer;
      this.extraLocoWheels = inst.extraWheels || [];
      this.scene.add(this.locoMesh);
      locoLen = inst.couplerLen;
      locoBogie = inst.bogieSpan || locoLen * 0.34;
      locoRole = inst.couplerRole || (locoMeta.kind === "emu" ? "emu_head" : "loco");
    }

    this.locoLength = locoLen;
    this.locoBogieSpan = locoBogie;
    this.locoRole = locoRole;
    this.locoCouplerId = locoId;
    this.headHalfLen = Math.max(1.9, locoLen * 0.52);
    this.maxSpeed = locoMeta.maxSpeed || 18.0;
    this.maxReverseSpeed = locoMeta.maxReverseSpeed || 10.0;
    this.locoHasSmoke = !!locoMeta.hasSmoke;

    const spec = lib.MODEL_SPECS[locoId];
    if (spec && spec.smokeLocal) {
      this.smokeLocalOffset.set(spec.smokeLocal[0], spec.smokeLocal[1], spec.smokeLocal[2]);
    } else {
      this.smokeLocalOffset.set(0, 2.74, 1.48);
    }
    if (spec && spec.cabLocal) {
      this.cabLocalOffset.set(spec.cabLocal[0], spec.cabLocal[1], spec.cabLocal[2]);
    } else if (locoMeta.cabLocal) {
      this.cabLocalOffset.set(locoMeta.cabLocal[0], locoMeta.cabLocal[1], locoMeta.cabLocal[2]);
    } else {
      this.cabLocalOffset.set(0, 2.35, locoLen * 0.35);
    }
    if (!locoMeta.isProcedural) {
      this.cabLocalOffset.z = Math.max(this.cabLocalOffset.z, locoHalfSpanZ + 0.16);
    }

    // Build cars & compute coupler center-to-center spacing along track
    let prevHalfLen = locoLen * 0.5;
    let prevRole = locoRole;
    let prevId = locoId;
    let cursorBack = prevHalfLen;

    for (let i = 0; i < cars.length; i++) {
      const cid = cars[i];
      const cMeta = lib.getCarMeta(cid);
      let cMesh;
      let cLen;
      let cBogie;
      let cRole;

      if (cMeta.isProcedural) {
        cMesh = this.createThomasCoachMesh();
        cLen = cMeta.length || 3.4;
        cBogie = cMeta.bogieSpan || 1.0;
        cRole = "thomas_coach";
      } else {
        const entry = loadedMap.get(cid);
        const isMark3Coach = cid === "mark3_std" || cid === "mark3_buffet";
        const initialDoorClosed = Math.abs(this.speed) < 0.08 && Math.abs(this.throttle) < 0.02 ? 0.0 : 1.0;
        const inst = lib.instantiateFromLoaded(entry, {
          liveryColors: isMark3Coach ? mark3Livery : undefined,
          initialDoorClosed,
        });
        if (inst.doorUniform) {
          this.crhDoorUniforms.push(inst.doorUniform);
        }
        cMesh = inst.mesh;
        cLen = inst.couplerLen;
        cBogie = inst.bogieSpan || cLen * 0.34;
        cRole = inst.couplerRole || cMeta.couplerRole || "coach";
      }

      const isEmuPrev = prevRole === "emu_head" || prevRole === "emu_car" || prevRole === "emu";
      const isEmuCurr = cRole === "emu_car" || cRole === "emu_tail" || cRole === "emu";
      const isGangway = (isEmuPrev && isEmuCurr) || (prevRole === "coach" && cRole === "coach");
      const gap = isGangway ? 0.06 : 0.24;
      const centerDist = cursorBack + gap + cLen * 0.5;

      this.coachOffsets.push(centerDist);
      this.coachMeshes.push(cMesh);
      this.coachMetas.push({
        id: cid,
        halfLen: cLen * 0.5,
        bogieSpan: cBogie,
        role: cRole,
      });
      this.scene.add(cMesh);

      // Build dynamic coupler / accordion gangway bridging prev vehicle rear -> this car front
      const cplMesh = this.createDynamicCouplerMesh(isGangway, cid.startsWith("shinkansen") || prevId.startsWith("shinkansen"));
      this.scene.add(cplMesh);
      this.couplerMeshes.push({
        mesh: cplMesh,
        prevIndex: i - 1, // -1 means locomotive
        prevHalfLen,
        nextHalfLen: cLen * 0.5,
        yOffset: isGangway ? (cid.startsWith("shinkansen") ? 1.24 : 1.48) : 0.78,
        overlap: isGangway ? 0.42 : 0.32,
      });

      cursorBack = centerDist + cLen * 0.5;
      prevHalfLen = cLen * 0.5;
      prevRole = cRole;
      prevId = cid;
    }

    const lastBack = this.coachOffsets.length ? this.coachOffsets[this.coachOffsets.length - 1] : 0;
    this.requiredTrailLength = Math.max(30, lastBack + 36);
    this.currentComposition = { locoId, cars, df4dLivery, mark3Livery, hxd3dLivery };
    this.syncTransforms();
    if (onStatus) onStatus("");
    return true;
  }

  createDynamicCouplerMesh(isGangway, isShinkansen) {
    if (isGangway) {
      const grp = new THREE.Group();
      const bellowsMat = new THREE.MeshStandardMaterial({
        color: isShinkansen ? 0x3b424d : 0x2a2f37,
        roughness: 0.78,
        metalness: 0.15,
      });
      const w = isShinkansen ? 1.88 : 1.56;
      const h = isShinkansen ? 1.18 : 1.58;
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1.0), bellowsMat);
      box.castShadow = true;
      grp.add(box);
      return grp;
    }
    const barMat = new THREE.MeshStandardMaterial({
      color: 0x343a42,
      roughness: 0.55,
      metalness: 0.55,
    });
    const grp = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 1.0), barMat);
    bar.castShadow = true;
    grp.add(bar);
    return grp;
  }

  // Helper: build a detailed flanged & spoked railway wheel pivot centered at (x, y, z)
  // `sideSign` = -1 (right-hand side in +Z forward local) or +1 (left-hand side in +Z forward local)
  // Flange sits on the INSIDE (-sideSign toward track center x=0) hugging the rail!
  createRailwayWheel({
    radius,
    flangeExtra,
    treadWidth,
    spokeCount,
    rimMat,
    centerMat,
    hubMat,
    crankRadius = 0,
    sideSign,
  }) {
    const pivot = new THREE.Group();

    // 1. Machined steel tire / tread resting squarely on rail head (y = 0.285)
    const tire = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, treadWidth, 24),
      rimMat
    );
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    pivot.add(tire);

    // 2. Inner steel wheel flange (tapered cone-disk dipping inside the rail gauge!)
    const flangeR = radius + flangeExtra;
    const flange = new THREE.Mesh(
      new THREE.CylinderGeometry(
        sideSign > 0 ? radius : flangeR,
        sideSign > 0 ? flangeR : radius,
        0.032,
        24
      ),
      rimMat
    );
    flange.rotation.z = Math.PI / 2;
    flange.position.x = -sideSign * (treadWidth * 0.5 + 0.014);
    pivot.add(flange);

    // 3. Recessed wheel dish backing (dark shadow recess behind spokes)
    const innerDish = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.84, radius * 0.84, treadWidth * 0.45, 20),
      new THREE.MeshStandardMaterial({ color: 0x2a1412, roughness: 0.85 })
    );
    innerDish.rotation.z = Math.PI / 2;
    pivot.add(innerDish);

    // 4. Painted outer wheel rim ring & central boss hub
    const outerSideX = sideSign * (treadWidth * 0.36);
    const rimRing = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 0.82, radius * 0.085, 8, 22),
      centerMat
    );
    rimRing.rotation.y = Math.PI / 2;
    rimRing.position.x = outerSideX * 0.85;
    pivot.add(rimRing);

    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.25, radius * 0.25, treadWidth * 0.95, 14),
      centerMat
    );
    hub.rotation.z = Math.PI / 2;
    hub.position.x = sideSign * 0.01;
    pivot.add(hub);

    const axleCap = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.13, radius * 0.13, treadWidth * 1.15, 12),
      hubMat
    );
    axleCap.rotation.z = Math.PI / 2;
    axleCap.position.x = sideSign * 0.015;
    pivot.add(axleCap);

    // 5. Radial spokes
    const spokeLen = radius * 1.56;
    const spokeThick = radius * 0.095;
    for (let i = 0; i < spokeCount / 2; i++) {
      const spoke = new THREE.Mesh(
        new THREE.BoxGeometry(treadWidth * 0.32, spokeLen, spokeThick),
        centerMat
      );
      spoke.position.x = outerSideX * 0.72;
      spoke.rotation.x = (i * Math.PI) / (spokeCount / 2);
      pivot.add(spoke);
    }

    // 6. Crescent balance counterweight + crankpin (for locomotive driving wheels)
    if (crankRadius > 0) {
      const weight = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.76, radius * 0.76, treadWidth * 0.34, 14, 1, false, 0, Math.PI * 0.65),
        centerMat
      );
      weight.rotation.z = Math.PI / 2;
      weight.rotation.x = Math.PI * 0.68; // opposite crankpin
      weight.position.x = outerSideX * 0.78;
      pivot.add(weight);

      const crankPin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.036, 0.036, 0.11, 10),
        hubMat
      );
      crankPin.rotation.z = Math.PI / 2;
      crankPin.position.set(sideSign * (treadWidth * 0.5 + 0.045), 0, crankRadius);
      pivot.add(crankPin);
    }

    return pivot;
  }

  getThomasExpression() {
    return THOMAS_EXPRESSIONS[this.thomasExpressionIndex % THOMAS_EXPRESSIONS.length];
  }

  cycleThomasFace() {
    this.thomasExpressionIndex = (this.thomasExpressionIndex + 1) % THOMAS_EXPRESSIONS.length;
    this.updateThomasFaceTexture();
    this.thomasFaceBounce = 0.45;
    return this.getThomasExpression();
  }

  updateThomasFaceTexture() {
    if (!this.thomasFaceCtx || !this.thomasFaceTex) return;
    const expr = this.getThomasExpression();
    this.drawThomasFaceCanvas(this.thomasFaceCtx, expr.id);
    this.thomasFaceTex.needsUpdate = true;
  }

  drawThomasFaceCanvas(ctx, exprId) {
    const W = 512;
    const H = 512;
    const cx = W * 0.5;
    const cy = H * 0.5;

    ctx.clearRect(0, 0, W, H);

    // Classic Thomas light warm-grey sculpted face base with soft radial volume
    const bgGrad = ctx.createRadialGradient(cx, cy - 28, 36, cx, cy, W * 0.52);
    bgGrad.addColorStop(0, "#e5e9ef");
    bgGrad.addColorStop(0.7, "#cfd5de");
    bgGrad.addColorStop(1, "#aeb6c2");
    ctx.fillStyle = bgGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, W * 0.5, 0, Math.PI * 2);
    ctx.fill();

    // Outer subtle carved rim shadow
    ctx.strokeStyle = "#7a8391";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, W * 0.485, 0, Math.PI * 2);
    ctx.stroke();

    // Soft forehead sheen & temple contour lines
    ctx.strokeStyle = "rgba(110, 120, 134, 0.25)";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx, cy + 16, 200, Math.PI * 1.18, Math.PI * 1.82);
    ctx.stroke();

    // Cheeks
    const drawCheekBlush = (x, y, r, color) => {
      const cg = ctx.createRadialGradient(x, y, 4, x, y, r);
      cg.addColorStop(0, color);
      cg.addColorStop(1, "rgba(244, 120, 130, 0)");
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };

    if (exprId === "excited") {
      drawCheekBlush(126, 294, 52, "rgba(245, 115, 128, 0.48)");
      drawCheekBlush(386, 294, 52, "rgba(245, 115, 128, 0.48)");
    } else if (exprId === "angry") {
      drawCheekBlush(128, 298, 48, "rgba(225, 92, 85, 0.36)");
      drawCheekBlush(384, 298, 48, "rgba(225, 92, 85, 0.36)");
    } else if (exprId !== "surprised") {
      drawCheekBlush(128, 294, 44, "rgba(242, 128, 136, 0.28)");
      drawCheekBlush(384, 294, 44, "rgba(242, 128, 136, 0.28)");
    }

    // Cheek laugh creases / contour around nose
    ctx.strokeStyle = "#8c96a4";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(170, 290, 28, Math.PI * 0.65, Math.PI * 1.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(342, 290, 28, Math.PI * -0.2, Math.PI * 0.35);
    ctx.stroke();

    // Eyes helper
    const eyeY = 200;
    const eyeLX = 176;
    const eyeRX = 336;
    const drawOpenEye = (x, y, opts = {}) => {
      const rx = opts.rx || 43;
      const ry = opts.ry || 47;
      const pxOff = opts.pupilDx || 0;
      const pyOff = opts.pupilDy || 0;
      const irisR = opts.irisR || 26;
      const pupilR = opts.pupilR || 14;

      // Sclera white
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = "#2b313a";
      ctx.stroke();

      // Upper eyelid shadow / squint
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      ctx.clip();

      // Iris
      ctx.fillStyle = "#2d3540";
      ctx.beginPath();
      ctx.arc(x + pxOff, y + pyOff, irisR, 0, Math.PI * 2);
      ctx.fill();

      // Deep black pupil
      ctx.fillStyle = "#0b0d11";
      ctx.beginPath();
      ctx.arc(x + pxOff, y + pyOff, pupilR, 0, Math.PI * 2);
      ctx.fill();

      // Catchlight sparkles
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(x + pxOff - 8, y + pyOff - 9, opts.bigSparkle ? 8 : 6, 0, Math.PI * 2);
      ctx.fill();
      if (opts.bigSparkle) {
        ctx.beginPath();
        ctx.arc(x + pxOff + 7, y + pyOff + 6, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      if (opts.angryLid) {
        ctx.fillStyle = "#c9d0da";
        ctx.beginPath();
        ctx.moveTo(x - rx - 4, y - ry - 4);
        ctx.lineTo(x + rx + 4, y - ry - 4);
        ctx.lineTo(x + rx + 4, y - 6 + (opts.side > 0 ? -12 : 4));
        ctx.lineTo(x - rx - 4, y - 6 + (opts.side > 0 ? 4 : -12));
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#2b313a";
        ctx.lineWidth = 5;
        ctx.stroke();
      }
      ctx.restore();
    };

    // Draw Eyes + Eyebrows per expression
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (exprId === "happy") {
      drawOpenEye(eyeLX, eyeY, { irisR: 27, pupilR: 15, bigSparkle: true });
      drawOpenEye(eyeRX, eyeY, { irisR: 27, pupilR: 15, bigSparkle: true });
      // Friendly curved dark brows
      ctx.strokeStyle = "#1d2229";
      ctx.lineWidth = 13;
      ctx.beginPath();
      ctx.moveTo(132, 134);
      ctx.quadraticCurveTo(176, 114, 218, 132);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(294, 132);
      ctx.quadraticCurveTo(336, 114, 380, 134);
      ctx.stroke();
    } else if (exprId === "cheeky") {
      drawOpenEye(eyeLX, eyeY, { pupilDx: 10, pupilDy: -3, irisR: 25, pupilR: 14 });
      // Right eye winking upward arch
      ctx.strokeStyle = "#1d2229";
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(eyeRX, eyeY + 12, 34, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
      // Smug asymmetrical brows
      ctx.lineWidth = 13;
      ctx.beginPath();
      ctx.moveTo(134, 126);
      ctx.quadraticCurveTo(176, 100, 218, 122);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(296, 140);
      ctx.quadraticCurveTo(338, 132, 378, 148);
      ctx.stroke();
    } else if (exprId === "excited") {
      drawOpenEye(eyeLX, eyeY, { rx: 45, ry: 50, irisR: 30, pupilR: 17, bigSparkle: true });
      drawOpenEye(eyeRX, eyeY, { rx: 45, ry: 50, irisR: 30, pupilR: 17, bigSparkle: true });
      ctx.strokeStyle = "#1d2229";
      ctx.lineWidth = 13;
      ctx.beginPath();
      ctx.moveTo(132, 122);
      ctx.quadraticCurveTo(176, 98, 218, 118);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(294, 118);
      ctx.quadraticCurveTo(336, 98, 380, 122);
      ctx.stroke();
    } else if (exprId === "surprised") {
      drawOpenEye(eyeLX, eyeY, { rx: 47, ry: 52, irisR: 17, pupilR: 10 });
      drawOpenEye(eyeRX, eyeY, { rx: 47, ry: 52, irisR: 17, pupilR: 10 });
      ctx.strokeStyle = "#1d2229";
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.arc(eyeLX, 136, 36, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(eyeRX, 136, 36, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    } else if (exprId === "angry") {
      drawOpenEye(eyeLX, eyeY + 4, { rx: 41, ry: 40, irisR: 22, pupilR: 12, angryLid: true, side: -1 });
      drawOpenEye(eyeRX, eyeY + 4, { rx: 41, ry: 40, irisR: 22, pupilR: 12, angryLid: true, side: 1 });
      // Steep furrowed V-brows + center wrinkle
      ctx.strokeStyle = "#1a1e24";
      ctx.lineWidth = 15;
      ctx.beginPath();
      ctx.moveTo(132, 122);
      ctx.lineTo(222, 152);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(380, 122);
      ctx.lineTo(290, 152);
      ctx.stroke();
      ctx.lineWidth = 5;
      ctx.strokeStyle = "#6c7582";
      ctx.beginPath();
      ctx.moveTo(246, 154);
      ctx.lineTo(246, 174);
      ctx.moveTo(266, 154);
      ctx.lineTo(266, 174);
      ctx.stroke();
    }

    // Draw Mouth per expression (below 3D center nose at y~262)
    if (exprId === "happy") {
      // Iconic big bright cheerful Thomas open smile!
      ctx.fillStyle = "#5b1f25";
      ctx.beginPath();
      ctx.moveTo(170, 344);
      ctx.quadraticCurveTo(256, 368, 342, 344);
      ctx.quadraticCurveTo(324, 422, 256, 424);
      ctx.quadraticCurveTo(188, 422, 170, 344);
      ctx.closePath();
      ctx.fill();

      // White upper teeth arc
      ctx.save();
      ctx.clip();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(166, 340);
      ctx.quadraticCurveTo(256, 364, 346, 340);
      ctx.lineTo(346, 376);
      ctx.quadraticCurveTo(256, 388, 166, 376);
      ctx.closePath();
      ctx.fill();
      // Warm coral tongue
      ctx.fillStyle = "#e76b74";
      ctx.beginPath();
      ctx.ellipse(256, 416, 42, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.strokeStyle = "#222730";
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(170, 344);
      ctx.quadraticCurveTo(256, 368, 342, 344);
      ctx.quadraticCurveTo(324, 422, 256, 424);
      ctx.quadraticCurveTo(188, 422, 170, 344);
      ctx.stroke();
    } else if (exprId === "cheeky") {
      // Cocked mischievous grin + cheeky dimple
      ctx.strokeStyle = "#1d2229";
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(192, 368);
      ctx.quadraticCurveTo(270, 404, 344, 342);
      ctx.stroke();
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(348, 336, 12, Math.PI * 0.2, Math.PI * 0.85);
      ctx.stroke();
    } else if (exprId === "excited") {
      // Big laughing cheer mouth
      ctx.fillStyle = "#5b1f25";
      ctx.beginPath();
      ctx.moveTo(166, 340);
      ctx.quadraticCurveTo(256, 354, 346, 340);
      ctx.quadraticCurveTo(334, 434, 256, 434);
      ctx.quadraticCurveTo(178, 434, 166, 340);
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(160, 334, 192, 38);
      ctx.fillStyle = "#ea6e77";
      ctx.beginPath();
      ctx.ellipse(256, 424, 46, 26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = "#222730";
      ctx.lineWidth = 7;
      ctx.stroke();
    } else if (exprId === "surprised") {
      // Classic round "O" mouth
      ctx.fillStyle = "#3f1c21";
      ctx.beginPath();
      ctx.ellipse(256, 378, 34, 42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#1d2229";
      ctx.lineWidth = 7;
      ctx.stroke();
    } else if (exprId === "angry") {
      // Grumpy downturned pout
      ctx.strokeStyle = "#1d2229";
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(196, 396);
      ctx.quadraticCurveTo(256, 354, 316, 396);
      ctx.stroke();
      // Subtle chin pout line
      ctx.strokeStyle = "#7a8391";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(234, 416);
      ctx.quadraticCurveTo(256, 410, 278, 416);
      ctx.stroke();
    }
  }

  buildTrainMeshes() {
    this.buildThomasLocoOnly();
    for (let c = 0; c < 2; c++) {
      const coach = this.createThomasCoachMesh();
      this.coachMeshes.push(coach);
      this.scene.add(coach);
    }
  }

  buildThomasLocoOnly() {
    const blueMat = new THREE.MeshStandardMaterial({ color: 0x1976d2, roughness: 0.38, metalness: 0.15 });
    const darkBlueMat = new THREE.MeshStandardMaterial({ color: 0x0f4c8a, roughness: 0.45 });
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.55, metalness: 0.35 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0xcdd5df, roughness: 0.22, metalness: 0.88 });
    const darkSteelMat = new THREE.MeshStandardMaterial({ color: 0x525a66, roughness: 0.35, metalness: 0.75 });
    const redMat = new THREE.MeshStandardMaterial({ color: 0xd93829, roughness: 0.45 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xf0c14b, roughness: 0.25, metalness: 0.8 });
    const creamMat = new THREE.MeshStandardMaterial({ color: 0xf6eedb, roughness: 0.65 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x9bd4eb, roughness: 0.15, metalness: 0.2 });

    const halfGauge = 0.575;
    const railTopY = 0.285;

    // --- LOCOMOTIVE ---
    const loco = new THREE.Group();
    const locoWheelR = 0.32;
    const locoWheelY = railTopY + locoWheelR; // 0.605: tread sits flush on 0.285 rail top!
    const crankR = 0.155;
    const bodyLift = 0.22; // Clear height above flanged wheels

    // Narrow inner chassis frame (fits cleanly between inner wheel flanges ±0.48)
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.36, 3.85), blackMat);
    chassis.position.set(0, 0.72, 0);
    chassis.castShadow = true;
    loco.add(chassis);

    // Raised running board & red buffer beams
    const runningBoard = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.1, 3.92), redMat);
    runningBoard.position.set(0, 0.72 + bodyLift, 0);
    runningBoard.castShadow = true;
    loco.add(runningBoard);

    const frontBeam = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.28, 0.18), redMat);
    frontBeam.position.set(0, 0.81, 1.94);
    loco.add(frontBeam);

    const rearBeam = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.28, 0.18), redMat);
    rearBeam.position.set(0, 0.81, -1.94);
    loco.add(rearBeam);

    // Buffers
    for (const bx of [-0.52, 0.52]) {
      for (const bz of [2.06, -2.06]) {
        const buf = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.18, 10), blackMat);
        buf.rotation.x = Math.PI / 2;
        buf.position.set(bx, 0.81, bz);
        loco.add(buf);
      }
    }

    // Steam Cylinders + Valve Chests + Slidebars (front-sides)
    for (const sx of [-1, 1]) {
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.62, 14), blackMat);
      cyl.rotation.x = Math.PI / 2;
      cyl.position.set(sx * 0.66, locoWheelY + 0.02, 1.56);
      cyl.castShadow = true;
      loco.add(cyl);

      const capF = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 12), brassMat);
      capF.rotation.x = Math.PI / 2;
      capF.position.set(sx * 0.66, locoWheelY + 0.02, 1.88);
      loco.add(capF);

      const slidebar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.62), darkSteelMat);
      slidebar.position.set(sx * 0.67, locoWheelY + 0.08, 0.96);
      loco.add(slidebar);

      const crosshead = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.13, 0.16), steelMat);
      crosshead.position.set(sx * 0.67, locoWheelY + 0.02, 0.98);
      loco.add(crosshead);
      this.crossheadMeshes.push({ mesh: crosshead, baseZ: 0.98, y: locoWheelY + 0.02 });
    }

    // Boiler (horizontal cylinder along Z)
    const boiler = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 2.0, 16), blueMat);
    boiler.rotation.x = Math.PI / 2;
    boiler.position.set(0, 1.32 + bodyLift, 0.45);
    boiler.castShadow = true;
    loco.add(boiler);

    // Black Smokebox front section
    const smokebox = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.72, 20), blackMat);
    smokebox.rotation.x = Math.PI / 2;
    smokebox.position.set(0, 1.32 + bodyLift, 1.48);
    smokebox.castShadow = true;
    loco.add(smokebox);

    // Sculpted Thomas Face Backing Disc + Smokebox Rim
    const faceGreyMat = new THREE.MeshStandardMaterial({ color: 0xcbd2db, roughness: 0.48, metalness: 0.08 });
    const faceRimMat = new THREE.MeshStandardMaterial({ color: 0x3b424c, roughness: 0.5, metalness: 0.3 });

    const door = new THREE.Mesh(new THREE.CylinderGeometry(0.455, 0.455, 0.08, 32), faceGreyMat);
    door.rotation.x = Math.PI / 2;
    door.position.set(0, 1.32 + bodyLift, 1.855);
    door.userData.isThomasFace = true;
    loco.add(door);

    const faceRim = new THREE.Mesh(new THREE.TorusGeometry(0.455, 0.024, 10, 32), faceRimMat);
    faceRim.position.set(0, 1.32 + bodyLift, 1.89);
    faceRim.userData.isThomasFace = true;
    loco.add(faceRim);

    // Interactive Canvas2D Thomas Face Group (default: classic iconic smile)
    const faceCanvas = document.createElement("canvas");
    faceCanvas.width = 512;
    faceCanvas.height = 512;
    const faceCtx = faceCanvas.getContext("2d");
    this.thomasFaceCanvas = faceCanvas;
    this.thomasFaceCtx = faceCtx;
    const curExpr = this.getThomasExpression();
    this.drawThomasFaceCanvas(faceCtx, curExpr.id);

    const faceTex = new THREE.CanvasTexture(faceCanvas);
    faceTex.encoding = THREE.sRGBEncoding;
    this.thomasFaceTex = faceTex;

    const faceGroup = new THREE.Group();
    faceGroup.position.set(0, 1.32 + bodyLift, 1.903);
    this.thomasFaceGroup = faceGroup;
    loco.add(faceGroup);

    const facePlane = new THREE.Mesh(
      new THREE.CircleGeometry(0.44, 32),
      new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.48, metalness: 0.04 })
    );
    facePlane.userData.isThomasFace = true;
    faceGroup.add(facePlane);

    // 3D Sculpted Button Nose (matches Thomas's grey sculpted cheek/nose depth)
    const noseMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.062, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0xd5dbe3, roughness: 0.42, metalness: 0.06 })
    );
    noseMesh.scale.set(0.95, 1.08, 0.85);
    noseMesh.position.set(0, -0.015, 0.028);
    noseMesh.userData.isThomasFace = true;
    faceGroup.add(noseMesh);

    // Generous invisible front hit disc for effortless clicking from camera angles
    const faceHitDisc = new THREE.Mesh(
      new THREE.CircleGeometry(0.56, 24),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    faceHitDisc.position.set(0, 0, 0.045);
    faceHitDisc.userData.isThomasFace = true;
    faceGroup.add(faceHitDisc);

    this.thomasFaceHitTargets = [faceHitDisc, facePlane, noseMesh, door, faceRim];

    // Headlamp relocated onto lower front buffer apron so Thomas's smile & chin stay 100% clear
    const lampHousing = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.18), brassMat);
    lampHousing.position.set(0, 0.78 + bodyLift, 1.95);
    loco.add(lampHousing);

    const lampLens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.062, 0.062, 0.05, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff3b0 })
    );
    lampLens.rotation.x = Math.PI / 2;
    lampLens.position.set(0, 0.78 + bodyLift, 2.04);
    loco.add(lampLens);

    const headLight = new THREE.PointLight(0xffe699, 1.1, 14, 1.8);
    headLight.position.set(0, 1.1 + bodyLift, 2.3);
    loco.add(headLight);

    // Side Water Tanks
    for (const sx of [-0.62, 0.62]) {
      const tank = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.85, 1.7), blueMat);
      tank.position.set(sx, 1.2 + bodyLift, 0.25);
      tank.castShadow = true;
      loco.add(tank);

      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 1.72), redMat);
      stripe.position.set(sx, 1.28 + bodyLift, 0.25);
      loco.add(stripe);
    }

    // Brass Steam Dome & Funnel (Chimney)
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), brassMat);
    dome.position.set(0, 1.88 + bodyLift, 0.45);
    dome.castShadow = true;
    loco.add(dome);

    const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.72, 12), blackMat);
    funnel.position.set(0, 2.08 + bodyLift, 1.48);
    funnel.castShadow = true;
    loco.add(funnel);

    const funnelRim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.045, 8, 14), brassMat);
    funnelRim.rotation.x = Math.PI / 2;
    funnelRim.position.set(0, 2.43 + bodyLift, 1.48);
    loco.add(funnelRim);

    // Brass Whistle on cab front
    const whistle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.35, 8), brassMat);
    whistle.position.set(0.22, 1.95 + bodyLift, -0.35);
    loco.add(whistle);

    // Cab & Roof
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.56, 1.35, 1.22), blueMat);
    cab.position.set(0, 1.45 + bodyLift, -1.12);
    cab.castShadow = true;
    loco.add(cab);

    const cabWin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.45, 0.65), glassMat);
    cabWin.position.set(0, 1.72 + bodyLift, -1.12);
    loco.add(cabWin);

    const cabFrontWin = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.4, 1.26), glassMat);
    cabFrontWin.position.set(0, 1.76 + bodyLift, -1.12);
    loco.add(cabFrontWin);

    const cabRoof = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.14, 1.4), blackMat);
    cabRoof.position.set(0, 2.18 + bodyLift, -1.14);
    cabRoof.castShadow = true;
    loco.add(cabRoof);

    // 6 Detailed Spoked & Flanged Driving Wheels + Axles + Brake Shoes
    const wheelZ = [0.95, -0.1, -1.15];
    for (const wz of wheelZ) {
      const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, halfGauge * 2, 10), darkSteelMat);
      axle.rotation.z = Math.PI / 2;
      axle.position.set(0, locoWheelY, wz);
      loco.add(axle);

      for (const sideSign of [-1, 1]) {
        const wPivot = this.createRailwayWheel({
          radius: locoWheelR,
          flangeExtra: 0.06,
          treadWidth: 0.1,
          spokeCount: 10,
          rimMat: steelMat,
          centerMat: redMat,
          hubMat: brassMat,
          crankRadius: crankR,
          sideSign,
        });
        wPivot.position.set(sideSign * halfGauge, locoWheelY, wz);
        loco.add(wPivot);
        this.locoWheels.push(wPivot);

        // Brake shoe behind each wheel
        const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.18, 0.08), blackMat);
        shoe.position.set(sideSign * halfGauge, locoWheelY - 0.04, wz - locoWheelR - 0.03);
        shoe.rotation.x = 0.25;
        loco.add(shoe);
      }
    }

    // Coupling Rods (connecting all 3 driving wheel crankpins) + Main Connecting Rods
    for (const sideSign of [-1, 1]) {
      const rod = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.075, 2.26), steelMat);
      rod.position.set(sideSign * (halfGauge + 0.09), locoWheelY, -0.1);
      loco.add(rod);
      this.rodMeshes.push({ mesh: rod, baseZ: -0.1, baseY: locoWheelY, crankR });

      const mainRod = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.065, 1.12), brassMat);
      mainRod.position.set(sideSign * (halfGauge + 0.115), locoWheelY, 0.44);
      loco.add(mainRod);
      this.mainRodMeshes.push({ mesh: mainRod, baseY: locoWheelY, crankR });
    }

    this.locoMesh = loco;
    this.scene.add(loco);
  }

  buildSmokePool() {
    const geo = new THREE.SphereGeometry(0.32, 8, 8);
    for (let i = 0; i < 42; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0xfafafa,
        roughness: 0.95,
        transparent: true,
        opacity: 0,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.smokePool.push({
        mesh,
        vel: new THREE.Vector3(),
        age: 0,
        life: 1.5,
        active: false,
      });
    }
  }

  emitSmoke(worldPos, isWhistle = false) {
    const p = this.smokePool.find((item) => !item.active);
    if (!p) return;
    p.active = true;
    p.age = 0;
    p.life = isWhistle ? 1.1 : 1.7 + Math.random() * 0.5;
    p.mesh.visible = true;
    p.mesh.position.copy(worldPos);
    p.mesh.scale.setScalar(isWhistle ? 0.35 : 0.55);
    p.vel.set(
      (Math.random() - 0.5) * 0.8 + 0.35,
      (isWhistle ? 4.2 : 2.6) + Math.random() * 1.1,
      (Math.random() - 0.5) * 0.8
    );
    p.mesh.material.opacity = isWhistle ? 0.75 : 0.62;
  }

  // Advance head cursor along track graph while preserving trail history for coaches
  advanceHead(dist) {
    if (Math.abs(dist) < 1e-7) return false;
    let remaining = dist;
    let hitBuffer = false;

    while (Math.abs(remaining) > 1e-6) {
      const cur = this.trail[this.headIdx];
      const edge = this.track.edges[cur.edgeId];
      // Effective motion in edge's parametric coordinate `s`:
      // If cur.dir > 0, forward train motion (+dist) increases s.
      // If cur.dir < 0, forward train motion (+dist) decreases s.
      const deltaS = remaining * cur.dir;
      const nextS = this.headS + deltaS;

      // Dead-end buffer safety stop at Y1, P_END, Q_END
      if (this.track.nodes[edge.to]?.isDeadEnd && nextS > edge.length - this.headHalfLen) {
        this.headS = edge.length - this.headHalfLen;
        this.speed = 0;
        if (this.throttle > 0) this.throttle = 0;
        hitBuffer = true;
        break;
      }

      if (nextS > edge.length) {
        const overshoot = nextS - edge.length;
        // Crossing edge.to boundary in (+1) parametric direction
        if (cur.dir > 0) {
          // Always query live switch state at junction; discard stale future trail
          const step = this.track.stepBoundary(cur.edgeId, 1);
          if (!step) {
            this.headS = edge.length;
            this.speed = 0;
            hitBuffer = true;
            break;
          }
          this.trail.length = this.headIdx + 1;
          this.trail.push({ edgeId: step.nextEdgeId, dir: step.nextDir });
          this.headIdx++;
          const newCur = this.trail[this.headIdx];
          this.headS = newCur.dir > 0 ? 0 : this.track.edges[newCur.edgeId].length;
          remaining = overshoot;
        } else {
          // Reversing out past edge.to
          if (this.headIdx > 0) {
            this.headIdx--;
            this.trail.length = this.headIdx + 1;
          } else {
            const step = this.track.stepBoundary(cur.edgeId, 1);
            if (!step) {
              this.headS = edge.length;
              this.speed = 0;
              hitBuffer = true;
              break;
            }
            this.trail.unshift({ edgeId: step.nextEdgeId, dir: -step.nextDir });
          }
          const newCur = this.trail[this.headIdx];
          this.headS = newCur.dir > 0 ? this.track.edges[newCur.edgeId].length : 0;
          remaining = -overshoot;
        }
      } else if (nextS < 0) {
        const overshoot = -nextS;
        if (cur.dir < 0) {
          // Always query live switch state at junction; discard stale future trail
          const step = this.track.stepBoundary(cur.edgeId, -1);
          if (!step) {
            this.headS = 0;
            this.speed = 0;
            hitBuffer = true;
            break;
          }
          this.trail.length = this.headIdx + 1;
          this.trail.push({ edgeId: step.nextEdgeId, dir: step.nextDir });
          this.headIdx++;
          const newCur = this.trail[this.headIdx];
          this.headS = newCur.dir > 0 ? 0 : this.track.edges[newCur.edgeId].length;
          remaining = overshoot;
        } else {
          // Reversing out past edge.from
          if (this.headIdx > 0) {
            this.headIdx--;
            this.trail.length = this.headIdx + 1;
          } else {
            const step = this.track.stepBoundary(cur.edgeId, -1);
            if (!step) {
              this.headS = 0;
              this.speed = 0;
              hitBuffer = true;
              break;
            }
            this.trail.unshift({ edgeId: step.nextEdgeId, dir: -step.nextDir });
          }
          const newCur = this.trail[this.headIdx];
          this.headS = newCur.dir > 0 ? this.track.edges[newCur.edgeId].length : 0;
          remaining = -overshoot;
        }
      } else {
        this.headS = nextS;
        remaining = 0;
      }
    }

    // Trim unneeded old tail & future trail entries
    this.trimTrail();
    return hitBuffer;
  }

  trimTrail() {
    // Keep enough trail behind head for all coaches + margin
    let idx = this.headIdx;
    const headCur = this.trail[idx];
    let accum = headCur.dir > 0 ? this.headS : this.track.edges[headCur.edgeId].length - this.headS;
    while (idx > 0 && accum < this.requiredTrailLength) {
      idx--;
      accum += this.track.edges[this.trail[idx].edgeId].length;
    }
    if (idx > 0) {
      this.trail.splice(0, idx);
      this.headIdx -= idx;
    }
    if (this.trail.length - 1 - this.headIdx > 3) {
      this.trail.length = this.headIdx + 4;
    }
  }

  // Sample a point `backDist` units behind the locomotive (or ahead if backDist < 0)
  sampleBehindHead(backDist) {
    let idx = this.headIdx;
    let cur = this.trail[idx];
    let s = this.headS;

    if (backDist < -1e-6) {
      let rem = -backDist;
      while (rem > 1e-6) {
        const edge = this.track.edges[cur.edgeId];
        const avail = cur.dir > 0 ? edge.length - s : s;
        if (rem <= avail) {
          s = s + cur.dir * rem;
          rem = 0;
        } else {
          rem -= avail;
          if (idx < this.trail.length - 1) {
            idx++;
            cur = this.trail[idx];
            s = cur.dir > 0 ? 0 : this.track.edges[cur.edgeId].length;
          } else {
            const step = this.track.stepBoundaryPreview(cur.edgeId, cur.dir);
            if (!step) {
              s = cur.dir > 0 ? edge.length : 0;
              break;
            }
            cur = { edgeId: step.nextEdgeId, dir: step.nextDir };
            idx++; // virtual step ahead without mutating trail!
            s = cur.dir > 0 ? 0 : this.track.edges[cur.edgeId].length;
          }
        }
      }
      const sample = this.track.sampleEdge(cur.edgeId, s);
      const forward = sample.tangent.clone().multiplyScalar(cur.dir);
      return { pos: sample.pos, forward, up: sample.up };
    }

    let rem = backDist;

    while (rem > 1e-6) {
      const edge = this.track.edges[cur.edgeId];
      const avail = cur.dir > 0 ? s : edge.length - s;
      if (rem <= avail) {
        s = s - cur.dir * rem;
        rem = 0;
      } else {
        rem -= avail;
        if (idx > 0) {
          idx--;
          cur = this.trail[idx];
          s = cur.dir > 0 ? this.track.edges[cur.edgeId].length : 0;
        } else {
          // Extend backward cleanly if reversing or near init boundary
          const step = this.track.stepBoundary(cur.edgeId, -cur.dir);
          if (!step) {
            s = cur.dir > 0 ? 0 : edge.length;
            break;
          }
          const newEntry = { edgeId: step.nextEdgeId, dir: -step.nextDir };
          this.trail.unshift(newEntry);
          this.headIdx++;
          cur = newEntry;
          s = cur.dir > 0 ? this.track.edges[cur.edgeId].length : 0;
        }
      }
    }

    const sample = this.track.sampleEdge(cur.edgeId, s);
    const forward = sample.tangent.clone().multiplyScalar(cur.dir);
    return { pos: sample.pos, forward, up: sample.up };
  }

  // Two-point bogie chord alignment: keeps front & rear bogies dead-on rails around curves!
  sampleBogiePose(centerDist, bogieSpan) {
    const span = bogieSpan || 1.4;
    const front = this.sampleBehindHead(centerDist - span);
    const rear = this.sampleBehindHead(centerDist + span);
    const midPos = front.pos.clone().lerp(rear.pos, 0.5);
    const chord = front.pos.clone().sub(rear.pos);
    const forward = chord.lengthSq() > 1e-6 ? chord.normalize() : front.forward;
    const up = front.up.clone().add(rear.up).normalize();
    return { pos: midPos, forward, up };
  }

  applyPose(mesh, pose) {
    mesh.position.copy(pose.pos);
    const target = pose.pos.clone().add(pose.forward);
    mesh.up.copy(pose.up);
    mesh.lookAt(target);
  }

  syncTransforms() {
    const headPose = this.sampleBogiePose(0, this.locoBogieSpan);
    this.applyPose(this.locoMesh, headPose);
    this.locoMesh.updateMatrixWorld(true);

    for (let i = 0; i < this.coachMeshes.length; i++) {
      const meta = this.coachMetas[i] || { bogieSpan: 1.0 };
      const pose = this.sampleBogiePose(this.coachOffsets[i], meta.bogieSpan);
      this.applyPose(this.coachMeshes[i], pose);
      this.coachMeshes[i].updateMatrixWorld(true);
    }

    // Bridge every car-to-car connection dynamically with accordion gangways / couplers
    const vRear = new THREE.Vector3();
    const vFront = new THREE.Vector3();
    for (const cpl of this.couplerMeshes) {
      const prevMesh = cpl.prevIndex < 0 ? this.locoMesh : this.coachMeshes[cpl.prevIndex];
      const nextMesh = this.coachMeshes[cpl.prevIndex + 1];
      if (!prevMesh || !nextMesh) continue;

      vRear.set(0, cpl.yOffset, -cpl.prevHalfLen).applyMatrix4(prevMesh.matrixWorld);
      vFront.set(0, cpl.yOffset, cpl.nextHalfLen).applyMatrix4(nextMesh.matrixWorld);

      const mid = vRear.clone().lerp(vFront, 0.5);
      const dist = vRear.distanceTo(vFront);
      cpl.mesh.position.copy(mid);
      cpl.mesh.up.set(0, 1, 0);
      cpl.mesh.lookAt(vRear);
      cpl.mesh.scale.set(1, 1, Math.max(0.18, dist + cpl.overlap));
    }
  }

  emergencyStop() {
    this.speed = 0;
    this.throttle = 0;
    this.braking = false;
  }

  placeOnEdge(edgeId, s, dir = 1, initialSpeed = 0, initialThrottle = 0) {
    if (!this.track.edges[edgeId]) return false;
    if (this.derailed) this.recoverFromDerailment(true);
    this.trail = [{ edgeId, dir }];
    this.headIdx = 0;
    this.headS = Math.max(0, Math.min(this.track.edges[edgeId].length, s));
    this.reverseGear = false;
    this.braking = false;
    this.speed = initialSpeed;
    this.throttle = initialThrottle;
    this.syncTransforms();
    return true;
  }

  triggerDerailment(impactPos = null, impactDir = null, heavyLabel = "大型工程车", options = {}) {
    if (this.derailed || !this.locoMesh) return false;
    this.derailed = true;
    this.derailAge = 0;

    const hitUnitIndex = Math.max(0, options.hitUnitIndex || 0);
    const fullTrain = options.fullTrain !== undefined ? !!options.fullTrain : true;
    const frontCut = !fullTrain && hitUnitIndex >= 2 ? hitUnitIndex - 1 : 0;
    this.derailImpactUnit = hitUnitIndex;

    const preSpeed = Math.max(11.5, Math.abs(this.speed));
    const speedSign = this.speed < -0.1 ? -1 : 1;
    this.speed = 0;
    this.throttle = 0;
    this.braking = false;

    // 1. Break couplers at & behind the derailment zone (front unharmed cars stay coupled!)
    for (let k = 0; k < this.couplerMeshes.length; k++) {
      const cpl = this.couplerMeshes[k];
      if (!cpl || !cpl.mesh) continue;
      const rearUnit = cpl.prevIndex + 2;
      cpl.mesh.visible = rearUnit < frontCut;
    }

    // 2. Initialize derailment per unit: front section (0..frontCut-1) stays upright on rails;
    // impact car & adjacent cars tip over & decouple!
    const meshes = [this.locoMesh, ...this.coachMeshes];
    const sideBias = Math.random() < 0.5 ? 1 : -1;
    this.derailUnits = [];

    for (let i = 0; i < meshes.length; i++) {
      const m = meshes[i];
      if (!m) continue;
      m.updateMatrixWorld(true);
      const basePos = m.position.clone();
      const baseQuat = m.quaternion.clone();
      const isLoco = i === 0;

      if (i < frontCut) {
        // Front section already passed the crossing: stays upright & coupled on the rails
        this.derailUnits.push({
          mesh: m,
          isLoco,
          pos: basePos.clone(),
          baseY: basePos.y,
          baseQuat,
          vel: new THREE.Vector3(),
          roll: 0,
          yawOff: 0,
          pitch: 0,
          targetRoll: 0,
          targetYawOff: 0,
          targetPitch: 0,
          rollRate: 0,
          yawRate: 0,
          bounces: 0,
          beingHoisted: false,
          rescued: true,
        });
        continue;
      }

      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(baseQuat).setY(0).normalize();
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
      const moveFwd = fwd.clone().multiplyScalar(speedSign);

      const distFromHit = Math.abs(i - hitUnitIndex);
      const isImpactZone = fullTrain ? i <= 2 : distFromHit <= 1;
      const unitSide = i === hitUnitIndex ? sideBias : i % 2 === 1 ? -sideBias : sideBias;

      const fwdFactor = fullTrain
        ? (isLoco ? 0.78 : Math.max(0.18, 0.56 - i * 0.11 + (Math.random() - 0.5) * 0.08))
        : (isImpactZone ? 0.25 + Math.random() * 0.15 : Math.max(0.12, 0.35 - distFromHit * 0.06));
      const latKick = isImpactZone
        ? unitSide * (3.6 + Math.random() * 2.6)
        : unitSide * (1.4 + Math.random() * 1.8);
      const upKick = isImpactZone ? 2.8 + Math.random() * 1.4 : 1.2 + Math.random() * 1.0;

      const vel = new THREE.Vector3()
        .addScaledVector(moveFwd, preSpeed * fwdFactor)
        .addScaledVector(right, latKick);
      vel.y = upKick;

      // Impact zone cars tip ~75-90 deg onto their side; trailing cars tilt progressively less
      const targetRoll = isImpactZone
        ? unitSide * (1.28 + Math.random() * 0.24)
        : unitSide * (fullTrain ? 0.75 + Math.random() * 0.62 : 0.35 + Math.random() * 0.55);
      const targetYawOff = isImpactZone
        ? unitSide * (0.38 + Math.random() * 0.38)
        : unitSide * (0.15 + Math.random() * 0.35);
      const targetPitch = (Math.random() - 0.5) * 0.14;

      this.derailUnits.push({
        mesh: m,
        isLoco,
        pos: basePos.clone(),
        baseY: basePos.y,
        baseQuat,
        vel,
        roll: 0,
        yawOff: 0,
        pitch: 0,
        targetRoll,
        targetYawOff,
        targetPitch,
        rollRate: (targetRoll > 0 ? 1 : -1) * (2.6 + Math.random() * 1.4),
        yawRate: (targetYawOff > 0 ? 1 : -1) * (1.2 + Math.random() * 1.0),
        bounces: 0,
        beingHoisted: false,
        rescued: false,
      });
    }

    if (this.onDerailChange) this.onDerailChange(true, heavyLabel);
    return true;
  }

  getUnitTargetPose(unitIndex) {
    const pose =
      unitIndex === 0
        ? this.sampleBogiePose(0, this.locoBogieSpan)
        : this.sampleBogiePose(
            this.coachOffsets[unitIndex - 1] || 0,
            (this.coachMetas[unitIndex - 1] && this.coachMetas[unitIndex - 1].bogieSpan) || 1.0
          );
    this._poseHelper.position.copy(pose.pos);
    this._poseHelper.up.copy(pose.up);
    this._poseHelper.lookAt(pose.pos.clone().add(pose.forward));
    return { pos: pose.pos.clone(), quat: this._poseHelper.quaternion.clone() };
  }

  setUnitHoistPose(unitIndex, worldPos, worldQuat) {
    const du = this.derailUnits && this.derailUnits[unitIndex];
    if (!du) return;
    du.beingHoisted = true;
    du.rescued = false;
    du.vel.set(0, 0, 0);
    du.pos.copy(worldPos);
    du.mesh.position.copy(worldPos);
    du.mesh.quaternion.copy(worldQuat);
    du.mesh.updateMatrixWorld(true);
  }

  markUnitRescued(unitIndex) {
    const du = this.derailUnits && this.derailUnits[unitIndex];
    if (!du) return;
    du.beingHoisted = false;
    du.rescued = true;
    du.vel.set(0, 0, 0);
    const target = this.getUnitTargetPose(unitIndex);
    du.pos.copy(target.pos);
    du.mesh.position.copy(target.pos);
    du.mesh.quaternion.copy(target.quat);
    du.mesh.updateMatrixWorld(true);

    // Reconnect couplers whenever both adjacent cars are back on the rails
    const vRear = new THREE.Vector3();
    const vFront = new THREE.Vector3();
    for (const cpl of this.couplerMeshes) {
      const uA = cpl.prevIndex + 1; // 0 for loco, 1+ for coaches
      const uB = cpl.prevIndex + 2;
      const duA = this.derailUnits[uA];
      const duB = this.derailUnits[uB];
      if (!duA || !duB || !duA.rescued || !duB.rescued) continue;
      cpl.mesh.visible = true;
      vRear.set(0, cpl.yOffset, -cpl.prevHalfLen).applyMatrix4(duA.mesh.matrixWorld);
      vFront.set(0, cpl.yOffset, cpl.nextHalfLen).applyMatrix4(duB.mesh.matrixWorld);
      const mid = vRear.clone().lerp(vFront, 0.5);
      const dist = vRear.distanceTo(vFront);
      cpl.mesh.position.copy(mid);
      cpl.mesh.up.set(0, 1, 0);
      cpl.mesh.lookAt(vRear);
      cpl.mesh.scale.set(1, 1, Math.max(0.18, dist + cpl.overlap));
    }
  }

  recoverFromDerailment(silent = false, audio = null) {
    if (!this.derailed) return false;
    if (this.onBeforeRecover) this.onBeforeRecover();
    this.derailed = false;
    this.derailAge = 0;
    this.derailUnits = [];
    this.speed = 0;
    this.throttle = 0;
    this.braking = false;

    for (const cpl of this.couplerMeshes) {
      if (cpl && cpl.mesh) cpl.mesh.visible = true;
    }
    this.syncTransforms();

    if (!silent && audio && audio.playRerailChime) {
      audio.playRerailChime();
    }
    if (this.onDerailChange) this.onDerailChange(false);
    return true;
  }

  applyDerailImpact(unitIndex, impulseDir, strength = 4.0) {
    if (!this.derailed || !this.derailUnits || !this.derailUnits[unitIndex]) return;
    const du = this.derailUnits[unitIndex];
    if (impulseDir) {
      du.vel.x += impulseDir.x * strength;
      du.vel.z += impulseDir.z * strength;
    }
    du.vel.y = Math.max(du.vel.y, 1.4 + Math.min(2.0, strength * 0.35));
    du.targetYawOff += (Math.random() - 0.5) * 0.18;
  }

  update(dt, audio) {
    if (this.derailed) {
      this.derailAge += dt;
      const tmpEuler = new THREE.Euler(0, 0, 0, "YXZ");
      const tmpQuat = new THREE.Quaternion();

      for (const du of this.derailUnits) {
        if (du.beingHoisted || du.rescued) continue;
        du.vel.y -= 24.0 * dt;
        du.pos.addScaledVector(du.vel, dt);

        // Rotate smoothly toward tipped-over / jackknifed pose
        const rotFactor = Math.min(1, dt * 4.2);
        du.roll += (du.targetRoll - du.roll) * rotFactor;
        du.yawOff += (du.targetYawOff - du.yawOff) * rotFactor;
        du.pitch += (du.targetPitch - du.pitch) * rotFactor;

        // Keep tipped-over carbody resting naturally on the ground surface
        const floorY = du.baseY + 0.72 * Math.sin(Math.min(Math.PI * 0.5, Math.abs(du.roll)));
        if (du.pos.y <= floorY) {
          du.pos.y = floorY;
          if (Math.abs(du.vel.y) > 2.2 && du.bounces < 2) {
            du.vel.y = -du.vel.y * 0.28;
            du.vel.x *= 0.65;
            du.vel.z *= 0.65;
            du.bounces++;
          } else {
            du.vel.y = 0;
            const damp = Math.max(0, 1 - dt * 3.8);
            du.vel.x *= damp;
            du.vel.z *= damp;
          }
        }

        tmpEuler.set(du.pitch, du.yawOff, du.roll, "YXZ");
        tmpQuat.setFromEuler(tmpEuler);
        du.mesh.position.copy(du.pos);
        du.mesh.quaternion.copy(du.baseQuat).multiply(tmpQuat);
        du.mesh.updateMatrixWorld(true);
      }

      // Emit accident smoke from the struck/derailed unit
      const smokeUnit = this.derailUnits[this.derailImpactUnit || 0] || this.derailUnits[0];
      if (this.derailAge < 10.0 && smokeUnit) {
        this.smokeTimer += dt;
        if (this.smokeTimer >= 0.24) {
          this.smokeTimer = 0;
          const smokePos = smokeUnit.pos.clone().add(new THREE.Vector3(0, 1.3, 0));
          this.emitSmoke(smokePos, false);
        }
      }

      // Continue animating active smoke particles
      for (const p of this.smokePool) {
        if (!p.active) continue;
        p.age += dt;
        if (p.age >= p.life) {
          p.active = false;
          p.mesh.visible = false;
          continue;
        }
        const t = p.age / p.life;
        p.mesh.position.addScaledVector(p.vel, dt);
        p.vel.multiplyScalar(1 - 0.65 * dt);
        p.mesh.scale.setScalar(0.55 + t * 1.9);
        p.mesh.material.opacity = (1 - t) * 0.58;
      }

      if (audio) {
        audio.update(dt, 0, 0);
      }
      return { hitBuffer: false, derailed: true };
    }

    // Steam engine longitudinal acceleration + rolling drag + braking
    const targetMax = this.reverseGear ? -this.maxReverseSpeed : this.maxSpeed;
    const accel = this.throttle * (this.reverseGear ? 6.2 : 8.5);
    const rollingDrag = 1.05;

    if (this.braking) {
      const brakeDecel = 15.0;
      if (Math.abs(this.speed) <= brakeDecel * dt) {
        this.speed = 0;
      } else {
        this.speed -= Math.sign(this.speed) * brakeDecel * dt;
      }
    } else if (Math.abs(this.throttle) > 0.02) {
      const desired = this.throttle * (this.reverseGear ? -this.maxReverseSpeed : this.maxSpeed);
      if (this.reverseGear) {
        this.speed = Math.max(desired, this.speed - Math.abs(accel) * dt);
      } else {
        this.speed = Math.min(desired, this.speed + accel * dt);
      }
      // Also allow decelerating smoothly if throttle lowered below current speed
      if (!this.reverseGear && this.speed > desired) {
        this.speed = Math.max(desired, this.speed - rollingDrag * dt);
      } else if (this.reverseGear && this.speed < desired) {
        this.speed = Math.min(desired, this.speed + rollingDrag * dt);
      }
    } else {
      // Gentle coasting
      if (Math.abs(this.speed) <= rollingDrag * dt) {
        this.speed = 0;
      } else {
        this.speed -= Math.sign(this.speed) * rollingDrag * dt;
      }
    }

    // Clamp max speeds
    this.speed = Math.max(-this.maxReverseSpeed, Math.min(this.maxSpeed, this.speed));
    if (this.reverseGear && this.speed > 0 && this.throttle > 0.05) {
      this.speed = Math.max(0, this.speed - 9.0 * dt);
    }

    // Advance along track
    const hitBuffer = this.advanceHead(this.speed * dt);
    this.syncTransforms();

    // Animate spoked wheels, crossheads, main connecting rods, and coupling rods
    this.wheelAngle += (this.speed * dt) / 0.32;
    const coachAngle = this.wheelAngle * (0.32 / 0.24);
    for (const w of this.locoWheels) {
      w.rotation.x = this.wheelAngle;
    }
    for (const ew of this.extraLocoWheels) {
      if (ew && ew.mesh) {
        ew.mesh.rotation[ew.axis || "z"] += (ew.sign || 1) * ((this.speed * dt) / (ew.radius || 0.334));
      }
    }
    for (const w of this.coachWheels) {
      w.rotation.x = coachAngle;
    }

    const pinDY = -Math.sin(this.wheelAngle);
    const pinDZ = Math.cos(this.wheelAngle);
    for (const r of this.rodMeshes) {
      r.mesh.position.y = r.baseY + r.crankR * pinDY;
      r.mesh.position.z = r.baseZ + r.crankR * pinDZ;
    }
    for (const ch of this.crossheadMeshes) {
      ch.mesh.position.z = ch.baseZ + 0.155 * pinDZ;
    }
    for (const mr of this.mainRodMeshes) {
      const cy = mr.baseY;
      const cz = 0.98 + mr.crankR * pinDZ;
      const py = mr.baseY + mr.crankR * pinDY;
      const pz = -0.1 + mr.crankR * pinDZ;
      mr.mesh.position.y = (cy + py) * 0.5;
      mr.mesh.position.z = (cz + pz) * 0.5;
      mr.mesh.rotation.x = Math.atan2(py - cy, cz - pz);
    }

    // Animate GLTF wheel clips (e.g. DD17 Blue Baby driving rods/wheels)
    if (this.locoMixer) {
      this.locoMixer.update((this.speed * dt) / 5.5);
    }

    // Smoothly open CRH passenger doors when stopped, close when driving
    if (this.crhDoorUniforms && this.crhDoorUniforms.length > 0) {
      const targetClosed = Math.abs(this.speed) < 0.08 && Math.abs(this.throttle) < 0.02 ? 0.0 : 1.0;
      const step = Math.min(1, dt * 4.5);
      for (const u of this.crhDoorUniforms) {
        u.value += (targetClosed - u.value) * step;
      }
    }

    // Smoke emission from chimney (steam engines only)
    const absSpeed = Math.abs(this.speed);
    if (this.locoHasSmoke) {
      const smokeRate = absSpeed > 0.4 ? Math.max(0.055, 0.24 - absSpeed * 0.012) : 0.42;
      this.smokeTimer += dt;
      if (this.smokeTimer >= smokeRate) {
        this.smokeTimer = 0;
        const funnelWorld = this.smokeLocalOffset.clone().applyMatrix4(this.locoMesh.matrixWorld);
        this.emitSmoke(funnelWorld, false);
      }
      if (this.whistleActive && Math.random() < 0.45) {
        const whistleWorld = this.whistleLocalOffset.clone().applyMatrix4(this.locoMesh.matrixWorld);
        this.emitSmoke(whistleWorld, true);
      }
    }

    // Update smoke particle pool
    for (const p of this.smokePool) {
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }
      const t = p.age / p.life;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(1 - 0.65 * dt);
      const scale = 0.55 + t * 1.9;
      p.mesh.scale.setScalar(scale);
      p.mesh.material.opacity = (1 - t) * 0.58;
    }

    // Animate Thomas face bounce when clicked
    if (this.thomasFaceGroup) {
      if (this.thomasFaceBounce > 0) {
        this.thomasFaceBounce = Math.max(0, this.thomasFaceBounce - dt);
        const phase = (0.45 - this.thomasFaceBounce) / 0.45;
        const pulse = Math.sin(phase * Math.PI * 2) * (1 - phase);
        const s = 1 + 0.08 * Math.sin(phase * Math.PI);
        this.thomasFaceGroup.scale.set(s, s, 1);
        this.thomasFaceGroup.position.z = 1.903 + Math.max(0, 0.03 * Math.sin(phase * Math.PI));
        this.thomasFaceGroup.rotation.x = -0.07 * pulse;
      } else if (this.thomasFaceGroup.scale.x !== 1 || this.thomasFaceGroup.rotation.x !== 0) {
        this.thomasFaceGroup.scale.set(1, 1, 1);
        this.thomasFaceGroup.position.z = 1.903;
        this.thomasFaceGroup.rotation.x = 0;
      }
    }

    // Update sound effects
    if (audio) {
      audio.update(dt, absSpeed, Math.abs(this.throttle));
    }

    return { hitBuffer };
  }

  getCabView() {
    if (this.locoMesh) {
      this.locoMesh.updateMatrixWorld(true);
      const eye = this.cabLocalOffset.clone().applyMatrix4(this.locoMesh.matrixWorld);
      const look = new THREE.Vector3(0, this.cabLocalOffset.y - 0.55, this.cabLocalOffset.z + 14)
        .applyMatrix4(this.locoMesh.matrixWorld);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.locoMesh.quaternion).normalize();
      return { eye, look, up };
    }
    const front = this.sampleBehindHead(-1.6);
    const ahead = this.sampleBehindHead(-14.0);
    return {
      eye: front.pos.clone().add(new THREE.Vector3(0, 2.55, 0)),
      look: ahead.pos.clone().add(new THREE.Vector3(0, 1.4, 0)),
      up: new THREE.Vector3(0, 1, 0),
    };
  }

  getWorldPosition() {
    return this.locoMesh ? this.locoMesh.position.clone() : new THREE.Vector3();
  }

  getCurrentEdgeName() {
    const cur = this.trail[this.headIdx];
    return this.track.edges[cur.edgeId].name;
  }

  getCurrentStateForSwitchLookup() {
    const cur = this.trail[this.headIdx];
    const effectiveDir = this.speed < -0.1 ? -cur.dir : cur.dir;
    return { edgeId: cur.edgeId, s: this.headS, dir: effectiveDir };
  }
}

window.SteamTrain = SteamTrain;
