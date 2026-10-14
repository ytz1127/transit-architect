import { city, type RoadNode } from '../data/city'
import { distanceInMeters, edgeBetween, shortestPath, validateRoute, type Route } from './routing'

export type ServiceSettings={fleetSize:number;headwayMinutes:number}
export type SimulationInput={routes:Route[];settings:Record<string,ServiceSettings>;stops:string[];walkingRadiusMeters:number;fare:number;durationMinutes?:number;busCapacity?:number;speedKph?:number}
type RideLeg={routeId:string;fromStopId:string;toStopId:string;distanceKm:number;rideMinutes:number}
type DemandGroup={id:string;originDistrictId:string;destinationId:string;passengers:number;departureMinute:number;walkMinutes:number;finalWalkMinutes:number;plan:RideLeg[];noService:boolean;arrived:boolean}
type WaitingBatch={id:string;demandId:string;passengers:number;legIndex:number;waitingSince:number;availableAt:number}
type RiderBatch={demandId:string;passengers:number;legIndex:number;toStopId:string;boardedAt:number}
export type SimBus={id:string;routeId:string;path:string[];depotPath:string[];launchDelay:number;stopIds:string[];capacity:number;nodeIndex:number;direction:1|-1;edgeElapsed:number;dwellMinutes:number;readyAt:number;stopHandled:boolean;passengers:RiderBatch[]}
type SimMetrics={totalDemand:number;noServiceUnserved:number;served:number;fareRevenue:number;waitMinutesTotal:number;boardedPassengers:number;journeyMinutesTotal:number;transfers:number;busActiveMinutes:number;busKilometers:number;occupiedSeatMinutes:number;capacitySeatMinutes:number;peakOccupancy:number}
export type SimulationState={minute:number;durationMinutes:number;complete:boolean;input:SimulationInput;groups:DemandGroup[];waiting:WaitingBatch[];buses:SimBus[];metrics:SimMetrics;nextBatch:number}
export type SimulationSummary={minute:number;totalDemand:number;served:number;unserved:number;waiting:number;onboard:number;averageWait:number;averageJourney:number;transfers:number;occupancy:number;capacityUtilization:number;operatingCost:number;fareRevenue:number;balance:number;busKilometers:number;fleet:number}

const DEFAULT_CAPACITY=40,DEFAULT_SPEED=30,TRANSFER_PENALTY=6,MAX_TRANSFERS=2
const node=(id:string)=>city.nodes.find(item=>item.id===id)!
function edgeMinutes(a:string,b:string,speed:number){const edge=edgeBetween(a,b);return edge?Math.max(1,Math.ceil(edge.lengthKm/speed*60)):Infinity}
function routeNodes(route:Route){return route.legs.flatMap((leg,index)=>index?leg.slice(1):leg)}
function segmentKm(path:string[]){return path.slice(1).reduce((total,id,index)=>total+(edgeBetween(path[index],id)?.lengthKm??Infinity),0)}

function rideEdges(routes:Route[],speed:number){
  const edges:RideLeg[]=[]
  for(const route of routes){
    const segmentLengths=route.legs.map(segmentKm)
    for(let from=0;from<route.stopIds.length;from++)for(let to=from+1;to<route.stopIds.length;to++){
      const distanceKm=segmentLengths.slice(from,to).reduce((sum,length)=>sum+length,0)
      if(!Number.isFinite(distanceKm))continue
      const rideMinutes=Math.max(1,Math.ceil(distanceKm/speed*60)+(to-from-1))
      edges.push({routeId:route.id,fromStopId:route.stopIds[from],toStopId:route.stopIds[to],distanceKm,rideMinutes})
      edges.push({routeId:route.id,fromStopId:route.stopIds[to],toStopId:route.stopIds[from],distanceKm,rideMinutes})
    }
  }
  return edges.sort((a,b)=>a.fromStopId.localeCompare(b.fromStopId)||a.routeId.localeCompare(b.routeId)||a.toStopId.localeCompare(b.toStopId))
}

