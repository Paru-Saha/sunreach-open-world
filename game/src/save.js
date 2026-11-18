// Save and load through localStorage: money, health and armour, weapons and ammo, story progress,
// Sun Tokens, stats and where the player stood. Saves on demand from the pause menu and
// automatically after every mission passed.
const KEY = 'sunreach-bay-save-v1';

export function createSave(game) {
  const save = {};

  save.exists = () => {
    try { return !!localStorage.getItem(KEY); } catch { return false; }
  };

  save.peek = () => {
    try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
  };

  save.write = (auto = false) => {
    const p = game.player;
    const data = {
      v: 1,
      at: Date.now(),
      money: game.money,
      hp: p.hp,
      armor: p.armor,
      ammo: p.ammo,
      owned: p.owned,
      weapon: p.weapon,
      pos: p.vehicle ? [p.vehicle.x, p.vehicle.z, p.vehicle.heading] : [p.x, p.z, p.heading],
      missions: game.missions.serialize(),
      tokens: [...game.pickups.tokens],
      stats: game.stats,
      station: game.audio.station,
      radioOn: game.audio.radioOn,
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      game.hud.toast(auto ? 'Autosaved' : 'Game saved', 1.6);
      return true;
    } catch {
      game.hud.toast('Could not save (storage blocked)', 2);
      return false;
    }
  };

  /** Applies a save to the running game; returns false when there is none. */
  save.load = () => {
    const d = save.peek();
    if (!d || d.v !== 1) return false;
    const p = game.player;
    game.money = d.money ?? 0;
    p.hp = d.hp > 0 ? d.hp : 100; // never wake up from a save already down
    p.armor = d.armor ?? 0;
    p.ammo = { pistol: 0, smg: 0, ...d.ammo };
    p.owned = { fists: true, pistol: false, smg: false, ...d.owned };
    p.weapon = p.owned[d.weapon] ? d.weapon : 'fists';
    p.dead = false;
    game.stats = { missions: 0, kills: 0, cars: 0, distance: 0, ...d.stats };
    game.pickups.tokens = new Set(d.tokens || []);
    game.pickups.placeTokens();
    game.missions.load(d.missions || {});
    if (Number.isInteger(d.station)) game.audio.station = d.station;
    if (typeof d.radioOn === 'boolean') game.audio.radioOn = d.radioOn;
    const [x, z, h] = d.pos || [0, 0, 0];
    game.respawnAt(x, z, h);
    return true;
  };

  return save;
}
