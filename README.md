# Hotel Offer Orchestrator

A production-shaped reference implementation of a hotel offer aggregator using:

- Node.js 20 + TypeScript
- Express 5
- Temporal.io for orchestration
- Redis sorted sets + hashes for persistence and price filtering
- Docker Compose
- Pino structured logging
- Zod request validation

## Architecture

```text
                         +-------------------+
                         |     Client        |
                         +---------+---------+
                                   |
                                   | GET /api/hotels?city=delhi&minPrice=5000&maxPrice=8000
                                   v
                         +---------+---------+
                         | Express API       |
                         | :3000             |
                         +----+---------+----+
                              |         |
                  start       |         | Redis price query
                  workflow    |         |
                              v         v
                       +------+---+   +---------+
                       | Temporal |   |  Redis  |
                       | :7233   |   |  :6379  |
                       +----+----+   +---------+
                            |
                  +---------+---------+
                  |                   |
            activity A          activity B
                  |                   |
                  v                   v
          +---------------+   +---------------+
          | Supplier A    |   | Supplier B    |
          | /supplierA/*  |   | /supplierB/*  |
          +---------------+   +---------------+
                  \                   /
                   \                 /
                    +-------+-------+
                            |
                     Temporal Workflow
                       dedupe by name
                       choose min price
                            |
                            v
                         Redis
                  ZSET price index + HASH
```

### Why two Redis structures?

For every city the service maintains:

- `hotels:{<city>}:by-price` — Redis sorted set, where the score is the selected hotel price and the member is the selected hotel name.
- `hotels:{<city>}:data` — Redis hash, where the field is the selected hotel name and the value is the serialized final offer.

The filtered API request uses `ZRANGEBYSCORE`, so the price predicate is evaluated by Redis rather than by downloading all records and filtering them in Node.js.

## Request flow

1. `GET /api/hotels?city=delhi` reaches Express.
2. Express starts `hotelOfferWorkflow` on Temporal.
3. The workflow allocates a Redis refresh version and expiry, then invokes Supplier A and Supplier B activities concurrently using `Promise.all`.
4. Each activity calls the corresponding mock supplier endpoint.
5. The workflow normalizes hotel names and keeps the cheapest offer for each name.
6. The workflow sorts the final list and persists it to Redis through an activity.
7. Express queries Redis using the requested `minPrice` / `maxPrice` range.
8. The final list is returned to the client.

## Project structure

```text
.
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
├── .env.example
├── README.md
├── postman/
└── src/
    ├── activities/
    │   ├── redis.activities.ts
    │   └── supplier.activities.ts
    ├── config/
    │   ├── db.config.ts
    │   ├── env.config.ts
    │   ├── logging.config.ts
    │   └── temporal.config.ts
    ├── controllers/
    │   ├── health.controller.ts
    │   ├── hotel.controller.ts
    │   └── supplier.controller.ts
    ├── middleware/
    │   └── logger.middleware.ts
    ├── models/
    │   ├── hotel.model.ts
    │   └── supplier.model.ts
    ├── routes/
    │   ├── health.routes.ts
    │   ├── hotel.routes.ts
    │   └── supplier.routes.ts
    ├── services/
    │   ├── health.service.ts
    │   ├── hotel.service.ts
    │   └── supplier.service.ts
    ├── types/
    │   ├── hotel.types.ts
    │   └── supplier.types.ts
    ├── utils/
    │   ├── redis.utils.ts
    │   └── request.utils.ts
    ├── validators/
    │   └── hotel.validator.ts
    ├── workflows/
    │   └── hotel.workflow.ts
    ├── app.ts
    ├── server.ts
    └── worker.ts
```

Controllers handle HTTP responses, routes map endpoints, services coordinate application logic, models own Redis persistence and mock supplier data, and validators define request schemas. Configuration is centralized in `config/`. `app.ts` composes Express without opening connections; `server.ts` connects dependencies and starts the API. Temporal workflows and activities remain separate to preserve deterministic execution.

## Run with Docker Compose

Prerequisites:

- Docker Engine / Docker Desktop / Colima
- Docker Compose v2

Start the complete stack:

```bash
docker compose up --build
```

Services:

