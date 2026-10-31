# AgentPay — Agentic Crypto Payments (demo)

Static HTML / CSS / JS + Bootstrap 5. No build step, no server, no internet needed (Bootstrap and Inter are bundled).

## Run
Open `index.html` (or `login.html`) in Chrome. Optional: `python3 -m http.server` and visit http://localhost:8000.
Demo login: click **Use demo account** (demo@agentpay.io / Agent@123) or create an account on **Sign up**.

## Demo flow (≈3 min)
1. **Sign up** → **Onboarding** (use case, agent, spending policy, wallet, security PIN).
2. **Home** — balances, agents, recent payments, daily budget.
3. **Wallets** — connect a wallet (sign-in message flow), switch network, issue / revoke the agent session key.
4. **Security** — 2FA (any 6 digits), passkey, PIN, spending policy, allow-list, kill switch.
5. **Agent Console** — press **Go live**. The agent now runs on its own until you pause it:
   - It finds work by itself (x402 API calls, invoices, AP2 mandate renewals, agent-to-agent jobs, prompt-injection attempts) and runs up to 3 payments at once, each as a live lane with an 8-step progress rail.
   - Every payment goes through verify → your policy → approval → sign → settle → receipt. The result follows your Security settings.
   - Payments above your approval threshold wait in the **Approval inbox** (PIN if set, auto-reject after 2 min) while the agent keeps working.
   - **Mission** limits which agent works; **Session budget** makes the agent stop itself; **Kill switch** freezes everything and cancels running payments.
   - **Mandates (AP2)**: revoke one and the agent's next renewal for that merchant is blocked.
   - You can still trigger a single task or type a command (`Pay 25 USDC to api.weatherdata.xyz`).
   - Dashboard → **Launch live agent** opens the console already live (`agent.html#live`).
6. **Activity** — full audit trail with filters and CSV export.

Note: this is a browser demo, so the agent loop runs while the tab is open. A real product runs the loop on a server.

## What's new in v3
- **Custom limits everywhere**: every spending limit (per-transaction, daily budget, approval threshold, agent budgets, session budget, session key limit, default approval threshold) is a slider first. **Custom amount** swaps the slider for an input in the same spot; there you can **Apply**, **Cancel** (keep what you had) or **Use default** (back to the default limit and the slider). Shared control: `AP.limitHTML` in `js/app.js`.
- **Go live needs a wallet**: pressing **Go live** with no wallet opens the wallet popup (`AP.connectWallet`). After connecting, the agent goes live. Disconnecting a wallet stops a running agent.

## What's new in v2
- **Agent Console tabs**: Live activity · Agent crew · Approvals · Policy & mandates · Payments · Agent settings (last tab). The "Autonomous agent" hero and KPI strip stay above the tabs.
- **Create agent** (Dashboard, Crew tab, chatbot): name, colour, access level (propose / spend / spend + subscribe), budgets, rails (x402, AP2, Invoice), categories and a per-agent merchant allow-list. New agents join the live loop and obey their own limits.
- **Settings** (sidebar): General, Email & push alerts, Webhooks (delivery log, test events), Team & roles (invites, permission matrix, plan seat limits).
- **Subscription** (profile menu): current plan, usage, invoices, **Upgrade plan** reveals plans; limits on agents and seats are enforced.
- **Support** page with search, FAQ, tickets (reply SLA depends on plan).
- **Helper bot**: rule-based, runs locally (no API calls, no cost). Answers questions and runs actions like "pause research", "balance", "create agent".
- **Tabbed Security and Wallets**, symmetric bento grids (cards in a row share one height; spare height is filled with details), refreshed design system.

## Files
```
index.html login.html signup.html onboarding.html
dashboard.html wallets.html security.html agent.html activity.html settings.html subscription.html support.html
css/style.css                 design system (MoonPay shell + IQMS auth layout)
js/app.js                     state, theme, toast, app shell, support chat
js/icons.js                   inline SVG icon set (generated from assets/icons)
js/auth.js onboarding.js dashboard.js wallets.js security.js agent.js settings.js subscription.js support.js
js/agent-script.js            ★ the agent payment script (scenarios + policy engine + live run)
assets/img/                   logo.png, favicon.png, login-hero.png, signup-hero.png
assets/icons/                 SVG icons + wallet/network logos
assets/fonts/ assets/vendor/  Inter, Bootstrap 5.3.3
docs/market-research.md
```
Data is stored in the browser (localStorage). **Profile menu → Reset demo data** restores the start state.
Everything is simulated: no real wallet, chain or funds.

## Editing the agent script
`js/agent-script.js` → `A.generate` (and its lists) decides what the agent finds on its own in Live mode; `A.mandatesDefault` holds the AP2 mandates. `A.scenarios` holds each manual task (merchant, amount, protocol, narration). Add an object to add a scenario; `A.evaluate` is the policy engine; `A.run` is the step-by-step live sequence.
