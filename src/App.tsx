import { useEffect, useMemo, useState } from 'react'
import { city, validateRoadGraph, type RoadNode } from './data/city'
import { adjustRouteLeg, coverageForStops, distanceInMeters, mapUnitsForMeters, neighbors, orientedRoadPath, routeLegsForStops, servedDestinations, shortestPath, validateRoute, type Route } from './simulation/routing'
import { busMapPosition, createSimulation, effectiveServiceHeadway, stepSimulation, summarizeSimulation, type ServiceSettings, type SimulationState } from './simulation/engine'
import { MathematicsLab } from './components/MathematicsLab'
import type { MathLesson } from './math/lessons'
import { evaluateScenario, nextUnlockedScenarioIndex, scenarios, type ScenarioMetrics } from './data/scenarios'
import { mathLessons } from './math/lessons'

const routeColors=['#dc655b','#577fc0','#a56eb8','#d18c35']
const routeColor=(index:number)=>index<routeColors.length?routeColors[index]:`hsl(${Math.round((index*137.508)%360)} 54% 43%)`
const nodeById=(id:string)=>city.nodes.find(node=>node.id===id)!
const stopName=(id:string)=>id==='n12'?'Central Station':`Stop ${id.slice(1)}`
const routeLength=(route:Route)=>route.legs.reduce((total,leg)=>total+leg.slice(1).reduce((sum,nodeId,index)=>sum+(city.edges.find(edge=>(edge.from===nodeId&&edge.to===leg[index])||(edge.to===nodeId&&edge.from===leg[index]))?.lengthKm??0),0),0)
const pathLength=(path:string[])=>path.slice(1).reduce((total,id,index)=>total+(city.edges.find(edge=>(edge.from===id&&edge.to===path[index])||(edge.to===id&&edge.from===path[index]))?.lengthKm??0),0)
const formatObjectiveValue=(metric:string,value:number)=>metric==='coveragePercent'?`${value.toFixed(1)}%`:metric==='netBalance'||metric==='fareRevenue'?`$${value.toFixed(0)}`:metric==='bestEffectiveHeadway'||metric==='averageWait'||metric==='averageJourney'?`${value.toFixed(1)} min`:metric==='capacityUtilization'?`${(value*100).toFixed(0)}%`:metric==='simulationComplete'?value?'Complete':'Run simulation':`${Math.floor(value)} ${metric==='validRoutes'?'routes':metric==='activeStops'?'stops':metric==='servedPassengers'?'riders':metric==='transferHubs'?'hubs':'destinations'}`

