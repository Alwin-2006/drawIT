# drawIT — Full Application Documentation

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Directory Structure](#3-directory-structure)
4. [Backend](#4-backend)
   - 4.1 [Entry Point — server.js](#41-entry-point--serverjs)
   - 4.2 [Authentication](#42-authentication)
   - 4.3 [Database — MongoDB & Mongoose](#43-database--mongodb--mongoose)
   - 4.4 [Redis — Deep Dive](#44-redis--deep-dive)
   - 4.5 [BullMQ — Deep Dive](#45-bullmq--deep-dive)
   - 4.6 [Socket.IO Server](#46-socketio-server)
   - 4.7 [Game Service](#47-game-service)
   - 4.8 [ELO Service](#48-elo-service)
   - 4.9 [REST Controllers & Routes](#49-rest-controllers--routes)
   - 4.10 [Middleware](#410-middleware)
   - 4.11 [Utilities](#411-utilities)
5. [Frontend](#5-frontend)
   - 5.1 [Routing & App Shell](#51-routing--app-shell)
   - 5.2 [State Management — Zustand](#52-state-management--zustand)
   - 5.3 [Socket Client](#53-socket-client)
   - 5.4 [Pages](#54-pages)
   - 5.5 [Hooks](#55-hooks)
   - 5.6 [Reducers](#56-reducers)
   - 5.7 [Components](#57-components)
6. [Data Flow Walkthroughs](#6-data-flow-walkthroughs)
   - 6.1 [Casual Matchmaking](#61-casual-matchmaking)
   - 6.2 [Ranked Matchmaking](#62-ranked-matchmaking)
   - 6.3 [In-Game Round Lifecycle](#63-in-game-round-lifecycle)
   - 6.4 [Ranked Disconnect & Reconnect](#64-ranked-disconnect--reconnect)
   - 6.5 [Leaderboard Read Path](#65-leaderboard-read-path)
7. [Redis Key Reference](#7-redis-key-reference)
8. [Environment Variables](#8-environment-variables)

---

## 1. Project Overview

drawIT is a real-time multiplayer drawing-and-guessing game (think Skribbl.io). Players join casual or ranked rooms, take turns drawing a secret word while others guess it in a live chat, and earn points based on how fast they guess. Ranked games also affect a persistent ELO rating stored in MongoDB.

**Tech stack at a glance**

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS 4, Zustand, React Router 7, Socket.IO client |
| Backend | Node.js (ESM), Express 5, Socket.IO, BullMQ, ioredis, Mongoose |
| Database | MongoDB (players, ratings) |
| Cache / Queue broker | Redis (game state, leaderboard, BullMQ queues) |

---

## 2. Architecture

```
Browser (React)
    │  HTTP REST  ──►  Express  ──►  MongoDB
    │  WebSocket  ◄──► Socket.IO
    │
    │         Socket.IO events
    │           ▼        ▲
    │       BullMQ Workers
    │       (casualWorker, rankedWorker)
    │           │
    │           ▼
    │         Redis  ◄──  all game state, queues, leaderboard
```

The backend is a single Node.js process that:
- Serves REST endpoints via Express
- Handles WebSocket connections via Socket.IO
- Runs two BullMQ workers (casual and ranked matchmaking) in the same process
- Persists all *transient* game state (rooms, scores, current word, timers) in Redis
- Persists *permanent* player data (username, password hash, rating) in MongoDB

Redis is therefore the single source of truth for anything in-flight. If the server restarts, MongoDB preserves ratings and the leaderboard is re-seeded from it.

---

## 3. Directory Structure

```
drawIT/
├── backend/
│   ├── controllers/
│   │   ├── auth.controller.js       # signup, login, logout
│   │   └── game.controller.js       # leaderboard, player stats, next-round, update-score
│   ├── db/
│   │   └── connectToMongoDB.js      # Mongoose connect + leaderboard seed
│   ├── middlewares/
│   │   └── auth.middleware.js       # JWT Bearer token verification
│   ├── models/
│   │   └── player.model.js          # Mongoose schema (username, password, rating)
│   ├── queues/
│   │   ├── casualQueue.js           # BullMQ Queue + JobScheduler (casual)
│   │   ├── casualQueueSocket.js     # Socket event → add job to casualQueue
│   │   ├── casualWorker.js          # BullMQ Worker: casual matchmaking logic
│   │   ├── rankedQueue.js           # BullMQ Queue (ranked)
│   │   ├── rankedQueueEvents.js     # Socket event → add job to rankedQueue
│   │   └── rankedWorker.js          # BullMQ Worker: ranked matchmaking + ELO buckets
│   ├── redis/
│   │   └── redis.js                 # ioredis client singleton
│   ├── routes/
│   │   ├── authRoutes.js
│   │   └── gameRoutes.js
│   ├── services/
│   │   ├── eloService.js            # ELO calculation (FFA variant)
│   │   └── gameService.js           # Round timers, scoring, end-round, end-game
│   ├── utils/
│   │   └── gameUtils.js             # Constants + pure helpers
│   └── server.js                    # Express app bootstrap
│
└── frontend/
    └── src/
        ├── components/
        │   ├── ChatPanel.jsx
        │   ├── EndGameOverlay.jsx
        │   ├── Navbar.jsx
        │   ├── PlayersList.jsx
        │   ├── RoundEndOverlay.jsx
        │   └── WhiteBoard.jsx
        ├── hooks/
        │   ├── useFetchData.jsx
        │   ├── useGameSocket.js
        │   ├── useGameTimers.js
        │   └── usePlayerResolution.js
        ├── pages/
        │   ├── Game.jsx
        │   ├── Home.jsx
        │   ├── Leaderboard.jsx
        │   ├── Login.jsx
        │   ├── Rooms.jsx
        │   └── SignUp.jsx
        ├── reducers/
        │   └── gameReducer.js
        ├── store/
        │   └── userStore.js          # Zustand persisted store
        ├── utils/
        │   └── gameUtils.js          # Frontend constants + canvas helpers
        ├── socket.js                 # Socket.IO client singleton + helpers
        ├── App.jsx
        └── main.jsx
```

---

## 4. Backend

### 4.1 Entry Point — server.js

`server.js` bootstraps everything in order:

1. CORS headers are set permissively (`*`) via a custom middleware so pre-flight OPTIONS requests are handled before anything else.
2. `express.json()` parses request bodies.
3. REST routes are mounted: `/api/auth` and `/api/game`.
4. An `http.Server` wraps the Express app so Socket.IO can share the same port.
5. `initSocket(server)` creates the Socket.IO server and registers all event handlers.
6. `createCasualWorker(io)` and `createRankedWorker(io)` spin up BullMQ workers, passing the Socket.IO instance so they can emit events to clients when matches are found.
7. The server listens on port 3000, then calls `connectToMongoDB()` which also seeds the Redis leaderboard.

```
server.listen(3000, () => {
  connectToMongoDB();   // connects Mongoose → seeds leaderboard cache
});
```

---

### 4.2 Authentication

**Signup** (`POST /api/auth/signup`)
- Validates that username and password are present.
- Checks for duplicate username in MongoDB.
- Hashes the password with `bcryptjs` (salt rounds = 10).
- Saves the new `Player` document.
- Returns `{ _id, username, rating, token }` — the token is a JWT signed with `JWT_SECRET`, valid for 30 days.

**Login** (`POST /api/auth/login`)
- Finds the player by username.
- Compares the provided password against the stored hash with `bcrypt.compare`.
- Returns the same shape as signup on success.

**Logout** (`POST /api/auth/logout`)
- Stateless — the server does nothing. The client drops the token from localStorage.

**JWT structure**

```json
{ "id": "<MongoDB _id>", "iat": ..., "exp": ... }
```

The `id` field is the player's MongoDB ObjectId string, used everywhere as the canonical player identifier in ranked flows.

---

### 4.3 Database — MongoDB & Mongoose

**Player model** (`models/player.model.js`)

```
Field       Type      Default   Notes
─────────────────────────────────────────────
_id         ObjectId  auto      MongoDB primary key
username    String    required  unique, trimmed
password    String    required  bcrypt hash
rating      Number    1200      ELO rating, floored at 1200
isAdmin     Boolean   false
createdAt   Date      auto      from timestamps: true
updatedAt   Date      auto
```

A descending index on `rating` is declared at the schema level:

```js
playerSchema.index({ rating: -1 });
```

This makes the top-100 leaderboard query (`find().sort({ rating: -1 }).limit(100)`) a pure index scan — no collection scan needed.

**connectToMongoDB.js**

After the Mongoose connection resolves, it immediately calls `rebuildLeaderboardCache()` from the game controller. This means Redis is warm with the top-100 leaderboard data before any client request arrives.

---

### 4.4 Redis — Deep Dive

#### Client (`redis/redis.js`)

The project uses **ioredis** (not the official `redis` npm package, despite it being in `package.json` — ioredis is what's actually imported everywhere).

```js
const client = new Redis(redisUrl, {
  maxRetriesPerRequest: null,   // BullMQ requirement
  enableOfflineQueue: false,    // fail fast if disconnected
});
```

- `maxRetriesPerRequest: null` is **required** by BullMQ — it tells ioredis to keep retrying blocked commands indefinitely, which is necessary for BullMQ's `BRPOPLPUSH`-style polling.
- `enableOfflineQueue: false` means any command issued while Redis is unreachable throws immediately rather than queuing in memory.

The same client instance is shared across the entire backend — game state, leaderboard, and BullMQ all use it.

#### How Redis is used

Redis serves four distinct roles in this application:

---

##### Role 1: Game Room State

All live game data is stored in Redis hashes, sets, lists, and strings keyed by room ID. This means the server is stateless beyond the in-memory timer map — any crash that preserves Redis will lose only the countdown timers.

| Key pattern | Type | Contents |
|---|---|---|
| `room:{room}:players` | Hash | `playerId → JSON({playerId, playerName, score, socketId})` |
| `room:{room}:scores` | Sorted Set | `score → playerId` (for fast ranking) |
| `room:{room}:words` | List | JSON word objects submitted by players |
| `room:{room}:submittedPlayers` | Set | playerIds who submitted a word |
| `room:{room}:currentWord` | String | normalized word being drawn (lowercase, trimmed) |
| `room:{room}:currentDrawer` | String | playerId of the current drawer |
| `room:{room}:guessedPlayers` | Set | playerIds who guessed correctly this round |
| `room:{room}:lastDrawer` | String | playerId of last round's drawer (for rotation) |
| `room:{room}:turnsInRound` | String | integer counter — how many turns have fired in the current round |
| `room:{room}:roundsRemaining` | String | integer — rounds left before game ends |
| `room:{room}:roundStartedAt` | String | Unix timestamp (ms) of when the round timer started |
| `room:{room}:data` | String | raw drawing stroke history (cleared on `clearDrawing`) |

The `scores` sorted set and `players` hash are kept in sync on every correct guess so that both score lookups (by rank order via ZRANGE) and player object fetches (by ID via HGET) are O(log N) and O(1) respectively.

---

##### Role 2: Matchmaking Room Staging

Before players are matched and navigate to the game, BullMQ workers stage them in Redis:

**Casual**

| Key | Type | Contents |
|---|---|---|
| `casual:openRooms` | Sorted Set | `timestamp → roomId` for rooms with < 4 players |
| `casual:room:{roomId}:members` | Hash | `playerId → JSON(job data)` |

**Ranked**

| Key | Type | Contents |
|---|---|---|
| `ranked:{bucket}:openRooms` | Sorted Set | one per ELO bucket (bronze/silver/gold/platinum) |
| `ranked:room:{roomId}:members` | Hash | `playerId → JSON(job data)` |
| `ranked:room:{roomId}:data` | Hash | `{ bucket, createdAt, isRanked: '1' }` |
| `ranked:player:{playerId}:room` | String | active roomId for reconnect detection |

---

##### Role 3: Leaderboard Cache

Two keys hold the top-100 leaderboard, rebuilt from MongoDB on server start and invalidated after every ranked game ends:

| Key | Type | Contents |
|---|---|---|
| `player:leaderboard` | Sorted Set | `rating → playerId` — sorted by score, highest first |
| `player:leaderboard:names` | Hash | `playerId → username` |

Both keys carry a TTL of 5 minutes (`LEADERBOARD_TTL = 300`). If they expire between rebuilds, the next GET request triggers a cold rebuild from MongoDB before responding.

**Why two separate keys?**

A sorted set stores only `score` and `member`. Usernames are variable-length strings that would blow up memory if stored as members (members must be unique strings, but you'd need a composite key). The hash is a separate O(1) lookup by playerId — after reading the sorted set, a single `HMGET` batches all username fetches in one round-trip.

**Rebuild pipeline**

```
DEL player:leaderboard
ZADD player:leaderboard <rating> <playerId>   × 100
DEL player:leaderboard:names
HSET player:leaderboard:names <id> <username> × 100
EXPIRE player:leaderboard 300
EXPIRE player:leaderboard:names 300
```

All commands are batched in a single ioredis pipeline (`redisClient.pipeline().exec()`) — one TCP round-trip for up to ~205 commands.

---

##### Role 4: BullMQ Queue Storage

BullMQ uses Redis as its entire persistence layer. Queues, jobs, workers, and delayed retry state all live in Redis. This is covered in the BullMQ section below.

---

#### Lua Scripts

The workers use an inline Lua script (`addPlayerToRoomScript`) executed via `redis.eval` to atomically add a player to a room:

```lua
local current = redis.call('hlen', roomKey)
if current >= maxPlayers then
  return {err = 'ROOM_FULL'}
end
redis.call('hset', roomKey, playerId, playerData)
current = redis.call('hlen', roomKey)
if current < maxPlayers then
  redis.call('zadd', openRooms, score, roomId)
else
  redis.call('zrem', openRooms, roomId)
end
return current
```

**Why Lua?** Redis executes scripts atomically — no other command can run between the `hlen` check and the `hset`. Without it, two workers processing concurrent jobs could both see `count < 4`, both add their player, and overflow the room to 5 members. The Lua script makes the check-then-set a single indivisible operation.

---

### 4.5 BullMQ — Deep Dive

BullMQ is a Node.js job queue library built on Redis. It replaces the need for a separate message broker (like RabbitMQ) by using Redis data structures to manage job lifecycle.

#### Core concepts

| Concept | What it is |
|---|---|
| **Queue** | A named channel you push jobs into (`queue.add('jobName', data)`) |
| **Job** | A unit of work with a JSON payload, stored in Redis |
| **Worker** | A process (or in this case, a function) that pulls jobs from a queue and executes them |
| **JobScheduler** | Manages delayed/repeated jobs — used here for the casual queue |

BullMQ stores jobs across several Redis keys internally:

```
bull:{queueName}:wait       — jobs ready to be processed (list)
bull:{queueName}:active     — jobs currently being processed (list)
bull:{queueName}:completed  — finished jobs (sorted set, if not removeOnComplete)
bull:{queueName}:failed     — failed jobs (sorted set, if not removeOnFail)
bull:{queueName}:delayed    — jobs waiting for their delay to expire (sorted set)
bull:{queueName}:{jobId}    — job data hash
```

When a Worker processes a job, it atomically moves it from `wait` → `active` using a Lua script internal to BullMQ. On completion it moves to `completed` (or is removed if `removeOnComplete: true`).

#### Casual Queue

**Queue setup** (`casualQueue.js`)

```js
const casualQueue = new Queue('casual-game-queue', { connection: client });
const casualQueueScheduler = new JobScheduler('casual-game-queue', { connection: client });
```

The `JobScheduler` is required for retries with backoff — it watches the `delayed` key and re-queues jobs when their delay expires.

**Adding a job** (`casualQueueSocket.js`)

When the client emits `playCasual`, the socket handler adds a job immediately:

```js
socket.on('playCasual', async ({ playerId, playerName, preferences }) => {
  const job = await casualQueue.add('findMatch', {
    playerId, playerName, socketId: socket.id, preferences,
    requestedAt: new Date().toISOString(),
  }, {
    removeOnComplete: true,
    removeOnFail: true,
    attempts: 2,
    backoff: { type: 'fixed', delay: 3000 },
  });
  socket.emit('playCasualQueued', { jobId: job.id, ... });
});
```

- `removeOnComplete: true` keeps Redis lean — finished jobs are deleted immediately.
- `attempts: 2` with a 3-second fixed backoff means if the worker throws, BullMQ waits 3 seconds and tries again once before marking the job failed.

**Worker logic** (`casualWorker.js`)

The worker runs with `concurrency: 5`, meaning up to 5 jobs execute simultaneously in the same Node.js process (not separate threads — they interleave at `await` boundaries).

For each job:

1. Check `casual:openRooms` sorted set for a room with space. Take the first result (`ZRANGE ... 0 0`).
2. If none exists, generate a new `roomId`.
3. Run the Lua script atomically: add the player to `casual:room:{roomId}:members`, keep the room in `openRooms` if it still has space, or remove it if now full.
4. If the room is **not full yet**: emit `matched` to the new player with `roomReady: false` (they navigate to the game page and wait), and emit `playerJoined` to the existing members.
5. If the room **is full** (count ≥ 4): emit `matched` to all 4 players with `roomReady: true` — they all navigate to `/game/{roomId}` at the same time.

The room ID is the game room ID — once players navigate to it and emit `joinRoom`, the Socket.IO server takes over and the staging keys in Redis are no longer used.

#### Ranked Queue

**Queue setup** (`rankedQueue.js`)

```js
export const rankedQueue = new Queue('ranked-game-queue', { connection: client });
```

No `JobScheduler` is needed here because ranked jobs don't use delayed retries in the same way.

**Adding a job** (`rankedQueueEvents.js`)

The `playRanked` socket event triggers a JWT verification and a MongoDB fetch before enqueueing:

```
socket.on('playRanked') →
  1. Verify JWT from socket.handshake.auth.token
  2. Player.findById(decoded.id)   ← get fresh rating from DB
  3. rankedQueue.add('findRankedMatch', { playerId, playerName, rating, socketId })
  4. socket.emit('playRankedQueued', { rating })
```

Fetching the rating fresh from MongoDB at queue time is important — it prevents a stale Zustand store value from placing a player in the wrong ELO bucket.

**ELO Buckets**

The ranked worker sorts players into tiers before matching:

```
Platinum:  rating ≥ 1800
Gold:      rating ≥ 1600
Silver:    rating ≥ 1400
Bronze:    rating ≥ 1200  (default)
```

Each bucket has its own `openRooms` sorted set in Redis (`ranked:{bucket}:openRooms`). A gold player will never be matched with a bronze player.

**Worker logic** (`rankedWorker.js`)

Same structure as casual, but:
- The bucket is derived from the player's rating before looking up open rooms.
- After adding the player, `ranked:room:{roomId}:data` is set with `{ isRanked: '1', bucket, createdAt }`. This flag is what `socket.js` reads later via `isRankedRoom(roomId)` to enforce auth checks and ELO updates.
- When the room fills, all 4 players receive `matched` with `isRanked: true`.

---

### 4.6 Socket.IO Server

`socket.js` is the largest file in the backend. It handles all real-time game interactions after matchmaking.

#### Auth middleware

```js
io.use((socket, next) => {
  const token = socket.handshake?.auth?.token;
  if (!token) {
    socket.data.authenticated = false;
    return next(); // guests allowed
  }
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  socket.data.authenticated = true;
  socket.data.decodedPlayerId = decoded.id;
  next();
});
```

Every connection is checked for a JWT in the handshake auth object. Authenticated data is stored on `socket.data` so event handlers can read it without re-verifying. Unauthenticated connections are allowed — they're casual/guest players.

#### Ranked reconnect (on `connection`)

When an authenticated player connects, the server immediately checks `ranked:player:{playerId}:room`:

- If a room ID is found, the player was mid-game and reconnected. The server:
  1. Cancels the forfeit timer (if running).
  2. Re-adds the socket to the Socket.IO room (`socket.join(activeRoom)`).
  3. Updates `socketId` in both `room:{room}:players` and `ranked:room:{room}:members`.
  4. Emits `rankedReconnect` with the full room state (players, scores, current drawer).

#### joinRoom

```
socket.on('joinRoom', { room, playerId, playerName })
```

- For ranked rooms, validates that `socket.data.decodedPlayerId === playerId`. This prevents someone from joining a ranked room with a fabricated playerId.
- For casual rooms, enforces `MAX_ROOM_PLAYERS = 4` using the Socket.IO adapter room size.
- Upserts the player into `room:{room}:players` hash (preserving existing score on reconnect).
- Adds the player to `room:{room}:scores` sorted set.
- Broadcasts `roomPlayers` to everyone in the room so all clients refresh their player lists.

#### drawing / clearDrawing

Raw pointer events from the canvas are relayed to all other sockets in the room via `socket.to(room).emit(...)`. Drawing history is stored in `room:{room}:data` and replayed to new joiners (not shown in this handler but referenced in WhiteBoard).

#### guess

The most complex socket handler:

1. Reads `room:{room}:currentWord` and `room:{room}:currentDrawer`.
2. Broadcasts the raw guess to all players.
3. If the normalized guess matches the current word **and** the guesser hasn't already guessed correctly this round:
   - Calculates points: `max(50, 500 - elapsedSeconds * 10)`.
   - Awards half-points to the drawer.
   - Increments both scores in `room:{room}:scores` and `room:{room}:players`.
   - Adds the guesser to `room:{room}:guessedPlayers`.
   - Emits updated `roomPlayers` and a `correctGuess` event.
   - Checks if **all** non-drawers have guessed — if so, calls `endRoundForRoom`.

#### submitWord

Appends a word JSON object to `room:{room}:words` list and adds the player to `room:{room}:submittedPlayers` set. Emits `wordSubmitted` with updated counts so the UI can show a "3/4 submitted" indicator.

#### disconnect

Ranked and casual disconnects are handled differently:

**Casual**: The player is removed from `room:{room}:players` immediately. The room just shrinks.

**Ranked**: A 3-minute forfeit timer starts. During this window the player can reconnect and resume. If the timer expires:
- A forfeiture ELO penalty of 16 points (`K/2`) is applied and persisted to MongoDB.
- The player is evicted from the ranked room keys.
- If the room is now empty, all ranked room keys are cleaned up.
- `playerForfeited` is emitted to remaining players.

---

### 4.7 Game Service

`services/gameService.js` manages round and game lifecycle. It deliberately has no Socket.IO imports of its own — it receives `io` as a parameter so it stays testable and decoupled.

#### Timer management

```js
const roomTimers = new Map();   // room → NodeJS.Timeout
const roundStartTimes = new Map(); // room → Date.now() ms
```

These are in-memory. The start time is also persisted to Redis (`room:{room}:roundStartedAt`) so that if the server restarts mid-round, elapsed time can still be calculated correctly when a player reconnects.

`setRoomTimer(room, io, duration)`:
1. Clears any existing timer for the room.
2. Records the round start time in memory and Redis.
3. Sets a `setTimeout` for `duration` ms (default 60,000).
4. On expiry, calls `endRoundForRoom(room, 'timeout', io)`.

#### endRoundForRoom

1. Clears the room timer and start time.
2. Reads and deletes `room:{room}:currentWord`, `currentDrawer`, `guessedPlayers`.
3. Emits `endRound` with the revealed word.
4. Increments `turnsInRound`. When `turnsInRound >= totalPlayers`, one full round has passed:
   - Resets `turnsInRound` to 0.
   - Decrements `roundsRemaining`.
   - If `roundsRemaining <= 0`, calls `endGameForRoom`.

#### endGameForRoom

1. Reads final scores from `room:{room}:scores`.
2. If `isRanked === '1'`:
   - Fetches current ratings from MongoDB for all players.
   - Calls `calculateRankedElo(players)`.
   - Persists new ratings to MongoDB with `Player.findByIdAndUpdate`.
   - Deletes `ranked:player:{playerId}:room` for each player (clears reconnect mapping).
3. Deletes all game keys for the room.
4. Emits `endGame` with `{ room, scores, players, eloResults }`.

---

### 4.8 ELO Service

`services/eloService.js` implements a free-for-all (FFA) variant of the standard ELO formula.

**Standard ELO (1v1)**

```
E(A) = 1 / (1 + 10^((B - A) / 400))
new_rating(A) = old_rating(A) + K * (actual - expected)
```

**FFA adaptation**

With N players, each player is compared against the average expected score across all opponents:

```
actual_score(rank_i) = (N - 1 - i) / (N - 1)
  where i is 0-indexed rank (0 = winner)

average_expected(player) = mean of E(player, opp) for all opponents

delta = round(K * (actual - average_expected))
new_rating = max(ELO_FLOOR, old_rating + delta)
```

- K = 32 (standard, reasonably responsive to results)
- `ELO_FLOOR = 1200` — ratings never drop below the starting value

**Forfeit penalty**

Players who disconnect from a ranked game mid-match lose `K/2 = 16` points (floored at 1200). This is less than losing fairly (which could be up to 32 points) to acknowledge that the disconnect may have been unintentional.

---

### 4.9 REST Controllers & Routes

#### Auth routes (`/api/auth`)

| Method | Path | Handler | Auth required |
|---|---|---|---|
| POST | `/signup` | `auth.controller.signup` | No |
| POST | `/login` | `auth.controller.login` | No |
| POST | `/logout` | `auth.controller.logout` | No |

#### Game routes (`/api/game`)

| Method | Path | Handler | Auth required |
|---|---|---|---|
| GET | `/leaderboard` | `game.controller.getLeaderboard` | No |
| GET | `/player-stats/:playerId` | `game.controller.getPlayerStats` | No |
| POST | `/update-score` | `game.controller.updateScore` | No |
| POST | `/next-round` | `game.controller.nextRound` | No |

**getLeaderboard** accepts `?offset=N&limit=N` (default offset=0, limit=5, max limit=20). Returns:

```json
{
  "entries": [{ "playerId": "...", "rating": 1650, "username": "alice", "rank": 1 }],
  "total": 100,
  "offset": 0,
  "limit": 5
}
```

**nextRound** is called by the frontend (specifically by the drawer via `useRoundTransition`) to advance to the next round. It picks a random word from the pool, rotates the drawer, and emits `roundStart` to all room members.

---

### 4.10 Middleware

`auth.middleware.js` is a standard Express middleware that reads `Authorization: Bearer <token>`, verifies it, and attaches `req.user = { id }` for downstream handlers. It is defined but not currently applied to game routes — those are publicly accessible (the Socket.IO layer does its own auth for ranked events).

---

### 4.11 Utilities

`utils/gameUtils.js` exports constants and pure helper functions used across the backend:

```js
MAX_ROOM_PLAYERS = 4
ROUND_DURATION_MS = 60000        // 60 seconds per round
MAX_ROUNDS = 1                   // game ends after 1 full round
GUESS_POINTS_MAX = 500
GUESS_POINTS_MIN = 50
GUESS_POINTS_DECAY_PER_SEC = 10  // -10 pts per second elapsed

calculateGuessPoints(elapsedSeconds)  // max(50, 500 - elapsed * 10)
normalizePlayerId(id)                 // String(id).trim() — safe null handling
normalizeWord(word)                   // lowercase, trim, collapse spaces
```

---

## 5. Frontend

### 5.1 Routing & App Shell

`main.jsx` sets up React Router with a nested layout:

```
/ (App — renders Navbar + Outlet)
├── /              → Home
├── /game          → Game
├── /game/:roomId  → Game
├── /login         → Login
├── /signup        → SignUp
├── /rooms         → Rooms
└── /leaderboard   → Leaderboard
```

`App.jsx` is a minimal shell: `<Navbar />` + `<Outlet />`.

---

### 5.2 State Management — Zustand

`store/userStore.js` uses Zustand with the `persist` middleware. The store is saved to `localStorage` under the key `user-store`, so auth survives page refreshes.

**Stored fields**

```
_id            string   MongoDB ObjectId
username       string
rating         number   kept in sync after ranked games end
token          string   JWT
playerId       string   same as _id for authenticated users
isAuthenticated boolean
```

**Key actions**

- `setUser(user)` — called after login/signup to hydrate all fields at once.
- `setRating(rating)` — called in `useGameSocket` when an `endGame` event includes `eloResults` for this player.
- `logout()` — clears store state and removes `authToken`, `token`, and `user` from localStorage.

---

### 5.3 Socket Client

`socket.js` exports a singleton Socket.IO client and a library of typed helper functions.

#### Singleton management

```js
let socket; // module-level singleton

const createSocket = (token) => {
  if (socket) {
    if (token && socket.auth?.token !== token) socket.auth = { token };
    return socket; // reuse existing
  }
  socket = io(SOCKET_URL, { autoConnect: false, transports: ['websocket'] });
  return socket;
};
```

`autoConnect: false` means the socket only connects when explicitly told to. `transports: ['websocket']` skips the HTTP long-polling upgrade handshake, connecting directly over WebSocket.

#### connectSocket vs connectGuest

- `connectSocket(token)` — sets auth, reconnects if the token changed, waits for `connect` event via a Promise.
- `connectGuest()` — calls `connectSocket()` with no token (unauthenticated).

#### subscribeToGameEvents

A convenience function used in `useGameSocket`:

```js
const unsubscribe = subscribeToGameEvents({
  roundStart: (payload) => dispatch({ type: 'ROUND_START_EVENT', payload }),
  endRound: ({ word }) => dispatch({ type: 'BEGIN_ROUND_END', payload: { revealedWord: word } }),
  // ...
});
// returns a cleanup function that calls socket.off() for all handlers
```

This keeps handler registration and cleanup paired together, avoiding event listener leaks.

---

### 5.4 Pages

#### Home.jsx

The lobby page. Handles:
- Guest name entry (authenticated users see their username and rating automatically).
- Mode toggle (casual / ranked).
- Calls `sendPlayCasual` or `sendPlayRanked` on Play click.
- Listens for `matched` event and navigates to `/game/{roomId}` passing `playerName`, `playerId`, and `isRanked` via React Router location state.
- On mount (for authenticated users): calls `connectSocket(token)` and registers `onRankedReconnect` so players who had an ongoing ranked game are redirected immediately.

#### Game.jsx

The main game page. Orchestrates everything via hooks:

```
usePlayerResolution → resolves playerId / playerName
useGameSocket       → connects to Socket.IO, joins room, subscribes to all game events
useGameTimers       → drives the 60s countdown and round-end countdown
useRoundTransition  → triggers next-round API call when round-end countdown hits 0
```

State is managed entirely with `useReducer(gameReducer, initialGameState)` — no local `useState` beyond `guessValue` and `wordValue` inputs.

Layout: three-column flex row:
- Left: `PlayersList` (fixed width, 176px)
- Center: `WhiteBoard` or word-input form (flex-grow)
- Right: `ChatPanel` (fixed width, 224px)

#### Leaderboard.jsx

Infinite-scroll leaderboard. Fetches 5 entries at a time from `GET /api/game/leaderboard?offset=N&limit=5`. Uses `IntersectionObserver` on a sentinel `div` at the bottom of the list to trigger the next fetch when scrolled into view. The currently logged-in player's row is highlighted in cyan.

#### Login.jsx / SignUp.jsx

Standard forms that call `/api/auth/login` or `/api/auth/signup`, then call `useUserStore.setUser(response)` to persist the session.

---

### 5.5 Hooks

#### useGameSocket

The central socket hook. On mount:
1. Gets or creates the socket singleton. If there's already a connected socket (from the Home page matchmaking flow), it is reused — this preserves the socket ID so the server doesn't see a new connection.
2. Emits `joinRoom` with the resolved playerId and playerName.
3. Subscribes to all game events using `subscribeToGameEvents`, dispatching actions to `gameReducer` for each event.
4. On unmount, calls `disconnectSocket()`.

`effectivePlayerId` is `authPlayerId || resolvedPlayerId` — it re-runs the effect once Zustand rehydrates from localStorage (on first render, `authPlayerId` may be empty).

#### useGameTimers

Two `useEffect` hooks:

1. **Guessing timer**: runs a 1-second `setInterval` while `gamePhase === 'guessing'` and `timer > 0`, dispatching `TICK_TIMER` each second.
2. **Round-end countdown**: runs a 1-second `setInterval` while `showRoundEndOverlay` is true and `roundEndCountdown > 0`, dispatching `TICK_ROUND_END_COUNTDOWN`.

#### useRoundTransition

Watches for the round-end countdown reaching 0. Only the **drawer** (identified by `currentDrawer === localPlayerId`) calls the `POST /api/game/next-round` endpoint. This prevents all 4 players from sending the request simultaneously — only one player is the designated "advancer" per round.

A `useRef` flag (`advancingRoundRef`) prevents double-firing if the effect re-runs while the fetch is in-flight.

#### usePlayerResolution

A thin effect hook that sets `localPlayerId` and `localPlayerName` from `resolvedPlayerId` and `resolvedPlayerName` on first render if they aren't already set in state.

#### useFetchData

A general-purpose fetch hook that:
- Manages `loading`, `error`, `data` state.
- Automatically attaches `Authorization: Bearer <token>` from localStorage if present.
- Returns a `fetchData(url, options)` function that can be called imperatively.

---

### 5.6 Reducers

`gameReducer.js` is a pure function — all game state transitions are handled here. The initial state:

```js
{
  players: [],
  messages: [],
  status: 'Connecting...',
  localPlayerName: '',
  localPlayerId: '',
  gamePhase: 'word-input',    // 'word-input' | 'guessing' | 'round-end'
  currentDrawer: null,
  currentWord: '',
  hideword: '',               // underscores shown to guessers
  timer: 60,
  isDrawing: false,
  isGuessing: false,
  submittedCount: 0,
  totalPlayers: 0,
  hasSubmittedWord: false,
  isGameOver: false,
  prevScores: {},             // scores snapshot at round start (for delta calc)
  scoreDeltas: {},            // delta per player shown in round-end overlay
  showRoundEndOverlay: false,
  roundEndCountdown: 5,
}
```

Key action types:

| Action | What it does |
|---|---|
| `ROUND_START_EVENT` | Transitions to `guessing` phase, sets drawer, word, timer. Snapshots `prevScores`. |
| `BEGIN_ROUND_END` | Transitions to `round-end`, calculates `scoreDeltas`, shows overlay. |
| `END_GAME` | Sets `isGameOver: true`, hides overlay. |
| `TICK_TIMER` | Decrements `timer` by 1, min 0. |
| `TICK_ROUND_END_COUNTDOWN` | Decrements `roundEndCountdown` by 1. |
| `SET_WORD_INPUT_PHASE` | Returns to word submission phase. |
| `PLAYER_JOINED` / `PLAYER_LEFT` | Adds/removes from `players` array, updates `totalPlayers`. |

---

### 5.7 Components

#### WhiteBoard.jsx

Canvas-based drawing surface using the Pointer Events API (`onPointerDown`, `onPointerMove`, `onPointerUp`). Key design points:

- The canvas is scaled by `window.devicePixelRatio` so lines are crisp on high-DPI screens.
- Drawing is done locally and the `drawing` event is emitted to the server, which broadcasts to other sockets. Other clients receive `drawing` events and call `drawLine` on their local canvas.
- When a new player joins a room mid-round, the server sends `drawingHistory` with all strokes so far — the client replays them.
- `locked={true}` disables all pointer events (used for guessers).
- Eraser tool uses `ctx.globalCompositeOperation = 'destination-out'` to erase rather than draw white.

#### ChatPanel.jsx

Scrollable message list with an auto-scroll effect (`bottomRef.scrollIntoView({ behavior: 'smooth' })`). Input is disabled when `isDrawing` or `gamePhase !== 'guessing'`.

#### PlayersList.jsx

Renders the player roster. The current drawer is highlighted in cyan and prefixed with ✏.

#### RoundEndOverlay.jsx

Shown after each round ends (z-index 40, semi-transparent dark backdrop). Displays:
- Revealed word
- All players with their current score and per-round delta (e.g. `+200`)
- Countdown to next round

#### EndGameOverlay.jsx

Shown when `isGameOver: true` (z-index 50, opaque dark backdrop). Displays final rankings. Auto-redirects to `/` after 15 seconds with a visible countdown.

---

## 6. Data Flow Walkthroughs

### 6.1 Casual Matchmaking

```
Client                     Socket.IO Server           BullMQ Worker             Redis
──────                     ────────────────           ─────────────             ─────
click "Play (casual)"
  sendPlayCasual()
  ────────────────────────► socket.on('playCasual')
                              casualQueue.add(job)  ──────────────────────────► bull:casual-game-queue:wait
                              emit playCasualQueued
  ◄─────────────────────────
                                                       job picked up
                                                       ZRANGE casual:openRooms
                                                       ◄──────────────────────────
                                                       eval Lua → HSET members
                                                       ──────────────────────────►
                                                       if count < 4:
                                                         emit 'matched' (roomReady: false)
                                                         ◄──────────────────────
                                                       if count == 4:
                                                         emit 'matched' (roomReady: true)
  ◄─────────────────────────
navigate /game/{roomId}
  socket.emit('joinRoom')
  ────────────────────────► joinRoom handler
                              HSET room:{id}:players
                              ZADD room:{id}:scores
                              emit roomPlayers
  ◄─────────────────────────
```

### 6.2 Ranked Matchmaking

Same as casual but:
1. JWT is verified before enqueueing.
2. Fresh `rating` is fetched from MongoDB.
3. Worker uses `getBucket(rating)` to look up `ranked:{bucket}:openRooms`.
4. Room data is flagged with `isRanked: '1'` in Redis.
5. `ranked:player:{playerId}:room` is set when the player joins via `joinRoom`.

### 6.3 In-Game Round Lifecycle

```
State: 'word-input'
  Players submit words via submitWord socket event
    → RPUSH room:{id}:words
    → SADD room:{id}:submittedPlayers
    → emit wordSubmitted (with counts)
  When all submitted, drawer clicks "Start Round"
    → POST /api/game/next-round
    → server picks word, rotates drawer, emits roundStart
    → setRoomTimer starts 60s timeout
  
State: 'guessing'
  Each second: TICK_TIMER on all clients
  On guess:
    → normalizeWord(guess) === currentWord?
      yes → award points, sadd guessedPlayers
      → if all non-drawers guessed → endRoundForRoom('all_guessed')
  On timer expiry (server-side):
    → endRoundForRoom('timeout')
  
State: 'round-end' (5s overlay)
  Server emits endRound with revealed word
  Drawer's useRoundTransition fires when countdown hits 0:
    → POST /api/game/next-round (picks next word)
    → if wordsPoolEmpty → emit wordsPoolEmpty → back to 'word-input'
    → else → new roundStart → back to 'guessing'
  
  After MAX_ROUNDS rounds are complete:
    → endGameForRoom → ELO update → emit endGame
    → EndGameOverlay shown, redirect after 15s
```

### 6.4 Ranked Disconnect & Reconnect

```
Player disconnects mid-ranked-game
  socket.on('disconnect'):
    emit playerDisconnected to room
    setTimeout(3 minutes, forfeitTimer)

  Within 3 minutes — player reconnects:
    socket.on('connection'):
      clearTimeout(forfeitTimer)
      getRankedRoomForPlayer(playerId) → roomId
      socket.join(roomId)
      update socketId in Redis (players hash + members hash)
      emit rankedReconnect with room state
      Home.jsx sees rankedReconnect → navigate /game/{roomId}

  After 3 minutes — no reconnect:
    applyForfeitPenalty → -16 ELO → MongoDB.save()
    evictPlayerFromRankedRoom
    emit playerForfeited to remaining players
    if room now empty → cleanupRankedRoom (delete all keys)
```

### 6.5 Leaderboard Read Path

```
Client                     Backend                    Redis                   MongoDB
──────                     ───────                    ─────                   ───────
GET /api/game/leaderboard
?offset=0&limit=5
  ─────────────────────►  getLeaderboard()
                           EXISTS player:leaderboard
                           ◄──────────────────────── 
                           (miss — first request after TTL)
                                                                              Player.find()
                                                                              .sort({rating:-1})
                                                                              .limit(100)
                                                      ◄─────────────────────
                           pipeline:
                             DEL + ZADD × 100
                             DEL + HSET × 100
                             EXPIRE × 2
                           ──────────────────────────►
                           ZREVRANGE offset 0..4 WITHSCORES
                           ◄──────────────────────────
                           HMGET names [id0..id4]
                           ◄──────────────────────────
                           res.json({ entries, total, offset, limit })
  ◄─────────────────────
```

Subsequent requests within 5 minutes hit the cache directly — no MongoDB round-trip.

---

## 7. Redis Key Reference

| Key | Type | TTL | Owner | Description |
|---|---|---|---|---|
| `room:{id}:players` | Hash | none | socket.js | Live player objects for a room |
| `room:{id}:scores` | Sorted Set | none | socket.js / gameService | Player scores, used for final ranking |
| `room:{id}:words` | List | none | socket.js | Submitted words pool |
| `room:{id}:submittedPlayers` | Set | none | socket.js | Players who submitted a word |
| `room:{id}:currentWord` | String | none | game.controller | Normalized word in play |
| `room:{id}:currentDrawer` | String | none | game.controller | Current drawer's playerId |
| `room:{id}:guessedPlayers` | Set | none | socket.js | Correct guessers this round |
| `room:{id}:lastDrawer` | String | none | game.controller | Previous drawer (for rotation) |
| `room:{id}:turnsInRound` | String | none | gameService | Turn counter within a round |
| `room:{id}:roundsRemaining` | String | none | gameService | Rounds left in the game |
| `room:{id}:roundStartedAt` | String | none | gameService | Unix ms timestamp of round start |
| `room:{id}:data` | String | none | socket.js | Raw drawing history |
| `casual:openRooms` | Sorted Set | none | casualWorker | Rooms with < 4 players |
| `casual:room:{id}:members` | Hash | none | casualWorker | Staged players pre-joinRoom |
| `ranked:{bucket}:openRooms` | Sorted Set | none | rankedWorker | Open ranked rooms per ELO tier |
| `ranked:room:{id}:members` | Hash | none | rankedWorker | Staged ranked players |
| `ranked:room:{id}:data` | Hash | none | rankedWorker | `{ isRanked, bucket, createdAt }` |
| `ranked:player:{id}:room` | String | none | socket.js | Active ranked room for reconnect |
| `player:leaderboard` | Sorted Set | 5 min | game.controller | Top-100 players by rating |
| `player:leaderboard:names` | Hash | 5 min | game.controller | playerId → username lookup |
| `bull:*` | Various | managed by BullMQ | BullMQ internal | Queue job state |

---

## 8. Environment Variables

**Backend** (`backend/.env`)

| Variable | Description |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret key for signing and verifying JWTs |
| `REDIS_URL` | Redis connection URL (default: `redis://localhost:6379`) |

**Frontend** (`frontend/.env.local`)

| Variable | Description |
|---|---|
| `VITE_BACKEND_URL` | Backend WebSocket/HTTP URL (default: `http://localhost:3000`) |
| `VITE_API_URL` | REST API base URL (default: `http://localhost:3000`) |