| Service     |            URL / Port | Purpose                           |
| ----------- | --------------------: | --------------------------------- |
| API         | http://localhost:3000 | Express API + mock suppliers      |
| Temporal    |        localhost:7233 | Workflow service                  |
| Temporal UI | http://localhost:8080 | Workflow inspection               |
| Redis       | internal `redis:6379` | Offer persistence/filtering       |
| PostgreSQL  |         internal only | Temporal persistence              |
| Worker      |              internal | Temporal workflow/activity worker |

Stop the stack:

```bash
docker compose down
```

Remove persisted Redis and Temporal/PostgreSQL data:

```bash
docker compose down -v
```

## API examples

### Aggregate Delhi hotels

```bash
curl 'http://localhost:3000/api/hotels?city=delhi'
```

Expected result is de-duplicated by hotel name and sorted by price, including:

```json
[
  {
    "name": "Holtin",
    "price": 5340,
    "supplier": "Supplier B",
    "commissionPct": 20
  },
  {
    "name": "Radison",
    "price": 5900,
    "supplier": "Supplier A",
    "commissionPct": 13
  }
]
```

The exact response also contains `Taj Palace`, `ITC Maurya`, and `The Oberoi` from the mock data.

### Filter using Redis

```bash
curl 'http://localhost:3000/api/hotels?city=delhi&minPrice=5000&maxPrice=8000'
```

The workflow still refreshes the city's de-duplicated offer set. The subsequent range filtering is performed by Redis using `ZRANGEBYSCORE`.

### No results

```bash
curl 'http://localhost:3000/api/hotels?city=chennai'
```

Response:

```json
[]
```

### Invalid range

```bash
curl 'http://localhost:3000/api/hotels?city=delhi&minPrice=9000&maxPrice=5000'
```

Returns HTTP `400`.

## Mock supplier APIs

Supplier A:

```bash
curl 'http://localhost:3000/supplierA/hotels?city=delhi'
```

Supplier B:

```bash
curl 'http://localhost:3000/supplierB/hotels?city=delhi'
```

The data deliberately contains overlapping names (`Holtin`, `Radison`, `ITC Maurya`) so the workflow has meaningful comparisons.

## Health check

```bash
curl -i http://localhost:3000/health
```

Example healthy response:

```json
{
  "status": "ok",
  "suppliers": {
    "supplierA": true,
    "supplierB": true
  },
  "redis": true
}
```

The endpoint returns HTTP `503` when either supplier or Redis is unavailable.

## Simulate a supplier outage

The mock suppliers can be disabled through environment variables:

```yaml
SUPPLIER_A_ENABLED: "false"
```

or:

```yaml
SUPPLIER_B_ENABLED: "false"
```

For a quick local simulation, change the relevant value in `docker-compose.yml` and run:

```bash
docker compose up --build
```

The affected mock supplier returns `503`, Temporal retries the failed activity according to its retry policy, and the aggregation request ultimately returns `502` if the supplier remains unavailable.

## Temporal details

The workflow contains only deterministic orchestration/business logic:

- network calls are activities
- Redis writes are activities
- comparison/deduplication logic runs in the workflow
- activities have bounded start-to-close timeouts
- supplier activities retry up to three attempts
- Redis persistence also retries up to three attempts

This separation is intentional: workflows should remain deterministic, while side effects belong in activities.

Open Temporal UI at http://localhost:8080 and inspect the `hotel-offer-task-queue` workflows after making an API request.

## Redis details

Example keys after a Delhi request:

```text
hotels:{delhi}:by-price
hotels:{delhi}:data
```

The sorted set allows the filter to be implemented as:

```text
ZRANGEBYSCORE hotels:{delhi}:by-price 5000 8000
```

The returned names are looked up from the hash inside the same Lua script, so a writer cannot change the snapshot between selecting names and reading prices.

### TTL, versions, and atomic operations

Set `HOTEL_OFFER_TTL_SECONDS` on the worker (default: `300`). The freshness window starts before supplier fetching, using Redis server time. Both data keys receive the same absolute `PEXPIREAT` deadline. Slow fetches consume that window, and retries never extend it. Expired snapshots read as `[]`; every API request still starts a supplier refresh.