function findJourney(start:string,targets:Set<string>,edges:RideLeg[]):RideLeg[]|null{
  type State={stop:string;plan:RideLeg[];cost:number;visited:string[]}
  const open:State[]=[{stop:start,plan:[],cost:0,visited:[start]}]
  while(open.length){
    open.sort((a,b)=>a.cost-b.cost||a.plan.map(leg=>leg.routeId).join('/').localeCompare(b.plan.map(leg=>leg.routeId).join('/'))||a.stop.localeCompare(b.stop))
    const state=open.shift()!
    if(state.plan.length&&targets.has(state.stop))return state.plan
    if(state.plan.length>=MAX_TRANSFERS+1)continue
    const last=state.plan.at(-1)
    for(const edge of edges){
      if(edge.fromStopId!==state.stop||edge.routeId===last?.routeId||state.visited.includes(edge.toStopId))continue
      const switched=Boolean(last),cost=state.cost+edge.rideMinutes+(switched?TRANSFER_PENALTY:0)
      open.push({stop:edge.toStopId,plan:[...state.plan,edge],cost,visited:[...state.visited,edge.toStopId]})
    }
  }
  return null
}

function planTrip(origin:RoadNode,destination:{x:number;y:number},stopIds:string[],edges:RideLeg[],radius:number){
  const origins=stopIds.map(id=>node(id)).filter(stop=>distanceInMeters(stop,origin)<=radius).sort((a,b)=>distanceInMeters(a,origin)-distanceInMeters(b,origin)||a.id.localeCompare(b.id))
  const targets=stopIds.map(id=>node(id)).filter(stop=>distanceInMeters(stop,destination)<=radius).sort((a,b)=>distanceInMeters(a,destination)-distanceInMeters(b,destination)||a.id.localeCompare(b.id))
  let best:{plan:RideLeg[];walkToStart:number;walkFromEnd:number;score:number}|null=null
  for(const start of origins){const plan=findJourney(start.id,new Set(targets.map(target=>target.id)),edges);if(!plan)continue;const end=plan.at(-1)!.toStopId,walkToStart=distanceInMeters(start,origin),walkFromEnd=distanceInMeters(node(end),destination),score=(walkToStart+walkFromEnd)/80+plan.reduce((sum,leg)=>sum+leg.rideMinutes,0)+(plan.length-1)*TRANSFER_PENALTY;if(!best||score<best.score-1e-9||(Math.abs(score-best.score)<=1e-9&&`${start.id}/${end}`<`${best.plan[0].fromStopId}/${best.plan.at(-1)!.toStopId}`))best={plan,walkToStart,walkFromEnd,score}}
  return best
}

function makeGroups(input:SimulationInput,edges:RideLeg[],duration:number){
  const groups:DemandGroup[]=[];let totalDemand=0,noServiceUnserved=0
  const origins=city.districts.filter(district=>district.population>0)
  for(let originIndex=0;originIndex<origins.length;originIndex++)for(let destIndex=0;destIndex<city.destinations.length;destIndex++){
    const origin=origins[originIndex],destination=city.destinations[destIndex]
    const passengers=Math.max(1,Math.round(origin.population*(destination.attraction/100)*.0012))
    const trip=planTrip({id:origin.id,x:origin.label[0],y:origin.label[1]},destination,input.stops,edges,input.walkingRadiusMeters)
    const noService=!trip
    const departureMinute=(originIndex*7+destIndex*13)%Math.max(1,Math.min(20,duration))
    groups.push({id:`od-${origin.id}-${destination.id}`,originDistrictId:origin.id,destinationId:destination.id,passengers,departureMinute,walkMinutes:trip?Math.ceil(trip.walkToStart/80):0,finalWalkMinutes:trip?Math.ceil(trip.walkFromEnd/80):0,plan:trip?.plan??[],noService,arrived:false})
    totalDemand+=passengers;if(noService)noServiceUnserved+=passengers
  }
  return {groups,totalDemand,noServiceUnserved}
}

