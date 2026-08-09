# KITHLANDS

> **Your town. Your people. Your saga.**
>
> *An 8-bit JRPG built from your hometown.*

---

**Document:** Game Design Document (GDD) — v0.3
**Author:** Cory LaNou — Drywood Creek Consulting
**Working title:** Kithlands *(domain registered: kithlands.com; pending TESS verification)*
**Status:** Pre-production design specification
**Intended use:** Authoritative design source for human and LLM-assisted implementation

---

## How to read this document

This document is the design source of truth for Kithlands. It is written to be ingested by a large language model (Claude, GPT, local Gemma, etc.) and used to scaffold code, generate content tables, and answer implementation questions. It is also written to be read top-to-bottom by a human collaborator with no prior context.

The document is organized in the order you should *build* in, not the order you should *play* in. Section 1 is vision. Sections 2–3 are the architecture. Sections 4–8 are the playable systems (classes, stats, combat, items, magic). Sections 9–11 are the procedural layer (locality, quests, flavors). Section 12 is the difficulty and balance framework. Sections 13–14 are saves and safety. Sections 15–17 are mobility, the content pool, and sequence breaks. Sections 18–20 are scope, roadmap, and open questions.

---

# Instructions for Implementation (Read This First)

**This section is written for the AI assistant (you) that is being asked to help build Kithlands. The human collaborator may not repeat any of this in chat, so treat the instructions below as standing orders for the entire project.**

## Your role

You are the implementation partner for Kithlands, a procedurally-generated retro JRPG that builds its world from a player's hometown data. The human you're working with is Cory LaNou, an experienced Go developer (30+ years), Go trainer, and partner at Gopher Guides. He is comfortable with backend architecture, distributed systems, and shipping software. He is *not* a professional game developer or frontend specialist, so frontend (Phaser, sprite work, animation) and game-design intuition are areas where he will lean on you more heavily than backend Go work.

When in doubt about what to do, **default to action over questions**. Cory prefers concise, action-oriented outputs. If a request leaves minor details unspecified, pick the most plausible interpretation, proceed, and note the assumption at the end. Do not ask three clarifying questions before writing code.

## How to use this document

1. **This document is the source of truth.** If something in this document conflicts with something Cory says in chat, ask which takes precedence — don't silently override the document.
2. **Every section is self-contained enough to be quoted.** When implementing a feature, locate the relevant section, read it carefully, and reference its section number in your output ("per Section 6.2, the damage formula is...").
3. **The `shared/` directory is the data layer.** All game content (classes, spells, items, monsters, quest templates, flavors, transportation, content pools, easter eggs) lives as JSON in `shared/`. The Go server and Phaser client both read from these files. **A balance change should never require a code change** — only a JSON edit.
4. **When you're asked to "build X," look up X in the table of contents first.** The numbered sections cover almost every system. If X isn't in the document, it's either out of scope or it's a v2+ feature — say so before building it.

## Standing technical orders

These rules apply to all code you generate for this project unless Cory explicitly overrides them.

### Backend (Go)

- **Go is the backend language.** Use idiomatic Go. Standard library first, third-party only when justified.
- **Server-authoritative game logic.** All game rules (combat resolution, level-ups, quest generation, save state mutation) live in the Go server. The client never decides anything mechanical. This is non-negotiable for anti-cheat and for future native clients.
- **Package layout follows Section 3** (the repository layout). Don't invent new top-level packages without justification.
- **Use `context.Context` on all handlers and long-running calls.**
- **Database is PostgreSQL.** Use `pgx` (v5+) or `sqlc`. Avoid ORMs.
- **JSONB for save state and locality graphs.** Real columns for users, sessions, and metadata. Schema sketches are in Sections 9.5 and 13.1.
- **Error handling is explicit.** No panics in request handlers. Wrap errors with context using `fmt.Errorf("doing X: %w", err)`.
- **Tests for math.** The combat formulas, XP curve, stat growth, and quest generator algorithms must have unit tests. Cory wants to be able to refactor these with confidence.
- **A balance simulator exists in `scripts/balance_sim.go`** (Section 12.2). When you change combat math, run it and report the deltas.

### Frontend (Phaser 3 + Vite)

- **Phaser 3 with vanilla JavaScript** (not TypeScript) for v1, unless Cory says otherwise. Lower friction for the Programming Club students who will be contributing.
- **The client is dumb on purpose.** It renders, takes input, plays animations. It does not contain game rules. When the player attacks an enemy, the client sends `{action: "attack", target_id: 3}` to the server and renders whatever the server sends back.
- **Scene structure follows Section 3.** Boot, Title, Wizard, World, Town, Battle, Menu.
- **No external CSS frameworks.** Phaser handles its own rendering. UI overlays use plain HTML/CSS where needed.
- **Mobile-friendly from day one.** Touch controls work alongside keyboard. The viewport adapts to phone screens.
- **No browser storage APIs (localStorage, sessionStorage) in artifacts or in the running game.** All persistent state lives on the server.

### LLM gateway

- **The LLM is dressing, never the foundation.** All quest structure, combat outcomes, level-ups, and game state come from deterministic Go code. The LLM only writes flavor text.
- **Every LLM call has a fallback.** If the LLM is offline, slow, or returns malformed output, the game falls back to a template string and continues. **The game must be playable with the LLM completely disabled.**
- **The gateway interface is in Section 2.3.** All LLM calls go through it. Don't bypass it.
- **Local first.** During development and beta, use Ollama with Gemma3 or Qwen running on Cory's local machine. Anthropic Claude is for production when budget allows. The gateway interface is identical for both.
- **Safety filter on every LLM response.** See Section 14. No LLM output reaches the player without passing the filter.

### Content & data files

- **All game data is JSON in `shared/`.** When you need to add or change a class, spell, item, monster, quest template, flavor, transportation tier, or easter egg, edit the JSON. Never hardcode game data in Go or JavaScript.
- **Validate JSON on server startup.** A malformed `classes.json` should crash the server with a clear error, not produce a broken game.
- **The content pool is two-tier (Section 16).** Anchors always appear, surprises are drawn from a larger pool. When adding content, decide which tier it belongs to and tag it accordingly.

### Safety and content

- **The game is playable by minors.** Section 14 is binding. Every piece of generated text passes through the safety filter before reaching the player.
- **Hard refusals (Section 14.4) are non-negotiable.** No sexual content, no real-world political figures by name, no violence directed at named real-world people, no religious commentary, no inappropriate content involving minors. These are checked at multiple layers.
- **When in doubt, refuse.** If a generated quest, NPC name, or dialogue line seems borderline, the safety filter should reject it and the engine should regenerate.

### Build order

**Build in the order the sections are written, not the order that seems most fun.** Specifically:

1. Section 4-8 first: classes, stats, combat, items, magic. These are the deterministic core.
2. Then Section 12: the balance simulator. You need this to validate the math from steps above.
3. Then Section 9: the locality system. The world.
4. Then Section 10: the quest generator. The campaign structure.
5. Then Section 11: flavors. Validates the data-driven reskin model.
6. Then Sections 15-17: transportation, content pool, easter eggs.
7. Then Sections 13-14: save system and safety. These wrap everything else.
8. **Last:** the Phaser client. The client should be a thin layer on top of a fully-working backend. Building the client first leads to throwaway work.

This order is opinionated. If you propose a different order, justify why.

## Standing communication orders

- **Cory prefers direct, plain-spoken communication.** Avoid slang like "bro" or "brother." Skip flowery preambles. Get to the point.
- **Reference section numbers when explaining decisions.** "Per Section 6.2..." is better than "In the design doc somewhere it says..."
- **When you make assumptions, state them at the end of your response.** Don't bury assumptions inside the work.
- **When you're unsure whether something is in scope, check Section 18 (v1 MVP Scope) before building it.** If it's not in v1, ask whether to build it anyway or defer it.
- **When proposing changes to this document itself, output the change as a unified diff or as explicit before/after blocks.** Don't paraphrase what should change.
- **Cory uses Claude Code with tmux and git worktrees, often running 20-40 concurrent sessions.** Your output may be one of many. Be self-contained — assume the next session won't see this conversation.

## Standing project orders

- **The Cadott Programming Club is the alpha audience.** When designing UX or pacing, ask "would a 14-year-old in Cadott understand this in five seconds?" If no, simplify.
- **Cory has limited time outside of his other businesses (Creswood Corners, PyroApex, school board, town board).** Optimize for solo-developer maintainability. Avoid clever code. Avoid systems that require Cory to remember subtle interactions six months from now.
- **Educational value is a feature, not a bug.** The Governance flavor in particular is meant to teach civics. Never treat educational content as a constraint on fun — treat fun as a constraint on educational content.
- **Open source friendly by default.** Code Cory writes for Kithlands may eventually be open-sourced. Don't bake in proprietary dependencies without flagging them.

## Things to never do

- Never assume the LLM will be available. Always have a fallback.
- Never put game rules in the client.
- Never hardcode game data in Go or JavaScript — it goes in `shared/`.
- Never use browser storage APIs (localStorage, sessionStorage) in any artifact or running code.
- Never generate content that could be inappropriate for a minor in a school computer lab.
- Never silently override a rule from this document. If you think a rule is wrong, say so explicitly.
- Never write more than 100 lines of code without checking in. Cory wants to review incrementally.
- Never use emoji in code, comments, or commit messages unless Cory does first.
- Never use the words "genuinely," "honestly," or "straightforward."

## When you're stuck

If you need information that isn't in this document, ask Cory **once**, with a specific question. Don't ask three. Don't ask vague questions. Bad: "What should the UI look like?" Good: "Should the battle scene use a top-down or side-view camera angle?"

If you need to make a decision that affects future work, document the decision in `docs/decisions/` as a short Architecture Decision Record (ADR). Format:

```
# ADR-NNN: Title
Date: YYYY-MM-DD
Status: accepted

## Context
What problem are we solving?

## Decision
What did we decide?

## Consequences
What does this enable or constrain?
```

## A note on this document

This document is alive. It is **v0.2** as of the latest edit. As decisions are made and assumptions are validated or invalidated, the document should be updated. If you're an LLM that can edit files, propose updates to this document the same way you propose code changes — with section numbers and explicit before/after.

The version number in the header should be bumped on every significant edit. Track changes informally in a `CHANGELOG.md` if Cory wants one.

---

## Table of Contents

1. Vision & Pitch
2. Technical Architecture
3. Repository Layout
4. Character Classes
5. Stats & Progression
6. Combat System
7. Items, Weapons & Armor
8. Spells & Abilities
9. Locality: Loading the Player's World
10. Procedural Quest Generation
11. Flavors (Conquest, Sci-Fi, Governance, Entrepreneurship)
12. Difficulty & Balance Framework
13. Save System & Multi-Team Replay
14. Content Safety & Filtering
15. Transportation & World Mobility
16. The Content Pool: Anchors, Surprises & Easter Eggs
17. Sequence Breaks & Hidden Quests
18. v1 MVP Scope
19. v2+ Roadmap
20. Open Questions

---

# 1. Vision & Pitch

## 1.1 The one-sentence pitch

**Kithlands** is a tiny retro RPG where you load your hometown, pick a flavor, and every spawn point becomes a different game — because the people, places, and politics around you become the quests.

## 1.2 Why this is different

Most RPGs ship a fixed world with fixed people and fixed quests. Kithlands ships an empty engine. The world is built from data the player provides — names of neighbors, names of landmarks, the geography of their actual town — and the engine generates a coherent campaign from that input.

No two players have the same game. No two playthroughs by the same player have the same game, because the spawn point, party composition, and chosen flavor change which slice of the local graph drives the story.

The closest comparable concept is a cross between **Dwarf Fortress** (emergent narrative from simulated systems), **Stardew Valley** (retro presentation, cozy local stakes), and **Final Fantasy I** (party of four, class system, level progression, recognizable JRPG combat math).

## 1.3 The campaign + sandbox structure

