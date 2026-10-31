(function () {
  if (!AP.shell()) return;
  const S = AP.state(), $ = AP.$, esc = AP.esc;
  const FAQ = [
    ["How do I give an agent money?", "Open Wallets → Wallets, connect your wallet and use Fund agent wallet. The demo wallet also works without connecting."],
    ["How do I create an agent and control where it pays?", "Console → Agent crew → Create agent. Pick its access level, per-payment limit, rails (x402, AP2, Invoice) and the merchants it may pay."],
    ["Why was a payment blocked?", "The policy engine stops any payment that breaks a rule: kill switch, paused agent, session key, allow-list, blocked category, limits or balance. The Console's live stream shows which check failed."],
    ["How do approvals work?", "Payments above your approval threshold wait in the Console's Approvals tab. Reject or approve (with your PIN if set). They auto-reject after 2 minutes."],
    ["Which payment rails can agents use?", "x402 (pay-per-call HTTP 402), AP2 signed mandates for recurring charges, and invoices — all settled in USDC from the agent wallet. AgentPay is crypto-only."],
    ["How do I get alerts in my email or phone?", "Settings → Email & push alerts. Choose which events notify you, such as approvals or blocked payments."],
    ["What are webhooks for?", "Settings → Webhooks sends signed JSON events (payment.settled, approval.requested…) to your server so you can automate."],
    ["How do I invite teammates?", "Settings → Team & roles. Roles: Admin, Approver, Finance, Viewer. Seat limits depend on your plan."],
    ["How do I stop everything immediately?", "Use the kill switch in the Console header or Security → Overview. All agents freeze and running payments are cancelled."],
    ["How do I upgrade my plan?", "Profile menu → Subscription → Upgrade plan. Compare plans and confirm."],
  ];
  const TOPICS = [["wallet", "Wallets & funding", "Connect, fund and rotate keys"], ["bot", "Agents & access", "Create agents, set limits"], ["zap", "Payment rails", "x402, AP2 mandates, invoices"], ["webhook", "Webhooks & alerts", "Events, signing, email, push"]];
  $("#topics").innerHTML = TOPICS.map(([i, t, d]) => `<a href="#" class="c3 topic" data-q="${t.split(" ")[0].toLowerCase()}"><div class="si">${AP.icon(i, 20)}</div><div><b>${t}</b><span>${d}</span></div></a>`).join("");
  function faq() { const q = $("#faqQ").value.trim().toLowerCase(), r = FAQ.filter(([a, b]) => !q || (a + b).toLowerCase().includes(q)); $("#faq").innerHTML = r.length ? r.map(([a, b]) => `<details><summary>${a}</summary><p>${b}</p></details>`).join("") : `<div class="muted py-4 text-center">No matches. Ask the assistant or open a ticket.</div>`; $("#faqCount").textContent = r.length + " articles"; }
  $("#faqQ").oninput = faq; AP.$$("[data-q]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); $("#faqQ").value = a.dataset.q; faq(); $("#faq").scrollIntoView({ behavior: "smooth", block: "center" }); }));
  const SLA = { starter: ["48 hours", "Email"], pro: ["24 hours", "Email + chat"], business: ["4 hours", "Priority + chat"], enterprise: ["1 hour", "Dedicated manager"] }, pl = AP.plan(), sl = SLA[pl.id];
  $("#sla").innerHTML = `<div class="kv mb-3"><div><small>Plan</small><b>${pl.name}</b></div><div><small>First reply</small><b>${sl[0]}</b></div></div><div class="sec-row"><div class="si">${AP.icon("mail", 20)}</div><div class="tx"><b>${sl[1]}</b><span>Included with your plan</span></div></div><div class="d-flex align-items-center gap-2 mt-3"><span class="chip ok">All systems operational</span></div>${pl.id === "starter" ? '<a href="subscription.html#plans" class="btn btn-lav push align-self-start mt-3">Upgrade for faster replies</a>' : ""}`;
  function tickets() { const t = S.tickets; $("#tkCount").textContent = t.length + " total"; $("#tickets").innerHTML = t.length ? t.map((x) => `<div class="t-row" style="grid-template-columns:.8fr 2.2fr 1fr 1fr 1fr"><b class="small">${x.id}</b><div class="nm"><b>${esc(x.sub)}</b><span>${AP.ago(x.ts)}</span></div><span class="small fw-bold">${x.cat}</span><span class="small">${x.pri}</span><div><span class="chip ${x.status === "Open" ? "warn" : x.status === "Replied" ? "ok" : "brand"}">${x.status}</span></div></div>`).join("") : '<div class="muted text-center py-4">No tickets yet.</div>'; }
  $("#tkForm").onsubmit = (e) => { e.preventDefault(); const s = $("#tkSub"), m = $("#tkMsg");
    const t = { id: "TCK-" + AP.rand(1100, 1999), sub: s.value.trim() || "Support request", cat: $("#tkCat").value, pri: $("#tkPri").value, status: "Open", ts: Date.now() }; S.tickets.unshift(t); AP.save(); s.value = m.value = ""; AP.toast(`Ticket ${t.id} sent · reply within ${sl[0]}`, "ok"); tickets();
    setTimeout(() => { t.status = "Replied"; AP.save(); AP.toast(t.id + ": support replied (demo)", "ok"); tickets(); }, 6000); };
  faq(); tickets(); AP.renderIcons();
  if (location.hash === "#contact") setTimeout(() => $("#contact").scrollIntoView({ behavior: "smooth" }), 200);
})();