function makeBusPath(route:Route){return routeNodes(route)}
function roundTripMinutes(path:string[],stopIds:string[],speed:number){const oneWay=path.slice(1).reduce((sum,id,index)=>sum+edgeMinutes(path[index],id,speed),0);return 2*(oneWay+stopIds.length)}
function pathTravelMinutes(path:string[],speed:number){return path.slice(1).reduce((sum,id,index)=>sum+edgeMinutes(path[index],id,speed),0)}
function pathDistanceKm(path:string[]){return path.slice(1).reduce((sum,id,index)=>sum+(edgeBetween(path[index],id)?.lengthKm??0),0)}
export function effectiveServiceHeadway(route:Route,fleetSize:number,requestedHeadway:number){const path=makeBusPath(route),cycle=roundTripMinutes(path,route.stopIds,DEFAULT_SPEED);return Math.max(Math.max(1,Math.floor(requestedHeadway)),Math.ceil(cycle/Math.max(1,Math.floor(fleetSize))))}

export function createSimulation(input:SimulationInput):SimulationState{
  const durationMinutes=input.durationMinutes??60,speed=input.speedKph??DEFAULT_SPEED
  const validRoutes=input.routes.filter(route=>validateRoute(route,input.stops).valid)
  const normalized={...input,routes:validRoutes,durationMinutes,speedKph:speed,busCapacity:input.busCapacity??DEFAULT_CAPACITY}
  const edges=rideEdges(validRoutes,speed),{groups,totalDemand,noServiceUnserved}=makeGroups(normalized,edges,durationMinutes)
  const buses:SimBus[]=[]
  for(const route of validRoutes){
    const config=normalized.settings[route.id]??{fleetSize:3,headwayMinutes:12},path=makeBusPath(route),depotPath=shortestPath(city.depot.nodeId,path[0])??[path[0]],deadhead=pathTravelMinutes(depotPath,speed)
    if(path.length<2)continue
    const fleet=Math.max(1,Math.floor(config.fleetSize)),cycle=roundTripMinutes(path,route.stopIds,speed),headway=Math.max(1,Math.floor(config.headwayMinutes)),interval=Math.max(headway,Math.ceil(cycle/fleet))
    for(let index=0;index<fleet;index++){const launchDelay=index*interval;buses.push({id:`${route.id}-bus-${index+1}`,routeId:route.id,path,depotPath,launchDelay,stopIds:route.stopIds,capacity:normalized.busCapacity!,nodeIndex:0,direction:1,edgeElapsed:0,dwellMinutes:0,readyAt:launchDelay+deadhead,stopHandled:false,passengers:[]})}
  }
  buses.sort((a,b)=>a.id.localeCompare(b.id))
  return {minute:0,durationMinutes,complete:false,input:normalized,groups,waiting:[],buses,metrics:{totalDemand,noServiceUnserved,served:0,fareRevenue:0,waitMinutesTotal:0,boardedPassengers:0,journeyMinutesTotal:0,transfers:0,busActiveMinutes:0,busKilometers:0,occupiedSeatMinutes:0,capacitySeatMinutes:0,peakOccupancy:0},nextBatch:1}
}

