# Wunioid Remastered

*Wunioid* is a brick breaker for Windows in the spirit of *Arkanoid: Revenge of Doh*. Wunibald of Horse
Productions wrote it in Delphi 3 with DelphiX in 1998 and released it as freeware in March 1999: 13 kinds of
stones, 16 bonus capsules, two courses of 32 levels, high scores, and a level and course editor. This project
brings it back to life in the browser, in the same way as
[Dark Planet Remastered](https://github.com/aimfeld/dark-planet):

- **Classic 1999**: the original as it was.
- **Remastered**: the same game with sharper graphics, smooth motion and effects.

Work in progress: see [docs/PLAN.md](docs/PLAN.md). Both modes run: `cd game && npm install && npm run dev`.
Remastered is the default and starts on its title screen; **R** switches between Remastered and Classic at any
time (also in the menus, or `?classic` in the URL).

Keys as in the original: ← → (or H L, keypad 4 6) move, Space (or Z) fires and releases the ball, ↑ (K, keypad 8)
releases it. The remake adds the mouse, touch buttons and gamepads, P for pause, F for fullscreen, F2 for a new game,
and in Remastered Esc (or ☰ on touch, Start on a gamepad) for the menu.

## Docs
- [docs/PLAN.md](docs/PLAN.md): goals, architecture, phases, decisions
- [docs/inventory.md](docs/inventory.md): what survives of the original