Kithlands uses a **campaign + sandbox** structure, not a roguelike and not a persistent world. This means:

- Picking a **flavor** is picking a **campaign** with a real beginning, middle, and ending.
- The path through the campaign is procedurally generated from the player's locality data.
- The player can win or lose. The game has an ending. Kids can finish a campaign in a session or two.
- Multiple saves of the same locality can exist with different parties and different campaigns, which gives the FF1-style "what if I started with three Black Mages?" replayability.

This was chosen over a pure roguelike (too punishing for the educational/civics audiences) and over a pure persistent world (too open-ended to scope for v1).

## 1.4 Audiences & sequencing

All four target audiences will eventually be served, but v1 focuses on one to validate the core loop fast.

| Phase | Audience | Why first / why later |
|---|---|---|
| **v1** | Cadott Programming Club + friends | Geographically accessible, fast feedback loop, doubles as curriculum. If 14-year-olds in Cadott think it's fun, the concept is real. |
| **v2** | Adult retro-JRPG fans | Itch.io launch, indie press, the audience that will appreciate FF1-style mechanics and pay for polish. |
| **v3** | Civics & education market | Schools, libraries, civic clubs. The Governance flavor becomes a teaching tool. |
| **v4** | Broader consumer market | Mobile-friendly web app, eventually wrapped as native mobile/desktop. |

## 1.5 Design principles (non-negotiable)

1. **Structure first, LLM second.** The game runs on deterministic rules. The LLM only fills in flavor text and dialogue. The game must be playable when the LLM is offline, slow, or producing nonsense.
2. **Every save is a different game.** Spawn point, party composition, and flavor all materially change the experience. Two saves of "Cadott / Conquest" should not feel the same.
3. **Honest replayability.** Replayability comes from procedural systems with real consequences, not from padded content.
4. **The locality is the protagonist.** Cadott playing as Cadott should feel meaningfully different from Cadott playing as Eau Claire. The town is not wallpaper.
5. **Web-first, runs everywhere.** One codebase serves desktop browser, mobile browser, and (later) native wrappers.
6. **Kid-safe by default.** Generated content is filtered. No adult themes in default flavors. The game must be appropriate for a school computer lab.
7. **Boring things should be boring.** Combat math should be auditable. A player should be able to look at a weapon and understand why it's better than the previous one. No hidden multipliers.

---

# 2. Technical Architecture

## 2.1 Stack

| Layer | Choice | Rationale |
|---|---|---|
| **Frontend engine** | Phaser 3 (JavaScript) | Mature 2D engine with tilemap, sprite, and turn-based scene support. Runs in any modern browser including mobile Safari/Chrome. Massive tutorial library. |
| **Frontend bundler** | Vite | Fast dev loop, simple config, ES module support. |
| **Backend** | Go | Auth, save state, locality data, LLM gateway, content filtering, balance math. Plays to existing strengths and reuses infrastructure. |
| **Database** | PostgreSQL | JSONB for save state and locality graphs; real tables for users, sessions, metadata. |
| **LLM gateway** | Pluggable. Local Ollama (Gemma3, Qwen) for dev/beta. Anthropic Claude API for prod-quality generation. Same gateway interface. |
| **Geographic data** | OpenStreetMap via Overpass API | Free, community-maintained, comprehensive. Cached aggressively, respects OSM usage policy. |
| **Auth** | WorkOS or email magic-links | No passwords. WorkOS already in your stack from PyroApex. |
| **Hosting** | Backend on Fly.io or Railway. Frontend on Cloudflare Pages. | Cheap, fast, easy to scale. |
| **Native wrappers (later)** | Wails (Go) for desktop, Capacitor for mobile | Reuses 100% of the web frontend. |

## 2.2 Why structure first, LLM second

Recent academic work on LLM quest generation (Värtinen et al., 2024; Doran & Parberry, 2011; StoryWorld 2023) shows that AI-generated quests are inconsistent — roughly **one in five** is good enough to use unedited. That's not good enough to be the foundation. But it's plenty good enough to be the dressing on top of a deterministic foundation.

Kithlands uses a hard split:

- **The engine** generates a quest as a structured object: `{type, target_npc, target_item, location, reward, success_condition}`. This is rule-driven and always coherent.
- **The LLM** takes that structured quest and writes the dialogue, names the macguffin, gives the NPC a personality. If the LLM produces nothing or produces nonsense, the engine falls back to template strings and the game still plays.

This is the same separation used by every shipping LLM-augmented game system as of 2026, and it is the only way to ship a procedural narrative game without producing nonsense.

## 2.3 The LLM gateway interface

Every LLM call goes through one Go interface. This makes Ollama, Claude, GPT, local Gemma, and "no LLM at all" interchangeable.

```go
// internal/llm/gateway.go
package llm

import "context"

type Request struct {
    Kind        Kind              // QuestText, NPCDialogue, MonsterFlavor, etc.
    Template    string            // structured prompt template
    Variables   map[string]string // template fill values
    MaxTokens   int
    Temperature float32
    Flavor      string            // conquest, scifi, governance, entrepreneurship
    Locality    LocalitySummary   // for grounding
}

type Response struct {
    Text       string
    UsedFallback bool   // true if LLM failed and template was used
    Provider   string  // "ollama-gemma3", "anthropic-claude", "fallback"
    LatencyMs  int
}

type Gateway interface {
    Generate(ctx context.Context, req Request) (Response, error)
}
```

Implementations:

- `OllamaGateway` — talks to a local Ollama server. Used in dev and during beta testing. Free.
- `AnthropicGateway` — talks to Claude API. Used when budget permits or for production.
- `FallbackGateway` — returns a template-filled string. Used when no LLM is available or as a safety net wrapping the others.

The gateway is wrapped by a `SafetyGateway` that runs every response through the content filter (see Section 14) before returning it.

## 2.4 What runs where