function serveStop(state:SimulationState,bus:SimBus,minute:number){
  const stopId=bus.path[bus.nodeIndex]
  for(let index=bus.passengers.length-1;index>=0;index--){
    const rider=bus.passengers[index];if(rider.toStopId!==stopId)continue
    bus.passengers.splice(index,1)
    const group=state.groups.find(item=>item.id===rider.demandId)!
    if(rider.legIndex===group.plan.length-1){state.metrics.served+=rider.passengers;state.metrics.journeyMinutesTotal+=rider.passengers*(minute+group.finalWalkMinutes-group.departureMinute)}
    else state.waiting.push({id:`transfer-${state.nextBatch++}`,demandId:rider.demandId,passengers:rider.passengers,legIndex:rider.legIndex+1,waitingSince:minute,availableAt:minute})
  }
  const free=bus.capacity-bus.passengers.reduce((sum,rider)=>sum+rider.passengers,0)
  if(free<=0)return
  for(let index=0;index<state.waiting.length&&bus.passengers.reduce((sum,rider)=>sum+rider.passengers,0)<bus.capacity;index++){
    const batch=state.waiting[index],group=state.groups.find(item=>item.id===batch.demandId)!,leg=group.plan[batch.legIndex]
    if(batch.availableAt>minute||leg?.routeId!==bus.routeId||leg.fromStopId!==stopId)continue
    const occupied=bus.passengers.reduce((sum,rider)=>sum+rider.passengers,0),boarded=Math.min(batch.passengers,bus.capacity-occupied)
    if(boarded<=0)continue
    batch.passengers-=boarded;state.metrics.waitMinutesTotal+=boarded*Math.max(0,minute-batch.waitingSince);state.metrics.boardedPassengers+=boarded
    if(batch.legIndex===0)state.metrics.fareRevenue+=boarded*state.input.fare
    else state.metrics.transfers+=boarded
    bus.passengers.push({demandId:batch.demandId,passengers:boarded,legIndex:batch.legIndex,toStopId:leg.toStopId,boardedAt:minute})
  }
  state.waiting=state.waiting.filter(batch=>batch.passengers>0)
}

function moveBus(state:SimulationState,bus:SimBus,minute:number,speed:number){
  if(minute<bus.readyAt)return
  if(bus.dwellMinutes>0){bus.dwellMinutes--;return}
  const stopSet=new Set(bus.stopIds)
  // The initial terminal visit also boards passengers.
  if(stopSet.has(bus.path[bus.nodeIndex])&&!bus.stopHandled){serveStop(state,bus,minute);bus.stopHandled=true;bus.dwellMinutes=1;return}
  const nextIndex=bus.nodeIndex+bus.direction
  if(nextIndex<0||nextIndex>=bus.path.length){bus.direction=bus.direction===1?-1:1;bus.dwellMinutes=1;return}
  const from=bus.path[bus.nodeIndex],to=bus.path[nextIndex],duration=edgeMinutes(from,to,speed),edge=edgeBetween(from,to)
  bus.edgeElapsed++
  if(edge)state.metrics.busKilometers+=edge.lengthKm/duration
  if(bus.edgeElapsed>=duration){bus.nodeIndex=nextIndex;bus.edgeElapsed=0;bus.stopHandled=false
    if(bus.nodeIndex===bus.path.length-1)bus.direction=-1
    else if(bus.nodeIndex===0&&bus.direction===-1){bus.direction=1;const config=state.input.settings[bus.routeId]??{fleetSize:3,headwayMinutes:12},cycle=roundTripMinutes(bus.path,bus.stopIds,speed),interval=Math.max(config.headwayMinutes,Math.ceil(cycle/Math.max(1,config.fleetSize)));bus.readyAt=minute+Math.max(0,interval*Math.max(1,config.fleetSize)-cycle)}
    if(stopSet.has(to)){serveStop(state,bus,minute);bus.stopHandled=true;bus.dwellMinutes=1}
  }
}

