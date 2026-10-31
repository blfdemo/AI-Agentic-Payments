(function () {
  if (!AP.shell()) return;
  const S = AP.state(); S.audit = S.audit || [{ ts: Date.now() - 86400000, t: "Account created", ic: "user" }, { ts: Date.now() - 3600000 * 5, t: "Agent session key issued", ic: "key" }, { ts: Date.now() - 3600000 * 9, t: "Spending policy reviewed", ic: "sliders" }, { ts: Date.now() - 3600000 * 20, t: "Allow-list updated (8 merchants)", ic: "globe" }, { ts: Date.now() - 3600000 * 30, t: "Team member invited as Approver", ic: "users" }];
  const m = (id) => new bootstrap.Modal(AP.$(id)), tfM = m("#tfModal"), pkM = m("#pkModal"), pinM = m("#pinModal");
  const log = (t, ic) => { S.audit.unshift({ ts: Date.now(), t, ic }); AP.save(); };
  const CATS = ["gambling", "adult", "unverified", "high-risk exchanges", "mixers"];

  function render() {
    const sec = S.security, sc = AP.score();
    AP.$("#ring").style.setProperty("--p", sc); AP.$("#scoreNum").textContent = sc;
    AP.$("#scoreMsg").textContent = sc >= 85 ? "Excellent — your agents are well protected." : sc >= 65 ? "Good. Enable the remaining controls to reach 100." : "Add 2FA, a passkey and a PIN to protect payments.";
    const rows = [["smartphone", "Authenticator 2FA", "Needed to approve large payments", "twofa"], ["fingerprint", "Passkey / biometrics", "Phishing-resistant sign-in", "passkey"], ["lock", "Transaction PIN", sec.pin ? "PIN is set — required for approvals" : "Add a 4-digit PIN for approvals", "pin"], ["bell", "Payment alerts", "Notify me on every agent payment", "alerts"]];
    AP.$("#controls").innerHTML = rows.map(([i, t, d, k]) => `<div class="sec-row"><div class="si">${AP.icon(i, 22)}</div><div class="tx"><b>${t}</b><span>${d}</span></div>${k === "pin" ? `<button class="btn btn-lav btn-sm" id="pinBtn">${sec.pin ? "Change" : "Set PIN"}</button>` : `<div class="form-check form-switch m-0"><input class="form-check-input" type="checkbox" data-sw="${k}" ${sec[k] ? "checked" : ""}></div>`}</div>`).join("");
    AP.$$("[data-sw]").forEach((c) => (c.onchange = () => toggle(c)));
    const pb = AP.$("#pinBtn"); if (pb) pb.onclick = () => openPin("set");

    const fz = sec.frozen;
    AP.$("#killTxt").textContent = fz ? "All agents are frozen. No payment can be signed until you unfreeze." : "Instantly freeze every agent and revoke signing. Use if you suspect misuse.";
    const kb = AP.$("#killBtn"); kb.className = "btn btn-lg " + (fz ? "btn-brand" : "btn-danger-soft"); kb.textContent = fz ? "Unfreeze agents" : "Freeze all agents now"; kb.onclick = () => (S.security.pin ? openPin("kill") : doKill());

    AP.$("#sliders").innerHTML = [["perTx", "Max per transaction", 10, 1000, 10, 100], ["daily", "Daily budget", 50, 5000, 50, 300], ["approval", "Require my approval above", 10, 1000, 10, 100]].map(([k, l, a, b, st, d]) => `<div class="mb-4">${AP.limitHTML({ id: "pol_" + k, label: l, min: a, max: b, step: st, value: S.policy[k], def: d, attrs: `data-pol="${k}"`, minCustom: k === "approval" ? 0 : 1 })}</div>`).join("");
    AP.$("#onlyAllow").checked = S.policy.requireAllowlist;
    chips();
    const row = (a) => `<div class="log-row"><div class="si" style="width:38px;height:38px;border-radius:12px;background:var(--brand-50);color:var(--brand);display:flex;align-items:center;justify-content:center">${AP.icon(a.ic || "shield", 18)}</div><div class="flex-grow-1"><b>${AP.esc(a.t)}</b></div><span class="muted small">${AP.ago(a.ts)}</span></div>`;
    AP.$("#audit").innerHTML = S.audit.slice(0, 25).map(row).join(""); AP.$("#auditMini").innerHTML = S.audit.slice(0, 5).map(row).join("");
    const todo = [["twofa", "Enable authenticator 2FA", "+20"], ["passkey", "Add a passkey", "+15"], ["pin", "Set a transaction PIN", "+10"], ["allow", "Turn on allow-list only", "+10"]].filter(([k]) => k === "allow" ? !S.policy.requireAllowlist : !S.security[k]);
    AP.$("#todo").innerHTML = todo.length ? '<div class="small fw-bold mb-2">Next steps</div>' + todo.map(([k, t, p]) => `<div class="d-flex justify-content-between small py-1"><span>${t}</span><b style="color:var(--ok)">${p}</b></div>`).join("") : '<div class="chip ok">All protections enabled</div>';
    AP.$("#killKv").innerHTML = [["Agents", S.agents.filter((a) => a.status === "active").length + " active"], ["Session key", S.agentWallet.sessionKey.active ? "Active" : "Revoked"]].map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join("");
    const P = S.policy; AP.$("#protect").innerHTML = [["shield", "Per-transaction cap", AP.usd(P.perTx, 0)], ["clock", "Daily budget", AP.usd(P.daily, 0)], ["lock", "Approval above", AP.usd(P.approval, 0)], ["globe", "Allow-list", P.requireAllowlist ? "Enforced (" + P.allowlist.length + ")" : "Advisory (" + P.allowlist.length + ")"], ["alert", "Blocked categories", P.blocked.length]].map(([i, t, v]) => `<div class="log-row"><div class="si" style="width:36px;height:36px;border-radius:11px;background:var(--brand-50);color:var(--brand);display:flex;align-items:center;justify-content:center">${AP.icon(i, 18)}</div><div class="flex-grow-1"><b>${t}</b></div><b>${v}</b></div>`).join("");
    AP.$("#polExplain").innerHTML = `<div class="sec-row"><div class="si">${AP.icon("zap", 20)}</div><div class="tx"><b>Auto-pay up to ${AP.usd(Math.min(P.approval, P.perTx), 0)}</b><span>Payments at or below this go straight through.</span></div></div><div class="sec-row"><div class="si">${AP.icon("clock", 20)}</div><div class="tx"><b>Ask you from ${AP.usd(P.approval, 0)} to ${AP.usd(P.perTx, 0)}</b><span>These wait in the Console's Approvals tab.</span></div></div><div class="sec-row"><div class="si">${AP.icon("shield", 20)}</div><div class="tx"><b>Block above ${AP.usd(P.perTx, 0)}</b><span>Stopped before signing, no funds move.</span></div></div><div class="sec-row"><div class="si">${AP.icon("activity", 20)}</div><div class="tx"><b>Stop at ${AP.usd(P.daily, 0)} per day</b><span>${AP.usd(Math.max(0, P.daily - AP.spentToday()), 0)} left today.</span></div></div>`;

    AP.renderIcons();
  }
  function chips() {
    AP.$("#allowChips").innerHTML = S.policy.allowlist.map((d, i) => `<span class="chip brand plain" style="font-size:13px;padding:6px 8px 6px 14px">${AP.esc(d)}<button class="btn p-0 ms-1 border-0" data-rm="${i}" style="color:inherit;line-height:1">${AP.icon("x", 14)}</button></span>`).join("") || '<span class="muted small">No merchants yet</span>';
    AP.$("#allowCount").textContent = S.policy.allowlist.length + " merchants";
    AP.$$("[data-rm]").forEach((b) => (b.onclick = () => { S.policy.allowlist.splice(+b.dataset.rm, 1); AP.save(); chips(); AP.renderIcons(); }));
    AP.$("#blockChips").innerHTML = CATS.map((c) => `<button class="chip ${S.policy.blocked.includes(c) ? "bad" : "gray"}" data-cat="${c}" style="border:0;font-size:13px;padding:7px 14px">${c}</button>`).join("");
    AP.$$("[data-cat]").forEach((b) => (b.onclick = () => { const a = S.policy.blocked, i = a.indexOf(b.dataset.cat); i > -1 ? a.splice(i, 1) : a.push(b.dataset.cat); AP.save(); chips(); }));
    AP.renderIcons();
  }
  AP.$("#allowAdd").onclick = () => {
    const i = AP.$("#allowIn"), v = i.value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!v) return;
    S.policy.allowlist.push(v); AP.save(); i.value = ""; chips();
  };
  AP.$("#savePolicy").onclick = () => {
    AP.$$("[data-pol]").forEach((r) => (S.policy[r.dataset.pol] = Math.floor(+r.value))); S.policy.requireAllowlist = AP.$("#onlyAllow").checked;
    log("Spending policy updated", "sliders"); AP.toast("Spending policy saved", "ok"); render();
  };

  /* toggles */
  function toggle(c) {
    const k = c.dataset.sw;
    if (k === "twofa" && c.checked) { c.checked = false; return openTf(); }
    if (k === "passkey" && c.checked) { c.checked = false; return openPk(); }
    S.security[k] = c.checked; log(({ twofa: "Authenticator 2FA", passkey: "Passkey", alerts: "Payment alerts" })[k] + (c.checked ? " enabled" : " disabled"), k === "alerts" ? "bell" : "shield"); AP.toast("Updated", "ok"); render();
  }
  /* 2FA */
  function openTf() {
    const secret = "AGNT-" + AP.hex(4).toUpperCase() + "-" + AP.hex(4).toUpperCase() + "-" + AP.hex(4).toUpperCase(); AP.$("#secretKey").textContent = secret;
    let cells = ""; const N = 25, rnd = () => Math.random() > 0.5;
    const fin = (x, y) => (x < 7 && y < 7) || (x > N - 8 && y < 7) || (x < 7 && y > N - 8);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let on; if (fin(x, y)) { const ex = x < 7 ? x : x - (N - 7), ey = y < 7 ? y : y - (N - 7); on = ex === 0 || ex === 6 || ey === 0 || ey === 6 || (ex >= 2 && ex <= 4 && ey >= 2 && ey <= 4); } else on = rnd(); if (on) cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`; }
    AP.$("#qr").innerHTML = `<svg viewBox="0 0 ${N} ${N}" width="100%" height="100%" fill="#1B1340" shape-rendering="crispEdges">${cells}</svg>`;
    AP.$("#otp").innerHTML = Array.from({ length: 6 }, () => '<input inputmode="numeric" maxlength="1">').join(""); AP.$("#otpErr").textContent = "";
    const ins = AP.$$("#otp input"); ins.forEach((el, i) => { el.oninput = () => { el.value = el.value.replace(/\D/g, ""); if (el.value && ins[i + 1]) ins[i + 1].focus(); }; el.onkeydown = (e) => { if (e.key === "Backspace" && !el.value && ins[i - 1]) ins[i - 1].focus(); }; el.onpaste = (e) => { const t = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6); if (t) { e.preventDefault(); ins.forEach((x, j) => (x.value = t[j] || "")); } }; });
    tfM.show(); setTimeout(() => ins[0].focus(), 400);
  }
  AP.$("#tfVerify").onclick = () => {
    const code = AP.$$("#otp input").map((i) => i.value).join("");
    S.security.twofa = true; log("Authenticator 2FA enabled", "smartphone"); tfM.hide(); AP.toast("Two-factor authentication enabled", "ok"); render();
  };
  /* passkey */
  function openPk() { AP.$("#pkMsg").textContent = "Use Face ID, Touch ID or your device PIN."; AP.$("#pkGo").disabled = false; AP.$("#pkGo").textContent = "Continue"; pkM.show(); }
  AP.$("#pkGo").onclick = async () => { AP.$("#pkGo").disabled = true; AP.$("#pkMsg").textContent = "Waiting for biometric confirmation…"; await AP.sleep(1400); S.security.passkey = true; log("Passkey registered", "fingerprint"); pkM.hide(); AP.toast("Passkey created", "ok"); render(); };
  /* PIN */
  let pinMode = "set";
  function openPin(mode) { pinMode = mode; AP.$("#pinTitle").textContent = mode === "set" ? (S.security.pin ? "Change PIN" : "Set transaction PIN") : "Enter PIN to continue"; AP.$("#pinIn").value = ""; AP.$("#pinErr").textContent = ""; pinM.show(); setTimeout(() => AP.$("#pinIn").focus(), 400); }
  AP.$("#pinGo").onclick = () => {
    const v = AP.$("#pinIn").value;
    if (pinMode === "set") { S.security.pin = btoa(v); log("Transaction PIN updated", "lock"); pinM.hide(); AP.toast("PIN saved", "ok"); render(); }
    else { if (btoa(v) !== S.security.pin) { AP.$("#pinErr").textContent = "Incorrect PIN"; return; } pinM.hide(); doKill(); }
  };
  AP.$("#pinIn").addEventListener("keydown", (e) => e.key === "Enter" && AP.$("#pinGo").click());
  /* kill switch */
  function doKill() { S.security.frozen = !S.security.frozen; log(S.security.frozen ? "All agents frozen (kill switch)" : "Agents unfrozen", "power"); AP.toast(S.security.frozen ? "All agents frozen" : "Agents unfrozen", S.security.frozen ? "warn" : "ok"); render(); }

  render(); AP.tabs(document, "overview");
})();
