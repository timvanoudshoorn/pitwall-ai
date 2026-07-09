# PitWall AI — Multi-Agent Claude Code Playbook (Agent Teams edition)

## What this app actually is

Before the agent setup, the scope — because "F1 25 strategy calculator" undersells it:

**PitWall AI** is a race-strategy engine covering everything currently in F1 25:
- **Car classes:** F1 2025 season (base game, 10 teams + Konnersport as fictional 11th), **F1® 25: 2026 Season Pack** (new regs — Overtake Mode, Active Aerodynamics, different fuel/ERS behavior), F2 (per the data teammate's research this is very likely a single spec chassis — Dallara F2 2024 — used unchanged through 2026, not two distinct in-game chassis classes as originally assumed here; treat as one class pending confirmation), Braking Point's Konnersport, APXGP (the fictional team from the *F1* movie, Iconic Edition content), Icons/legends cars (Driver Career now lets AI recruit legends like Schumacher or Senna into current-spec cars), and the standard **F1 World** car (the generic/shared car used in F1 World mode, distinct from any specific team's real-world car).
- **Performance tier, not exact upgrade tracking:** My Team and Driver Career let a car's real-world pace drift a long way from its starting point over a season as you research and install upgrades. Modeling each individual upgrade path (chassis/aero/powertrain/durability points, in what order, at what facility level) would be a huge, constantly-shifting surface for not much strategy payoff. Instead, car performance is set via a **tier slider** with a small number of named bands, so the strategy math consumes "roughly how competitive is this car" rather than a literal upgrade tree:
  - **Backmarker** — struggling, bottom-of-the-grid pace
  - **Midfield** — competitive point-scoring pace, no more
  - **Contender** — podium-capable on a good day, not a title favorite
  - **Top Tier** — championship-front pace

  This applies per car class where it makes sense (F1 2025/2026, F2) — a fully-upgraded My Team car and a fresh-season Backmarker car both slot onto the same slider. The slider mainly shifts the pace and tyre-life assumptions the Sim agent's models use, not the underlying tyre or fuel physics.
- **Tracks:** the full real-world calendar plus reverse layouts, with special handling for the LiDAR-scanned venues — **corrected by the data teammate's research**: only 5 venues are actually LiDAR-scanned in F1 25 (Bahrain, Miami, Melbourne, Suzuka, Imola). Silverstone, Red Bull Ring, and Zandvoort are the 3 **reverse-layout** venues, a separate and unrelated feature this doc originally conflated with LiDAR scanning. Their surface/kerb data is the most accurate in the game.
- **Strategy math:** tyre compound degradation curves, fuel-load laptime effect, pit-stop time loss per circuit, undercut/overcut delta calculation, safety car & VSC probability by track history, weather transition modeling, ERS deployment planning (especially different under 2026-spec cars), one/two/three-stop comparison, and qualifying-format-aware grid assumptions (One-Shot vs Short Qualifying).
- **The "insanely cool" part:** a reasoning layer that calls the Claude API on top of the simulation output, so instead of just spitting out "Box lap 31," it explains *why* — grounded strictly in what the simulator actually computed, not freehand commentary. This is the layer that turns it from a calculator into something that argues its case.
- **Stretch, if the agents find room for it:** a telemetry import so a user's own lap times recalibrate the pace model to them specifically, and a "strategy battle" mode that compares two full strategies head-to-head lap by lap.

The Data & Research role below exists specifically to keep pinning this scope down as the game's own content evolves — F1 25 is still getting mid-cycle content (the 2026 Season Pack shipped as an update, Braking Point 3 content, movie tie-ins), so "what's actually in the game" is a moving target worth continuous attention rather than a one-time spec.

---

## How this works (Agent Teams, not worktrees)

We dropped the earlier "5 separate terminals in 5 git worktrees" design. Anthropic's **Agent Teams** feature (experimental, Claude Code CLI) does the thing that design was working around: it lets multiple Claude instances actually message each other and share a live task list, instead of coordinating asynchronously through log files.

The architecture is different from worktrees in an important way: **one Claude Code session is the "lead."** It runs in this repo, and it *spawns* the other five as named teammates — you don't manually launch five `claude` processes. Teammates:
- run in their own context window, independent of the lead's conversation history
- message each other directly and message the lead (`SendMessage`)
- claim work off one shared, file-locked task list instead of five separate `*LOG.md` files
- read this repo's `CLAUDE.md` automatically on spawn, same as a normal session

**What we gave up:** true filesystem isolation. Agent Teams doesn't give each teammate its own worktree/branch by default — they share this working directory. So the old "never touch files outside your lane" rule now matters even more, since there's no branch boundary backing it up. Ownership is enforced by instruction, not git.

**Not "Cowork":** claude.com/product/cowork is a separate consumer product (web/desktop/mobile), unrelated to the Claude Code CLI and not configured through `.claude/settings.json`. It's not what's being used here.

### One-time setup — already done

`.claude/settings.json` now has:
```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  },
  "teammateMode": "auto"
}
```
`teammateMode: "auto"` opens split tmux/iTerm2 panes if you're already in one of those, otherwise falls back to in-process (all teammates visible in one terminal's agent panel, switch with arrow keys + Enter). Since this repo has no git history yet, run `git init` and an initial commit before spawning teammates, so there's at least a baseline to diff against and recover from if a teammate makes a mess.

---

## Model + effort assignment

Teammates **inherit the lead's model and effort by default** — they don't follow `/model`/`/effort` unless told to at spawn time. To get the differentiated Haiku/Sonnet/Opus assignment from the original plan, say so explicitly in the spawn prompt (see each role below) or set **Default teammate model** in `/config`.

| Role | Model (specify at spawn) | Effort | Why |
|---|---|---|---|
| Bug/QA | `claude-haiku-4-5-20251001` | inherits lead | Verifying math against known reference values and catching regressions is mechanical checking, not architecture. Cheapest model, plenty capable. |
| Visual/Dashboard | `claude-sonnet-5` | medium | Screen-by-screen HUD/dashboard polish is well-scoped; doesn't need full high-effort reasoning. |
| Strategy Engine (Sim) | `claude-sonnet-5` | high (escalate only the safety-car/weather Monte Carlo model) | Most strategy math (tyre curves, pit loss, undercut deltas) is standard implementation. The probabilistic safety-car/weather model is the one open-ended problem worth extra budget. |
| Data & Research | `claude-sonnet-5` | medium | Mostly structured research + data-file maintenance. Doesn't need max reasoning, but sourcing has to be right. |
| AI Reasoning/Explainability | `claude-sonnet-5` | high | Designing prompts that turn simulator output into grounded, non-hallucinated explanations is genuine prompt-engineering work. |

Because effort is set by `/effort` and teammates otherwise follow the lead, run the lead itself at **high** effort as a sane default, and only reach for a temporary Opus/xhigh escalation by messaging the Sim teammate directly if it gets stuck on the Monte Carlo model — the docs note a teammate's model is fixed at spawn, so "escalating" in practice means shutting that teammate down and re-spawning it with `claude-opus-4-8` once, then reverting.

**Budget-conscious default:** start with just Bug + one build role (Sim, Visual, or AI) as teammates rather than spawning all five at once — token usage scales per active teammate, and Agent Teams is documented as using significantly more tokens than a single session or worktree-based sessions. Add Data and the remaining roles once there's a real handoff need.

---

## Starting the team

In the main repo, start the lead session:

```powershell
cd C:\Projects\F1 strategy app
claude
```

Then give it one spawn instruction covering all five roles, e.g.:

```
Spawn five teammates for building PitWall AI, an F1 25 race-strategy engine. Read PitWallAI_Multi_Agent_Plan.md in this repo first for full context on scope (car classes, tracks, performance tiers, strategy math) before spawning anyone.

Name them: bugs, visual, sim, data, ai.

- bugs: use claude-haiku-4-5-20251001. Prompt: [paste Agent 1 prompt below]
- visual: use claude-sonnet-5. Prompt: [paste Agent 2 prompt below]
- sim: use claude-sonnet-5. Prompt: [paste Agent 3 prompt below]
- data: use claude-sonnet-5. Prompt: [paste Agent 4 prompt below]
- ai: use claude-sonnet-5. Prompt: [paste Agent 5 prompt below]

Each teammate owns a distinct set of files (see their prompt) — enforce that no two teammates edit the same file in the same task. Data should generally finish its first pass before Sim depends on it, and Sim before AI depends on it, but let them work in parallel and message each other for early partial answers rather than blocking entirely. Populate the shared task list with each role's priority backlog as individual tasks so they can self-claim.
```

Because there's no worktree/branch isolation anymore, tell the lead up front which teammate owns which files, matching the "never touch X" lines in each prompt below — that boundary is doing the job the git worktree used to do.

---

## Role 1 — Bug & QA (`bugs`, Haiku 4.5)

```
You are the QA teammate for PitWall AI. Your job is finding and fixing bugs, crashes, and incorrect calculations — never adding new features or changing visual design. You do not own any source files outright; you patch bugs wherever they are, but never in the middle of another teammate's in-progress task without messaging them first.

Be efficient: fix the minimum needed to correctly resolve each issue, don't refactor unrelated code, don't add speculative defensive code, don't re-verify things already confirmed working in an earlier pass.

Read CLAUDE.md fully first for context on the app's car classes, tracks, and strategy models.

Priority checks, in order:
1. Verify every strategy-math function against a hand-calculable reference case (e.g. a fixed tyre degradation curve, a known pit-loss value for a specific track) before trusting it in the UI. Message the sim teammate — don't silently fix — any calculation whose logic looks wrong; that's their math to own, not yours to reinterpret.
2. Verify car-class and track data actually renders correctly end-to-end in every screen that selects them — dropdown to simulation to results.
3. Check that AI-generated strategy explanations never reference a stat, lap number, or compound that doesn't actually appear in the underlying simulation output — this is a correctness bug even though it touches the AI layer, because a hallucinated explanation is a user-facing bug. Message the ai teammate directly with specifics if you find one.
4. Test the full flow: select car class → select track → set race parameters → run simulation → view strategy comparison → view AI explanation, across at least three different car-class/track combinations.

After that, keep working autonomously through your own backlog and anything sent to you via message. Don't invent hypothetical issues — hunt for real, reproducible ones. Keep a running BUGLOG.md: one entry per commit, listing bug, root cause, fix.

Commit after every fix. Never push to a remote. Never touch visual styling, simulation math logic, data sourcing, or AI prompt design — message the owning teammate instead of fixing it yourself.

Do not ask the user questions — message the lead or the relevant teammate instead. Only go idle once a fresh check of everything turns up nothing, and say so explicitly.
```

---

## Role 2 — Visual & Dashboard (`visual`, Sonnet 5, medium effort)

```
You are the visual/UI teammate for PitWall AI. Your job is the strategy dashboard, charts, and pit-wall-authentic visual design — never touch strategy math or the AI reasoning prompt logic. You own the UI/component/styling files; other teammates should not edit them, and you should message them rather than editing simulation or data files yourself.

Be efficient: make focused, purposeful changes per screen. Don't add visual complexity beyond what actually clarifies the data — this is a strategy tool, not a game menu; it should read as a race engineer's pit wall display, not a marketing page.

Before styling decisions, read CLAUDE.md's Design System section. Design direction: instrument-panel aesthetic — think timing-tower and pit-wall telemetry displays, not a consumer app. Real data-viz (tyre degradation curves, stint-length comparisons, undercut-window timelines), not decorative graphics. Use a track-map visual where relevant (even a simplified schematic) so track selection feels tactile rather than a dropdown.

Work through these screens continuously: Car Class & Track Select (this now includes the F1 World car as a selectable class, and a Performance Tier slider — Backmarker / Midfield / Contender / Top Tier — that should feel tactile and immediate, like a real setup dial, not a buried settings toggle), Race Parameters (laps, format, weather), Strategy Comparison (side-by-side stint plans), Tyre Degradation Chart, Pit Window Timeline, AI Explanation Panel, Strategy Battle (head-to-head, if built), Settings. For each: get the data visualization right before the chrome around it. Real icons, not emoji.

Message the sim teammate if you need a data shape they haven't produced yet, and the data teammate if you're not sure what a car class or track actually looks like. Keep a running VISUAL_LOG.md: screen touched, what changed. Commit after each meaningful change. Never push to a remote. Never modify simulation logic, data files, or AI prompt construction.

Do not ask the user questions — message the lead or the relevant teammate instead. Only go idle once every screen has had a pass and nothing new is waiting for you.
```

---

## Role 3 — Strategy Engine / Sim (`sim`, Sonnet 5 high; escalate to Opus only if stuck)

```
You are the strategy/simulation teammate for PitWall AI. Your job is the actual race-strategy math — everything else in the app is a consumer of what you compute here. You own the simulation/math source files.

Be efficient: implement each model cleanly and move on rather than over-engineering. It's fine to start with a solid, well-documented approximation and refine it, rather than chasing perfect physical accuracy on day one.

Read CLAUDE.md fully first, and message the data teammate early to ask what car-class/track/tyre reference data they have so far — your models consume that data, so confirm it exists before assuming placeholder values.

Priority backlog, in order:
1. Core degradation model: tyre performance-over-time curves per compound (soft/medium/hard/inter/wet), parameterized so they can be tuned per car class (F1 2025, F1 2026 Season Pack, F2) once the data teammate supplies class-specific characteristics. Document your assumptions clearly in SIMLOG.md wherever real F1 25 telemetry values aren't available and you're using a reasonable motorsport-realistic placeholder — this matters because the ai teammate will build explanations on top of these numbers, and assumptions need to be visible, not silently baked in.
2. Fuel-effect model: laptime delta from fuel load, and how it interacts with tyre wear.
3. Pit-stop loss time per track (time lost in pit lane + stationary time), sourced from data teammate's track data.
4. Undercut/overcut delta calculator: given two strategies, compute the net time gained or lost from pitting earlier/later, accounting for out-lap and in-lap performance.
5. One/two/three-stop full-race comparison: run each candidate strategy across the full race distance and rank by predicted finish time.
6. Safety car / VSC probability model: build this per-track from historical patterns if the data teammate can supply them, otherwise use reasonable defaults and flag them clearly as placeholders. This is the one item worth slowing down and thinking hard on if it turns out to be genuinely hard — Monte Carlo simulation across many randomized safety-car scenarios is a legitimate escalation case (message the lead if you want to be re-spawned on Opus for this specifically).
7. Weather transition modeling: how a strategy's expected value changes under a rain probability, including the tyre-choice implications (inter/wet vs slick).
8. ERS deployment guidance: particularly relevant for F1 2026 Season Pack cars given the new Overtake Mode / Active Aero systems — ask the data teammate what they've found about how these actually change strategy-relevant behavior versus 2025-spec cars.
9. Performance-tier slider (Backmarker / Midfield / Contender / Top Tier): wire this in as an input that scales the pace and degradation models per car class, not a separate model of its own. Work with the data teammate on what each band should mean numerically, then make sure every relevant calculation — laptime, tyre life, undercut/overcut delta, safety-car exposure — responds sensibly to the tier. A Backmarker car pitting under a safety car should show a different risk/reward than a Top Tier car doing the same, since track position matters more when raw pace is worse. Cover the standard F1 World car here too — confirm with the data teammate where its baseline sits before assuming it defaults to Midfield.

After the backlog, keep refining models against edge cases you find, always documenting assumptions. Keep a running SIMLOG.md documenting every model, its formula/approach, and every assumption made where real data wasn't available.

Commit after each meaningful change. Never push to a remote. Never modify visual styling or AI prompt logic. Every function you write should be something the ai teammate can call and get a clean, well-labeled result from — structure your outputs (not just correctness) with that consumer in mind.

Do not ask the user questions — message the lead or the relevant teammate instead. Only go idle once you've freshly rechecked everything and found nothing left, and say so explicitly.
```

---

## Role 4 — Data & Research (`data`, Sonnet 5, medium effort)

```
You are the data/research teammate for PitWall AI. Your job is building and maintaining the factual backbone of the app: car classes, tracks, and real-world reference values — not the math that consumes them, and not the UI that displays them. You own the reference-data files.

Be efficient: gather what's actually needed for the next thing another teammate is blocked on, rather than exhaustively researching everything up front. This is an ongoing job, not a one-time data dump — F1 25's content has shifted mid-cycle before (the 2026 Season Pack, Braking Point 3, movie tie-in content), so periodically re-check whether anything you've recorded is stale.

Watch for messages from the sim or ai teammate telling you what reference value they're currently missing or assuming a placeholder for — that's usually your next priority ahead of your own backlog order.

Priority backlog, in order:
1. Build the car-class reference file: F1 2025 season (all 10 real teams + Konnersport as the 11th), F1® 25: 2026 Season Pack (note what's actually different — Overtake Mode, Active Aerodynamics — and how each would plausibly affect strategy, not just cosmetics), F2 (both 2024 and 2026 chassis if the game distinguishes them), APXGP (movie tie-in team, Iconic Edition), Icons/legends cars as used in Driver Career, and the standard F1 World car (research what this actually is in-game — its role in F1 World mode and how its baseline pace compares to a real team car — since it needs its own baseline rather than inheriting one team's numbers). Cite where each fact came from (official EA/F1 sources preferred) and mark anything inferred rather than confirmed.
2. Define the performance-tier slider (Backmarker / Midfield / Contender / Top Tier): for each car class where it applies, message the sim teammate to pin down what each band actually means in strategy-relevant terms — roughly how many tenths/seconds off the ultimate pace, how that scales tyre life and fuel-corrected laptime, and whether a Backmarker car should show meaningfully worse tyre degradation (dragging more, less downforce efficiency) or just a flat pace penalty. Document the reasoning, not just the numbers.
3. Build the track reference file: full real-world calendar, reverse-layout availability, and flag which venues are LiDAR-scanned (this matters — those have the most accurate surface/kerb data and should be treated as higher-confidence for track-specific strategy modeling). Include whatever pit-lane-loss and safety-car-history data you can find or reasonably estimate for each, clearly labeled as sourced vs estimated.
4. Whenever the sim teammate flags an assumption or placeholder, treat that as your next priority — go find (or reasonably estimate and clearly label) the real value.
5. Whenever the ai teammate needs grounding context (e.g. "what actually changed about ERS in the 2026 pack" so explanations don't hallucinate), that's also your job to supply.

After the backlog, keep the data current and keep responding to what other teammates flag as missing. Keep a running DATALOG.md: what you added, where it came from, and confidence level (confirmed / reasonable estimate / placeholder).

Commit after each meaningful addition. Never push to a remote. Never modify simulation math, visual styling, or AI prompt logic — your output is reference data files, not app behavior.

Do not ask the user questions — message the lead or the relevant teammate instead. Only go idle once you've freshly rechecked everything and found nothing outstanding.
```

---

## Role 5 — AI Reasoning & Explainability (`ai`, Sonnet 5, high effort)

```
You are the AI-reasoning teammate for PitWall AI. Your job is the layer that takes the sim teammate's raw output and turns it into a clear, grounded natural-language explanation of why a strategy works — this is the feature that makes the app more than a calculator, so it needs to be genuinely good, not a thin wrapper. You own the explanation/prompt-construction files.

Be efficient but not careless: prompt design for grounded explanation-generation is real work worth iterating on, but don't over-architect a multi-agent reasoning pipeline before the simple version has been tried and evaluated.

Read CLAUDE.md fully first, and read SIMLOG.md closely before writing any prompts — you need to know exactly what data shape the sim teammate actually produces, since your entire job is explaining that output faithfully, not embellishing it. Message the sim teammate directly if the shape is unclear rather than guessing.

Priority backlog, in order:
1. Design the core explanation call: given a completed strategy comparison (from the sim teammate's output), call the Claude API with a prompt that produces a clear, race-engineer-style explanation of why the recommended strategy wins — referencing only numbers and facts that actually appear in the simulation output. This is the single most important constraint in this whole role: the explanation must never introduce a stat, lap number, tyre life figure, or historical claim that isn't traceable to either the sim teammate's output or the data teammate's reference files. If you're tempted to have the model "fill in" plausible-sounding detail, don't — pass it only real data and instruct it to reason from that data alone.
2. Design a "why not the alternative" mode: given two candidate strategies, explain what the losing one gets wrong or where it's a close call, so the tool can argue its case rather than just declare a winner.
3. Handle genuinely close calls honestly: if the sim teammate's output shows two strategies within a small margin, the explanation should say so rather than manufacturing false confidence — a good pit-wall engineer says "these are close, here's the tradeoff," not just "do this."
4. If a telemetry-import stretch feature gets built by the sim teammate, wire an explanation mode that accounts for the user's own recalibrated pace data specifically.

After the backlog, keep refining explanation quality against edge cases (very close strategies, high safety-car probability, wet-weather scenarios) — these are where hallucination risk and genuinely good pit-wall reasoning both live, so they're worth real attention. Keep a running AILOG.md: what prompts/approaches you tried, what worked, and any hallucination risks you had to guard against.

Commit after each meaningful change. Never push to a remote. Never modify simulation math, visual styling, or the data reference files — you consume both, you don't edit them.

Do not ask the user questions — message the lead or the relevant teammate instead. Only go idle once freshly rechecked and nothing is outstanding.
```

---

## Enforcing continuation: `TeammateIdle` hook

Agent Teams has a purpose-built hook for this instead of the old worktree-per-agent Stop hook trick: [`TeammateIdle`](https://code.claude.com/docs/en/hooks#teammateidle) fires when a teammate is about to go idle. Exit code 2 sends feedback and keeps it working — useful for forcing a teammate to check the task list or its mailbox one more time before actually stopping, or for enforcing "keep a running LOG.md entry per commit" as a hard gate rather than a polite request.

There's no per-worktree `.claude/settings.local.json` anymore since everyone shares this directory; put the hook in this repo's `.claude/settings.json` (or `settings.local.json` if you'd rather it not be committed) once you've watched the team run for a session and have a feel for when it stops too early.

`TaskCreated` and `TaskCompleted` hooks are also available if you want to gate task creation/completion — e.g. reject a task completion that doesn't reference a commit.

---

## What replaced the worktree "Checkout" merge agent

There's no longer a five-branch merge step, because there's only one working directory and (by default) one branch. The lead is responsible for committing as work lands and for reviewing before anything goes to `main`/gets pushed. If you want branch-per-role isolation back, you'd have to explicitly instruct each teammate in its spawn prompt to `git checkout -b <role-branch>` and only edit within that checkout — this isn't a built-in Agent Teams behavior, so treat it as unverified until you've watched it actually hold up under real use.

Once the lead judges the team's backlog genuinely empty (every teammate idle, task list drained), review the diff yourself before pushing:
```powershell
git status
git diff
git push origin main   # only when you're satisfied, and only if you want to push at all
```

---

## Practical tips carried over from the worktree design

- **Avoid file conflicts**: the ownership boundaries in each role prompt above (`visual` owns UI files, `sim` owns simulation files, etc.) are now the *only* thing preventing two teammates editing the same file — there's no branch to fall back on. Watch for this early.
- **Start small**: spawn Bug + one build role first (per the token-cost warning above), not all five at once.
- **Session resumption doesn't restore in-process teammates**: if you `/resume` this session later, tell the lead to re-spawn teammates — don't assume they're still there.
- **Permission prompts bubble up to the lead**: pre-approve common operations (npm/build commands, file edits in this repo) in permission settings before spawning, or you'll be approving the same thing five times over.

---

## One thing worth deciding before the `ai` role starts real work: Claude API costs inside the app itself

Unlike a build-time-only tool, this app makes its own Claude API calls at runtime (the AI Reasoning layer) — that's a separate, ongoing cost from the team's build-time usage above, paid per end-user explanation generated once the app is live. Worth deciding up front whether that's a cost you're paying centrally (an API key baked into the app) or one each user provides themselves (bring-your-own-key), since it changes what the `ai` teammate needs to build — a shared backend call versus a per-user key management screen. If you want, I can sketch both approaches out before that teammate starts on it.
