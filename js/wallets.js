(function () {
  if (!AP.shell()) return;
  const S = AP.state();
  const WALLETS = [["metamask", "MetaMask", "Browser extension"], ["coinbase", "Coinbase Wallet", "Smart wallet · passkeys"], ["walletconnect", "WalletConnect", "Scan QR with mobile wallet"], ["phantom", "Phantom", "Solana & EVM"], ["ledger", "Ledger", "Hardware wallet"]];
  const NETS = [["base", "Base", "USDC · x402 native", "~$0.001"], ["eth", "Ethereum", "USDC · ETH", "~$1.20"], ["polygon", "Polygon", "USDC", "~$0.004"], ["arb", "Arbitrum", "USDC", "~$0.02"], ["sol", "Solana", "USDC · SOL", "~$0.0003"]];
  const cm = new bootstrap.Modal(AP.$("#connectModal")), km = new bootstrap.Modal(AP.$("#keyModal")), fm = new bootstrap.Modal(AP.$("#fundModal"));
  const netIcon = (n) => (NETS.find((x) => x[1] === n) || NETS[0])[0];

  function render() {
    const w = S.wallet, a = S.agentWallet, sk = a.sessionKey, exp = sk.active && sk.expires > Date.now();
    AP.$("#mainWallet").innerHTML = w.connected ? `
      <div class="d-flex align-items-center gap-3 mb-4"><span class="wallet-opt" style="width:auto;padding:10px;border-radius:16px">${AP.icon((WALLETS.find((x) => x[1] === w.provider) || WALLETS[0])[0], 30)}</span>
        <div class="flex-grow-1"><b style="font-size:17px">${AP.esc(w.provider)}</b><div><span class="chip ok">Connected</span></div></div>
        <div class="dropdown"><button class="net-chip" data-bs-toggle="dropdown">${AP.icon(netIcon(w.network), 22)}${w.network}${AP.icon("chevron-down", 14)}</button><ul class="dropdown-menu dropdown-menu-end">${NETS.map((n) => `<li><a class="dropdown-item" href="#" data-net="${n[1]}">${AP.icon(n[0], 20)}${n[1]}</a></li>`).join("")}</ul></div></div>
      <div class="addr-box mb-4"><span class="mono flex-grow-1">${w.address}</span><button class="btn btn-soft btn-icon" style="width:34px;height:34px" id="copyAddr">${AP.icon("copy", 16)}</button></div>
      <div class="row g-3 mb-4"><div class="col-6"><div class="stat"><small>USDC</small><b>${w.balances.USDC.toLocaleString()}</b></div></div><div class="col-6"><div class="stat"><small>ETH</small><b>${w.balances.ETH}</b></div></div></div>
      <div class="d-flex gap-2 push"><button class="btn btn-brand flex-grow-1" id="fundBtn">Fund agent wallet</button><button class="btn btn-danger-soft" id="disc">Disconnect</button></div>`
    : `<div class="text-center py-4 my-auto"><div class="mx-auto mb-3 d-flex align-items-center justify-content-center" style="width:72px;height:72px;border-radius:22px;background:var(--brand-50);color:var(--brand)">${AP.icon("wallet", 34)}</div><h4 class="mb-2">No wallet connected</h4><p class="muted mb-4">Connect a wallet to fund your agent. The demo agent wallet still works without one.</p><button class="btn btn-brand btn-lg px-5" id="connectBtn">Connect wallet</button></div>`;

    AP.$("#agentWallet").innerHTML = `
      <div class="d-flex align-items-center gap-3 mb-4"><div class="agent-orb ${exp ? "live" : ""}">${AP.icon("bot", 30)}</div><div class="flex-grow-1"><b style="font-size:17px">Smart account</b><div class="muted small">ERC-4337 · gas sponsored (demo)</div></div><span class="chip ${exp ? "ok" : "bad"}">${exp ? "Session active" : sk.active ? "Key expired" : "Key revoked"}</span></div>
      <div class="text-center mb-4"><div class="muted fw-bold small">AVAILABLE TO AGENTS</div><div class="amount-big" style="font-size:52px">${AP.usd(a.balance)}</div><span class="chip brand plain">${AP.icon("usdc", 16)} USDC on Base</span></div>
      <div class="addr-box mb-3"><span class="mono small flex-grow-1">${AP.short(a.address)}</span><button class="btn btn-soft btn-icon" style="width:34px;height:34px" id="copyAgent">${AP.icon("copy", 16)}</button></div>
      <div class="receipt mb-3"><div class="rw"><span>Session key</span><b class="mono">${sk.id}</b></div><div class="rw"><span>Max per transaction</span><b>${AP.usd(sk.perTx, 0)} USDC</b></div><div class="rw"><span>Expires</span><b>${sk.active ? new Date(sk.expires).toLocaleString() : "—"}</b></div><div class="rw"><span>Allowed token</span><b>USDC only</b></div></div>
      <div class="d-flex gap-2 push"><button class="btn btn-brand flex-grow-1" id="newKey">Issue new key</button><button class="btn btn-danger-soft" id="revoke" ${sk.active ? "" : "disabled"}>Revoke</button></div>`;

    AP.$("#networks").innerHTML = NETS.map((n) => `<div class="log-row">${AP.icon(n[0], 34)}<div class="flex-grow-1"><b>${n[1]}</b><div class="muted small">${n[2]}</div></div><span class="muted small fw-bold">${n[3]} / tx</span>${w.network === n[1] ? '<span class="chip ok">Active</span>' : ""}</div>`).join("");
    bind(); extras(); AP.renderIcons();
  }

  function bind() {
    const $ = AP.$, on = (s, f) => { const e = $(s); if (e) e.onclick = f; };
    on("#connectBtn", openConnect); on("#fundBtn", () => fm.show());
    on("#copyAddr", () => AP.copy(S.wallet.address)); on("#copyAgent", () => AP.copy(S.agentWallet.address));
    on("#disc", () => { S.wallet = { connected: false, provider: null, address: null, network: "Base", balances: { ETH: 0, USDC: 0 } }; AP.save(); AP.toast("Wallet disconnected", "warn"); render(); });
    on("#newKey", () => { AP.$("#skLimitBox").innerHTML = AP.limitHTML({ id: "skLimit", label: "Max per transaction (USDC)", min: 10, max: 1000, step: 10, value: 500, def: 500 }); km.show(); });
    on("#revoke", () => { S.agentWallet.sessionKey.active = false; AP.save(); AP.toast("Session key revoked — agents can no longer sign", "warn"); render(); });
    AP.$$("[data-net]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); S.wallet.network = a.dataset.net; AP.save(); AP.toast("Switched to " + a.dataset.net, "ok"); render(); }));
  }

  /* ---- connect flow: choose → request → sign message → connected ---- */
  function openConnect() {
    AP.$("#cmTitle").textContent = "Connect a wallet";
    AP.$("#cmBody").innerHTML = `<div class="d-grid gap-2">${WALLETS.map(([k, n, d]) => `<button class="wallet-opt" data-w="${n}" data-k="${k}"><span class="wi">${AP.icon(k, 40)}</span><div class="flex-grow-1"><b>${n}</b><span>${d}</span></div>${AP.icon("chevron-right", 18)}</button>`).join("")}</div><p class="muted small mt-3 mb-0 text-center">By connecting you agree to the Terms. AgentPay never has custody of your keys.</p>`;
    AP.renderIcons(); AP.$$("#cmBody [data-w]").forEach((b) => (b.onclick = () => request(b.dataset.w, b.dataset.k))); cm.show();
  }
  async function request(name, key) {
    AP.$("#cmTitle").textContent = "Connecting to " + name;
    AP.$("#cmBody").innerHTML = `<div class="text-center py-4"><div class="spinner-ap mb-4"></div><b>Opening ${name}…</b><div class="muted small mt-1">Approve the connection request in your wallet</div></div>`;
    await AP.sleep(1300);
    AP.$("#cmBody").innerHTML = `<div class="text-center mb-3">${AP.icon(key, 44)}</div><h5 class="text-center mb-2">Verify wallet ownership</h5><p class="muted text-center">Sign this free message. It does not move funds or cost gas.</p>
      <div class="addr-box mono small mb-3" style="display:block;white-space:pre-wrap">AgentPay wants you to sign in.\nNonce: ${AP.hex(12)}\nIssued: ${new Date().toISOString()}</div>
      <div class="d-flex gap-2"><button class="btn btn-soft flex-grow-1" data-bs-dismiss="modal">Reject</button><button class="btn btn-brand flex-grow-1" id="signGo">Sign message</button></div>`;
    AP.$("#signGo").onclick = async () => {
      AP.$("#cmBody").innerHTML = `<div class="text-center py-4"><div class="spinner-ap mb-4"></div><b>Verifying signature…</b></div>`; await AP.sleep(1000);
      S.wallet = { connected: true, provider: name, address: "0x" + AP.hex(40), network: "Base", balances: { ETH: +(Math.random() * 2 + 0.3).toFixed(3), USDC: AP.rand(3000, 9000) } }; AP.save();
      AP.$("#cmBody").innerHTML = `<div class="text-center py-3"><div class="mx-auto mb-3 d-flex align-items-center justify-content-center" style="width:72px;height:72px;border-radius:50%;background:var(--ok-bg);color:var(--ok)">${AP.icon("check", 38)}</div><h5>Wallet connected</h5><div class="mono muted small">${AP.short(S.wallet.address)}</div></div>`; AP.renderIcons();
      await AP.sleep(900); cm.hide(); AP.toast(name + " connected", "ok"); render();
    };
    AP.renderIcons();
  }

  /* ---- session key ---- */
  AP.$("#skGo").onclick = async () => {
    const v = Math.floor(AP.limitGet("skLimit")) || 500;
    AP.$("#skGo").disabled = true; AP.$("#skGo").innerHTML = '<span class="spinner-border spinner-border-sm"></span> Waiting for signature…'; await AP.sleep(1300);
    S.agentWallet.sessionKey = { active: true, id: "sk_" + AP.hex(8), perTx: v, expires: Date.now() + +AP.$("#skDur").value * 3600000 }; AP.save();
    AP.$("#skGo").disabled = false; AP.$("#skGo").textContent = "Sign & issue"; km.hide(); AP.toast("New session key issued", "ok"); render();
  };
  /* ---- fund ---- */
  AP.$("#fundGo").onclick = async () => {
    const v = Math.max(0, +AP.$("#fundAmt").value || 0);
    AP.$("#fundGo").disabled = true; await AP.sleep(1000); S.wallet.balances.USDC = Math.max(0, S.wallet.balances.USDC - v); S.agentWallet.balance = +(S.agentWallet.balance + v).toFixed(2); AP.save();
    AP.$("#fundGo").disabled = false; fm.hide(); AP.toast(AP.usd(v, 0) + " USDC sent to agent wallet", "ok"); render();
  };
  function extras() {
    const p = S.prefs;
    AP.$("#refill").innerHTML = `<div class="set-row"><div class="tx"><b>Refill automatically</b><span>Top up the agent wallet from your funding wallet.</span></div><div class="form-check form-switch m-0"><input class="form-check-input" type="checkbox" id="arOn" ${p.autoRefill ? "checked" : ""}></div></div><div class="row g-3 mt-1"><div class="col-6"><label class="form-label small">When below (USDC)</label><input class="form-control" type="number" id="arBelow" value="${p.refillBelow}"></div><div class="col-6"><label class="form-label small">Refill with (USDC)</label><input class="form-control" type="number" id="arAmt" value="${p.refillAmt}"></div></div><button class="btn btn-lav push align-self-start mt-3" id="arSave">Save auto-refill</button>`;
    AP.$("#arSave").onclick = () => { p.autoRefill = AP.$("#arOn").checked; p.refillBelow = +AP.$("#arBelow").value || 0; p.refillAmt = +AP.$("#arAmt").value || 0; AP.save(); AP.toast("Auto-refill " + (p.autoRefill ? "on" : "off"), "ok"); };
    const sk = S.agentWallet.sessionKey;
    AP.$("#walletLog").innerHTML = [["key", "Session key " + sk.id, sk.active ? "Active · " + AP.usd(sk.perTx, 0) + " per tx" : "Revoked", ""], ["wallet", "Agent wallet balance", AP.usd(S.agentWallet.balance) + " USDC", ""], ["link", S.wallet.connected ? S.wallet.provider + " connected" : "No funding wallet", S.wallet.connected ? AP.short(S.wallet.address) : "Connect one above", ""], ["bell", "Low-balance alert", S.notify.email.ev["balance.low"] ? "Email on" : "Email off", ""]].map(([i, t, d]) => `<div class="log-row"><div class="si" style="width:38px;height:38px;border-radius:12px;background:var(--brand-50);color:var(--brand);display:flex;align-items:center;justify-content:center">${AP.icon(i, 18)}</div><div class="flex-grow-1"><b style="font-size:13.5px">${t}</b><div class="muted small">${d}</div></div></div>`).join("");
  }
  AP.tabs(document, "wallets");
  render();
})();
