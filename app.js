// ================= GLOBAL STATE =================
const state = {
  sale: null,
  fba: null,
  uniware: null,
  mapping: null,
  working: []
};

// ================= REQUIRED HEADERS =================
const REQUIRED_HEADERS = {
  sale: ["Transaction Type","Sku","Quantity","Warehouse Id"],
  fba: ["Date","MSKU","Disposition","Ending Warehouse Balance","Location"],
  uniware: ["Sku Code","Total Inventory"],
  mapping: ["Amazon Seller SKU","Uniware SKU"]
};

// ================= FILE HANDLERS =================
document.getElementById("saleFile").addEventListener("change", e => loadFile(e,"sale"));
document.getElementById("fbaFile").addEventListener("change", e => loadFile(e,"fba"));
document.getElementById("uniwareFile").addEventListener("change", e => loadFile(e,"uniware"));
document.getElementById("generateBtn").addEventListener("click", generateReport);

// ================= FILE LOAD =================
function loadFile(e,type){
  const r=new FileReader();
  r.onload=()=>{
    const p=parseCSV(r.result);
    validateHeaders(p.headers,REQUIRED_HEADERS[type]);
    state[type]=p;
    document.getElementById(type+"Status").textContent="Validated";
    document.getElementById(type+"Status").className="status valid";
    log(type.toUpperCase()+" validated");
    checkReady();
  };
  r.readAsText(e.target.files[0]);
}

// ================= SKU MAP =================
fetch("data/sku_mapping.csv").then(r=>r.text()).then(t=>{
  const p=parseCSV(t);
  validateHeaders(p.headers,REQUIRED_HEADERS.mapping);
  state.mapping=p;
  log("SKU Mapping loaded");
  checkReady();
});

// ================= CSV =================
function parseCSV(text){
  text=text.replace(/^\uFEFF/,"").trim();
  const lines=text.split(/\r?\n/);
  const d=lines[0].includes("\t")?"\t":lines[0].includes(";")?";":",";
  const headers=lines[0].split(d).map(h=>h.trim());
  const rows=lines.slice(1).map(l=>l.split(d).map(c=>c.trim()));
  const index={}; headers.forEach((h,i)=>index[h]=i);
  return {headers,rows,index};
}

function validateHeaders(h,r){r.forEach(x=>{if(!h.includes(x))throw Error("Missing header "+x);});}
function checkReady(){
  document.getElementById("generateBtn").disabled=!(
    state.sale&&state.fba&&state.uniware&&state.mapping
  );
}

// ================= PHASE 3 + 4 =================
function generateReport(){
  state.working=[];
  const skuMap={}, uniwareStock={}, sales={}, returns={}, fba={};

  state.mapping.rows.forEach(r=>skuMap[r[state.mapping.index["Amazon Seller SKU"]]]=r[state.mapping.index["Uniware SKU"]]);
  state.uniware.rows.forEach(r=>uniwareStock[r[state.uniware.index["Sku Code"]]]=Number(r[state.uniware.index["Total Inventory"]])||0);

  state.sale.rows.forEach(r=>{
    const txn=r[state.sale.index["Transaction Type"]];
    const sku=r[state.sale.index["Sku"]];
    const qty=Number(r[state.sale.index["Quantity"]])||0;
    const fc=r[state.sale.index["Warehouse Id"]];
    const k=sku+"||"+fc;
    if(txn.startsWith("Shipment")||txn.startsWith("FreeReplacement")) sales[k]=(sales[k]||0)+qty;
    if(txn.startsWith("Refund")) returns[k]=(returns[k]||0)+qty;
  });

  const parseDate=d=>{const[x,y,z]=d.split("-");return new Date(`${z}-${y}-${x}`).getTime();};
  const f=state.fba;
  const latest=Math.max(...f.rows.map(r=>parseDate(r[f.index["Date"]])));

  f.rows.forEach(r=>{
    if(parseDate(r[f.index["Date"]])!==latest) return;
    if(r[f.index["Disposition"]]!=="SELLABLE") return;
    const sku=r[f.index["MSKU"]];
    const fc=r[f.index["Location"]];
    const k=sku+"||"+fc;
    fba[k]=(fba[k]||0)+(Number(r[f.index["Ending Warehouse Balance"]])||0);
  });

  const keys=new Set([...Object.keys(sales),...Object.keys(returns),...Object.keys(fba)]);

  keys.forEach(k=>{
    const [sku,fc]=k.split("||");
    const sale=sales[k]||0;
    const ret=returns[k]||0;
    const stock=fba[k]||0;
    if(!sale&&!stock) return;

    const drr=sale/30;
    const sc=drr?stock/drr:0;
    const rp=sale+ret?ret/(sale+ret)*100:0;
    const uw=uniwareStock[skuMap[sku]]||0;

    let decision="DISCUSS",send=0,recall=0,remarks="";
    if(sc<45&&uw>=45&&rp<=30){
      decision="SEND";
      send=Math.ceil(45*drr-stock);
      remarks="Low stock cover";
    }else{
      decision="DO NOT SEND";
      if(sc>45||rp>30){
        recall=Math.max(0,Math.floor(stock-(45*drr)));
        remarks="Overstock / Returns";
      }else remarks="Uniware constraint";
    }

    state.working.push({sku,fc,stock,uw,sale,drr,sc,decision,send,recall,remarks});
  });

  renderFCTabs();
}

// ================= RENDER =================
function renderFCTabs(){
  const tabs=document.getElementById("fcTabs");
  const content=document.getElementById("fcContent");
  tabs.innerHTML=""; content.innerHTML="";

  const fcGroups={};
  state.working.forEach(r=>{
    fcGroups[r.fc]=fcGroups[r.fc]||[];
    fcGroups[r.fc].push(r);
  });

  Object.keys(fcGroups).forEach((fc,i)=>{
    const tab=document.createElement("div");
    tab.className="fc-tab"+(i===0?" active":"");
    tab.textContent=fc;
    tab.onclick=()=>showFC(fc,fcGroups);
    tabs.appendChild(tab);
  });

  showFC(Object.keys(fcGroups)[0],fcGroups);
}

function showFC(fc,groups){
  document.querySelectorAll(".fc-tab").forEach(t=>t.classList.toggle("active",t.textContent===fc));
  const rows=groups[fc];
  let limit=25;

  const container=document.getElementById("fcContent");
  container.innerHTML="";

  const render=()=>{
    container.innerHTML=buildTable(rows.slice(0,limit));
    if(limit<rows.length){
      const b=document.createElement("button");
      b.textContent="Load More";
      b.className="load-btn";
      b.onclick=()=>{limit+=25;render();};
      container.appendChild(b);
    }
  };
  render();
}

function buildTable(rows){
  let h=`<table><tr>
  <th>Amazon Seller SKU</th><th>Current FC Stock</th><th>Uniware Stock</th>
  <th>30D Sale</th><th>DRR</th><th>Stock Cover</th>
  <th>Decision</th><th>Send Qty</th><th>Recall Qty</th><th>Remarks</th></tr>`;
  rows.forEach(r=>{
    h+=`<tr>
    <td>${r.sku}</td><td>${r.stock}</td><td>${r.uw}</td>
    <td>${r.sale}</td><td>${r.drr.toFixed(2)}</td><td>${r.sc.toFixed(1)}</td>
    <td>${r.decision}</td><td>${r.send}</td><td>${r.recall}</td><td>${r.remarks}</td>
    </tr>`;
  });
  return h+"</table>";
}

function log(m){document.getElementById("logBox").textContent+=m+"\n";}
