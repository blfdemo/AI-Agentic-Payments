/* AgentPay — shared agent runtime (v3.1)
   1. Keeps the agent's run state (live flag, session counters, terminal log, lane cards, in-flight tasks)
      in localStorage so it survives page changes: press "Go live" once and it keeps working until you stop it.
   2. On every page EXCEPT the Agent Console it runs the agent "headless" (no UI) so it really keeps working while
      you browse Home / Wallets / Settings…  The console picks up exactly where the background left off.
   3. Notification preferences for the agent's pop-up toasts (All / Important / Custom / Off).            */
(function () {
  const AS = window.AgentScript;
  if (!AS || !window.AP) return;

  const KEY = "agentpay.run.v1", OKEY = "agentpay.run.owner";
  const ME = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const APPROVAL_MS = 120000, MAXC = 3, MAXLANES = 7, MAXLOG = 300;
  const isConsole = /agent\.html$/.test(location.pathname);
  const blank = () => ({ live: false, sessionOpen: false, startedAt: 0, seq: 0, sess: { spent: 0, settled: 0, blocked: 0, total: 0 }, log: [], lanes: [], inflight: [] });
  const read = () => { try { const r = JSON.parse(localStorage.getItem(KEY)); if (r && r.sess) return Object.assign(blank(), r); } catch (e) {} return blank(); };

  let R = read(), mine = false, tmr = null;
  const run = (AP.run = { APPROVAL_MS, MAXC, MAXLANES, isConsole });
  run.R = () => R;
  run.mine = () => mine;

  /* ---------- who is allowed to run the agent right now (only one tab / page at a time) ---------- */
  const ownerRec = () => { try { return JSON.parse(localStorage.getItem(OKEY)) || {}; } catch (e) { return {}; } };
  run.claim = (force) => {
    const o = ownerRec();
    if (o.id === ME || !o.id || Date.now() - (o.ts || 0) > 5000 || force) {
      if (!mine) R = read();
      try { localStorage.setItem(OKEY, JSON.stringify({ id: ME, ts: Date.now() })); } catch (e) {}
      mine = true; return true;
    }
    mine = false; return false;
  };
  const flush = () => { try { R.log = R.log.slice(-MAXLOG); localStorage.setItem(KEY, JSON.stringify(R)); } catch (e) {} };
  run.save = () => { if (!mine || tmr) return; tmr = setTimeout(() => { tmr = null; flush(); }, 400); };   // throttled, not debounced
  const release = () => { if (!mine) return; clearTimeout(tmr); tmr = null; flush(); try { localStorage.setItem(OKEY, JSON.stringify({ id: ME, ts: 0 })); } catch (e) {} mine = false; };
  addEventListener("pagehide", release);
  addEventListener("pageshow", (e) => { if (e.persisted) location.reload(); });
  addEventListener("storage", (e) => { if (e.key === KEY && !mine) { R = read(); badge(); } });
  run.reset = () => { try { localStorage.removeItem(KEY); localStorage.removeItem(OKEY); } catch (e) {} };

  /* ---------- terminal log (stored as ready-made HTML lines) ---------- */
  run.line = (html, id) => `<span class="t">${new Date().toLocaleTimeString("en-GB")}</span> ` + (id ? `<span class="tg c${id % 6}">#${id}</span> ` : '<span class="tg sys">sys</span> ') + html;
  run.log = (html, id) => { const e = { h: run.line(html, id) }; R.log.push(e); if (R.log.length > MAXLOG + 60) R.log.splice(0, R.log.length - MAXLOG); run.save(); return e; };

  /* ---------- notification preferences ---------- */
  const CATS = [
    ["settled", "Payment settled", "A payment went through"],
    ["approval", "Needs your approval", "Above your approval threshold"],
    ["blocked", "Blocked by policy", "Payment stopped, no funds moved"],
    ["cancelled", "Cancelled or rejected", "Stopped, declined or expired"],
    ["system", "Agent status", "Stopped itself, budget reached, wallet empty"],
  ];
  const PRESETS = {
    all: { settled: true, approval: true, blocked: true, cancelled: true, system: true },
    important: { settled: false, approval: true, blocked: true, cancelled: false, system: true },
  };
  const nt = (AP.agentNotify = { cats: CATS, presets: PRESETS });
  nt.get = () => { const S = AP.state(); if (!S.agentNotify) { S.agentNotify = { on: true, mode: "important", ev: Object.assign({}, PRESETS.important) }; AP.save(); } return S.agentNotify; };
  nt.effective = () => { const n = nt.get(); return n.mode === "custom" ? Object.assign({}, PRESETS.important, n.ev) : PRESETS[n.mode] || PRESETS.important; };
  nt.allowed = (cat) => { const n = nt.get(); return !!(n.on && nt.effective()[cat]); };
  nt.toast = (cat, msg, type) => { if (nt.allowed(cat)) AP.toast(msg, type); };
  nt.set = (patch) => { Object.assign(nt.get(), patch); AP.save(); };
  const EVCAT = { "payment.settled": "settled", "payment.blocked": "blocked", "approval.requested": "approval", "balance.low": "system" };
  AP.toastGate = (ev) => nt.allowed(EVCAT[ev] || "system");   // used by AP.emit for its email/push toasts
  run.notifyLane = (status, scn) => {
    if (status === "settled") nt.toast("settled", `Settled ${AP.usd(scn.amount)} → ${scn.merchant}`, "ok");
    else if (status === "blocked") nt.toast("blocked", `${scn.merchant}: blocked by policy`, "bad");
    else nt.toast("cancelled", `${scn.merchant}: ${status === "stopped" ? "stopped" : status}`, "warn");
  };

  /* ---------- lane records (what a finished lane looks like after a page change) ---------- */
  run.rec = (L, status) => ({ id: L.id, agentId: L.ag.id, status, st: L.st || {}, msg: L.msg || "", rows: L.rows || null, tx: L.tx || null,
    scn: { merchant: L.scn.merchant, task: L.scn.task, amount: L.scn.amount, protocol: L.scn.protocol, chain: L.scn.chain, icon: L.scn.icon } });
  run.pushLane = (rec) => { R.lanes.unshift(rec); R.lanes.length = Math.min(R.lanes.length, MAXLANES); run.save(); };

  /* ---------- shared decisions: should the agent stop / wait / start something? ---------- */
  run.plan = (f) => {
    const S = AP.state(), P = S.policy, budget = +(localStorage.getItem("agentpay.budget") || 500);
    if (S.security.frozen) return { stop: ["Kill switch is active — agent halted", "bad"] };
    if (!S.wallet || !S.wallet.connected) return { stop: ["Wallet disconnected — agent stopped. Connect a wallet to go live again", "warn"] };
    if (S.agentWallet.balance < 0.05) return { stop: ["Agent wallet is empty — fund it to continue", "warn"] };
    if (AP.spentToday() + f.s >= P.daily - 0.5) return f.n ? { wait: true } : { stop: [`Daily budget of ${AP.usd(P.daily, 0)} reached — agent stopped itself`, "warn"] };
    if (R.sess.spent + f.s >= budget) return f.n ? { wait: true } : { stop: [`Session budget of ${AP.usd(budget, 0)} reached — agent stopped itself`, "warn"] };
    return { go: true, cap: Math.min(P.perTx, S.agentWallet.sessionKey.perTx), budget };
  };
  run.pick = (f, p) => {
    const S = AP.state(), mission = localStorage.getItem("agentpay.mission") || "all";
    for (let i = 0; i < 8; i++) { const c = AS.generate(mission, S.mandates); if (c.risk >= 70 || c.amount > p.cap || R.sess.spent + f.s + c.amount <= p.budget) return c; }
    return null;
  };
  /* run one task (mandate gate first, then the normal payment pipeline) against any "ui" */
  run.exec = async (scn, ui) => {
    const S = AP.state(), ag = ui.agent, m = scn.mandateId && S.mandates.find((x) => x.id === scn.mandateId);
    if (scn.mandateId && (!m || !m.active || scn.amount > m.cap)) {
      ui.log(`<span class="k">▶ ${AP.esc(ag.name)}</span> <span class="t">${AP.esc(scn.task)}</span>`); await ui.wait(700);
      const why = !m || !m.active ? `mandate ${scn.mandateId} was revoked by the owner` : `amount exceeds the ${m.cap} USDC mandate cap`;
      ui.stage("intent", "ok", "Recurring charge detected"); ui.stage("discover", "bad", "No valid mandate"); ui.log(`<span class="r">✖ BLOCKED</span> ${AP.esc(why)} — agent will not pay`);
      ["verify", "policy", "approval", "sign", "settle", "receipt"].forEach((x) => ui.stage(x, "skip"));
      AP.addActivity({ agent: ag.name, merchant: scn.merchant, amount: scn.amount, token: "USDC", chain: scn.chain, status: "blocked", protocol: scn.protocol, tx: null }); ui.done("blocked");
    } else await AS.run(scn, ui);
  };

  /* ---------- sidebar indicator (green = running, amber = waiting for you) ---------- */
  function badge() {
    if (!document.body) return;
    document.body.classList.toggle("agent-live", !!R.live);
    document.body.classList.toggle("agent-wait", R.inflight.some((e) => e.awaiting));
  }
  run.badge = badge;

  /* =====================================================================
     Headless agent: runs on every page except the Agent Console
     ===================================================================== */
  if (isConsole) return;

  const speed = () => +(localStorage.getItem("agentpay.speed") || 1);
  const liveL = new Map(), pending = new Map();
  let resumed = false, nextAt = Date.now() + 2500;
  const inflight = () => R.inflight.reduce((a, e) => ({ s: a.s + e.scn.amount, n: a.n + 1 }), { s: 0, n: 0 });

  function finishBG(L, status) {
    liveL.delete(L.id); pending.delete(L.id);
    R.inflight = R.inflight.filter((x) => x.id !== L.id);
    if (status === "settled") { R.sess.spent += L.scn.amount; R.sess.settled++; } else R.sess.blocked++;
    run.pushLane(run.rec(L, status)); run.notifyLane(status, L.scn); run.save(); badge();
  }

  function bgLane(scn, entry) {
    const S = AP.state(), ag = S.agents.find((a) => a.id === scn.agentId) || S.agents[0];
    let e = entry;
    if (!e) { e = { id: ++R.seq, scn, agentId: ag.id }; R.inflight.push(e); R.sess.total++; }
    const L = { id: e.id, scn, ag, e, cancelled: false, st: {}, msg: "Task received", rows: null, tx: null };
    liveL.set(L.id, L);
    let silent = !!(e.awaiting || e.approved);                 // replay quietly up to the approval step
    if (entry && !silent) run.log('<span class="y">↻ resumed</span> <span class="t">task continues after page change</span>', L.id);
    const wait = async (ms) => { if (!silent) await new Promise((r) => setTimeout(r, ms / speed())); if (L.cancelled) throw new Error("cancel"); };
    const ui = {
      agent: ag, wait, log: (h) => { if (!silent) run.log(h, L.id); },
      think: async (t) => { if (silent) return; run.log('<span class="k">agent</span> ' + AP.esc(t), L.id); await wait(Math.min(t.length * 5, 1200) + 220); },
      stage: (id, st, d) => { L.st[id] = st; if (d && st !== "skip") L.msg = d; },
      progress: () => {}, receipt: (rows, tx) => { L.rows = rows; L.tx = tx; }, done: (st) => finishBG(L, st),
      approve: (req) => new Promise((res) => {
        silent = false;
        if (e.approved) return res({ ok: true });
        const first = !e.awaiting; e.awaiting = e.awaiting || Date.now() + APPROVAL_MS; e.req = req; pending.set(L.id, res);
        if (first) {
          run.log('<span class="y">⏸</span> waiting in your approval inbox — <span class="t">other tasks keep running</span>', L.id);
          AP.emit("approval.requested", req); nt.toast("approval", `Approval needed: ${AP.usd(req.amount)} → ${req.merchant} — open Agent Console`, "warn");
        }
        run.save(); badge();
      }),
    };
    (async () => { try { await run.exec(scn, ui); } catch (err) { if (err.message === "cancel") { run.log('<span class="y">■ Stopped</span>', L.id); L.st.approval = L.st.approval === "warn" ? "bad" : L.st.approval; finishBG(L, "stopped"); } else console.error(err); } })();
    run.save(); badge();
  }

  function stopBG(msg, type) {
    R.live = false; if (/budget|empty|Kill/i.test(msg)) R.sessionOpen = false;
    run.log(`<span class="${type === "bad" ? "r" : "y"}">■</span> ${AP.esc(msg)}`); nt.toast("system", msg, type); run.save(); badge();
  }

  function beat() {
    if (!run.claim()) { liveL.forEach((L) => (L.cancelled = true)); badge(); return; }
    const S = AP.state(); if (!S.mandates) { S.mandates = AS.mandatesDefault(); AP.save(); }
    if (!resumed) { resumed = true; R.inflight.slice().forEach((e) => bgLane(e.scn, e)); }
    if (S.security.frozen) liveL.forEach((L) => (L.cancelled = true));
    pending.forEach((res, id) => { const L = liveL.get(id); if (L && Date.now() > L.e.awaiting) { pending.delete(id); run.log('<span class="y">approval expired — payment cancelled</span>', id); res({ ok: false }); } });
    if (R.live && Date.now() >= nextAt) {
      const f = inflight(), p = run.plan(f);
      if (p.stop) stopBG(p.stop[0], p.stop[1]);
      else if (p.go && f.n < MAXC) { const scn = run.pick(f, p); if (scn) bgLane(scn); }
      nextAt = Date.now() + AP.rand(3200, 7500) / speed();
    }
    run.save(); badge();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", badge); else badge();
  setTimeout(beat, 300); setInterval(beat, 1000);
})();
