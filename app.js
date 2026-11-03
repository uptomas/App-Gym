'use strict';
/* =========================================================
   IRON SYSTEM — registo de treinos gamificado
   Dados guardados em localStorage (apenas neste dispositivo).
   ========================================================= */

/* ---------- utilitários ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const fmt = (n, d = 1) => Number(n || 0).toLocaleString('pt-PT', { maximumFractionDigits: d });
const fmtKg = (n, d = 1) => `${fmt(n, d)} kg`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const dateObj = iso => new Date(iso + 'T12:00:00');
const fmtDate = iso => dateObj(iso).toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short' });
const fmtDateShort = iso => dateObj(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
const fmtMonth = iso => dateObj(iso).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
const daysBetween = (a, b) => Math.round((dateObj(b) - dateObj(a)) / 86400000);
const e1rm = (load, reps) => reps <= 1 ? load : load * (1 + reps / 30); // fórmula de Epley

/* ---------- ranks (estilo liga competitiva) ---------- */
const TIERS = [
  { key: 'bronze', name: 'Bronze', c1: '#ffbf8a', c2: '#6e3416', glow: '#ff8f45' },
  { key: 'silver', name: 'Prata', c1: '#ffffff', c2: '#5d6a85', glow: '#c9dcff' },
  { key: 'gold', name: 'Ouro', c1: '#fff1a6', c2: '#a1630a', glow: '#ffc531' },
  { key: 'plat', name: 'Platina', c1: '#c9fff6', c2: '#127481', glow: '#3ff0d6' },
  { key: 'diamond', name: 'Diamante', c1: '#cfe9ff', c2: '#1739b8', glow: '#3d9bff' },
  { key: 'champ', name: 'Campeão', c1: '#f0d4ff', c2: '#4b1596', glow: '#b45cff' },
  { key: 'gc', name: 'Grande Campeão', c1: '#ffc4cf', c2: '#8a0a27', glow: '#ff3b5c' },
  { key: 'legend', name: 'Lenda', c1: '#ffffff', c2: '#2a1cff', glow: '#9fb8ff' },
];
const STEP = 75; // MMR por divisão
const ROMAN = ['I', 'II', 'III'];
const RANKS = [];
TIERS.forEach((t, ti) => {
  if (t.key === 'legend') RANKS.push({ tier: ti, div: 0, name: t.name, min: RANKS.length * STEP });
  else for (let d = 1; d <= 3; d++) RANKS.push({ tier: ti, div: d, name: `${t.name} ${ROMAN[d - 1]}`, min: RANKS.length * STEP });
});
const rankIdx = mmr => clamp(Math.floor(mmr / STEP), 0, RANKS.length - 1);

/* Normas de força (1RM / peso corporal) — iniciante, novato, intermédio, avançado, elite.
   Mapeamento: iniciante → Prata I, novato → Ouro I, intermédio → Platina I,
   avançado → Campeão I, elite → Grande Campeão I, elite×1.15 → Lenda. */
const ANCHOR_RANKS = [0, 3, 6, 9, 15, 18, 21];
function anchorsFor(std) { return [std[0] * 0.4, ...std, std[4] * 1.15]; }
function ratioToMMR(r, std) {
  const xs = anchorsFor(std), ys = ANCHOR_RANKS.map(i => i * STEP);
  if (r <= xs[0]) return 0;
  for (let i = 1; i < xs.length; i++) if (r <= xs[i]) return ys[i - 1] + (r - xs[i - 1]) / (xs[i] - xs[i - 1]) * (ys[i] - ys[i - 1]);
  const n = xs.length - 1, slope = (ys[n] - ys[n - 1]) / (xs[n] - xs[n - 1]);
  return ys[n] + (r - xs[n]) * slope;
}
function mmrToRatio(m, std) {
  const xs = anchorsFor(std), ys = ANCHOR_RANKS.map(i => i * STEP);
  if (m <= 0) return xs[0];
  for (let i = 1; i < ys.length; i++) if (m <= ys[i]) return xs[i - 1] + (m - ys[i - 1]) / (ys[i] - ys[i - 1]) * (xs[i] - xs[i - 1]);
  const n = xs.length - 1, slope = (xs[n] - xs[n - 1]) / (ys[n] - ys[n - 1]);
  return xs[n] + (m - ys[n]) * slope;
}

/* ---------- biblioteca de exercícios ---------- */
const GROUPS = ['Peito', 'Costas', 'Pernas', 'Ombros', 'Braços', 'Core', 'Outros'];
const LIB = [
  ['supino', 'Supino reto (barra)', 'Peito', 'u', 0, [0.5, 0.75, 1.25, 1.75, 2.0]],
  ['supino_incl', 'Supino inclinado (barra)', 'Peito', 'u', 0, [0.4, 0.65, 1.0, 1.4, 1.7]],
  ['supino_halt', 'Supino com halteres', 'Peito', 'u', 0, [0.2, 0.35, 0.5, 0.7, 0.9], 1],
  ['supino_incl_halt', 'Supino inclinado halteres', 'Peito', 'u', 0, [0.17, 0.3, 0.45, 0.62, 0.8], 1],
  ['peck_deck', 'Peck deck / Crucifixo máquina', 'Peito', 'u', 0, [0.3, 0.55, 0.85, 1.2, 1.5]],
  ['dips', 'Paralelas (dips)', 'Peito', 'u', 1, [1.0, 1.2, 1.5, 1.8, 2.1]],
  ['peso_morto', 'Peso morto', 'Costas', 'l', 0, [1.0, 1.5, 2.0, 2.5, 3.0]],
  ['remada_barra', 'Remada com barra', 'Costas', 'u', 0, [0.5, 0.75, 1.0, 1.5, 1.75]],
  ['remada_halt', 'Remada unilateral halter', 'Costas', 'u', 0, [0.25, 0.4, 0.6, 0.85, 1.1], 1],
  ['elevacoes', 'Elevações (pull-up)', 'Costas', 'u', 1, [1.0, 1.15, 1.35, 1.65, 1.9]],
  ['puxada', 'Puxada frontal', 'Costas', 'u', 0, [0.5, 0.75, 1.0, 1.3, 1.6]],
  ['remada_polia', 'Remada sentada (polia)', 'Costas', 'u', 0, [0.5, 0.75, 1.0, 1.4, 1.75]],
  ['agachamento', 'Agachamento (barra)', 'Pernas', 'l', 0, [0.75, 1.25, 1.5, 2.25, 2.75]],
  ['agach_frontal', 'Agachamento frontal', 'Pernas', 'l', 0, [0.6, 1.0, 1.25, 1.75, 2.2]],
  ['leg_press', 'Leg press', 'Pernas', 'l', 0, [1.5, 2.25, 3.25, 4.5, 5.5]],
  ['rdl', 'Peso morto romeno', 'Pernas', 'l', 0, [0.6, 1.0, 1.4, 1.9, 2.4]],
  ['hip_thrust', 'Hip thrust', 'Pernas', 'l', 0, [0.75, 1.25, 2.0, 2.75, 3.5]],
  ['afundos', 'Afundos / Búlgaro', 'Pernas', 'l', 0, [0.3, 0.6, 0.9, 1.3, 1.7]],
  ['leg_ext', 'Extensão de pernas', 'Pernas', 'l', 0, [0.5, 0.8, 1.15, 1.6, 2.0]],
  ['leg_curl', 'Curl femoral', 'Pernas', 'l', 0, [0.4, 0.6, 0.9, 1.2, 1.5]],
  ['gemeos', 'Gémeos (máquina)', 'Pernas', 'l', 0, [0.75, 1.25, 1.75, 2.5, 3.25]],
  ['press_militar', 'Press militar (barra)', 'Ombros', 'u', 0, [0.35, 0.55, 0.8, 1.05, 1.35]],
  ['press_halt', 'Press de ombros halteres', 'Ombros', 'u', 0, [0.15, 0.25, 0.38, 0.52, 0.68], 1],
  ['elev_lateral', 'Elevação lateral', 'Ombros', 'u', 0, [0.05, 0.1, 0.17, 0.25, 0.33], 1],
  ['face_pull', 'Face pull', 'Ombros', 'u', 0, [0.2, 0.35, 0.5, 0.7, 0.9]],
  ['curl_barra', 'Curl com barra', 'Braços', 'u', 0, [0.2, 0.4, 0.6, 0.85, 1.1]],
  ['curl_halt', 'Curl com halteres', 'Braços', 'u', 0, [0.1, 0.2, 0.3, 0.45, 0.6], 1],
  ['triceps_polia', 'Extensão tríceps (polia)', 'Braços', 'u', 0, [0.25, 0.4, 0.6, 0.85, 1.1]],
  ['triceps_frances', 'Tríceps francês', 'Braços', 'u', 0, [0.15, 0.3, 0.5, 0.7, 0.9]],
  ['abd_polia', 'Abdominal na polia', 'Core', 'u', 0, [0.3, 0.5, 0.75, 1.0, 1.3]],
].map(([id, name, group, reg, bw, std, ph]) => ({ id, name, group, region: reg === 'l' ? 'lower' : 'upper', bw: !!bw, std, perHand: !!ph }));
const LIB_MAP = Object.fromEntries(LIB.map(e => [e.id, e]));

