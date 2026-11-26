// ---------------------------------------------------------------------------
// Complete Two-Lane Highway, Automatic Railway Level Crossings, Diverse
// Procedural 3D Vehicles (Engineering Trucks, Cargo Vans, Family Cars),
// Rogue Gate-Runners & 3D Train-Collision Rollover Physics
// ---------------------------------------------------------------------------

class HighwayTrafficSystem {
  constructor(trackNetwork) {
    this.track = trackNetwork;
    this.root = null;
    this.origin = new THREE.Vector3();
    this.uDir = new THREE.Vector3(-1, 0, 0); // Westward along highway
    this.vDir = new THREE.Vector3(0, 0, 1);  // Southward perpendicular to highway

    this.tEast = -265;
    this.tWest = 195;
    this.roadWidth = 7.6;
    this.laneOffset = 1.85;

    this.crossings = [];
    this.loopPoints = [];
    this.loopTangents = [];
    this.loopArcs = [];
    this.loopLen = 1;

    this.vehicles = [];
    this.particles = [];
    this.brokenArms = [];
    this.animTime = 0;
    this.bellTimer = 0;
    this.randomRogueCooldown = 14.0;
    this.crashCount = 0;

    this._initGeometryMetadata();
  }

  _initGeometryMetadata() {
    const e6 = this.track.edges.E6;
    const lc = this.track.sampleEdge("E6", e6.length * 0.5);
    this.origin.set(lc.pos.x, 0, lc.pos.z);
    this.uDir.set(lc.right.x, 0, lc.right.z).normalize();
    this.vDir.set(lc.tangent.x, 0, lc.tangent.z).normalize();

    // Locate all railway intersections along the straight highway corridor
    const targetEdges = [
      { id: "E6", label: "西海岸平交道 (S5)" },
      { id: "W_WEST", label: "西岸外环平交道" },
      { id: "B3", label: "西支线平交道" },
    ];
    for (const cfg of targetEdges) {
      const edge = this.track.edges[cfg.id];
      if (!edge) continue;
      let best = { perp: Infinity, t: 0, idx: 0, pos: null };
      for (let i = 0; i < edge.points.length; i++) {
        const p = edge.points[i];
        const rx = p.x - this.origin.x;
        const rz = p.z - this.origin.z;
        const tAlong = rx * this.uDir.x + rz * this.uDir.z;
        const perp = Math.abs(rx * this.vDir.x + rz * this.vDir.z);
        if (perp < best.perp && tAlong > this.tEast + 15 && tAlong < this.tWest - 15) {
          best = { perp, t: tAlong, idx: i, pos: p.clone() };
        }
      }
      if (best.pos && best.perp < 6.0) {
        const sSample = (best.idx / Math.max(1, edge.points.length - 1)) * edge.length;
        const sample = this.track.sampleEdge(cfg.id, sSample);
        this.crossings.push({
          id: cfg.id,
          label: cfg.label,
          t: best.t,
          pos: new THREE.Vector3(
            this.origin.x + this.uDir.x * best.t,
            sample.pos.y,
            this.origin.z + this.uDir.z * best.t
          ),
          baseY: sample.pos.y,
          trackTan: sample.tangent.clone(),
          gateActive: false,
          gateClosed: 0,
          barrierKick: 0,
          flashPhase: 0,
          wasActive: false,
          barriers: [],
          lamps: [],
          stopS: { west: 0, east: 0 },
          centerS: { west: 0, east: 0 },
        });
      }
    }
    this.crossings.sort((a, b) => a.t - b.t);
  }

  toWorld(t, lat, y = 0) {
    return new THREE.Vector3(
      this.origin.x + this.uDir.x * t + this.vDir.x * lat,
      y,
      this.origin.z + this.uDir.z * t + this.vDir.z * lat
    );
  }

  getRoadSurfaceY(t) {
    let y = 0.10;
    for (const c of this.crossings) {
      const dist = Math.abs(t - c.t);
      if (dist < 10.5) {
        const deckY = c.baseY + 0.235;
        if (dist <= 3.2) {
          y = Math.max(y, deckY);
        } else {
          const k = 1 - (dist - 3.2) / 7.3;
          const smooth = k * k * (3 - 2 * k);
          y = Math.max(y, 0.10 + (deckY - 0.10) * smooth);
        }
      }
    }
    return y;
  }

  // Used by SodorScenery to keep meadow flat and trees clear of the highway & roundabouts
  minDistToRoad(x, z) {
    const rx = x - this.origin.x;
    const rz = z - this.origin.z;
    const t = rx * this.uDir.x + rz * this.uDir.z;
    const lat = rx * this.vDir.x + rz * this.vDir.z;

    let minD = Infinity;
    const clampedT = Math.max(this.tEast, Math.min(this.tWest, t));
    const dStraight = Math.hypot(t - clampedT, Math.max(0, Math.abs(lat) - this.roadWidth * 0.5));
    minD = Math.min(minD, dStraight);

    // West & East roundabouts + adjacent depot aprons
    const dWest = Math.max(0, Math.hypot(t - (this.tWest + 2), lat) - 16.0);
    const dEast = Math.max(0, Math.hypot(t - (this.tEast - 2), lat) - 13.5);
    minD = Math.min(minD, dWest, dEast);
    return minD;
  }

  build(scene) {
    const group = new THREE.Group();
    this.root = group;

    this._buildClosedTrafficLoop();
    this._buildHighwayMeshes(group);
    this._buildRoundaboutsAndDepots(group);
    this._buildCrossings(group);
    this._buildStreetLights(group);
    this._spawnVehicleFleet(group);

    scene.add(group);
    return group;
  }

  _buildClosedTrafficLoop() {
    const L = this.laneOffset;
    const tE = this.tEast + 11;
    const tW = this.tWest - 11;
    const ctrl = [];

    // Westbound straight lane (lat = -L, t increasing East -> West)
    for (let i = 0; i <= 14; i++) {
      const t = tE + ((tW - tE) * i) / 14;
      ctrl.push(this.toWorld(t, -L, 0));
    }
    // West Roundabout smooth turnaround
    ctrl.push(this.toWorld(this.tWest - 2, -5.8, 0));
    ctrl.push(this.toWorld(this.tWest + 6.5, -5.5, 0));
    ctrl.push(this.toWorld(this.tWest + 10.2, 0, 0));
    ctrl.push(this.toWorld(this.tWest + 6.5, 5.5, 0));
    ctrl.push(this.toWorld(this.tWest - 2, 5.8, 0));

    // Eastbound straight lane (lat = +L, t decreasing West -> East)
    for (let i = 0; i <= 14; i++) {
      const t = tW - ((tW - tE) * i) / 14;
      ctrl.push(this.toWorld(t, L, 0));
    }
    // East Roundabout smooth turnaround
    ctrl.push(this.toWorld(this.tEast + 2, 5.4, 0));
    ctrl.push(this.toWorld(this.tEast - 5.8, 5.0, 0));
    ctrl.push(this.toWorld(this.tEast - 9.2, 0, 0));
    ctrl.push(this.toWorld(this.tEast - 5.8, -5.0, 0));
    ctrl.push(this.toWorld(this.tEast + 2, -5.4, 0));

    const curve = new THREE.CatmullRomCurve3(ctrl, true, "centripetal", 0.5);
    const segs = 1200;
    const rawPts = curve.getSpacedPoints(segs);
    this.loopPoints = [];
    this.loopTangents = [];
    this.loopArcs = [0];

    for (let i = 0; i < rawPts.length; i++) {
      const p = rawPts[i].clone();
      const rx = p.x - this.origin.x;
      const rz = p.z - this.origin.z;
      const t = rx * this.uDir.x + rz * this.uDir.z;
      p.y = this.getRoadSurfaceY(t);
      this.loopPoints.push(p);
      if (i > 0) {
        this.loopArcs.push(this.loopArcs[i - 1] + p.distanceTo(this.loopPoints[i - 1]));
      }
    }
    this.loopLen = this.loopArcs[this.loopArcs.length - 1];

    for (let i = 0; i < this.loopPoints.length; i++) {
      const prev = this.loopPoints[(i - 1 + this.loopPoints.length) % this.loopPoints.length];
      const next = this.loopPoints[(i + 1) % this.loopPoints.length];
      this.loopTangents.push(next.clone().sub(prev).normalize());
    }

    // Locate exact loop arc-lengths for each crossing in both Westbound & Eastbound directions
    for (const c of this.crossings) {
      let bestW = { d: Infinity, s: 0 };
      let bestE = { d: Infinity, s: 0 };
      for (let i = 0; i < this.loopPoints.length; i++) {
        const p = this.loopPoints[i];
        const tan = this.loopTangents[i];
        const rx = p.x - this.origin.x;
        const rz = p.z - this.origin.z;
        const t = rx * this.uDir.x + rz * this.uDir.z;
        const distT = Math.abs(t - c.t);
        const headingDot = tan.x * this.uDir.x + tan.z * this.uDir.z;
        if (headingDot > 0.7 && distT < bestW.d) {
          bestW = { d: distT, s: this.loopArcs[i] };
        } else if (headingDot < -0.7 && distT < bestE.d) {
          bestE = { d: distT, s: this.loopArcs[i] };
        }
      }
      c.centerS.west = bestW.s;
      c.centerS.east = bestE.s;
      c.stopS.west = (bestW.s - 7.6 + this.loopLen) % this.loopLen;
      c.stopS.east = (bestE.s - 7.6 + this.loopLen) % this.loopLen;
    }
  }

