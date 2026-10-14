import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const [{ city, validateRoadGraph }, routing, engine, scenariosModule] = await Promise.all([
  vite.ssrLoadModule('/src/data/city.ts'),
  vite.ssrLoadModule('/src/simulation/routing.ts'),
  vite.ssrLoadModule('/src/simulation/engine.ts'),
  vite.ssrLoadModule('/src/data/scenarios.ts'),
])
after(() => vite.close())

const { adjustRouteLeg, coverageForStops, edgeBetween, routeLegsForStops, shortestPath, validateRoute } = routing
const { createSimulation, effectiveServiceHeadway, stepSimulation, summarizeSimulation } = engine
const { evaluateScenario, nextUnlockedScenarioIndex, scenarios } = scenariosModule
const edgeLength = (path) => path.slice(1).reduce((sum, id, index) => sum + edgeBetween(path[index], id).lengthKm, 0)
const runToEnd = (input) => {
  let state = createSimulation(input)
  while (!state.complete) state = stepSimulation(state)
  return state
}

test('the authored road graph is connected and every edge references a city node', () => {
  const graph = validateRoadGraph(city)
  assert.equal(graph.valid, true, graph.errors.join('\n'))
  assert.equal(graph.nodeCount, city.nodes.length)
  for (const edge of city.edges) {
    assert.ok(city.nodes.some((node) => node.id === edge.from))
    assert.ok(city.nodes.some((node) => node.id === edge.to))
  }
})

test('Dijkstra returns a shortest path and breaks equal-length ties by predecessor ID', () => {
  const path = shortestPath('n1', 'n10')
  assert.deepEqual(path, ['n1', 'n2', 'n10'])
  assert.ok(Math.abs(edgeLength(path) - 1.48) < 1e-9)
  assert.deepEqual(shortestPath('n1', 'n10'), path)
  assert.deepEqual(shortestPath('n1', 'n10', new Set(['n2'])), ['n1', 'n9', 'n10'])
  assert.equal(shortestPath('missing', 'n10'), null)
})

test('junction adjustment stays on connected roads and route validation rejects broken geometry', () => {
  const initialPath = shortestPath('n1', 'n10')
  const adjusted = adjustRouteLeg(initialPath, 1, 'n3')
  assert.ok(adjusted)
  assert.notDeepEqual(adjusted, initialPath)
  const route = { id: 'adjusted', name: 'Adjusted', stopIds: ['n1', 'n10'], legs: [adjusted] }
  assert.equal(validateRoute(route, route.stopIds).valid, true)
  const broken = { ...route, legs: [['n1', 'n10']] }
  assert.equal(validateRoute(broken, route.stopIds).valid, false)
  assert.equal(validateRoute(route, ['n1']).valid, false)
  assert.equal(adjustRouteLeg(initialPath, 1, 'n1'), null)
})

test('coverage counts mapped residents once and supports empty and citywide catchments', () => {
  assert.equal(coverageForStops([], 500).population, 0)
  const citywide = coverageForStops(['n12'], 100_000)
  assert.equal(citywide.population, city.districts.reduce((sum, district) => sum + district.population, 0))
  assert.equal(citywide.districts.length, city.districts.filter((district) => district.population > 0).length)
  assert.equal(new Set(citywide.districts).size, citywide.districts.length)
})

test('fleet size bounds effective service headway for a fixed route', () => {
  const legs = routeLegsForStops(['n12', 'n56'])
  const route = { id: 'frequency-test', name: 'Frequency', stopIds: ['n12', 'n56'], legs }
  const oneBus = effectiveServiceHeadway(route, 1, 5)
  const fourBuses = effectiveServiceHeadway(route, 4, 5)
  assert.ok(oneBus >= fourBuses)
  assert.ok(fourBuses >= 5)
  assert.ok(Number.isFinite(oneBus))
})

