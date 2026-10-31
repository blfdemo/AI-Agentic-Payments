(function () {
  if (!AP.shell()) return;
  const S = AP.state();
  const STATUS = { settled: ["ok", "Settled"], rejected: ["gray", "Rejected"], blocked: ["bad", "Blocked"], pending: ["warn", "Needs approval"] };

  function render() {
    const spent = AP.spentToday(), p = S.policy;
    AP.$("#stats").innerHTML = [
      ["Agent wallet balance", AP.usd(S.agentWallet.balance), "USDC on Base"],
      ["Spent today", AP.usd(spent), AP.usd(Math.max(0, p.daily - spent), 0) + " left today"],
      ["Active agents", S.agents.filter((a) => a.status === "active").length + " / " + S.agents.length, AP.plan().name + " plan · " + (AP.plan().agents > 999 ? "unlimited" : AP.plan().agents + " max")],
      ["Policy blocks", S.activity.filter((a) => a.status === "blocked" || a.status === "rejected").length, "stopped before signing"],
    ].map(([a, b, c]) => `<div class="stat c3"><small>${a}</small><b>${b}</b><div class="muted small mt-1">${c}</div></div>`).join("");

    AP.$("#agentRows").innerHTML = S.agents.map((a) => {
      const used = S.activity.filter((x) => x.agent === a.name && x.status === "settled").reduce((s, x) => s + x.amount, 0), pct = Math.min(100, Math.round((used / a.budget) * 100));
      return `<div class="t-row" style="grid-template-columns:2.2fr 1.3fr 1.1fr 104px">
        <div class="d-flex align-items-center gap-3">${AP.agentAv(a, 40)}<div class="nm"><b>${AP.esc(a.name)}</b><span>${AP.esc(a.role)}</span></div></div>
        <div><span class="chip ${a.status === "active" ? "ok" : "gray"}">${a.status === "active" ? "Active" : "Paused"}</span></div>
        <div><div class="small fw-bold mb-1">${AP.usd(used, 0)} / ${AP.usd(a.budget, 0)}</div><div class="prog"><i style="width:${pct}%"></i></div></div>
        <div class="text-end"><button class="pill-btn" data-toggle="${a.id}">${a.status === "active" ? "Pause" : "Resume"}</button></div></div>`;
    }).join("");
    AP.$$("[data-toggle]").forEach((b) => (b.onclick = () => { const a = S.agents.find((x) => x.id === b.dataset.toggle); a.status = a.status === "active" ? "paused" : "active"; AP.save(); AP.toast(a.name + (a.status === "active" ? " resumed" : " paused"), "ok"); render(); AP.renderIcons(); }));

    AP.$("#activityRows").innerHTML = S.activity.slice(0, 7).map((a) => {
      const [c, l] = STATUS[a.status] || STATUS.settled;
      return `<div class="t-row" style="grid-template-columns:2.2fr 1fr 1fr 1.2fr"><div class="d-flex align-items-center gap-3">${AP.agentAvByName(a.agent, 34)}<div class="nm"><b>${AP.esc(a.merchant)}</b><span>${AP.esc(a.agent)} · ${AP.ago(a.ts)}</span></div></div><div class="small fw-bold">${AP.esc(a.protocol)}</div><div class="fw-bold">${AP.usd(a.amount)}</div><div><span class="chip ${c}">${l}</span></div></div>`;
    }).join("");

    const days = [...Array(7)].map((_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (6 - i)); return d; });
    const vals = days.map((d, i) => S.activity.filter((x) => x.status === "settled" && x.ts >= d.getTime() && x.ts < d.getTime() + 86400000).reduce((t, x) => t + x.amount, 0) + (i < 6 ? [140, 60, 210, 95, 30, 175][i] : 0));
    const mx = Math.max(...vals, 1); AP.$("#bars").innerHTML = vals.map((v, i) => `<i class="${i === 6 ? "today" : ""}" title="${AP.usd(v, 0)}" style="height:${Math.max(8, (v / mx) * 100)}%"></i>`).join(""); AP.$("#barLbl").innerHTML = days.map((d) => `<span>${d.toLocaleDateString("en", { weekday: "narrow" })}</span>`).join("");
    AP.$("#dashKv").innerHTML = [["Plan", AP.plan().name], ["Team seats", (S.team || []).length + " / " + (AP.plan().seats > 999 ? "∞" : AP.plan().seats)], ["Webhooks", (S.webhooks || []).filter((w) => w.active).length + " active"], ["Wallet", S.wallet.connected ? S.wallet.provider : "Not connected"]].map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join("");
    AP.$("#budgetLimBox").innerHTML = AP.limitHTML({ id: "budgetVal", label: "Daily budget", min: 50, max: 5000, step: 50, value: p.daily, def: 300, bare: true }); budgetUI(p.daily);
  }
  function budgetUI(v) {
    AP.$("#budgetBig").textContent = "$ " + Number(v).toLocaleString();
    AP.$("#budgetSub").textContent = "≈ " + (v / (S.agentWallet.balance || 1) * 100).toFixed(0) + "% of agent wallet balance";
    AP.$("#budgetChips").innerHTML = [100, 300, 500, 1000].map((x) => `<button class="${+v === x ? "on" : ""}" data-b="${x}">$${x}</button>`).join("");
    AP.$$("[data-b]").forEach((b) => (b.onclick = () => AP.limitSet("budgetVal", +b.dataset.b)));
  }
  document.addEventListener("limchange", (e) => { if (e.detail.id === "budgetVal") budgetUI(e.detail.value); });
  AP.$("#saveBudget").onclick = () => { const v = Math.floor(AP.limitGet("budgetVal")); if (!(v >= 1)) return AP.toast("Enter a daily budget of at least $1", "warn"); S.policy.daily = v; AP.save(); AP.toast("Daily budget set to " + AP.usd(S.policy.daily, 0), "ok"); render(); };
  AP.$("#actRun").onclick = () => (location.href = "agent.html#live");
  AP.$("#actWallet").onclick = () => (location.href = "wallets.html");
  AP.$("#newAgentBtn").onclick = () => AP.newAgent(() => { render(); AP.renderIcons(); });
  AP.$("#actPolicy").onclick = () => (location.href = "security.html#policy");

  /* fund modal */
  const fm = new bootstrap.Modal(AP.$("#fundModal"));
  AP.$("#actFund").onclick = () => { AP.$("#fundFrom").textContent = S.wallet.connected ? S.wallet.provider + " · " + AP.short(S.wallet.address) : "Demo treasury (no wallet connected)"; fm.show(); };
  AP.$$("[data-amt]").forEach((b) => (b.onclick = () => (AP.$("#fundAmt").value = b.dataset.amt)));
  AP.$("#fundGo").onclick = async () => {
    const v = Math.max(0, +AP.$("#fundAmt").value || 0);
    AP.$("#fundGo").disabled = true; AP.$("#fundGo").innerHTML = '<span class="spinner-border spinner-border-sm"></span> Confirming…'; await AP.sleep(1200);
    if (S.wallet.connected) S.wallet.balances.USDC = Math.max(0, S.wallet.balances.USDC - v); S.agentWallet.balance = +(S.agentWallet.balance + v).toFixed(2); AP.save();
    fm.hide(); AP.$("#fundGo").disabled = false; AP.$("#fundGo").textContent = "Transfer"; AP.toast(AP.usd(v, 0) + " USDC sent to agent wallet", "ok"); render(); AP.renderIcons();
  };

  AP.$("#rails").innerHTML = [
    ["x402", "zap", "HTTP 402 stablecoin micropayments (Coinbase / Cloudflare)"], ["AP2", "refresh", "Google Agent Payments Protocol — signed mandates"],
    ["Invoices", "receipt", "Vendor invoices paid in USDC, with a receipt for your books"], ["Agent-to-agent", "network", "Pay specialist agents over A2A + x402 after identity checks"],
  ].map(([t, i, d]) => `<div class="card-ap c3"><div class="d-flex align-items-center gap-2 mb-2">${AP.icon(i, 28)}<b class="flex-grow-1" style="font-size:15px">${t}</b><span class="chip ok">Live</span></div><span class="muted small grow">${d}</span><a href="agent.html#policy" class="small mt-3">View policy →</a></div>`).join("");

  render(); AP.renderIcons();
})();
