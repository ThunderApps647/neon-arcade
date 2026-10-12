# NEON ARCADE

A 3D, mobile-first, **real-time multiplayer** arcade sim. Walk around a neon arcade with your friends, play machines, win tickets, and cash them in at the prize counter.

## What's inside

| Machine | How it works | Multiplayer |
|---|---|---|
| **Coin Pushers** (x3) | Tap the playfield to drop a coin ($0.25). Coins pushed off the front edge pay tickets; pink tokens pay big. A random **bonus slot** drops coin showers, tickets, and jackpots. | Physics run **on the server**, so everyone sees the exact same coins in real time. |
| **Claw Machines** (x4) | 20 seconds to aim with the D-pad, then DROP. Grip strength is decided by the server (dead-center grabs hold better). | Spectators watch the claw move live. |
| **Key Master** (x2) | Stop the key dead-center on a prize lock. Like the real thing, aligning is only half of it; the lock has to turn. | Live spectating. |
| **Stackem Up** (x2) | Classic stacker. 11 rows = MINOR prize (take it or risk it), 15 rows = MAJOR. Speeds up every row. | Live spectating. |
| **Big Bass Wheel** | Spin for 5 to 500 tickets (server-decided outcome). | Everyone sees the spin. |
| **Prize Counter** | Trade tickets for prizes. | Big redemptions are announced to the room. |
| **Change Machine** | Free $10 refill when you're under $1 (90s cooldown). | |

Plus: 3D avatars with name tags, chat bubbles, quick emotes, live win announcements, a ticket leaderboard, "in use" machine locking, and a Watch button to spectate a friend.

Progress (credits, tickets, prizes) is saved on the server in `data.json`, keyed to a token stored in each player's browser.

## Run it (30 seconds)

Requires **Node.js 18+**. There are **no npm dependencies**: the server is a single file using only Node built-ins.

```bash
node server.js
# NEON ARCADE running on http://localhost:3000
```

### Play on phones on the same Wi-Fi
1. Find your computer's local IP (e.g. `192.168.1.23`).
2. Everyone opens `http://192.168.1.23:3000` on their phone.
3. Tip: "Add to Home Screen" gives a full-screen app feel.

## Put it online (play with anyone)

Any host that supports **Node + WebSockets** works. The server reads `PORT` from the environment.

- **Render (free tier):** push this folder to a GitHub repo, then New > Blueprint (uses `render.yaml`) or New > Web Service with start command `node server.js`. Free instances sleep when idle and their disk resets on redeploy, so attach a persistent disk and set `DATA_FILE=/var/data/data.json` if you want progress to survive.
- **Railway / Fly.io:** deploy the folder (a `Dockerfile` is included). Mount a volume at `/data` to keep saves.
- **Your own PC, public link:** run `node server.js`, then `cloudflared tunnel --url http://localhost:3000` (Cloudflare Tunnel) to get a public `https://` URL that supports WebSockets.
- **VPS with Docker:**
  ```bash
  docker build -t neon-arcade .
  docker run -d -p 80:3000 -v arcade-data:/data --restart unless-stopped neon-arcade
  ```

HTTPS hosts automatically use secure WebSockets (`wss://`); nothing to configure.

## Controls

- **Phone:** drag on the left half of the screen to walk (virtual joystick), drag on the right half to look around. Walk up to a machine and tap **PLAY**.
- **Desktop:** WASD / arrows to walk, drag to look, **E** to use a machine, **Space** to stop/drop, **Esc** to exit.

## Tuning the economy

Everything is at the top of `server.js` in `CFG` (prices, refill amount, win chances, pusher payouts) plus `CATALOG` (prize-counter prices) and `WHEEL` / `WHEEL_W` (wheel values and weights). Machine layout is in `MACHINES`; add more machines by adding entries.

## Offline / no-CDN mode

The client loads three.js from `cdn.jsdelivr.net`. To self-host it, download
`https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js` into `public/vendor/three.module.js` and change the import map in `public/index.html` to `"three": "./vendor/three.module.js"`.

## Notes on fairness

Money, tickets, prizes, the coin-pusher physics, claw grip, Key Master lock, and the wheel are all decided on the server. The *skill* parts of claw aiming and Stackem Up timing are reported by the client, which is fine for friends but not cheat-proof against someone editing the JavaScript.

## Files

```
server.js            HTTP + WebSocket server, game world, physics, economy (zero dependencies)
public/index.html    App shell + HUD
public/style.css     Neon mobile UI
public/game.js       3D client (three.js): arcade, machines, avatars, controls, netcode
Dockerfile, render.yaml
```
