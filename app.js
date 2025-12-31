// ==================================================
// GLOBAL STATE
// ==================================================
const state = {
  sale: null,
  fba: null,
  uniware: null,
  mapping: null,
  working: []
};

// ==================================================
// REQUIRED HEADERS (LOCKED GLOBAL TRUTH)
// ==================================================
const REQUIRED_HEADERS = {
  sale: [
    "Transaction Type",
    "Sku",
    "Quantity",
    "Warehouse Id"
  ],
  fba: [
    "Date",
    "MSKU",
    "Disposition",
    "Ending Warehouse Balance",
    "Location"
  ],
  uniware: [
    "Sku Code",
    "Total Inventory"
  ],
  mapping: [
    "Amazon Seller SKU",
    "Uniware SKU"
  ]
};

// ==================================================
// FILE HANDLERS
// ==================================================
document.getElementById("saleFile").addEventListener("change", e => handleFile(e, "sale"));
document.getElementById("fbaFile").addEventListener("change", e => handleFile(e, "fba"));
document.getElementById("uniwareFile").addEventListener("change", e => handleFile(e, "uniware"));
document.getElementById("generateBtn").addEventListener("click", generateAggregation);

// ==================================================
function handleFile(event, type) {
  const file = event.target.files[0];
  const statusEl = document.getElementById(type + "Status");

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = parseCSV(reader.result);
      validateHeaders(parsed.headers, REQUIRED_HEADERS[type]);
      state[type] = parsed;
      statusEl.textContent = "Validated";
      statusEl.className = "status valid";
      log(`${type.toUpperCase()} validated`);
      checkAllValidated();
    } catch (e) {
      state[type] = null;
      statusEl.textContent = e.message;
      statusEl.className = "status error";
      log(e.message);
    }
  };
  reader.readAsText(file);
}

// ==================================================
// LOAD SKU MAPPING
// ==================================================
fetch("data/sku_mapping.csv")
  .then(r => r.text())
  .then(t => {
    const p = parseCSV(t);
    validateHeaders(p.headers, REQUIRED_HEADERS.mapping);
    state.mapping = p;
    log("SKU Mapping loaded");
    checkAllValidated();
  });

// ==================================================
// CSV PARSER (LOCKED)
// ==================================================
function parseCSV(text) {
  text = text.replace(/^\uFEFF/, "").trim();
  const lines = text.split(/\r?\n/);
  const d = detectDelimiter(lines[0]);

  const headers = normalize(lines[0].split(d));
  const rows = lines.slice(1).map(l => normalize(l.split(d)));

  const index = {};
  headers.forEach((h, i) => index[h] = i);

  return { headers, rows, index };
}

function detectDelimiter(l) {
  if (l.includes("\t")) return "\t";
  if (l.includes(";")) return ";";
  return ",";
}

function normalize(arr) {
  return arr.map(v => v.replace(/^"|"$/g, "").trim());
}

// ==================================================
function validateHeaders(h, r) {
  r.forEach(x => {
    if (!h.includes(x)) throw new Error(`Missing required header: ${x}`);
  });
}

function checkAllValidated() {
  document.getElementById("generateBtn").disabled = !(
    state.sale && state.fba && state.uniware && state.mapping
  );
}

// ==================================================
// ✅ PHASE 2 – CORRECT AGGREGATION (HEADER-BASED)
// ==================================================
function generateAggregation() {
  log("Phase 2 aggregation started");

  const sales = {};
  const returns = {};

  const s = state.sale;
  s.rows.forEach(r => {
    const txn = r[s.index["Transaction Type"]];
    const sku = r[s.index["Sku"]];
    const qty = Number(r[s.index["Quantity"]]) || 0;
    const fc = r[s.index["Warehouse Id"]] || "UNKNOWN";
    const key = `${sku}||${fc}`;

    if (txn.startsWith("Shipment") || txn.startsWith("FreeReplacement")) {
      sales[key] = (sales[key] || 0) + qty;
    }
    if (txn.startsWith("Refund")) {
      returns[key] = (returns[key] || 0) + qty;
    }
  });

  const parseDate = d => {
    const [dd, mm, yy] = d.split("-");
    return new Date(`${yy}-${mm}-${dd}`).getTime();
  };

  const f = state.fba;
  const latestDate = Math.max(...f.rows.map(r => parseDate(r[f.index["Date"]])));

  const fba = {};
  f.rows.forEach(r => {
    if (parseDate(r[f.index["Date"]]) !== latestDate) return;
    if (r[f.index["Disposition"]] !== "SELLABLE") return;

    const sku = r[f.index["MSKU"]];
    const fc = r[f.index["Location"]];
    const stock = Number(r[f.index["Ending Warehouse Balance"]]) || 0;
    const key = `${sku}||${fc}`;
    fba[key] = (fba[key] || 0) + stock;
  });

  const u = state.uniware;
  const uniwareStock = {};
  u.rows.forEach(r => {
    uniwareStock[r[u.index["Sku Code"]]] = Number(r[u.index["Total Inventory"]]) || 0;
  });

  const m = state.mapping;
  const skuMap = {};
  m.rows.forEach(r => skuMap[r[m.index["Amazon Seller SKU"]]] = r[m.index["Uniware SKU"]]);

  const allKeys = new Set([...Object.keys(sales), ...Object.keys(returns), ...Object.keys(fba)]);

  state.working = [];

  allKeys.forEach(k => {
    const [sku, fc] = k.split("||");
    const sale = sales[k] || 0;
    const ret = returns[k] || 0;
    const stock = fba[k] || 0;

    if (sale === 0 && stock === 0) return;

    state.working.push({
      sku,
      fc,
      sale30d: sale,
      drr: sale / 30,
      returnPct: sale + ret ? (ret / (sale + ret)) * 100 : 0,
      fcStock: stock,
      uniwareStock: uniwareStock[skuMap[sku]] || 0
    });
  });

  log(`Phase 2 completed: ${state.working.length} rows`);
  console.table(state.working);
}

// ==================================================
function log(m) {
  document.getElementById("logBox").textContent += m + "\n";
}