function App() {
  const [isSandbox,setIsSandbox]=useState(false)
  const [activeScenarioId,setActiveScenarioId]=useState(scenarios[0].id)
  const [unlockedScenarioIndex,setUnlockedScenarioIndex]=useState(0)
  const activeScenario=scenarios.find(item=>item.id===activeScenarioId)??scenarios[0]
  const scenarioIndex=scenarios.indexOf(activeScenario)
  const [stops,setStops]=useState<string[]>(scenarios[0].initialConditions.startingStops)
  const [selectedStop,setSelectedStop]=useState('n12')
  const [placeMode,setPlaceMode]=useState(false)
  const [routeMode,setRouteMode]=useState(false)
  const [routes,setRoutes]=useState<Route[]>([])
  const [routeCounter,setRouteCounter]=useState(1)
  const [selectedRoute,setSelectedRoute]=useState<string|null>(null)
  const [routeDraft,setRouteDraft]=useState<string[]>([])
  const [routeEditId,setRouteEditId]=useState<string|null>(null)
  const [routeName,setRouteName]=useState('Route 1')
  const [routeMessage,setRouteMessage]=useState('')
  const [routeError,setRouteError]=useState('')
  const [adjustment,setAdjustment]=useState<{routeId:string;leg:number;index:number}|null>(null)
  const [radius,setRadius]=useState(scenarios[0].initialConditions.walkingRadiusMeters)
  const [labOpen,setLabOpen]=useState(false)
  const [zoom,setZoom]=useState(1)
  const [serviceSettings,setServiceSettings]=useState<Record<string,ServiceSettings>>({})
  const [fare,setFare]=useState(scenarios[0].initialConditions.fare)
  const [simulation,setSimulation]=useState<SimulationState|null>(null)
  const [running,setRunning]=useState(false)
  const [simSpeed,setSimSpeed]=useState(1)
  const graph=useMemo(()=>validateRoadGraph(city),[])
  const coverage=useMemo(()=>coverageForStops(stops,radius),[stops,radius])
  const selected=routes.find(route=>route.id===selectedRoute)??null
  const draftLegs=useMemo(()=>routeLegsForStops(routeDraft),[routeDraft])
  const draftRoute=routeMode&&draftLegs?{id:routeEditId??'draft',name:routeName,stopIds:routeDraft,legs:draftLegs}:null
  const validation=selected?validateRoute(selected,stops):null
  const routeNodeIds=new Set((routeMode?draftRoute:selected)?.legs.flat()??[])
  const simulationInput=useMemo(()=>({routes,settings:serviceSettings,stops,walkingRadiusMeters:radius,fare,durationMinutes:60}),[routes,serviceSettings,stops,radius,fare])
  const summary=simulation?summarizeSimulation(simulation):null
  const focusStop=city.nodes.find(node=>node.id===selectedStop)??nodeById('n12')
  const nearestDistrict=city.districts.filter(district=>district.population>0).map(district=>({district,distance:distanceInMeters(focusStop,{x:district.label[0],y:district.label[1]})})).sort((a,b)=>a.distance-b.distance||a.district.id.localeCompare(b.district.id))[0]
  const referencePathKm=pathLength(shortestPath('n12','n58')??[])
  const service=selected?serviceSettings[selected.id]??{fleetSize:3,headwayMinutes:12}:{fleetSize:3,headwayMinutes:12}
  const realizedHeadway=selected?effectiveServiceHeadway(selected,service.fleetSize,service.headwayMinutes):service.headwayMinutes
  const baseOperatingCost=service.fleetSize*60*.72+(selected?routeLength(selected)*2*60/realizedHeadway*1.8:0)
  const operatingCostPerHour=summary&&simulation?.minute?summary.operatingCost/simulation.minute*60:baseOperatingCost
  const validRoutes=routes.filter(route=>validateRoute(route,stops).valid)
  const priorityDestinationsConnected=Math.max(0,...validRoutes.map(route=>['central-station','meridian-hospital'].filter(destinationId=>route.stopIds.some(stopId=>servedDestinations(stopId,radius).some(destination=>destination.id===destinationId))).length))
  const transferHubs=[...new Set(validRoutes.flatMap(route=>route.stopIds))].filter(stopId=>validRoutes.filter(route=>route.stopIds.includes(stopId)).length>=2).length
  const bestEffectiveHeadway=validRoutes.length?Math.min(...validRoutes.map(route=>{const settings=serviceSettings[route.id]??{fleetSize:activeScenario.initialConditions.fleetSize,headwayMinutes:activeScenario.initialConditions.headwayMinutes};return effectiveServiceHeadway(route,settings.fleetSize,settings.headwayMinutes)})):9999
  const scenarioMetrics:ScenarioMetrics={priorityDestinationsConnected,validRoutes:validRoutes.length,activeStops:stops.length,coveragePercent:coverage.population/city.population*100,transferHubs,bestEffectiveHeadway,servedPassengers:summary?.served??0,netBalance:summary?.balance??0,fareRevenue:summary?.fareRevenue??0,averageWait:summary?.averageWait??0,averageJourney:summary?.averageJourney??0,capacityUtilization:summary?.capacityUtilization??0,simulationComplete:simulation?.complete?1:0}
  const scenarioEvaluation=evaluateScenario(activeScenario,scenarioMetrics,Boolean(simulation?.complete))
  const lessonProgressIndex=isSandbox?scenarios.length-1:Math.max(unlockedScenarioIndex,scenarioIndex)
  const scenarioUnlockedLessonIds=mathLessons.filter(lesson=>scenarios.slice(0,unlockedScenarioIndex+1).some(item=>item.lessonId===lesson.id)).map(lesson=>lesson.id)
  const currentScenarioLessonIds=mathLessons.filter(lesson=>scenarios.slice(0,scenarioIndex+1).some(item=>item.lessonId===lesson.id)).map(lesson=>lesson.id)
  if(lessonProgressIndex>=3){scenarioUnlockedLessonIds.push('capacity');currentScenarioLessonIds.push('capacity')}
  if(lessonProgressIndex>=5){scenarioUnlockedLessonIds.push('calculus');currentScenarioLessonIds.push('calculus')}
  const scenarioLessonIds=isSandbox?mathLessons.map(lesson=>lesson.id):[...new Set([...scenarioUnlockedLessonIds,...currentScenarioLessonIds])]
  useEffect(()=>{if(!isSandbox)setUnlockedScenarioIndex(current=>nextUnlockedScenarioIndex(current,scenarioIndex,scenarioEvaluation.complete))},[isSandbox,scenarioEvaluation.complete,scenarioIndex])
  const mathContext={coveragePercent:coverage.population/city.population*100,coveredPopulation:coverage.population,totalPopulation:city.population,walkRadiusMeters:radius,nearestDistrictName:nearestDistrict.district.name,nearestDistrictMeters:nearestDistrict.distance,selectedStopName:stopName(selectedStop||'n12'),routeName:selected?.name??'Current route',routeDistanceKm:selected?routeLength(selected):0,referencePathKm,headwayMinutes:realizedHeadway,fleetSize:service.fleetSize,fare,operatingCostPerHour,served:summary?.served??0,averageWaitMinutes:summary?.averageWait??0,onboard:summary?.onboard??0,capacityUtilization:summary?.capacityUtilization??0}

  useEffect(()=>{if(!running)return;const timer=window.setInterval(()=>setSimulation(current=>current?stepSimulation(current):current),1000/simSpeed);return()=>window.clearInterval(timer)},[running,simSpeed])
  useEffect(()=>{if(simulation?.complete)setRunning(false)},[simulation?.complete])
  const clearSimulation=()=>{setRunning(false);setSimulation(null)}
  const changeScenario=(id:string)=>{setLabOpen(false);clearSimulation();setPlaceMode(false);setRouteMode(false);setAdjustment(null);setRouteError('');if(id==='sandbox'){setIsSandbox(true);setRadius(500);setRouteMessage('Sandbox mode · all planning tools are available.');return}const index=scenarios.findIndex(item=>item.id===id);if(index<0||index>unlockedScenarioIndex)return;setIsSandbox(false);setActiveScenarioId(id);setRadius(scenarios[index].initialConditions.walkingRadiusMeters);setRouteMessage(`Scenario ${index+1}: ${scenarios[index].title}`)}
  const toggleSimulation=()=>{if(running){setRunning(false);return}const next=!simulation||simulation.complete?createSimulation(simulationInput):simulation;setSimulation(next);setRunning(true)}
  const resetSimulation=()=>{setRunning(false);setSimulation(routes.length?createSimulation(simulationInput):null)}

  const startRoute=(route?:Route)=>{
    setPlaceMode(false);setAdjustment(null);setRouteMode(true);setRouteEditId(route?.id??null)
    setRouteDraft(route?[...route.stopIds]:[]);setRouteName(route?.name??`Route ${routeCounter}`)
    setRouteMessage('Choose stops in travel order.');setRouteError('')
  }
  useEffect(()=>{const onKeyDown=(event:KeyboardEvent)=>{const target=event.target as HTMLElement|null;if(target?.matches('input,textarea,select,button,[contenteditable="true"]'))return;if(event.key.toLowerCase()==='s'){event.preventDefault();setRouteMode(false);setPlaceMode(value=>!value);setAdjustment(null)}else if(event.key.toLowerCase()==='r'&&!routeMode){event.preventDefault();startRoute()}else if(event.key==='Escape'){setPlaceMode(false);setRouteMode(false);setAdjustment(null)}};window.addEventListener('keydown',onKeyDown);return()=>window.removeEventListener('keydown',onKeyDown)},[routeMode,routeCounter])
  const stopAtNode=(node:RoadNode)=>{
    if(placeMode){if(stops.includes(node.id)){setRouteMessage('A stop is already here.');return}clearSimulation();setStops(current=>[...current,node.id]);setSelectedStop(node.id);setRouteMessage('Stop placed.');return}
    if(routeMode){if(!stops.includes(node.id))return;setRouteDraft(current=>current.includes(node.id)?current.filter(id=>id!==node.id):[...current,node.id]);setRouteError('');return}
    if((isSandbox||scenarioIndex>=2)&&selected){for(let leg=0;leg<selected.legs.length;leg++){const index=selected.legs[leg].indexOf(node.id);if(index>0&&index<selected.legs[leg].length-1){setAdjustment({routeId:selected.id,leg,index});return}}}
  }
  const clickStopMarker=(id:string)=>{
    if(routeMode){setRouteDraft(current=>current.includes(id)?current.filter(stopId=>stopId!==id):[...current,id]);setRouteError('');setSelectedStop(id);return}
    setSelectedStop(id);setPlaceMode(false);setRouteMessage(`${stopName(id)} selected.`)
  }
  const removeStop=(id:string)=>{
    clearSimulation()
    const remaining=stops.filter(stopId=>stopId!==id)
    setStops(remaining);setSelectedStop(current=>current===id?(remaining[0]??''):current)
    setRouteDraft(draft=>draft.filter(stopId=>stopId!==id))
    setRoutes(current=>current.flatMap(route=>{const stopIds=route.stopIds.filter(stopId=>stopId!==id);const legs=routeLegsForStops(stopIds);return legs&&stopIds.length>=2?[{...route,stopIds,legs}]:[]}))
    const oldRoute=routes.find(route=>route.id===selectedRoute)
    if(oldRoute&&oldRoute.stopIds.filter(stopId=>stopId!==id).length<2)setSelectedRoute(null)
    setAdjustment(null);setRouteMessage('Stop removed. Routes were updated.');
  }
  const saveRoute=()=>{
    if(!draftLegs){setRouteError('Choose at least two different stops.');return}
    const route:Route={id:routeEditId??`route-${routeCounter}`,name:routeName.trim()||`Route ${routeCounter}`,stopIds:routeDraft,legs:draftLegs}
    const result=validateRoute(route,stops)
    if(!result.valid){setRouteError(result.errors[0]);return}
    clearSimulation();setRoutes(current=>routeEditId?current.map(item=>item.id===routeEditId?route:item):[...current,route]);if(!routeEditId){setRouteCounter(value=>value+1);setServiceSettings(current=>({...current,[route.id]:{fleetSize:activeScenario.initialConditions.fleetSize,headwayMinutes:activeScenario.initialConditions.headwayMinutes}}))}
    setSelectedRoute(route.id);setRouteMode(false);setRouteError('');setRouteMessage('Route saved.');setAdjustment(null)
  }
  const editJunction=(nextNodeId:string)=>{
    if(!adjustment)return
    const route=routes.find(item=>item.id===adjustment.routeId)
    if(!route)return
    const legs=[...route.legs],path=adjustRouteLeg(legs[adjustment.leg],adjustment.index,nextNodeId)
    if(!path){setRouteError('That road cannot reconnect to the next stop.');return}
    legs[adjustment.leg]=path
    const changed={...route,legs},result=validateRoute(changed,stops)
    if(!result.valid){setRouteError(result.errors[0]);return}
    clearSimulation();setRoutes(current=>current.map(item=>item.id===changed.id?changed:item));setRouteError('');setRouteMessage(`Route adjusted through ${nextNodeId.toUpperCase()}.`);setAdjustment(null)
  }
  const applyLesson=(lesson:MathLesson)=>{
    setLabOpen(false)
    if(['distance','coverage','calculus','optimization'].includes(lesson.id)){setRouteMode(false);setAdjustment(null);setPlaceMode(true)}
    else if(lesson.id==='graphs'){if(selected)startRoute(selected);else startRoute()}
    else{setRouteMode(false);setPlaceMode(false);setAdjustment(null)}
  }
  const visibleRoute=routeMode?draftRoute:selected
  const routesToDraw=routeMode?[...routes.filter(route=>route.id!==routeEditId),...(draftRoute?[draftRoute]:[])]:routes
  const adjustNeighbors=adjustment&&selected?.id===adjustment.routeId?neighbors(visibleRoute!.legs[adjustment.leg][adjustment.index]).filter(({nodeId})=>nodeId!==visibleRoute!.legs[adjustment.leg][adjustment.index-1]&&nodeId!==visibleRoute!.legs[adjustment.leg][adjustment.index+1]&&!visibleRoute!.legs[adjustment.leg].slice(0,adjustment.index).includes(nodeId)):[]

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark">⌁</div><div><strong>TRANSIT <span>ARCHITECT</span></strong><small>PORT MERIDIAN</small></div></div>
      <div className="scenario"><label className="eyebrow" htmlFor="scenario-select">{isSandbox?'FREE PLAY':'SCENARIO '+String(scenarioIndex+1).padStart(2,'0')}</label><select id="scenario-select" value={isSandbox?'sandbox':activeScenario.id} onChange={event=>changeScenario(event.target.value)}><option value="sandbox">Sandbox · Free play</option>{scenarios.map((item,index)=><option key={item.id} value={item.id} disabled={index>unlockedScenarioIndex}>{String(index+1).padStart(2,'0')} · {item.title}{index>unlockedScenarioIndex?' · locked':''}</option>)}</select></div>
      <div className="objective"><div className="objective-icon">✦</div><div><small>{isSandbox?'SANDBOX':'OBJECTIVE · '+scenarioEvaluation.passed+'/'+scenarioEvaluation.total}</small><b>{isSandbox?'Design a network, run service, and compare results.':activeScenario.summary}</b></div><span className="progress">{isSandbox?'∞':scenarioEvaluation.complete?'✓':'…'}</span></div>
      <div className="top-actions"><span className="day-pill"><i/> {simulation?`T+${simulation.minute}m`:'READY'}</span><button className="run-button" title={routes.length?'Run or pause the 60-minute transit simulation':'Create and save a route before running the simulation'} disabled={!routes.length} onClick={toggleSimulation}>{running?'Ⅱ PAUSE':simulation&&!simulation.complete?'▶ RESUME':'▶ RUN 60m'}</button><button className="reset-sim" title="Reset simulation to its initial state" aria-label="Reset simulation" disabled={!routes.length} onClick={resetSimulation}>↺</button><select aria-label="Simulation speed" title="Simulation playback speed" value={simSpeed} onChange={event=>setSimSpeed(Number(event.target.value))}><option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option></select></div>
    </header>
    <div className="workspace">
      <aside className="left-panel">
        <div className="panel-heading"><div><span className="eyebrow">NETWORK</span><h2>Build your service</h2></div></div>
        <section className="tool-group"><div className="section-label">TOOLS</div>
          <button className={`tool-card ${placeMode?'active':''}`} onClick={()=>{setRouteMode(false);setAdjustment(null);setPlaceMode(value=>!value)}}><span className="tool-icon mint">●</span><span className="tool-copy"><b>{placeMode?'Placing stops':'Place stops'}</b><small>Click a road junction</small></span><kbd>S</kbd></button>
          <button className={`tool-card ${routeMode?'active':''}`} aria-keyshortcuts="R" onClick={()=>routeMode?(setRouteMode(false),setRouteError('')):startRoute()}><span className="tool-icon blue">⌁</span><span className="tool-copy"><b>{routeMode?'Editing route':'Create route'}</b><small>Choose stops in order</small></span><kbd>R</kbd></button>
        </section>
        <section className="stop-section"><div className="section-title"><span>STOPS</span><span className="count-badge">{stops.length}</span></div>
          {stops.length===0?<div className="empty-card"><p>No stops yet</p></div>:<div className="stop-list">{stops.map((id,i)=>{const destinations=servedDestinations(id,radius);return <div className={`stop-row ${selectedStop===id?'selected':''}`} key={id}><button className="stop-select" onClick={()=>routeMode?setRouteDraft(current=>current.includes(id)?current.filter(stopId=>stopId!==id):[...current,id]):(setSelectedStop(id),setPlaceMode(false))}><span className="stop-dot">{i+1}</span><span className="stop-copy"><b>{stopName(id)}</b><small>{destinations.length?destinations.map(d=>d.name).join(', '):`Junction ${id.slice(1)} · no destinations in range`}</small>{routeMode&&routeDraft.includes(id)&&<em>Route stop {routeDraft.indexOf(id)+1}</em>}</span></button>{!routeMode&&<button className="remove-stop" onClick={()=>removeStop(id)} aria-label={`Remove ${stopName(id)}`}>×</button>}</div>})}</div>}
          <button className="add-stop" onClick={()=>{setRouteMode(false);setPlaceMode(true)}}>+ Add stop</button>
        </section>
        {(routeMode||routes.length>0)&&<section className="routes-section"><div className="section-title"><span>ROUTES</span><button className="add-route" onClick={()=>startRoute()}>+ New</button></div>
          {routeMode&&<div className="route-editor"><label>Route name<input value={routeName} onChange={event=>setRouteName(event.target.value)} aria-label="Route name"/></label><div className="draft-summary">{routeDraft.length<2?'Click stops in travel order':`${routeDraft.length} stops · ${draftLegs?draftLegs.flat().length-1:0} road links`}</div>{routeError&&<div className="route-error">{routeError}</div>}<div className="route-editor-actions"><button onClick={()=>{setRouteMode(false);setRouteError('')}}>Cancel</button><button className="save-route" onClick={saveRoute}>{routeEditId?'Save changes':'Save route'}</button></div></div>}
          {routes.map((route,index)=>{const check=validateRoute(route,stops);return <div className={`route-row ${selectedRoute===route.id?'selected':''}`} key={route.id}><button className="route-select" title={`Show ${route.name} on the map`} onClick={()=>{setSelectedRoute(route.id);setRouteMode(false);setAdjustment(null)}}><i style={{background:routeColor(index)}}/><span><b>{route.name}</b><small>{route.stopIds.length} stops · {routeLength(route).toFixed(1)} km{check.valid?'': ' · Needs repair'}</small></span></button><button className="route-edit" aria-label={`Edit ${route.name}`} onClick={()=>startRoute(route)}>✎</button><button className="route-delete" aria-label={`Delete ${route.name}`} onClick={()=>{clearSimulation();setRoutes(current=>current.filter(item=>item.id!==route.id));setServiceSettings(current=>{const next={...current};delete next[route.id];return next});if(selectedRoute===route.id)setSelectedRoute(null);setAdjustment(null)}}>×</button></div>})}
        </section>}
        {adjustment&&selected&&<section className="junction-editor"><div className="section-title"><span>JUNCTION EDITOR</span><button onClick={()=>setAdjustment(null)}>×</button></div><b>Reroute through a connected road</b><small>Current: {visibleRoute!.legs[adjustment.leg][adjustment.index].toUpperCase()}</small>{adjustNeighbors.length?adjustNeighbors.map(({nodeId,edge})=><button className="junction-choice" key={nodeId} onClick={()=>editJunction(nodeId)}>Use {nodeId.toUpperCase()} <span>{edge.lengthKm.toFixed(1)} km road ↗</span></button>):<p className="route-error">No alternate connected road here.</p>}</section>}
        {routeMessage&&!routeMode&&!adjustment&&<p className="feedback">{routeMessage}</p>}
      </aside>
      <section className="map-column">
        <div className="map-toolbar"><div className="map-title"><span className="live-dot"/><b>PORT MERIDIAN</b><span className="map-sep">/</span><span>{routeMode?'ROUTE EDITOR':placeMode?'PLACE STOPS':'CITY MAP'}</span></div><div className="map-actions"><button className="square-btn" aria-label="Zoom in" title="Zoom in" onClick={()=>setZoom(value=>Math.min(1.4,Number((value+.1).toFixed(1))))}>+</button><span className="zoom-readout">{Math.round(zoom*100)}%</span><button className="square-btn" aria-label="Zoom out" title="Zoom out" onClick={()=>setZoom(value=>Math.max(.8,Number((value-.1).toFixed(1))))}>−</button><button className="square-btn" onClick={()=>setZoom(1)} title="Reset zoom" aria-label="Reset zoom">⌖</button></div></div>
        <div className={`map-canvas ${placeMode?'placing':''}`} onWheel={event=>{event.preventDefault();const change=event.deltaY<0?.1:-.1;setZoom(value=>Math.max(.8,Math.min(1.4,Number((value+change).toFixed(1)))))}}>
          <svg className="city-map" style={{transform:`scale(${zoom})`}} viewBox="0 0 1040 680" preserveAspectRatio="xMidYMid meet" aria-label="Port Meridian road map">
            <defs><pattern id="water" width="22" height="22" patternUnits="userSpaceOnUse"><path d="M0 11 Q5 7 11 11 T22 11" fill="none" stroke="#6daeb7" strokeWidth=".7" opacity=".35"/></pattern></defs>
            <rect width="1040" height="680" fill="#e7efe8"/><path d="M0 0H30 Q20 120 40 210 Q12 300 31 405 Q12 530 36 680H0Z" fill="url(#water)"/><path d="M0 0H30 Q20 120 40 210 Q12 300 31 405 Q12 530 36 680" fill="none" stroke="#9acbd0" strokeWidth="3"/><path d="M0 615 Q170 560 320 595 T620 590 T1040 590V680H0Z" fill="url(#water)"/><path d="M0 615 Q170 560 320 595 T620 590 T1040 590" fill="none" stroke="#9acbd0" strokeWidth="3"/>
            {city.districts.map(d=><g key={d.id}><path d={d.draw} className={`district-fill ${d.type} ${selectedStop&&coverage.districts.includes(d.id)?'covered':''}`}/><text x={d.label[0]} y={d.label[1]} className="district-label">{d.name.toUpperCase()}</text></g>)}
            <path className="park" d="M292 104h35v23h-35z M340 103h28v20h-28z M300 142h24v32h-24z M367 140h32v27h-32z M298 205h34v22h-34z M365 206h25v35h-25z M605 100h44v26h-44z M672 101h30v20h-30z M610 145h25v25h-25z M748 143h38v30h-38z M600 202h33v29h-33z M674 200h29v34h-29z M850 105h30v25h-30z M930 109h48v20h-48z M852 202h34v31h-34z M915 202h40v28h-40z M300 316h40v22h-40z M365 314h26v32h-26z M435 314h36v22h-36z M600 316h35v30h-35z M675 316h42v22h-42z M750 316h30v33h-30z M300 520h35v26h-35z M370 520h36v22h-36z M445 520h34v27h-34z M600 520h34v22h-34z M675 520h40v26h-40z M750 520h28v33h-28z"/>
            <path d={`M${city.depot.nodeId==='n41'?nodeById('n41').x:0} ${nodeById('n41').y} Q48 69 ${city.depot.x+15} ${city.depot.y+city.depot.height}`} className="depot-driveway"/>
            {city.edges.map(edge=>{const a=nodeById(edge.from),b=nodeById(edge.to),d=edge.path||`M${a.x} ${a.y} L${b.x} ${b.y}`;return <g key={edge.id}><path d={d} className={`road-casing ${edge.class}`}/><path d={d} className={`road-surface ${edge.class}`}/></g>})}
            <g className="depot-marker"><title>{city.depot.name} · fleet staging at {city.depot.nodeId.toUpperCase()}</title><rect x={city.depot.x} y={city.depot.y} width={city.depot.width} height={city.depot.height} rx="5" className="depot-yard"/><rect x={city.depot.x+7} y={city.depot.y+7} width="43" height="27" rx="3" className="depot-building"/><path d={`M${city.depot.x+7} ${city.depot.y+13}h43`} className="depot-roof"/><rect x={city.depot.x+12} y={city.depot.y+21} width="13" height="13" rx="1" className="depot-door"/><rect x={city.depot.x+30} y={city.depot.y+21} width="15" height="7" rx="2" className="depot-window"/><text x={city.depot.x+56} y={city.depot.y+17} className="depot-label">BUS</text><text x={city.depot.x+56} y={city.depot.y+27} className="depot-label">DEPOT</text><text x={city.depot.x+56} y={city.depot.y+36} className="depot-code">NORTHGATE</text></g>
            <circle cx="880" cy="430" r="15" className="roundabout-center"/>
            {(isSandbox||scenarioIndex>=1)&&stops.map(id=>{const n=nodeById(id);return <circle key={`catch-${id}`} cx={n.x} cy={n.y} r={mapUnitsForMeters(radius)} className={`catchment ${selectedStop===id?'selected':''}`}/>})}
            {routesToDraw.map(route=>{const foundIndex=routes.findIndex(item=>item.id===route.id),actualIndex=foundIndex>=0?foundIndex:routes.length,color=routeColor(actualIndex),isSelected=route.id===selectedRoute||routeMode;return <g key={route.id} className={`drawn-route ${isSelected?'active-route':''}`}>{route.legs.flatMap((leg,legIndex)=>leg.slice(1).map((to,index)=>{const from=leg[index],d=orientedRoadPath(from,to);return <g key={`${legIndex}-${from}-${to}`}><path d={d} className="route-casing"/><path d={d} className="route-edge" style={{stroke:color,strokeWidth:isSelected?6:4,opacity:isSelected?1:.78}}/></g>}))}</g>})}
            {city.nodes.map(n=><g className={`road-node ${placeMode?'can-place':''} ${routeNodeIds.has(n.id)?'route-node':''} ${adjustment&&visibleRoute?.legs[adjustment.leg][adjustment.index]===n.id?'junction-active':''}`} key={n.id} onClick={()=>stopAtNode(n)}><circle cx={n.x} cy={n.y} r={placeMode?10:routeNodeIds.has(n.id)?8:3.5} className="node-hit"/><circle cx={n.x} cy={n.y} r={n.kind==='hub'?5:2} className={`node-core ${n.kind||''}`}/></g>)}
            {city.destinations.map(d=><g className="destination" key={d.id}><circle cx={d.x} cy={d.y} r="13" className="destination-ring"/><circle cx={d.x} cy={d.y} r="9" className="destination-icon-bg"/><text x={d.x} y={d.y+3.5} textAnchor="middle" className="destination-icon">{d.kind==='Education'?'▤':d.kind==='Civic'?'⚑':d.kind==='Healthcare'?'✚':d.kind==='Leisure'?'◉':'↔'}</text><rect x={d.x+13} y={d.y-9} width={d.name.length*5+12} height="18" rx="5" className="dest-label-bg"/><text x={d.x+19} y={d.y+3} className="destination-label">{d.name}</text></g>)}
            {stops.map(id=>{const n=nodeById(id),routeOrder=routeMode?routeDraft.indexOf(id):-1;return <g key={`stop-${id}`} className="selectable-stop" role="button" tabIndex={0} aria-label={`Select ${stopName(id)}${routeOrder>=0?`, route stop ${routeOrder+1}`:''}`} onClick={event=>{event.stopPropagation();clickStopMarker(id)}} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();clickStopMarker(id)}}}><circle cx={n.x} cy={n.y} r="11" className={`stop-halo ${selectedStop===id?'selected':''}`}/><circle cx={n.x} cy={n.y} r="7" className="stop-marker"/>{routeMode&&routeOrder>=0&&<text x={n.x} y={n.y+3} textAnchor="middle" className="stop-number">{routeOrder+1}</text>}</g>})}
            {simulation?.buses.map(bus=>{const point=busMapPosition(bus,simulation.minute,simulation.input.speedKph);return <g key={bus.id} className="bus-marker" transform={`translate(${point.x} ${point.y})`}><title>{bus.id} · {bus.passengers.reduce((total,batch)=>total+batch.passengers,0)} riders</title><rect x="-7" y="-4" width="14" height="8" rx="3"/><circle cx="-3.5" cy="4" r="1.5"/><circle cx="3.5" cy="4" r="1.5"/></g>})}
          </svg>
          <div className="map-legend"><span><i className="legend-road"/>Roads</span>{(isSandbox||scenarioIndex>=1)&&<span><i className="legend-catchment"/>Walk range</span>}{routes.map((route,index)=><span key={route.id} title={route.name}><i className="legend-route" style={{background:routeColor(index)}}/>{route.name}</span>)}<span><i className="legend-dest"/>Destination</span></div>
          {(placeMode||routeMode)&&<div className="map-hint">{placeMode?'Choose a road junction':'Select stops in travel order'}<button onClick={()=>{setPlaceMode(false);setRouteMode(false)}}>Done</button></div>}
          <div className="map-compass"><span>N</span><b>↑</b></div><div className="map-scale"><i/><span>500 m</span></div>
        </div>
        <div className="map-bottom"><span><i className="map-status"/> {graph.nodeCount} junctions <b>·</b> {graph.edgeCount} road links <b>·</b> connected</span><span className="coordinates">PORT MERIDIAN</span></div>
      </section>
      <aside className="right-panel">
        <div className="panel-heading right-heading"><div><span className="eyebrow">SCENARIO {String(scenarioIndex+1).padStart(2,'0')}</span><h2>{activeScenario.title}</h2></div></div>
        {isSandbox?<section className="scenario-objectives sandbox-note"><b>Sandbox · Free play</b><p>All planning controls and lessons are open. Design a network, run the same 60-minute simulation, then revise routes or service and compare the results.</p><div className="sandbox-summary"><span>{stops.length} stops</span><span>{validRoutes.length} connected routes</span><span>{(coverage.population/city.population*100).toFixed(1)}% covered</span></div></section>:<section className="scenario-objectives"><p>{activeScenario.mathematics}</p><div className="objective-list">{scenarioEvaluation.objectives.map(objective=><div className={`scenario-objective ${objective.passed?'passed':''}`} key={objective.config.id}><div className="scenario-objective-head"><b>{objective.passed?'✓':'○'} {objective.config.label}</b><span>{formatObjectiveValue(objective.config.metric,objective.value)}</span></div><div className="objective-track"><i style={{width:`${Math.max(objective.passed?100:0,Math.min(100,objective.progress*100))}%`}}/></div><small>{objective.feedback}</small></div>)}</div><div className="unlock-note"><b>Available tools</b><span>{activeScenario.unlocks.join(' · ')}</span></div></section>}
        {(isSandbox||scenarioIndex>=1)&&<div className="metric-card"><div className="metric-head"><span>POPULATION IN WALK RANGE</span></div><div className="metric-value">{coverage.population.toLocaleString()} <small>people · {(coverage.population/city.population*100).toFixed(1)}%</small></div><div className="metric-foot">{coverage.districts.length} districts covered</div></div>}
        {(isSandbox||scenarioIndex>=1)&&<div className="metric-card"><div className="metric-head"><span>DESTINATIONS NEAR STOPS</span></div><div className="metric-value">{coverage.destinations.length} <small>of {city.destinations.length}</small></div>{coverage.destinations.map(destination=><div className="served-destination" key={destination.id}><span>•</span>{destination.name}</div>)}</div>}
        <div className="stop-inspector"><div className="section-title"><span>SELECTED STOP</span></div>{selectedStop? <><h3>{stopName(selectedStop)}</h3><p>Junction {selectedStop.slice(1).toUpperCase()}</p><div className="served-list"><b>Served destinations</b>{servedDestinations(selectedStop,radius).length?servedDestinations(selectedStop,radius).map(destination=><span key={destination.id}>• {destination.name}</span>):<small>None within this walking range</small>}</div><button className="inspect-remove" onClick={()=>removeStop(selectedStop)}>Remove stop</button></>:<small>Select a stop to inspect it.</small>}</div>
        {(isSandbox||scenarioIndex>=1)&&<div className="radius-card"><label htmlFor="walk-radius"><span>WALKING RANGE</span><b>{radius} m</b></label><input id="walk-radius" title="Maximum straight-line walk from each stop" type="range" min="200" max="800" step="50" value={radius} onChange={event=>{clearSimulation();setRadius(Number(event.target.value))}}/><div className="range-labels"><span>200 m</span><span>800 m</span></div></div>}
        {selected&&(isSandbox||scenarioIndex>=3)&&<section className="service-card"><div className="section-title"><span>SERVICE</span></div><label>Fleet <b>{serviceSettings[selected.id]?.fleetSize??activeScenario.initialConditions.fleetSize} buses</b><input aria-label="Fleet size" type="range" min="1" max="8" step="1" value={serviceSettings[selected.id]?.fleetSize??activeScenario.initialConditions.fleetSize} onChange={event=>{clearSimulation();setServiceSettings(current=>({...current,[selected.id]:{...current[selected.id],fleetSize:Number(event.target.value),headwayMinutes:current[selected.id]?.headwayMinutes??activeScenario.initialConditions.headwayMinutes}}))}}/></label><label>Headway <b>{serviceSettings[selected.id]?.headwayMinutes??activeScenario.initialConditions.headwayMinutes} min</b><input aria-label="Requested headway" type="range" min="5" max="30" step="1" value={serviceSettings[selected.id]?.headwayMinutes??activeScenario.initialConditions.headwayMinutes} onChange={event=>{clearSimulation();setServiceSettings(current=>({...current,[selected.id]:{fleetSize:current[selected.id]?.fleetSize??activeScenario.initialConditions.fleetSize,headwayMinutes:Number(event.target.value)}}))}}/></label><small className="effective-interval">Effective spacing ≈ {realizedHeadway} min</small>{(isSandbox||scenarioIndex>=4)&&<label className="fare-control">Fare <b>${fare.toFixed(2)}</b><input aria-label="Fare per trip" type="range" min="0" max="8" step="0.25" value={fare} onChange={event=>{clearSimulation();setFare(Number(event.target.value))}}/></label>}</section>}
        {summary?<section className="results-card"><div className="section-title"><span>SIMULATION · {summary.minute}/{simulation?.durationMinutes} MIN</span></div><div className="results-grid"><div><small>SERVED</small><b>{summary.served}</b></div><div><small>WAITING / UNSERVED</small><b>{(simulation?.complete?summary.unserved:summary.waiting+summary.unserved)}</b></div><div><small>AVG WAIT</small><b>{summary.averageWait.toFixed(1)}m</b></div><div><small>JOURNEY</small><b>{summary.averageJourney.toFixed(1)}m</b></div>{(isSandbox||scenarioIndex>=2)&&<div><small>TRANSFERS</small><b>{summary.transfers}</b></div>}{(isSandbox||scenarioIndex>=3)&&<><div><small>OCCUPANCY</small><b>{(summary.occupancy*100).toFixed(0)}%</b></div><div><small>UTILIZATION</small><b>{(summary.capacityUtilization*100).toFixed(0)}%</b></div></>}{(isSandbox||scenarioIndex>=4)&&<><div><small>OPERATING</small><b>${summary.operatingCost.toFixed(0)}</b></div><div><small>FARES</small><b>${summary.fareRevenue.toFixed(0)}</b></div><div><small>BALANCE</small><b>${summary.balance.toFixed(0)}</b></div></>}</div><details className="simulation-assumptions"><summary>Model assumptions</summary><p>One OD group per district and destination. Walking is straight-line at 80 m/min; buses average 30 km/h and hold 40 riders. Costs are $0.72 per bus-minute plus $1.80/km. No road congestion is modeled.</p></details></section>:<section className="results-card empty-results"><div className="section-title"><span>NETWORK RESULTS</span></div><p>{routes.length?'Run the network to see riders, waits, and service results.':'Save a connected route, then run a 60-minute simulation to see results.'}</p></section>}
        <div className="math-card"><button className="math-card-head" title="Open the interactive Mathematics Lab" onClick={()=>setLabOpen(true)}><span className="math-symbol">∑</span><span><small>MATH LAB · {scenarioLessonIds.length} LESSONS</small><b>{isSandbox?'Explore the mathematics':activeScenario.mathematics.split(',')[0]}</b></span><span className="chevron">↗</span></button></div>
        {routeError&&<div className="route-error panel-error">{routeError}</div>}{selected&&<div className={`route-validity ${validation?.valid?'valid':'invalid'}`}>{validation?.valid?'Route connected':validation?.errors[0]}</div>}
      </aside>
    </div>
    {labOpen&&<MathematicsLab context={mathContext} lessonIds={scenarioLessonIds} initialLessonId={activeScenario.lessonId} onClose={()=>setLabOpen(false)} onApply={applyLesson}/>}
  </main>
}
export default App

