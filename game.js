(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;
  const TAU = Math.PI * 2;
  const MAX_EVENTS = 6;
  const DAILY_PREFIX = "SF-DAILY";
  const SETTINGS_STORAGE_KEY = "starfall_settings_v1";
  const RUN_SAVE_KEY = "starfall_run_save_v1";
  const EVENT_MIN_GAP = 11;
  const EVENT_MAX_GAP = 18;
  const qualityModes = {
    high: { enemyCap: 28, particleMul: 1, label: "High" },
    balanced: { enemyCap: 22, particleMul: 0.75, label: "Balanced" },
    performance: { enemyCap: 16, particleMul: 0.45, label: "Performance" },
  };
  let seededRandom = false;
  let rngState = 0;
  const menuScreens = ["home", "settings", "codex"];

  function defaultSettings() {
    return {
      screenShake: 1,
      showTouchUi: true,
      colorblind: false,
      lowVfx: false,
      aimAssist: 0.16,
      quality: "balanced",
      accessibilityPreset: "standard",
      dashKey: "shift",
      bombKey: "e",
      warpKey: "enter",
      sfxVolume: 0.7,
      musicVolume: 0.35,
      muteAudio: false,
    };
  }

  const rng = {
    next() {
      if (!seededRandom) return Math.random();
      rngState = (1664525 * rngState + 1013904223) >>> 0;
      return rngState / 4294967296;
    },
    range(min, max) {
      return min + (max - min) * this.next();
    },
    pick(arr) {
      return arr[Math.floor(this.next() * arr.length)];
    },
  };

  const state = {
    mode: "menu",
    menuScreen: "home",
    codexTab: "synergy",
    runMode: "standard",
    runSeed: "",
    selectedClass: "striker",
    runSaveAvailable: false,
    time: 0,
    wave: 1,
    waveClock: 0,
    waveLength: 26,
    combo: 0,
    comboTimer: 0,
    score: 0,
    kills: 0,
    stars: [],
    particles: [],
    enemies: [],
    projectiles: [],
    enemyProjectiles: [],
    drops: [],
    events: [],
    cameraShake: 0,
    flash: 0,
    selectedWeapon: "pulse",
    unlockedWeapons: { pulse: true, scatter: false, rail: false },
    choices: [],
    waveModifier: null,
    activeEvent: null,
    eventClock: EVENT_MIN_GAP,
    runMods: {
      enemySpeedMul: 1,
      enemyHpMul: 1,
      spawnMul: 1,
      playerDamageMul: 1,
      dropRateMul: 1,
      scoreMul: 1,
      projectileSpeedMul: 1,
    },
    challengeRules: {
      noBombRefill: false,
    },
    mission: null,
    challenge: null,
    relicChoices: [],
    relics: {},
    biome: null,
    endgameMutator: null,
    synergies: {},
    upgradeCounts: {},
    bannedUpgrades: {},
    damageNumbers: [],
    streak: 0,
    streakTimer: 0,
    meta: null,
    metaRewardGranted: false,
    overclock: 0,
    freeze: 0,
    danger: 0,
    heat: 0,
    heatTier: 0,
    bounty: null,
    hazards: [],
    directorCd: 6,
    wingmanMode: "balanced",
    evoPulseCounter: 0,
    waveSkipCd: 0,
    pointer: { x: WIDTH * 0.5, y: HEIGHT * 0.5, inside: false },
    coopJoined: true,
    settings: defaultSettings(),
    ui: {
      screenScale: 1,
      hudScale: 1,
      touchScale: 1,
      compactHud: false,
    },
    perf: {
      avgFps: 60,
      sampleTime: 0,
      sampleFrames: 0,
      adaptiveEnemyCapMul: 1,
      adaptiveVfxMul: 1,
    },
    saveTimer: 0,
    touch: {
      enabled: (navigator.maxTouchPoints || 0) > 0,
      leftId: null,
      points: {},
      stickBase: { x: 120, y: HEIGHT - 120 },
      moveX: 0,
      moveY: 0,
      actions: { dash: false, bomb: false, warp: false },
      prevActions: { dash: false, bomb: false, warp: false },
    },
    keysDown: new Set(),
    keyPressed: new Set(),
    mouseDown: false,
    lastMenuTapTs: 0,
    audio: {
      ctx: null,
      master: null,
      musicGain: null,
      sfxGain: null,
      musicOsc: null,
      musicLfo: null,
      musicPulse: 0,
    },
    net: {
      mode: "offline",
      socket: null,
      roomCode: "",
      playerSlot: 1,
      status: "offline",
      guestInput: { down: new Set(), pressed: new Set() },
      lastSnapshotAt: 0,
      snapshotSeq: 0,
      sendTimer: 0,
      waitingStart: 0,
    },
  };

  const waveModifiers = [
    { id: "standard", name: "Standard", speedMul: 1, hpMul: 1, spawnMul: 1, scoreMul: 1, color: "#d6e1ff" },
    { id: "blitz", name: "Blitz", speedMul: 1.22, hpMul: 0.9, spawnMul: 1.2, scoreMul: 1.22, color: "#ffd8a1" },
    { id: "fortified", name: "Fortified", speedMul: 0.9, hpMul: 1.35, spawnMul: 0.9, scoreMul: 1.24, color: "#d4c3ff" },
    { id: "frenzy", name: "Frenzy", speedMul: 1.08, hpMul: 1.08, spawnMul: 1.25, scoreMul: 1.35, color: "#ffb6cf" },
  ];
  const shipClasses = {
    striker: {
      label: "Striker",
      desc: "+18% dmg, +8% speed, -8 HP",
      apply: () => ((player.damage *= 1.18), (player.speed *= 1.08), (player.maxHp -= 8), (player.hp -= 8)),
    },
    vanguard: {
      label: "Vanguard",
      desc: "+26 HP, +8% DR, -6% speed",
      apply: () => ((player.maxHp += 26), (player.hp += 26), (player.damageReduction += 0.08), (player.speed *= 0.94)),
    },
    engineer: {
      label: "Engineer",
      desc: "+1 drone, +18 shield, -14% bomb CD",
      apply: () => ((player.droneCount += 1), (player.shield += 18), (player.bombCdMult *= 0.86)),
    },
    phantom: {
      label: "Phantom",
      desc: "+14% speed, -22% dash CD, -8% dmg, +4% crit",
      apply: () => ((player.speed *= 1.14), (player.dashCdMult *= 0.78), (player.damage *= 0.92), (player.critChance += 0.04)),
    },
  };
  const biomes = [
    { id: "nebula", label: "Nebula Drift", bgTop: "#1b2454", bgMid: "#151f45", bgBot: "#0a1431", mods: { scoreMul: 1.06 } },
    { id: "ember", label: "Ember Belt", bgTop: "#3b1f22", bgMid: "#2a1518", bgBot: "#140c0f", mods: { enemySpeedMul: 1.08, scoreMul: 1.08 } },
    { id: "glacier", label: "Glacier Void", bgTop: "#11253f", bgMid: "#0e1d33", bgBot: "#091424", mods: { enemySpeedMul: 0.92, enemyHpMul: 1.1 } },
    { id: "ion", label: "Ion Storm", bgTop: "#152f39", bgMid: "#11252e", bgBot: "#08161e", mods: { projectileSpeedMul: 1.1, scoreMul: 1.1 } },
  ];
  const relicDefs = [
    {
      id: "sun_core",
      label: "Sun Core",
      rarity: "common",
      desc: "+25% damage, but enemies move 8% faster.",
      apply: () => ((player.damage *= 1.25), (state.runMods.enemySpeedMul *= 1.08)),
    },
    {
      id: "chrono_shard",
      label: "Chrono Shard",
      rarity: "common",
      desc: "+20% fire rate and -15% dash cooldown.",
      apply: () => ((player.fireRateMult *= 1.2), (player.dashCdMult *= 0.85)),
    },
    {
      id: "void_glass",
      label: "Void Glass",
      rarity: "rare",
      desc: "+14% crit chance, but -20 max HP.",
      apply: () => ((player.critChance += 0.14), (player.maxHp -= 20), (player.hp = Math.min(player.hp, player.maxHp))),
    },
    {
      id: "forge_plate",
      label: "Forge Plate",
      rarity: "common",
      desc: "+12% damage reduction, +30 shield, but -7% speed.",
      apply: () => ((player.damageReduction += 0.12), (player.speed *= 0.93), (player.shield += 30)),
    },
    {
      id: "swarm_node",
      label: "Swarm Node",
      rarity: "rare",
      desc: "+2 drones and +20% wingman damage.",
      apply: () => ((player.droneCount += 2), (player.wingmanDamageMult *= 1.2)),
    },
    {
      id: "entropy_lens",
      label: "Entropy Lens",
      rarity: "common",
      desc: "+20% score multiplier, +12% enemy spawns.",
      apply: () => ((state.runMods.scoreMul *= 1.2), (state.runMods.spawnMul *= 1.12)),
    },
    {
      id: "arc_drive",
      label: "Arc Drive",
      rarity: "common",
      desc: "+12% move speed and -12% dash cooldown.",
      apply: () => ((player.speed *= 1.12), (player.dashCdMult *= 0.88)),
    },
    {
      id: "bastion_matrix",
      label: "Bastion Matrix",
      rarity: "rare",
      desc: "+18 max HP and +1.4 shield regen/s.",
      apply: () => ((player.maxHp += 18), (player.hp += 18), (player.shieldRegen += 1.4)),
    },
    {
      id: "storm_emitter",
      label: "Storm Emitter",
      rarity: "rare",
      desc: "+18% projectile speed and +1 multishot.",
      apply: () => ((player.projectileSpeedMult *= 1.18), (player.multishot = Math.min(3, player.multishot + 1))),
    },
    {
      id: "guardian_halo",
      label: "Guardian Halo",
      rarity: "rare",
      desc: "+8% damage reduction and +20 shield.",
      apply: () => ((player.damageReduction = Math.min(0.62, player.damageReduction + 0.08)), (player.shield += 20)),
    },
    {
      id: "greed_gear",
      label: "Greed Gear",
      rarity: "rare",
      desc: "+28% salvage gains and +20% drop rate.",
      apply: () => ((player.salvageMult *= 1.28), (player.dropRateMult *= 1.2)),
    },
    {
      id: "singularity_core",
      label: "Singularity Core",
      rarity: "legendary",
      desc: "+32% damage and +10% score, but -15 max HP and +14% enemy spawns.",
      apply: () =>
        ((player.damage *= 1.32),
        (state.runMods.scoreMul *= 1.1),
        (player.maxHp -= 15),
        (player.hp = Math.min(player.hp, player.maxHp)),
        (state.runMods.spawnMul *= 1.14)),
    },
  ];
  const endgameMutators = [
    { id: "unstable", label: "Unstable Front", apply: () => ({ enemySpeedMul: 1.12, projectileSpeedMul: 1.1 }) },
    { id: "colossus", label: "Colossus Surge", apply: () => ({ enemyHpMul: 1.22, spawnMul: 0.9, scoreMul: 1.16 }) },
    { id: "horde", label: "Horde Breach", apply: () => ({ spawnMul: 1.28, enemySpeedMul: 1.07, scoreMul: 1.12 }) },
    { id: "glass", label: "Glass Storm", apply: () => ({ enemyHpMul: 0.88, enemySpeedMul: 1.2, scoreMul: 1.2 }) },
  ];
  const masteryThresholds = {
    pulse: [120, 320, 650],
    scatter: [90, 240, 520],
    rail: [70, 180, 420],
  };
  const relicRarityColors = { common: "#c9dcff", rare: "#95f1d4", legendary: "#ffd58f" };

  const player = {
    x: WIDTH * 0.5,
    y: HEIGHT * 0.5,
    vx: 0,
    vy: 0,
    r: 16,
    speed: 260,
    hp: 100,
    maxHp: 100,
    fireCd: 0,
    aimAngle: 0,
    damage: 10,
    fireRateMult: 1,
    critChance: 0.08,
    critMult: 1.8,
    projectileSpeedMult: 1,
    projectileSizeMult: 1,
    rangeMult: 1,
    lifesteal: 0,
    damageReduction: 0,
    dashCdMult: 1,
    bombCdMult: 1,
    bossDamageMult: 1,
    dropRateMult: 1,
    missionRewardMult: 1,
    comboDecayMul: 1,
    comboDuration: 2.4,
    bonusPierce: 0,
    scrap: 0,
    xp: 0,
    nextXp: 65,
    level: 1,
    magnet: 80,
    dashCd: 0,
    dashTimer: 0,
    dashPower: 680,
    bombs: 2,
    bombCd: 0,
    waveSkipCd: 0,
    shield: 0,
    droneCount: 0,
    multishot: 0,
    regen: 0,
    shieldRegen: 0,
    overclockBonusTime: 0,
    freezeBonusTime: 0,
    bombDamageMult: 1,
    bombRadiusMult: 1,
    dashShockwave: 0,
    wingmanDamageMult: 1,
    salvageMult: 1,
    streakGuard: 0,
    wingTreeOffense: 0,
    wingTreeDefense: 0,
    wingTreeUtility: 0,
    rerolls: 1,
    banishes: 1,
    contactDamageCd: 0,
    alive: true,
  };

  const wingman = {
    x: WIDTH * 0.5 + 70,
    y: HEIGHT * 0.5 + 20,
    vx: 0,
    vy: 0,
    r: 13,
    speed: 245,
    fireCd: 0,
    aimAngle: 0,
    dashCd: 0,
    dashTimer: 0,
    dashPower: 620,
    bombs: 1,
    bombCd: 0,
    burstCd: 0,
    supportCd: 0,
  };

  function defaultMeta() {
    return {
      shards: 0,
      bestScore: 0,
      bestWave: 0,
      dailyBest: {},
      dailyStreak: 0,
      lastDailyClaim: "",
      weaponBest: { pulse: 0, scatter: 0, rail: 0 },
      masteryKills: { pulse: 0, scatter: 0, rail: 0 },
      totalShardsEarned: 0,
      unlocks: { vanguard: false, engineer: false, phantom: false, rareRelics: false, trail: false },
      perks: { hull: 0, cannons: 0, thrusters: 0 },
    };
  }

  function loadMeta() {
    try {
      const raw = localStorage.getItem("starfall_meta_v1");
      if (!raw) return defaultMeta();
      const parsed = JSON.parse(raw);
      return {
        shards: Number(parsed.shards || 0),
        bestScore: Number(parsed.bestScore || 0),
        bestWave: Number(parsed.bestWave || 0),
        dailyBest: parsed.dailyBest && typeof parsed.dailyBest === "object" ? parsed.dailyBest : {},
        dailyStreak: Number(parsed.dailyStreak || 0),
        lastDailyClaim: String(parsed.lastDailyClaim || ""),
        weaponBest: {
          pulse: Number(parsed.weaponBest?.pulse || 0),
          scatter: Number(parsed.weaponBest?.scatter || 0),
          rail: Number(parsed.weaponBest?.rail || 0),
        },
        masteryKills: {
          pulse: Number(parsed.masteryKills?.pulse || 0),
          scatter: Number(parsed.masteryKills?.scatter || 0),
          rail: Number(parsed.masteryKills?.rail || 0),
        },
        totalShardsEarned: Number(parsed.totalShardsEarned || 0),
        unlocks: {
          vanguard: Boolean(parsed.unlocks?.vanguard || false),
          engineer: Boolean(parsed.unlocks?.engineer || false),
          phantom: Boolean(parsed.unlocks?.phantom || false),
          rareRelics: Boolean(parsed.unlocks?.rareRelics || false),
          trail: Boolean(parsed.unlocks?.trail || false),
        },
        perks: {
          hull: Number(parsed.perks?.hull || 0),
          cannons: Number(parsed.perks?.cannons || 0),
          thrusters: Number(parsed.perks?.thrusters || 0),
        },
      };
    } catch {
      return defaultMeta();
    }
  }

  function saveMeta() {
    try {
      localStorage.setItem("starfall_meta_v1", JSON.stringify(state.meta || defaultMeta()));
    } catch {}
  }

  function loadSettings() {
    const base = defaultSettings();
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) return base;
      const parsed = JSON.parse(raw);
      return {
        screenShake: Math.max(0, Math.min(1.5, Number(parsed.screenShake ?? base.screenShake))),
        showTouchUi: Boolean(parsed.showTouchUi ?? base.showTouchUi),
        colorblind: Boolean(parsed.colorblind ?? base.colorblind),
        lowVfx: Boolean(parsed.lowVfx ?? base.lowVfx),
        aimAssist: Math.max(0, Math.min(0.45, Number(parsed.aimAssist ?? base.aimAssist))),
        quality: ["high", "balanced", "performance"].includes(parsed.quality) ? parsed.quality : base.quality,
        accessibilityPreset: ["standard", "comfort", "high_contrast", "custom"].includes(parsed.accessibilityPreset)
          ? parsed.accessibilityPreset
          : base.accessibilityPreset,
        dashKey: ["shift", "q", "mouse"].includes(parsed.dashKey) ? parsed.dashKey : base.dashKey,
        bombKey: ["e", " ", "r"].includes(parsed.bombKey) ? parsed.bombKey : base.bombKey,
        warpKey: ["enter", "v", "g"].includes(parsed.warpKey) ? parsed.warpKey : base.warpKey,
        sfxVolume: Math.max(0, Math.min(1, Number(parsed.sfxVolume ?? base.sfxVolume))),
        musicVolume: Math.max(0, Math.min(1, Number(parsed.musicVolume ?? base.musicVolume))),
        muteAudio: Boolean(parsed.muteAudio ?? base.muteAudio),
      };
    } catch {
      return base;
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(state.settings));
    } catch {}
  }

  function hasRunSave() {
    try {
      return Boolean(localStorage.getItem(RUN_SAVE_KEY));
    } catch {
      return false;
    }
  }

  function clearRunSave() {
    try {
      localStorage.removeItem(RUN_SAVE_KEY);
    } catch {}
    state.runSaveAvailable = false;
  }

  function createRunSavePayload() {
    return {
      savedAt: Date.now(),
      mode: "playing",
      runMode: state.runMode,
      runSeed: state.runSeed,
      selectedClass: state.selectedClass,
      time: state.time,
      wave: state.wave,
      waveClock: state.waveClock,
      waveLength: state.waveLength,
      combo: state.combo,
      comboTimer: state.comboTimer,
      score: state.score,
      kills: state.kills,
      enemies: state.enemies,
      projectiles: state.projectiles,
      enemyProjectiles: state.enemyProjectiles,
      drops: state.drops,
      particles: state.particles,
      events: state.events,
      selectedWeapon: state.selectedWeapon,
      unlockedWeapons: state.unlockedWeapons,
      waveModifier: state.waveModifier,
      activeEvent: state.activeEvent,
      eventClock: state.eventClock,
      runMods: state.runMods,
      challengeRules: state.challengeRules,
      biome: state.biome,
      endgameMutator: state.endgameMutator,
      mission: state.mission,
      challenge: state.challenge,
      relicChoices: state.relicChoices,
      relics: state.relics,
      synergies: state.synergies,
      upgradeCounts: state.upgradeCounts,
      bannedUpgrades: state.bannedUpgrades,
      streak: state.streak,
      streakTimer: state.streakTimer,
      overclock: state.overclock,
      freeze: state.freeze,
      danger: state.danger,
      heat: state.heat,
      heatTier: state.heatTier,
      bounty: state.bounty,
      hazards: state.hazards,
      directorCd: state.directorCd,
      wingmanMode: state.wingmanMode,
      evoPulseCounter: state.evoPulseCounter,
      waveSkipCd: state.waveSkipCd,
      coopJoined: state.coopJoined,
      player: { ...player },
      wingman: { ...wingman },
    };
  }

  function saveRun() {
    if (state.mode !== "playing" && state.mode !== "paused" && state.mode !== "levelup") return;
    if (!player.alive || state.net.mode !== "offline") return;
    try {
      localStorage.setItem(RUN_SAVE_KEY, JSON.stringify(createRunSavePayload()));
      state.runSaveAvailable = true;
    } catch {}
  }

  function loadSavedRun() {
    try {
      const raw = localStorage.getItem(RUN_SAVE_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (!s || typeof s !== "object") return false;
      state.mode = "playing";
      state.runMode = s.runMode || "standard";
      state.runSeed = s.runSeed || "";
      state.selectedClass = s.selectedClass || "striker";
      if (state.runMode === "daily" && s.challenge?.code) {
        state.challenge = s.challenge;
        setRunSeed(s.challenge.code);
      } else if (state.runMode === "seeded" && state.runSeed) {
        setRunSeed(state.runSeed);
      } else {
        clearRunSeed();
        state.runMode = "standard";
      }
      state.time = Number(s.time || 0);
      state.wave = Number(s.wave || 1);
      state.waveClock = Number(s.waveClock || 0);
      state.waveLength = Number(s.waveLength || 26);
      state.combo = Number(s.combo || 0);
      state.comboTimer = Number(s.comboTimer || 0);
      state.score = Number(s.score || 0);
      state.kills = Number(s.kills || 0);
      state.enemies = Array.isArray(s.enemies) ? s.enemies : [];
      state.projectiles = Array.isArray(s.projectiles) ? s.projectiles : [];
      state.enemyProjectiles = Array.isArray(s.enemyProjectiles) ? s.enemyProjectiles : [];
      state.drops = Array.isArray(s.drops) ? s.drops : [];
      state.particles = Array.isArray(s.particles) ? s.particles : [];
      state.events = Array.isArray(s.events) ? s.events : [];
      state.selectedWeapon = s.selectedWeapon || "pulse";
      state.unlockedWeapons = s.unlockedWeapons || { pulse: true, scatter: false, rail: false };
      state.waveModifier = s.waveModifier || waveModifiers[0];
      state.activeEvent = s.activeEvent || null;
      state.eventClock = Number(s.eventClock || EVENT_MIN_GAP);
      state.runMods = s.runMods || {
        enemySpeedMul: 1,
        enemyHpMul: 1,
        spawnMul: 1,
        playerDamageMul: 1,
        dropRateMul: 1,
        scoreMul: 1,
        projectileSpeedMul: 1,
      };
      state.challengeRules = s.challengeRules || { noBombRefill: false };
      state.biome = s.biome || biomes[0];
      state.endgameMutator = s.endgameMutator || null;
      state.mission = s.mission || null;
      state.challenge = s.challenge || buildTodayChallenge();
      state.relicChoices = Array.isArray(s.relicChoices) ? s.relicChoices : [];
      state.relics = s.relics || {};
      state.synergies = s.synergies || {};
      state.upgradeCounts = s.upgradeCounts || {};
      state.bannedUpgrades = s.bannedUpgrades || {};
      state.streak = Number(s.streak || 0);
      state.streakTimer = Number(s.streakTimer || 0);
      state.overclock = Number(s.overclock || 0);
      state.freeze = Number(s.freeze || 0);
      state.danger = Number(s.danger || 0);
      state.heat = Number(s.heat || 0);
      state.heatTier = Number(s.heatTier || 0);
      state.bounty = s.bounty || null;
      state.hazards = Array.isArray(s.hazards) ? s.hazards : [];
      state.directorCd = Number(s.directorCd || 6);
      state.wingmanMode = ["balanced", "aggressive", "support"].includes(s.wingmanMode) ? s.wingmanMode : "balanced";
      state.evoPulseCounter = Number(s.evoPulseCounter || 0);
      state.waveSkipCd = Number(s.waveSkipCd || 0);
      state.coopJoined = Boolean(s.coopJoined);
      Object.assign(player, s.player || {});
      Object.assign(wingman, s.wingman || {});
      player.alive = true;
      state.saveTimer = 0;
      state.runSaveAvailable = true;
      return true;
    } catch {
      return false;
    }
  }

  function hashString(input) {
    let h = 2166136261;
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function setRunSeed(seedStr) {
    const seed = hashString(seedStr);
    rngState = seed || 1;
    seededRandom = true;
    state.runSeed = seedStr;
  }

  function clearRunSeed() {
    seededRandom = false;
    state.runSeed = "";
  }

  function buildTodayChallenge() {
    const iso = new Date().toISOString().slice(0, 10);
    const code = `${DAILY_PREFIX}-${iso}`;
    const localState = { v: hashString(code) || 1 };
    const next = () => {
      localState.v = (1664525 * localState.v + 1013904223) >>> 0;
      return localState.v / 4294967296;
    };
    const pool = [
      { id: "glass_hull", label: "Glass Hull", apply: () => ((player.maxHp *= 0.78), (player.hp = Math.min(player.hp, player.maxHp))) },
      { id: "rapid_arsenal", label: "Rapid Arsenal", apply: () => ((player.fireRateMult *= 1.28), (state.runMods.enemySpeedMul *= 1.14)) },
      { id: "heavy_swarm", label: "Heavy Swarm", apply: () => ((state.runMods.enemyHpMul *= 1.24), (state.runMods.spawnMul *= 1.18)) },
      { id: "scrap_rain", label: "Scrap Rain", apply: () => ((state.runMods.dropRateMul *= 1.5), (player.missionRewardMult *= 1.2)) },
      { id: "precision_ops", label: "Precision Ops", apply: () => ((player.damage *= 1.12), (player.critChance = Math.min(0.55, player.critChance + 0.08))) },
      { id: "tight_window", label: "Tight Window", apply: () => ((state.waveLength = Math.max(20, state.waveLength - 5)), (state.runMods.scoreMul *= 1.2)) },
      { id: "no_refill", label: "No Bomb Refill", apply: () => (state.challengeRules.noBombRefill = true) },
    ];
    const picks = [];
    const bag = pool.slice();
    while (picks.length < 3 && bag.length) {
      const idx = Math.floor(next() * bag.length);
      picks.push(bag[idx]);
      bag.splice(idx, 1);
    }
    return { code, labels: picks.map((p) => p.label), mutators: picks };
  }

  function cycleBinding(which) {
    const key = which === "dash" ? "dashKey" : which === "bomb" ? "bombKey" : "warpKey";
    const options = {
      dashKey: ["shift", "q", "mouse"],
      bombKey: ["e", " ", "r"],
      warpKey: ["enter", "v", "g"],
    };
    const list = options[key];
    const cur = state.settings[key];
    const idx = list.indexOf(cur);
    state.settings[key] = list[(idx + 1) % list.length];
    state.settings.accessibilityPreset = "custom";
    saveSettings();
    pushEvent(`${which} key set to ${displayKey(state.settings[key])}.`);
  }

  function toggleRunMode() {
    state.runMode = state.runMode === "daily" ? "standard" : "daily";
    pushEvent(`Run mode set to ${state.runMode.toUpperCase()}.`);
  }

  function continueSavedRun() {
    if (state.mode !== "menu") return;
    if (!loadSavedRun()) {
      pushEvent("No saved run found.");
      return;
    }
    pushEvent(`Resumed run on wave ${state.wave}.`);
  }

  function encodeChallengeCode() {
    const mode = state.runMode === "daily" ? "daily" : state.runMode === "seeded" ? "seeded" : "standard";
    const seed = mode === "daily" ? state.challenge?.code || "DAILY" : state.runSeed || "STANDARD";
    const cls = state.selectedClass || "striker";
    return `SFCH|${seed}|${cls}|${mode}`;
  }

  function decodeChallengeCode(raw) {
    const parts = String(raw || "").trim().split("|");
    if (parts.length < 4 || parts[0] !== "SFCH") return null;
    return { seed: parts[1] || "STANDARD", cls: parts[2] || "striker", mode: parts[3] || "standard" };
  }

  function setCustomSeedFromPrompt() {
    const seed = prompt("Enter a custom seed code (letters/numbers):", state.runSeed || "");
    if (!seed || !seed.trim()) return;
    const code = seed.trim();
    const parsed = decodeChallengeCode(code);
    if (parsed) {
      state.runMode = ["daily", "seeded", "standard"].includes(parsed.mode) ? parsed.mode : "standard";
      state.selectedClass = isClassUnlocked(parsed.cls) ? parsed.cls : "striker";
      if (state.runMode === "daily") {
        state.challenge = buildTodayChallenge();
        if (parsed.seed.startsWith(DAILY_PREFIX)) state.challenge.code = parsed.seed;
        state.runSeed = "";
      } else {
        state.runSeed = parsed.seed;
        if (state.runMode !== "seeded") state.runMode = "seeded";
      }
      pushEvent(`Loaded challenge code (${state.selectedClass}, ${state.runMode}).`);
      return;
    }
    state.runMode = "seeded";
    state.runSeed = code;
    pushEvent(`Seeded run ready: ${state.runSeed}`);
  }

  function copyRunCode() {
    const share = encodeChallengeCode();
    navigator.clipboard?.writeText(String(share || "STANDARD")).catch(() => {});
    pushEvent(`Copied run code: ${share || "STANDARD"}`);
  }

  function cycleQualityMode() {
    const opts = ["high", "balanced", "performance"];
    const idx = opts.indexOf(state.settings.quality);
    state.settings.quality = opts[(idx + 1) % opts.length];
    state.settings.accessibilityPreset = "custom";
    saveSettings();
  }

  function adjustAimAssist(delta) {
    state.settings.aimAssist = Math.max(0, Math.min(0.45, state.settings.aimAssist + delta));
    state.settings.accessibilityPreset = "custom";
    saveSettings();
  }

  function adjustScreenShake(delta) {
    state.settings.screenShake = Math.max(0, Math.min(1.5, state.settings.screenShake + delta));
    state.settings.accessibilityPreset = "custom";
    saveSettings();
  }

  function applyAccessibilityPreset(name) {
    if (name === "comfort") {
      state.settings.colorblind = true;
      state.settings.lowVfx = true;
      state.settings.quality = "performance";
      state.settings.screenShake = 0.45;
      state.settings.aimAssist = 0.24;
    } else if (name === "high_contrast") {
      state.settings.colorblind = true;
      state.settings.lowVfx = false;
      state.settings.quality = "balanced";
      state.settings.screenShake = 0.8;
      state.settings.aimAssist = 0.2;
    } else {
      state.settings.colorblind = false;
      state.settings.lowVfx = false;
      state.settings.quality = "balanced";
      state.settings.screenShake = 1;
      state.settings.aimAssist = 0.16;
      name = "standard";
    }
    state.settings.accessibilityPreset = name;
    saveSettings();
    pushEvent(`Accessibility preset: ${name.replace("_", " ")}`);
  }

  function cycleAccessibilityPreset() {
    const order = ["standard", "comfort", "high_contrast"];
    const idx = order.indexOf(state.settings.accessibilityPreset);
    const next = order[(idx + 1 + order.length) % order.length];
    applyAccessibilityPreset(next);
  }

  function resetSettingsDefaults() {
    state.settings = defaultSettings();
    saveSettings();
    pushEvent("Settings reset to defaults.");
  }

  function refreshUiMetrics() {
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width > 0 ? rect.width / WIDTH : 1;
    state.ui.screenScale = scale;
    state.ui.hudScale = Math.max(1, Math.min(1.9, 1 / Math.max(scale, 0.55)));
    state.ui.touchScale = Math.max(1, Math.min(2.2, 1 / Math.max(scale, 0.45)));
    state.ui.compactHud = rect.width < 860 || rect.height < 520;
    if (state.touch.leftId === null) {
      state.touch.stickBase = { x: 86 * state.ui.touchScale, y: HEIGHT - 86 * state.ui.touchScale };
    }
  }

  function updatePerformanceTuning(delta) {
    if (typeof window.__drainVirtualTimePending === "function") return;
    if (!(delta > 0)) return;
    state.perf.sampleTime += delta;
    state.perf.sampleFrames += 1;
    if (state.perf.sampleTime < 1) return;
    const fps = state.perf.sampleFrames / state.perf.sampleTime;
    state.perf.avgFps = state.perf.avgFps * 0.7 + fps * 0.3;
    state.perf.sampleTime = 0;
    state.perf.sampleFrames = 0;
    const target = state.settings.quality === "high" ? 56 : 58;
    if (state.perf.avgFps < target - 4) state.perf.adaptiveEnemyCapMul = Math.max(0.62, state.perf.adaptiveEnemyCapMul - 0.08);
    if (state.perf.avgFps > target + 3) state.perf.adaptiveEnemyCapMul = Math.min(1.15, state.perf.adaptiveEnemyCapMul + 0.05);
    state.perf.adaptiveVfxMul = Math.max(0.45, Math.min(1.1, state.perf.adaptiveEnemyCapMul + 0.12));
  }

  function getQualitySettings() {
    return qualityModes[state.settings.quality] || qualityModes.balanced;
  }

  function actionPressed(action) {
    const k =
      action === "dash" ? state.settings.dashKey : action === "bomb" ? state.settings.bombKey : state.settings.warpKey;
    if (k === "mouse") return state.mouseDown || state.keyPressed.has("shift");
    return state.keyPressed.has(k);
  }

  function displayKey(k) {
    if (k === " ") return "Space";
    if (k === "enter") return "Enter";
    if (k === "shift") return "Shift";
    if (k === "mouse") return "Mouse";
    if (k === "tab") return "Tab";
    return String(k).toUpperCase();
  }

  function cycleClass() {
    const keys = Object.keys(shipClasses);
    const idx = keys.indexOf(state.selectedClass);
    for (let step = 1; step <= keys.length; step++) {
      const next = keys[(idx + step + keys.length) % keys.length];
      if (isClassUnlocked(next)) {
        state.selectedClass = next;
        pushEvent(`Class selected: ${shipClasses[state.selectedClass].label}`);
        return;
      }
    }
  }

  function isClassUnlocked(classId) {
    if (classId === "striker") return true;
    return Boolean(state.meta?.unlocks?.[classId]);
  }

  function refreshMetaUnlocks(notify = false) {
    const unlocks = state.meta.unlocks || (state.meta.unlocks = { vanguard: false, engineer: false, phantom: false, rareRelics: false, trail: false });
    const total = Number(state.meta.totalShardsEarned || 0);
    const checks = [
      { id: "vanguard", need: 100, label: "Vanguard class unlocked" },
      { id: "engineer", need: 240, label: "Engineer class unlocked" },
      { id: "phantom", need: 420, label: "Phantom class unlocked" },
      { id: "rareRelics", need: 180, label: "Rare relic pool unlocked" },
      { id: "trail", need: 300, label: "Cosmetic trail unlocked" },
    ];
    for (const c of checks) {
      if (unlocks[c.id]) continue;
      if (total >= c.need) {
        unlocks[c.id] = true;
        if (notify) pushEvent(c.label);
      }
    }
  }

  function cycleWingmanMode() {
    const modes = ["balanced", "aggressive", "support"];
    const idx = modes.indexOf(state.wingmanMode);
    state.wingmanMode = modes[(idx + 1 + modes.length) % modes.length];
    pushEvent(`Wingman mode: ${state.wingmanMode}`);
  }

  function pickBiomeForWave(wave) {
    return biomes[Math.floor(((wave - 1) / 2) % biomes.length)] || biomes[0];
  }

  function applyBiome(biome) {
    state.biome = biome;
    if (!biome) return;
    if (biome.mods.enemySpeedMul) state.runMods.enemySpeedMul *= biome.mods.enemySpeedMul;
    if (biome.mods.enemyHpMul) state.runMods.enemyHpMul *= biome.mods.enemyHpMul;
    if (biome.mods.projectileSpeedMul) state.runMods.projectileSpeedMul *= biome.mods.projectileSpeedMul;
    if (biome.mods.scoreMul) state.runMods.scoreMul *= biome.mods.scoreMul;
  }

  function maybeSetEndgameMutator() {
    if (state.wave < 15) {
      state.endgameMutator = null;
      return;
    }
    const m = endgameMutators[Math.floor(rng.range(0, endgameMutators.length))];
    state.endgameMutator = { id: m.id, label: m.label };
    const mod = m.apply();
    if (mod.enemySpeedMul) state.runMods.enemySpeedMul *= mod.enemySpeedMul;
    if (mod.enemyHpMul) state.runMods.enemyHpMul *= mod.enemyHpMul;
    if (mod.projectileSpeedMul) state.runMods.projectileSpeedMul *= mod.projectileSpeedMul;
    if (mod.scoreMul) state.runMods.scoreMul *= mod.scoreMul;
    if (mod.spawnMul) state.runMods.spawnMul *= mod.spawnMul;
    pushEvent(`Endgame mutator: ${m.label}`);
    playSfx(140, 0.1, "sawtooth", 0.2);
  }

  function relicWeight(rarity) {
    if (rarity === "legendary") return 0.16;
    if (rarity === "rare") return 0.5;
    return 1;
  }

  function canOfferRelic(r) {
    if (r.rarity === "common") return true;
    if (state.meta?.unlocks?.rareRelics) return true;
    return false;
  }

  function rollRelicChoices(count = 3) {
    const bag = relicDefs.filter((r) => !state.relics[r.id] && canOfferRelic(r));
    const picks = [];
    while (picks.length < count && bag.length) {
      let total = 0;
      for (const r of bag) total += relicWeight(r.rarity);
      let roll = rng.range(0, total || 1);
      let idx = 0;
      for (; idx < bag.length; idx++) {
        roll -= relicWeight(bag[idx].rarity);
        if (roll <= 0) break;
      }
      const pickIdx = Math.max(0, Math.min(idx, bag.length - 1));
      const chosen = bag[pickIdx];
      picks.push(chosen);
      bag.splice(pickIdx, 1);
    }
    return picks;
  }

  function tryOpenRelicChoice() {
    if (state.wave > 0 && state.wave % 5 === 0 && state.mode === "playing") {
      state.mode = "relic";
      state.relicChoices = rollRelicChoices(3);
    }
  }

  function pickRelic(i) {
    if (state.mode !== "relic") return;
    const relic = state.relicChoices[i];
    if (!relic) return;
    state.relics[relic.id] = true;
    relic.apply();
    pushEvent(`Relic acquired: ${relic.label}`);
    state.relicChoices = [];
    state.mode = "playing";
    playSfx(520, 0.06, "square", 0.35);
  }

  function ensureAudio() {
    if (state.audio.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctxA = new AC();
      const master = ctxA.createGain();
      const musicGain = ctxA.createGain();
      const sfxGain = ctxA.createGain();
      musicGain.gain.value = 0;
      sfxGain.gain.value = 0.0001;
      musicGain.connect(master);
      sfxGain.connect(master);
      master.connect(ctxA.destination);
      const osc = ctxA.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = 120;
      osc.connect(musicGain);
      osc.start();
      const lfo = ctxA.createOscillator();
      const lfoGain = ctxA.createGain();
      lfo.frequency.value = 0.18;
      lfoGain.gain.value = 24;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start();
      state.audio.ctx = ctxA;
      state.audio.master = master;
      state.audio.musicGain = musicGain;
      state.audio.sfxGain = sfxGain;
      state.audio.musicOsc = osc;
      state.audio.musicLfo = lfo;
      updateAudioMix(0);
    } catch {}
  }

  function updateAudioMix(dt = 0) {
    ensureAudio();
    const a = state.audio;
    if (!a.ctx || !a.musicGain || !a.sfxGain) return;
    const t = a.ctx.currentTime;
    const muted = state.settings.muteAudio;
    const targetSfx = muted ? 0.0001 : Math.max(0.0001, state.settings.sfxVolume * 0.25);
    const targetMusicBase = muted ? 0.0001 : Math.max(0.0001, state.settings.musicVolume * 0.18);
    const dangerMul = state.mode === "playing" ? 1 + Math.min(1.2, state.enemies.length / 16 + state.wave * 0.03) : 0.7;
    const targetMusic = targetMusicBase * dangerMul;
    a.sfxGain.gain.cancelScheduledValues(t);
    a.musicGain.gain.cancelScheduledValues(t);
    a.sfxGain.gain.linearRampToValueAtTime(targetSfx, t + Math.max(0.03, dt));
    a.musicGain.gain.linearRampToValueAtTime(targetMusic, t + Math.max(0.08, dt));
    if (a.musicOsc) a.musicOsc.frequency.setTargetAtTime(95 + Math.min(180, state.wave * 4.5 + state.enemies.length * 1.2), t, 0.3);
  }

  function playSfx(freq = 360, duration = 0.04, type = "triangle", gainMul = 0.2) {
    ensureAudio();
    const a = state.audio;
    if (!a.ctx || !a.sfxGain || state.settings.muteAudio) return;
    const t = a.ctx.currentTime;
    const osc = a.ctx.createOscillator();
    const g = a.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = 0.0001;
    osc.connect(g);
    g.connect(a.sfxGain);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainMul), t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  function wakeAudio() {
    ensureAudio();
    if (state.audio.ctx && state.audio.ctx.state === "suspended") state.audio.ctx.resume().catch(() => {});
  }

  function wsUrl() {
    const custom = window.MULTIPLAYER_WS_URL;
    if (typeof custom === "string" && custom) return custom;
    if (location.protocol === "https:") return `wss://${location.hostname}:8080`;
    return `ws://${location.hostname}:8080`;
  }

  function resetNetSession() {
    state.net.mode = "offline";
    state.net.roomCode = "";
    state.net.playerSlot = 1;
    state.net.status = "offline";
    state.net.guestInput = { down: new Set(), pressed: new Set() };
    state.net.lastSnapshotAt = 0;
    state.net.snapshotSeq = 0;
    state.net.sendTimer = 0;
    state.net.waitingStart = 0;
    if (state.net.socket) {
      try {
        state.net.socket.close();
      } catch {}
      state.net.socket = null;
    }
  }

  function serializeInput() {
    const down = [];
    if (state.keysDown.has("i")) down.push("i");
    if (state.keysDown.has("j")) down.push("j");
    if (state.keysDown.has("k")) down.push("k");
    if (state.keysDown.has("l")) down.push("l");
    return {
      down,
      pressed: ["o", "u", "y", "h"].filter((k) => state.keyPressed.has(k)),
    };
  }

  function sendNet(msg) {
    const s = state.net.socket;
    if (!s || s.readyState !== WebSocket.OPEN) return;
    s.send(JSON.stringify(msg));
  }

  function createSnapshotPayload() {
    return {
      mode: state.mode,
      time: state.time,
      wave: state.wave,
      waveClock: state.waveClock,
      waveLength: state.waveLength,
      combo: state.combo,
      comboTimer: state.comboTimer,
      score: state.score,
      kills: state.kills,
      enemies: state.enemies,
      projectiles: state.projectiles,
      enemyProjectiles: state.enemyProjectiles,
      drops: state.drops,
      particles: state.particles,
      events: state.events,
      selectedWeapon: state.selectedWeapon,
      unlockedWeapons: state.unlockedWeapons,
      waveModifier: state.waveModifier,
      mission: state.mission,
      overclock: state.overclock,
      freeze: state.freeze,
      danger: state.danger,
      heat: state.heat,
      heatTier: state.heatTier,
      bounty: state.bounty,
      hazards: state.hazards,
      directorCd: state.directorCd,
      wingmanMode: state.wingmanMode,
      evoPulseCounter: state.evoPulseCounter,
      waveSkipCd: state.waveSkipCd,
      pointer: state.pointer,
      coopJoined: state.coopJoined,
      player: { ...player },
      wingman: { ...wingman },
    };
  }

  function applySnapshotPayload(snap) {
    state.mode = snap.mode;
    state.time = snap.time;
    state.wave = snap.wave;
    state.waveClock = snap.waveClock;
    state.waveLength = snap.waveLength;
    state.combo = snap.combo;
    state.comboTimer = snap.comboTimer;
    state.score = snap.score;
    state.kills = snap.kills;
    state.enemies = Array.isArray(snap.enemies) ? snap.enemies : [];
    state.projectiles = Array.isArray(snap.projectiles) ? snap.projectiles : [];
    state.enemyProjectiles = Array.isArray(snap.enemyProjectiles) ? snap.enemyProjectiles : [];
    state.drops = Array.isArray(snap.drops) ? snap.drops : [];
    state.particles = Array.isArray(snap.particles) ? snap.particles : [];
    state.events = Array.isArray(snap.events) ? snap.events : [];
    state.selectedWeapon = snap.selectedWeapon || "pulse";
    state.unlockedWeapons = snap.unlockedWeapons || { pulse: true, scatter: false, rail: false };
    state.waveModifier = snap.waveModifier || waveModifiers[0];
    state.mission = snap.mission || null;
    state.overclock = snap.overclock || 0;
    state.freeze = snap.freeze || 0;
    state.danger = snap.danger || 0;
    state.heat = snap.heat || 0;
    state.heatTier = snap.heatTier || 0;
    state.bounty = snap.bounty || null;
    state.hazards = Array.isArray(snap.hazards) ? snap.hazards : [];
    state.directorCd = snap.directorCd || 6;
    state.wingmanMode = snap.wingmanMode || "balanced";
    state.evoPulseCounter = snap.evoPulseCounter || 0;
    state.waveSkipCd = snap.waveSkipCd || 0;
    state.pointer = snap.pointer || state.pointer;
    state.coopJoined = Boolean(snap.coopJoined);
    Object.assign(player, snap.player || {});
    Object.assign(wingman, snap.wingman || {});
  }

  function handleNetMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw.data);
    } catch {
      return;
    }
    if (msg.type === "room_created") {
      state.net.mode = "host";
      state.net.roomCode = msg.roomCode;
      state.net.playerSlot = 1;
      state.net.status = "hosting";
      state.coopJoined = true;
      pushEvent(`Hosting room ${msg.roomCode}`);
      return;
    }
    if (msg.type === "room_joined") {
      state.net.mode = "guest";
      state.net.roomCode = msg.roomCode;
      state.net.playerSlot = 2;
      state.net.status = "joined";
      state.coopJoined = true;
      state.net.waitingStart = performance.now();
      pushEvent(`Joined room ${msg.roomCode}`);
      return;
    }
    if (msg.type === "peer_joined" && state.net.mode === "host") {
      state.net.status = "peer_joined";
      pushEvent("Online wingman connected.");
      return;
    }
    if (msg.type === "peer_left" && state.net.mode === "host") {
      state.net.status = "hosting";
      pushEvent("Online wingman disconnected.");
      return;
    }
    if (msg.type === "guest_input" && state.net.mode === "host") {
      state.net.guestInput = {
        down: new Set(msg.input?.down || []),
        pressed: new Set(msg.input?.pressed || []),
      };
      return;
    }
    if (msg.type === "state_snapshot" && state.net.mode === "guest") {
      state.net.lastSnapshotAt = performance.now();
      state.net.snapshotSeq = msg.seq || 0;
      applySnapshotPayload(msg.snapshot || {});
      return;
    }
    if (msg.type === "error" && msg.message) {
      pushEvent(`Online error: ${msg.message}`);
    }
  }

  function openSocket() {
    resetNetSession();
    try {
      const sock = new WebSocket(wsUrl());
      state.net.socket = sock;
      state.net.status = "connecting";
      sock.addEventListener("open", () => {
        state.net.status = "connected";
      });
      sock.addEventListener("message", handleNetMessage);
      sock.addEventListener("close", () => {
        if (state.net.mode !== "offline") pushEvent("Online session ended.");
        resetNetSession();
      });
      sock.addEventListener("error", () => {
        pushEvent("Failed to connect multiplayer server.");
      });
      return true;
    } catch {
      pushEvent("Failed to open multiplayer socket.");
      return false;
    }
  }

  function hostOnlineRoom() {
    if (!openSocket()) return;
    const sock = state.net.socket;
    if (!sock) return;
    sock.addEventListener(
      "open",
      () => {
        sendNet({ type: "create_room" });
      },
      { once: true }
    );
  }

  function joinOnlineRoom() {
    const raw = prompt("Enter room code");
    if (!raw) return;
    const roomCode = raw.trim().toUpperCase();
    if (!roomCode) return;
    if (!openSocket()) return;
    const sock = state.net.socket;
    if (!sock) return;
    sock.addEventListener(
      "open",
      () => {
        sendNet({ type: "join_room", roomCode });
      },
      { once: true }
    );
  }

  const weaponDefs = {
    pulse: {
      name: "Pulse",
      cooldown: 0.12,
      speed: 670,
      spread: 0.05,
      shots: 1,
      color: "#79f5ff",
      damageMult: 1,
    },
    scatter: {
      name: "Scatter",
      cooldown: 0.33,
      speed: 620,
      spread: 0.35,
      shots: 7,
      color: "#ffc66d",
      damageMult: 0.55,
    },
    rail: {
      name: "Rail",
      cooldown: 0.72,
      speed: 950,
      spread: 0.015,
      shots: 1,
      color: "#ff8bdb",
      damageMult: 2.2,
      pierce: 3,
    },
  };

  const upgrades = [
    { id: "damage", label: "+18% damage", apply: () => (player.damage *= 1.18) },
    { id: "speed", label: "+14% speed", apply: () => (player.speed *= 1.14) },
    { id: "firerate", label: "+16% fire rate", apply: () => (player.fireRateMult *= 1.16) },
    { id: "crit", label: "+6% crit chance", apply: () => (player.critChance = Math.min(0.5, player.critChance + 0.06)) },
    { id: "hp", label: "+24 max hp", apply: () => ((player.maxHp += 24), (player.hp += 24)) },
    { id: "shield", label: "+14 shield", apply: () => (player.shield += 14) },
    { id: "magnet", label: "+50 pickup magnet", apply: () => (player.magnet += 50) },
    { id: "multishot", label: "+1 multishot", apply: () => (player.multishot = Math.min(3, player.multishot + 1)) },
    { id: "drone", label: "Add orbit drone", apply: () => (player.droneCount = Math.min(4, player.droneCount + 1)) },
    { id: "regen", label: "HP regen +0.6/s", apply: () => (player.regen += 0.6) },
    { id: "bomb", label: "+1 Nova bomb", apply: () => (player.bombs += 1) },
    { id: "lifesteal", label: "+2.5% lifesteal", apply: () => (player.lifesteal = Math.min(0.18, player.lifesteal + 0.025)) },
    { id: "armor", label: "10% damage reduction", apply: () => (player.damageReduction = Math.min(0.55, player.damageReduction + 0.1)) },
    { id: "dash_cd", label: "Dash cooldown -16%", apply: () => (player.dashCdMult *= 0.84) },
    { id: "bomb_cd", label: "Bomb cooldown -18%", apply: () => (player.bombCdMult *= 0.82) },
    { id: "projectile_speed", label: "+18% projectile speed", apply: () => (player.projectileSpeedMult *= 1.18) },
    { id: "projectile_size", label: "+20% projectile size", apply: () => (player.projectileSizeMult = Math.min(2.1, player.projectileSizeMult * 1.2)) },
    { id: "range", label: "+22% shot range", apply: () => (player.rangeMult *= 1.22) },
    { id: "pierce", label: "+1 projectile pierce", apply: () => (player.bonusPierce = Math.min(4, player.bonusPierce + 1)) },
    { id: "boss_hunter", label: "+28% boss damage", apply: () => (player.bossDamageMult *= 1.28) },
    { id: "drop_rate", label: "+25% drop rate", apply: () => (player.dropRateMult *= 1.25) },
    { id: "mission_pay", label: "+30% mission rewards", apply: () => (player.missionRewardMult *= 1.3) },
    { id: "combo_focus", label: "Combo lasts longer", apply: () => ((player.comboDuration += 0.8), (player.comboDecayMul *= 0.86)) },
    { id: "weapon_scatter", label: "Unlock Scatter weapon", apply: () => ((state.unlockedWeapons.scatter = true), (state.selectedWeapon = "scatter")) },
    { id: "weapon_rail", label: "Unlock Rail weapon", apply: () => ((state.unlockedWeapons.rail = true), (state.selectedWeapon = "rail")) },
    { id: "crit_power", label: "+35% crit damage", apply: () => (player.critMult += 0.35) },
    { id: "overclock_core", label: "Overclock lasts longer", apply: () => (player.overclockBonusTime += 2.2) },
    { id: "cryo_reserve", label: "Cryo lasts longer", apply: () => (player.freezeBonusTime += 1.4) },
    { id: "shield_regen", label: "+1.4 shield regen/s", apply: () => (player.shieldRegen += 1.4) },
    { id: "bomb_payload", label: "+28% bomb damage", apply: () => (player.bombDamageMult *= 1.28) },
    { id: "bomb_radius", label: "+22% bomb radius", apply: () => (player.bombRadiusMult *= 1.22) },
    { id: "dash_burst", label: "Dash emits shockwave", apply: () => (player.dashShockwave += 42) },
    { id: "wingman_arsenal", label: "Wingman +28% damage", apply: () => (player.wingmanDamageMult *= 1.28) },
    {
      id: "wing_tree_offense",
      label: "Wingman tree: offense",
      apply: () => (player.wingTreeOffense = Math.min(3, player.wingTreeOffense + 1)),
    },
    {
      id: "wing_tree_defense",
      label: "Wingman tree: defense",
      apply: () => (player.wingTreeDefense = Math.min(3, player.wingTreeDefense + 1)),
    },
    {
      id: "wing_tree_utility",
      label: "Wingman tree: utility",
      apply: () => (player.wingTreeUtility = Math.min(3, player.wingTreeUtility + 1)),
    },
    { id: "streak_guard", label: "Streak grants shield", apply: () => (player.streakGuard += 1) },
    { id: "salvage_ops", label: "+25% salvage gains", apply: () => (player.salvageMult *= 1.25) },
    { id: "reroll", label: "+1 reroll token", apply: () => (player.rerolls += 1) },
    { id: "banish", label: "+1 banish token", apply: () => (player.banishes += 1) },
  ];
  const synergyDefs = [
    {
      id: "blood_rush",
      label: "Blood Rush",
      needs: { lifesteal: 1, firerate: 1 },
      apply: () => {
        player.lifesteal = Math.min(0.28, player.lifesteal + 0.05);
        player.fireRateMult *= 1.12;
      },
      note: "Lifesteal and fire rate spike.",
    },
    {
      id: "orbital_forge",
      label: "Orbital Forge",
      needs: { drone: 1, range: 1 },
      apply: () => {
        player.droneCount = Math.min(6, player.droneCount + 1);
        player.rangeMult *= 1.14;
      },
      note: "Extra drone with wider pressure ring.",
    },
    {
      id: "bombardier",
      label: "Bombardier Core",
      needs: { bomb: 1, bomb_cd: 1 },
      apply: () => {
        player.bombs += 2;
        player.bombCdMult *= 0.8;
      },
      note: "Bomb stock and cooldown both improved.",
    },
    {
      id: "hunter_rail",
      label: "Hunter Rail",
      needs: { boss_hunter: 1, crit: 1 },
      apply: () => {
        player.bossDamageMult *= 1.25;
        player.critMult += 0.4;
      },
      note: "Critical boss deletes.",
    },
    {
      id: "phase_glide",
      label: "Phase Glide",
      needs: { speed: 1, armor: 1 },
      apply: () => {
        player.speed *= 1.12;
        player.damageReduction = Math.min(0.62, player.damageReduction + 0.08);
        player.dashCdMult *= 0.85;
      },
      note: "Tankier movement with shorter dashes.",
    },
    {
      id: "event_harvester",
      label: "Event Harvester",
      needs: { overclock_core: 1, cryo_reserve: 1 },
      apply: () => {
        state.runMods.scoreMul *= 1.1;
        player.missionRewardMult *= 1.1;
      },
      note: "Event windows become more rewarding.",
    },
    {
      id: "shock_spear",
      label: "Shock Spear",
      needs: { dash_burst: 1, projectile_speed: 1 },
      apply: () => {
        player.dashShockwave += 60;
        player.projectileSpeedMult *= 1.15;
      },
      note: "Dash and projectile aggression spike.",
    },
    {
      id: "guardian_loop",
      label: "Guardian Loop",
      needs: { shield_regen: 1, streak_guard: 1 },
      apply: () => {
        player.shieldRegen += 1.2;
        player.shield += 20;
      },
      note: "Sustain loop enabled.",
    },
  ];
  const runEventDefs = [
    { id: "meteor", label: "Meteor Storm", duration: 8.5, mods: { spawnMul: 1.3, enemySpeedMul: 1.08, scoreMul: 1.12 } },
    { id: "gravity_well", label: "Gravity Well", duration: 9.5, mods: { projectileSpeedMul: 0.8, enemySpeedMul: 0.86, dropRateMul: 1.25 } },
    { id: "overcharge", label: "Overcharge Field", duration: 8, mods: { playerDamageMul: 1.3, enemyHpMul: 1.12 } },
    { id: "void_fog", label: "Void Fog", duration: 10, mods: { enemySpeedMul: 1.18, dropRateMul: 1.15, scoreMul: 1.18 } },
    { id: "calm_lane", label: "Calm Lane", duration: 7, mods: { enemySpeedMul: 0.82, spawnMul: 0.78 } },
  ];
  const bossCycle = ["dreadnought", "lancer", "hive", "bulwark"];
  state.meta = loadMeta();
  refreshMetaUnlocks(false);
  state.settings = loadSettings();
  state.runSaveAvailable = hasRunSave();
  state.challenge = buildTodayChallenge();

  function resetRunMods() {
    state.runMods.enemySpeedMul = 1;
    state.runMods.enemyHpMul = 1;
    state.runMods.spawnMul = 1;
    state.runMods.playerDamageMul = 1;
    state.runMods.dropRateMul = 1;
    state.runMods.scoreMul = 1;
    state.runMods.projectileSpeedMul = 1;
  }

  function pushEvent(msg) {
    state.events.unshift(msg);
    if (state.events.length > MAX_EVENTS) state.events.length = MAX_EVENTS;
  }

  function applyRunEvent(def) {
    state.activeEvent = {
      id: def.id,
      label: def.label,
      timeLeft: def.duration,
      duration: def.duration,
    };
    resetRunMods();
    Object.assign(state.runMods, def.mods);
    pushEvent(`Anomaly: ${def.label}.`);
  }

  function maybeTriggerRunEvent() {
    if (state.mode !== "playing" || state.activeEvent) return;
    const pool = runEventDefs;
    const pick = pool[Math.floor(rng.range(0, pool.length))];
    applyRunEvent(pick);
  }

  function updateRunEvents(dt) {
    if (state.mode !== "playing") return;
    if (state.activeEvent) {
      state.activeEvent.timeLeft = Math.max(0, state.activeEvent.timeLeft - dt);
      if (state.activeEvent.timeLeft <= 0) {
        const name = state.activeEvent.label;
        state.activeEvent = null;
        resetRunMods();
        state.eventClock = rng.range(EVENT_MIN_GAP, EVENT_MAX_GAP);
        pushEvent(`${name} dissipated.`);
      }
      return;
    }
    state.eventClock -= dt;
    if (state.eventClock <= 0) maybeTriggerRunEvent();
  }

  function spawnThreatHazard() {
    const roll = Math.floor(rng.range(0, 3));
    if (roll === 0) {
      const cx = rng.range(WIDTH * 0.2, WIDTH * 0.8);
      const cy = rng.range(HEIGHT * 0.2, HEIGHT * 0.8);
      for (let i = 0; i < 12; i++) {
        const a = (TAU / 12) * i;
        state.enemyProjectiles.push({
          x: cx,
          y: cy,
          vx: Math.cos(a) * 220 * state.runMods.projectileSpeedMul,
          vy: Math.sin(a) * 220 * state.runMods.projectileSpeedMul,
          r: 6,
          life: 3.8,
          damage: 9 + state.wave * 0.6,
        });
      }
      pushEvent("Threat event: Shrapnel burst.");
      return;
    }
    if (roll === 1) {
      for (let i = 0; i < 4; i++) {
        state.hazards.push({
          id: "mine",
          x: rng.range(80, WIDTH - 80),
          y: rng.range(90, HEIGHT - 90),
          r: 24 + rng.range(0, 10),
          life: 8 + rng.range(0, 3),
          dps: 16 + state.wave * 0.5,
        });
      }
      pushEvent("Threat event: Minefield.");
      return;
    }
    addEnemy("kamikaze");
    if (state.wave >= 6 && rng.next() < 0.7) addEnemy("shooter");
    if (state.wave >= 8 && rng.next() < 0.45) addEnemy("summoner");
    pushEvent("Threat event: Reinforcement warp.");
  }

  function updateThreatDirector(dt) {
    if (state.mode !== "playing") return;
    state.directorCd = Math.max(0, state.directorCd - dt);
    for (let i = state.hazards.length - 1; i >= 0; i--) {
      const h = state.hazards[i];
      h.life -= dt;
      if (h.life <= 0) {
        state.hazards.splice(i, 1);
        continue;
      }
      const d = Math.hypot(player.x - h.x, player.y - h.y);
      if (d < h.r + player.r) {
        damagePlayer(h.dps * dt);
      }
    }
    if (state.heat >= 45 && state.directorCd <= 0) {
      spawnThreatHazard();
      state.directorCd = rng.range(8.5, 14.5);
    }
  }

  function checkSynergies() {
    for (const s of synergyDefs) {
      if (state.synergies[s.id]) continue;
      let ok = true;
      for (const [u, min] of Object.entries(s.needs)) {
        if ((state.upgradeCounts[u] || 0) < min) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      state.synergies[s.id] = true;
      s.apply();
      state.flash = Math.max(state.flash, 0.24);
      pushEvent(`Synergy online: ${s.label} - ${s.note}`);
    }
  }

  function getWeaponMasteryTier(weaponId) {
    const kills = Number(state.meta?.masteryKills?.[weaponId] || 0);
    const marks = masteryThresholds[weaponId] || [];
    let tier = 0;
    for (const threshold of marks) if (kills >= threshold) tier += 1;
    return tier;
  }

  function getMasteryDamageMul(weaponId) {
    return 1 + getWeaponMasteryTier(weaponId) * 0.045;
  }

  function isWeaponEvolved(weaponId) {
    return getWeaponMasteryTier(weaponId) >= 3;
  }

  function masteryBonusLines(weaponId) {
    const tier = getWeaponMasteryTier(weaponId);
    const lines = [`Damage bonus: +${(tier * 4.5).toFixed(1)}% (${tier}/3 tiers)`];
    if (weaponId === "scatter") {
      lines.push(tier >= 2 ? "Tier 2+: +1 pellet per shot (active)" : "Tier 2+: +1 pellet per shot");
    }
    if (weaponId === "rail") {
      lines.push(tier >= 1 ? "Tier 1+: +3% crit chance (active)" : "Tier 1+: +3% crit chance");
      lines.push(tier >= 2 ? "Tier 2+: +0.25 crit multiplier (active)" : "Tier 2+: +0.25 crit multiplier");
    }
    if (weaponId === "pulse") {
      lines.push("Pure DPS scaling weapon (all tiers apply to base damage).");
    }
    return lines;
  }

  function getModifierForWave(wave) {
    if (wave <= 1) return waveModifiers[0];
    const weighted = wave <= 2 ? waveModifiers.slice(0, 2) : waveModifiers;
    return weighted[Math.floor(rng.range(0, weighted.length))];
  }

  function createMissionForWave(wave) {
    const defs = [
      {
        id: "eliminate",
        label: "Eliminate hostiles",
        target: 6 + wave * 2,
        reward: { score: 220 + wave * 40, xp: 40 + wave * 7, heal: 14, bombs: 0 },
      },
      {
        id: "survive",
        label: "Hold position",
        target: 15 + wave * 2,
        reward: { score: 180 + wave * 34, xp: 32 + wave * 6, heal: 10, bombs: 1 },
      },
      {
        id: "collector",
        label: "Collect power cores",
        target: 2 + Math.floor(wave / 2),
        reward: { score: 210 + wave * 36, xp: 36 + wave * 6, heal: 18, bombs: 0 },
      },
    ];
    const picked = defs[Math.floor(rng.range(0, defs.length))];
    return {
      id: picked.id,
      label: picked.label,
      target: picked.target,
      progress: 0,
      complete: false,
      reward: picked.reward,
    };
  }

  function createBountyForWave(wave) {
    if (wave < 2) return null;
    const defs = [
      {
        id: "shooter",
        minWave: 3,
        label: "Sharpshooter Sweep",
        target: 3 + Math.floor(wave * 0.5),
        reward: { score: 120 + wave * 24, xp: 22 + wave * 5, shield: 10, rerolls: 0 },
      },
      {
        id: "tank",
        minWave: 5,
        label: "Bulwark Break",
        target: 2 + Math.floor(wave * 0.25),
        reward: { score: 170 + wave * 28, xp: 30 + wave * 6, shield: 15, rerolls: 0 },
      },
      {
        id: "sniper",
        minWave: 4,
        label: "Counter-Sniper",
        target: 2 + Math.floor(wave * 0.34),
        reward: { score: 145 + wave * 25, xp: 26 + wave * 5, shield: 12, rerolls: 0 },
      },
      {
        id: "kamikaze",
        minWave: 6,
        label: "Interceptor Sweep",
        target: 3 + Math.floor(wave * 0.45),
        reward: { score: 150 + wave * 22, xp: 24 + wave * 5, shield: 8, rerolls: 1 },
      },
      {
        id: "summoner",
        minWave: 8,
        label: "Silence The Summoners",
        target: 2 + Math.floor(wave * 0.3),
        reward: { score: 200 + wave * 26, xp: 34 + wave * 6, shield: 14, rerolls: 1 },
      },
      {
        id: "elite",
        minWave: 7,
        label: "Elite Purge",
        target: 2 + Math.floor(wave * 0.3),
        reward: { score: 220 + wave * 30, xp: 36 + wave * 6, shield: 18, rerolls: 1 },
      },
    ];
    const pool = defs.filter((d) => wave >= d.minWave);
    if (!pool.length) return null;
    const picked = pool[Math.floor(rng.range(0, pool.length))];
    return {
      id: picked.id,
      label: picked.label,
      target: picked.target,
      progress: 0,
      complete: false,
      reward: picked.reward,
    };
  }

  function applyBountyReward() {
    const b = state.bounty;
    if (!b || b.complete) return;
    b.complete = true;
    state.score += b.reward.score;
    player.xp += b.reward.xp;
    player.shield += b.reward.shield;
    player.rerolls += b.reward.rerolls;
    state.flash = Math.max(state.flash, 0.2);
    pushEvent(`Bounty complete: +${b.reward.score} score, +${b.reward.xp} XP.`);
  }

  function applyMissionReward() {
    const m = state.mission;
    if (!m || m.complete) return;
    m.complete = true;
    const mult = player.missionRewardMult;
    state.score += m.reward.score * mult;
    player.xp += m.reward.xp * mult;
    player.hp = Math.min(player.maxHp, player.hp + m.reward.heal * mult);
    player.bombs += m.reward.bombs;
    state.flash = Math.max(state.flash, 0.28);
    pushEvent(`Mission complete: +${m.reward.score} score, +${m.reward.xp} XP.`);
  }

  function startWavePackage() {
    const biome = pickBiomeForWave(state.wave);
    applyBiome(biome);
    maybeSetEndgameMutator();
    state.waveModifier = getModifierForWave(state.wave);
    state.mission = createMissionForWave(state.wave);
    state.bounty = createBountyForWave(state.wave);
    pushEvent(`Wave ${state.wave} started: ${state.waveModifier.name} | ${biome.label}.`);
    if (state.bounty) pushEvent(`Bounty: ${state.bounty.label} (${state.bounty.target}).`);
    if (state.wave % 2 === 0) {
      addEnemy("mini");
      pushEvent("Mini-boss breach detected.");
    }
    if (state.wave % 3 === 0) {
      const bossType = bossCycle[(state.wave / 3 - 1) % bossCycle.length];
      addEnemy("boss", { bossType });
      pushEvent(`${bossType[0].toUpperCase()}${bossType.slice(1)} warped in.`);
      playSfx(160, 0.16, "sawtooth", 0.26);
    }
  }

  function applyMetaPerks() {
    const perks = state.meta?.perks || { hull: 0, cannons: 0, thrusters: 0 };
    if (perks.hull > 0) {
      const hpBonus = perks.hull * 12;
      player.maxHp += hpBonus;
      player.hp += hpBonus;
    }
    if (perks.cannons > 0) player.damage *= 1 + perks.cannons * 0.08;
    if (perks.thrusters > 0) player.speed *= 1 + perks.thrusters * 0.06;
  }

  function getMetaUpgradeCost(level) {
    return 20 + level * 12;
  }

  function purchaseMetaUpgrade(key) {
    if (state.mode !== "menu") return;
    const perks = state.meta.perks;
    let perkKey = null;
    if (key === "7") perkKey = "hull";
    if (key === "8") perkKey = "cannons";
    if (key === "9") perkKey = "thrusters";
    if (!perkKey) return;
    const level = perks[perkKey];
    const cost = getMetaUpgradeCost(level);
    if (state.meta.shards < cost) {
      pushEvent("Not enough shards.");
      return;
    }
    state.meta.shards -= cost;
    perks[perkKey] += 1;
    saveMeta();
    pushEvent(`Purchased ${perkKey} Mk ${perks[perkKey]}.`);
  }

  function grantMetaRewards() {
    if (state.metaRewardGranted || !state.meta) return;
    state.metaRewardGranted = true;
    const shardsEarned = Math.max(1, Math.floor(state.score / 140) + state.wave * 2);
    state.meta.shards += shardsEarned;
    state.meta.totalShardsEarned = Number(state.meta.totalShardsEarned || 0) + shardsEarned;
    state.meta.bestScore = Math.max(state.meta.bestScore, Math.floor(state.score));
    state.meta.bestWave = Math.max(state.meta.bestWave, state.wave);
    state.meta.weaponBest[state.selectedWeapon] = Math.max(state.meta.weaponBest[state.selectedWeapon] || 0, Math.floor(state.score));
    if (state.runMode === "daily" && state.challenge?.code) {
      const code = state.challenge.code;
      state.meta.dailyBest[code] = Math.max(Number(state.meta.dailyBest[code] || 0), Math.floor(state.score));
      const today = new Date().toISOString().slice(0, 10);
      if (state.meta.lastDailyClaim !== today && state.score >= 180) {
        const prev = state.meta.lastDailyClaim;
        const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        state.meta.dailyStreak = prev === y ? state.meta.dailyStreak + 1 : 1;
        const dailyBonus = 8 + state.meta.dailyStreak * 2;
        state.meta.shards += dailyBonus;
        state.meta.lastDailyClaim = today;
        pushEvent(`Daily reward +${dailyBonus} shards (streak ${state.meta.dailyStreak}).`);
      }
    }
    refreshMetaUnlocks(true);
    saveMeta();
    pushEvent(`Recovered ${shardsEarned} star shards.`);
  }

  function resetGame() {
    clearRunSave();
    state.mode = "playing";
    state.time = 0;
    state.wave = 1;
    state.waveClock = 0;
    state.waveLength = 26;
    state.combo = 0;
    state.comboTimer = 0;
    state.score = 0;
    state.kills = 0;
    state.particles.length = 0;
    state.enemies.length = 0;
    state.projectiles.length = 0;
    state.enemyProjectiles.length = 0;
    state.drops.length = 0;
    state.events = ["New run started."];
    state.cameraShake = 0;
    state.flash = 0;
    state.selectedWeapon = "pulse";
    state.choices = [];
    state.waveModifier = waveModifiers[0];
    state.activeEvent = null;
    state.eventClock = rng.range(EVENT_MIN_GAP, EVENT_MAX_GAP);
    resetRunMods();
    state.challengeRules.noBombRefill = false;
    state.mission = null;
    state.relicChoices = [];
    state.relics = {};
    state.biome = biomes[0];
    state.endgameMutator = null;
    state.synergies = {};
    state.upgradeCounts = {};
    state.bannedUpgrades = {};
    state.damageNumbers.length = 0;
    state.streak = 0;
    state.streakTimer = 0;
    state.metaRewardGranted = false;
    state.overclock = 0;
    state.freeze = 0;
    state.danger = 0;
    state.heat = 0;
    state.heatTier = 0;
    state.bounty = null;
    state.hazards = [];
    state.directorCd = 6;
    state.wingmanMode = "balanced";
    state.evoPulseCounter = 0;
    state.waveSkipCd = 0;
    state.saveTimer = 0;
    player.x = WIDTH * 0.5;
    player.y = HEIGHT * 0.5;
    player.vx = 0;
    player.vy = 0;
    player.speed = 260;
    player.hp = 100;
    player.maxHp = 100;
    player.fireCd = 0;
    player.aimAngle = 0;
    player.damage = 10;
    player.fireRateMult = 1;
    player.critChance = 0.08;
    player.critMult = 1.8;
    player.projectileSpeedMult = 1;
    player.projectileSizeMult = 1;
    player.rangeMult = 1;
    player.lifesteal = 0;
    player.damageReduction = 0;
    player.dashCdMult = 1;
    player.bombCdMult = 1;
    player.bossDamageMult = 1;
    player.dropRateMult = 1;
    player.missionRewardMult = 1;
    player.comboDecayMul = 1;
    player.comboDuration = 2.4;
    player.bonusPierce = 0;
    player.scrap = 0;
    player.xp = 0;
    player.nextXp = 65;
    player.level = 1;
    player.magnet = 80;
    player.dashCd = 0;
    player.dashTimer = 0;
    player.bombs = 2;
    player.bombCd = 0;
    player.waveSkipCd = 0;
    player.shield = 0;
    player.droneCount = 0;
    player.multishot = 0;
    player.regen = 0;
    player.shieldRegen = 0;
    player.overclockBonusTime = 0;
    player.freezeBonusTime = 0;
    player.bombDamageMult = 1;
    player.bombRadiusMult = 1;
    player.dashShockwave = 0;
    player.wingmanDamageMult = 1;
    player.salvageMult = 1;
    player.streakGuard = 0;
    player.wingTreeOffense = 0;
    player.wingTreeDefense = 0;
    player.wingTreeUtility = 0;
    player.rerolls = 1;
    player.banishes = 1;
    player.contactDamageCd = 0;
    player.alive = true;
    wingman.x = WIDTH * 0.5 + 70;
    wingman.y = HEIGHT * 0.5 + 20;
    wingman.vx = 0;
    wingman.vy = 0;
    wingman.fireCd = 0;
    wingman.aimAngle = 0;
    wingman.dashCd = 0;
    wingman.dashTimer = 0;
    wingman.bombs = 1;
    wingman.bombCd = 0;
    wingman.burstCd = 0;
    wingman.supportCd = 0;
    state.unlockedWeapons = { pulse: true, scatter: false, rail: false };
    if (state.runMode === "daily") {
      const challenge = buildTodayChallenge();
      state.challenge = challenge;
      setRunSeed(challenge.code);
    } else if (state.runMode === "seeded" && state.runSeed) {
      setRunSeed(state.runSeed);
    } else {
      clearRunSeed();
      state.runMode = "standard";
    }
    if (!isClassUnlocked(state.selectedClass)) state.selectedClass = "striker";
    applyMetaPerks();
    shipClasses[state.selectedClass]?.apply?.();
    if (isWeaponEvolved(state.selectedWeapon)) pushEvent(`${weaponDefs[state.selectedWeapon].name} evolution active.`);
    player.hp = Math.min(player.hp, player.maxHp);
    if (state.runMode === "daily" && state.challenge?.mutators) {
      for (const mut of state.challenge.mutators) mut.apply();
      pushEvent(`Daily challenge: ${state.challenge.labels.join(", ")}`);
    }
    startWavePackage();
    saveRun();
  }

  function toCanvasCoords(evt) {
    const rect = canvas.getBoundingClientRect();
    const x = ((evt.clientX - rect.left) / rect.width) * WIDTH;
    const y = ((evt.clientY - rect.top) / rect.height) * HEIGHT;
    return { x, y };
  }

  function getTouchButtonLayout() {
    const tScale = state.ui.touchScale;
    const edge = 32 * tScale;
    const gap = 14 * tScale;
    const dashR = 44 * tScale;
    const bombR = 44 * tScale;
    const warpR = 40 * tScale;
    return {
      dash: { x: WIDTH - edge - dashR * 2.6, y: HEIGHT - edge - dashR, r: dashR },
      bomb: { x: WIDTH - edge - bombR, y: HEIGHT - edge - bombR * 2.75 - gap, r: bombR },
      warp: { x: WIDTH - edge - warpR, y: HEIGHT - edge - warpR, r: warpR },
    };
  }

  function applyTouchDerivedInputs() {
    const touch = state.touch;
    if (!touch.enabled) return;
    const buttons = getTouchButtonLayout();
    const active = { dash: false, bomb: false, warp: false };
    let aimPoint = null;
    for (const [id, pt] of Object.entries(touch.points)) {
      if (String(touch.leftId) === id) continue;
      aimPoint = pt;
      const dd = Math.hypot(pt.x - buttons.dash.x, pt.y - buttons.dash.y);
      const db = Math.hypot(pt.x - buttons.bomb.x, pt.y - buttons.bomb.y);
      const dw = Math.hypot(pt.x - buttons.warp.x, pt.y - buttons.warp.y);
      if (dd <= buttons.dash.r) active.dash = true;
      if (db <= buttons.bomb.r) active.bomb = true;
      if (dw <= buttons.warp.r) active.warp = true;
    }
    if (aimPoint) {
      state.pointer.x = aimPoint.x;
      state.pointer.y = aimPoint.y;
      state.pointer.inside = true;
    }
    touch.actions = active;
    if (active.dash && !touch.prevActions.dash) state.keyPressed.add(state.settings.dashKey === "mouse" ? "shift" : state.settings.dashKey);
    if (active.bomb && !touch.prevActions.bomb) state.keyPressed.add(state.settings.bombKey);
    if (active.warp && !touch.prevActions.warp) state.keyPressed.add(state.settings.warpKey);
    touch.prevActions = active;
  }

  function updateTouchMoveFromPoint(pt) {
    const t = state.touch;
    const maxR = 58 * state.ui.touchScale;
    const dx = pt.x - t.stickBase.x;
    const dy = pt.y - t.stickBase.y;
    const d = Math.hypot(dx, dy) || 1;
    const use = Math.min(maxR, d);
    t.moveX = (dx / d) * (use / maxR);
    t.moveY = (dy / d) * (use / maxR);
  }

  function clearTouchMove() {
    state.touch.leftId = null;
    state.touch.moveX = 0;
    state.touch.moveY = 0;
    state.touch.stickBase = { x: 86 * state.ui.touchScale, y: HEIGHT - 86 * state.ui.touchScale };
  }

  function menuButtonRects() {
    const cont = { x: WIDTH * 0.34, y: HEIGHT * 0.66, w: WIDTH * 0.32, h: 44 };
    const start = { x: WIDTH * 0.34, y: HEIGHT * 0.72, w: WIDTH * 0.32, h: 58 };
    const settings = { x: WIDTH * 0.34, y: HEIGHT * 0.8, w: WIDTH * 0.32, h: 46 };
    const codex = { x: WIDTH * 0.34, y: HEIGHT * 0.86, w: WIDTH * 0.32, h: 40 };
    const back = { x: WIDTH * 0.34, y: HEIGHT * 0.78, w: WIDTH * 0.32, h: 52 };
    const daily = { x: WIDTH * 0.12, y: HEIGHT * 0.665, w: WIDTH * 0.2, h: 36 };
    const seed = { x: WIDTH * 0.34, y: HEIGHT * 0.665, w: WIDTH * 0.2, h: 36 };
    const copy = { x: WIDTH * 0.56, y: HEIGHT * 0.665, w: WIDTH * 0.2, h: 36 };
    const coop = { x: WIDTH * 0.78, y: HEIGHT * 0.665, w: WIDTH * 0.1, h: 36 };
    const touchToggle = { x: WIDTH * 0.63, y: HEIGHT * 0.365, w: WIDTH * 0.24, h: 34 };
    const shakeDown = { x: WIDTH * 0.63, y: HEIGHT * 0.415, w: WIDTH * 0.11, h: 34 };
    const shakeUp = { x: WIDTH * 0.76, y: HEIGHT * 0.415, w: WIDTH * 0.11, h: 34 };
    const quality = { x: WIDTH * 0.63, y: HEIGHT * 0.465, w: WIDTH * 0.24, h: 34 };
    const lowVfx = { x: WIDTH * 0.63, y: HEIGHT * 0.515, w: WIDTH * 0.11, h: 34 };
    const colorblind = { x: WIDTH * 0.76, y: HEIGHT * 0.515, w: WIDTH * 0.11, h: 34 };
    const aimDown = { x: WIDTH * 0.63, y: HEIGHT * 0.555, w: WIDTH * 0.11, h: 34 };
    const aimUp = { x: WIDTH * 0.76, y: HEIGHT * 0.555, w: WIDTH * 0.11, h: 34 };
    const bindDash = { x: WIDTH * 0.63, y: HEIGHT * 0.605, w: WIDTH * 0.075, h: 34 };
    const bindBomb = { x: WIDTH * 0.715, y: HEIGHT * 0.605, w: WIDTH * 0.075, h: 34 };
    const bindWarp = { x: WIDTH * 0.8, y: HEIGHT * 0.605, w: WIDTH * 0.075, h: 34 };
    const preset = { x: WIDTH * 0.63, y: HEIGHT * 0.655, w: WIDTH * 0.11, h: 34 };
    const resetSettings = { x: WIDTH * 0.76, y: HEIGHT * 0.655, w: WIDTH * 0.11, h: 34 };
    const sfxDown = { x: WIDTH * 0.63, y: HEIGHT * 0.705, w: WIDTH * 0.11, h: 30 };
    const sfxUp = { x: WIDTH * 0.76, y: HEIGHT * 0.705, w: WIDTH * 0.11, h: 30 };
    const musicDown = { x: WIDTH * 0.63, y: HEIGHT * 0.742, w: WIDTH * 0.11, h: 30 };
    const musicUp = { x: WIDTH * 0.76, y: HEIGHT * 0.742, w: WIDTH * 0.11, h: 30 };
    const muteBtn = { x: WIDTH * 0.63, y: HEIGHT * 0.779, w: WIDTH * 0.24, h: 30 };
    const codexToggle = { x: WIDTH * 0.12, y: HEIGHT * 0.78, w: WIDTH * 0.2, h: 52 };
    return {
      start,
      cont,
      settings,
      codex,
      back,
      daily,
      seed,
      copy,
      coop,
      touchToggle,
      shakeDown,
      shakeUp,
      quality,
      lowVfx,
      colorblind,
      aimDown,
      aimUp,
      bindDash,
      bindBomb,
      bindWarp,
      preset,
      resetSettings,
      sfxDown,
      sfxUp,
      musicDown,
      musicUp,
      muteBtn,
      codexToggle,
    };
  }

  function pointInRect(pt, r) {
    return pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h;
  }

  function handleMenuTap(pt) {
    if (state.mode !== "menu") return false;
    const btn = menuButtonRects();
    if (state.menuScreen === "home") {
      if (pointInRect(pt, btn.start)) resetGame();
      else if (pointInRect(pt, btn.settings)) state.menuScreen = "settings";
      else if (pointInRect(pt, btn.codex)) state.menuScreen = "codex";
      else if (pointInRect(pt, btn.daily)) toggleRunMode();
      else if (pointInRect(pt, btn.seed)) setCustomSeedFromPrompt();
      else if (pointInRect(pt, btn.copy)) copyRunCode();
      else if (pointInRect(pt, btn.coop)) state.coopJoined = !state.coopJoined;
      else return false;
    } else if (state.menuScreen === "settings") {
      if (pointInRect(pt, btn.back)) state.menuScreen = "home";
      else if (pointInRect(pt, btn.touchToggle)) {
        state.settings.showTouchUi = !state.settings.showTouchUi;
        state.settings.accessibilityPreset = "custom";
        saveSettings();
      }
      else if (pointInRect(pt, btn.shakeDown)) adjustScreenShake(-0.1);
      else if (pointInRect(pt, btn.shakeUp)) adjustScreenShake(0.1);
      else if (pointInRect(pt, btn.quality)) cycleQualityMode();
      else if (pointInRect(pt, btn.lowVfx)) {
        state.settings.lowVfx = !state.settings.lowVfx;
        state.settings.accessibilityPreset = "custom";
        saveSettings();
      } else if (pointInRect(pt, btn.colorblind)) {
        state.settings.colorblind = !state.settings.colorblind;
        state.settings.accessibilityPreset = "custom";
        saveSettings();
      }
      else if (pointInRect(pt, btn.aimDown)) adjustAimAssist(-0.04);
      else if (pointInRect(pt, btn.aimUp)) adjustAimAssist(0.04);
      else if (pointInRect(pt, btn.bindDash)) cycleBinding("dash");
      else if (pointInRect(pt, btn.bindBomb)) cycleBinding("bomb");
      else if (pointInRect(pt, btn.bindWarp)) cycleBinding("warp");
      else if (pointInRect(pt, btn.preset)) cycleAccessibilityPreset();
      else if (pointInRect(pt, btn.resetSettings)) resetSettingsDefaults();
      else if (pointInRect(pt, btn.sfxDown)) {
        state.settings.sfxVolume = Math.max(0, state.settings.sfxVolume - 0.05);
        saveSettings();
      } else if (pointInRect(pt, btn.sfxUp)) {
        state.settings.sfxVolume = Math.min(1, state.settings.sfxVolume + 0.05);
        saveSettings();
      } else if (pointInRect(pt, btn.musicDown)) {
        state.settings.musicVolume = Math.max(0, state.settings.musicVolume - 0.05);
        saveSettings();
      } else if (pointInRect(pt, btn.musicUp)) {
        state.settings.musicVolume = Math.min(1, state.settings.musicVolume + 0.05);
        saveSettings();
      } else if (pointInRect(pt, btn.muteBtn)) {
        state.settings.muteAudio = !state.settings.muteAudio;
        saveSettings();
      }
      else return false;
    } else {
      if (pointInRect(pt, btn.back)) state.menuScreen = "home";
      else if (pointInRect(pt, btn.codexToggle)) state.codexTab = state.codexTab === "synergy" ? "mastery" : "synergy";
      else return false;
    }
    return true;
  }

  canvas.addEventListener("mousemove", (evt) => {
    const pt = toCanvasCoords(evt);
    state.pointer.x = pt.x;
    state.pointer.y = pt.y;
    state.pointer.inside = true;
  });
  canvas.addEventListener("mouseleave", () => {
    state.pointer.inside = false;
  });
  canvas.addEventListener("mousedown", (evt) => {
    wakeAudio();
    if (evt.button === 0) state.mouseDown = true;
    const pt = toCanvasCoords(evt);
    if (handleMenuTap(pt)) {
      state.lastMenuTapTs = performance.now();
      return;
    }
  });
  window.addEventListener("mouseup", (evt) => {
    if (evt.button === 0) state.mouseDown = false;
  });

  canvas.addEventListener(
    "touchstart",
    (evt) => {
      evt.preventDefault();
      wakeAudio();
      state.touch.enabled = true;
      for (const t of evt.changedTouches) {
        const pt = toCanvasCoords(t);
        if (handleMenuTap(pt)) {
          state.lastMenuTapTs = performance.now();
          continue;
        }
        state.touch.points[t.identifier] = pt;
        if (state.touch.leftId === null && pt.x < WIDTH * 0.6) {
          state.touch.leftId = t.identifier;
          state.touch.stickBase = { x: pt.x, y: pt.y };
          updateTouchMoveFromPoint(pt);
        }
      }
    },
    { passive: false }
  );

  window.addEventListener("resize", refreshUiMetrics);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", refreshUiMetrics);
  }
  window.addEventListener("beforeunload", saveRun);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) saveRun();
  });
  refreshUiMetrics();

  canvas.addEventListener(
    "touchmove",
    (evt) => {
      evt.preventDefault();
      for (const t of evt.changedTouches) {
        const pt = toCanvasCoords(t);
        state.touch.points[t.identifier] = pt;
        if (state.touch.leftId === t.identifier) updateTouchMoveFromPoint(pt);
      }
    },
    { passive: false }
  );

  canvas.addEventListener(
    "touchend",
    (evt) => {
      evt.preventDefault();
      for (const t of evt.changedTouches) {
        delete state.touch.points[t.identifier];
        if (state.touch.leftId === t.identifier) clearTouchMove();
      }
    },
    { passive: false }
  );
  canvas.addEventListener(
    "touchcancel",
    (evt) => {
      evt.preventDefault();
      for (const t of evt.changedTouches) {
        delete state.touch.points[t.identifier];
        if (state.touch.leftId === t.identifier) clearTouchMove();
      }
    },
    { passive: false }
  );

  window.addEventListener("keydown", (evt) => {
    wakeAudio();
    const k = evt.key.toLowerCase();
    state.keysDown.add(k);
    state.keyPressed.add(k);
    if (k === "f") toggleFullscreen();
    if (k === "escape" && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    if (k === "p" && state.mode === "playing") state.mode = "paused";
    else if (k === "p" && state.mode === "paused") state.mode = "playing";
    if (state.mode === "menu" && k === "s") {
      const idx = menuScreens.indexOf(state.menuScreen);
      state.menuScreen = menuScreens[(idx + 1 + menuScreens.length) % menuScreens.length];
    }
    if (state.mode === "menu" && (k === "enter" || k === " ")) resetGame();
    if (state.mode === "menu" && k === "y") toggleRunMode();
    if (state.mode === "menu" && k === "k") state.menuScreen = "codex";
    if (state.mode === "menu" && state.menuScreen === "codex" && k === "m") {
      state.codexTab = state.codexTab === "synergy" ? "mastery" : "synergy";
    }
    if (state.mode === "menu" && k === "n") cycleClass();
    if (state.mode === "menu" && state.menuScreen === "home" && k === "c") continueSavedRun();
    if (state.mode === "menu" && k === "v") setCustomSeedFromPrompt();
    if (state.mode === "menu" && k === "b") copyRunCode();
    if (state.mode === "menu" && ["7", "8", "9"].includes(k)) purchaseMetaUpgrade(k);
    if (state.mode === "menu" && k === "j") state.coopJoined = !state.coopJoined;
    if ((state.mode === "playing" || state.mode === "menu") && !(state.mode === "menu" && state.menuScreen === "settings") && k === "t") {
      cycleWingmanMode();
    }
    if (state.mode === "menu" && state.menuScreen === "settings" && k === "t") {
      state.settings.showTouchUi = !state.settings.showTouchUi;
      state.settings.accessibilityPreset = "custom";
      saveSettings();
    }
    if (state.mode === "menu" && state.menuScreen === "settings" && k === "c") {
      state.settings.colorblind = !state.settings.colorblind;
      state.settings.accessibilityPreset = "custom";
      saveSettings();
    }
    if (state.mode === "menu" && state.menuScreen === "settings" && k === "l") {
      state.settings.lowVfx = !state.settings.lowVfx;
      state.settings.accessibilityPreset = "custom";
      saveSettings();
    }
    if (state.mode === "menu" && state.menuScreen === "settings" && k === "z") cycleQualityMode();
    if (state.mode === "menu" && state.menuScreen === "settings" && k === "a") cycleAccessibilityPreset();
    if (state.mode === "menu" && state.menuScreen === "settings" && k === "0") resetSettingsDefaults();
    if (state.mode === "menu" && state.menuScreen === "settings" && (k === "," || k === "<")) {
      state.settings.sfxVolume = Math.max(0, state.settings.sfxVolume - 0.05);
      saveSettings();
    }
    if (state.mode === "menu" && state.menuScreen === "settings" && (k === "." || k === ">")) {
      state.settings.sfxVolume = Math.min(1, state.settings.sfxVolume + 0.05);
      saveSettings();
    }
    if (state.mode === "menu" && state.menuScreen === "settings" && (k === ";" || k === ":")) {
      state.settings.musicVolume = Math.max(0, state.settings.musicVolume - 0.05);
      saveSettings();
    }
    if (state.mode === "menu" && state.menuScreen === "settings" && (k === "'" || k === "\"")) {
      state.settings.musicVolume = Math.min(1, state.settings.musicVolume + 0.05);
      saveSettings();
    }
    if (state.mode === "menu" && state.menuScreen === "settings" && k === "m") {
      state.settings.muteAudio = !state.settings.muteAudio;
      saveSettings();
    }
    if (state.mode === "menu" && state.menuScreen === "settings" && k === "u") cycleBinding("dash");
    if (state.mode === "menu" && state.menuScreen === "settings" && k === "i") cycleBinding("bomb");
    if (state.mode === "menu" && state.menuScreen === "settings" && k === "o") cycleBinding("warp");
    if (state.mode === "menu" && state.menuScreen === "settings" && (k === "[" || k === "{")) adjustAimAssist(-0.04);
    if (state.mode === "menu" && state.menuScreen === "settings" && (k === "]" || k === "}")) adjustAimAssist(0.04);
    if (state.mode === "menu" && state.menuScreen === "settings" && (k === "-" || k === "_")) adjustScreenShake(-0.1);
    if (state.mode === "menu" && state.menuScreen === "settings" && (k === "=" || k === "+")) adjustScreenShake(0.1);
    if (state.mode === "menu" && k === "h") hostOnlineRoom();
    if (state.mode === "menu" && k === "g") joinOnlineRoom();
    if (k === "x" && state.net.mode !== "offline") resetNetSession();
    if (state.mode === "gameover" && k === "r") resetGame();
    if (state.mode === "levelup" && ["1", "2", "3"].includes(k)) pickUpgrade(Number(k) - 1);
    if (state.mode === "relic" && ["1", "2", "3"].includes(k)) pickRelic(Number(k) - 1);
    if (state.mode === "levelup" && k === "4") rerollChoices(false);
    if (state.mode === "levelup" && ["5", "6", "7"].includes(k)) banishChoice(Number(k) - 5);
    if (["1", "2", "3"].includes(k) && state.mode === "playing") {
      const map = { "1": "pulse", "2": "scatter", "3": "rail" };
      const next = map[k];
      if (weaponDefs[next] && state.unlockedWeapons[next]) state.selectedWeapon = next;
    }
  });
  window.addEventListener("keyup", (evt) => {
    state.keysDown.delete(evt.key.toLowerCase());
  });
  canvas.addEventListener("click", (evt) => {
    if (state.mode === "menu" && performance.now() - state.lastMenuTapTs < 250) return;
    if (handleMenuTap(toCanvasCoords(evt))) return;
    if (state.mode === "gameover") {
      resetGame();
      return;
    }
    if (state.mode === "levelup") {
      const pt = toCanvasCoords(evt);
      const rerollBtn = { x: WIDTH * 0.25, y: HEIGHT * 0.78, w: 220, h: 50 };
      if (pt.x >= rerollBtn.x && pt.x <= rerollBtn.x + rerollBtn.w && pt.y >= rerollBtn.y && pt.y <= rerollBtn.y + rerollBtn.h) {
        rerollChoices(false);
        return;
      }
      for (let i = 0; i < 3; i++) {
        const x = WIDTH * 0.18 + i * 300 + 250 - 58;
        const y = HEIGHT * 0.31 + 10;
        const w = 40;
        const h = 30;
        if (pt.x >= x && pt.x <= x + w && pt.y >= y && pt.y <= y + h) {
          banishChoice(i);
          return;
        }
      }
      for (let i = 0; i < 3; i++) {
        const x = WIDTH * 0.18 + i * 300;
        const y = HEIGHT * 0.31;
        const w = 250;
        const h = 170;
        if (pt.x >= x && pt.x <= x + w && pt.y >= y && pt.y <= y + h) {
          pickUpgrade(i);
          break;
        }
      }
    }
    if (state.mode === "relic") {
      const pt = toCanvasCoords(evt);
      for (let i = 0; i < 3; i++) {
        const x = WIDTH * 0.16 + i * 310;
        const y = HEIGHT * 0.34;
        const w = 260;
        const h = 180;
        if (pt.x >= x && pt.x <= x + w && pt.y >= y && pt.y <= y + h) {
          pickRelic(i);
          break;
        }
      }
    }
  });

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      canvas.requestFullscreen?.().catch(() => {});
    }
  }

  function spawnStarfield() {
    if (state.stars.length) return;
    for (let i = 0; i < 180; i++) {
      state.stars.push({
        x: rng.range(0, WIDTH),
        y: rng.range(0, HEIGHT),
        r: rng.range(0.8, 2.2),
        v: rng.range(6, 30),
      });
    }
  }

  function randomEdgeSpawn() {
    const side = Math.floor(rng.range(0, 4));
    if (side === 0) return { x: -40, y: rng.range(20, HEIGHT - 20) };
    if (side === 1) return { x: WIDTH + 40, y: rng.range(20, HEIGHT - 20) };
    if (side === 2) return { x: rng.range(20, WIDTH - 20), y: -40 };
    return { x: rng.range(20, WIDTH - 20), y: HEIGHT + 40 };
  }

  function addEnemy(kind, options = {}) {
    const spawn = kind === "boss" ? { x: WIDTH * 0.5, y: -80 } : randomEdgeSpawn();
    const modifier = state.waveModifier || waveModifiers[0];
    const run = state.runMods;
    const bossType = options.bossType || "dreadnought";
    const defs = {
      chaser: { hp: 24, speed: 95, r: 12, color: "#ff5c8a", value: 11 },
      shooter: { hp: 34, speed: 64, r: 14, color: "#ff9757", value: 16, shoot: 2.1 },
      tank: { hp: 95, speed: 42, r: 22, color: "#9a7dff", value: 36 },
      splitter: { hp: 46, speed: 80, r: 15, color: "#64ffc5", value: 18, split: true },
      sniper: { hp: 30, speed: 56, r: 13, color: "#ffda7d", value: 24, shoot: 2.7, sniper: true },
      leech: { hp: 42, speed: 118, r: 11, color: "#8ef2ff", value: 15, leech: true },
      shield_carrier: { hp: 70, speed: 70, r: 16, color: "#9fd1ff", value: 28, carrier: true },
      kamikaze: { hp: 18, speed: 145, r: 10, color: "#ff8e7d", value: 19, kamikaze: true },
      summoner: { hp: 58, speed: 64, r: 17, color: "#c7a1ff", value: 34, summon: 4.2, summoner: true },
      mini: { hp: 520, speed: 54, r: 28, color: "#ffd081", value: 180, shoot: 1.25, mini: true },
      boss: {
        dreadnought: { hp: 880, speed: 34, r: 40, color: "#ff4d7f", value: 520, shoot: 1.6, burst: 2.9 },
        lancer: { hp: 760, speed: 56, r: 34, color: "#ff9c5d", value: 540, shoot: 0.85, burst: 2.2 },
        hive: { hp: 980, speed: 30, r: 43, color: "#8df08f", value: 560, shoot: 1.2, burst: 3.6, summon: 3.4 },
        bulwark: { hp: 1280, speed: 24, r: 46, color: "#b8a4ff", value: 640, shoot: 1.55, burst: 2.1 },
      },
    };
    const d = kind === "boss" ? defs.boss[bossType] || defs.boss.dreadnought : defs[kind];
    const eliteChance = kind === "boss" || kind === "mini" ? 0 : Math.min(0.42, Math.max(0, (state.wave - 4) * 0.045));
    const elite = rng.next() < eliteChance;
    const baseHp = d.hp + state.wave * (kind === "tank" ? 5 : kind === "boss" ? 34 : 2);
    const hpMul = kind === "boss" ? run.enemyHpMul * 1.05 : modifier.hpMul * run.enemyHpMul;
    const speedMul = kind === "boss" ? run.enemySpeedMul : modifier.speedMul * run.enemySpeedMul;
    const eliteHp = elite ? 1.85 : 1;
    const eliteSpeed = elite ? 1.18 : 1;
    const eliteValue = elite ? 1.8 : 1;
    state.enemies.push({
      kind,
      x: spawn.x,
      y: spawn.y,
      vx: 0,
      vy: 0,
      hp: baseHp * hpMul * eliteHp,
      maxHp: baseHp * hpMul * eliteHp,
      speed: (d.speed + state.wave * 1.7) * speedMul * eliteSpeed,
      r: d.r,
      color: elite ? "#ffd95f" : d.color,
      value: d.value * eliteValue,
      shootCd: d.shoot ? rng.range(0.2, d.shoot) : 999,
      split: Boolean(d.split),
      boss: kind === "boss",
      bossType: kind === "boss" ? bossType : "",
      burstCd: kind === "boss" ? d.burst : 999,
      summonCd: d.summon ? d.summon : 999,
      spiralOffset: rng.range(0, TAU),
      sniper: Boolean(d.sniper),
      leech: Boolean(d.leech),
      carrier: Boolean(d.carrier),
      kamikaze: Boolean(d.kamikaze),
      summoner: Boolean(d.summoner),
      mini: Boolean(d.mini),
      elite,
      telegraphShot: 0,
      telegraphBurst: 0,
      phase: kind === "boss" ? 1 : 0,
      weakAngle: rng.range(0, TAU),
      hitFlash: 0,
    });
  }

  function spawnWave(dt) {
    state.waveClock += dt;
    const modifier = state.waveModifier || waveModifiers[0];
    const lateRamp = state.wave >= 8 ? 1 + (state.wave - 7) * 0.055 : 1;
    const heatPressure = 1 + state.heat * 0.006;
    const pacing = Math.max(0.18, (1.3 - state.wave * 0.06) / (modifier.spawnMul * state.runMods.spawnMul * lateRamp * heatPressure));
    const quality = getQualitySettings();
    const enemyCap = Math.max(8, Math.floor(quality.enemyCap * state.perf.adaptiveEnemyCapMul * (state.wave >= 10 ? 1.22 : 1) * (1 + state.heat * 0.003)));
    state.danger += dt;
    if (state.danger >= pacing && state.enemies.length < enemyCap) {
      state.danger = 0;
      addEnemy("chaser");
      if (state.wave >= 3 && rng.next() < 0.52) addEnemy("shooter");
      if (state.wave >= 4 && rng.next() < 0.4) addEnemy("splitter");
      if (state.wave >= 4 && rng.next() < 0.32) addEnemy("sniper");
      if (state.wave >= 3 && rng.next() < 0.35) addEnemy("leech");
      if (state.wave >= 6 && rng.next() < 0.3) addEnemy("shield_carrier");
      if (state.wave >= 6 && rng.next() < 0.33) addEnemy("kamikaze");
      if (state.wave >= 8 && rng.next() < 0.25) addEnemy("summoner");
      if (state.wave >= 5 && rng.next() < 0.28) addEnemy("tank");
      if (state.heat >= 70 && state.wave >= 7 && rng.next() < 0.18) addEnemy("kamikaze");
    }
    if (state.waveClock >= state.waveLength) {
      state.wave += 1;
      state.waveClock = 0;
      state.waveLength = Math.min(46, 26 + state.wave * 2);
      if (!state.challengeRules.noBombRefill) player.bombs += 1;
      state.flash = 0.35;
      startWavePackage();
      tryOpenRelicChoice();
    }
  }

  function getAimDirection() {
    let tx = state.pointer.x;
    let ty = state.pointer.y;
    if (!state.pointer.inside && state.enemies.length > 0) {
      let best = state.enemies[0];
      let bestDist = Infinity;
      for (const e of state.enemies) {
        const d = Math.hypot(e.x - player.x, e.y - player.y);
        if (d < bestDist) {
          bestDist = d;
          best = e;
        }
      }
      tx = best.x;
      ty = best.y;
    }
    let dx = tx - player.x;
    let dy = ty - player.y;
    if (state.pointer.inside && state.enemies.length > 0 && state.settings.aimAssist > 0) {
      const near = getNearestEnemyDirection(player.x, player.y, player.aimAngle);
      const assist = state.settings.aimAssist;
      dx = dx * (1 - assist) + near.dx * Math.hypot(dx, dy) * assist;
      dy = dy * (1 - assist) + near.dy * Math.hypot(dx, dy) * assist;
    }
    const dist = Math.hypot(dx, dy) || 1;
    player.aimAngle = Math.atan2(dy, dx);
    return { dx: dx / dist, dy: dy / dist };
  }

  function getNearestEnemyDirection(x, y, fallbackAngle = 0) {
    if (state.enemies.length === 0) {
      return { dx: Math.cos(fallbackAngle), dy: Math.sin(fallbackAngle), angle: fallbackAngle };
    }
    let best = state.enemies[0];
    let bestDist = Infinity;
    for (const e of state.enemies) {
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bestDist) {
        bestDist = d;
        best = e;
      }
    }
    const dx = best.x - x;
    const dy = best.y - y;
    const dist = Math.hypot(dx, dy) || 1;
    const angle = Math.atan2(dy, dx);
    return { dx: dx / dist, dy: dy / dist, angle };
  }

  function shoot() {
    if (player.fireCd > 0 || state.mode !== "playing") return;
    const w = weaponDefs[state.selectedWeapon];
    if (!w) return;
    const masteryTier = getWeaponMasteryTier(state.selectedWeapon);
    const evolved = isWeaponEvolved(state.selectedWeapon);
    const dir = getAimDirection();
    const scatterBonus = state.selectedWeapon === "scatter" && masteryTier >= 2 ? 1 : 0;
    const evoScatterBonus = state.selectedWeapon === "scatter" && evolved ? 1 : 0;
    const shots = w.shots + player.multishot + scatterBonus + evoScatterBonus;
    const fireRate = w.cooldown / (player.fireRateMult * (state.overclock > 0 ? 1.45 : 1));
    player.fireCd = fireRate;
    state.evoPulseCounter += 1;
    playSfx(state.selectedWeapon === "rail" ? 280 : state.selectedWeapon === "scatter" ? 240 : 330, 0.03, "triangle", 0.08);
    for (let i = 0; i < shots; i++) {
      const t = shots === 1 ? 0 : i / (shots - 1) - 0.5;
      const ang = Math.atan2(dir.dy, dir.dx) + t * w.spread * 2;
      const vx = Math.cos(ang) * w.speed * player.projectileSpeedMult * state.runMods.projectileSpeedMul;
      const vy = Math.sin(ang) * w.speed * player.projectileSpeedMult * state.runMods.projectileSpeedMul;
      const evoDamageMul = state.selectedWeapon === "scatter" && evolved ? 1.1 : 1;
      state.projectiles.push({
        owner: "player",
        x: player.x + Math.cos(ang) * (player.r + 4),
        y: player.y + Math.sin(ang) * (player.r + 4),
        vx,
        vy,
        r: (w.name === "Scatter" ? 4 : 5) * player.projectileSizeMult,
        life: 1.15 * player.rangeMult,
        damage: player.damage * w.damageMult * state.runMods.playerDamageMul * getMasteryDamageMul(state.selectedWeapon) * evoDamageMul,
        color: w.color,
        weapon: state.selectedWeapon,
        evolved,
        pierce: (w.pierce || 1) + player.bonusPierce,
      });
    }
    if (state.selectedWeapon === "pulse" && evolved && state.evoPulseCounter % 5 === 0) {
      for (const da of [-0.24, 0.24]) {
        const ang = Math.atan2(dir.dy, dir.dx) + da;
        state.projectiles.push({
          owner: "player",
          x: player.x + Math.cos(ang) * (player.r + 4),
          y: player.y + Math.sin(ang) * (player.r + 4),
          vx: Math.cos(ang) * (w.speed * 0.95) * player.projectileSpeedMult * state.runMods.projectileSpeedMul,
          vy: Math.sin(ang) * (w.speed * 0.95) * player.projectileSpeedMult * state.runMods.projectileSpeedMul,
          r: 4 * player.projectileSizeMult,
          life: 1.1 * player.rangeMult,
          damage: player.damage * 0.7 * state.runMods.playerDamageMul * getMasteryDamageMul("pulse"),
          color: "#8be0ff",
          weapon: "pulse",
          evolved: true,
          pierce: 1 + player.bonusPierce,
        });
      }
    }
  }

  function spawnParticles(x, y, color, n, force = 130) {
    const quality = getQualitySettings();
    const vfxMul = (state.settings.lowVfx ? 0.25 : quality.particleMul) * state.perf.adaptiveVfxMul;
    const count = Math.max(1, Math.round(n * vfxMul));
    for (let i = 0; i < count; i++) {
      const a = rng.range(0, TAU);
      const s = rng.range(force * 0.35, force);
      state.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        r: rng.range(1.3, 3.2),
        life: rng.range(0.2, 0.62),
        color,
      });
    }
  }

  function damagePlayer(dmg) {
    if (!player.alive) return;
    let remaining = dmg * (1 - player.damageReduction);
    if (player.shield > 0) {
      const absorbed = Math.min(player.shield, remaining);
      player.shield -= absorbed;
      remaining -= absorbed;
    }
    if (remaining > 0) player.hp -= remaining;
    playSfx(170, 0.06, "sawtooth", 0.18);
    state.heat = Math.max(0, state.heat - 7);
    state.cameraShake = Math.min(12, state.cameraShake + 4);
    state.flash = Math.min(0.26, state.flash + 0.14);
    if (player.hp <= 0) {
      player.alive = false;
      player.hp = 0;
      state.mode = "gameover";
      clearRunSave();
      grantMetaRewards();
      pushEvent(`Final score ${Math.floor(state.score)} on wave ${state.wave}.`);
    }
  }

  function applyDropEffect(type) {
    if (type === "heal") player.hp = Math.min(player.maxHp, player.hp + 26);
    if (type === "overclock") state.overclock = 9 + player.overclockBonusTime;
    if (type === "freeze") state.freeze = 3.6 + player.freezeBonusTime;
  }

  function maybeDrop(x, y) {
    const roll = rng.next();
    const baseDropChance = state.mission && !state.mission.complete && state.mission.id === "collector" ? 0.28 : 0.16;
    const dropChance = Math.min(0.62, baseDropChance * player.dropRateMult * state.runMods.dropRateMul);
    if (roll > dropChance) return;
    const type = roll < 0.06 ? "heal" : roll < 0.11 ? "overclock" : "freeze";
    state.drops.push({ x, y, r: 10, type, life: 13 });
  }

  function rewardKill(enemy) {
    const modifier = state.waveModifier || waveModifiers[0];
    state.kills += 1;
    const heatGain = enemy.boss ? 22 : enemy.mini ? 14 : enemy.elite ? 7 : 3.6;
    state.heat = Math.min(100, state.heat + heatGain);
    state.streak += 1;
    state.streakTimer = 2.3;
    const comboBoost = 1 + Math.min(2.4, state.combo * 0.07);
    const streakBonus = 1 + Math.min(0.8, state.streak * 0.015);
    const scoreGain = enemy.value * comboBoost * streakBonus * (state.overclock > 0 ? 1.3 : 1) * modifier.scoreMul * state.runMods.scoreMul;
    state.score += scoreGain;
    player.scrap += Math.ceil(enemy.value * 0.35 * player.salvageMult);
    player.xp += enemy.value * 0.55;
    const weaponUsed = state.selectedWeapon;
    if (state.meta?.masteryKills?.[weaponUsed] !== undefined) {
      const beforeTier = getWeaponMasteryTier(weaponUsed);
      const masteryGain = enemy.boss ? 3 : enemy.mini ? 2 : 1;
      state.meta.masteryKills[weaponUsed] += masteryGain;
      const afterTier = getWeaponMasteryTier(weaponUsed);
      if (afterTier > beforeTier) {
        pushEvent(`${weaponUsed.toUpperCase()} mastery tier ${afterTier} unlocked.`);
        saveMeta();
      }
    }
    state.combo += 1;
    state.comboTimer = player.comboDuration;
    spawnParticles(enemy.x, enemy.y, enemy.color, 14, 190);
    maybeDrop(enemy.x, enemy.y);
    if (state.mission && !state.mission.complete && state.mission.id === "eliminate") {
      state.mission.progress = Math.min(state.mission.target, state.mission.progress + 1);
      if (state.mission.progress >= state.mission.target) applyMissionReward();
    }
    if (state.bounty && !state.bounty.complete) {
      const matchesBounty = state.bounty.id === "elite" ? Boolean(enemy.elite) : state.bounty.id === enemy.kind;
      if (matchesBounty) {
        state.bounty.progress = Math.min(state.bounty.target, state.bounty.progress + 1);
        if (state.bounty.progress >= state.bounty.target) applyBountyReward();
      }
    }
    if (enemy.boss) {
      player.bombs += 1;
      player.shield += 25;
      state.flash = Math.max(state.flash, 0.36);
      pushEvent(`${enemy.bossType || "Boss"} destroyed: +1 bomb, +25 shield.`);
      playSfx(120, 0.14, "square", 0.26);
    }
    if (enemy.mini) {
      player.bombs += 1;
      player.shield += 12;
      pushEvent("Mini-boss down: +1 bomb, +12 shield.");
      playSfx(210, 0.1, "triangle", 0.2);
    }
    if (player.streakGuard > 0 && state.streak > 0 && state.streak % 15 === 0) {
      player.shield += 4 * player.streakGuard;
    }
    if (state.streak > 0 && state.streak % 25 === 0) pushEvent(`Streak ${state.streak}! Score bonus increased.`);
  }

  function enemyDie(enemyIndex) {
    const enemy = state.enemies[enemyIndex];
    if (!enemy) return;
    rewardKill(enemy);
    if (enemy.split) {
      for (let i = 0; i < 2; i++) {
        state.enemies.push({
          kind: "fragment",
          x: enemy.x + rng.range(-12, 12),
          y: enemy.y + rng.range(-12, 12),
          vx: 0,
          vy: 0,
          hp: 16 + state.wave,
          maxHp: 16 + state.wave,
          speed: 118 + state.wave * 2.2,
          r: 10,
          color: "#88ffe6",
          value: 8,
          shootCd: 999,
          split: false,
          hitFlash: 0,
        });
      }
    }
    state.enemies.splice(enemyIndex, 1);
    if (enemy.boss) {
      for (let i = state.enemies.length - 1; i >= 0; i--) {
        if (!state.enemies[i].boss) state.enemies.splice(i, 1);
      }
    }
  }

  function tryLevelUp() {
    if (player.xp < player.nextXp || state.mode !== "playing") return;
    player.xp -= player.nextXp;
    player.level += 1;
    player.nextXp = Math.floor(player.nextXp * 1.29 + 16);
    state.mode = "levelup";
    rerollChoices(true);
    pushEvent(`Level ${player.level} reached.`);
  }

  function buildUpgradePool() {
    return upgrades.filter((u) => {
      if (state.bannedUpgrades[u.id]) return false;
      if (u.id === "weapon_scatter") return !state.unlockedWeapons.scatter;
      if (u.id === "weapon_rail") return !state.unlockedWeapons.rail;
      if (u.id === "wing_tree_offense") return player.wingTreeOffense < 3;
      if (u.id === "wing_tree_defense") return player.wingTreeDefense < 3;
      if (u.id === "wing_tree_utility") return player.wingTreeUtility < 3;
      return true;
    });
  }

  function rerollChoices(free = false) {
    if (state.mode !== "levelup") return;
    if (!free) {
      if (player.rerolls <= 0) return;
      player.rerolls -= 1;
    }
    const pool = buildUpgradePool();
    state.choices = [];
    const forced = [];
    if (!state.unlockedWeapons.scatter && player.level >= 3 && !state.bannedUpgrades.weapon_scatter) forced.push("weapon_scatter");
    if (!state.unlockedWeapons.rail && player.level >= 6 && !state.bannedUpgrades.weapon_rail) forced.push("weapon_rail");
    if (player.droneCount === 0 && player.level >= 4 && !state.bannedUpgrades.drone) forced.push("drone");
    for (const id of forced) {
      if (state.choices.length >= 3) break;
      const idx = pool.findIndex((u) => u.id === id);
      if (idx >= 0) {
        state.choices.push(pool[idx]);
        pool.splice(idx, 1);
      }
    }
    while (state.choices.length < 3 && pool.length) {
      const idx = Math.floor(rng.range(0, pool.length));
      state.choices.push(pool[idx]);
      pool.splice(idx, 1);
    }
  }

  function banishChoice(i) {
    if (state.mode !== "levelup" || player.banishes <= 0) return;
    const choice = state.choices[i];
    if (!choice) return;
    player.banishes -= 1;
    state.bannedUpgrades[choice.id] = true;
    pushEvent(`Banished upgrade: ${choice.label}`);
    rerollChoices(true);
  }

  function pickUpgrade(i) {
    const choice = state.choices[i];
    if (!choice) return;
    choice.apply();
    state.upgradeCounts[choice.id] = (state.upgradeCounts[choice.id] || 0) + 1;
    checkSynergies();
    playSfx(450, 0.05, "square", 0.2);
    state.mode = "playing";
    state.choices = [];
  }

  function spawnDamageNumber(x, y, amount, color) {
    if (state.settings.lowVfx) return;
    state.damageNumbers.push({
      x,
      y,
      value: Math.round(amount),
      life: 0.6,
      color,
    });
    if (state.damageNumbers.length > 60) state.damageNumbers.shift();
  }

  function activateBomb() {
    if (player.bombs <= 0 || player.bombCd > 0 || state.mode !== "playing") return;
    player.bombs -= 1;
    player.bombCd = 10 * player.bombCdMult;
    state.flash = 0.42;
    state.cameraShake = 14;
    const radius = 320 * player.bombRadiusMult;
    const bombDamage = 180 * player.bombDamageMult;
    for (let i = state.enemies.length - 1; i >= 0; i--) {
      const e = state.enemies[i];
      const d = Math.hypot(e.x - player.x, e.y - player.y);
      if (d < radius) {
        e.hp -= bombDamage;
        if (e.hp <= 0) enemyDie(i);
      }
    }
    spawnParticles(player.x, player.y, "#f7f6c7", 40, 300);
    playSfx(150, 0.12, "sawtooth", 0.28);
    pushEvent("Nova bomb detonated.");
  }

  function forceNextWave(triggeredByPlayer) {
    if (state.mode !== "playing" || state.waveSkipCd > 0 || state.waveClock < 1.5) return;
    if (triggeredByPlayer) {
      if (player.bombs <= 0) return;
      player.bombs -= 1;
      player.shield += 12;
      pushEvent("Warp challenge activated.");
    }
    state.waveClock = state.waveLength;
    state.waveSkipCd = 4;
    state.flash = Math.max(state.flash, 0.24);
  }

  function wingmanBomb() {
    if (!state.coopJoined || state.mode !== "playing" || wingman.bombs <= 0 || wingman.bombCd > 0) return;
    wingman.bombs -= 1;
    wingman.bombCd = Math.max(6.8, 11 - player.wingTreeUtility * 1.1);
    state.flash = Math.max(state.flash, 0.24);
    for (let i = state.enemies.length - 1; i >= 0; i--) {
      const e = state.enemies[i];
      const d = Math.hypot(e.x - wingman.x, e.y - wingman.y);
      if (d < 250) {
        e.hp -= 125;
        if (e.hp <= 0) enemyDie(i);
      }
    }
    spawnParticles(wingman.x, wingman.y, "#b7fffb", 22, 230);
  }

  function wingmanBurst() {
    if (!state.coopJoined || state.mode !== "playing" || wingman.burstCd > 0) return;
    wingman.burstCd = Math.max(4.2, 8.2 - player.wingTreeUtility * 1.1);
    const count = 10;
    for (let i = 0; i < count; i++) {
      const a = (TAU / count) * i + state.time * 0.25;
      state.projectiles.push({
        owner: "wingman",
        x: wingman.x + Math.cos(a) * (wingman.r + 2),
        y: wingman.y + Math.sin(a) * (wingman.r + 2),
        vx: Math.cos(a) * 520 * player.projectileSpeedMult,
        vy: Math.sin(a) * 520 * player.projectileSpeedMult,
        r: 3.8 * player.projectileSizeMult,
        life: 0.95 * player.rangeMult,
        damage: player.damage * (0.44 + player.wingTreeOffense * 0.08) * player.wingmanDamageMult,
        color: "#8dffe8",
        pierce: 1 + Math.floor(player.wingTreeOffense * 0.34),
      });
    }
    state.flash = Math.max(state.flash, 0.12);
    playSfx(260, 0.07, "square", 0.18);
  }

  function wingmanSupportPulse() {
    if (!state.coopJoined || state.mode !== "playing" || wingman.supportCd > 0) return;
    wingman.supportCd = Math.max(6.5, 12 - player.wingTreeUtility * 1.2);
    const shieldGain = 8 + player.wingTreeDefense * 5;
    player.shield += shieldGain;
    wingman.bombs += player.wingTreeUtility >= 2 ? 1 : 0;
    wingman.dashCd = Math.max(0, wingman.dashCd - (0.5 + player.wingTreeUtility * 0.12));
    spawnParticles(wingman.x, wingman.y, "#b8ffea", 20, 170);
    pushEvent(`Wingman pulse: +${shieldGain} shield.`);
    playSfx(330, 0.06, "triangle", 0.16);
  }

  function shootWingman() {
    if (!state.coopJoined || state.mode !== "playing" || wingman.fireCd > 0) return;
    const dir = getNearestEnemyDirection(wingman.x, wingman.y, wingman.aimAngle);
    wingman.aimAngle = dir.angle;
    const modeRateMul = state.wingmanMode === "aggressive" ? 1.12 : state.wingmanMode === "support" ? 0.92 : 1;
    const rate = 0.18 / (player.fireRateMult * modeRateMul * (0.95 + player.wingTreeOffense * 0.06));
    wingman.fireCd = rate;
    const modeDamageMul = state.wingmanMode === "aggressive" ? 1.12 : state.wingmanMode === "support" ? 0.9 : 1;
    state.projectiles.push({
      owner: "wingman",
      x: wingman.x + Math.cos(wingman.aimAngle) * (wingman.r + 4),
      y: wingman.y + Math.sin(wingman.aimAngle) * (wingman.r + 4),
      vx: Math.cos(wingman.aimAngle) * 630 * player.projectileSpeedMult,
      vy: Math.sin(wingman.aimAngle) * 630 * player.projectileSpeedMult,
      r: 4 * player.projectileSizeMult,
      life: 1.05 * player.rangeMult,
      damage: player.damage * (0.85 + player.wingTreeOffense * 0.12) * player.wingmanDamageMult * modeDamageMul,
      color: "#7dffca",
      pierce: 1 + Math.floor(player.bonusPierce * 0.5),
    });
  }

  function updateStars(dt) {
    for (const s of state.stars) {
      s.y += s.v * dt;
      if (s.y > HEIGHT + 3) {
        s.y = -2;
        s.x = rng.range(0, WIDTH);
      }
    }
  }

  function updatePlayer(dt) {
    if (state.mode !== "playing") return;
    const left = state.keysDown.has("a") || state.keysDown.has("arrowleft");
    const right = state.keysDown.has("d") || state.keysDown.has("arrowright");
    const up = state.keysDown.has("w") || state.keysDown.has("arrowup");
    const down = state.keysDown.has("s") || state.keysDown.has("arrowdown");
    const kx = (right ? 1 : 0) - (left ? 1 : 0);
    const ky = (down ? 1 : 0) - (up ? 1 : 0);
    const dx = Math.max(-1, Math.min(1, kx + state.touch.moveX));
    const dy = Math.max(-1, Math.min(1, ky + state.touch.moveY));
    const speed = player.speed * (state.overclock > 0 ? 1.12 : 1);
    const len = Math.hypot(dx, dy) || 1;
    const ax = (dx / len) * speed;
    const ay = (dy / len) * speed;
    getAimDirection();
    player.vx += (ax - player.vx) * Math.min(1, dt * 14);
    player.vy += (ay - player.vy) * Math.min(1, dt * 14);
    if (actionPressed("dash") && player.dashCd <= 0) {
      const dir = getAimDirection();
      player.vx += dir.dx * player.dashPower;
      player.vy += dir.dy * player.dashPower;
      player.dashCd = 3.2 * player.dashCdMult;
      player.dashTimer = 0.18;
      state.cameraShake += 5;
      spawnParticles(player.x, player.y, "#9af2ff", 12, 180);
      if (player.dashShockwave > 0) {
        for (let i = state.enemies.length - 1; i >= 0; i--) {
          const e = state.enemies[i];
          const d = Math.hypot(e.x - player.x, e.y - player.y);
          if (d < 110) {
            e.hp -= player.dashShockwave;
            e.hitFlash = 0.12;
            if (e.hp <= 0) enemyDie(i);
          }
        }
      }
    }
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    player.x = Math.max(player.r, Math.min(WIDTH - player.r, player.x));
    player.y = Math.max(player.r, Math.min(HEIGHT - player.r, player.y));
    player.fireCd = Math.max(0, player.fireCd - dt);
    player.dashCd = Math.max(0, player.dashCd - dt);
    player.dashTimer = Math.max(0, player.dashTimer - dt);
    player.bombCd = Math.max(0, player.bombCd - dt);
    player.contactDamageCd = Math.max(0, player.contactDamageCd - dt);
    if (player.regen > 0) player.hp = Math.min(player.maxHp, player.hp + player.regen * dt);
    shoot();
    if (actionPressed("bomb")) activateBomb();
    if (actionPressed("warp")) forceNextWave(true);
  }

  function updateWingman(dt) {
    if (!state.coopJoined || state.mode !== "playing") return;
    const wingDown =
      state.net.mode === "host" ? state.net.guestInput.down : new Set(["j", "l", "i", "k"].filter((k) => state.keysDown.has(k)));
    const wingPressed =
      state.net.mode === "host" ? state.net.guestInput.pressed : new Set(["o", "u", "y", "h"].filter((k) => state.keyPressed.has(k)));
    const left = wingDown.has("j");
    const right = wingDown.has("l");
    const up = wingDown.has("i");
    const down = wingDown.has("k");
    const dx = (right ? 1 : 0) - (left ? 1 : 0);
    const dy = (down ? 1 : 0) - (up ? 1 : 0);
    const manual = left || right || up || down;
    let tx = 0;
    let ty = 0;
    if (manual) {
      const len = Math.hypot(dx, dy) || 1;
      tx = (dx / len) * wingman.speed;
      ty = (dy / len) * wingman.speed;
    } else if (state.wingmanMode === "aggressive" && state.enemies.length) {
      const target = state.enemies[Math.floor(rng.range(0, state.enemies.length))];
      const adx = target.x - wingman.x;
      const ady = target.y - wingman.y;
      const alen = Math.hypot(adx, ady) || 1;
      tx = (adx / alen) * wingman.speed * (0.78 + player.wingTreeUtility * 0.05);
      ty = (ady / alen) * wingman.speed * (0.78 + player.wingTreeUtility * 0.05);
    } else {
      const offX = state.wingmanMode === "support" ? 110 : 70;
      const offY = state.wingmanMode === "support" ? 48 : 20;
      const fdx = player.x + offX - wingman.x;
      const fdy = player.y + offY - wingman.y;
      const flen = Math.hypot(fdx, fdy) || 1;
      tx = (fdx / flen) * wingman.speed * (0.7 + player.wingTreeUtility * 0.06);
      ty = (fdy / flen) * wingman.speed * (0.7 + player.wingTreeUtility * 0.06);
      if (state.wingmanMode === "support" && player.wingTreeDefense > 0) {
        player.shield = Math.min(160, player.shield + dt * 0.55 * player.wingTreeDefense);
      }
    }
    wingman.vx += (tx - wingman.vx) * Math.min(1, dt * 14);
    wingman.vy += (ty - wingman.vy) * Math.min(1, dt * 14);
    if (wingPressed.has("o") && wingman.dashCd <= 0) {
      const dir = getNearestEnemyDirection(wingman.x, wingman.y, wingman.aimAngle);
      wingman.vx += dir.dx * wingman.dashPower;
      wingman.vy += dir.dy * wingman.dashPower;
      wingman.dashCd = 3.6;
      wingman.dashTimer = 0.16;
      spawnParticles(wingman.x, wingman.y, "#9bffea", 10, 150);
    }
    wingman.x += wingman.vx * dt;
    wingman.y += wingman.vy * dt;
    wingman.x = Math.max(wingman.r, Math.min(WIDTH - wingman.r, wingman.x));
    wingman.y = Math.max(wingman.r, Math.min(HEIGHT - wingman.r, wingman.y));
    wingman.fireCd = Math.max(0, wingman.fireCd - dt);
    wingman.dashCd = Math.max(0, wingman.dashCd - dt);
    wingman.dashTimer = Math.max(0, wingman.dashTimer - dt);
    wingman.bombCd = Math.max(0, wingman.bombCd - dt);
    wingman.burstCd = Math.max(0, (wingman.burstCd || 0) - dt);
    wingman.supportCd = Math.max(0, (wingman.supportCd || 0) - dt);
    shootWingman();
    if (wingPressed.has("u")) wingmanBomb();
    if (wingPressed.has("y")) wingmanBurst();
    if (wingPressed.has("h")) wingmanSupportPulse();
  }

  function updateProjectiles(dt) {
    for (let i = state.projectiles.length - 1; i >= 0; i--) {
      const p = state.projectiles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0 || p.x < -40 || p.x > WIDTH + 40 || p.y < -40 || p.y > HEIGHT + 40) {
        state.projectiles.splice(i, 1);
        continue;
      }
      for (let j = state.enemies.length - 1; j >= 0; j--) {
        const e = state.enemies[j];
        const d = Math.hypot(p.x - e.x, p.y - e.y);
        if (d < p.r + e.r) {
          const railTier = p.weapon === "rail" ? getWeaponMasteryTier("rail") : 0;
          const critChance = Math.min(0.8, player.critChance + (railTier >= 1 ? 0.03 : 0));
          const critMult = player.critMult + (railTier >= 2 ? 0.25 : 0);
          const crit = rng.next() < critChance;
          const bossMul = e.boss ? player.bossDamageMult : 1;
          let weakMul = 1;
          if (e.boss) {
            const hitAngle = Math.atan2(p.y - e.y, p.x - e.x);
            const wa = e.weakAngle || 0;
            const diff = Math.abs(Math.atan2(Math.sin(hitAngle - wa), Math.cos(hitAngle - wa)));
            const window = 0.62 - (e.phase || 1) * 0.11;
            weakMul = diff <= window ? 1.65 : 0.58;
          }
          const dmg = p.damage * (crit ? critMult : 1) * bossMul * weakMul;
          let dealt = dmg;
          if ((e.shield || 0) > 0) {
            const absorb = Math.min(e.shield, dealt);
            e.shield -= absorb;
            dealt -= absorb;
          }
          if (dealt > 0) e.hp -= dealt;
          spawnDamageNumber(e.x, e.y - 10, dmg, crit ? "#ffe38a" : "#e5f0ff");
          if (p.owner !== "wingman" && player.lifesteal > 0) {
            player.hp = Math.min(player.maxHp, player.hp + dmg * player.lifesteal);
          }
          e.hitFlash = 0.08;
          p.pierce -= 1;
          if (p.pierce <= 0) state.projectiles.splice(i, 1);
          spawnParticles(p.x, p.y, crit ? "#ffe38a" : p.color, crit ? 7 : 4, 110);
          if (p.weapon === "rail" && p.evolved) {
            for (const ex of state.enemies) {
              if (ex === e) continue;
              const splashDist = Math.hypot(ex.x - p.x, ex.y - p.y);
              if (splashDist < 72) {
                ex.hp -= dmg * 0.3;
                ex.hitFlash = 0.08;
              }
            }
          }
          if (e.hp <= 0) enemyDie(j);
          break;
        }
      }
    }
    for (let i = state.enemyProjectiles.length - 1; i >= 0; i--) {
      const p = state.enemyProjectiles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0 || p.x < -30 || p.x > WIDTH + 30 || p.y < -30 || p.y > HEIGHT + 30) {
        state.enemyProjectiles.splice(i, 1);
        continue;
      }
      const d = Math.hypot(p.x - player.x, p.y - player.y);
      if (d < p.r + player.r) {
        damagePlayer(p.damage);
        spawnParticles(p.x, p.y, "#ff9686", 7, 150);
        state.enemyProjectiles.splice(i, 1);
        continue;
      }
      if (state.coopJoined) {
        const dw = Math.hypot(p.x - wingman.x, p.y - wingman.y);
        if (dw < p.r + wingman.r) {
          wingman.vx += p.vx * 0.015;
          wingman.vy += p.vy * 0.015;
          spawnParticles(p.x, p.y, "#8fffe3", 6, 120);
          state.enemyProjectiles.splice(i, 1);
        }
      }
    }
  }

  function updateEnemies(dt) {
    const freezeMul = state.freeze > 0 ? 0.22 : 1;
    for (const e of state.enemies) {
      let targetX = player.x;
      let targetY = player.y;
      if (state.coopJoined) {
        const dMain = Math.hypot(player.x - e.x, player.y - e.y);
        const dWing = Math.hypot(wingman.x - e.x, wingman.y - e.y);
        if (dWing < dMain) {
          targetX = wingman.x;
          targetY = wingman.y;
        }
      }
      const dx = targetX - e.x;
      const dy = targetY - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const ux = dx / d;
      const uy = dy / d;
      e.vx += (ux * e.speed * freezeMul - e.vx) * Math.min(1, dt * 5);
      e.vy += (uy * e.speed * freezeMul - e.vy) * Math.min(1, dt * 5);
      if (e.sniper && d < 280) {
        e.vx += (-ux * 180 - e.vx) * Math.min(1, dt * 4);
        e.vy += (-uy * 180 - e.vy) * Math.min(1, dt * 4);
      }
      if (e.boss && d < 210) {
        // Boss keeps standoff distance to set up projectile patterns.
        e.vx += (-ux * 120 - e.vx) * Math.min(1, dt * 3);
        e.vy += (-uy * 120 - e.vy) * Math.min(1, dt * 3);
      }
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      e.telegraphShot = Math.max(0, (e.telegraphShot || 0) - dt);
      e.telegraphBurst = Math.max(0, (e.telegraphBurst || 0) - dt);
      if (e.boss) {
        const hpRatio = e.maxHp > 0 ? e.hp / e.maxHp : 0;
        const phase = hpRatio <= 0.33 ? 3 : hpRatio <= 0.67 ? 2 : 1;
        if (phase !== e.phase) {
          e.phase = phase;
          pushEvent(`${e.bossType || "Boss"} phase ${phase} engaged.`);
        }
        e.weakAngle = (e.weakAngle || 0) + dt * (0.8 + phase * 0.26);
      }
      if (e.carrier) {
        for (const n of state.enemies) {
          if (n === e || n.boss) continue;
          const dn = Math.hypot(n.x - e.x, n.y - e.y);
          if (dn < 120) n.shield = Math.max(n.shield || 0, 16);
        }
      }
      if (e.summoner) {
        e.summonCd -= dt * freezeMul;
        if (e.summonCd <= 0) {
          e.summonCd = 4.6;
          addEnemy(rng.next() < 0.5 ? "chaser" : "kamikaze");
        }
      }
      if (e.kind === "shooter" && d > 120) {
        e.shootCd -= dt * freezeMul;
        if (e.shootCd <= 0) {
          e.shootCd = 1.85;
          state.enemyProjectiles.push({
            x: e.x,
            y: e.y,
            vx: ux * 240 * state.runMods.projectileSpeedMul,
            vy: uy * 240 * state.runMods.projectileSpeedMul,
            r: 6,
            life: 4,
            damage: (8 + state.wave * 0.75) * (e.elite ? 1.28 : 1),
          });
        }
      }
      if (e.sniper && d > 180) {
        e.shootCd -= dt * freezeMul;
        if (e.shootCd <= 0) {
          e.shootCd = 2.3;
          state.enemyProjectiles.push({
            x: e.x,
            y: e.y,
            vx: ux * 360 * state.runMods.projectileSpeedMul,
            vy: uy * 360 * state.runMods.projectileSpeedMul,
            r: 7,
            life: 4.8,
            damage: (12 + state.wave * 0.95) * (e.elite ? 1.28 : 1),
          });
        }
      }
      if (e.mini) {
        e.shootCd -= dt * freezeMul;
        if (e.shootCd <= 0) {
          e.shootCd = 0.95;
          const count = 6;
          const base = Math.atan2(uy, ux);
          for (let i = 0; i < count; i++) {
            const a = base - 0.4 + (i / (count - 1)) * 0.8;
            state.enemyProjectiles.push({
              x: e.x,
              y: e.y,
              vx: Math.cos(a) * 290 * state.runMods.projectileSpeedMul,
              vy: Math.sin(a) * 290 * state.runMods.projectileSpeedMul,
              r: 7,
              life: 4.4,
              damage: 12 + state.wave * 0.9,
            });
          }
          playSfx(220, 0.05, "sawtooth", 0.13);
        }
      }
      if (e.boss) {
        const phaseMul = 1 + Math.max(0, (e.phase || 1) - 1) * 0.22;
        e.shootCd -= dt * freezeMul * phaseMul;
        e.burstCd -= dt * freezeMul * phaseMul;
        if (e.shootCd > 0 && e.shootCd < 0.36) e.telegraphShot = Math.max(e.telegraphShot, 0.22);
        if (e.burstCd > 0 && e.burstCd < 0.55) e.telegraphBurst = Math.max(e.telegraphBurst, 0.3);
        const pMul = state.runMods.projectileSpeedMul;
        if (e.bossType === "lancer") {
          if (e.shootCd <= 0) {
            e.shootCd = 0.72;
            for (let i = -1; i <= 1; i++) {
              const a = Math.atan2(uy, ux) + i * 0.16;
              state.enemyProjectiles.push({
                x: e.x,
                y: e.y,
                vx: Math.cos(a) * 360 * pMul,
                vy: Math.sin(a) * 360 * pMul,
                r: 6,
                life: 3.6,
                damage: 9 + state.wave * 0.9,
              });
            }
          }
          if (e.burstCd <= 0) {
            e.burstCd = 2.1;
            e.vx += ux * 280;
            e.vy += uy * 280;
            spawnParticles(e.x, e.y, "#ffd6a8", 18, 180);
          }
        } else if (e.bossType === "hive") {
          if (e.shootCd <= 0) {
            e.shootCd = 1.18;
            const count = 8;
            for (let i = 0; i < count; i++) {
              const a = (TAU / count) * i + state.time * 0.35;
              state.enemyProjectiles.push({
                x: e.x,
                y: e.y,
                vx: Math.cos(a) * 210 * pMul,
                vy: Math.sin(a) * 210 * pMul,
                r: 7,
                life: 4.5,
                damage: 7 + state.wave * 0.82,
              });
            }
          }
          e.summonCd -= dt * freezeMul;
          if (e.summonCd <= 0) {
            e.summonCd = 3.8;
            addEnemy(rng.next() < 0.5 ? "chaser" : "splitter");
          }
        } else if (e.bossType === "bulwark") {
          if (e.shootCd <= 0) {
            e.shootCd = 1.45;
            state.enemyProjectiles.push({
              x: e.x,
              y: e.y,
              vx: ux * 250 * pMul,
              vy: uy * 250 * pMul,
              r: 10,
              life: 4.8,
              damage: 13 + state.wave * 1.1,
            });
          }
          if (e.burstCd <= 0) {
            e.burstCd = 2.35;
            const count = 14;
            for (let i = 0; i < count; i++) {
              const a = (TAU / count) * i + state.time;
              state.enemyProjectiles.push({
                x: e.x,
                y: e.y,
                vx: Math.cos(a) * 190 * pMul,
                vy: Math.sin(a) * 190 * pMul,
                r: 7,
                life: 4.2,
                damage: 7 + state.wave * 0.74,
              });
            }
          }
        } else {
          if (e.shootCd <= 0) {
            e.shootCd = 1.05;
            state.enemyProjectiles.push({
              x: e.x,
              y: e.y,
              vx: ux * 280 * pMul,
              vy: uy * 280 * pMul,
              r: 8,
              life: 5,
              damage: 11 + state.wave * 0.98,
            });
          }
          if (e.burstCd <= 0) {
            e.burstCd = 3.25;
            const count = 12;
            for (let i = 0; i < count; i++) {
              const a = (TAU / count) * i + state.time * 0.5;
              state.enemyProjectiles.push({
                x: e.x,
                y: e.y,
                vx: Math.cos(a) * 230 * pMul,
                vy: Math.sin(a) * 230 * pMul,
                r: 7,
                life: 4.2,
                damage: 7 + state.wave * 0.78,
              });
            }
            const spiralCount = 9;
            e.spiralOffset += 0.45;
            for (let i = 0; i < spiralCount; i++) {
              const a = e.spiralOffset + i * 0.35;
              state.enemyProjectiles.push({
                x: e.x,
                y: e.y,
                vx: Math.cos(a) * 205 * pMul,
                vy: Math.sin(a) * 205 * pMul,
                r: 6,
                life: 3.8,
                damage: 6 + state.wave * 0.66,
              });
            }
            state.flash = Math.max(state.flash, 0.14);
          }
        }
      }
      if (d < e.r + player.r) {
        if (player.contactDamageCd <= 0) {
          const contact = ((e.boss ? 16 : e.leech ? 9 : 7) + state.wave * 1.18) * (e.elite ? 1.22 : 1);
          damagePlayer(contact);
          if (e.leech) {
            e.hp = Math.min(e.maxHp, e.hp + 12 + state.wave * 0.8);
          }
          player.contactDamageCd = e.boss ? 0.5 : 0.34;
          if (e.kamikaze) {
            for (let i = state.enemies.length - 1; i >= 0; i--) {
              if (state.enemies[i] === e) {
                state.enemies.splice(i, 1);
                break;
              }
            }
            spawnParticles(player.x, player.y, "#ffbda9", 28, 230);
            damagePlayer(12 + state.wave * 1.1);
          }
        }
      }
      if (state.coopJoined) {
        const dw = Math.hypot(e.x - wingman.x, e.y - wingman.y);
        if (dw < e.r + wingman.r) {
          const away = Math.atan2(wingman.y - e.y, wingman.x - e.x);
          wingman.vx += Math.cos(away) * 120 * dt;
          wingman.vy += Math.sin(away) * 120 * dt;
          spawnParticles(wingman.x, wingman.y, "#8fffe3", 1, 60);
        }
      }
    }
  }

  function updateDrones(dt) {
    if (player.droneCount <= 0 || state.mode !== "playing") return;
    const damage = 22 + state.wave * 0.8;
    for (let i = 0; i < player.droneCount; i++) {
      const a = state.time * (1.8 + i * 0.14) + (TAU / player.droneCount) * i;
      const dx = Math.cos(a) * 48;
      const dy = Math.sin(a) * 48;
      const x = player.x + dx;
      const y = player.y + dy;
      for (let j = state.enemies.length - 1; j >= 0; j--) {
        const e = state.enemies[j];
        const d = Math.hypot(x - e.x, y - e.y);
        if (d < e.r + 7) {
          e.hp -= damage * dt;
          e.hitFlash = 0.06;
          if (e.hp <= 0) enemyDie(j);
        }
      }
    }
  }

  function updateDrops(dt) {
    for (let i = state.drops.length - 1; i >= 0; i--) {
      const d = state.drops[i];
      d.life -= dt;
      const dx = player.x - d.x;
      const dy = player.y - d.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < player.magnet) {
        const pull = 140 + (player.magnet - dist) * 4;
        d.x += (dx / dist) * pull * dt;
        d.y += (dy / dist) * pull * dt;
      }
      if (dist < player.r + d.r + 2) {
        applyDropEffect(d.type);
        spawnParticles(d.x, d.y, d.type === "heal" ? "#93ffb7" : d.type === "overclock" ? "#ffe197" : "#a2b3ff", 10, 120);
        if (state.mission && !state.mission.complete && state.mission.id === "collector") {
          state.mission.progress = Math.min(state.mission.target, state.mission.progress + 1);
          if (state.mission.progress >= state.mission.target) applyMissionReward();
        }
        state.drops.splice(i, 1);
      } else if (d.life <= 0) {
        state.drops.splice(i, 1);
      }
    }
  }

  function updateParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - dt * 3.8;
      p.vy *= 1 - dt * 3.8;
      p.life -= dt;
      if (p.life <= 0) state.particles.splice(i, 1);
    }
  }

  function updateTimers(dt, gameplayActive) {
    if (gameplayActive) state.time += dt;
    state.comboTimer = Math.max(0, state.comboTimer - dt);
    if (state.comboTimer <= 0) state.combo = Math.max(0, state.combo - dt * 3.8 * player.comboDecayMul);
    state.cameraShake = Math.max(0, state.cameraShake - dt * 20);
    state.flash = Math.max(0, state.flash - dt * 2);
    if (gameplayActive) {
      state.overclock = Math.max(0, state.overclock - dt);
      state.freeze = Math.max(0, state.freeze - dt);
      state.heat = Math.max(0, state.heat - dt * 2.8);
      state.waveSkipCd = Math.max(0, state.waveSkipCd - dt);
      if (player.shieldRegen > 0) player.shield = Math.min(160, player.shield + player.shieldRegen * dt);
      state.streakTimer = Math.max(0, state.streakTimer - dt);
      if (state.streakTimer <= 0) state.streak = 0;
      const nextTier = state.heat >= 75 ? 3 : state.heat >= 50 ? 2 : state.heat >= 25 ? 1 : 0;
      if (nextTier !== state.heatTier) {
        if (nextTier > state.heatTier) pushEvent(`Threat level ${nextTier} rising.`);
        state.heatTier = nextTier;
      }
      if (state.mission && !state.mission.complete && state.mission.id === "survive") {
        state.mission.progress = Math.min(state.mission.target, state.mission.progress + dt);
        if (state.mission.progress >= state.mission.target) applyMissionReward();
      }
    }
    for (let i = state.damageNumbers.length - 1; i >= 0; i--) {
      const n = state.damageNumbers[i];
      n.y -= dt * 42;
      n.life -= dt;
      if (n.life <= 0) state.damageNumbers.splice(i, 1);
    }
  }

  function update(dt) {
    updateAudioMix(dt);
    applyTouchDerivedInputs();
    if (state.net.mode === "guest") {
      state.net.sendTimer += dt;
      if (state.net.sendTimer >= 0.05) {
        state.net.sendTimer = 0;
        sendNet({ type: "guest_input", input: serializeInput() });
      }
      state.keyPressed.clear();
      return;
    }
    spawnStarfield();
    updateStars(dt);
    const gameplayActive = state.mode === "playing";
    if (state.mode === "playing") {
      spawnWave(dt);
      updatePlayer(dt);
      updateWingman(dt);
      updateEnemies(dt);
      updateDrones(dt);
      updateProjectiles(dt);
      updateDrops(dt);
      updateParticles(dt);
      tryLevelUp();
    } else {
      updateParticles(dt);
    }
    updateTimers(dt, gameplayActive);
    updateRunEvents(dt);
    updateThreatDirector(dt);
    if (gameplayActive) {
      state.saveTimer += dt;
      if (state.saveTimer >= 8) {
        state.saveTimer = 0;
        saveRun();
      }
    }
    if (state.net.mode === "host") {
      state.net.sendTimer += dt;
      if (state.net.sendTimer >= 0.05) {
        state.net.sendTimer = 0;
        state.net.snapshotSeq += 1;
        sendNet({
          type: "state_snapshot",
          seq: state.net.snapshotSeq,
          snapshot: createSnapshotPayload(),
        });
      }
    }
    state.keyPressed.clear();
  }

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    const b = state.biome || biomes[0];
    if (state.settings.colorblind) {
      g.addColorStop(0, "#12223c");
      g.addColorStop(0.6, "#0d1f2f");
      g.addColorStop(1, "#08131f");
    } else {
      g.addColorStop(0, b.bgTop);
      g.addColorStop(0.6, b.bgMid);
      g.addColorStop(1, b.bgBot);
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    const starStep = state.settings.lowVfx ? 4 : state.settings.quality === "performance" ? 3 : state.settings.quality === "balanced" ? 2 : 1;
    for (let i = 0; i < state.stars.length; i += starStep) {
      const s = state.stars[i];
      const alphaMul = state.settings.lowVfx ? 0.4 : 1;
      ctx.fillStyle = `rgba(176, 214, 255, ${(0.32 + s.r * 0.18) * alphaMul})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fill();
    }
  }

  function drawPlayer() {
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.aimAngle);
    ctx.fillStyle = player.dashTimer > 0 ? "#dbfaff" : "#d9efff";
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(-12, 11);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-12, -11);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#89d2ff";
    ctx.beginPath();
    ctx.arc(-2, 0, 8, 0, TAU);
    ctx.fill();
    if (state.meta?.unlocks?.trail) {
      ctx.fillStyle = "rgba(255, 208, 134, 0.75)";
      ctx.beginPath();
      ctx.arc(-15, 0, 5, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function adaptColor(c) {
    if (!state.settings.colorblind) return c;
    const map = {
      "#ff5c8a": "#ffb000",
      "#ff9757": "#4da6ff",
      "#9a7dff": "#00b894",
      "#64ffc5": "#ffd166",
      "#ff4d7f": "#e17055",
      "#8df08f": "#3dc1d3",
      "#b8a4ff": "#2ecc71",
      "#ff9c5d": "#54a0ff",
      "#ffda7d": "#f39c12",
      "#8ef2ff": "#1abc9c",
    };
    return map[c] || c;
  }

  function drawWingman() {
    if (!state.coopJoined) return;
    ctx.save();
    ctx.translate(wingman.x, wingman.y);
    ctx.rotate(wingman.aimAngle);
    ctx.fillStyle = wingman.dashTimer > 0 ? "#e2fff9" : "#b4ffe8";
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-10, 9);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-10, -9);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#61f8c3";
    ctx.beginPath();
    ctx.arc(-1, 0, 6, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawGameplay() {
    const shakeMul = state.settings.lowVfx ? 0.25 : 1;
    const shake = state.cameraShake * state.settings.screenShake * shakeMul;
    const sx = rng.range(-shake, shake);
    const sy = rng.range(-shake, shake);
    ctx.save();
    ctx.translate(sx, sy);
    for (const d of state.drops) {
      ctx.fillStyle = d.type === "heal" ? adaptColor("#93ffb7") : d.type === "overclock" ? adaptColor("#ffe197") : adaptColor("#9db0ff");
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    for (const h of state.hazards) {
      ctx.fillStyle = "rgba(255, 136, 121, 0.2)";
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 174, 160, 0.85)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    for (const p of state.projectiles) {
      ctx.fillStyle = adaptColor(p.color);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, TAU);
      ctx.fill();
    }
    for (const p of state.enemyProjectiles) {
      ctx.fillStyle = "#ff8a73";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, TAU);
      ctx.fill();
    }
    for (const e of state.enemies) {
      ctx.fillStyle = e.hitFlash > 0 ? "#fff2d5" : adaptColor(e.color);
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, TAU);
      ctx.fill();
      if (e.elite && !e.boss) {
        ctx.strokeStyle = "rgba(255, 233, 146, 0.95)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r + 5, 0, TAU);
        ctx.stroke();
      }
      if (e.boss && (e.telegraphShot > 0 || e.telegraphBurst > 0)) {
        if (e.telegraphBurst > 0) {
          ctx.strokeStyle = `rgba(255, 194, 120, ${0.35 + e.telegraphBurst})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(e.x, e.y, e.r + 18 + (0.3 - Math.min(0.3, e.telegraphBurst)) * 24, 0, TAU);
          ctx.stroke();
        }
        if (e.telegraphShot > 0) {
          const aim = Math.atan2(player.y - e.y, player.x - e.x);
          ctx.strokeStyle = `rgba(255, 214, 168, ${0.35 + e.telegraphShot})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(e.x, e.y);
          ctx.lineTo(e.x + Math.cos(aim) * 210, e.y + Math.sin(aim) * 210);
          ctx.stroke();
        }
      }
      if (e.boss) {
        const wa = e.weakAngle || 0;
        const arc = 0.45;
        ctx.strokeStyle = "#9ff6d7";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r + 10, wa - arc, wa + arc);
        ctx.stroke();
      }
      const hpw = e.boss ? 96 : 32;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(e.x - hpw * 0.5, e.y - e.r - 13, hpw, 4);
      ctx.fillStyle = e.boss ? "#ffd4df" : "#b4ffd0";
      ctx.fillRect(e.x - hpw * 0.5, e.y - e.r - 13, hpw * Math.max(0, e.hp / e.maxHp), 4);
      if ((e.shield || 0) > 0) {
        ctx.fillStyle = "rgba(134, 206, 255, 0.95)";
        ctx.fillRect(e.x - hpw * 0.5, e.y - e.r - 18, Math.min(hpw, (e.shield / 24) * hpw), 3);
      }
    }
    for (let i = 0; i < player.droneCount; i++) {
      const a = state.time * (1.8 + i * 0.14) + (TAU / player.droneCount) * i;
      const x = player.x + Math.cos(a) * 48;
      const y = player.y + Math.sin(a) * 48;
      ctx.fillStyle = "#92f7ff";
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, TAU);
      ctx.fill();
    }
    drawPlayer();
    drawWingman();
    if (!state.settings.lowVfx) {
      for (const p of state.particles) {
        ctx.fillStyle = adaptColor(p.color);
        ctx.globalAlpha = Math.max(0, p.life * 2);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    for (const n of state.damageNumbers) {
      ctx.globalAlpha = Math.max(0, n.life / 0.6);
      ctx.fillStyle = adaptColor(n.color);
      ctx.font = "16px Trebuchet MS";
      ctx.fillText(String(n.value), n.x, n.y);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawHud() {
    const compact = state.ui.compactHud;
    ctx.fillStyle = "rgba(8, 12, 24, 0.7)";
    ctx.fillRect(16, 14, 350, compact ? 100 : 122);
    ctx.fillStyle = "#d7e6ff";
    ctx.font = "20px Trebuchet MS";
    ctx.fillText(`Wave ${state.wave}`, 30, 38);
    ctx.fillText(`Score ${Math.floor(state.score)}`, 30, 64);
    if (!compact) ctx.fillText(`Kills ${state.kills}`, 30, 89);
    ctx.fillStyle = "#f1f7ff";
    ctx.fillText(
      `Weapon ${weaponDefs[state.selectedWeapon].name}${isWeaponEvolved(state.selectedWeapon) ? " EVO" : ""}`,
      30,
      compact ? 89 : 114
    );
    ctx.font = "14px Trebuchet MS";
    ctx.fillStyle = "#b9cbef";
    ctx.fillText(`Mode ${state.runMode.toUpperCase()}`, 250, 38);

    const hpw = 260;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(384, 20, hpw, 18);
    ctx.fillStyle = "#f97990";
    ctx.fillRect(384, 20, hpw * (player.hp / player.maxHp), 18);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.strokeRect(384, 20, hpw, 18);
    if (player.shield > 0) {
      ctx.fillStyle = "#8ad8ff";
      ctx.fillRect(384, 42, Math.min(hpw, player.shield * 2.1), 8);
    }
    ctx.fillStyle = "#dde7ff";
    ctx.font = "16px Trebuchet MS";
    ctx.fillText(`HP ${Math.ceil(player.hp)} / ${Math.ceil(player.maxHp)}`, 390, 35);

    ctx.fillStyle = "rgba(8, 12, 24, 0.7)";
    ctx.fillRect(WIDTH - 320, 14, 304, 146);
    ctx.fillStyle = "#fff1b4";
    ctx.fillText(`Lvl ${player.level}  XP ${Math.floor(player.xp)} / ${player.nextXp}`, WIDTH - 306, 38);
    ctx.fillStyle = "#f7d8ff";
    ctx.fillText(`Combo x${(1 + Math.max(0, state.combo) * 0.07).toFixed(2)}`, WIDTH - 306, 64);
    ctx.fillStyle = "#cedaff";
    ctx.fillText(`Bombs ${player.bombs} (${displayKey(state.settings.bombKey)})`, WIDTH - 306, 89);
    ctx.fillText(`Dash ${(player.dashCd <= 0 ? "Ready" : player.dashCd.toFixed(1) + "s")} (${displayKey(state.settings.dashKey)})`, WIDTH - 306, 114);
    ctx.fillText(`Warp ${(state.waveSkipCd <= 0 ? "Ready" : state.waveSkipCd.toFixed(1) + "s")} (${displayKey(state.settings.warpKey)})`, WIDTH - 306, 139);

    ctx.fillStyle = "rgba(8, 12, 24, 0.7)";
    ctx.fillRect(16, 144, 350, compact ? 86 : 112);
    ctx.fillStyle = (state.waveModifier && state.waveModifier.color) || "#d6e1ff";
    ctx.fillText(`Modifier: ${(state.waveModifier && state.waveModifier.name) || "Standard"}`, 30, 172);
    if (state.mission) {
      const prog = state.mission.id === "survive" ? state.mission.progress.toFixed(1) : Math.floor(state.mission.progress);
      const target = state.mission.id === "survive" ? `${state.mission.target}s` : String(state.mission.target);
      ctx.fillStyle = state.mission.complete ? "#9fffc5" : "#e6f1ff";
      ctx.fillText(`${state.mission.label}`, 30, 198);
      if (!compact) ctx.fillText(`Progress ${prog} / ${target}`, 30, 222);
    }
    if (state.bounty) {
      const bp = Math.floor(state.bounty.progress);
      const bt = Math.floor(state.bounty.target);
      ctx.fillStyle = state.bounty.complete ? "#aef7c4" : "#ffdca8";
      ctx.fillText(`Bounty: ${state.bounty.label} ${bp}/${bt}`, 30, compact ? 222 : 246);
    }
    if (state.activeEvent) {
      ctx.fillStyle = "#ffd6ab";
      ctx.fillText(`Anomaly: ${state.activeEvent.label} ${state.activeEvent.timeLeft.toFixed(1)}s`, 390, 168);
    }
    if (state.biome) {
      ctx.fillStyle = "#9fe0ff";
      ctx.fillText(`Biome: ${state.biome.label}`, 390, 141);
    }
    if (state.endgameMutator) {
      ctx.fillStyle = "#ffcc9c";
      ctx.fillText(`Endgame: ${state.endgameMutator.label}`, 390, 214);
    }
    ctx.fillStyle = state.heat >= 70 ? "#ffb08a" : state.heat >= 40 ? "#ffd59e" : "#b8d2ff";
    ctx.fillText(`Threat ${Math.round(state.heat)}%`, 390, 241);
    if (state.heat >= 45) {
      ctx.fillStyle = "#ffd6b7";
      ctx.fillText(`Director ${(state.directorCd || 0).toFixed(1)}s`, 510, 241);
    }
    if (state.streak > 0) {
      ctx.fillStyle = "#ffe9a8";
      ctx.fillText(`Streak x${state.streak}`, 390, 195);
    }
    const synergyNames = Object.keys(state.synergies)
      .slice(0, 2)
      .map((id) => synergyDefs.find((s) => s.id === id)?.label || id);
    if (synergyNames.length) {
      ctx.fillStyle = "#9ff6d7";
      if (!compact) ctx.fillText(`Synergy: ${synergyNames.join(" + ")}`, 390, 222);
    }

    ctx.fillStyle = "#a8b8d8";
    ctx.font = "14px Trebuchet MS";
    if (!compact) {
      ctx.fillText(
        `Move WASD/Arrows | Auto-fire | Aim mouse | Bomb ${displayKey(state.settings.bombKey)} | Warp ${displayKey(
          state.settings.warpKey
        )} | Pause P | Fullscreen F`,
        18,
        HEIGHT - 20
      );
    }
    if (state.coopJoined) {
      ctx.fillStyle = "#8cf8d7";
      if (!compact) ctx.fillText("Co-op P2: IJKL move | O dash | U bomb | Y burst | H support | Auto-aim fire", 18, HEIGHT - 38);
      ctx.fillText(`P2 Bombs ${wingman.bombs} | P2 Dash ${wingman.dashCd <= 0 ? "Ready" : wingman.dashCd.toFixed(1) + "s"}`, WIDTH - 320, 178);
      if (!compact) ctx.fillText(`Wingman mode ${state.wingmanMode.toUpperCase()} (T to cycle)`, WIDTH - 320, 198);
    }

    if (state.overclock > 0) {
      ctx.fillStyle = "rgba(255, 228, 145, 0.9)";
      ctx.fillText(`Overclock ${state.overclock.toFixed(1)}s`, WIDTH * 0.5 - 60, 28);
    }
    if (state.freeze > 0) {
      ctx.fillStyle = "rgba(173, 194, 255, 0.9)";
      ctx.fillText(`Cryo Field ${state.freeze.toFixed(1)}s`, WIDTH * 0.5 + 70, 28);
    }
    const relicCount = Object.keys(state.relics).length;
    if (relicCount > 0) {
      ctx.fillStyle = "#d8ffb4";
      ctx.fillText(`Relics ${relicCount}`, WIDTH - 140, 178);
    }
  }

  function drawMenu() {
    ctx.fillStyle = "rgba(2, 6, 15, 0.72)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    const btn = menuButtonRects();
    ctx.fillStyle = "#edf3ff";
    ctx.font = "64px Trebuchet MS";
    ctx.fillText("STARFALL ARENA", WIDTH * 0.19, HEIGHT * 0.2);
    ctx.fillStyle = "#d8e4ff";
    ctx.font = "26px Trebuchet MS";
    const menuLabel = state.menuScreen[0].toUpperCase() + state.menuScreen.slice(1);
    ctx.fillText(`Menu: ${menuLabel} (S to switch)`, WIDTH * 0.34, HEIGHT * 0.27);

    ctx.fillStyle = "rgba(12, 21, 44, 0.88)";
    ctx.fillRect(WIDTH * 0.1, HEIGHT * 0.3, WIDTH * 0.8, HEIGHT * 0.44);
    ctx.strokeStyle = "#89b8ff";
    ctx.lineWidth = 2;
    ctx.strokeRect(WIDTH * 0.1, HEIGHT * 0.3, WIDTH * 0.8, HEIGHT * 0.44);

    ctx.fillStyle = "#e7f0ff";
    ctx.font = "22px Trebuchet MS";
    if (state.menuScreen === "home") {
      ctx.font = "20px Trebuchet MS";
      ctx.fillText(
        `WASD move | Mouse aim | Auto-fire always on | Dash ${displayKey(state.settings.dashKey)} | Bomb ${displayKey(
          state.settings.bombKey
        )} | Warp ${displayKey(state.settings.warpKey)}`,
        WIDTH * 0.13,
        HEIGHT * 0.39
      );
      ctx.fillText(
        `Co-op ${state.coopJoined ? "ON" : "OFF"} (J) | Wingman ${state.wingmanMode.toUpperCase()} (T) | P2: IJKL, O dash, U bomb, Y burst, H support`,
        WIDTH * 0.13,
        HEIGHT * 0.44
      );
      ctx.fillText("Online: H host room | G join room | X disconnect", WIDTH * 0.13, HEIGHT * 0.49);
      ctx.fillText(`Run mode: ${state.runMode.toUpperCase()} (Y toggle daily, V seed/code load, B copy code)`, WIDTH * 0.13, HEIGHT * 0.54);
      const classLabel = shipClasses[state.selectedClass]?.label || "Striker";
      const lockTag = isClassUnlocked(state.selectedClass) ? "" : " (LOCKED)";
      const classDesc = shipClasses[state.selectedClass]?.desc || "";
      ctx.fillText(`Ship class: ${classLabel}${lockTag} (${classDesc}) (N) | Continue (C)`, WIDTH * 0.13, HEIGHT * 0.59);
      if (state.challenge?.code) {
        ctx.fillText(`Daily ${state.challenge.code} | ${state.challenge.labels.join(" / ")}`, WIDTH * 0.13, HEIGHT * 0.63);
      }
      ctx.fillText(
        `Shards ${state.meta?.shards || 0} | Best ${state.meta?.bestScore || 0} pts wave ${state.meta?.bestWave || 0} | M P${getWeaponMasteryTier(
          "pulse"
        )}/S${getWeaponMasteryTier("scatter")}/R${getWeaponMasteryTier("rail")} | U V${state.meta?.unlocks?.vanguard ? 1 : 0} E${
          state.meta?.unlocks?.engineer ? 1 : 0
        } P${state.meta?.unlocks?.phantom ? 1 : 0} R${state.meta?.unlocks?.rareRelics ? 1 : 0}`,
        WIDTH * 0.13,
        HEIGHT * 0.655
      );

      ctx.fillStyle = "rgba(255, 238, 168, 0.95)";
      ctx.fillRect(btn.start.x, btn.start.y, btn.start.w, btn.start.h);
      ctx.fillStyle = "#14213b";
      ctx.font = "30px Trebuchet MS";
      ctx.fillText("Start Run", btn.start.x + btn.start.w * 0.33, btn.start.y + 38);

      ctx.fillStyle = "rgba(143, 190, 255, 0.95)";
      ctx.fillRect(btn.settings.x, btn.settings.y, btn.settings.w, btn.settings.h);
      ctx.fillStyle = "#122947";
      ctx.font = "24px Trebuchet MS";
      ctx.fillText("Open Settings", btn.settings.x + btn.settings.w * 0.28, btn.settings.y + 30);

      ctx.fillStyle = "rgba(145, 217, 255, 0.95)";
      ctx.fillRect(btn.codex.x, btn.codex.y, btn.codex.w, btn.codex.h);
      ctx.fillStyle = "#122947";
      ctx.font = "22px Trebuchet MS";
      ctx.fillText("Open Combat Codex", btn.codex.x + btn.codex.w * 0.23, btn.codex.y + 27);

      ctx.font = "16px Trebuchet MS";
      ctx.fillStyle = "rgba(124, 171, 255, 0.95)";
      ctx.fillRect(btn.daily.x, btn.daily.y, btn.daily.w, btn.daily.h);
      ctx.fillRect(btn.seed.x, btn.seed.y, btn.seed.w, btn.seed.h);
      ctx.fillRect(btn.copy.x, btn.copy.y, btn.copy.w, btn.copy.h);
      ctx.fillRect(btn.coop.x, btn.coop.y, btn.coop.w, btn.coop.h);
      ctx.fillStyle = "#122947";
      ctx.fillText("Toggle Daily", btn.daily.x + 16, btn.daily.y + 23);
      ctx.fillText("Set Seed", btn.seed.x + 42, btn.seed.y + 23);
      ctx.fillText("Copy Code", btn.copy.x + 32, btn.copy.y + 23);
      ctx.fillText("Co-op", btn.coop.x + 20, btn.coop.y + 23);
    } else if (state.menuScreen === "settings") {
      ctx.fillText(`Touch UI: ${state.settings.showTouchUi ? "ON" : "OFF"} (press T)`, WIDTH * 0.13, HEIGHT * 0.39);
      ctx.fillText(`Screen shake: ${state.settings.screenShake.toFixed(1)} (press - / +)`, WIDTH * 0.13, HEIGHT * 0.44);
      ctx.fillText(`Quality: ${(qualityModes[state.settings.quality] || qualityModes.balanced).label} (Z)`, WIDTH * 0.13, HEIGHT * 0.49);
      ctx.fillText(`Low VFX: ${state.settings.lowVfx ? "ON" : "OFF"} (L) | Colorblind: ${state.settings.colorblind ? "ON" : "OFF"} (C)`, WIDTH * 0.13, HEIGHT * 0.54);
      ctx.fillText(`Aim assist: ${(state.settings.aimAssist * 100).toFixed(0)}% ([ / ])`, WIDTH * 0.13, HEIGHT * 0.58);
      ctx.fillText(`Accessibility preset: ${state.settings.accessibilityPreset.replace("_", " ")} (A)`, WIDTH * 0.13, HEIGHT * 0.62);
      ctx.fillText(
        `Keys: Dash ${displayKey(state.settings.dashKey)}(U), Bomb ${displayKey(state.settings.bombKey)}(I), Warp ${displayKey(
          state.settings.warpKey
        )}(O)`,
        WIDTH * 0.13,
        HEIGHT * 0.66
      );
      ctx.fillText(`Permanent upgrades: 7 Hull (${getMetaUpgradeCost(state.meta?.perks.hull || 0)})`, WIDTH * 0.13, HEIGHT * 0.69);
      ctx.fillText(
        `8 Cannons (${getMetaUpgradeCost(state.meta?.perks.cannons || 0)}) | 9 Thrusters (${getMetaUpgradeCost(state.meta?.perks.thrusters || 0)})`,
        WIDTH * 0.13,
        HEIGHT * 0.725
      );
      ctx.fillText(`Audio: SFX ${(state.settings.sfxVolume * 100).toFixed(0)}% , Music ${(state.settings.musicVolume * 100).toFixed(0)}% , Mute ${state.settings.muteAudio ? "ON" : "OFF"}`, WIDTH * 0.13, HEIGHT * 0.755);

      ctx.fillStyle = "rgba(143, 190, 255, 0.95)";
      ctx.fillRect(btn.back.x, btn.back.y, btn.back.w, btn.back.h);
      ctx.fillStyle = "#122947";
      ctx.font = "26px Trebuchet MS";
      ctx.fillText("Back To Home", btn.back.x + btn.back.w * 0.27, btn.back.y + 34);

      ctx.font = "14px Trebuchet MS";
      ctx.fillStyle = state.settings.showTouchUi ? "rgba(141, 222, 178, 0.95)" : "rgba(124, 171, 255, 0.95)";
      ctx.fillRect(btn.touchToggle.x, btn.touchToggle.y, btn.touchToggle.w, btn.touchToggle.h);
      ctx.fillStyle = "rgba(124, 171, 255, 0.95)";
      ctx.fillRect(btn.shakeDown.x, btn.shakeDown.y, btn.shakeDown.w, btn.shakeDown.h);
      ctx.fillRect(btn.shakeUp.x, btn.shakeUp.y, btn.shakeUp.w, btn.shakeUp.h);
      ctx.fillStyle = "rgba(249, 232, 157, 0.95)";
      ctx.fillRect(btn.quality.x, btn.quality.y, btn.quality.w, btn.quality.h);
      ctx.fillStyle = state.settings.lowVfx ? "rgba(141, 222, 178, 0.95)" : "rgba(124, 171, 255, 0.95)";
      ctx.fillRect(btn.lowVfx.x, btn.lowVfx.y, btn.lowVfx.w, btn.lowVfx.h);
      ctx.fillStyle = state.settings.colorblind ? "rgba(141, 222, 178, 0.95)" : "rgba(124, 171, 255, 0.95)";
      ctx.fillRect(btn.colorblind.x, btn.colorblind.y, btn.colorblind.w, btn.colorblind.h);
      ctx.fillStyle = "rgba(124, 171, 255, 0.95)";
      ctx.fillRect(btn.aimDown.x, btn.aimDown.y, btn.aimDown.w, btn.aimDown.h);
      ctx.fillRect(btn.aimUp.x, btn.aimUp.y, btn.aimUp.w, btn.aimUp.h);
      ctx.fillRect(btn.bindDash.x, btn.bindDash.y, btn.bindDash.w, btn.bindDash.h);
      ctx.fillRect(btn.bindBomb.x, btn.bindBomb.y, btn.bindBomb.w, btn.bindBomb.h);
      ctx.fillRect(btn.bindWarp.x, btn.bindWarp.y, btn.bindWarp.w, btn.bindWarp.h);
      ctx.fillStyle = "rgba(249, 232, 157, 0.95)";
      ctx.fillRect(btn.preset.x, btn.preset.y, btn.preset.w, btn.preset.h);
      ctx.fillStyle = "rgba(124, 171, 255, 0.95)";
      ctx.fillRect(btn.resetSettings.x, btn.resetSettings.y, btn.resetSettings.w, btn.resetSettings.h);
      ctx.fillRect(btn.sfxDown.x, btn.sfxDown.y, btn.sfxDown.w, btn.sfxDown.h);
      ctx.fillRect(btn.sfxUp.x, btn.sfxUp.y, btn.sfxUp.w, btn.sfxUp.h);
      ctx.fillRect(btn.musicDown.x, btn.musicDown.y, btn.musicDown.w, btn.musicDown.h);
      ctx.fillRect(btn.musicUp.x, btn.musicUp.y, btn.musicUp.w, btn.musicUp.h);
      ctx.fillStyle = state.settings.muteAudio ? "rgba(141, 222, 178, 0.95)" : "rgba(124, 171, 255, 0.95)";
      ctx.fillRect(btn.muteBtn.x, btn.muteBtn.y, btn.muteBtn.w, btn.muteBtn.h);
      ctx.fillStyle = "#122947";
      ctx.fillText("Touch", btn.touchToggle.x + 30, btn.touchToggle.y + 21);
      ctx.fillText("Shake-", btn.shakeDown.x + 25, btn.shakeDown.y + 21);
      ctx.fillText("Shake+", btn.shakeUp.x + 25, btn.shakeUp.y + 21);
      ctx.fillText("Quality", btn.quality.x + 35, btn.quality.y + 21);
      ctx.fillText("VFX", btn.lowVfx.x + 35, btn.lowVfx.y + 21);
      ctx.fillText("Color", btn.colorblind.x + 33, btn.colorblind.y + 21);
      ctx.fillText("Aim-", btn.aimDown.x + 34, btn.aimDown.y + 21);
      ctx.fillText("Aim+", btn.aimUp.x + 34, btn.aimUp.y + 21);
      ctx.fillText("Dash", btn.bindDash.x + 22, btn.bindDash.y + 21);
      ctx.fillText("Bomb", btn.bindBomb.x + 20, btn.bindBomb.y + 21);
      ctx.fillText("Warp", btn.bindWarp.x + 21, btn.bindWarp.y + 21);
      ctx.fillText("Preset", btn.preset.x + 23, btn.preset.y + 21);
      ctx.fillText("Reset", btn.resetSettings.x + 28, btn.resetSettings.y + 21);
      ctx.fillText("SFX-", btn.sfxDown.x + 34, btn.sfxDown.y + 20);
      ctx.fillText("SFX+", btn.sfxUp.x + 34, btn.sfxUp.y + 20);
      ctx.fillText("MUS-", btn.musicDown.x + 30, btn.musicDown.y + 20);
      ctx.fillText("MUS+", btn.musicUp.x + 30, btn.musicUp.y + 20);
      ctx.fillText("Mute", btn.muteBtn.x + 95, btn.muteBtn.y + 20);
    } else {
      ctx.fillStyle = "#d9e8ff";
      ctx.font = "24px Trebuchet MS";
      ctx.fillText(`Codex tab: ${state.codexTab.toUpperCase()} (M to toggle)`, WIDTH * 0.13, HEIGHT * 0.36);
      ctx.fillStyle = "rgba(142, 199, 255, 0.95)";
      ctx.fillRect(btn.codexToggle.x, btn.codexToggle.y, btn.codexToggle.w, btn.codexToggle.h);
      ctx.fillStyle = "#122947";
      ctx.font = "22px Trebuchet MS";
      ctx.fillText(`Open ${state.codexTab === "synergy" ? "Mastery" : "Synergy"} Tab`, btn.codexToggle.x + 18, btn.codexToggle.y + 34);

      if (state.codexTab === "synergy") {
        const discovered = Object.keys(state.synergies);
        ctx.fillStyle = "#d9e8ff";
        ctx.font = "24px Trebuchet MS";
        ctx.fillText(`Synergies discovered ${discovered.length} / ${synergyDefs.length}`, WIDTH * 0.13, HEIGHT * 0.42);
        ctx.font = "20px Trebuchet MS";
        let row = 0;
        for (const s of synergyDefs) {
          const unlocked = Boolean(state.synergies[s.id]);
          const needs = Object.entries(s.needs)
            .map(([k, v]) => {
              const up = upgrades.find((u) => u.id === k);
              return `${up ? up.label : k} x${v}`;
            })
            .join(", ");
          ctx.fillStyle = unlocked ? "#a8ffd2" : "#e3edff";
          ctx.fillText(`${unlocked ? "UNLOCKED" : "LOCKED"} - ${s.label}`, WIDTH * 0.13, HEIGHT * 0.48 + row * 40);
          ctx.fillStyle = "#a6bbdd";
          ctx.fillText(`Needs: ${needs}`, WIDTH * 0.4, HEIGHT * 0.48 + row * 40);
          row += 1;
          if (row >= 6) break;
        }
      } else {
        ctx.fillStyle = "#dff0ff";
        ctx.font = "24px Trebuchet MS";
        ctx.fillText("Weapon Mastery (persistent across runs)", WIDTH * 0.13, HEIGHT * 0.42);
        ctx.font = "18px Trebuchet MS";
        const weaponOrder = ["pulse", "scatter", "rail"];
        const starts = [HEIGHT * 0.48, HEIGHT * 0.585, HEIGHT * 0.69];
        for (let i = 0; i < weaponOrder.length; i++) {
          const id = weaponOrder[i];
          const kills = Number(state.meta?.masteryKills?.[id] || 0);
          const tier = getWeaponMasteryTier(id);
          const marks = masteryThresholds[id] || [];
          const name = weaponDefs[id]?.name || id;
          const y = starts[i];
          ctx.fillStyle = "#f2f7ff";
          ctx.fillText(`${name}: ${kills} kills | Tier ${tier}/3`, WIDTH * 0.13, y);
          ctx.fillStyle = "#aecdff";
          ctx.fillText(`Thresholds: T1 ${marks[0]}, T2 ${marks[1]}, T3 ${marks[2]}`, WIDTH * 0.39, y);
          const lines = masteryBonusLines(id);
          for (let l = 0; l < lines.length; l++) {
            ctx.fillStyle = lines[l].includes("(active)") ? "#9ff5cd" : "#b9cee9";
            ctx.fillText(`- ${lines[l]}`, WIDTH * 0.16, y + 22 + l * 18);
          }
        }
      }
      ctx.fillStyle = "rgba(143, 190, 255, 0.95)";
      ctx.fillRect(btn.back.x, btn.back.y, btn.back.w, btn.back.h);
      ctx.fillStyle = "#122947";
      ctx.font = "26px Trebuchet MS";
      ctx.fillText("Back To Home", btn.back.x + btn.back.w * 0.27, btn.back.y + 34);
    }
  }

  function drawPause() {
    ctx.fillStyle = "rgba(0, 0, 0, 0.52)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "#e8f1ff";
    ctx.font = "62px Trebuchet MS";
    ctx.fillText("PAUSED", WIDTH * 0.38, HEIGHT * 0.42);
    ctx.font = "26px Trebuchet MS";
    ctx.fillText("Press P to resume", WIDTH * 0.39, HEIGHT * 0.5);
  }

  function drawLevelUp() {
    ctx.fillStyle = "rgba(7, 11, 22, 0.74)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "#f2f7ff";
    ctx.font = "54px Trebuchet MS";
    ctx.fillText(`LEVEL ${player.level}`, WIDTH * 0.37, HEIGHT * 0.2);
    ctx.font = "26px Trebuchet MS";
    ctx.fillText("Pick an upgrade", WIDTH * 0.43, HEIGHT * 0.26);

    for (let i = 0; i < 3; i++) {
      const c = state.choices[i];
      const x = WIDTH * 0.18 + i * 300;
      const y = HEIGHT * 0.31;
      const w = 250;
      const h = 170;
      ctx.fillStyle = "rgba(17, 29, 58, 0.92)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "#8cc2ff";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = "#9ec7ff";
      ctx.font = "24px Trebuchet MS";
      ctx.fillText(`${i + 1}`, x + 15, y + 32);
      ctx.fillStyle = player.banishes > 0 ? "#ffd9b0" : "#8c8f99";
      ctx.fillRect(x + w - 58, y + 10, 40, 30);
      ctx.fillStyle = "#14213b";
      ctx.font = "16px Trebuchet MS";
      ctx.fillText("X", x + w - 43, y + 31);
      ctx.fillStyle = "#ecf3ff";
      ctx.font = "25px Trebuchet MS";
      if (c) {
        const words = c.label.split(" ");
        let line = "";
        let row = 0;
        for (const word of words) {
          const next = line ? `${line} ${word}` : word;
          if (ctx.measureText(next).width > 210) {
            ctx.fillText(line, x + 18, y + 76 + row * 34);
            line = word;
            row += 1;
          } else {
            line = next;
          }
        }
        if (line) ctx.fillText(line, x + 18, y + 76 + row * 34);
      }
    }
    const rerollBtn = { x: WIDTH * 0.25, y: HEIGHT * 0.78, w: 220, h: 50 };
    ctx.fillStyle = player.rerolls > 0 ? "rgba(137, 205, 255, 0.95)" : "rgba(90, 106, 131, 0.75)";
    ctx.fillRect(rerollBtn.x, rerollBtn.y, rerollBtn.w, rerollBtn.h);
    ctx.fillStyle = "#122947";
    ctx.font = "22px Trebuchet MS";
    ctx.fillText(`Reroll (4) x${player.rerolls}`, rerollBtn.x + 24, rerollBtn.y + 33);
    ctx.fillStyle = "#ffd8b8";
    ctx.font = "20px Trebuchet MS";
    ctx.fillText(`Banish token(s): ${player.banishes} (5/6/7 or X buttons)`, WIDTH * 0.46, HEIGHT * 0.815);
  }

  function drawRelicSelect() {
    ctx.fillStyle = "rgba(7, 10, 24, 0.78)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "#f6f4c9";
    ctx.font = "54px Trebuchet MS";
    ctx.fillText("RELIC DISCOVERY", WIDTH * 0.32, HEIGHT * 0.2);
    ctx.font = "24px Trebuchet MS";
    ctx.fillStyle = "#d8e7ff";
    ctx.fillText("Pick a relic (1/2/3)", WIDTH * 0.41, HEIGHT * 0.26);
    for (let i = 0; i < 3; i++) {
      const r = state.relicChoices[i];
      const x = WIDTH * 0.16 + i * 310;
      const y = HEIGHT * 0.34;
      const w = 260;
      const h = 180;
      ctx.fillStyle = "rgba(26, 39, 70, 0.94)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "#b1d6ff";
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = "#f2e4a5";
      ctx.font = "24px Trebuchet MS";
      ctx.fillText(`${i + 1}`, x + 16, y + 32);
      if (!r) continue;
      ctx.fillStyle = "#eff6ff";
      ctx.font = "28px Trebuchet MS";
      ctx.fillText(r.label, x + 18, y + 72);
      ctx.font = "16px Trebuchet MS";
      ctx.fillStyle = relicRarityColors[r.rarity || "common"] || "#d4e2ff";
      ctx.fillText((r.rarity || "common").toUpperCase(), x + 18, y + 96);
      ctx.font = "18px Trebuchet MS";
      ctx.fillStyle = "#b8cbe9";
      const detail = r.desc || "Major run boost";
      const words = detail.split(" ");
      let line = "";
      let row = 0;
      for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (ctx.measureText(next).width > w - 34) {
          ctx.fillText(line, x + 18, y + 124 + row * 24);
          line = word;
          row += 1;
          if (row >= 2) break;
        } else {
          line = next;
        }
      }
      if (row < 2 && line) ctx.fillText(line, x + 18, y + 124 + row * 24);
    }
  }

  function drawGameOver() {
    ctx.fillStyle = "rgba(8, 0, 12, 0.7)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "#ffe0eb";
    ctx.font = "68px Trebuchet MS";
    ctx.fillText("RUN OVER", WIDTH * 0.34, HEIGHT * 0.31);
    ctx.font = "34px Trebuchet MS";
    ctx.fillStyle = "#e7eeff";
    ctx.fillText(`Score ${Math.floor(state.score)}   Wave ${state.wave}   Kills ${state.kills}`, WIDTH * 0.22, HEIGHT * 0.44);
    ctx.fillStyle = "#fff9c4";
    ctx.fillText("Click or press R to restart", WIDTH * 0.31, HEIGHT * 0.56);
    ctx.font = "22px Trebuchet MS";
    ctx.fillStyle = "#d5e3ff";
    ctx.fillText(
      `Shards ${state.meta?.shards || 0}   Best Score ${state.meta?.bestScore || 0}   Best Wave ${state.meta?.bestWave || 0}`,
      WIDTH * 0.2,
      HEIGHT * 0.65
    );
    ctx.fillText(
      `Best ${weaponDefs[state.selectedWeapon].name}: ${state.meta?.weaponBest?.[state.selectedWeapon] || 0}   Daily Best: ${
        state.meta?.dailyBest?.[state.challenge?.code || ""] || 0
      }`,
      WIDTH * 0.2,
      HEIGHT * 0.7
    );
    ctx.fillText(`Daily streak ${state.meta?.dailyStreak || 0}`, WIDTH * 0.2, HEIGHT * 0.74);
  }

  function drawOnlineOverlay() {
    if (state.net.mode === "offline" && state.mode !== "menu") return;
    const touchOffset = state.settings.showTouchUi && state.touch.enabled && state.mode === "playing" ? 108 : 0;
    const boxY = HEIGHT - 88 - touchOffset;
    ctx.fillStyle = "rgba(6, 10, 20, 0.7)";
    ctx.fillRect(WIDTH - 350, boxY, 334, 72);
    ctx.fillStyle = "#d5e3ff";
    ctx.font = "16px Trebuchet MS";
    if (state.net.mode === "offline") {
      ctx.fillText("Online: Menu H=host, G=join, X=disconnect", WIDTH - 338, boxY + 30);
      return;
    }
    ctx.fillText(`Online ${state.net.mode.toUpperCase()} | Room ${state.net.roomCode || "..."}`, WIDTH - 338, boxY + 28);
    if (state.net.mode === "host") {
      const peer = state.net.status === "peer_joined" ? "Connected" : "Waiting";
      ctx.fillStyle = peer === "Connected" ? "#94ffd0" : "#ffe7a6";
      ctx.fillText(`Guest: ${peer}  |  Press X to disconnect`, WIDTH - 338, boxY + 53);
    } else {
      const age = state.net.lastSnapshotAt ? ((performance.now() - state.net.lastSnapshotAt) / 1000).toFixed(1) : "n/a";
      ctx.fillStyle = "#9bdcff";
      ctx.fillText(`Snapshots seq ${state.net.snapshotSeq} | age ${age}s | X disconnect`, WIDTH - 338, boxY + 53);
    }
  }

  function drawTouchControls() {
    if (!(state.mode === "playing" && state.settings.showTouchUi && state.touch.enabled)) return;
    const t = state.touch;
    const buttons = getTouchButtonLayout();
    const stickR = 58 * state.ui.touchScale;
    const knobR = 23 * state.ui.touchScale;
    const fontSize = Math.round(18 * Math.max(1, state.ui.touchScale * 0.8));
    ctx.save();
    ctx.globalAlpha = 0.86;
    ctx.fillStyle = "rgba(14,24,44,0.72)";
    ctx.beginPath();
    ctx.arc(t.stickBase.x, t.stickBase.y, stickR, 0, TAU);
    ctx.fill();
    const knobX = t.stickBase.x + t.moveX * stickR;
    const knobY = t.stickBase.y + t.moveY * stickR;
    ctx.fillStyle = "rgba(156,223,255,0.92)";
    ctx.beginPath();
    ctx.arc(knobX, knobY, knobR, 0, TAU);
    ctx.fill();

    for (const [name, b] of Object.entries(buttons)) {
      const active = state.touch.actions[name];
      ctx.fillStyle = active ? "rgba(255,223,153,0.95)" : "rgba(18,33,63,0.8)";
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = active ? "#122" : "#d8ebff";
      ctx.font = `${fontSize}px Trebuchet MS`;
      const label = name === "dash" ? "Dash" : name === "bomb" ? "Bomb" : "Warp";
      const tw = ctx.measureText(label).width;
      ctx.fillText(label, b.x - tw / 2, b.y + 6);
    }
    ctx.restore();
  }

  function render() {
    drawBackground();
    drawGameplay();
    if (state.mode === "menu") drawMenu();
    if (state.mode === "paused") drawPause();
    if (state.mode === "levelup") drawLevelUp();
    if (state.mode === "relic") drawRelicSelect();
    if (state.mode === "gameover") drawGameOver();
    if (state.mode !== "menu") drawHud();
    drawOnlineOverlay();
    drawTouchControls();
    const flashMul = state.settings.lowVfx ? 0.25 : 1;
    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255, 247, 214, ${state.flash * flashMul})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
  }

  function renderGameToText() {
    const payload = {
      coordinateSystem: "origin=(0,0) top-left; +x right; +y down; units are canvas pixels",
      mode: state.mode,
      runMode: state.runMode,
      runSeed: state.runSeed,
      shipClass: state.selectedClass,
      wingmanMode: state.wingmanMode,
      wave: state.wave,
      threatHeat: Number(state.heat.toFixed(1)),
      waveProgressSeconds: Number(state.waveClock.toFixed(2)),
      waveModifier: state.waveModifier ? state.waveModifier.id : "standard",
      coopJoined: state.coopJoined,
      online: {
        mode: state.net.mode,
        roomCode: state.net.roomCode,
        status: state.net.status,
        playerSlot: state.net.playerSlot,
        snapshotSeq: state.net.snapshotSeq,
      },
      settings: {
        touchUi: state.settings.showTouchUi,
        colorblind: state.settings.colorblind,
        lowVfx: state.settings.lowVfx,
        quality: state.settings.quality,
        accessibilityPreset: state.settings.accessibilityPreset,
        aimAssist: Number(state.settings.aimAssist.toFixed(2)),
        screenShake: Number(state.settings.screenShake.toFixed(2)),
        sfxVolume: Number(state.settings.sfxVolume.toFixed(2)),
        musicVolume: Number(state.settings.musicVolume.toFixed(2)),
        muteAudio: state.settings.muteAudio,
      },
      biome: state.biome ? state.biome.id : "nebula",
      endgameMutator: state.endgameMutator ? state.endgameMutator.id : null,
      relicCount: Object.keys(state.relics).length,
      activeHazards: state.hazards.slice(0, 8).map((h) => ({ x: Number(h.x.toFixed(1)), y: Number(h.y.toFixed(1)), r: Number(h.r.toFixed(1)) })),
      performance: {
        avgFps: Number(state.perf.avgFps.toFixed(1)),
        adaptiveEnemyCapMul: Number(state.perf.adaptiveEnemyCapMul.toFixed(2)),
        threatHeat: Number(state.heat.toFixed(1)),
      },
      runSaveAvailable: state.runSaveAvailable,
      player: {
        x: Number(player.x.toFixed(1)),
        y: Number(player.y.toFixed(1)),
        vx: Number(player.vx.toFixed(1)),
        vy: Number(player.vy.toFixed(1)),
        hp: Number(player.hp.toFixed(1)),
        maxHp: Number(player.maxHp.toFixed(1)),
        shield: Number(player.shield.toFixed(1)),
        bombs: player.bombs,
        dashCooldown: Number(player.dashCd.toFixed(2)),
        waveSkipCooldown: Number(state.waveSkipCd.toFixed(2)),
        contactDamageCooldown: Number(player.contactDamageCd.toFixed(2)),
        damageReduction: Number(player.damageReduction.toFixed(2)),
        lifesteal: Number(player.lifesteal.toFixed(3)),
        projectileSpeedMult: Number(player.projectileSpeedMult.toFixed(2)),
        projectileSizeMult: Number(player.projectileSizeMult.toFixed(2)),
        rangeMult: Number(player.rangeMult.toFixed(2)),
        bonusPierce: player.bonusPierce,
        level: player.level,
        rerolls: player.rerolls,
        banishes: player.banishes,
        xp: Number(player.xp.toFixed(1)),
        xpToNext: player.nextXp,
        weapon: state.selectedWeapon,
      },
      wingman: state.coopJoined
        ? {
            x: Number(wingman.x.toFixed(1)),
            y: Number(wingman.y.toFixed(1)),
            vx: Number(wingman.vx.toFixed(1)),
            vy: Number(wingman.vy.toFixed(1)),
            bombs: wingman.bombs,
            dashCooldown: Number(wingman.dashCd.toFixed(2)),
            bombCooldown: Number(wingman.bombCd.toFixed(2)),
            burstCooldown: Number((wingman.burstCd || 0).toFixed(2)),
            supportCooldown: Number((wingman.supportCd || 0).toFixed(2)),
          }
        : null,
      targets: state.enemies.slice(0, 14).map((e) => ({
        kind: e.kind,
        x: Number(e.x.toFixed(1)),
        y: Number(e.y.toFixed(1)),
        hp: Number(e.hp.toFixed(1)),
        r: e.r,
      })),
      enemyProjectiles: state.enemyProjectiles.slice(0, 10).map((p) => ({
        x: Number(p.x.toFixed(1)),
        y: Number(p.y.toFixed(1)),
        r: p.r,
      })),
      pickups: state.drops.map((d) => ({
        type: d.type,
        x: Number(d.x.toFixed(1)),
        y: Number(d.y.toFixed(1)),
      })),
      mission: state.mission
        ? {
            id: state.mission.id,
            label: state.mission.label,
            progress: Number(state.mission.progress.toFixed(1)),
            target: state.mission.target,
            complete: state.mission.complete,
          }
        : null,
      bounty: state.bounty
        ? {
            id: state.bounty.id,
            label: state.bounty.label,
            progress: Number(state.bounty.progress.toFixed(1)),
            target: state.bounty.target,
            complete: state.bounty.complete,
          }
        : null,
      activeEvent: state.activeEvent
        ? {
            id: state.activeEvent.id,
            label: state.activeEvent.label,
            timeLeft: Number(state.activeEvent.timeLeft.toFixed(2)),
          }
        : null,
      synergies: Object.keys(state.synergies),
      bannedUpgrades: Object.keys(state.bannedUpgrades).length,
      streak: state.streak,
      unlockedWeapons: state.unlockedWeapons,
      meta: {
        shards: state.meta?.shards || 0,
        bestScore: state.meta?.bestScore || 0,
        bestWave: state.meta?.bestWave || 0,
        dailyBestToday: state.meta?.dailyBest?.[state.challenge?.code || ""] || 0,
        dailyStreak: state.meta?.dailyStreak || 0,
        weaponBest: state.meta?.weaponBest || { pulse: 0, scatter: 0, rail: 0 },
        masteryKills: state.meta?.masteryKills || { pulse: 0, scatter: 0, rail: 0 },
        totalShardsEarned: state.meta?.totalShardsEarned || 0,
        unlocks: state.meta?.unlocks || { vanguard: false, engineer: false, phantom: false, rareRelics: false, trail: false },
        perks: state.meta?.perks || { hull: 0, cannons: 0, thrusters: 0 },
      },
      score: Number(state.score.toFixed(1)),
      combo: Number(state.combo.toFixed(1)),
      overclockSeconds: Number(state.overclock.toFixed(1)),
      freezeSeconds: Number(state.freeze.toFixed(1)),
      events: state.events.slice(0, 3),
    };
    return JSON.stringify(payload);
  }

  window.render_game_to_text = renderGameToText;

  window.advanceTime = (ms) => {
    const steps = Math.max(1, Math.round(ms / (1000 / 60)));
    const dt = ms / 1000 / steps;
    for (let i = 0; i < steps; i++) update(dt);
    render();
  };

  let last = performance.now();
  let acc = 0;
  const fixed = 1 / 60;
  const deterministicMode = typeof window.__drainVirtualTimePending === "function";
  function frame(now) {
    const delta = Math.min(0.05, (now - last) / 1000);
    last = now;
    updatePerformanceTuning(delta);
    if (!deterministicMode) {
      acc += delta;
      while (acc >= fixed) {
        update(fixed);
        acc -= fixed;
      }
    }
    render();
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
