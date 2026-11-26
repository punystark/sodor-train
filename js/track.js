// Parametric Track Graph, Switch Logic, and High-Detail Procedural 3D Turnouts & Track
class TrackNetwork {
  constructor() {
    this.nodes = {};
    this.edges = {};
    this.edgeList = [];
    this.switches = [];
    this.switchMeshes = [];
    this.turnoutAnims = []; // Animated point blades, stretcher bars, and throw rods
    this.buildGraph();
  }

  static norm(v) {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return new THREE.Vector3(v[0] / l, v[1] / l, v[2] / l);
  }

  buildGraph() {
    const MAP_SCALE = 5.0;
    this.mapScale = MAP_SCALE;
    const rawNodes = {
      N0: { pos: [-20 * MAP_SCALE, 0, 38 * MAP_SCALE], tan: [1, 0, 0], label: "纳普福特站西" },
      N1: { pos: [10 * MAP_SCALE, 0, 38 * MAP_SCALE], tan: [1, 0, 0], label: "东站道岔" },
      N2: { pos: [52 * MAP_SCALE, 0, 24 * MAP_SCALE], tan: [0.68, 0, -0.73], label: "海湾弯道" },
      N3: { pos: [62 * MAP_SCALE, 6.0, -4 * MAP_SCALE], tan: [-0.15, 0, -0.99], label: "高架桥顶" },
      N4: { pos: [36 * MAP_SCALE, 0, -36 * MAP_SCALE], tan: [-1, 0, 0], label: "北岭道岔" },
      N5: { pos: [-14 * MAP_SCALE, 0, -38 * MAP_SCALE], tan: [-1, 0, 0], label: "隧道西口" },
      N6: { pos: [-54 * MAP_SCALE, 0, -16 * MAP_SCALE], tan: [-0.5, 0, 0.866], label: "风车北湾" },
      N7: { pos: [-52 * MAP_SCALE, 0, 18 * MAP_SCALE], tan: [0.5, 0, 0.866], label: "平交道口" },
      M1: { pos: [36 * MAP_SCALE, 0, 14 * MAP_SCALE], tan: [-0.15, 0, -0.99], label: "大风车旁" },
      M2: { pos: [0, 0, -8 * MAP_SCALE], tan: [-1, 0, 0], label: "机房枢纽" },
      M3: { pos: [-27.8095 * MAP_SCALE, 0, -1.2114 * MAP_SCALE], tan: [0.08173, 0, 0.99665], label: "西支线平交道" },
      Y1: { pos: [-33 * MAP_SCALE, 0, -17 * MAP_SCALE], tan: [-0.90, 0, -0.436], label: "提茅斯机房尽头", isDeadEnd: true },
      H1: { pos: [-14 * MAP_SCALE, 0, 52 * MAP_SCALE], tan: [1, 0, 0], label: "布兰达姆港西" },
      H2: { pos: [26 * MAP_SCALE, 0, 52 * MAP_SCALE], tan: [1, 0, 0], label: "海港货场道岔" },
      G1: { pos: [64 * MAP_SCALE, 0, 48 * MAP_SCALE], tan: [0.82, 0, -0.57], label: "东港湾转弯" },
      G2: { pos: [86 * MAP_SCALE, 0, -4 * MAP_SCALE], tan: [0, 0, -1], label: "东海湾外岸线" },
      G3: { pos: [66 * MAP_SCALE, 0, -54 * MAP_SCALE], tan: [-0.78, 0, -0.62], label: "东北海岸" },
      G4: { pos: [10 * MAP_SCALE, 3.6, -60 * MAP_SCALE], tan: [-1, 0, 0], label: "北岭山脊线" },
      Q1: { pos: [-40 * MAP_SCALE, 7.2, -52 * MAP_SCALE], tan: [-0.98, 0, 0.19], label: "北岭高架采石场道岔" },
      W1: { pos: [-74 * MAP_SCALE, 4.2, -40 * MAP_SCALE], tan: [-0.45, 0, 0.89], label: "西岭悬崖高架" },
      W2: { pos: [-82 * MAP_SCALE, 0, 8 * MAP_SCALE], tan: [0, 0, 1], label: "西海岸外环" },
      W3: { pos: [-64 * MAP_SCALE, 0, 46 * MAP_SCALE], tan: [0.72, 0, 0.69], label: "西南海角弯道" },
    };

    for (const [id, cfg] of Object.entries(rawNodes)) {
      this.nodes[id] = {
        id,
        pos: new THREE.Vector3(...cfg.pos),
        tan: TrackNetwork.norm(cfg.tan),
        label: cfg.label,
        isDeadEnd: !!cfg.isDeadEnd,
        outEdges: [],
        inEdges: [],
        activeOut: 0,
        activeIn: 0,
      };
    }

    const rawEdges = [
      { id: "E0", from: "N0", to: "N1", scale: 0.35, name: "纳普福特站台线", group: "main" },
      { id: "E1", from: "N1", to: "N2", scale: 0.35, name: "海滨引桥", group: "main" },
      { id: "E2", from: "N2", to: "N3", scale: 0.35, name: "海滨石拱高架桥", group: "viaduct" },
      { id: "E3", from: "N3", to: "N4", scale: 0.35, name: "高架桥北段", group: "viaduct" },
      { id: "E4", from: "N4", to: "N5", scale: 0.35, name: "多多岛山体隧道", group: "tunnel" },
      { id: "E5", from: "N5", to: "N6", scale: 0.35, name: "法夸尔北弯", group: "main" },
      { id: "E6", from: "N6", to: "N7", scale: 0.35, name: "西海岸平交道", group: "main" },
      { id: "E7", from: "N7", to: "N0", scale: 0.35, name: "进站弯道", group: "main" },
      { id: "B1", from: "N1", to: "M1", scale: 0.45, name: "大风车支线", group: "branch" },
      { id: "B2", from: "M1", to: "M2", scale: 0.42, name: "中央草甸线", group: "branch" },
      { id: "B3", from: "M2", to: "M3", scale: 0.36, name: "西支线北段", group: "branch" },
      { id: "B4", from: "M3", to: "N0", scale: 0.42, name: "西支线南段", group: "branch" },
      { id: "C1", from: "N4", to: "M2", scale: 0.42, name: "北岭联络线", group: "branch" },
      { id: "S_SHED", from: "M2", to: "Y1", scale: 0.35, name: "提茅斯机房线", group: "siding" },
      { id: "P1", from: "N7", to: "H1", scale: 0.46, name: "南岸海港引线", group: "harbor" },
      { id: "P_HARBOR", from: "H1", to: "H2", scale: 0.35, name: "布兰达姆海港站台线", group: "harbor" },
      { id: "P2", from: "H2", to: "N2", scale: 0.44, name: "东港跨湾联络线", group: "harbor" },
      { id: "E_SE", from: "H2", to: "G1", scale: 0.36, name: "布兰达姆东岸线", group: "harbor" },
      { id: "E_EAST", from: "G1", to: "G2", scale: 0.38, name: "东海观光大弯", group: "harbor" },
      { id: "E_NE", from: "G2", to: "G3", scale: 0.38, name: "东北岬角线", group: "harbor" },
      { id: "E_N1", from: "G3", to: "G4", scale: 0.36, name: "北岭观景爬坡", group: "viaduct" },
      { id: "E_N2", from: "G4", to: "Q1", scale: 0.36, name: "北岭高架接驳线", group: "viaduct" },
      { id: "MNT2", from: "Q1", to: "N6", scale: 0.42, name: "西山高架降坡线", group: "viaduct" },
      { id: "W_NW", from: "Q1", to: "W1", scale: 0.36, name: "采石场西延伸线", group: "viaduct" },
      { id: "W_WEST", from: "W1", to: "W2", scale: 0.36, name: "西岸高架降坡线", group: "viaduct" },
      { id: "W_SW", from: "W2", to: "W3", scale: 0.36, name: "西南海角外环线", group: "harbor" },
      { id: "W_IN", from: "W3", to: "H1", scale: 0.42, name: "布兰达姆西进港线", group: "harbor" },
    ];

    for (const e of rawEdges) {
      const edgeObj = this.createEdge(e);
      edgeObj.trimStart = 0;
      edgeObj.trimEnd = 0;
      this.edges[e.id] = edgeObj;
      this.edgeList.push(edgeObj);
      this.nodes[e.from].outEdges.push(e.id);
      this.nodes[e.to].inEdges.push(e.id);
    }

    this.switches = [
      {
        id: "S1",
        nodeId: "N1",
        side: "out",
        name: "S1 东站分岔",
        labels: ["外环高架桥", "内环风车线"],
        sideOffset: new THREE.Vector3(0.8, 0, 2.5),
      },
      {
        id: "S2",
        nodeId: "N4",
        side: "out",
        name: "S2 北岭联络",
        labels: ["山体隧道", "切入内环"],
        sideOffset: new THREE.Vector3(-0.8, 0, -2.5),
      },
      {
        id: "S3",
        nodeId: "M2",
        side: "out",
        name: "S3 提茅斯机房",
        labels: ["内环主线", "进机房车库"],
        sideOffset: new THREE.Vector3(-1.4, 0, 2.5),
      },
      {
        id: "S4",
        nodeId: "N0",
        side: "in",
        name: "S4 西站合岔",
        labels: ["外环田园", "内环西支线"],
        sideOffset: new THREE.Vector3(-0.8, 0, 2.5),
      },
      {
        id: "S5",
        nodeId: "N7",
        side: "out",
        name: "S5 西南分岔",
        labels: ["纳普福特站", "布兰达姆港"],
        sideOffset: new THREE.Vector3(-2.6, 0, 1.0),
      },
      {
        id: "S6",
        nodeId: "H2",
        side: "out",
        name: "S6 海港分岔",
        labels: ["东港联络线", "外环东大线"],
        sideOffset: new THREE.Vector3(0.8, 0, 2.6),
      },
      {
        id: "S8",
        nodeId: "Q1",
        side: "out",
        name: "S8 采石场枢纽",
        labels: ["下山回主线", "西南外环线"],
        sideOffset: new THREE.Vector3(-0.5, 0, -2.05),
      },
    ];
  }

