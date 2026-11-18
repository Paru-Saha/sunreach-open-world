// Every sound is synthesised here with WebAudio: the car engine (rpm through gears), sirens,
// the helicopter rotor, gunshots, punches, crashes, explosions, pickups and stingers, and two
// generative in-car radio stations, Sunreach FM (synthwave) and Coral Waves (late-sun chill).
const STATIONS = [
  { name: 'Sunreach FM', bpm: 104, root: 45, prog: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]], arp: [0, 7, 12, 7, 3, 7, 12, 15], wave: 'sawtooth' },
  { name: 'Coral Waves', bpm: 84, root: 50, prog: [[0, 4, 7, 11], [5, 9, 12, 16], [2, 5, 9, 12], [7, 11, 14, 17]], arp: [0, 4, 7, 11, 7, 4, 12, 7], wave: 'triangle' },
];
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

export function createAudio(game) {
  const a = { ctx: null, station: 0, radioOn: true, muted: false };
  let master;
  let sfx;
  let music;
  let noiseBuf;
  let engine;
  let siren;
  let rotor;
  let nextNote = 0;
  let step = 0;
  let schedTimer = null;

  a.unlock = () => {
    if (a.ctx) { if (a.ctx.state === 'suspended') a.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    a.ctx = ctx;
    master = ctx.createGain();
    master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(ctx.destination);
    sfx = ctx.createGain();
    sfx.gain.value = 0.9;
    sfx.connect(master);
    music = ctx.createGain();
    music.gain.value = 0.28;
    music.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;

    // Engine: two detuned oscillators through a low-pass.
    const e1 = ctx.createOscillator();
    const e2 = ctx.createOscillator();
    e1.type = 'sawtooth';
    e2.type = 'square';
    const ef = ctx.createBiquadFilter();
    ef.type = 'lowpass';
    ef.frequency.value = 600;
    const eg = ctx.createGain();
    eg.gain.value = 0;
    e1.connect(ef); e2.connect(ef); ef.connect(eg); eg.connect(sfx);
    e1.start(); e2.start();
    engine = { e1, e2, ef, eg };

    const s1 = ctx.createOscillator();
    s1.type = 'square';
    const sf = ctx.createBiquadFilter();
    sf.type = 'bandpass';
    sf.frequency.value = 900;
    const sg = ctx.createGain();
    sg.gain.value = 0;
    s1.connect(sf); sf.connect(sg); sg.connect(sfx);
    s1.start();
    siren = { s1, sg };

    const rn = ctx.createBufferSource();
    rn.buffer = noiseBuf;
    rn.loop = true;
    const rf = ctx.createBiquadFilter();
    rf.type = 'lowpass';
    rf.frequency.value = 220;
    const rg = ctx.createGain();
    rg.gain.value = 0;
    rn.connect(rf); rf.connect(rg); rg.connect(sfx);
    rn.start();
    rotor = { rg, level: 0 };

    nextNote = ctx.currentTime + 0.1;
    schedTimer = setInterval(schedule, 25);
  };

  function vol(x, z) {
    if (x === undefined) return 1;
    const p = game.player;
    return 1 / (1 + Math.hypot(x - p.x, z - p.z) / 18);
  }

  function tone(freq, dur, type = 'sine', v = 0.3, slide = 0, when = 0, dest = sfx) {
    if (!a.ctx) return;
    const t = a.ctx.currentTime + when;
    const o = a.ctx.createOscillator();
    const g = a.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function noise(dur, v, freq, type = 'lowpass', when = 0, dest = sfx, q = 0.8) {
    if (!a.ctx) return;
    const t = a.ctx.currentTime + when;
    const src = a.ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = a.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = a.ctx.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }

  a.gunshot = (smg, x, z) => { const k = vol(x, z); noise(smg ? 0.12 : 0.22, 0.9 * k, smg ? 2600 : 1800); tone(smg ? 160 : 120, 0.12, 'square', 0.25 * k, 50); };
  a.punch = (x, z) => { const k = vol(x, z); noise(0.08, 0.6 * k, 500); tone(90, 0.1, 'sine', 0.5 * k, 50); };
  a.swing = () => noise(0.1, 0.15, 1200, 'bandpass');
  a.thud = (x, z) => { const k = vol(x, z); tone(70, 0.25, 'sine', 0.6 * k, 40); noise(0.15, 0.4 * k, 300); };
  a.crash = (k, x, z) => { const v = vol(x, z) * (0.3 + k * 0.7); noise(0.4, v, 900); tone(60, 0.3, 'triangle', v * 0.6, 30); noise(0.25, v * 0.4, 4000, 'highpass', 0.05); };
  a.explosion = (x, z) => { const v = vol(x, z); noise(1.6, 1.2 * v, 400); tone(50, 1.2, 'sine', 0.9 * v, 25); };
  a.splash = () => { noise(0.8, 0.5, 1500, 'bandpass'); };
  a.door = () => { tone(180, 0.08, 'square', 0.15, 90); noise(0.06, 0.2, 700); };
  a.click = () => tone(1200, 0.03, 'square', 0.08);
  a.horn = (x, z) => { const k = vol(x, z); tone(392, 0.35, 'square', 0.12 * k); tone(494, 0.35, 'square', 0.1 * k); };
  a.groan = (x, z) => tone(220, 0.35, 'sawtooth', 0.08 * vol(x, z), 110);
  a.down = () => { tone(330, 0.9, 'sawtooth', 0.25, 80); };
  a.alert = () => { tone(880, 0.12, 'square', 0.12); tone(660, 0.18, 'square', 0.12, 0, 0.12); };
  a.cash = () => { tone(1320, 0.08, 'square', 0.12); tone(1760, 0.14, 'square', 0.12, 0, 0.07); };
  a.pickup = () => { tone(660, 0.1, 'triangle', 0.25); tone(990, 0.16, 'triangle', 0.25, 0, 0.08); };
  a.token = () => { [0, 4, 7, 12].forEach((n, i) => tone(midi(76 + n), 0.25, 'triangle', 0.2, 0, i * 0.07)); };
  a.missionStart = () => { [0, 7, 12].forEach((n, i) => tone(midi(62 + n), 0.3, 'sawtooth', 0.12, 0, i * 0.12)); };
  a.missionPass = () => { [0, 4, 7, 12, 16].forEach((n, i) => tone(midi(67 + n), 0.5, 'square', 0.12, 0, i * 0.1)); };
  a.missionFail = () => { [7, 3, 0].forEach((n, i) => tone(midi(55 + n), 0.4, 'sawtooth', 0.14, 0, i * 0.18)); };
  a.blip = () => tone(990, 0.05, 'sine', 0.1);

  /** Called every frame: engine, siren and rotor loops follow the game. */
  a.update = (dt) => {
    if (!a.ctx) return;
    const t = a.ctx.currentTime;
    const p = game.player;
    const v = p.vehicle;
    if (v && game.state === 'play') {
      const sp = Math.abs(v.speed);
      const gear = Math.min(4, Math.floor(sp / 11));
      const frac = (sp - gear * 11) / 11;
      const f = 48 + gear * 8 + frac * 70 * (1 + Math.abs(v.ctrl.throttle) * 0.25);
      engine.e1.frequency.setTargetAtTime(f, t, 0.05);
      engine.e2.frequency.setTargetAtTime(f * 0.501, t, 0.05);
      engine.ef.frequency.setTargetAtTime(400 + sp * 25 + Math.abs(v.ctrl.throttle) * 500, t, 0.08);
      engine.eg.gain.setTargetAtTime(0.09 + Math.abs(v.ctrl.throttle) * 0.06, t, 0.1);
    } else engine.eg.gain.setTargetAtTime(0, t, 0.1);

    let best = Infinity;
    if (game.state === 'play') for (const c of game.vehicles) if (c.siren && !c.destroyed) best = Math.min(best, Math.hypot(c.x - p.x, c.z - p.z));
    const wail = 700 + 260 * Math.sin(game.time * 3.2);
    siren.s1.frequency.setTargetAtTime(wail, t, 0.02);
    siren.sg.gain.setTargetAtTime(best < Infinity ? 0.08 / (1 + best / 30) : 0, t, 0.1);
    rotor.rg.gain.setTargetAtTime(rotor.level, t, 0.2);
    rotor.level = 0;
    const radio = a.radioOn && (game.state === 'title' || (v && game.state === 'play'));
    music.gain.setTargetAtTime(radio && !a.muted ? (game.state === 'title' ? 0.32 : 0.24) : 0, t, 0.3);
    master.gain.setTargetAtTime(a.muted ? 0 : 0.8, t, 0.05);
  };
  a.rotor = (dist) => { if (!rotor) return; rotor.level =0.4 / (1 + dist / 25) * (0.7 + 0.3 * Math.sin(game.time * 70)); };

  a.nextStation = () => {
    if (!a.radioOn) { a.radioOn = true; a.station = 0; } else if (a.station < STATIONS.length - 1) a.station += 1; else a.radioOn = false;
    return a.radioOn ? STATIONS[a.station].name : 'Radio off';
  };
  a.stationName = () => (a.radioOn ? STATIONS[a.station].name : 'Radio off');

  // Music sequencer: looks ahead 120 ms and schedules sixteenth notes.
  function schedule() {
    const ctx = a.ctx;
    if (!ctx) return;
    const st = STATIONS[a.station];
    const sixteenth = 60 / st.bpm / 4;
    while (nextNote < ctx.currentTime + 0.12) {
      const bar = Math.floor(step / 16) % st.prog.length;
      const s = step % 16;
      const chord = st.prog[bar];
      const when = nextNote - ctx.currentTime;
      if (s % 4 === 0) { tone(55, 0.25, 'sine', 0.55, 30, when, music); }
      if (s % 8 === 4) noise(0.18, 0.25, 1800, 'bandpass', when, music, 0.6);
      if (s % 2 === 1) noise(0.04, 0.08, 7000, 'highpass', when, music);
      if (s % 2 === 0) tone(midi(st.root - 12 + chord[0]), sixteenth * 1.8, 'sawtooth', 0.12, 0, when, music);
      const arpNote = st.root + 12 + chord[0] + st.arp[s % st.arp.length];
      if (st.wave === 'sawtooth' || s % 2 === 0) tone(midi(arpNote), sixteenth * 1.5, st.wave === 'sawtooth' ? 'square' : 'triangle', 0.05, 0, when, music);
      if (s === 0) for (const n of chord) tone(midi(st.root + 12 + n), sixteenth * 15, st.wave, 0.035, 0, when, music);
      nextNote += sixteenth;
      step += 1;
    }
  }

  a.stop = () => { if (schedTimer) clearInterval(schedTimer); };
  return a;
}
