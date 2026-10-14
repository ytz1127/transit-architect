export type District = {
  id: string; name: string; type: 'residential' | 'commercial' | 'civic'
  population: number; draw: string; label: [number, number]
}
export type RoadNode = { id: string; x: number; y: number; kind?: 'hub' | 'destination' }
export type RoadEdge = {
  id: string; from: string; to: string; lengthKm: number
  class: 'arterial' | 'collector' | 'local'; path?: string
}
export type Destination = { id: string; name: string; kind: string; nodeId: string; attraction: number; x: number; y: number }
export type Depot = { id:string;name:string;nodeId:string;x:number;y:number;width:number;height:number }

const nodes: RoadNode[] = [
  { id:'n1',x:85,y:120 },{ id:'n2',x:205,y:120 },{ id:'n3',x:330,y:120 },{ id:'n4',x:455,y:120 },{ id:'n5',x:585,y:120 },{ id:'n6',x:710,y:120 },{ id:'n7',x:835,y:120 },{ id:'n8',x:955,y:120 },
  { id:'n9',x:85,y:245 },{ id:'n10',x:205,y:245 },{ id:'n11',x:330,y:245 },{ id:'n12',x:455,y:245,kind:'hub' },{ id:'n13',x:585,y:245 },{ id:'n14',x:710,y:245 },{ id:'n15',x:835,y:245 },{ id:'n16',x:955,y:245 },
  { id:'n17',x:85,y:370 },{ id:'n18',x:205,y:370 },{ id:'n19',x:330,y:370 },{ id:'n20',x:455,y:370 },{ id:'n21',x:585,y:370 },{ id:'n22',x:710,y:370 },{ id:'n23',x:835,y:370 },{ id:'n24',x:955,y:370 },
  { id:'n25',x:85,y:495 },{ id:'n26',x:205,y:495 },{ id:'n27',x:330,y:495 },{ id:'n28',x:455,y:495 },{ id:'n29',x:585,y:495 },{ id:'n30',x:710,y:495 },{ id:'n31',x:835,y:495 },{ id:'n32',x:955,y:495 },
  { id:'n33',x:85,y:610 },{ id:'n34',x:205,y:610 },{ id:'n35',x:330,y:610 },{ id:'n36',x:455,y:610 },{ id:'n37',x:585,y:610 },{ id:'n38',x:710,y:610 },{ id:'n39',x:835,y:610 },{ id:'n40',x:955,y:610 },
  { id:'n41',x:35,y:72 },{ id:'n42',x:145,y:62 },{ id:'n43',x:385,y:75 },{ id:'n44',x:650,y:75 },{ id:'n45',x:900,y:65 },
  { id:'n46',x:30,y:315 },{ id:'n47',x:175,y:315 },{ id:'n48',x:530,y:310 },{ id:'n49',x:780,y:315 },{ id:'n50',x:1005,y:300 },
  { id:'n51',x:130,y:565 },{ id:'n52',x:285,y:565 },{ id:'n53',x:520,y:555 },{ id:'n54',x:760,y:565 },{ id:'n55',x:920,y:560 },
  { id:'n56',x:535,y:180,kind:'destination' },{ id:'n57',x:900,y:180,kind:'destination' },{ id:'n58',x:285,y:430,kind:'destination' },{ id:'n59',x:745,y:430,kind:'destination' },
  {id:'n60',x:880,y:390},{id:'n61',x:908,y:402},{id:'n62',x:920,y:430},{id:'n63',x:908,y:458},
  {id:'n64',x:880,y:470},{id:'n65',x:852,y:458},{id:'n66',x:840,y:430},{id:'n67',x:852,y:402},
]
const edges: RoadEdge[] = []
const add = (a: string, b: string, cls: RoadEdge['class']='local', length=0.8, path?: string) => edges.push({ id:`${a}-${b}`,from:a,to:b,class:cls,lengthKm:length,path })
// The four main east-west avenues and five north-south streets create the legible city grid.
for (let row=0; row<5; row++) for(let col=0; col<7; col++) add(`n${row*8+col+1}`,`n${row*8+col+2}`,row===1||row===3?'arterial':'collector',row===1||row===3?1.05:0.72)
for (let row=0; row<4; row++) for(let col=0; col<8; col++) add(`n${row*8+col+1}`,`n${(row+1)*8+col+1}`,col===3||col===6?'arterial':'collector',col===3||col===6?1.0:0.76)
// Curving waterfront approach, hill roads, and short neighborhood connectors.
add('n41','n1','collector',0.55,'M35 72 Q58 77 85 120'); add('n41','n42','local',0.68,'M35 72 Q85 35 145 62'); add('n42','n2','collector',0.62,'M145 62 Q170 92 205 120')
add('n43','n3','local',0.64,'M385 75 Q350 90 330 120'); add('n43','n4','collector',0.66,'M385 75 Q425 83 455 120'); add('n44','n5','collector',0.62,'M650 75 Q610 88 585 120'); add('n44','n6','local',0.66,'M650 75 Q685 85 710 120'); add('n45','n7','collector',0.75,'M900 65 Q865 92 835 120'); add('n45','n8','local',0.7,'M900 65 Q930 80 955 120')
add('n46','n17','local',0.62,'M30 315 Q58 342 85 370'); add('n46','n47','local',0.82,'M30 315 Q100 290 175 315'); add('n47','n18','collector',0.68,'M175 315 Q190 340 205 370'); add('n48','n20','local',0.66,'M530 310 Q485 335 455 370'); add('n48','n21','collector',0.66,'M530 310 Q555 342 585 370'); add('n49','n23','collector',0.62,'M780 315 Q805 338 835 370'); add('n49','n22','local',0.67,'M780 315 Q747 345 710 370'); add('n50','n24','local',0.64,'M1005 300 Q982 340 955 370')
add('n51','n34','collector',0.65,'M130 565 Q170 580 205 610'); add('n51','n33','local',0.6,'M130 565 Q102 590 85 610'); add('n51','n52','local',0.75,'M130 565 Q205 540 285 565'); add('n52','n35','collector',0.65,'M285 565 Q310 590 330 610'); add('n53','n36','collector',0.67,'M520 555 Q480 580 455 610'); add('n53','n37','local',0.68,'M520 555 Q555 580 585 610'); add('n54','n38','collector',0.7,'M760 565 Q732 590 710 610'); add('n54','n39','local',0.7,'M760 565 Q800 590 835 610'); add('n55','n40','collector',0.68,'M920 560 Q940 590 955 610'); add('n55','n39','local',0.68,'M920 560 Q875 540 835 560')
// Bayview Circle is an eight-junction neighborhood ring joined to four approach roads.
add('n60','n61','collector',0.38,'M880 390 Q900 386 908 402'); add('n61','n62','collector',0.38,'M908 402 Q927 410 920 430'); add('n62','n63','collector',0.38,'M920 430 Q927 450 908 458'); add('n63','n64','collector',0.38,'M908 458 Q900 474 880 470'); add('n64','n65','collector',0.38,'M880 470 Q860 474 852 458'); add('n65','n66','collector',0.38,'M852 458 Q833 450 840 430'); add('n66','n67','collector',0.38,'M840 430 Q833 410 852 402'); add('n67','n60','collector',0.38,'M852 402 Q860 386 880 390')
add('n67','n23','collector',0.48,'M852 402 Q840 390 835 370'); add('n62','n24','collector',0.62,'M920 430 Q950 410 955 370'); add('n64','n31','collector',0.55,'M880 470 Q860 490 835 495'); add('n63','n32','collector',0.65,'M908 458 Q940 475 955 495')
// Destination spurs branch from the network at clear intersections.
add('n13','n56','local',0.48,'M585 245 Q555 215 535 180'); add('n8','n57','local',0.58,'M955 120 Q930 145 900 180'); add('n19','n58','local',0.5,'M330 370 Q310 402 285 430'); add('n23','n59','local',0.52,'M835 370 Q790 400 745 430')

