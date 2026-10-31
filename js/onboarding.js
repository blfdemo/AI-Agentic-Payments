/* 5-step onboarding: use case → agent → spending policy → wallet → security */
(function () {
  if (!AP.guard()) return;
  const S = AP.load();
  if (S.user.onboarded && !location.search.includes("redo")) { location.replace("dashboard.html"); return; }

  const STEPS = [
    ["Use case", "How will you use agents?"], ["Create agent", "Name and role"], ["Spending policy", "Limits & approvals"],
    ["Connect wallet", "Fund your agent"], ["Secure account", "2FA & PIN"],
  ];
  const draft = { useCase: S.user.useCase, userAv: S.user.avatar || "user-01", agent: { name: "Treasury Agent", role: "Treasury", av: (S.agents[0] && S.agents[0].avatar) || "agent-06" }, policy: Object.assign({}, S.policy), wallet: S.wallet.connected ? S.wallet.provider : null, twofa: S.security.twofa, pin: "" };
  let step = 0;

  const WALLETS = [["metamask", "MetaMask", "Browser extension"], ["coinbase", "Coinbase Wallet", "Smart wallet"], ["walletconnect", "WalletConnect", "Scan with mobile"], ["phantom", "Phantom", "Solana & EVM"]];
  const CASES = [["user", "Personal agent", "Let an assistant pay small bills, subscriptions and APIs for me."], ["briefcase", "Business treasury", "Automate vendor invoices with approvals and audit logs."], ["code", "Developer / API", "Give my software agents a wallet to pay x402-enabled APIs."]];
  const ROLES = [["Treasury", "Pays vendors & invoices"], ["Research", "Buys data & API access"], ["Ops", "Cloud & infra spend"]];

  const renderSteps = () => {
    AP.$("#obSteps").innerHTML = STEPS.map(([t, s], i) => `<li class="${i < step ? "done" : i === step ? "active" : ""}"><span class="dot">${i < step ? AP.icon("check", 16) : i + 1}</span><div><b>${t}</b><small>${s}</small></div></li>`).join("");
  };
  const nav = (next = "Continue", back = true) => `<div class="ob-nav">${back && step > 0 ? `<button class="btn btn-soft btn-lg" id="back">Back</button>` : "<span></span>"}<button class="btn btn-brand btn-lg px-5" id="next">${next}</button></div>`;

  const views = [
    /* 0 */ () => `<h1>Welcome${S.user.name ? ", " + AP.esc(S.user.name.split(" ")[0]) : ""} 👋</h1><p class="lead">What will your AI agents be paying for? We’ll tailor the defaults.</p>
      <div class="row g-3">${CASES.map(([i, t, d], k) => `<div class="col-md-4"><button class="opt ${draft.useCase === k ? "sel" : ""}" data-case="${k}" aria-pressed="${draft.useCase === k}"><div class="oi">${AP.icon(i, 22)}</div><b>${t}</b><span class="od">${d}</span></button></div>`).join("")}</div>
      <div class="mt-4"><label class="form-label">Choose your avatar</label><div class="muted small mb-2">This is how you appear across AgentPay. You can change it any time in Settings.</div>${AP.avPicker("user", draft.userAv, "obUserAv")}</div>${nav("Continue", false)}`,
    /* 1 */ () => `<h1>Create your first agent</h1><p class="lead">Agents get their own smart wallet and a scoped session key — never your main keys.</p>
      <div class="mb-4"><label class="form-label">Agent name</label><input class="form-control" id="agName" value="${AP.esc(draft.agent.name)}"></div>
      <div class="mb-4"><label class="form-label">Agent avatar</label>${AP.avPicker("agent", draft.agent.av, "obAgentAv")}</div>
      <label class="form-label">Role</label><div class="row g-3">${ROLES.map(([r, d]) => `<div class="col-md-4"><button class="opt ${draft.agent.role === r ? "sel" : ""}" data-role="${r}" aria-pressed="${draft.agent.role === r}"><div class="oi">${AP.icon("bot", 22)}</div><b>${r}</b><span class="od">${d}</span></button></div>`).join("")}</div>${nav()}`,
    /* 2 */ () => `<h1>Set a spending policy</h1><p class="lead">The agent can act freely inside these limits. Anything above the approval threshold waits for you.</p>
      <div class="card-ap">${[["perTx", "Max per transaction", 10, 1000, 10, 100], ["daily", "Daily budget", 50, 5000, 50, 300], ["approval", "Ask me to approve above", 10, 1000, 10, 100]].map(([k, l, mn, mx, st, d]) => `<div class="mb-4">${AP.limitHTML({ id: "pol_" + k, label: l, min: mn, max: mx, step: st, value: draft.policy[k], def: d, attrs: `data-pol="${k}"`, minCustom: k === "approval" ? 0 : 1 })}</div>`).join("")}
      <div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="allowOnly" ${draft.policy.requireAllowlist ? "checked" : ""}><label class="form-check-label" for="allowOnly"><b>Only pay allow-listed merchants</b><br><span class="muted small">Strictest mode — unknown payees are blocked automatically.</span></label></div></div>${nav()}`,
    /* 3 */ () => `<h1>Connect a wallet</h1><p class="lead">Connect the wallet that funds your agent. You can skip this and use the demo agent wallet.</p>
      <div class="row g-3">${WALLETS.map(([k, n, d]) => `<div class="col-md-6"><button class="wallet-opt" data-w="${k}"><span class="wi">${AP.icon(k, 28)}</span><div class="flex-grow-1"><b>${n}</b><span>${d}</span></div>${draft.wallet === n ? '<span class="chip ok">Connected</span>' : AP.icon("chevron-right", 18)}</button></div>`).join("")}</div>
      <div class="d-flex align-items-center gap-2 mt-4 muted"><span style="color:var(--ok)">${AP.icon("shield-check", 20)}</span><span>AgentPay is non-custodial. We never see your private keys.</span></div>${nav(draft.wallet ? "Continue" : "Skip for now")}`,
    /* 4 */ () => `<h1>Secure your account</h1><p class="lead">Two quick steps protect every payment your agents make.</p>
      <div class="card-ap">
        <div class="sec-row"><div class="si">${AP.icon("smartphone", 22)}</div><div class="tx"><b>Authenticator 2FA</b><span>Required to approve payments above your threshold</span></div><div class="form-check form-switch m-0"><input class="form-check-input" type="checkbox" id="tf" ${draft.twofa ? "checked" : ""}></div></div>
        <div class="sec-row"><div class="si">${AP.icon("lock", 22)}</div><div class="tx"><b>Transaction PIN</b><span>4-digit PIN to approve agent payments</span></div><input class="form-control" id="pin" inputmode="numeric" placeholder="••••" style="width:110px;text-align:center;letter-spacing:6px" value="${draft.pin}"></div>
      </div>${nav("Finish setup")}`,
  ];

  const bind = () => {
    AP.renderIcons();
    const nx = AP.$("#next"), bk = AP.$("#back");
    if (bk) bk.onclick = () => { step--; render(); };
    if (step === 0) { AP.$$("[data-case]").forEach((b) => (b.onclick = () => { draft.useCase = +b.dataset.case; render(); })); AP.bindAvPicker("obUserAv", (id) => (draft.userAv = id)); }
    if (step === 1) { AP.bindAvPicker("obAgentAv", (id) => (draft.agent.av = id)); AP.$$("[data-role]").forEach((b) => (b.onclick = () => { draft.agent.name = AP.$("#agName").value; draft.agent.role = b.dataset.role; render(); })); }
    if (step === 2) { AP.$$("[data-pol]").forEach((r) => (draft.policy[r.dataset.pol] = +r.value)); const card = AP.$("#obBody"); if (card._limH) card.removeEventListener("limchange", card._limH); card._limH = (e) => { const k = AP.$("#" + e.detail.id).dataset.pol; if (k) draft.policy[k] = e.detail.value; }; card.addEventListener("limchange", card._limH); AP.$("#allowOnly").onchange = (e) => (draft.policy.requireAllowlist = e.target.checked); }
    if (step === 3) AP.$$("[data-w]").forEach((b) => (b.onclick = () => connect(b)));
    nx.onclick = async () => {
      if (step === 1) draft.agent.name = AP.$("#agName").value.trim() || "Treasury Agent";
      if (step === 4) { draft.twofa = AP.$("#tf").checked; draft.pin = AP.$("#pin").value; return finish(); }
      step++; render();
    };
  };

  const connect = async (btn) => {
    const [k, n] = [btn.dataset.w, WALLETS.find((w) => w[0] === btn.dataset.w)[1]];
    btn.innerHTML = `<div class="spinner-border spinner-border-sm text-primary"></div><div class="ms-2"><b>Connecting to ${n}…</b></div>`;
    await AP.sleep(1100); draft.wallet = n; draft.walletKey = k; AP.toast(n + " connected", "ok"); render();
  };

  const finish = () => {
    const s = AP.load();
    s.user.onboarded = true; s.user.useCase = draft.useCase; s.user.avatar = draft.userAv;
    s.agents[0].name = draft.agent.name; s.agents[0].avatar = draft.agent.av; s.agents[0].role = (ROLES.find((r) => r[0] === draft.agent.role) || ROLES[0])[1];
    s.policy = Object.assign(s.policy, draft.policy);
    s.security.twofa = draft.twofa; if (draft.pin) s.security.pin = btoa(draft.pin);
    if (draft.wallet) { s.wallet = { connected: true, provider: draft.wallet, address: "0x" + AP.hex(40), network: "Base", balances: { ETH: 1.284, USDC: 5200 } }; }
    AP.save();
    AP.$("#obBody").innerHTML = `<div class="text-center py-5"><div class="mx-auto mb-4 d-flex align-items-center justify-content-center" style="width:92px;height:92px;border-radius:50%;background:var(--ok-bg);color:var(--ok)">${AP.icon("check", 48)}</div><h1>You’re all set</h1><p class="lead">${AP.esc(draft.agent.name)} is live with a ${AP.usd(draft.policy.daily, 0)}/day budget. Taking you to your dashboard…</p><div class="spinner-ap"></div></div>`;
    AP.renderIcons(); AP.$$(".ob-steps li").forEach((li) => (li.className = "done")); setTimeout(() => (location.href = "dashboard.html"), 1800);
  };

  const render = () => { renderSteps(); AP.$("#obBody").innerHTML = views[step](); bind(); };
  render();
})();
