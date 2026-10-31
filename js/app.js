/* =====================================================================
   AgentPay — core runtime (state, icons, theme, toast, shell, support)
   Everything is client-side; state lives in localStorage ("agentpay.*")
   ===================================================================== */
(function () {
  const KEY = "agentpay.state.v1", SESSION = "agentpay.session", THEME = "agentpay.theme";
  const AP = (window.AP = {});

  /* ---------- helpers ---------- */
  AP.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  AP.rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  AP.hex = (n) => Array.from({ length: n }, () => "0123456789abcdef"[AP.rand(0, 15)]).join("");
  AP.usd = (n, d = 2) => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  AP.short = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "—");
  AP.ago = (ts) => { const s = Math.max(1, Math.floor((Date.now() - ts) / 1000)); if (s < 60) return s + "s ago"; if (s < 3600) return Math.floor(s / 60) + "m ago"; if (s < 86400) return Math.floor(s / 3600) + "h ago"; return Math.floor(s / 86400) + "d ago"; };
  AP.copy = (t) => { (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).catch(() => { const x = document.createElement("textarea"); x.value = t; document.body.appendChild(x); x.select(); document.execCommand("copy"); x.remove(); }); AP.toast("Copied to clipboard", "ok"); };
  AP.$ = (s, r = document) => r.querySelector(s);
  AP.$$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  AP.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- icons (inline SVG from icons.js) ---------- */
  AP.icon = (name, size = 20, cls = "") => {
    if (window.AP_BRANDS && AP_BRANDS[name]) return `<span class="ap-i ${cls}" style="width:${size}px;height:${size}px">${AP_BRANDS[name].replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`)}</span>`;
    const b = (window.AP_ICONS || {})[name] || "";
    return `<span class="ap-i ${cls}"><svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${b}</svg></span>`;
  };
  AP.renderIcons = (root = document) => {
    AP.$$("[data-i]", root).forEach((el) => { el.outerHTML = AP.icon(el.dataset.i, +el.dataset.s || 20, el.className); });
  };

  /* ---------- state ---------- */
  const now = Date.now(), M = 60000;
  const seedActivity = () => [
    { id: "a1", ts: now - 14 * M, agent: "Treasury Agent", merchant: "RunPod GPU compute", amount: 12.0, token: "USDC", chain: "Base", status: "settled", protocol: "x402", tx: "0x" + AP.hex(64) },
    { id: "a2", ts: now - 31 * M, agent: "Research Agent", merchant: "Dune Analytics API", amount: 0.25, token: "USDC", chain: "Base", status: "settled", protocol: "x402", tx: "0x" + AP.hex(64) },
    { id: "a3", ts: now - 52 * M, agent: "Treasury Agent", merchant: "Cloudflare Workers", amount: 5.0, token: "USDC", chain: "Base", status: "settled", protocol: "Subscription", tx: "0x" + AP.hex(64) },
    { id: "a4", ts: now - 2 * 3600000, agent: "Research Agent", merchant: "OpenRouter credits", amount: 100.0, token: "USDC", chain: "Base", status: "settled", protocol: "AP2", tx: "0x" + AP.hex(64) },
    { id: "a5", ts: now - 3 * 3600000, agent: "Treasury Agent", merchant: "Acme Design invoice #2041", amount: 480.0, token: "USDC", chain: "Base", status: "rejected", protocol: "Invoice", tx: null },
    { id: "a6", ts: now - 5 * 3600000, agent: "Ops Agent", merchant: "unknown-merchant.xyz", amount: 95.0, token: "USDC", chain: "Polygon", status: "blocked", protocol: "x402", tx: null },
  ];
  const defaults = () => ({
    user: { name: "", email: "", onboarded: false, useCase: null },
    wallet: { connected: false, provider: null, address: null, network: "Base", balances: { ETH: 0, USDC: 0 } },
    agentWallet: { address: "0x" + AP.hex(40), balance: 2480.5, token: "USDC", sessionKey: { active: true, expires: now + 24 * 3600000, perTx: 500, id: "sk_" + AP.hex(8) } },
    agents: [
      { id: "treasury", name: "Treasury Agent", role: "Pays vendors & subscriptions", status: "active", budget: 1000, color: "#7A12F5" },
      { id: "research", name: "Research Agent", role: "Buys data & API access (x402)", status: "active", budget: 400, color: "#3084F3" },
      { id: "ops", name: "Ops Agent", role: "Cloud & infra spend", status: "active", budget: 600, color: "#F4723F" },
    ],
    policy: { perTx: 500, daily: 1000, approval: 300, requireAllowlist: false, allowlist: ["runpod.io", "dune.com", "cloudflare.com", "openrouter.ai", "api.weatherdata.xyz", "acme-design.co", "translatebot.ai", "figma.com"], blocked: ["gambling", "adult", "unverified"] },
    security: { twofa: false, passkey: false, pin: null, frozen: false, alerts: true, whitelistOnly: false },
    activity: seedActivity(),
  });
  let state = null;
  AP.load = () => { if (state) return state; try { state = JSON.parse(localStorage.getItem(KEY)); } catch (e) {} if (!state) { state = defaults(); AP.save(); } return state; };
  AP.save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} };
  AP.reset = () => { localStorage.removeItem(KEY); localStorage.removeItem(SESSION); localStorage.removeItem("agentpay.run.v1"); localStorage.removeItem("agentpay.run.owner"); state = null; };
  AP.state = () => AP.load();
  AP.spentToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return AP.load().activity.filter((a) => a.status === "settled" && a.ts >= d.getTime()).reduce((s, a) => s + a.amount, 0); };
  AP.addActivity = (e) => { const s = AP.load(); const row = Object.assign({ id: "a" + Date.now(), ts: Date.now() }, e); s.activity.unshift(row); if (e.status === "settled") s.agentWallet.balance = Math.max(0, +(s.agentWallet.balance - e.amount).toFixed(2)); AP.save(); return row; };
  AP.score = () => { const s = AP.load(); let p = 40; if (s.security.twofa) p += 20; if (s.security.passkey) p += 15; if (s.security.pin) p += 10; if (s.wallet.connected) p += 5; if (s.policy.requireAllowlist) p += 10; return Math.min(100, p); };

  /* ---------- session ---------- */
  AP.session = () => { try { return JSON.parse(localStorage.getItem(SESSION)); } catch (e) { return null; } };
  AP.login = (email, name) => { const s = AP.load(); s.user.email = email; if (name) s.user.name = name; if (!s.user.name) s.user.name = email.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); AP.save(); localStorage.setItem(SESSION, JSON.stringify({ email, at: Date.now() })); };
  AP.logout = () => { localStorage.removeItem(SESSION); localStorage.removeItem("agentpay.run.v1"); localStorage.removeItem("agentpay.run.owner"); location.href = "login.html"; };
  AP.goAfterAuth = () => { location.href = AP.load().user.onboarded ? "dashboard.html" : "onboarding.html"; };
  AP.guard = () => { if (!AP.session()) { location.replace("login.html"); return false; } return true; };
  /* ---------- avatars: SVG illustration sets in assets/img/avatars (8 people, 8 robots / AI agents) ---------- */
  AP.AV = { user: [1,2,3,4,5,6,7,8].map((n) => "user-0" + n), agent: [1,2,3,4,5,6,7,8].map((n) => "agent-0" + n) };
  AP.avSrc = (id) => "assets/img/avatars/" + id + ".svg";
  AP.hash = (str) => { let h = 0; String(str).split("").forEach((c) => (h = (h * 31 + c.charCodeAt(0)) >>> 0)); return h; };
  AP.avId = (kind, seed) => AP.AV[kind][AP.hash(seed) % AP.AV[kind].length];
  AP.avatar = (id, size = 36, cls = "") => `<img class="av ${cls}" src="${AP.avSrc(id)}" width="${size}" height="${size}" style="width:${size}px;height:${size}px" alt="" draggable="false">`;
  AP.userAv = (size = 36) => AP.avatar(AP.load().user.avatar || "user-01", size, "js-user-av");
  AP.agentAv = (a, size = 40) => AP.avatar((a && a.avatar) || AP.avId("agent", (a && (a.id || a.name)) || "agent"), size);
  AP.agentAvByName = (name, size = 36) => AP.agentAv(AP.load().agents.find((a) => a.name === name) || { name }, size);
  AP.nextAgentAv = () => { const used = AP.load().agents.map((a) => a.avatar); return AP.AV.agent.find((v) => !used.includes(v)) || AP.AV.agent[0]; };
  AP.avPicker = (kind, sel, id) => `<div class="av-grid" id="${id}" role="radiogroup" aria-label="${kind === "user" ? "Choose your avatar" : "Choose an agent avatar"}">${AP.AV[kind].map((v, i) => `<button type="button" role="radio" aria-checked="${v === sel}" aria-label="${kind === "user" ? "Person" : "Robot"} ${i + 1}" class="av-pick ${v === sel ? "on" : ""}" data-av="${v}">${AP.avatar(v, 56)}<span class="av-tick">${AP.icon("check", 12)}</span></button>`).join("")}</div>`;
  AP.bindAvPicker = (id, cb) => AP.$$("#" + id + " .av-pick").forEach((b) => (b.onclick = () => { AP.$$("#" + id + " .av-pick").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", x === b); }); if (cb) cb(b.dataset.av); }));
  AP.avPicked = (id) => { const o = AP.$("#" + id + " .av-pick.on"); return o ? o.dataset.av : null; };
  AP.initials = () => { const n = AP.load().user.name || AP.load().user.email || "A"; return n.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase(); };

  /* ---------- theme ---------- */
  AP.setTheme = (t) => { document.documentElement.setAttribute("data-theme", t); localStorage.setItem(THEME, t); const b = AP.$("#themeBtn"); if (b) b.innerHTML = AP.icon(t === "dark" ? "moon" : "sun", 18) + `<span class="small fw-bold">${t === "dark" ? "Dark" : "Light"}</span>`; };
  AP.setTheme(localStorage.getItem(THEME) || "light");

  /* ---------- toast ---------- */
  AP.toast = (msg, type = "ok") => {
    let st = AP.$(".toast-stack"); if (!st) { st = document.createElement("div"); st.className = "toast-stack"; document.body.appendChild(st); }
    const t = document.createElement("div"); t.className = "ap-toast " + type;
    t.innerHTML = AP.icon(type === "ok" ? "check" : type === "bad" ? "x" : "alert", 18) + `<span>${AP.esc(msg)}</span>`;
    while (st.children.length >= 4) st.firstChild.remove();   // never pile up more than 4 toasts
    st.appendChild(t); setTimeout(() => { t.style.opacity = 0; t.style.transition = ".3s"; setTimeout(() => t.remove(), 300); }, 2800);
  };

  /* ---------- password reveal ---------- */
  AP.bindReveal = () => AP.$$(".reveal").forEach((b) => b.addEventListener("click", () => { const i = b.parentElement.querySelector("input"); const show = i.type === "password"; i.type = show ? "text" : "password"; b.innerHTML = AP.icon(show ? "eye" : "eye-off", 20); }));

  /* ---------- app shell ---------- */
  const NAV = [
    ["dashboard.html", "home", "Home"],
    ["agent.html", "bot", "Agent Console"],
    ["activity.html", "activity", "Activity"],
    ["wallets.html", "wallet", "Wallets"],
    ["security.html", "shield-check", "Security"],
    ["support.html", "life-buoy", "Support"],
    ["settings.html", "settings", "Settings"],
  ];
  AP.shell = () => {
    if (!AP.guard()) return false;
    const s = AP.load(); if (!s.user.onboarded && !/onboarding/.test(location.pathname)) { location.replace("onboarding.html"); return false; }
    const page = AP.$("#page-content"); const title = document.body.dataset.title || "Home"; const cur = location.pathname.split("/").pop() || "dashboard.html";
    const nav = NAV.map(([h, i, l]) => `<a href="${h}" class="${cur === h ? "active" : ""}">${AP.icon(i, 24)}<span class="sb-label">${l}</span></a>`).join("");
    const shell = document.createElement("div"); shell.className = "shell"; shell.id = "shell";
    if (localStorage.getItem("agentpay.collapsed") === "1") shell.classList.add("collapsed");
    shell.innerHTML = `
      <aside class="sidebar" id="sidebar">
        <a class="sb-brand" href="dashboard.html"><img src="assets/img/logo.png" alt="AgentPay"><span>AgentPay</span></a>
        <div class="sb-collapse" id="sbCollapse">${AP.icon("chevron-left", 16)}</div>
        <nav class="sb-nav">${nav}</nav>
        <div class="sb-foot sb-nav"><a href="#" id="logoutLink">${AP.icon("logout", 24)}<span class="sb-label">Log out</span></a></div>
      </aside>
      <div style="min-width:0">
        <header class="topbar">
          <div class="d-flex align-items-center gap-3"><button class="btn btn-soft btn-icon d-lg-none" id="menuBtn">${AP.icon("list", 20)}</button><h1>${title}</h1></div>
          <div class="top-right">
            <span class="chip ok d-none d-md-inline-flex" id="netChip">Base mainnet</span>
            <button class="theme-pill" id="themeBtn"></button>
            <div class="dropdown">
              <button class="user-pill" data-bs-toggle="dropdown">${AP.userAv(36)}<span class="d-none d-md-inline">${AP.esc(s.user.email || s.user.name)}</span>${AP.icon("chevron-down", 16)}</button>
              <ul class="dropdown-menu dropdown-menu-end">
                <li><a class="dropdown-item" href="subscription.html">${AP.icon("crown", 18)}Subscription<span class="chip brand ms-auto">${AP.plan().name}</span></a></li>
                <li><a class="dropdown-item" href="settings.html">${AP.icon("settings", 18)}Settings</a></li>
                <li><a class="dropdown-item" href="settings.html#team">${AP.icon("users", 18)}Team &amp; roles</a></li>
                <li><hr class="dropdown-divider"></li>
                <li><a class="dropdown-item" href="#" id="resetDemo">${AP.icon("refresh", 18)}Refresh app</a></li>
                <li><a class="dropdown-item" href="#" id="logoutItem">${AP.icon("logout", 18)}Log out</a></li>
              </ul>
            </div>
          </div>
        </header>
        <main class="page" id="pageHost"></main>
      </div>`;
    document.body.prepend(shell);
    AP.$("#pageHost").appendChild(page); page.hidden = false;
    AP.setTheme(document.documentElement.getAttribute("data-theme"));
    AP.$("#themeBtn").onclick = () => AP.setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
    AP.$("#sbCollapse").onclick = () => { shell.classList.toggle("collapsed"); localStorage.setItem("agentpay.collapsed", shell.classList.contains("collapsed") ? "1" : "0"); };
    AP.$("#menuBtn").onclick = () => AP.$("#sidebar").classList.toggle("open");
    ["logoutLink", "logoutItem"].forEach((id) => (AP.$("#" + id).onclick = (e) => { e.preventDefault(); AP.logout(); }));
    AP.$("#resetDemo").onclick = (e) => { e.preventDefault(); if (confirm("Reset all demo data and sign out?")) { AP.reset(); location.href = "login.html"; } };
    if (s.wallet.connected) AP.$("#netChip").textContent = s.wallet.network + " · " + AP.short(s.wallet.address);
    AP.support();
    AP.renderIcons();
    /* keep the agent working on every page (see js/agent-run.js) */
    if (!/agent\.html$/.test(location.pathname)) { const ld = (src, cb) => { if (document.querySelector(`script[src="${src}"]`)) return cb && cb(); const x = document.createElement("script"); x.src = src; x.onload = () => cb && cb(); document.body.appendChild(x); }; ld("js/agent-script.js", () => ld("js/agent-run.js")); }
    return true;
  };

  /* =====================================================================
     v2 additions: plans, team, notifications/webhooks, agent builder, helper bot
     ===================================================================== */
  AP.PLANS = [
    { id: "starter", name: "Starter", price: 0, tag: "For trying things out", agents: 5, seats: 2, fee: "1.0%", feats: ["5 agents", "x402, AP2 + Visa rails", "Email alerts", "7-day audit log", "2 team seats"] },
    { id: "pro", name: "Pro", price: 29, tag: "For builders shipping agents", agents: 15, seats: 10, fee: "0.5%", pop: true, feats: ["15 agents", "All rails incl. Mastercard", "Webhooks + push alerts", "90-day audit log", "Team roles (10 seats)"] },
    { id: "business", name: "Business", price: 99, tag: "For teams with spend controls", agents: 50, seats: 25, fee: "0.25%", feats: ["50 agents", "Approver & finance roles", "Priority support", "1-year audit log + CSV", "25 seats"] },
    { id: "enterprise", name: "Enterprise", price: null, tag: "Custom limits & compliance", agents: 9999, seats: 9999, fee: "Custom", feats: ["Unlimited agents & seats", "SSO / SAML", "Dedicated manager", "Custom SLA"] },
  ];
  AP.plan = () => AP.PLANS.find((p) => p.id === (AP.load().plan || {}).id) || AP.PLANS[0];
  AP.RAILS = [["x402", "x402 (USDC)", "zap"], ["AP2", "AP2 mandates", "refresh"], ["Visa", "Visa Intelligent Commerce", "visa"], ["Mastercard", "Mastercard Agent Pay", "mc"], ["Invoice", "Invoices", "receipt"]];
  AP.ROLES = { owner: ["Owner", "Everything, incl. billing"], admin: ["Admin", "Manage agents, policy, wallets"], approver: ["Approver", "Approve or reject payments"], finance: ["Finance", "View activity, export CSV"], viewer: ["Viewer", "Read-only access"] };
  AP.EVENTS = [["payment.settled", "Payment settled"], ["payment.blocked", "Payment blocked by policy"], ["approval.requested", "Approval requested"], ["balance.low", "Agent balance low"], ["agent.created", "Agent created"]];
  AP.migrate = () => {
    const s = AP.load(); let dirty = false; const d = (k, v) => { if (s[k] === undefined) { s[k] = v; dirty = true; } };
    d("plan", { id: "starter", since: Date.now() - 12 * 86400000, billing: "monthly" });
    d("team", [{ id: "t1", name: s.user.name || "You", email: s.user.email || "demo@agentpay.io", role: "owner", status: "active" }, { id: "t2", name: "Priya Nair", email: "priya@acme.co", role: "approver", status: "active" }]);
    d("notify", { email: { on: true, to: s.user.email || "demo@agentpay.io", ev: { "payment.settled": false, "payment.blocked": true, "approval.requested": true, "balance.low": true, "agent.created": false } }, push: { on: true, ev: { "payment.settled": false, "payment.blocked": true, "approval.requested": true, "balance.low": true, "agent.created": false } } });
    d("webhooks", [{ id: "wh1", url: "https://hooks.acme.co/agentpay", ev: ["payment.settled", "payment.blocked"], secret: "whsec_" + AP.hex(16), active: true }]);
    d("deliveries", []); d("tickets", []); d("rails", { Visa: { on: true, last4: "4242", limit: 300 }, Mastercard: { on: false, last4: "", limit: 300 } });
    d("prefs", { currency: "USD", tz: "Asia/Kolkata", autoRefill: false, refillBelow: 200, refillAmt: 500, defaultApproval: 300 });
    s.agents.forEach((a) => { if (!a.rails) { Object.assign(a, { rails: ["x402", "AP2", "Invoice", "Visa"], allow: [], cats: [], access: "spend", perTx: 500, approval: s.policy.approval }); dirty = true; } });
    if (!s.user.avatar) { s.user.avatar = "user-01"; dirty = true; }
    const DEF = { treasury: "agent-06", research: "agent-08", ops: "agent-05" };
    s.agents.forEach((a, i) => { if (!a.avatar) { a.avatar = DEF[a.id] || AP.AV.agent[i % 8]; dirty = true; } });
    if (dirty) AP.save();
  };
  AP.migrate();

  /* events -> email / push toasts + webhook delivery log (all simulated) */
  AP.emit = (ev, data) => {
    const s = AP.load(), n = s.notify, label = (AP.EVENTS.find((e) => e[0] === ev) || [0, ev])[1], bits = [];
    if (n.email.on && n.email.ev[ev]) bits.push("Email → " + n.email.to);
    if (n.push.on && n.push.ev[ev]) bits.push("Push sent");
    s.webhooks.filter((w) => w.active && w.ev.includes(ev)).forEach((w) => { s.deliveries.unshift({ id: "d" + Date.now() + AP.rand(1, 99), ts: Date.now(), ev, url: w.url, code: 200, ms: AP.rand(40, 210) }); bits.push("Webhook → " + w.url.replace(/^https?:\/\//, "").split("/")[0]); });
    s.deliveries = s.deliveries.slice(0, 30); AP.save();
    const loud = bits.filter((b) => !/^Webhook/.test(b)); if (loud.length && /settled|blocked|approval|low/.test(ev) && (!AP.toastGate || AP.toastGate(ev))) setTimeout(() => AP.toast(label + " · " + loud.join(" · "), "ok"), 400);
  };
  const _add = AP.addActivity;
  AP.addActivity = (e) => { const r = _add(e); AP.emit("payment." + (e.status === "settled" ? "settled" : "blocked"), r); const s = AP.load(); if (e.status === "settled" && s.prefs.autoRefill && s.agentWallet.balance < s.prefs.refillBelow && s.wallet.connected && s.wallet.balances.USDC >= s.prefs.refillAmt) { s.wallet.balances.USDC -= s.prefs.refillAmt; s.agentWallet.balance = +(s.agentWallet.balance + s.prefs.refillAmt).toFixed(2); AP.save(); AP.toast("Auto-refill: " + AP.usd(s.prefs.refillAmt, 0) + " USDC added to agent wallet", "ok"); }
    else if (e.status === "settled" && s.agentWallet.balance < 200) AP.emit("balance.low", {}); return r; };

  /* tabs: <div class="ap-tabs"><button data-tab="x">..</button></div> + <section class="tab-pane" data-pane="x"> ; hash selects tab */
  AP.tabs = (root = document, def) => {
    const btns = AP.$$("[data-tab]", root), panes = AP.$$("[data-pane]", root), ids = btns.map((b) => b.dataset.tab);
    const show = (id, push) => { if (!ids.includes(id)) id = def || ids[0]; btns.forEach((b) => b.classList.toggle("on", b.dataset.tab === id)); panes.forEach((x) => x.classList.toggle("on", x.dataset.pane === id)); if (push) history.replaceState(null, "", "#" + id); root.dispatchEvent(new CustomEvent("tabchange", { detail: id })); };
    btns.forEach((b) => (b.onclick = () => show(b.dataset.tab, true))); show(location.hash.slice(1), false); window.addEventListener("hashchange", () => show(location.hash.slice(1), false)); return show;
  };
  /* ---------- agent builder (modal, usable from any page) ---------- */
  const COLORS = ["#7A12F5", "#3084F3", "#F4723F", "#12B76A", "#E5484D", "#F79009", "#0EA5A5", "#D946A8"];
  const CATS = ["Data & APIs", "Cloud & compute", "SaaS & software", "Design & services", "Travel", "Ads & marketing", "Agent-to-agent"];
  AP.agentFormHTML = (a, pfx) => `
    <div class="row g-3">
      <div class="col-12"><label class="form-label">Avatar</label>${AP.avPicker("agent", a.avatar || AP.nextAgentAv(), pfx + "av")}</div>
      <div class="col-md-7"><label class="form-label">Agent name</label><input class="form-control" id="${pfx}name" value="${AP.esc(a.name || "")}" placeholder="e.g. Marketing Agent"></div>
      <div class="col-md-5"><label class="form-label">Colour</label><div class="d-flex gap-2 flex-wrap pt-1" id="${pfx}colors">${COLORS.map((c) => `<button type="button" class="swatch ${c === a.color ? "on" : ""}" data-c="${c}" style="background:${c}"></button>`).join("")}</div></div>
      <div class="col-12"><label class="form-label">What does it do?</label><input class="form-control" id="${pfx}role" value="${AP.esc(a.role || "")}" placeholder="Buys ad credits and pays creators"></div>
      <div class="col-12"><label class="form-label">Access level</label><div class="row g-2" id="${pfx}access">${[["propose", "Propose only", "Every payment needs your approval"], ["spend", "Spend within limits", "Pays on its own under the limits"], ["subscribe", "Spend + subscribe", "Also renews AP2 mandates"]].map(([k, t, d]) => `<div class="col-md-4"><button type="button" class="opt ${a.access === k ? "on" : ""}" data-v="${k}"><b>${t}</b><span>${d}</span></button></div>`).join("")}</div></div>
      <div class="col-12">${AP.limitHTML({ id: pfx + "budget", label: "Monthly budget (USDC)", min: 50, max: 5000, step: 50, value: a.budget || 300, def: 300 })}</div>
      <div class="col-12">${AP.limitHTML({ id: pfx + "perTx", label: "Max per payment", min: 10, max: 1000, step: 10, value: a.perTx || 100, def: 100 })}</div>
      <div class="col-12">${AP.limitHTML({ id: pfx + "approval", label: "Ask me above", min: 0, max: 1000, step: 10, value: a.approval == null ? 100 : a.approval, def: 100, minCustom: 0 })}</div>
      <div class="col-12"><label class="form-label">Where it can pay (payment rails)</label><div class="d-flex flex-wrap gap-2" id="${pfx}rails">${AP.RAILS.map(([k, t, i]) => `<button type="button" class="chip-tog ${(a.rails || ["x402"]).includes(k) ? "on" : ""}" data-v="${k}">${AP.icon(i, 16)}${t}</button>`).join("")}</div></div>
      <div class="col-12"><label class="form-label">Spend categories</label><div class="d-flex flex-wrap gap-2" id="${pfx}cats">${CATS.map((c) => `<button type="button" class="chip-tog ${(a.cats || []).includes(c) ? "on" : ""}" data-v="${c}">${c}</button>`).join("")}</div><div class="muted small mt-1">Leave empty to allow every category your global policy allows.</div></div>
      <div class="col-12"><label class="form-label">Who it can pay (merchant allow-list)</label><input class="form-control" id="${pfx}allow" value="${AP.esc((a.allow || []).join(", "))}" placeholder="dune.com, runpod.io — empty = use the global allow-list"><div class="muted small mt-1">Comma-separated domains. When set, this agent can pay only these merchants.</div></div>
    </div>`;
  AP.bindAgentForm = (pfx) => {
    const box = (id, multi) => AP.$$("#" + pfx + id + " [data-v],#" + pfx + id + " [data-c]").forEach((b) => (b.onclick = () => { if (!multi) AP.$$("#" + pfx + id + " >*,#" + pfx + id + " .opt").forEach((x) => x.classList.remove("on")); b.classList.toggle("on", multi ? !b.classList.contains("on") : true); }));
    box("colors"); box("rails", 1); box("cats", 1); AP.bindAvPicker(pfx + "av");
    AP.$$("#" + pfx + "access .opt").forEach((b) => (b.onclick = () => { AP.$$("#" + pfx + "access .opt").forEach((x) => x.classList.remove("on")); b.classList.add("on"); }));
    AP.$$("#" + pfx + "colors .swatch").forEach((b) => (b.onclick = () => { AP.$$("#" + pfx + "colors .swatch").forEach((x) => x.classList.remove("on")); b.classList.add("on"); }));
  };
  AP.readAgentForm = (pfx) => {
    const g = (i) => AP.$("#" + pfx + i), sel = (i) => AP.$$("#" + pfx + i + " .on").map((x) => x.dataset.v);
    const allow = g("allow").value.split(/[,\s]+/).map((x) => x.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")).filter(Boolean);
    return { name: g("name").value.trim() || "New agent", avatar: AP.avPicked(pfx + "av") || AP.nextAgentAv(), role: g("role").value.trim() || "Custom agent", color: (AP.$("#" + pfx + "colors .on") || {}).dataset?.c || COLORS[0], access: (AP.$("#" + pfx + "access .on") || {}).dataset?.v || "spend", budget: +g("budget").value || 300, perTx: +g("perTx").value || 100, approval: +g("approval").value || 0, rails: sel("rails"), cats: sel("cats"), allow };
  };
  AP.newAgent = (onDone) => {
    const s = AP.load(), pl = AP.plan();
    if (s.agents.length >= pl.agents) { AP.toast(`${pl.name} plan allows ${pl.agents} agents — upgrade to add more`, "warn"); setTimeout(() => (location.href = "subscription.html#plans"), 1200); return; }
    let m = AP.$("#newAgentModal"); if (m) m.remove();
    document.body.insertAdjacentHTML("beforeend", `<div class="modal fade" id="newAgentModal" tabindex="-1"><div class="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable"><div class="modal-content p-2"><div class="modal-header"><div><h5 class="modal-title fw-800">Create agent</h5><div class="muted small">${s.agents.length} of ${pl.agents > 999 ? "∞" : pl.agents} agents used on ${pl.name}</div></div><button class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body">${AP.agentFormHTML({ avatar: AP.nextAgentAv(), color: COLORS[s.agents.length % 8], access: "spend", rails: ["x402"], budget: 300, perTx: 100, approval: 100 }, "na_")}</div><div class="modal-footer"><button class="btn btn-soft" data-bs-dismiss="modal">Cancel</button><button class="btn btn-brand" id="na_go">Create agent</button></div></div></div></div>`);
    AP.renderIcons(); AP.bindAgentForm("na_"); const bm = new bootstrap.Modal(AP.$("#newAgentModal")); bm.show();
    AP.$("#na_go").onclick = () => { const v = AP.readAgentForm("na_"); if (!v) return; const a = Object.assign({ id: "ag" + Date.now().toString(36), status: "active", created: Date.now() }, v); s.agents.push(a); AP.save(); AP.emit("agent.created", a); bm.hide(); AP.toast(a.name + " created — it can now pay within its limits", "ok"); if (onDone) onDone(a); };
  };

  /* ---------- helper bot: local, rule-based (no API calls = no cost) ---------- */
  AP.support = () => {
    const fab = document.createElement("button"); fab.className = "support-fab"; fab.title = "Ask AgentPay"; fab.innerHTML = AP.icon("chat", 28); document.body.appendChild(fab);
    const p = document.createElement("div"); p.className = "chat-panel";
    p.innerHTML = `<div class="chat-head"><span class="d-flex align-items-center gap-2">${AP.icon("sparkles", 18)}AgentPay Assistant</span><button class="btn-close" style="filter:invert(1)"></button></div><div class="chat-body"></div><div class="chat-chips"></div><form class="chat-in"><input placeholder="Ask or type a command…"><button class="btn btn-brand btn-icon" style="width:38px;height:38px">${AP.icon("send", 16)}</button></form>`;
    document.body.appendChild(p);
    const body = AP.$(".chat-body", p), chips = AP.$(".chat-chips", p), toggle = () => p.classList.toggle("show");
    const say = (h, me) => { body.insertAdjacentHTML("beforeend", `<div class="bubble ${me ? "me" : "bot"}">${h}</div>`); body.scrollTop = 1e6; };
    const ag = (q) => AP.load().agents.find((a) => q.includes(a.name.toLowerCase().split(" ")[0]) || q.includes(a.id));
    const KB = [
      [/pause|stop (the )?agent/, (q) => { const a = ag(q); if (!a) return "Which agent? e.g. <b>pause research</b>."; a.status = "paused"; AP.save(); return `Paused <b>${AP.esc(a.name)}</b>. It won't start new payments.`; }],
      [/resume|start agent|unpause/, (q) => { const a = ag(q); if (!a) return "Which agent? e.g. <b>resume ops</b>."; a.status = "active"; AP.save(); return `Resumed <b>${AP.esc(a.name)}</b>.`; }],
      [/freeze|kill|emergency/, () => { const s = AP.load(); s.security.frozen = true; AP.save(); return "All agents are <b>frozen</b>. Unfreeze from Security or the Console."; }],
      [/unfreeze/, () => { const s = AP.load(); s.security.frozen = false; AP.save(); return "Agents unfrozen."; }],
      [/create|new|add.*agent/, () => { setTimeout(() => AP.newAgent(() => { if (/agent|dashboard/.test(location.pathname)) location.reload(); }), 300); return "Opening the agent builder — set its access, limits, rails and who it can pay."; }],
      [/balance|how much.*(have|left)|funds/, () => `Agent wallet: <b>${AP.usd(AP.load().agentWallet.balance)}</b> USDC. Fund it from <a href="wallets.html">Wallets</a>.`],
      [/spent|spend today|today/, () => { const s = AP.load(); return `Spent today: <b>${AP.usd(AP.spentToday())}</b> of your ${AP.usd(s.policy.daily, 0)} daily budget.`; }],
      [/agents?\b.*(list|have|running|status)|my agents/, () => AP.load().agents.map((a) => `• <b>${AP.esc(a.name)}</b> — ${a.status}`).join("<br>")],
      [/approv/, () => `Payments above your approval threshold (${AP.usd(AP.load().policy.approval, 0)}) wait in the Console's <b>Approvals</b> tab. Change it in Security → Policy.`],
      [/limit|policy|budget/, () => `Limits live in <a href="security.html#policy">Security → Policy</a>. Each agent can also have its own limit in Console → Agent settings.`],
      [/visa|mastercard|card/, () => `Card rails are in <a href="wallets.html">Wallets → Card rails</a>. Enable Visa or Mastercard, then allow the rail on an agent.`],
      [/webhook|alert|notif|email|push/, () => `Set email/push alerts and webhooks in <a href="settings.html">Settings</a>.`],
      [/team|role|invite|member/, () => `Invite teammates and assign roles (Admin, Approver, Finance, Viewer) in <a href="settings.html#team">Settings → Team</a>.`],
      [/plan|upgrade|price|billing|subscription/, () => `You're on <b>${AP.plan().name}</b>. See plans in <a href="subscription.html">Subscription</a> (profile menu).`],
      [/wallet|connect|session key/, () => `Connect a wallet and manage the agent's session key in <a href="wallets.html">Wallets</a>.`],
      [/x402|402/, () => "x402 turns an HTTP 402 response into a stablecoin payment the agent makes automatically."],
      [/human|agent support|ticket|contact|problem|bug/, () => `For anything I can't solve, <a href="support.html#contact">open a ticket</a> on the Support page.`],
      [/hi\b|hello|hey|help/, () => "Hi! I can answer questions and run quick actions: <b>balance</b>, <b>pause research</b>, <b>freeze agents</b>, <b>create agent</b>."],
    ];
    const ask = async (v) => { say(AP.esc(v), 1); await AP.sleep(350); const q = v.toLowerCase(); const hit = KB.find(([re]) => re.test(q)); say(hit ? hit[1](q) : `I'm not sure about that. Try one of the suggestions, or <a href="support.html#contact">contact support</a>.`); };
    chips.innerHTML = ["Balance", "Spent today", "Create agent", "Freeze agents", "Upgrade plan"].map((c) => `<button type="button">${c}</button>`).join("");
    AP.$$("button", chips).forEach((b) => (b.onclick = () => ask(b.textContent)));
    say("Hi! I can answer questions and do quick actions like pausing an agent or checking your balance.");
    fab.onclick = toggle; AP.$(".btn-close", p).onclick = toggle;
    AP.$$("#openSupport,[data-openbot]").forEach((os) => (os.onclick = (e) => { e.preventDefault(); p.classList.add("show"); }));
    p.querySelector("form").onsubmit = (e) => { e.preventDefault(); const i = p.querySelector("input"), v = i.value.trim(); if (!v) return; i.value = ""; ask(v); };
  };


  /* =====================================================================
     LIMIT CONTROL — every spending limit uses this.
     Slider view by default. "Custom amount" swaps the slider for an input
     view (same spot, nothing stacked). There you can Apply, Cancel (keeps
     what you had) or Use default (back to the default limit + slider).
     The real value always lives in a hidden <input id="{id}">, so
     +AP.$("#"+id).value works everywhere. A bubbling "limchange" event
     fires on every change.
     ===================================================================== */
  AP.limitHTML = (c) => {
    const v = +c.value, d = c.def == null ? v : +c.def, mn = c.min, mx = c.max, st = c.step || 1, lo = c.minCustom == null ? 1 : c.minCustom;
    return `<div class="lim${c.bare ? " bare" : ""}" data-lim="${c.id}" data-min="${mn}" data-max="${mx}" data-step="${st}" data-def="${d}" data-lo="${lo}" data-prev="${v}">
      <div class="lim-head"><span class="lim-label">${c.label || ""}</span><span class="lim-valwrap"><span class="lim-chip" hidden>Custom</span><b class="lim-val">${AP.usd(v, 0)}</b></span></div>
      <input type="hidden" id="${c.id}" value="${v}" ${c.attrs || ""}>
      <div class="lim-pane" data-pane-s>
        <input type="range" class="form-range" min="${mn}" max="${mx}" step="${st}" value="${Math.min(mx, Math.max(mn, v))}" aria-label="${AP.esc(c.label || "Limit")}">
        <div class="lim-foot"><span class="lim-range">${AP.usd(mn, 0)} – ${AP.usd(mx, 0)}</span><button type="button" class="lim-btn" data-lim-open>${AP.icon("sliders", 14)} Custom amount</button></div>
      </div>
      <div class="lim-pane" data-pane-c hidden>
        <div class="lim-input"><span class="pre">$</span><input type="number" inputmode="numeric" min="${lo}" step="1" placeholder="Enter your own limit" aria-label="Custom ${AP.esc(c.label || "limit")} in USDC"><em>USDC</em></div>
        <div class="lim-err" role="alert"></div>
        <div class="lim-foot"><button type="button" class="lim-btn" data-lim-cancel>Cancel</button><button type="button" class="lim-btn" data-lim-default>Use default ${AP.usd(d, 0)}</button><button type="button" class="lim-btn brand" data-lim-apply>Apply</button></div>
      </div>
    </div>`;
  };
  const limRoot = (id) => AP.$('.lim[data-lim="' + id + '"]');
  const limPaint = (w, v) => {
    const mn = +w.dataset.min, mx = +w.dataset.max, st = +w.dataset.step, id = w.dataset.lim;
    AP.$("#" + id).value = v; AP.$(".lim-val", w).textContent = AP.usd(v, 0);
    AP.$("input[type=range]", w).value = Math.min(mx, Math.max(mn, v));
    AP.$(".lim-chip", w).hidden = !(v > mx || v < mn || (v - mn) % st !== 0);
    w.dataset.prev = v;
  };
  AP.limitGet = (id) => +AP.$("#" + id).value;
  AP.limitSet = (id, v, silent) => { const w = limRoot(id); if (!w) return; limPaint(w, +v); showPane(w, "s"); if (!silent) w.dispatchEvent(new CustomEvent("limchange", { bubbles: true, detail: { id, value: +v } })); };
  function showPane(w, which) { AP.$("[data-pane-s]", w).hidden = which !== "s"; AP.$("[data-pane-c]", w).hidden = which !== "c"; w.classList.toggle("is-custom", which === "c"); }
  function limCommit(w, v) { limPaint(w, v); w.dispatchEvent(new CustomEvent("limchange", { bubbles: true, detail: { id: w.dataset.lim, value: v } })); }
  document.addEventListener("input", (e) => {
    const r = e.target.closest && e.target.closest(".lim input[type=range]"); if (!r) return;
    limCommit(r.closest(".lim"), +r.value);
  });
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest(".lim-btn"); if (!b) return;
    const w = b.closest(".lim"), inp = AP.$(".lim-input input", w), err = AP.$(".lim-err", w);
    if (b.hasAttribute("data-lim-open")) { w.dataset.before = w.dataset.prev; inp.value = w.dataset.prev; err.textContent = ""; showPane(w, "c"); inp.focus(); inp.select(); }
    else if (b.hasAttribute("data-lim-cancel")) { limCommit(w, +w.dataset.before || +w.dataset.prev); showPane(w, "s"); }
    else if (b.hasAttribute("data-lim-default")) { limCommit(w, +w.dataset.def); showPane(w, "s"); }
    else if (b.hasAttribute("data-lim-apply")) {
      const v = Math.floor(+inp.value), lo = +w.dataset.lo;
      if (inp.value === "" || !isFinite(v) || v < lo) { err.textContent = lo > 0 ? "Enter an amount of at least " + AP.usd(lo, 0) + "." : "Enter 0 or more."; inp.focus(); return; }
      if (v > 1e9) { err.textContent = "That amount is too large."; return; }
      limCommit(w, v); showPane(w, "s");
    }
  });
  document.addEventListener("keydown", (e) => {
    const inp = e.target.closest && e.target.closest(".lim-input input"); if (!inp) return;
    const w = inp.closest(".lim");
    if (e.key === "Enter") { e.preventDefault(); AP.$("[data-lim-apply]", w).click(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); AP.$("[data-lim-cancel]", w).click(); }
  });
  document.addEventListener("input", (e) => { const i = e.target.closest && e.target.closest(".lim-input input"); if (i) AP.$(".lim-err", i.closest(".lim")).textContent = ""; });

  /* =====================================================================
     CONNECT-WALLET POPUP — usable from any page.
     AP.connectWallet(onDone) opens the wallet chooser; after the user
     picks a wallet and signs, the wallet is saved and onDone() runs.
     ===================================================================== */
  AP.WALLET_LIST = [["metamask", "MetaMask", "Browser extension"], ["coinbase", "Coinbase Wallet", "Smart wallet · passkeys"], ["walletconnect", "WalletConnect", "Scan QR with mobile wallet"], ["phantom", "Phantom", "Solana & EVM"], ["ledger", "Ledger", "Hardware wallet"]];
  AP.connectWallet = (onDone) => {
    let m = AP.$("#apWalletModal"); if (m) { bootstrap.Modal.getOrCreateInstance(m).dispose(); m.remove(); }
    document.body.insertAdjacentHTML("beforeend", `<div class="modal fade" id="apWalletModal" tabindex="-1"><div class="modal-dialog modal-dialog-centered"><div class="modal-content p-2"><div class="modal-header"><h5 class="modal-title fw-800" id="awTitle">Connect a wallet</h5><button class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body" id="awBody"></div></div></div></div>`);
    m = AP.$("#apWalletModal"); const bm = new bootstrap.Modal(m); let done = false;
    m.addEventListener("hidden.bs.modal", () => { bm.dispose(); m.remove(); });
    const choose = () => {
      AP.$("#awTitle").textContent = "Connect a wallet to go live";
      AP.$("#awBody").innerHTML = `<p class="muted small mb-3">Your agent can only spend from a wallet you own. Pick one to continue — you can change it any time in Wallets.</p><div class="d-grid gap-2">${AP.WALLET_LIST.map(([k, n, d]) => `<button class="wallet-opt" data-w="${n}" data-k="${k}"><span class="wi">${AP.icon(k, 40)}</span><div class="flex-grow-1"><b>${n}</b><span>${d}</span></div>${AP.icon("chevron-right", 18)}</button>`).join("")}</div><p class="muted small mt-3 mb-0 text-center">AgentPay never has custody of your keys.</p>`;
      AP.$$("#awBody [data-w]").forEach((b) => (b.onclick = () => request(b.dataset.w, b.dataset.k)));
    };
    const request = async (name, key) => {
      AP.$("#awTitle").textContent = "Connecting to " + name;
      AP.$("#awBody").innerHTML = `<div class="text-center py-4"><div class="spinner-ap mb-4"></div><b>Opening ${name}…</b><div class="muted small mt-1">Approve the connection request in your wallet</div></div>`;
      await AP.sleep(1300); if (!AP.$("#apWalletModal")) return;
      AP.$("#awBody").innerHTML = `<div class="text-center mb-3">${AP.icon(key, 44)}</div><h5 class="text-center mb-2">Verify wallet ownership</h5><p class="muted text-center">Sign this free message. It does not move funds or cost gas.</p><div class="addr-box mono small mb-3" style="display:block;white-space:pre-wrap">AgentPay wants you to sign in.\nNonce: ${AP.hex(12)}\nIssued: ${new Date().toISOString()}</div><div class="d-flex gap-2"><button class="btn btn-soft flex-grow-1" id="awBack">Back</button><button class="btn btn-brand flex-grow-1" id="awSign">Sign message</button></div>`;
      AP.$("#awBack").onclick = choose;
      AP.$("#awSign").onclick = async () => {
        AP.$("#awBody").innerHTML = `<div class="text-center py-4"><div class="spinner-ap mb-4"></div><b>Verifying signature…</b></div>`; await AP.sleep(1000);
        const s = AP.load(); s.wallet = { connected: true, provider: name, address: "0x" + AP.hex(40), network: "Base", balances: { ETH: +(Math.random() * 2 + 0.3).toFixed(3), USDC: AP.rand(3000, 9000) } }; AP.save();
        AP.$("#awBody").innerHTML = `<div class="text-center py-3"><div class="mx-auto mb-3 d-flex align-items-center justify-content-center" style="width:72px;height:72px;border-radius:50%;background:var(--ok-bg);color:var(--ok)">${AP.icon("check", 38)}</div><h5>Wallet connected</h5><div class="mono muted small">${AP.short(s.wallet.address)}</div></div>`;
        await AP.sleep(800); done = true; bm.hide(); AP.toast(name + " connected", "ok"); if (onDone) onDone(s.wallet);
      };
      AP.renderIcons();
    };
    choose(); AP.renderIcons(); bm.show();
  };

  document.addEventListener("DOMContentLoaded", () => { AP.renderIcons(); });
})();
