// Lush Sodor Toy Diorama Scenery (Terrain, Coastal Cove, Viaduct, Tunnel, Station, Windmill, Shed, Trees)
class SodorScenery {
  constructor(trackNetwork, highwaySystem = null) {
    this.track = trackNetwork;
    this.highway = highwaySystem;
    this.windmillBlades = null;
    this.waterMesh = null;
    this.waterBaseY = -0.45;
    this.animTime = 0;
  }

  build(scene) {
    const group = new THREE.Group();

    this.buildDioramaTableAndGround(group);
    this.buildCoastalWater(group);
    this.buildViaductPiers(group);
    this.buildKnapfordStation(group);
    this.buildTunnelAndHill(group);
    this.buildWindmill(group);
    this.buildTidmouthShed(group);
    if (!this.highway) {
      this.buildLevelCrossing(group);
    }
    this.buildHarborAndQuarry(group);
    this.buildTreesAndRocks(group);

    scene.add(group);
    return group;
  }

  // Helper: fast grid-accelerated minimum distance from (x, z) to sampled track
  minDistToTrack(x, z) {
    if (!this._trackGrid) {
      const cell = 12;
      const grid = new Map();
      for (const edge of this.track.edgeList) {
        for (let i = 0; i < edge.points.length; i += 2) {
          const p = edge.points[i];
          const gx = Math.floor(p.x / cell);
          const gz = Math.floor(p.z / cell);
          const key = `${gx},${gz}`;
          let arr = grid.get(key);
          if (!arr) {
            arr = [];
            grid.set(key, arr);
          }
          arr.push(p);
        }
      }
      this._trackGrid = { cell, grid };
    }

    const { cell, grid } = this._trackGrid;
    const cx = Math.floor(x / cell);
    const cz = Math.floor(z / cell);
    let minD2 = Infinity;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        const arr = grid.get(`${cx + dx},${cz + dz}`);
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const p = arr[i];
          const ddx = x - p.x;
          const ddz = z - p.z;
          const d2 = ddx * ddx + ddz * ddz;
          if (d2 < minD2) minD2 = d2;
        }
      }
    }
    return Math.sqrt(minD2);
  }

  buildDioramaTableAndGround(parent) {
    const S = this.track.mapScale || 5.0;
    const tableW = 216 * S; // 1080 at 5x
    const tableD = 152 * S; // 760 at 5x
    const grassW = 214 * S; // 1070 at 5x
    const grassD = 150 * S; // 750 at 5x
    const rimThick = 5.0;

    // Rich dark oak toy-table frame underneath (top face at y = -2.35 so coastal cove & water sit cleanly above)
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x4b2e19, roughness: 0.78 });
    const baseBox = new THREE.Mesh(new THREE.BoxGeometry(tableW, 6.0, tableD), woodMat);
    baseBox.position.set(0, -5.35, 0);
    baseBox.receiveShadow = true;
    parent.add(baseBox);

    // Raised wooden rim around diorama edge
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x623b20, roughness: 0.65 });
    const rimConfigs = [
      [tableW + rimThick * 2, 5.2, rimThick, 0, -2.0, tableD * 0.5 + rimThick * 0.45],
      [tableW + rimThick * 2, 5.2, rimThick, 0, -2.0, -tableD * 0.5 - rimThick * 0.45],
      [rimThick, 5.2, tableD, tableW * 0.5 + rimThick * 0.45, -2.0, 0],
      [rimThick, 5.2, tableD, -tableW * 0.5 - rimThick * 0.45, -2.0, 0],
    ];
    for (const [w, h, d, x, y, z] of rimConfigs) {
      const rim = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), rimMat);
      rim.position.set(x, y, z);
      rim.castShadow = true;
      rim.receiveShadow = true;
      parent.add(rim);
    }

    // Main grassy ground (leaving coastal cove depression on East side)
    const grassGeo = new THREE.PlaneGeometry(grassW, grassD, 260, 180);
    grassGeo.rotateX(-Math.PI / 2);
    const posAttr = grassGeo.attributes.position;
    const colors = [];

    const cMeadow = new THREE.Color(0x5fa846);
    const cLush = new THREE.Color(0x4b9138);
    const cSand = new THREE.Color(0xd8c38a);

    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);

      // Coastal cove basin on the East side underneath the viaduct (center around x=59*S, z=-4*S)
      const coveDx = (x - 59 * S) / (18 * S);
      const coveDz = (z + 4 * S) / (26 * S);
      const coveDist = Math.sqrt(coveDx * coveDx + coveDz * coveDz);

      let y = 0;
      if (coveDist < 1.15) {
        const depth = Math.cos((Math.min(1, coveDist / 1.15) * Math.PI) / 2);
        y = -2.2 * depth;
      }

      // Gentle upward meadow undulations (wide flat corridor around all tracks & highway so ballast/asphalt never bury)
      const trackD = this.minDistToTrack(x, z);
      const roadD = this.highway ? this.highway.minDistToRoad(x, z) : Infinity;
      const clearD = Math.min(trackD, roadD + 3.0);
      if (clearD > 9.5 && coveDist >= 1.18) {
        const ramp = Math.min(1, (clearD - 9.5) / 8.0);
        y += Math.max(0, Math.sin(x * 0.032) * Math.cos(z * 0.038)) * 1.15 * ramp;
      }
      posAttr.setY(i, y);

      // Vertex color blending (sandy shore near cove water, rich grass elsewhere)
      const col = new THREE.Color();
      if (coveDist < 1.12 && y < -0.15) {
        col.copy(cSand);
      } else {
        const blend = 0.5 + 0.5 * Math.sin(x * 0.03 + z * 0.025);
        col.copy(cMeadow).lerp(cLush, blend);
      }
      colors.push(col.r, col.g, col.b);
    }

    grassGeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    grassGeo.computeVertexNormals();

    const grassMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.0,
    });
    const grassMesh = new THREE.Mesh(grassGeo, grassMat);
    grassMesh.receiveShadow = true;
    parent.add(grassMesh);
  }

  buildCoastalWater(parent) {
    const S = this.track.mapScale || 3.0;
    const waterGeo = new THREE.PlaneGeometry(38 * S, 56 * S, 36, 48);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x2b8ec4,
      emissive: 0x0b3654,
      emissiveIntensity: 0.35,
      roughness: 0.18,
      metalness: 0.2,
      transparent: true,
      opacity: 0.88,
    });
    this.waterMesh = new THREE.Mesh(waterGeo, waterMat);
    this.waterMesh.position.set(58 * S, this.waterBaseY, -4 * S);
    this.waterMesh.receiveShadow = true;
    parent.add(this.waterMesh);

    // Cute red/white wooden toy sailboat in the cove (scaled gently for larger bay)
    const boat = new THREE.Group();
    boat.position.set(54 * S, this.waterBaseY + 0.3, 4 * S);
    boat.scale.setScalar(1.8);
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.5, 2.8),
      new THREE.MeshStandardMaterial({ color: 0xc93b2b, roughness: 0.6 })
    );
    hull.castShadow = true;
    boat.add(hull);
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.08, 2.5, 8),
      new THREE.MeshStandardMaterial({ color: 0x7c4a26 })
    );
    mast.position.y = 1.4;
    boat.add(mast);
    const sail = new THREE.Mesh(
      new THREE.ConeGeometry(1.0, 2.0, 3),
      new THREE.MeshStandardMaterial({ color: 0xfefdf7, roughness: 0.7 })
    );
    sail.position.set(0.2, 1.5, 0);
    sail.rotation.y = Math.PI / 2;
    sail.castShadow = true;
    boat.add(sail);
    parent.add(boat);
    this.boat = boat;
  }

  buildViaductPiers(parent) {
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0xb7aa96, roughness: 0.88 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x928574, roughness: 0.85 });

    const viaductEdges = ["E1", "E2", "E3", "E_N1", "E_N2", "MNT2", "W_NW", "W_WEST"];
    for (const eid of viaductEdges) {
      const edge = this.track.edges[eid];
      const steps = Math.max(4, Math.floor(edge.length / 9.5));

      // Continuous wide stone deck under elevated rails (5.0m supports +-2.02m catenary poles & switch stands)
      for (let i = 0; i < edge.samples; i += 4) {
        const s1 = (i / edge.samples) * edge.length;
        const s2 = (Math.min(edge.samples, i + 4) / edge.samples) * edge.length;
        const a = this.track.sampleEdge(eid, s1);
        const b = this.track.sampleEdge(eid, s2);
        if (a.pos.y < 0.14 && b.pos.y < 0.14) continue;

        const mid = a.pos.clone().lerp(b.pos, 0.5);
        const segLen = a.pos.distanceTo(b.pos) + 0.35;
        const deck = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.48, segLen), trimMat);
        deck.position.set(mid.x, mid.y - 0.24, mid.z);
        deck.lookAt(b.pos.x, b.pos.y - 0.24, b.pos.z);
        deck.castShadow = true;
        deck.receiveShadow = true;
        parent.add(deck);
      }

      // Vertical stone piers + wide pier caps down to ground/waterbed
      for (let k = 1; k < steps; k++) {
        const s = (k / steps) * edge.length;
        const { pos, tangent } = this.track.sampleEdge(eid, s);
        if (pos.y < 0.45) continue;

        const yaw = Math.atan2(tangent.x, tangent.z);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.55, 2.0), trimMat);
        cap.position.set(pos.x, pos.y - 0.62, pos.z);
        cap.rotation.y = yaw;
        cap.castShadow = true;
        cap.receiveShadow = true;
        parent.add(cap);

        const pierH = pos.y + 2.4;
        const pier = new THREE.Mesh(new THREE.BoxGeometry(3.2, pierH, 1.6), stoneMat);
        pier.position.set(pos.x, pos.y - 0.4 - pierH / 2, pos.z);
        pier.rotation.y = yaw;
        pier.castShadow = true;
        pier.receiveShadow = true;
        parent.add(pier);
      }
    }

    // Solid elevated stone junction apron & pier beneath S8 (Q1) turnout
    const q1 = this.track.nodes.Q1;
    if (q1 && q1.pos.y > 0.5) {
      const apron = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.8, 0.52, 12), trimMat);
      apron.position.set(q1.pos.x, q1.pos.y - 0.26, q1.pos.z);
      apron.castShadow = true;
      apron.receiveShadow = true;
      parent.add(apron);

      const q1PierH = q1.pos.y + 2.4;
      const q1Pier = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 3.0, q1PierH, 12), stoneMat);
      q1Pier.position.set(q1.pos.x, q1.pos.y - 0.4 - q1PierH / 2, q1.pos.z);
      q1Pier.castShadow = true;
      q1Pier.receiveShadow = true;
      parent.add(q1Pier);
    }
  }

  buildKnapfordStation(parent) {
    const S = this.track.mapScale || 3.0;
    const grp = new THREE.Group();
    grp.position.set(-5 * S, 0, 38 * S);

    const platformMat = new THREE.MeshStandardMaterial({ color: 0xc2b9a7, roughness: 0.85 });
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0xeae4d3, roughness: 0.7 });
    const brickMat = new THREE.MeshStandardMaterial({ color: 0xa64438, roughness: 0.82 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x3b4958, roughness: 0.65 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x5d3b22, roughness: 0.75 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x99d6ea,
      transparent: true,
      opacity: 0.45,
      roughness: 0.15,
    });

    // Main South Platform (extended along E0 to welcome long 8~16 car trains; anchored down to y=-0.6)
    const platS = new THREE.Mesh(new THREE.BoxGeometry(66, 1.35, 4.8), platformMat);
    platS.position.set(0, 0.075, 4.2);
    platS.receiveShadow = true;
    platS.castShadow = true;
    grp.add(platS);

    const platEdgeS = new THREE.Mesh(new THREE.BoxGeometry(66, 0.1, 0.25), edgeMat);
    platEdgeS.position.set(0, 0.76, 1.9);
    grp.add(platEdgeS);

    // North Canopy Platform (z = -3.4; anchored down to y=-0.6)
    const platN = new THREE.Mesh(new THREE.BoxGeometry(58, 1.35, 3.0), platformMat);
    platN.position.set(0, 0.075, -3.5);
    platN.receiveShadow = true;
    platN.castShadow = true;
    grp.add(platN);

    // Station Brick Building on South Platform
    const hall = new THREE.Mesh(new THREE.BoxGeometry(32, 4.2, 3.8), brickMat);
    hall.position.set(0, 2.85, 5.4);
    hall.castShadow = true;
    hall.receiveShadow = true;
    grp.add(hall);

    // Clean pitched gable roof (two angled slopes)
    const roofSlopeFront = new THREE.Mesh(new THREE.BoxGeometry(33.2, 0.28, 2.6), roofMat);
    roofSlopeFront.position.set(0, 5.5, 4.45);
    roofSlopeFront.rotation.x = 0.48;
    roofSlopeFront.castShadow = true;
    grp.add(roofSlopeFront);

    const roofSlopeBack = new THREE.Mesh(new THREE.BoxGeometry(33.2, 0.28, 2.6), roofMat);
    roofSlopeBack.position.set(0, 5.5, 6.35);
    roofSlopeBack.rotation.x = -0.48;
    roofSlopeBack.castShadow = true;
    grp.add(roofSlopeBack);

    // Glass Canopy over tracks
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(54, 0.16, 8.0), glassMat);
    canopy.position.set(0, 4.75, 0.2);
    grp.add(canopy);

    // Canopy support pillars
    for (let px = -24; px <= 24; px += 6.0) {
      for (const pz of [-3.3, 3.0]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 4.1, 8), woodMat);
        post.position.set(px, 2.7, pz);
        post.castShadow = true;
        grp.add(post);
      }
    }

    // Station Signboard ("KNAPFORD")
    const signCanvas = document.createElement("canvas");
    signCanvas.width = 256;
    signCanvas.height = 64;
    const ctx = signCanvas.getContext("2d");
    ctx.fillStyle = "#164e36";
    ctx.fillRect(0, 0, 256, 64);
    ctx.strokeStyle = "#f2d16b";
    ctx.lineWidth = 5;
    ctx.strokeRect(4, 4, 248, 56);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 28px Georgia, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("KNAPFORD 纳普福特站", 128, 34);

    const signMat = new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(signCanvas) });
    const signBoard = new THREE.Mesh(new THREE.BoxGeometry(9.6, 1.5, 0.22), signMat);
    signBoard.position.set(0, 4.2, 3.4);
    grp.add(signBoard);

    parent.add(grp);
  }

  buildTunnelAndHill(parent) {
    // Tunnel aligned cleanly on E4 midpoint
    const e4 = this.track.edges.E4;
    const midSample = this.track.sampleEdge("E4", e4.length * 0.5);
    const grp = new THREE.Group();
    grp.position.copy(midSample.pos);
    grp.rotation.y = Math.atan2(-midSample.tangent.z, midSample.tangent.x);

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x7e7a72, roughness: 0.9 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e2024, roughness: 0.95 });
    const hillMat = new THREE.MeshStandardMaterial({ color: 0x4b8f3a, roughness: 0.92 });

    const tunnelLen = 46;
    const innerHalfW = 2.55;
    const wallThick = 1.6;
    const outerHalfW = innerHalfW + wallThick; // 4.15
    const wallH = 4.05;

    // Left & Right interior tunnel walls + dark ceiling so train rides cleanly inside!
    const wallN = new THREE.Mesh(new THREE.BoxGeometry(tunnelLen, wallH, wallThick), stoneMat);
    wallN.position.set(0, wallH / 2, -innerHalfW - wallThick * 0.5);
    wallN.castShadow = true;
    wallN.receiveShadow = true;
    grp.add(wallN);

    const wallS = new THREE.Mesh(new THREE.BoxGeometry(tunnelLen, wallH, wallThick), stoneMat);
    wallS.position.set(0, wallH / 2, innerHalfW + wallThick * 0.5);
    wallS.castShadow = true;
    wallS.receiveShadow = true;
    grp.add(wallS);

    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(tunnelLen, 1.2, outerHalfW * 2), darkMat);
    ceiling.position.set(0, wallH + 0.6, 0);
    ceiling.castShadow = true;
    grp.add(ceiling);

    // East & West Stone Portals + wing buttresses
    for (const px of [-tunnelLen / 2, tunnelLen / 2]) {
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.8, outerHalfW * 2 + 1.6), stoneMat);
      lintel.position.set(px, wallH + 0.5, 0);
      lintel.castShadow = true;
      grp.add(lintel);
      for (const sgn of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(1.8, wallH + 0.2, 1.8), stoneMat);
        wing.position.set(px, (wallH + 0.2) / 2, sgn * (outerHalfW + 0.4));
        wing.castShadow = true;
        grp.add(wing);
      }
    }

    // Lush Grassy Hill mounds flanking & covering the tunnel (strictly outside inner bore ±2.55 & ceiling 4.05)
    const capHill = new THREE.Mesh(new THREE.SphereGeometry(22.5, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), hillMat);
    capHill.scale.set(1.0, 0.54, 0.68);
    capHill.position.set(0, wallH + 0.9, 0);
    capHill.castShadow = true;
    capHill.receiveShadow = true;
    grp.add(capHill);

    // Side hill Z extents: 19 * 0.66 = 12.54 -> placed at ±16.45 so inner edge stays at ±3.91 (inside stone wall, clear of ±2.55 bore)
    const sideHillN = new THREE.Mesh(new THREE.SphereGeometry(19, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), hillMat);
    sideHillN.scale.set(1.12, 0.72, 0.66);
    sideHillN.position.set(0, 0, -16.45);
    sideHillN.castShadow = true;
    sideHillN.receiveShadow = true;
    grp.add(sideHillN);

    const sideHillS = new THREE.Mesh(new THREE.SphereGeometry(19, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), hillMat);
    sideHillS.scale.set(1.12, 0.68, 0.66);
    sideHillS.position.set(0, 0, 16.45);
    sideHillS.castShadow = true;
    sideHillS.receiveShadow = true;
    grp.add(sideHillS);

    parent.add(grp);
  }

  buildWindmill(parent) {
    const S = this.track.mapScale || 3.0;
    const grp = new THREE.Group();
    grp.position.set(19 * S, 0, 14 * S);
    grp.scale.setScalar(1.45);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0xf4efe3, roughness: 0.8 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xc94234, roughness: 0.65 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x6f4729, roughness: 0.75 });
    const sailMat = new THREE.MeshStandardMaterial({ color: 0xfff8ea, roughness: 0.6 });

    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.3, 7.2, 12), wallMat);
    tower.position.y = 3.6;
    tower.castShadow = true;
    tower.receiveShadow = true;
    grp.add(tower);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.9, 2.2, 12), roofMat);
    roof.position.y = 8.2;
    roof.castShadow = true;
    grp.add(roof);

    const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.7, 0.3), woodMat);
    door.position.set(0, 0.85, 2.1);
    grp.add(door);

    // Rotating sail hub
    const hub = new THREE.Group();
    hub.position.set(0, 6.7, 1.55);

    const centerCap = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.7, 10), woodMat);
    centerCap.rotation.x = Math.PI / 2;
    hub.add(centerCap);

    for (let i = 0; i < 4; i++) {
      const armGrp = new THREE.Group();
      armGrp.rotation.z = (i * Math.PI) / 2;

      const spar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 4.4, 0.14), woodMat);
      spar.position.y = 2.2;
      spar.castShadow = true;
      armGrp.add(spar);

      const sail = new THREE.Mesh(new THREE.BoxGeometry(0.95, 3.2, 0.06), sailMat);
      sail.position.set(0.5, 2.6, 0.04);
      sail.castShadow = true;
      armGrp.add(sail);

      hub.add(armGrp);
    }

    grp.add(hub);
    this.windmillBlades = hub;
    parent.add(grp);
  }

  buildTidmouthShed(parent) {
    // Open-front Engine Shed aligned accurately along the end of S_SHED, clear of B3
    const shedEdge = this.track.edges.S_SHED;
    const shedSample = this.track.sampleEdge("S_SHED", shedEdge.length - 10.5);
    const grp = new THREE.Group();
    grp.position.copy(shedSample.pos);
    // Align local +X with -tangent (so local -X is toward dead-end Y1, local +X is open entrance)
    const dirToEntrance = shedSample.tangent.clone().negate();
    grp.rotation.y = Math.atan2(-dirToEntrance.z, dirToEntrance.x);

    const brickMat = new THREE.MeshStandardMaterial({ color: 0x9c453a, roughness: 0.85 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x3b444f, roughness: 0.65 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xeadfcb, roughness: 0.7 });

    const shedLen = 20.0;
    const shedHalfW = 2.65;
    const wallH = 4.2;

    // North & South side walls + Back wall (Entrance facing +X toward M2 is open!)
    const wallN = new THREE.Mesh(new THREE.BoxGeometry(shedLen, wallH, 0.55), brickMat);
    wallN.position.set(0, wallH / 2, -shedHalfW);
    wallN.castShadow = true;
    wallN.receiveShadow = true;
    grp.add(wallN);

    const wallS = new THREE.Mesh(new THREE.BoxGeometry(shedLen, wallH, 0.55), brickMat);
    wallS.position.set(0, wallH / 2, shedHalfW);
    wallS.castShadow = true;
    wallS.receiveShadow = true;
    grp.add(wallS);

    const wallBack = new THREE.Mesh(new THREE.BoxGeometry(0.6, wallH, shedHalfW * 2 + 0.55), brickMat);
    wallBack.position.set(-shedLen / 2, wallH / 2, 0);
    wallBack.castShadow = true;
    grp.add(wallBack);

    // Pitched roof slopes
    const roofSlopeN = new THREE.Mesh(new THREE.BoxGeometry(shedLen + 0.8, 0.3, 3.6), roofMat);
    roofSlopeN.position.set(0, wallH + 0.85, -1.45);
    roofSlopeN.rotation.x = -0.45;
    roofSlopeN.castShadow = true;
    grp.add(roofSlopeN);

    const roofSlopeS = new THREE.Mesh(new THREE.BoxGeometry(shedLen + 0.8, 0.3, 3.6), roofMat);
    roofSlopeS.position.set(0, wallH + 0.85, 1.45);
    roofSlopeS.rotation.x = 0.45;
    roofSlopeS.castShadow = true;
    grp.add(roofSlopeS);

    // Cream header beam over entrance
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, shedHalfW * 2 + 0.6), trimMat);
    lintel.position.set(shedLen / 2, wallH - 0.1, 0);
    grp.add(lintel);

    // Water tower placed cleanly on the NORTH side (-Z local) of the Shed, completely clear of B3
    const towerPost = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.55, 3.2, 8),
      new THREE.MeshStandardMaterial({ color: 0x5c3c24 })
    );
    towerPost.position.set(3.2, 1.6, -5.0);
    towerPost.castShadow = true;
    grp.add(towerPost);

    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.4, 2.0, 14),
      new THREE.MeshStandardMaterial({ color: 0x356b8c, roughness: 0.55 })
    );
    tank.position.set(3.2, 4.1, -5.0);
    tank.castShadow = true;
    grp.add(tank);

    parent.add(grp);
  }

  buildLevelCrossing(parent) {
    // Dirt country road crossing E6 perpendicularly at midpoint
    const e6 = this.track.edges.E6;
    const lc = this.track.sampleEdge("E6", e6.length * 0.5);
    const roadGrp = new THREE.Group();
    roadGrp.position.copy(lc.pos);
    roadGrp.rotation.y = Math.atan2(lc.right.x, lc.right.z);

    const roadMat = new THREE.MeshStandardMaterial({ color: 0xc2a87e, roughness: 0.95 });
    const road = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.08, 34), roadMat);
    road.position.set(0, 0.04, 0);
    road.receiveShadow = true;
    roadGrp.add(road);

    // Red/white crossing signposts on either side of track
    const postMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.5 });
    const redMat = new THREE.MeshStandardMaterial({ color: 0xd93829, roughness: 0.5 });

    for (const dz of [-3.4, 3.4]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 2.5, 8), postMat);
      post.position.set(2.4, 1.25, dz);
      post.castShadow = true;
      roadGrp.add(post);

      const barA = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 0.09), redMat);
      barA.position.set(2.48, 2.2, dz);
      barA.rotation.z = 0.7;
      roadGrp.add(barA);

      const barB = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 0.09), redMat);
      barB.position.set(2.48, 2.2, dz);
      barB.rotation.z = -0.7;
      roadGrp.add(barB);
    }
    parent.add(roadGrp);
  }

  buildHarborAndQuarry(parent) {
    const S = this.track.mapScale || 5.0;

    // 1. Brendam Harbor Station (south coastal express & port branch)
    const portGrp = new THREE.Group();
    portGrp.position.set(6 * S, 0, 52 * S);

    const concreteMat = new THREE.MeshStandardMaterial({ color: 0xbcb5a8, roughness: 0.85 });
    const harborWallMat = new THREE.MeshStandardMaterial({ color: 0x3b607a, roughness: 0.72 });
    const roofSlateMat = new THREE.MeshStandardMaterial({ color: 0x264b6e, roughness: 0.58 });
    const creamTrimMat = new THREE.MeshStandardMaterial({ color: 0xf4efe4, roughness: 0.7 });
    const rustOrangeMat = new THREE.MeshStandardMaterial({ color: 0xd96b27, roughness: 0.5, metalness: 0.25 });

    const plat = new THREE.Mesh(new THREE.BoxGeometry(24, 1.155, 3.6), concreteMat);
    plat.position.set(0, -0.0225, -3.1);
    plat.castShadow = true;
    plat.receiveShadow = true;
    portGrp.add(plat);

    const hall = new THREE.Mesh(new THREE.BoxGeometry(14, 3.2, 3.0), harborWallMat);
    hall.position.set(0, 2.0, -3.6);
    hall.castShadow = true;
    hall.receiveShadow = true;
    portGrp.add(hall);

    const hallRoof = new THREE.Mesh(new THREE.BoxGeometry(15.2, 0.65, 4.2), roofSlateMat);
    hallRoof.position.set(0, 3.85, -3.1);
    hallRoof.castShadow = true;
    portGrp.add(hallRoof);

    const signBoard = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.75, 0.18), creamTrimMat);
    signBoard.position.set(0, 3.55, -1.95);
    portGrp.add(signBoard);

    parent.add(portGrp);

    // 2. Brendam Port Dock Gantry Crane & Cargo Containers straddling E_SE
    const dockSample = this.track.sampleEdge("E_SE", this.track.edges.E_SE.length * 0.36);
    const dockGrp = new THREE.Group();
    dockGrp.position.set(dockSample.pos.x, 0, dockSample.pos.z);
    dockGrp.rotation.y = Math.atan2(-dockSample.tangent.z, dockSample.tangent.x);

    // Quay stone apron south of dock siding (anchored down to y=-0.6)
    const quay = new THREE.Mesh(new THREE.BoxGeometry(34, 1.045, 9), concreteMat);
    quay.position.set(0, -0.0775, 5.8);
    quay.receiveShadow = true;
    dockGrp.add(quay);

    // Portal gantry crane legs straddling the track
    [-2.4, 2.4].forEach((zOff) => {
      [-3.2, 3.2].forEach((xOff) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.42, 6.2, 0.42), rustOrangeMat);
        leg.position.set(xOff, 3.1, zOff);
        leg.castShadow = true;
        dockGrp.add(leg);
      });
    });
    const gantryBeam = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.75, 11.0), rustOrangeMat);
    gantryBeam.position.set(0, 6.4, 2.4);
    gantryBeam.castShadow = true;
    dockGrp.add(gantryBeam);

    const craneCab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.5, 2.2), creamTrimMat);
    craneCab.position.set(0, 5.4, 4.2);
    craneCab.castShadow = true;
    dockGrp.add(craneCab);

    // Colorful harbor shipping containers
    const boxColors = [0xc2410c, 0x1d4ed8, 0x15803d, 0xb45309];
    for (let c = 0; c < 4; c++) {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(4.4, 1.9, 1.9),
        new THREE.MeshStandardMaterial({ color: boxColors[c], roughness: 0.65 })
      );
      box.position.set(-7.5 + c * 5.2, 1.4, 5.8);
      box.castShadow = true;
      box.receiveShadow = true;
      dockGrp.add(box);
    }
    parent.add(dockGrp);

    // 3. North Highland Quarry Coal/Stone Hopper straddling W_NW
    const quarryMid = this.track.sampleEdge("W_NW", this.track.edges.W_NW.length * 0.45);
    const quarryGrp = new THREE.Group();
    quarryGrp.position.copy(quarryMid.pos);
    quarryGrp.rotation.y = Math.atan2(quarryMid.tangent.x, quarryMid.tangent.z);

    const timberMat = new THREE.MeshStandardMaterial({ color: 0x5c4028, roughness: 0.85 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.45, metalness: 0.6 });
    const coalMat = new THREE.MeshStandardMaterial({ color: 0x1f242c, roughness: 0.92 });

    // Extend hopper steel columns all the way down into the ground below elevated W_NW
    const groundDrop = quarryMid.pos.y + 2.4;
    const colH = 6.8 + groundDrop;
    const colCenterY = 6.8 - colH * 0.5;
    [-2.4, 2.4].forEach((xSide) => {
      [-1.8, 1.8].forEach((zSpan) => {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.42, colH, 0.42), steelMat);
        col.position.set(xSide, colCenterY, zSpan);
        col.castShadow = true;
        quarryGrp.add(col);
      });
    });
    const hopperBody = new THREE.Mesh(new THREE.BoxGeometry(5.6, 2.4, 4.6), timberMat);
    hopperBody.position.set(0, 7.0, 0);
    hopperBody.castShadow = true;
    quarryGrp.add(hopperBody);

    const hopperRoof = new THREE.Mesh(new THREE.ConeGeometry(4.0, 1.6, 4), steelMat);
    hopperRoof.position.set(0, 9.0, 0);
    hopperRoof.rotation.y = Math.PI * 0.25;
    hopperRoof.castShadow = true;
    quarryGrp.add(hopperRoof);

    const chute = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.55, 1.4, 6), coalMat);
    chute.position.set(0, 5.3, 0);
    quarryGrp.add(chute);

    // Scenic rocky mountain mounds framing North Quarry (placed safely clear of track envelope)
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x7c828a, roughness: 0.92 });
    const rockOffsets = [
      [-14, -2.5, -10, 5.5],
      [14, -2.5, -12, 6.0],
      [-15, -2.5, 10, 5.0],
    ];
    for (const [rx, ry, rz, rad] of rockOffsets) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rad, 1), rockMat);
      rock.position.set(rx, ry, rz);
      rock.scale.set(1.2, 1.35, 1.0);
      rock.castShadow = true;
      rock.receiveShadow = true;
      quarryGrp.add(rock);
    }

    parent.add(quarryGrp);
  }

  buildTreesAndRocks(parent) {
    const S = this.track.mapScale || 5.0;
    // Deterministic pseudo-random helper so layout always looks balanced
    let seed = 1337;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    const e4Mid = this.track.sampleEdge("E4", this.track.edges.E4.length * 0.5).pos;
    const shedPos = this.track.sampleEdge("S_SHED", this.track.edges.S_SHED.length - 10.5).pos;
    const dockPos = this.track.sampleEdge("E_SE", this.track.edges.E_SE.length * 0.36).pos;
    const quarryPos = this.track.sampleEdge("W_NW", this.track.edges.W_NW.length * 0.45).pos;

    const treeSpots = [];
    for (let i = 0; i < 2000 && treeSpots.length < 600; i++) {
      const x = (rand() - 0.5) * 202 * S;
      const z = (rand() - 0.5) * 140 * S;

      // Keep clear of coastal water, stations, windmill, shed, tunnel, harbor, quarry, and switch stands
      if (x > 40 * S && z > -29 * S && z < 25 * S) continue;
      if (Math.hypot(x - -5 * S, z - 40 * S) < 38) continue;
      if (Math.hypot(x - 6 * S, z - 52 * S) < 26) continue;
      if (Math.hypot(x - dockPos.x, z - dockPos.z) < 24) continue;
      if (Math.hypot(x - quarryPos.x, z - quarryPos.z) < 26) continue;
      if (Math.hypot(x - 19 * S, z - 14 * S) < 14) continue;
      if (Math.hypot(x - shedPos.x, z - shedPos.z) < 20) continue;
      if (Math.hypot(x - e4Mid.x, z - e4Mid.z) < 34) continue;
      if (this.track.switches.some((sw) => {
        const sp = this.track.nodes[sw.nodeId].pos.clone().add(sw.sideOffset);
        return Math.hypot(x - sp.x, z - sp.z) < 6.5;
      })) continue;
      if (this.minDistToTrack(x, z) < 6.5) continue;
      if (this.highway && this.highway.minDistToRoad(x, z) < 6.5) continue;

      treeSpots.push({
        x,
        z,
        scale: 1.0 + rand() * 1.15,
        isPine: rand() > 0.4,
      });
    }

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.9 });
    const pineMat = new THREE.MeshStandardMaterial({ color: 0x2d6e37, roughness: 0.85 });
    const oakMat = new THREE.MeshStandardMaterial({ color: 0x4b8f34, roughness: 0.85 });

    const trunks = [];
    const pines = [];
    const oaks = [];

    for (const t of treeSpots) {
      const tm = new THREE.Matrix4();
      tm.makeScale(t.scale, t.scale, t.scale);
      tm.setPosition(t.x, 0.9 * t.scale, t.z);
      trunks.push(tm);

      const cm = new THREE.Matrix4();
      cm.makeScale(t.scale, t.scale, t.scale);
      if (t.isPine) {
        cm.setPosition(t.x, 2.7 * t.scale, t.z);
        pines.push(cm);
      } else {
        cm.setPosition(t.x, 2.5 * t.scale, t.z);
        oaks.push(cm);
      }
    }

    const trunkInst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.32, 1.8, 7), trunkMat, trunks.length);
    trunkInst.castShadow = true;
    trunks.forEach((m, i) => trunkInst.setMatrixAt(i, m));
    trunkInst.instanceMatrix.needsUpdate = true;
    trunkInst.frustumCulled = false;
    trunkInst.computeBoundingSphere?.();
    parent.add(trunkInst);

    const pineInst = new THREE.InstancedMesh(new THREE.ConeGeometry(1.35, 3.2, 8), pineMat, pines.length);
    pineInst.castShadow = true;
    pineInst.receiveShadow = true;
    pines.forEach((m, i) => pineInst.setMatrixAt(i, m));
    pineInst.instanceMatrix.needsUpdate = true;
    pineInst.frustumCulled = false;
    pineInst.computeBoundingSphere?.();
    parent.add(pineInst);

    const oakInst = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1.35, 1), oakMat, oaks.length);
    oakInst.castShadow = true;
    oakInst.receiveShadow = true;
    oaks.forEach((m, i) => oakInst.setMatrixAt(i, m));
    oakInst.instanceMatrix.needsUpdate = true;
    oakInst.frustumCulled = false;
    oakInst.computeBoundingSphere?.();
    parent.add(oakInst);
  }

  update(dt) {
    this.animTime += dt;
    if (this.windmillBlades) {
      this.windmillBlades.rotation.z -= dt * 0.85;
    }
    if (this.waterMesh) {
      this.waterMesh.position.y = this.waterBaseY + Math.sin(this.animTime * 1.4) * 0.06;
    }
    if (this.boat) {
      this.boat.position.y = this.waterBaseY + 0.18 + Math.sin(this.animTime * 1.7 + 0.6) * 0.07;
      this.boat.rotation.z = Math.sin(this.animTime * 1.3) * 0.05;
    }
  }
}

window.SodorScenery = SodorScenery;
