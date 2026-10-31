/* Agent Console — Live mode.
   The agent runs as a loop: events arrive on their own, each one becomes a "lane" that walks the
   payment pipeline (AgentScript.run), several lanes can run at once, and anything above your
   approval threshold waits in the Approval inbox WITHOUT blocking the rest of the agent. */
(function () {
  if (!AP.shell()) return;
  const S = AP.state(), AS = AgentScript, SC = AS.scenarios, RN = AP.run, NT = AP.agentNotify;
  RN.claim(true); const R = RN.R();                       // persisted run state (survives page changes)
  if (!S.mandates) { S.mandates = AS.mandatesDefault(); AP.save(); }

  const STAGES = [["intent", "Understand task"], ["discover", "Discover terms"], ["verify", "Verify payee"], ["policy", "Policy check"], ["approval", "Human approval"], ["sign", "Sign (session key)"], ["settle", "Settle on-chain"], ["receipt", "Receipt & audit"]];
  const SHORT = { intent: "Planning", discover: "Discovering terms", verify: "Verifying payee", policy: "Policy check", approval: "Awaiting approval", sign: "Signing", settle: "Settling on-chain", receipt: "Writing receipt" };
  const STATUS = { settled: ["ok", "Settled"], rejected: ["gray", "Rejected"], blocked: ["bad", "Blocked"], pending: ["warn", "Needs approval"], stopped: ["gray", "Stopped"] };
  const MAXC = RN.MAXC, MAXLANES = RN.MAXLANES, APPROVAL_MS = RN.APPROVAL_MS;

  let live = R.live, sessionOpen = R.sessionOpen, timer = null, startedAt = R.startedAt, speed = +(localStorage.getItem("agentpay.speed") || 1), mission = localStorage.getItem("agentpay.mission") || "all", budget = +(localStorage.getItem("agentpay.budget") || 500);
  const lanes = new Map(), inbox = [], sess = R.sess;
  const persist = () => { R.live = live; R.sessionOpen = sessionOpen; R.startedAt = startedAt; RN.save(); };
  const $ = AP.$, esc = AP.esc;

  /* ---------------- terminal ---------------- */
  const term = $("#term");
  const idleTerm = () => (term.innerHTML = '<div class="t">// Agent offline. Press <b>Go live</b> and it will find things to pay for, check your policy and only ask you when it must.</div>');
  const stamp = () => `<span class="t">${new Date().toLocaleTimeString("en-GB")}</span> `;
  const tag = (L) => (L ? `<span class="tg c${L.id % 6}">#${L.id}</span> ` : '<span class="tg sys">sys</span> ');
  let pinned = true;                                   // follow the newest line, unless the user scrolled up to read
  term.addEventListener("scroll", () => { pinned = term.scrollHeight - term.scrollTop - term.clientHeight < 40; });
  const toBottom = () => { if (pinned) term.scrollTop = term.scrollHeight; };
  function push(html, L) {
    if (term.querySelector(".t:only-child")) term.innerHTML = "";
    const e = RN.log(html, L && L.id), d = document.createElement("div"); d.innerHTML = e.h; d._e = e; term.appendChild(d);
    while (term.children.length > 500) term.firstChild.remove();
    toBottom(); return d;
  }
  function restoreLog() {                                   // bring the terminal back after a page change
    if (!R.log.length) return idleTerm();
    term.innerHTML = ""; const fr = document.createDocumentFragment();
    R.log.slice(-500).forEach((e) => { const d = document.createElement("div"); d.innerHTML = e.h; d._e = e; fr.appendChild(d); });
    term.appendChild(fr); term.scrollTop = term.scrollHeight;
  }
  restoreLog();
  $("#clearTerm").onclick = () => { pinned = true; R.log.length = 0; RN.save(); idleTerm(); };

  /* ---------------- lanes ---------------- */
  const laneHTML = (L) => { const s = L.scn; return `
    <div class="ln-top"><div class="ln-ic">${AP.agentAv(L.ag, 42)}<span class="ln-badge">${AP.icon(s.icon || "zap", 12)}</span></div>
      <div class="ln-t"><b>${esc(s.merchant)}</b><span>${esc(L.ag.name)} · ${esc(s.protocol)} · ${esc(s.chain)}</span></div>
      <div class="ln-amt">${AP.usd(s.amount)}<small>USDC</small></div><button class="ln-x" title="Stop this payment">${AP.icon("x", 14)}</button></div>
    <div class="ln-task">${esc(s.task)}</div>
    <div class="ln-rail">${STAGES.map(([i, t]) => `<i data-st="${i}" title="${t}"></i>`).join("")}</div>
    <div class="ln-foot"><span class="chip brand" data-chip>Starting</span><span class="ln-msg" data-msg>Task received</span></div>
    <div class="prog sm d-none" data-prog><i style="width:0"></i></div><div class="ln-extra" data-extra></div>`; };
  const q = (L, s) => L.el.querySelector(s);
  function stage(L, id, st, detail) {
    const seg = q(L, `[data-st="${id}"]`); if (!seg) return; L.st[id] = st; if (detail && st !== "skip") L.msg = detail;
    seg.className = st; if (detail && st !== "skip") q(L, "[data-msg]").textContent = detail;
    if (st === "run" || st === "warn") { const c = q(L, "[data-chip]"); c.className = "chip " + (st === "warn" ? "warn" : "brand"); c.textContent = SHORT[id]; }
    L.el.classList.toggle("is-warn", st === "warn"); if (st === "ok" || st === "bad") L.el.classList.remove("is-warn");
  }
  function finish(L, status) {
    const [c, l] = STATUS[status]; const ch = q(L, "[data-chip]"); ch.className = "chip " + c; ch.textContent = l;
    L.el.classList.remove("running", "is-warn"); L.el.classList.add("fin", "st-" + status); L.status = status;
    if (status === "settled") { sess.spent += L.scn.amount; sess.settled++; } else sess.blocked++;
    R.inflight = R.inflight.filter((x) => x.id !== L.id); RN.pushLane(RN.rec(L, status));
    if (status !== "settled") q(L, "[data-extra]").innerHTML = `<div class="ln-note ${status === "blocked" ? "bad" : ""}">${AP.icon(status === "blocked" ? "shield" : "x", 16)} No funds moved — payment ${status}.</div>`;
    RN.notifyLane(status, L.scn);
  }
  function receipt(L, rows, tx) {
    L.rows = rows; L.tx = tx;
    q(L, "[data-extra]").innerHTML = `<div class="ln-rcpt">${["Network fee", "Tx hash", "Time"].map((k) => `<div><span>${k}</span><b>${esc(rows[k])}</b></div>`).join("")}<button class="btn btn-lav btn-sm" data-cp>Copy tx</button></div>`;
    q(L, "[data-cp]").onclick = () => AP.copy(tx);
  }
  async function wait(L, ms) { if (!L.ff) await new Promise((r) => setTimeout(r, ms / speed)); if (L.cancelled) throw new Error("cancel"); }
  async function think(L, text) {
    if (L.ff) return;
    const d = push('<span class="k">agent</span> ', L), sp = document.createElement("span"); d.appendChild(sp); let n = 0;
    for (const ch of text) { sp.textContent += ch; toBottom(); if (++n % 14 === 0) d._e.h = d.innerHTML; await wait(L, 5); }
    d._e.h = d.innerHTML; RN.save();
    await wait(L, 220);
  }
  function inflight() { let s = 0, n = 0; lanes.forEach((L) => { if (!L.done) { s += L.scn.amount; n++; } }); return { s, n }; }

  function launch(scn, entry) {
    const ag = S.agents.find((a) => a.id === scn.agentId) || S.agents[0], e = entry || { id: ++R.seq, scn, agentId: ag.id };
    const L = { id: e.id, scn, ag, e, cancelled: false, done: false, status: null, st: {}, msg: "", resume: !!entry, ff: !!(entry && (entry.awaiting || entry.approved)) };
    if (!entry) { R.inflight.push(e); sess.total++; }
    L.el = document.createElement("div"); L.el.className = "lane running"; L.el.innerHTML = laneHTML(L);
    q(L, ".ln-x").onclick = () => { if (!L.done) { L.cancelled = true; rejectInbox(L, true); } };
    const host = $("#lanes"); const emp = host.querySelector(".empty"); if (emp) emp.remove();
    host.prepend(L.el); lanes.set(L.id, L);
    while (host.children.length > MAXLANES) { const old = [...host.children].reverse().find((x) => x.classList.contains("fin")); if (!old) break; old.remove(); }
    runLane(L); kpis(); count(); RN.save(); return L;
  }
  function restoreLanes() {                                  // finished lane cards from before the page change
    R.lanes.forEach((rec) => {
      const ag = S.agents.find((a) => a.id === rec.agentId) || S.agents[0], L = { id: rec.id, scn: rec.scn, ag, done: true, status: rec.status };
      L.el = document.createElement("div"); L.el.className = "lane fin st-" + rec.status; L.el.innerHTML = laneHTML(L);
      STAGES.forEach(([i]) => { const sg = q(L, `[data-st="${i}"]`); if (sg && rec.st[i]) sg.className = rec.st[i] === "run" ? "ok" : rec.st[i] === "warn" ? "bad" : rec.st[i]; });
      const [c, l] = STATUS[rec.status] || STATUS.rejected, ch = q(L, "[data-chip]"); ch.className = "chip " + c; ch.textContent = l; if (rec.msg) q(L, "[data-msg]").textContent = rec.msg;
      if (rec.status === "settled" && rec.rows) receipt(L, rec.rows, rec.tx);
      else if (rec.status !== "settled") q(L, "[data-extra]").innerHTML = `<div class="ln-note ${rec.status === "blocked" ? "bad" : ""}">${AP.icon(rec.status === "blocked" ? "shield" : "x", 16)} No funds moved — payment ${rec.status}.</div>`;
      $("#lanes").appendChild(L.el);
    });
  }
  async function runLane(L) {
    const s = L.scn;
    if (L.resume && !L.ff) push('<span class="y">↻ resumed</span> <span class="t">task continues after page change</span>', L);
    const ui = { agent: L.ag, wait: (ms) => wait(L, ms), log: (h) => { if (!L.ff) push(h, L); }, think: (t) => think(L, t), stage: (i, st, d) => stage(L, i, st, d), approve: (r) => approve(L, r),
      progress: (p) => { const pr = q(L, "[data-prog]"); pr.classList.remove("d-none"); pr.firstElementChild.style.width = p * 100 + "%"; },
      receipt: (rows, tx) => receipt(L, rows, tx), done: (st) => finish(L, st) };
    try {
      await RN.exec(s, ui);
    } catch (e) {
      if (e.message === "cancel") { push('<span class="y">■ Stopped</span>', L); STAGES.forEach(([id]) => { const g = q(L, `[data-st="${id}"]`); if (g.className === "run" || g.className === "warn") stage(L, id, "bad", "Stopped"); }); const ch = q(L, "[data-chip]"); ch.className = "chip gray"; ch.textContent = "Stopped"; L.el.classList.remove("running", "is-warn"); L.el.classList.add("fin"); sess.blocked++; R.inflight = R.inflight.filter((x) => x.id !== L.id); RN.pushLane(RN.rec(L, "stopped")); }
      else { console.error(e); push('<span class="r">Error: ' + esc(e.message) + "</span>", L); }
    }
    R.inflight = R.inflight.filter((x) => x.id !== L.id); L.done = true; RN.save(); kpis(); count(); side();
  }
  const count = () => { const n = inflight().n; $("#laneCount").textContent = n + " running"; $("#laneCount").className = "chip " + (n ? "brand" : "gray"); if (!lanes.size && !$("#lanes").children.length) emptyLanes(); };
  const emptyLanes = () => ($("#lanes").innerHTML = `<div class="empty card-ap"><div class="mb-2" style="color:var(--brand)">${AP.icon("bot", 34)}</div><b>No activity yet</b><div class="small mt-1">Press <b>Go live</b> — the agent finds work on its own. Or trigger a task on the left.</div></div>`);

  /* ---------------- approval inbox (non-blocking) ---------------- */
  function approve(L, req) {
    return new Promise((res) => {
      if (L.e.approved) { L.ff = false; return res({ ok: true }); }   // you approved just before leaving the page
      const first = !L.e.awaiting; L.ff = false; L.e.awaiting = L.e.awaiting || Date.now() + APPROVAL_MS; L.e.req = req; RN.save();
      inbox.push({ L, req, res, exp: L.e.awaiting }); renderInbox(); title();
      if (first) {
        AP.emit("approval.requested", req); NT.toast("approval", `Approval needed: ${AP.usd(req.amount)} → ${req.merchant}`, "warn");
        push(`<span class="y">⏸</span> waiting in your approval inbox — <span class="t">other tasks keep running</span>`, L);
      }
    });
  }
  function settleInbox(it, ok, why) {
    const i = inbox.indexOf(it); if (i < 0) return; inbox.splice(i, 1); it.L.e.awaiting = null; if (ok) it.L.e.approved = true; RN.save();
    if (!ok && why) push(`<span class="y">${esc(why)}</span>`, it.L);
    it.res({ ok }); renderInbox(); title();
  }
  const rejectInbox = (L, quiet) => inbox.filter((x) => x.L === L).forEach((x) => settleInbox(x, false, quiet ? "" : "")) ;
  function renderInbox() {
    $("#inboxCount").textContent = inbox.length + " waiting"; $("#inboxCount").className = "chip " + (inbox.length ? "warn" : "gray");
    $("#inboxCard").classList.toggle("alert", inbox.length > 0); { const c = $("#cntApp"); c.textContent = inbox.length; c.classList.toggle("show", inbox.length > 0); if (inbox.length) c.classList.add("pulse"); }
    $("#inbox").innerHTML = inbox.length ? inbox.map((it, i) => `<div class="appr" data-ix="${i}">
      <div class="d-flex justify-content-between align-items-start gap-2"><div class="d-flex gap-2 align-items-center">${AP.agentAv(it.L.ag, 38)}<div><b>${esc(it.req.merchant)}</b><div class="muted small">${esc(it.L.ag.name)} · ${esc(it.req.chain)} · over your ${AP.usd(it.req.threshold, 0)} threshold</div></div></div><div class="ln-amt">${AP.usd(it.req.amount)}<small>USDC</small></div></div>
      ${S.security.pin ? `<input class="form-control form-control-sm text-center mt-2" data-pin inputmode="numeric" placeholder="PIN" style="letter-spacing:6px"><div class="invalid-feedback d-block small" data-err></div>` : ""}
      <div class="prog sm mt-2"><i data-cd style="width:100%"></i></div><div class="muted small mt-1" data-cdt></div>
      <div class="d-flex gap-2 mt-2"><button class="btn btn-soft btn-sm flex-grow-1" data-no>Reject</button><button class="btn btn-brand btn-sm flex-grow-1" data-yes>Approve &amp; pay</button></div></div>`).join("") : `<div class="empty small">Nothing waiting. Payments above ${AP.usd(S.policy.approval, 0)} will appear here.</div>`;
    AP.$$("#inbox .appr").forEach((el) => { const it = inbox[+el.dataset.ix];
      el.querySelector("[data-no]").onclick = () => settleInbox(it, false);
      el.querySelector("[data-yes]").onclick = () => { const p = el.querySelector("[data-pin]"); if (p && btoa(p.value) !== S.security.pin) { el.querySelector("[data-err]").textContent = "Incorrect PIN"; return; } settleInbox(it, true); }; });
    ticks();
  }
  function ticks() { AP.$$("#inbox .appr").forEach((el) => { const it = inbox[+el.dataset.ix]; if (!it) return; const left = Math.max(0, it.exp - Date.now()); el.querySelector("[data-cd]").style.width = (left / APPROVAL_MS) * 100 + "%"; el.querySelector("[data-cdt]").textContent = "Auto-rejects in " + Math.ceil(left / 1000) + "s"; }); }
  const title = () => (document.title = (inbox.length ? `(${inbox.length}) ` : "") + "Agent Console · AgentPay");

  /* ---------------- live loop ---------------- */
  function schedule(first) { clearTimeout(timer); timer = setTimeout(tick, first ? 700 : AP.rand(3200, 7500) / speed); }
  function tick() {
    if (!live) return;
    const f = inflight(), p = RN.plan(f);
    if (p.stop) return stopLive(p.stop[0], p.stop[1], "system");
    if (p.wait) return schedule();
    if (f.n < MAXC) { const scn = RN.pick(f, p); if (scn) launch(scn); }
    schedule();
  }
  function goLive() {
    if (!S.wallet.connected) { AP.toast("Connect a wallet to take the agent live", "warn"); return AP.connectWallet(() => { hero(); goLive(); }); }
    if (S.security.frozen) return AP.toast("Kill switch is active — unfreeze agents first", "bad");
    if (S.agents.every((a) => a.status !== "active")) return AP.toast("All agents are paused — resume one in the crew list", "warn");
    live = true; if (!sessionOpen) { sessionOpen = true; sess.spent = 0; sess.settled = 0; sess.blocked = 0; sess.total = 0; startedAt = Date.now(); kpis(); } persist(); push(`<span class="g">● LIVE</span> mission <b>${esc(missionName())}</b> · session budget ${AP.usd(budget, 0)} · watching APIs, invoice inbox and mandates`); hero(); schedule(true);
  }
  function stopLive(msg, type, cat) { live = false; if (/budget|empty|Kill/i.test(msg || "")) sessionOpen = false; clearTimeout(timer); persist(); if (msg) { push(`<span class="${type === "bad" ? "r" : "y"}">■</span> ${esc(msg)}`); if (cat) NT.toast(cat, msg, type || "warn"); else AP.toast(msg, type || "warn"); } hero(); }
  const missionName = () => (mission === "all" ? "all agents" : (S.agents.find((a) => a.id === mission) || { name: mission }).name);

  /* ---------------- hero / kpis / side ---------------- */
  function hero() {
    const fz = S.security.frozen, n = inflight().n, c = $("#runChip");
    c.className = "live-chip " + (fz ? "frozen" : live ? "on" : n ? "idle" : ""); c.textContent = fz ? "Frozen" : live ? "Live" : n ? "Finishing tasks" : "Offline";
    const orb = $("#orb"), pool = mission === "all" ? S.agents : S.agents.filter((a) => a.id === mission), shown = pool.slice(0, 4), more = pool.length - shown.length;
    orb.classList.toggle("live", live && !fz); orb.classList.toggle("frozen", fz); orb.classList.toggle("solo", shown.length === 1);
    orb.innerHTML = shown.map((a) => AP.agentAv(a, shown.length === 1 ? 64 : 52)).join("") + (more > 0 ? `<span class="av-more">+${more}</span>` : "");
    $("#heroSub").innerHTML = fz ? "Kill switch is active. No agent can sign a payment until you resume." : live ? `Working on its own — watching x402 endpoints, the invoice inbox and ${S.mandates.filter((m) => m.active).length} active mandates. It only interrupts you when a payment needs approval.` : "Press <b>Go live</b>. The agent keeps running: it finds things to pay for, checks every rule you set, pays what is allowed, blocks what is not, and asks you only when it must.";
    const b = $("#liveBtn"); b.className = "btn-go " + (live ? "on" : ""); b.innerHTML = AP.icon(live ? "stop" : "play", 18) + (live ? " Pause agent" : " Go live");
    const k = $("#killBtn"); k.innerHTML = AP.icon("power", 18) + (fz ? " Resume agents" : " Kill switch"); k.classList.toggle("resume", fz);
  }
  function kpis() {
    const pct = Math.min(100, (sess.spent / budget) * 100), up = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0, mm = String(Math.floor(up / 60)).padStart(2, "0"), ss = String(up % 60).padStart(2, "0");
    $("#kpis").innerHTML = [
      ["Session spend", AP.usd(sess.spent) + `<em> / ${AP.usd(budget, 0)}</em>`, `<div class="prog sm mt-2"><i style="width:${pct}%"></i></div>`],
      ["Payments settled", sess.settled, `<span class="muted small">of ${sess.total} tasks handled</span>`],
      ["Stopped by policy", sess.blocked, `<span class="muted small">no funds moved</span>`],
      ["Awaiting approval", inbox.length, `<span class="muted small">${inbox.length ? "agent keeps working" : "inbox clear"}</span>`],
      ["Uptime", `${mm}:${ss}`, `<span class="muted small">${live ? "running" : "not running"}</span>`],
    ].map(([a, b, c]) => `<div class="kpi"><small>${a}</small><b>${b}</b>${c}</div>`).join("");
  }
  const polHTML = () => { const P = S.policy, sk = S.agentWallet.sessionKey, spent = AP.spentToday(), ok = sk.active && sk.expires > Date.now(), pct = Math.min(100, (spent / P.daily) * 100);
    return `<div class="bh"><h5>Live policy</h5><a href="security.html#policy" class="small">Edit</a></div>
      <div class="d-flex justify-content-between small mb-1"><span class="muted">Daily budget</span><b>${AP.usd(spent, 2)} / ${AP.usd(P.daily, 0)}</b></div><div class="prog mb-3"><i style="width:${pct}%"></i></div>
      <div class="receipt grow"><div class="rw"><span>Per-tx limit</span><b>${AP.usd(Math.min(P.perTx, sk.perTx), 0)}</b></div><div class="rw"><span>Approval above</span><b>${AP.usd(P.approval, 0)}</b></div><div class="rw"><span>Allow-list only</span><b>${P.requireAllowlist ? "On" : "Off"}</b></div><div class="rw"><span>Session key</span><b style="color:var(--${ok ? "ok" : "bad"})">${ok ? "Active" : "Inactive"}</b></div><div class="rw"><span>Agent balance</span><b>${AP.usd(S.agentWallet.balance)}</b></div><div class="rw"><span>Kill switch</span><b style="color:var(--${S.security.frozen ? "bad" : "ok"})">${S.security.frozen ? "Frozen" : "Off"}</b></div></div>`; };
  let selAg = null;
  const agStats = (a) => { const used = S.activity.filter((x) => x.agent === a.name && x.status === "settled").reduce((t, x) => t + x.amount, 0); return { used, pct: Math.min(100, Math.round((used / (a.budget || 1)) * 100)), run: [...lanes.values()].filter((L) => L.ag.id === a.id && !L.done).length }; };
  function side() {
    $("#polSnap").innerHTML = polHTML(); $("#polSnap2").innerHTML = polHTML();
    $("#sessKv").innerHTML = [["Session spend", AP.usd(sess.spent)], ["Settled", sess.settled], ["Blocked", sess.blocked], ["Wallet", AP.usd(S.agentWallet.balance, 0)]].map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join("");
    const rows = S.activity.slice(0, 9);
    $("#hist").innerHTML = rows.map((a) => { const [c, l] = STATUS[a.status] || STATUS.settled; return `<div class="log-row"><div class="flex-grow-1"><b style="font-size:13.5px">${esc(a.merchant)}</b><div class="muted small">${esc(a.agent)} · ${esc(a.protocol)} · ${AP.ago(a.ts)}</div></div><b>${AP.usd(a.amount)}</b><span class="chip ${c}">${l}</span></div>`; }).join("");
    $("#byAgent").innerHTML = S.agents.map((a) => { const st = agStats(a); return `<div class="mb-3"><div class="d-flex justify-content-between align-items-center small mb-1"><b class="d-flex align-items-center gap-2">${AP.agentAv(a, 24)}${esc(a.name)}</b><span class="muted">${AP.usd(st.used, 0)} / ${AP.usd(a.budget, 0)}</span></div><div class="prog"><i style="width:${st.pct}%;background:${a.color}"></i></div></div>`; }).join("") + `<div class="muted small mt-2">Budgets are monthly caps per agent. Edit them in Agent settings.</div>`;
    $("#mandates").innerHTML = S.mandates.map((m) => `<div class="log-row"><div class="flex-grow-1"><b style="font-size:13.5px">${esc(m.merchant)}</b><div class="muted small">${AP.usd(m.amount, 0)} per charge · cap ${AP.usd(m.cap, 0)}/mo</div></div><button class="pill-btn" data-m="${m.id}">${m.active ? "Revoke" : "Restore"}</button></div>`).join("");
    AP.$$("[data-m]").forEach((b) => (b.onclick = () => { const m = S.mandates.find((x) => x.id === b.dataset.m); m.active = !m.active; AP.save(); AP.toast(`Mandate ${m.id} ${m.active ? "restored" : "revoked — agent can no longer pay it"}`, m.active ? "ok" : "warn"); side(); hero(); }));
    const R = S.rails || {};
    $("#railList").innerHTML = [["x402", "zap", "HTTP 402 · USDC", true], ["AP2", "refresh", "Signed mandates", true], ["Visa", "visa", R.Visa && R.Visa.on ? "•••• " + R.Visa.last4 + " · limit " + AP.usd(R.Visa.limit, 0) : "Not enabled", !!(R.Visa && R.Visa.on)], ["Mastercard", "mc", R.Mastercard && R.Mastercard.on ? "•••• " + R.Mastercard.last4 + " · limit " + AP.usd(R.Mastercard.limit, 0) : "Not enabled", !!(R.Mastercard && R.Mastercard.on)]]
      .map(([k, i, d, on]) => `<div class="log-row">${AP.icon(i, 30)}<div class="flex-grow-1"><b style="font-size:13.5px">${k}</b><div class="muted small">${d}</div></div><span class="chip ${on ? "ok" : "gray"}">${on ? "On" : "Off"}</span></div>`).join("");
    $("#listsBox").innerHTML = `<div class="small fw-bold mb-2">Allow-listed merchants (${S.policy.allowlist.length})</div><div class="d-flex flex-wrap gap-2 mb-4">${S.policy.allowlist.map((d) => `<span class="chip brand plain">${esc(d)}</span>`).join("")}</div><div class="small fw-bold mb-2">Blocked categories</div><div class="d-flex flex-wrap gap-2">${S.policy.blocked.map((d) => `<span class="chip bad">${esc(d)}</span>`).join("") || '<span class="muted small">None</span>'}</div>`;
    $("#apprInfo").innerHTML = `<div class="sec-row"><div class="si">${AP.icon("sliders", 20)}</div><div class="tx"><b>Threshold ${AP.usd(S.policy.approval, 0)}</b><span>Anything above waits here. Agents can have a lower personal threshold.</span></div></div><div class="sec-row"><div class="si">${AP.icon("lock", 20)}</div><div class="tx"><b>${S.security.pin ? "PIN required" : "No PIN set"}</b><span>${S.security.pin ? "You enter your 4-digit PIN to approve." : "Set a PIN in Security for extra safety."}</span></div></div><div class="sec-row"><div class="si">${AP.icon("clock", 20)}</div><div class="tx"><b>Auto-reject after 2 minutes</b><span>Other tasks keep running while one waits.</span></div></div><div class="sec-row"><div class="si">${AP.icon("users", 20)}</div><div class="tx"><b>${(S.team || []).filter((t) => t.role === "approver" || t.role === "admin" || t.role === "owner").length} people can approve</b><span><a href="settings.html#team">Manage roles</a></span></div></div>`;
    crewRender(); settingsRender();
  }
  const acc = { propose: "Propose only", spend: "Spend within limits", subscribe: "Spend + subscribe" };
  function crewRender() {
    const pl = AP.plan(); $("#crewSub").textContent = `${S.agents.length} of ${pl.agents > 999 ? "∞" : pl.agents} agents on ${pl.name}`;
    $("#crew").innerHTML = S.agents.map((a) => { const st = agStats(a); return `<div class="card-ap c4 agent-card"><div class="top">${AP.agentAv(a, 48)}<div class="flex-grow-1"><b>${esc(a.name)}</b><div class="muted small">${st.run ? st.run + " task" + (st.run > 1 ? "s" : "") + " running" : esc(a.role)}</div></div><span class="chip ${a.status === "active" ? "ok" : "gray"}">${a.status === "active" ? "Active" : "Paused"}</span></div>
      <div><div class="d-flex justify-content-between small mb-1"><span class="muted">Budget used</span><b>${AP.usd(st.used, 0)} / ${AP.usd(a.budget, 0)}</b></div><div class="prog"><i style="width:${st.pct}%;background:${a.color}"></i></div></div>
      <div class="tags">${(a.rails || []).map((r) => `<span>${r}</span>`).join("")}</div>
      <div class="muted small">${acc[a.access] || "Spend within limits"} · max ${AP.usd(a.perTx || 0, 0)} · ask above ${AP.usd(a.approval == null ? S.policy.approval : a.approval, 0)}${a.allow && a.allow.length ? " · " + a.allow.length + " merchants" : ""}</div>
      <div class="d-flex gap-2 push"><button class="pill-btn flex-grow-1" data-ag="${a.id}">${a.status === "active" ? "Pause" : "Resume"}</button><button class="pill-btn" data-edit="${a.id}">Edit</button></div></div>`; }).join("") +
      `<div class="card-ap c4 empty-add" id="addTile">${AP.icon("plus", 34)}<b>Create agent</b><span class="small">Choose what it can access and where it can pay</span></div>`;
    AP.$$("[data-ag]").forEach((b) => (b.onclick = () => { const a = S.agents.find((x) => x.id === b.dataset.ag); a.status = a.status === "active" ? "paused" : "active"; AP.save(); side(); hero(); }));
    AP.$$("[data-edit]").forEach((b) => (b.onclick = () => { selAg = b.dataset.edit; side(); show("settings", true); }));
    $("#addTile").onclick = makeAgent;
  }
  function makeAgent() { AP.newAgent((a) => { selAg = a.id; fillMission(); side(); hero(); }); }
  function settingsRender() {
    if (!selAg || !S.agents.find((a) => a.id === selAg)) selAg = S.agents[0] && S.agents[0].id; const a = S.agents.find((x) => x.id === selAg); if (!a) return;
    $("#setList").innerHTML = S.agents.map((x) => `<button class="log-row border-0 w-100 text-start ${x.id === selAg ? "sel" : ""}" data-sel="${x.id}" style="background:${x.id === selAg ? "var(--brand-50)" : "transparent"};border-radius:14px!important">${AP.agentAv(x, 38)}<div class="flex-grow-1"><b style="font-size:13.5px;color:var(--ink)">${esc(x.name)}</b><div class="muted small">${esc(x.role)}</div></div></button>`).join("");
    AP.$$("[data-sel]").forEach((b) => (b.onclick = () => { selAg = b.dataset.sel; settingsRender(); }));
    $("#setTitle").textContent = a.name + " · settings"; $("#setForm").innerHTML = AP.agentFormHTML(a, "es_"); AP.bindAgentForm("es_"); AP.renderIcons();
    const sk = S.agentWallet.sessionKey, ok = sk.active && sk.expires > Date.now();
    $("#setKey").innerHTML = `<div class="receipt"><div class="rw"><span>Session key</span><b class="mono">${sk.id}</b></div><div class="rw"><span>Status</span><b style="color:var(--${ok ? "ok" : "bad"})">${ok ? "Active" : "Inactive"}</b></div><div class="rw"><span>Key limit</span><b>${AP.usd(sk.perTx, 0)} / tx</b></div><div class="rw"><span>Effective limit for ${esc(a.name)}</span><b>${AP.usd(Math.min(sk.perTx, S.policy.perTx, a.perTx || 1e9), 0)}</b></div><div class="rw"><span>Access level</span><b>${acc[a.access] || "—"}</b></div></div><a href="wallets.html" class="btn btn-lav mt-3">Manage session key</a>`;
    $("#setDanger").innerHTML = `<div class="set-row"><div class="tx"><b>${a.status === "active" ? "Pause" : "Resume"} this agent</b><span>Paused agents never start new payments.</span></div><button class="btn btn-soft btn-sm" id="dgPause">${a.status === "active" ? "Pause" : "Resume"}</button></div><div class="set-row"><div class="tx"><b>Delete agent</b><span>Removes the agent. Past payments stay in the audit log.</span></div><button class="btn btn-danger-soft btn-sm" id="dgDel" ${S.agents.length <= 1 ? "disabled" : ""}>Delete</button></div>`;
    $("#dgPause").onclick = () => { a.status = a.status === "active" ? "paused" : "active"; AP.save(); side(); hero(); };
    $("#dgDel").onclick = () => { if (!confirm("Delete " + a.name + "?")) return; if (inflight().n && [...lanes.values()].some((L) => L.ag.id === a.id && !L.done)) return AP.toast("Wait for its running tasks to finish", "warn"); S.agents = S.agents.filter((x) => x.id !== a.id); AP.save(); selAg = null; if (mission === a.id) { mission = "all"; localStorage.setItem("agentpay.mission", mission); } fillMission(); side(); hero(); AP.toast("Agent deleted", "ok"); };
  }
  $("#setSave").onclick = () => { const a = S.agents.find((x) => x.id === selAg), v = AP.readAgentForm("es_"); if (!a || !v) return; Object.assign(a, v); AP.save(); AP.toast(a.name + " updated", "ok"); fillMission(); side(); hero(); };
  $("#setReset").onclick = () => settingsRender();
  ["newAgentBtn", "newAgentBtn2"].forEach((i) => ($("#" + i).onclick = makeAgent));
  function fillMission() { const m = $("#missionSel"), base = [["all", "All agents"]].concat(S.agents.map((a) => [a.id, a.name])); m.innerHTML = base.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join(""); if (!base.some(([v]) => v === mission)) mission = "all"; m.value = mission; }
  const show = AP.tabs(document, "live");
  document.addEventListener("tabchange", (e) => { if (e.detail === "approvals") $("#cntApp").classList.remove("pulse"); });

  /* ---------------- controls ---------------- */
  $("#liveBtn").onclick = () => (live ? stopLive("Agent paused — finishing tasks already running", "warn") : goLive());
  $("#killBtn").onclick = () => {
    if (S.security.frozen) { S.security.frozen = false; AP.save(); push('<span class="g">▶</span> agents unfrozen'); AP.toast("Agents unfrozen", "ok"); }
    else { S.security.frozen = true; AP.save(); stopLive(null); sessionOpen = false; persist(); lanes.forEach((L) => { if (!L.done) L.cancelled = true; }); inbox.slice().forEach((it) => settleInbox(it, false)); push('<span class="r">⏻ KILL SWITCH</span> all agents frozen, running payments cancelled, signing revoked'); AP.toast("All agents frozen", "bad"); }
    hero(); side(); kpis();
  };
  fillMission(); $("#missionSel").onchange = (e) => { mission = e.target.value; localStorage.setItem("agentpay.mission", mission); if (live) push(`mission changed to <b>${esc(missionName())}</b>`); hero(); };
  const budgetBtn = () => ($("#budgetBtn").innerHTML = `${AP.icon("target", 18)}<span>${AP.usd(budget, 0)}</span>${AP.icon("chevron-down", 14)}`);
  $("#budgetMenu").innerHTML = `<div class="small muted mb-2">The agent stops itself when it has spent this much in one session.</div>` + AP.limitHTML({ id: "sessBudget", label: "Session budget", min: 50, max: 2000, step: 50, value: budget, def: 500 });
  budgetBtn();
  document.addEventListener("limchange", (e) => { if (e.detail.id !== "sessBudget") return; budget = Math.floor(e.detail.value) || 500; localStorage.setItem("agentpay.budget", budget); budgetBtn(); kpis(); });
  AP.$$("[data-sp]").forEach((b) => (b.onclick = () => { speed = +b.dataset.sp; localStorage.setItem("agentpay.speed", speed); AP.$$("[data-sp]").forEach((x) => x.classList.toggle("on", +x.dataset.sp === speed)); }));
  $(`[data-sp="${speed}"]`).click();

  $("#scnList").innerHTML = SC.map((s) => `<button class="scn" data-s="${s.id}"><div class="si">${AP.icon(s.icon, 20)}</div><div><b>${s.title}</b><span>${s.sub}</span></div></button>`).join("");
  AP.$$("[data-s]").forEach((b) => (b.onclick = () => { const s = SC.find((x) => x.id === b.dataset.s); launch(Object.assign({}, s, { response: s.response })); }));
  $("#cmdForm").onsubmit = (e) => { e.preventDefault(); const p = AS.parsePrompt($("#cmdIn").value); if (!p) return AP.toast("Try: “Pay 25 USDC to api.weatherdata.xyz”", "warn"); launch(p); $("#cmdIn").value = ""; };

  setInterval(() => { kpis(); ticks(); inbox.slice().forEach((it) => { if (Date.now() > it.exp) settleInbox(it, false, "approval expired — payment cancelled"); }); }, 1000);
  /* ---------------- pop-up notification preferences ---------------- */
  const MODE_LABEL = { off: "Off", all: "All", important: "Important", custom: "Custom" };
  function ntfRender() {
    const n = NT.get(), eff = NT.effective(), mode = n.on ? n.mode : "off", menu = $("#ntfMenu");
    const btn = $("#ntfBtn"); btn.classList.toggle("off", !n.on);
    btn.innerHTML = `${AP.icon("bell", 18)}<span>${MODE_LABEL[mode]}</span>${AP.icon("chevron-down", 14)}`;
    menu.classList.toggle("is-off", !n.on);
    menu.innerHTML = `<div class="ntf-head"><div><b>Pop-up notifications</b><span>Toasts while the agent works</span></div><div class="form-check form-switch m-0"><input class="form-check-input" type="checkbox" id="ntfOn" ${n.on ? "checked" : ""} aria-label="Pop-up notifications"></div></div>
      <div class="seg ntf-seg">${["all", "important", "custom"].map((m) => `<button data-nm="${m}" class="${n.on && n.mode === m ? "on" : ""}">${m === "important" ? "Important" : m[0].toUpperCase() + m.slice(1)}</button>`).join("")}</div>
      <div class="ntf-list">${NT.cats.map(([k, t, d]) => `<label class="ntf-row"><span><b>${t}</b><small>${d}</small></span><input class="form-check-input" type="checkbox" data-c="${k}" ${eff[k] ? "checked" : ""}></label>`).join("")}</div>
      <div class="ntf-foot">Everything is still written to the terminal, lane cards and the Activity page — this only controls pop-ups.</div>`;
    $("#ntfOn").onchange = (e) => { NT.set({ on: e.target.checked }); ntfRender(); };
    AP.$$("#ntfMenu [data-nm]").forEach((b) => (b.onclick = () => { const m = b.dataset.nm, n2 = NT.get(); NT.set(m === "custom" ? { on: true, mode: m, ev: Object.assign({}, NT.effective()) } : { on: true, mode: m, ev: n2.ev }); ntfRender(); }));
    AP.$$("#ntfMenu [data-c]").forEach((c) => (c.onchange = () => { NT.set({ on: true, mode: "custom", ev: Object.assign({}, NT.effective(), { [c.dataset.c]: c.checked }) }); ntfRender(); }));
  }
  function ntfInit() {
    ntfRender();
    try { new bootstrap.Dropdown($("#ntfBtn"), { autoClose: "outside", popperConfig: (_, def) => Object.assign({}, def, { strategy: "fixed" }) }); } catch (e) {}
  }

  ntfInit();
  restoreLanes(); if (!$("#lanes").children.length) emptyLanes();
  hero(); kpis(); side(); renderInbox(); AP.renderIcons();
  R.inflight.slice().forEach((e) => launch(e.scn, e));        // pick up tasks that were mid-flight when the page changed
  if (live) schedule(true);                                   // the agent keeps going until YOU press Pause
  if (location.hash === "#live" && !live) goLive();
})();
