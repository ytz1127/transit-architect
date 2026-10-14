# Transit Architect

Transit Architect is a browser-based transit network planning and mathematics learning game. Its first scenario is set in Port Meridian, a prebuilt fictional city. Players can place stops on the existing road graph; road construction and zoning are intentionally outside the game.

## Stack

- React 19 with TypeScript
- Vite 6 for development and production builds
- Custom SVG city renderer; graph and scenario data live separately in `src/data/city.ts`
- CSS for the desktop-first simulation interface

## Run locally

```sh
pnpm install
pnpm dev
```

Create a production build with `pnpm build`. Run the automated logic suite with `pnpm test`.

## Project architecture

- `src/App.tsx` coordinates interface state and connects map interactions, network editing, scenarios, the lab, and simulation controls.
- `src/data/city.ts` contains the Port Meridian city data and graph validation.
- `src/data/scenarios.ts` contains guided scenario setup, objectives, evaluation, and progression rules.
- `src/simulation/routing.ts` contains road graph search, route geometry, validation, distance, and stop coverage calculations.
- `src/simulation/engine.ts` contains deterministic demand, dispatch, bus movement, passenger handling, simulation summaries, and financial calculations.
- `src/math/lessons.ts` is the reusable lesson catalog; `src/components/MathematicsLab.tsx` renders it.
- `src/styles.css`, `src/light-theme.css`, `src/simulation-ui.css`, and `src/mathlab.css` define the interface styling.
- `tests/transit-logic.test.mjs` uses Node's built-in test runner and Vite's module loader to exercise the TypeScript logic directly.

## Map data format

`city.ts` exports one `city` object. A map has a stable `id`, display name, coordinate-space `population`, `depot`, `districts`, `nodes`, `edges`, and `destinations`:

- A node has a unique `id`, `x`, and `y`, with an optional kind such as `hub` or `destination`.
- An edge has a unique `id`, endpoint node IDs (`from`, `to`), positive `lengthKm`, a road `class`, and an optional SVG quadratic path. The path changes how the edge is drawn; endpoints and length drive graph calculations.
- A district has an `id`, name, type, population, SVG fill path, and `[x, y]` population-center label.
- A destination has an `id`, name, kind, attraction weight, map coordinates, and a connected road `nodeId`.
- The depot has its own map rectangle and a graph `nodeId` where buses enter the road network.

Run `validateRoadGraph(map)` after editing graph data. Node coordinates, district centers, destination coordinates, and SVG art use the same 1040 × 680 viewBox. New maps can reuse the graph and scenario shapes, but map selection and some decorative district, park, water, and roundabout artwork are currently authored for Port Meridian in `App.tsx`; a second fully swappable map needs that artwork moved into map rendering data first.

## Extending the game

To add a scenario, append a typed entry to `scenarios` in `src/data/scenarios.ts`, choose a lesson ID, define initial conditions, unlocked tools, and measurable objectives, then add objective metrics/evaluation rules there if needed. The interface derives objective progress from current network and simulation values. `nextUnlockedScenarioIndex` controls sequential unlocks. Keep sandbox as free play rather than adding scenario completion gates to it.

To add a lesson, append a `MathLesson` entry to `src/math/lessons.ts`. Supply the concept explanation, formula, variable units, numerical worked example, visual type, guided question callbacks, transportation application, and reflection. The Mathematics Lab uses the lesson ID referenced by the active scenario; lesson availability follows scenario progression, with all lessons available in Sandbox.

To add a map, follow the map object shape above and validate its graph and destination/depot references. Generalize `App.tsx` to accept the selected map and move its map-specific background artwork out of the component before claiming full multi-map support.

## Current increment

