# Agentic crypto payments — market research (Oct 2026)

Sources: public articles and vendor docs found during research (Coinbase/x402 coverage, Stablecoin Insider, Eco, Crossmint, Skyfire, Nevermined, Cointelegraph, BlockEden). Figures are as reported by those sources and vary between them.

## What the market looks like
- **Agentic payment** = a payment initiated, authorised and settled by an AI agent, usually in stablecoins, with human-set limits.
- **x402** (Coinbase / Cloudflare) revives HTTP 402 "Payment Required": the agent requests a resource, receives price + pay-to address, signs a USDC payment and retries. Reported: ~165M transactions, ~69k active agents by April 2026; backed by a coalition including Google, OpenAI and Circle.
- **Google AP2** (signed payment mandates) is the mandate layer AgentPay uses. Card-network products (Visa Intelligent Commerce, Mastercard Agent Pay) exist but are out of scope: AgentPay is crypto-only.
- **Skyfire** — Know-Your-Agent (KYA) identity + USDC ledger, spending limits, human ping on overspend.
- **Crossmint** — agent wallets + virtual cards, merchant allow-lists, limits, human-approval thresholds.
- **Coinbase Agentic Wallets / AgentKit** (Feb 2026) — wallets built for agents, session keys, action allow-lists.
- **MoonPay Agents**, **Anchorage "agentic banking"**, **AWS + Coinbase USDC rails**, **World AgentKit** — newer entrants.
- Forecast cited by Stablecoin Insider: agentic commerce above $1.5T by 2030 (a projection, not a fact).

## Fundamentals every product converges on (and what this demo implements)
| Fundamental | Where in the demo |
|---|---|
| Agent wallet / smart account | Wallets → Agent wallet |
| Scoped, revocable session keys | Wallets → Issue / Revoke key |
| Spending limits (per-tx, daily) | Security → Spending policy |
| Merchant allow-list + blocked categories | Security → Spending policy |
| Human-in-the-loop approval threshold | Agent Console → Approval inbox (non-blocking) |
| Always-on autonomous agent loop, session budget | Agent Console → Go live |
| Payee / agent verification (KYA, risk score) | Agent Console → verify step |
| HTTP 402 / x402 stablecoin settlement | Agent Console → x402 scenarios |
| Mandates / subscriptions (AP2-style), revocable | Agent Console → Mandates |
| Agent-to-agent payments | Agent Console → A2A scenario |
| Audit trail + receipts, CSV export | Activity page, Console lanes, Security log |
| Kill switch, 2FA, passkey, PIN | Security |
| Non-custodial wallet connection | Wallets / Onboarding |

## Gaps the product can own
Unified policy across all crypto rails (x402, AP2, invoices, agent-to-agent); clear approval UX; prompt-injection defence (the "suspicious payee" scenario); one audit log across all agents.
