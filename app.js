// ================= GLOBAL STATE =================
const state = {
  sale: null,
  fba: null,
  uniware: null,
  mapping: null
};

// ================= REQUIRED HEADERS (LOCKED) =================
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
      const parsed = parseCSV(reader.result);
      const headers = parsed.headers;
      validateHeaders(headers, REQUIRED_HEADERS[type]);
      state[type] = parsed.rows;
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

// ================= LOAD SKU MAPPING =================
fetch("data/sku_mapping.csv")
  .then(res => {
    if (!res.ok) throw new Error("Failed to load sku_mapping.csv");
    return res.text();
  })
  .then(text => {
    const parsed = parseCSV(text);
    validateHeaders(parsed.headers, REQUIRED_HEADERS.mapping);
    state.mapping = parsed.rows;
    log("SKU Mapping loaded & validated");
    checkAllValidated();
  })
  .catch(err => {
    log("SKU Mapping error: " + err.message);
  });

// ================= CSV PARSER (AUTO DELIMITER) =================
function parseCSV(text) {
  text = text.replace(/^\uFEFF/, "").trim();

  const lines = text.split(/\r?\n/);
  if (lines.length === 0) throw new Error("Empty file");

  const delimiter = detectDelimiter(lines[0]);

  const headers = lines[0]
    .split(delimiter)
    .map(h => h.replace(/^"|"$/g, "").trim());

  const rows = lines.slice(1).map(line =>
    line.split(delimiter).map(cell =>
      cell.replace(/^"|"$/g, "").trim()
    )
  );

  return { headers, rows };
}

// ================= DELIMITER DETECTION =================
function detectDelimiter(headerLine) {
  if (headerLine.includes("\t")) return "\t";
  if (headerLine.includes(";")) return ";";
  return ","; // fallback
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
