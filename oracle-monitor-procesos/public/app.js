let polling = null;
const $ = id => document.getElementById(id);

function levelClass(s){ return s || "NORMAL"; }
function fmtDate(iso){ return new Date(iso).toLocaleString(); }
function setGauge(pct,status){
  $("gaugeFill").style.width = `${Math.min(100,pct)}%`;
  const colors={NORMAL:"#16a34a",ADVERTENCIA:"#eab308",ALTO:"#f97316",CRITICO:"#dc2626"};
  $("gaugeFill").style.background=colors[status]||"#64748b";
  $("gaugeText").textContent=`${pct}%`;
}
function render(snapshot){
  const p=snapshot.process;
  $("ipValue").textContent=p.percent.toFixed(2);
  $("ipStatus").textContent=p.status;
  $("procValue").textContent=p.current;
  $("procLimit").textContent=`Límite: ${p.limit||"No definido"} · Máx observado: ${p.max}`;
  $("sessValue").textContent=p.sessionCurrent;
  $("sessInfo").textContent=`Activas: ${p.active} · Inactivas: ${p.inactive}`;
  $("blockedValue").textContent=p.blocked;
  $("active").textContent=p.active;
  $("inactive").textContent=p.inactive;
  $("longOps").textContent=p.longOps;
  $("waitChains").textContent=p.waitChains;
  $("lastUpdate").textContent=`Última medición: ${fmtDate(snapshot.timestamp)}`;
  $("ipStatus").className=levelClass(p.status);
  setGauge(p.percent,p.status);

  $("processTable").innerHTML=p.backgrounds.map(x=>`
    <div class="proc-row">
      <div><b>${x.name}</b><br><small>${x.count?x.details.map(d=>d.PNAME+" · PID "+d.SPID).join("<br>"):"Sin instancia encontrada"}</small></div>
      <span class="badge ${x.running?"run":"down"}">${x.running?"ACTIVO":"NO DETECTADO"}</span>
    </div>`).join("");

  $("alerts").innerHTML=snapshot.alerts.length ? snapshot.alerts.map(a=>`
    <div class="alert ${a.level}">
      <b>${a.level}</b> · ${a.variable}: ${a.value}<br>
      <small>${a.description}</small>
    </div>`).join("") : `<div class="alert NORMAL"><b>NORMAL</b><br><small>No hay alertas activas en la medición.</small></div>`;
}
async function status(){
  const r=await fetch("/api/status");
  const d=await r.json();
  if(!r.ok) throw new Error(d.error);
  $("conn").textContent="Oracle conectado";
  $("conn").className="chip online";
  render(d.snapshot);
}
async function measure(){
  const b=$("measureBtn"); b.disabled=true; b.textContent="Midiendo...";
  try{
    const r=await fetch("/api/measure",{method:"POST"});
    const d=await r.json(); if(!r.ok) throw new Error(d.error);
    render(d); await loadHistory();
  }catch(e){alert("Error: "+e.message);$("conn").textContent="Error Oracle";$("conn").className="chip offline";}
  finally{b.disabled=false;b.textContent="Medir ahora";}
}
async function loadHistory(){
  const r=await fetch("/api/history?limit=80");
  const h=await r.json();
  $("historyBody").innerHTML=[...h].reverse().slice(0,20).map(x=>`
    <tr><td>${fmtDate(x.timestamp)}</td><td>${x.processPercent.toFixed(2)}%</td><td>${x.sessions}</td><td>${x.blocked}</td><td>${x.longOps}</td><td><span class="badge ${levelClass(x.status)}">${x.status}</span></td></tr>`).join("");
  drawChart(h);
}
function drawChart(data){
  const svg=$("chart"), W=800,H=260, pad=35;
  if(data.length<2){svg.innerHTML=`<text x="400" y="130" text-anchor="middle" font-size="16" fill="#64748b">Se necesitan al menos 2 mediciones</text>`;return;}
  const pts=data.map((d,i)=>({x:pad+i*(W-2*pad)/(data.length-1),y:H-pad-(d.processPercent/100)*(H-2*pad)}));
  const grid=[0,25,50,75,100].map(v=>{const y=H-pad-(v/100)*(H-2*pad);return `<line x1="${pad}" y1="${y}" x2="${W-pad}" y2="${y}" stroke="#e5e7eb"/><text x="8" y="${y+4}" font-size="10" fill="#64748b">${v}</text>`}).join("");
  const poly=pts.map(p=>`${p.x},${p.y}`).join(" ");
  svg.innerHTML=`${grid}<line x1="${pad}" y1="${pad}" x2="${pad}" y2="${H-pad}" stroke="#94a3b8"/><line x1="${pad}" y1="${H-pad}" x2="${W-pad}" y2="${H-pad}" stroke="#94a3b8"/><polyline fill="none" stroke="#2563eb" stroke-width="3" points="${poly}"/>`;
}
$("measureBtn").onclick=measure;
$("startBtn").onclick=async()=>{const r=await fetch("/api/monitor/start",{method:"POST"});const d=await r.json();if(!r.ok)return alert(d.error);clearInterval(polling);polling=setInterval(status,5000);await status();};
$("stopBtn").onclick=async()=>{await fetch("/api/monitor/stop",{method:"POST"});clearInterval(polling);polling=null;};
$("clearBtn").onclick=async()=>{if(confirm("¿Eliminar todo el historial local?")){await fetch("/api/history",{method:"DELETE"});await loadHistory();}};
(async()=>{try{await status();await loadHistory();}catch(e){$("conn").textContent="Configure Oracle";$("conn").className="chip offline";}})();