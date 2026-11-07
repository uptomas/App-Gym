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
const fmt = (n, d = 1) => Number(n || 0).toLocaleString('en-GB', { maximumFractionDigits: d });
const fmtKg = (n, d = 1) => `${fmt(n, d)} kg`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const dateObj = iso => new Date(iso + 'T12:00:00');
const fmtDate = iso => dateObj(iso).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
const fmtDateShort = iso => dateObj(iso).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
const fmtMonth = iso => dateObj(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
const daysBetween = (a, b) => Math.round((dateObj(b) - dateObj(a)) / 86400000);
const e1rm = (load, reps) => reps <= 1 ? load : load * (1 + reps / 30); // fórmula de Epley

/* ---------- ranks (estilo liga competitiva) ---------- */
const TIERS = [
  { key: 'bronze', name: 'Bronze', c1: '#ffbf8a', c2: '#6e3416', glow: '#ff8f45' },
  { key: 'silver', name: 'Silver', c1: '#ffffff', c2: '#5d6a85', glow: '#c9dcff' },
  { key: 'gold', name: 'Gold', c1: '#fff1a6', c2: '#a1630a', glow: '#ffc531' },
  { key: 'plat', name: 'Platinum', c1: '#c9fff6', c2: '#127481', glow: '#3ff0d6' },
  { key: 'diamond', name: 'Diamond', c1: '#cfe9ff', c2: '#1739b8', glow: '#3d9bff' },
  { key: 'champ', name: 'Champion', c1: '#f0d4ff', c2: '#4b1596', glow: '#b45cff' },
  { key: 'gc', name: 'Grand Champion', c1: '#ffc4cf', c2: '#8a0a27', glow: '#ff3b5c' },
  { key: 'legend', name: 'Legend', c1: '#ffffff', c2: '#2a1cff', glow: '#9fb8ff' },
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
const GROUPS = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Other'];
const GROUP_PT = { Peito: 'Chest', Costas: 'Back', Pernas: 'Legs', Ombros: 'Shoulders', 'Braços': 'Arms', Outros: 'Other' };
const LIB = [
  ['supino', 'Bench press (barbell)', 'Chest', 'u', 0, [0.5, 0.75, 1.25, 1.75, 2.0]],
  ['supino_incl', 'Incline bench press (barbell)', 'Chest', 'u', 0, [0.4, 0.65, 1.0, 1.4, 1.7]],
  ['supino_halt', 'Dumbbell bench press', 'Chest', 'u', 0, [0.2, 0.35, 0.5, 0.7, 0.9], 1],
  ['supino_incl_halt', 'Incline dumbbell press', 'Chest', 'u', 0, [0.17, 0.3, 0.45, 0.62, 0.8], 1],
  ['peck_deck', 'Pec deck / Machine fly', 'Chest', 'u', 0, [0.3, 0.55, 0.85, 1.2, 1.5]],
  ['dips', 'Dips', 'Chest', 'u', 1, [1.0, 1.2, 1.5, 1.8, 2.1]],
  ['peso_morto', 'Deadlift', 'Back', 'l', 0, [1.0, 1.5, 2.0, 2.5, 3.0]],
  ['remada_barra', 'Barbell row', 'Back', 'u', 0, [0.5, 0.75, 1.0, 1.5, 1.75]],
  ['remada_halt', 'One-arm dumbbell row', 'Back', 'u', 0, [0.25, 0.4, 0.6, 0.85, 1.1], 1],
  ['elevacoes', 'Pull-up', 'Back', 'u', 1, [1.0, 1.15, 1.35, 1.65, 1.9]],
  ['puxada', 'Lat pulldown', 'Back', 'u', 0, [0.5, 0.75, 1.0, 1.3, 1.6]],
  ['remada_polia', 'Seated cable row', 'Back', 'u', 0, [0.5, 0.75, 1.0, 1.4, 1.75]],
  ['agachamento', 'Back squat (barbell)', 'Legs', 'l', 0, [0.75, 1.25, 1.5, 2.25, 2.75]],
  ['agach_frontal', 'Front squat', 'Legs', 'l', 0, [0.6, 1.0, 1.25, 1.75, 2.2]],
  ['leg_press', 'Leg press', 'Legs', 'l', 0, [1.5, 2.25, 3.25, 4.5, 5.5]],
  ['rdl', 'Romanian deadlift', 'Legs', 'l', 0, [0.6, 1.0, 1.4, 1.9, 2.4]],
  ['hip_thrust', 'Hip thrust', 'Legs', 'l', 0, [0.75, 1.25, 2.0, 2.75, 3.5]],
  ['afundos', 'Lunge / Bulgarian split squat', 'Legs', 'l', 0, [0.3, 0.6, 0.9, 1.3, 1.7]],
  ['leg_ext', 'Leg extension', 'Legs', 'l', 0, [0.5, 0.8, 1.15, 1.6, 2.0]],
  ['leg_curl', 'Leg curl', 'Legs', 'l', 0, [0.4, 0.6, 0.9, 1.2, 1.5]],
  ['gemeos', 'Calf raise (machine)', 'Legs', 'l', 0, [0.75, 1.25, 1.75, 2.5, 3.25]],
  ['press_militar', 'Overhead press (barbell)', 'Shoulders', 'u', 0, [0.35, 0.55, 0.8, 1.05, 1.35]],
  ['press_halt', 'Dumbbell shoulder press', 'Shoulders', 'u', 0, [0.15, 0.25, 0.38, 0.52, 0.68], 1],
  ['elev_lateral', 'Lateral raise', 'Shoulders', 'u', 0, [0.05, 0.1, 0.17, 0.25, 0.33], 1],
  ['face_pull', 'Face pull', 'Shoulders', 'u', 0, [0.2, 0.35, 0.5, 0.7, 0.9]],
  ['curl_barra', 'Barbell curl', 'Arms', 'u', 0, [0.2, 0.4, 0.6, 0.85, 1.1]],
  ['curl_halt', 'Dumbbell curl', 'Arms', 'u', 0, [0.1, 0.2, 0.3, 0.45, 0.6], 1],
  ['triceps_polia', 'Triceps pushdown (cable)', 'Arms', 'u', 0, [0.25, 0.4, 0.6, 0.85, 1.1]],
  ['triceps_frances', 'Skull crusher', 'Arms', 'u', 0, [0.15, 0.3, 0.5, 0.7, 0.9]],
  ['abd_polia', 'Cable crunch', 'Core', 'u', 0, [0.3, 0.5, 0.75, 1.0, 1.3]],
].map(([id, name, group, reg, bw, std, ph]) => ({ id, name, group, region: reg === 'l' ? 'lower' : 'upper', bw: !!bw, std, perHand: !!ph }));
// mais exercícios: [id, nome, grupo, região, peso corporal, normas (null = sem rank), por halter, músculos]
const EXTRA = [
  ['decline_bench', 'Decline bench press', 'Chest', 'u', 0, [0.55, 0.85, 1.3, 1.8, 2.1], 0, ['chest']],
  ['smith_bench', 'Smith machine bench press', 'Chest', 'u', 0, [0.45, 0.7, 1.15, 1.6, 1.9], 0, ['chest']],
  ['chest_press', 'Machine chest press', 'Chest', 'u', 0, [0.4, 0.65, 1.0, 1.4, 1.75], 0, ['chest']],
  ['incline_machine', 'Incline machine press', 'Chest', 'u', 0, [0.35, 0.6, 0.9, 1.25, 1.6], 0, ['chest']],
  ['db_fly', 'Dumbbell fly', 'Chest', 'u', 0, [0.08, 0.15, 0.25, 0.35, 0.45], 1, ['chest']],
  ['cable_fly', 'Cable crossover', 'Chest', 'u', 0, [0.1, 0.2, 0.3, 0.45, 0.6], 1, ['chest']],
  ['pushup', 'Push-up', 'Chest', 'u', 1, null, 0, []],
  ['pendlay', 'Pendlay row', 'Back', 'u', 0, [0.45, 0.7, 0.95, 1.4, 1.65], 0, ['back']],
  ['tbar_row', 'T-bar row', 'Back', 'u', 0, [0.5, 0.8, 1.1, 1.5, 1.9], 0, ['back']],
  ['machine_row', 'Machine row', 'Back', 'u', 0, [0.5, 0.75, 1.05, 1.45, 1.8], 0, ['back']],
  ['chinup', 'Chin-up', 'Back', 'u', 1, [1.0, 1.15, 1.35, 1.65, 1.9], 0, ['back', 'biceps']],
  ['close_pulldown', 'Close-grip pulldown', 'Back', 'u', 0, [0.5, 0.75, 1.0, 1.3, 1.6], 0, ['back']],
  ['straight_arm', 'Straight-arm pulldown', 'Back', 'u', 0, [0.2, 0.35, 0.5, 0.7, 0.9], 0, ['back']],
  ['sumo_dl', 'Sumo deadlift', 'Back', 'l', 0, [1.0, 1.5, 2.0, 2.5, 3.0], 0, ['back', 'glutes', 'hamstrings']],
  ['rack_pull', 'Rack pull', 'Back', 'l', 0, [1.1, 1.65, 2.2, 2.75, 3.3], 0, ['back']],
  ['shrug', 'Barbell shrug', 'Back', 'u', 0, [0.75, 1.1, 1.6, 2.1, 2.6], 0, ['back']],
  ['back_ext', 'Back extension', 'Back', 'l', 1, null, 0, []],
  ['hack_squat', 'Hack squat', 'Legs', 'l', 0, [0.75, 1.25, 1.75, 2.5, 3.0], 0, ['quads']],
  ['smith_squat', 'Smith machine squat', 'Legs', 'l', 0, [0.7, 1.15, 1.45, 2.0, 2.5], 0, ['quads', 'glutes']],
  ['goblet', 'Goblet squat', 'Legs', 'l', 0, [0.25, 0.4, 0.6, 0.8, 1.0], 0, ['quads']],
  ['walking_lunge', 'Walking lunge (dumbbells)', 'Legs', 'l', 0, [0.12, 0.22, 0.35, 0.5, 0.65], 1, ['quads', 'glutes']],
  ['step_up', 'Step-up (dumbbells)', 'Legs', 'l', 0, [0.1, 0.2, 0.32, 0.45, 0.6], 1, ['quads', 'glutes']],
  ['good_morning', 'Good morning', 'Legs', 'l', 0, [0.4, 0.6, 0.9, 1.2, 1.5], 0, ['hamstrings']],
  ['seated_leg_curl', 'Seated leg curl', 'Legs', 'l', 0, [0.45, 0.65, 0.95, 1.25, 1.6], 0, ['hamstrings']],
  ['glute_bridge', 'Glute bridge (barbell)', 'Legs', 'l', 0, [0.7, 1.15, 1.8, 2.5, 3.2], 0, ['glutes']],
  ['hip_abduction', 'Hip abduction (machine)', 'Legs', 'l', 0, [0.5, 0.8, 1.2, 1.6, 2.0], 0, ['glutes']],
  ['hip_adduction', 'Hip adduction (machine)', 'Legs', 'l', 0, [0.5, 0.8, 1.2, 1.6, 2.0], 0, []],
  ['cable_kickback', 'Cable glute kickback', 'Legs', 'l', 0, [0.1, 0.2, 0.3, 0.45, 0.6], 0, ['glutes']],
  ['seated_calf', 'Seated calf raise', 'Legs', 'l', 0, [0.5, 0.85, 1.25, 1.75, 2.25], 0, ['calves']],
  ['standing_calf', 'Standing calf raise (Smith)', 'Legs', 'l', 0, [0.75, 1.2, 1.7, 2.3, 3.0], 0, ['calves']],
  ['arnold', 'Arnold press', 'Shoulders', 'u', 0, [0.12, 0.22, 0.33, 0.46, 0.6], 1, ['shoulders']],
  ['machine_shoulder', 'Machine shoulder press', 'Shoulders', 'u', 0, [0.35, 0.55, 0.8, 1.1, 1.4], 0, ['shoulders']],
  ['push_press', 'Push press', 'Shoulders', 'u', 0, [0.45, 0.7, 1.0, 1.3, 1.6], 0, ['shoulders']],
  ['cable_lateral', 'Cable lateral raise', 'Shoulders', 'u', 0, [0.04, 0.08, 0.13, 0.2, 0.26], 1, ['shoulders']],
  ['rear_delt', 'Rear delt fly', 'Shoulders', 'u', 0, [0.04, 0.08, 0.14, 0.2, 0.28], 1, ['shoulders']],
  ['reverse_pec', 'Reverse pec deck', 'Shoulders', 'u', 0, [0.25, 0.4, 0.6, 0.8, 1.0], 0, ['shoulders']],
  ['front_raise', 'Front raise', 'Shoulders', 'u', 0, [0.06, 0.11, 0.18, 0.26, 0.34], 1, ['shoulders']],
  ['upright_row', 'Upright row', 'Shoulders', 'u', 0, [0.3, 0.45, 0.65, 0.85, 1.05], 0, ['shoulders']],
  ['landmine_press', 'Landmine press', 'Shoulders', 'u', 0, [0.25, 0.4, 0.6, 0.8, 1.0], 0, ['shoulders']],
  ['hammer', 'Hammer curl', 'Arms', 'u', 0, [0.1, 0.2, 0.32, 0.46, 0.6], 1, ['biceps']],
  ['preacher', 'Preacher curl (EZ bar)', 'Arms', 'u', 0, [0.18, 0.33, 0.5, 0.7, 0.9], 0, ['biceps']],
  ['ez_curl', 'EZ bar curl', 'Arms', 'u', 0, [0.2, 0.38, 0.57, 0.8, 1.05], 0, ['biceps']],
  ['cable_curl', 'Cable curl', 'Arms', 'u', 0, [0.2, 0.35, 0.55, 0.75, 1.0], 0, ['biceps']],
  ['incline_curl', 'Incline dumbbell curl', 'Arms', 'u', 0, [0.08, 0.15, 0.25, 0.36, 0.48], 1, ['biceps']],
  ['concentration', 'Concentration curl', 'Arms', 'u', 0, [0.08, 0.15, 0.24, 0.34, 0.45], 1, ['biceps']],
  ['close_grip', 'Close-grip bench press', 'Arms', 'u', 0, [0.45, 0.7, 1.05, 1.45, 1.75], 0, ['triceps']],
  ['overhead_ext', 'Overhead triceps extension (cable)', 'Arms', 'u', 0, [0.2, 0.35, 0.55, 0.75, 1.0], 0, ['triceps']],
  ['db_overhead_ext', 'Overhead dumbbell extension', 'Arms', 'u', 0, [0.15, 0.25, 0.4, 0.55, 0.7], 0, ['triceps']],
  ['rope_pushdown', 'Rope pushdown', 'Arms', 'u', 0, [0.2, 0.35, 0.52, 0.72, 0.95], 0, ['triceps']],
  ['bench_dips', 'Bench dips', 'Arms', 'u', 1, null, 0, []],
  ['wrist_curl', 'Wrist curl', 'Arms', 'u', 0, null, 0, []],
  ['machine_crunch', 'Ab crunch machine', 'Core', 'u', 0, [0.35, 0.6, 0.9, 1.2, 1.5], 0, ['abs']],
  ['hanging_leg', 'Hanging leg raise', 'Core', 'u', 1, null, 0, []],
  ['decline_situp', 'Decline sit-up', 'Core', 'u', 1, null, 0, []],
  ['russian_twist', 'Russian twist', 'Core', 'u', 0, null, 0, []],
  ['power_clean', 'Power clean', 'Other', 'l', 0, [0.5, 0.75, 1.0, 1.35, 1.65], 0, ['back', 'glutes']],
  ['hang_clean', 'Hang clean', 'Other', 'l', 0, [0.45, 0.7, 0.95, 1.25, 1.55], 0, ['back', 'glutes']],
  ['snatch', 'Snatch', 'Other', 'l', 0, [0.4, 0.6, 0.85, 1.1, 1.35], 0, ['back', 'shoulders']],
  ['thruster', 'Thruster', 'Other', 'l', 0, [0.4, 0.6, 0.85, 1.1, 1.35], 0, ['quads', 'shoulders']],
  ['kb_swing', 'Kettlebell swing', 'Other', 'l', 0, null, 0, []],
  ['farmer_walk', "Farmer's walk (per hand)", 'Other', 'u', 0, null, 1, []],
  ['bw_squat', 'Bodyweight squat', 'Legs', 'l', 1, null, 0, []],
  ['bw_lunge', 'Bodyweight lunge', 'Legs', 'l', 1, null, 0, []],
  ['pistol', 'Pistol squat', 'Legs', 'l', 1, null, 0, []],
  ['bw_glute_bridge', 'Single-leg glute bridge', 'Legs', 'l', 1, null, 0, []],
  ['bw_calf', 'Single-leg calf raise', 'Legs', 'l', 1, null, 0, []],
  ['nordic', 'Nordic hamstring curl', 'Legs', 'l', 1, null, 0, []],
  ['pike_pushup', 'Pike push-up', 'Shoulders', 'u', 1, null, 0, []],
  ['diamond_pushup', 'Diamond push-up', 'Arms', 'u', 1, null, 0, []],
  ['inverted_row', 'Inverted row', 'Back', 'u', 1, null, 0, []],
  ['crunch', 'Crunch', 'Core', 'u', 1, null, 0, []],
];
const EXTRA_MUSCLES = {};
for (const [id, name, group, reg, bw, std, ph, mus] of EXTRA) {
  LIB.push({ id, name, group, region: reg === 'l' ? 'lower' : 'upper', bw: !!bw, std, perHand: !!ph });
  if (mus.length) EXTRA_MUSCLES[id] = mus;
}
const LIB_MAP = Object.fromEntries(LIB.map(e => [e.id, e]));

/* músculos (estilo mapa muscular) — main: conta para o rank geral */
const MUSCLES = [
  { key: 'chest', name: 'Chest', main: 1 }, { key: 'back', name: 'Back', main: 1 }, { key: 'shoulders', name: 'Shoulders', main: 1 },
  { key: 'biceps', name: 'Biceps', main: 1 }, { key: 'triceps', name: 'Triceps', main: 1 }, { key: 'quads', name: 'Quads', main: 1 },
  { key: 'hamstrings', name: 'Hamstrings', main: 1 }, { key: 'glutes', name: 'Glutes', main: 1 },
  { key: 'calves', name: 'Calves', main: 0 }, { key: 'abs', name: 'Abs', main: 0 },
];
const MUSCLE_OF = {
  supino: ['chest'], supino_incl: ['chest'], supino_halt: ['chest'], supino_incl_halt: ['chest'], peck_deck: ['chest'], dips: ['chest', 'triceps'],
  peso_morto: ['back', 'hamstrings', 'glutes'], remada_barra: ['back'], remada_halt: ['back'], elevacoes: ['back', 'biceps'], puxada: ['back'], remada_polia: ['back'],
  agachamento: ['quads', 'glutes'], agach_frontal: ['quads'], leg_press: ['quads'], rdl: ['hamstrings', 'glutes'], hip_thrust: ['glutes'], afundos: ['quads', 'glutes'],
  leg_ext: ['quads'], leg_curl: ['hamstrings'], gemeos: ['calves'],
  press_militar: ['shoulders'], press_halt: ['shoulders'], elev_lateral: ['shoulders'], face_pull: ['shoulders'],
  curl_barra: ['biceps'], curl_halt: ['biceps'], triceps_polia: ['triceps'], triceps_frances: ['triceps'], abd_polia: ['abs'],
  ...EXTRA_MUSCLES,
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
  return { profile: { name: 'Hunter', bw: 75, sex: 'm', rest: 90, bwGoal: null }, workouts: [], custom: [], goals: {}, bwLog: [], tab: 'status', range: '3M', metric: 'w' };
}
function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultState();
    const s = JSON.parse(raw);
    const st = { ...defaultState(), ...s, profile: { ...defaultState().profile, ...(s.profile || {}) } };
    return migrate(st);
  } catch { return defaultState(); }
}
function migrate(st) { // dados antigos em português
  if (st.profile.name === 'Caçador') st.profile.name = 'Hunter';
  st.custom = (st.custom || []).map(c => ({ ...c, group: GROUP_PT[c.group] || c.group }));
  if (st.recFilter && st.recFilter !== 'All' && !GROUPS.includes(st.recFilter)) st.recFilter = GROUP_PT[st.recFilter] || 'All';
  const tabs = { treinos: 'workouts', recordes: 'records', perfil: 'profile' };
  st.tab = tabs[st.tab] || st.tab;
  // limpar alvos de exercícios que já não existem (ex.: personalizados apagados)
  const ids = new Set([...Object.keys(LIB_MAP), ...st.custom.map(c => c.id)]);
  st.goals = Object.fromEntries(Object.entries(st.goals || {}).filter(([id]) => ids.has(id)));
  return st;
}
// chaves só de interface / sincronização: não vão para a nuvem
const LOCAL_KEYS = ['tab', 'selMuscle', 'recFilter', 'range', 'metric', 'progEx', 'wView', 'planEdit', 'planEditDay', 'rankView', 'lbSort', 'updatedAt', 'syncedAt', 'cloudUser', 'pendingInvite'];
function syncData(st = state) { const o = { ...st }; for (const k of LOCAL_KEYS) delete o[k]; return o; }
let lastSyncJson = null;
function saveLocal() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch { toast('Could not save on this device', 'bad'); } }
function save() {
  const j = JSON.stringify(syncData());
  if (lastSyncJson !== null && j !== lastSyncJson) { state.updatedAt = Date.now(); window.onDataChanged?.(); }
  lastSyncJson = j;
  saveLocal();
}
let state = load();
lastSyncJson = JSON.stringify(syncData());