Phases 1–6 are implemented. Port Meridian has 67 road nodes and 110 connected road edges, including the curved Bayview Circle and its approaches. Northgate Bus Depot is located in the upper-left corner and connects to junction `n41`; buses travel from the depot to their assigned route before entering service. `validateRoadGraph` checks edge, destination, and depot references and verifies connectivity. Map data, simulation logic, lesson data, scenarios, and rendering are separate. Stops have circular walk catchments and routes use deterministic Dijkstra paths with stable node-ID tie-breaking. Six guided scenarios progressively unlock catchment planning, route adjustments, fleet and frequency controls, fare and budget controls, and optimization lessons. Objectives evaluate the live road network and completed simulation output; a completed scenario unlocks the next one while preserving the player's network. Stop markers on the map can be left-clicked to select or inspect them. Saved routes remain visible together with distinct colors, including while another route is selected or edited. Sandbox mode opens all tools and lessons and uses the same deterministic simulation.

Scenario definitions and objective evaluation rules are in `src/data/scenarios.ts`. Scenario 1 checks a connected route serving Central Station and Meridian Hospital; later scenarios use population coverage, shared transfer stops, effective headway, completed-run ridership, and financial and service metrics. Objectives include explanatory next-step feedback, and stage 6 accepts any design that meets all stated constraints.

## Simulation model

- Demand is a deterministic origin–destination group for each populated district and destination. Group size is rounded from `district population × destination attraction / 100 × 0.0012`; departures are staggered deterministically during the first 20 minutes.
- District label coordinates are simplified population centers. Map scale is 84 units per 500 m, aligned with the road-link lengths. Origins walk to a stop within the configured radius, and destinations are accessible from any stop within that radius. Walking time is straight-line distance at 80 m/min.
- Buses follow the route graph at 30 km/h, dwell one minute at stops, and have 40 seats. Fleet size and headway determine bus dispatch spacing. Capacity queues retain riders for later buses; transfers use a six-minute generalized path penalty.
- A run uses fixed one-minute state updates for 60 simulated minutes. Play speed changes only how quickly those updates display. Reset creates the same initial state for the same network and settings.
- Waiting time is measured at the stop, while journey time includes initial walking. At the end, anyone not delivered is unserved, including riders still waiting or onboard. Capacity utilization is occupied seat-minutes divided by active seat-minutes; current occupancy is riders onboard divided by active fleet capacity.
- Operating cost is `$0.72 × active bus-minutes + $1.80 × bus-kilometers`; fare revenue is charged once when a trip boards its first bus. Balance is revenue minus operating cost. Traffic congestion and road direction restrictions are not modeled.
- Effective headway is `max(requested headway, ceil(round-trip cycle minutes ÷ fleet size))`; displayed frequency is `60 ÷ effective headway` buses per hour. Round-trip cycle time uses graph-edge travel at 30 km/h plus one minute of dwell at each stop in each direction. The model does not optimize dispatch by direction or time of day.

## Mathematics Lab

The reusable lesson catalog is in `src/math/lessons.ts`; the panel and its diagrams are in `src/components/MathematicsLab.tsx`. It includes distance, coverage ratios, road graphs, service frequency, capacity, fare break-even, multi-objective planning, and an optional calculus extension. Worked examples, variable definitions, prompts, application notes, and reflection questions share one lesson schema. Guided answers use current network and simulation values where applicable and give explanatory, non-graded feedback. Apply buttons close the lab and open the related network tool.

## Test coverage and known limitations

`pnpm test` checks graph connectivity, shortest-path lengths and deterministic tie-breaking, blocked paths, manual junction adjustments, route validation, stop coverage, effective headway and fleet relationships, scenario metrics and progression, boarding/alighting, transfers, capacity, wait/journey/fare/cost metrics, and deterministic runs/resets. A browser smoke check also exercises stop placement and route-order labels, route rendering/color separation, Sandbox controls, and map-stop selection. `pnpm build` runs the TypeScript project check and production Vite build.

The map uses stylized population-center catchments rather than parcel-level walking networks. Passenger demand is grouped by origin-destination pair, traffic and directional road restrictions are omitted, and finance uses fixed operating rates with no subsidy or non-fare income. Browser interaction coverage is a manual smoke check; the automated suite currently targets routing, simulation, coverage, and scenario logic rather than mounting React components in a DOM test environment.
