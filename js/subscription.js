(function () {
  if (!AP.shell()) return;
  const S = AP.state(), $ = AP.$, pm = new bootstrap.Modal($("#planModal")); let cycle = "monthly", target = null;
  const price = (p) => (p.price === null ? "Custom" : p.price === 0 ? "$0" : "$" + (cycle === "yearly" ? Math.round(p.price * 0.8) : p.price));
  const renew = () => { const d = new Date(S.plan.since); while (d < Date.now()) d.setMonth(d.getMonth() + 1); return d.toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" }); };
  function render() {
    const pl = AP.plan(), tot = S.activity.filter((a) => a.status === "settled").reduce((s, a) => s + a.amount, 0);
    $("#curPlan").innerHTML = `<div class="bh"><div class="d-flex align-items-center gap-3"><div class="si" style="width:48px;height:48px;border-radius:15px;background:var(--brand-50);color:var(--brand);display:flex;align-items:center;justify-content:center">${AP.icon("crown", 24)}</div><div><div class="muted small fw-bold">CURRENT PLAN</div><h3 class="mb-0">${pl.name}</h3></div></div><span class="chip ok">Active</span></div>
      <div class="d-flex align-items-baseline gap-2 mb-1"><span class="amount-big" style="font-size:44px">${pl.price === null ? "Custom" : "$" + pl.price}</span><span class="muted">${pl.price ? "/ month" : ""}</span></div><div class="muted mb-3">${pl.tag}${pl.price ? " · renews " + renew() : ""}</div>
      <div class="row g-2 grow">${pl.feats.map((f) => `<div class="col-md-6 d-flex gap-2 align-items-start"><span style="color:var(--ok)">${AP.icon("check", 18)}</span><span class="fw-semibold">${f}</span></div>`).join("")}</div>
      <div class="d-flex gap-2 mt-4"><button class="btn btn-brand btn-lg" id="upBtn"><i data-i="zap" data-s="16"></i> ${pl.id === "enterprise" ? "Compare plans" : "Upgrade plan"}</button>${pl.price ? '<button class="btn btn-soft btn-lg" id="cancelBtn">Cancel plan</button>' : ""}</div>`;
    $("#billBox").innerHTML = `<div class="kv mb-3"><div><small>Billing cycle</small><b>${S.plan.billing === "yearly" ? "Yearly" : "Monthly"}</b></div><div><small>Next invoice</small><b>${pl.price ? renew() : "—"}</b></div></div><div class="addr-box mb-3">${AP.icon("wallet", 20)}<span class="flex-grow-1 small fw-bold">${S.wallet.connected ? AP.esc(S.wallet.provider) + " · " + AP.short(S.wallet.address) : "Agent wallet · USDC on Base"}</span><a href="wallets.html" class="small">Change</a></div><div class="muted small">Paid in USDC. Invoices are emailed to ${AP.esc(S.notify.email.to)}.</div><div class="mt-auto pt-3"><div class="small fw-bold mb-1">Transaction fee</div><div class="amount-big" style="font-size:30px">${pl.fee}</div></div>`;
    const ag = S.agents.length, al = pl.agents > 999 ? 0 : pl.agents, seats = S.team.length, sl = pl.seats > 999 ? 0 : pl.seats, meter = (n, l, t) => `<div class="mb-4"><div class="d-flex justify-content-between small mb-1"><b>${t}</b><span class="muted">${n} / ${l || "∞"}</span></div><div class="meter"><i style="width:${l ? Math.min(100, (n / l) * 100) : 6}%"></i></div></div>`;
    $("#usage").innerHTML = meter(ag, al, "Agents") + meter(seats, sl, "Team seats") + meter(S.webhooks.length, 0, "Webhook endpoints") + `<div class="kv"><div><small>Volume paid</small><b>${AP.usd(tot, 0)}</b></div><div><small>Fees at ${pl.fee}</small><b>${pl.fee === "Custom" ? "—" : AP.usd(tot * parseFloat(pl.fee) / 100)}</b></div></div>`;
    const inv = pl.price ? [0, 1, 2].map((i) => { const d = new Date(); d.setMonth(d.getMonth() - i); return [d.toLocaleDateString("en", { month: "short", year: "numeric" }), "$" + pl.price + ".00", "INV-" + (2040 - i)]; }) : [];
    $("#invoices").innerHTML = inv.length ? inv.map(([m, a, id]) => `<div class="log-row"><div class="flex-grow-1"><b>${id}</b><div class="muted small">${m}</div></div><b>${a}</b><span class="chip ok">Paid</span><button class="btn btn-soft btn-icon" style="width:34px;height:34px" data-inv="${id}">${AP.icon("download", 14)}</button></div>`).join("") : '<div class="muted text-center my-auto">No invoices on the free Starter plan.</div>';
    AP.$$("[data-inv]").forEach((b) => (b.onclick = () => AP.toast("Invoice " + b.dataset.inv + " downloaded", "ok")));
    $("#upBtn").onclick = openPlans; const cb = $("#cancelBtn"); if (cb) cb.onclick = () => ask("starter");
    AP.renderIcons();
  }
  function openPlans() { $("#plans").hidden = false; plans(); $("#plans").scrollIntoView({ behavior: "smooth", block: "start" }); }
  function plans() {
    const cur = AP.plan();
    $("#planGrid").innerHTML = AP.PLANS.map((p) => `<div class="card-ap c3 plan ${p.id === cur.id ? "cur" : ""}">${p.pop ? '<span class="pop">Most popular</span>' : ""}<b style="font-size:17px">${p.name}</b><div class="muted small">${p.tag}</div><div class="price mt-3">${price(p)}<span class="muted" style="font-size:14px;font-weight:600">${p.price ? "/mo" : ""}</span></div><ul class="grow">${p.feats.map((f) => `<li>${AP.icon("check", 16)}<span>${f}</span></li>`).join("")}</ul><button class="btn ${p.id === cur.id ? "btn-soft" : "btn-brand"} w-100" data-pick="${p.id}" ${p.id === cur.id ? "disabled" : ""}>${p.id === cur.id ? "Current plan" : p.price === null ? "Contact sales" : AP.PLANS.indexOf(p) > AP.PLANS.indexOf(cur) ? "Upgrade to " + p.name : "Switch to " + p.name}</button></div>`).join("");
    AP.$$("[data-pick]").forEach((b) => (b.onclick = () => ask(b.dataset.pick)));
  }
  function ask(id) {
    const p = AP.PLANS.find((x) => x.id === id), cur = AP.plan();
    if (p.price === null) { S.tickets.unshift({ id: "TCK-" + AP.rand(1100, 1999), sub: "Enterprise plan enquiry", cat: "Billing", pri: "Normal", status: "Open", ts: Date.now() }); AP.save(); return AP.toast("Thanks! Our sales team will email you within a day", "ok"); }
    if (S.agents.length > p.agents) return AP.toast(`${p.name} allows ${p.agents} agents — delete ${S.agents.length - p.agents} first`, "bad");
    if (S.team.length > p.seats) return AP.toast(`${p.name} allows ${p.seats} seat(s) — remove ${S.team.length - p.seats} member(s) first`, "bad");
    target = p; const up = AP.PLANS.indexOf(p) > AP.PLANS.indexOf(cur), amt = cycle === "yearly" ? Math.round(p.price * 12 * 0.8) : p.price;
    $("#pmTitle").textContent = (up ? "Upgrade to " : "Switch to ") + p.name;
    $("#pmBody").innerHTML = `<div class="receipt"><div class="rw"><span>Plan</span><b>${p.name}</b></div><div class="rw"><span>Billing</span><b>${cycle === "yearly" ? "Yearly (20% off)" : "Monthly"}</b></div><div class="rw"><span>${p.price ? "Due today" : "New price"}</span><b>${p.price ? "$" + amt : "$0"}</b></div><div class="rw"><span>Agents / seats</span><b>${p.agents > 999 ? "∞" : p.agents} / ${p.seats > 999 ? "∞" : p.seats}</b></div></div><p class="muted small mt-3 mb-0">${p.price ? "Paid in USDC from your " + (S.wallet.connected ? S.wallet.provider + " wallet" : "agent wallet") + ". " : ""}Change or cancel any time.</p>`;
    pm.show();
  }
  $("#pmGo").onclick = async () => { $("#pmGo").disabled = true; await AP.sleep(900); S.plan = { id: target.id, since: Date.now(), billing: cycle }; AP.save(); $("#pmGo").disabled = false; pm.hide(); AP.toast("You're now on " + target.name, "ok"); render(); plans(); };
  AP.$$("[data-cy]").forEach((b) => (b.onclick = () => { cycle = b.dataset.cy; AP.$$("[data-cy]").forEach((x) => x.classList.toggle("on", x === b)); plans(); }));
  render(); if (location.hash === "#plans") openPlans();
})();