/* ---------- motor: recordes, XP, ranking ---------- */
function levelFromXP(xp) {
  let lvl = 1, need = 260, acc = 0;
  while (xp >= acc + need) { acc += need; lvl++; need = Math.round(200 + lvl * 60); }
  return { lvl, cur: xp - acc, need, total: xp };
}
const TITLES = [[1, 'Recruit'], [5, 'Awakened'], [10, 'Hunter'], [20, 'Elite Hunter'], [30, 'Dungeon Master'], [45, 'Sovereign'], [60, 'Iron Monarch']];
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
      let topW = null, topV = null, topE = 0, sv = 0;
      e.sets.forEach((set, si) => {
        const wt = num(set.w), r = Math.round(num(set.r)); if (r <= 0) return;
        const load = def.bw ? bw + wt : wt;
        const vol = load * r;
        wVol += vol; sv += vol; totalSets++; totalReps += r;
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
      s.hist.push({ date: w.date, e1: topE, w: topW.w, v: topV.v, sv, wid: w.id });
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
  // objetivos de peso atingidos: +200 EXP cada
  const goalsReached = Object.entries(st.goals || {}).filter(([id, g]) => num(g) > 0 && ex[id] && ex[id].bestW.w >= num(g)).map(([id]) => id);
  xp += goalsReached.length * 200;
  const lv = levelFromXP(xp);

  return {
    ex, prFlags, prList, perWorkout, xp, level: lv, totalVol, totalSets, totalReps,
    goalsReached, ranked, muscles, musclesRanked, mmr, rank: rankIdx(mmr), placement: musclesRanked < 4, streak, last30, thisWeek,
    trainedToday: ws.some(w => w.date === t), count: ws.length,
    stats: {
      STR: 10 + Math.round(mmr / 8),
      VIT: 10 + ws.length * 2,
      END: 10 + Math.round(totalReps / 40),
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
  return `<svg class="bodymap" viewBox="0 0 420 372" role="img" aria-label="Muscle map">
    <circle class="bm-n" cx="100" cy="34" r="17"/><circle class="bm-n" cx="320" cy="34" r="17"/>
    ${draw([...BODY_COMMON, ...BODY_FRONT], 0)}${draw([...BODY_COMMON, ...BODY_BACK], 220)}
    <text x="100" y="371" class="bm-lbl">FRONT</text><text x="320" y="371" class="bm-lbl">BACK</text>
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
  swap: '<svg viewBox="0 0 24 24"><path d="M4 8h13l-3-3M20 16H7l3 3"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m14 6 4 4"/></svg>',
};
const prBadge = (type, small = false) => type === 'w'
  ? `<span class="pr pr-w${small ? ' sm' : ''}" title="Weight record">▲ WEIGHT PR</span>`
  : `<span class="pr pr-v${small ? ' sm' : ''}" title="Single-set volume record">◆ VOLUME PR</span>`;

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
          <div class="lvl-label">LEVEL</div>
          <div class="lvl-num">${L.lvl}</div>
        </div>
        <div class="who">
          <div class="kv"><span>NAME</span><b>${esc(p.name)}</b></div>
          <div class="kv"><span>TITLE</span><b class="glowtxt">${titleFor(L.lvl)}</b></div>
          <div class="kv"><span>RANK</span><b style="color:${C.count ? TIERS[rk.tier].glow : 'var(--muted)'}">${C.count ? rk.name : 'Unranked'}${C.placement && C.count ? ' <small>(provisional)</small>' : ''}</b></div>
          <div class="kv"><span>WEIGHT</span><b>${fmtKg(p.bw)}</b></div>
        </div>
        <button class="status-emblem" data-go="ranking">${emblem(C.count ? C.rank : null, 84, 'float')}</button>
      </div>
      <div class="xp">
        <div class="xp-row"><span>EXP</span><span>${fmt(L.cur, 0)} / ${fmt(L.need, 0)}</span></div>
        <div class="bar"><i style="width:${pct}%"></i></div>
      </div>
      <div class="stats">
        ${Object.entries(C.stats).map(([k, val]) => `<div class="stat"><span>${{ STR: 'STRENGTH', VIT: 'VITALITY', END: 'ENDURANCE', DIS: 'DISCIPLINE' }[k]}</span><b>${val}</b></div>`).join('')}
      </div>
    </section>

    <section class="panel quest">
      <div class="panel-title"><span>DAILY QUEST</span></div>
      <div class="quest-head">Quest: Get Stronger</div>
      <ul class="quest-list">
        <li class="${C.trainedToday ? 'done' : ''}"><span>Complete a workout today</span><b>[${C.trainedToday ? 1 : 0}/1]</b></li>
        <li class="${C.thisWeek >= 3 ? 'done' : ''}"><span>Workouts this week</span><b>[${Math.min(C.thisWeek, 3)}/3]</b></li>
        <li class="${C.streak >= 4 ? 'done' : ''}"><span>Weeks in a row training</span><b>[${Math.min(C.streak, 4)}/4]</b></li>
      </ul>
      ${C.trainedToday ? '<div class="quest-ok">DAILY QUEST COMPLETE</div>' : '<div class="quest-warn">⚠ Failing the daily quest carries no penalty… this time.</div>'}
      ${(() => {
        const tp = todayPlanDay();
        if (!tp) return `<button class="btn primary wide" data-act="new">${IC.plus}<span>START WORKOUT</span></button>
          <button class="btn ghost wide" data-wview="plan">${IC.bolt}<span>CREATE A TRAINING PLAN</span></button>`;
        return `<div class="today-plan ${tp.today ? '' : 'rest'}">
            <div><span>${tp.today ? "TODAY'S PLAN" : 'REST DAY · NEXT'}</span><b>${esc(tp.day.name)}${tp.today ? '' : ` <small>${WEEKDAYS[tp.day.weekday]}</small>`}</b><small>${tp.day.ex.length} exercises · ${DAY_T[tp.day.type].focus}</small></div>
          </div>
          <button class="btn primary wide" data-startday="${tp.i}">${IC.bolt}<span>START ${esc(tp.day.name.toUpperCase())}</span></button>
          <button class="btn ghost wide" data-act="new">${IC.plus}<span>FREE WORKOUT</span></button>`;
      })()}
    </section>

    <section class="grid3">
      <div class="panel mini"><span>WORKOUTS</span><b>${C.count}</b></div>
      <div class="panel mini"><span>VOLUME</span><b>${fmt(C.totalVol / 1000, 1)}<small>t</small></b></div>
      <div class="panel mini"><span>RECORDS</span><b class="gold">${C.prList.length}</b></div>
    </section>

    <section class="panel">
      <div class="panel-title"><span>RECENT RECORDS</span></div>
      ${recent.length ? `<ul class="pr-feed">${recent.map(prRow).join('')}</ul>`
        : `<p class="empty">No records yet. The System marks a <b class="gold">PR</b> whenever you beat your best weight or your best single-set volume.</p>`}
    </section>`;
  },

  workouts() {
    const v = state.wView === 'plan' ? 'plan' : 'history';
    const seg = `<div class="chips seg range"><button class="chip ${v === 'history' ? 'on' : ''}" data-wview="history">HISTORY</button><button class="chip ${v === 'plan' ? 'on' : ''}" data-wview="plan">TRAINING PLAN</button></div>`;
    return seg + (v === 'plan' ? (state.plan && !state.planEdit ? planDisplay() : planBuilder()) : VIEWS.history());
  },

  history() {
    const ws = [...state.workouts].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
    if (!ws.length) return `
      <section class="panel center">
        <div class="panel-title"><span>DUNGEON LOG</span></div>
        <div class="big-icon">${emblem(null, 90)}</div>
        <p class="empty">No workouts logged yet.<br>Every workout gives EXP, every record gives a bonus.</p>
        <button class="btn primary wide" data-act="new">${IC.plus}<span>NEW WORKOUT</span></button>
        <button class="btn ghost wide" data-act="demo">Load sample data</button>
      </section>`;
    let html = `<button class="btn primary wide sticky-cta" data-act="new">${IC.plus}<span>NEW WORKOUT</span></button>`;
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
            <h4>${esc(w.name || 'Workout')}</h4>
          </div>
          <div class="w-xp">+${fmt(pw.xp, 0)}<small>EXP</small></div>
        </header>
        <ul class="w-ex">
          ${w.exercises.map((e, ei) => {
            const def = getEx(e.exId); if (!def) return '';
            const valid = e.sets.filter(s => num(s.r) > 0);
            const flags = valid.length ? e.sets.reduce((acc, _, si) => { const f = C.prFlags[`${w.id}:${ei}:${si}`]; if (f) { acc.w ||= f.w; acc.v ||= f.v; } return acc; }, {}) : {};
            const best = valid.reduce((a, s) => num(s.w) > num(a?.w ?? -1) ? s : a, null);
            return `<li><span class="n">${esc(def.name)}</span><span class="d">${valid.length}× ${best ? `${def.bw && !num(best.w) ? 'BW' : fmt(num(best.w)) + 'kg'}×${num(best.r)}` : '—'}</span>${flags.w ? prBadge('w', true) : ''}${flags.v ? prBadge('v', true) : ''}</li>`;
          }).join('')}
        </ul>
        <footer><span>Volume <b>${fmtKg(pw.vol, 0)}</b></span>${pw.prs ? `<span class="gold">★ ${pw.prs} record${pw.prs > 1 ? 's' : ''}</span>` : ''}</footer>
      </article>`;
    }
    return html;
  },

  ranking() {
    const v = ['friends', 'global'].includes(state.rankView) ? state.rankView : 'me';
    const seg = `<div class="chips seg range"><button class="chip ${v === 'me' ? 'on' : ''}" data-rankview="me">ME</button><button class="chip ${v === 'friends' ? 'on' : ''}" data-rankview="friends">FRIENDS</button><button class="chip ${v === 'global' ? 'on' : ''}" data-rankview="global">GLOBAL</button></div>`;
    if (v !== 'me') return seg + (window.Social ? Social.leaderboardView(v) : '<section class="panel"><p class="empty">Online features failed to load. Check your connection.</p></section>');
    return seg + VIEWS.rankingMe();
  },

  rankingMe() {
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
        target = `<div class="target">Next: <b style="color:${TIERS[nx.tier].glow}">${nx.name}</b> → 1RM ${def.bw ? '+' : ''}${fmtKg(Math.ceil(need * 2) / 2)}${def.perHand ? ' /dumbbell' : ''}</div>`;
      }
      const bestFor = Object.values(C.muscles).filter(m => m.best === s.id);
      return `<li class="${bestFor.length ? 'counts' : ''}">
        ${emblem(ri, 46)}
        <div class="rx">
          <div class="rx-top"><b>${esc(def.name)}</b>${bestFor.map(m => `<span class="tag">${m.name.toUpperCase()}</span>`).join('')}</div>
          <div class="rx-sub"><span style="color:${TIERS[RANKS[ri].tier].glow}">${RANKS[ri].name}</span> · ${fmt(s.bestRatio, 2)}× BW · est. 1RM ${fmtKg(def.bw ? s.bestE1 - bw : s.bestE1)}${def.bw ? ' extra' : ''}</div>
          ${target}
        </div>
        <div class="mmr">${fmt(s.bestMMR, 0)}</div>
      </li>`;
    }).join('');
    return `
    <section class="panel rank-hero tier-bg-${t.key}" style="--glow:${C.count ? t.glow : '#3a5687'}">
      <div class="panel-title"><span>STRENGTH RANKING</span></div>
      ${C.count && C.ranked.length && C.placement ? `<div class="placement">PLACEMENTS · ${C.musclesRanked}/4 muscles ranked</div>` : ''}
      <div class="hero-emblem">${emblem(C.ranked.length ? C.rank : null, 170, 'float')}</div>
      <div class="hero-name" style="color:${C.ranked.length ? t.glow : 'var(--muted)'}">${C.ranked.length ? rk.name : 'UNRANKED'}</div>
      <div class="hero-mmr"><b>${fmt(C.mmr, 0)}</b> MMR</div>
      ${C.ranked.length ? `
      <div class="div-progress">
        <div class="bar"><i style="width:${pct}%;background:linear-gradient(90deg, ${t.c2}, ${t.glow})"></i></div>
        <div class="xp-row"><span>${rk.name}</span><span>${next ? `${fmt(Math.max(1, next.min - C.mmr), 0)} MMR to ${next.name}` : 'Max rank'}</span></div>
      </div>` : '<p class="empty">Log exercises from the library (bench, squat, deadlift…) to get ranked.</p>'}
    </section>

    <section class="panel">
      <div class="panel-title"><span>MUSCLE MAP</span></div>
      ${bodyMap(C.muscles, state.selMuscle)}
      <ul class="muscle-list">${MUSCLES.map(m => {
        const mm = C.muscles[m.key], ri = mm.mmr !== null ? rankIdx(mm.mmr) : null;
        return `<li class="${state.selMuscle === m.key ? 'sel' : ''} ${ri === null ? 'off' : ''}" data-muscle="${m.key}">
          ${emblem(ri, 34)}
          <div><b>${m.name}${m.main ? '' : ' <small>extra</small>'}</b><span>${ri === null ? 'Untrained' : `<i style="color:${TIERS[RANKS[ri].tier].glow}">${RANKS[ri].name}</i> · ${esc(getEx(mm.best).name)}`}</span></div>
        </li>`;
      }).join('')}</ul>
      ${C.ranked.length && C.musclesRanked < 8 ? `<p class="hint">⚠ ${8 - C.musclesRanked} untrained main muscle${8 - C.musclesRanked > 1 ? 's count' : ' counts'} as 0 in your overall rank. Train your whole body to climb.</p>` : ''}
    </section>

    <section class="panel">
      <div class="panel-title"><span>RANK BY EXERCISE</span></div>
      ${exRows ? `<ul class="rank-list">${exRows}</ul>` : '<p class="empty">No ranked exercises yet.</p>'}
      <details class="how">
        <summary>How does the ranking work?</summary>
        <p>For each exercise the System calculates your <b>estimated 1RM</b> (Epley formula) and divides it by your <b>bodyweight</b> on that day. That ratio is compared with strength standards (beginner → elite) and converted to MMR.</p>
        <p>Each <b>muscle</b> takes the rank of your best exercise that trains it (e.g. Chest uses the best of your bench presses, pec deck and dips).</p><p>Your <b>overall rank</b> is the average of the 8 main muscles (chest, back, shoulders, biceps, triceps, quads, hamstrings and glutes). Untrained muscles count as 0, so a balanced physique climbs faster. Calves and abs show on the map but don't count. You need 4 ranked muscles to finish placements.</p><p>For bodyweight exercises (pull-ups, dips) your bodyweight + added load counts.</p>
        <p>Beginner ≈ Silver · Novice ≈ Gold · Intermediate ≈ Platinum · Advanced ≈ Champion · Elite ≈ Grand Champion.</p>
      </details>
    </section>

    <section class="panel">
      <div class="panel-title"><span>RANK LADDER</span></div>
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

  progress() {
    const RANGES = { '1M': 30, '3M': 91, '6M': 182, '1Y': 365, ALL: 1e6 };
    const range = RANGES[state.range] ? state.range : '3M';
    const inRange = d => daysBetween(d, todayISO()) <= RANGES[range];
    const p = state.profile;

    /* --- peso corporal --- */
    const bwAll = bodyweightSeries();
    const bwPts = bwAll.filter(x => inRange(x.t));
    const bwNow = bwAll.length ? bwAll[bwAll.length - 1].v : num(p.bw);
    const bwGoal = num(p.bwGoal) || null;
    const bwDelta = bwPts.length > 1 ? bwPts[bwPts.length - 1].v - bwPts[0].v : 0;
    let bwGoalHtml = '';
    if (bwGoal) {
      const start = bwAll.length ? bwAll[0].v : bwNow;
      const left = bwNow - bwGoal;
      const pct = start === bwGoal ? 100 : clamp((start - bwNow) / (start - bwGoal) * 100, 0, 100);
      bwGoalHtml = `<div class="goal-box"><div class="xp-row"><span>GOAL ${fmtKg(bwGoal)}</span><span>${Math.abs(left) < 0.05 ? 'REACHED ✓' : `${fmt(Math.abs(left))} kg to ${left > 0 ? 'lose' : 'gain'}`}</span></div><div class="bar gold-bar"><i style="width:${pct}%"></i></div></div>`;
    }

    /* --- carga por exercício --- */
    const exList = Object.values(C.ex).sort((a, b) => b.last.date.localeCompare(a.last.date));
    const exId = state.progEx && C.ex[state.progEx] ? state.progEx : exList[0]?.id;
    const s = exId ? C.ex[exId] : null, def = exId ? getEx(exId) : null;
    const METRICS = { w: 'Top set', e1: 'Est. 1RM', v: 'Best set vol.', sv: 'Session vol.' };
    const metric = METRICS[state.metric] ? state.metric : 'w';
    const goal = exId ? num(state.goals?.[exId]) || null : null;
    let loadHtml = '<p class="empty">Log workouts to see how your loads evolve.</p>';
    if (s) {
      const pts = s.hist.filter(h => inRange(h.date)).map(h => ({ t: h.date, v: h[metric] }));
      const isVol = metric === 'v' || metric === 'sv';
      const unit = def.bw && metric === 'w' ? 'kg added' : 'kg';
      const first = pts[0]?.v, last = pts[pts.length - 1]?.v;
      const diff = pts.length > 1 ? last - first : 0;
      const pctCh = pts.length > 1 && first ? diff / first * 100 : 0;
      const goalLine = goal && metric === 'w' ? goal : null;
      let goalBox = '';
      if (goal) {
        const start = s.hist[0].w, cur = s.bestW.w;
        const pct = cur >= goal ? 100 : goal <= start ? 0 : clamp((cur - start) / (goal - start) * 100, 0, 100);
        goalBox = `<div class="goal-box"><div class="xp-row"><span>TARGET ${def.bw ? '+' : ''}${fmtKg(goal)}</span><span>${cur >= goal ? 'REACHED ✓ +200 EXP' : `best ${fmtKg(cur)} · ${fmt(goal - cur)} kg to go`}</span></div><div class="bar gold-bar"><i style="width:${pct}%"></i></div></div>`;
      }
      loadHtml = `
        <label class="field-lbl">Exercise
          <select id="prog-ex">${exList.map(e => `<option value="${e.id}" ${e.id === exId ? 'selected' : ''}>${esc(getEx(e.id)?.name)}</option>`).join('')}</select>
        </label>
        <div class="chips seg">${Object.entries(METRICS).map(([k, l]) => `<button class="chip ${k === metric ? 'on' : ''}" data-metric="${k}">${l}</button>`).join('')}</div>
        <div class="summary">
          <div><span>NOW</span><b>${pts.length ? fmt(last, isVol ? 0 : 1) : '—'}<small> ${unit}</small></b></div>
          <div><span>CHANGE</span><b class="${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}">${diff > 0 ? '+' : ''}${fmt(diff, isVol ? 0 : 1)}<small> ${pts.length > 1 ? `(${pctCh > 0 ? '+' : ''}${fmt(pctCh, 0)}%)` : ''}</small></b></div>
          <div><span>SESSIONS</span><b>${pts.length}</b></div>
        </div>
        ${lineChart('load', pts, { goal: goalLine, unit, digits: isVol ? 0 : 1, empty: 'Log this exercise at least twice in this period to see the chart.' })}
        ${goalBox}
        <form class="inline-form" id="exgoal-form" data-ex="${exId}">
          <input name="goal" inputmode="decimal" placeholder="${def.bw ? 'Target added weight (kg)' : 'Target weight (kg)'}" value="${goal ? esc(goal) : ''}">
          <button class="btn sm primary" type="submit">${goal ? 'UPDATE' : 'SET TARGET'}</button>
          ${goal ? `<button class="icon-btn sm" type="button" data-act="cleargoal" data-ex="${exId}" aria-label="Remove target">${IC.x}</button>` : ''}
        </form>`;
    }

    /* --- volume semanal --- */
    const weekVol = {};
    for (const w of state.workouts) if (inRange(w.date)) weekVol[weekKey(w.date)] = (weekVol[weekKey(w.date)] || 0) + (C.perWorkout[w.id]?.vol || 0);
    const wkKeys = Object.keys(weekVol).sort();
    const bars = [];
    if (wkKeys.length) {
      const d = dateObj(wkKeys[0]), end = weekKey(todayISO());
      while (d.toISOString().slice(0, 10) <= end) { const k = d.toISOString().slice(0, 10); bars.push({ t: k, v: weekVol[k] || 0 }); d.setDate(d.getDate() + 7); }
    }

    /* --- objetivos ativos --- */
    const goals = Object.entries(state.goals || {}).filter(([id, g]) => num(g) > 0 && getEx(id));

    return `
    <div class="chips seg range">${Object.keys(RANGES).map(k => `<button class="chip ${k === range ? 'on' : ''}" data-range="${k}">${k}</button>`).join('')}</div>

    <section class="panel">
      <div class="panel-title"><span>BODYWEIGHT</span></div>
      <div class="summary">
        <div><span>NOW</span><b>${fmt(bwNow)}<small> kg</small></b></div>
        <div><span>CHANGE</span><b class="${bwDelta && bwGoal ? ((bwGoal - bwPts[0].v) * bwDelta > 0 ? 'up' : 'down') : ''}">${bwDelta > 0 ? '+' : ''}${fmt(bwDelta)}<small> kg</small></b></div>
        <div><span>ENTRIES</span><b>${bwPts.length}</b></div>
      </div>
      ${lineChart('bw', bwPts, { goal: bwGoal, unit: 'kg', digits: 1, color: '#b98cff', empty: 'Log your weight at least twice in this period to see the chart.' })}
      ${bwGoalHtml}
      <form class="inline-form" id="bwlog-form">
        <input name="bw" inputmode="decimal" placeholder="Today's weight (kg)">
        <button class="btn sm primary" type="submit">LOG</button>
      </form>
      <form class="inline-form" id="bwgoal-form">
        <input name="goal" inputmode="decimal" placeholder="Goal weight (kg)" value="${bwGoal ? esc(bwGoal) : ''}">
        <button class="btn sm" type="submit">${bwGoal ? 'UPDATE GOAL' : 'SET GOAL'}</button>
      </form>
    </section>

    <section class="panel">
      <div class="panel-title"><span>LOAD PROGRESS</span></div>
      ${loadHtml}
    </section>

    <section class="panel">
      <div class="panel-title"><span>WEEKLY VOLUME</span></div>
      ${barChart('vol', bars)}
    </section>

    ${goals.length ? `<section class="panel">
      <div class="panel-title"><span>TARGETS</span></div>
      <ul class="goal-list">${goals.map(([id, g]) => {
        const st = C.ex[id], cur = st ? st.bestW.w : 0, done = cur >= num(g);
        const start = st ? st.hist[0].w : 0;
        const pct = done ? 100 : num(g) <= start ? 0 : clamp((cur - start) / (num(g) - start) * 100, 0, 100);
        return `<li class="${done ? 'done' : ''}" data-progex="${id}"><div class="xp-row"><b>${esc(getEx(id).name)}</b><span>${fmt(cur)} / ${fmt(num(g))} kg${done ? ' ✓' : ''}</span></div><div class="bar gold-bar"><i style="width:${pct}%"></i></div></li>`;
      }).join('')}</ul>
    </section>` : ''}`;
  },

  records() {
    const list = Object.values(C.ex).sort((a, b) => b.last.date.localeCompare(a.last.date));
    if (!list.length) return `<section class="panel"><div class="panel-title"><span>RECORDS</span></div><p class="empty">Log workouts to see your records for each exercise.</p></section>`;
    const filter = state.recFilter || 'All';
    const groups = ['All', ...GROUPS.filter(g => list.some(s => getEx(s.id)?.group === g))];
    return `
      <div class="chips">${groups.map(g => `<button class="chip ${g === filter ? 'on' : ''}" data-filter="${g}">${g}</button>`).join('')}</div>
      ${list.filter(s => filter === 'All' || getEx(s.id)?.group === filter).map(s => {
        const def = getEx(s.id); if (!def) return '';
        const ri = s.bestMMR !== null ? rankIdx(s.bestMMR) : null;
        const lbl = w => def.bw ? (w ? `BW+${fmt(w)}kg` : 'BW') : fmtKg(w);
        return `<details class="panel rec">
          <summary>
            ${emblem(ri, 44)}
            <div class="rec-main">
              <b>${esc(def.name)}</b>
              <span>${s.sessions} sessions · last ${fmtDateShort(s.last.date)}${s.prs ? ` · <i class="gold">${s.prs} PR</i>` : ''}</span>
            </div>
            <span class="chev">${IC.chev}</span>
          </summary>
          <div class="rec-grid">
            <div class="rbox w"><span>▲ HEAVIEST</span><b>${lbl(s.bestW.w)}</b><small>× ${s.bestW.r} reps · ${fmtDateShort(s.bestW.date)}</small></div>
            <div class="rbox v"><span>◆ BEST SET VOLUME</span><b>${fmtKg(s.bestVol.v, 0)}</b><small>${lbl(s.bestVol.w)} × ${s.bestVol.r} · ${fmtDateShort(s.bestVol.date)}</small></div>
            <div class="rbox e"><span>ESTIMATED 1RM</span><b>${fmtKg(s.bestE1)}</b><small>${ri !== null ? RANKS[ri].name : 'unranked'}</small></div>
          </div>
          ${chart(s.hist)}
          <button class="btn sm ghost wide" data-progex="${s.id}">VIEW PROGRESS & TARGET ›</button>
          <ul class="hist">${[...s.hist].reverse().slice(0, 8).map(h => `<li><span>${fmtDate(h.date)}</span><span>top ${lbl(h.w)}</span><span>vol ${fmtKg(h.v, 0)}</span><span>1RM ${fmt(h.e1, 0)}</span></li>`).join('')}</ul>
        </details>`;
      }).join('')}`;
  },

  profile() {
    const p = state.profile;
    return `${window.Social ? Social.accountPanel() : ''}
    <section class="panel">
      <div class="panel-title"><span>HUNTER PROFILE</span></div>
      <form id="profile-form" class="form">
        <label>Name<input name="name" value="${esc(p.name)}" maxlength="24" autocomplete="off"></label>
        <label>Bodyweight (kg)<input name="bw" value="${esc(p.bw)}" inputmode="decimal"></label>
        <label>Rest between sets (seconds)<input name="rest" value="${esc(p.rest || 90)}" inputmode="numeric"></label>
        <label>Strength standards
          <select name="sex"><option value="m" ${p.sex !== 'f' ? 'selected' : ''}>Male</option><option value="f" ${p.sex === 'f' ? 'selected' : ''}>Female</option></select>
        </label>
        <p class="hint">Your bodyweight is saved with every new workout — update it whenever you weigh yourself. The ranking uses the weight you had on the day of each workout.</p>
        <button class="btn primary wide" type="submit">SAVE</button>
      </form>
    </section>

    <section class="panel">
      <div class="panel-title"><span>CUSTOM EXERCISES</span></div>
      ${state.custom.length ? `<ul class="custom-list">${state.custom.map(c => `<li><span>${esc(c.name)} <small>${esc(c.group)}${c.bw ? ' · bodyweight' : ''}</small></span><button class="icon-btn" data-delcustom="${c.id}" aria-label="Delete">${IC.trash}</button></li>`).join('')}</ul>` : '<p class="empty">Create new exercises when adding an exercise to a workout. They count for EXP and records (not for rank).</p>'}
    </section>

    <section class="panel">
      <div class="panel-title"><span>DATA</span></div>
      <p class="hint">Your data is stored only on this device/browser. Make backups.</p>
      <div class="btn-col">
        <button class="btn" data-act="export">Export backup (JSON)</button>
        <label class="btn">Import backup<input type="file" accept="application/json,.json" id="import-file" hidden></label>
        <button class="btn ghost" data-act="demo">Load sample data</button>
        <button class="btn danger" data-act="reset">Delete all data</button>
      </div>
    </section>`;
  },
};

function prRow(p) {
  const def = getEx(p.exId); if (!def) return '';
  const lbl = w => def.bw ? (w ? `BW+${fmt(w)}kg` : 'BW') : fmtKg(w);
  return `<li class="${p.type}">
    ${prBadge(p.type, true)}
    <div><b>${esc(def.name)}</b><span>${p.type === 'w' ? `${lbl(p.w)} × ${p.r} <i>(was ${lbl(p.prev)})</i>` : `${lbl(p.w)} × ${p.r} = ${fmtKg(p.v, 0)} <i>(was ${fmt(p.prev, 0)})</i>`}</span></div>
    <time>${fmtDateShort(p.date)}</time>
  </li>`;
}

function chart(hist) {
  if (hist.length < 2) return '<p class="hint">Log more sessions to see your estimated 1RM progress.</p>';
  const W = 320, H = 110, P = 14;
  const vals = hist.map(h => h.e1), mn = Math.min(...vals), mx = Math.max(...vals), rng = mx - mn || 1;
  const t0 = dateObj(hist[0].date), span = (dateObj(hist[hist.length - 1].date) - t0) || 1;
  const pts = hist.map(h => [P + (dateObj(h.date) - t0) / span * (W - 2 * P), H - P - (h.e1 - mn) / rng * (H - 2 * P - 10)]);
  const line = pts.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ');
  const id = 'ch' + (gid++);
  return `<div class="chart"><div class="chart-lbl"><span>ESTIMATED 1RM PROGRESS</span><span>${fmt(mn, 0)} → ${fmt(mx, 0)} kg</span></div>
  <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3fb6ff" stop-opacity=".45"/><stop offset="1" stop-color="#3fb6ff" stop-opacity="0"/></linearGradient></defs>
    ${[0.25, 0.5, 0.75].map(f => `<line x1="0" x2="${W}" y1="${H * f}" y2="${H * f}" stroke="rgba(90,160,255,.12)"/>`).join('')}
    <polygon points="${pts[0][0]},${H} ${line} ${pts[pts.length - 1][0]},${H}" fill="url(#${id})"/>
    <polyline points="${line}" fill="none" stroke="#5fd3ff" stroke-width="2.2" vector-effect="non-scaling-stroke" style="filter:drop-shadow(0 0 4px #3fa9ff)"/>
    ${pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="2.6" fill="#e6f6ff"/>`).join('')}
  </svg></div>`;
}


/* ---------- gráficos de evolução (peso/tempo) ---------- */
function bodyweightSeries() {
  const map = {};
  for (const w of state.workouts) if (num(w.bw)) map[w.date] = num(w.bw);
  for (const e of state.bwLog || []) if (num(e.bw)) map[e.date] = num(e.bw); // registos manuais têm prioridade
  return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).map(([t, v]) => ({ t, v }));
}

const CH = {}; // dados dos gráficos visíveis, para o cursor
const CW = 340, CHH = 190, CL = 42, CR = 12, CT = 16, CB = 26;
function niceTicks(mn, mx) {
  const span = mx - mn, raw = span / 3, mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(st => span / st <= 4) || mag * 10;
  const out = []; for (let v = Math.ceil(mn / step) * step; v <= mx + 1e-9; v += step) out.push(v);
  return out;
}
const shortNum = v => Math.abs(v) >= 10000 ? fmt(v / 1000, 0) + 'k' : Math.abs(v) >= 1000 ? fmt(v / 1000, 1) + 'k' : fmt(v, 1);

function chartFrame(mn, mx, ts, Y) {
  let g = niceTicks(mn, mx).map(v => `<line x1="${CL}" x2="${CW - CR}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="lc-grid"/>
    <text x="${CL - 6}" y="${(Y(v) + 3.5).toFixed(1)}" class="lc-y">${shortNum(v)}</text>`).join('');
  const t0 = ts[0], t1 = ts[ts.length - 1];
  const lbl = [t0, t1]; if (ts.length > 2) lbl.splice(1, 0, t0 + (t1 - t0) / 2);
  g += lbl.map((t, i) => {
    const x = CL + (t1 === t0 ? 0 : (t - t0) / (t1 - t0)) * (CW - CL - CR);
    const d = new Date(t).toISOString().slice(0, 10);
    return `<text x="${x.toFixed(1)}" y="${CHH - 7}" class="lc-x" text-anchor="${i === 0 ? 'start' : i === lbl.length - 1 ? 'end' : 'middle'}">${fmtDateShort(d)}</text>`;
  }).join('');
  return g;
}

function lineChart(id, pts, o = {}) {
  if (pts.length < 2) return `<p class="hint chart-empty">${o.empty || 'Not enough data yet.'}</p>`;
  const color = o.color || '#5fd3ff';
  const ts = pts.map(p => dateObj(p.t).getTime());
  let mn = Math.min(...pts.map(p => p.v)), mx = Math.max(...pts.map(p => p.v));
  if (o.goal) { mn = Math.min(mn, o.goal); mx = Math.max(mx, o.goal); }
  const pad = (mx - mn) * 0.12 || Math.max(1, mx * 0.04); mn -= pad; mx += pad;
  if (mn < 0 && Math.min(...pts.map(p => p.v)) >= 0) mn = 0;
  const t0 = ts[0], span = (ts[ts.length - 1] - t0) || 1;
  const X = t => CL + (t - t0) / span * (CW - CL - CR);
  const Y = v => CT + (1 - (v - mn) / (mx - mn)) * (CHH - CT - CB);
  const xy = pts.map((p, i) => [X(ts[i]), Y(p.v)]);
  const line = xy.map(q => q.map(n => n.toFixed(1)).join(',')).join(' ');
  CH[id] = { xy, pts, unit: o.unit || 'kg', digits: o.digits ?? 1 };
  const last = xy[xy.length - 1];
  const g = 'lg' + (gid++);
  return `<div class="lc" data-chart="${id}" style="--c:${color}">
    <div class="lc-read" id="${id}-read">${readout(CH[id], pts.length - 1)}</div>
    <svg viewBox="0 0 ${CW} ${CHH}" role="img" aria-label="Progress chart">
      <defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".38"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
      ${chartFrame(mn, mx, ts, Y)}
      ${o.goal ? `<line x1="${CL}" x2="${CW - CR}" y1="${Y(o.goal).toFixed(1)}" y2="${Y(o.goal).toFixed(1)}" class="lc-goal"/>
        <text x="${CW - CR}" y="${(Y(o.goal) - 5).toFixed(1)}" class="lc-goal-t" text-anchor="end">GOAL ${fmt(o.goal)}</text>` : ''}
      <polygon points="${xy[0][0].toFixed(1)},${CHH - CB} ${line} ${last[0].toFixed(1)},${CHH - CB}" fill="url(#${g})"/>
      <polyline points="${line}" class="lc-line"/>
      ${xy.length <= 60 ? xy.map(q => `<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="2.6" class="lc-pt"/>`).join('') : ''}
      <line class="lc-cur" x1="${last[0]}" x2="${last[0]}" y1="${CT}" y2="${CHH - CB}"/>
      <circle class="lc-dot" cx="${last[0]}" cy="${last[1]}" r="5"/>
    </svg></div>`;
}

function barChart(id, bars) {
  if (!bars.length || bars.every(b => !b.v)) return '<p class="hint chart-empty">No workouts in this period.</p>';
  const mx = Math.max(...bars.map(b => b.v)) * 1.1, mn = 0;
  const ts = bars.map(b => dateObj(b.t).getTime());
  const n = bars.length, slot = (CW - CL - CR) / n, bw = Math.max(2, Math.min(26, slot * 0.7));
  const X = i => CL + slot * (i + 0.5);
  const Y = v => CT + (1 - (v - mn) / (mx - mn)) * (CHH - CT - CB);
  const xy = bars.map((b, i) => [X(i), Y(b.v)]);
  CH[id] = { xy, pts: bars, unit: 'kg', digits: 0, week: true };
  // eixo x por semana: usa posições das barras
  const lbl = [0, n - 1]; if (n > 2) lbl.splice(1, 0, Math.floor((n - 1) / 2));
  const frame = niceTicks(mn, mx).map(v => `<line x1="${CL}" x2="${CW - CR}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="lc-grid"/>
    <text x="${CL - 6}" y="${(Y(v) + 3.5).toFixed(1)}" class="lc-y">${shortNum(v)}</text>`).join('')
    + [...new Set(lbl)].map((i, k, arr) => `<text x="${X(i).toFixed(1)}" y="${CHH - 7}" class="lc-x" text-anchor="${n === 1 ? 'middle' : k === 0 ? 'start' : k === arr.length - 1 ? 'end' : 'middle'}">${fmtDateShort(bars[i].t)}</text>`).join('');
  let li = n - 1; while (li > 0 && !bars[li].v) li--;
  const last = xy[li];
  return `<div class="lc" data-chart="${id}" style="--c:#5fd3ff">
    <div class="lc-read" id="${id}-read">${readout(CH[id], li)}</div>
    <svg viewBox="0 0 ${CW} ${CHH}" role="img" aria-label="Weekly volume chart">
      ${frame}
      ${xy.map((q, i) => `<rect x="${(q[0] - bw / 2).toFixed(1)}" y="${q[1].toFixed(1)}" width="${bw.toFixed(1)}" height="${(CHH - CB - q[1]).toFixed(1)}" rx="2" class="lc-bar ${i === li ? 'sel' : ''}"/>`).join('')}
      <line class="lc-cur" x1="${last[0]}" x2="${last[0]}" y1="${CT}" y2="${CHH - CB}"/>
      <circle class="lc-dot" cx="${last[0]}" cy="${last[1]}" r="4"/>
    </svg></div>`;
}

function readout(c, i) {
  const p = c.pts[i];
  const when = c.week ? `Week of ${fmtDateShort(p.t)}` : fmtDate(p.t);
  return `<span>${when}</span><b>${fmt(p.v, c.digits)} <small>${c.unit}</small></b>`;
}

function scrub(ev) {
  const wrap = ev.target.closest?.('.lc'); if (!wrap) return;
  const c = CH[wrap.dataset.chart]; if (!c) return;
  const svg = $('svg', wrap), r = svg.getBoundingClientRect();
  const x = (ev.clientX - r.left) / r.width * CW;
  let bi = 0; c.xy.forEach((q, i) => { if (Math.abs(q[0] - x) < Math.abs(c.xy[bi][0] - x)) bi = i; });
  const [qx, qy] = c.xy[bi];
  const cur = $('.lc-cur', svg), dot = $('.lc-dot', svg);
  cur.setAttribute('x1', qx); cur.setAttribute('x2', qx); dot.setAttribute('cx', qx); dot.setAttribute('cy', qy);
  $$('.lc-bar', svg).forEach((b, i) => b.classList.toggle('sel', i === bi));
  $('.lc-read', wrap).innerHTML = readout(c, bi);
}
document.addEventListener('pointermove', scrub);
document.addEventListener('pointerdown', scrub);


/* ---------- planos de treino ---------- */
const EQUIP = [
  ['barbell', 'Barbell & plates'], ['rack', 'Squat / power rack'], ['bench', 'Adjustable bench'], ['dumbbells', 'Dumbbells'],
  ['ezbar', 'EZ curl bar'], ['kettlebell', 'Kettlebells'], ['pullup', 'Pull-up bar'], ['dip', 'Dip station'],
  ['cable', 'Cable machine'], ['latpull', 'Lat pulldown'], ['seatedrow', 'Seated row machine'], ['tbar', 'T-bar row'],
  ['smith', 'Smith machine'], ['legpress', 'Leg press'], ['hacksquat', 'Hack squat'], ['legext', 'Leg extension'],
  ['legcurl', 'Leg curl'], ['calf', 'Calf raise machine'], ['abductor', 'Hip abduction / adduction'], ['chestpress', 'Chest press machine'],
  ['pecdeck', 'Pec deck / rear delt'], ['shoulderpress', 'Shoulder press machine'], ['backext', 'Back extension bench'], ['crunch', 'Ab crunch machine'],
];
const EQUIP_PRESETS = {
  full: { name: 'Full gym', eq: EQUIP.map(e => e[0]) },
  barbell: { name: 'Barbell gym', eq: ['barbell', 'rack', 'bench', 'dumbbells', 'ezbar', 'pullup', 'dip'] },
  home: { name: 'Home (dumbbells)', eq: ['dumbbells', 'bench', 'pullup', 'kettlebell'] },
  bw: { name: 'Bodyweight only', eq: ['pullup', 'dip'] },
};
// equipamento necessário: cada item é obrigatório; um array interno = qualquer um serve
const REQ = {
  supino: ['barbell', 'bench'], supino_incl: ['barbell', 'bench'], supino_halt: ['dumbbells', 'bench'], supino_incl_halt: ['dumbbells', 'bench'],
  peck_deck: ['pecdeck'], dips: ['dip'], peso_morto: ['barbell'], remada_barra: ['barbell'], remada_halt: ['dumbbells', 'bench'],
  elevacoes: ['pullup'], puxada: ['latpull'], remada_polia: ['seatedrow'], agachamento: ['barbell', 'rack'], agach_frontal: ['barbell', 'rack'],
  leg_press: ['legpress'], rdl: ['barbell'], hip_thrust: ['barbell', 'bench'], afundos: ['dumbbells'], leg_ext: ['legext'], leg_curl: ['legcurl'],
  gemeos: ['calf'], press_militar: ['barbell'], press_halt: ['dumbbells', 'bench'], elev_lateral: ['dumbbells'], face_pull: ['cable'],
  curl_barra: ['barbell'], curl_halt: ['dumbbells'], triceps_polia: ['cable'], triceps_frances: [['ezbar', 'barbell'], 'bench'], abd_polia: ['cable'],
  decline_bench: ['barbell', 'bench'], smith_bench: ['smith', 'bench'], chest_press: ['chestpress'], incline_machine: ['chestpress'],
  db_fly: ['dumbbells', 'bench'], cable_fly: ['cable'], pushup: [], pendlay: ['barbell'], tbar_row: [['tbar', 'barbell']], machine_row: ['seatedrow'],
  chinup: ['pullup'], close_pulldown: ['latpull'], straight_arm: ['cable'], sumo_dl: ['barbell'], rack_pull: ['barbell', 'rack'], shrug: ['barbell'],
  back_ext: ['backext'], hack_squat: ['hacksquat'], smith_squat: ['smith'], goblet: [['dumbbells', 'kettlebell']], walking_lunge: ['dumbbells'],
  step_up: ['dumbbells', 'bench'], good_morning: ['barbell', 'rack'], seated_leg_curl: ['legcurl'], glute_bridge: ['barbell'],
  hip_abduction: ['abductor'], hip_adduction: ['abductor'], cable_kickback: ['cable'], seated_calf: ['calf'], standing_calf: [['smith', 'calf']],
  arnold: ['dumbbells', 'bench'], machine_shoulder: ['shoulderpress'], push_press: ['barbell', 'rack'], cable_lateral: ['cable'],
  rear_delt: ['dumbbells'], reverse_pec: ['pecdeck'], front_raise: ['dumbbells'], upright_row: [['barbell', 'ezbar', 'cable']],
  landmine_press: ['barbell'], hammer: ['dumbbells'], preacher: ['ezbar'], ez_curl: ['ezbar'], cable_curl: ['cable'],
  incline_curl: ['dumbbells', 'bench'], concentration: ['dumbbells', 'bench'], close_grip: ['barbell', 'bench'], overhead_ext: ['cable'],
  db_overhead_ext: ['dumbbells'], rope_pushdown: ['cable'], bench_dips: ['bench'], wrist_curl: [['dumbbells', 'barbell']],
  machine_crunch: ['crunch'], hanging_leg: ['pullup'], decline_situp: ['bench'], russian_twist: [], thruster: ['barbell'],
  kb_swing: ['kettlebell'], farmer_walk: [['dumbbells', 'kettlebell']],
  bw_squat: [], bw_lunge: [], pistol: [], bw_glute_bridge: [], bw_calf: [], nordic: [], pike_pushup: [], diamond_pushup: [],
  inverted_row: [['pullup', 'smith', 'rack']], crunch: [],
};
const canDo = (id, gym) => id in REQ && REQ[id].every(r => Array.isArray(r) ? r.some(k => gym.has(k)) : gym.has(r));

// padrões de movimento → candidatos por ordem de preferência
const SLOTS = {
  squat: ['agachamento', 'hack_squat', 'leg_press', 'smith_squat', 'agach_frontal', 'goblet', 'walking_lunge', 'afundos', 'bw_squat', 'pistol'],
  quad2: ['leg_press', 'hack_squat', 'afundos', 'walking_lunge', 'smith_squat', 'agach_frontal', 'goblet', 'step_up', 'bw_lunge', 'pistol', 'bw_squat'],
  quadIso: ['leg_ext', 'walking_lunge', 'step_up', 'goblet', 'afundos', 'bw_lunge', 'pistol'],
  hinge: ['peso_morto', 'rdl', 'sumo_dl', 'rack_pull', 'good_morning', 'kb_swing', 'back_ext', 'glute_bridge', 'nordic', 'bw_glute_bridge'],
  hingeLight: ['rdl', 'good_morning', 'hip_thrust', 'back_ext', 'kb_swing', 'glute_bridge', 'peso_morto', 'bw_glute_bridge', 'nordic'],
  hamIso: ['leg_curl', 'seated_leg_curl', 'rdl', 'good_morning', 'back_ext', 'kb_swing', 'nordic'],
  glute: ['hip_thrust', 'glute_bridge', 'cable_kickback', 'hip_abduction', 'step_up', 'walking_lunge', 'bw_glute_bridge', 'bw_lunge'],
  calf: ['gemeos', 'standing_calf', 'seated_calf', 'bw_calf'],
  hPush: ['supino', 'supino_halt', 'chest_press', 'smith_bench', 'dips', 'pushup'],
  inclinePush: ['supino_incl_halt', 'supino_incl', 'incline_machine', 'smith_bench', 'landmine_press', 'pushup', 'pike_pushup'],
  chestIso: ['peck_deck', 'cable_fly', 'db_fly', 'dips', 'pushup'],
  vPush: ['press_militar', 'press_halt', 'machine_shoulder', 'arnold', 'landmine_press', 'push_press', 'pike_pushup'],
  latRaise: ['elev_lateral', 'cable_lateral', 'upright_row', 'pike_pushup'],
  rearDelt: ['face_pull', 'reverse_pec', 'rear_delt', 'inverted_row'],
  vPull: ['elevacoes', 'puxada', 'chinup', 'close_pulldown', 'straight_arm', 'inverted_row'],
  hPull: ['remada_barra', 'remada_polia', 'remada_halt', 'tbar_row', 'machine_row', 'pendlay', 'inverted_row'],
  hPull2: ['remada_halt', 'machine_row', 'remada_polia', 'tbar_row', 'pendlay', 'remada_barra', 'inverted_row'],
  traps: ['shrug', 'farmer_walk', 'upright_row'],
  biceps: ['curl_barra', 'curl_halt', 'ez_curl', 'cable_curl', 'preacher', 'hammer', 'chinup'],
  biceps2: ['hammer', 'incline_curl', 'preacher', 'cable_curl', 'concentration', 'curl_halt'],
  triceps: ['triceps_polia', 'rope_pushdown', 'close_grip', 'dips', 'triceps_frances', 'db_overhead_ext', 'bench_dips', 'diamond_pushup'],
  triceps2: ['overhead_ext', 'db_overhead_ext', 'triceps_frances', 'rope_pushdown', 'bench_dips', 'dips', 'diamond_pushup'],
  forearm: ['wrist_curl', 'farmer_walk', 'hammer'],
  core: ['abd_polia', 'machine_crunch', 'hanging_leg', 'decline_situp', 'russian_twist', 'crunch'],
};
// m = principal, a = acessório, i = isolamento
const DAY_T = {
  push: { name: 'Push', focus: 'Chest · Shoulders · Triceps', slots: [['hPush', 'm'], ['vPush', 'm'], ['inclinePush', 'a'], ['chestIso', 'i'], ['latRaise', 'i'], ['triceps', 'i'], ['triceps2', 'i']] },
  pull: { name: 'Pull', focus: 'Back · Rear delts · Biceps', slots: [['vPull', 'm'], ['hPull', 'm'], ['hPull2', 'a'], ['rearDelt', 'i'], ['biceps', 'i'], ['biceps2', 'i'], ['traps', 'i']] },
  legs: { name: 'Legs', focus: 'Quads · Hamstrings · Glutes · Calves', slots: [['squat', 'm'], ['hingeLight', 'm'], ['quad2', 'a'], ['hamIso', 'i'], ['glute', 'a'], ['calf', 'i'], ['core', 'i']] },
  upper: { name: 'Upper', focus: 'Chest · Back · Shoulders · Arms', slots: [['hPush', 'm'], ['hPull', 'm'], ['vPush', 'a'], ['vPull', 'a'], ['latRaise', 'i'], ['biceps', 'i'], ['triceps', 'i']] },
  lower: { name: 'Lower', focus: 'Quads · Hamstrings · Glutes · Core', slots: [['squat', 'm'], ['hinge', 'm'], ['quad2', 'a'], ['hamIso', 'i'], ['glute', 'a'], ['calf', 'i'], ['core', 'i']] },
  full: { name: 'Full Body', focus: 'Whole body', slots: [['squat', 'm'], ['hPush', 'm'], ['hPull', 'm'], ['hingeLight', 'a'], ['vPush', 'a'], ['vPull', 'a'], ['core', 'i']] },
  chest: { name: 'Chest', focus: 'Chest · Triceps', slots: [['hPush', 'm'], ['inclinePush', 'm'], ['chestIso', 'a'], ['hPush', 'a'], ['chestIso', 'i'], ['triceps', 'i'], ['core', 'i']] },
  back: { name: 'Back', focus: 'Back · Traps', slots: [['vPull', 'm'], ['hPull', 'm'], ['hPull2', 'a'], ['vPull', 'a'], ['hinge', 'a'], ['traps', 'i'], ['rearDelt', 'i']] },
  shoulders: { name: 'Shoulders', focus: 'Delts · Traps', slots: [['vPush', 'm'], ['latRaise', 'a'], ['rearDelt', 'i'], ['vPush', 'a'], ['latRaise', 'i'], ['traps', 'i'], ['core', 'i']] },
  arms: { name: 'Arms', focus: 'Biceps · Triceps · Forearms', slots: [['biceps', 'a'], ['triceps', 'a'], ['biceps2', 'i'], ['triceps2', 'i'], ['biceps', 'i'], ['triceps', 'i'], ['forearm', 'i']] },
  chestback: { name: 'Chest & Back', focus: 'Chest · Back', slots: [['hPush', 'm'], ['vPull', 'm'], ['inclinePush', 'a'], ['hPull', 'a'], ['chestIso', 'i'], ['hPull2', 'i'], ['core', 'i']] },
  shoularms: { name: 'Shoulders & Arms', focus: 'Delts · Biceps · Triceps', slots: [['vPush', 'm'], ['latRaise', 'i'], ['biceps', 'a'], ['triceps', 'a'], ['rearDelt', 'i'], ['biceps2', 'i'], ['triceps2', 'i']] },
};
const SPLITS = {
  fb2: { name: 'Full Body', desc: 'Whole body twice a week. Ideal for beginners or busy weeks.', days: [['full', 0], ['full', 1]] },
  fb3: { name: 'Full Body', desc: 'Whole body 3× a week. The classic beginner programme.', days: [['full', 0], ['full', 1], ['full', 2]] },
  ul4: { name: 'Upper / Lower', desc: 'Upper and lower body, each trained twice a week.', days: [['upper', 0], ['lower', 0], ['upper', 1], ['lower', 1]] },
  ppl3: { name: 'Push / Pull / Legs', desc: 'Each muscle once a week. Simple and effective.', days: [['push', 0], ['pull', 0], ['legs', 0]] },
  pplul5: { name: 'PPL + Upper / Lower', desc: 'Push, pull, legs, then an upper and a lower day.', days: [['push', 0], ['pull', 0], ['legs', 0], ['upper', 1], ['lower', 1]] },
  ppl6: { name: 'Push / Pull / Legs', desc: 'Each muscle twice a week. For intermediate/advanced.', days: [['push', 0], ['pull', 0], ['legs', 0], ['push', 1], ['pull', 1], ['legs', 1]] },
  arnold3: { name: 'Arnold Split', desc: 'Chest & back, shoulders & arms, legs.', days: [['chestback', 0], ['shoularms', 0], ['legs', 0]] },
  arnold6: { name: 'Arnold Split', desc: 'The Arnold split twice a week. High volume.', days: [['chestback', 0], ['shoularms', 0], ['legs', 0], ['chestback', 1], ['shoularms', 1], ['legs', 1]] },
  bro5: { name: 'Bro Split', desc: 'One muscle group per day: chest, back, shoulders, legs, arms.', days: [['chest', 0], ['back', 0], ['shoulders', 0], ['legs', 0], ['arms', 0]] },
};
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SCHEDULE = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5] };
const GOALS = {
  hyp: { name: 'Hypertrophy', sub: 'Build muscle', m: [4, '6–8'], a: [3, '8–12'], i: [3, '12–15'], rest: 90 },
  str: { name: 'Strength', sub: 'Lift heavier', m: [5, '3–5'], a: [3, '6–8'], i: [3, '8–12'], rest: 180 },
  end: { name: 'Endurance', sub: 'Tone & condition', m: [3, '12–15'], a: [3, '15'], i: [2, '15–20'], rest: 60 },
};
const LENS = { 4: '~45 min', 5: '~60 min', 6: '~75 min', 7: '~90 min' };
const todayIdx = () => (new Date().getDay() + 6) % 7;

function buildDay(type, variant, gym, cfg) {
  const used = new Set(), ex = [];
  for (const [slot, role] of DAY_T[type].slots) {
    if (ex.length >= cfg.len) break;
    const av = SLOTS[slot].filter(id => canDo(id, gym) && !used.has(id));
    if (!av.length) continue;
    // A/B/C usam variações diferentes; nos exercícios principais só alterna entre as 2 melhores opções
    const id = av[(role === 'm' ? variant % 2 : variant) % av.length];
    used.add(id);
    const g = GOALS[cfg.goal][role];
    ex.push({ id, slot, role, sets: g[0], reps: g[1] });
  }
  return ex;
}
function generatePlan(cfg) {
  const gym = new Set(state.gym || []), sp = SPLITS[cfg.split], sched = SCHEDULE[sp.days.length];
  const days = sp.days.map(([type, v], i) => {
    const multi = sp.days.filter(d => d[0] === type).length > 1;
    return { name: DAY_T[type].name + (multi ? ' ' + 'ABC'[v] : ''), type, weekday: sched[i], ex: buildDay(type, v, gym, cfg) };
  });
  return { ...cfg, days, created: todayISO() };
}
function swapPlanEx(di, ei) {
  const day = state.plan.days[di], e = day.ex[ei], gym = new Set(state.gym || []);
  const others = new Set(day.ex.map(x => x.id)); others.delete(e.id);
  const av = SLOTS[e.slot].filter(id => canDo(id, gym) && !others.has(id));
  if (av.length < 2) return toast('No alternative with your equipment', 'bad');
  e.id = av[(av.indexOf(e.id) + 1) % av.length]; save(); render(false);
}
function todayPlanDay() {
  if (!state.plan) return null;
  const t = todayIdx(), i = state.plan.days.findIndex(d => d.weekday === t);
  if (i >= 0) return { i, day: state.plan.days[i], today: true };
  const next = [...state.plan.days].sort((a, b) => ((a.weekday - t + 7) % 7) - ((b.weekday - t + 7) % 7))[0];
  return { i: state.plan.days.indexOf(next), day: next, today: false };
}
function startPlanDay(di) {
  const day = state.plan.days[di];
  openEditor();
  draft.name = day.name;
  draft.exercises = day.ex.map(e => {
    const last = baseline[e.id]?.last?.sets?.filter(s => num(s.r) > 0) || [];
    const w = last.length ? Math.max(...last.map(s => num(s.w))) : '';
    return { exId: e.id, plan: `${e.sets} × ${e.reps}`, sets: Array.from({ length: e.sets }, () => ({ w, r: '' })) };
  });
  renderEditor();
}

// edição manual do plano
let pickTarget = null; // {di, ei} quando o seletor de exercícios está a escolher para o plano
function planPick(id) {
  const { di, ei } = pickTarget; pickTarget = null;
  const day = state.plan.days[di];
  closeModal();
  if (day.ex.some((x, i) => x.id === id && i !== ei)) return toast('That exercise is already in this day', 'bad');
  if (ei == null) {
    const g = GOALS[state.plan.goal].a;
    day.ex.push({ id, slot: null, role: 'a', sets: g[0], reps: g[1] });
  } else {
    const old = day.ex[ei];
    day.ex[ei] = { ...old, id, slot: old.slot && SLOTS[old.slot]?.includes(id) ? old.slot : null };
  }
  state.plan.customized = true; save(); render(false);
  toast(`${getEx(id).name} ${ei == null ? 'added' : 'saved'} in ${day.name}`, 'ok');
}
function planEditOp(op, arg) {
  const [di, ei, dir] = String(arg).split(':').map(Number);
  const day = state.plan.days[di];
  if (op === 'move') { const j = ei + dir; if (j < 0 || j >= day.ex.length) return; [day.ex[ei], day.ex[j]] = [day.ex[j], day.ex[ei]]; }
  if (op === 'del') day.ex.splice(ei, 1);
  state.plan.customized = true; save(); render(false);
}

function planBuilder() {
  const cfg = { split: 'ppl3', goal: 'hyp', len: 6, ...(state.planCfg || {}) };
  const gym = new Set(state.gym || []);
  const avail = Object.keys(REQ).filter(id => canDo(id, gym)).length;
  return `
  <section class="panel">
    <div class="panel-title"><span>1 · MY GYM</span></div>
    <p class="hint">Tap the equipment and machines you have access to.</p>
    <div class="chips wrap">${Object.entries(EQUIP_PRESETS).map(([k, p]) => `<button class="chip" data-preset="${k}">${p.name}</button>`).join('')}<button class="chip" data-preset="none">Clear</button></div>
    <div class="equip">${EQUIP.map(([k, l]) => `<button class="eq ${gym.has(k) ? 'on' : ''}" data-eq="${k}"><i></i>${l}</button>`).join('')}</div>
    <p class="hint center">${avail ? `<b class="cyan">${avail}</b> exercises available with this equipment` : 'Bodyweight only: push-ups and core work. Add some equipment for a real plan.'}</p>
  </section>

  <section class="panel">
    <div class="panel-title"><span>2 · WEEKLY SPLIT</span></div>
    <div class="splits">${Object.entries(SPLITS).map(([k, s]) => `
      <button class="split ${cfg.split === k ? 'on' : ''}" data-split="${k}">
        <div class="split-top"><b>${s.name}</b><span class="freq">${s.days.length}× / WEEK</span></div>
        <small>${s.desc}</small>
        <div class="split-days">${s.days.map(([t, v]) => `<span>${DAY_T[t].name}${s.days.filter(d => d[0] === t).length > 1 ? ' ' + 'ABC'[v] : ''}</span>`).join('')}</div>
      </button>`).join('')}</div>
  </section>

  <section class="panel">
    <div class="panel-title"><span>3 · GOAL & LENGTH</span></div>
    <div class="goal-pick">${Object.entries(GOALS).map(([k, g]) => `<button class="split ${cfg.goal === k ? 'on' : ''}" data-goal="${k}"><b>${g.name}</b><small>${g.sub} · ${g.m[0]}×${g.m[1]}</small></button>`).join('')}</div>
    <div class="field-lbl" style="margin-top:12px">Exercises per session</div>
    <div class="chips seg">${Object.entries(LENS).map(([n, t]) => `<button class="chip ${+cfg.len === +n ? 'on' : ''}" data-len="${n}">${n} · ${t}</button>`).join('')}</div>
    <button class="btn primary wide" data-act="genplan" style="margin-top:14px">${IC.bolt}<span>GENERATE PLAN</span></button>
    ${state.plan ? '<button class="btn ghost wide" data-act="cancelplan">CANCEL</button>' : ''}
  </section>`;
}

function planDisplay() {
  const p = state.plan, sp = SPLITS[p.split], g = GOALS[p.goal], t = todayIdx();
  const byDay = Object.fromEntries(p.days.map((d, i) => [d.weekday, i]));
  return `
  <section class="panel plan-head">
    <div class="panel-title"><span>TRAINING PLAN</span></div>
    <div class="plan-name">${sp.name}</div>
    <div class="plan-meta"><span>${p.days.length}× / week</span><span>${g.name}</span><span>Rest ${g.rest}s</span><span>${LENS[p.len]}</span></div>
    <div class="week">${WEEKDAYS.map((w, i) => `<div class="wd ${i === t ? 'today' : ''} ${byDay[i] !== undefined ? 'train' : ''}"><span>${w}</span><b>${byDay[i] !== undefined ? esc(p.days[byDay[i]].name) : 'Rest'}</b></div>`).join('')}</div>
  </section>
  ${p.days.map((d, di) => `
  <section class="panel plan-day ${d.weekday === t ? 'is-today' : ''}">
    <header>
      <div><div class="w-date">${WEEKDAYS[d.weekday]}${d.weekday === t ? ' · TODAY' : ''}</div><h4>${esc(d.name)}</h4><small>${DAY_T[d.type].focus}</small></div>
      <div class="day-btns">
        ${state.planEditDay === di
          ? `<button class="btn sm primary" data-pdone="${di}">DONE</button>`
          : `<button class="btn sm ghost" data-pedit="${di}">${IC.edit}<span>EDIT</span></button><button class="btn sm primary" data-startday="${di}">START</button>`}
      </div>
    </header>
    ${state.planEditDay === di ? `
    <p class="hint">Tap an exercise name to replace it with any exercise you want. Change sets × reps, reorder or remove.</p>
    <ol class="plan-ex editing">${d.ex.map((e, ei) => `
      <li class="r-${e.role}">
        <div class="mv"><button class="icon-btn sm" data-pmove="${di}:${ei}:-1" aria-label="Move up" ${ei === 0 ? 'disabled' : ''}>${IC.up}</button><button class="icon-btn sm down" data-pmove="${di}:${ei}:1" aria-label="Move down" ${ei === d.ex.length - 1 ? 'disabled' : ''}>${IC.up}</button></div>
        <button class="pick-name" data-preplace="${di}:${ei}">${esc(getEx(e.id)?.name || 'Unknown exercise')}<i>${IC.edit}</i></button>
        <div class="sr-edit"><input data-pset="${di}:${ei}" value="${e.sets}" inputmode="numeric" aria-label="Sets"><span>×</span><input data-preps="${di}:${ei}" value="${esc(e.reps)}" aria-label="Reps"></div>
        <button class="icon-btn sm" data-pdel="${di}:${ei}" aria-label="Remove exercise">${IC.trash}</button>
      </li>`).join('')}</ol>
    <button class="btn wide dashed" data-padd="${di}">${IC.plus}<span>ADD EXERCISE</span></button>`
    : `${d.ex.length < 3 ? '<p class="hint">⚠ Few exercises in this day — tap EDIT to add your own.</p>' : ''}
    <ol class="plan-ex">${d.ex.map((e, ei) => `
      <li class="r-${e.role}"><span class="n">${esc(getEx(e.id)?.name || 'Unknown exercise')}</span><span class="sr">${e.sets} × ${esc(e.reps)}</span>
        ${e.slot ? `<button class="icon-btn sm" data-swap="${di}:${ei}" aria-label="Swap exercise" title="Swap for a similar exercise">${IC.swap}</button>` : '<span></span>'}</li>`).join('')}</ol>`}
  </section>`).join('')}
  <div class="btn-col">
    <button class="btn" data-act="editplan">EDIT GYM & SPLIT</button>
    <button class="btn danger" data-act="delplan">DELETE PLAN</button>
  </div>`;
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
      <button class="icon-btn" data-act="close" aria-label="Close">${IC.x}</button>
      <div class="sheet-title">${draft.isNew ? 'NEW WORKOUT' : 'EDIT WORKOUT'}</div>
      <button class="btn primary sm" data-act="save">FINISH</button>
    </header>
    <div class="sheet-body">
      <div class="panel form-row">
        <label>Date<input type="date" id="d-date" value="${esc(draft.date)}"></label>
        <label>Bodyweight (kg)<input id="d-bw" inputmode="decimal" value="${esc(draft.bw)}"></label>
        <label class="full">Workout name<input id="d-name" placeholder="e.g. Push — Chest & Shoulders" value="${esc(draft.name)}" maxlength="40"></label>
      </div>
      ${!draft.exercises.length && recent.length ? `
      <div class="panel">
        <div class="panel-title"><span>REPEAT A WORKOUT</span></div>
        <div class="chips wrap">${recent.map(w => `<button class="chip" data-copy="${w.id}">${IC.copy}${esc(w.name || 'Workout')} · ${fmtDateShort(w.date)}</button>`).join('')}</div>
      </div>` : ''}
      <div id="ex-list">${draft.exercises.map((e, ei) => exCard(e, ei)).join('')}</div>
      <button class="btn wide dashed" data-act="pick">${IC.plus}<span>ADD EXERCISE</span></button>
      ${!draft.isNew ? `<button class="btn danger wide" data-act="delete">${IC.trash}<span>DELETE WORKOUT</span></button>` : ''}
    </div>
  </div>`;
  draft.exercises.forEach((_, ei) => refreshCard(ei));
}

function exCard(e, ei) {
  const def = getEx(e.exId);
  const b = baseline[e.exId];
  const prev = b?.last ? b.last.sets.filter(s => num(s.r) > 0).map(s => `${def.bw && !num(s.w) ? 'BW' : fmt(num(s.w))}×${num(s.r)}`).join(' · ') : null;
  return `
  <div class="panel ex-card" data-ei="${ei}">
    <div class="ex-head">
      <div>
        <b>${esc(def?.name || '?')}</b>
        ${e.plan ? `<span class="plan-tag">PLAN ${e.plan}</span>` : ''}<small>${esc(def?.group || '')}${def?.bw ? ' · bodyweight + added load' : ''}${def?.perHand ? ' · kg per dumbbell' : ''}</small>
      </div>
      <button class="icon-btn" data-delex="${ei}" aria-label="Remove exercise">${IC.trash}</button>
    </div>
    ${b ? `<div class="ex-rec"><span>Previous: ${prev || '—'}</span><span>Record: <b class="gold">${def.bw ? (b.bestW.w ? '+' + fmt(b.bestW.w) : 'BW') : fmt(b.bestW.w)}kg</b> · <b class="cyan">${fmt(b.bestVol.v, 0)} vol</b>${num(state.goals?.[e.exId]) ? ` · 🎯 ${fmt(num(state.goals[e.exId]))}kg` : ''}</span></div>` : '<div class="ex-rec"><span>First time — this workout sets your baseline.</span></div>'}
    <div class="sets">
      <div class="set-h"><span>SET</span><span>${def?.bw ? '+KG' : 'KG'}</span><span>REPS</span><span>VOLUME</span><span></span></div>
      ${e.sets.map((s, si) => `
      <div class="set" data-si="${si}">
        <span class="set-n">${si + 1}</span>
        <input data-f="w" inputmode="decimal" value="${esc(s.w)}" placeholder="${def?.bw ? '0' : '—'}" aria-label="Weight set ${si + 1}">
        <input data-f="r" inputmode="numeric" value="${esc(s.r)}" placeholder="—" aria-label="Reps set ${si + 1}">
        <span class="set-vol"></span>
        <button class="icon-btn sm" data-delset="${si}" aria-label="Remove set">${IC.x}</button>
      </div>`).join('')}
    </div>
    <button class="btn sm ghost add-set" data-addset="${ei}">${IC.plus}<span>Set</span></button>
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
    row.title = [isW && 'Weight record', isV && 'Volume record'].filter(Boolean).join(' + ');
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
      <div class="rest-t"><span>REST</span><b></b></div>
      <button class="btn sm ghost" data-rest="15">+15s</button>
      <button class="icon-btn sm" data-rest="0" aria-label="Skip rest">${IC.x}</button></div>`;
    host.appendChild(el);
  }
  const left = Math.max(0, rest.end - Date.now()), sec = Math.ceil(left / 1000);
  $('b', el).textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  $('.rest-bar i', el).style.width = clamp(left / (rest.total * 1000) * 100, 0, 100) + '%';
  el.classList.toggle('ending', sec <= 5);
  if (left <= 0) { stopRest(); navigator.vibrate?.([200, 100, 200]); toast('Rest over — next set!', 'ok'); }
}

