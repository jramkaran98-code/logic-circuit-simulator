// Full simulator script
// Features:
// - drag & drop palette -> gate-layer (SVG <g> elements)
// - snap-to-grid (toggle)
// - curved Bézier wires (SVG <path> elements)
// - multi-input gates (2 inputs for binary gates; 1 for NOT/OUTPUT; 0 for INPUT)
// - click out pin -> click in pin to create connection
// - iterative evaluation until stable; show each gate's output
// - save/load localStorage, undo/redo, select/delete, right-click wire delete

/* -------------------------
   DOM references & state
   ------------------------- */
const gridLayer = document.getElementById('grid-layer');   // svg
const wireLayer = document.getElementById('wire-layer');   // svg
const gateLayer = document.getElementById('gate-layer');   // svg (we'll append <g> gates here)

const btnRun = document.getElementById('btn-run');
const btnSave = document.getElementById('btn-save');
const btnLoad = document.getElementById('btn-load');
const btnUndo = document.getElementById('btn-undo');
const btnRedo = document.getElementById('btn-redo');
const snapToggle = document.getElementById('snap-toggle');
const liveToggle = document.getElementById('live-toggle');
const gridSizeInput = document.getElementById('grid-size');
const ttBody = document.getElementById('tt-body');

let nodes = {};    // id -> {id,type,x,y,el}
let wires = [];    // {id, fromId, toId, toIndex, path}
let nodeIdCounter = 1;
let wireIdCounter = 1;

let wireStart = null;      // {nodeId} when clicking output pin
let selection = null;      // {type:'node'|'wire', id}
let undoStack = [];        // actions
let redoStack = [];

/* -------------------------
   Utility functions
   ------------------------- */
