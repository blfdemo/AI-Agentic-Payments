(function () {
  if (!AP.shell()) return;
  const S = AP.state(), $ = AP.$, esc = AP.esc, save = () => AP.save();
  const wm = new bootstrap.Modal($("#whModal"));
  const sw = (id, on) => `<div class="form-check form-switch m-0"><input class="form-check-input" type="checkbox" id="${id}" ${on ? "checked" : ""}></div>`;

  /* ---------- general ---------- */
  function general() {
    $("#gProfile").innerHTML = `<div class="d-flex align-items-center gap-3 mb-3">${AP.userAv(64)}<div><b style="font-size:16px">${esc(S.user.name || "Your name")}</b><div class="muted small">${esc(S.user.email)}</div></div></div>
      <label class="form-label small">Choose your avatar</label><div class="mb-3">${AP.avPicker("user", S.user.avatar || "user-01", "pAv")}</div>
      <label class="form-label small">Full name</label><input class="form-control mb-3" id="pName" value="${esc(S.user.name)}"><label class="form-label small">Time zone</label><select class="form-select" id="pTz">${["Asia/Kolkata", "UTC", "America/New_York", "Europe/London", "Asia/Singapore"].map((z) => `<option ${S.prefs.tz === z ? "selected" : ""}>${z}</option>`).join("")}</select><button class="btn btn-brand push align-self-start" id="pSave">Save profile</button>`;
    AP.bindAvPicker("pAv", (id) => { S.user.avatar = id; save(); AP.$$(".js-user-av").forEach((i) => (i.src = AP.avSrc(id))); AP.toast("Avatar updated", "ok"); });
    $("#pSave").onclick = () => { S.user.name = $("#pName").value.trim() || S.user.name; S.prefs.tz = $("#pTz").value; save(); AP.toast("Profile saved", "ok"); };
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    $("#gPrefs").innerHTML = `<div class="set-row"><div class="tx"><b>Dark theme</b><span>Easier on the eyes at night</span></div>${sw("sDark", dark)}</div><div class="set-row"><div class="tx"><b>Compact sidebar</b><span>Icons only</span></div>${sw("sCol", localStorage.getItem("agentpay.collapsed") === "1")}</div>
      <div class="set-row"><div class="tx"><b>Display currency</b><span>Amounts are settled in USDC</span></div><select class="form-select" id="sCur" style="width:110px"><option>USD</option><option>EUR</option><option>INR</option></select></div><div class="set-row" style="flex-direction:column;align-items:stretch;gap:10px"><div class="tx"><b>Default approval threshold</b><span>Used for new agents</span></div>${AP.limitHTML({ id: "sThr", label: "Ask me to approve above", min: 0, max: 1000, step: 10, value: S.prefs.defaultApproval || 0, def: 100, minCustom: 0 })}</div>`;
    $("#sCur").value = S.prefs.currency;
    $("#sDark").onchange = (e) => AP.setTheme(e.target.checked ? "dark" : "light");
    $("#sCol").onchange = (e) => { localStorage.setItem("agentpay.collapsed", e.target.checked ? "1" : "0"); $("#shell").classList.toggle("collapsed", e.target.checked); };
    $("#sCur").onchange = (e) => { S.prefs.currency = e.target.value; save(); };
    if (!window._sThrBound) document.addEventListener("limchange", (window._sThrBound = (e) => { if (e.detail.id === "sThr") { S.prefs.defaultApproval = e.detail.value || 0; save(); } }));
    $("#gData").innerHTML = `<div class="set-row"><div class="tx"><b>Export workspace</b><span>Download settings, agents and activity as JSON</span></div><button class="btn btn-lav btn-sm" id="dExp">Export</button></div><div class="set-row"><div class="tx"><b>Audit log</b><span>${S.activity.length} payments recorded</span></div><a class="btn btn-soft btn-sm" href="activity.html">Open</a></div><div class="set-row"><div class="tx"><b>Plan</b><span>${AP.plan().name}</span></div><a class="btn btn-soft btn-sm" href="subscription.html">Manage</a></div>`;
    $("#dExp").onclick = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: "application/json" })); a.download = "agentpay-workspace.json"; a.click(); };
    $("#gDanger").innerHTML = `<div class="set-row"><div class="tx"><b>Reset demo data</b><span>Restores the starting state and signs you out</span></div><button class="btn btn-danger-soft btn-sm" id="dRes">Reset</button></div><div class="set-row"><div class="tx"><b>Freeze all agents</b><span>Same as the kill switch</span></div><a class="btn btn-danger-soft btn-sm" href="security.html">Open</a></div>`;
    $("#dRes").onclick = () => { if (confirm("Reset all demo data and sign out?")) { AP.reset(); location.href = "login.html"; } };
  }

  /* ---------- alerts ---------- */
  function evRows(kind) { const n = S.notify[kind]; return AP.EVENTS.map(([k, t]) => `<div class="set-row"><div class="tx"><b>${t}</b></div>${sw(kind + "_" + k.replace(".", "_"), n.ev[k])}</div>`).join(""); }
  function alerts() {
    $("#emOn").checked = S.notify.email.on; $("#puOn").checked = S.notify.push.on;
    $("#emBox").innerHTML = `<label class="form-label small">Send to</label><input class="form-control mb-2" id="emTo" value="${esc(S.notify.email.to)}">${evRows("email")}<button class="btn btn-lav push align-self-start mt-3" id="emTest">Send test email</button>`;
    $("#puBox").innerHTML = `<div class="muted small mb-2">Push alerts go to your phone and desktop once you install the AgentPay app.</div>${evRows("push")}<button class="btn btn-lav push align-self-start mt-3" id="puTest">Send test push</button>`;
    ["email", "push"].forEach((kind) => AP.EVENTS.forEach(([k]) => { $("#" + kind + "_" + k.replace(".", "_")).onchange = (e) => { S.notify[kind].ev[k] = e.target.checked; save(); }; }));
    $("#emOn").onchange = (e) => { S.notify.email.on = e.target.checked; save(); AP.toast("Email alerts " + (e.target.checked ? "on" : "off"), "ok"); };
    $("#puOn").onchange = (e) => { S.notify.push.on = e.target.checked; save(); AP.toast("Push alerts " + (e.target.checked ? "on" : "off"), "ok"); };
    $("#emTo").onchange = (e) => { S.notify.email.to = e.target.value; save(); AP.toast("Address saved", "ok"); };
    $("#emTest").onclick = () => AP.toast("Test email sent to " + S.notify.email.to, "ok"); $("#puTest").onclick = () => AP.toast("Test push sent", "ok");
  }

  /* ---------- webhooks ---------- */
  let evSel = ["payment.settled", "payment.blocked"];
  function hooks() {
    $("#whList").innerHTML = S.webhooks.length ? S.webhooks.map((w) => `<div class="log-row" style="align-items:flex-start"><div class="si" style="width:38px;height:38px;border-radius:12px;background:var(--brand-50);color:var(--brand);display:flex;align-items:center;justify-content:center">${AP.icon("webhook", 18)}</div><div class="flex-grow-1" style="min-width:0"><b class="mono small d-block text-truncate">${esc(w.url)}</b><div class="tags mt-1">${w.ev.map((e) => `<span>${e}</span>`).join("")}</div></div>${sw("wa_" + w.id, w.active)}<button class="btn btn-soft btn-icon" style="width:34px;height:34px" data-test="${w.id}" title="Send test">${AP.icon("send", 14)}</button><button class="btn btn-danger-soft btn-icon" style="width:34px;height:34px" data-del="${w.id}" title="Delete">${AP.icon("trash", 14)}</button></div>`).join("") : '<div class="muted text-center my-auto">No endpoints yet. Add one to receive signed events.</div>';
    S.webhooks.forEach((w) => ($("#wa_" + w.id).onchange = (e) => { w.active = e.target.checked; save(); }));
    AP.$$("[data-del]").forEach((b) => (b.onclick = () => { S.webhooks = S.webhooks.filter((w) => w.id !== b.dataset.del); save(); hooks(); AP.renderIcons(); }));
    AP.$$("[data-test]").forEach((b) => (b.onclick = () => { const w = S.webhooks.find((x) => x.id === b.dataset.test); S.deliveries.unshift({ id: "d" + Date.now(), ts: Date.now(), ev: "test.ping", url: w.url, code: 200, ms: AP.rand(40, 200) }); save(); AP.toast("Test event delivered (200 OK)", "ok"); hooks(); AP.renderIcons(); }));
    $("#whLog").innerHTML = S.deliveries.length ? S.deliveries.slice(0, 8).map((d) => `<div class="log-row"><span class="chip ok">${d.code}</span><div class="flex-grow-1" style="min-width:0"><b class="small d-block">${d.ev}</b><div class="muted small text-truncate">${esc(d.url.replace(/^https?:\/\//, ""))}</div></div><span class="muted small">${d.ms}ms · ${AP.ago(d.ts)}</span></div>`).join("") : '<div class="muted text-center my-auto small">No deliveries yet. Run the agent or send a test event.</div>';
    const sec = (S.webhooks[0] || { secret: "whsec_…" }).secret;
    $("#whVerify").innerHTML = `<div class="muted small mb-2">Every request carries an <b>AgentPay-Signature</b> header: an HMAC-SHA256 of the raw body using your signing secret.</div><div class="addr-box mb-3"><span class="mono small flex-grow-1">${esc(sec)}</span><button class="btn btn-soft btn-icon" style="width:34px;height:34px" id="cpSec">${AP.icon("copy", 16)}</button></div><pre class="mono small p-3 mb-0" style="background:var(--bg);border-radius:14px;overflow:auto">const sig = crypto\n  .createHmac("sha256", SECRET)\n  .update(rawBody).digest("hex");\nif (sig !== header) return 401;</pre>`;
    $("#cpSec").onclick = () => AP.copy(sec);
    $("#whEvents").innerHTML = AP.EVENTS.map(([k, t]) => `<div class="log-row"><span class="mono small fw-bold" style="color:var(--brand-text)">${k}</span><div class="flex-grow-1 muted small text-end">${t}</div></div>`).join("");
  }
  $("#whAdd").onclick = () => { $("#whUrl").value = ""; evSel = ["payment.settled"]; $("#whEv").innerHTML = AP.EVENTS.map(([k]) => `<button type="button" class="chip-tog ${evSel.includes(k) ? "on" : ""}" data-v="${k}">${k}</button>`).join(""); AP.$$("#whEv .chip-tog").forEach((b) => (b.onclick = () => { b.classList.toggle("on"); evSel = AP.$$("#whEv .on").map((x) => x.dataset.v); })); wm.show(); };
  $("#whGo").onclick = () => { const u = $("#whUrl").value.trim() || "https://example.com/hooks/agentpay"; S.webhooks.push({ id: "wh" + Date.now(), url: u, ev: evSel.slice(), secret: "whsec_" + AP.hex(16), active: true }); save(); wm.hide(); AP.toast("Endpoint added", "ok"); hooks(); AP.renderIcons(); };

  /* ---------- team ---------- */
  const PERMS = [["View dashboard & activity", [1, 1, 1, 1, 1]], ["Approve payments", [1, 1, 1, 0, 0]], ["Export audit CSV", [1, 1, 0, 1, 0]], ["Create & edit agents", [1, 1, 0, 0, 0]], ["Change spending policy", [1, 1, 0, 0, 0]], ["Manage wallets & session keys", [1, 1, 0, 0, 0]], ["Invite members", [1, 1, 0, 0, 0]], ["Manage billing", [1, 0, 0, 0, 0]]];
  function team() {
    const pl = AP.plan(), lim = pl.seats > 999 ? "∞" : pl.seats;
    $("#seatChip").textContent = S.team.length + " of " + lim + " seats";
    $("#tmRole").innerHTML = Object.entries(AP.ROLES).filter(([k]) => k !== "owner").map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join("");
    $("#tmList").innerHTML = S.team.map((t) => `<div class="log-row">${AP.avatar(t.role === "owner" ? S.user.avatar || "user-01" : t.avatar || AP.avId("user", t.email), 40, t.role === "owner" ? "js-user-av" : "")}<div class="flex-grow-1" style="min-width:0"><b class="d-block">${esc(t.name)}${t.status === "invited" ? ' <span class="chip warn ms-1">Invited</span>' : ""}</b><div class="muted small text-truncate">${esc(t.email)}</div></div>${t.role === "owner" ? '<span class="chip brand">Owner</span>' : `<select class="form-select form-select-sm" style="width:130px" data-role="${t.id}">${Object.entries(AP.ROLES).filter(([k]) => k !== "owner").map(([k, v]) => `<option value="${k}" ${t.role === k ? "selected" : ""}>${v[0]}</option>`).join("")}</select><button class="btn btn-danger-soft btn-icon" style="width:34px;height:34px" data-rm="${t.id}">${AP.icon("trash", 14)}</button>`}</div>`).join("");
    AP.$$("[data-role]").forEach((s) => (s.onchange = () => { S.team.find((t) => t.id === s.dataset.role).role = s.value; save(); AP.toast("Role updated", "ok"); }));
    AP.$$("[data-rm]").forEach((b) => (b.onclick = () => { S.team = S.team.filter((t) => t.id !== b.dataset.rm); save(); team(); AP.renderIcons(); }));
    const pct = pl.seats > 999 ? 8 : Math.min(100, (S.team.length / pl.seats) * 100);
    $("#tmSeats").innerHTML = `<div class="amount-big" style="font-size:44px">${S.team.length}<span class="muted" style="font-size:20px"> / ${lim}</span></div><div class="meter my-3"><i style="width:${pct}%"></i></div><div class="muted small">${pl.name} plan seats. ${S.team.length >= pl.seats ? "You've used every seat." : "Invitees join as soon as they accept."}</div><a href="subscription.html#plans" class="btn btn-lav push align-self-start mt-3">${S.team.length >= pl.seats ? "Upgrade for more seats" : "View plans"}</a>`;
    const R = Object.keys(AP.ROLES);
    $("#tmMatrix").innerHTML = `<table class="matrix"><thead><tr><th>Permission</th>${R.map((r) => `<th>${AP.ROLES[r][0]}</th>`).join("")}</tr></thead><tbody>${PERMS.map(([p, v]) => `<tr><td>${p}</td>${v.map((x) => `<td>${x ? `<span class="y">${AP.icon("check", 18)}</span>` : '<span class="n">—</span>'}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  }
  $("#tmForm").onsubmit = (e) => { e.preventDefault(); const em = $("#tmEmail").value.trim().toLowerCase() || "teammate@company.com", pl = AP.plan();
    if (S.team.length >= pl.seats) { AP.toast(pl.name + " plan has " + pl.seats + " seat(s) — upgrade to invite more", "warn"); return; }
    S.team.push({ id: "t" + Date.now(), name: em.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), email: em, avatar: AP.avId("user", em + Date.now()), role: $("#tmRole").value, status: "invited" }); save(); $("#tmEmail").value = ""; AP.toast("Invite sent to " + em, "ok"); team(); AP.renderIcons(); };

  general(); alerts(); hooks(); team(); AP.tabs(document, "general"); AP.renderIcons();
})();
