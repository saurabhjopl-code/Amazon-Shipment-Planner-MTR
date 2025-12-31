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

// ================= EVENTS =================
document.getElementById("saleFile").addEventListener("change", e => loadFile(e,"sale"));
document.getElementById("fbaFile").addEventListener("change", e => loadFile(e,"fba"));
document.getElementById("uniwareFile").addEventListener("change", e => loadFile(e,"uniware"));
document.getElementById("generateBtn").addEventListener("click", generateReport);

// ================= LOAD FILE (FIXED) =================
function loadFile(e,type){
  const file = e.target.files[0];
  const statusEl = document.getElementById(type+"Status");

  if (!file) {
    statusEl.textContent = "Not uploaded";
    statusEl.className = "status";
    state[type] = null;
    checkReady();
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = parseCSV(reader.result);
      validateHeaders(parsed.headers, REQUIRED_HEADERS[type]);
      state[type] = parsed;

      statusEl.textContent = "Validated";
      statusEl.className = "status valid";
      log(type.toUpperCase() + " validated");
    } catch (err) {
      state[type] = null;
      statusEl.textContent = err.message;
      statusEl.className = "status error";
      log(err.message);
    }
    checkReady();
  };
  reader.readAsText(file);
}

// ================= LOAD SKU MAPPING =================
fetch("data/sku_mapping.csv")
  .then(r => r.text())
  .then(t => {
    const parsed = parseCSV(t);
    validateHeaders(parsed.headers, REQUIRED_HEADERS.mapping);
    state.mapping = parsed;
    log("SKU Mapping loaded");
    checkReady();
  })
  .catch(err => log("Mapping load failed: " + err.message));

// ================= CSV PARSER =================
function parseCSV(text){
  text = text.replace(/^\uFEFF/, "").trim();
  const lines = text.split(/\r?\n/);
  const d = lines[0].includes("\t") ? "\t" : lines[0].includes(";") ? ";" : ",";

  const headers = lines[0].split(d).map(h => normalize(h));
  const rows = lines.slice(1).map(l => l.split(d).map(c => normalize(c)));

  const index = {};
  headers.forEach((h,i) => index[h] = i);

  return { headers, rows, index };
}

function normalize(v){
  return v.replace(/^"|"$/g,"").replace(/^\uFEFF/,"").trim();
}

// ================= VALIDATION =================
function validateHeaders(headers, required){
  required.forEach(h => {
    if (!headers.includes(h)) {
      throw new Error("Missing header: " + h);
    }
  });
}

// ================= READY CHECK =================
function checkReady(){
  document.getElementById("generateBtn").disabled = !(
    state.sale && state.fba && state.uniware && state.mapping
  );
}

// ================= PLACEHOLDER (UNCHANGED LOGIC BELOW) =================
function generateReport(){
  log("Generate Report clicked");
}

// ================= LOG =================
function log(msg){
  document.getElementById("logBox").textContent += msg + "\n";
}