/* ---------- seletor de exercícios ---------- */
function openPicker() {
  const m = $('#modal');
  m.innerHTML = `
  <div class="modal-box picker">
    <div class="picker-head">
      <div class="search">${IC.search}<input id="pick-q" placeholder="Search exercise…" autocomplete="off"></div>
      <button class="icon-btn" data-act="mclose" aria-label="Close">${IC.x}</button>
    </div>
    <div id="pick-list" class="pick-list"></div>
    <details class="new-ex">
      <summary>${IC.plus} Create custom exercise</summary>
      <form id="custom-form" class="form">
        <input name="name" placeholder="Exercise name" required maxlength="40">
        <select name="group">${GROUPS.map(g => `<option>${g}</option>`).join('')}</select>
        <label class="check"><input type="checkbox" name="bw"> Bodyweight exercise</label>
        <button class="btn primary wide" type="submit">CREATE AND ADD</button>
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
      return `<button class="pick-item" data-pick="${e.id}"><span>${esc(e.name)}${e.custom ? ' <small>custom</small>' : ''}</span>${s ? `<small class="cyan">${fmt(s.bestW.w)}kg</small>` : ''}</button>`;
    }).join('');
  }).join('') || '<p class="empty">No results — create a custom exercise below.</p>';
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
  if (!exercises.length) { toast('Add at least one set with reps', 'bad'); return; }
  const before = C;
  const w = { id: draft.id, date: draft.date || todayISO(), name: draft.name.trim(), bw: num(draft.bw) || num(state.profile.bw), exercises, createdAt: draft.createdAt };
  const i = state.workouts.findIndex(x => x.id === w.id);
  if (i >= 0) state.workouts[i] = w; else state.workouts.push(w);
  const wasNew = draft.isNew;
  save(); closeEditor(); render();
  const after = C;

  const alerts = [];
  const pw = after.perWorkout[w.id];
  if (wasNew) alerts.push({ kind: 'quest', html: `<p class="sys-big">WORKOUT COMPLETE</p><p>Total volume: <b>${fmtKg(pw.vol, 0)}</b></p><p class="reward">Reward: <b>+${fmt(pw.xp, 0)} EXP</b></p>` });
  const prs = after.prList.filter(p => p.wid === w.id);
  if (prs.length) alerts.push({
    kind: 'pr', html: `<p class="sys-big gold">NEW PERSONAL RECORD</p><ul class="pr-feed in-alert">${prs.map(prRow).join('')}</ul><p class="reward">Bonus: <b>+${prs.length * 50} EXP</b></p>`,
  });
  if (after.level.lvl > before.level.lvl) alerts.push({ kind: 'level', html: `<p class="lvl-up">LEVEL UP!</p><p class="lvl-from"><span>${before.level.lvl}</span> → <b>${after.level.lvl}</b></p>${titleFor(after.level.lvl) !== titleFor(before.level.lvl) ? `<p>New title: <b class="glowtxt">${titleFor(after.level.lvl)}</b></p>` : ''}` });
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
    alerts.push({ kind: 'rank', html: `<p class="sys-big">${before.ranked.length ? 'RANK PROMOTION' : 'RANK ASSIGNED'}</p><div class="alert-emblem" style="--glow:${t.glow}">${emblem(after.rank, 140, 'float')}</div><p class="rank-name" style="color:${t.glow}">${RANKS[after.rank].name}</p>${before.ranked.length ? `<p class="muted">${RANKS[before.rank].name} → ${RANKS[after.rank].name}</p>` : ''}${after.placement ? '<p class="muted">Provisional — get 4 muscles ranked.</p>' : ''}` });
  }
  const mUps = MUSCLES.map(m => {
    const a = after.muscles[m.key].mmr, b = before.muscles[m.key].mmr;
    if (a === null) return null;
    const ra = rankIdx(a), rb = b === null ? null : rankIdx(b);
    return rb === null || ra > rb ? { m, ra, rb } : null;
  }).filter(Boolean);
  if (mUps.length) alerts.push({ kind: 'rank', html: `<p class="sys-big">MUSCLE RANK</p>${bodyMap(after.muscles, null)}<ul class="ex-ups">${mUps.map(u => `<li>${emblem(u.ra, 40)}<div><b>${u.m.name}</b><span>${u.rb === null ? 'Initial rank' : RANKS[u.rb].name + ' →'} <b style="color:${TIERS[RANKS[u.ra].tier].glow}">${RANKS[u.ra].name}</b></span></div></li>`).join('')}</ul>` });
  if (exUps.length) alerts.push({ kind: 'rank', html: `<p class="sys-big">EXERCISE RANK</p><ul class="ex-ups">${exUps.map(u => `<li>${emblem(u.ra, 40)}<div><b>${esc(u.def.name)}</b><span>${u.rb === null ? 'Initial rank' : RANKS[u.rb].name + ' →'} <b style="color:${TIERS[RANKS[u.ra].tier].glow}">${RANKS[u.ra].name}</b></span></div></li>`).join('')}</ul>` });
  const newGoals = after.goalsReached.filter(id => !before.goalsReached.includes(id));
  if (newGoals.length) alerts.push({ kind: 'pr', html: `<p class="sys-big gold">QUEST COMPLETE</p><p>Target reached:</p><ul class="ex-ups">${newGoals.map(id => `<li><span class="pr pr-w sm">🎯 TARGET</span><div><b>${esc(getEx(id).name)}</b><span>${fmtKg(num(state.goals[id]))} lifted</span></div></li>`).join('')}</ul><p class="reward">Reward: <b>+${newGoals.length * 200} EXP</b></p><p class="muted">Set a new target in Progress.</p>` });
  if (!alerts.length) toast('Workout updated', 'ok');
  queueAlerts(alerts);
}

let alertQ = [];
function queueAlerts(list) { alertQ.push(...list); if ($('#modal').hidden) nextAlert(); }
function nextAlert() {
  const a = alertQ.shift(); if (!a) return;
  const m = $('#modal');
  m.innerHTML = `<div class="sys-window k-${a.kind}">
    <div class="sys-head"><span class="sys-icon">!</span><span>NOTIFICATION</span></div>
    <div class="sys-body">${a.html}</div>
    <button class="btn primary wide" data-act="mclose">OK</button>
  </div>${a.kind === 'level' || a.kind === 'rank' ? '<div class="burst"></div>' : ''}`;
  m.hidden = false; requestAnimationFrame(() => m.classList.add('open'));
  if (navigator.vibrate && (a.kind === 'pr' || a.kind === 'level')) navigator.vibrate([30, 40, 60]);
}

function sysConfirm(text, okLabel = 'CONFIRM') {
  return new Promise(res => {
    const m = $('#modal');
    m.innerHTML = `<div class="sys-window k-warn">
      <div class="sys-head"><span class="sys-icon">!</span><span>WARNING</span></div>
      <div class="sys-body"><p>${text}</p></div>
      <div class="btn-row"><button class="btn ghost" data-c="0">CANCEL</button><button class="btn danger" data-c="1">${okLabel}</button></div>
    </div>`;
    m.hidden = false; requestAnimationFrame(() => m.classList.add('open'));
    m.onclick = ev => {
      const b = ev.target.closest('[data-c]'); if (!b) return;
      m.onclick = null; m.classList.remove('open');
      setTimeout(() => { m.hidden = true; m.innerHTML = ''; res(b.dataset.c === '1'); }, 180);
    };
  });
}

function logBodyweight(bw) {
  const t = todayISO();
  state.bwLog = (state.bwLog || []).filter(e => e.date !== t);
  state.bwLog.push({ date: t, bw });
  state.profile.bw = bw; save();
}

function toast(msg, kind = '') {
  const t = document.createElement('div'); t.className = `toast ${kind}`; t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.classList.add('out'), 2200); setTimeout(() => t.remove(), 2700);
}

/* ---------- dados de exemplo ---------- */
function demoData() {
  const plan = [
    { name: 'Push — Chest & Shoulders', ex: [['supino', 60, 8, 2.5], ['press_militar', 35, 8, 1.25], ['supino_incl_halt', 20, 10, 1], ['elev_lateral', 8, 12, 0.5], ['triceps_polia', 25, 12, 1.25]] },
    { name: 'Pull — Back & Biceps', ex: [['peso_morto', 100, 5, 5], ['elevacoes', 0, 6, 1.25], ['remada_barra', 55, 8, 2.5], ['puxada', 50, 10, 2.5], ['curl_barra', 25, 10, 1.25]] },
    { name: 'Legs', ex: [['agachamento', 80, 6, 2.5], ['leg_press', 140, 10, 5], ['rdl', 70, 8, 2.5], ['leg_curl', 35, 12, 1.25], ['gemeos', 60, 12, 2.5]] },
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
  const el = ev.target.closest('[data-tab],[data-act],[data-go],[data-edit],[data-addset],[data-delset],[data-delex],[data-pick],[data-copy],[data-filter],[data-delcustom],[data-muscle],[data-rest],[data-range],[data-metric],[data-progex],[data-wview],[data-eq],[data-preset],[data-split],[data-goal],[data-len],[data-swap],[data-startday],[data-rankview],[data-pedit],[data-pdone],[data-pmove],[data-pdel],[data-padd],[data-preplace]');
  if (!el) {
    if (ev.target.id === 'modal' && !$(".sys-window.k-warn, .sys-window.no-dismiss")) closeModal();
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
  if (d.rankview) { state.rankView = d.rankview; save(); return render(false); }
  if (d.wview) { state.wView = d.wview; save(); return state.tab === 'workouts' ? render(false) : go('workouts'); }
  if (d.eq) { const g = new Set(state.gym || []); g.has(d.eq) ? g.delete(d.eq) : g.add(d.eq); state.gym = [...g]; save(); return render(false); }
  if (d.preset) { state.gym = d.preset === 'none' ? [] : [...EQUIP_PRESETS[d.preset].eq]; save(); return render(false); }
  if (d.split || d.goal || d.len) {
    state.planCfg = { split: 'ppl3', goal: 'hyp', len: 6, ...(state.planCfg || {}), ...(d.split ? { split: d.split } : {}), ...(d.goal ? { goal: d.goal } : {}), ...(d.len ? { len: +d.len } : {}) };
    save(); return render(false);
  }
  if (d.swap) { const [di, ei] = d.swap.split(':').map(Number); return swapPlanEx(di, ei); }
  if (d.startday !== undefined) return startPlanDay(+d.startday);
  if (d.range) { state.range = d.range; save(); return render(false); }
  if (d.metric) { state.metric = d.metric; save(); return render(false); }
  if (d.progex) { state.progEx = d.progex; save(); return go('progress'); }
  if (d.edit) return openEditor(d.edit);
  if (d.filter) { state.recFilter = d.filter; save(); return render(); }
  if (d.pick) return pickTarget ? planPick(d.pick) : addExercise(d.pick);
  if (d.pedit !== undefined) { state.planEditDay = +d.pedit; save(); return render(false); }
  if (d.pdone !== undefined) { state.planEditDay = null; save(); render(false); return toast('Plan saved', 'ok'); }
  if (d.pmove) return planEditOp('move', d.pmove);
  if (d.pdel) return planEditOp('del', d.pdel);
  if (d.padd !== undefined) { pickTarget = { di: +d.padd, ei: null }; return openPicker(); }
  if (d.preplace) { const [di, ei] = d.preplace.split(':').map(Number); pickTarget = { di, ei }; return openPicker(); }
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
    if (state.workouts.some(w => w.exercises.some(e => e.exId === d.delcustom))) return toast('This exercise is used in workouts', 'bad');
    state.custom = state.custom.filter(c => c.id !== d.delcustom);
    if (state.goals) delete state.goals[d.delcustom]; // o alvo desse exercício deixa de fazer sentido
    state.plan?.days.forEach(day => { day.ex = day.ex.filter(e => e.id !== d.delcustom); }); // e sai do plano
    if (state.progEx === d.delcustom) state.progEx = null;
    save(); return render();
  }
  switch (d.act) {
    case 'new': return openEditor();
    case 'close': return closeEditor();
    case 'save': return saveDraft();
    case 'pick': pickTarget = null; return openPicker();
    case 'mclose': return closeModal();
    case 'genplan': {
      if (state.plan?.customized && !(await sysConfirm('Generating a new plan replaces the exercises you chose. Continue?', 'REPLACE'))) return;
      if (!(state.gym || []).length) return toast('Select your gym equipment first', 'bad');
      const cfg = { split: 'ppl3', goal: 'hyp', len: 6, ...(state.planCfg || {}) };
      state.plan = generatePlan(cfg); state.planEdit = false; state.planEditDay = null; save(); render(false); window.scrollTo({ top: 0 });
      const sp = SPLITS[cfg.split];
      queueAlerts([{ kind: 'quest', html: `<p class="sys-big">NEW QUEST UNLOCKED</p><p>Training plan: <b>${sp.name}</b></p><p class="muted">${state.plan.days.map(d => `${WEEKDAYS[d.weekday]} · ${esc(d.name)}`).join('<br>')}</p><p class="reward">Complete your sessions to earn <b>EXP</b></p>` }]);
      return;
    }
    case 'editplan': state.planEdit = true; save(); render(false); return window.scrollTo({ top: 0 });
    case 'cancelplan': state.planEdit = false; save(); return render(false);
    case 'delplan':
      if (await sysConfirm('Delete your training plan? Your workout history is kept.', 'DELETE')) { state.plan = null; state.planEdit = false; save(); render(false); }
      return;
    case 'cleargoal': delete state.goals[el.dataset.ex]; save(); render(false); return toast('Target removed');
    case 'delete':
      if (await sysConfirm('Delete this workout? EXP and records will be recalculated.', 'DELETE')) {
        state.workouts = state.workouts.filter(w => w.id !== draft.id); save(); closeEditor(); render(); toast('Workout deleted');
      }
      return;
    case 'export': {
      const blob = new Blob([JSON.stringify({ app: 'iron-system', version: 1, ...state }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `iron-system-${todayISO()}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000); return;
    }
    case 'demo':
      if (state.workouts.length && !(await sysConfirm('Replace your current workouts with sample data?', 'REPLACE'))) return;
      state.workouts = demoData(); state.goals = { supino: 80, agachamento: 110, peso_morto: 140 }; state.profile.bwGoal = 74;
      state.bwLog = state.workouts.filter((w, i) => i % 2).map(w => ({ date: w.date, bw: Math.round((num(w.bw) + (Math.random() - 0.5) * 0.6) * 10) / 10 })); save(); render(); toast('Sample data loaded', 'ok'); return;
    case 'reset':
      if (await sysConfirm('Delete ALL data? This cannot be undone.', 'DELETE ALL')) {
        state = defaultState(); save(); render(); toast('Data deleted');
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
    if (bw < 25 || bw > 300) return toast('Invalid bodyweight', 'bad');
    if (bw !== num(state.profile.bw)) logBodyweight(bw);
    state.profile = { ...state.profile, name: String(fd.get('name')).trim() || 'Hunter', bw, sex: fd.get('sex'), rest: clamp(Math.round(num(fd.get('rest')) || 90), 15, 600) };
    save(); render(); toast('Profile saved', 'ok');
  }
  if (f.id === 'bwlog-form') {
    const bw = num(fd.get('bw'));
    if (bw < 25 || bw > 300) return toast('Invalid bodyweight', 'bad');
    logBodyweight(bw); render(false); toast(`Weight logged: ${fmtKg(bw)}`, 'ok');
    const g = num(state.profile.bwGoal), series = bodyweightSeries();
    if (g && series.length > 1) {
      const prev = series[series.length - 2].v;
      if ((prev - g) * (bw - g) <= 0 && prev !== g) queueAlerts([{ kind: 'pr', html: `<p class="sys-big gold">QUEST COMPLETE</p><p>Bodyweight goal reached: <b>${fmtKg(g)}</b></p><p class="muted">Set a new goal whenever you're ready.</p>` }]);
    }
    return;
  }
  if (f.id === 'bwgoal-form') {
    const g = num(fd.get('goal'));
    if (g && (g < 25 || g > 300)) return toast('Invalid goal', 'bad');
    state.profile.bwGoal = g || null; save(); render(false); return toast(g ? `Goal set: ${fmtKg(g)}` : 'Goal removed', 'ok');
  }
  if (f.id === 'exgoal-form') {
    const g = num(fd.get('goal')), id = f.dataset.ex;
    if (g <= 0 || g > 1000) return toast('Invalid target', 'bad');
    state.goals[id] = g; save(); render(false); return toast(`Target set: ${getEx(id).name} ${fmtKg(g)}`, 'ok');
  }
  if (f.id === 'custom-form') {
    const ex = { id: 'c_' + uid(), name: String(fd.get('name')).trim(), group: fd.get('group'), bw: !!fd.get('bw'), std: null, custom: true, region: 'upper' };
    if (!ex.name) return;
    state.custom.push(ex); save(); pickTarget ? planPick(ex.id) : addExercise(ex.id);
  }
});