test('scenario objectives use live metrics, require completed runs, and unlock one stage at a time', () => {
  assert.equal(scenarios.length, 6)
  const metrics = { priorityDestinationsConnected: 2, validRoutes: 1, activeStops: 3, coveragePercent: 40, transferHubs: 1, bestEffectiveHeadway: 12, servedPassengers: 5, netBalance: 10, fareRevenue: 30, averageWait: 8, averageJourney: 20, capacityUtilization: .5, simulationComplete: 0 }
  assert.equal(evaluateScenario(scenarios[0], metrics, false).complete, true)
  const frequency = evaluateScenario(scenarios[3], metrics, false)
  assert.equal(frequency.objectives.find((item) => item.config.id === 'service').passed, false)
  assert.equal(evaluateScenario(scenarios[3], metrics, true).complete, true)
  assert.equal(evaluateScenario(scenarios[4], { ...metrics, fareRevenue: 20, netBalance: 0 }, true).complete, true, 'break-even is a valid budget outcome')
  assert.equal(evaluateScenario(scenarios[4], { ...metrics, netBalance: -1 }, true).complete, false)
  assert.equal(evaluateScenario(scenarios[4], metrics, false).complete, false, 'financial objectives wait for a completed run')
  assert.equal(nextUnlockedScenarioIndex(0, 0, true), 1)
  assert.equal(nextUnlockedScenarioIndex(2, 0, true), 2)
  assert.equal(nextUnlockedScenarioIndex(2, 2, false), 2)
  assert.equal(nextUnlockedScenarioIndex(5, 5, true), 5)
})

test('the simulation boards and delivers riders and computes waiting, journey, fare, and operating totals', () => {
  const legs = routeLegsForStops(['n12', 'n56'])
  const route = { id: 'single', name: 'Station–Hospital', stopIds: ['n12', 'n56'], legs }
  const input = { routes: [route], settings: { single: { fleetSize: 3, headwayMinutes: 12 } }, stops: route.stopIds, walkingRadiusMeters: 1_000, fare: 3, durationMinutes: 120 }
  const state = runToEnd(input)
  const summary = summarizeSimulation(state)
  assert.equal(state.complete, true)
  assert.ok(summary.served > 0, 'at least one passenger should alight at a destination')
  assert.ok(summary.fareRevenue > 0, 'boarding should collect fares')
  assert.ok(summary.operatingCost > 0)
  assert.ok(summary.averageWait > 0)
  assert.ok(summary.averageJourney > 0)
  assert.ok(Math.abs(summary.averageWait - state.metrics.waitMinutesTotal / state.metrics.boardedPassengers) < 1e-9)
  assert.ok(Math.abs(summary.balance - (summary.fareRevenue - summary.operatingCost)) < 1e-9)
})

test('capacity limits occupancy and connected route pairs create transfer plans', () => {
  const firstLegs = routeLegsForStops(['n12', 'n56'])
  const secondLegs = routeLegsForStops(['n56', 'n57'])
  const first = { id: 'north', name: 'North', stopIds: ['n12', 'n56'], legs: firstLegs }
  const second = { id: 'east', name: 'East', stopIds: ['n56', 'n57'], legs: secondLegs }
  const transferInput = { routes: [first, second], settings: { north: { fleetSize: 3, headwayMinutes: 12 }, east: { fleetSize: 3, headwayMinutes: 12 } }, stops: ['n12', 'n56', 'n57'], walkingRadiusMeters: 600, fare: 2, durationMinutes: 180, busCapacity: 1 }
  const initial = createSimulation(transferInput)
  const marketToCivic = initial.groups.find((group) => group.originDistrictId === 'market' && group.destinationId === 'civic-hall')
  assert.equal(marketToCivic?.plan.length, 2, 'Market Quarter to Civic Hall should require the shared n56 transfer')
  const summary = summarizeSimulation(runToEnd(transferInput))
  assert.ok(summary.served > 0)
  assert.ok(summary.occupancy <= 1)
  assert.ok(summary.capacityUtilization <= 1)
  assert.ok(summary.capacityUtilization > 0)
  assert.ok(summary.transfers > 0)
  assert.ok(summary.fareRevenue <= (summary.served + summary.unserved) * transferInput.fare, 'transfers do not collect a second fare')
})

test('identical simulation inputs produce identical tick state and a repeatable reset', () => {
  const stopIds = ['n12', 'n56']
  const route = { id: 'repeat', name: 'Repeat', stopIds, legs: routeLegsForStops(stopIds) }
  const input = { routes: [route], settings: { repeat: { fleetSize: 2, headwayMinutes: 10 } }, stops: stopIds, walkingRadiusMeters: 800, fare: 2.5, durationMinutes: 60 }
  const initialA = createSimulation(input)
  const initialB = createSimulation(input)
  assert.deepEqual(initialA, initialB)
  let first = initialA
  let second = initialB
  for (let minute = 0; minute < 45; minute++) {
    first = stepSimulation(first)
    second = stepSimulation(second)
  }
  assert.deepEqual(first, second)
  assert.deepEqual(summarizeSimulation(first), summarizeSimulation(second))
  assert.deepEqual(createSimulation(input), initialA)
})
