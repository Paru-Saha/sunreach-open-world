// Tunable numbers for Sunreach Bay: the city grid, movement, vehicles, police and economy.
// Every system reads from here so the feel of the game can be tuned in one place.

export const STEP = 1 / 60;

/** City layout: an 8 x 6 grid of blocks between roads, the beach and ocean to the south. */
export const CITY = {
  cell: 80,          // road centre to road centre
  road: 14,          // asphalt width
  sidewalk: 4,       // pavement inside each block edge
  blocksX: 8,
  blocksZ: 6,
  beachDepth: 60,    // sand between the shore road and the water line
  bound: 470,        // invisible wall around the playable area
};
CITY.halfX = (CITY.blocksX * CITY.cell) / 2;
CITY.halfZ = (CITY.blocksZ * CITY.cell) / 2;
CITY.waterZ = CITY.halfZ + CITY.road / 2 + CITY.beachDepth;
CITY.harborX = -CITY.halfX - CITY.road / 2 - 46;

export const PLAYER = {
  walk: 4.2,
  sprint: 8.6,
  radius: 0.45,
  height: 1.8,
  maxHealth: 100,
  maxArmor: 100,
  jump: 6.2,
  gravity: 20,
  enterRange: 4.2,
};

export const VEHICLE = {
  radius: 1.2,
  length: 4.6,
  accel: 15,
  reverseAccel: 8,
  brake: 32,
  drag: 0.22,
  rolling: 1.2,
  grip: 9,
  driftGrip: 1.6,
  turnRate: 2.5,
  maxHealth: 100,
};

export const CAMERA = {
  footDistance: 5.2,
  aimDistance: 2.6,
  carDistance: 9.5,
  carHeight: 3.4,
  fov: 62,
  fovBoost: 14,
  mouseSpeed: 0.0024,
};

export const TRAFFIC = { cars: 26, cruise: 11, peds: 46 };

export const POLICE = {
  maxStars: 5,
  carsPerStar: [0, 1, 2, 3, 4, 6],
  spawnMin: 110,
  spawnMax: 170,
  sightRange: 70,
  coolBase: 9,
  coolPerStar: 4,
  bustTime: 2.2,
};

export const ECONOMY = {
  startMoney: 250,
  deathFee: 200,
  arrestFee: 350,
  ammoPrice: 120,
  ammoPack: 30,
  armorPrice: 400,
  healPrice: 80,
  smgPrice: 1500,
  tokenReward: 250,
};

export const WEAPONS = {
  fists: { name: 'Fists', damage: 18, range: 1.9, cooldown: 0.42, auto: false, spread: 0 },
  pistol: { name: 'Vela 9 Pistol', damage: 34, range: 90, cooldown: 0.26, auto: false, spread: 0.012 },
  smg: { name: 'Gull SMG', damage: 20, range: 70, cooldown: 0.085, auto: true, spread: 0.035 },
};
export const WEAPON_ORDER = ['fists', 'pistol', 'smg'];

/** Golden-hour palette shared by the sky, fog and lights. */
export const PALETTE = {
  skyTop: 0x3f7fd6,
  skyHorizon: 0xffc89a,
  fog: 0xf3c9a4,
  sun: 0xffe2b8,
  ground: 0xd9c49a,
  sand: 0xf0d9a6,
  asphalt: 0x3b3d44,
  sidewalk: 0xc9bfae,
  sea: 0x1f8fb0,
  pastel: [0xf7b7a3, 0xfde2b4, 0xa8e0d5, 0xf6d0e6, 0xb9d7f2, 0xfff2cf, 0xffd1a6, 0xd2f0c2],
  glass: [0x7fb6d9, 0x9ccbe3, 0x6aa3c7, 0xa9d4de],
  warehouse: [0xb8a48c, 0x8fa3ad, 0xa47f6a, 0x9a9a8a],
  car: [0xe84a5f, 0x2a9d8f, 0xf4a261, 0xffffff, 0x264653, 0xe9c46a, 0x8ecae6, 0x9b5de5, 0x222222, 0xf15bb5],
};
