// ---------------------------------------------------------------------------
// 3D Train Model Catalog, Lazy Script Loader & Diorama Normalizer
// Loads optimized *-data.js (GLB base64) files dynamically on demand so both
// HTTP and file:// launch cleanly without CORS issues.
// Target diorama convention:
//   - Forward nose = +Z, Up = +Y, Centered at X=0, Z=0
//   - Wheel treads aligned dead-on Sodor rails (x = ±0.575, gauge = 1.15)
//   - Lowest wheel point rests cleanly on RAIL_TOP_Y = 0.285
// ---------------------------------------------------------------------------

(function () {
  const RAIL_TOP_Y = 0.285;
  const HALF_GAUGE = 0.575;

  // Matched scale constants so multi-car EMU sets align identically between head & middle cars
  const VELARO_SX = 0.70;               // proportional sleek width (~2.18m)
  const VELARO_SYZ = 0.464;             // panto tip ~3.435m right under 3.46m tunnel & 3.52m catenary

  const SHINKANSEN_SX = 2.25;           // body width ~2.12m
  const SHINKANSEN_SY = 2.00;           // natural height (~1.88-2.02m body, not flattened)
  const SHINKANSEN_SYZ = 1.48;          // L ~12.8-13.0m
  const SHINKANSEN_BOGIE_CLEARANCE = 0.36;

  const MARK3_SX = HALF_GAUGE / 0.708;  // ~0.8121
  const MARK3_SYZ = 0.54;               // matches DF4D / HXD3D height cleanly

  const MODEL_SPECS = {
    bluebaby: {
      script: "assets/bluebaby-data.js",
      globalVar: "BLUEBABY_GLB_B64",
      rotY: -Math.PI / 2,
      scaleX: 0.78,
      scaleYZ: 0.72,
      couplerLen: 9.6,
      bogieSpan: 3.1,
      specialFix: "bluebabyWheels",
      hasAnimation: true,
      hasSmoke: true,
      smokeLocal: [0, 3.3, 3.0],
      cabLocal: [0, 2.75, 5.15],
      couplerRole: "loco",
    },
    df4d: {
      script: "assets/df4d-data.js",
      globalVar: "DF4D_GLB_B64",
      rotY: -Math.PI / 2,
      scaleX: 0.0168,
      scaleYZ: 0.0162,
      couplerLen: 13.75,
      bogieSpan: 4.5,
      specialFix: "pbrPolish",
      liveryKind: "df4d",
      cabLocal: [0, 2.85, 7.06],
      couplerRole: "loco",
    },
    nd5: {
      script: "assets/nd5-data.js",
      globalVar: "ND5_GLB_B64",
      rotY: Math.PI / 2, // -X short hood cab front -> +Z
      scaleX: 0.0176,
      scaleYZ: 0.0165,
      couplerLen: 12.42,
      bogieSpan: 4.15,
      specialFix: "nd5GreyBlue",
      cabLocal: [0, 2.75, 6.40],
      couplerRole: "loco",
    },
    hxd3d: {
      script: "assets/hxd3d-data.js",
      globalVar: "HXD3D_GLB_B64",
      rotY: -Math.PI / 2,
      scaleX: 0.0185,
      scaleY: 0.0157,
      scaleZ: 0.0144,
      couplerLen: 12.95,
      bogieSpan: 4.35,
      specialFix: "pbrPolish",
      liveryKind: "hxd3d",
      pantoClamp: { roofY: 3.355, targetTopY: 3.495 },
      cabLocal: [0, 2.85, 6.68],
      couplerRole: "loco",
    },
    emu_velaro_head: {
      script: "assets/emu-velaro-head-data.js",
      globalVar: "EMU_VELARO_HEAD_GLB_B64",
      rotY: 0,
      scaleX: VELARO_SX,
      scaleYZ: VELARO_SYZ,
      couplerLen: 11.10,
      bogieSpan: 3.9,
      specialFix: "pbrPolish",
      cabLocal: [0, 2.15, 4.9],
      couplerRole: "emu_head",
    },
    emu_velaro_car: {
      script: "assets/emu-velaro-car-data.js",
      globalVar: "EMU_VELARO_CAR_GLB_B64",
      rotY: 0,
      scaleX: VELARO_SX,
      scaleYZ: VELARO_SYZ,
      couplerLen: 11.30,
      bogieSpan: 3.9,
      specialFix: "pbrPolish",
      couplerRole: "emu_car",
    },
    emu_velaro_tail: {
      script: "assets/emu-velaro-head-data.js",
      globalVar: "EMU_VELARO_HEAD_GLB_B64",
      rotY: Math.PI,
      scaleX: VELARO_SX,
      scaleYZ: VELARO_SYZ,
      couplerLen: 11.10,
      bogieSpan: 3.9,
      specialFix: "pbrPolish",
      couplerRole: "emu_tail",
    },
    crh_head: {
      script: "assets/emu-velaro-head-data.js",
      globalVar: "EMU_VELARO_HEAD_GLB_B64",
      rotY: 0,
      scaleX: VELARO_SX,
      scaleYZ: VELARO_SYZ,
      couplerLen: 11.10,
      bogieSpan: 3.9,
      specialFix: "crhVelaro",
      cabLocal: [0, 2.15, 4.9],
      couplerRole: "emu_head",
    },
    crh_car: {
      script: "assets/emu-velaro-car-data.js",
      globalVar: "EMU_VELARO_CAR_GLB_B64",
      rotY: 0,
      scaleX: VELARO_SX,
      scaleYZ: VELARO_SYZ,
      couplerLen: 11.30,
      bogieSpan: 3.9,
      specialFix: "crhVelaro",
      couplerRole: "emu_car",
    },
    crh_tail: {
      script: "assets/emu-velaro-head-data.js",
      globalVar: "EMU_VELARO_HEAD_GLB_B64",
      rotY: Math.PI,
      scaleX: VELARO_SX,
      scaleYZ: VELARO_SYZ,
      couplerLen: 11.10,
      bogieSpan: 3.9,
      specialFix: "crhVelaro",
      couplerRole: "emu_tail",
    },
    shinkansen_head: {
      script: "assets/shinkansen-head-data.js",
      globalVar: "SHINKANSEN_HEAD_GLB_B64",
      rotY: Math.PI / 2, // -X duckbill nose -> +Z
      scaleX: SHINKANSEN_SX,
      scaleY: SHINKANSEN_SY,
      scaleYZ: SHINKANSEN_SYZ,
      couplerLen: 12.70,
      bogieSpan: 4.2,
      specialFix: "shinkansenBogies",
      yClearance: SHINKANSEN_BOGIE_CLEARANCE,
      cabLocal: [0, 2.20, 5.4],
      couplerRole: "emu_head",
    },
    shinkansen_car: {
      script: "assets/shinkansen-car-data.js",
      globalVar: "SHINKANSEN_CAR_GLB_B64",
      rotY: Math.PI / 2,
      scaleX: SHINKANSEN_SX,
      scaleY: SHINKANSEN_SY,
      scaleYZ: SHINKANSEN_SYZ,
      couplerLen: 12.95,
      bogieSpan: 4.2,
      specialFix: "shinkansenBogies",
      yClearance: SHINKANSEN_BOGIE_CLEARANCE,
      pantoClamp: { roofY: 2.68, targetTopY: 3.44 },
      couplerRole: "emu_car",
    },
    shinkansen_tail: {
      script: "assets/shinkansen-head-data.js",
      globalVar: "SHINKANSEN_HEAD_GLB_B64",
      rotY: -Math.PI / 2,
      scaleX: SHINKANSEN_SX,
      scaleY: SHINKANSEN_SY,
      scaleYZ: SHINKANSEN_SYZ,
      couplerLen: 12.70,
      bogieSpan: 4.2,
      specialFix: "shinkansenBogies",
      yClearance: SHINKANSEN_BOGIE_CLEARANCE,
      couplerRole: "emu_tail",
    },
    mark3_std: {
      script: "assets/mark3-std-data.js",
      globalVar: "MARK3_S_GLB_B64",
      rotY: 0,
      scaleX: MARK3_SX,
      scaleY: 0.73,
      scaleYZ: MARK3_SYZ,
      couplerLen: 12.55,
      bogieSpan: 4.3,
      specialFix: "pbrPolish",
      liveryKind: "mark3",
      couplerRole: "coach",
    },
    mark3_buffet: {
      script: "assets/mark3-buffet-data.js",
      globalVar: "MARK3_B_GLB_B64",
      rotY: 0,
      scaleX: MARK3_SX,
      scaleY: 0.73,
      scaleYZ: MARK3_SYZ,
      couplerLen: 12.55,
      bogieSpan: 4.3,
      specialFix: "pbrPolish",
      liveryKind: "mark3",
      couplerRole: "coach",
    },
    mark3_gc: {
      script: "assets/mark3-gc-data.js",
      globalVar: "MARK3_GC_GLB_B64",
      rotY: 0,
      scaleX: MARK3_SX,
      scaleY: 0.73,
      scaleYZ: MARK3_SYZ,
      couplerLen: 12.55,
      bogieSpan: 4.3,
      specialFix: "pbrPolish",
      couplerRole: "coach",
    },
    tanker: {
      script: "assets/tanker-data.js",
      globalVar: "TANKER_GLB_B64",
      rotY: -Math.PI / 2,
      scaleX: 0.80,
      scaleYZ: 0.74,
      couplerLen: 10.72,
      bogieSpan: 3.4,
      specialFix: "pbrPolish",
      couplerRole: "freight",
    },
    train_wagon: {
      script: "assets/train-wagon-data.js",
      globalVar: "TRAIN_WAGON_GLB_B64",
      rotY: 0,
      scaleX: 0.0061,
      scaleYZ: 0.0056,
      couplerLen: 12.00,
      bogieSpan: 4.0,
      specialFix: "pbrPolish",
      couplerRole: "freight",
    },
    coal_hopper: {
      script: "assets/coal-hopper-data.js",
      globalVar: "COAL_HOPPER_GLB_B64",
      rotY: 0,
      scaleX: HALF_GAUGE / 0.069,
      scaleYZ: 7.4,
      couplerLen: 7.3,
      bogieSpan: 2.2,
      specialFix: "pbrPolish",
      couplerRole: "freight",
    },
  };

  const LOCO_CATALOG = [
    {
      id: "thomas",
      name: "托马斯 1 号（经典蒸汽 · 手搓模型）",
      shortName: "托马斯蒸汽",
      kind: "steam",
      isProcedural: true,
      headIsPassengerUnit: false,
      length: 4.4,
      bogieSpan: 1.5,
      maxSpeed: 16.5,
      maxReverseSpeed: 9.0,
      defaultCarId: "thomas_coach",
      hasSmoke: true,
      cabLocal: [0, 2.4, 1.8],
    },
    {
      id: "bluebaby",
      name: "DD17「蓝宝宝」蒸汽机车 (3D)",
      shortName: "DD17 蒸汽",
      kind: "steam",
      headIsPassengerUnit: false,
      maxSpeed: 18.0,
      maxReverseSpeed: 10.0,
      defaultCarId: "coal_hopper",
      hasSmoke: true,
    },
    {
      id: "df4d",
      name: "东风 DF4D 内燃机车 (3D)",
      shortName: "DF4D 内燃",
      kind: "diesel",
      headIsPassengerUnit: false,
      maxSpeed: 25.0,
      maxReverseSpeed: 12.0,
      defaultCarId: "mark3_std",
      hasSmoke: false,
      supportsCustomLivery: true,
    },
    {
      id: "nd5",
      name: "ND5 (GE C36-7) 重载内燃机车 (3D)",
      shortName: "ND5 内燃",
      kind: "diesel",
      headIsPassengerUnit: false,
      maxSpeed: 23.0,
      maxReverseSpeed: 11.0,
      defaultCarId: "train_wagon",
      hasSmoke: false,
    },
    {
      id: "hxd3d",
      name: "和谐 HXD3D 电力机车 (3D)",
      shortName: "HXD3D 电力",
      kind: "electric",
      headIsPassengerUnit: false,
      maxSpeed: 42.86, // 180 km/h (HUD km/h = Math.round(speed * 4.2))
      maxReverseSpeed: 21.43, // 90 km/h
      defaultCarId: "mark3_gc",
      hasSmoke: false,
      supportsHxd3dLivery: true,
    },
    {
      id: "crh_head",
      name: "和谐号 CRH3/CRH380B 高速动车组（白底蓝条）(3D)",
      shortName: "CRH 和谐号",
      kind: "emu",
      emuSeries: "crh",
      headIsPassengerUnit: true,
      maxSpeed: 90.48, // 380 km/h (HUD km/h = Math.round(speed * 4.2))
      maxReverseSpeed: 45.24, // 190 km/h
      defaultCarId: "crh_car",
      tailCarId: "crh_tail",
      hasSmoke: false,
    },
    {
      id: "shinkansen_head",
      name: "新干线 N700-3000 高速动车 · 带座头车 (3D)",
      shortName: "N700 新干线",
      kind: "emu",
      emuSeries: "shinkansen",
      headIsPassengerUnit: true,
      maxSpeed: 71.43, // 300 km/h (HUD km/h = Math.round(speed * 4.2))
      maxReverseSpeed: 35.72, // 150 km/h
      defaultCarId: "shinkansen_car",
      tailCarId: "shinkansen_tail",
      hasSmoke: false,
    },
  ];

  const CAR_CATALOG = [
    { id: "mark3_std", name: "Mark 3 标准/一等客车 (3D)", category: "客车", length: 12.55, bogieSpan: 4.3, couplerRole: "coach" },
    { id: "mark3_buffet", name: "Mark 3 餐车涂装 (3D)", category: "客车", length: 12.55, bogieSpan: 4.3, couplerRole: "coach" },
    { id: "mark3_gc", name: "Mark 3 大中央黑橙客车 (3D)", category: "客车", length: 12.55, bogieSpan: 4.3, couplerRole: "coach" },
    { id: "tanker", name: "WSE 液态油罐车 (3D)", category: "货运", length: 10.72, bogieSpan: 3.4, couplerRole: "freight" },
    { id: "train_wagon", name: "工业重型货车 (3D)", category: "货运", length: 12.00, bogieSpan: 4.0, couplerRole: "freight" },
    { id: "coal_hopper", name: "运煤漏斗车 (3D)", category: "货运", length: 7.3, bogieSpan: 2.2, couplerRole: "freight" },
    { id: "crh_head", name: "和谐号 CRH 流线头车（可作重联车头） (3D)", category: "动车组", emuSeries: "crh", length: 11.10, bogieSpan: 3.9, couplerRole: "emu_head" },
    { id: "crh_car", name: "和谐号 CRH 中间客车厢 (3D)", category: "动车组", emuSeries: "crh", length: 11.30, bogieSpan: 3.9, couplerRole: "emu_car" },
    { id: "crh_tail", name: "和谐号 CRH 流线尾车 (3D)", category: "动车组", emuSeries: "crh", length: 11.10, bogieSpan: 3.9, couplerRole: "emu_tail" },
    { id: "shinkansen_head", name: "新干线 N700 流线头车（可作重联车头） (3D)", category: "动车组", emuSeries: "shinkansen", length: 12.70, bogieSpan: 4.2, couplerRole: "emu_head" },
    { id: "shinkansen_car", name: "新干线 N700 中间车 (3D)", category: "动车组", emuSeries: "shinkansen", length: 12.95, bogieSpan: 4.2, couplerRole: "emu_car" },
    { id: "shinkansen_tail", name: "新干线 N700 流线尾车 (3D)", category: "动车组", emuSeries: "shinkansen", length: 12.70, bogieSpan: 4.2, couplerRole: "emu_tail" },
    { id: "thomas_coach", name: "经典橙黄客车（托马斯原配手搓）", category: "经典", isProcedural: true, length: 3.4, bogieSpan: 1.0, couplerRole: "coach" },
  ];

  const LIVERY_ZONES = [
    { key: "roof", label: "车顶", hint: "顶盖 / 额头" },
    { key: "upper", label: "车身上部", hint: "窗区涂装" },
    { key: "stripe", label: "装饰腰线", hint: "腰线 / 路徽" },
    { key: "lower", label: "车身下部", hint: "主体车厢" },
    { key: "skirt", label: "排障器 / 裙板", hint: "底部围裙" },
  ];

  const LIVERY_PRESETS = [
    {
      id: "classic_red",
      name: "经典红白",
      colors: { roof: "#e6e1d6", upper: "#f5eedc", stripe: "#ffffff", lower: "#b01e1e", skirt: "#7a1414" },
    },
    {
      id: "railway_green",
      name: "复古铁路绿",
      colors: { roof: "#2c6b4e", upper: "#3b8763", stripe: "#dcefe2", lower: "#215a3f", skirt: "#1a4631" },
    },
    {
      id: "sky_ocean",
      name: "海韵蓝白",
      colors: { roof: "#f7f9fc", upper: "#7ec8f2", stripe: "#ffffff", lower: "#17488a", skirt: "#122c4f" },
    },
    {
      id: "cr_blue",
      name: "和谐蓝金",
      colors: { roof: "#dde3ea", upper: "#eef3f8", stripe: "#f5b82e", lower: "#1856a8", skirt: "#2b3644" },
    },
    {
      id: "df_orange",
      name: "金橘黑武士",
      colors: { roof: "#2b3038", upper: "#f4f0e6", stripe: "#ff9f1c", lower: "#d95d18", skirt: "#1f242b" },
    },
    {
      id: "plum_gold",
      name: "紫金典藏",
      colors: { roof: "#eae6df", upper: "#f4efe6", stripe: "#e3b341", lower: "#5b2149", skirt: "#2c1828" },
    },
  ];

  const DEFAULT_DF4D_LIVERY = { ...LIVERY_PRESETS[0].colors };
  const DEFAULT_MARK3_LIVERY = { ...LIVERY_PRESETS[1].colors };

  function cloneLivery(colors, fallback) {
    const base = fallback || DEFAULT_DF4D_LIVERY;
    const src = colors && typeof colors === "object" ? colors : {};
    return {
      roof: /^#[0-9a-fA-F]{6}$/.test(src.roof || "") ? src.roof.toLowerCase() : base.roof,
      upper: /^#[0-9a-fA-F]{6}$/.test(src.upper || "") ? src.upper.toLowerCase() : base.upper,
      stripe: /^#[0-9a-fA-F]{6}$/.test(src.stripe || "") ? src.stripe.toLowerCase() : base.stripe,
      lower: /^#[0-9a-fA-F]{6}$/.test(src.lower || "") ? src.lower.toLowerCase() : base.lower,
      skirt: /^#[0-9a-fA-F]{6}$/.test(src.skirt || "") ? src.skirt.toLowerCase() : base.skirt,
    };
  }

  function findMatchingLiveryPresetId(colors) {
    const c = cloneLivery(colors);
    for (const p of LIVERY_PRESETS) {
      if (
        p.colors.roof.toLowerCase() === c.roof &&
        p.colors.upper.toLowerCase() === c.upper &&
        p.colors.stripe.toLowerCase() === c.stripe &&
        p.colors.lower.toLowerCase() === c.lower &&
        p.colors.skirt.toLowerCase() === c.skirt
      ) {
        return p.id;
      }
    }
    return "custom";
  }

  const PRESETS = [
    {
      id: "thomas_classic",
      name: "托马斯经典短编 (3节含车头)",
      locoId: "thomas",
      cars: ["thomas_coach", "thomas_coach"],
    },
    {
      id: "dd17_steam",
      name: "DD17 蒸汽煤油混编 (5节含车头)",
      locoId: "bluebaby",
      cars: ["coal_hopper", "coal_hopper", "tanker", "tanker"],
    },
    {
      id: "df4d_express",
      name: "DF4D 东风红白特快 (4节含车头)",
      locoId: "df4d",
      cars: ["mark3_buffet", "mark3_std", "mark3_std"],
      df4dLivery: { ...LIVERY_PRESETS[0].colors },
      mark3Livery: { ...LIVERY_PRESETS[1].colors },
    },
    {
      id: "df4d_green_express",
      name: "DF4D 复古绿皮特快 (4节含车头)",
      locoId: "df4d",
      cars: ["mark3_buffet", "mark3_std", "mark3_std"],
      df4dLivery: { ...LIVERY_PRESETS[1].colors },
      mark3Livery: { ...LIVERY_PRESETS[1].colors },
    },
    {
      id: "df4d_blue_express",
      name: "DF4D 海韵蓝白特快 (4节含车头)",
      locoId: "df4d",
      cars: ["mark3_buffet", "mark3_std", "mark3_std"],
      df4dLivery: { ...LIVERY_PRESETS[2].colors },
      mark3Livery: { ...LIVERY_PRESETS[2].colors },
    },
    {
      id: "nd5_freight",
      name: "ND5 重载货运专列 (5节含车头)",
      locoId: "nd5",
      cars: ["tanker", "tanker", "train_wagon", "coal_hopper"],
    },
    {
      id: "hxd3d_express",
      name: "和谐 HXD3D 红色城际 (5节含车头)",
      locoId: "hxd3d",
      hxd3dLivery: "red",
      cars: ["mark3_gc", "mark3_gc", "mark3_gc", "mark3_gc"],
    },
    {
      id: "hxd3d_blue_express",
      name: "和谐 HXD3D 蓝色城际 (5节含车头)",
      locoId: "hxd3d",
      hxd3dLivery: "blue",
      cars: ["mark3_gc", "mark3_gc", "mark3_gc", "mark3_gc"],
    },
    {
      id: "emu_crh_8",
      name: "和谐号 CRH 高速动车组 · 单列 (8节含车头)",
      locoId: "crh_head",
      cars: [
        "crh_car", "crh_car", "crh_car",
        "crh_car", "crh_car", "crh_car",
        "crh_tail",
      ],
    },
    {
      id: "emu_crh_16",
      name: "和谐号 CRH 双列重联编组 8+8 (16节含车头)",
      locoId: "crh_head",
      cars: [
        "crh_car", "crh_car", "crh_car",
        "crh_car", "crh_car", "crh_car",
        "crh_tail",
        "crh_head",
        "crh_car", "crh_car", "crh_car",
        "crh_car", "crh_car", "crh_car",
        "crh_tail",
      ],
    },
    {
      id: "shinkansen_n700",
      name: "N700-3000 新干线 · 单列 (8节含车头)",
      locoId: "shinkansen_head",
      cars: [
        "shinkansen_car", "shinkansen_car", "shinkansen_car",
        "shinkansen_car", "shinkansen_car", "shinkansen_car",
        "shinkansen_tail",
      ],
    },
    {
      id: "shinkansen_16",
      name: "N700-3000 新干线 · 双列重联 8+8 (16节含车头)",
      locoId: "shinkansen_head",
      cars: [
        "shinkansen_car", "shinkansen_car", "shinkansen_car",
        "shinkansen_car", "shinkansen_car", "shinkansen_car",
        "shinkansen_tail",
        "shinkansen_head",
        "shinkansen_car", "shinkansen_car", "shinkansen_car",
        "shinkansen_car", "shinkansen_car", "shinkansen_car",
        "shinkansen_tail",
      ],
    },
  ];

  const scriptPromises = new Map();
  const parsedCache = new Map();
  let gltfLoader = null;

  function loadAssetScript(spec) {
    if (window[spec.globalVar]) return Promise.resolve();
    if (scriptPromises.has(spec.script)) return scriptPromises.get(spec.script);

    const p = new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = spec.script;
      el.async = true;
      el.onload = () => {
        if (window[spec.globalVar]) resolve();
        else reject(new Error(`脚本加载完成但未找到 ${spec.globalVar}`));
      };
      el.onerror = () => reject(new Error(`加载模型脚本失败: ${spec.script}`));
      document.head.appendChild(el);
    });
    scriptPromises.set(spec.script, p);
    return p;
  }

  function decodeBase64ToArrayBuffer(b64) {
    const bin = atob(b64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  // Exact vertex-level AABB (avoids Three.Box3 corner-rotation bloat!)
  function computeExactVertexBox(root) {
    root.updateMatrixWorld(true);
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    const v = new THREE.Vector3();

    root.traverse((obj) => {
      if (!obj.isMesh || !obj.geometry) return;
      const pos = obj.geometry.attributes && obj.geometry.attributes.position;
      if (!pos) return;
      const m = obj.matrixWorld;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m);
        if (v.x < min.x) min.x = v.x;
        if (v.y < min.y) min.y = v.y;
        if (v.z < min.z) min.z = v.z;
        if (v.x > max.x) max.x = v.x;
        if (v.y > max.y) max.y = v.y;
        if (v.z > max.z) max.z = v.z;
      }
    });

    const box = new THREE.Box3(min, max);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    return { box, size, center };
  }

  const DF4D_GREY_MATS = new Set([
    "material", "material_0", "0131_Silver", "Color_003", "Color_004", "Color_005",
    "0134_DimGray", "0135_DarkGray", "Color_006", "Color_007", "0136_Charcoal",
  ]);
  const DF4D_PAINT_MATS = new Set([
    "0022_Maroon", "0022_Maroon_2", "0021_DarkRed", "0020_Red",
    "Color_A11", "Color_B11", "0034_Wheat", "0010_Snow",
    "0129_WhiteSmoke", "Color_001", "0040_Peru", "0042_Sienna",
  ]);
  const DF4D_TEX_MATS = new Set([
    "material_6", "material_1", "Metal_Steel_Textured_White_2", "Metal_Steel_Textured_White_3",
  ]);
  const DF4D_STRIPE_MATS = new Set(["0008_LavenderBlush", "Color_A01"]);

  const MARK3_PAINT_MATS = new Set([
    "Roof_Black", "Body", "Cream", "White", "Orange", "Yellow", "material", "material_0",
  ]);

  function applySpecialFixes(root, spec) {
    if (spec.specialFix === "bluebabyWheels") {
      root.traverse((obj) => {
        if (obj.name === "small_wheel01" || obj.name === "small_wheel02") {
          obj.position.y -= 0.013;
        } else if (obj.name === "small_wheel03" || obj.name === "small_wheel04") {
          obj.position.y -= 0.017;
        }
      });
    }

    const isCustomizable = spec.liveryKind === "df4d" || spec.liveryKind === "mark3";

    root.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = true;
      obj.receiveShadow = true;

      if (isCustomizable) {
        if (Array.isArray(obj.material)) {
          obj.material = obj.material.map((mat) => (mat ? mat.clone() : mat));
        } else if (obj.material) {
          obj.material = obj.material.clone();
        }
      }

      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      const trainEnv = window.__trainEnvTexture || null;
      for (const m of mats) {
        if (!m) continue;
        const mName = (m.name || "").toLowerCase();

        // HXD3D red / blue livery tagging
        if (spec.liveryKind === "hxd3d" && (m.name === "Color_A06" || m.name === "Color_A16" || m.name === "Color_A16_1")) {
          m.userData.hxd3dPart = m.name;
        }

        // Tag DF4D materials for 5-zone custom livery shader
        if (spec.liveryKind === "df4d") {
          let role = null;
          let shade = 1.0;
          if (DF4D_TEX_MATS.has(m.name) && m.map && m.map.image) {
            role = "df4dTex";
            m.color.setHex(0xffffff);
          } else if (DF4D_STRIPE_MATS.has(m.name)) {
            role = "df4dStripe";
          } else if (DF4D_PAINT_MATS.has(m.name)) {
            role = "df4dPaint";
          } else if (DF4D_GREY_MATS.has(m.name)) {
            role = "df4dGrey";
            if (m.name === "0135_DarkGray" || m.name === "0136_Charcoal") {
              shade = 0.86;
            }
          }
          if (role) {
            m.userData.liveryRole = role;
            m.userData.liveryShade = shade;
            if (typeof m.metalness === "number") m.metalness = Math.min(m.metalness, 0.14);
            if (typeof m.roughness === "number") m.roughness = Math.max(m.roughness, 0.44);
          }
        }

        // Tag Mark 3 Standard & Buffet materials for 5-zone custom livery shader
        if (spec.liveryKind === "mark3") {
          let role = null;
          if (m.name === "Cream_Clean") {
            role = "mark3CreamClean";
          } else if (MARK3_PAINT_MATS.has(m.name)) {
            role = "mark3Paint";
          }
          if (role) {
            m.userData.liveryRole = role;
            m.userData.liveryShade = 1.0;
            if (typeof m.metalness === "number") m.metalness = Math.min(m.metalness, 0.12);
            if (typeof m.roughness === "number") m.roughness = Math.max(m.roughness, 0.45);
          }
        }

        // ND5 DD17-style weathered charcoal-black & dusty slate-blue livery (matching weathered commuter coaches)
        if (spec.specialFix === "nd5GreyBlue") {
          const nd5Tex = getNd5Dd17Textures();
          if (!obj.geometry.attributes.uv) {
            ensureNd5PlanarUVs(obj.geometry);
          }
          if (m.name === "Color_H02" || m.name === "edge_color39173151255" || m.name === "Color_G14") {
            m.map = nd5Tex.bodyTex;
            m.roughnessMap = nd5Tex.roughTex;
            m.color.setHex(0xffffff);
            if (typeof m.roughness === "number") m.roughness = 0.92;
            if (typeof m.metalness === "number") m.metalness = 0.18;
            m.side = THREE.DoubleSide;
            m.needsUpdate = true;
          } else if (m.name === "Color_D01_7") {
            m.map = nd5Tex.blueTrimTex;
            m.roughnessMap = nd5Tex.roughTex;
            m.color.setHex(0xffffff);
            if (typeof m.roughness === "number") m.roughness = 0.82;
            if (typeof m.metalness === "number") m.metalness = 0.22;
            m.side = THREE.DoubleSide;
            m.needsUpdate = true;
          } else if (m.name === "Southern_Green2") {
            m.map = nd5Tex.darkIronTex;
            m.roughnessMap = nd5Tex.roughTex;
            m.color.setHex(0xc8ccd0);
            if (typeof m.roughness === "number") m.roughness = 0.9;
            if (typeof m.metalness === "number") m.metalness = 0.22;
            m.side = THREE.DoubleSide;
            m.needsUpdate = true;
          } else if (
            m.name === "material" ||
            m.name === "Color_002_4" ||
            m.name === "Color_001_1" ||
            m.name === "Color_004" ||
            m.name === "Color_005" ||
            m.name === "Color_006_1" ||
            m.name === "Color_007_1" ||
            m.name === "Metal_Panel" ||
            m.name === "0135_DarkGray"
          ) {
            m.map = nd5Tex.darkIronTex;
            m.roughnessMap = nd5Tex.roughTex;
            m.color.setHex(0xd6d2ce);
            if (typeof m.roughness === "number") m.roughness = 0.88;
            if (typeof m.metalness === "number") m.metalness = 0.24;
            m.side = THREE.DoubleSide;
            m.needsUpdate = true;
          } else if (m.name === "WarmGray1") {
            m.color.setHex(0x888d94);
            if (typeof m.roughness === "number") m.roughness = 0.78;
          } else if (m.name === "Color_008_14") {
            m.color.setHex(0x1b2128);
            if (typeof m.roughness === "number") m.roughness = 0.22;
            if (typeof m.metalness === "number") m.metalness = 0.25;
          } else if (
            m.name === "Metal_Steel_Textured_White" ||
            m.name === "Metal_Seamed_1" ||
            m.name === "material_63" ||
            m.name === "Metal_Rough_1" ||
            m.name === "Metal_Rough_2" ||
            m.name === "Metal_Seamed" ||
            m.name === "material_69" ||
            m.name === "Metal_Aluminum_Anodized" ||
            m.name === "Metal_Rough_5"
          ) {
            m.color.setHex(0x524c48);
            if (typeof m.roughness === "number") m.roughness = 0.86;
            if (typeof m.metalness === "number") m.metalness = 0.22;
          }
        }

        // Recolor ALL Velaro outer hull textures to CRH Porcelain White & Royal Blue (removing ATA text & upper roof windows)
        if (spec.specialFix === "crhVelaro") {
          if (m.name === "outside" || m.name === "outside2" || m.name === "texture" || m.name === "texture2") {
            if (m.map && m.map.image) {
              m.map = createCrhVelaroSkinTexture(m.map);
            }
            if (m.name === "outside" || m.name === "outside2") {
              m.color.setHex(0xffffff);
              if (typeof m.metalness === "number") m.metalness = 0.08;
              if (typeof m.roughness === "number") m.roughness = 0.28;
            } else {
              if (typeof m.metalness === "number") m.metalness = 0.05;
              if (typeof m.roughness === "number") m.roughness = 0.34;
            }
          } else if (m.name === "Material.029" || m.name === "Material.016" || m.name === "glass2") {
            // Sleek CRH smoked black window glass instead of green-tinted glass
            m.color.setHex(0x0b1017);
            if (typeof m.opacity === "number") m.opacity = 0.94;
            if (typeof m.roughness === "number") m.roughness = 0.14;
            if (typeof m.metalness === "number") m.metalness = 0.26;
          }
        }

        // Preserve original carbody paint & glass transparency untouched!
        // Only supply gentle IBL reflection & cap excessive metalness on dark/metallic parts
        // so textured metallic GLBs never go pitch black without shifting original colors.
        if (mName.includes("light")) {
          m.emissive = new THREE.Color(0xffe6aa);
          m.emissiveIntensity = 0.4;
        } else if (mName.includes("glass") || mName === "material.029" || mName === "material.016" || m.transparent) {
          if (trainEnv && "envMap" in m) {
            m.envMap = trainEnv;
            m.envMapIntensity = 0.65;
          }
        } else if (mName.includes("chrome") || mName.includes("steel") || mName === "metall") {
          if (trainEnv && "envMap" in m) {
            m.envMap = trainEnv;
            m.envMapIntensity = 0.9;
          }
        } else if (typeof m.metalness === "number" && m.metalness > 0.12) {
          if (m.metalness > 0.42) m.metalness = 0.42;
          if (typeof m.roughness === "number" && m.roughness < 0.34) m.roughness = 0.34;
          if (trainEnv && "envMap" in m) {
            m.envMap = trainEnv;
            m.envMapIntensity = 0.55;
          }
        }
      }
    });
  }

  // Procedural 3D Bogies + Flanged Wheels on Sodor rails (±0.575, wheel bottom = RAIL_TOP_Y)
  function createBogieTruck(zPos) {
    const bogie = new THREE.Group();
    bogie.position.set(0, RAIL_TOP_Y, zPos);

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x353c46, roughness: 0.55, metalness: 0.4 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0xbec7d4, roughness: 0.25, metalness: 0.78 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x282d35, roughness: 0.65, metalness: 0.3 });

    const wheelR = 0.185;
    const axleZ = [-0.68, 0.68];

    for (const az of axleZ) {
      const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, HALF_GAUGE * 2, 10), darkMat);
      axle.rotation.z = Math.PI / 2;
      axle.position.set(0, wheelR, az);
      bogie.add(axle);

      for (const side of [-1, 1]) {
        const tread = new THREE.Mesh(new THREE.CylinderGeometry(wheelR, wheelR, 0.085, 16), steelMat);
        tread.rotation.z = Math.PI / 2;
        tread.position.set(side * HALF_GAUGE, wheelR, az);
        tread.castShadow = true;
        bogie.add(tread);

        const flange = new THREE.Mesh(new THREE.CylinderGeometry(wheelR + 0.04, wheelR + 0.04, 0.025, 16), steelMat);
        flange.rotation.z = Math.PI / 2;
        flange.position.set(side * (HALF_GAUGE - 0.045), wheelR, az);
        bogie.add(flange);

        const axleBox = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.18), frameMat);
        axleBox.position.set(side * (HALF_GAUGE + 0.11), wheelR + 0.02, az);
        bogie.add(axleBox);
      }
    }

    // Sideframes & bolster
    for (const side of [-1, 1]) {
      const sideFrame = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.15, 1.85), frameMat);
      sideFrame.position.set(side * (HALF_GAUGE + 0.1), wheelR + 0.05, 0);
      sideFrame.castShadow = true;
      bogie.add(sideFrame);
    }
    const bolster = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.14, 0.48), frameMat);
    bolster.position.set(0, wheelR + 0.14, 0);
    bogie.add(bolster);

    return bogie;
  }

  let cachedNd5Dd17Textures = null;

  function ensureNd5PlanarUVs(geometry) {
    const pos = geometry.attributes && geometry.attributes.position;
    if (!pos) return;
    const uvs = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      uvs[i * 2] = (x + y * 0.72 + 430) / 145;
      uvs[i * 2 + 1] = Math.max(0.002, Math.min(0.998, (z - 6) / 181));
    }
    geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  }

  function makeWeatherSeededRand(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function getNd5Dd17Textures() {
    if (cachedNd5Dd17Textures) return cachedNd5Dd17Textures;
    const S = 512;
    const rand = makeWeatherSeededRand(170017);

    // Precompute smooth multi-octave grime/rust field for DD17-style weathered patina
    const makeTexture = (paintFn, wrapS, isLinear = false) => {
      const c = document.createElement("canvas");
      c.width = S;
      c.height = S;
      const ctx = c.getContext("2d");
      paintFn(ctx, S);
      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = wrapS;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.anisotropy = 4;
      if (!isLinear && "SRGBColorSpace" in THREE && "colorSpace" in tex) {
        tex.colorSpace = THREE.SRGBColorSpace;
      } else if (!isLinear && "sRGBEncoding" in THREE && "encoding" in tex) {
        tex.encoding = THREE.sRGBEncoding;
      }
      tex.needsUpdate = true;
      return tex;
    };

    const bodyTex = makeTexture((ctx, sz) => {
      const imgData = ctx.createImageData(sz, sz);
      const d = imgData.data;
      for (let py = 0; py < sz; py++) {
        const ny = py / sz; // 0 = roof top (flipY=true, v=1), 1 = lower skirt (v=0)
        for (let px = 0; px < sz; px++) {
          const nx = px / sz;
          const idx = (py * sz + px) * 4;
          const n1 = Math.sin(nx * Math.PI * 6 + ny * 5) * Math.cos(ny * 14 - nx * Math.PI * 4);
          const n2 = Math.sin(nx * Math.PI * 18 + 1.3) * Math.sin(ny * 29 + 0.7);
          const grain = (rand() - 0.5) * 18;
          const drip = Math.max(0, Math.sin(nx * Math.PI * 16 + Math.sin(ny * 4))) * Math.exp(-Math.abs(ny - 0.24) * 5);
          const rustPatch = Math.max(0, Math.sin(nx * Math.PI * 4 + 0.8) * Math.cos(ny * 9 + 1.1));

          let r, g, b;
          if (ny < 0.165) {
            // Weathered soot + oxidized rust patina roof (matches ER2 coach roof)
            const t = rustPatch * 0.7 + n1 * 0.2;
            r = 58 + t * 44 + grain * 0.8;
            g = 46 + t * 18 + grain * 0.6;
            b = 43 + t * 8 + grain * 0.6;
          } else if (ny < 0.555) {
            // Primary weathered charcoal-ash dark steel (灰黑色为主)
            const soot = drip * 16 + (ny > 0.525 ? 10 : 0);
            r = 63 + n1 * 7 + n2 * 4 - soot + rustPatch * 8 + grain * 0.75;
            g = 67 + n1 * 7 + n2 * 4 - soot + rustPatch * 3 + grain * 0.75;
            b = 73 + n1 * 8 + n2 * 4 - soot + grain * 0.75;
          } else {
            // Secondary dusty slate/grey-blue skirt with corrugated ribbing (灰蓝色为辅)
            const rib = Math.sin((ny - 0.555) * 95) * 7;
            const mudFade = Math.max(0, (ny - 0.82) / 0.18) * 18;
            const rustChip = rustPatch > 0.72 && rand() > 0.7 ? 1 : 0;
            if (rustChip) {
              r = 76 + grain * 0.5;
              g = 55 + grain * 0.5;
              b = 46 + grain * 0.5;
            } else {
              r = 56 + n1 * 6 + rib - mudFade + grain * 0.7;
              g = 82 + n1 * 7 + rib - mudFade + grain * 0.7;
              b = 110 + n1 * 9 + rib - mudFade * 1.1 + grain * 0.7;
            }
          }
          d[idx] = Math.max(18, Math.min(220, Math.round(r)));
          d[idx + 1] = Math.max(18, Math.min(220, Math.round(g)));
          d[idx + 2] = Math.max(18, Math.min(220, Math.round(b)));
          d[idx + 3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);

      // Vertical panel seams, gutter shadow, and downward rain grime streaks
      ctx.strokeStyle = "rgba(22, 24, 28, 0.58)";
      ctx.lineWidth = 2;
      for (let x = 64; x < sz; x += 128) {
        ctx.beginPath();
        ctx.moveTo(x, sz * 0.14);
        ctx.lineTo(x, sz * 0.94);
        ctx.stroke();
      }
      const gutterGrad = ctx.createLinearGradient(0, sz * 0.15, 0, sz * 0.25);
      gutterGrad.addColorStop(0, "rgba(24, 20, 18, 0.55)");
      gutterGrad.addColorStop(1, "rgba(24, 20, 18, 0)");
      ctx.fillStyle = gutterGrad;
      ctx.fillRect(0, sz * 0.15, sz, sz * 0.1);

      for (let k = 0; k < 42; k++) {
        const sx = rand() * sz;
        const sy = sz * (0.14 + rand() * 0.45);
        const sh = 24 + rand() * 90;
        const sg = ctx.createLinearGradient(sx, sy, sx, sy + sh);
        sg.addColorStop(0, rand() > 0.4 ? "rgba(28, 26, 25, 0.34)" : "rgba(86, 52, 38, 0.28)");
        sg.addColorStop(1, "rgba(28, 26, 25, 0)");
        ctx.fillStyle = sg;
        ctx.fillRect(sx, sy, 2 + rand() * 4, sh);
      }
    }, THREE.RepeatWrapping);

    const blueTrimTex = makeTexture((ctx, sz) => {
      const imgData = ctx.createImageData(sz, sz);
      const d = imgData.data;
      for (let py = 0; py < sz; py++) {
        for (let px = 0; px < sz; px++) {
          const idx = (py * sz + px) * 4;
          const n = Math.sin((px / sz) * Math.PI * 8) * Math.cos((py / sz) * 14) * 8;
          const grain = (rand() - 0.5) * 16;
          d[idx] = Math.max(20, Math.min(200, Math.round(62 + n + grain)));
          d[idx + 1] = Math.max(20, Math.min(200, Math.round(94 + n + grain)));
          d[idx + 2] = Math.max(20, Math.min(220, Math.round(126 + n + grain)));
          d[idx + 3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);
    }, THREE.RepeatWrapping);

    const darkIronTex = makeTexture((ctx, sz) => {
      const imgData = ctx.createImageData(sz, sz);
      const d = imgData.data;
      for (let py = 0; py < sz; py++) {
        for (let px = 0; px < sz; px++) {
          const idx = (py * sz + px) * 4;
          const n = Math.sin((px / sz) * Math.PI * 10 + (py / sz) * 8) * 7;
          const rust = Math.max(0, Math.sin((px / sz) * Math.PI * 4) * Math.cos((py / sz) * 6)) * 14;
          const grain = (rand() - 0.5) * 16;
          d[idx] = Math.max(16, Math.min(180, Math.round(46 + n + rust + grain)));
          d[idx + 1] = Math.max(16, Math.min(180, Math.round(45 + n + rust * 0.4 + grain)));
          d[idx + 2] = Math.max(16, Math.min(180, Math.round(47 + n + grain)));
          d[idx + 3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);
    }, THREE.RepeatWrapping);

    const roughTex = makeTexture((ctx, sz) => {
      const imgData = ctx.createImageData(sz, sz);
      const d = imgData.data;
      for (let i = 0; i < sz * sz; i++) {
        const v = Math.max(175, Math.min(248, Math.round(212 + (rand() - 0.5) * 48)));
        const idx = i * 4;
        d[idx] = v;
        d[idx + 1] = v;
        d[idx + 2] = v;
        d[idx + 3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);
    }, THREE.RepeatWrapping, true);

    cachedNd5Dd17Textures = { bodyTex, blueTrimTex, darkIronTex, roughTex };
    return cachedNd5Dd17Textures;
  }

  let cachedCrhSideTex = null;
  let cachedCrhNoseTex = null;
  const crhVelaroSkinCache = new WeakMap();

  function createCrhVelaroSkinTexture(origTex) {
    const img = origTex.image;
    if (crhVelaroSkinCache.has(img)) return crhVelaroSkinCache.get(img);
    const w = img.width || 1024;
    const h = img.height || 1024;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);

    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;

    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        // Exterior skin UV zones on Velaro sheet (main exterior body bottom band + nose/roof hatches)
        const inBottomHull = py >= Math.floor(h * 0.742);
        const inNoseRoof = py >= Math.floor(h * 0.332) && py <= Math.floor(h * 0.408) && px <= Math.floor(w * 0.212);
        const inTopHood = py <= Math.floor(h * 0.145) && px >= Math.floor(w * 0.12) && px <= Math.floor(w * 0.415);
        if (!inBottomHull && !inNoseRoof && !inTopHood) continue;

        const idx = (py * w + px) * 4;

        // 0. Replace upper-deck black roof window cutouts (x >= 0.235, y >= 0.875) with clean CRH Porcelain White roof
        if (px >= Math.floor(w * 0.235) && py >= Math.floor(h * 0.875)) {
          d[idx] = 246;
          d[idx + 1] = 249;
          d[idx + 2] = 253;
          continue;
        }

        const r = d[idx];
        const g = d[idx + 1];
        const b = d[idx + 2];

        // 1. Erase "ATA" lettering & blue dotted strip cleanly into porcelain white
        const inAtaBox =
          px >= Math.floor(w * 0.074) &&
          px <= Math.floor(w * 0.224) &&
          py >= Math.floor(h * 0.785) &&
          py <= Math.floor(h * 0.854);
        if (inAtaBox && r + g + b > 140 && (b - r > 18 || (r > 110 && Math.abs(b - r) <= 26))) {
          d[idx] = 246;
          d[idx + 1] = 249;
          d[idx + 2] = 253;
          continue;
        }

        // 1b. Replace bulky diagonal rear blue wedge (x >= 0.880, y >= 0.808) with porcelain white,
        // keeping only the sleek horizontal waist stripe below it (0.786..0.808)
        if (px >= Math.floor(w * 0.880) && py >= Math.floor(h * 0.808) && py <= Math.floor(h * 0.875)) {
          if (b - r >= 22 || (r >= 95 && Math.abs(r - g) <= 24)) {
            d[idx] = 246;
            d[idx + 1] = 249;
            d[idx + 2] = 253;
            continue;
          }
        }

        // 2. Deepen exterior blue waist stripe / nose chevrons into CRH Royal Blue (#0052b8)
        if (b - r >= 26 && b >= 85) {
          d[idx] = 0;
          d[idx + 1] = 82;
          d[idx + 2] = 184;
          continue;
        }

        // 3. Transform neutral cool silver-grey paint into CRH Porcelain White while keeping seams/rivets crisp
        if (r >= 102 && g >= 102 && b >= 102 && Math.abs(r - g) <= 18 && Math.abs(b - g) <= 24) {
          const luma = 0.299 * r + 0.587 * g + 0.114 * b;
          let whiteBase;
          if (luma >= 145) {
            whiteBase = 240 + ((luma - 145) / 65) * 11;
          } else {
            whiteBase = 195 + ((luma - 102) / 43) * 45;
          }
          const wb = Math.max(185, Math.min(252, Math.round(whiteBase)));
          d[idx] = wb;
          d[idx + 1] = Math.min(254, wb + 2);
          d[idx + 2] = Math.min(255, wb + 4);
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);

    const newTex = new THREE.CanvasTexture(canvas);
    newTex.flipY = origTex.flipY;
    newTex.wrapS = origTex.wrapS;
    newTex.wrapT = origTex.wrapT;
    if ("encoding" in origTex) newTex.encoding = origTex.encoding;
    if ("colorSpace" in origTex) newTex.colorSpace = origTex.colorSpace;
    newTex.anisotropy = 4;
    newTex.needsUpdate = true;
    crhVelaroSkinCache.set(img, newTex);
    return newTex;
  }

  function drawChinaRailwayEmblem(ctx, cx, cy, r) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = "#c81e1e";
    ctx.lineWidth = r * 0.17;
    ctx.stroke();

    // Inner stylized "工" / rail cross-section + "人" arc
    ctx.strokeStyle = "#c81e1e";
    ctx.lineWidth = r * 0.19;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.62);
    ctx.lineTo(cx, cy + r * 0.62);
    ctx.moveTo(cx - r * 0.56, cy + r * 0.62);
    ctx.lineTo(cx + r * 0.56, cy + r * 0.62);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.14, r * 0.58, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.restore();
  }

  function createCrhSideDecalTexture() {
    if (cachedCrhSideTex) return cachedCrhSideTex;
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 192;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Subtle crisp porcelain backing pill only behind lettering (mostly transparent outside)
    drawChinaRailwayEmblem(ctx, 118, 96, 56);

    ctx.textBaseline = "middle";
    ctx.fillStyle = "#0052b8";
    ctx.font = "italic 900 84px 'Segoe UI', Arial, sans-serif";
    ctx.fillText("CRH", 204, 100);

    // Sleek slanted blue divider bar
    ctx.fillStyle = "#0052b8";
    ctx.beginPath();
    ctx.moveTo(430, 44);
    ctx.lineTo(444, 44);
    ctx.lineTo(426, 148);
    ctx.lineTo(412, 148);
    ctx.closePath();
    ctx.fill();

    // "和谐号" heavy Chinese typography
    ctx.fillStyle = "#003f96";
    ctx.font = "900 88px 'Microsoft YaHei', 'PingFang SC', 'SimHei', sans-serif";
    ctx.fillText("和谐号", 468, 98);

    // Thin CRH sky-blue underline accent
    ctx.fillStyle = "#0066d6";
    ctx.fillRect(204, 152, 578, 8);

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;
    cachedCrhSideTex = tex;
    return tex;
  }

  function createCrhNoseBadgeTexture() {
    if (cachedCrhNoseTex) return cachedCrhNoseTex;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawChinaRailwayEmblem(ctx, 256, 78, 52);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#0052b8";
    ctx.font = "italic 900 92px 'Segoe UI', Arial, sans-serif";
    ctx.fillText("CRH", 256, 188);

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;
    cachedCrhNoseTex = tex;
    return tex;
  }

  function convertUpperGlassToWhiteRoof(wrapper) {
    wrapper.updateMatrixWorld(true);
    const targets = [];
    wrapper.traverse((obj) => {
      if (!obj.isMesh || !obj.geometry || !obj.parent) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      if (mats.some((m) => m && m.name === "Material.016")) {
        targets.push(obj);
      }
    });
    if (targets.length === 0) return;

    const whiteRoofMat = new THREE.MeshStandardMaterial({
      color: 0xf6f9fd,
      roughness: 0.28,
      metalness: 0.08,
      side: THREE.DoubleSide,
    });
    const vA = new THREE.Vector3();
    const vB = new THREE.Vector3();
    const vC = new THREE.Vector3();

    for (const mesh of targets) {
      const src = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
      const posAttr = src.attributes.position;
      if (!posAttr || posAttr.count < 3) continue;
      const normAttr = src.attributes.normal || null;
      const uvAttr = src.attributes.uv || null;

      const lowerPos = [];
      const lowerNorm = [];
      const lowerUv = [];
      const upperPos = [];
      const upperNorm = [];
      const upperUv = [];

      const pushVert = (destP, destN, destU, idx) => {
        destP.push(posAttr.getX(idx), posAttr.getY(idx), posAttr.getZ(idx));
        if (normAttr) destN.push(normAttr.getX(idx), normAttr.getY(idx), normAttr.getZ(idx));
        if (uvAttr) destU.push(uvAttr.getX(idx), uvAttr.getY(idx));
      };

      for (let i = 0; i + 2 < posAttr.count; i += 3) {
        vA.fromBufferAttribute(posAttr, i).applyMatrix4(mesh.matrixWorld);
        vB.fromBufferAttribute(posAttr, i + 1).applyMatrix4(mesh.matrixWorld);
        vC.fromBufferAttribute(posAttr, i + 2).applyMatrix4(mesh.matrixWorld);
        const avgY = (vA.y + vB.y + vC.y) / 3;
        if (avgY > 2.04) {
          pushVert(upperPos, upperNorm, upperUv, i);
          pushVert(upperPos, upperNorm, upperUv, i + 1);
          pushVert(upperPos, upperNorm, upperUv, i + 2);
        } else {
          pushVert(lowerPos, lowerNorm, lowerUv, i);
          pushVert(lowerPos, lowerNorm, lowerUv, i + 1);
          pushVert(lowerPos, lowerNorm, lowerUv, i + 2);
        }
      }

      if (upperPos.length === 0) continue;

      const buildGeom = (p, n, u) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
        if (n.length === p.length) g.setAttribute("normal", new THREE.Float32BufferAttribute(n, 3));
        else g.computeVertexNormals();
        if (u.length > 0) g.setAttribute("uv", new THREE.Float32BufferAttribute(u, 2));
        return g;
      };

      const upperMesh = new THREE.Mesh(buildGeom(upperPos, upperNorm, upperUv), whiteRoofMat);
      upperMesh.position.copy(mesh.position);
      upperMesh.quaternion.copy(mesh.quaternion);
      upperMesh.scale.copy(mesh.scale);
      upperMesh.castShadow = true;
      upperMesh.receiveShadow = true;
      mesh.parent.add(upperMesh);

      if (lowerPos.length > 0) {
        mesh.geometry = buildGeom(lowerPos, lowerNorm, lowerUv);
      } else {
        mesh.visible = false;
      }
    }
  }

  function decorateCrhVelaroWrapper(wrapper, orientedGroup, spec) {
    convertUpperGlassToWhiteRoof(wrapper);
    wrapper.updateMatrixWorld(true);
    const raycaster = new THREE.Raycaster();
    const role = spec.couplerRole || "emu_car";
    const isEnd = role === "emu_head" || role === "emu_tail";
    const dirZ = role === "emu_tail" ? -1 : 1;

    const hitSide = (fromX, yVal, zVal, fallback) => {
      raycaster.set(new THREE.Vector3(fromX, yVal, zVal), new THREE.Vector3(fromX > 0 ? -1 : 1, 0, 0));
      const hits = raycaster.intersectObject(orientedGroup, true);
      if (hits.length > 0) {
        const h = hits[0];
        const nVec = h.face
          ? h.face.normal.clone().transformDirection(h.object.matrixWorld).normalize()
          : new THREE.Vector3(fromX > 0 ? 1 : -1, 0, 0);
        return { point: h.point.clone(), normal: nVec };
      }
      return {
        point: new THREE.Vector3(fallback, yVal, zVal),
        normal: new THREE.Vector3(fromX > 0 ? 1 : -1, 0, 0),
      };
    };

    // 1. Non-mirrored "CRH [路徽] 和谐号" side decals on BOTH left and right white upper headers
    // (above the main black window band, matching real CRH Photos 2 & 3)
    const sideMat = new THREE.MeshStandardMaterial({
      map: createCrhSideDecalTexture(),
      transparent: true,
      alphaTest: 0.15,
      roughness: 0.35,
      metalness: 0.05,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const mountSideDecal = (decalZ, decalY, w, h) => {
      const sideGeo = new THREE.PlaneGeometry(w, h);
      for (const [fromX, fallbackX] of [[3.5, 1.14], [-3.5, -1.14]]) {
        const hit = hitSide(fromX, decalY, decalZ, fallbackX);
        const nVec = hit.normal;
        const upVec = new THREE.Vector3(0, 1, 0).projectOnPlane(nVec).normalize();
        const rightVec = new THREE.Vector3().crossVectors(upVec, nVec).normalize();
        const basis = new THREE.Matrix4().makeBasis(rightVec, upVec, nVec);

        const panel = new THREE.Mesh(sideGeo, sideMat);
        panel.quaternion.setFromRotationMatrix(basis);
        panel.position.copy(hit.point).addScaledVector(nVec, 0.016);
        wrapper.add(panel);
      }
    };

    if (isEnd) {
      mountSideDecal(-dirZ * 0.45, 1.88, 2.25, 0.29);
      mountSideDecal(dirZ * 3.10, 0.88, 1.38, 0.24);
    } else {
      mountSideDecal(0.0, 1.88, 2.35, 0.30);
    }

    // 2. Nose hood/forehead "CRH" + China Railway Emblem badge on head/tail cars
    if (isEnd) {
      raycaster.set(new THREE.Vector3(0, 4.0, dirZ * 4.15), new THREE.Vector3(0, -1, 0));
      const noseHits = raycaster.intersectObject(orientedGroup, true);
      if (noseHits.length > 0) {
        const hit = noseHits[0];
        const nVec = hit.face
          ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize()
          : new THREE.Vector3(0, 0.72, 0.69 * dirZ).normalize();
        if (nVec.y < 0) nVec.negate();

        const upVec = new THREE.Vector3(0, 1, 0).projectOnPlane(nVec);
        if (upVec.lengthSq() < 1e-4) {
          upVec.set(0, 0, -dirZ).projectOnPlane(nVec);
        }
        upVec.normalize();
        const rightVec = new THREE.Vector3().crossVectors(upVec, nVec).normalize();
        const basis = new THREE.Matrix4().makeBasis(rightVec, upVec, nVec);

        const noseMat = new THREE.MeshStandardMaterial({
          map: createCrhNoseBadgeTexture(),
          transparent: true,
          alphaTest: 0.15,
          roughness: 0.35,
          metalness: 0.05,
          polygonOffset: true,
          polygonOffsetFactor: -3,
          polygonOffsetUnits: -3,
        });
        const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.38), noseMat);
        badge.quaternion.setFromRotationMatrix(basis);
        badge.position.copy(hit.point).addScaledVector(nVec, 0.016);
        wrapper.add(badge);
      }
    }
  }

  function normalizeModelScene(rawScene, spec) {
    const inner = rawScene;
    applySpecialFixes(inner, spec);

    const orientedGroup = new THREE.Group();
    if (spec.rotY) inner.rotation.y = spec.rotY;
    orientedGroup.add(inner);

    const sx = spec.scaleX || 1;
    const syz = spec.scaleYZ || sx;
    const sy = spec.scaleY || syz;
    const sz = spec.scaleZ || syz;
    orientedGroup.scale.set(sx, sy, sz);

    const { box, size, center } = computeExactVertexBox(orientedGroup);
    const bottomY = RAIL_TOP_Y + (spec.yClearance || 0);

    orientedGroup.position.set(
      -center.x,
      bottomY - box.min.y,
      -center.z
    );

    const wrapper = new THREE.Group();
    wrapper.add(orientedGroup);

    // Mount real 3D bogies & wheels on Sodor rails for Shinkansen cars
    if (spec.specialFix === "shinkansenBogies") {
      const bSpan = spec.bogieSpan || 3.9;
      wrapper.add(createBogieTruck(bSpan));
      wrapper.add(createBogieTruck(-bSpan));
    }

    if (spec.specialFix === "crhVelaro") {
      decorateCrhVelaroWrapper(wrapper, orientedGroup, spec);
    }

    wrapper.updateMatrixWorld(true);

    if (spec.pantoClamp) {
      clampRoofAttachments(wrapper, spec.pantoClamp);
    }

    if (spec.liveryKind === "df4d" || spec.liveryKind === "mark3") {
      bakeLiveryAttributes(wrapper, spec);
    }

    if (spec.specialFix === "crhVelaro") {
      setupCrhVisualAndDoorShaders(wrapper, spec);
    }

    const finalBox = spec.pantoClamp ? computeExactVertexBox(wrapper) : null;

    return {
      wrapper,
      size: finalBox ? finalBox.size : size,
      couplerLen: spec.couplerLen || size.z * 0.98,
      bogieSpan: spec.bogieSpan || size.z * 0.34,
    };
  }

  function hasAncestorPrefix(obj, root, prefix) {
    let cur = obj;
    while (cur && cur !== root) {
      const clean = (cur.name || "").replace(/\./g, "");
      if (clean.startsWith(prefix)) return true;
      cur = cur.parent;
    }
    return false;
  }

  function setupCrhVisualAndDoorShaders(wrapper, spec) {
    const syz = spec.scaleYZ || 0.464;
    const sx = spec.scaleX || 0.70;
    const slideMagNeg = 0.748 * syz;
    const slideMagPos = 0.749 * syz;
    const closeStepX = -0.22 * sx;

    const doorZones = [];
    wrapper.traverse((obj) => {
      const clean = (obj.name || "").replace(/\./g, "");
      if (!clean) return;
      const isOpenInGlb = clean.startsWith("doors5002");
      const isClosedInGlb =
        clean.startsWith("doors4") ||
        clean.startsWith("doors5_") ||
        clean.startsWith("doors5003");
      if (!isOpenInGlb && !isClosedInGlb) return;
      const dBox = new THREE.Box3().setFromObject(obj);
      if (!dBox.isEmpty()) {
        doorZones.push({
          centerZ: (dBox.min.z + dBox.max.z) * 0.5,
          mode: isOpenInGlb ? "close" : "open",
        });
      }
    });

    const vLocal = new THREE.Vector3();
    const vWorld = new THREE.Vector3();
    const vTarget = new THREE.Vector3();
    const invWorld = new THREE.Matrix4();

    wrapper.traverse((obj) => {
      if (!obj.isMesh || !obj.geometry || !obj.geometry.attributes.position) return;

      const underPant = hasAncestorPrefix(obj, wrapper, "pant");
      const isDoorLeaf =
        hasAncestorPrefix(obj, wrapper, "doors5002") ||
        hasAncestorPrefix(obj, wrapper, "doors5003") ||
        hasAncestorPrefix(obj, wrapper, "doors4") ||
        hasAncestorPrefix(obj, wrapper, "doors5_");
      const isDoorGlass =
        hasAncestorPrefix(obj, wrapper, "glass_doors001") ||
        hasAncestorPrefix(obj, wrapper, "glass_doors_");
      const isDoorStep = hasAncestorPrefix(obj, wrapper, "stair2001");
      const hasDoorAnim = doorZones.length > 0 && (isDoorLeaf || isDoorGlass || isDoorStep);

      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      let hasAnyRoofMat = false;
      const clonedMats = mats.map((m) => {
        if (!m) return m;
        const isRoofPaintMat =
          m.name === "outside" ||
          m.name === "outside2" ||
          m.name === "texture2" ||
          (m.name === "texture" && !underPant);
        const isUpperGlassMat = m.name === "Material.016";
        const isRoofMat = isRoofPaintMat || isUpperGlassMat;
        if (!isRoofMat && !hasDoorAnim) return m;
        if (isRoofMat) hasAnyRoofMat = true;
        const cm = m.clone();
        cm.userData.crhRoofFix = isRoofPaintMat ? "paint" : (isUpperGlassMat ? "glass" : false);
        cm.userData.crhDoorAnim = hasDoorAnim;
        return cm;
      });

      if (!hasAnyRoofMat && !hasDoorAnim) return;
      obj.material = Array.isArray(obj.material) ? clonedMats : clonedMats[0];

      if (hasDoorAnim) {
        obj.geometry = obj.geometry.index ? obj.geometry.toNonIndexed() : obj.geometry.clone();
      } else {
        obj.geometry = obj.geometry.clone();
      }

      const pos = obj.geometry.attributes.position;
      const count = pos.count;
      const crhWorldY = hasAnyRoofMat ? new Float32Array(count) : null;
      const doorCloseDelta = hasDoorAnim ? new Float32Array(count * 3) : null;
      const doorOpenDelta = hasDoorAnim ? new Float32Array(count * 3) : null;
      invWorld.copy(obj.matrixWorld).invert();

      const writeDelta = (arr, idx, vx, vy, vz, lx, ly, lz, dx, dz) => {
        vTarget.set(vx + dx, vy, vz + dz).applyMatrix4(invWorld);
        arr[idx * 3] = vTarget.x - lx;
        arr[idx * 3 + 1] = vTarget.y - ly;
        arr[idx * 3 + 2] = vTarget.z - lz;
      };

      if (hasDoorAnim) {
        for (let t = 0; t + 2 < count; t += 3) {
          let sumX = 0;
          let sumZ = 0;
          const wPts = [];
          const lPts = [];
          for (let k = 0; k < 3; k++) {
            vLocal.fromBufferAttribute(pos, t + k);
            vWorld.copy(vLocal).applyMatrix4(obj.matrixWorld);
            lPts.push([vLocal.x, vLocal.y, vLocal.z]);
            wPts.push([vWorld.x, vWorld.y, vWorld.z]);
            if (crhWorldY) crhWorldY[t + k] = vWorld.y;
            sumX += vWorld.x;
            sumZ += vWorld.z;
          }
          const cx = sumX / 3;
          const cz = sumZ / 3;

          if (isDoorStep) {
            const closeZone = doorZones.find((z) => z.mode === "close" && Math.abs(cz - z.centerZ) < 1.25 * syz);
            if (closeZone) {
              for (let k = 0; k < 3; k++) {
                if (wPts[k][0] > 1.18 * sx) {
                  writeDelta(
                    doorCloseDelta,
                    t + k,
                    wPts[k][0], wPts[k][1], wPts[k][2],
                    lPts[k][0], lPts[k][1], lPts[k][2],
                    closeStepX,
                    0
                  );
                }
              }
            }
            continue;
          }

          if (cx <= 0.05) continue;
          const zone = doorZones.find((z) => Math.abs(cz - z.centerZ) < 1.8 * syz);
          if (!zone) continue;

          const isNegLeaf = cz < zone.centerZ;
          if (zone.mode === "close") {
            const dz = isNegLeaf ? slideMagNeg : -slideMagPos;
            for (let k = 0; k < 3; k++) {
              writeDelta(
                doorCloseDelta,
                t + k,
                wPts[k][0], wPts[k][1], wPts[k][2],
                lPts[k][0], lPts[k][1], lPts[k][2],
                0,
                dz
              );
            }
          } else {
            const dz = isNegLeaf ? -slideMagNeg : slideMagPos;
            for (let k = 0; k < 3; k++) {
              writeDelta(
                doorOpenDelta,
                t + k,
                wPts[k][0], wPts[k][1], wPts[k][2],
                lPts[k][0], lPts[k][1], lPts[k][2],
                0,
                dz
              );
            }
          }
        }
      } else if (crhWorldY) {
        for (let i = 0; i < count; i++) {
          vLocal.fromBufferAttribute(pos, i);
          vWorld.copy(vLocal).applyMatrix4(obj.matrixWorld);
          crhWorldY[i] = vWorld.y;
        }
      }

      if (crhWorldY) {
        obj.geometry.setAttribute("aCrhWorldY", new THREE.BufferAttribute(crhWorldY, 1));
      }
      if (doorCloseDelta) {
        obj.geometry.setAttribute("aDoorCloseDelta", new THREE.BufferAttribute(doorCloseDelta, 3));
      }
      if (doorOpenDelta) {
        obj.geometry.setAttribute("aDoorOpenDelta", new THREE.BufferAttribute(doorOpenDelta, 3));
      }
    });
  }

  function attachCrhShader(mat, roofFixMode, hasDoorAnim, doorUniform) {
    const hasRoofFix = !!roofFixMode;
    const roofTag = roofFixMode === "glass" ? "G" : (roofFixMode ? "R" : "");
    const key = "sodor-crh-" + roofTag + (hasDoorAnim ? "D2" : "");
    mat.customProgramCacheKey = () => key;
    mat.onBeforeCompile = (shader) => {
      if (hasDoorAnim) {
        shader.uniforms.uDoorClosed = doorUniform;
      }

      const vertCommonExtra = [
        hasRoofFix ? "attribute float aCrhWorldY;\nvarying float vCrhWorldY;" : "",
        hasDoorAnim
          ? "attribute vec3 aDoorCloseDelta;\nattribute vec3 aDoorOpenDelta;\nuniform float uDoorClosed;"
          : "",
      ].filter(Boolean).join("\n");

      const vertBeginExtra = [
        hasRoofFix ? "vCrhWorldY = aCrhWorldY;" : "",
        hasDoorAnim
          ? "transformed += aDoorCloseDelta * uDoorClosed + aDoorOpenDelta * (1.0 - uDoorClosed);"
          : "",
      ].filter(Boolean).join("\n");

      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>\n${vertCommonExtra}`)
        .replace("#include <begin_vertex>", `#include <begin_vertex>\n${vertBeginExtra}`);

      if (roofFixMode === "glass") {
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", "#include <common>\nvarying float vCrhWorldY;")
          .replace(
            "#include <color_fragment>",
            `#include <color_fragment>
if (vCrhWorldY >= 2.00) {
  vec3 crhRoofWhite = vec3(0.925, 0.945, 0.968);
  float crhRoofMask = smoothstep(2.00, 2.04, vCrhWorldY);
  diffuseColor.rgb = mix(diffuseColor.rgb, crhRoofWhite, crhRoofMask);
  diffuseColor.a = mix(diffuseColor.a, 1.0, crhRoofMask);
}`
          );
      } else if (hasRoofFix) {
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", "#include <common>\nvarying float vCrhWorldY;")
          .replace(
            "#include <color_fragment>",
            `#include <color_fragment>
if (vCrhWorldY >= 1.94) {
  vec3 crhRoofWhite = vec3(0.925, 0.945, 0.968);
  float crhRoofMask = smoothstep(1.94, 2.00, vCrhWorldY);
  diffuseColor.rgb = mix(diffuseColor.rgb, max(diffuseColor.rgb, crhRoofWhite), crhRoofMask);
}`
          );
      }
    };
    mat.needsUpdate = true;
  }

  function applyCrhInstanceShaders(root, initialDoorClosed) {
    const doorUniform = { value: typeof initialDoorClosed === "number" ? initialDoorClosed : 0.0 };
    let usedDoorAnim = false;
    root.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      const hookMat = (m) => {
        if (!m || !m.userData || (!m.userData.crhRoofFix && !m.userData.crhDoorAnim)) return m;
        const cloned = m.clone();
        const roofMode = m.userData.crhRoofFix || false;
        const hasDoor = !!m.userData.crhDoorAnim;
        if (hasDoor) usedDoorAnim = true;
        attachCrhShader(cloned, roofMode, hasDoor, doorUniform);
        return cloned;
      };
      if (Array.isArray(obj.material)) {
        obj.material = obj.material.map(hookMat);
      } else {
        obj.material = hookMat(obj.material);
      }
    });
    return usedDoorAnim ? doorUniform : null;
  }

  function clampRoofAttachments(wrapper, clampCfg) {
    const { roofY, targetTopY } = clampCfg;
    const { box } = computeExactVertexBox(wrapper);
    if (box.max.y <= targetTopY) return;
    const factor = (targetTopY - roofY) / Math.max(1e-4, box.max.y - roofY);
    const v = new THREE.Vector3();
    const invMat = new THREE.Matrix4();

    wrapper.traverse((obj) => {
      if (!obj.isMesh || !obj.geometry || !obj.geometry.attributes.position) return;
      const pos = obj.geometry.attributes.position;
      let touched = false;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld);
        if (v.y > roofY) {
          touched = true;
          break;
        }
      }
      if (!touched) return;

      obj.geometry = obj.geometry.clone();
      const clonedPos = obj.geometry.attributes.position;
      invMat.copy(obj.matrixWorld).invert();
      for (let i = 0; i < clonedPos.count; i++) {
        v.fromBufferAttribute(clonedPos, i).applyMatrix4(obj.matrixWorld);
        if (v.y > roofY) {
          v.y = roofY + (v.y - roofY) * factor;
          v.applyMatrix4(invMat);
          clonedPos.setXYZ(i, v.x, v.y, v.z);
        }
      }
      clonedPos.needsUpdate = true;
      obj.geometry.computeBoundingBox();
      obj.geometry.computeBoundingSphere();
    });
  }

  function bakeLiveryAttributes(wrapper, spec) {
    const { box } = computeExactVertexBox(wrapper);
    const minY = box.min.y;
    const invH = 1 / Math.max(1e-4, box.max.y - minY);
    const v = new THREE.Vector3();
    const isMark3 = spec.liveryKind === "mark3";

    wrapper.traverse((obj) => {
      if (!obj.isMesh || !obj.geometry || !obj.geometry.attributes.position) return;
      obj.geometry = obj.geometry.clone();
      const pos = obj.geometry.attributes.position;
      const count = pos.count;
      const relY = new Float32Array(count);
      const bodyMask = isMark3 ? new Float32Array(count) : null;

      for (let i = 0; i < count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld);
        relY[i] = Math.max(0, Math.min(1, (v.y - minY) * invH));
        if (bodyMask) {
          bodyMask[i] = (Math.abs(v.x) >= 0.88 || Math.abs(v.z) >= 5.45) ? 1.0 : 0.0;
        }
      }

      obj.geometry.setAttribute("aRelY", new THREE.BufferAttribute(relY, 1));
      if (bodyMask) {
        obj.geometry.setAttribute("aBodyMask", new THREE.BufferAttribute(bodyMask, 1));
      }
    });
  }

  function createLiveryUniforms(colors) {
    const c = cloneLivery(colors);
    return {
      uRoofColor: { value: new THREE.Color(c.roof).convertSRGBToLinear() },
      uUpperColor: { value: new THREE.Color(c.upper).convertSRGBToLinear() },
      uStripeColor: { value: new THREE.Color(c.stripe).convertSRGBToLinear() },
      uLowerColor: { value: new THREE.Color(c.lower).convertSRGBToLinear() },
      uSkirtColor: { value: new THREE.Color(c.skirt).convertSRGBToLinear() },
    };
  }

  function attachLiveryShader(mat, role, sharedUniforms) {
    const shade = typeof mat.userData.liveryShade === "number" ? mat.userData.liveryShade : 1.0;
    const hasMask = role === "mark3CreamClean";
    const isDf4d = role.startsWith("df4d");

    mat.customProgramCacheKey = () => "sodor-livery-" + role;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uRoofColor = sharedUniforms.uRoofColor;
      shader.uniforms.uUpperColor = sharedUniforms.uUpperColor;
      shader.uniforms.uStripeColor = sharedUniforms.uStripeColor;
      shader.uniforms.uLowerColor = sharedUniforms.uLowerColor;
      shader.uniforms.uSkirtColor = sharedUniforms.uSkirtColor;
      shader.uniforms.uLiveryShade = { value: shade };

      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
attribute float aRelY;
varying float vLiveryRelY;
${hasMask ? "attribute float aBodyMask;\nvarying float vLiveryMask;" : ""}`
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
vLiveryRelY = aRelY;
${hasMask ? "vLiveryMask = aBodyMask;" : ""}`
        );

      const zoneFn = isDf4d
        ? `vec3 getZoneColor(float ry) {
  if (ry >= 0.768) return uRoofColor;
  if (ry >= 0.468) return uUpperColor;
  if (ry >= 0.444) return uStripeColor;
  if (ry >= 0.265) return uLowerColor;
  return uSkirtColor;
}`
        : `vec3 getZoneColor(float ry) {
  if (ry >= 0.815) return uRoofColor;
  if (ry >= 0.545) return uUpperColor;
  if (ry >= 0.505) return uStripeColor;
  if (ry >= 0.280) return uLowerColor;
  return uSkirtColor;
}`;

      let fragBody = "";
      if (role === "df4dPaint") {
        fragBody = "diffuseColor.rgb = getZoneColor(vLiveryRelY) * uLiveryShade;";
      } else if (role === "df4dStripe") {
        fragBody = "diffuseColor.rgb = uStripeColor;";
      } else if (role === "df4dGrey") {
        fragBody = `diffuseColor.rgb = (vLiveryRelY >= 0.265)
  ? (getZoneColor(vLiveryRelY) * uLiveryShade)
  : vec3(0.32, 0.37, 0.42);`;
      } else if (role === "df4dTex") {
        fragBody = `float texLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
vec3 zoneC = (vLiveryRelY >= 0.265) ? getZoneColor(vLiveryRelY) : vec3(0.32, 0.37, 0.42);
diffuseColor.rgb = zoneC * clamp(0.45 + texLuma * 0.78, 0.38, 1.12);`;
      } else if (role === "mark3Paint") {
        fragBody = "diffuseColor.rgb = getZoneColor(vLiveryRelY);";
      } else if (role === "mark3CreamClean") {
        fragBody = "diffuseColor.rgb = (vLiveryMask >= 0.5) ? getZoneColor(vLiveryRelY) : vec3(0.80, 0.74, 0.60);";
      }

      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
