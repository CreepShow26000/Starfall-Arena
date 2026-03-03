# Starfall Arena

Fast browser arena shooter with:
- Auto-fire combat
- Local co-op wingman
- Boss waves, missions, modifiers
- Persistent meta progression (localStorage)

## Play locally

```bash
cd "/Users/iansnyder/Documents/SUPREME COMMANDER/FUN GAME"
npm run dev
```

Open: `http://localhost:5173`

## Online Multiplayer (Host + Guest)

Run two services:

```bash
npm run multiplayer
```

and in another terminal:

```bash
npm run dev
```

Then open the game in two browsers/devices:
- Host player: press `H` in menu to create room.
- Guest player: press `G` and enter room code.
- Disconnect: `X`.

### If websocket server is on another host

Set this before `game.js` loads:

```html
<script>
  window.MULTIPLAYER_WS_URL = "wss://your-websocket-domain";
</script>
```

## Controls

- P1 move: `WASD` / Arrows
- P1 aim: Mouse
- P1 dash: `Shift`
- P1 bomb: `E`
- Warp wave: `Enter`
- Weapon swap: `1/2/3` (unlocked weapons)
- Pause: `P`
- Fullscreen: `F`

- P2 (co-op) move: `IJKL`
- P2 dash: `O`
- P2 bomb: `U`

- Menu:
  - Start run: `Enter` / click
  - Toggle co-op: `J`
  - Permanent upgrades: `7` Hull, `8` Cannons, `9` Thrusters

## Publish as a website (no install needed)

Any static host works because this game is plain HTML/CSS/JS.
For online multiplayer, you also need to deploy `multiplayer-server.js` on a Node host.

### Option A: GitHub Pages

1. Push this folder to a GitHub repo.
2. In GitHub repo settings, enable Pages using **GitHub Actions**.
3. The included workflow at `.github/workflows/deploy-pages.yml` publishes automatically on push to `main`.
4. Share the Pages URL.

### Option B: Netlify

1. Create a new Netlify site from your repo.
2. Build command: leave empty.
3. Publish directory: `.` (repo root).
4. Deploy and share the generated URL.

### Option C: Vercel

1. Import the repo into Vercel.
2. Framework preset: `Other`.
3. Build command: none.
4. Output directory: `.`.
5. Deploy and share the URL.

## Notes

- Runs and shard progression are saved in browser `localStorage` under key `starfall_meta_v1`.
- On a different device/browser, progression starts fresh unless you implement cloud account sync.

## Online multiplayer (next step)

Current co-op is local (same keyboard).  
To support internet multiplayer, next step is adding a websocket game server and room system.
