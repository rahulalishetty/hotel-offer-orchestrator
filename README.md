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

- `hotels:<city>:by-price` — Redis sorted set, where the score is the selected hotel price and the member is the normalized hotel name.
- `hotels:<city>:data` — Redis hash, where the field is the normalized hotel name and the value is the serialized final offer.

The filtered API request uses `ZRANGEBYSCORE`, so the price predicate is evaluated by Redis rather than by downloading all records and filtering them in Node.js.

## Request flow

1. `GET /api/hotels?city=delhi` reaches Express.
2. Express starts `hotelOfferWorkflow` on Temporal.
3. The workflow invokes Supplier A and Supplier B activities concurrently using `Promise.all`.
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

| Service | URL / Port | Purpose |
|---|---:|---|
| API | http://localhost:3000 | Express API + mock suppliers |
| Temporal | localhost:7233 | Workflow service |
| Temporal UI | http://localhost:8080 | Workflow inspection |
| Redis | internal `redis:6379` | Offer persistence/filtering |
| PostgreSQL | internal only | Temporal persistence |
| Worker | internal | Temporal workflow/activity worker |

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
hotels:delhi:by-price
hotels:delhi:data
```

The sorted set allows the filter to be implemented as:

```text
ZRANGEBYSCORE hotels:delhi:by-price 5000 8000
```

The returned names are then looked up from the hash.

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

Run `npm test` to compile TypeScript and check query validation, HTTP response contracts, supplier outage behavior, and workflow-to-Redis sequencing with mocked dependencies. These tests do not require running Redis or Temporal.

## Production considerations

This implementation is intentionally compact for an assignment, but the boundaries are suitable for extending it:

- Add supplier-specific timeout/circuit-breaker policies.
- Use Temporal retry policies with non-retryable error types for validation failures.
- Add request correlation IDs and propagate them into Temporal workflow/activity logs.
- Consider a deterministic workflow ID per city plus an explicit refresh policy if repeated requests should share work.
- Add Redis TTL/versioning if supplier offers become stale.
- Add contract tests for supplier responses.
- Add unit tests for the pure deduplication/comparison function.
- Add graceful shutdown for Express, Temporal connections, and Redis.
- Add metrics for supplier latency/error rate, workflow duration, Redis latency, and aggregation result counts.