export function stepSimulation(current:SimulationState):SimulationState{
  if(current.complete)return current
  const state=structuredClone(current),minute=state.minute+1,speed=state.input.speedKph??DEFAULT_SPEED
  state.minute=minute
  for(const group of state.groups){if(group.noService||group.arrived||minute<group.departureMinute+group.walkMinutes)continue;group.arrived=true;state.waiting.push({id:`origin-${group.id}`,demandId:group.id,passengers:group.passengers,legIndex:0,waitingSince:group.departureMinute+group.walkMinutes,availableAt:group.departureMinute+group.walkMinutes})}
  for(const bus of state.buses){if(minute>bus.launchDelay&&minute<=bus.readyAt){const deadheadMinutes=pathTravelMinutes(bus.depotPath,speed);if(deadheadMinutes>0)state.metrics.busKilometers+=pathDistanceKm(bus.depotPath)/deadheadMinutes}moveBus(state,bus,minute,speed)}
  const dispatched=state.buses.filter(bus=>minute>bus.launchDelay),active=dispatched.filter(bus=>minute>=bus.readyAt),occupied=active.reduce((sum,bus)=>sum+bus.passengers.reduce((count,rider)=>count+rider.passengers,0),0),capacity=active.reduce((sum,bus)=>sum+bus.capacity,0)
  state.metrics.busActiveMinutes+=dispatched.length;state.metrics.occupiedSeatMinutes+=occupied;state.metrics.capacitySeatMinutes+=capacity
  if(capacity)state.metrics.peakOccupancy=Math.max(state.metrics.peakOccupancy,occupied/capacity)
  if(minute>=state.durationMinutes)state.complete=true
  return state
}

export function summarizeSimulation(state:SimulationState):SimulationSummary{
  const onboard=state.buses.reduce((sum,bus)=>sum+bus.passengers.reduce((count,rider)=>count+rider.passengers,0),0),waiting=state.waiting.reduce((sum,batch)=>sum+batch.passengers,0),capacity=state.buses.filter(bus=>state.minute>=bus.readyAt).reduce((sum,bus)=>sum+bus.capacity,0)
  const served=state.metrics.served,unserved=state.complete?state.metrics.totalDemand-served:state.metrics.noServiceUnserved
  const operatingCost=state.metrics.busActiveMinutes*.72+state.metrics.busKilometers*1.8
  return {minute:state.minute,totalDemand:state.metrics.totalDemand,served,unserved,waiting,onboard,averageWait:state.metrics.boardedPassengers?state.metrics.waitMinutesTotal/state.metrics.boardedPassengers:0,averageJourney:served?state.metrics.journeyMinutesTotal/served:0,transfers:state.metrics.transfers,occupancy:capacity?onboard/capacity:0,capacityUtilization:state.metrics.capacitySeatMinutes?state.metrics.occupiedSeatMinutes/state.metrics.capacitySeatMinutes:0,operatingCost,fareRevenue:state.metrics.fareRevenue,balance:state.metrics.fareRevenue-operatingCost,busKilometers:state.metrics.busKilometers,fleet:state.buses.length}
}

function edgePosition(fromId:string,toId:string,t:number){
  const from=node(fromId),to=node(toId),edge=edgeBetween(fromId,toId),match=edge?.path?.match(/M\s*(-?[\d.]+)\s+(-?[\d.]+)\s+Q\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)/)
  if(match){let [sx,sy,cx,cy,ex,ey]=match.slice(1).map(Number);if(edge?.from===toId)[sx,sy,ex,ey]=[ex,ey,sx,sy];const u=1-t;return {x:u*u*sx+2*u*t*cx+t*t*ex,y:u*u*sy+2*u*t*cy+t*t*ey}}
  return {x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t}
}
export function busMapPosition(bus:SimBus,minute=bus.readyAt,speed=DEFAULT_SPEED){
  if(minute<bus.readyAt){let elapsed=Math.max(0,minute-bus.launchDelay);for(let index=0;index<bus.depotPath.length-1;index++){const from=bus.depotPath[index],to=bus.depotPath[index+1],duration=edgeMinutes(from,to,speed);if(elapsed<=duration)return edgePosition(from,to,Math.min(1,elapsed/duration));elapsed-=duration}return node(bus.depotPath.at(-1)!)}
  const from=bus.path[bus.nodeIndex],nextIndex=bus.nodeIndex+bus.direction,to=bus.path[Math.max(0,Math.min(bus.path.length-1,nextIndex))],duration=edgeMinutes(from,to,speed),fraction=from===to?0:Math.min(1,bus.edgeElapsed/duration)
  return edgePosition(from,to,fraction)
}
