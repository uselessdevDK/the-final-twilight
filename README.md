# The Final Twilight

A first-person survival shooter that runs in a single HTML file. No build step, no dependencies, no asset files — everything (engine, weapons, zombies, sound, UI) is generated in code.

Find the bunker, go inside, find the power switch, and get out before the horde closes in.

## Play

Open `index.html` in a browser. That's it.

Create a local operative on the login screen — cash, weapons, chapters and stats are saved per name in your browser's storage.

## Controls

| Input | Action |
|---|---|
| `WASD` | move |
| Arrow keys | look (no mouse lock needed) |
| Mouse | aim (click to lock the pointer) |
| Left click | fire |
| Right click | aim down sights |
| `Space` | jump |
| `Shift` | slide |
| `R` | reload |
| `1-4` / `Q` / wheel | switch weapon slot |
| `[` `]` | mouse sensitivity |
| `Esc` | pause |

Doors open automatically as anything living approaches.

## Modes

- **Chapters** — three story missions. Each has three phases: clear the outside, descend into the bunker, then escape. A kill quota gates the hatch, the power switch and the exit.
- **Normal** — first to five kills on the map the lobby votes for.
- **Endless** — waves that keep growing until you die.
- **Randomized** — endless, but your whole loadout re-rolls on every kill.
- **Map vote** — before a free-play round, four arenas are nominated and the lobby picks one.

## Content

- **8 arenas**: open fields, a room grid with doors, a freeway, pillar halls, and three bunkers
- **16 weapons** across four slots (main, secondary, bomb, knife)
- **8 zombie types**: shambler, runner, crawler, brute, armored, spitter, healer, necromancer
- **4 classes**: assault, medic, scout, tank
- **Armory** with per-category unlock and equip

## Tech

- Canvas 2D raycasting renderer with per-arena wall palettes, variable wall heights, procedural ceilings and doors
- Procedural audio (WebAudio): drone, wind, creaks, heartbeat, weapon and impact sounds
- Deterministic map generators so every arena is connected and sealed

## Tests

There is no framework — just Node scripts that run the real game against a stubbed canvas.

```bash
node tests/smoke-test.js index.html   # plays chapters, modes, shop, accounts, checks UI layout
node tests/map-check.js index.html    # validates every arena
```

The smoke test drives keyboard and mouse events, plays a full chapter start to finish, buys weapons, switches accounts, and asserts that no UI element overlaps at five different window sizes.

## License

MIT
