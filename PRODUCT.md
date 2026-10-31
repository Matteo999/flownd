# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

The record is shared at the repo root. The primary client is the React Native + Expo app in `apps/mobile` (iOS and Android), which adapts to each OS: iOS conventions on iPhone, Material conventions on Android. `apps/web` (React + Vite) is a separate client of the same product. It is a `web` surface and can override this record with its own PRODUCT.md once its scope grows past the public "coming soon" page.

## Users

People aged 25–45 in Italy, with one or two incomes, who want to manage spending, budget and savings without spreadsheets. Some connect their bank; others prefer manual entry. Many open the app already worried about money. Couples and households who share expenses are a secondary audience, served through groups.

The job: in about 30 seconds a day, understand where the money went this month, whether the plan still holds, and what to do next.

## Product Purpose

Flownd is a multi-platform money coach for personal finance, and through groups for household finance. It turns accounts, transactions, budgets and goals into a clear picture of how money flows, and offers concrete, non-judgmental suggestions.

It rests on four pillars:

1. **Monthly plan**: available income split across Necessità, Desideri and Risparmio (a customizable 50/30/20), with sub-budgets and a personal financial cycle.
2. **Movimenti**: a timeline of manual and bank income and expenses, with categorization, search, filters and persistent corrections.
3. **Patrimonio and Open Banking**: aggregated accounts, balances, wealth history and resilient automatic import.
4. **Goals and Coach**: virtual savings set-asides (waterfall or percentage allocation) and an AI conversation grounded in the user's own data.

Success targets come from `prompt/flownd-project-v2.md` §13: DAU/MAU above 30%, D30 retention above 40%, onboarding completion above 70%, a first transaction or linked account within 24 hours, and a first goal within the first week.

## Positioning

A calm money coach, not a tracker. Bank apps show movements without interpreting them, and spreadsheets are tedious. Flownd turns raw movements into an understandable monthly plan, and its AI Coach proposes changes as editable confirmation cards, never saving anything silently. The tone is reassuring and competent, never guilt-inducing.

## Operating Context

- Daily check-ins of about 30 seconds on a phone. Manual entry is built to take under 5 seconds.
- Today movements come from manual entry and file import. Bank data through PSD2 Open Banking (Enable Banking) is planned for after the provider agreement: it will sync automatically on app open when stale, through a daily cron, or by manual refresh with a cooldown, building history in Supabase over time.
- The Coach is an Italian-language chat with server-side tool use (spending summary, add transaction, create or update goal, update budget). Every mutation goes through a confirmation card.
- Groups (household or flatmates) share modules, expenses and member balances. Invites go out by email.
- The UI is Italian only.

## Capabilities and Constraints

- **Tiers:** Free, Pro and Max (`profiles.plan_tier`). Reference prices of €4.99 and €9.99 per month are not yet validated. Payments, the paywall and exact plan limits are still open decisions.
- **Implemented:** auth, financial onboarding, dashboard, budget and cycle, timeline, keyword and personal-rule categorization, goals, financing, wealth, Money Coach (with history and limits), groups with a dashboard and balances, and AI transaction file import (PDF, CSV, XLSX, images) queued as background jobs; the temporary file content is deleted after processing.
- **Open Banking (not yet available to users):** the Enable Banking integration exists in code with plan gating, but it is not live because the commercial agreement with the provider is not signed yet; the provider asks for real usage data first. Until then, public copy presents bank connection only as "in arrivo" and never as a current feature.
- **Planned or partial:** voice and screenshot input, PDF reports, recurring-payment detection, native push notifications, contextual ads for Free, and web parity.
- **Ads (when built):** Free plan only, contextual and non-personalized by default, never in the transaction list and never next to balances, IBAN or bank data.
- **Data:** Supabase/PostgreSQL is the single source of truth. Local storage holds preferences only, such as the global amount-visibility toggle. AI and bank keys stay server-side.
- **Terminology:** Necessità / Desideri / Risparmio, Movimenti, Patrimonio, Obiettivi, Money Coach, Gruppi, Finanziamenti.
- **Open decisions** (v2 §14): mobile payment model, plan limits, primary AI provider, bank payload retention, second Open Banking provider, public launch date, offline strategy, officially supported banks, and the Coach's legal scope and disclaimer.

## Brand Commitments

- The name is Flownd. Logo assets are in `assets/` (`Flownd.png`, `F.png` and variants) and `assets/Flownd logo CDesign`.
- The voice is reassuring and professional, like an advisor who knows their stuff but doesn't intimidate. It never blames or alarms.
- Empty states speak in the product's voice and suggest the next step.

## Evidence on Hand

- Product briefs: `prompt/flownd-project-v2.md` (current), `prompt/flownd-project.md` (historical), `prompt/SCREENS-LOGICv2.md`, and `prompt/DESIGNv2.md` (visual spec, not product truth).
- There are no real customers, testimonials, press, store ratings or validated metrics yet, and pricing is unconfirmed. Future work must not invent any of these.
- The list of supported banks is not officially declared. Never claim coverage beyond what is verified.

## Product Principles

1. **Calm before alarm.** Communicate clearly, without blame. Money is already a source of anxiety.
2. **Smart defaults.** Show the minimum that is useful and reveal advanced options progressively.
3. **One primary action per context.** Avoid overloaded dashboards and screens.
4. **AI with human confirmation.** The Coach proposes and the user confirms before anything is saved.
5. **Honest data.** Estimates, manual entries and bank data must always be distinguishable. Privacy by design throughout, including global amount masking.

## Accessibility & Inclusion

Amounts can be hidden globally for privacy in public settings. No formal accessibility standard has been set yet (open).