/* músculos (estilo mapa muscular) — main: conta para o rank geral */
const MUSCLES = [
  { key: 'chest', name: 'Peito', main: 1 }, { key: 'back', name: 'Costas', main: 1 }, { key: 'shoulders', name: 'Ombros', main: 1 },
  { key: 'biceps', name: 'Bíceps', main: 1 }, { key: 'triceps', name: 'Tríceps', main: 1 }, { key: 'quads', name: 'Quadríceps', main: 1 },
  { key: 'hamstrings', name: 'Posteriores', main: 1 }, { key: 'glutes', name: 'Glúteos', main: 1 },
  { key: 'calves', name: 'Gémeos', main: 0 }, { key: 'abs', name: 'Abdominais', main: 0 },
];
const MUSCLE_OF = {
  supino: ['chest'], supino_incl: ['chest'], supino_halt: ['chest'], supino_incl_halt: ['chest'], peck_deck: ['chest'], dips: ['chest', 'triceps'],
  peso_morto: ['back', 'hamstrings', 'glutes'], remada_barra: ['back'], remada_halt: ['back'], elevacoes: ['back', 'biceps'], puxada: ['back'], remada_polia: ['back'],
  agachamento: ['quads', 'glutes'], agach_frontal: ['quads'], leg_press: ['quads'], rdl: ['hamstrings', 'glutes'], hip_thrust: ['glutes'], afundos: ['quads', 'glutes'],
  leg_ext: ['quads'], leg_curl: ['hamstrings'], gemeos: ['calves'],
  press_militar: ['shoulders'], press_halt: ['shoulders'], elev_lateral: ['shoulders'], face_pull: ['shoulders'],
  curl_barra: ['biceps'], curl_halt: ['biceps'], triceps_polia: ['triceps'], triceps_frances: ['triceps'], abd_polia: ['abs'],
};

function getEx(id) { return LIB_MAP[id] || state.custom.find(c => c.id === id); }
function stdFor(def, sex) {
  if (!def.std) return null;
  if (sex !== 'f') return def.std;
  if (def.bw) return def.std.map(x => 1 + (x - 1) * 0.6 - 0.1);
  const f = def.region === 'lower' ? 0.7 : 0.6;
  return def.std.map(x => x * f);
}

/* ---------- estado ---------- */
const LS_KEY = 'ironsystem.v1';
function defaultState() {
  return { profile: { name: 'Caçador', bw: 75, sex: 'm', rest: 90 }, workouts: [], custom: [], tab: 'status' };
}
function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultState();
    const s = JSON.parse(raw);
    return { ...defaultState(), ...s, profile: { ...defaultState().profile, ...(s.profile || {}) } };
  } catch { return defaultState(); }
}
function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch { toast('Não foi possível guardar no dispositivo', 'bad'); } }
let state = load();

/* ---------- motor: recordes, XP, ranking ---------- */
function levelFromXP(xp) {
  let lvl = 1, need = 260, acc = 0;
  while (xp >= acc + need) { acc += need; lvl++; need = Math.round(200 + lvl * 60); }
  return { lvl, cur: xp - acc, need, total: xp };
}
const TITLES = [[1, 'Recruta'], [5, 'Despertado'], [10, 'Caçador'], [20, 'Caçador de Elite'], [30, 'Mestre de Masmorra'], [45, 'Soberano'], [60, 'Monarca do Ferro']];
const titleFor = lvl => TITLES.filter(t => lvl >= t[0]).pop()[1];

function weekKey(iso) {
  const d = dateObj(iso); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

function compute(st = state, excludeId = null) {
  const ws = st.workouts.filter(w => w.id !== excludeId)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0));
  const ex = {};
  const prFlags = {}; // `${wid}:${ei}:${si}` -> {w,v}
  const prList = [];
  const perWorkout = {};
  let xp = 0, totalVol = 0, totalSets = 0, totalReps = 0;

  for (const w of ws) {
    const bw = num(w.bw) || num(st.profile.bw) || 75;
    let wVol = 0, wPr = 0;
    w.exercises.forEach((e, ei) => {
      const def = getEx(e.exId); if (!def) return;
      let topW = null, topV = null, topE = 0;
      e.sets.forEach((set, si) => {
        const wt = num(set.w), r = Math.round(num(set.r)); if (r <= 0) return;
        const load = def.bw ? bw + wt : wt;
        const vol = load * r;
        wVol += vol; totalSets++; totalReps += r;
        if (!topW || wt > topW.w || (wt === topW.w && r > topW.r)) topW = { w: wt, r, si };
        if (!topV || vol > topV.v) topV = { v: vol, w: wt, r, si };
        topE = Math.max(topE, e1rm(load, r));
      });
      if (!topW) return;
      const s = ex[e.exId] ||= { id: e.exId, bestW: null, bestVol: null, bestE1: 0, bestMMR: null, bestRatio: 0, sessions: 0, hist: [], last: null, prs: 0 };
      if (s.sessions > 0) {
        const key = si => `${w.id}:${ei}:${si}`;
        if (topW.w > s.bestW.w) {
          (prFlags[key(topW.si)] ||= {}).w = true; wPr++; s.prs++;
          prList.push({ wid: w.id, date: w.date, exId: e.exId, type: 'w', w: topW.w, r: topW.r, prev: s.bestW.w });
        }
        if (topV.v > s.bestVol.v) {
          (prFlags[key(topV.si)] ||= {}).v = true; wPr++; s.prs++;
          prList.push({ wid: w.id, date: w.date, exId: e.exId, type: 'v', w: topV.w, r: topV.r, v: topV.v, prev: s.bestVol.v });
        }
      }
      if (!s.bestW || topW.w > s.bestW.w || (topW.w === s.bestW.w && topW.r > s.bestW.r)) s.bestW = { w: topW.w, r: topW.r, date: w.date };
      if (!s.bestVol || topV.v > s.bestVol.v) s.bestVol = { v: topV.v, w: topV.w, r: topV.r, date: w.date };
      if (topE > s.bestE1) s.bestE1 = topE;
      const std = stdFor(def, st.profile.sex);
      if (std) {
        const ratio = topE / bw, m = ratioToMMR(ratio, std);
        if (s.bestMMR === null || m > s.bestMMR) { s.bestMMR = m; s.bestRatio = ratio; }
      }
      s.sessions++;
      s.hist.push({ date: w.date, e1: topE, w: topW.w, v: topV.v, wid: w.id });
      s.last = { date: w.date, sets: e.sets };
    });
    const wxp = 30 + Math.round(wVol / 100) + wPr * 50;
    xp += wxp; totalVol += wVol;
    perWorkout[w.id] = { vol: wVol, xp: wxp, prs: wPr };
  }

  const ranked = Object.values(ex).filter(s => s.bestMMR !== null).sort((a, b) => b.bestMMR - a.bestMMR);
  // rank por músculo = melhor exercício que trabalha esse músculo
  const muscles = Object.fromEntries(MUSCLES.map(m => [m.key, { ...m, mmr: null, best: null }]));
  for (const s of ranked) for (const mk of (MUSCLE_OF[s.id] || [])) {
    const m = muscles[mk];
    if (m.mmr === null || s.bestMMR > m.mmr) { m.mmr = s.bestMMR; m.best = s.id; }
  }
  // rank geral = média dos 8 músculos principais (os que não treinas contam como 0 → premeia o equilíbrio)
  const mainM = MUSCLES.filter(m => m.main).map(m => muscles[m.key]);
  const musclesRanked = mainM.filter(m => m.mmr !== null).length;
  const mmr = ranked.length ? mainM.reduce((a, m) => a + (m.mmr || 0), 0) / mainM.length : 0;

  const weeks = new Set(ws.map(w => weekKey(w.date)));
  let streak = 0; const cur = new Date(weekKey(todayISO()) + 'T12:00:00');
  if (!weeks.has(cur.toISOString().slice(0, 10))) cur.setDate(cur.getDate() - 7);
  while (weeks.has(cur.toISOString().slice(0, 10))) { streak++; cur.setDate(cur.getDate() - 7); }
  const t = todayISO();
  const last30 = ws.filter(w => daysBetween(w.date, t) >= 0 && daysBetween(w.date, t) < 30).length;
  const thisWeek = ws.filter(w => weekKey(w.date) === weekKey(t)).length;
  const lv = levelFromXP(xp);

  return {
    ex, prFlags, prList, perWorkout, xp, level: lv, totalVol, totalSets, totalReps,
    ranked, muscles, musclesRanked, mmr, rank: rankIdx(mmr), placement: musclesRanked < 4, streak, last30, thisWeek,
    trainedToday: ws.some(w => w.date === t), count: ws.length,
    stats: {
      FOR: 10 + Math.round(mmr / 8),
      VIT: 10 + ws.length * 2,
      RES: 10 + Math.round(totalReps / 40),
      DIS: 10 + streak * 5 + last30 * 2,
    },
  };
}

