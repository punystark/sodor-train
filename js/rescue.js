// ---------------------------------------------------------------------------
// Heavy Rescue Helicopter & Scenic Hoist Rerail System
// Supports automatic multi-car scenic recovery AND exposes clean manual-flight
// hooks (setManualMode / setManualInput) for future player-controlled hoisting.
// ---------------------------------------------------------------------------

class RescueHelicopter {
  constructor(scene) {
    this.scene = scene;
    this.active = false;
    this.manualMode = false;
    this.phase = "idle"; // "idle" | "approach" | "lower_hook" | "hoist_up" | "carry" | "lower_to_rail" | "retract" | "depart" | "manual"
    this.phaseTime = 0;
    this.phaseDur = 1.0;

    this.train = null;
    this.audio = null;
    this.showToast = null;
    this.onComplete = null;

    this.queue = [];
    this.queueIdx = 0;
    this.currentUnitIdx = -1;
    this.carryMode = "rail"; // "rail" | "stage"
    this.stageCount = 0;

    this.pos = new THREE.Vector3(0, 26, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.rotorAngle = 0;
    this.animTime = 0;
    this.pulseTimer = 0;

    this.hoverAlt = 14.5;
    this.cableLen = 1.4;
    this.carryCableLen = 5.4;

    this.startHeliPos = new THREE.Vector3();
    this.endHeliPos = new THREE.Vector3();
    this.startCarPos = new THREE.Vector3();
    this.startCarQuat = new THREE.Quaternion();
    this.targetCarPos = new THREE.Vector3();
    this.targetCarQuat = new THREE.Quaternion();
    this.startCableLen = 1.4;
    this.endCableLen = 1.4;

    // Future manual flight / hoist state
    this.manualInput = { vx: 0, vz: 0, vy: 0, winchDelta: 0 };
    this.grabbedUnitIndex = -1;

    this._buildMesh();
  }

  _buildMesh() {
    const grp = new THREE.Group();

    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35, metalness: 0.1 });
    const redMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.4, metalness: 0.1 });
    const yellowMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.38, metalness: 0.15 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.15, metalness: 0.45 });
    const darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.55, metalness: 0.65 });
    const rotorBlurMat = new THREE.MeshBasicMaterial({
      color: 0xe2e8f0,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
    });

    // Main fuselage (+Z forward)
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.1, 6.2), whiteMat);
    cabin.position.set(0, 0.3, 0.2);
    cabin.castShadow = true;
    grp.add(cabin);

    // Nose cone & panoramic cockpit glass
    const nose = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.5, 1.8), whiteMat);
    nose.position.set(0, 0.05, 3.8);
    nose.castShadow = true;
    grp.add(nose);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(2.28, 1.05, 1.85), glassMat);
    windshield.position.set(0, 0.65, 3.55);
    windshield.rotation.x = 0.28;
    grp.add(windshield);

    // Rescue red livery band & side doors
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.56, 0.48, 6.0), redMat);
    stripe.position.set(0, 0.15, 0.2);
    grp.add(stripe);

    const doorWin = new THREE.Mesh(new THREE.BoxGeometry(2.54, 0.62, 2.6), glassMat);
    doorWin.position.set(0, 0.65, 0.6);
    grp.add(doorWin);

    // Twin top turbine engine pods
    for (const sx of [-0.62, 0.62]) {
      const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 2.8, 10), redMat);
      pod.rotation.x = Math.PI / 2;
      pod.position.set(sx, 1.55, 0.0);
      pod.castShadow = true;
      grp.add(pod);
    }

    // Tail boom + horizontal stabilizer + vertical fin
    const boom = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.72, 6.2), whiteMat);
    boom.position.set(0, 0.55, -5.6);
    boom.castShadow = true;
    grp.add(boom);

    const boomStripe = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.22, 5.8), redMat);
    boomStripe.position.set(0, 0.55, -5.6);
    grp.add(boomStripe);

    const hStab = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.12, 0.68), redMat);
    hStab.position.set(0, 0.62, -7.8);
    grp.add(hStab);

    const vFin = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.85, 1.05), redMat);
    vFin.position.set(0, 1.32, -8.5);
    vFin.rotation.x = -0.25;
    vFin.castShadow = true;
    grp.add(vFin);

    // Twin heavy landing skids
    for (const sx of [-1.25, 1.25]) {
      const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 5.8, 8), darkMetalMat);
      skid.rotation.x = Math.PI / 2;
      skid.position.set(sx, -1.25, 0.4);
      grp.add(skid);
      for (const sz of [-1.2, 1.8]) {
        const strut = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.12), darkMetalMat);
        strut.position.set(sx * 0.85, -0.82, sz);
        strut.rotation.z = sx > 0 ? -0.35 : 0.35;
        grp.add(strut);
      }
    }

    // Main Rotor Mast + 4-blade Rotor + Blur Disc
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.85, 10), darkMetalMat);
    mast.position.set(0, 1.95, 0.15);
    grp.add(mast);

    const mainRotor = new THREE.Group();
    mainRotor.position.set(0, 2.38, 0.15);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 10), yellowMat);
    mainRotor.add(hub);
    for (let b = 0; b < 4; b++) {
      const bladeWrap = new THREE.Group();
      bladeWrap.rotation.y = (b * Math.PI) / 2;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, 5.8), darkMetalMat);
      blade.position.z = 2.9;
      blade.castShadow = true;
      bladeWrap.add(blade);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.06, 0.45), yellowMat);
      tip.position.z = 5.6;
      bladeWrap.add(tip);
      mainRotor.add(bladeWrap);
    }
    const blurDisc = new THREE.Mesh(new THREE.CircleGeometry(5.8, 28), rotorBlurMat);
    blurDisc.rotation.x = -Math.PI / 2;
    blurDisc.position.y = -0.02;
    mainRotor.add(blurDisc);
    grp.add(mainRotor);
    this.mainRotor = mainRotor;

    // Tail Rotor
    const tailRotor = new THREE.Group();
    tailRotor.position.set(0.24, 1.58, -8.55);
    for (let b = 0; b < 2; b++) {
      const tb = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.55, 0.16), b === 0 ? yellowMat : darkMetalMat);
      tb.rotation.x = (b * Math.PI) / 2;
      tailRotor.add(tb);
    }
    grp.add(tailRotor);
    this.tailRotor = tailRotor;

    // Top flashing rescue strobe
    this.beaconMat = new THREE.MeshStandardMaterial({
      color: 0xff3b30,
      emissive: 0xff2d20,
      emissiveIntensity: 1.5,
      roughness: 0.2,
    });
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), this.beaconMat);
    beacon.position.set(0, 2.02, -8.55);
    grp.add(beacon);

    // Underside winch drum
    const winch = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.6, 10), yellowMat);
    winch.rotation.z = Math.PI / 2;
    winch.position.set(0, -0.88, 0.2);
    grp.add(winch);

    grp.visible = false;
    this.mesh = grp;
    this.scene.add(grp);

    // Separate world-space hoist cable + spreader bar (stays strictly vertical beneath helicopter)
    this.hoistGrp = new THREE.Group();
    this.hoistGrp.visible = false;

    const cableMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.35, metalness: 0.85 });
    this.cableMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1, 8), cableMat);
    this.hoistGrp.add(this.cableMesh);

    const spreader = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.22, 3.6), yellowMat);
    bar.castShadow = true;
    spreader.add(bar);
    const barTrim = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.14, 0.45), redMat);
    for (const sz of [-1.45, 1.45]) {
      const t = barTrim.clone();
      t.position.z = sz;
      spreader.add(t);
    }
    // 4 short sling lines hanging from spreader bar corners
    for (const [sx, sz] of [[-0.65, -1.55], [0.65, -1.55], [-0.65, 1.55], [0.65, 1.55]]) {
      const sling = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.35, 6), cableMat);
      sling.position.set(sx, -0.72, sz);
      spreader.add(sling);
    }
    this.spreaderMesh = spreader;
    this.hoistGrp.add(spreader);
    this.scene.add(this.hoistGrp);

    // Ground/rail target placement ring indicator
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0x22c55e,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
    });
    this.targetRing = new THREE.Mesh(new THREE.RingGeometry(1.5, 2.15, 28), this.ringMat);
    this.targetRing.rotation.x = -Math.PI / 2;
    this.targetRing.visible = false;
    this.scene.add(this.targetRing);
  }

  static smoothstep(t) {
    const c = Math.max(0, Math.min(1, t));
    return c * c * (3 - 2 * c);
  }

  _getUnitTimingScale() {
    const count = this.queue.length || 1;
    if (count <= 3) return 1.0;
    if (count <= 6) return 0.72;
    return 0.52;
  }

  _getUnitHalfLen(unitIndex) {
    if (!this.train) return 3.5;
    if (unitIndex === 0) return this.train.headHalfLen || (this.train.locoLength || 4.4) * 0.5;
    const meta = this.train.coachMetas && this.train.coachMetas[unitIndex - 1];
    return (meta && meta.halfLen) || 3.5;
  }

  _getUnitVisualCenterXZ(du) {
    du.mesh.updateMatrixWorld(true);
    return new THREE.Vector3(0, 1.35, 0).applyMatrix4(du.mesh.matrixWorld);
  }

  _isUnitBlockingTarget(blockerIdx, targetIdx, targetPose) {
    const du = this.train.derailUnits[blockerIdx];
    if (!du || du.rescued) return false;
    const center = this._getUnitVisualCenterXZ(du);
    const halfA = this._getUnitHalfLen(targetIdx);
    const halfB = this._getUnitHalfLen(blockerIdx);
    const tFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(targetPose.quat).setY(0).normalize();
    const clearanceAlong = halfA + halfB + 1.0;
    const clearanceAcross = 2.0 + halfB * 0.85;

    for (const pt of [du.pos, center]) {
      const dx = pt.x - targetPose.pos.x;
      const dz = pt.z - targetPose.pos.z;
      const along = Math.abs(dx * tFwd.x + dz * tFwd.z);
      const across = Math.abs(dx * -tFwd.z + dz * tFwd.x);
      if (along < clearanceAlong && across < clearanceAcross) {
        return true;
      }
    }
    return false;
  }

  // Dynamically pick which derailed car to rescue next so we NEVER drop a car onto another fallen car!
  _pickNextRescueAction() {
    const units = this.train.derailUnits;
    const remaining = [];
    for (let i = 0; i < units.length; i++) {
      if (!units[i].rescued) remaining.push(i);
    }
    if (!remaining.length) return null;

    const targets = {};
    for (const i of remaining) {
      targets[i] = this.train.getUnitTargetPose(i);
    }

    // Score each candidate: how many other un-rescued cars block its rail target,
    // and how many other un-rescued cars' rail targets it is currently blocking!
    const info = remaining.map((i) => {
      let blockers = 0;
      let blockingOthers = 0;
      for (const j of remaining) {
        if (j === i) continue;
        if (this._isUnitBlockingTarget(j, i, targets[i])) blockers++;
        if (this._isUnitBlockingTarget(i, j, targets[j])) blockingOthers++;
      }
      const distToHeli = this.pos.distanceTo(units[i].pos);
      return { idx: i, blockers, blockingOthers, staged: !!units[i].staged, distToHeli };
    });

    // 1. Prefer units whose target rail slot is 100% clear (`blockers === 0`)
    const clearOnes = info.filter((x) => x.blockers === 0);
    if (clearOnes.length > 0) {
      // Clear the ones that are blocking other tracks first, then rear-to-front or closest
      clearOnes.sort((a, b) => {
        if (b.blockingOthers !== a.blockingOthers) return b.blockingOthers - a.blockingOthers;
        if (a.staged !== b.staged) return a.staged ? 1 : -1;
        return a.distToHeli - b.distToHeli;
      });
      return { unitIndex: clearOnes[0].idx, mode: "rail" };
    }

    // 2. Mutual deadlock (e.g. two cars swapped/tangled on each other's rail slots):
    // Temporarily lift the biggest blocker onto a clean grass staging area beside the track!
    const nonStaged = info.filter((x) => !x.staged);
    const pool = nonStaged.length ? nonStaged : info;
    pool.sort((a, b) => {
      if (b.blockingOthers !== a.blockingOthers) return b.blockingOthers - a.blockingOthers;
      return a.blockers - b.blockers;
    });
    return { unitIndex: pool[0].idx, mode: "stage" };
  }

  _computeStagingPose(unitIndex) {
    const target = this.train.getUnitTargetPose(unitIndex);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(target.quat).setY(0).normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const side = this.stageCount % 2 === 0 ? 1 : -1;
    const offsetLat = 13.5 + Math.floor(this.stageCount / 2) * 5.0;
    this.stageCount++;
    const stagePos = target.pos.clone().addScaledVector(right, side * offsetLat);
    stagePos.y = Math.max(0.15, target.pos.y);
    return { pos: stagePos, quat: target.quat.clone() };
  }

  startAutoRescue(train, audio, showToast, onComplete = null) {
    if (!train || !train.derailed || !train.derailUnits.length) return false;

    this.manualMode = false;
    this.train = train;
    this.audio = audio;
    this.showToast = showToast;
    this.onComplete = onComplete;
    this.stageCount = 0;

    // Queue all non-rescued units for timing scale
    this.queue = [];
    for (let i = 0; i < train.derailUnits.length; i++) {
      if (!train.derailUnits[i].rescued) {
        train.derailUnits[i].staged = false;
        this.queue.push(i);
      }
    }
    if (!this.queue.length) {
      train.recoverFromDerailment(false, audio);
      return true;
    }

    this.queueIdx = 0;
    this.active = true;
    this.mesh.visible = true;
    this.hoistGrp.visible = true;
    this.targetRing.visible = false;

    const firstAction = this._pickNextRescueAction();
    if (!firstAction) {
      train.recoverFromDerailment(false, audio);
      return true;
    }
    this.carryMode = firstAction.mode;
    const firstDu = train.derailUnits[firstAction.unitIndex];
    this.pos.set(firstDu.pos.x - 42, firstDu.pos.y + 24, firstDu.pos.z + 30);
    this.cableLen = 1.4;
    this.yaw = Math.atan2(42, -30);

    if (this.showToast) {
      this.showToast(`🚁 救援直升机已出动！已规划最佳顺序，准备吊装 ${this.queue.length} 节车厢复位...`, 3600);
    }

    this._beginUnitPhase(firstAction.unitIndex, "approach");
    return true;
  }

  cancel() {
    this.active = false;
    this.manualMode = false;
    this.phase = "idle";
    this.grabbedUnitIndex = -1;
    this.train = null;
    if (this.mesh) this.mesh.visible = false;
    if (this.hoistGrp) this.hoistGrp.visible = false;
    if (this.targetRing) this.targetRing.visible = false;
  }

  // Future-ready manual control API (for piloting helicopter / crane to pick up cars manually)
  setManualMode(enabled, train = null) {
    this.manualMode = !!enabled;
    this.train = train || this.train;
    if (this.manualMode) {
      this.active = true;
      this.phase = "manual";
      this.mesh.visible = true;
      this.hoistGrp.visible = true;
    } else if (this.phase === "manual") {
      this.cancel();
    }
  }

  setManualInput(input) {
    Object.assign(this.manualInput, input || {});
  }

  _beginUnitPhase(unitIndex, phase) {
    this.currentUnitIdx = unitIndex;
    this.phase = phase;
    this.phaseTime = 0;

    if (phase === "depart") {
      this.targetRing.visible = false;
      this.startHeliPos.copy(this.pos);
      this.endHeliPos.set(this.pos.x + 70, this.pos.y + 28, this.pos.z - 55);
      this.startCableLen = this.cableLen;
      this.endCableLen = 1.2;
      this.phaseDur = 2.2;
      return;
    }

    if (!this.train || !this.train.derailUnits || !this.train.derailUnits[unitIndex]) {
      this.cancel();
      return;
    }
    const du = this.train.derailUnits[unitIndex];
    const scaleT = this._getUnitTimingScale();

    if (phase === "approach") {
      this.startHeliPos.copy(this.pos);
      this.endHeliPos.set(du.pos.x, du.pos.y + this.hoverAlt, du.pos.z);
      this.startCableLen = this.cableLen;
      this.endCableLen = 1.5;
      const dist = this.startHeliPos.distanceTo(this.endHeliPos);
      this.phaseDur = Math.max(0.65, Math.min(1.6, dist / 26)) * scaleT;
    } else if (phase === "lower_hook") {
      this.startHeliPos.copy(this.pos);
      this.endHeliPos.set(du.pos.x, du.pos.y + this.hoverAlt, du.pos.z);
      this.startCableLen = this.cableLen;
      this.endCableLen = Math.max(2.0, this.hoverAlt - 2.3);
      this.phaseDur = 0.65 * scaleT;
    } else if (phase === "hoist_up") {
      this.startCarPos.copy(du.pos);
      this.startCarQuat.copy(du.mesh.quaternion);
      const target =
        this.carryMode === "stage"
          ? this._computeStagingPose(unitIndex)
          : this.train.getUnitTargetPose(unitIndex);
      this.targetCarPos.copy(target.pos);
      this.targetCarQuat.copy(target.quat);

      this.startHeliPos.copy(this.pos);
      this.endHeliPos.set(du.pos.x, Math.max(du.pos.y, target.pos.y) + this.hoverAlt, du.pos.z);
      this.startCableLen = this.cableLen;
      this.endCableLen = this.carryCableLen;
      this.phaseDur = 0.8 * scaleT;
    } else if (phase === "carry") {
      if (this.carryMode !== "stage") {
        const target = this.train.getUnitTargetPose(unitIndex);
        this.targetCarPos.copy(target.pos);
        this.targetCarQuat.copy(target.quat);
      }

      this.startHeliPos.copy(this.pos);
      this.endHeliPos.set(this.targetCarPos.x, this.targetCarPos.y + this.hoverAlt, this.targetCarPos.z);
      this.startCableLen = this.carryCableLen;
      this.endCableLen = this.carryCableLen;
      const dist = this.startHeliPos.distanceTo(this.endHeliPos);
      this.phaseDur = Math.max(0.7, Math.min(1.65, dist / 18)) * scaleT;

      this.targetRing.position.set(this.targetCarPos.x, this.targetCarPos.y + 0.35, this.targetCarPos.z);
      this.ringMat.color.setHex(this.carryMode === "stage" ? 0xf59e0b : 0x22c55e);
      this.targetRing.visible = true;
    } else if (phase === "lower_to_rail") {
      this.startHeliPos.copy(this.pos);
      this.endHeliPos.set(this.targetCarPos.x, this.targetCarPos.y + this.hoverAlt - 1.2, this.targetCarPos.z);
      this.startCableLen = this.cableLen;
      this.endCableLen = this.hoverAlt - 1.2 - 1.75;
      this.phaseDur = 0.72 * scaleT;
    } else if (phase === "retract") {
      this.targetRing.visible = false;
      this.startHeliPos.copy(this.pos);
      this.endHeliPos.set(this.pos.x, this.targetCarPos.y + this.hoverAlt, this.pos.z);
      this.startCableLen = this.cableLen;
      this.endCableLen = 1.5;
      this.phaseDur = 0.35 * scaleT;
    }
  }

  _updateHoistVisuals(carPosForSpreader = null, spreaderQuat = null) {
    const winchWorldY = this.pos.y - 0.88;
    const hookY = winchWorldY - this.cableLen;

    this.cableMesh.scale.set(1, Math.max(0.2, this.cableLen), 1);
    this.cableMesh.position.set(this.pos.x, winchWorldY - this.cableLen * 0.5, this.pos.z);

    if (carPosForSpreader) {
      this.spreaderMesh.position.set(carPosForSpreader.x, Math.max(hookY, carPosForSpreader.y + 2.2), carPosForSpreader.z);
    } else {
      this.spreaderMesh.position.set(this.pos.x, hookY, this.pos.z);
    }
    if (spreaderQuat) {
      this.spreaderMesh.quaternion.copy(spreaderQuat);
    } else {
      this.spreaderMesh.rotation.set(0, this.yaw, 0);
    }
  }

  update(dt) {
    if (!this.active) return;
    this.animTime += dt;

    // Spin main & tail rotors continuously + flash rescue beacon
    this.rotorAngle += dt * 30.0;
    if (this.mainRotor) this.mainRotor.rotation.y = this.rotorAngle;
    if (this.tailRotor) this.tailRotor.rotation.x = this.rotorAngle * 1.4;
    if (this.beaconMat) {
      const pulse = 0.5 + 0.5 * Math.sin(this.animTime * 10.0);
      this.beaconMat.emissiveIntensity = 0.35 + pulse * 1.6;
    }

    if (this.audio && this.phase !== "depart") {
      this.pulseTimer += dt;
      if (this.pulseTimer >= 0.14) {
        this.pulseTimer = 0;
        if (this.audio.playHelicopterHoverPulse) this.audio.playHelicopterHoverPulse();
      }
    }

    if (this.phase === "manual") {
      this.pos.x += (this.manualInput.vx || 0) * dt;
      this.pos.y = Math.max(6.0, this.pos.y + (this.manualInput.vy || 0) * dt);
      this.pos.z += (this.manualInput.vz || 0) * dt;
      this.cableLen = Math.max(1.2, Math.min(20.0, this.cableLen + (this.manualInput.winchDelta || 0) * dt));
      this.mesh.position.copy(this.pos);
      this.mesh.rotation.set(0, this.yaw, 0);
      this._updateHoistVisuals();
      return;
    }

    if (!this.train || !this.train.derailed) {
      if (this.phase !== "depart") {
        this.cancel();
        return;
      }
    }

    this.phaseTime += dt;
    const rawT = Math.min(1, this.phaseTime / Math.max(0.05, this.phaseDur));
    const t = RescueHelicopter.smoothstep(rawT);

    // Move helicopter along arc
    const prevPos = this.pos.clone();
    this.pos.lerpVectors(this.startHeliPos, this.endHeliPos, t);
    // Gentle arc lift when flying laterally
    if (this.phase === "approach" || this.phase === "carry") {
      this.pos.y += Math.sin(rawT * Math.PI) * 2.2;
    }
    this.cableLen = this.startCableLen + (this.endCableLen - this.startCableLen) * t;

    // Orient helicopter smoothly along travel direction with realistic banking pitch
    const moveVec = this.pos.clone().sub(prevPos);
    const horizSpd = Math.hypot(moveVec.x, moveVec.z) / Math.max(0.001, dt);
    if (horizSpd > 1.2) {
      const targetYaw = Math.atan2(moveVec.x, moveVec.z);
      let diff = targetYaw - this.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.yaw += diff * Math.min(1, dt * 6.5);
    }
    const targetPitch = Math.min(0.18, horizSpd * 0.007);
    this.pitch += (targetPitch - this.pitch) * Math.min(1, dt * 6.0);
    this.roll = Math.sin(this.animTime * 2.2) * 0.03;

    this.mesh.position.copy(this.pos);
    this.mesh.rotation.order = "YXZ";
    this.mesh.rotation.set(this.pitch, this.yaw, this.roll);

    // Phase-specific cargo hoisting & placement
    if (this.phase === "approach" || this.phase === "lower_hook" || this.phase === "retract" || this.phase === "depart") {
      this._updateHoistVisuals();
    } else if (this.phase === "hoist_up") {
      const targetWinchCarY = this.pos.y - this.cableLen - 1.75;
      const curPos = new THREE.Vector3(
        this.startCarPos.x,
        this.startCarPos.y + (targetWinchCarY - this.startCarPos.y) * t,
        this.startCarPos.z
      );
      const curQuat = this.startCarQuat.clone().slerp(this.targetCarQuat, t * 0.85);
      this.train.setUnitHoistPose(this.currentUnitIdx, curPos, curQuat);
      this._updateHoistVisuals(curPos, curQuat);
    } else if (this.phase === "carry") {
      const swayX = Math.sin(this.animTime * 4.5) * 0.12;
      const swayZ = Math.cos(this.animTime * 3.8) * 0.12;
      const curPos = new THREE.Vector3(
        this.pos.x + swayX,
        this.pos.y - this.cableLen - 1.75,
        this.pos.z + swayZ
      );
      const curQuat = this.startCarQuat.clone().slerp(this.targetCarQuat, 0.85 + 0.15 * t);
      this.train.setUnitHoistPose(this.currentUnitIdx, curPos, curQuat);
      this._updateHoistVisuals(curPos, curQuat);
      if (this.targetRing.visible) {
        this.ringMat.opacity = 0.45 + 0.4 * Math.sin(this.animTime * 9.0);
      }
    } else if (this.phase === "lower_to_rail") {
      const topPos = new THREE.Vector3(
        this.targetCarPos.x,
        this.pos.y - this.carryCableLen - 1.75,
        this.targetCarPos.z
      );
      const curPos = topPos.lerp(this.targetCarPos, t);
      this.train.setUnitHoistPose(this.currentUnitIdx, curPos, this.targetCarQuat);
      this._updateHoistVisuals(curPos, this.targetCarQuat);
    }

    // Advance state machine on phase completion
    if (rawT >= 1.0) {
      if (this.phase === "approach") {
        this._beginUnitPhase(this.currentUnitIdx, "lower_hook");
      } else if (this.phase === "lower_hook") {
        this._beginUnitPhase(this.currentUnitIdx, "hoist_up");
      } else if (this.phase === "hoist_up") {
        this._beginUnitPhase(this.currentUnitIdx, "carry");
      } else if (this.phase === "carry") {
        this._beginUnitPhase(this.currentUnitIdx, "lower_to_rail");
      } else if (this.phase === "lower_to_rail") {
        if (this.carryMode === "stage") {
          const du = this.train.derailUnits[this.currentUnitIdx];
          if (du) {
            du.beingHoisted = false;
            du.staged = true;
            du.pos.copy(this.targetCarPos);
            du.mesh.position.copy(this.targetCarPos);
            du.mesh.quaternion.copy(this.targetCarQuat);
            du.mesh.updateMatrixWorld(true);
          }
        } else {
          this.train.markUnitRescued(this.currentUnitIdx);
        }
        if (this.audio && this.audio.playSwitchClack) this.audio.playSwitchClack();
        this._beginUnitPhase(this.currentUnitIdx, "retract");
      } else if (this.phase === "retract") {
        const nextAction = this._pickNextRescueAction();
        if (nextAction) {
          this.carryMode = nextAction.mode;
          this._beginUnitPhase(nextAction.unitIndex, "approach");
        } else {
          const finishedTrain = this.train;
          this._beginUnitPhase(this.currentUnitIdx, "depart");
          if (finishedTrain) finishedTrain.recoverFromDerailment(true);
          if (this.audio && this.audio.playRerailChime) this.audio.playRerailChime();
          if (this.showToast) {
            this.showToast("🚁 救援直升机已将全部车厢吊装复轨，小火车可以重新出发啦！", 3800);
          }
          if (this.onComplete) this.onComplete();
        }
      } else if (this.phase === "depart") {
        this.cancel();
      }
    }
  }
}

window.RescueHelicopter = RescueHelicopter;