function uid(prefix){ return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

function getCanvasRect(){
  return gateLayer.getBoundingClientRect();
}

function snap(v){
  if(!snapToggle.checked) return v;
  const g = Math.max(4, parseInt(gridSizeInput.value || 16, 10));
  return Math.round(v / g) * g;
}

/* -------------------------
   Draw grid
   ------------------------- */
function drawGrid(){
  const svg = gridLayer;
  svg.innerHTML = '';
  const rect = gateLayer.getBoundingClientRect();
  const w = svg.clientWidth || rect.width || window.innerWidth;
  const h = svg.clientHeight || rect.height || window.innerHeight;
  const g = Math.max(4, parseInt(gridSizeInput.value || 16, 10));
  for(let x=0;x<w;x+=g){
    const line = document.createElementNS('http://www.w3.org/2000/svg','line');
    line.setAttribute('x1', x); line.setAttribute('y1', 0); line.setAttribute('x2', x); line.setAttribute('y2', h);
    line.setAttribute('stroke', '#eef3ff'); line.setAttribute('stroke-width', '1');
    svg.appendChild(line);
  }
  for(let y=0;y<h;y+=g){
    const line = document.createElementNS('http://www.w3.org/2000/svg','line');
    line.setAttribute('x1', 0); line.setAttribute('y1', y); line.setAttribute('x2', w); line.setAttribute('y2', y);
    line.setAttribute('stroke', '#eef3ff'); line.setAttribute('stroke-width', '1');
    svg.appendChild(line);
  }
}
window.addEventListener('resize', ()=>{ drawGrid(); refreshAllWires(); });
drawGrid();

/* -------------------------
   Gate definitions & logic
   ------------------------- */
const gateInputCounts = {
  INPUT: 0,
  OUTPUT: 1,
  AND: 2, NAND: 2, OR: 2, NOR: 2, XOR: 2, XNOR: 2,
  NOT: 1
};

function evaluateGate(type, inputs){
  const a = inputs[0] || 0;
  const b = inputs[1] || 0;
  switch(type){
    case 'INPUT': return inputs.__selfValue !== undefined ? inputs.__selfValue : 0;
    case 'AND': return (a & b) ? 1 : 0;
    case 'NAND': return (a & b) ? 0 : 1;
    case 'OR': return (a | b) ? 1 : 0;
    case 'NOR': return (a | b) ? 0 : 1;
    case 'XOR': return ((a ^ b) ? 1 : 0);
    case 'XNOR': return ((a ^ b) ? 0 : 1);
    case 'NOT': return (a === 1) ? 0 : 1;
    case 'OUTPUT': return a;
    default: return 0;
  }
}

/* -------------------------
   Create a gate <g> and state
   ------------------------- */
function createNode(type, x, y, id=null, savedValue=null){
  const nodeId = id || uid('n');
  const g = document.createElementNS('http://www.w3.org/2000/svg','g');
  g.classList.add('gate');
  g.setAttribute('transform', `translate(${x}, ${y})`);
  g.dataset.id = nodeId;
  g.dataset.type = type;

  // rectangle body
  const rect = document.createElementNS('http://www.w3.org/2000/svg','rect');
  rect.setAttribute('x', 0); rect.setAttribute('y', 0); rect.setAttribute('width', 110); rect.setAttribute('height', 48);
  g.appendChild(rect);

  // title
  const title = document.createElementNS('http://www.w3.org/2000/svg','text');
  title.classList.add('title');
  title.setAttribute('x', 55); title.setAttribute('y', 18);
  title.textContent = type;
  g.appendChild(title);

  // output value text
  const outText = document.createElementNS('http://www.w3.org/2000/svg','text');
  outText.classList.add('outval');
  outText.setAttribute('x', 55); outText.setAttribute('y', 38);
  outText.textContent = '-';
  g.appendChild(outText);

  // input pins
  const inputCount = gateInputCounts[type] ?? 2;
  for(let i=0;i<inputCount;i++){
    // position input pins vertically centered
    const gap = 48 / (inputCount + 1);
    const cy = gap * (i+1);
    const pin = document.createElementNS('http://www.w3.org/2000/svg','circle');
    pin.classList.add('pin','in');
    pin.classList.add('pin-in');
    pin.classList.add('pin-idx-' + i);
    pin.setAttribute('cx', 0); pin.setAttribute('cy', cy); pin.setAttribute('r', 6);
    pin.setAttribute('fill', '#1e88e5');
    pin.dataset.node = nodeId;
    pin.dataset.index = i;
    // click to finish wiring
    pin.addEventListener('click', (ev)=>{
      ev.stopPropagation();
      finishWire(nodeId, i);
    });
    g.appendChild(pin);
  }

  // output pin (if not OUTPUT)
  if(type !== 'OUTPUT'){
    const pin = document.createElementNS('http://www.w3.org/2000/svg','circle');
    pin.classList.add('pin','out');
    pin.setAttribute('cx', 110); pin.setAttribute('cy', 24); pin.setAttribute('r', 6);
    pin.setAttribute('fill', '#2e7d32');
    pin.dataset.node = nodeId;
    pin.addEventListener('click', (ev)=>{
      ev.stopPropagation();
      startWire(nodeId);
    });
    g.appendChild(pin);
  } else {
    // output gates have no out pin, only input(s)
  }

  // double-click to toggle INPUT gates
  if(type === 'INPUT'){
    // store value as data attribute
    g.dataset.value = (savedValue !== undefined && savedValue !== null) ? String(savedValue) : '0';
    outText.textContent = g.dataset.value;
    g.addEventListener('dblclick', (ev)=>{
      ev.stopPropagation();
      g.dataset.value = g.dataset.value === '1' ? '0' : '1';
      outText.textContent = g.dataset.value;
      pushAction({type:'toggle', nodeId});
      if(liveToggle.checked) evaluateAll();
    });
  }

  // selection and dragging
  g.addEventListener('mousedown', nodeMouseDown);
  g.addEventListener('click', (ev)=>{ ev.stopPropagation(); select({type:'node', id: nodeId}); });

  gateLayer.appendChild(g);
  nodes[nodeId] = { id: nodeId, type, x, y, el: g };

  pushAction({ type:'addNode', node: serializeNode(nodes[nodeId]) });
  return nodeId;
}

/* -------------------------
   Drag & drop from palette
   ------------------------- */
document.querySelectorAll('.palette-item').forEach(item=>{
  item.addEventListener('dragstart', (ev)=>{
    ev.dataTransfer.setData('text/gate-type', item.dataset.type);
  });
});

const canvasWrap = document.getElementById('canvas-wrap');

canvasWrap.addEventListener('dragover', ev => ev.preventDefault());
canvasWrap.addEventListener('drop', ev=>{
  ev.preventDefault();
  const type = ev.dataTransfer.getData('text/gate-type');
  if(!type) return;
  const rect = getCanvasRect();
  let x = ev.clientX - rect.left;
  let y = ev.clientY - rect.top;
  x = snap(x); y = snap(y);
  createNode(type, x, y);
  refreshAllWires();
});

/* -------------------------
   Drag to move node
   ------------------------- */
let dragState = null;
function nodeMouseDown(ev){
  if(ev.target.classList.contains('pin')) return; // don't drag when clicking pins
  ev.preventDefault();
  const g = ev.currentTarget;
  const nodeId = g.dataset.id;
  const rect = getCanvasRect();
  const startX = ev.clientX;
  const startY = ev.clientY;
  const origTransform = g.getAttribute('transform');
  const match = origTransform.match(/translate\(([-\d.]+)[ ,]+([-\d.]+)\)/);
  const origX = match ? parseFloat(match[1]) : 0;
  const origY = match ? parseFloat(match[2]) : 0;

  function onMove(e){
    let nx = origX + (e.clientX - startX);
    let ny = origY + (e.clientY - startY);
    nx = snap(nx); ny = snap(ny);
    g.setAttribute('transform', `translate(${nx}, ${ny})`);
    nodes[nodeId].x = nx; nodes[nodeId].y = ny;
    refreshAllWires();
  }
  function onUp(e){
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    // push move action
    pushAction({ type:'moveNode', nodeId, from:{x:origX,y:origY}, to:{x:nodes[nodeId].x,y:nodes[nodeId].y} });
  }
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

/* -------------------------
   Wiring: startWire & finishWire
   ------------------------- */
function startWire(nodeId){
  // start from an output pin of nodeId
  wireStart = { nodeId };
  // visually highlight start pin
  // (we rely on click highlight; minimal UI)
}

function finishWire(toNodeId, inputIndex){
  if(!wireStart) { showTemp('Click an output pin first'); return; }
  const fromNodeId = wireStart.nodeId;
  if(fromNodeId === toNodeId){ showTemp('Cannot wire to same node'); wireStart = null; return; }

  // prevent duplicate connection to same input index
  const existing = wires.find(w => w.toId === toNodeId && w.toIndex === inputIndex && w.fromId === fromNodeId);
  if(existing){ wireStart = null; return; }

  const wid = uid('w');
  const path = document.createElementNS('http://www.w3.org/2000/svg','path');
  path.classList.add('wire'); path.dataset.id = wid;
  wireLayer.appendChild(path);

  // right-click to delete
  path.addEventListener('contextmenu', (ev)=>{ ev.preventDefault(); deleteWire(wid); });

  // click to select
  path.addEventListener('click', (ev)=>{ ev.stopPropagation(); select({type:'wire', id: wid}); });

  const w = { id: wid, fromId: fromNodeId, toId: toNodeId, toIndex: inputIndex, path };
  wires.push(w);

  // push action
  pushAction({ type:'addWire', wire: serializeWire(w) });

  wireStart = null;
  refreshWire(w);
  if(liveToggle.checked) evaluateAll();
}

/* compute connector absolute positions */
function connectorPos(nodeId, kind, index=0){
  const n = nodes[nodeId];
  if(!n) return null;
  const g = n.el;
  // parse translate
  const tr = g.getAttribute('transform').match(/translate\(([-\d.]+)[ ,]+([-\d.]+)\)/);
  const gx = tr ? parseFloat(tr[1]) : 0;
  const gy = tr ? parseFloat(tr[2]) : 0;
  if(kind === 'out'){
    // out pin at (110,24) inside rect
    return { x: gx + 110, y: gy + 24 };
  } else {
    // input pins depending on count and index
    const count = gateInputCounts[n.type] ?? 2;
    const gap = 48 / (count + 1);
    const cy = gap * (index + 1);
    return { x: gx + 0, y: gy + cy };
  }
}

/* compute smooth cubic path */
function curvePath(x1,y1,x2,y2){
  const dx = Math.abs(x2 - x1);
  const off = Math.min(80, Math.max(20, dx / 2));
  const cx1 = x1 + off, cy1 = y1;
  const cx2 = x2 - off, cy2 = y2;
  return `M ${x1} ${y1} C ${cx1} ${cy1} ${cx2} ${cy2} ${x2} ${y2}`;
}

/* refresh a single wire */
function refreshWire(w){
  const p1 = connectorPos(w.fromId, 'out');
  const p2 = connectorPos(w.toId, 'in', w.toIndex);
  if(!p1 || !p2) return;
  w.path.setAttribute('d', curvePath(p1.x, p1.y, p2.x, p2.y));
}

/* refresh all wires */
function refreshAllWires(){ wires.forEach(w => refreshWire(w)); }

/* -------------------------
   Selection + delete
   ------------------------- */
function clearSelection(){
  // clear visual
  document.querySelectorAll('g.gate.selected').forEach(g=>g.classList.remove('selected'));
  document.querySelectorAll('path.wire.selected').forEach(p=>p.classList.remove('selected'));
  selection = null;
}

function select(item){
  clearSelection();
  selection = item;
  if(item.type === 'node'){
    const g = nodes[item.id] && nodes[item.id].el;
    if(g) g.classList.add('selected');
  } else if(item.type === 'wire'){
    const w = wires.find(x=>x.id === item.id);
    if(w && w.path) w.path.classList.add('selected');
  }
}

window.addEventListener('click', ()=>{ wireStart = null; clearSelection(); });

window.addEventListener('keydown', (e)=>{
  if(e.key === 'Delete' || e.key === 'Backspace'){
    if(!selection) return;
    if(selection.type === 'node') deleteNode(selection.id);
    else if(selection.type === 'wire') deleteWire(selection.id);
    selection = null;
    if(liveToggle.checked) evaluateAll();
  }
});

/* delete node */
function deleteNode(nodeId){
  const n = nodes[nodeId];
  if(!n) return;
  const removedWires = wires.filter(w => w.fromId === nodeId || w.toId === nodeId);
  removedWires.forEach(w=> { if(w.path) w.path.remove(); });
  wires = wires.filter(w => w.fromId !== nodeId && w.toId !== nodeId);
  n.el.remove();
  delete nodes[nodeId];
  pushAction({ type:'deleteNode', node: serializeNode(n), removedWires: removedWires.map(serializeWire) });
}

/* delete wire by id */
function deleteWire(id){
  const idx = wires.findIndex(w=>w.id === id);
  if(idx === -1) return;
  const w = wires[idx];
  if(w.path) w.path.remove();
  wires.splice(idx,1);
  pushAction({ type:'deleteWire', wire: serializeWire(w) });
}

/* -------------------------
   Serialize helpers for save/undo
   ------------------------- */
function serializeNode(n){
  const obj = { id: n.id, type: n.type, x: n.x, y: n.y };
  // include input value if INPUT
  if(n.type === 'INPUT'){
    obj.value = n.el.dataset.value || '0';
  }
  return obj;
}
function serializeWire(w){ return { id: w.id, fromId: w.fromId, toId: w.toId, toIndex: w.toIndex }; }

/* -------------------------
   Save / Load (localStorage)
   ------------------------- */
function saveToLocal(){
  const data = { nodes: [], wires: [] };
  Object.values(nodes).forEach(n => data.nodes.push(serializeNode(n)));
  wires.forEach(w => data.wires.push(serializeWire(w)));
  localStorage.setItem('logicSim', JSON.stringify(data));
  alert('Saved to localStorage.');
}
function loadFromLocal(){
  const raw = localStorage.getItem('logicSim');
  if(!raw){ alert('No saved circuit'); return; }
  const data = JSON.parse(raw);
  // clear current
  Object.values(nodes).forEach(n=> n.el.remove());
  nodes = {};
  wires.forEach(w=> { if(w.path) w.path.remove(); });
  wires = [];
  // recreate nodes
  data.nodes.forEach(nd => {
    createNode(nd.type, nd.x, nd.y, nd.id, nd.value);
  });
  // recreate wires
  data.wires.forEach(wd => {
    const path = document.createElementNS('http://www.w3.org/2000/svg','path');
    path.classList.add('wire'); path.dataset.id = wd.id; wireLayer.appendChild(path);
    const newW = { id: wd.id, fromId: wd.fromId, toId: wd.toId, toIndex: wd.toIndex, path };
    path.addEventListener('contextmenu', ev=>{ ev.preventDefault(); deleteWire(wd.id); });
    path.addEventListener('click', ev=>{ ev.stopPropagation(); select({type:'wire', id:wd.id}); });
    wires.push(newW);
  });
  refreshAllWires();
  alert('Loaded circuit.');
}

/* -------------------------
   Undo / Redo (basic)
   ------------------------- */
function pushAction(action){
  undoStack.push(action);
  redoStack = [];
  updateUndoRedoButtons();
}
function updateUndoRedoButtons(){
  btnUndo.disabled = undoStack.length === 0;
  btnRedo.disabled = redoStack.length === 0;
}

btnUndo.addEventListener('click', ()=>{
  const a = undoStack.pop();
  if(!a) return;
  redoStack.push(a);
  undoApplyInverse(a);
  updateUndoRedoButtons();
});

btnRedo.addEventListener('click', ()=>{
  const a = redoStack.pop();
  if(!a) return;
  undoStack.push(a);
  redoApply(a);
  updateUndoRedoButtons();
});

function undoApplyInverse(action){
  switch(action.type){
    case 'addNode':
      if(nodes[action.node.id]) deleteNode(action.node.id);
      break;
    case 'deleteNode':
      // recreate node
      const n = action.node;
      createNode(n.type, n.x, n.y, n.id, n.value);
      // recreate wires removed
      (action.removedWires || []).forEach(wd=>{
        const path = document.createElementNS('http://www.w3.org/2000/svg','path'); path.classList.add('wire'); path.dataset.id = wd.id; wireLayer.appendChild(path);
        const newW = { id: wd.id, fromId: wd.fromId, toId: wd.toId, toIndex: wd.toIndex, path };
        path.addEventListener('contextmenu', ev=>{ ev.preventDefault(); deleteWire(wd.id); });
        path.addEventListener('click', ev=>{ ev.stopPropagation(); select({type:'wire', id:wd.id}); });
        wires.push(newW);
      });
      refreshAllWires();
      break;
    case 'addWire':
      deleteWire(action.wire.id);
      break;
    case 'deleteWire':
      // recreate wire
      const wd = action.wire;
      const path2 = document.createElementNS('http://www.w3.org/2000/svg','path'); path2.classList.add('wire'); path2.dataset.id = wd.id; wireLayer.appendChild(path2);
      const newW2 = { id: wd.id, fromId: wd.fromId, toId: wd.toId, toIndex: wd.toIndex, path: path2 };
      path2.addEventListener('contextmenu', ev=>{ ev.preventDefault(); deleteWire(wd.id); });
      path2.addEventListener('click', ev=>{ ev.stopPropagation(); select({type:'wire', id:wd.id}); });
      wires.push(newW2);
      refreshAllWires();
      break;
    case 'moveNode':
      const m = action;
      if(nodes[m.nodeId]) { nodes[m.nodeId].el.setAttribute('transform', `translate(${m.from.x}, ${m.from.y})`); nodes[m.nodeId].x = m.from.x; nodes[m.nodeId].y = m.from.y; refreshAllWires(); }
      break;
    case 'toggle':
      const t = action;
      if(nodes[t.nodeId] && nodes[t.nodeId].el){
        const el = nodes[t.nodeId].el;
        el.dataset.value = el.dataset.value === '1' ? '0' : '1';
        el.querySelector('text.outval').textContent = el.dataset.value;
        if(liveToggle.checked) evaluateAll();
      }
      break;
  }
}

function redoApply(action){
  // re-apply action (simple)
  switch(action.type){
    case 'addNode':
      createNode(action.node.type, action.node.x, action.node.y, action.node.id);
      break;
    case 'deleteNode':
      if(nodes[action.node.id]) deleteNode(action.node.id);
      break;
    case 'addWire':
      const w = action.wire;
      const path = document.createElementNS('http://www.w3.org/2000/svg','path'); path.classList.add('wire'); path.dataset.id = w.id; wireLayer.appendChild(path);
      const newW = { id: w.id, fromId: w.fromId, toId: w.toId, toIndex: w.toIndex, path };
      path.addEventListener('contextmenu', ev=>{ ev.preventDefault(); deleteWire(w.id); });
      path.addEventListener('click', ev=>{ ev.stopPropagation(); select({type:'wire', id:w.id}); });
      wires.push(newW);
      refreshAllWires();
      break;
    case 'deleteWire':
      deleteWire(action.wire.id);
      break;
    case 'moveNode':
      const m = action;
      if(nodes[m.nodeId]){ nodes[m.nodeId].el.setAttribute('transform', `translate(${m.to.x}, ${m.to.y})`); nodes[m.nodeId].x = m.to.x; nodes[m.nodeId].y = m.to.y; refreshAllWires(); }
      break;
    case 'toggle':
      const t = action;
      if(nodes[t.nodeId] && nodes[t.nodeId].el){
        const el = nodes[t.nodeId].el;
        el.dataset.value = el.dataset.value === '1' ? '0' : '1';
        el.querySelector('text.outval').textContent = el.dataset.value;
        if(liveToggle.checked) evaluateAll();
      }
      break;
  }
}

/* -------------------------
   Circuit evaluation
   - build incoming map, then iterate until stable
   ------------------------- */
function evaluateAll(){
  // build incoming mapping: for each node, an array of source node ids keyed by input index
  const incoming = {};
  Object.keys(nodes).forEach(k => incoming[k] = []);
  wires.forEach(w => {
    if(!incoming[w.toId]) incoming[w.toId] = [];
    incoming[w.toId][w.toIndex] = w.fromId;
  });

  // values map
  const values = {};
  // initialize inputs from INPUT nodes
  Object.values(nodes).forEach(n => {
    if(n.type === 'INPUT'){
      const cur = n.el.dataset.value || '0';
      values[n.id] = parseInt(cur,10);
    }
  });

  // iterative propagation
  let changed = true;
  const maxIter = Math.max(100, Object.keys(nodes).length * 5);
  let iter = 0;
  while(changed && ++iter < maxIter){
    changed = false;
    Object.values(nodes).forEach(n => {
      if(n.type === 'INPUT') return;
      const count = gateInputCounts[n.type] ?? 2;
      const ins = [];
      for(let i=0;i<count;i++){
        const fromId = (incoming[n.id] || [])[i];
        ins[i] = fromId && values[fromId] !== undefined ? values[fromId] : 0;
      }
      // special: if INPUT evaluation should use stored value
      if(n.type === 'INPUT') ins.__selfValue = parseInt(n.el.dataset.value||'0',10);
      const out = evaluateGate(n.type, ins);
      if(values[n.id] !== out){ values[n.id] = out; changed = true; }
    });
  }
  if(iter >= maxIter) console.warn('Iteration cap reached - possible cycle');

  // update UI: each gate's outval text
  Object.values(nodes).forEach(n => {
    const v = values[n.id];
    const text = n.el.querySelector('text.outval');
    text.textContent = v === undefined ? '-' : String(v);
  });

  // update truth table
  updateTruthTable(values);
}

/* -------------------------
   Truth table UI
   ------------------------- */
function updateTruthTable(values){
  // single-row display showing current inputs & outputs
  const inputs = Object.values(nodes).filter(n => n.type === 'INPUT').map(n => `${n.id}:${n.el.dataset.value||'0'}`);
  const outputs = Object.values(nodes).filter(n => n.type === 'OUTPUT').map(n => `${n.id}:${values && values[n.id] !== undefined ? values[n.id] : '-'}`);
  const tr = document.createElement('tr');
  tr.innerHTML = `<td>${ttBody.children.length + 1}</td><td>${inputs.join(', ') || '-'}</td><td>${outputs.join(', ') || '-'}</td>`;
  ttBody.prepend(tr);
}

/* -------------------------
   Refresh & helpers
   ------------------------- */
function refreshAllWires(){
  wires.forEach(w => refreshWire(w));
}

/* -------------------------
   Event wiring for buttons
   ------------------------- */
btnRun.addEventListener('click', evaluateAll);
btnSave.addEventListener('click', saveToLocal);
btnLoad.addEventListener('click', loadFromLocal);

/* -------------------------
   Save initial state to undo stack (empty start)
   ------------------------- */
pushAction({ type:'init' });
updateUndoRedoButtons();

/* -------------------------
   Expose functions for debugging in console
   ------------------------- */
window._sim = { nodes, wires, createNode, evaluateAll, saveToLocal, loadFromLocal, deleteNode, deleteWire };

/* End of file */