document.addEventListener('change', ev => {
  const pe = ev.target.dataset?.pset || ev.target.dataset?.preps;
  if (pe && state.plan) {
    const [di, ei] = pe.split(':').map(Number), e = state.plan.days[di]?.ex[ei];
    if (!e) return;
    if (ev.target.dataset.pset) { const n = Math.round(num(ev.target.value)); if (n >= 1 && n <= 20) e.sets = n; ev.target.value = e.sets; }
    else { const r = ev.target.value.trim().replace(/-/g, '–').slice(0, 12); if (r) e.reps = r; ev.target.value = e.reps; }
    state.plan.customized = true; return save();
  }
  if (draft && ev.target.matches('.set input[data-f="r"]') && num(ev.target.value) > 0) startRest();
  if (ev.target.id === 'prog-ex') { state.progEx = ev.target.value; save(); return render(false); }
  if (ev.target.id !== 'import-file') return;
  const file = ev.target.files[0]; if (!file) return;
  file.text().then(txt => {
    const d = JSON.parse(txt);
    if (!Array.isArray(d.workouts)) throw new Error();
    state = migrate({ ...defaultState(), profile: { ...defaultState().profile, ...d.profile }, workouts: d.workouts, custom: d.custom || [], goals: d.goals || {}, bwLog: d.bwLog || [], gym: d.gym || [], planCfg: d.planCfg, plan: d.plan || null, tab: 'status' });
    save(); render(); toast('Backup imported', 'ok');
  }).catch(() => toast('Invalid file', 'bad'));
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