export const city = {
  id: 'port-meridian', name: 'Port Meridian', tagline: 'A city in motion', population: 78400,
  depot: {id:'northgate-depot',name:'Northgate Bus Depot',nodeId:'n41',x:48,y:20,width:72,height:40} as Depot,
  districts: [
    {id:'harbor',name:'Old Harbor',type:'residential',population:12400,draw:'M24 95 Q150 65 260 100 L270 275 Q160 290 25 260 Z',label:[145,175]},
    {id:'market',name:'Market Quarter',type:'commercial',population:8200,draw:'M275 82 Q445 62 545 100 L560 270 Q430 295 275 272 Z',label:[414,169]},
    {id:'northline',name:'Northline',type:'residential',population:11600,draw:'M565 82 Q720 65 820 97 L825 275 Q695 291 565 270 Z',label:[694,165]},
    {id:'civic',name:'Civic Center',type:'civic',population:4200,draw:'M830 82 Q945 68 1017 98 L1017 280 Q935 292 830 272 Z',label:[925,155]},
    {id:'foundry',name:'Foundry Row',type:'commercial',population:7800,draw:'M22 300 Q190 286 265 300 L275 470 Q160 490 22 465 Z',label:[145,420]},
    {id:'midtown',name:'Midtown',type:'commercial',population:10200,draw:'M280 300 Q460 282 560 300 L565 475 Q420 494 280 470 Z',label:[420,445]},
    {id:'garden',name:'Garden District',type:'residential',population:9800,draw:'M570 300 Q720 282 815 300 L825 475 Q695 493 570 470 Z',label:[687,449]},
    {id:'eastbank',name:'Eastbank',type:'residential',population:4200,draw:'M830 300 Q945 284 1017 300 L1017 475 Q935 493 830 470 Z',label:[920,435]},
    {id:'southbank',name:'Southbank',type:'residential',population:10000,draw:'M22 500 Q190 480 265 498 L275 655 L22 655 Z',label:[150,630]},
    {id:'campus',name:'University Green',type:'civic',population:0,draw:'M280 500 Q420 480 560 500 L565 655 L280 655 Z',label:[420,630]},
    {id:'bayview',name:'Bayview',type:'residential',population:0,draw:'M570 500 Q720 480 815 500 L825 655 L570 655 Z',label:[690,630]},
    {id:'terminal',name:'South Terminal',type:'commercial',population:0,draw:'M830 500 Q945 480 1017 500 L1017 655 L830 655 Z',label:[925,630]},
  ] as District[],
  nodes, edges,
  destinations: [
    {id:'central-station',name:'Central Station',kind:'Transit hub',nodeId:'n12',attraction:95,x:455,y:245},
    {id:'meridian-hospital',name:'Meridian Hospital',kind:'Healthcare',nodeId:'n56',attraction:86,x:535,y:180},
    {id:'civic-hall',name:'Civic Hall',kind:'Civic',nodeId:'n57',attraction:74,x:900,y:180},
    {id:'university',name:'Meridian University',kind:'Education',nodeId:'n58',attraction:92,x:285,y:430},
    {id:'stadium',name:'Bayview Stadium',kind:'Leisure',nodeId:'n59',attraction:78,x:745,y:430},
  ] as Destination[],
}

export function validateRoadGraph(map: typeof city) {
  const nodeIds = new Set(map.nodes.map(n=>n.id))
  const errors: string[] = []
  for (const edge of map.edges) if (!nodeIds.has(edge.from)||!nodeIds.has(edge.to)) errors.push(`Edge ${edge.id} references a missing node`)
  const seen = new Set<string>()
  const queue = [map.nodes[0]?.id].filter((id): id is string=>Boolean(id))
  while(queue.length) { const id=queue.shift()!; if(seen.has(id)) continue; seen.add(id); for(const e of map.edges) if(e.from===id&&!seen.has(e.to)) queue.push(e.to); else if(e.to===id&&!seen.has(e.from)) queue.push(e.from) }
  if(seen.size!==map.nodes.length) errors.push(`Road graph is disconnected: reached ${seen.size} of ${map.nodes.length} nodes`)
  for(const d of map.destinations) if(!nodeIds.has(d.nodeId)) errors.push(`Destination ${d.name} references a missing node`)
  if(!nodeIds.has(map.depot.nodeId)) errors.push(`Depot ${map.depot.name} references a missing node`)
  return {valid: errors.length===0, errors, nodeCount:map.nodes.length, edgeCount:map.edges.length}
}