  createEdge(cfg) {
    const p0 = this.nodes[cfg.from].pos;
    const t0 = this.nodes[cfg.from].tan;
    const p1 = this.nodes[cfg.to].pos;
    const t1 = this.nodes[cfg.to].tan;
    const d = p0.distanceTo(p1);
    const m0 = t0.clone().multiplyScalar(d * cfg.scale * 2.5);
    const m1 = t1.clone().multiplyScalar(d * cfg.scale * 2.5);

    const N = 320;
    const points = [];
    const tangents = [];
    const cumLen = [0];
    let totalLen = 0;

    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const u2 = u * u;
      const u3 = u2 * u;
      const h00 = 2 * u3 - 3 * u2 + 1;
      const h10 = u3 - 2 * u2 + u;
      const h01 = -2 * u3 + 3 * u2;
      const h11 = u3 - u2;

      const pt = new THREE.Vector3(
        h00 * p0.x + h10 * m0.x + h01 * p1.x + h11 * m1.x,
        h00 * p0.y + h10 * m0.y + h01 * p1.y + h11 * m1.y,
        h00 * p0.z + h10 * m0.z + h01 * p1.z + h11 * m1.z
      );

      const dh00 = 6 * u2 - 6 * u;
      const dh10 = 3 * u2 - 4 * u + 1;
      const dh01 = -6 * u2 + 6 * u;
      const dh11 = 3 * u2 - 2 * u;
      const tan = new THREE.Vector3(
        dh00 * p0.x + dh10 * m0.x + dh01 * p1.x + dh11 * m1.x,
        dh00 * p0.y + dh10 * m0.y + dh01 * p1.y + dh11 * m1.y,
        dh00 * p0.z + dh10 * m0.z + dh01 * p1.z + dh11 * m1.z
      ).normalize();

      points.push(pt);
      tangents.push(tan);
      if (i > 0) {
        totalLen += pt.distanceTo(points[i - 1]);
        cumLen.push(totalLen);
      }
    }