  sampleLoop(s) {
    let wrapped = s % this.loopLen;
    if (wrapped < 0) wrapped += this.loopLen;
    const arcs = this.loopArcs;
    let lo = 0;
    let hi = arcs.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (arcs[mid] <= wrapped) lo = mid;
      else hi = mid;
    }
    const span = Math.max(1e-5, arcs[hi] - arcs[lo]);
    const f = (wrapped - arcs[lo]) / span;
    const pos = this.loopPoints[lo].clone().lerp(this.loopPoints[hi], f);
    const tan = this.loopTangents[lo].clone().lerp(this.loopTangents[hi], f).normalize();
    return { pos, tan };
  }

  _buildHighwayMeshes(parent) {
    const roadGrp = new THREE.Group();
    roadGrp.position.copy(this.origin);
    // Align local +Z along uDir (Westward) and local +X along -vDir (Northward)
    //Wait: verify rotation so local +Z = uDir and local +X = (-vDir or +vDir)
    const basis = new THREE.Matrix4().makeBasis(
      this.vDir.clone(),
      new THREE.Vector3(0, 1, 0),
      this.uDir.clone()
    );
    // Determinant check: vDir x Y = -uDir? Let's verify: vDir=(0.082,0,0.997), Y=(0,1,0) -> vDir x Y = (-0.997,0,0.082) = uDir!
    // So (vDir, Y, uDir) is right-handed! Local +X = vDir (lat), Local +Y = Up, Local +Z = uDir (t)!
    roadGrp.quaternion.setFromRotationMatrix(basis);

    const tMin = this.tEast + 6;
    const tMax = this.tWest - 6;
    const len = tMax - tMin;
    const midT = (tMin + tMax) * 0.5;

    const asphaltMat = new THREE.MeshStandardMaterial({ color: 0x3b4048, roughness: 0.92, metalness: 0.04 });
    const curbMat = new THREE.MeshStandardMaterial({ color: 0xcbd2da, roughness: 0.8 });
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.65 });
    const yellowLineMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.65 });

    // Segmented asphalt roadbed (splits gently at crossings so W_WEST ramp sits flush)
    const segStep = 4.0;
    const steps = Math.ceil(len / segStep);
    for (let i = 0; i < steps; i++) {
      const t0 = tMin + (len * i) / steps;
      const t1 = tMin + (len * (i + 1)) / steps;
      const tm = (t0 + t1) * 0.5;
      const segLen = t1 - t0 + 0.06;
      const ySurf = this.getRoadSurfaceY(tm);

      // Skip crossing inner rail slot (crossing plank deck covers ±2.2m)
      const nearRail = this.crossings.some((c) => Math.abs(tm - c.t) < 2.2);
      const slabH = Math.max(0.10, ySurf);
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(this.roadWidth, slabH, segLen),
        asphaltMat
      );
      slab.position.set(0, slabH * 0.5, tm);
      slab.receiveShadow = true;
      roadGrp.add(slab);

      if (!nearRail) {
        // Side concrete curbs
        for (const sx of [-this.roadWidth * 0.5 - 0.18, this.roadWidth * 0.5 + 0.18]) {
          const curb = new THREE.Mesh(new THREE.BoxGeometry(0.36, slabH + 0.08, segLen), curbMat);
          curb.position.set(sx, (slabH + 0.08) * 0.5, tm);
          curb.receiveShadow = true;
          roadGrp.add(curb);
        }
        // Solid white edge shoulder lines
        for (const sx of [-this.roadWidth * 0.5 + 0.25, this.roadWidth * 0.5 - 0.25]) {
          const edgeL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.016, segLen), lineMat);
          edgeL.position.set(sx, slabH + 0.01, tm);
          roadGrp.add(edgeL);
        }
        // Dashed yellow/white centerline
        const nearCrossing = this.crossings.some((c) => Math.abs(tm - c.t) < 10.5);
        if (nearCrossing) {
          // Solid double yellow near level crossings (no overtaking!)
          for (const dx of [-0.1, 0.1]) {
            const dy = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.016, segLen), yellowLineMat);
            dy.position.set(dx, slabH + 0.01, tm);
            roadGrp.add(dy);
          }
        } else if (i % 2 === 0) {
          const dash = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.016, segLen * 0.62), lineMat);
          dash.position.set(0, slabH + 0.01, tm);
          roadGrp.add(dash);
        }
      }
    }

    parent.add(roadGrp);
    this.roadGrp = roadGrp;
  }

  _buildRoundaboutsAndDepots(parent) {
    const asphaltMat = new THREE.MeshStandardMaterial({ color: 0x3b4048, roughness: 0.92 });
    const curbMat = new THREE.MeshStandardMaterial({ color: 0xcbd2da, roughness: 0.8 });
    const grassIslandMat = new THREE.MeshStandardMaterial({ color: 0x4b943a, roughness: 0.9 });
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.65 });

    const buildRoundabout = (tCenter, outerR, innerR, isWestDepot) => {
      const grp = new THREE.Group();
      grp.position.copy(this.toWorld(tCenter, 0, 0));

      // Asphalt circle
      const disk = new THREE.Mesh(new THREE.CylinderGeometry(outerR, outerR + 0.2, 0.12, 36), asphaltMat);
      disk.position.y = 0.06;
      disk.receiveShadow = true;
      grp.add(disk);

      // Outer curb ring
      const outerCurb = new THREE.Mesh(new THREE.RingGeometry(outerR - 0.15, outerR + 0.3, 36), curbMat);
      outerCurb.rotation.x = -Math.PI / 2;
      outerCurb.position.y = 0.135;
      grp.add(outerCurb);

      // Lane ring stripe
      const laneRing = new THREE.Mesh(new THREE.RingGeometry(innerR + 2.8, innerR + 2.98, 36), lineMat);
      laneRing.rotation.x = -Math.PI / 2;
      laneRing.position.y = 0.13;
      grp.add(laneRing);

      // Raised center island
      const islandCurb = new THREE.Mesh(new THREE.CylinderGeometry(innerR + 0.25, innerR + 0.35, 0.28, 28), curbMat);
      islandCurb.position.y = 0.14;
      islandCurb.receiveShadow = true;
      grp.add(islandCurb);

      const islandGrass = new THREE.Mesh(new THREE.CylinderGeometry(innerR, innerR, 0.32, 28), grassIslandMat);
      islandGrass.position.y = 0.16;
      islandGrass.receiveShadow = true;
      grp.add(islandGrass);

      if (isWestDepot) {
        // West Construction Material Depot (sand mound, concrete pipes, site office & cones)
        const sandMat = new THREE.MeshStandardMaterial({ color: 0xc29b61, roughness: 0.96 });
        const mound = new THREE.Mesh(new THREE.ConeGeometry(3.1, 2.3, 10), sandMat);
        mound.position.set(0, 1.3, 0);
        mound.castShadow = true;
        grp.add(mound);

        // Construction site office cabin beside roundabout
        const cabinMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.7 });
        const roofMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.6 });
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(6.8, 2.8, 3.6), cabinMat);
        cabin.position.set(-4, 1.4, -outerR - 4.2);
        cabin.castShadow = true;
        cabin.receiveShadow = true;
        grp.add(cabin);
        const cRoof = new THREE.Mesh(new THREE.BoxGeometry(7.3, 0.35, 4.1), roofMat);
        cRoof.position.set(-4, 2.95, -outerR - 4.2);
        cRoof.castShadow = true;
        grp.add(cRoof);

        // Stack of concrete culvert pipes
        const pipeMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.85 });
        for (let i = 0; i < 3; i++) {
          const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 3.6, 12), pipeMat);
          pipe.rotation.z = Math.PI / 2;
          pipe.position.set(4.5, 0.55, -outerR - 3.8 + i * 1.25);
          pipe.castShadow = true;
          grp.add(pipe);
        }
      } else {
        // East Town Roundabout: decorative monument & shade tree in center
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.32, 0.45, 2.2, 8),
          new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.9 })
        );
        trunk.position.y = 1.3;
        trunk.castShadow = true;
        grp.add(trunk);
        const crown = new THREE.Mesh(
          new THREE.DodecahedronGeometry(2.1, 1),
          new THREE.MeshStandardMaterial({ color: 0x3b8c32, roughness: 0.85 })
        );
        crown.position.y = 3.2;
        crown.castShadow = true;
        grp.add(crown);
      }

      parent.add(grp);
    };

    buildRoundabout(this.tWest + 1.5, 12.6, 4.6, true);
    buildRoundabout(this.tEast - 1.5, 11.4, 4.2, false);
  }

  _buildCrossings(parent) {
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x47413a, roughness: 0.92 });
    const railGuardMat = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.7 });
    const stopLineMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.6 });
    const cabinetMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.5, metalness: 0.2 });
    const darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x1e242c, roughness: 0.5, metalness: 0.55 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.45 });
    const redMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.45 });

    const basis = new THREE.Matrix4().makeBasis(
      this.vDir.clone(),
      new THREE.Vector3(0, 1, 0),
      this.uDir.clone()
    );

    for (const c of this.crossings) {
      const grp = new THREE.Group();
      grp.position.set(c.pos.x, c.baseY, c.pos.z);
      grp.quaternion.setFromRotationMatrix(basis);

      // 1. Flush timber/rubber rail-crossing deck planks (top at +0.23, below 0.285 rail top)
      const deck = new THREE.Mesh(new THREE.BoxGeometry(this.roadWidth + 0.6, 0.23, 4.6), deckMat);
      deck.position.set(0, 0.115, 0);
      deck.receiveShadow = true;
      grp.add(deck);

      // Steel flangeway cheek strips beside rails
      for (const rz of [-0.82, 0.82]) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(this.roadWidth + 0.4, 0.245, 0.14), railGuardMat);
        strip.position.set(0, 0.1225, rz);
        grp.add(strip);
      }

      // 2. White STOP lines + road "X" warning stripes before both approaches
      // Westbound lane (lat = -laneOffset) approaches from negative Z (t < c.t)
      // Eastbound lane (lat = +laneOffset) approaches from positive Z (t > c.t)
      for (const [lat, zSign] of [[-this.laneOffset, -1], [this.laneOffset, 1]]) {
        const stopY = this.getRoadSurfaceY(c.t + zSign * 7.2) - c.baseY + 0.018;
        const stopLine = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.02, 0.48), stopLineMat);
        stopLine.position.set(lat, stopY, zSign * 7.2);
        grp.add(stopLine);

        // Yellow-black hazard threshold band near barrier
        const warnY = this.getRoadSurfaceY(c.t + zSign * 5.8) - c.baseY + 0.018;
        const warnBand = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.02, 0.28), cabinetMat);
        warnBand.position.set(lat, warnY, zSign * 5.8);
        grp.add(warnBand);
      }

      // 3. Dual Electric Boom Barriers (one per approaching lane)
      // Each barrier sits on the approaching right-hand curb and swings across its lane!
      const barrierSpecs = [
        // Westbound approach: t = -5.4, curb on North side (lat = -4.35), arm extends +X (South)
        { lat: -4.35, z: -5.4, dirX: 1 },
        // Eastbound approach: t = +5.4, curb on South side (lat = +4.35), arm extends -X (North)
        { lat: 4.35, z: 5.4, dirX: -1 },
      ];

      for (const bs of barrierSpecs) {
        const base = new THREE.Group();
        base.position.set(bs.lat, 0.1, bs.z);

        const ped = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.15, 0.56), cabinetMat);
        ped.position.y = 0.58;
        ped.castShadow = true;
        base.add(ped);

        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.16, 0.62), darkMetalMat);
        cap.position.y = 1.22;
        base.add(cap);

        // Pivoting boom arm (split into stub + breakable outer arm so rogue cars snap it off!)
        const pivot = new THREE.Group();
        pivot.position.set(0, 1.05, 0);

        const armLen = 4.35;
        const segs = 7;
        const segLen = armLen / segs;

        const stubSeg = new THREE.Mesh(
          new THREE.BoxGeometry(segLen, 0.13, 0.09),
          redMat
        );
        stubSeg.position.x = bs.dirX * (0.5 * segLen);
        stubSeg.castShadow = true;
        pivot.add(stubSeg);

        const breakGroup = new THREE.Group();
        for (let s = 1; s < segs; s++) {
          const seg = new THREE.Mesh(
            new THREE.BoxGeometry(segLen, 0.13, 0.09),
            s % 2 === 0 ? redMat : whiteMat
          );
          seg.position.x = bs.dirX * ((s + 0.5) * segLen);
          seg.castShadow = true;
          breakGroup.add(seg);
        }
        // Counterweight tail behind pivot
        const cw = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.22, 0.18), darkMetalMat);
        cw.position.x = -bs.dirX * 0.45;
        pivot.add(cw);

        // Two small red warning LEDs hanging under the breakable boom arm
        for (const frac of [0.38, 0.76]) {
          const ledMat = new THREE.MeshStandardMaterial({
            color: 0xff2222,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.3,
          });
          const led = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), ledMat);
          led.position.set(bs.dirX * armLen * frac, -0.09, 0);
          breakGroup.add(led);
          c.lamps.push({ mat: ledMat, phase: frac > 0.5 ? 1 : 0 });
        }
        pivot.add(breakGroup);

        // Start raised open
        pivot.rotation.z = bs.dirX * (Math.PI * 0.46);
        base.add(pivot);
        grp.add(base);
        c.barriers.push({
          pivot,
          breakGroup,
          dirX: bs.dirX,
          broken: false,
          brokenAge: 0,
        });

        // 4. St. Andrew's Cross (X) Signal Post with twin alternating flashing red lights
        const postGrp = new THREE.Group();
        postGrp.position.set(bs.lat, 0.1, bs.z - Math.sign(bs.z) * 1.15);

        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 3.6, 8), whiteMat);
        mast.position.y = 1.8;
        mast.castShadow = true;
        postGrp.add(mast);

        // X-crossbuck facing approaching vehicles (faces ±Z)
        const crossGrp = new THREE.Group();
        crossGrp.position.set(0, 3.15, 0);
        for (const ang of [0.65, -0.65]) {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.20, 0.08), whiteMat);
          bar.rotation.z = ang;
          crossGrp.add(bar);
          const trim = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.08, 0.10), redMat);
          trim.rotation.z = ang;
          crossGrp.add(trim);
        }
        postGrp.add(crossGrp);

        // Twin hooded red flashing signal lamps
        const lampBar = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.12, 0.14), darkMetalMat);
        lampBar.position.set(0, 2.38, 0);
        postGrp.add(lampBar);

        for (const [lx, phase] of [[-0.42, 0], [0.42, 1]]) {
          const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.22, 12), darkMetalMat);
          hood.rotation.x = Math.PI / 2;
          hood.position.set(lx, 2.38, 0);
          postGrp.add(hood);

          const lampMat = new THREE.MeshStandardMaterial({
            color: 0x6b1010,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.25,
          });
          for (const faceZ of [-0.115, 0.115]) {
            const lens = new THREE.Mesh(new THREE.CircleGeometry(0.145, 12), lampMat);
            lens.position.set(lx, 2.38, faceZ);
            if (faceZ < 0) lens.rotation.y = Math.PI;
            postGrp.add(lens);
          }
          c.lamps.push({ mat: lampMat, phase });
        }

        grp.add(postGrp);
      }

      parent.add(grp);
    }
  }

  _buildStreetLights(parent) {
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x525b68, roughness: 0.5, metalness: 0.6 });
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xfff8dc,
      emissive: 0xffe49e,
      emissiveIntensity: 0.35,
      roughness: 0.3,
    });

    for (let t = this.tEast + 22; t <= this.tWest - 22; t += 28) {
      if (this.crossings.some((c) => Math.abs(t - c.t) < 12.5)) continue;
      const side = Math.round(t / 28) % 2 === 0 ? -1 : 1;
      const pos = this.toWorld(t, side * (this.roadWidth * 0.5 + 0.9), 0);

      const lg = new THREE.Group();
      lg.position.copy(pos);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 5.2, 7), poleMat);
      pole.position.y = 2.6;
      pole.castShadow = true;
      lg.add(pole);

      const armDir = this.vDir.clone().multiplyScalar(-side);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.45), poleMat);
      arm.position.set(armDir.x * 0.65, 5.15, armDir.z * 0.65);
      arm.rotation.y = Math.atan2(armDir.x, armDir.z);
      lg.add(arm);

      const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.52), lampMat);
      bulb.position.set(armDir.x * 1.25, 5.08, armDir.z * 1.25);
      bulb.rotation.y = Math.atan2(armDir.x, armDir.z);
      lg.add(bulb);

      parent.add(lg);
    }
  }

  // --- Detailed Procedural 3D Vehicles (+Z forward, +Y up, y=0 wheel bottom) ---
  _addWheels(grp, axlesZ, halfTrack, radius, width, wheelsOut) {
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x1b1e23, roughness: 0.88 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.35, metalness: 0.6 });
    for (const az of axlesZ) {
      for (const sx of [-1, 1]) {
        const wGrp = new THREE.Group();
        wGrp.position.set(sx * halfTrack, radius, az);
        const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 14), tireMat);
        tire.rotation.z = Math.PI / 2;
        tire.castShadow = true;
        wGrp.add(tire);
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.54, radius * 0.54, width + 0.02, 10), rimMat);
        rim.rotation.z = Math.PI / 2;
        wGrp.add(rim);
        grp.add(wGrp);
        wheelsOut.push({ mesh: wGrp, radius });
      }
    }
  }

  _addLightsAndBeacon(grp, halfW, frontZ, rearZ, lightY, hasBeacon, beaconPos) {
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xfffbeb,
      emissive: 0xfff0b3,
      emissiveIntensity: 0.65,
      roughness: 0.2,
    });
    const tailMat = new THREE.MeshStandardMaterial({
      color: 0x991b1b,
      emissive: 0x550000,
      emissiveIntensity: 0.25,
      roughness: 0.3,
    });

    for (const sx of [-1, 1]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.08), headMat);
      hl.position.set(sx * (halfW - 0.26), lightY, frontZ);
      grp.add(hl);

      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.18, 0.08), tailMat);
      tl.position.set(sx * (halfW - 0.26), lightY, rearZ);
      grp.add(tl);
    }

    let beaconMat = null;
    if (hasBeacon && beaconPos) {
      beaconMat = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xff8800,
        emissiveIntensity: 0.9,
        roughness: 0.25,
      });
      const bMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.18, 10), beaconMat);
      bMesh.position.set(beaconPos[0], beaconPos[1], beaconPos[2]);
      grp.add(bMesh);
    }

    // Rogue gate-runner roof hazard halo (hidden normally, pulses bright red when rogue)
    const rogueMat = new THREE.MeshStandardMaterial({
      color: 0xff2020,
      emissive: 0xff1111,
      emissiveIntensity: 1.4,
      transparent: true,
      opacity: 0.9,
    });
    const rogueHalo = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.09, 8, 18), rogueMat);
    rogueHalo.rotation.x = Math.PI / 2;
    rogueHalo.position.set(0, (beaconPos ? beaconPos[1] + 0.55 : 2.35), 0);
    rogueHalo.visible = false;
    grp.add(rogueHalo);

    return { tailMat, beaconMat, rogueHalo, rogueMat };
  }

  _buildMixerTruck(spec) {
    const grp = new THREE.Group();
    const wheels = [];
    const cabMat = new THREE.MeshStandardMaterial({ color: spec.cabColor, roughness: 0.45, metalness: 0.1 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.18, metalness: 0.35 });
    const chassisMat = new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: 0.78 });
    const drumBaseMat = new THREE.MeshStandardMaterial({ color: spec.drumColor, roughness: 0.42 });
    const stripeMat = new THREE.MeshStandardMaterial({ color: spec.stripeColor, roughness: 0.42 });

    // Heavy chassis
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.36, 5.15), chassisMat);
    frame.position.set(0, 0.62, 0);
    frame.castShadow = true;
    grp.add(frame);

    // Front cab
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.86, 1.52, 1.48), cabMat);
    cab.position.set(0, 1.50, 1.76);
    cab.castShadow = true;
    grp.add(cab);

    const wind = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.64, 0.08), glassMat);
    wind.position.set(0, 1.72, 2.49);
    grp.add(wind);

    const sideWin = new THREE.Mesh(new THREE.BoxGeometry(1.90, 0.56, 0.92), glassMat);
    sideWin.position.set(0, 1.72, 1.76);
    grp.add(sideWin);

    const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.32, 0.24), chassisMat);
    bumper.position.set(0, 0.64, 2.54);
    grp.add(bumper);

    // Tilted rotating mixer drum group
    const drumPivot = new THREE.Group();
    drumPivot.position.set(0, 1.62, -0.62);
    drumPivot.rotation.x = 0.24; // tilts upward toward rear chute

    const drumSpin = new THREE.Group();
    const drumMid = new THREE.Mesh(new THREE.CylinderGeometry(0.86, 0.86, 1.65, 16), drumBaseMat);
    drumMid.rotation.x = Math.PI / 2;
    drumMid.castShadow = true;
    drumSpin.add(drumMid);

    const drumFront = new THREE.Mesh(new THREE.CylinderGeometry(0.86, 0.50, 0.88, 16), drumBaseMat);
    drumFront.rotation.x = Math.PI / 2;
    drumFront.position.z = 1.24;
    drumFront.castShadow = true;
    drumSpin.add(drumFront);

    const drumRear = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.86, 0.95, 16), drumBaseMat);
    drumRear.rotation.x = Math.PI / 2;
    drumRear.position.z = -1.28;
    drumRear.castShadow = true;
    drumSpin.add(drumRear);

    // Diagonal stripe rings & fins on drum so rotation is vividly visible
    for (const [zOff, rRad] of [[-0.52, 0.88], [0.05, 0.88], [0.58, 0.88]]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(rRad, rRad, 0.24, 16), stripeMat);
      band.rotation.x = Math.PI / 2;
      band.position.z = zOff;
      drumSpin.add(band);
    }
    for (let k = 0; k < 4; k++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 1.7), stripeMat);
      const ang = (k / 4) * Math.PI * 2;
      fin.position.set(Math.cos(ang) * 0.88, Math.sin(ang) * 0.88, 0);
      fin.rotation.z = ang;
      drumSpin.add(fin);
    }
    drumPivot.add(drumSpin);
    grp.add(drumPivot);

    // Rear hopper & chute
    const chute = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.28, 0.72), chassisMat);
    chute.position.set(0, 1.48, -2.52);
    chute.rotation.x = -0.45;
    grp.add(chute);

    this._addWheels(grp, [1.65, -0.78, -1.78], 0.94, 0.42, 0.28, wheels);
    const lights = this._addLightsAndBeacon(grp, 0.93, 2.58, -2.58, 0.82, true, [0, 2.34, 1.9]);
    const scale = 1.22;
    grp.scale.setScalar(scale);
    for (const w of wheels) w.radius *= scale;
    return { mesh: grp, wheels, mixerDrum: drumSpin, length: 5.3 * scale, ...lights };
  }

  _buildDumpTruck(spec) {
    const grp = new THREE.Group();
    const wheels = [];
    const cabMat = new THREE.MeshStandardMaterial({ color: spec.cabColor, roughness: 0.45 });
    const bedMat = new THREE.MeshStandardMaterial({ color: spec.bedColor, roughness: 0.62, metalness: 0.2 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.18, metalness: 0.35 });
    const chassisMat = new THREE.MeshStandardMaterial({ color: 0x262c34, roughness: 0.8 });
    const loadMat = new THREE.MeshStandardMaterial({ color: spec.loadColor || 0xb48a54, roughness: 0.96 });

    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.36, 5.1), chassisMat);
    frame.position.set(0, 0.62, 0);
    frame.castShadow = true;
    grp.add(frame);

    // Cab
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.88, 1.54, 1.52), cabMat);
    cab.position.set(0, 1.50, 1.72);
    cab.castShadow = true;
    grp.add(cab);

    const wind = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.64, 0.08), glassMat);
    wind.position.set(0, 1.72, 2.48);
    grp.add(wind);

    const sideWin = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.54, 0.94), glassMat);
    sideWin.position.set(0, 1.72, 1.74);
    grp.add(sideWin);

    // Dump bed + cab protective canopy visor + side ribs
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.96, 1.24, 3.35), bedMat);
    bed.position.set(0, 1.44, -0.82);
    bed.castShadow = true;
    grp.add(bed);

    const visor = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.14, 0.95), bedMat);
    visor.position.set(0, 2.34, 1.26);
    visor.rotation.x = 0.08;
    grp.add(visor);

    for (const rz of [-1.9, -0.8, 0.3]) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(2.04, 1.20, 0.14), bedMat);
      rib.position.set(0, 1.44, rz);
      grp.add(rib);
    }

    // 3D heaped sand/gravel/soil load mound
    const mound = new THREE.Mesh(new THREE.DodecahedronGeometry(0.95, 1), loadMat);
    mound.scale.set(0.96, 0.55, 1.55);
    mound.position.set(0, 2.12, -0.82);
    mound.castShadow = true;
    grp.add(mound);

    this._addWheels(grp, [1.62, -0.75, -1.78], 0.96, 0.43, 0.30, wheels);
    const lights = this._addLightsAndBeacon(grp, 0.94, 2.52, -2.54, 0.84, true, [0, 2.52, 1.45]);
    const scale = 1.22;
    grp.scale.setScalar(scale);
    for (const w of wheels) w.radius *= scale;
    return { mesh: grp, wheels, length: 5.2 * scale, ...lights };
  }

  _buildCraneTruck(spec) {
    const grp = new THREE.Group();
    const wheels = [];
    const cabMat = new THREE.MeshStandardMaterial({ color: spec.cabColor, roughness: 0.42 });
    const boomMat = new THREE.MeshStandardMaterial({ color: spec.boomColor, roughness: 0.4, metalness: 0.2 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.18, metalness: 0.35 });
    const chassisMat = new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: 0.8 });

    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.42, 5.4), chassisMat);
    frame.position.set(0, 0.65, 0);
    frame.castShadow = true;
    grp.add(frame);

    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.90, 1.48, 1.54), cabMat);
    cab.position.set(0, 1.48, 1.88);
    cab.castShadow = true;
    grp.add(cab);

    const wind = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.62, 0.08), glassMat);
    wind.position.set(0, 1.70, 2.65);
    grp.add(wind);

    // Crane turret + angled telescoping boom
    const turret = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.82, 1.38), boomMat);
    turret.position.set(0, 1.28, -1.15);
    turret.castShadow = true;
    grp.add(turret);

    const boom = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.48, 4.35), boomMat);
    boom.position.set(0, 2.28, 0.32);
    boom.rotation.x = -0.24;
    boom.castShadow = true;
    grp.add(boom);

    const boomTip = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 1.45), chassisMat);
    boomTip.position.set(0, 2.86, 2.25);
    boomTip.rotation.x = -0.24;
    grp.add(boomTip);

    this._addWheels(grp, [1.75, -0.78, -1.88], 0.96, 0.43, 0.29, wheels);
    const lights = this._addLightsAndBeacon(grp, 0.95, 2.70, -2.72, 0.84, true, [0, 2.32, 2.02]);
    const scale = 1.24;
    grp.scale.setScalar(scale);
    for (const w of wheels) w.radius *= scale;
    return { mesh: grp, wheels, length: 5.5 * scale, ...lights };
  }

  _buildFlatbedTruck(spec) {
    const grp = new THREE.Group();
    const wheels = [];
    const cabMat = new THREE.MeshStandardMaterial({ color: spec.cabColor, roughness: 0.45 });
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x6b533b, roughness: 0.85 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.18, metalness: 0.35 });
    const chassisMat = new THREE.MeshStandardMaterial({ color: 0x262c34, roughness: 0.8 });

    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.34, 5.25), chassisMat);
    frame.position.set(0, 0.62, 0);
    frame.castShadow = true;
    grp.add(frame);

    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.88, 1.50, 1.46), cabMat);
    cab.position.set(0, 1.48, 1.82);
    cab.castShadow = true;
    grp.add(cab);

    const wind = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.62, 0.08), glassMat);
    wind.position.set(0, 1.70, 2.55);
    grp.add(wind);

    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.16, 3.55), deckMat);
    deck.position.set(0, 0.88, -0.80);
    deck.castShadow = true;
    grp.add(deck);

    // Cargo on flatbed: concrete pipes or orange/steel I-beams
    if (spec.cargoKind === "pipes") {
      const pipeMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.82 });
      for (const [px, py] of [[-0.46, 1.32], [0.46, 1.32], [0, 1.98]]) {
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 3.15, 12), pipeMat);
        pipe.rotation.x = Math.PI / 2;
        pipe.position.set(px, py, -0.82);
        pipe.castShadow = true;
        grp.add(pipe);
      }
    } else {
      const beamMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.5, metalness: 0.45 });
      for (const [px, py] of [[-0.5, 1.18], [0, 1.18], [0.5, 1.18], [-0.25, 1.56], [0.25, 1.56]]) {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.30, 3.25), beamMat);
        beam.position.set(px, py, -0.80);
        beam.castShadow = true;
        grp.add(beam);
      }
    }

    this._addWheels(grp, [1.72, -0.78, -1.82], 0.94, 0.42, 0.28, wheels);
    const lights = this._addLightsAndBeacon(grp, 0.94, 2.60, -2.62, 0.82, true, [0, 2.32, 1.95]);
    const scale = 1.22;
    grp.scale.setScalar(scale);
    for (const w of wheels) w.radius *= scale;
    return { mesh: grp, wheels, length: 5.4 * scale, ...lights };
  }

  _buildContainerTruck(spec) {
    const grp = new THREE.Group();
    const wheels = [];
    const cabMat = new THREE.MeshStandardMaterial({ color: spec.cabColor, roughness: 0.42, metalness: 0.12 });
    const containerMat = new THREE.MeshStandardMaterial({ color: spec.containerColor, roughness: 0.52, metalness: 0.15 });
    const stripeMat = new THREE.MeshStandardMaterial({ color: spec.stripeColor || 0xf8fafc, roughness: 0.45 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.16, metalness: 0.38 });
    const chassisMat = new THREE.MeshStandardMaterial({ color: 0x242931, roughness: 0.8 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xdbe3ec, roughness: 0.25, metalness: 0.8 });

    // Long heavy semi-trailer + tractor frame
    const trailerFrame = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.30, 6.25), chassisMat);
    trailerFrame.position.set(0, 0.96, -1.05);
    trailerFrame.castShadow = true;
    grp.add(trailerFrame);

    const tractorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.34, 3.15), chassisMat);
    tractorFrame.position.set(0, 0.72, 2.65);
    tractorFrame.castShadow = true;
    grp.add(tractorFrame);

    // Heavy flat-nose semi-tractor cab
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.22, 2.02, 1.82), cabMat);
    cab.position.set(0, 1.92, 3.22);
    cab.castShadow = true;
    grp.add(cab);

    // Aerodynamic roof fairing
    const fairing = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.48, 1.40), cabMat);
    fairing.position.set(0, 3.10, 2.98);
    fairing.rotation.x = 0.18;
    fairing.castShadow = true;
    grp.add(fairing);

    const wind = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.76, 0.09), glassMat);
    wind.position.set(0, 2.28, 4.13);
    grp.add(wind);

    const sideWin = new THREE.Mesh(new THREE.BoxGeometry(2.26, 0.64, 1.10), glassMat);
    sideWin.position.set(0, 2.28, 3.26);
    grp.add(sideWin);

    const grille = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.74, 0.10), chromeMat);
    grille.position.set(0, 1.32, 4.14);
    grp.add(grille);

    const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.28, 0.34, 0.24), chassisMat);
    bumper.position.set(0, 0.72, 4.18);
    grp.add(bumper);

    // Twin chrome vertical exhaust stacks behind cab
    for (const sx of [-0.96, 0.96]) {
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 2.35, 8), chromeMat);
      stack.position.set(sx, 2.22, 2.22);
      grp.add(stack);
    }

    // Large corrugated ISO 40ft-style shipping container
    const cW = 2.38;
    const cH = 2.32;
    const cL = 6.18;
    const container = new THREE.Mesh(new THREE.BoxGeometry(cW, cH, cL), containerMat);
    container.position.set(0, 2.28, -1.06);
    container.castShadow = true;
    container.receiveShadow = true;
    grp.add(container);

    // Vertical corrugated ribs along container sides
    for (let rz = -3.75; rz <= 1.65; rz += 0.54) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(cW + 0.08, cH - 0.14, 0.12), containerMat);
      rib.position.set(0, 2.28, rz);
      grp.add(rib);
    }

    // Side logistics stripe & end frame
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(cW + 0.11, 0.38, cL - 0.22), stripeMat);
    stripe.position.set(0, 2.32, -1.06);
    grp.add(stripe);

    const rearDoors = new THREE.Mesh(new THREE.BoxGeometry(cW - 0.16, cH - 0.16, 0.08), chassisMat);
    rearDoors.position.set(0, 2.28, -1.06 - cL * 0.5);
    grp.add(rearDoors);

    // Trailer landing gear struts
    for (const sx of [-0.72, 0.72]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.62, 0.16), chassisMat);
      leg.position.set(sx, 0.56, 0.85);
      grp.add(leg);
    }

    this._addWheels(grp, [3.38, 1.72, -2.35, -3.52], 1.08, 0.49, 0.34, wheels);
    const lights = this._addLightsAndBeacon(grp, 1.10, 4.22, -4.22, 0.92, true, [0, 3.42, 3.15]);
    return { mesh: grp, wheels, length: 8.65, ...lights };
  }

  // Extra-long 5-axle heavy lowboy / oversized cargo semi-trailer (10.4m)
  _buildSuperTrailerTruck(spec) {
    const grp = new THREE.Group();
    const wheels = [];
    const cabMat = new THREE.MeshStandardMaterial({ color: spec.cabColor, roughness: 0.4, metalness: 0.14 });
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.72, metalness: 0.25 });
    const cargoMat = new THREE.MeshStandardMaterial({ color: spec.cargoColor || 0xf59e0b, roughness: 0.48, metalness: 0.22 });
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.45 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.16, metalness: 0.38 });
    const chassisMat = new THREE.MeshStandardMaterial({ color: 0x1e242b, roughness: 0.8 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xdbe3ec, roughness: 0.25, metalness: 0.8 });

    // Sleeper tractor frame & cab at front (+Z)
    const tractorFrame = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.36, 3.55), chassisMat);
    tractorFrame.position.set(0, 0.74, 3.35);
    tractorFrame.castShadow = true;
    grp.add(tractorFrame);

    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.26, 2.08, 2.15), cabMat);
    cab.position.set(0, 1.96, 3.88);
    cab.castShadow = true;
    grp.add(cab);

    const fairing = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.52, 1.55), cabMat);
    fairing.position.set(0, 3.18, 3.65);
    fairing.rotation.x = 0.16;
    grp.add(fairing);

    const wind = new THREE.Mesh(new THREE.BoxGeometry(2.06, 0.76, 0.09), glassMat);
    wind.position.set(0, 2.34, 4.96);
    grp.add(wind);

    const grille = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.76, 0.10), chromeMat);
    grille.position.set(0, 1.36, 4.97);
    grp.add(grille);

    for (const sx of [-0.98, 0.98]) {
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 2.45, 8), chromeMat);
      stack.position.set(sx, 2.28, 2.75);
      grp.add(stack);
    }

    // Extra-long heavy flatbed trailer deck
    const trailerDeck = new THREE.Mesh(new THREE.BoxGeometry(2.40, 0.32, 7.85), deckMat);
    trailerDeck.position.set(0, 1.04, -1.15);
    trailerDeck.castShadow = true;
    trailerDeck.receiveShadow = true;
    grp.add(trailerDeck);

    // Side safety rails with yellow reflectors
    for (const sx of [-1.18, 1.18]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 7.6), stripeMat);
      rail.position.set(sx, 1.14, -1.15);
      grp.add(rail);
    }

    // Oversized industrial transformer / bridge girder cargo
    const mainCrate = new THREE.Mesh(new THREE.BoxGeometry(2.05, 1.65, 4.6), cargoMat);
    mainCrate.position.set(0, 2.02, -0.45);
    mainCrate.castShadow = true;
    grp.add(mainCrate);

    const coolingRibs = new THREE.Mesh(new THREE.BoxGeometry(2.22, 1.15, 3.8), chassisMat);
    coolingRibs.position.set(0, 2.02, -0.45);
    grp.add(coolingRibs);

    const rearGen = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.74, 2.1, 14), chromeMat);
    rearGen.rotation.x = Math.PI / 2;
    rearGen.position.set(0, 1.92, -3.75);
    rearGen.castShadow = true;
    grp.add(rearGen);

    // 5 axles: front steer + twin drive + twin trailer rear axles
    this._addWheels(grp, [4.25, 2.45, 1.35, -2.95, -4.15], 1.10, 0.49, 0.34, wheels);
    const lights = this._addLightsAndBeacon(grp, 1.12, 5.05, -5.08, 0.94, true, [0, 3.52, 3.82]);
    return { mesh: grp, wheels, length: 10.4, ...lights };
  }

  // Heavy flatbed semi-trailer hauling 4 massive gleaming steel coils
  _buildSteelCoilTruck(spec) {
    const grp = new THREE.Group();
    const wheels = [];
    const cabMat = new THREE.MeshStandardMaterial({ color: spec.cabColor, roughness: 0.42, metalness: 0.14 });
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.78 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.25, metalness: 0.88 });
    const coreMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 });
    const strapMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.45 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.16, metalness: 0.38 });
    const chassisMat = new THREE.MeshStandardMaterial({ color: 0x242931, roughness: 0.8 });

    const tractorFrame = new THREE.Mesh(new THREE.BoxGeometry(2.00, 0.34, 3.15), chassisMat);
    tractorFrame.position.set(0, 0.72, 2.75);
    grp.add(tractorFrame);

    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.22, 2.02, 1.82), cabMat);
    cab.position.set(0, 1.92, 3.32);
    cab.castShadow = true;
    grp.add(cab);

    const wind = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.74, 0.09), glassMat);
    wind.position.set(0, 2.26, 4.23);
    grp.add(wind);

    const trailerDeck = new THREE.Mesh(new THREE.BoxGeometry(2.34, 0.30, 6.45), deckMat);
    trailerDeck.position.set(0, 1.02, -1.05);
    trailerDeck.castShadow = true;
    grp.add(trailerDeck);

    // Front steel bulkhead headboard protecting cab from shifting coils
    const headboard = new THREE.Mesh(new THREE.BoxGeometry(2.30, 1.55, 0.18), strapMat);
    headboard.position.set(0, 1.92, 2.08);
    headboard.castShadow = true;
    grp.add(headboard);

    // 4 massive steel coils strapped transversely on timber cradles
    for (const cz of [1.05, -0.35, -1.75, -3.15]) {
      const cradle = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.22, 0.92), chassisMat);
      cradle.position.set(0, 1.24, cz);
      grp.add(cradle);

      const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 1.58, 20), steelMat);
      coil.rotation.z = Math.PI / 2;
      coil.position.set(0, 1.92, cz);
      coil.castShadow = true;
      grp.add(coil);

      // Inner coil bore visible on both ends
      const bore = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 1.62, 12), coreMat);
      bore.rotation.z = Math.PI / 2;
      bore.position.set(0, 1.92, cz);
      grp.add(bore);

      // Steel tie-down strap band
      const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.705, 0.705, 0.14, 20), strapMat);
      strap.rotation.z = Math.PI / 2;
      strap.position.set(0, 1.92, cz);
      grp.add(strap);
    }

    this._addWheels(grp, [3.48, 1.82, -2.35, -3.52], 1.08, 0.49, 0.34, wheels);
    const lights = this._addLightsAndBeacon(grp, 1.10, 4.30, -4.32, 0.92, true, [0, 3.06, 3.25]);
    return { mesh: grp, wheels, length: 8.85, ...lights };
  }

  // Heavy cylindrical hazmat / fuel tanker semi-truck (can explode & catch fire on crash!)
  _buildTankerTruck(spec) {
    const grp = new THREE.Group();
    const wheels = [];
    const cabMat = new THREE.MeshStandardMaterial({ color: spec.cabColor, roughness: 0.4, metalness: 0.15 });
    const tankMat = new THREE.MeshStandardMaterial({ color: spec.tankColor || 0xe2e8f0, roughness: 0.25, metalness: 0.68 });
    const stripeMat = new THREE.MeshStandardMaterial({ color: spec.stripeColor || 0xef4444, roughness: 0.4 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.16, metalness: 0.38 });
    const chassisMat = new THREE.MeshStandardMaterial({ color: 0x242931, roughness: 0.8 });

    const tractorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.34, 3.15), chassisMat);
    tractorFrame.position.set(0, 0.72, 2.65);
    grp.add(tractorFrame);

    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.20, 2.00, 1.80), cabMat);
    cab.position.set(0, 1.90, 3.22);
    cab.castShadow = true;
    grp.add(cab);

    const wind = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.74, 0.09), glassMat);
    wind.position.set(0, 2.24, 4.13);
    grp.add(wind);

    const trailerFrame = new THREE.Mesh(new THREE.BoxGeometry(2.08, 0.28, 6.05), chassisMat);
    trailerFrame.position.set(0, 0.96, -1.05);
    grp.add(trailerFrame);

    // Cylindrical fuel tank + rounded end caps
    const tankBody = new THREE.Mesh(new THREE.CylinderGeometry(1.06, 1.06, 5.25, 22), tankMat);
    tankBody.rotation.x = Math.PI / 2;
    tankBody.position.set(0, 2.12, -1.05);
    tankBody.castShadow = true;
    grp.add(tankBody);

    for (const zCap of [1.57, -3.67]) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(1.06, 18, 12), tankMat);
      cap.scale.set(1, 1, 0.42);
      cap.position.set(0, 2.12, zCap);
      grp.add(cap);
    }

    // Bright hazmat warning bands & top hatches
    for (const bz of [0.6, -1.05, -2.7]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.08, 0.28, 22), stripeMat);
      band.rotation.x = Math.PI / 2;
      band.position.set(0, 2.12, bz);
      grp.add(band);

      const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.18, 12), chassisMat);
      hatch.position.set(0, 3.22, bz);
      grp.add(hatch);
    }

    // Top catwalk guard rails
    for (const sx of [-0.42, 0.42]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 4.8), chassisMat);
      rail.position.set(sx, 3.22, -1.05);
      grp.add(rail);
    }

    this._addWheels(grp, [3.38, 1.72, -2.35, -3.52], 1.08, 0.49, 0.34, wheels);
    const lights = this._addLightsAndBeacon(grp, 1.10, 4.22, -4.22, 0.92, true, [0, 3.04, 3.15]);
    return { mesh: grp, wheels, length: 8.65, ...lights };
  }

  _buildCargoTruck(spec) {
    const grp = new THREE.Group();
    const wheels = [];
    const cabMat = new THREE.MeshStandardMaterial({ color: spec.cabColor, roughness: 0.42 });
    const boxMat = new THREE.MeshStandardMaterial({ color: spec.boxColor, roughness: 0.52 });
    const stripeMat = new THREE.MeshStandardMaterial({ color: spec.stripeColor, roughness: 0.48 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.18, metalness: 0.35 });
    const chassisMat = new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: 0.8 });

    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.30, 4.75), chassisMat);
    frame.position.set(0, 0.55, 0);
    grp.add(frame);

    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.78, 1.42, 1.34), cabMat);
    cab.position.set(0, 1.38, 1.66);
    cab.castShadow = true;
    grp.add(cab);

    const wind = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.60, 0.08), glassMat);
    wind.position.set(0, 1.58, 2.33);
    grp.add(wind);

    const box = new THREE.Mesh(new THREE.BoxGeometry(1.90, 1.76, 3.28), boxMat);
    box.position.set(0, 1.60, -0.72);
    box.castShadow = true;
    grp.add(box);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.32, 3.12), stripeMat);
    stripe.position.set(0, 1.62, -0.72);
    grp.add(stripe);

    this._addWheels(grp, [1.56, -1.35], 0.90, 0.39, 0.25, wheels);
    const lights = this._addLightsAndBeacon(grp, 0.90, 2.36, -2.38, 0.78, false, null);
    return { mesh: grp, wheels, length: 4.9, ...lights };
  }

  _buildSedan(spec) {
    const grp = new THREE.Group();
    const wheels = [];
    const bodyMat = new THREE.MeshStandardMaterial({ color: spec.bodyColor, roughness: 0.32, metalness: 0.22 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.15, metalness: 0.4 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.75 });

    const lower = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.58, 3.45), bodyMat);
    lower.position.set(0, 0.58, 0);
    lower.castShadow = true;
    grp.add(lower);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.40, 0.54, 1.78), bodyMat);
    cabin.position.set(0, 1.08, -0.10);
    cabin.castShadow = true;
    grp.add(cabin);

    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.42, 1.54), glassMat);
    glass.position.set(0, 1.08, -0.10);
    grp.add(glass);

    const grille = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.20, 0.08), darkMat);
    grille.position.set(0, 0.52, 1.73);
    grp.add(grille);

    this._addWheels(grp, [1.05, -1.05], 0.76, 0.30, 0.20, wheels);
    const lights = this._addLightsAndBeacon(grp, 0.76, 1.74, -1.74, 0.62, false, null);
    return { mesh: grp, wheels, length: 3.6, ...lights };
  }

  _buildSuv(spec) {
    const grp = new THREE.Group();
    const wheels = [];
    const bodyMat = new THREE.MeshStandardMaterial({ color: spec.bodyColor, roughness: 0.34, metalness: 0.2 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.15, metalness: 0.4 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x272b33, roughness: 0.75 });

    const lower = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.66, 3.72), bodyMat);
    lower.position.set(0, 0.66, 0);
    lower.castShadow = true;
    grp.add(lower);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.64, 2.38), bodyMat);
    cabin.position.set(0, 1.24, -0.26);
    cabin.castShadow = true;
    grp.add(cabin);

    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.48, 2.12), glassMat);
    glass.position.set(0, 1.24, -0.26);
    grp.add(glass);

    for (const sx of [-0.62, 0.62]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.95), trimMat);
      rail.position.set(sx, 1.60, -0.26);
      grp.add(rail);
    }

    this._addWheels(grp, [1.14, -1.14], 0.80, 0.34, 0.22, wheels);
    const lights = this._addLightsAndBeacon(grp, 0.82, 1.88, -1.88, 0.72, false, null);
    return { mesh: grp, wheels, length: 3.9, ...lights };
  }

  _spawnVehicleFleet(parent) {
    const roster = [
      { kind: "mixer", label: "橙白水泥搅拌车", isTruck: true, isHeavy: true, speed: 10.2, cabColor: 0xf97316, drumColor: 0xf8fafc, stripeColor: 0xf97316 },
      { kind: "container", label: "深海蓝集装箱大货车", isTruck: true, isHeavy: true, speed: 9.6, cabColor: 0x1d4ed8, containerColor: 0x0369a1, stripeColor: 0xf8fafc },
      { kind: "sedan", label: "跃动红家庭轿车", isTruck: false, isHeavy: false, speed: 14.5, bodyColor: 0xdc2626 },
      { kind: "tanker", label: "危险品银红油罐车", isTruck: true, isHeavy: true, isTanker: true, speed: 9.4, cabColor: 0xdc2626, tankColor: 0xe2e8f0, stripeColor: 0xef4444 },
      { kind: "dump", label: "工程黄渣土自卸车", isTruck: true, isHeavy: true, speed: 10.4, cabColor: 0xeab308, bedColor: 0x475569, loadColor: 0xc29b61 },
      { kind: "super_trailer", label: "特长重型半挂大货车", isTruck: true, isHeavy: true, speed: 9.0, cabColor: 0x0f766e, cargoColor: 0xf59e0b },
      { kind: "crane", label: "明黄随车吊工程车", isTruck: true, isHeavy: true, speed: 9.6, cabColor: 0xf59e0b, boomColor: 0xfacc15 },
      { kind: "suv", label: "森林绿家用 SUV", isTruck: false, isHeavy: false, speed: 13.8, bodyColor: 0x15803d },
      { kind: "steel_coil", label: "重型钢卷运输半挂车", isTruck: true, isHeavy: true, speed: 9.3, cabColor: 0x1d4ed8 },
      { kind: "container", label: "远洋红集装箱半挂车", isTruck: true, isHeavy: true, speed: 9.5, cabColor: 0xdc2626, containerColor: 0xb91c1c, stripeColor: 0xfef08a },
      { kind: "sedan", label: "天空蓝家庭轿车", isTruck: false, isHeavy: false, speed: 14.8, bodyColor: 0x0ea5e9 },
      { kind: "mixer", label: "蓝白水泥搅拌车", isTruck: true, isHeavy: true, speed: 10.0, cabColor: 0x2563eb, drumColor: 0xf8fafc, stripeColor: 0x1d4ed8 },
      { kind: "tanker", label: "重型黄标燃料油罐车", isTruck: true, isHeavy: true, isTanker: true, speed: 9.5, cabColor: 0xea580c, tankColor: 0xf1f5f9, stripeColor: 0xf59e0b },
      { kind: "flatbed", label: "水泥管工程平板车", isTruck: true, isHeavy: true, speed: 10.2, cabColor: 0x2563eb, cargoKind: "pipes" },
      { kind: "cargo", label: "绿白冷链运输车", isTruck: true, isHeavy: false, speed: 12.0, cabColor: 0x059669, boxColor: 0xf8fafc, stripeColor: 0x10b981 },
      { kind: "suv", label: "柠檬黄家用 SUV", isTruck: false, isHeavy: false, speed: 13.6, bodyColor: 0xeab308 },
      { kind: "steel_coil", label: "亮橘钢卷半挂重卡", isTruck: true, isHeavy: true, speed: 9.4, cabColor: 0xea580c },
      { kind: "dump", label: "橘红重载自卸车", isTruck: true, isHeavy: true, speed: 10.3, cabColor: 0xea580c, bedColor: 0x334155, loadColor: 0x9ca3af },
      { kind: "sedan", label: "珍珠白家庭轿车", isTruck: false, isHeavy: false, speed: 14.2, bodyColor: 0xf1f5f9 },
      { kind: "super_trailer", label: "特长工程设备运输车", isTruck: true, isHeavy: true, speed: 9.1, cabColor: 0x1e40af, cargoColor: 0x0284c7 },
      { kind: "mixer", label: "绿白水泥搅拌车", isTruck: true, isHeavy: true, speed: 10.1, cabColor: 0x16a34a, drumColor: 0xf8fafc, stripeColor: 0x15803d },
      { kind: "container", label: "翡翠绿集装箱重卡", isTruck: true, isHeavy: true, speed: 9.7, cabColor: 0xf59e0b, containerColor: 0x15803d, stripeColor: 0xf8fafc },
      { kind: "crane", label: "橘红抢修工程吊车", isTruck: true, isHeavy: true, speed: 9.8, cabColor: 0xdc2626, boomColor: 0xf59e0b },
      { kind: "flatbed", label: "工字钢工程平板车", isTruck: true, isHeavy: true, speed: 10.3, cabColor: 0xd97706, cargoKind: "beams" },
      { kind: "cargo", label: "蓝白厢式运输车", isTruck: true, isHeavy: false, speed: 11.8, cabColor: 0x1d4ed8, boxColor: 0xf1f5f9, stripeColor: 0x2563eb },
      { kind: "sedan", label: "银灰家庭轿车", isTruck: false, isHeavy: false, speed: 14.4, bodyColor: 0x94a3b8 },
    ];

    const builders = {
      mixer: (s) => this._buildMixerTruck(s),
      dump: (s) => this._buildDumpTruck(s),
      crane: (s) => this._buildCraneTruck(s),
      flatbed: (s) => this._buildFlatbedTruck(s),
      container: (s) => this._buildContainerTruck(s),
      super_trailer: (s) => this._buildSuperTrailerTruck(s),
      steel_coil: (s) => this._buildSteelCoilTruck(s),
      tanker: (s) => this._buildTankerTruck(s),
      cargo: (s) => this._buildCargoTruck(s),
      sedan: (s) => this._buildSedan(s),
      suv: (s) => this._buildSuv(s),
    };

    const count = roster.length;
    for (let i = 0; i < count; i++) {
      const spec = roster[i];
      const built = builders[spec.kind](spec);
      const sInit = (i / count) * this.loopLen;
      const sample = this.sampleLoop(sInit);
      built.mesh.position.copy(sample.pos);
      built.mesh.rotation.y = Math.atan2(sample.tan.x, sample.tan.z);
      parent.add(built.mesh);

      this.vehicles.push({
        id: i,
        spec,
        kind: spec.kind,
        label: spec.label,
        isTruck: spec.isTruck,
        isHeavy: !!spec.isHeavy,
        isTanker: !!spec.isTanker,
        onFire: false,
        fireTick: 0,
        mesh: built.mesh,
        wheels: built.wheels,
        mixerDrum: built.mixerDrum || null,
        tailMat: built.tailMat,
        beaconMat: built.beaconMat,
        rogueHalo: built.rogueHalo,
        rogueMat: built.rogueMat,
        length: built.length,
        s: sInit,
        speed: spec.speed * 0.65,
        cruiseSpeed: spec.speed,
        state: "driving", // "driving" | "crashing"
        isRogue: false,
        rogueTimer: 0,
        kickedCrossingId: null,
        // Crash & rollover rigid-body state
        vel: new THREE.Vector3(),
        angVel: new THREE.Vector3(),
        crashAge: 0,
        smokeTick: 0,
        bounces: 0,
      });
    }
  }

  // Forward arc distance from sA to sB along the closed loop
  _forwardDist(sA, sB) {
    let d = sB - sA;
    if (d < 0) d += this.loopLen;
    return d;
  }

  // Spawn or convert a rogue gate-runner aimed at the crossing closest to the train (or E6 by default)
  triggerRogueVehicle(train, audio, showToast, isAutomatic = false) {
    if (!this.crossings.length || !this.vehicles.length) return false;

    const trainPos = train ? train.getWorldPosition() : this.crossings[0].pos;
    const trainSpeed = train ? train.speed : 0;

    // Pick best target crossing: prefer one closest to train (or E6 right before S5 if train is far)
    let targetC = this.crossings.find((c) => c.id === "E6") || this.crossings[0];
    let bestScore = Infinity;
    for (const c of this.crossings) {
      const d = Math.hypot(trainPos.x - c.pos.x, trainPos.z - c.pos.z);
      const score = d + (c.id === "E6" ? -18 : 0);
      if (score < bestScore) {
        bestScore = score;
        targetC = c;
      }
    }

    // Prefer an already-driving front vehicle approaching targetC (5.5..56m before crossing, unobstructed ahead!)
    let chosen = null;
    let bestApproach = Infinity;
    for (const v of this.vehicles) {
      if (v.state !== "driving" || v.isRogue) continue;
      for (const dk of ["west", "east"]) {
        const dTo = this._forwardDist(v.s, targetC.centerS[dk]);
        if (dTo >= 5.5 && dTo <= 56 && dTo < bestApproach) {
          // Ensure no other driving car is sitting between this vehicle and the crossing
          const blocked = this.vehicles.some((o) => {
            if (o === v || o.state !== "driving") return false;
            const dOther = this._forwardDist(o.s, targetC.centerS[dk]);
            return dOther >= 2.0 && dOther < dTo;
          });
          if (!blocked) {
            bestApproach = dTo;
            chosen = v;
          }
        }
      }
    }

    // For manual click, if no unobstructed car is right near the crossing, cleanly relocate a distant car to intercept!
    if (!chosen && !isAutomatic) {
      const candidates = this.vehicles.filter((v) => v.state === "driving" && !v.isRogue);
      if (candidates.length > 0) {
        chosen = candidates[Math.floor(Math.random() * candidates.length)];
        // Choose whichever approach lane has NO queued cars right before the crossing
        let dirKey = Math.random() < 0.5 ? "west" : "east";
        for (const dk of [dirKey, dirKey === "west" ? "east" : "west"]) {
          const hasQueue = this.vehicles.some(
            (o) => o !== chosen && o.state === "driving" && this._forwardDist(o.s, targetC.centerS[dk]) < 34
          );
          if (!hasQueue) {
            dirKey = dk;
            break;
          }
        }
        const crossS = targetC.centerS[dirKey];
        // Time intercept nicely if train is moving toward the crossing, else 20m before crossing
        const distTrain = Math.hypot(trainPos.x - targetC.pos.x, trainPos.z - targetC.pos.z);
        const desiredCarDist =
          Math.abs(trainSpeed) > 1.5 && distTrain < 95
            ? Math.max(11, Math.min(34, (distTrain / Math.max(4, Math.abs(trainSpeed))) * (chosen.cruiseSpeed * 1.45)))
            : 18;
        let spawnS = (crossS - desiredCarDist + this.loopLen) % this.loopLen;
        // Nudge slightly if too close to another vehicle
        for (let tries = 0; tries < 5; tries++) {
          const overlap = this.vehicles.some(
            (o) => o !== chosen && o.state === "driving" && Math.min(this._forwardDist(spawnS, o.s), this._forwardDist(o.s, spawnS)) < 7.5
          );
          if (!overlap) break;
          spawnS = (spawnS - 7.5 + this.loopLen) % this.loopLen;
        }
        chosen.s = spawnS;
        const sample = this.sampleLoop(chosen.s);
        chosen.mesh.position.copy(sample.pos);
        chosen.mesh.rotation.set(0, Math.atan2(sample.tan.x, sample.tan.z), 0);
      }
    }

    if (!chosen) return false;

    chosen.isRogue = true;
    chosen.isSimTarget = false;
    chosen.rogueTimer = 18.0;
    chosen.kickedCrossingId = null;
    chosen.speed = Math.max(chosen.speed, chosen.cruiseSpeed * 1.25);
    if (chosen.rogueHalo) chosen.rogueHalo.visible = true;

    if (audio && audio.playCarHorn) {
      audio.playCarHorn(chosen.isTruck);
    }
    if (showToast) {
      showToast(`⚠️ 危险！${chosen.label} 正在强行闯过 ${targetC.label} 栏杆！`, 3400);
    }
    return true;
  }

  // One-click kid-friendly simulation: place train speeding toward E6 + random heavy engineering truck running the barrier!
  triggerCrashSimulation(train, audio, showToast) {
    if (!train || !this.crossings.length || !this.vehicles.length) return null;

    const e6c = this.crossings.find((c) => c.id === "E6") || this.crossings[0];
    const e6Edge = this.track.edges[e6c.id];
    if (!e6Edge) return null;
    this.repairAllBarriers();

    // 1. Pick a random heavy engineering/freight truck kind first for equal variety
    const heavyKinds = ["container", "super_trailer", "steel_coil", "tanker", "mixer", "dump", "crane", "flatbed"];
    const pickedKind = heavyKinds[Math.floor(Math.random() * heavyKinds.length)];
    let pool = this.vehicles.filter((v) => v.isHeavy && v.kind === pickedKind);
    if (!pool.length) pool = this.vehicles.filter((v) => v.isHeavy);
    if (!pool.length) return null;
    const chosen = pool[Math.floor(Math.random() * pool.length)];

    // Reset chosen vehicle cleanly if it was previously crashing
    chosen.state = "driving";
    chosen.mesh.scale.setScalar(1);
    chosen.isRogue = false;
    chosen.isSimTarget = false;

    // Clear any leftover rogue/sim flags on other vehicles
    for (const v of this.vehicles) {
      v.isSimTarget = false;
      if (v !== chosen && v.isRogue) {
        v.isRogue = false;
        if (v.rogueHalo) v.rogueHalo.visible = false;
      }
    }

    // 2. Position train ~36m before E6 crossing at high speed so impact is ~1.8s away
    const simSpeed = Math.max(15.5, Math.min(24.0, (train.maxSpeed || 16.5) * 0.92));
    const headLead = 36.0;
    const crossTrackS = e6Edge.length * 0.5;
    train.placeOnEdge(e6c.id, Math.max(4, crossTrackS - headLead), 1, simSpeed, 1.0);

    const trainImpactDist = Math.max(12.0, headLead - (train.headHalfLen || 2.5));
    const timeToImpact = trainImpactDist / simSpeed;

    // 3. Pick an approach lane at E6 and clear any cars right in front of the crossing on that lane
    const dirKey = Math.random() < 0.5 ? "west" : "east";
    const crossS = e6c.centerS[dirKey];
    const truckSpeed = Math.max(14.5, chosen.cruiseSpeed * 1.6);
    const carDist = Math.max(18.0, Math.min(34.0, truckSpeed * timeToImpact));
    const spawnS = (crossS - carDist + this.loopLen) % this.loopLen;

    for (const other of this.vehicles) {
      if (other === chosen || other.state !== "driving") continue;
      const dBefore = this._forwardDist(other.s, crossS);
      const dAfter = this._forwardDist(crossS, other.s);
      if (dBefore < carDist + 16.0 || dAfter < 10.0) {
        other.s = (crossS + 26.0 + Math.random() * 24.0) % this.loopLen;
        other.speed = other.cruiseSpeed * 0.6;
        const smp = this.sampleLoop(other.s);
        other.mesh.position.copy(smp.pos);
        other.mesh.rotation.set(0, Math.atan2(smp.tan.x, smp.tan.z), 0);
      }
    }

    chosen.s = spawnS;
    chosen.speed = truckSpeed;
    chosen.isRogue = true;
    chosen.isSimTarget = true;
    chosen.rogueTimer = 10.0;
    chosen.kickedCrossingId = null;
    if (chosen.rogueHalo) chosen.rogueHalo.visible = true;

    const sample = this.sampleLoop(chosen.s);
    chosen.mesh.position.copy(sample.pos);
    chosen.mesh.rotation.set(0, Math.atan2(sample.tan.x, sample.tan.z), 0);

    // Pre-close crossing barriers immediately so truck dramatically smashes the closed gate
    e6c.gateActive = true;
    e6c.gateClosed = 0.92;
    e6c.wasActive = true;

    if (audio && audio.playCarHorn) {
      audio.playCarHorn(true);
    }
    if (showToast) {
      showToast(`🚨 模拟开始！高速列车即将与闯栏杆的【${chosen.label}】在道口相撞！`, 3200);
    }
    return { crossing: e6c, vehicle: chosen };
  }

  // Kid-friendly gameplay: blowing the train whistle near a crossing scares rogue drivers into braking!
  tryWhistleWarn(train, showToast) {
    if (!train || train.derailed) return false;
    const trainPos = train.getWorldPosition();
    let stoppedAny = false;
    for (const v of this.vehicles) {
      if (!v.isRogue || v.isSimTarget || v.state !== "driving") continue;
      for (const c of this.crossings) {
        if (trainPos.distanceTo(c.pos) > 85) continue;
        for (const dk of ["west", "east"]) {
          const dToCenter = this._forwardDist(v.s, c.centerS[dk]);
          if (dToCenter > 5.5 && dToCenter < 52.0) {
            v.isRogue = false;
            v.speed = 0;
            if (v.rogueHalo) v.rogueHalo.visible = false;
            stoppedAny = true;
            if (showToast) {
              showToast(`🎺 鸣笛警告成功！${v.label} 听到汽笛急忙刹停，躲过一劫！`, 3200);
            }
            break;
          }
        }
        if (stoppedAny) break;
      }
    }
    return stoppedAny;
  }

  _spawnCrashParticles(impactPos, bodyColor) {
    if (!this._sparkGeo) this._sparkGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
    if (!this._debGeo) this._debGeo = new THREE.BoxGeometry(0.38, 0.24, 0.44);
    if (!this._smokeGeo) this._smokeGeo = new THREE.DodecahedronGeometry(0.55, 0);

    // 1. Bright sparks
    for (let i = 0; i < 14; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0xffb703 : 0xfb8500,
        transparent: true,
        opacity: 1,
      });
      const m = new THREE.Mesh(this._sparkGeo, mat);
      m.position.copy(impactPos).add(new THREE.Vector3(0, 1.0, 0));
      this.root.add(m);
      const ang = Math.random() * Math.PI * 2;
      const spd = 6 + Math.random() * 12;
      this.particles.push({
        mesh: m,
        vel: new THREE.Vector3(Math.cos(ang) * spd, 5 + Math.random() * 8, Math.sin(ang) * spd),
        gravity: -24,
        age: 0,
        maxAge: 0.55 + Math.random() * 0.45,
        kind: "spark",
      });
    }

    // 2. Flying debris chunks
    for (let i = 0; i < 8; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: i % 2 === 0 ? bodyColor : 0x334155,
        roughness: 0.7,
        transparent: true,
        opacity: 1,
      });
      const m = new THREE.Mesh(this._debGeo, mat);
      m.position.copy(impactPos).add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 1.1, (Math.random() - 0.5) * 1.2));
      this.root.add(m);
      const ang = Math.random() * Math.PI * 2;
      const spd = 4 + Math.random() * 9;
      this.particles.push({
        mesh: m,
        vel: new THREE.Vector3(Math.cos(ang) * spd, 6 + Math.random() * 7, Math.sin(ang) * spd),
        rotVel: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10),
        gravity: -24,
        age: 0,
        maxAge: 1.8 + Math.random() * 1.0,
        kind: "debris",
      });
    }

    // 3. Dust / impact smoke puffs
    for (let i = 0; i < 10; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: i < 4 ? 0xd6cfc2 : 0x64748b,
        roughness: 0.95,
        transparent: true,
        opacity: 0.8,
      });
      const m = new THREE.Mesh(this._smokeGeo, mat);
      m.position.copy(impactPos).add(new THREE.Vector3((Math.random() - 0.5) * 1.6, 0.9, (Math.random() - 0.5) * 1.6));
      this.root.add(m);
      this.particles.push({
        mesh: m,
        vel: new THREE.Vector3((Math.random() - 0.5) * 3.5, 2.5 + Math.random() * 3.5, (Math.random() - 0.5) * 3.5),
        gravity: 0.4,
        age: 0,
        maxAge: 1.3 + Math.random() * 0.8,
        kind: "smoke",
      });
    }
  }

  _spawnWreckSmokePuff(pos) {
    if (!this._wreckSmokeGeo) this._wreckSmokeGeo = new THREE.DodecahedronGeometry(0.42, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 1.0,
      transparent: true,
      opacity: 0.65,
    });
    const m = new THREE.Mesh(this._wreckSmokeGeo, mat);
    m.position.set(pos.x + (Math.random() - 0.5) * 0.6, pos.y + 0.65, pos.z + (Math.random() - 0.5) * 0.6);
    this.root.add(m);
    this.particles.push({
      mesh: m,
      vel: new THREE.Vector3((Math.random() - 0.5) * 0.9, 2.4 + Math.random() * 1.4, (Math.random() - 0.5) * 0.9),
      gravity: 0.3,
      age: 0,
      maxAge: 1.4,
      kind: "smoke",
    });
  }

  _spawnTankerExplosion(impactPos) {
    if (!this._fireGeo) this._fireGeo = new THREE.SphereGeometry(1.1, 12, 10);
    if (!this._sparkGeo) this._sparkGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
    if (!this._smokeGeo) this._smokeGeo = new THREE.DodecahedronGeometry(0.55, 0);

    // 1. Expanding fiery blast ball
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: i === 0 ? 0xfef08a : i < 3 ? 0xf97316 : 0xef4444,
        transparent: true,
        opacity: 0.95,
      });
      const fb = new THREE.Mesh(this._fireGeo, mat);
      fb.position.copy(impactPos).add(new THREE.Vector3((Math.random() - 0.5) * 1.4, 1.3 + i * 0.4, (Math.random() - 0.5) * 1.4));
      this.root.add(fb);
      this.particles.push({
        mesh: fb,
        vel: new THREE.Vector3((Math.random() - 0.5) * 2.5, 2.8 + i * 1.2, (Math.random() - 0.5) * 2.5),
        gravity: 0.5,
        age: 0,
        maxAge: 0.75 + i * 0.15,
        kind: "fireball",
      });
    }

    // 2. Blazing flying embers
    for (let i = 0; i < 24; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0xfacc15 : 0xf97316,
        transparent: true,
        opacity: 1,
      });
      const m = new THREE.Mesh(this._sparkGeo, mat);
      m.position.copy(impactPos).add(new THREE.Vector3(0, 1.4, 0));
      this.root.add(m);
      const ang = Math.random() * Math.PI * 2;
      const spd = 8 + Math.random() * 14;
      this.particles.push({
        mesh: m,
        vel: new THREE.Vector3(Math.cos(ang) * spd, 7 + Math.random() * 10, Math.sin(ang) * spd),
        gravity: -22,
        age: 0,
        maxAge: 0.7 + Math.random() * 0.55,
        kind: "spark",
      });
    }

    // 3. Thick black explosion smoke column
    for (let i = 0; i < 14; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: i < 5 ? 0x1f2937 : 0x374151,
        roughness: 1.0,
        transparent: true,
        opacity: 0.85,
      });
      const m = new THREE.Mesh(this._smokeGeo, mat);
      m.position.copy(impactPos).add(new THREE.Vector3((Math.random() - 0.5) * 2.4, 1.2, (Math.random() - 0.5) * 2.4));
      this.root.add(m);
      this.particles.push({
        mesh: m,
        vel: new THREE.Vector3((Math.random() - 0.5) * 4.5, 4.5 + Math.random() * 5.0, (Math.random() - 0.5) * 4.5),
        gravity: 0.6,
        age: 0,
        maxAge: 1.9 + Math.random() * 1.1,
        kind: "smoke",
      });
    }
  }

  _spawnFireFlame(pos) {
    if (!this._flameGeo) this._flameGeo = new THREE.ConeGeometry(0.45, 1.15, 7);
    const mat = new THREE.MeshBasicMaterial({
      color: Math.random() < 0.45 ? 0xfacc15 : Math.random() < 0.7 ? 0xf97316 : 0xef4444,
      transparent: true,
      opacity: 0.88,
    });
    const m = new THREE.Mesh(this._flameGeo, mat);
    m.position.set(pos.x + (Math.random() - 0.5) * 1.5, pos.y + 0.5 + Math.random() * 0.4, pos.z + (Math.random() - 0.5) * 1.5);
    m.rotation.y = Math.random() * Math.PI * 2;
    this.root.add(m);
    this.particles.push({
      mesh: m,
      vel: new THREE.Vector3((Math.random() - 0.5) * 0.8, 2.2 + Math.random() * 1.6, (Math.random() - 0.5) * 0.8),
      gravity: 0.2,
      age: 0,
      maxAge: 0.42 + Math.random() * 0.22,
      kind: "flame",
    });
  }

  repairAllBarriers() {
    for (const c of this.crossings) {
      for (const b of c.barriers) {
        b.broken = false;
        b.brokenAge = 0;
        if (b.breakGroup) b.breakGroup.visible = true;
      }
    }
  }

  _breakBarrier(crossing, barrierIdx, vehicle, audio, showToast) {
    const b = crossing.barriers[barrierIdx];
    if (!b || b.broken) return;

    b.broken = true;
    b.brokenAge = 0;
    if (b.breakGroup) b.breakGroup.visible = false;
    crossing.barrierKick = 1.0;

    // World transform of the snapping point (mid-arm)
    b.pivot.updateMatrixWorld(true);
    const midLocal = new THREE.Vector3(b.dirX * 2.4, 0, 0);
    const worldCenter = midLocal.clone().applyMatrix4(b.pivot.matrixWorld);
    const worldQuat = new THREE.Quaternion();
    b.pivot.getWorldQuaternion(worldQuat);

    // Spawn flying broken striped barrier arm
    const flyingGrp = new THREE.Group();
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.45 });
    const redMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.45 });
    const segLen = 4.35 / 7;
    for (let s = 1; s < 7; s++) {
      const seg = new THREE.Mesh(
        new THREE.BoxGeometry(segLen, 0.13, 0.09),
        s % 2 === 0 ? redMat : whiteMat
      );
      seg.position.x = b.dirX * ((s - 3.5) * segLen);
      seg.castShadow = true;
      flyingGrp.add(seg);
    }
    flyingGrp.position.copy(worldCenter);
    flyingGrp.quaternion.copy(worldQuat);
    this.root.add(flyingGrp);

    const carSample = this.sampleLoop(vehicle.s);
    const carFwd = carSample.tan;
    const latVec = new THREE.Vector3(-carFwd.z, 0, carFwd.x).normalize();
    const latSign = Math.random() < 0.5 ? 1 : -1;
    const spd = Math.max(8, vehicle.speed);

    this.brokenArms.push({
      mesh: flyingGrp,
      vel: new THREE.Vector3(
        carFwd.x * (spd * 0.78 + 4.5) + latVec.x * latSign * (2.5 + Math.random() * 2.5),
        4.8 + Math.random() * 2.5,
        carFwd.z * (spd * 0.78 + 4.5) + latVec.z * latSign * (2.5 + Math.random() * 2.5)
      ),
      angVel: new THREE.Vector3(
        (Math.random() - 0.5) * 8.0,
        (Math.random() - 0.5) * 10.0,
        (Math.random() < 0.5 ? -1 : 1) * (6.5 + Math.random() * 4.5)
      ),
      age: 0,
      maxAge: 7.5,
    });

    this._spawnCrashParticles(worldCenter, 0xdc2626);
    if (audio && audio.playBarrierBreakSound) {
      audio.playBarrierBreakSound();
    }
    if (showToast && !vehicle.isSimTarget) {
      showToast(`💥 咔嚓！${vehicle.label} 把【${crossing.label}】栏杆撞断了！`, 3000);
    }
  }

  _triggerVehicleCrash(v, trainDir, trainSpeed, crossingOrPos, audio, showToast, train = null, hitBody = null) {
    const wasSimTarget = !!v.isSimTarget;
    const isSecondaryHitOnWreck = !!(train && train.derailed);
    v.state = "crashing";
    v.isRogue = false;
    v.isSimTarget = false;
    v.crashAge = 0;
    v.bounces = 0;
    v.smokeTick = 0;
    if (v.rogueHalo) v.rogueHalo.visible = false;
    this.crashCount++;

    if (isSecondaryHitOnWreck) {
      // Vehicle slammed into a derailed locomotive/coach lying across the road!
      const refPos = (hitBody && hitBody.pos) || (crossingOrPos && crossingOrPos.pos) || crossingOrPos || v.mesh.position;
      const carSample = this.sampleLoop(v.s);
      const carFwd = carSample.tan;
      const sideVec = new THREE.Vector3(-carFwd.z, 0, carFwd.x).normalize();
      const sideSign = Math.random() < 0.5 ? 1 : -1;
      const carSpd = Math.max(7.0, v.speed);

      v.vel.set(
        -carFwd.x * (2.8 + carSpd * 0.35) + sideVec.x * sideSign * (4.2 + Math.random() * 2.5),
        (v.isHeavy ? 4.8 : 6.2) + Math.min(3.0, carSpd * 0.18),
        -carFwd.z * (2.8 + carSpd * 0.35) + sideVec.z * sideSign * (4.2 + Math.random() * 2.5)
      );
      v.crashStartYaw = v.mesh.rotation.y;
      v.crashTargetYaw = v.mesh.rotation.y + sideSign * (0.45 + Math.random() * 0.85);
      v.crashTargetRoll = sideSign * (Math.random() < 0.65 ? Math.PI * 0.5 : Math.PI);
      v.crashTargetPitch = (Math.random() - 0.5) * 0.12;
      v.crashRollDur = v.isHeavy ? 0.68 : 0.55;

      if (hitBody && typeof hitBody.unitIndex === "number" && train.applyDerailImpact) {
        train.applyDerailImpact(hitBody.unitIndex, carFwd, v.isHeavy ? 4.5 : 2.2);
      }

      const col = v.spec.cabColor || v.spec.bodyColor || 0xf59e0b;
      const impactPt = v.mesh.position.clone().lerp(refPos, 0.35);
      this._spawnCrashParticles(impactPt, col);

      const didExplode = !!(v.isTanker && Math.random() < 0.72);
      if (didExplode) {
        v.onFire = true;
        v.fireTick = 0;
        this._spawnTankerExplosion(impactPt);
        if (audio && audio.playExplosionSound) {
          audio.playExplosionSound();
        }
        if (showToast) {
          showToast(`🔥💥 轰隆！${v.label} 撞上脱轨列车发生爆炸起火！！`, 4400);
        }
      } else {
        if (audio && audio.playCrashSound) {
          audio.playCrashSound();
        }
        if (showToast) {
          showToast(`💥 二次碰撞！${v.label} 撞上了散落在路上的脱轨列车！`, 3800);
        }
      }
      return;
    }

    // Launch away from the track along train velocity + lateral knock-off onto roadside grass
    const spdMag = Math.max(7.5, Math.abs(trainSpeed));
    const cPos = (crossingOrPos && crossingOrPos.pos) || crossingOrPos || v.mesh.position;
    const rx = v.mesh.position.x - cPos.x;
    const rz = v.mesh.position.z - cPos.z;
    const sideDot = rx * this.uDir.x + rz * this.uDir.z;
    const sideSign = sideDot >= 0 ? 1 : -1;

    const heavyFactor = v.isHeavy ? 0.72 : 1.0;
    v.vel.set(
      (trainDir.x * (4.8 + spdMag * 0.42) + this.uDir.x * sideSign * (7.5 + Math.random() * 3.5)) * heavyFactor,
      (v.isHeavy ? 5.2 : 6.8) + Math.min(3.5, spdMag * 0.16),
      (trainDir.z * (4.8 + spdMag * 0.42) + this.uDir.z * sideSign * (7.5 + Math.random() * 3.5)) * heavyFactor
    );
    v.crashStartYaw = v.mesh.rotation.y;
    v.crashTargetYaw = v.mesh.rotation.y + sideSign * (0.55 + Math.random() * 0.95);
    // Flip cleanly onto side (±90 deg) or upside-down (±180 deg) once, never back upright!
    v.crashTargetRoll = sideSign * (Math.random() < 0.65 ? Math.PI * 0.5 : Math.PI);
    v.crashTargetPitch = (Math.random() - 0.5) * 0.12;
    v.crashRollDur = v.isHeavy ? 0.72 : 0.58;

    const col = v.spec.cabColor || v.spec.bodyColor || 0xf59e0b;
    this._spawnCrashParticles(v.mesh.position, col);

    // Random tanker explosion & fire on impact!
    const didExplode = !!(v.isTanker && Math.random() < 0.72);
    if (didExplode) {
      v.onFire = true;
      v.fireTick = 0;
      this._spawnTankerExplosion(v.mesh.position);
      if (audio && audio.playExplosionSound) {
        audio.playExplosionSound();
      }
    }

    // High-speed impact against a heavy engineering/container truck ALSO derails & tips over the train!
    const derailThresh = (train && train.derailSpeedThreshold) || 11.0;
    const shouldDerail =
      train &&
      !train.derailed &&
      v.isHeavy &&
      (wasSimTarget || Math.abs(trainSpeed) >= derailThresh);

    if (shouldDerail) {
      const hitUnitIndex = hitBody && typeof hitBody.unitIndex === "number" ? hitBody.unitIndex : 0;
      // Full-train flip for simulation, front-section impacts at very high speed, or tanker explosions near front
      const fullTrain = !!(
        wasSimTarget ||
        (hitUnitIndex <= 1 && (Math.abs(trainSpeed) >= 17.5 || didExplode))
      );
      this._spawnCrashParticles(hitBody ? hitBody.pos : train.getWorldPosition(), 0xef4444);
      train.triggerDerailment(v.mesh.position, trainDir, v.label, {
        hitUnitIndex,
        fullTrain,
      });
      if (!didExplode) {
        if (audio && audio.playDerailSound) {
          audio.playDerailSound();
        } else if (audio && audio.playCrashSound) {
          audio.playCrashSound();
        }
      }
      if (showToast) {
        if (didExplode && !fullTrain && hitUnitIndex >= 2) {
          showToast(
            `🔥💥 油罐车爆炸起火！第 ${hitUnitIndex + 1} 节附近车厢脱轨侧翻，前段列车稳在轨上！`,
            5400
          );
        } else if (didExplode) {
          showToast(
            `🔥💥 轰隆！高速撞上【${v.label}】引发爆炸起火，火车脱轨侧翻、车厢脱节！`,
            5400
          );
        } else if (!fullTrain && hitUnitIndex >= 2) {
          showToast(
            `💥 局部碰撞脱轨！【${v.label}】撞击第 ${hitUnitIndex + 1} 节车厢，撞击点附近脱节侧翻，前段仍稳在轨上！`,
            5200
          );
        } else {
          showToast(
            `💥 严重脱轨！高速撞击【${v.label}】，火车头侧翻、车厢脱节！点「🚂 一键复轨」或「🚁 直升机复轨」可恢复`,
            5200
          );
        }
      }
      return;
    }

    if (!didExplode && audio && audio.playCrashSound) {
      audio.playCrashSound();
    }
    if (showToast) {
      if (didExplode) {
        showToast(`🔥💥 危险品事故！${v.label} 被撞击发生爆炸起火！！`, 4400);
      } else {
        showToast(`💥 发生道口碰撞！${v.label} 强行闯栏杆被列车撞翻！`, 4000);
      }
    }
  }

  update(dt, train, audio, showToast) {
    this.animTime += dt;
    if (this.randomRogueCooldown > 0) this.randomRogueCooldown -= dt;

    // 1. Gather live train segments (loco + all coaches) for crossing detection & collision
    const trainBodies = [];
    let locoPos = null;
    let locoForward = new THREE.Vector3(0, 0, 1);
    const trainSpeed = train ? train.speed : 0;

    if (train && train.locoMesh) {
      const isDerailed = !!train.derailed;
      locoPos = train.locoMesh.position;
      locoForward.set(0, 0, 1).applyQuaternion(train.locoMesh.quaternion).setY(0).normalize();
      const locoCenter = isDerailed
        ? new THREE.Vector3(0, 1.4, 0).applyMatrix4(train.locoMesh.matrixWorld)
        : locoPos.clone();
      trainBodies.push({
        unitIndex: 0,
        pos: locoCenter,
        dir: locoForward,
        halfLen: (train.locoLength || 10) * 0.5,
        halfW: isDerailed ? 1.75 : 1.38,
      });
      if (train.coachMeshes && train.coachMetas) {
        for (let i = 0; i < train.coachMeshes.length; i++) {
          const cm = train.coachMeshes[i];
          const meta = train.coachMetas[i];
          const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(cm.quaternion).setY(0).normalize();
          const cCenter = isDerailed
            ? new THREE.Vector3(0, 1.4, 0).applyMatrix4(cm.matrixWorld)
            : cm.position.clone();
          trainBodies.push({
            unitIndex: i + 1,
            pos: cCenter,
            dir,
            halfLen: (meta && meta.halfLen) || 5.8,
            halfW: isDerailed ? 1.75 : 1.32,
          });
        }
      }
    }

    // Velocity direction for look-ahead & crash launch
    const moveDir = locoForward.clone().multiplyScalar(trainSpeed < -0.1 ? -1 : 1);

    // 2. Update all 3 level crossings (train detection, barrier lowering, flashing red lights)
    let anyGateActive = false;
    for (const c of this.crossings) {
      let triggered = false;
      for (const tb of trainBodies) {
        const dist = Math.hypot(tb.pos.x - c.pos.x, tb.pos.z - c.pos.z);
        if (dist < tb.halfLen + 22.0) {
          triggered = true;
          break;
        }
      }
      // Look-ahead along locomotive velocity so barriers close well BEFORE fast trains arrive
      if (!triggered && locoPos && Math.abs(trainSpeed) > 0.4) {
        const lookAhead = Math.min(82, 26 + Math.abs(trainSpeed) * 2.4);
        const dx = c.pos.x - locoPos.x;
        const dz = c.pos.z - locoPos.z;
        const proj = dx * moveDir.x + dz * moveDir.z;
        if (proj > -6 && proj < lookAhead) {
          const perp = Math.abs(dx * -moveDir.z + dz * moveDir.x);
          if (perp < 16.0) {
            triggered = true;
          }
        }
      }

      // Random rogue gate-runner chance when a crossing newly activates
      if (triggered && !c.wasActive && this.randomRogueCooldown <= 0) {
        this.randomRogueCooldown = 22 + Math.random() * 16;
        if (Math.random() < 0.36) {
          this.triggerRogueVehicle(train, audio, showToast, true);
        }
      }
      c.wasActive = triggered;
      c.gateActive = triggered;
      if (triggered) anyGateActive = true;

      // Smoothly animate boom barriers (0 = open raised, 1 = closed horizontal)
      const targetClosed = triggered ? 1 : 0;
      const rate = triggered ? 1.35 : 0.95;
      if (c.gateClosed < targetClosed) {
        c.gateClosed = Math.min(1, c.gateClosed + dt * rate);
      } else if (c.gateClosed > targetClosed) {
        c.gateClosed = Math.max(0, c.gateClosed - dt * rate);
      }
      if (c.barrierKick > 0) {
        c.barrierKick = Math.max(0, c.barrierKick - dt * 2.4);
      }

      const openAngle = Math.PI * 0.46;
      const kickLift = Math.sin(c.barrierKick * Math.PI * 3) * c.barrierKick * 0.38;
      const baseAngle = openAngle * (1 - c.gateClosed) + Math.max(0, kickLift);
      for (const b of c.barriers) {
        if (b.broken) {
          b.brokenAge += dt;
          if (b.brokenAge >= 12.0) {
            b.broken = false;
            b.brokenAge = 0;
            if (b.breakGroup) b.breakGroup.visible = true;
          }
        }
        b.pivot.rotation.z = b.dirX * baseAngle;
      }

      // Alternating flashing red crossing lamps
      const flashOn = c.gateActive || c.gateClosed > 0.08;
      const halfPhase = Math.floor(this.animTime * 4.8) % 2;
      for (const lamp of c.lamps) {
        const lit = flashOn && lamp.phase === halfPhase;
        lamp.mat.emissive.setHex(lit ? 0xff1e1e : 0x000000);
        lamp.mat.emissiveIntensity = lit ? 1.8 : 0.0;
        lamp.mat.color.setHex(lit ? 0xff4444 : 0x5c1111);
      }
    }

    // Subtle crossing bell tick if a crossing is closing/active and train is close to E6
    if (anyGateActive && audio && audio.ctx && !audio.muted) {
      this.bellTimer += dt;
      if (this.bellTimer >= 0.72) {
        this.bellTimer = 0;
        if (locoPos && this.crossings.some((c) => c.gateActive && locoPos.distanceTo(c.pos) < 62)) {
          audio.playCrossingBell();
        }
      }
    } else {
      this.bellTimer = 0;
    }

    // 3. Update vehicles (driving, level-crossing stopping, car-following queuing, rogue rushing, crash rollover)
    const driving = this.vehicles.filter((v) => v.state === "driving");
    driving.sort((a, b) => a.s - b.s);

    for (let idx = 0; idx < driving.length; idx++) {
      const v = driving[idx];
      const ahead = driving[(idx + 1) % driving.length];

      if (v.isRogue) {
        v.rogueTimer -= dt;
        if (v.rogueTimer <= 0) {
          v.isRogue = false;
          if (v.rogueHalo) v.rogueHalo.visible = false;
        }
      }

      let targetSpeed = v.isRogue ? v.cruiseSpeed * 1.55 : v.cruiseSpeed;
      let braking = false;

      // A. Follow vehicle ahead cleanly (rogue vehicles still brake slightly if blocked by a non-wrecked car right in front, unless swerving — keep clean queuing)
      if (ahead && ahead !== v) {
        const gap = this._forwardDist(v.s, ahead.s) - (v.length * 0.5 + ahead.length * 0.5);
        const safeGap = v.isRogue ? 1.8 : 3.0;
        if (gap < safeGap + 9.0) {
          const factor = Math.max(0, (gap - safeGap) / 9.0);
          const cap = Math.min(targetSpeed, ahead.speed + (targetSpeed - ahead.speed) * factor);
          if (gap <= safeGap + 0.5) {
            targetSpeed = 0;
            braking = true;
          } else if (cap < targetSpeed) {
            targetSpeed = Math.max(0, cap);
            if (targetSpeed < v.speed - 0.4) braking = true;
          }
        }
      }

      // B. Level-crossing barrier obedience (normal vehicles stop before STOP line; rogue vehicles smash right through!)
      for (const c of this.crossings) {
        const mustStop = c.gateActive || c.gateClosed > 0.14;
        if (!mustStop) continue;
        for (const dk of ["west", "east"]) {
          const dToStop = this._forwardDist(v.s, c.stopS[dk]);
          const dToCenter = this._forwardDist(v.s, c.centerS[dk]);
          if (v.isRogue) {
            // Smash and break the barrier arm when rogue vehicle blows through it!
            const hitDist = 5.4 + v.length * 0.45;
            if (dToCenter < hitDist && dToCenter > 1.2 && c.gateClosed > 0.35 && v.kickedCrossingId !== c.id) {
              v.kickedCrossingId = c.id;
              const bIdx = dk === "west" ? 0 : 1;
              this._breakBarrier(c, bIdx, v, audio, showToast);
            }
          } else if (dToStop < 24.0 && dToCenter > 5.0 && dToCenter < 34.0 && dToStop >= v.length * 0.5 - 0.8) {
            // Stop neatly before stop line (half vehicle length clearance)
            const effDist = dToStop - v.length * 0.5;
            if (effDist <= 0.4) {
              targetSpeed = 0;
              braking = true;
            } else if (effDist < 18.0) {
              const lim = Math.sqrt(Math.max(0, effDist * 7.5));
              if (lim < targetSpeed) {
                targetSpeed = lim;
                braking = true;
              }
            }
          }
        }
      }

      // B2. If train is derailed across the road, normal cars brake before the wreckage; rogue cars plow ahead!
      if (!v.isRogue && train && train.derailed && trainBodies.length > 0) {
        const curSmp = this.sampleLoop(v.s);
        const fwd = curSmp.tan;
        for (const tb of trainBodies) {
          const dx = tb.pos.x - v.mesh.position.x;
          const dz = tb.pos.z - v.mesh.position.z;
          const proj = dx * fwd.x + dz * fwd.z;
          const lat = Math.abs(dx * -fwd.z + dz * fwd.x);
          const stopDist = proj - v.length * 0.5 - Math.max(tb.halfW, 2.0);
          if (proj > 0 && stopDist < 16.0 && lat < tb.halfLen + 1.8) {
            if (stopDist <= 1.2) {
              targetSpeed = 0;
              braking = true;
            } else {
              const lim = Math.sqrt(Math.max(0, stopDist * 7.5));
              if (lim < targetSpeed) {
                targetSpeed = lim;
                braking = true;
              }
            }
          }
        }
      }

      // Smooth acceleration / braking
      if (v.speed < targetSpeed) {
        v.speed = Math.min(targetSpeed, v.speed + dt * (v.isRogue ? 12.0 : 6.8));
      } else {
        v.speed = Math.max(targetSpeed, v.speed - dt * 15.0);
        if (v.speed - targetSpeed > 0.5) braking = true;
      }

      v.s = (v.s + v.speed * dt) % this.loopLen;
      const sample = this.sampleLoop(v.s);
      v.mesh.position.copy(sample.pos);
      v.mesh.rotation.set(0, Math.atan2(sample.tan.x, sample.tan.z), 0);

      // Spin wheels, rotate cement mixer drum, pulse beacons & brake lights
      for (const w of v.wheels) {
        w.mesh.rotation.x += (v.speed * dt) / w.radius;
      }
      if (v.mixerDrum) {
        v.mixerDrum.rotation.z += dt * (1.2 + v.speed * 0.12);
      }
      if (v.beaconMat) {
        const pulse = 0.5 + 0.5 * Math.sin(this.animTime * 9.0 + v.id * 1.7);
        v.beaconMat.emissiveIntensity = 0.25 + pulse * 1.3;
      }
      if (v.tailMat) {
        const brakeOn = braking || v.speed < 0.25;
        v.tailMat.emissive.setHex(brakeOn ? 0xff1111 : 0x550000);
        v.tailMat.emissiveIntensity = brakeOn ? 1.5 : 0.25;
      }
      if (v.rogueHalo && v.isRogue) {
        const p = 0.5 + 0.5 * Math.sin(this.animTime * 16.0);
        v.rogueHalo.scale.setScalar(0.92 + p * 0.22);
        v.rogueMat.color.setHex(p > 0.5 ? 0xff1e1e : 0xfacc15);
        v.rogueMat.emissive.setHex(p > 0.5 ? 0xff0000 : 0xffaa00);
      }

      // C. Check 3D collision with ANY train vehicle (near a crossing OR anywhere against derailed train cars!)
      let nearCrossing = null;
      for (const c of this.crossings) {
        if (Math.hypot(v.mesh.position.x - c.pos.x, v.mesh.position.z - c.pos.z) < 7.5 + v.length * 0.3) {
          nearCrossing = c;
          break;
        }
      }
      const checkTrainCollision = (nearCrossing || (train && train.derailed)) && trainBodies.length > 0;
      if (checkTrainCollision) {
        for (const tb of trainBodies) {
          const dx = v.mesh.position.x - tb.pos.x;
          const dz = v.mesh.position.z - tb.pos.z;
          const along = Math.abs(dx * tb.dir.x + dz * tb.dir.z);
          const across = Math.abs(dx * -tb.dir.z + dz * tb.dir.x);
          const hitAlong = tb.halfLen + v.length * 0.36;
          const hitAcross = tb.halfW + Math.max(1.05, v.length * 0.22);
          if (along < hitAlong && across < hitAcross) {
            this._triggerVehicleCrash(v, moveDir, trainSpeed, nearCrossing || tb.pos, audio, showToast, train, tb);
            break;
          }
        }
      }
    }

    // 4. Update crashing / overturned vehicles (single realistic rollover, stays overturned on ground)
    for (const v of this.vehicles) {
      if (v.state !== "crashing") continue;
      v.crashAge += dt;

      // Rigid-body flight & single controlled rollover to target side/upside-down pose
      v.vel.y -= 24.0 * dt;
      v.mesh.position.addScaledVector(v.vel, dt);

      const u = Math.min(1, v.crashAge / (v.crashRollDur || 0.65));
      const ease = 1 - (1 - u) * (1 - u);
      v.mesh.rotation.order = "YXZ";
      v.mesh.rotation.y = (v.crashStartYaw || 0) + ((v.crashTargetYaw || 0) - (v.crashStartYaw || 0)) * ease;
      v.mesh.rotation.z = (v.crashTargetRoll || Math.PI * 0.5) * ease;
      v.mesh.rotation.x = (v.crashTargetPitch || 0) * ease;

      // Ground contact & heavy thud settle (never rebounds into extra flips or rolls back upright!)
      const isSidePose = Math.abs(Math.abs(v.crashTargetRoll || 0) - Math.PI * 0.5) < 0.35;
      const groundFloor = v.isHeavy ? (isSidePose ? 0.98 : 1.45) : (isSidePose ? 0.72 : 1.05);
      if (v.mesh.position.y <= groundFloor) {
        v.mesh.position.y = groundFloor;
        if (v.bounces === 0 && Math.abs(v.vel.y) > 2.2) {
          v.vel.y = -v.vel.y * 0.22;
          v.vel.x *= 0.55;
          v.vel.z *= 0.55;
          v.bounces++;
        } else {
          v.vel.set(v.vel.x * Math.max(0, 1 - dt * 6.5), 0, v.vel.z * Math.max(0, 1 - dt * 6.5));
        }
      }

      // Rising hood smoke, burning tanker flames & flashing hazard lights while wrecked
      v.smokeTick += dt;
      if (v.crashAge < 8.4 && v.smokeTick >= (v.onFire ? 0.14 : 0.26)) {
        v.smokeTick = 0;
        this._spawnWreckSmokePuff(v.mesh.position);
      }
      if (v.onFire && v.crashAge < 8.4) {
        v.fireTick = (v.fireTick || 0) + dt;
        if (v.fireTick >= 0.08) {
          v.fireTick = 0;
          this._spawnFireFlame(v.mesh.position);
        }
      }
      if (v.tailMat) {
        const blink = Math.floor(this.animTime * 6) % 2 === 0;
        v.tailMat.emissive.setHex(blink ? 0xff3300 : 0x220000);
        v.tailMat.emissiveIntensity = blink ? 1.6 : 0.1;
      }

      // Fade/shrink away and respawn cleanly into traffic after 9.2 seconds
      if (v.crashAge > 8.6) {
        const shrink = Math.max(0.01, 1 - (v.crashAge - 8.6) / 0.8);
        v.mesh.scale.setScalar(shrink);
      }
      if (v.crashAge >= 9.4) {
        v.state = "driving";
        v.isRogue = false;
        v.onFire = false;
        v.speed = v.cruiseSpeed * 0.5;
        v.mesh.scale.setScalar(1);
        // Respawn cleanly near West Roundabout entry
        let respawnS = (this.loopLen * 0.48 + Math.random() * 40) % this.loopLen;
        const sample = this.sampleLoop(respawnS);
        v.s = respawnS;
        v.mesh.position.copy(sample.pos);
        v.mesh.rotation.set(0, Math.atan2(sample.tan.x, sample.tan.z), 0);
      }
    }

    // 5. Update crash sparks, debris & smoke particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age >= p.maxAge) {
        this.root.remove(p.mesh);
        p.mesh.material.dispose();
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y += p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.kind === "debris" && p.mesh.position.y < 0.15) {
        p.mesh.position.y = 0.15;
        p.vel.y = -p.vel.y * 0.35;
        p.vel.x *= 0.6;
        p.vel.z *= 0.6;
      }
      if (p.rotVel) {
        p.mesh.rotation.x += p.rotVel.x * dt;
        p.mesh.rotation.y += p.rotVel.y * dt;
        p.mesh.rotation.z += p.rotVel.z * dt;
      }
      const life = 1 - p.age / p.maxAge;
      if (p.kind === "smoke") {
        p.mesh.scale.setScalar(1 + (1 - life) * 2.2);
        p.mesh.material.opacity = life * 0.62;
      } else if (p.kind === "fireball") {
        p.mesh.scale.setScalar(1 + (1 - life) * 4.4);
        p.mesh.material.opacity = Math.max(0, life * 0.95);
      } else if (p.kind === "flame") {
        p.mesh.scale.setScalar(0.8 + (1 - life) * 0.9);
        p.mesh.material.opacity = Math.max(0, life * 0.9);
      } else {
        p.mesh.material.opacity = Math.min(1, life * 1.4);
      }
    }

    // 6. Update flying broken barrier arms
    for (let i = this.brokenArms.length - 1; i >= 0; i--) {
      const ba = this.brokenArms[i];
      ba.age += dt;
      if (ba.age >= ba.maxAge) {
        this.root.remove(ba.mesh);
        this.brokenArms.splice(i, 1);
        continue;
      }
      ba.vel.y -= 24.0 * dt;
      ba.mesh.position.addScaledVector(ba.vel, dt);
      ba.mesh.rotation.x += ba.angVel.x * dt;
      ba.mesh.rotation.y += ba.angVel.y * dt;
      ba.mesh.rotation.z += ba.angVel.z * dt;
      if (ba.mesh.position.y < 0.16) {
        ba.mesh.position.y = 0.16;
        if (Math.abs(ba.vel.y) > 1.5) {
          ba.vel.y = -ba.vel.y * 0.35;
          ba.vel.x *= 0.62;
          ba.vel.z *= 0.62;
          ba.angVel.multiplyScalar(0.55);
        } else {
          ba.vel.set(ba.vel.x * Math.max(0, 1 - dt * 5), 0, ba.vel.z * Math.max(0, 1 - dt * 5));
          ba.angVel.multiplyScalar(Math.max(0, 1 - dt * 6));
        }
      }
      if (ba.age > ba.maxAge - 0.8) {
        const s = Math.max(0.01, (ba.maxAge - ba.age) / 0.8);
        ba.mesh.scale.setScalar(s);
      }
    }
  }
}

window.HighwayTrafficSystem = HighwayTrafficSystem;
