// ================= GLOBAL STATE =================
const state = {
  sale: null,
  fba: null,
  uniware: null,
  mapping: null
};

// ================= REQUIRED HEADERS =================
const REQUIRED_HEADERS = {
  sale: [
    "Transaction Type",
    "Sku",
    "Quantity",
    "Ship To State",
    "Fulfillment Channel",
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

// ================= FILE INPUT HANDLERS =================
document.getElementById("saleFile").addEventListener("change", e => handleFile(e, "sale"));
document.getElementById("fbaFile").addEventListener("change", e => handleFile(e, "fba"));
document.getElementById("uniwareFile").addEventListener("change", e => handleFile(e, "uniware"));

// ================= HANDLE FILE =================
function handleFile(event, type) {
  const file = event.target.files[0];
  const statusEl = document.getElementById(type + "Status");

  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const rows = parseCSV(reader.result);
      validateHeaders(rows[0], REQUIRED_HEADERS[type]);
      state[type] = rows;
      statusEl.textContent = "Validated";
      statusEl.className = "status valid";
      log(`${type.toUpperCase()} file validated`);
      checkAllValidated();
    } catch (err) {
      statusEl.textContent = err.message;
      statusEl.className = "status error";
      state[type] = null;
      log(err.message);
    }
  };
  reader.readAsText(file);
}

// ================= LOAD SKU MAPPING FROM GITHUB =================
fetch("data/sku_mapping.csv")
  .then(res => {
    if (!res.ok) throw new Error("Failed to load sku_mapping.csv");
    return res.text();
  })
  .then(text => {
    const rows = parseCSV(text);
    validateHeaders(rows[0], REQUIRED_HEADERS.mapping);
    state.mapping = rows;
    log("SKU Mapping loaded & validated");
    checkAllValidated();
  })
  .catch(err => {
    log("SKU Mapping error: " + err.message);
  });

// ================= CSV PARSER =================
function parseCSV(text) {
  const lines = text.trim().split("\n");
  return lines.map(line =>
    line.split(",").map(cell => cell.replace(/^"|"$/g, "").trim())
  );
}

// ================= HEADER VALIDATION =================
function validateHeaders(headers, required) {
  required.forEach(h => {
    if (!headers.includes(h)) {
      throw new Error(`Missing required header: ${h}`);
    }
  });
}

// ================= FINAL VALIDATION =================
function checkAllValidated() {
  const ready =
    state.sale &&
    state.fba &&
    state.uniware &&
    state.mapping;

  document.getElementById("generateBtn").disabled = !ready;
}

// ================= LOG =================
function log(msg) {
  document.getElementById("logBox").textContent += msg + "\n";
}