/* ---------- emblemas SVG ---------- */
let gid = 0;
function emblem(idx, size = 64, cls = '') {
  const id = 'em' + (gid++);
  if (idx === null || idx === undefined) {
    return `<svg class="emblem unranked ${cls}" width="${size}" height="${size}" viewBox="0 0 100 100">
      <polygon points="50,12 82,30 82,70 50,88 18,70 18,30" fill="#0b1630" stroke="#3a5687" stroke-width="2" stroke-dasharray="5 4"/>
      <text x="50" y="62" text-anchor="middle" font-family="Orbitron" font-weight="900" font-size="30" fill="#3a5687">?</text></svg>`;
  }
  const r = RANKS[idx], t = TIERS[r.tier], ti = r.tier;
  const A = `url(#${id}a)`;
  let s = `<svg class="emblem tier-${t.key} ${cls}" width="${size}" height="${size}" viewBox="0 0 100 100" style="--glow:${t.glow}">
  <defs>
    <linearGradient id="${id}a" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="${t.c1}"/><stop offset="1" stop-color="${t.c2}"/></linearGradient>
    <linearGradient id="${id}b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".55" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <radialGradient id="${id}c"><stop offset="0" stop-color="${t.glow}" stop-opacity=".9"/><stop offset="1" stop-color="${t.glow}" stop-opacity="0"/></radialGradient>
  </defs>`;
  if (ti === 7) {
    s += `<g class="rays">${Array.from({ length: 12 }, (_, i) => `<polygon points="50,50 47,2 53,2" fill="${i % 2 ? '#7f8cff' : '#ffffff'}" opacity=".55" transform="rotate(${i * 30} 50 50)"/>`).join('')}</g>`;
  }
  s += `<circle cx="50" cy="50" r="40" fill="url(#${id}c)" opacity="${0.18 + ti * 0.05}"/>`;
  if (ti >= 4) {
    const big = ti >= 5;
    s += `<path d="M22 38 L${big ? 0 : 4} ${big ? 22 : 28} L${big ? 8 : 10} 44 L${big ? -2 : 2} 48 L12 58 L${big ? 4 : 8} ${big ? 72 : 68} L24 64 Z" fill="${A}" stroke="${t.c1}" stroke-width="1" opacity=".9"/>
          <path d="M78 38 L${big ? 100 : 96} ${big ? 22 : 28} L${big ? 92 : 90} 44 L${big ? 102 : 98} 48 L88 58 L${big ? 96 : 92} ${big ? 72 : 68} L76 64 Z" fill="${A}" stroke="${t.c1}" stroke-width="1" opacity=".9"/>`;
  }
  if (ti >= 6) s += `<path d="M30 22 L35 4 L43 15 L50 -2 L57 15 L65 4 L70 22 Z" fill="${A}" stroke="${t.c1}" stroke-width="1"/>`;
  else if (ti >= 2) s += `<path d="M50 1 L57 17 L43 17 Z" fill="${A}" stroke="${t.c1}" stroke-width="1"/>`;
  if (ti >= 2) s += `<path d="M50 99 L57 83 L43 83 Z" fill="${A}" stroke="${t.c1}" stroke-width="1"/>`;
  if (ti >= 3) s += `<path d="M10 50 L21 39 L21 61 Z M90 50 L79 39 L79 61 Z" fill="${A}" stroke="${t.c1}" stroke-width="1"/>`;
  s += `<polygon points="50,12 82,30 82,70 50,88 18,70 18,30" fill="${A}" stroke="${t.c1}" stroke-width="2.5"/>
        <polygon points="50,22 73,35 73,65 50,78 27,65 27,35" fill="rgba(0,0,0,.28)" stroke="rgba(255,255,255,.45)" stroke-width="1.2"/>
        <polygon points="50,12 82,30 50,48 18,30" fill="url(#${id}b)" opacity=".55"/>`;
  if (ti >= 1) s += `<polygon points="50,26 69,37 69,63 50,74 31,63 31,37" fill="none" stroke="${t.c1}" stroke-opacity=".5" stroke-width=".8"/>`;
  if (r.div === 0) {
    s += `<polygon points="50,30 55,44 70,44 58,53 62,68 50,59 38,68 42,53 30,44 45,44" fill="#fff" stroke="${t.c2}" stroke-width="1.2"/>`;
  } else {
    const ys = { 1: [58], 2: [52, 62], 3: [46, 56, 66] }[r.div];
    s += ys.map(y => `<path d="M37 ${y} L50 ${y - 9} L63 ${y}" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  }
  return s + '</svg>';
}

/* ---------- mapa muscular (frente + costas) ---------- */
const BODY_COMMON = [
  [null, [[92, 54], [108, 54], [110, 70], [90, 70]], 1],
  [null, [[49, 142], [64, 144], [60, 188], [48, 186], [44, 164]]],
  [null, [[46, 190], [60, 190], [58, 206], [48, 206]]],
  [null, [[84, 270], [96, 264], [95, 282], [77, 282]]],
  [null, [[79, 350], [92, 350], [95, 364], [75, 364]]],
  ['shoulders', [[60, 74], [78, 66], [80, 84], [68, 100], [54, 94]]],
];
const BODY_FRONT = [
  [null, [[76, 160], [100, 182], [124, 160], [126, 186], [100, 194], [74, 186]], 1],
  [null, [[73, 106], [85, 113], [87, 168], [77, 160], [72, 132]]],
  ['chest', [[81, 72], [98, 75], [98, 108], [84, 111], [71, 102], [76, 86]]],
  ['biceps', [[54, 98], [67, 104], [65, 140], [52, 138], [49, 118]]],
  ['abs', [[87, 114], [113, 114], [112, 170], [100, 180], [88, 170]], 1],
  ['quads', [[77, 186], [98, 192], [96, 262], [85, 268], [74, 252], [71, 212]]],
  ['calves', [[77, 284], [93, 284], [90, 346], [81, 348], [75, 320]]],
];
const BODY_BACK = [
  ['back', [[84, 58], [100, 54], [116, 58], [127, 72], [112, 84], [100, 100], [88, 84], [73, 72]], 1],
  ['back', [[72, 82], [88, 88], [99, 104], [99, 140], [86, 148], [75, 122], [70, 98]]],
  ['back', [[87, 150], [100, 143], [113, 150], [111, 168], [89, 168]], 1],
  ['triceps', [[54, 98], [67, 102], [66, 138], [53, 140], [49, 118]]],
  ['glutes', [[76, 171], [99, 174], [99, 208], [85, 212], [73, 196]]],
  ['hamstrings', [[75, 214], [97, 214], [94, 266], [83, 270], [73, 246]]],
  ['calves', [[75, 284], [94, 284], [93, 326], [85, 346], [76, 326]]],
];
function bodyMap(muscles, sel) {
  const poly = (pts, dx) => pts.map(([x, y]) => `${x + dx},${y}`).join(' ');
  const mir = pts => pts.map(([x, y]) => [200 - x, y]);
  const draw = (shapes, dx) => shapes.map(([key, pts, center]) => {
    let attrs;
    if (!key) attrs = 'class="bm-n"';
    else {
      const m = muscles[key], ri = m.mmr !== null ? rankIdx(m.mmr) : null, t = ri !== null ? TIERS[RANKS[ri].tier] : null;
      attrs = `class="bm-m ${t ? 'on' : ''} ${sel === key ? 'sel' : ''}" data-muscle="${key}" style="${t ? `--f:${t.glow};--s:${t.c1}` : ''}"`;
    }
    return `<polygon ${attrs} points="${poly(pts, dx)}"/>` + (center ? '' : `<polygon ${attrs} points="${poly(mir(pts), dx)}"/>`);
  }).join('');
  return `<svg class="bodymap" viewBox="0 0 420 372" role="img" aria-label="Mapa muscular">
    <circle class="bm-n" cx="100" cy="34" r="17"/><circle class="bm-n" cx="320" cy="34" r="17"/>
    ${draw([...BODY_COMMON, ...BODY_FRONT], 0)}${draw([...BODY_COMMON, ...BODY_BACK], 220)}
    <text x="100" y="371" class="bm-lbl">FRENTE</text><text x="320" y="371" class="bm-lbl">COSTAS</text>
  </svg>`;
}

/* ---------- ícones ---------- */
const IC = {
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  bolt: '<svg viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="1"/><path d="M4 16V4h12"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
  chev: '<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>',
};
const prBadge = (type, small = false) => type === 'w'
  ? `<span class="pr pr-w${small ? ' sm' : ''}" title="Recorde de peso">▲ PR PESO</span>`
  : `<span class="pr pr-v${small ? ' sm' : ''}" title="Recorde de volume numa série">◆ PR VOLUME</span>`;

/* ---------- render ---------- */
let C = compute();
function render(anim = true) {
  C = compute();
  $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
  $('#topchip').innerHTML = `${emblem(C.count ? C.rank : null, 26)}<span>LV.<b>${C.level.lvl}</b></span>`;
  const v = $('#view');
  v.innerHTML = VIEWS[state.tab]();
  v.classList.remove('enter'); if (anim) { void v.offsetWidth; v.classList.add('enter'); }
}
function go(tab) { state.tab = tab; save(); render(); window.scrollTo({ top: 0 }); }

const VIEWS = {
  status() {
    const L = C.level, p = state.profile;
    const rk = RANKS[C.rank];
    const recent = [...C.prList].reverse().slice(0, 6);
    const pct = Math.round(L.cur / L.need * 100);
    return `
    <section class="panel status-card">
      <div class="panel-title"><span>STATUS</span></div>
      <div class="status-top">
        <div class="lvl-block">
          <div class="lvl-label">NÍVEL</div>
          <div class="lvl-num">${L.lvl}</div>
        </div>
        <div class="who">
          <div class="kv"><span>NOME</span><b>${esc(p.name)}</b></div>
          <div class="kv"><span>TÍTULO</span><b class="glowtxt">${titleFor(L.lvl)}</b></div>
          <div class="kv"><span>RANK</span><b style="color:${C.count ? TIERS[rk.tier].glow : 'var(--muted)'}">${C.count ? rk.name : 'Sem rank'}${C.placement && C.count ? ' <small>(provisório)</small>' : ''}</b></div>
          <div class="kv"><span>PESO</span><b>${fmtKg(p.bw)}</b></div>
        </div>
        <button class="status-emblem" data-go="ranking">${emblem(C.count ? C.rank : null, 84, 'float')}</button>
      </div>
      <div class="xp">
        <div class="xp-row"><span>EXP</span><span>${fmt(L.cur, 0)} / ${fmt(L.need, 0)}</span></div>
        <div class="bar"><i style="width:${pct}%"></i></div>
      </div>
      <div class="stats">
        ${Object.entries(C.stats).map(([k, val]) => `<div class="stat"><span>${{ FOR: 'FORÇA', VIT: 'VITALIDADE', RES: 'RESISTÊNCIA', DIS: 'DISCIPLINA' }[k]}</span><b>${val}</b></div>`).join('')}
      </div>
    </section>

    <section class="panel quest">
      <div class="panel-title"><span>MISSÃO DIÁRIA</span></div>
      <div class="quest-head">Missão: Ficar Mais Forte</div>
      <ul class="quest-list">
        <li class="${C.trainedToday ? 'done' : ''}"><span>Completar um treino hoje</span><b>[${C.trainedToday ? 1 : 0}/1]</b></li>
        <li class="${C.thisWeek >= 3 ? 'done' : ''}"><span>Treinos esta semana</span><b>[${Math.min(C.thisWeek, 3)}/3]</b></li>
        <li class="${C.streak >= 4 ? 'done' : ''}"><span>Semanas seguidas a treinar</span><b>[${Math.min(C.streak, 4)}/4]</b></li>
      </ul>
      ${C.trainedToday ? '<div class="quest-ok">MISSÃO DIÁRIA CONCLUÍDA</div>' : '<div class="quest-warn">⚠ Falhar a missão diária não tem penalização… desta vez.</div>'}
      <button class="btn primary wide" data-act="new">${IC.plus}<span>INICIAR TREINO</span></button>
    </section>

    <section class="grid3">
      <div class="panel mini"><span>TREINOS</span><b>${C.count}</b></div>
      <div class="panel mini"><span>VOLUME</span><b>${fmt(C.totalVol / 1000, 1)}<small>t</small></b></div>
      <div class="panel mini"><span>RECORDES</span><b class="gold">${C.prList.length}</b></div>
    </section>

    <section class="panel">
      <div class="panel-title"><span>RECORDES RECENTES</span></div>
      ${recent.length ? `<ul class="pr-feed">${recent.map(prRow).join('')}</ul>`
        : `<p class="empty">Ainda sem recordes. O Sistema marca um <b class="gold">PR</b> sempre que superas o teu melhor peso ou o teu melhor volume numa série.</p>`}
    </section>`;
  },

  treinos() {
    const ws = [...state.workouts].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
    if (!ws.length) return `
      <section class="panel center">
        <div class="panel-title"><span>REGISTO DE MASMORRAS</span></div>
        <div class="big-icon">${emblem(null, 90)}</div>
        <p class="empty">Ainda não tens treinos registados.<br>Cada treino dá EXP, cada recorde dá bónus.</p>
        <button class="btn primary wide" data-act="new">${IC.plus}<span>NOVO TREINO</span></button>
        <button class="btn ghost wide" data-act="demo">Carregar dados de exemplo</button>
      </section>`;
    let html = `<button class="btn primary wide sticky-cta" data-act="new">${IC.plus}<span>NOVO TREINO</span></button>`;
    let month = '';
    for (const w of ws) {
      const m = fmtMonth(w.date);
      if (m !== month) { month = m; html += `<h3 class="month">${esc(m)}</h3>`; }
      const pw = C.perWorkout[w.id] || { vol: 0, xp: 0, prs: 0 };
      html += `
      <article class="panel workout ${pw.prs ? 'has-pr' : ''}" data-edit="${w.id}">
        <header>
          <div>
            <div class="w-date">${fmtDate(w.date)}</div>
            <h4>${esc(w.name || 'Treino')}</h4>
          </div>
          <div class="w-xp">+${fmt(pw.xp, 0)}<small>EXP</small></div>
        </header>
        <ul class="w-ex">
          ${w.exercises.map((e, ei) => {
            const def = getEx(e.exId); if (!def) return '';
            const valid = e.sets.filter(s => num(s.r) > 0);
            const flags = valid.length ? e.sets.reduce((acc, _, si) => { const f = C.prFlags[`${w.id}:${ei}:${si}`]; if (f) { acc.w ||= f.w; acc.v ||= f.v; } return acc; }, {}) : {};
            const best = valid.reduce((a, s) => num(s.w) > num(a?.w ?? -1) ? s : a, null);
            return `<li><span class="n">${esc(def.name)}</span><span class="d">${valid.length}× ${best ? `${def.bw && !num(best.w) ? 'PC' : fmt(num(best.w)) + 'kg'}×${num(best.r)}` : '—'}</span>${flags.w ? prBadge('w', true) : ''}${flags.v ? prBadge('v', true) : ''}</li>`;
          }).join('')}
        </ul>
        <footer><span>Volume <b>${fmtKg(pw.vol, 0)}</b></span>${pw.prs ? `<span class="gold">★ ${pw.prs} recorde${pw.prs > 1 ? 's' : ''}</span>` : ''}</footer>
      </article>`;
    }
    return html;
  },

  ranking() {
    const rk = RANKS[C.rank], t = TIERS[rk.tier];
    const next = RANKS[C.rank + 1];
    const into = C.mmr - rk.min;
    const pct = next ? clamp(into / STEP * 100, 0, 100) : 100;
    const bw = num(state.profile.bw) || 75;
    const exRows = C.ranked.map((s, i) => {
      const def = getEx(s.id), std = stdFor(def, state.profile.sex);
      const ri = rankIdx(s.bestMMR), nx = RANKS[ri + 1];
      let target = '';
      if (nx) {
        const ratio = mmrToRatio(nx.min + 0.5, std);
        let need = ratio * bw; if (def.bw) need -= bw;
        target = `<div class="target">Próximo: <b style="color:${TIERS[nx.tier].glow}">${nx.name}</b> → 1RM ${def.bw ? '+' : ''}${fmtKg(Math.ceil(need * 2) / 2)}${def.perHand ? ' /halter' : ''}</div>`;
      }
      const bestFor = Object.values(C.muscles).filter(m => m.best === s.id);
      return `<li class="${bestFor.length ? 'counts' : ''}">
        ${emblem(ri, 46)}
        <div class="rx">
          <div class="rx-top"><b>${esc(def.name)}</b>${bestFor.map(m => `<span class="tag">${m.name.toUpperCase()}</span>`).join('')}</div>
          <div class="rx-sub"><span style="color:${TIERS[RANKS[ri].tier].glow}">${RANKS[ri].name}</span> · ${fmt(s.bestRatio, 2)}× PC · 1RM est. ${fmtKg(def.bw ? s.bestE1 - bw : s.bestE1)}${def.bw ? ' extra' : ''}</div>
          ${target}
        </div>
        <div class="mmr">${fmt(s.bestMMR, 0)}</div>
      </li>`;
    }).join('');
    return `
    <section class="panel rank-hero tier-bg-${t.key}" style="--glow:${C.count ? t.glow : '#3a5687'}">
      <div class="panel-title"><span>RANKING DE FORÇA</span></div>
      ${C.count && C.ranked.length && C.placement ? `<div class="placement">EM QUALIFICAÇÃO · ${C.musclesRanked}/4 músculos com rank</div>` : ''}
      <div class="hero-emblem">${emblem(C.ranked.length ? C.rank : null, 170, 'float')}</div>
      <div class="hero-name" style="color:${C.ranked.length ? t.glow : 'var(--muted)'}">${C.ranked.length ? rk.name : 'SEM RANK'}</div>
      <div class="hero-mmr"><b>${fmt(C.mmr, 0)}</b> MMR</div>
      ${C.ranked.length ? `
      <div class="div-progress">
        <div class="bar"><i style="width:${pct}%;background:linear-gradient(90deg, ${t.c2}, ${t.glow})"></i></div>
        <div class="xp-row"><span>${rk.name}</span><span>${next ? `faltam ${fmt(Math.max(1, next.min - C.mmr), 0)} MMR para ${next.name}` : 'Rank máximo'}</span></div>
      </div>` : '<p class="empty">Regista exercícios da biblioteca (supino, agachamento, peso morto…) para receberes rank.</p>'}
    </section>

    <section class="panel">
      <div class="panel-title"><span>MAPA MUSCULAR</span></div>
      ${bodyMap(C.muscles, state.selMuscle)}
      <ul class="muscle-list">${MUSCLES.map(m => {
        const mm = C.muscles[m.key], ri = mm.mmr !== null ? rankIdx(mm.mmr) : null;
        return `<li class="${state.selMuscle === m.key ? 'sel' : ''} ${ri === null ? 'off' : ''}" data-muscle="${m.key}">
          ${emblem(ri, 34)}
          <div><b>${m.name}${m.main ? '' : ' <small>extra</small>'}</b><span>${ri === null ? 'Por treinar' : `<i style="color:${TIERS[RANKS[ri].tier].glow}">${RANKS[ri].name}</i> · ${esc(getEx(mm.best).name)}`}</span></div>
        </li>`;
      }).join('')}</ul>
      ${C.ranked.length && C.musclesRanked < 8 ? `<p class="hint">⚠ ${8 - C.musclesRanked} músculo(s) principal(is) por treinar contam como 0 no rank geral. Treina o corpo todo para subir.</p>` : ''}
    </section>

    <section class="panel">
      <div class="panel-title"><span>RANK POR EXERCÍCIO</span></div>
      ${exRows ? `<ul class="rank-list">${exRows}</ul>` : '<p class="empty">Nenhum exercício com rank ainda.</p>'}
      <details class="how">
        <summary>Como funciona o ranking?</summary>
        <p>Para cada exercício o Sistema calcula o teu <b>1RM estimado</b> (fórmula de Epley) e divide pelo teu <b>peso corporal</b> nesse treino. Essa razão é comparada com normas de força (iniciante → elite) e convertida em MMR.</p>
        <p>Cada <b>músculo</b> fica com o rank do teu melhor exercício que o trabalha (ex.: o Peito usa o melhor entre supinos, peck deck e paralelas).</p><p>O teu <b>rank geral</b> é a média dos 8 músculos principais (peito, costas, ombros, bíceps, tríceps, quadríceps, posteriores e glúteos). Músculos por treinar contam como 0, por isso um físico equilibrado sobe mais. Gémeos e abdominais aparecem no mapa mas não contam. Precisas de 4 músculos com rank para saíres da qualificação.</p><p>Em exercícios de peso corporal (elevações, paralelas) conta o teu peso + carga extra.</p>
        <p>Iniciante ≈ Prata · Novato ≈ Ouro · Intermédio ≈ Platina · Avançado ≈ Campeão · Elite ≈ Grande Campeão.</p>
      </details>
    </section>

    <section class="panel">
      <div class="panel-title"><span>ESCADA DE RANKS</span></div>
      <ul class="ladder">
        ${TIERS.map((tt, ti) => {
          const idxs = RANKS.map((r, i) => ({ r, i })).filter(o => o.r.tier === ti);
          const active = C.ranked.length && RANKS[C.rank].tier === ti;
          return `<li class="${active ? 'active' : ''}" style="--glow:${tt.glow}">
            <div class="lad-emb">${idxs.map(o => emblem(o.i, ti === 7 ? 52 : 38, C.ranked.length && o.i === C.rank ? 'me' : '')).join('')}</div>
            <div class="lad-txt"><b style="color:${tt.glow}">${tt.name}</b><span>${idxs[0].r.min}${ti === 7 ? '+' : `–${idxs[idxs.length - 1].r.min + STEP - 1}`} MMR</span></div>
          </li>`;
        }).reverse().join('')}
      </ul>
    </section>`;
  },

  recordes() {
    const list = Object.values(C.ex).sort((a, b) => b.last.date.localeCompare(a.last.date));
    if (!list.length) return `<section class="panel"><div class="panel-title"><span>RECORDES</span></div><p class="empty">Regista treinos para veres os teus recordes por exercício.</p></section>`;
    const filter = state.recFilter || 'Todos';
    const groups = ['Todos', ...GROUPS.filter(g => list.some(s => getEx(s.id)?.group === g))];
    return `
      <div class="chips">${groups.map(g => `<button class="chip ${g === filter ? 'on' : ''}" data-filter="${g}">${g}</button>`).join('')}</div>
      ${list.filter(s => filter === 'Todos' || getEx(s.id)?.group === filter).map(s => {
        const def = getEx(s.id); if (!def) return '';
        const ri = s.bestMMR !== null ? rankIdx(s.bestMMR) : null;
        const lbl = w => def.bw ? (w ? `PC+${fmt(w)}kg` : 'PC') : fmtKg(w);
        return `<details class="panel rec">
          <summary>
            ${emblem(ri, 44)}
            <div class="rec-main">
              <b>${esc(def.name)}</b>
              <span>${s.sessions} sessões · último ${fmtDateShort(s.last.date)}${s.prs ? ` · <i class="gold">${s.prs} PR</i>` : ''}</span>
            </div>
            <span class="chev">${IC.chev}</span>
          </summary>
          <div class="rec-grid">
            <div class="rbox w"><span>▲ MAIOR PESO</span><b>${lbl(s.bestW.w)}</b><small>× ${s.bestW.r} reps · ${fmtDateShort(s.bestW.date)}</small></div>
            <div class="rbox v"><span>◆ MAIOR VOLUME/SÉRIE</span><b>${fmtKg(s.bestVol.v, 0)}</b><small>${lbl(s.bestVol.w)} × ${s.bestVol.r} · ${fmtDateShort(s.bestVol.date)}</small></div>
            <div class="rbox e"><span>1RM ESTIMADO</span><b>${fmtKg(s.bestE1)}</b><small>${ri !== null ? RANKS[ri].name : 'sem rank'}</small></div>
          </div>
          ${chart(s.hist)}
          <ul class="hist">${[...s.hist].reverse().slice(0, 8).map(h => `<li><span>${fmtDate(h.date)}</span><span>top ${lbl(h.w)}</span><span>vol ${fmtKg(h.v, 0)}</span><span>1RM ${fmt(h.e1, 0)}</span></li>`).join('')}</ul>
        </details>`;
      }).join('')}`;
  },

  perfil() {
    const p = state.profile;
    return `
    <section class="panel">
      <div class="panel-title"><span>PERFIL DO CAÇADOR</span></div>
      <form id="profile-form" class="form">
        <label>Nome<input name="name" value="${esc(p.name)}" maxlength="24" autocomplete="off"></label>
        <label>Peso corporal (kg)<input name="bw" value="${esc(p.bw)}" inputmode="decimal"></label>
        <label>Descanso entre séries (segundos)<input name="rest" value="${esc(p.rest || 90)}" inputmode="numeric"></label>
        <label>Normas de força
          <select name="sex"><option value="m" ${p.sex !== 'f' ? 'selected' : ''}>Masculinas</option><option value="f" ${p.sex === 'f' ? 'selected' : ''}>Femininas</option></select>
        </label>
        <p class="hint">O peso corporal é guardado em cada treino novo — atualiza-o sempre que te pesares. O ranking usa o peso que tinhas no dia de cada treino.</p>
        <button class="btn primary wide" type="submit">GUARDAR</button>
      </form>
    </section>

    <section class="panel">
      <div class="panel-title"><span>EXERCÍCIOS PERSONALIZADOS</span></div>
      ${state.custom.length ? `<ul class="custom-list">${state.custom.map(c => `<li><span>${esc(c.name)} <small>${esc(c.group)}${c.bw ? ' · peso corporal' : ''}</small></span><button class="icon-btn" data-delcustom="${c.id}" aria-label="Apagar">${IC.trash}</button></li>`).join('')}</ul>` : '<p class="empty">Cria exercícios novos diretamente ao adicionar um exercício num treino. Contam para EXP e recordes (não para o rank).</p>'}
    </section>

    <section class="panel">
      <div class="panel-title"><span>DADOS</span></div>
      <p class="hint">Os teus dados ficam guardados apenas neste dispositivo/navegador. Faz cópias de segurança.</p>
      <div class="btn-col">
        <button class="btn" data-act="export">Exportar cópia (JSON)</button>
        <label class="btn">Importar cópia<input type="file" accept="application/json,.json" id="import-file" hidden></label>
        <button class="btn ghost" data-act="demo">Carregar dados de exemplo</button>
        <button class="btn danger" data-act="reset">Apagar todos os dados</button>
      </div>
    </section>`;
  },
};

function prRow(p) {
  const def = getEx(p.exId); if (!def) return '';
  const lbl = w => def.bw ? (w ? `PC+${fmt(w)}kg` : 'PC') : fmtKg(w);
  return `<li class="${p.type}">
    ${prBadge(p.type, true)}
    <div><b>${esc(def.name)}</b><span>${p.type === 'w' ? `${lbl(p.w)} × ${p.r} <i>(antes ${lbl(p.prev)})</i>` : `${lbl(p.w)} × ${p.r} = ${fmtKg(p.v, 0)} <i>(antes ${fmt(p.prev, 0)})</i>`}</span></div>
    <time>${fmtDateShort(p.date)}</time>
  </li>`;
}

function chart(hist) {
  if (hist.length < 2) return '<p class="hint">Mais sessões para veres a evolução do 1RM estimado.</p>';
  const W = 320, H = 110, P = 14;
  const vals = hist.map(h => h.e1), mn = Math.min(...vals), mx = Math.max(...vals), rng = mx - mn || 1;
  const t0 = dateObj(hist[0].date), span = (dateObj(hist[hist.length - 1].date) - t0) || 1;
  const pts = hist.map(h => [P + (dateObj(h.date) - t0) / span * (W - 2 * P), H - P - (h.e1 - mn) / rng * (H - 2 * P - 10)]);
  const line = pts.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ');
  const id = 'ch' + (gid++);
  return `<div class="chart"><div class="chart-lbl"><span>EVOLUÇÃO 1RM ESTIMADO</span><span>${fmt(mn, 0)} → ${fmt(mx, 0)} kg</span></div>
  <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3fb6ff" stop-opacity=".45"/><stop offset="1" stop-color="#3fb6ff" stop-opacity="0"/></linearGradient></defs>
    ${[0.25, 0.5, 0.75].map(f => `<line x1="0" x2="${W}" y1="${H * f}" y2="${H * f}" stroke="rgba(90,160,255,.12)"/>`).join('')}
    <polygon points="${pts[0][0]},${H} ${line} ${pts[pts.length - 1][0]},${H}" fill="url(#${id})"/>
    <polyline points="${line}" fill="none" stroke="#5fd3ff" stroke-width="2.2" vector-effect="non-scaling-stroke" style="filter:drop-shadow(0 0 4px #3fa9ff)"/>
    ${pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="2.6" fill="#e6f6ff"/>`).join('')}
  </svg></div>`;
}

/* ---------- editor de treino ---------- */
let draft = null, baseline = null;

function openEditor(id = null) {
  const src = id ? state.workouts.find(w => w.id === id) : null;
  draft = src ? JSON.parse(JSON.stringify(src)) : {
    id: uid(), date: todayISO(), name: '', bw: state.profile.bw, exercises: [], createdAt: Date.now(), isNew: true,
  };
  baseline = compute(state, draft.id).ex;
  renderEditor();
  const sh = $('#sheet'); sh.hidden = false; requestAnimationFrame(() => sh.classList.add('open'));
  document.body.classList.add('locked');
}
function closeEditor() {
  stopRest();
  const sh = $('#sheet'); sh.classList.remove('open');
  setTimeout(() => { sh.hidden = true; sh.innerHTML = ''; }, 250);
  document.body.classList.remove('locked');
  draft = null;
}

function renderEditor() {
  const recent = [...state.workouts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  $('#sheet').innerHTML = `
  <div class="sheet-inner">
    <header class="sheet-head">
      <button class="icon-btn" data-act="close" aria-label="Fechar">${IC.x}</button>
      <div class="sheet-title">${draft.isNew ? 'NOVO TREINO' : 'EDITAR TREINO'}</div>
      <button class="btn primary sm" data-act="save">CONCLUIR</button>
    </header>
    <div class="sheet-body">
      <div class="panel form-row">
        <label>Data<input type="date" id="d-date" value="${esc(draft.date)}"></label>
        <label>Peso corp. (kg)<input id="d-bw" inputmode="decimal" value="${esc(draft.bw)}"></label>
        <label class="full">Nome do treino<input id="d-name" placeholder="ex.: Push — Peito e Ombros" value="${esc(draft.name)}" maxlength="40"></label>
      </div>
      ${!draft.exercises.length && recent.length ? `
      <div class="panel">
        <div class="panel-title"><span>REPETIR UM TREINO</span></div>
        <div class="chips wrap">${recent.map(w => `<button class="chip" data-copy="${w.id}">${IC.copy}${esc(w.name || 'Treino')} · ${fmtDateShort(w.date)}</button>`).join('')}</div>
      </div>` : ''}
      <div id="ex-list">${draft.exercises.map((e, ei) => exCard(e, ei)).join('')}</div>
      <button class="btn wide dashed" data-act="pick">${IC.plus}<span>ADICIONAR EXERCÍCIO</span></button>
      ${!draft.isNew ? `<button class="btn danger wide" data-act="delete">${IC.trash}<span>APAGAR TREINO</span></button>` : ''}
    </div>
  </div>`;
  draft.exercises.forEach((_, ei) => refreshCard(ei));
}

function exCard(e, ei) {
  const def = getEx(e.exId);
  const b = baseline[e.exId];
  const prev = b?.last ? b.last.sets.filter(s => num(s.r) > 0).map(s => `${def.bw && !num(s.w) ? 'PC' : fmt(num(s.w))}×${num(s.r)}`).join(' · ') : null;
  return `
  <div class="panel ex-card" data-ei="${ei}">
    <div class="ex-head">
      <div>
        <b>${esc(def?.name || '?')}</b>
        <small>${esc(def?.group || '')}${def?.bw ? ' · peso corporal + extra' : ''}${def?.perHand ? ' · kg por halter' : ''}</small>
      </div>
      <button class="icon-btn" data-delex="${ei}" aria-label="Remover exercício">${IC.trash}</button>
    </div>
    ${b ? `<div class="ex-rec"><span>Anterior: ${prev || '—'}</span><span>Recorde: <b class="gold">${def.bw ? (b.bestW.w ? '+' + fmt(b.bestW.w) : 'PC') : fmt(b.bestW.w)}kg</b> · <b class="cyan">${fmt(b.bestVol.v, 0)} vol</b></span></div>` : '<div class="ex-rec"><span>Primeira vez — este treino define a tua base.</span></div>'}
    <div class="sets">
      <div class="set-h"><span>SÉRIE</span><span>${def?.bw ? '+KG' : 'KG'}</span><span>REPS</span><span>VOLUME</span><span></span></div>
      ${e.sets.map((s, si) => `
      <div class="set" data-si="${si}">
        <span class="set-n">${si + 1}</span>
        <input data-f="w" inputmode="decimal" value="${esc(s.w)}" placeholder="${def?.bw ? '0' : '—'}" aria-label="Peso série ${si + 1}">
        <input data-f="r" inputmode="numeric" value="${esc(s.r)}" placeholder="—" aria-label="Repetições série ${si + 1}">
        <span class="set-vol"></span>
        <button class="icon-btn sm" data-delset="${si}" aria-label="Remover série">${IC.x}</button>
      </div>`).join('')}
    </div>
    <button class="btn sm ghost add-set" data-addset="${ei}">${IC.plus}<span>Série</span></button>
  </div>`;
}

function refreshCard(ei) {
  const card = $(`.ex-card[data-ei="${ei}"]`); if (!card) return;
  const e = draft.exercises[ei], def = getEx(e.exId), b = baseline[e.exId];
  const bw = num(draft.bw) || num(state.profile.bw);
  let topW = null, topV = null;
  e.sets.forEach((s, si) => {
    const w = num(s.w), r = Math.round(num(s.r));
    const row = $(`.set[data-si="${si}"]`, card);
    const vol = r > 0 ? (def.bw ? bw + w : w) * r : 0;
    $('.set-vol', row).textContent = vol ? fmt(vol, 0) : '';
    if (r > 0) {
      if (!topW || w > topW.w || (w === topW.w && r > topW.r)) topW = { w, r, si };
      if (!topV || vol > topV.v) topV = { v: vol, si };
    }
  });
  $$('.set', card).forEach(row => {
    const si = +row.dataset.si;
    const isW = b && topW && topW.si === si && topW.w > b.bestW.w;
    const isV = b && topV && topV.si === si && topV.v > b.bestVol.v;
    row.classList.toggle('pr-w', !!isW); row.classList.toggle('pr-v', !!isV);
    row.title = [isW && 'Recorde de peso', isV && 'Recorde de volume'].filter(Boolean).join(' + ');
  });
  card.classList.toggle('glow-pr', $$('.set.pr-w, .set.pr-v', card).length > 0);
}

/* ---------- temporizador de descanso ---------- */
let rest = null;
function startRest(sec = num(state.profile.rest) || 90) {
  stopRest();
  rest = { end: Date.now() + sec * 1000, total: sec };
  rest.iv = setInterval(tickRest, 250); tickRest();
}
function stopRest() { if (rest) clearInterval(rest.iv); rest = null; $('#rest')?.remove(); }
function tickRest() {
  if (!rest) return;
  const host = $('.sheet-inner'); if (!host) return stopRest();
  let el = $('#rest');
  if (!el) {
    el = document.createElement('div'); el.id = 'rest'; el.className = 'rest';
    el.innerHTML = `<div class="rest-bar"><i></i></div><div class="rest-row">
      <button class="btn sm ghost" data-rest="-15">−15s</button>
      <div class="rest-t"><span>DESCANSO</span><b></b></div>
      <button class="btn sm ghost" data-rest="15">+15s</button>
      <button class="icon-btn sm" data-rest="0" aria-label="Saltar descanso">${IC.x}</button></div>`;
    host.appendChild(el);
  }
  const left = Math.max(0, rest.end - Date.now()), sec = Math.ceil(left / 1000);
  $('b', el).textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  $('.rest-bar i', el).style.width = clamp(left / (rest.total * 1000) * 100, 0, 100) + '%';
  el.classList.toggle('ending', sec <= 5);
  if (left <= 0) { stopRest(); navigator.vibrate?.([200, 100, 200]); toast('Descanso terminado — próxima série!', 'ok'); }
}

/* ---------- seletor de exercícios ---------- */
function openPicker() {
  const m = $('#modal');
  m.innerHTML = `
  <div class="modal-box picker">
    <div class="picker-head">
      <div class="search">${IC.search}<input id="pick-q" placeholder="Procurar exercício…" autocomplete="off"></div>
      <button class="icon-btn" data-act="mclose" aria-label="Fechar">${IC.x}</button>
    </div>
    <div id="pick-list" class="pick-list"></div>
    <details class="new-ex">
      <summary>${IC.plus} Criar exercício personalizado</summary>
      <form id="custom-form" class="form">
        <input name="name" placeholder="Nome do exercício" required maxlength="40">
        <select name="group">${GROUPS.map(g => `<option>${g}</option>`).join('')}</select>
        <label class="check"><input type="checkbox" name="bw"> Exercício de peso corporal</label>
        <button class="btn primary wide" type="submit">CRIAR E ADICIONAR</button>
      </form>
    </details>
  </div>`;
  m.hidden = false; requestAnimationFrame(() => m.classList.add('open'));
  fillPicker('');
}
function fillPicker(q) {
  const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const all = [...LIB, ...state.custom].filter(e => norm(e.name).includes(norm(q)));
  $('#pick-list').innerHTML = GROUPS.map(g => {
    const items = all.filter(e => e.group === g); if (!items.length) return '';
    return `<div class="pick-g">${g}</div>` + items.map(e => {
      const s = C.ex[e.id];
      return `<button class="pick-item" data-pick="${e.id}"><span>${esc(e.name)}${e.custom ? ' <small>personalizado</small>' : ''}</span>${s ? `<small class="cyan">${fmt(s.bestW.w)}kg</small>` : ''}</button>`;
    }).join('');
  }).join('') || '<p class="empty">Sem resultados — cria um exercício personalizado abaixo.</p>';
}
function closeModal() {
  const m = $('#modal'); m.classList.remove('open');
  setTimeout(() => { m.hidden = true; m.innerHTML = ''; nextAlert(); }, 200);
}
function addExercise(exId) {
  const last = baseline[exId]?.last?.sets?.filter(s => num(s.r) > 0);
  const sets = last?.length ? last.map(s => ({ w: s.w, r: '' })) : [{ w: '', r: '' }];
  draft.exercises.push({ exId, sets });
  closeModal(); renderEditor();
  setTimeout(() => $(`.ex-card[data-ei="${draft.exercises.length - 1}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
}

/* ---------- guardar + notificações do Sistema ---------- */
function saveDraft() {
  const exercises = draft.exercises
    .map(e => ({ exId: e.exId, sets: e.sets.filter(s => num(s.r) > 0).map(s => ({ w: num(s.w), r: Math.round(num(s.r)) })) }))
    .filter(e => e.sets.length);
  if (!exercises.length) { toast('Adiciona pelo menos uma série com repetições', 'bad'); return; }
  const before = C;
  const w = { id: draft.id, date: draft.date || todayISO(), name: draft.name.trim(), bw: num(draft.bw) || num(state.profile.bw), exercises, createdAt: draft.createdAt };
  const i = state.workouts.findIndex(x => x.id === w.id);
  if (i >= 0) state.workouts[i] = w; else state.workouts.push(w);
  const wasNew = draft.isNew;
  save(); closeEditor(); render();
  const after = C;

  const alerts = [];
  const pw = after.perWorkout[w.id];
  if (wasNew) alerts.push({ kind: 'quest', html: `<p class="sys-big">TREINO CONCLUÍDO</p><p>Volume total: <b>${fmtKg(pw.vol, 0)}</b></p><p class="reward">Recompensa: <b>+${fmt(pw.xp, 0)} EXP</b></p>` });
  const prs = after.prList.filter(p => p.wid === w.id);
  if (prs.length) alerts.push({
    kind: 'pr', html: `<p class="sys-big gold">NOVO RECORDE PESSOAL</p><ul class="pr-feed in-alert">${prs.map(prRow).join('')}</ul><p class="reward">Bónus: <b>+${prs.length * 50} EXP</b></p>`,
  });
  if (after.level.lvl > before.level.lvl) alerts.push({ kind: 'level', html: `<p class="lvl-up">LEVEL UP!</p><p class="lvl-from"><span>${before.level.lvl}</span> → <b>${after.level.lvl}</b></p>${titleFor(after.level.lvl) !== titleFor(before.level.lvl) ? `<p>Novo título: <b class="glowtxt">${titleFor(after.level.lvl)}</b></p>` : ''}` });
  const exUps = [];
  for (const e of exercises) {
    const a = after.ex[e.exId], b = before.ex[e.exId];
    if (!a || a.bestMMR === null) continue;
    const ra = rankIdx(a.bestMMR), rb = b && b.bestMMR !== null ? rankIdx(b.bestMMR) : null;
    if (rb === null || ra > rb) exUps.push({ def: getEx(e.exId), ra, rb });
  }
  const overallUp = after.ranked.length && (after.rank > before.rank || (!before.ranked.length));
  if (overallUp) {
    const t = TIERS[RANKS[after.rank].tier];
    alerts.push({ kind: 'rank', html: `<p class="sys-big">${before.ranked.length ? 'PROMOÇÃO DE RANK' : 'RANK ATRIBUÍDO'}</p><div class="alert-emblem" style="--glow:${t.glow}">${emblem(after.rank, 140, 'float')}</div><p class="rank-name" style="color:${t.glow}">${RANKS[after.rank].name}</p>${before.ranked.length ? `<p class="muted">${RANKS[before.rank].name} → ${RANKS[after.rank].name}</p>` : ''}${after.placement ? '<p class="muted">Provisório — completa 3 exercícios com rank.</p>' : ''}` });
  }
  const mUps = MUSCLES.map(m => {
    const a = after.muscles[m.key].mmr, b = before.muscles[m.key].mmr;
    if (a === null) return null;
    const ra = rankIdx(a), rb = b === null ? null : rankIdx(b);
    return rb === null || ra > rb ? { m, ra, rb } : null;
  }).filter(Boolean);
  if (mUps.length) alerts.push({ kind: 'rank', html: `<p class="sys-big">RANK MUSCULAR</p>${bodyMap(after.muscles, null)}<ul class="ex-ups">${mUps.map(u => `<li>${emblem(u.ra, 40)}<div><b>${u.m.name}</b><span>${u.rb === null ? 'Rank inicial' : RANKS[u.rb].name + ' →'} <b style="color:${TIERS[RANKS[u.ra].tier].glow}">${RANKS[u.ra].name}</b></span></div></li>`).join('')}</ul>` });
  if (exUps.length) alerts.push({ kind: 'rank', html: `<p class="sys-big">RANK DE EXERCÍCIO</p><ul class="ex-ups">${exUps.map(u => `<li>${emblem(u.ra, 40)}<div><b>${esc(u.def.name)}</b><span>${u.rb === null ? 'Rank inicial' : RANKS[u.rb].name + ' →'} <b style="color:${TIERS[RANKS[u.ra].tier].glow}">${RANKS[u.ra].name}</b></span></div></li>`).join('')}</ul>` });
  if (!alerts.length) toast('Treino atualizado', 'ok');
  queueAlerts(alerts);
}

let alertQ = [];
function queueAlerts(list) { alertQ.push(...list); if ($('#modal').hidden) nextAlert(); }
function nextAlert() {
  const a = alertQ.shift(); if (!a) return;
  const m = $('#modal');
  m.innerHTML = `<div class="sys-window k-${a.kind}">
    <div class="sys-head"><span class="sys-icon">!</span><span>NOTIFICAÇÃO</span></div>
    <div class="sys-body">${a.html}</div>
    <button class="btn primary wide" data-act="mclose">OK</button>
  </div>${a.kind === 'level' || a.kind === 'rank' ? '<div class="burst"></div>' : ''}`;
  m.hidden = false; requestAnimationFrame(() => m.classList.add('open'));
  if (navigator.vibrate && (a.kind === 'pr' || a.kind === 'level')) navigator.vibrate([30, 40, 60]);
}

function sysConfirm(text, okLabel = 'CONFIRMAR') {
  return new Promise(res => {
    const m = $('#modal');
    m.innerHTML = `<div class="sys-window k-warn">
      <div class="sys-head"><span class="sys-icon">!</span><span>AVISO</span></div>
      <div class="sys-body"><p>${text}</p></div>
      <div class="btn-row"><button class="btn ghost" data-c="0">CANCELAR</button><button class="btn danger" data-c="1">${okLabel}</button></div>
    </div>`;
    m.hidden = false; requestAnimationFrame(() => m.classList.add('open'));
    m.onclick = ev => {
      const b = ev.target.closest('[data-c]'); if (!b) return;
      m.onclick = null; m.classList.remove('open');
      setTimeout(() => { m.hidden = true; m.innerHTML = ''; res(b.dataset.c === '1'); }, 180);
    };
  });
}

function toast(msg, kind = '') {
  const t = document.createElement('div'); t.className = `toast ${kind}`; t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.classList.add('out'), 2200); setTimeout(() => t.remove(), 2700);
}

/* ---------- dados de exemplo ---------- */
function demoData() {
  const plan = [
    { name: 'Push — Peito & Ombros', ex: [['supino', 60, 8, 2.5], ['press_militar', 35, 8, 1.25], ['supino_incl_halt', 20, 10, 1], ['elev_lateral', 8, 12, 0.5], ['triceps_polia', 25, 12, 1.25]] },
    { name: 'Pull — Costas & Bíceps', ex: [['peso_morto', 100, 5, 5], ['elevacoes', 0, 6, 1.25], ['remada_barra', 55, 8, 2.5], ['puxada', 50, 10, 2.5], ['curl_barra', 25, 10, 1.25]] },
    { name: 'Legs — Pernas', ex: [['agachamento', 80, 6, 2.5], ['leg_press', 140, 10, 5], ['rdl', 70, 8, 2.5], ['leg_curl', 35, 12, 1.25], ['gemeos', 60, 12, 2.5]] },
  ];
  const out = []; const start = new Date(); start.setDate(start.getDate() - 7 * 8);
  let bw = 77;
  for (let wk = 0; wk < 8; wk++) {
    [0, 2, 4].forEach((dOff, pi) => {
      const d = new Date(start); d.setDate(d.getDate() + wk * 7 + dOff);
      if (d > new Date()) return;
      const p = plan[pi];
      out.push({
        id: uid(), date: d.toISOString().slice(0, 10), name: p.name, bw: Math.round(bw * 10) / 10, createdAt: d.getTime(),
        exercises: p.ex.map(([id, w0, r, inc]) => {
          const w = w0 + inc * Math.floor(wk * 0.8 + (wk % 3 === 2 ? 1 : 0));
          return { exId: id, sets: [0, 1, 2].map(i => ({ w, r: Math.max(1, r - (i === 2 ? 1 : 0) + (wk % 2 && i === 0 ? 1 : 0)) })) };
        }),
      });
      bw -= 0.1;
    });
  }
  return out;
}

/* ---------- eventos ---------- */
document.addEventListener('click', async ev => {
  const el = ev.target.closest('[data-tab],[data-act],[data-go],[data-edit],[data-addset],[data-delset],[data-delex],[data-pick],[data-copy],[data-filter],[data-delcustom],[data-muscle],[data-rest]');
  if (!el) {
    if (ev.target.id === 'modal' && !$(".sys-window.k-warn")) closeModal();
    return;
  }
  const d = el.dataset;
  if (d.tab) return go(d.tab);
  if (d.muscle) { state.selMuscle = state.selMuscle === d.muscle ? null : d.muscle; save(); return render(false); }
  if (d.rest !== undefined) {
    const v = +d.rest; if (!v || !rest) return stopRest();
    rest.end += v * 1000; rest.total = Math.max(1, rest.total + v); return tickRest();
  }
  if (d.go) return go(d.go);
  if (d.edit) return openEditor(d.edit);
  if (d.filter) { state.recFilter = d.filter; save(); return render(); }
  if (d.pick) return addExercise(d.pick);
  if (d.copy) {
    const src = state.workouts.find(w => w.id === d.copy);
    draft.name = src.name;
    draft.exercises = src.exercises.map(e => ({ exId: e.exId, sets: e.sets.map(s => ({ w: s.w, r: '' })) }));
    return renderEditor();
  }
  if (d.addset !== undefined) {
    const e = draft.exercises[+d.addset]; const last = e.sets[e.sets.length - 1];
    e.sets.push({ w: last ? last.w : '', r: '' }); renderEditor();
    const inp = $(`.ex-card[data-ei="${d.addset}"] .set:last-child input[data-f="r"]`); inp?.focus();
    return;
  }
  if (d.delset !== undefined) {
    const ei = +el.closest('.ex-card').dataset.ei; draft.exercises[ei].sets.splice(+d.delset, 1);
    if (!draft.exercises[ei].sets.length) draft.exercises[ei].sets.push({ w: '', r: '' });
    return renderEditor();
  }
  if (d.delex !== undefined) { draft.exercises.splice(+d.delex, 1); return renderEditor(); }
  if (d.delcustom) {
    if (state.workouts.some(w => w.exercises.some(e => e.exId === d.delcustom))) return toast('Este exercício está em uso em treinos', 'bad');
    state.custom = state.custom.filter(c => c.id !== d.delcustom); save(); return render();
  }
  switch (d.act) {
    case 'new': return openEditor();
    case 'close': return closeEditor();
    case 'save': return saveDraft();
    case 'pick': return openPicker();
    case 'mclose': return closeModal();
    case 'delete':
      if (await sysConfirm('Apagar este treino? A EXP e os recordes associados serão recalculados.', 'APAGAR')) {
        state.workouts = state.workouts.filter(w => w.id !== draft.id); save(); closeEditor(); render(); toast('Treino apagado');
      }
      return;
    case 'export': {
      const blob = new Blob([JSON.stringify({ app: 'iron-system', version: 1, ...state }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `iron-system-${todayISO()}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000); return;
    }
    case 'demo':
      if (state.workouts.length && !(await sysConfirm('Substituir os teus treinos atuais por dados de exemplo?', 'SUBSTITUIR'))) return;
      state.workouts = demoData(); save(); render(); toast('Dados de exemplo carregados', 'ok'); return;
    case 'reset':
      if (await sysConfirm('Apagar TODOS os dados? Esta ação não pode ser desfeita.', 'APAGAR TUDO')) {
        state = defaultState(); save(); render(); toast('Dados apagados');
      }
      return;
  }
});

document.addEventListener('input', ev => {
  const t = ev.target;
  if (t.id === 'pick-q') return fillPicker(t.value);
  if (!draft) return;
  if (t.id === 'd-date') draft.date = t.value;
  else if (t.id === 'd-name') draft.name = t.value;
  else if (t.id === 'd-bw') { draft.bw = t.value; draft.exercises.forEach((_, i) => refreshCard(i)); }
  else if (t.dataset.f) {
    const ei = +t.closest('.ex-card').dataset.ei, si = +t.closest('.set').dataset.si;
    draft.exercises[ei].sets[si][t.dataset.f] = t.value;
    refreshCard(ei);
  }
});

document.addEventListener('submit', ev => {
  ev.preventDefault();
  const f = ev.target, fd = new FormData(f);
  if (f.id === 'profile-form') {
    const bw = num(fd.get('bw'));
    if (bw < 25 || bw > 300) return toast('Peso corporal inválido', 'bad');
    state.profile = { name: String(fd.get('name')).trim() || 'Caçador', bw, sex: fd.get('sex'), rest: clamp(Math.round(num(fd.get('rest')) || 90), 15, 600) };
    save(); render(); toast('Perfil guardado', 'ok');
  }
  if (f.id === 'custom-form') {
    const ex = { id: 'c_' + uid(), name: String(fd.get('name')).trim(), group: fd.get('group'), bw: !!fd.get('bw'), std: null, custom: true, region: 'upper' };
    if (!ex.name) return;
    state.custom.push(ex); save(); addExercise(ex.id);
  }
});

document.addEventListener('change', ev => {
  if (draft && ev.target.matches('.set input[data-f="r"]') && num(ev.target.value) > 0) startRest();
  if (ev.target.id !== 'import-file') return;
  const file = ev.target.files[0]; if (!file) return;
  file.text().then(txt => {
    const d = JSON.parse(txt);
    if (!Array.isArray(d.workouts)) throw new Error();
    state = { ...defaultState(), profile: { ...defaultState().profile, ...d.profile }, workouts: d.workouts, custom: d.custom || [], tab: 'status' };
    save(); render(); toast('Cópia importada', 'ok');
  }).catch(() => toast('Ficheiro inválido', 'bad'));
});

document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape') { if (!$('#modal').hidden) closeModal(); else if (draft) closeEditor(); }
  if (ev.key === 'Enter' && ev.target.matches('.set input')) {
    ev.preventDefault();
    const ins = $$('.sheet .set input'); const i = ins.indexOf(ev.target); ins[i + 1]?.focus();
  }
});

