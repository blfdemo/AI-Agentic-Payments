/* =====================================================================
   AgentPay — AGENT PAYMENT SCRIPT  (live demo engine)
   ---------------------------------------------------------------------
   A scripted but *stateful* agent. Narration and network responses are
   static; every policy decision is computed from the real settings in
   Security (limits, allow-list, blocked categories, kill switch, session
   key, balance), so changing a setting changes the outcome on screen.

   Pipeline:  intent → discover (HTTP 402 / invoice / mandate) → verify payee
              → policy check → human approval (if needed) → sign (session key)
              → settle on-chain → receipt + audit log
   ===================================================================== */
(function () {
  const A = {};

  /* ---------------- scenario scripts (static data) ---------------- */
  A.scenarios = [
    { id: "x402-data", icon: "zap", title: "Pay for API data (x402)", sub: "Dune Analytics · 0.25 USDC", agentId: "research",
      task: "Get the top 10 DEX pairs by 24h volume from Dune Analytics.", domain: "api.dune.com", path: "/api/v1/query/3412/results", merchant: "Dune Analytics API",
      amount: 0.25, protocol: "x402", chain: "Base", category: "data", risk: 6,
      thoughts: ["I need on-chain DEX volume data. Dune exposes this over a pay-per-call API.", "Price is a micropayment — well inside my per-transaction limit.", "I will request the resource and settle any HTTP 402 challenge automatically."],
      response: { rows: [{ pair: "ETH/USDC", vol24h: "412.8M" }, { pair: "SOL/USDC", vol24h: "188.1M" }, { pair: "BTC/USDT", vol24h: "151.7M" }], credits_used: 1 } },
    { id: "gpu", icon: "cpu", title: "Rent GPU compute", sub: "RunPod · 12 USDC", agentId: "ops",
      task: "Rent one A100 GPU for 2 hours to fine-tune the embedding model.", domain: "api.runpod.io", path: "/v2/pods/a100-80gb", merchant: "RunPod GPU compute",
      amount: 12, protocol: "x402", chain: "Base", category: "compute", risk: 9,
      thoughts: ["Fine-tuning needs an A100 for roughly two hours.", "RunPod is on the allow-list and quotes 6 USDC/hour = 12 USDC.", "Paying per session in USDC avoids a stored card on file."],
      response: { pod_id: "pod_8f3a21", gpu: "A100-80GB", hours: 2, status: "provisioning" } },
    { id: "invoice", icon: "receipt", title: "Pay vendor invoice", sub: "Acme Design · 480 USDC", agentId: "treasury",
      task: "Pay invoice INV-2041 from Acme Design for the Q4 brand refresh.", domain: "acme-design.co", path: "/invoices/INV-2041", merchant: "Acme Design invoice #2041",
      amount: 480, protocol: "Invoice", chain: "Base", category: "services", risk: 14,
      thoughts: ["An invoice arrived by email: INV-2041, due in 3 days.", "480 USDC is above the approval threshold, so I will need a human to sign off.", "I will prepare everything and wait for approval before touching funds."],
      response: { invoice: "INV-2041", status: "paid", receipt_url: "https://acme-design.co/r/2041" } },
    { id: "subscription", icon: "refresh", title: "Renew subscription (AP2)", sub: "Cloudflare Workers · 5 USDC", agentId: "treasury",
      task: "Renew the Cloudflare Workers plan for another month.", domain: "cloudflare.com", path: "/billing/mandates/m_7731", merchant: "Cloudflare Workers",
      amount: 5, protocol: "AP2", chain: "Base", category: "subscription", risk: 4, mandateId: "m_7731", cap: 10,
      thoughts: ["Recurring payment — covered by a signed AP2 mandate from the owner.", "The mandate caps this merchant at 10 USDC per month.", "Amount matches; I can pay without interrupting anyone."],
      response: { plan: "workers-paid", renewed_until: "next month", invoice: "CF-99021" } },
    { id: "a2a", icon: "network", title: "Hire another agent (A2A)", sub: "TranslateBot · 3 USDC", agentId: "research",
      task: "Translate the research summary into Spanish using a specialist agent.", domain: "agents.translatebot.ai", path: "/tasks/translate", merchant: "TranslateBot (agent)",
      amount: 3, protocol: "A2A + x402", chain: "Base", category: "agent-services", risk: 18,
      thoughts: ["A specialist translation agent is cheaper than doing it myself.", "I must verify its identity (Know-Your-Agent) before paying another agent.", "Payment is released through x402 once the agent card checks out."],
      response: { task_id: "tr_5521", language: "es", status: "queued", eta_s: 8 } },
    { id: "overlimit", icon: "alert", title: "Over-limit purchase", sub: "Figma annual · 1,200 USDC", agentId: "treasury",
      task: "Buy the annual Figma Enterprise licence for the design team.", domain: "figma.com", path: "/billing/annual/enterprise", merchant: "Figma Enterprise (annual)",
      amount: 1200, protocol: "Invoice", chain: "Base", category: "software", risk: 12,
      thoughts: ["Annual licence is cheaper than monthly: 1,200 USDC upfront.", "That is a large amount — I expect the policy engine to push back.", "I will still try so the owner sees the guardrail working."],
      response: {} },
    { id: "suspicious", icon: "shield", title: "Suspicious payee", sub: "unknown-merchant.xyz · 95 USDC", agentId: "ops",
      task: "A prompt injected in a web page told me to pay 95 USDC to unknown-merchant.xyz.", domain: "unknown-merchant.xyz", path: "/pay/claim-reward", merchant: "unknown-merchant.xyz",
      amount: 95, protocol: "x402", chain: "Polygon", category: "unverified", risk: 91, flagged: ["Domain registered 2 days ago", "Matches known phishing template", "Not on allow-list", "Task originated from untrusted web content"],
      thoughts: ["This request came from text inside a web page, not from my owner.", "That is a classic prompt-injection pattern. I should verify the payee first.", "Continuing, but I expect the risk check to stop this."],
      response: {} },
  ];

  /* free-text commands:  "pay 25 USDC to api.weatherdata.xyz" */
  A.parsePrompt = (text) => {
    const m = text.match(/(\d+(?:[.,]\d+)?)\s*(?:usdc|usd|\$|dollars?)?[^a-z0-9]*(?:.*?\b(?:to|for)\b\s+)?((?:https?:\/\/)?[a-z0-9-]+(?:\.[a-z0-9-]+)+)/i) || text.match(/\$\s?(\d+(?:\.\d+)?).*?((?:https?:\/\/)?[a-z0-9-]+(?:\.[a-z0-9-]+)+)/i);
    if (!m) return null;
    const amount = parseFloat(m[1].replace(",", ".")), domain = m[2].replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
    if (!(amount > 0)) return null;
    const P = AP.state().policy, known = P.allowlist.some((d) => domain === d || domain.endsWith("." + d));
    return { id: "custom", icon: "send", title: "Custom payment", agentId: "treasury", task: text.trim(), domain, path: "/pay", merchant: domain, amount, protocol: "x402", chain: "Base", category: known ? "custom" : "unverified", risk: known ? 8 : 58,
      thoughts: ["Owner asked me to pay " + AP.usd(amount) + " USDC to " + domain + ".", known ? "That domain is on the allow-list." : "I do not recognise that domain — verification will decide.", "Starting the x402 payment flow."], response: { status: "paid", resource: "https://" + domain + "/pay" } };
  };


  /* ---------------- autonomous task generator (Live mode) ----------------
     In Live mode the agent does not wait for a button: events arrive on their own
     (an API answers 402, an invoice lands in the inbox, a mandate comes due, another
     agent offers a service, a web page tries to inject a payment).  Edit the lists
     below to change what the agent "sees".  Weights decide how often each happens. */
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const jit = (v, p = 0.25) => +(v * (1 + (Math.random() * 2 - 1) * p)).toFixed(v < 1 ? 2 : v < 20 ? 2 : 0);
  A.mandatesDefault = () => [
    { id: "m_7731", merchant: "Cloudflare Workers", domain: "cloudflare.com", cap: 10, amount: 5, active: true },
    { id: "m_8120", merchant: "OpenRouter credits", domain: "openrouter.ai", cap: 120, amount: 100, active: true },
    { id: "m_9004", merchant: "Figma Professional", domain: "figma.com", cap: 20, amount: 15, active: true },
  ];
  const DATA = [
    ["Dune Analytics API", "api.dune.com", "/api/v1/query/3412/results", 0.25, "Pull the top DEX pairs by 24h volume.", { rows: 3, credits_used: 1 }],
    ["Weather data API", "api.weatherdata.xyz", "/v2/forecast?city=SF", 0.05, "Fetch tomorrow's forecast for the logistics report.", { temp_c: 17, rain: "10%" }],
    ["CoinGecko Pro API", "api.coingecko.com", "/api/v3/simple/price", 0.1, "Get live ETH and SOL prices for the treasury note.", { eth: 3120.4, sol: 171.9 }],
    ["Perplexity search API", "api.perplexity.ai", "/search?q=stablecoin+regulation", 0.3, "Search recent news on stablecoin regulation.", { results: 8 }],
    ["Nansen smart-money feed", "api.nansen.ai", "/v1/smart-money/netflow", 1.5, "Check smart-money net flows before the weekly summary.", { wallets: 42, netflow_usd: "+3.1M" }],
    ["OpenRouter inference", "openrouter.ai", "/api/v1/chat/completions", 0.8, "Run a long-context summarisation through a hosted model.", { tokens: 18200, model: "llama-3.3-70b" }],
  ];
  const mk = (o) => Object.assign({ icon: "zap", title: o.merchant, sub: o.merchant, protocol: "x402", chain: "Base", risk: 9, response: {}, id: "gen" }, o);
  A.generate = (mission, mandates) => {
    const S = AP.state(), M = mandates && mandates.length ? mandates : A.mandatesDefault();
    const pool = [
      { w: 30, a: "research", f: () => { const d = pick(DATA), unl = !S.policy.allowlist.some((x) => d[1] === x || d[1].endsWith("." + x)); return mk({ agentId: "research", icon: "zap", merchant: d[0], domain: d[1], path: d[2], amount: jit(d[3], 0.15), category: "data", risk: unl ? 22 : 6, task: d[4], response: d[5], thoughts: ["I need fresh data: " + d[4].toLowerCase(), "It is a pay-per-call endpoint, so a micro-payment is cheaper than a subscription.", "I will request it and settle the HTTP 402 challenge myself."] }); } },
      { w: 12, a: "ops", f: () => { const h = pick([1, 2, 3, 4]); return mk({ agentId: "ops", icon: "cpu", merchant: "RunPod GPU compute", domain: "api.runpod.io", path: "/v2/pods/a100-80gb", amount: h * 6, category: "compute", risk: 9, task: `Rent one A100 for ${h}h to run the nightly batch job.`, response: { pod_id: "pod_" + AP.hex(6), hours: h, status: "provisioning" }, thoughts: ["The nightly batch needs GPU time.", `RunPod quotes 6 USDC/hour, so ${h * 6} USDC in total.`, "Paying per session means no card on file."] }); } },
      { w: 6, a: "ops", f: () => mk({ agentId: "ops", icon: "globe", merchant: "Vercel bandwidth top-up", domain: "api.vercel.com", path: "/v1/billing/topup", amount: jit(20, 0.3), category: "infrastructure", risk: 24, task: "Bandwidth is at 90% — top up before the limit hits.", thoughts: ["Traffic spiked; the site will throttle at 100%.", "Vercel is not on the allow-list, so verification will decide.", "A small top-up avoids downtime."] }) },
      { w: 8, a: "treasury", f: () => { const v = pick([["Linear annual seats", "linear.app", 120], ["Notion team plan", "notion.so", 96], ["Webflow hosting", "webflow.com", 84]]); return mk({ agentId: "treasury", icon: "receipt", merchant: v[0], domain: v[1], path: "/billing/invoice", amount: v[2], protocol: "Invoice", category: "services", risk: 20, task: `Invoice from ${v[0]} arrived in the finance inbox.`, thoughts: ["A new invoice was matched to an open purchase order.", "It is under the approval threshold, so I can pay it directly.", "I will pay and file the receipt for the accountant."] }); } },
      { w: 5, a: "treasury", f: () => mk({ agentId: "treasury", icon: "receipt", merchant: "Acme Design invoice #" + AP.rand(2042, 2099), domain: "acme-design.co", path: "/invoices/INV-" + AP.rand(2042, 2099), amount: pick([320, 350, 420, 480]), protocol: "Invoice", category: "services", risk: 14, task: "Pay the latest Acme Design retainer invoice.", thoughts: ["Invoice from a known vendor, due in 3 days.", "The amount is above your approval threshold — a human must sign off.", "I will prepare everything and wait without touching funds."] }) },
      { w: 8, a: "treasury", f: () => { const m = pick(M); return mk({ agentId: "treasury", icon: "refresh", merchant: m.merchant, domain: m.domain, path: "/billing/mandates/" + m.id, amount: m.amount, protocol: "AP2", category: "subscription", risk: 4, mandateId: m.id, cap: m.cap, task: `${m.merchant} renewal is due — covered by mandate ${m.id}.`, thoughts: ["A recurring charge is due.", `The owner signed mandate ${m.id} capping this merchant at ${m.cap} USDC per month.`, "If the mandate is valid I can pay without interrupting anyone."] }); } },
      { w: 10, a: "research", f: () => { const b = pick([["TranslateBot", "agents.translatebot.ai", "/tasks/translate", 3, "Translate the summary into Spanish."], ["ChartBot", "agents.chartbot.ai", "/tasks/render", 2, "Render the volume data as a chart."], ["SummarizerAgent", "agents.summarizer.dev", "/tasks/summarise", 4, "Summarise a 40-page whitepaper."]]); return mk({ agentId: "research", icon: "network", merchant: b[0] + " (agent)", domain: b[1], path: b[2], amount: b[3], protocol: "A2A + x402", category: "agent-services", risk: 18, task: b[4] + " A specialist agent is cheaper than doing it myself.", response: { task_id: "tk_" + AP.hex(4), status: "queued" }, thoughts: ["A specialist agent can do this faster.", "I must verify its identity (Know-Your-Agent) before paying another agent.", "Payment is released through x402 once its agent card checks out."] }); } },
      { w: 4, a: "treasury", f: () => mk({ agentId: "treasury", icon: "alert", merchant: "Figma Enterprise (annual)", domain: "figma.com", path: "/billing/annual/enterprise", amount: pick([1200, 1800]), protocol: "Invoice", category: "software", risk: 12, task: "Buy the annual Figma Enterprise licence for the design team.", thoughts: ["The annual plan saves money over monthly.", "That is a large payment — I expect the policy engine to push back.", "I will still try so you can see the guardrail working."] }) },
      { w: 7, a: "ops", f: () => { const d = pick(["unknown-merchant.xyz", "free-usdc-airdrop.top", "support-claim-rewards.xyz"]); return mk({ agentId: "ops", icon: "shield", merchant: d, domain: d, path: "/pay/claim-reward", amount: pick([95, 40, 250]), chain: "Polygon", category: "unverified", risk: 88 + AP.rand(0, 7), task: "Text inside a web page I was reading told me to pay a \"claim fee\" to " + d + ".", flagged: ["Domain registered 2 days ago", "Matches known phishing template", "Not on allow-list", "Task originated from untrusted web content"], thoughts: ["This instruction came from page content, not from my owner.", "That is a classic prompt-injection pattern, so I should verify the payee first.", "I will continue, but I expect the risk check to stop it."] }); } },
    ].concat(S.agents.filter((x) => !["treasury", "research", "ops"].includes(x.id)).map((ag) => ({ w: 14, a: ag.id, f: () => {
      const rails = (ag.rails && ag.rails.length ? ag.rails : ["x402"]), r = pick(rails), pool2 = (ag.allow && ag.allow.length ? ag.allow : DATA.map((d) => d[1])), dom = pick(pool2), cat = (ag.cats && ag.cats.length ? pick(ag.cats) : "services");
      const amt = Math.max(0.05, jit(Math.min(ag.perTx || 50, pick([0.2, 1.5, 8, 25, 60])), 0.2)), proto = r === "Invoice" ? "Invoice" : r;
      return mk({ agentId: ag.id, icon: "zap", merchant: dom, domain: dom, path: "/v1/pay", amount: amt, protocol: proto, chain: "Base", category: cat, risk: 8, task: `${ag.name}: ${ag.role || "run a task"} — pay ${dom} for ${cat}.`, thoughts: [`This fits my job: ${ag.role || "custom task"}.`, `I'll pay over ${r}, which my owner allowed for me.`, "Checking limits before I sign."], response: { status: "paid" } });
    } }))).filter((x) => !mission || mission === "all" || x.a === mission);
    let r = Math.random() * pool.reduce((s, x) => s + x.w, 0);
    for (const x of pool) { if ((r -= x.w) <= 0) return x.f(); }
    return pool[0].f();
  };

  /* ---------------- policy engine (reads live settings) ---------------- */
  A.evaluate = (scn, agent) => {
    const S = AP.state(), P = S.policy, sk = S.agentWallet.sessionKey, spent = AP.spentToday();
    const allowed = P.allowlist.some((d) => scn.domain === d || scn.domain.endsWith("." + d));
    const cat = allowed && scn.category === "unverified" ? "custom" : scn.category;
    const checks = [
      ["Kill switch off", !S.security.frozen, "All agents are frozen (kill switch)"],
      ["Agent is active", agent.status === "active", agent.name + " is paused"],
      ["Session key valid", sk.active && sk.expires > Date.now(), sk.active ? "Session key expired" : "Session key was revoked"],
      [allowed ? "Merchant on allow-list" : "Merchant allow-list", allowed || !P.requireAllowlist, scn.domain + " is not on the allow-list"],
      ["Category not blocked", !P.blocked.includes(cat), "Category “" + cat + "” is blocked by policy"],
      ["Within per-tx limit (" + AP.usd(Math.min(P.perTx, sk.perTx), 0) + ")", scn.amount <= Math.min(P.perTx, sk.perTx), AP.usd(scn.amount) + " exceeds the " + AP.usd(Math.min(P.perTx, sk.perTx), 0) + " per-transaction limit"],
      ["Within daily budget (" + AP.usd(Math.max(0, P.daily - spent), 0) + " left)", spent + scn.amount <= P.daily, "Daily budget of " + AP.usd(P.daily, 0) + " would be exceeded"],
      ["Sufficient agent balance", scn.amount <= S.agentWallet.balance, "Agent wallet balance is only " + AP.usd(S.agentWallet.balance)],
    ];
    const railOf = (pr) => (/x402/.test(pr) ? "x402" : /AP2/.test(pr) ? "AP2" : "Invoice");
    const rail = railOf(scn.protocol), ar = agent.rails || [];
    if (ar.length) checks.push(["Rail allowed for agent (" + rail + ")", ar.includes(rail), agent.name + " is not allowed to use " + rail]);
    if (agent.perTx) checks.push(["Within agent limit (" + AP.usd(agent.perTx, 0) + ")", scn.amount <= agent.perTx, AP.usd(scn.amount) + " exceeds " + agent.name + "'s " + AP.usd(agent.perTx, 0) + " limit"]);
    if (agent.allow && agent.allow.length) checks.push(["Merchant allowed for agent", agent.allow.some((d) => scn.domain === d || scn.domain.endsWith("." + d)), scn.domain + " is not on " + agent.name + "'s merchant list"]);
    if (agent.access === "propose") checks.push(["Agent may spend", true, ""]);
    const failed = checks.find((c) => !c[1]);
    const thr = agent.access === "propose" ? 0 : Math.min(P.approval, agent.approval == null ? Infinity : agent.approval);
    return { checks, failed: failed ? failed[2] : null, needsApproval: !failed && scn.amount > thr, threshold: thr };
  };

  /* ---------------- the live run ---------------- */
  // ui: { agent, wait(ms), log(html), think(text), stage(id,state,detail), approve(req)->Promise<{ok,reason}>, receipt(obj), done(status) }
  A.run = async (scn, ui) => {
    const S = AP.state(), agent = ui.agent, atomic = String(Math.round(scn.amount * 1e6)), payTo = "0x" + AP.hex(40), W = S.agentWallet;
    const nowT = () => new Date().toLocaleTimeString("en-GB");
    const fin = async (status, extra = {}) => { const row = AP.addActivity(Object.assign({ agent: agent.name, merchant: scn.merchant, amount: scn.amount, token: "USDC", chain: scn.chain, status, protocol: scn.protocol, tx: extra.tx || null }, {})); ui.done(status, row); return row; };

    /* 1 — intent */
    ui.stage("intent", "run", "Reading task and planning");
    ui.log(`<span class="k">▶ ${AP.esc(agent.name)}</span> <span class="t">task received</span>`); await ui.wait(500);
    ui.log(`<span class="b">task</span> “${AP.esc(scn.task)}”`); await ui.wait(500);
    for (const t of scn.thoughts) await ui.think(t);
    ui.stage("intent", "ok", "Plan: pay " + AP.usd(scn.amount) + " USDC to " + scn.domain);

    /* 2 — discover payment requirements */
    ui.stage("discover", "run", scn.protocol.includes("x402") ? "Requesting resource…" : "Fetching payment details…"); await ui.wait(600);
    if (scn.protocol.includes("x402")) {
      ui.log(`<span class="b">GET</span> https://${scn.domain}${scn.path}`); await ui.wait(700);
      ui.log(`<span class="r">← HTTP/1.1 402 Payment Required</span>`); await ui.wait(350);
      ui.log(`<span class="t">←</span> <span class="y">X-PAYMENT-REQUIRED</span> {"scheme":"exact","network":"${scn.chain.toLowerCase()}","asset":"USDC","maxAmountRequired":"${atomic}","payTo":"${AP.short(payTo)}"}`);
    } else if (scn.protocol === "AP2") {
      ui.log(`<span class="b">fetch</span> AP2 cart mandate ${scn.mandateId || "m_7731"} from ${scn.domain}`); await ui.wait(600);
      ui.log(`<span class="t">←</span> mandate {"merchant":"${scn.domain}","cap":"${(scn.cap || 10).toFixed(2)} USDC/month","signed_by":"owner","valid":true}`);
    } else {
      ui.log(`<span class="b">parse</span> ${AP.esc(scn.merchant)} — amount <span class="y">${AP.usd(scn.amount)} USDC</span>, due in 3 days`); await ui.wait(500);
      ui.log(`<span class="t">←</span> payee ${AP.short(payTo)} on ${scn.chain}`);
    }
    await ui.wait(600); ui.stage("discover", "ok", AP.usd(scn.amount) + " USDC on " + scn.chain + " · " + scn.protocol);

    /* 3 — verify payee (KYA / risk) */
    ui.stage("verify", "run", scn.protocol.includes("A2A") ? "Know-Your-Agent handshake…" : "Scoring payee risk…"); await ui.wait(700);
    if (scn.protocol.includes("A2A")) { ui.log(`<span class="b">GET</span> https://${scn.domain}/.well-known/agent.json`); await ui.wait(500); ui.log(`<span class="g">✔</span> agent card valid · KYA credential issued by verified registrar`); await ui.wait(400); }
    const allowed = S.policy.allowlist.some((d) => scn.domain === d || scn.domain.endsWith("." + d)), risk = scn.risk;
    ui.log(`<span class="t">risk score</span> <span class="${risk >= 70 ? "r" : risk >= 40 ? "y" : "g"}">${risk}/100</span> · allow-list: ${allowed ? '<span class="g">yes</span>' : '<span class="y">no</span>'}`);
    if (scn.flagged) for (const f of scn.flagged) { await ui.wait(380); ui.log(`<span class="r">⚠</span> ${AP.esc(f)}`); }
    await ui.wait(500);
    if (risk >= 70) { ui.stage("verify", "bad", "Payee flagged as high risk (" + risk + "/100)"); ui.log(`<span class="r">✖ BLOCKED</span> payee failed verification — no funds moved`); ["policy", "approval", "sign", "settle", "receipt"].forEach((s) => ui.stage(s, "skip", "Skipped")); await fin("blocked"); return; }
    ui.stage("verify", "ok", allowed ? "Verified · on allow-list" : "Unlisted payee · risk " + risk + "/100");

    /* 4 — policy check */
    ui.stage("policy", "run", "Evaluating spending policy…"); await ui.wait(600);
    const ev = A.evaluate(scn, agent);
    for (const [label, pass] of ev.checks) { ui.log(`${pass ? '<span class="g">✔</span>' : '<span class="r">✖</span>'} ${AP.esc(label)}`); await ui.wait(260); }
    if (ev.failed) {
      ui.stage("policy", "bad", ev.failed); ui.log(`<span class="r">✖ BLOCKED</span> ${AP.esc(ev.failed)}`);
      ui.log(`<span class="t">agent</span> I will notify the owner instead of retrying or splitting the payment.`);
      ["approval", "sign", "settle", "receipt"].forEach((s) => ui.stage(s, "skip", "Skipped")); await fin("blocked"); return;
    }
    ui.stage("policy", "ok", "All " + ev.checks.length + " checks passed");

    /* 5 — human approval */
    if (ev.needsApproval) {
      ui.stage("approval", "warn", "Waiting for you — above " + AP.usd(ev.threshold, 0)); ui.log(`<span class="y">⏸ PAUSED</span> ${AP.usd(scn.amount)} exceeds your ${AP.usd(ev.threshold, 0)} approval threshold`); ui.log(`<span class="t">notify</span> push + email sent to owner`);
      const res = await ui.approve({ merchant: scn.merchant, amount: scn.amount, threshold: ev.threshold, chain: scn.chain });
      if (!res.ok) { ui.stage("approval", "bad", "Rejected by owner"); ui.log(`<span class="r">✖ REJECTED</span> owner declined the payment`); ["sign", "settle", "receipt"].forEach((s) => ui.stage(s, "skip", "Skipped")); await fin("rejected"); return; }
      ui.log(`<span class="g">✔ APPROVED</span> by owner${S.security.pin ? " (PIN verified)" : ""}`); ui.stage("approval", "ok", "Approved by owner");
    } else ui.stage("approval", "skip", "Not required (under " + AP.usd(ev.threshold, 0) + ")");

    /* 6 — sign with session key */
    ui.stage("sign", "run", "Signing with scoped session key…"); await ui.wait(700);
    ui.log(`<span class="k">sign</span> EIP-3009 transferWithAuthorization`);
    ui.log(`<span class="t">  from</span>  ${AP.short(W.address)} <span class="t">(agent smart account)</span>`); await ui.wait(250);
    ui.log(`<span class="t">  to</span>    ${AP.short(payTo)}`); await ui.wait(250);
    ui.log(`<span class="t">  value</span> ${atomic} <span class="t">(${scn.amount} USDC)</span>`); await ui.wait(250);
    ui.log(`<span class="t">  key</span>   ${W.sessionKey.id} <span class="t">scope: USDC ≤ ${AP.usd(W.sessionKey.perTx, 0)}</span>`); await ui.wait(500);
    ui.log(`<span class="g">✔</span> signature 0x${AP.hex(12)}…${AP.hex(6)}`); ui.stage("sign", "ok", "Signed · key " + W.sessionKey.id);

    /* 7 — settle on-chain */
    ui.stage("settle", "run", "Broadcasting to " + scn.chain + "…"); await ui.wait(600);
    const tx = "0x" + AP.hex(64), block = 24100000 + AP.rand(1000, 99999), fee = (Math.random() * 0.002 + 0.0005).toFixed(4);
    ui.log(`<span class="b">broadcast</span> via facilitator · gas sponsored`); await ui.wait(600);
    ui.log(`<span class="t">tx</span> <span class="y">${AP.short(tx)}</span> <span class="t">pending…</span>`);
    for (let c = 1; c <= 3; c++) { await ui.wait(650); ui.log(`<span class="g">⛓</span> block #${block + c - 1} · confirmations ${c}/3`); ui.stage("settle", "run", "Confirmations " + c + "/3"); ui.progress(c / 3); }
    ui.stage("settle", "ok", "Finalised in block #" + block);

    /* 8 — receipt + audit */
    ui.stage("receipt", "run", "Retrieving resource & writing audit log…"); await ui.wait(500);
    if (scn.protocol.includes("x402")) { ui.log(`<span class="b">GET</span> https://${scn.domain}${scn.path} <span class="t">+ X-PAYMENT</span>`); await ui.wait(600); ui.log(`<span class="g">← HTTP/1.1 200 OK</span>`); }
    if (Object.keys(scn.response).length) ui.log(`<span class="t">←</span> ${AP.esc(JSON.stringify(scn.response))}`);
    await ui.wait(400);
    const row = await fin("settled", { tx });
    ui.log(`<span class="g">✔ DONE</span> ${AP.usd(scn.amount)} USDC paid · remaining balance ${AP.usd(AP.state().agentWallet.balance)}`);
    ui.stage("receipt", "ok", "Audit entry " + row.id.slice(-6));
    ui.receipt({ Status: "Settled", Merchant: scn.merchant, Amount: AP.usd(scn.amount) + " USDC", "Network fee": "$" + fee + " (sponsored)", Protocol: scn.protocol, Chain: scn.chain, Agent: agent.name, "Tx hash": AP.short(tx), Time: nowT() }, tx);
  };

  window.AgentScript = A;
})();