`beginHotelRefresh` atomically increments `hotels:{delhi}:version` and returns the version and deadline. `saveHotels` runs a Lua script that checks this version and deadline, replaces the sorted set and hash, and applies expiry in one atomic operation. An empty result clears the previous snapshot. A superseded or expired write returns `false` without changing the cache.

The policy is **latest refresh started wins**. If a newer refresh fails, an older in-flight refresh cannot publish; the previous cached snapshot remains available only until its original expiry. The small version counter intentionally has no TTL, preventing delayed activities from reusing a version after the offers expire. Retire it only when no activities for that city can still run.

A pipeline only batches commands; it does not prevent interleaving. `MULTI/EXEC` can make a fixed batch atomic, but these operations need conditional checks and reads whose results determine subsequent commands, so Lua performs them on Redis. The read script combines `ZRANGEBYSCORE` and hash lookups; the write script combines version checking, replacement, and expiry. Each script is atomic independently; workflow completion plus the API read is not one transaction, so concurrent requests may return a newer city's snapshot.

Keys share a city hash tag for Redis Cluster compatibility. This changes the old key namespace; old untagged keys are no longer read and should be removed during migration. Deploy the API and worker together and drain old workflows before upgrading because the workflow activity sequence has changed. Scripts run to completion on Redis, so bound supplier result sizes for large deployments.

This also avoids using Redis `KEYS` for request-time filtering.

## Postman

Import:

```text
postman/Hotel-Offer-Orchestrator.postman_collection.json
```

The collection contains:

1. Delhi aggregation with expected overlaps.
2. Delhi aggregation with a price range.
3. City with no results.
4. Supplier A mock endpoint.
5. Supplier B mock endpoint.
6. Health check.

## Local development without Docker

Run infrastructure separately, then install dependencies:

```bash
npm install
```

Build:

```bash
npm run build
```

Start the API:

```bash
REDIS_URL=redis://localhost:6379 \
TEMPORAL_ADDRESS=localhost:7233 \
SUPPLIER_BASE_URL=http://localhost:3000 \
npm run start:api
```

In another terminal start the worker:

```bash
REDIS_URL=redis://localhost:6379 \
TEMPORAL_ADDRESS=localhost:7233 \
SUPPLIER_BASE_URL=http://localhost:3000 \
npm run start:worker
```

## Tests

Run `npm test` to compile TypeScript and check query validation, HTTP response contracts, supplier outage behavior, and workflow-to-Redis sequencing with mocked dependencies. The API tests do not require Redis or Temporal. If `redis-server` is installed, the Redis integration test starts an isolated instance using a temporary Unix socket and checks version rejection, TTL, retry deadlines, empty snapshots, and concurrent reads/writes; otherwise that test is skipped.

## Graceful shutdown

Both processes handle `SIGINT` (Ctrl+C) and `SIGTERM` (container stop). Repeated signals share one shutdown operation.

- **API:** stops accepting connections, closes idle HTTP connections, and waits for active requests to finish. It then closes its Temporal client connection and Redis connection.
- **Worker:** stops polling Temporal and drains active activities/workflow tasks before closing its native Temporal connection and Redis. Temporal workflows remain durable; stopping this worker does not cancel them.
- **Redis:** sends `QUIT` on a ready connection, then disconnects. Unused or broken connections are disconnected directly.

`SHUTDOWN_TIMEOUT_MS` sets the overall shutdown deadline in milliseconds (default `30000`). The worker allows activities 80% of this budget before Temporal requests cancellation. If startup, draining, or closing connections hangs beyond the overall deadline, the process forces local connections closed and exits with code `1`. Normal shutdown exits naturally; startup or cleanup failures also set exit code `1`, while still attempting remaining cleanup.

Handlers are installed before startup, so a signal during connection setup waits for startup to settle and then cleans up acquired resources within the same deadline. Docker Compose gives the API and worker `40s` to stop; increase `stop_grace_period` if you increase the application deadline. Requests exceeding the deadline may be interrupted. The API hosts the mock supplier endpoints too, so supplier requests during a full-stack shutdown can fail and be retried by Temporal after restart.

Shutdown tests cover both signals, repeated signals, startup failure, cleanup failure, Redis disconnection, and a forced exit when draining hangs. They use child processes and mocked service resources; they do not require a live Temporal cluster.