/* ---------- fundo com partículas ---------- */
(function particles() {
  const c = $('#bg'), x = c.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let w, h, ps = [];
  const dpr = Math.min(devicePixelRatio || 1, 2);
  function size() { w = c.width = innerWidth * dpr; h = c.height = innerHeight * dpr; c.style.width = innerWidth + 'px'; c.style.height = innerHeight + 'px'; }
  function mk(y) { return { x: Math.random() * w, y: y ?? Math.random() * h, r: (Math.random() * 1.6 + 0.4) * dpr, s: (Math.random() * 0.35 + 0.08) * dpr, a: Math.random() * 0.6 + 0.2, p: Math.random() * 6.28 }; }
  size(); addEventListener('resize', size);
  ps = Array.from({ length: Math.round(Math.min(70, innerWidth / 12)) }, () => mk());
  function frame(t) {
    x.clearRect(0, 0, w, h);
    for (const p of ps) {
      p.y -= p.s; p.x += Math.sin(t / 2000 + p.p) * 0.15 * dpr;
      if (p.y < -10) Object.assign(p, mk(h + 10));
      const al = p.a * (0.6 + 0.4 * Math.sin(t / 700 + p.p));
      x.beginPath(); x.fillStyle = `rgba(110,190,255,${al})`; x.shadowColor = '#3fa9ff'; x.shadowBlur = 8 * dpr;
      x.arc(p.x, p.y, p.r, 0, 6.28); x.fill();
    }
    if (!reduce && !document.hidden) requestAnimationFrame(frame);
  }
  frame(0);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !reduce) requestAnimationFrame(frame); });
})();

/* ---------- arranque ---------- */
render();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
