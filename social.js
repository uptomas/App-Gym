'use strict';
/* =========================================================
   IRON SYSTEM — modo online (Supabase)
   Contas, sincronização na nuvem, amigos e rankings.
   Sem configuração em config.js a app continua 100% offline.
   ========================================================= */
(function () {
  const cfg = window.IRON_CONFIG || {};
  const testApi = window.IRON_TEST_API; // só usado nos testes automáticos
  const configured = !!(testApi || (cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase?.createClient));
  const sb = configured && !testApi ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  }) : null;
  const appUrl = () => location.origin + location.pathname;
  const USER_RE = /^[a-z0-9_]{3,20}$/;

  /* ---------- camada de dados (substituível nos testes) ---------- */
  const unwrap = ({ data, error }) => { if (error) throw error; return data; };
  const one = x => Array.isArray(x) ? x[0] || null : x || null;
  const api = {
    getSession: async () => (await sb.auth.getSession()).data.session,
    onAuth: cb => sb.auth.onAuthStateChange((ev, session) => cb(ev, session)),
    signInGoogle: () => sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: appUrl() } }).then(r => { if (r.error) throw r.error; }),
    signIn: (email, password) => sb.auth.signInWithPassword({ email, password }).then(unwrap),
    signUp: (email, password) => sb.auth.signUp({ email, password, options: { emailRedirectTo: appUrl() } }).then(unwrap),
    resetPassword: email => sb.auth.resetPasswordForEmail(email, { redirectTo: appUrl() }).then(unwrap),
    updatePassword: password => sb.auth.updateUser({ password }).then(unwrap),
    signOut: () => sb.auth.signOut(),
    getProfile: uid => sb.from('profiles').select('id, username, display_name').eq('id', uid).maybeSingle().then(unwrap),
    saveProfile: p => sb.from('profiles').upsert(p, { onConflict: 'id' }).select('id, username, display_name').single().then(unwrap),
    pull: uid => sb.from('user_data').select('data, updated_at').eq('user_id', uid).maybeSingle().then(unwrap),
    push: (uid, data) => sb.from('user_data').upsert({ user_id: uid, data }, { onConflict: 'user_id' }).select('updated_at').single().then(unwrap),
    saveStats: st => sb.from('stats').upsert(st, { onConflict: 'user_id' }).then(unwrap),
    findUser: username => sb.from('profiles').select('id, username, display_name').eq('username', username).maybeSingle().then(unwrap),
    friendRows: uid => sb.from('friendships').select('user_id, friend_id, status, created_at').or(`user_id.eq.${uid},friend_id.eq.${uid}`).then(unwrap),
    playersByIds: ids => sb.from('profiles').select('id, username, display_name, stats(*)').in('id', ids).then(unwrap)
      .then(rows => rows.map(r => ({ id: r.id, username: r.username, display_name: r.display_name, stats: one(r.stats) }))),
    globalTop: sort => sb.from('stats').select('*, profiles(id, username, display_name)').order(sort === 'level' ? 'xp' : 'mmr', { ascending: false }).limit(100).then(unwrap)
      .then(rows => rows.filter(r => one(r.profiles)).map(r => { const p = one(r.profiles); return { id: p.id, username: p.username, display_name: p.display_name, stats: r }; })),
    countAbove: (field, value) => sb.from('stats').select('user_id', { count: 'exact', head: true }).gt(field, value).then(r => { if (r.error) throw r.error; return r.count || 0; }),
    sendRequest: (uid, fid) => sb.from('friendships').insert({ user_id: uid, friend_id: fid }).then(unwrap),
    accept: (from, to) => sb.from('friendships').update({ status: 'accepted' }).eq('user_id', from).eq('friend_id', to).then(unwrap),
    removeFriend: (a, b) => sb.from('friendships').delete().or(`and(user_id.eq.${a},friend_id.eq.${b}),and(user_id.eq.${b},friend_id.eq.${a})`).then(unwrap),
  };
  if (testApi) Object.assign(api, testApi);

  /* ---------- estado do modo online ---------- */
  const S = {
    configured, user: null, profile: null, ready: !configured, syncing: false, online: navigator.onLine,
    lastSync: null, error: null, authMode: 'signin', recovery: false,
    lb: { friends: null, global: null, requests: [], outgoing: [], myPos: null, loading: false, loadedAt: 0, sort: null },
  };
  const rerender = () => { if (typeof render === 'function') render(false); };
  const msg = e => (e && (e.message || e.error_description)) || 'Something went wrong';

  /* ---------- sincronização ---------- */
  const hasData = st => (st.workouts || []).length > 0 || (st.custom || []).length > 0;
  function applyRemote(remote, ts) {
    const ui = Object.fromEntries(LOCAL_KEYS.filter(k => k in state).map(k => [k, state[k]]));
    state = migrate({ ...defaultState(), ...remote, ...ui, profile: { ...defaultState().profile, ...(remote.profile || {}) } });
    state.syncedAt = ts; state.updatedAt = ts; state.cloudUser = S.user.id;
    lastSyncJson = JSON.stringify(syncData());
    saveLocal();
  }
  function mergeStates(a, b) { // une os dois lados sem perder treinos
    const byId = (x, y) => Object.values(Object.fromEntries([...(x || []), ...(y || [])].map(o => [o.id, o])));
    const bw = Object.values(Object.fromEntries([...(a.bwLog || []), ...(b.bwLog || [])].map(e => [e.date, e])));
    return {
      ...a, workouts: byId(b.workouts, a.workouts), custom: byId(b.custom, a.custom), goals: { ...(b.goals || {}), ...(a.goals || {}) },
      bwLog: bw, gym: [...new Set([...(a.gym || []), ...(b.gym || [])])], plan: a.plan || b.plan, planCfg: a.planCfg || b.planCfg,
    };
  }
  function askConflict(localN, cloudN) {
    return new Promise(res => {
      const m = $('#modal');
      m.innerHTML = `<div class="sys-window no-dismiss">
        <div class="sys-head"><span class="sys-icon">!</span><span>SYNC</span></div>
        <div class="sys-body"><p class="sys-big">TWO VERSIONS FOUND</p>
          <p>This device: <b>${localN}</b> workout${localN === 1 ? '' : 's'}<br>Cloud account: <b>${cloudN}</b> workout${cloudN === 1 ? '' : 's'}</p>
          <p class="muted">Merging keeps every workout from both.</p></div>
        <div class="btn-col"><button class="btn primary" data-merge="merge">MERGE BOTH (RECOMMENDED)</button>
          <button class="btn" data-merge="cloud">USE CLOUD VERSION</button><button class="btn ghost" data-merge="local">USE THIS DEVICE</button></div>
      </div>`;
      m.hidden = false; requestAnimationFrame(() => m.classList.add('open'));
      m.onclick = ev => {
        const b = ev.target.closest('[data-merge]'); if (!b) return;
        m.onclick = null; m.classList.remove('open');
        setTimeout(() => { m.hidden = true; m.innerHTML = ''; res(b.dataset.merge); }, 180);
      };
    });
  }

  let pushTimer = null, pushing = false, pushAgain = false, pullBusy = false;
  async function pull() {
    if (!S.user || pullBusy) return;
    pullBusy = true; S.syncing = true;
    try {
      const row = await api.pull(S.user.id);
      if (!row) { await pushNow(true); return; }
      const ts = Date.parse(row.updated_at);
      const dirty = (state.updatedAt || 0) > (state.syncedAt || 0);
      if (state.cloudUser !== S.user.id) {
        // primeira ligação deste dispositivo a esta conta
        if (hasData(state) && hasData(row.data) && JSON.stringify(syncData()) !== JSON.stringify(syncData(row.data))) {
          const choice = await askConflict(state.workouts.length, (row.data.workouts || []).length);
          if (choice === 'cloud') applyRemote(row.data, ts);
          else { if (choice === 'merge') applyRemote(mergeStates(syncData(), row.data), ts); state.cloudUser = S.user.id; await pushNow(true); }
        } else if (hasData(state) && !hasData(row.data)) { state.cloudUser = S.user.id; await pushNow(true); }
        else applyRemote(row.data, ts);
      } else if (ts > (state.syncedAt || 0)) {
        if (dirty) {
          const choice = await askConflict(state.workouts.length, (row.data.workouts || []).length);
          if (choice === 'cloud') applyRemote(row.data, ts);
          else { if (choice === 'merge') applyRemote(mergeStates(syncData(), row.data), ts); await pushNow(true); }
        } else applyRemote(row.data, ts);
      } else if (dirty) await pushNow();
      S.lastSync = Date.now(); S.error = null;
      maybePushStats();
    } catch (e) { S.error = msg(e); } finally { pullBusy = false; S.syncing = false; rerender(); }
  }
  function schedulePush() { if (!S.user) return; clearTimeout(pushTimer); pushTimer = setTimeout(() => pushNow(), 1500); }
  async function pushNow(force = false) {
    if (!S.user) return;
    if (pushing) { pushAgain = true; return; }
    if (!force && state.cloudUser !== S.user.id) return pull(); // ainda não sincronizado com esta conta
    pushing = true; S.syncing = true;
    try {
      const sent = JSON.stringify(syncData());
      const r = await api.push(S.user.id, JSON.parse(sent));
      state.syncedAt = Date.parse(r.updated_at);
      if (JSON.stringify(syncData()) === sent) state.updatedAt = state.syncedAt; // nada mudou entretanto
      state.cloudUser = S.user.id; saveLocal();
      S.lastSync = Date.now(); S.error = null;
      await maybePushStats(true);
    } catch (e) { S.error = msg(e); } finally {
      pushing = false; S.syncing = false;
      if (pushAgain) { pushAgain = false; schedulePush(); }
      if (state.tab === 'profile') rerender();
    }
  }
  let lastStatsJson = '';
  function publicStats() {
    const c = compute();
    const records = c.ranked.slice(0, 8).map(s => {
      const def = getEx(s.id);
      return { id: s.id, name: def.name, w: s.bestW.w, r: s.bestW.r, e1: Math.round(s.bestE1 * 10) / 10, mmr: Math.round(s.bestMMR), bw: def.bw };
    });
    const muscles = Object.fromEntries(Object.values(c.muscles).filter(m => m.mmr !== null).map(m => [m.key, Math.round(m.mmr)]));
    return {
      user_id: S.user.id, level: Math.min(1000, c.level.lvl), xp: c.xp, mmr: Math.min(4999, Math.round(c.mmr * 10) / 10),
      rank_idx: c.rank, ranked: c.ranked.length > 0, muscles, records, workouts_count: c.count,
      total_volume: Math.round(c.totalVol), streak: c.streak,
    };
  }
  async function maybePushStats(force) {
    if (!S.user || !S.profile) return;
    const st = publicStats(), j = JSON.stringify(st);
    if (!force && j === lastStatsJson) return;
    try { await api.saveStats(st); lastStatsJson = j; S.lb.loadedAt = 0; } catch (e) { S.error = msg(e); }
  }
  window.onDataChanged = () => schedulePush();

  /* ---------- sessão ---------- */
  async function onSession(session) {
    const prev = S.user?.id;
    S.user = session?.user || null;
    if (!S.user) { S.profile = null; S.ready = true; S.lb = { ...S.lb, friends: null, global: null, requests: [], outgoing: [], loadedAt: 0 }; rerender(); return; }
    if (prev === S.user.id && S.profile) return;
    try { S.profile = await api.getProfile(S.user.id); } catch (e) { S.error = msg(e); }
    S.ready = true; rerender();
    await pull();
    handleInvite();
  }
  async function init() {
    if (!configured) return;
    const p = new URLSearchParams(location.search);
    if (p.get('invite')) { state.pendingInvite = p.get('invite').toLowerCase(); saveLocal(); p.delete('invite'); history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : '') + location.hash); }
    api.onAuth((ev, session) => {
      if (ev === 'PASSWORD_RECOVERY') { S.recovery = true; state.tab = 'profile'; }
      if (['SIGNED_IN', 'SIGNED_OUT', 'INITIAL_SESSION', 'USER_UPDATED'].includes(ev)) setTimeout(() => onSession(session), 0);
    });
    try { await onSession(await api.getSession()); } catch (e) { S.ready = true; S.error = msg(e); rerender(); }
    let lastVis = Date.now();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - lastVis > 30000) { lastVis = Date.now(); pull(); }
    });
    addEventListener('online', () => { S.online = true; pull(); });
    addEventListener('offline', () => { S.online = false; rerender(); });
  }

  /* ---------- amigos ---------- */
  async function loadBoards(force) {
    if (!S.user || !S.profile || S.lb.loading) return;
    if (!force && Date.now() - S.lb.loadedAt < 20000 && S.lb.sort === (state.lbSort || 'mmr')) return;
    S.lb.loading = true;
    try {
      const me = S.user.id, sort = state.lbSort || 'mmr';
      const rows = await api.friendRows(me);
      const acc = rows.filter(r => r.status === 'accepted').map(r => r.user_id === me ? r.friend_id : r.user_id);
      const inc = rows.filter(r => r.status === 'pending' && r.friend_id === me).map(r => r.user_id);
      const out = rows.filter(r => r.status === 'pending' && r.user_id === me).map(r => r.friend_id);
      const people = await api.playersByIds([...new Set([me, ...acc, ...inc, ...out])]);
      const pid = Object.fromEntries(people.map(p => [p.id, p]));
      S.lb.friends = [me, ...acc].map(id => pid[id]).filter(Boolean);
      S.lb.friendIds = new Set(acc);
      S.lb.requests = inc.map(id => pid[id]).filter(Boolean);
      S.lb.outgoing = out.map(id => pid[id]).filter(Boolean);
      S.lb.global = await api.globalTop(sort);
      const mine = pid[me]?.stats;
      S.lb.myPos = mine ? (await api.countAbove(sort === 'level' ? 'xp' : 'mmr', sort === 'level' ? mine.xp : mine.mmr)) + 1 : null;
      S.lb.loadedAt = Date.now(); S.lb.sort = sort; S.error = null;
    } catch (e) { S.error = msg(e); } finally { S.lb.loading = false; if (state.tab === 'ranking') rerender(); }
  }
  async function addFriend(username) {
    username = String(username || '').trim().replace(/^@/, '').toLowerCase();
    if (!USER_RE.test(username)) return toast('Invalid username', 'bad');
    try {
      const t = await api.findUser(username);
      if (!t) return toast(`No player called @${username}`, 'bad');
      if (t.id === S.user.id) return toast("That's you!", 'bad');
      const rows = await api.friendRows(S.user.id);
      const ex = rows.find(r => (r.user_id === t.id && r.friend_id === S.user.id) || (r.user_id === S.user.id && r.friend_id === t.id));
      if (ex?.status === 'accepted') return toast(`You're already friends with @${username}`);
      if (ex && ex.user_id === t.id) { await api.accept(t.id, S.user.id); toast(`You're now friends with @${username}!`, 'ok'); }
      else if (ex) return toast('Request already sent');
      else { await api.sendRequest(S.user.id, t.id); toast(`Friend request sent to @${username}`, 'ok'); }
      await loadBoards(true);
    } catch (e) { toast(msg(e), 'bad'); }
  }
  function handleInvite() {
    const u = state.pendingInvite;
    if (!u || !S.user || !S.profile) return;
    state.pendingInvite = null; saveLocal();
    if (u === S.profile.username) return;
    queueAlerts([{ kind: 'quest', html: `<p class="sys-big">PARTY INVITE</p><p><b>@${esc(u)}</b> invited you to train together.</p><button class="btn primary wide" data-social="addinvite" data-u="${esc(u)}">ADD FRIEND</button>` }]);
  }
  async function invite() {
    if (!S.profile) return;
    const url = `${appUrl()}?invite=${S.profile.username}`;
    const text = `Join me on Iron System and let's compete! My username: @${S.profile.username}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Iron System', text, url });
      else { await navigator.clipboard.writeText(`${text}\n${url}`); toast('Invite link copied!', 'ok'); }
    } catch { /* partilha cancelada */ }
  }

  /* ---------- interface: conta ---------- */
  const ago = t => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`; };
  function accountPanel() {
    if (!configured) return `<section class="panel">
      <div class="panel-title"><span>ONLINE MODE</span></div>
      <p class="hint">Friends, rankings and cloud backup are not set up yet. The app owner needs to fill in <b>config.js</b> (see <b>SUPABASE_SETUP.md</b>). Everything else works offline.</p>
    </section>`;
    if (!S.ready) return `<section class="panel"><div class="panel-title"><span>ACCOUNT</span></div><p class="hint center">Connecting…</p></section>`;
    if (S.recovery) return `<section class="panel"><div class="panel-title"><span>NEW PASSWORD</span></div>
      <form id="pw-form" class="form"><label>New password<input name="pw" type="password" minlength="6" autocomplete="new-password" required></label>
      <button class="btn primary wide" type="submit">SAVE PASSWORD</button></form></section>`;
    if (!S.user) {
      const up = S.authMode === 'signup';
      return `<section class="panel account">
        <div class="panel-title"><span>${up ? 'CREATE ACCOUNT' : 'SIGN IN'}</span></div>
        <p class="hint">Sign in to back up your data in the cloud, add friends and compete in the rankings.</p>
        <button class="btn wide google" data-social="google"><svg viewBox="0 0 24 24"><path fill="#4285F4" d="M22.6 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7H2.1a11 11 0 0 0 0 9.9z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7l3.7 2.9C6.7 7.3 9.1 5.4 12 5.4z"/></svg><span>CONTINUE WITH GOOGLE</span></button>
        <p class="hint center small">On iPhone, inside the installed app, email works best — Google may open Safari instead.</p>
        <div class="or"><span>OR</span></div>
        <form id="auth-form" class="form">
          <label>Email<input name="email" type="email" autocomplete="email" required></label>
          <label>Password<input name="pw" type="password" minlength="6" autocomplete="${up ? 'new-password' : 'current-password'}" required></label>
          <button class="btn primary wide" type="submit">${up ? 'CREATE ACCOUNT' : 'SIGN IN'}</button>
        </form>
        <div class="auth-links">
          <button class="link" data-social="mode">${up ? 'Have an account? Sign in' : 'New here? Create an account'}</button>
          ${up ? '' : '<button class="link" data-social="forgot">Forgot password?</button>'}
        </div>
        ${S.error ? `<p class="hint err">${esc(S.error)}</p>` : ''}
      </section>`;
    }
    if (!S.profile) return `<section class="panel account">
      <div class="panel-title"><span>CHOOSE YOUR HUNTER NAME</span></div>
      <p class="hint">Your username is how friends find you. Lowercase letters, numbers and _ (3–20).</p>
      <form id="username-form" class="form">
        <label>Username<input name="username" autocapitalize="none" autocomplete="off" pattern="[a-z0-9_]{3,20}" maxlength="20" required placeholder="e.g. iron_hunter"></label>
        <label>Display name<input name="display" maxlength="24" value="${esc(state.profile.name)}" required></label>
        <button class="btn primary wide" type="submit">CONFIRM</button>
      </form>
      ${S.error ? `<p class="hint err">${esc(S.error)}</p>` : ''}
      <button class="btn ghost wide" data-social="signout">SIGN OUT</button>
    </section>`;
    const status = !S.online ? '<span class="dot off"></span>Offline — changes will sync later'
      : S.syncing ? '<span class="dot busy"></span>Syncing…'
      : S.error ? `<span class="dot err"></span>${esc(S.error)}`
      : `<span class="dot ok"></span>Synced ${S.lastSync ? ago(S.lastSync) : ''}`;
    return `<section class="panel account">
      <div class="panel-title"><span>ACCOUNT</span></div>
      <div class="acc-head">${emblem(C.ranked.length ? C.rank : null, 52)}<div><b>${esc(S.profile.display_name)}</b><span>@${esc(S.profile.username)}</span><small>${esc(S.user.email || '')}</small></div></div>
      <p class="sync-status">${status}</p>
      <div class="btn-row"><button class="btn primary" data-social="invite">INVITE FRIENDS</button><button class="btn" data-social="sync">SYNC NOW</button></div>
      <button class="btn ghost wide" data-social="signout" style="margin-top:10px">SIGN OUT</button>
    </section>`;
  }

  /* ---------- interface: rankings ---------- */
  function row(p, i, sort) {
    const st = p.stats, me = p.id === S.user.id;
    const ri = st && st.ranked ? st.rank_idx : null;
    return `<li class="lb-row ${me ? 'me' : ''}" data-player="${p.id}">
      <span class="pos ${i < 3 ? 'top' + (i + 1) : ''}">${i + 1}</span>
      ${emblem(ri, 40)}
      <div class="lb-who"><b>${esc(p.display_name)}${me ? ' <small>(you)</small>' : ''}</b><span>@${esc(p.username)} · ${ri !== null ? `<i style="color:${TIERS[RANKS[ri].tier].glow}">${RANKS[ri].name}</i>` : 'Unranked'}</span></div>
      <div class="lb-val"><b>${sort === 'level' ? 'LV ' + (st?.level || 1) : fmt(st?.mmr || 0, 0)}</b><small>${sort === 'level' ? fmt(st?.xp || 0, 0) + ' EXP' : 'MMR · LV ' + (st?.level || 1)}</small></div>
    </li>`;
  }
  function leaderboardView(v) {
    if (!configured || !S.user || !S.profile) return `<section class="panel center">
      <div class="panel-title"><span>${v === 'friends' ? 'FRIENDS' : 'GLOBAL'} RANKING</span></div>
      <div class="big-icon">${emblem(null, 80)}</div>
      <p class="empty">${!configured ? 'Online features are not set up yet (see SUPABASE_SETUP.md).' : 'Sign in to compete with your friends and the world.'}</p>
      ${configured ? '<button class="btn primary wide" data-tab="profile">SIGN IN</button>' : ''}
    </section>`;
    loadBoards(false);
    const sort = state.lbSort === 'level' ? 'level' : 'mmr';
    const sortSeg = `<div class="chips seg"><button class="chip ${sort === 'mmr' ? 'on' : ''}" data-social="sort" data-v="mmr">BY RANK</button><button class="chip ${sort === 'level' ? 'on' : ''}" data-social="sort" data-v="level">BY LEVEL</button>
      <button class="chip" data-social="refresh" aria-label="Refresh">↻</button></div>`;
    const loading = '<p class="hint center">Loading…</p>';
    if (v === 'friends') {
      const list = S.lb.friends ? [...S.lb.friends].sort((a, b) => sort === 'level' ? (b.stats?.xp || 0) - (a.stats?.xp || 0) : (b.stats?.mmr || 0) - (a.stats?.mmr || 0)) : null;
      return `
      <section class="panel">
        <div class="panel-title"><span>ADD FRIENDS</span></div>
        <form id="friend-form" class="inline-form"><input name="u" placeholder="@username" autocapitalize="none" autocomplete="off"><button class="btn sm primary" type="submit">ADD</button></form>
        <button class="btn ghost wide" data-social="invite" style="margin-top:10px">SHARE INVITE LINK</button>
        ${S.lb.requests.length ? `<div class="req-title">FRIEND REQUESTS</div><ul class="req-list">${S.lb.requests.map(p => `<li><div><b>${esc(p.display_name)}</b><span>@${esc(p.username)}</span></div>
          <button class="btn sm primary" data-social="accept" data-id="${p.id}">ACCEPT</button><button class="icon-btn sm" data-social="decline" data-id="${p.id}" aria-label="Decline">${IC.x}</button></li>`).join('')}</ul>` : ''}
        ${S.lb.outgoing.length ? `<div class="req-title">SENT</div><ul class="req-list">${S.lb.outgoing.map(p => `<li><div><b>${esc(p.display_name)}</b><span>@${esc(p.username)} · pending</span></div>
          <button class="icon-btn sm" data-social="decline" data-id="${p.id}" aria-label="Cancel request">${IC.x}</button></li>`).join('')}</ul>` : ''}
      </section>
      <section class="panel">
        <div class="panel-title"><span>FRIENDS RANKING</span></div>
        ${sortSeg}
        ${!list ? loading : `<ol class="lb">${list.map((p, i) => row(p, i, sort)).join('')}</ol>
          ${list.length < 2 ? '<p class="hint center">Add friends to see how you stack up!</p>' : ''}`}
        ${S.error ? `<p class="hint err">${esc(S.error)}</p>` : ''}
      </section>`;
    }
    const g = S.lb.global;
    const inTop = g && g.some(p => p.id === S.user.id);
    const mine = S.lb.friends?.find(p => p.id === S.user.id);
    return `<section class="panel">
      <div class="panel-title"><span>GLOBAL RANKING</span></div>
      ${sortSeg}
      ${S.lb.myPos ? `<div class="my-pos">YOUR POSITION <b>#${S.lb.myPos}</b></div>` : ''}
      ${!g ? loading : `<ol class="lb">${g.map((p, i) => row(p, i, sort)).join('')}</ol>
        ${!inTop && mine && S.lb.myPos ? `<ol class="lb mine" start="${S.lb.myPos}">${row(mine, S.lb.myPos - 1, sort)}</ol>` : ''}
        ${!g.length ? '<p class="hint center">No players yet — be the first!</p>' : ''}`}
      ${S.error ? `<p class="hint err">${esc(S.error)}</p>` : ''}
    </section>`;
  }
  function showPlayer(id) {
    const p = [...(S.lb.friends || []), ...(S.lb.global || [])].find(x => x.id === id); if (!p) return;
    const st = p.stats || {}, me = id === S.user.id, friend = S.lb.friendIds?.has(id);
    const ri = st.ranked ? st.rank_idx : null;
    const muscles = Object.fromEntries(MUSCLES.map(m => [m.key, { ...m, mmr: st.muscles?.[m.key] ?? null }]));
    const m = $('#modal');
    m.innerHTML = `<div class="sys-window player">
      <div class="sys-head"><span class="sys-icon">!</span><span>PLAYER</span></div>
      <div class="sys-body">
        <div class="alert-emblem" style="--glow:${ri !== null ? TIERS[RANKS[ri].tier].glow : '#3a5687'}">${emblem(ri, 96, 'float')}</div>
        <p class="rank-name" style="color:${ri !== null ? TIERS[RANKS[ri].tier].glow : 'var(--muted)'}">${ri !== null ? RANKS[ri].name : 'UNRANKED'}</p>
        <p><b>${esc(p.display_name)}</b> <span class="muted">@${esc(p.username)}</span></p>
        <div class="summary"><div><span>LEVEL</span><b>${st.level || 1}</b></div><div><span>MMR</span><b>${fmt(st.mmr || 0, 0)}</b></div><div><span>WORKOUTS</span><b>${st.workouts_count || 0}</b></div></div>
        ${bodyMap(muscles, null)}
        ${(st.records || []).length ? `<div class="req-title">TOP LIFTS</div><ul class="p-recs">${st.records.map(r => `<li><span>${esc(getEx(r.id)?.name || r.name)}</span><b>${r.bw ? (r.w ? '+' + fmt(r.w) + 'kg' : 'BW') : fmt(r.w) + 'kg'} × ${r.r}</b><small>1RM ${fmt(r.e1, 0)}</small></li>`).join('')}</ul>` : '<p class="muted">No ranked lifts yet.</p>'}
      </div>
      <div class="btn-col">
        ${!me && !friend ? `<button class="btn primary" data-social="addid" data-u="${esc(p.username)}">ADD FRIEND</button>` : ''}
        ${friend ? `<button class="btn danger" data-social="unfriend" data-id="${p.id}">REMOVE FRIEND</button>` : ''}
        <button class="btn" data-act="mclose">CLOSE</button>
      </div>
    </div>`;
    m.hidden = false; requestAnimationFrame(() => m.classList.add('open'));
  }

  /* ---------- eventos ---------- */
  document.addEventListener('click', async ev => {
    const pl = ev.target.closest('[data-player]');
    if (pl) return showPlayer(pl.dataset.player);
    const el = ev.target.closest('[data-social]'); if (!el) return;
    const d = el.dataset;
    try {
      switch (d.social) {
        case 'google': return await api.signInGoogle();
        case 'mode': S.authMode = S.authMode === 'signup' ? 'signin' : 'signup'; S.error = null; return rerender();
        case 'forgot': {
          const email = $('#auth-form input[name="email"]')?.value.trim();
          if (!email) return toast('Type your email first', 'bad');
          await api.resetPassword(email); return toast('Check your email for the reset link', 'ok');
        }
        case 'signout':
          if (!(await sysConfirm('Sign out? Your data stays on this device and in the cloud.', 'SIGN OUT'))) return;
          await api.signOut(); state.cloudUser = null; state.syncedAt = 0; saveLocal(); return onSession(null);
        case 'sync': await pull(); return toast(S.error ? 'Sync failed' : 'Synced', S.error ? 'bad' : 'ok');
        case 'invite': return invite();
        case 'sort': state.lbSort = d.v; saveLocal(); S.lb.loadedAt = 0; rerender(); return;
        case 'refresh': return loadBoards(true);
        case 'accept': await api.accept(d.id, S.user.id); toast('Friend added!', 'ok'); return loadBoards(true);
        case 'decline': await api.removeFriend(S.user.id, d.id); return loadBoards(true);
        case 'unfriend':
          closeModal();
          if (!(await sysConfirm('Remove this friend?', 'REMOVE'))) return;
          await api.removeFriend(S.user.id, d.id); return loadBoards(true);
        case 'addid': closeModal(); return addFriend(d.u);
        case 'addinvite': closeModal(); state.rankView = 'friends'; go('ranking'); return addFriend(d.u);
      }
    } catch (e) { toast(msg(e), 'bad'); }
  });
  document.addEventListener('submit', async ev => {
    const f = ev.target, fd = new FormData(f);
    try {
      if (f.id === 'auth-form') {
        const email = String(fd.get('email')).trim(), pw = String(fd.get('pw'));
        S.error = null;
        if (S.authMode === 'signup') {
          const r = await api.signUp(email, pw);
          if (!r.session) { toast('Account created — check your email to confirm it', 'ok'); S.authMode = 'signin'; rerender(); }
        } else await api.signIn(email, pw);
      }
      if (f.id === 'username-form') {
        const username = String(fd.get('username')).trim().toLowerCase(), display = String(fd.get('display')).trim().slice(0, 24);
        if (!USER_RE.test(username)) return toast('Username: 3–20 lowercase letters, numbers or _', 'bad');
        if (!display) return toast('Choose a display name', 'bad');
        const taken = await api.findUser(username);
        if (taken && taken.id !== S.user.id) return toast('That username is taken', 'bad');
        S.profile = await api.saveProfile({ id: S.user.id, username, display_name: display });
        await maybePushStats(true); toast(`Welcome, @${username}!`, 'ok'); rerender(); handleInvite();
      }
      if (f.id === 'pw-form') { await api.updatePassword(String(fd.get('pw'))); S.recovery = false; toast('Password updated', 'ok'); rerender(); }
      if (f.id === 'friend-form') { await addFriend(fd.get('u')); f.reset(); }
    } catch (e) { S.error = msg(e); toast(S.error, 'bad'); rerender(); }
  });

  window.Social = { S, api, accountPanel, leaderboardView, init, pull, pushNow, loadBoards, mergeStates, publicStats };
  init().then(rerender);
  rerender();
})();
