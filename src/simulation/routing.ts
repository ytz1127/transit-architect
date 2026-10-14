import { city, type RoadEdge } from '../data/city'

export type Route = { id: string; name: string; stopIds: string[]; legs: string[][] }
// City road lengths use about 0.72 km for a 120-unit block, so 84 map units represent 500 m.
const METERS_PER_MAP_UNIT = 500 / 84
const EPSILON = 1e-9

export function neighbors(nodeId: string) {
  return city.edges.flatMap(edge => edge.from === nodeId ? [{ nodeId: edge.to, edge }] : edge.to === nodeId ? [{ nodeId: edge.from, edge }] : [])
    .sort((a,b)=>a.nodeId.localeCompare(b.nodeId))
}

export function edgeBetween(a: string, b: string): RoadEdge | undefined {
  return city.edges.find(edge => (edge.from===a&&edge.to===b)||(edge.from===b&&edge.to===a))
}

export function orientedRoadPath(from:string,to:string){
  const edge=edgeBetween(from,to),a=city.nodes.find(node=>node.id===from)!,b=city.nodes.find(node=>node.id===to)!
  if(!edge?.path)return `M${a.x} ${a.y} L${b.x} ${b.y}`
  if(from===edge.from)return edge.path
  const match=edge.path.match(/^M\s*([\d.-]+)\s+([\d.-]+)\s+Q\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)$/)
  return match?`M${match[5]} ${match[6]} Q${match[3]} ${match[4]} ${match[1]} ${match[2]}`: `M${a.x} ${a.y} L${b.x} ${b.y}`
}

/** Dijkstra with stable ties: node ID breaks equal queue distances, predecessor ID breaks equal paths. */
export function shortestPath(start: string, end: string, blocked = new Set<string>()): string[] | null {
  if (start === end) return [start]
  if (blocked.has(start) || blocked.has(end)) return null
  const distance = new Map<string,number>([[start,0]])
  const previous = new Map<string,string>()
  const pending = new Set(city.nodes.map(node=>node.id))
  while (pending.size) {
    const current = [...pending].sort((a,b)=>(distance.get(a)??Infinity)-(distance.get(b)??Infinity)||a.localeCompare(b))[0]
    if (!Number.isFinite(distance.get(current))) break
    pending.delete(current)
    if (current === end) break
    for (const {nodeId,edge} of neighbors(current)) {
      if (!pending.has(nodeId) || blocked.has(nodeId)) continue
      const candidate = distance.get(current)! + edge.lengthKm
      const old = distance.get(nodeId) ?? Infinity
      const oldPrevious = previous.get(nodeId)
      if (candidate < old - EPSILON || (Math.abs(candidate-old)<=EPSILON && current.localeCompare(oldPrevious??'~')<0)) {
        distance.set(nodeId,candidate)
        previous.set(nodeId,current)
      }
    }
  }
  if (!previous.has(end)) return null
  const path=[end]; let cursor=end
  while(cursor!==start){const prev=previous.get(cursor);if(!prev)return null;path.push(prev);cursor=prev}
  return path.reverse()
}

export function routeLegsForStops(stopIds:string[]): string[][] | null {
  if(stopIds.length<2) return null
  const legs:string[][]=[]
  for(let i=0;i<stopIds.length-1;i++){
    const from=city.nodes.find(node=>node.id===stopIds[i])
    const to=city.nodes.find(node=>node.id===stopIds[i+1])
    if(!from||!to||from.id===to.id)return null
    const path=shortestPath(from.id,to.id)
    if(!path)return null
    legs.push(path)
  }
  return legs
}

export function adjustRouteLeg(path:string[], junctionIndex:number, nextNodeId:string):string[]|null {
  if(junctionIndex<=0||junctionIndex>=path.length-1)return null
  const junction=path[junctionIndex], destination=path[path.length-1]
  if(!neighbors(junction).some(candidate=>candidate.nodeId===nextNodeId)||nextNodeId===path[junctionIndex-1])return null
  const blocked=new Set(path.slice(0,junctionIndex+1))
  const tail=shortestPath(nextNodeId,destination,blocked)
  if(!tail)return null
  return [...path.slice(0,junctionIndex+1),...tail]
}

export function validateRoute(route:Route,placedStopIds:string[]) {
  const errors:string[]=[]
  if(route.stopIds.length<2)errors.push('Choose at least two stops in order.')
  if(route.legs.length!==route.stopIds.length-1)errors.push('A route segment is missing between stops.')
  route.legs.forEach((leg,index)=>{
    if(leg[0]!==route.stopIds[index]||leg.at(-1)!==route.stopIds[index+1])errors.push(`Segment ${index+1} does not join its selected stops.`)
    for(let i=1;i<leg.length;i++)if(!edgeBetween(leg[i-1],leg[i]))errors.push(`Segment ${index+1} leaves the existing road network.`)
  })
  if(route.stopIds.some(stopId=>!placedStopIds.includes(stopId)))errors.push('Every route stop must still be placed on the map.')
  return {valid:errors.length===0,errors}
}

export function mapUnitsForMeters(meters:number){return meters/METERS_PER_MAP_UNIT}
export function distanceInMeters(a:{x:number;y:number},b:{x:number;y:number}){return Math.hypot(a.x-b.x,a.y-b.y)*METERS_PER_MAP_UNIT}

export function servedDestinations(stopNodeId:string,radiusMeters:number){
  const stop=city.nodes.find(node=>node.id===stopNodeId)
  return stop?city.destinations.filter(destination=>distanceInMeters(stop,destination)<=radiusMeters):[]
}

/** A district's population is counted once its mapped population center is inside any stop catchment. */
export function coverageForStops(stopIds:string[],radiusMeters:number){
  const centers=stopIds.map(id=>city.nodes.find(node=>node.id===id)).filter((node):node is NonNullable<typeof node>=>Boolean(node))
  const coveredDistricts=city.districts.filter(district=>district.population>0&&centers.some(stop=>distanceInMeters(stop,{x:district.label[0],y:district.label[1]})<=radiusMeters))
  const served=new Set(centers.flatMap(stop=>servedDestinations(stop.id,radiusMeters).map(destination=>destination.id)))
  return {population:coveredDistricts.reduce((total,district)=>total+district.population,0),districts:coveredDistricts.map(district=>district.id),destinations:city.destinations.filter(destination=>served.has(destination.id))}
}