- **Phaser client:** rendering, input, animation, local game state, battle UI, menus. **No game rules.** The client is dumb on purpose so it can't be cheated and so the same logic powers a future native wrapper.
- **Go server:** all game rules. Combat resolution, level-ups, quest generation, save state, locality loading, LLM gateway. The client sends actions ("attack monster #2"), the server returns results ("you hit for 47, monster dies, you gain 12 XP").
- **Postgres:** persistent storage. Users, characters, save states, generated localities (cached so the same Cadott isn't re-generated every session).
- **Ollama / Claude:** flavor text generation, called only by the Go server, never by the client.

This architecture means a player on a phone with a flaky connection can still play because the game logic is server-authoritative and the client just renders.

---

# 3. Repository Layout

```
kithlands/
├── client/                          # Phaser 3 frontend
│   ├── src/
│   │   ├── scenes/
│   │   │   ├── boot.js
│   │   │   ├── title.js
│   │   │   ├── wizard.js            # the locality-loading flow
│   │   │   ├── world.js             # overworld map + movement
│   │   │   ├── town.js              # town interior (NPC interaction)
│   │   │   ├── battle.js            # turn-based combat UI
│   │   │   └── menu.js              # inventory, party, save
│   │   ├── systems/
│   │   │   ├── input.js
│   │   │   ├── render.js
│   │   │   └── audio.js
│   │   ├── data/
│   │   │   └── ui_strings.js        # only UI strings; game data comes from server
│   │   └── api.js                   # backend client
│   ├── public/
│   │   ├── tilesets/                # 8-bit tile art
│   │   ├── sprites/                 # character sprites
│   │   └── audio/                   # chiptune sfx and music
│   └── vite.config.js
│
├── server/                          # Go backend
│   ├── cmd/kithlands/
│   │   └── main.go
│   ├── internal/
│   │   ├── auth/                    # WorkOS or magic-link auth
│   │   ├── locality/                # OSM Overpass fetch, graph build, caching
│   │   ├── generator/               # quest, NPC, encounter, dungeon generation
│   │   ├── llm/                     # gateway: Ollama, Anthropic, fallback
│   │   ├── balance/                 # combat math, XP curves, scaling
│   │   ├── combat/                  # turn resolution, status effects
│   │   ├── progression/             # level-ups, class promotion
│   │   ├── save/                    # save state CRUD
│   │   ├── safety/                  # content filter
│   │   └── db/                      # postgres queries
│   ├── api/                         # HTTP handlers
│   └── go.mod
│
├── shared/                          # Single source of truth for game data
│   ├── classes.json
│   ├── stats.json
│   ├── spells.json
│   ├── items.json
│   ├── monsters.json
│   ├── quest_templates.json
│   └── flavors/
│       ├── conquest.json
│       ├── scifi.json
│       ├── governance.json
│       └── entrepreneurship.json
│
├── docs/
│   ├── KITHLANDS_DESIGN.md          # this document
│   ├── architecture.md
│   └── balance_notes.md
│
├── scripts/
│   ├── balance_sim.go               # combat simulator for tuning
│   └── seed_test_locality.go        # generates a fake town for testing
│
└── docker-compose.yml               # postgres + ollama for local dev
```

The `shared/` directory is the most important folder in the repo. **All game data lives there as JSON.** The Go server reads it, the Phaser client reads it (for tooltips and UI), and any future native wrapper reads it. This means a balance change is one file edit, not a code deploy.

---

# 4. Character Classes

## 4.1 Class design philosophy

Final Fantasy I shipped with six base classes that promoted to advanced versions partway through the game. Each role was sharply distinct and the player picked four of the six to form their party. This is the model Kithlands copies, with adjustments for the locality and flavor systems.

The six base classes are intentionally **archetypes**, not personalities. Personality comes from the NPC pool the player loaded — the Warrior in your save might be your neighbor Bob, or your math teacher, or a made-up character. The class is the mechanical role; the locality is the flavor.

## 4.2 The six base classes

| Class | Role | Promotes to | One-line summary |
|---|---|---|---|
| **Warrior** | Front-line tank | Knight | High HP, heavy armor, best weapons, no magic. |
| **Brawler** | Glass-cannon striker | Champion | No weapons, no armor, but late-game devastation. |
| **Rogue** | Fast utility | Shadow | High evasion, multi-hit, lockpicks, scouts. |
| **Mender** | Healer / support | Sage | White magic. Keeps the party alive. |
| **Cinder** | Damage caster | Pyromancer | Black magic. AoE damage and elemental nukes. |
| **Wayfarer** | Jack-of-all-trades | Wanderer | A little fighting, a little magic, never the best at anything. |

These names are deliberately *not* the FF1 names (Fighter, Black Belt, Thief, White Mage, Black Mage, Red Mage). They're close enough that anyone who knows JRPGs gets it instantly, but distinct enough to live as Kithlands' own brand.

## 4.3 Detailed class data

Below is the full v1 class table. These numbers are the **starting point** — they will be tuned via `scripts/balance_sim.go` (see Section 12) before shipping.

### Warrior → Knight

- **Role:** Front-line damage soaker. Always equipped with the best armor and biggest weapons.
- **Starting stats:** STR 20, AGI 5, INT 1, VIT 10, LCK 5, MHP 35
- **Stat growth (chance per level, in eighths):** STR 8/8, AGI 6/8, INT 4/8, VIT 5/8, LCK 6/8
- **HP per level:** 25 base (Warriors get the largest HP gains in the game)
- **Strong level rate:** 50% (every other level is a "strong" level with guaranteed bonus stats)
- **Equipment:** All weapons, all armor, all shields, all helmets
- **Magic:** None as Warrior. Knight unlocks low-tier Mender spells (heal, cure poison, light) up to level 3.
- **Promotion trigger:** Story event mid-campaign (see Section 11 — flavor-specific)
- **Inspiration:** FF1 Fighter/Knight

### Brawler → Champion

- **Role:** Late-game powerhouse. Bad early, terrifying late. The high-skill pick.
- **Starting stats:** STR 5, AGI 5, INT 5, VIT 20, LCK 5, MHP 33
- **Stat growth:** STR 5/8, AGI 5/8, INT 5/8, VIT 8/8, LCK 5/8
- **HP per level:** 22 base
- **Strong level rate:** 40%
- **Equipment:** No weapons (loses bare-hand bonus). No armor (loses evasion). May equip accessories.
- **Magic:** None.
- **Special:** Bare-hand damage scales with level. At level 1, deals 5 damage per hit. Each level adds STR/2 to bare-hand damage. By level 20 the Brawler is hitting harder than a fully-equipped Warrior. Number of hits per turn also scales (extra hit per 32 hit%, like FF1).
- **Promotion trigger:** Story event mid-campaign
- **Inspiration:** FF1 Black Belt/Master

### Rogue → Shadow

- **Role:** Speed, evasion, utility. Best evasion in the game; multi-hits more often.
- **Starting stats:** STR 5, AGI 10, INT 5, VIT 5, LCK 15, MHP 30
- **Stat growth:** STR 7/8, AGI 6/8, INT 4/8, VIT 4/8, LCK 8/8
- **HP per level:** 18 base
- **Strong level rate:** 35%
- **Equipment:** Light weapons (daggers, short swords, bows), light armor, no shields
- **Magic:** None as Rogue. Shadow unlocks low-tier Cinder spells (sleep, dark, status effects) up to level 2.
- **Special:** Out-of-combat lockpicking and trap detection. Can attempt to flee combat with much higher success. Generates better loot from chests when in the party.
- **Promotion trigger:** Story event mid-campaign
- **Inspiration:** FF1 Thief/Ninja

### Mender → Sage

- **Role:** Primary healer. Mandatory in most parties. Keeps everyone alive.
- **Starting stats:** STR 5, AGI 5, INT 5, VIT 10, LCK 10, MHP 28
- **Stat growth:** STR 4/8, AGI 4/8, INT 5/8, VIT 4/8, LCK 5/8
- **HP per level:** 16 base
- **Strong level rate:** 30%
- **Equipment:** Hammers, staves, robes
- **Magic:** White magic (healing, buffs, undead damage, status cures). Up to level 6 as Mender, level 8 as Sage.
- **Promotion trigger:** Story event mid-campaign
- **Inspiration:** FF1 White Mage/Wizard

### Cinder → Pyromancer

- **Role:** Damage caster. AoE clears, elemental nukes on bosses. Squishiest class.
- **Starting stats:** STR 1, AGI 10, INT 20, VIT 1, LCK 5, MHP 25
- **Stat growth:** STR 4/8, AGI 3/8, INT 8/8, VIT 4/8, LCK 5/8
- **HP per level:** 14 base
- **Strong level rate:** 25%
- **Equipment:** Daggers, staves, robes (no armor)
- **Magic:** Black magic (fire/ice/lightning, status, instant-death). Up to level 6 as Cinder, level 8 as Pyromancer.
- **Promotion trigger:** Story event mid-campaign
- **Inspiration:** FF1 Black Mage/Wizard

### Wayfarer → Wanderer

- **Role:** Jack-of-all-trades. Can fight, can heal, can nuke, never the best at anything.
- **Starting stats:** STR 10, AGI 10, INT 10, VIT 5, LCK 5, MHP 30
- **Stat growth:** STR 5/8, AGI 5/8, INT 5/8, VIT 5/8, LCK 5/8
- **HP per level:** 19 base
- **Strong level rate:** 25%
- **Equipment:** Most weapons (no greatswords), light/medium armor, no shields
- **Magic:** Both schools, both up to level 4 (5 as Wanderer)
- **Promotion trigger:** Story event mid-campaign
- **Inspiration:** FF1 Red Mage/Wizard

## 4.4 Party composition rules

- The player picks **four** classes for their party (any combination, including duplicates).
- The player names each character. By default, the wizard suggests names from the locality's NPC pool ("Want to play as your neighbor Bob? Pick a class for him.").
- A character's name is cosmetic. Their class is mechanical. This separation is critical for the locality system.
- Suggested party templates for new players:
  - **Balanced:** Warrior / Rogue / Mender / Cinder
  - **All-physical:** Warrior / Warrior / Brawler / Rogue
  - **All-magic:** Cinder / Cinder / Mender / Wayfarer
  - **Solo Wayfarer:** Wayfarer / Wayfarer / Wayfarer / Wayfarer (the "weird" run; possible but punishing)
- The wizard offers these templates by name during character creation, plus a custom option.

## 4.5 Class promotion

Around the campaign midpoint (story-trigger, not level-trigger), all four party members promote to their advanced class simultaneously. Promotion gives:

- A new sprite (visual reward)
- Access to higher-tier equipment
- Access to higher-tier spells (where applicable)
- A small one-time stat boost
- A class-specific narrative beat ("You are no longer a humble Mender — you are a Sage of the Northern Reach.")

The promotion event is one of the few hand-authored beats in the campaign and acts as the act-2 break.

---

# 5. Stats & Progression

## 5.1 The six core stats

| Stat | Abbrev | What it does |
|---|---|---|
| **Strength** | STR | Physical damage, carry capacity |
| **Agility** | AGI | Turn order, evasion (+2 evade per AGI), accuracy (+1 hit% per AGI) |
| **Intellect** | INT | Magic damage, magic accuracy |
| **Vitality** | VIT | Max HP gains, status resistance |
| **Luck** | LCK | Critical hit chance, flee chance, treasure rolls |
| **Hit %** | HIT | Accuracy, and number of attacks per turn (extra attack every 32 HIT) |

Hit% is partly a derived stat (gained per level by class) and partly equipment-driven. The "extra attack every 32 hit%" rule is borrowed directly from FF1 because it's elegant and creates real progression feel — you literally start hitting things twice.

## 5.2 The XP curve

FF1's XP curve is famous for getting essentially flat after level 29 (~32,800 XP per level forever). Kithlands uses a similar shape but caps at level 50 instead of 99 to keep campaigns short and replayable.

**XP-to-next-level formula (approximate):**

```
xp(level) = floor(40 * level^1.6) + 30
```

The formula above is an approximation. The reference table below is authoritative; intermediate levels are linearly interpolated between sample points. See `shared/stats.json` for the full 50-level table.

Resulting curve:

| Level | XP to next | Cumulative |
|---|---|---|
| 1 | 70 | 0 |
| 2 | 151 | 70 |
| 5 | 487 | 1,154 |
| 10 | 1,624 | 5,801 |
| 15 | 3,260 | 17,062 |
| 20 | 5,403 | 38,378 |
| 25 | 8,054 | 71,761 |
| 30 | 11,210 | 119,810 |
| 40 | 19,016 | 271,200 |
| 50 | 28,837 | 506,560 |

A typical campaign should see the party reach **level 25–35** at the final boss. Level 50 is for completionists who want to grind. The curve is deliberately not flat — every level should feel earned.

## 5.3 Stat gain on level-up

Borrowed directly from FF1, modernized: each level-up rolls each stat against its class's growth chance (in eighths). A Warrior with STR 8/8 gains STR every level. A Cinder with STR 4/8 gains STR half the time. Stats never go down.

**HP gain per level:**

```
hp_gain = base_hp[class] + (vit > rand(0,32) ? bonus : 0)
```

Where `base_hp[class]` is the per-class HP base from Section 4.3, and `bonus` is +20 on a "strong" level (every other level for Warriors, less often for casters). VIT contributes a probabilistic bonus on top.

**MP gain (casters only):** White and Black magic use a **unified MP pool per character** — MaxMP grows from a per-class curve (`mp_per_level` in classes.json), each spell has an `mp_cost`, and inns/tents/houses refill. Section 8.1 covers the full spec.

## 5.4 Strong vs. weak levels

Following FF1, some levels are "strong" — they grant guaranteed stat bonuses and a larger HP boost. Strong-level rate per class is in Section 4.3. This makes the level-up screen feel meaningful rather than identical every time.

---

# 6. Combat System

## 6.1 Combat overview

Turn-based, party of four vs. up to nine enemies, classic JRPG layout. Phaser handles the visuals, the Go server resolves the math.

**Visual layer (issue #258):** the battle scene blits a pre-rendered Gemini scene per biome (committed at `client/public/backgrounds/<motif>/`) and overlays an opaque FF6-style bottom strip so the MessageWindow and command HUD always have contrast regardless of the painting behind them. If a motif PNG is missing, `drawBattleBackdrop()` falls back to the original procedural layers. Regenerate backgrounds with `python3 scripts/generate_battle_backgrounds.py` (see `client/src/scenes/battleBackgrounds.js` for the motif manifest).

A round of combat:

1. Each combatant (player and enemy) selects an action.
2. Server sorts all actions by AGI (ties broken by random roll).
3. Server resolves each action in order, applying damage, status effects, deaths.
4. Server returns a list of resolved actions to the client.
5. Client animates them in sequence.
6. New round, or victory/defeat screen.

## 6.2 The damage formula

A long-running argument in RPG design is whether to use **subtractive** (damage = attack − defense) or **multiplicative** (damage = attack × (100/(100+defense))) damage. Subtractive is more readable and creates a stronger "I outgrew this enemy" feel. Multiplicative keeps damage scaling smooth across the whole game.

Kithlands uses a **modified subtractive formula** with floor protection, which is the same approach FF1 took:

```
base_damage = attacker.STR + weapon.power
mitigation = defender.armor_absorb
damage_per_hit = max(1, base_damage - mitigation) + rand(0, base_damage/2)
hits = 1 + floor(attacker.HIT / 32)
total_damage = sum of (damage_per_hit) for each hit
```

Properties:
- Damage is **never zero** (minimum 1 per hit). This is critical — zero-damage hits feel broken.
- Number of hits scales with HIT%, so higher-level characters literally swing more times per turn.
- The randomness (the `rand(0, base/2)` term) keeps combat from feeling deterministic without making it swingy.

**Critical hits:** roll d100 against `LCK / 4`. On hit, damage doubles.

**Magic damage formula:**

```
spell_base = spell.power
damage = rand(spell_base, spell_base * 2)
if target.weak_to(spell.element): damage *= 1.5
if target.resists(spell.element): damage *= 0.5
if target.absorbs(spell.element): heals target instead
```

Magic ignores armor absorb but is affected by Magic Defense (a derived stat from VIT and INT).

## 6.3 Hit and evade

```
to_hit = 84 + attacker.HIT - defender.evade
roll = rand(1, 100)
hit if roll <= to_hit
```

Base 84% comes from FF1. This means even a poorly-equipped character hits most of the time, which keeps low-level combat from feeling punishingly random.

## 6.4 Targeting

- Enemies use FF1-style weighted targeting: party leader takes 50% of single-target attacks, second takes 25%, third and fourth take 12.5% each.
- This means **party order matters** — putting your Warrior first soaks damage for the squishies behind them.
- Players target freely.

## 6.5 Status effects

Status effects must be **legible** — the player should never wonder why a character isn't acting.

| Status | Effect | Cure |
|---|---|---|
| Poison | -1 HP per step on world map, -5% max HP per turn in combat | Antidote, Cure Poison spell |
| Sleep | Cannot act. Wakes on damage. | Time, damage |
| Silence | Cannot cast spells. | Echo Herb, Cure Silence spell |
| Confuse | Acts randomly, may attack allies | Damage, Cure Confuse spell |
| Stone | Cannot act, counts as defeated for victory check | Soft, Stone-to-Flesh spell |
| Death | Defeated. Does not gain XP. | Phoenix Down, Resurrect spell |

Status effects do not stack — a character is either poisoned or not. This is a simplification from FF1 and keeps the UI sane.

## 6.6 Encounter types

- **Random encounters** on the world map (configurable rate; can be off in Easy mode)
- **Fixed encounters** in dungeons (always trigger at specific tiles)
- **Boss encounters** at quest climaxes (story-triggered, never random)
- **Ambushes** (player gets a round of free actions; rare)
- **Surprise attacks** (enemies get a round of free actions; rare, more likely if Rogue is not in party)

## 6.7 Victory and defeat

- **Victory:** all enemies defeated. Party gains XP (split evenly among living members) and gold. Random chance of item drop based on encounter table.
- **Defeat:** all party members at 0 HP or status-defeated. Player returns to last save with reduced gold. No permadeath in default difficulty.

---

# 7. Items, Weapons & Armor

## 7.1 Equipment philosophy

The player should be able to look at a weapon and understand *why* it's better than the previous one. No hidden modifiers, no opaque stats. A bigger number is a bigger sword.

The expanded character loadout, comparison flow, socket/transmutation return
flow, recommendation preview, DOM boundary, and future icon contract are
defined in [docs/EQUIPMENT_SCREEN_CONTRACT.md](EQUIPMENT_SCREEN_CONTRACT.md).
The normal Character action presents status and the spatial loadout together;
slot-specific inventory and comparison controls appear in context. Battle
presentation remains a later decision.

The staged weapon, armor, accessory, class-access, affix, and icon-production
taxonomy is defined in
[docs/EQUIPMENT_CONTENT_TAXONOMY.md](EQUIPMENT_CONTENT_TAXONOMY.md). It is a
content architecture, not authorization to generate the entire asset catalog
before the mechanics and visual gold slice are approved.

Each weapon has:
- **Power** (added to STR for damage)
- **Hit%** (added to character's hit%)
- **Crit%** (added to crit chance)
- **Class restriction** (which classes can equip it)
- **Element** (none, fire, ice, lightning, holy, dark)
- **Special** (rare: e.g., "+50% damage vs undead")

Each piece of armor has:
- **Absorb** (subtracted from incoming physical damage)
- **Evade penalty** (heavy armor reduces evasion)
- **Magic defense bonus**
- **Class restriction**
- **Element resistance** (rare)

## 7.2 The weapon progression curve

Weapons follow a tier system. Each tier roughly doubles the power of the previous, which ensures upgrades feel meaningful. Procedurally-placed shop inventories scale to the local area's encounter level.

| Tier | Example weapon | Power | When found |
|---|---|---|---|
| 1 | Wooden Club | 5 | Starting town |
| 2 | Iron Sword | 12 | After first dungeon |
| 3 | Steel Sword | 22 | Mid-game town |
| 4 | Mythril Sword | 35 | Mid-game dungeon |
| 5 | Flame Blade | 50 | Late-game |
| 6 | Hero's Edge | 75 | Final dungeon |
| 7 | (Legendary) | 110 | Optional / endgame |

Rather than a hand-crafted item table, Kithlands generates the contents of each tier procedurally from a base item template + flavor reskinning. A "Flame Blade" in the Conquest flavor is a "Plasma Cutter" in the Sci-Fi flavor with identical stats.

## 7.3 Item categories

| Category | Examples | Notes |
|---|---|---|
| **Weapons** | Swords, axes, daggers, staves, bows | Class-restricted |
| **Armor (body)** | Robes, leather, chain, plate | Class-restricted |
| **Shields** | Wooden shield, iron shield | Warrior/Knight/Mender only |
| **Helmets** | Cap, helm, great helm | Class-restricted |
| **Accessories** | Rings, amulets, bracers | Universal; provide buffs |
| **Consumables** | Potions, tents, antidotes, scrolls | Universal |
| **Key items** | Quest items | Cannot be sold or dropped |

## 7.4 Shops

Each town in the locality has zero or more shops. Shop inventory is generated procedurally based on:
- Town's "wealth" (derived from the locality graph — bigger towns have better shops)
- Player's average level (shops won't sell tier-7 weapons in the starting town)
- The flavor (a Governance-flavor "shop" might be a "permit office" that sells "licenses")

## 7.5 Treasure and drops

- **Treasure chests** in dungeons are pre-rolled when the dungeon is generated. Contents are seeded so the same chest always has the same item in a given save.
- **Monster drops** are rolled per-fight from a flavor-specific drop table.
- **Quest rewards** are deterministic — quest completion always grants the promised reward.

---

# 8. Spells & Abilities

## 8.1 Magic system overview

Kithlands uses a **unified MP pool** per character (FF4-style), with a flat per-spell cost tied to spell level. Early drafts of the GDD specified the FF1 spell-charge system; that was replaced on 2026-04-11 (issue #100) once we needed auto-battle fallback and tent/inn restore logic to have a single resource to reason about.

Each caster has `CurrentMP` and `MaxMP` on their character sheet. `MaxMP` grows with level from a per-class curve. Every spell has an `mp_cost`; defaults are derived from spell level (L1=2, L2=4, L3=6 … L8=16), and individual spells may override the default in `shared/spells.json`.

**Per-class MP curves** (shared/classes.json):

| Class     | Starting MMP | MP per level |
|-----------|--------------|--------------|
| Mender    | 10           | 5            |
| Cinder    | 10           | 5            |
| Wayfarer  | 5            | 3            |
| Warrior   | 0            | 1 (post-promotion payoff) |
| Rogue     | 0            | 1 (post-promotion payoff) |
| Brawler   | 0            | 0            |

Promotion seeds the pool to a minimum of 10 MP (see §8.4 promotion notes) so Knights and Shadows have meaningful first-act magic. Inns, tents, and houses fully restore MP alongside HP.

**Spell cost is still capped by class spell-level access** (Magic.MaxSpellLevel in classes.json): a level-1 cinder still can't cast a level-4 spell even if they could afford the MP, because they don't know it.

## 8.2 Spell learning

Spells are learned by **buying them at magic shops** or **finding them in dungeons**. A character can know up to 3 spells per spell level. The player chooses which to keep when offered a 4th (FF1's brutal but interesting choice).

This creates real party-building decisions: do I teach my Mender Cure or Heal at level 1? Both have uses.

## 8.3 White magic spells (Mender / Sage / Wayfarer)

| Lvl | Spell | Effect | Notes |
|---|---|---|---|
| 1 | Cure | Restore ~16 HP to one ally | Mender starting spell |
| 1 | Light | Illuminates dark dungeons | Utility |
| 1 | Bless | +10% hit% to one ally for combat | |
| 2 | Heal | Restore ~16 HP to all allies | |
| 2 | Mute | Silences one enemy | |
| 2 | Cure Poison | Removes poison from one ally | |
| 3 | Cura | Restore ~32 HP to one ally | |
| 3 | Aegis | Doubles armor of one ally for combat | |
| 3 | Dispel | Removes status effects from all allies | |
| 4 | Heala | Restore ~32 HP to all allies | |
| 4 | Banish | Massive damage to one undead enemy | |
| 4 | Resurrect | Revive one fallen ally with 1 HP | |
| 5 | Curaga | Restore ~64 HP to one ally | |
| 5 | Sanctuary | Prevents random encounters for 100 steps | |
| 5 | Smite | Massive damage to all undead enemies | |
| 6 | Healaga | Restore ~64 HP to all allies | |
| 6 | Shieldwall | All allies absorb +20 for combat | |
| 6 | Exit | Returns party to dungeon entrance | |
| 7 | Full Heal | Restore one ally to full HP | Sage only |
| 7 | Resurrect II | Revive ally with full HP | Sage only |
| 8 | Full Heal All | Restore all allies to full HP | Sage only |

## 8.4 Black magic spells (Cinder / Pyromancer / Wayfarer)

| Lvl | Spell | Effect | Notes |
|---|---|---|---|
| 1 | Spark | Small fire damage to one enemy | Cinder starting |
| 1 | Frost | Small ice damage to one enemy | |
| 1 | Sleep | Puts one enemy to sleep | |
| 2 | Ember | Small fire damage to all enemies | |
| 2 | Chill | Small ice damage to all enemies | |
| 2 | Shock | Small lightning damage to one enemy | |
| 3 | Fireball | Medium fire damage to one enemy | |
| 3 | Iceshard | Medium ice damage to one enemy | |
| 3 | Slow | Halves AGI of one enemy | |
| 4 | Blaze | Medium fire damage to all enemies | |
| 4 | Blizzard | Medium ice damage to all enemies | |
| 4 | Thunder | Medium lightning damage to all enemies | |
| 5 | Inferno | Heavy fire damage to one enemy | |
| 5 | Glacier | Heavy ice damage to one enemy | |
| 5 | Hold | Paralyzes one enemy | |
| 6 | Hellfire | Heavy fire damage to all enemies | |
| 6 | Avalanche | Heavy ice damage to all enemies | |
| 6 | Storm | Heavy lightning damage to all enemies | |
| 7 | Death | May instant-kill one enemy | Pyromancer only |
| 7 | Meteor | Massive damage to all enemies | Pyromancer only |
| 8 | Apocalypse | Maximum damage to all enemies | Pyromancer only |

## 8.5 Class abilities (non-spell)

- **Brawler:** *Focus* (skip turn, double damage next turn). *Counter* (passive, retaliates against melee attacks).
- **Rogue:** *Steal* (takes an item from one enemy). *Backstab* (massive damage if attacker has higher AGI).
- **Wayfarer:** *Inspire* (small heal + buff to all allies once per battle).

---

# 9. Locality: Loading the Player's World

This is the section that makes Kithlands different from every other JRPG. It deserves the most attention.

## 9.1 The locality graph

The fundamental data structure is a **graph**. Nodes are people, places, businesses, and landmarks. Edges are relationships — geographic proximity, social ties, factional alignment.

```go
// internal/locality/graph.go
type Locality struct {
    ID         string
    Name       string         // "Cadott, WI"
    Center     LatLng         // for map rendering
    Nodes      []Node
    Edges      []Edge
    Generated  time.Time
    Source     SourceMeta     // wizard, csv, osm, hybrid
}

type Node struct {
    ID          string
    Kind        NodeKind       // Person, Place, Business, Landmark, Natural
    Name        string         // "Bob's Hardware" or "Mrs. Henderson"
    Coord       LatLng         // optional, for geographic nodes
    Tags        []string       // [school, government, commerce, agriculture, ...]
    Importance  int            // 0-100, how prominently this appears in the campaign
    Personality string         // optional free text from user, fed to LLM
    Faction     string         // optional, for governance-flavor games
}

type Edge struct {
    From   string  // node ID
    To     string  // node ID
    Kind   EdgeKind  // Proximity, Social, Factional, Historical
    Weight float64 // 0.0 to 1.0
}
```

## 9.2 The three loading methods (progressive)

The wizard supports three loading methods, all of which produce the same `Locality` graph. v1 ships only the wizard.

### 9.2.1 Method A: Guided wizard (v1 ships this)

The wizard asks the player six questions and builds a small but coherent graph from the answers.

1. **Where do you live?** (town/ZIP — used to seed the map style and weather)
2. **Name 5 people you know.** (these become candidate NPCs; user can mark each as friendly/neutral/rival)
3. **Name 3 places that matter to you.** (these become high-importance landmarks)
4. **What's the biggest building in town?** (becomes the central landmark, often the boss arena or town hall)
5. **Pick a flavor.** (Conquest / Sci-Fi / Governance / Entrepreneurship)
6. **Pick a difficulty.** (Easy / Normal / Hard / Custom)

The wizard then generates a small world (~12 nodes) and the campaign begins.

### 9.2.2 Method B: CSV upload (v2)

For power users. A simple CSV format:

```
type,name,tag,importance,personality
person,Bob,friendly,80,Loud and helpful, runs the hardware store
person,Mrs Henderson,neutral,60,Town gossip, knows everyone's business
place,Town Hall,government,90,
place,The Diner,commerce,70,
business,Bob's Hardware,commerce,75,
landmark,Old Water Tower,landmark,40,Has a smiley face painted on it
```

The CSV is parsed server-side, validated (max 100 nodes for performance), and converted to a `Locality` graph. CSV-loaded localities skip the OSM step entirely.

### 9.2.3 Method C: OpenStreetMap auto-pull (v3)

The player enters their town name and Kithlands queries the Overpass API for:

- Roads (for the world map)
- Named buildings (especially civic, commercial, religious)
- Natural features (rivers, lakes, parks, forests)
- Town center / city hall / school / police / fire / library

These become real geographic nodes with real coordinates. The player can then add personal nodes (their neighbors, their favorite spots) on top of the OSM base layer.

This is the coolest loading method but it has the most edge cases (rural towns with sparse OSM data, foreign-language tags, weird coordinate systems). Save it for v3 when the rest is proven.

**Radius cap:** The wizard slider allows 0.5--30 miles. The server clamps `radius_miles` to `[0.5, 30]`. The default is 1.5 miles, which works well for small cities. Use a larger radius (10--30 miles) for rural or countryside areas where landmarks, farms, and natural features are spread across a wider area. At 30 miles the Overpass query may return several megabytes of data; the query `maxsize` is set to 8 MB to accommodate this.

## 9.3 The graph walk: how spawn point creates a unique game

When the player starts a new game, they pick (or are assigned) a **spawn node**. From the spawn node, the engine performs a graph walk:

```
spawn = pick_spawn_node(locality, player_choice or random)
neighbors_close   = nodes within 2 edges of spawn
neighbors_medium  = nodes within 4 edges of spawn
neighbors_far     = nodes within 6 edges of spawn

starting_npcs = pick 3 from neighbors_close
opening_quests = pick 2 from quest_templates
                 where quest.target ∈ neighbors_close ∪ neighbors_medium
mid_game_targets = neighbors_medium
end_game_targets = neighbors_far
big_bad = pick highest_importance node from neighbors_far
```

This is the trick. **The same locality with a different spawn point produces a different campaign** because the proximity walk surfaces different nodes in different orders.

Example: Cadott loaded with Conquest flavor.

- **Spawn at the school:** opening NPCs are teachers and students. Opening quest is "the principal needs help recovering stolen records." Mid-game brings you to Town Hall. Big bad ends up being a corrupt school board member.
- **Spawn at Creswood Corners:** opening NPCs are customers and suppliers. Opening quest is "the rival store is undercutting us." Mid-game brings you to local farms for supplies. Big bad ends up being a regional monopoly.
- **Spawn at the fire hall:** opening NPCs are first responders. Opening quest is "rescue someone from a burning barn." Mid-game brings you through the surrounding farmland. Big bad ends up being an arsonist with a personal grudge.

Same town, same flavor, three completely different games. **This is the core replayability mechanic.**

## 9.4 Rendering the locality as a tilemap

The graph is logical. The rendering is geographic (or pseudo-geographic). The Phaser client draws an 8-bit tilemap based on:

- For wizard-loaded localities: a procedurally generated tilemap that places nodes as buildings/landmarks in a small village layout.
- For CSV-loaded localities: same as wizard, but with more nodes.
- For OSM-loaded localities: a simplified tilemap drawn from real road and building data.

In all cases, the player walks a sprite around an 8-bit overworld and enters buildings to talk to NPCs. The graph is invisible to the player; they just see a town.

## 9.5 Caching localities

OSM queries are slow and we should not hammer the Overpass API. Localities are cached in Postgres:

```sql
CREATE TABLE localities (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    source TEXT NOT NULL,        -- 'wizard', 'csv', 'osm', 'hybrid'
    name TEXT NOT NULL,
    center_lat DOUBLE PRECISION,
    center_lng DOUBLE PRECISION,
    graph JSONB NOT NULL,        -- the full Locality struct
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_localities_user ON localities(user_id);
CREATE INDEX idx_localities_name ON localities(name);
```

A player can have multiple localities (their hometown, their college town, a friend's town they tried). Each locality can have multiple saves (Section 13).

---

# 10. Procedural Quest Generation

## 10.1 Quest grammar

Following Doran & Parberry (2011), Kithlands models quests as **structured objects** built from a small grammar of primitive actions. This is the deterministic layer; the LLM only handles surface text.

The 9 primitive quest actions:

| Action | Meaning | Example |
|---|---|---|
| `goto` | Travel to a node | "Go to the old mill." |
| `report` | Speak to an NPC | "Tell the mayor what you saw." |
| `learn` | Acquire information | "Find out who took the bell." |
| `get` | Acquire an item | "Bring me the lost relic." |
| `give` | Deliver an item | "Take this letter to her sister." |
| `kill` | Defeat an enemy | "The bandits at the bridge must go." |
| `escort` | Protect an NPC during travel | "See her safely home." |
| `defend` | Survive an attack at a location | "Hold the gate." |
| `use` | Use an item at a location | "Plant the seed in the chapel garden." |

A quest is a **sequence** of primitive actions plus a **motivation** and a **reward**. The motivation is what makes the quest narratively coherent.

## 10.2 NPC motivations

Doran & Parberry catalog 9 motivations. Kithlands uses 7 (dropped two that don't fit the cozy/heroic tone):

| Motivation | Description |
|---|---|
| Knowledge | NPC wants to learn something |
| Comfort | NPC wants to relieve a discomfort (theirs or another's) |
| Reputation | NPC wants to improve their standing |
| Wealth | NPC wants money or valuable items |
| Justice | NPC wants a wrong righted |
| Equipment | NPC needs a tool or item to do their job |
| Conquest | NPC wants to defeat or claim something |

The flavor of the campaign biases motivation selection:
- **Conquest flavor** → Justice, Reputation, Conquest weighted heavily
- **Sci-Fi flavor** → Knowledge, Equipment weighted heavily
- **Governance flavor** → Justice, Reputation weighted heavily
- **Entrepreneurship flavor** → Wealth, Equipment weighted heavily

## 10.3 Quest templates

A quest template is a parameterized sequence of primitive actions. Below are the 12 v1 templates. The generator picks a template, fills in slots from the locality graph, and produces a concrete quest.

| ID | Template name | Action sequence | Slots |
|---|---|---|---|
| Q01 | Fetch | `goto(X) → get(item) → goto(start) → give(item)` | X = neighbor place, item = themed |
| Q02 | Delivery | `get(item) → goto(X) → give(item, NPC)` | X = far place, NPC = far node |
| Q03 | Investigation | `goto(X) → learn(fact) → goto(start) → report(fact)` | X = scene of mystery |
| Q04 | Bandit clearing | `goto(X) → kill(monsters) → goto(start) → report(victory)` | X = wilderness |
| Q05 | Lost person | `learn(location) → goto(location) → escort(NPC, start)` | NPC = friendly node |
| Q06 | Gather supplies | `get(item1) → get(item2) → get(item3) → give(all, NPC)` | items = themed |
| Q07 | Confrontation | `goto(X) → report(challenge, NPC_rival) → kill(NPC_rival_minions)` | NPC_rival = rival faction |
| Q08 | Ritual | `get(item1) → goto(X) → use(item1, X) → defend(X)` | X = sacred place |
| Q09 | Diplomacy | `goto(X_faction1) → learn(grievance) → goto(X_faction2) → report(resolution)` | factions = governance flavor |
| Q10 | Sabotage | `goto(X_enemy) → use(item, X) → goto(start) → report` | X_enemy = rival's base |
| Q11 | Tournament | `goto(arena) → kill(round1) → kill(round2) → kill(round3) → report` | arena = central landmark |
| Q12 | Boss | `goto(dungeon) → kill(boss) → goto(start) → report` | dungeon = far node, boss = generated |

## 10.4 The quest generator algorithm

```
function generate_campaign(locality, spawn, flavor, difficulty):
    quests = []
    available_nodes = graph_walk(locality, spawn, max_distance=6)

    # Act 1: 3-5 small quests within 2 edges of spawn
    for i in 1..randint(3,5):
        template = pick_template(act=1, flavor)
        quest = instantiate(template, available_nodes, distance<=2)
        quest.level = i
        quests.append(quest)

    # Promotion event (story beat, fixed)
    quests.append(promotion_quest(flavor))

    # Act 2: 4-6 medium quests at distance 3-4
    for i in 1..randint(4,6):
        template = pick_template(act=2, flavor)
        quest = instantiate(template, available_nodes, distance=3..4)
        quests.append(quest)

    # Act 3: 2-3 quests building to the final boss
    for i in 1..randint(2,3):
        template = pick_template(act=3, flavor)
        quest = instantiate(template, available_nodes, distance=4..6)
        quests.append(quest)

    # Final boss
    boss_node = pick_highest_importance(available_nodes, distance>=5)
    quests.append(final_boss_quest(boss_node, flavor))

    return quests
```

A complete campaign is **10–15 quests**, designed to take 6–12 hours of play.

## 10.5 LLM dressing

Once a quest is generated structurally, the LLM is called once to write the surface text:

```
Prompt template (illustrative):

You are writing flavor text for a tiny retro JRPG.
Setting: {flavor}
Town: {locality.name}
Quest type: {quest.template_name}
Quest steps: {quest.actions_summary}
Giver NPC name: {quest.giver_name}
Giver NPC personality: {quest.giver_personality}
Target: {quest.target_summary}

Write a 2-sentence quest description in the voice of the giver NPC.
Then write a 1-sentence completion message.
Tone: warm, slightly dramatic, age-appropriate. No profanity.
Output JSON:
{ "description": "...", "completion": "..." }
```

If the LLM call fails, times out, or returns malformed JSON, the engine falls back to a template string. The game never blocks on the LLM.

---

# 11. Flavors

A **flavor** is a coherent reskin of the entire game. Same engine, same quest generator, different surface. v1 ships one flavor. v2-v4 add the others.

## 11.1 Flavor as a JSON file

Each flavor is one JSON file in `shared/flavors/`. The file contains:

- **Theme strings** (sword vs. plasma cutter vs. legal brief vs. business card)
- **Monster reskinning** (goblin vs. drone vs. obstructionist vs. predatory competitor)
- **Item reskinning**
- **NPC dialogue style hints** (passed to the LLM)
- **Motivation weights** (which NPC motivations are more common)
- **Win condition framing** ("defeat the dark lord" vs. "win the election")

```json
// shared/flavors/conquest.json (excerpt)
{
  "id": "conquest",
  "name": "Conquest",
  "tagline": "Rally your allies. Defeat the rising darkness.",
  "monster_pool": "fantasy",
  "weapon_skin": "medieval",
  "armor_skin": "medieval",
  "win_condition_text": "defeat the {big_bad}",
  "motivation_weights": {
    "Justice": 3,
    "Conquest": 3,
    "Reputation": 2,
    "Knowledge": 1,
    "Comfort": 1,
    "Wealth": 1,
    "Equipment": 1
  },
  "llm_style_hint": "Heroic, slightly archaic. Think classic JRPG. No modern slang."
}
```

## 11.2 The four v1+v2+v3+v4 flavors

### Conquest (v1)

- **Setting:** Classic JRPG. Medieval-ish, swords and sorcery, the rising darkness must be defeated.
- **Win condition:** Defeat the big bad in the final dungeon.
- **Why first:** Familiar to anyone who's ever played an RPG. Lowest cognitive load. Easiest to validate the engine.
- **NPC mapping:** Friendly NPCs become party recruits or quest-givers. Rival NPCs become bandits, monsters, or the big bad. The biggest building becomes the final dungeon.

### Sci-Fi (v2)

- **Setting:** Same engine, reskinned. Plasma weapons, alien creatures, mysterious signals.
- **Win condition:** Defeat the alien menace / restore the colony / launch the ship.
- **Why second:** This is the **proof that flavors work**. If the engine can convincingly become a sci-fi game with just a JSON swap and some LLM rewriting, the architecture is right. If it can't, the architecture is wrong.
- **NPC mapping:** Friendly NPCs become crew members. Rival NPCs become hostile factions. The biggest building becomes the alien hive or the mothership.

### Governance (v3)

- **Setting:** The same town, but the conflict is political. You are running for office, or trying to pass legislation, or defending the town from a corrupt regional official.
- **Win condition:** Win the election / pass the bill / oust the corrupt official.
- **Why third:** This is the **differentiator**. Nobody else is shipping this. Cory has direct lived experience designing realistic civic quests. Quest types include "build a coalition," "investigate the budget," "win the public hearing." Combat is reframed as **debate** with the same mechanics — STR becomes Conviction, INT becomes Knowledge, AGI becomes Wit, spells become rhetorical tactics.
- **NPC mapping:** Friendly NPCs become constituents and allies. Rival NPCs become political opponents. The biggest building becomes town hall.
- **Educational angle:** This flavor doubles as a civics teaching tool. A student playing "Cadott / Governance" actually learns how a school board works.

### Entrepreneurship (v4)

- **Setting:** Build a business in your hometown. Compete with rivals, hire employees, expand to new markets.
- **Win condition:** Reach a target valuation / dominate the local market / sell to a regional chain.
- **NPC mapping:** Friendly NPCs become customers and employees. Rival NPCs become competing businesses. The biggest building becomes the rival's HQ.
- **Combat:** Reframed as deal-making and negotiation. Same math, different verbs.

## 11.3 Flavor swap is data, not code

The critical architectural rule: **swapping flavor must not require code changes.** Everything that differs between flavors lives in the flavor JSON. The engine reads the JSON and produces appropriate output. This is what makes the four flavors maintainable as a one-person project.

---

# 12. Difficulty & Balance Framework

## 12.1 Difficulty levels

The player picks a difficulty at campaign start. Difficulty cannot be changed mid-campaign (would break balance). A player who finds it too hard can start a new save in Easy.

| Difficulty | Enemy HP | Enemy damage | XP gain | Random encounter rate | Notes |
|---|---|---|---|---|---|
| **Easy** | 75% | 75% | 125% | 50% | Recommended for kids, civics audience, first playthrough |
| **Normal** | 100% | 100% | 100% | 100% | The reference balance |
| **Hard** | 130% | 130% | 90% | 130% | For RPG fans who want a challenge |
| **Classic** | 150% | 150% | 80% | 150% | The "FF1 NES experience" — punishing |
| **Custom** | user | user | user | user | Power user mode |

These multipliers are applied **at encounter generation**, not at runtime. This means a level-10 monster on Hard has different stats than a level-10 monster on Normal — the difficulty is baked in at the moment of generation, which keeps combat math clean.

## 12.2 The balance simulator

`scripts/balance_sim.go` is a critical tool. It simulates thousands of combats automatically and reports:

- Average rounds per battle (target: 3-6 for trash, 8-15 for bosses)
- Party wipe rate (target: <5% for trash, ~20% on first attempt for bosses)
- XP-per-hour at each level
- Time to reach level 30 from level 1
- Class viability score (do all six classes contribute meaningfully?)

The simulator runs against the **balance/** package directly, with no UI, so it can do thousands of fights per second. **Run the simulator after every balance change.** This is the only way to keep the math sane as a one-person team.

```go
// scripts/balance_sim.go (sketch)
func main() {
    party := generateParty("balanced") // Warrior/Rogue/Mender/Cinder
    results := simulator.Run(simulator.Config{
        Party:          party,
        StartLevel:     1,
        EndLevel:       30,
        Difficulty:     "normal",
        BattlesPerLevel: 100,
        Seed:           42,
    })
    results.Report() // prints CSV
}
```

CSV output goes into a spreadsheet; humans look at the curves. If they're not smooth, tune the numbers.

## 12.3 Balance principles

1. **Combat should not feel grindy.** Players who play through the campaign without grinding should be able to win on Normal. If the simulator says you have to grind, the numbers are wrong.
2. **Every class should have a viable role.** Brawler bad early but great late. Cinder fragile but devastating. No class should be strictly dominated.
3. **Equipment upgrades should feel meaningful.** A new weapon should change DPS by at least 25% or it's not worth the inventory slot.
4. **Boss fights should require strategy, not levels.** A correctly-leveled party using the right tactics should win. A correctly-leveled party brute-forcing should lose.

## 12.4 Auto-balance for procedural encounters

When a quest places an encounter, the encounter level is computed from:

```
encounter_level = average(party_levels) + difficulty_modifier + flavor_modifier + distance_modifier
```

Where:
- `difficulty_modifier` is +0/+1/+2/+3 by difficulty
- `flavor_modifier` is per-flavor (Sci-Fi might be +1 because aliens are scary)
- `distance_modifier` is the graph distance from spawn (further = harder)

This means **the player never out-levels content** the way they would in a traditional fixed-world JRPG, because content scales to them. The difficulty modifier is what makes Hard hard — it adds +2 to every encounter.

---

# 13. Save System & Multi-Team Replay

## 13.1 Save state structure

A save is one row in the database. A user can have many saves per locality and many localities.

```sql
CREATE TABLE saves (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    locality_id UUID NOT NULL REFERENCES localities(id),
    name TEXT NOT NULL,            -- user-given save name
    flavor TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    spawn_node_id TEXT NOT NULL,
    party JSONB NOT NULL,          -- 4 characters with full state
    inventory JSONB NOT NULL,
    quest_state JSONB NOT NULL,    -- which quests done, in progress, etc.
    world_state JSONB NOT NULL,    -- which dungeons cleared, etc.
    rng_seed BIGINT NOT NULL,      -- for deterministic procgen
    play_time_seconds INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ        -- non-null if campaign won
);

CREATE INDEX idx_saves_user ON saves(user_id);
CREATE INDEX idx_saves_locality ON saves(locality_id);
```

## 13.2 The "different parties, same locality" feature

This is the FF1-style replay feature you specifically called out. The flow:

1. Player picks an existing locality from their list ("Cadott").
2. Picks "New Save."
3. Picks a flavor and difficulty.
4. Picks a spawn node (or random).
5. Picks a party composition.
6. Names the save ("Cadott — All Mages Run").
7. Plays.

Multiple saves of the same locality use the **same node graph** but get **different RNG seeds**, so:
- The locality structure is the same (the same town, the same neighbors)
- But the encounters, treasure, and quest specifics differ
- And the spawn point and party fundamentally change which slice of content the player sees

The result is what you wanted: "start FF1 with a different mix of classes" applied to the same town, with meaningfully different gameplay each time.

## 13.3 Save UI

The save list shows, for each save: locality name, flavor icon, difficulty, party composition (sprites), play time, last played date, completion status. The player can sort by recency, locality, or flavor.

## 13.4 Cloud sync

All saves live on the server. The client never holds the canonical state. This means:

- Same user on phone and desktop sees the same saves
- No save file corruption
- No "I lost my progress when my browser cleared cookies"
- Server-side save = anti-cheat (the server is authoritative)

The downside is **the game requires a network connection.** For v1 this is acceptable. v2+ may add offline mode with local storage and sync-on-reconnect.

---

# 14. Content Safety & Filtering

The game is playable by kids, by school computer labs, and by an unknown variety of users loading their own data. Safety is not optional.

## 14.1 Threats

| Threat | Example | Mitigation |
|---|---|---|
| User loads inappropriate names | Slurs, profanity in NPC names | Profanity filter at wizard input |
| LLM generates inappropriate text | Random LLM weirdness, prompt injection | Output filter on all LLM responses |
| User loads real person they shouldn't | A minor's real name + sexualized context | Hard refuse on personality fields with red-flag tokens |
| Generated quest references real-world harm | "Burn down the school" | Quest grammar excludes harmful primitives |
| User-uploaded CSV is a vector | Malicious payloads in fields | Strict schema validation, length caps, character allowlist |

## 14.2 The safety pipeline

Every piece of text that touches the game goes through:

1. **Input filter** (at wizard / CSV / OSM ingestion): profanity, length caps, character allowlists
2. **Generation filter** (on quest generation): no harmful primitive combinations
3. **LLM output filter** (on every LLM response): banned terms, age-appropriateness check
4. **Render filter** (just before display): final safety net

The filters live in `internal/safety/` and are unit-tested with adversarial examples.

## 14.3 Special handling for minors

If the wizard detects that the player is likely a minor (configurable at signup, defaults to "yes" for the school audience), additional restrictions apply:

- LLM temperature is lowered (less creative, more on-rails)
- Romance subplots are disabled
- Violence framing is softened ("defeated" instead of "killed")
- The Governance flavor uses simpler vocabulary

## 14.4 What we will not generate

Hard refusals, regardless of user input or flavor:

- Sexual content of any kind
- Real-world political figures by name
- Real-world violence directed at named real-world people
- Religious commentary
- Any content involving minors in inappropriate contexts

These are checked at the LLM gateway level and the safety filter level both.

---

# 15. Transportation & World Mobility

## 15.1 Why transportation matters

In classic JRPGs, the rhythm of unlocking new transportation is one of the most powerful pacing tools the genre has. Getting the ship in FF1 *changes the game* — suddenly the world map is twice as big and you can reach new continents. Getting the airship changes it again. Each unlock is a celebration, a power-up, and a re-orientation of what's possible.

Kithlands needs this rhythm because it's the heartbeat of campaign pacing. It also gives the locality system more to work with: a campaign that starts on foot in one neighborhood and ends in a vehicle crossing the whole region tells a much bigger story than a campaign confined to walking distance.

## 15.2 The five tiers of transportation

Every campaign progresses through five mobility tiers, gated by story milestones (not by levels or money). Each tier roughly doubles the player's effective travel range and unlocks new regions of the locality graph.

| Tier | Mobility | Range | Unlock | Notes |
|---|---|---|---|---|
| **T1** | On foot | Walking radius (~2 graph edges) | Game start | The opening of every campaign |
| **T2** | Mount / personal vehicle | Local region (~4 edges) | After Act 1 (~3-4 quests) | First "wow" moment |
| **T3** | Boat / amphibious | Crosses water nodes | Mid-Act 2 | Unlocks the second half of the map |
| **T4** | Long-haul vehicle | Whole locality | Post-promotion event | The "I can go anywhere" moment |
| **T5** | Sky / fast travel | Instant to any unlocked node | Final act | Endgame convenience and bragging right |

The exact reskin depends on flavor (next subsection), but the **mechanical role of each tier is identical across flavors**. This is critical for the engine — the code only knows about T1-T5, not about horses or jets.

## 15.3 Transportation by flavor

Same five tiers, totally different fiction. This is the same data-not-code principle from Section 11.

| Tier | Conquest | Sci-Fi | Governance | Entrepreneurship |
|---|---|---|---|---|
| **T1** | On foot | On foot | On foot | On foot |
| **T2** | Horse / pony | Hoverboard | Bicycle | Scooter |
| **T3** | Sailing ship | Hydrofoil | Campaign bus | Delivery van |
| **T4** | War galleon | Combat shuttle | Tour bus | Box truck |
| **T5** | Airship / dragon | Starship | Private jet | Helicopter |

A sci-fi campaign gives you a hoverboard, then a hydrofoil, then a shuttle. A governance campaign gives you a bike, then a campaign bus, then a tour bus to barnstorm the district. **Same beats, different costumes.** The Programming Club kid playing the sci-fi flavor is not playing the same game as the city council member playing the governance flavor, even though they're playing on the same engine.

The **monster truck** option you mentioned — let me put a stake in the ground here: there should be at least one **secret transportation** per flavor that's earned by an easter egg or sequence break (Section 17). The monster truck is the perfect example. Find a hidden quest, drive a monster truck for the rest of the run, no longer take damage from low-level random encounters because you just *roll over them*. That's the flavor of joy a procedural game needs.

## 15.4 Transportation as data

```json
// shared/transport.json (excerpt)
{
  "tiers": [
    { "id": "T1", "name": "Foot", "range_edges": 2, "unlock": "start" },
    { "id": "T2", "name": "Personal", "range_edges": 4, "unlock": "act1_complete" },
    { "id": "T3", "name": "Water", "range_edges": 6, "unlock": "act2_midpoint" },
    { "id": "T4", "name": "Vehicle", "range_edges": 8, "unlock": "promotion_event" },
    { "id": "T5", "name": "Sky", "range_edges": 999, "unlock": "act3_midpoint" }
  ]
}

// shared/flavors/conquest.json (excerpt)
{
  "transport_skins": {
    "T1": { "name": "On foot", "sprite": "foot" },
    "T2": { "name": "Horse", "sprite": "horse" },
    "T3": { "name": "Sailing Ship", "sprite": "ship" },
    "T4": { "name": "War Galleon", "sprite": "galleon" },
    "T5": { "name": "Airship", "sprite": "airship" }
  },
  "secret_transport": {
    "id": "dragon_mount",
    "name": "Ancient Dragon",
    "sprite": "dragon",
    "unlock": "easter_egg_dragon_cave",
    "perks": ["fly", "fire_immune", "intimidate_low_level_encounters"]
  }
}
```

## 15.5 Transportation effects on gameplay

- **Random encounter rate** scales inversely with tier — T5 has zero random encounters because you're flying over everything.
- **Travel time** in the in-game clock scales with tier (matters for time-sensitive quests).
- **Some quests are gated** by transportation tier ("you'll need a ship to reach the island").
- **Vehicle combat** is out of scope for v1, but some secret vehicles in v2+ may have combat perks (the monster truck damages low-level encounters on contact).

---

# 16. The Content Pool: Anchors, Surprises & Easter Eggs

This is the section that solves the "every run feels the same" problem. It's the most important thing in v1 after the locality system itself.

## 16.1 The two-tier content model

Procedural games that survive replay (Hades, Slay the Spire, Caves of Qud, Dwarf Fortress) all use some version of a **two-tier content pool**:

- **Anchors** are content that appears in *every run*. They're load-bearing — without them, the game wouldn't feel like itself. The six classes are anchors. The promotion event is an anchor. The final boss archetype is an anchor.
- **Surprises** are content from a *much larger pool* where any single run only sees a fraction. These are quests, NPCs, items, dungeons, locations, and encounters that may or may not appear in your campaign.

The math should be: **the surprise pool is at least 5× larger than what one run consumes.** If a run touches 12 surprise quests, the pool has at least 60. This means a player can play four full campaigns before they start seeing the same surprises, and even then the geographic and party variation makes them feel different.

## 16.2 What's an anchor (always present)

| Category | Anchors |
|---|---|
| **Classes** | All six base classes are always available at character creation |
| **Promotion** | The mid-campaign promotion event always happens |
| **Spell schools** | White and Black magic are always present, with the same spell tables |
| **Final boss** | A final boss always exists and is always defeatable |
| **The wizard** | The 6-question wizard always runs the same way |
| **Damage formula** | Combat math is identical across runs |
| **Stat curves** | Level-up math is identical across runs |
| **Ultimate weapons** | At least one ultimate weapon for each weapon class is *findable* in every run, though where it's found differs |
| **Transportation tiers** | All five tiers always unlock in order, though exact reskin and unlock-quest differ |
| **Difficulty levels** | Easy/Normal/Hard/Classic always selectable |

The principle: **mechanics are anchors. Content is surprise.** The player can always count on the *system* — they can never count on the *contents*.

## 16.3 What's a surprise (pool-based)

| Category | Pool size target | Per-run draw |
|---|---|---|
| **Side quests** | 60+ in the master pool | 8-12 per run |
| **Optional dungeons** | 20+ | 2-4 per run |
| **Hidden NPCs** | 30+ | 4-6 per run |
| **Rare monsters** | 40+ | 8-15 per run |
| **Unique items** (non-ultimate) | 50+ | 10-20 per run |
| **Easter egg locations** | 15+ | 1-3 per run |
| **Secret transportation** | 4+ (one per flavor minimum) | 0-1 per run |
| **Joke encounters** | 20+ | 1-2 per run |

A run that draws from the high end of these ranges sees about 50-70 unique pieces of surprise content. The full pool is closer to 250+. **A player can play 4-5 full campaigns before significant repetition.** Combined with the spawn-point and party-composition variations, each campaign feels meaningfully different.

## 16.4 The surprise selection algorithm

```
function build_surprise_pool(locality, flavor, difficulty, spawn, rng_seed):
    # Master pools loaded from shared/content/
    all_quests   = load("side_quests.json")    # 60+
    all_dungeons = load("optional_dungeons.json") # 20+
    all_npcs     = load("hidden_npcs.json")    # 30+
    all_items    = load("unique_items.json")   # 50+
    all_eggs     = load("easter_eggs.json")    # 15+

    # Filter by flavor compatibility
    pool = {
        quests:   filter(all_quests, can_appear_in(flavor)),
        dungeons: filter(all_dungeons, can_appear_in(flavor)),
        npcs:     filter(all_npcs, can_appear_in(flavor)),
        items:    filter(all_items, can_appear_in(flavor)),
        eggs:     filter(all_eggs, can_appear_in(flavor)),
    }

    # Filter by locality compatibility
    # (some content needs water, some needs forest, some needs urban, etc.)
    pool = filter_by_locality_features(pool, locality)

    # Seed the RNG so the same save always produces the same draws
    rand = seeded_rng(rng_seed)

    # Draw the per-run subset
    selected = {
        quests:   rand.sample(pool.quests, count=randint(8,12)),
        dungeons: rand.sample(pool.dungeons, count=randint(2,4)),
        npcs:     rand.sample(pool.npcs, count=randint(4,6)),
        items:    rand.sample(pool.items, count=randint(10,20)),
        eggs:     rand.sample(pool.eggs, count=randint(1,3)),
    }

    return selected
```

Two important details:

1. **Seeded by save, not by time.** The same save always produces the same content draws, so a player who reloads doesn't suddenly find different items. But starting a new save with the same locality produces a *different* draw — that's what makes "Cadott Run #2" feel new.
2. **Filtered by locality features.** Content tagged "needs_water" only appears in localities that have water nodes. Content tagged "needs_urban" only appears in localities with city features. This means rural Cadott and downtown Eau Claire pull from overlapping but distinct slices of the pool.

## 16.5 Content tagging schema

Every piece of surprise content has metadata:

```json
{
  "id": "quest_ratification",
  "name": "The Council's Petition",
  "category": "side_quest",
  "flavor_compatibility": ["governance", "conquest"],
  "locality_requirements": ["has_civic_building"],
  "act": 2,
  "difficulty_tier": 3,
  "rarity": "common",
  "tags": ["faction", "diplomatic"],
  "template": "Q09",
  "rewards": ["unique_item_tier3"],
  "blocks": [],
  "requires": []
}
```

The `blocks` and `requires` fields enable content chains — a surprise quest can require another surprise quest to have appeared first. This is how multi-part hidden storylines work.

## 16.6 Easter eggs as a category

Easter eggs are a special class of surprise content:

- **They're rarer than normal surprises** (1-3 per run, drawn from a pool of 15+)
- **They're discoverable only by exploration**, not by quest log markers
- **They reward curiosity disproportionately** (a hidden NPC might give you a tier-5 item at level 8)
- **They often gate the most interesting secret content** (secret transportation, secret classes, secret bosses)
- **They have nicknames the community will use** ("the Monster Island egg," "the Rat Tail run")

## 16.7 Examples of surprise content

To make this concrete, here are a few example entries (these would all live in `shared/content/`).

**Side quest examples:**

- *"The Moonlit Garden"* — A hidden NPC in any town with a park asks you to plant three seeds at moonlit landmarks. Reward: a permanent +5 MAX MP for one party member.
- *"The Lost Letter"* — Find an old letter in any wilderness dungeon, deliver it to its named recipient (procedurally matched to a friendly NPC). Reward: a unique accessory.
- *"The Tournament of Fools"* — A traveling competition appears in one random town. Win it for a unique title and cosmetic.

**Optional dungeon examples:**

- *"The Sunken Library"* — Requires water transportation. Has a unique boss and three pages of a magic tome (each a permanent stat boost).
- *"The Forgotten Workshop"* — Found behind a hidden wall in a random dungeon. Contains a secret weapon for one random class.

**Hidden NPC examples:**

- *"The Old Sage"* — Appears in one random temple. Will train one party member in a spell from the next tier early. One-time encounter.
- *"The Merchant of Curiosities"* — Wandering trader who only appears at night in towns with markets. Sells items found nowhere else.

**Easter egg examples:**

- *"Monster Island"* — A hidden island accessible only with T3+ transportation. Filled with monsters 5 levels above the local area. Excellent grinding spot. Has a secret superboss for the truly daring.
- *"The Old Speedrunner's Cave"* — A direct nod to FF1 speedrunners. Accessible early via a sequence break (see Section 17). Contains an item that lets you skip random encounters for 100 steps — a minor power but a wink to anyone who knows.
- *"The Author's Cabin"* — A small home in the woods with a single bookshelf. The books contain in-game hints about other easter eggs. Meta and intentional.

## 16.8 The "ultimate weapons always present" rule

You specifically called this out and it's important enough to make a hard rule.

**Every run guarantees at least one ultimate weapon (tier 7) per weapon class is findable somewhere in the campaign.** The *location* of these weapons is randomized — the Hero's Edge (sword) might be in the final dungeon in Run 1, in a hidden cave in Run 2, and as a quest reward in Run 3. But it is *always somewhere*.

This means a Warrior-heavy party in any run can always reach their best gear. The player who specializes will always be rewarded. This is non-negotiable: **specializing must always work.**

```json
// shared/content/ultimate_weapons.json
{
  "ultimates": [
    { "id": "ult_sword",   "name": "Hero's Edge",    "weapon_class": "sword",  "tier": 7 },
    { "id": "ult_axe",     "name": "World Splitter", "weapon_class": "axe",    "tier": 7 },
    { "id": "ult_dagger",  "name": "Whisperfang",    "weapon_class": "dagger", "tier": 7 },
    { "id": "ult_staff",   "name": "Starcaller",     "weapon_class": "staff",  "tier": 7 },
    { "id": "ult_bow",     "name": "Sky's Eye",      "weapon_class": "bow",    "tier": 7 },
    { "id": "ult_hammer",  "name": "Mountainvoice",  "weapon_class": "hammer", "tier": 7 }
  ],
  "placement_rules": {
    "guarantee": "all_must_be_findable_per_run",
    "method": "random_distribution_across_act3_locations",
    "reskinned_per_flavor": true
  }
}
```

In sci-fi flavor, "Hero's Edge" becomes "Plasma Cutter Mk VII." Same weapon, same stats, same role — just dressed differently.

---

# 17. Sequence Breaks & Hidden Quests

## 17.1 Why sequence breaks matter

A sequence break is content the player can access *out of intended order* by being clever, exploring carefully, or paying attention to clues. The Rat Tail / Adamant Armor quest in FF1 is the canonical example: a player who explores the right cave at the right time can grab a powerful item far earlier than the designers "expected."

This is **not a bug**. It's the kind of thing that turns players into evangelists. A player who finds a sequence break will tell their friends. That's organic marketing no ad budget can buy.

Kithlands needs sequence breaks. Specifically, it needs enough of them that even players who *know* there are sequence breaks have to hunt for the ones in *their* run.

## 17.2 The three kinds of sequence breaks

1. **Geographic sequence breaks** — physical locations the player can reach earlier than intended via a tricky route, careful pathing, or a rare encounter.
2. **Quest sequence breaks** — accepting and completing a high-tier quest before the prerequisites are normally available.
3. **Item sequence breaks** — finding and using a powerful item that wasn't meant to be available yet.

Each kind needs its own design treatment.

## 17.3 Geographic sequence break design

In the locality graph, every node has a default "intended access tier" — the minimum transportation tier expected to reach it. But the *actual* access depends on the graph topology, and sometimes a node is reachable on foot via a long path that the designer didn't anticipate.

Kithlands embraces this. The pathing system intentionally **does not prevent the player from walking to a far node early**. If they want to spend an hour walking through dangerous territory to reach a tier-3 dungeon at level 5, they can try. They'll probably die. But if they're clever (use a Mender, run from random encounters, save scum), they might make it.

The reward for surviving such a trek is a **proportional reward**: the dungeon contents weren't scaled down because the player arrived early. They get tier-3 loot at level 5. That's the sequence break payoff.

## 17.4 Quest sequence break design

Some surprise quests have **soft** prerequisites instead of **hard** ones. A "soft" prereq means the quest log doesn't show the quest until the prereq is met, but if a player happens to fulfill the prereq accidentally, the quest unlocks anyway.

Example: a quest to "deliver a message to the elder" might be supposed to appear in Act 2 after meeting the elder normally. But if a player finds the elder in Act 1 by exploring a hidden path, they get the quest then — and the quest's reward (a tier-3 item) is now available a full act early.

## 17.5 Item sequence break design

The classic Rat Tail design. An item that's *technically* placeable in an early-game location is *intended* to be found mid-game when the player has the resources to grab it. A clever player can grab it early.

The Kithlands implementation: certain optional dungeons have an **"early bypass"** mechanic. The dungeon has a secret entrance that only opens if the player has a specific key item — and that key item is itself findable in a place that's accessible early. The chain is intentional but invisible.

Example chain:
1. A "Strange Coin" can be bought from a wandering merchant in Act 1 for almost no money. (Trivial; players who explore notice it.)
2. The Strange Coin opens a hidden door in an Act 2 dungeon. (Also trivial — *if* you have the coin.)
3. Behind the door is a tier-4 ring with a permanent perk. (Major payoff.)

A player who sees the Strange Coin and ignores it has a normal run. A player who buys it on a hunch and tries it in every door eventually finds the payoff. **This is the kind of design that creates folk wisdom in a community** ("always buy the Strange Coin").

## 17.6 The "ratification" easter egg

Since you specifically called out the Rat Tail quest, here's the Kithlands homage. Working title: **"The Old Mayor's Petition."**

- A hidden NPC (the "Old Mayor," appears in any locality with a civic building) gives the player a quest to recover a ratified petition that was lost in a dangerous wilderness dungeon.
- The dungeon is technically Act 3 content. The party will be under-leveled and at significant risk if they go in early.
- The reward is a permanent piece of equipment: **"The Charter"** — an accessory that adds +2 to all stats and protects against status effects. Roughly equivalent to FF1's Ribbon.
- The quest only appears in *some* runs (it's in the easter egg pool), and only in localities with the right features.
- A player who finds it early and survives the dungeon has a significantly easier remainder of the campaign. A player who never finds it never knows what they missed — but the game is still beatable without it.

## 17.7 Sequence break safety

Sequence breaks must not break the campaign. Two rules:

1. **No sequence break can soft-lock the game.** Grabbing an item early should never prevent a later quest from completing.
2. **No sequence break can skip story-required content.** The promotion event, the final boss approach, and the campaign conclusion are always reachable.

The quest generator validates this at campaign creation by simulating a "no sequence break" path through the campaign and confirming all anchors are reachable. If they aren't, the campaign is regenerated with a different layout.

## 17.8 Letting the LLM be playful

The LLM is allowed (encouraged, even) to drop *very subtle* in-character hints about easter eggs in NPC dialogue. A barkeep might mention "the old mayor used to live up north before the troubles" — a player who remembers this and explores north might find the Old Mayor easter egg. The LLM doesn't *know* about easter eggs as a system (that's deterministic), but it's prompted with a list of "rumors" that correspond to active easter eggs in the current run, and it weaves them into ambient dialogue.

```
Prompt fragment for ambient dialogue:

You are writing one line of background dialogue for an NPC.
Available rumors (work ONE in if it fits naturally, otherwise ignore):
- "The old mayor lives somewhere north."
- "Strange coins have been found in the ruins."
- "Sailors say there's an island full of monsters past the western reef."

Output: a single sentence the NPC says.
```

This is the LLM at its best: making the world feel alive and full of secrets without actually being responsible for the secrets themselves.

---

# 18. v1 MVP Scope

Ruthless scoping. Everything not on this list is v2+.

## 18.1 v1 features (the must-haves)

- **Wizard locality loading** (no CSV, no OSM)
- **One flavor: Conquest**
- **Six base classes** with promotion at midcampaign
- **Combat system** with 5 status effects (poison, sleep, silence, stone, death)
- **Spell system** with 24 spells (12 white, 12 black) — top 3 levels only
- **Quest generator** using 6 of the 12 templates
- **One campaign structure** (3 acts, 8-12 quests, 6-10 hours of play)
- **All five transportation tiers** (T1-T5) with Conquest reskins
- **Surprise content pool** with these minimum sizes:
  - 30 side quests (run draws 8-12)
  - 10 optional dungeons (run draws 2-4)
  - 15 hidden NPCs (run draws 4-6)
  - 25 unique items (run draws 10-20)
  - 8 easter eggs (run draws 1-3)
  - 1 secret transportation (the "monster truck" equivalent for Conquest = a hidden dragon mount)
- **Ultimate weapons** for all six weapon classes, randomly placed each run
- **At least 3 sequence breaks** baked into the geographic and quest layouts
- **Difficulty levels:** Easy, Normal, Hard
- **Save system** with multi-save per locality
- **Auth via email magic-link**
- **Content safety pipeline**
- **LLM gateway with Ollama (local) only** — no Anthropic in v1
- **Phaser frontend with**: title screen, wizard, world map, town interior, battle scene, menu
- **Mobile-friendly responsive UI**

## 18.2 v1 explicitly NOT included

- Multiplayer
- Sound and music (placeholder beeps only)
- Native desktop or mobile wrappers
- CSV upload
- OSM auto-pull
- Any flavor besides Conquest
- Class promotion having multiple paths
- Tournament / minigame content
- Crafting
- Pet/mount system
- Player vs player anything
- Achievements
- Leaderboards
- Mod support
- More than the minimum surprise pool sizes (full pool of 60+ quests is a v1.1 goal)
- Vehicle combat (transportation is travel-only in v1)

## 18.3 The "playable in 4 weeks with the Programming Club" cut

If 4 weeks is the budget, cut even further:

- **Two classes only** (Warrior, Cinder) — proves combat math + magic
- **Three quest templates** (Fetch, Bandit clearing, Boss)
- **Five monsters** (slime, goblin, wolf, skeleton, big-bad)
- **One spawn point** (you don't get to pick yet)
- **One locality** (whatever you wizard-loaded; no save list)
- **No class promotion**
- **One difficulty: Normal**
- **Two transportation tiers only** (T1 foot, T2 horse)
- **Surprise pool: 5 side quests, 1 easter egg, 2 hidden NPCs**
- **One ultimate weapon** (Hero's Edge for sword users — proves the placement system)
- **One sequence break** (proves the soft-prerequisite logic)

This is the **demo cut**. It proves the loop. Once it's running, expand to v1 proper.

---

# 19. v2+ Roadmap

| Version | Theme | Headline features |
|---|---|---|
| **v1.0** | Prove the loop | Conquest, wizard, Cadott Programming Club playtests |
| **v1.1** | Polish | Sound, music, animations, balance pass after first round of playtests |
| **v2.0** | Prove flavors work | Sci-Fi flavor, CSV upload, Anthropic LLM in production |
| **v2.5** | Mobile | Capacitor wrapper for iOS/Android; sound polish |
| **v3.0** | The civics moment | Governance flavor, OSM auto-pull, school pilot program |
| **v3.5** | Native desktop | Wails wrapper for Windows/Mac/Linux |
| **v4.0** | Entrepreneurship flavor + mod support | JSON-driven custom flavors users can share |
| **v5.0** | Multiplayer? | Co-op runs through a shared locality. Speculative. |

Each version ships when it's ready, not on a calendar. The Programming Club is the alpha test bed for everything.

---

# 20. Open Questions

These are the things I don't know yet. They block v1.1 or later, not v1.0.

1. **How large should a campaign be in actual hours?** Target was 6-12 but this needs playtest confirmation.
2. **Should the player choose their spawn point or is it always random?** Currently spec'd as "or random" — needs UX testing.
3. **How does the LLM handle bilingual locality names?** ("Calle Principal" vs "Main Street") Needs testing.
4. **Should there be permadeath in any difficulty?** Classic FF1 had no permadeath — Phoenix Down revived. Some players like permadeath. Maybe a difficulty toggle.
5. **How do flavors interact with party composition?** Should Governance flavor restrict to non-magic classes? Probably not — magic becomes "rhetoric" — but needs spec.
6. **Should a save be sharable?** "Here's my Cadott save, try it." Cool but adds privacy considerations.
7. **Mobile controls** — how does turn-based combat feel with touch input? Probably fine, but needs testing.
8. **Localization** — English-only for v1, but the architecture should not preclude i18n.
9. **Accessibility** — colorblind mode, font scaling, screen reader support. Should be in v1, may slip to v1.1.
10. **What's the actual win screen?** A retrospective montage of the player's journey through their hometown? An export of their campaign as a shareable image? This is an opportunity.

---

# Appendix A: Glossary

| Term | Definition |
|---|---|
| **Locality** | A player's loaded world. A graph of nodes and edges. |
| **Node** | One person, place, business, landmark, or natural feature in a locality. |
| **Edge** | A relationship between nodes (proximity, social, factional, historical). |
| **Spawn** | The node the player starts at. Determines opening content. |
| **Flavor** | A coherent reskin of the game (Conquest, Sci-Fi, Governance, Entrepreneurship). |
| **Quest grammar** | The 9 primitive actions used to compose quests. |
| **Quest template** | A parameterized sequence of quest grammar actions. |
| **Promotion** | The mid-campaign event that upgrades all classes to their advanced version. |
| **Strong level** | A level-up with guaranteed bonus stats (FF1-style). |
| **Spell charge** | A use of a spell at a given spell level. Restored at inns. |
| **Wizard** | The 6-question flow for creating a new locality. |
| **Anchor** | Content that appears in every run (the six classes, the promotion event, the ultimate weapons). |
| **Surprise** | Content drawn from a larger pool where any single run sees only a fraction. |
| **Sequence break** | Reaching content out of intended order via clever play. Rewarded, not punished. |
| **Easter egg** | Rare hidden content discoverable by exploration; often gates secret transportation or secret bosses. |
| **Soft prerequisite** | A quest condition that makes the quest visible if met early, instead of blocking access. |
| **Transportation tier** | One of T1-T5; determines movement range and unlocks new regions of the locality. |
| **Big bad** | The final boss of a campaign, picked from highest-importance distant nodes. |

---

# Appendix B: Inspirations & References

- **Final Fantasy I (1987)** — Class system, six base classes with promotions, spell charges per spell level, party of four, subtractive damage formula, hit% scaling number of attacks. Also the source of the "Rat Tail / Adamant Armor" sequence break that inspired Section 17.
- **Hades (2020), Slay the Spire (2019), Caves of Qud (2015)** — The two-tier "anchors and surprises" content model. Reference for how to make a procedural game survive 100+ hours of replay without feeling repetitive.
- **Dwarf Fortress** — Emergent narrative from simulated systems.
- **Stardew Valley** — Cozy local stakes, retro presentation.
- **Doran & Parberry, "Towards Procedural Quest Generation: A Structural Analysis of RPG Quests" (2010)** — The 9-action quest grammar, the 9 NPC motivations.
- **Värtinen, Hämäläinen & Guckelsberger, "Generating Role-Playing Game Quests With GPT Language Models" (2024)** — Empirical evidence that ~1 in 5 LLM-generated quests is acceptable; foundation for the "structure first, LLM second" rule.
- **StoryWorld (2023)** — Event-driven simulation of items, locations, characters, memories, and desires.
- **OpenStreetMap** — The free geographic data source for Method C locality loading.

---

*End of design document v0.1. Update this as decisions are made. Keep it as the source of truth.*