uniform vec3 uRoofColor;
uniform vec3 uUpperColor;
uniform vec3 uStripeColor;
uniform vec3 uLowerColor;
uniform vec3 uSkirtColor;
uniform float uLiveryShade;
varying float vLiveryRelY;
${hasMask ? "varying float vLiveryMask;" : ""}
${zoneFn}`
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
${fragBody}`
        );
    };
    mat.needsUpdate = true;
  }

  function applyLiveryToMesh(root, liveryKind, colors) {
    const fallback = liveryKind === "mark3" ? DEFAULT_MARK3_LIVERY : DEFAULT_DF4D_LIVERY;
    const uniforms = createLiveryUniforms(cloneLivery(colors, fallback));
    root.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      if (Array.isArray(obj.material)) {
        obj.material = obj.material.map((m) => {
          if (!m || !m.userData || !m.userData.liveryRole) return m;
          const cloned = m.clone();
          attachLiveryShader(cloned, m.userData.liveryRole, uniforms);
          return cloned;
        });
      } else {
        const m = obj.material;
        if (m && m.userData && m.userData.liveryRole) {
          const cloned = m.clone();
          attachLiveryShader(cloned, m.userData.liveryRole, uniforms);
          obj.material = cloned;
        }
      }
    });
  }

  async function ensureModelLoaded(modelId) {
    const spec = MODEL_SPECS[modelId];
    if (!spec) throw new Error(`未知 3D 模型: ${modelId}`);
    if (parsedCache.has(modelId)) return parsedCache.get(modelId);

    const loadPromise = (async () => {
      await loadAssetScript(spec);
      if (!gltfLoader) {
        if (!THREE.GLTFLoader) throw new Error("未加载 THREE.GLTFLoader");
        gltfLoader = new THREE.GLTFLoader();
      }
      const b64 = window[spec.globalVar];
      const buffer = decodeBase64ToArrayBuffer(b64);

      const gltf = await new Promise((resolve, reject) => {
        gltfLoader.parse(buffer, "", resolve, reject);
      });

      const norm = normalizeModelScene(gltf.scene, spec);
      return {
        id: modelId,
        spec,
        template: norm.wrapper,
        size: norm.size,
        couplerLen: norm.couplerLen,
        bogieSpan: norm.bogieSpan,
        animations: gltf.animations || [],
      };
    })();

    parsedCache.set(modelId, loadPromise);
    try {
      return await loadPromise;
    } catch (err) {
      parsedCache.delete(modelId);
      throw err;
    }
  }

  function applyHxd3dLiveryToMesh(root, choice) {
    const isBlue = choice === "blue";
    root.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      const paintMat = (m) => {
        if (!m || !m.userData || !m.userData.hxd3dPart) return m;
        const cloned = m.clone();
        if (m.userData.hxd3dPart === "Color_A06") {
          cloned.color.setHex(isBlue ? 0x0d63cc : 0xc81e1e);
        } else {
          cloned.color.setHex(isBlue ? 0x1b79eb : 0xd9362b);
        }
        return cloned;
      };
      if (Array.isArray(obj.material)) {
        obj.material = obj.material.map(paintMat);
      } else {
        obj.material = paintMat(obj.material);
      }
    });
  }

  function instantiateFromLoaded(entry, options) {
    const clone = entry.template.clone(true);
    const opts = options || {};
    let doorUniform = null;
    if (entry.spec.liveryKind === "df4d" || entry.spec.liveryKind === "mark3") {
      applyLiveryToMesh(clone, entry.spec.liveryKind, opts.liveryColors);
    } else if (entry.spec.liveryKind === "hxd3d") {
      applyHxd3dLiveryToMesh(clone, opts.hxd3dLivery);
    } else if (entry.spec.specialFix === "crhVelaro") {
      doorUniform = applyCrhInstanceShaders(clone, opts.initialDoorClosed);
    }

    let mixer = null;
    if (entry.animations && entry.animations.length > 0) {
      mixer = new THREE.AnimationMixer(clone);
      const action = mixer.clipAction(entry.animations[0]);
      action.play();
    }

    // Extract un-animated wheel submeshes (e.g. DD17 small_wheel01..04) so train.js spins them with track speed
    const extraWheels = [];
    if (entry.spec.specialFix === "bluebabyWheels") {
      clone.traverse((obj) => {
        if (
          obj.name === "small_wheel01" ||
          obj.name === "small_wheel02" ||
          obj.name === "small_wheel03" ||
          obj.name === "small_wheel04"
        ) {
          const target = obj.children && obj.children[0] ? obj.children[0] : obj;
          extraWheels.push({ mesh: target, radius: 0.334, axis: "z", sign: -1 });
        }
      });
    }

    return {
      mesh: clone,
      mixer,
      extraWheels,
      doorUniform,
      couplerLen: entry.couplerLen,
      bogieSpan: entry.bogieSpan,
      size: entry.size,
      couplerRole: entry.spec.couplerRole || "coach",
    };
  }

  function getLocoMeta(id) {
    return LOCO_CATALOG.find((l) => l.id === id) || LOCO_CATALOG[0];
  }

  function getCarMeta(id) {
    return CAR_CATALOG.find((c) => c.id === id) || CAR_CATALOG[0];
  }

  function getPreset(id) {
    return PRESETS.find((p) => p.id === id) || PRESETS[0];
  }

  function getCompatibleCars(locoId) {
    const locoMeta = getLocoMeta(locoId);
    if (locoMeta.emuSeries) {
      return CAR_CATALOG.filter((c) => c.emuSeries === locoMeta.emuSeries);
    }
    return CAR_CATALOG.filter((c) => !c.emuSeries);
  }

  function sanitizeCarsForLoco(locoId, cars) {
    const locoMeta = getLocoMeta(locoId);
    const allowed = getCompatibleCars(locoId);
    const allowedIds = new Set(allowed.map((c) => c.id));
    const fallback = locoMeta.defaultCarId || (allowed[0] && allowed[0].id) || "mark3_std";
    return (Array.isArray(cars) ? cars : []).map((cid) => (allowedIds.has(cid) ? cid : fallback));
  }

  window.TrainModelLibrary = {
    MODEL_SPECS,
    LOCO_CATALOG,
    CAR_CATALOG,
    PRESETS,
    LIVERY_ZONES,
    LIVERY_PRESETS,
    DEFAULT_DF4D_LIVERY,
    DEFAULT_MARK3_LIVERY,
    cloneLivery,
    findMatchingLiveryPresetId,
    ensureModelLoaded,
    instantiateFromLoaded,
    getLocoMeta,
    getCarMeta,
    getPreset,
    getCompatibleCars,
    sanitizeCarsForLoco,
  };
})();
