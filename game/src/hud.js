// The heads-up display: money ticking up, wanted stars (flashing while the police search), weapon
// and ammo, health and armour bars under the minimap, district and street name, speedometer and
// radio station in a car, the mission objective and timer, toasts, big banners, dialogue subtitles,
// context prompts and a red vignette when hurt.
import { WEAPONS } from './config.js';
import { DISTRICTS, districtAt } from './city.js';
import { streetName } from './roads.js';

const $ = (id) => document.getElementById(id);

export function createHud(game) {
  const el = {
    hud: $('hud'), money: $('money'), stars: $('stars'), weapon: $('weapon'), objText: $('objtext'), timer: $('timer'), objective: $('objective'),
    hp: $('hp').firstElementChild, armor: $('armor').firstElementChild, armorBar: $('armor'), place: $('place'), speedo: $('speedo'),
    toast: $('toast'), big: $('big'), subtitle: $('subtitle'), prompt: $('prompt'), crosshair: $('crosshair'), hurt: $('hurt'), status: $('status'),
  };
  const hud = { shownMoney: 0, toastT: 0, bigT: 0, subT: 0, lastDistrict: '', lastStreet: '', placeT: 0, hurtT: 0, promptText: '' };

  hud.show = (on) => el.hud.classList.toggle('hidden', !on);
  hud.toast = (text, dur = 2) => { el.toast.textContent = text; el.toast.style.opacity = 1; hud.toastT = dur; };
  hud.big = (text, sub = '', dur = 3, color = '#ffcf5a') => {
    el.big.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
    el.big.style.color = color;
    el.big.style.opacity = 1;
    hud.bigT = dur;
    el.status.textContent = `${text} ${sub}`;
  };
  hud.subtitle = (speaker, text, dur = 4) => {
    el.subtitle.innerHTML = speaker ? `<b>${speaker}:</b> ${text}` : text;
    el.subtitle.classList.remove('hidden');
    hud.subT = dur;
  };
  hud.objective = (text) => {
    el.objective.classList.toggle('hidden', !text);
    el.objText.textContent = text || '';
    if (text) el.status.textContent = `Objective: ${text}`;
  };
  hud.timer = (sec) => { el.timer.textContent = sec == null ? '' : `${Math.floor(sec / 60)}:${String(Math.max(0, Math.floor(sec % 60))).padStart(2, '0')}`; };
  hud.prompt = (text) => { hud.promptText = text; };
  hud.hurt = () => { hud.hurtT = 0.5; };
  hud.flashStars = () => { el.stars.style.transform = 'scale(1.35)'; setTimeout(() => { el.stars.style.transform = ''; }, 250); };

  let starsKey = '';
  hud.update = (dt) => {
    const p = game.player;
    const police = game.police;
    // Money counts toward the real total.
    const diff = game.money - hud.shownMoney;
    hud.shownMoney += Math.abs(diff) < 2 ? diff : diff * Math.min(1, dt * 6);
    el.money.textContent = `$${Math.round(hud.shownMoney).toLocaleString('en-US')}`;

    const key = `${police.stars}:${police.flash}`;
    if (key !== starsKey) {
      starsKey = key;
      let html = '';
      for (let i = 0; i < 5; i += 1) html += `<span class="${i < police.stars ? 'on' : 'off'}">★</span>`;
      el.stars.innerHTML = html;
      el.stars.classList.toggle('flash', police.flash && police.stars > 0);
    }
    const w = WEAPONS[p.weapon];
    el.weapon.textContent = p.weapon === 'fists' ? '✊ Fists' : `${w.name}  ${p.ammo[p.weapon]}`;
    el.hp.style.width = `${Math.max(0, p.hp)}%`;
    el.armor.style.width = `${p.armor}%`;
    el.armorBar.style.visibility = p.armor > 0 ? 'visible' : 'hidden';

    const district = DISTRICTS[districtAt(p.x, p.z)];
    const street = streetName(p.x, p.z);
    if (district.name !== hud.lastDistrict) { hud.lastDistrict = district.name; hud.placeT = 5; el.place.firstElementChild.style.color = district.color; }
    if (street !== hud.lastStreet) { hud.lastStreet = street; hud.placeT = Math.max(hud.placeT, 3); }
    hud.placeT -= dt;
    el.place.firstElementChild.textContent = district.name;
    el.place.lastElementChild.textContent = street;
    el.place.style.opacity = hud.placeT > 0 || p.vehicle ? 1 : 0.55;

    if (p.vehicle) {
      el.speedo.classList.remove('hidden');
      el.speedo.querySelector('.n').textContent = Math.round(Math.abs(p.vehicle.speed) * 3.6);
      el.speedo.querySelector('.car').textContent = `${p.vehicle.spec.name} · ${game.audio.stationName()}`;
    } else el.speedo.classList.add('hidden');

    el.crosshair.classList.toggle('hidden', !(p.aiming || (p.vehicle && p.weapon !== 'fists' && game.input.rightDown)));
    el.prompt.classList.toggle('hidden', !hud.promptText);
    if (hud.promptText) el.prompt.innerHTML = hud.promptText;
    hud.promptText = '';

    if (hud.toastT > 0) { hud.toastT -= dt; if (hud.toastT <= 0) el.toast.style.opacity = 0; }
    if (hud.bigT > 0) { hud.bigT -= dt; if (hud.bigT <= 0) el.big.style.opacity = 0; }
    if (hud.subT > 0) { hud.subT -= dt; if (hud.subT <= 0) el.subtitle.classList.add('hidden'); }
    hud.hurtT = Math.max(0, hud.hurtT - dt);
    const low = p.hp < 30 ? 0.35 + 0.15 * Math.sin(game.time * 6) : 0;
    el.hurt.style.boxShadow = `inset 0 0 160px rgba(255,0,40,${Math.max(hud.hurtT * 1.1, low).toFixed(2)})`;
  };
  return hud;
}