    return {
      ...cfg,
      points,
      tangents,
      cumLen,
      length: totalLen,
      samples: N,
    };
  }

  sampleEdge(edgeId, s) {
    const edge = this.edges[edgeId];
    const clamped = Math.max(0, Math.min(edge.length, s));
    const cum = edge.cumLen;
    let lo = 0;
    let hi = edge.samples;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= clamped) lo = mid;
      else hi = mid;
    }
    const segLen = cum[hi] - cum[lo];
    const t = segLen > 1e-6 ? (clamped - cum[lo]) / segLen : 0;
    const pos = edge.points[lo].clone().lerp(edge.points[hi], t);
    const tangent = edge.tangents[lo].clone().lerp(edge.tangents[hi], t).normalize();
    const right = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, tangent).normalize();
    return { pos, tangent, right, up };
  }

  // Sample edge moving away from a junction node (`fromEnd=true` reverses direction)
  sampleAway(edgeId, fromEnd, d) {
    const edge = this.edges[edgeId];
    const s = fromEnd ? edge.length - d : d;
    const sample = this.sampleEdge(edgeId, s);
    if (!fromEnd) {
      return { pos: sample.pos, tan: sample.tangent, right: sample.right, up: sample.up };
    }
    const tan = sample.tangent.clone().negate();
    const right = sample.right.clone().negate();
    return { pos: sample.pos, tan, right, up: sample.up };
  }

  getSwitchState(sw) {
    const node = this.nodes[sw.nodeId];
    return sw.side === "out" ? node.activeOut : node.activeIn;
  }

  toggleSwitch(switchId) {
    const sw = this.switches.find((s) => s.id === switchId);
    if (!sw) return null;
    const node = this.nodes[sw.nodeId];
    if (sw.side === "out") {
      node.activeOut = (node.activeOut + 1) % node.outEdges.length;
    } else {
      node.activeIn = (node.activeIn + 1) % node.inEdges.length;
    }
    this.updateSwitchVisuals(sw);
    return this.getSwitchState(sw);
  }

  stepBoundary(edgeId, dir) {
    const edge = this.edges[edgeId];
    if (dir > 0) {
      const node = this.nodes[edge.to];
      if (node.outEdges.length === 0) return null;
      const inIdx = node.inEdges.indexOf(edgeId);
      if (inIdx !== -1 && node.activeIn !== inIdx) {
        node.activeIn = inIdx;
        const sw = this.switches.find((s) => s.nodeId === node.id && s.side === "in");
        if (sw) this.updateSwitchVisuals(sw);
        this.syncAutoJunction(node.id, "in");
      }
      const nextEdgeId = node.outEdges[node.activeOut] || node.outEdges[0];
      return { nextEdgeId, nextDir: 1 };
    } else {
      const node = this.nodes[edge.from];
      if (node.inEdges.length === 0) return null;
      const outIdx = node.outEdges.indexOf(edgeId);
      if (outIdx !== -1 && node.activeOut !== outIdx) {
        node.activeOut = outIdx;
        const sw = this.switches.find((s) => s.nodeId === node.id && s.side === "out");
        if (sw) this.updateSwitchVisuals(sw);
        this.syncAutoJunction(node.id, "out");
      }
      const nextEdgeId = node.inEdges[node.activeIn] || node.inEdges[0];
      return { nextEdgeId, nextDir: -1 };
    }
  }

  syncAutoJunction(nodeId, side) {
    const node = this.nodes[nodeId];
    const anim = this.turnoutAnims.find((a) => a.nodeId === nodeId && a.side === side);
    if (anim) {
      const branchIdx = side === "out" ? node.activeOut : node.activeIn;
      anim.targetT = anim.isLeftBranch(branchIdx) ? 0 : 1;
    }
  }

  findNearestSwitchAhead(edgeId, s, dir) {
    let curEdgeId = edgeId;
    let curDir = dir;
    const visited = new Set();

    // Walk up to 8 segments ahead along the currently active route to find the next facing switch
    for (let hop = 0; hop < 8; hop++) {
      const key = `${curEdgeId}:${curDir}`;
      if (visited.has(key)) break;
      visited.add(key);

      const edge = this.edges[curEdgeId];
      const targetNodeId = curDir > 0 ? edge.to : edge.from;
      const expectedSide = curDir > 0 ? "out" : "in";
      const sw = this.switches.find((item) => item.nodeId === targetNodeId && item.side === expectedSide);
      if (sw) return sw;

      const step = this.stepBoundaryPreview(curEdgeId, curDir);
      if (!step) break;
      curEdgeId = step.nextEdgeId;
      curDir = step.nextDir;
    }

    return this.switches[0];
  }

  stepBoundaryPreview(edgeId, dir) {
    const edge = this.edges[edgeId];
    if (dir > 0) {
      const node = this.nodes[edge.to];
      if (!node.outEdges.length) return null;
      return { nextEdgeId: node.outEdges[node.activeOut] || node.outEdges[0], nextDir: 1 };
    } else {
      const node = this.nodes[edge.from];
      if (!node.inEdges.length) return null;
      return { nextEdgeId: node.inEdges[node.activeIn] || node.inEdges[0], nextDir: -1 };
    }
  }

  // Helper: build a continuous rail ribbon along 3D center points with variable or constant width
  buildRailMesh(pts, rights, ups, widths, railH, railBaseY, mat) {
    const verts = [];
    const indices = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const w = Array.isArray(widths) ? widths[i] : widths;
      const hw = w * 0.5;
      const p = pts[i];
      const r = rights[i];
      const u = ups[i];

      const pOL = p.clone().addScaledVector(r, -hw).addScaledVector(u, railBaseY);
      const pOT = p.clone().addScaledVector(r, -hw).addScaledVector(u, railBaseY + railH);
      const pIT = p.clone().addScaledVector(r, hw).addScaledVector(u, railBaseY + railH);
      const pIL = p.clone().addScaledVector(r, hw).addScaledVector(u, railBaseY);
      verts.push(pOL.x, pOL.y, pOL.z, pOT.x, pOT.y, pOT.z, pIT.x, pIT.y, pIT.z, pIL.x, pIL.y, pIL.z);

      if (i < n - 1) {
        const b = i * 4;
        const nx = (i + 1) * 4;
        for (let q = 0; q < 3; q++) {
          indices.push(b + q, b + q + 1, nx + q);
          indices.push(b + q + 1, nx + q + 1, nx + q);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    return mesh;
  }

  build3D(scene) {
    const trackGroup = new THREE.Group();
    const gauge = 1.15;
    const halfGauge = gauge * 0.5;
    const railW = 0.085;
    const railH = 0.14;
    const railBaseY = 0.145;

    const mats = {
      ballast: new THREE.MeshStandardMaterial({ color: 0x6e675e, roughness: 0.95, metalness: 0.02 }),
      rail: new THREE.MeshStandardMaterial({ color: 0xd4dbe3, roughness: 0.22, metalness: 0.86 }),
      blade: new THREE.MeshStandardMaterial({ color: 0xe3e8ef, roughness: 0.18, metalness: 0.9 }),
      iron: new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.55, metalness: 0.65 }),
      slidePlate: new THREE.MeshStandardMaterial({ color: 0x7a828e, roughness: 0.35, metalness: 0.78 }),
      sleeper: new THREE.MeshStandardMaterial({ color: 0x5c3c24, roughness: 0.85 }),
    };

    // 1. Identify all 2-way junctions (7 player switches + 4 merge frogs) and build high-detail turnouts
    const junctionDefs = [
      { nodeId: "N1", side: "out", edge0: "E1", edge1: "B1", fromEnd: false },
      { nodeId: "N4", side: "out", edge0: "E4", edge1: "C1", fromEnd: false },
      { nodeId: "M2", side: "out", edge0: "B3", edge1: "S_SHED", fromEnd: false },
      { nodeId: "N0", side: "in", edge0: "E7", edge1: "B4", fromEnd: true },
      { nodeId: "M2", side: "in", edge0: "B2", edge1: "C1", fromEnd: true },
      { nodeId: "N7", side: "out", edge0: "E7", edge1: "P1", fromEnd: false },
      { nodeId: "H2", side: "out", edge0: "P2", edge1: "E_SE", fromEnd: false },
      { nodeId: "N2", side: "in", edge0: "E1", edge1: "P2", fromEnd: true },
      { nodeId: "H1", side: "in", edge0: "P1", edge1: "W_IN", fromEnd: true },
      { nodeId: "Q1", side: "out", edge0: "MNT2", edge1: "W_NW", fromEnd: false },
      { nodeId: "N6", side: "in", edge0: "E5", edge1: "MNT2", fromEnd: true },
    ];

    const plateTransforms = [];
    const sleeperTransforms = [];

    for (const junc of junctionDefs) {
      this.buildTurnoutAssembly(trackGroup, junc, mats, gauge, halfGauge, railW, railH, railBaseY, plateTransforms);
    }

    // 2. Build normal track sections outside trimmed turnout zones
    const sleeperSpacing = 0.88;
    for (const edge of this.edgeList) {
      const sStart = edge.trimStart;
      const sEnd = edge.length - edge.trimEnd;
      if (sEnd <= sStart + 0.2) continue;

      const spanLen = sEnd - sStart;
      const steps = Math.max(12, Math.round(spanLen / 0.8));

      const bStart = Math.max(0, sStart - (sStart > 0 ? 0.55 : 0));
      const bEnd = Math.min(edge.length, sEnd + (edge.trimEnd > 0 ? 0.55 : 0));
      const bSpan = bEnd - bStart;
      const bSteps = Math.max(12, Math.round(bSpan / 0.8));

      const ballastPositions = [];
      const ballastIndices = [];
      const lPts = [], lRights = [], lUps = [];
      const rPts = [], rRights = [], rUps = [];

      const bHalf = 1.08;
      const bTopHalf = 0.85;

      for (let i = 0; i <= bSteps; i++) {
        const s = bStart + (i / bSteps) * bSpan;
        const { pos, right, up } = this.sampleEdge(edge.id, s);

        const v0 = pos.clone().addScaledVector(right, -bHalf).addScaledVector(up, -0.004);
        const v1 = pos.clone().addScaledVector(right, -bTopHalf).addScaledVector(up, 0.106);
        const v2 = pos.clone().addScaledVector(right, bTopHalf).addScaledVector(up, 0.106);
        const v3 = pos.clone().addScaledVector(right, bHalf).addScaledVector(up, -0.004);
        ballastPositions.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z, v2.x, v2.y, v2.z, v3.x, v3.y, v3.z);

        if (i < bSteps) {
          const base = i * 4;
          const next = (i + 1) * 4;
          for (let q = 0; q < 3; q++) {
            ballastIndices.push(base + q, base + q + 1, next + q);
            ballastIndices.push(base + q + 1, next + q + 1, next + q);
          }
        }
      }

      for (let i = 0; i <= steps; i++) {
        const s = sStart + (i / steps) * spanLen;
        const { pos, right, up } = this.sampleEdge(edge.id, s);

        lPts.push(pos.clone().addScaledVector(right, -halfGauge));
        lRights.push(right);
        lUps.push(up);

        rPts.push(pos.clone().addScaledVector(right, halfGauge));
        rRights.push(right);
        rUps.push(up);
      }

      const bGeo = new THREE.BufferGeometry();
      bGeo.setAttribute("position", new THREE.Float32BufferAttribute(ballastPositions, 3));
      bGeo.setIndex(ballastIndices);
      bGeo.computeVertexNormals();
      const bMesh = new THREE.Mesh(bGeo, mats.ballast);
      bMesh.receiveShadow = true;
      bMesh.castShadow = edge.group === "viaduct";
      trackGroup.add(bMesh);

      trackGroup.add(this.buildRailMesh(lPts, lRights, lUps, railW, railH, railBaseY, mats.rail));
      trackGroup.add(this.buildRailMesh(rPts, rRights, rUps, railW, railH, railBaseY, mats.rail));

      // Sleepers + iron tie plates along trimmed normal section
      const numSleepers = Math.max(2, Math.floor(spanLen / sleeperSpacing));
      for (let k = 0; k <= numSleepers; k++) {
        const s = sStart + ((k + 0.5) / (numSleepers + 1)) * spanLen;
        if (s < 0.35 || s > edge.length - 0.35) continue;
        const { pos, tangent, right, up } = this.sampleEdge(edge.id, s);

        const m = new THREE.Matrix4();
        const zAxis = tangent.clone().normalize();
        const xAxis = new THREE.Vector3().crossVectors(up, zAxis).normalize();
        const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();
        m.makeBasis(xAxis, yAxis, zAxis);
        m.setPosition(pos.x, pos.y + 0.115, pos.z);
        sleeperTransforms.push(m);

        for (const sideSign of [-1, 1]) {
          const pm = new THREE.Matrix4();
          pm.makeBasis(xAxis, yAxis, zAxis);
          const pPos = pos.clone().addScaledVector(right, sideSign * halfGauge);
          pm.setPosition(pPos.x, pPos.y + 0.155, pPos.z);
          plateTransforms.push(pm);
        }
      }
    }

    // Instanced sleepers & iron tie plates
    const sleeperGeo = new THREE.BoxGeometry(1.78, 0.085, 0.25);
    const sleeperInst = new THREE.InstancedMesh(sleeperGeo, mats.sleeper, sleeperTransforms.length);
    sleeperInst.receiveShadow = true;
    sleeperInst.castShadow = true;
    sleeperTransforms.forEach((m, i) => sleeperInst.setMatrixAt(i, m));
    sleeperInst.instanceMatrix.needsUpdate = true;
    sleeperInst.frustumCulled = false;
    sleeperInst.computeBoundingSphere?.();
    trackGroup.add(sleeperInst);

    const plateGeo = new THREE.BoxGeometry(0.22, 0.025, 0.26);
    const plateInst = new THREE.InstancedMesh(plateGeo, mats.iron, plateTransforms.length);
    plateInst.receiveShadow = true;
    plateTransforms.forEach((m, i) => plateInst.setMatrixAt(i, m));
    plateInst.instanceMatrix.needsUpdate = true;
    plateInst.frustumCulled = false;
    plateInst.computeBoundingSphere?.();
    trackGroup.add(plateInst);

    this.buildBufferStop(trackGroup, this.nodes.Y1);

    for (const sw of this.switches) {
      this.buildSwitchStand(trackGroup, sw);
      this.updateSwitchVisuals(sw);
    }

    this.buildOverheadCatenary(trackGroup);

    scene.add(trackGroup);
    return trackGroup;
  }

  buildOverheadCatenary(parent) {
    const mastMat = new THREE.MeshStandardMaterial({ color: 0x6f7b8a, roughness: 0.42, metalness: 0.65 });
    const insMat = new THREE.MeshStandardMaterial({ color: 0xdbe6f0, roughness: 0.25, metalness: 0.1 });
    const wireMat = new THREE.MeshStandardMaterial({ color: 0x2f353d, roughness: 0.45, metalness: 0.72 });

    const contactY = 3.52;
    const messengerY = 3.98;
    const wireRadius = 0.022;

    const addWireSpan = (pts, radius) => {
      if (pts.length < 2) return;
      const curve = new THREE.CatmullRomCurve3(pts);
      const segs = Math.max(8, Math.round(pts.length * 1.5));
      const geo = new THREE.TubeGeometry(curve, segs, radius, 5, false);
      const mesh = new THREE.Mesh(geo, wireMat);
      parent.add(mesh);
    };

    const poleTransforms = [];
    const armTransforms = [];
    const diagTransforms = [];
    const insTransforms = [];
    const poleGeo = new THREE.BoxGeometry(0.14, 4.35, 0.14);
    const armGeo = new THREE.BoxGeometry(2.15, 0.08, 0.08);
    const diagGeo = new THREE.BoxGeometry(1.75, 0.055, 0.055);
    const insGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.24, 8);

    const mastOutOffset = 2.02;

    for (const edge of this.edgeList) {
      let maxS = edge.length;
      if (edge.id === "S_SHED") {
        maxS = Math.max(2, edge.length - 23.0);
      }

      const wireSteps = Math.max(12, Math.round(maxS / 3.2));
      const contactPts = [];
      const messengerPts = [];
      const midS = edge.length * 0.5;

      for (let i = 0; i <= wireSteps; i++) {
        const s = (i / wireSteps) * maxS;
        const { pos, up } = this.sampleEdge(edge.id, s);
        const inTunnel = edge.id === "E4" && Math.abs(s - midS) < 23.5;
        const cH = inTunnel ? 3.46 : contactY;
        const mH = inTunnel ? 3.58 : messengerY;
        contactPts.push(pos.clone().addScaledVector(up, cH));
        messengerPts.push(pos.clone().addScaledVector(up, mH));
      }

      addWireSpan(contactPts, wireRadius);
      addWireSpan(messengerPts, wireRadius * 0.78);

      // Keep catenary masts clear of the Western Highway & all level crossings
      const e6Ref = this.edges.E6 ? this.sampleEdge("E6", this.edges.E6.length * 0.5) : null;
      const hwyU = e6Ref ? new THREE.Vector3(e6Ref.right.x, 0, e6Ref.right.z).normalize() : null;
      const hwyV = e6Ref ? new THREE.Vector3(e6Ref.tangent.x, 0, e6Ref.tangent.z).normalize() : null;

      // Place catenary masts outside clearance envelopes (flip side or skip in turnout throats)
      const isMastClear = (mastPos, selfIdx) => {
        if (e6Ref) {
          const rx = mastPos.x - e6Ref.pos.x;
          const rz = mastPos.z - e6Ref.pos.z;
          const tH = rx * hwyU.x + rz * hwyU.z;
          const latH = Math.abs(rx * hwyV.x + rz * hwyV.z);
          if (tH > -275 && tH < 205 && latH < 6.2) return false;
        }
        for (const other of this.edgeList) {
          const isSelf = other.id === edge.id;
          for (let i = 0; i < other.points.length; i += 2) {
            if (isSelf && Math.abs(i - selfIdx) < 12) continue;
            const p = other.points[i];
            if (Math.abs(p.y - mastPos.y) > 4.5) continue;
            const dx = mastPos.x - p.x;
            const dz = mastPos.z - p.z;
            if (dx * dx + dz * dz < 2.05 * 2.05) return false;
          }
        }
        for (const sw of this.switches) {
          const swNode = this.nodes[sw.nodeId];
          if (!swNode) continue;
          const sp = swNode.pos;
          const sdx = mastPos.x - (sp.x + sw.sideOffset.x);
          const sdz = mastPos.z - (sp.z + sw.sideOffset.z);
          if (Math.abs(sp.y - mastPos.y) < 4.0 && sdx * sdx + sdz * sdz < 1.8 * 1.8) {
            return false;
          }
        }
        return true;
      };

      const prefSide = edge.group === "branch" ? -1 : 1;
      const mastInterval = 18.0;
      const numMasts = Math.floor((maxS - 8) / mastInterval);
      for (let k = 1; k <= numMasts; k++) {
        const s = 4.5 + (k - 0.5) * ((maxS - 9.0) / Math.max(1, numMasts));
        if (edge.id === "E0" && s > 18.0 && s < edge.length - 18.0) continue; // inside Knapford glass canopy
        if (edge.id === "E4" && Math.abs(s - midS) < 25.0) continue; // inside mountain tunnel

        const { pos, right } = this.sampleEdge(edge.id, s);
        const selfIdx = Math.round((s / edge.length) * edge.samples);

        let chosenSide = null;
        for (const candSide of [prefSide, -prefSide]) {
          const candPos = pos.clone().addScaledVector(right, candSide * mastOutOffset);
          if (isMastClear(candPos, selfIdx)) {
            chosenSide = candSide;
            break;
          }
        }
        if (chosenSide === null) continue;

        const sideDir = right.clone().multiplyScalar(chosenSide);
        const mastPos = pos.clone().addScaledVector(sideDir, mastOutOffset);

        const basisX = sideDir.clone().negate(); // points from mast INWARD to track center
        const basisY = new THREE.Vector3(0, 1, 0);
        const basisZ = new THREE.Vector3().crossVectors(basisX, basisY).normalize();
        const rotMat = new THREE.Matrix4().makeBasis(basisX, basisY, basisZ);

        // Vertical steel mast
        const pm = rotMat.clone().setPosition(mastPos.x, mastPos.y + 2.15, mastPos.z);
        poleTransforms.push(pm);

        // Horizontal cantilever arm reaching over track centerline
        const armPos = pos.clone().addScaledVector(sideDir, mastOutOffset * 0.5);
        const am = rotMat.clone().setPosition(armPos.x, pos.y + 3.98, armPos.z);
        armTransforms.push(am);

        // Angled brace strut
        const dm = rotMat.clone();
        const tilt = new THREE.Matrix4().makeRotationZ(-0.42);
        dm.multiply(tilt);
        const braceCenter = pos.clone().addScaledVector(sideDir, mastOutOffset * 0.62);
        dm.setPosition(braceCenter.x, pos.y + 3.6, braceCenter.z);
        diagTransforms.push(dm);

        // Ceramic insulator drop above contact wire
        const im = rotMat.clone().setPosition(pos.x, pos.y + 3.74, pos.z);
        insTransforms.push(im);
      }
    }

    const addInst = (geo, mat, arr, cast = true) => {
      if (!arr.length) return;
      const inst = new THREE.InstancedMesh(geo, mat, arr.length);
      inst.castShadow = cast;
      arr.forEach((m, i) => inst.setMatrixAt(i, m));
      inst.instanceMatrix.needsUpdate = true;
      inst.frustumCulled = false;
      inst.computeBoundingSphere?.();
      parent.add(inst);
    };

    addInst(poleGeo, mastMat, poleTransforms, true);
    addInst(armGeo, mastMat, armTransforms, true);
    addInst(diagGeo, mastMat, diagTransforms, false);
    addInst(insGeo, insMat, insTransforms, false);
  }

  // Construct an authentic railway turnout: unified wide ballast, long switch timbers,
  // animated moving point blades + stretcher bars, V-point frog, flared wing rails, and guard rails!
  buildTurnoutAssembly(parent, junc, mats, gauge, halfGauge, railW, railH, railBaseY, plateTransforms) {
    const eA = junc.edge0;
    const eB = junc.edge1;
    const fromEnd = junc.fromEnd;

    // 1. Measure frog & separation distances dynamically
    let sFrog = 9.0;
    let sClear = 16.0;
    let foundFrog = false;
    for (let d = 0.25; d <= 80.0; d += 0.2) {
      const a = this.sampleAway(eA, fromEnd, d);
      const b = this.sampleAway(eB, fromEnd, d);
      const sep = a.pos.distanceTo(b.pos);
      if (!foundFrog && sep >= gauge) {
        sFrog = d;
        foundFrog = true;
      }
      if (sep >= 2.16) {
        sClear = d;
        break;
      }
    }

    // Reserve this zone on both edges so normal rail builder skips it
    if (!fromEnd) {
      this.edges[eA].trimStart = Math.max(this.edges[eA].trimStart, sClear);
      this.edges[eB].trimStart = Math.max(this.edges[eB].trimStart, sClear);
    } else {
      this.edges[eA].trimEnd = Math.max(this.edges[eA].trimEnd, sClear);
      this.edges[eB].trimEnd = Math.max(this.edges[eB].trimEnd, sClear);
    }

    // 2. Determine Left (L) and Right (R) diverging tracks when facing away from junction
    const aFrog = this.sampleAway(eA, fromEnd, sFrog);
    const bFrog = this.sampleAway(eB, fromEnd, sFrog);
    const bIsRight = bFrog.pos.clone().sub(aFrog.pos).dot(aFrog.right) >= 0;
    const eL = bIsRight ? eA : eB;
    const eR = bIsRight ? eB : eA;
    const leftEdgeIdx = bIsRight ? 0 : 1; // 0 if edge0 is Left, 1 if edge1 is Left

    const steps = Math.max(24, Math.round(sClear / 0.45));

    // 3. Unified Wide Ballast Bed + Continuous Outer Stock Rails
    const ballastVerts = [];
    const ballastIdx = [];
    const lOuterPts = [], lOuterR = [], lOuterU = [];
    const rOuterPts = [], rOuterR = [], rOuterU = [];

    for (let i = 0; i <= steps; i++) {
      const d = (i / steps) * sClear;
      const sL = this.sampleAway(eL, fromEnd, d);
      const sR = this.sampleAway(eR, fromEnd, d);

      const pLOuter = sL.pos.clone().addScaledVector(sL.right, -halfGauge);
      const pROuter = sR.pos.clone().addScaledVector(sR.right, halfGauge);

      lOuterPts.push(pLOuter);
      lOuterR.push(sL.right);
      lOuterU.push(sL.up);

      rOuterPts.push(pROuter);
      rOuterR.push(sR.right);
      rOuterU.push(sR.up);

      const v0 = pLOuter.clone().addScaledVector(sL.right, -0.51);
      const v1 = pLOuter.clone().addScaledVector(sL.right, -0.28).addScaledVector(sL.up, 0.11);
      const v2 = pROuter.clone().addScaledVector(sR.right, 0.28).addScaledVector(sR.up, 0.11);
      const v3 = pROuter.clone().addScaledVector(sR.right, 0.51);
      ballastVerts.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z, v2.x, v2.y, v2.z, v3.x, v3.y, v3.z);

      if (i < steps) {
        const b = i * 4;
        const nx = (i + 1) * 4;
        for (let q = 0; q < 3; q++) {
          ballastIdx.push(b + q, b + q + 1, nx + q);
          ballastIdx.push(b + q + 1, nx + q + 1, nx + q);
        }
      }
    }

    const bGeo = new THREE.BufferGeometry();
    bGeo.setAttribute("position", new THREE.Float32BufferAttribute(ballastVerts, 3));
    bGeo.setIndex(ballastIdx);
    bGeo.computeVertexNormals();
    const bMesh = new THREE.Mesh(bGeo, mats.ballast);
    bMesh.receiveShadow = true;
    parent.add(bMesh);

    parent.add(this.buildRailMesh(lOuterPts, lOuterR, lOuterU, railW, railH, railBaseY, mats.rail));
    parent.add(this.buildRailMesh(rOuterPts, rOuterR, rOuterU, railW, railH, railBaseY, mats.rail));

    // 4. Key Stations: Toe, Heel, and Exact Frog Intersection
    const dToe = Math.min(0.8, sFrog * 0.14);
    const dHeel = Math.max(dToe + 2.2, sFrog * 0.48);

    // Find exact crossing distance dCross where L_inner and R_inner are closest
    let dCross = sFrog;
    let minInnerDist = Infinity;
    for (let d = Math.max(dHeel + 0.4, sFrog - 1.5); d <= Math.min(sClear - 0.8, sFrog + 1.5); d += 0.04) {
      const sL = this.sampleAway(eL, fromEnd, d);
      const sR = this.sampleAway(eR, fromEnd, d);
      const pLI = sL.pos.clone().addScaledVector(sL.right, halfGauge);
      const pRI = sR.pos.clone().addScaledVector(sR.right, -halfGauge);
      const dist = pLI.distanceTo(pRI);
      if (dist < minInnerDist) {
        minInnerDist = dist;
        dCross = d;
      }
    }

    // 5. Long Unified Switch Timbers + Iron Tie Plates / Slide Chairs
    const numTimbers = Math.max(4, Math.floor(sClear / 0.85));
    for (let k = 0; k <= numTimbers; k++) {
      const d = 0.35 + (k / numTimbers) * (sClear - 0.65);
      const sL = this.sampleAway(eL, fromEnd, d);
      const sR = this.sampleAway(eR, fromEnd, d);

      const leftEnd = sL.pos.clone().addScaledVector(sL.right, -halfGauge - 0.34);
      const rightEnd = sR.pos.clone().addScaledVector(sR.right, halfGauge + 0.34);
      const span = leftEnd.distanceTo(rightEnd);
      const mid = leftEnd.clone().lerp(rightEnd, 0.5);

      const xAxis = rightEnd.clone().sub(leftEnd).normalize();
      const yAxis = new THREE.Vector3(0, 1, 0);
      const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize();

      const timber = new THREE.Mesh(new THREE.BoxGeometry(span, 0.085, 0.26), mats.sleeper);
      const basis = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
      timber.quaternion.setFromRotationMatrix(basis);
      timber.position.set(mid.x, mid.y + 0.115, mid.z);
      timber.receiveShadow = true;
      timber.castShadow = true;
      parent.add(timber);

      // Iron tie plates under both outer stock rails
      for (const pRail of [
        sL.pos.clone().addScaledVector(sL.right, -halfGauge),
        sR.pos.clone().addScaledVector(sR.right, halfGauge),
      ]) {
        const pm = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
        pm.setPosition(pRail.x, pRail.y + 0.155, pRail.z);
        plateTransforms.push(pm);
      }

      // Shiny metallic slide chairs under the switch blades!
      if (d >= dToe - 0.15 && d <= dHeel + 0.1) {
        for (const pSlide of [
          sL.pos.clone().addScaledVector(sL.right, -halfGauge + 0.12),
          sR.pos.clone().addScaledVector(sR.right, halfGauge - 0.12),
        ]) {
          const chair = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.028, 0.25), mats.slidePlate);
          chair.quaternion.copy(timber.quaternion);
          chair.position.set(pSlide.x, pSlide.y + 0.154, pSlide.z);
          parent.add(chair);
        }
      }
    }

    // 6. Animated Moving Point Blades (尖轨) + Stretcher Bars (连杆) + Point Machine
    const bladeGrp = new THREE.Group();
    parent.add(bladeGrp);

    const buildBlade = (targetSide) => {
      // targetSide === 'L' -> blade sits against L_outer at dToe, leads to R_inner at dHeel (routes Right!)
      // targetSide === 'R' -> blade sits against R_outer at dToe, leads to L_inner at dHeel (routes Left!)
      const bladeSamples = 16;
      const bPts = [];
      const bRights = [];
      const bUps = [];
      const bWidths = [];

      const sL_heel = this.sampleAway(eL, fromEnd, dHeel);
      const sR_heel = this.sampleAway(eR, fromEnd, dHeel);
      const heelPos = targetSide === "L"
        ? sR_heel.pos.clone().addScaledVector(sR_heel.right, -halfGauge)
        : sL_heel.pos.clone().addScaledVector(sL_heel.right, halfGauge);

      const sL_toe = this.sampleAway(eL, fromEnd, dToe);
      const sR_toe = this.sampleAway(eR, fromEnd, dToe);
      const closedToePos = targetSide === "L"
        ? sL_toe.pos.clone().addScaledVector(sL_toe.right, -halfGauge + railW * 0.95)
        : sR_toe.pos.clone().addScaledVector(sR_toe.right, halfGauge - railW * 0.95);

      // Build blade mesh in heel-centered local space ordered FORWARD (dToe -> dHeel)
      // so triangle winding and normals match normal rails with zero culling!
      const pivot = new THREE.Group();
      pivot.position.copy(heelPos);

      for (let i = 0; i <= bladeSamples; i++) {
        const u = i / bladeSamples; // 0 = toe, 1 = heel
        const t = 1 - u; // 1 = toe, 0 = heel
        const dCur = dToe + u * (dHeel - dToe);
        const sSample = targetSide === "L" ? this.sampleAway(eR, fromEnd, dCur) : this.sampleAway(eL, fromEnd, dCur);
        const pCurve = targetSide === "L"
          ? sSample.pos.clone().addScaledVector(sSample.right, -halfGauge)
          : sSample.pos.clone().addScaledVector(sSample.right, halfGauge);

        // Smooth blend from closedToePos at toe (t=1) to exact pCurve at heel (t=0)
        const worldPt = pCurve.lerp(closedToePos, t * t).sub(heelPos);
        bPts.push(worldPt);
        bRights.push(sSample.right);
        bUps.push(sSample.up);
        // Taper from sleek 0.024 tip at toe (t=1) to full railW at heel (t=0)
        bWidths.push(railW * (1 - 0.72 * Math.pow(t, 1.5)));
      }

      const bladeMesh = this.buildRailMesh(bPts, bRights, bUps, bWidths, railH * 0.96, railBaseY, mats.blade);
      pivot.add(bladeMesh);
      bladeGrp.add(pivot);

      // Determine mathematically exact rotation sign around +Y that moves toe INWARD toward track center
      const toeVec = closedToePos.clone().sub(heelPos);
      const bladeLen = toeVec.length();
      const openAngle = Math.atan2(0.16, bladeLen);
      const inwardVec = targetSide === "L" ? sL_toe.right : sR_toe.right.clone().negate();
      const rotTest = toeVec.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.05).sub(toeVec);
      const inwardSign = rotTest.dot(inwardVec) >= 0 ? 1 : -1;

      return { pivot, openAngle, inwardSign, closedToePos, heelPos };
    };

    const bladeL = buildBlade("L");
    const bladeR = buildBlade("R");

    // Stretcher Bars (2 rods connecting the blades across the track) + Throw Rod to Point Machine
    // NOTE: right-handed basis uses (right, up, -tan) so X=across track, Y=up, Z=-along track!
    const sToeRef = this.sampleAway(eL, fromEnd, dToe + 0.45);
    const stretcherBars = [];
    for (const offsetAlong of [0.35, 1.15]) {
      const ref = this.sampleAway(eL, fromEnd, dToe + offsetAlong);
      const sL_b = this.sampleAway(eL, fromEnd, dToe + offsetAlong);
      const sR_b = this.sampleAway(eR, fromEnd, dToe + offsetAlong);
      const barSpan = Math.max(0.75, gauge - 0.22 - (offsetAlong / (dHeel - dToe)) * 0.15);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(barSpan, 0.05, 0.085), mats.iron);
      const basis = new THREE.Matrix4().makeBasis(ref.right, ref.up, ref.tan.clone().negate());
      bar.quaternion.setFromRotationMatrix(basis);
      const midPt = sL_b.pos.clone().lerp(sR_b.pos, 0.5);
      bar.position.set(midPt.x, midPt.y + 0.165, midPt.z);
      bar.userData.basePos = bar.position.clone();
      bar.userData.rightVec = ref.right.clone();
      parent.add(bar);
      stretcherBars.push(bar);
    }

    // Point Machine / Cast-Iron Throw Box next to toe on Left side
    const throwBoxPos = sToeRef.pos.clone().addScaledVector(sToeRef.right, -halfGauge - 0.92);
    const throwBox = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.34, 0.72), mats.iron);
    const tbBasis = new THREE.Matrix4().makeBasis(sToeRef.right, sToeRef.up, sToeRef.tan.clone().negate());
    throwBox.quaternion.setFromRotationMatrix(tbBasis);
    throwBox.position.set(throwBoxPos.x, throwBoxPos.y + 0.17, throwBoxPos.z);
    throwBox.castShadow = true;
    parent.add(throwBox);

    const throwRod = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.045, 0.065), mats.slidePlate);
    throwRod.quaternion.copy(throwBox.quaternion);
    const rodMid = sToeRef.pos.clone().addScaledVector(sToeRef.right, -halfGauge - 0.44);
    throwRod.position.set(rodMid.x, rodMid.y + 0.17, rodMid.z);
    throwRod.userData.basePos = throwRod.position.clone();
    throwRod.userData.rightVec = sToeRef.right.clone();
    parent.add(throwRod);

    // 7. Closure Rails (dHeel -> dCross - throatGap) + Outward-Bending Wing Rails
    // In a real frog:
    // - Left closure rail (L_inner) bends LEFT at the throat to stay parallel (0.18 gap) outside the left V-nose leg (R_inner post-frog)
    // - Right closure rail (R_inner) bends RIGHT at the throat to stay parallel (0.18 gap) outside the right V-nose leg (L_inner post-frog)
    const throatGap = 0.44;
    const flangeGap = 0.18;
    const wingLen = 1.15;

    const buildClosureAndWing = (edgeId, innerSign, oppositeEdgeId, oppositeInnerSign, outwardSign) => {
      const cPts = [], cR = [], cU = [];
      const endD = dCross - throatGap;
      const segs = 14;
      for (let i = 0; i <= segs; i++) {
        const d = dHeel + (i / segs) * (endD - dHeel);
        const s = this.sampleAway(edgeId, fromEnd, d);
        cPts.push(s.pos.clone().addScaledVector(s.right, innerSign * halfGauge));
        cR.push(s.right);
        cU.push(s.up);
      }

      // Compute anchor at throat endD and target parallel to opposite rail past dCross
      const sThroat = this.sampleAway(edgeId, fromEnd, endD);
      const pThroat = sThroat.pos.clone().addScaledVector(sThroat.right, innerSign * halfGauge);

      const wingSteps = 8;
      for (let i = 1; i <= wingSteps; i++) {
        const u = i / wingSteps;
        const d = endD + u * wingLen;
        const sOpp = this.sampleAway(oppositeEdgeId, fromEnd, d);
        // Stay `flangeGap` outside the opposite frog leg, with gentle outward tip flare at end
        const tipFlare = u > 0.6 ? Math.pow((u - 0.6) / 0.4, 1.4) * 0.11 : 0;
        const pParallel = sOpp.pos.clone().addScaledVector(sOpp.right, oppositeInnerSign * halfGauge + outwardSign * (flangeGap + tipFlare));
        // Smoothly transition from pThroat to pParallel over the first half of the wing
        const blend = Math.min(1, u * 1.8);
        const smooth = blend * blend * (3 - 2 * blend);
        const pt = pThroat.clone().lerp(pParallel, smooth);
        // Follow forward advance along d while keeping lateral smooth blend
        const sCur = this.sampleAway(edgeId, fromEnd, d);
        const pBase = sCur.pos.clone().addScaledVector(sCur.right, innerSign * halfGauge);
        const finalPt = pBase.lerp(pParallel, smooth);
        cPts.push(finalPt);
        cR.push(sOpp.right);
        cU.push(sOpp.up);
      }
      parent.add(this.buildRailMesh(cPts, cR, cU, railW, railH, railBaseY, mats.rail));
    };

    // L_inner comes from the +right side before dCross, so its wing bends BACK (+1) to stay outside R_inner (+right)
    buildClosureAndWing(eL, 1, eR, -1, 1);
    // R_inner comes from the -right side before dCross, so its wing bends BACK (-1) to stay outside L_inner (-right)
    buildClosureAndWing(eR, -1, eL, 1, -1);

    // 8. Cast-Steel Frog Baseplate + Solid Welded V-Point Nose + Post-Frog Inner Rails
    const sFrogL = this.sampleAway(eL, fromEnd, dCross);
    const sFrogR = this.sampleAway(eR, fromEnd, dCross);
    const frogPos = sFrogL.pos.clone().addScaledVector(sFrogL.right, halfGauge)
      .lerp(sFrogR.pos.clone().addScaledVector(sFrogR.right, -halfGauge), 0.5);
    const frogTan = sFrogL.tan.clone().add(sFrogR.tan).normalize();
    const frogRight = new THREE.Vector3().crossVectors(frogTan, new THREE.Vector3(0, 1, 0)).normalize();

    const frogPlate = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.04, 1.95), mats.iron);
    const fpBasis = new THREE.Matrix4().makeBasis(frogRight, new THREE.Vector3(0, 1, 0), frogTan.clone().negate());
    frogPlate.quaternion.setFromRotationMatrix(fpBasis);
    frogPlate.position.set(frogPos.x, frogPos.y + 0.145, frogPos.z);
    parent.add(frogPlate);

    // Post-frog V-Point Nose: both inner rails start from exact shared V-tip at dCross + 0.04!
    const frogStart = dCross + 0.04;
    const buildPostFrogInner = (edgeId, innerSign) => {
      const pPts = [], pR = [], pU = [], pW = [];
      const segs = 18;
      for (let i = 0; i <= segs; i++) {
        const u = i / segs;
        const d = frogStart + u * (sClear - frogStart);
        const s = this.sampleAway(edgeId, fromEnd, d);
        const railPt = s.pos.clone().addScaledVector(s.right, innerSign * halfGauge);
        if (i === 0) {
          // Meet smoothly at the shared V-point nose tip!
          pPts.push(frogPos.clone().addScaledVector(frogTan, 0.04));
          pW.push(0.032);
        } else {
          pPts.push(railPt);
          pW.push(i === 1 ? 0.065 : railW);
        }
        pR.push(s.right);
        pU.push(s.up);
      }
      parent.add(this.buildRailMesh(pPts, pR, pU, pW, railH, railBaseY, mats.rail));
    };

    buildPostFrogInner(eL, 1);
    buildPostFrogInner(eR, -1);

    // 9. Guard Rails (Check Rails / 护轨) opposite Frog on both L_outer and R_outer
    const buildGuardRail = (edgeId, outerSign) => {
      const gPts = [], gR = [], gU = [];
      const d0 = Math.max(dHeel + 0.3, dCross - 1.3);
      const d1 = Math.min(sClear - 0.3, dCross + 1.3);
      const segs = 10;
      for (let i = 0; i <= segs; i++) {
        const u = i / segs;
        const d = d0 + u * (d1 - d0);
        const s = this.sampleAway(edgeId, fromEnd, d);
        const tipFlare = (i === 0 || i === segs) ? 0.09 : 0;
        const inward = -outerSign * (0.16 + tipFlare);
        gPts.push(s.pos.clone().addScaledVector(s.right, outerSign * halfGauge + inward));
        gR.push(s.right);
        gU.push(s.up);
      }
      parent.add(this.buildRailMesh(gPts, gR, gU, railW * 0.85, railH * 0.95, railBaseY, mats.rail));
    };

    buildGuardRail(eL, -1);
    buildGuardRail(eR, 1);

    // 10. Register animation state for smooth blade switching!
    const node = this.nodes[junc.nodeId];
    const currentIdx = junc.side === "out" ? node.activeOut : node.activeIn;
    const isLeftBranch = (idx) => idx === leftEdgeIdx;
    const initialT = isLeftBranch(currentIdx) ? 0 : 1; // 0 => routed Left, 1 => routed Right

    const animEntry = {
      nodeId: junc.nodeId,
      side: junc.side,
      isLeftBranch,
      curT: initialT,
      targetT: initialT,
      bladeL,
      bladeR,
      stretcherBars,
      throwRod,
    };
    this.applyBladeAnim(animEntry, initialT);
    this.turnoutAnims.push(animEntry);
  }

  applyBladeAnim(anim, t) {
    // t = 0 -> Routed LEFT:  bladeR CLOSED (0), bladeL OPEN (inward = +inwardSign * openAngle)
    // t = 1 -> Routed RIGHT: bladeL CLOSED (0), bladeR OPEN (inward = +inwardSign * openAngle)
    anim.bladeL.pivot.rotation.y = (1 - t) * anim.bladeL.inwardSign * anim.bladeL.openAngle;
    anim.bladeR.pivot.rotation.y = t * anim.bladeR.inwardSign * anim.bladeR.openAngle;

    // Both stretcher bars & throw rod shift toward +right when t=0 (Left route) and -right when t=1 (Right route)
    const shift = (0.5 - t) * 0.15;
    for (const bar of anim.stretcherBars) {
      bar.position.copy(bar.userData.basePos).addScaledVector(bar.userData.rightVec, shift);
    }
    anim.throwRod.position.copy(anim.throwRod.userData.basePos).addScaledVector(anim.throwRod.userData.rightVec, shift);
  }

  update(dt) {
    for (const anim of this.turnoutAnims) {
      if (Math.abs(anim.targetT - anim.curT) > 0.001) {
        const diff = anim.targetT - anim.curT;
        const step = Math.sign(diff) * Math.min(Math.abs(diff), dt * 6.5);
        anim.curT += step;
        this.applyBladeAnim(anim, anim.curT);
      }
    }
  }

  buildBufferStop(parent, node) {
    const grp = new THREE.Group();
    grp.position.copy(node.pos);
    const angle = Math.atan2(node.tan.x, node.tan.z);
    grp.rotation.y = angle;

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x7c4a26, roughness: 0.8 });
    const redMat = new THREE.MeshStandardMaterial({ color: 0xd93829, roughness: 0.5 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.5 });

    [-0.55, 0.55].forEach((x) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.9, 0.22), woodMat);
      post.position.set(x, 0.5, 0.2);
      post.rotation.x = 0.25;
      post.castShadow = true;
      grp.add(post);

      const brace = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.95, 0.16), woodMat);
      brace.position.set(x, 0.45, 0.65);
      brace.rotation.x = -0.45;
      brace.castShadow = true;
      grp.add(brace);
    });

    const beam = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.32, 0.24), redMat);
    beam.position.set(0, 0.72, 0.05);
    beam.castShadow = true;
    grp.add(beam);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.14, 0.26), whiteMat);
    stripe.position.set(0, 0.72, 0.05);
    grp.add(stripe);

    parent.add(grp);
  }

  buildSwitchStand(parent, sw) {
    const node = this.nodes[sw.nodeId];
    const grp = new THREE.Group();
    const standPos = node.pos.clone().add(sw.sideOffset);
    grp.position.copy(standPos);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.65, 0.22, 12),
      new THREE.MeshStandardMaterial({ color: 0x3b4048, roughness: 0.7, metalness: 0.4 })
    );
    base.position.y = 0.11;
    base.castShadow = true;
    grp.add(base);

    // If this switch stand sits on an elevated junction/viaduct, ground it with a concrete pedestal pier
    if (standPos.y > 0.15) {
      const pierH = standPos.y + 2.2;
      const standPier = new THREE.Mesh(
        new THREE.CylinderGeometry(0.62, 0.78, pierH, 12),
        new THREE.MeshStandardMaterial({ color: 0x9e9280, roughness: 0.88 })
      );
      standPier.position.y = -pierH / 2;
      standPier.castShadow = true;
      standPier.receiveShadow = true;
      grp.add(standPier);

      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.88, 0.88, 0.36, 12),
        new THREE.MeshStandardMaterial({ color: 0x867a69, roughness: 0.85 })
      );
      cap.position.y = -0.18;
      cap.castShadow = true;
      cap.receiveShadow = true;
      grp.add(cap);
    }

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.11, 2.2, 10),
      new THREE.MeshStandardMaterial({ color: 0x262a30, roughness: 0.5, metalness: 0.6 })
    );
    pole.position.y = 1.2;
    pole.castShadow = true;
    grp.add(pole);

    const lampMat = new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      emissive: 0x16a34a,
      emissiveIntensity: 0.85,
      roughness: 0.25,
    });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.38, 14, 14), lampMat);
    lamp.position.y = 2.45;
    grp.add(lamp);

    const leverMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4, metalness: 0.3 });
    const lever = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.15, 0.15), leverMat);
    lever.position.set(0, 1.5, 0);
    lever.castShadow = true;
    grp.add(lever);

    const labelCanvas = document.createElement("canvas");
    labelCanvas.width = 128;
    labelCanvas.height = 64;
    const ctx = labelCanvas.getContext("2d");
    ctx.fillStyle = "rgba(18, 25, 38, 0.88)";
    ctx.beginPath();
    ctx.roundRect(8, 8, 112, 48, 12);
    ctx.fill();
    ctx.strokeStyle = "#f5c542";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = "#fff8e7";
    ctx.font = "bold 28px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(sw.id, 64, 34);

    const spriteTex = new THREE.CanvasTexture(labelCanvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteTex, transparent: true }));
    sprite.position.set(0, 3.8, 0);
    sprite.scale.set(3.2, 1.6, 1);
    sprite.userData = { switchId: sw.id };
    grp.add(sprite);
    this.switchMeshes.push(sprite);

    const hitMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6, 2.6, 5.4, 10),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hitMesh.position.y = 2.5;
    hitMesh.userData = { switchId: sw.id };
    grp.add(hitMesh);
    this.switchMeshes.push(hitMesh);

    // Subtle thin route guide arrow along active turnout leg (doesn't obscure frog/blade details)
    const edgesForSwitch = sw.side === "out" ? node.outEdges : node.inEdges;
    const routeGuides = edgesForSwitch.map((edgeId) => {
      const edge = this.edges[edgeId];
      const pts = [];
      const segLen = Math.min(18.0, edge.length * 0.35);
      for (let i = 0; i <= 18; i++) {
        const s = sw.side === "out" ? (i / 18) * segLen : edge.length - (i / 18) * segLen;
        const { pos } = this.sampleEdge(edgeId, s);
        pts.push(new THREE.Vector3(pos.x, pos.y + 0.19, pos.z));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const tubeGeo = new THREE.TubeGeometry(curve, 14, 0.055, 6, false);
      const tubeMat = new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.55 });
      const tube = new THREE.Mesh(tubeGeo, tubeMat);
      parent.add(tube);
      return tube;
    });

    sw._visuals = { grp, lamp, lampMat, lever, routeGuides };
    parent.add(grp);
  }

  updateSwitchVisuals(sw) {
    if (!sw._visuals) return;
    const idx = this.getSwitchState(sw);
    const isMain = idx === 0;
    const { lampMat, lever, routeGuides } = sw._visuals;

    if (isMain) {
      lampMat.color.setHex(0x22c55e);
      lampMat.emissive.setHex(0x16a34a);
      lever.rotation.z = -0.45;
    } else {
      lampMat.color.setHex(0xf59e0b);
      lampMat.emissive.setHex(0xd97706);
      lever.rotation.z = 0.45;
    }

    routeGuides.forEach((tube, i) => {
      const active = i === idx;
      tube.visible = active;
      tube.material.color.setHex(isMain ? 0x22c55e : 0xf59e0b);
    });

    // Trigger blade & stretcher bar animation
    const anim = this.turnoutAnims.find((a) => a.nodeId === sw.nodeId && a.side === sw.side);
    if (anim) {
      anim.targetT = anim.isLeftBranch(idx) ? 0 : 1;
    }
  }
}

window.TrackNetwork = TrackNetwork;
