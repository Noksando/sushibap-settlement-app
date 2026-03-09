const fs = require("fs");
const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3001;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data", "store.json");
const FINANCE_STORES = ["1호점", "2호점"];

app.use(express.static(path.join(__dirname, "public")));
app.get("/healthz", (_req, res) => {
  res.status(200).json({ ok: true });
});

const defaultData = {
  stores: {
    "1호점": {
      "치킨바이트": 3,
      "연어": 8,
      "계란말이": 5
    },
    "2호점": {
      "치킨바이트": 6,
      "연어": 4,
      "계란말이": 7
    },
    "부엌": {
      "치킨바이트": 10,
      "연어": 15,
      "계란말이": 12
    }
  },
  openedBills: [
    {
      id: "bill-1",
      company: "동해식자재",
      receivedAt: "2026-03-05",
      amount: 180000,
      reference: ""
    }
  ],
  paidBills: [],
  notices: [],
  settlements: [
    {
      id: "settlement-1",
      storeName: "1호점",
      date: "2026-03-09",
      card: 780,
      cash: 120,
      delivery: 210,
      createdAt: "2026-03-09T08:00:00.000Z"
    },
    {
      id: "settlement-2",
      storeName: "2호점",
      date: "2026-03-09",
      card: 260,
      cash: 90,
      delivery: 110,
      createdAt: "2026-03-09T08:05:00.000Z"
    }
  ],
  expenses: [
    {
      id: "expense-1",
      storeName: "1호점",
      date: "2026-03-09",
      type: "daily",
      amount: 210,
      note: "연어/쌀 구입",
      createdAt: "2026-03-09T08:10:00.000Z"
    }
  ],
  monthlyFixedCosts: [
    {
      id: "fixed-1",
      storeName: "2호점",
      month: "2026-03",
      salary: 1100,
      rent: 600,
      updatedAt: "2026-03-01T00:00:00.000Z"
    }
  ]
};

function normalizeState(rawData) {
  const next = rawData && typeof rawData === "object" ? rawData : {};
  if (!next.stores || typeof next.stores !== "object") {
    next.stores = structuredClone(defaultData.stores);
  }
  if (!Array.isArray(next.openedBills)) {
    next.openedBills = [];
  }
  if (!Array.isArray(next.paidBills)) {
    next.paidBills = [];
  }
  if (!Array.isArray(next.notices)) {
    next.notices = [];
  }
  if (!Array.isArray(next.settlements)) {
    next.settlements = [];
  }
  if (!Array.isArray(next.expenses)) {
    next.expenses = [];
  }

  if (!Array.isArray(next.dailyExpenses)) {
    next.dailyExpenses = next.expenses.filter((entry) => !entry?.type || entry.type === "daily");
  }

  if (!Array.isArray(next.monthlyFixedCosts)) {
    const fixedMap = new Map();
    next.expenses
      .filter((entry) => entry?.type === "labor" || entry?.type === "fixed")
      .forEach((entry) => {
        if (!FINANCE_STORES.includes(entry.storeName) || typeof entry.date !== "string") {
          return;
        }
        const month = entry.date.slice(0, 7);
        const key = `${entry.storeName}:${month}`;
        const prev = fixedMap.get(key) || {
          id: `fixed-${Date.now()}-${Math.random()}`,
          storeName: entry.storeName,
          month,
          salary: 0,
          rent: 0,
          updatedAt: entry.createdAt || new Date().toISOString()
        };
        if (entry.type === "labor") {
          prev.salary += Number(entry.amount) || 0;
        }
        if (entry.type === "fixed") {
          prev.rent += Number(entry.amount) || 0;
        }
        fixedMap.set(key, prev);
      });
    next.monthlyFixedCosts = [...fixedMap.values()];
  }
  next.paidBills = next.paidBills
    .filter((bill) => bill && typeof bill === "object")
    .sort((a, b) => String(b.paidAt || "").localeCompare(String(a.paidAt || "")))
    .slice(0, 10);
  next.notices = next.notices
    .filter((notice) => notice && typeof notice === "object")
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, 30);
  next.settlements = next.settlements
    .filter((entry) => {
      if (!entry || typeof entry !== "object") {
        return false;
      }
      if (!FINANCE_STORES.includes(entry.storeName)) {
        return false;
      }
      if (typeof entry.date !== "string" || !entry.date) {
        return false;
      }
      return (
        Number.isFinite(entry.card) &&
        entry.card >= 0 &&
        Number.isFinite(entry.cash) &&
        entry.cash >= 0 &&
        Number.isFinite(entry.delivery) &&
        entry.delivery >= 0
      );
    })
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  next.dailyExpenses = next.dailyExpenses
    .filter((entry) => {
      if (!entry || typeof entry !== "object") {
        return false;
      }
      if (!FINANCE_STORES.includes(entry.storeName)) {
        return false;
      }
      if (typeof entry.date !== "string" || !entry.date) {
        return false;
      }
      return Number.isFinite(entry.amount) && entry.amount >= 0;
    })
    .map((entry) => ({
      ...entry,
      type: "daily",
      note: typeof entry.note === "string" ? entry.note.slice(0, 120) : ""
    }))
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

  next.monthlyFixedCosts = next.monthlyFixedCosts
    .filter((entry) => {
      if (!entry || typeof entry !== "object") {
        return false;
      }
      if (!FINANCE_STORES.includes(entry.storeName)) {
        return false;
      }
      if (typeof entry.month !== "string" || !/^\d{4}-\d{2}$/.test(entry.month)) {
        return false;
      }
      return (
        Number.isFinite(entry.salary) &&
        entry.salary >= 0 &&
        Number.isFinite(entry.rent) &&
        entry.rent >= 0
      );
    })
    .sort((a, b) => String(b.month || "").localeCompare(String(a.month || "")));

  return next;
}

function readData() {
  try {
    const dataDir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2), "utf8");
    }

    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return normalizeState(JSON.parse(raw));
  } catch (error) {
    console.error("Failed to read data file:", error);
    return structuredClone(defaultData);
  }
}

function saveData(nextData) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(nextData, null, 2), "utf8");
}

let state = readData();

function broadcastState() {
  io.emit("state:update", state);
}

io.on("connection", (socket) => {
  socket.emit("state:update", state);

  socket.on("inventory:change", ({ storeName, itemName, delta }) => {
    if (!state.stores[storeName] || typeof state.stores[storeName][itemName] !== "number") {
      return;
    }
    const current = state.stores[storeName][itemName];
    const next = Math.max(0, current + delta);
    state.stores[storeName][itemName] = next;
    saveData(state);
    broadcastState();
  });

  socket.on("inventory:addItem", ({ storeName, itemName, quantity }) => {
    if (!storeName || !itemName || !Number.isInteger(quantity) || quantity < 0) {
      return;
    }
    if (!state.stores[storeName]) {
      state.stores[storeName] = {};
    }
    state.stores[storeName][itemName] = quantity;
    saveData(state);
    broadcastState();
  });

  socket.on("inventory:removeItem", ({ storeName, itemName }) => {
    if (!state.stores[storeName] || typeof state.stores[storeName][itemName] !== "number") {
      return;
    }
    delete state.stores[storeName][itemName];
    saveData(state);
    broadcastState();
  });

  socket.on("inventory:reorder", ({ storeName, fromIndex, toIndex }) => {
    if (!state.stores[storeName]) {
      return;
    }
    const entries = Object.entries(state.stores[storeName]);
    if (
      !Number.isInteger(fromIndex) ||
      !Number.isInteger(toIndex) ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= entries.length ||
      toIndex >= entries.length ||
      fromIndex === toIndex
    ) {
      return;
    }

    const [moved] = entries.splice(fromIndex, 1);
    entries.splice(toIndex, 0, moved);
    state.stores[storeName] = Object.fromEntries(entries);
    saveData(state);
    broadcastState();
  });

  socket.on("bill:add", ({ company, receivedAt, amount, reference }) => {
    if (!company || !receivedAt || !Number.isFinite(amount) || amount < 0) {
      return;
    }
    const newBill = {
      id: `bill-${Date.now()}`,
      company,
      receivedAt,
      amount,
      reference: typeof reference === "string" ? reference.trim() : ""
    };
    state.openedBills.unshift(newBill);
    saveData(state);
    broadcastState();
  });

  socket.on("bill:remove", ({ id }) => {
    const target = state.openedBills.find((bill) => bill.id === id);
    if (!target) {
      return;
    }
    state.openedBills = state.openedBills.filter((bill) => bill.id !== id);
    state.paidBills.unshift({
      ...target,
      paidAt: new Date().toISOString()
    });
    state.paidBills = state.paidBills
      .sort((a, b) => String(b.paidAt || "").localeCompare(String(a.paidAt || "")))
      .slice(0, 10);
    saveData(state);
    broadcastState();
  });

  socket.on("bill:restore", ({ id }) => {
    const target = state.paidBills.find((bill) => bill.id === id);
    if (!target) {
      return;
    }
    state.paidBills = state.paidBills.filter((bill) => bill.id !== id);
    const { paidAt, ...restoredBill } = target;
    state.openedBills.unshift(restoredBill);
    saveData(state);
    broadcastState();
  });

  socket.on("bill:deletePaid", ({ id }) => {
    state.paidBills = state.paidBills.filter((bill) => bill.id !== id);
    saveData(state);
    broadcastState();
  });

  socket.on("notice:add", ({ storeName, content }) => {
    if (!storeName || typeof content !== "string") {
      return;
    }
    const trimmed = content.trim();
    if (!trimmed || trimmed.length > 120) {
      return;
    }
    state.notices.unshift({
      id: `notice-${Date.now()}`,
      storeName,
      content: trimmed,
      createdAt: new Date().toISOString()
    });
    state.notices = state.notices
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .slice(0, 30);
    saveData(state);
    broadcastState();
  });

  socket.on("notice:remove", ({ id }) => {
    state.notices = state.notices.filter((notice) => notice.id !== id);
    saveData(state);
    broadcastState();
  });

  socket.on("settlement:add", ({ storeName, date, card, cash, delivery }) => {
    if (!FINANCE_STORES.includes(storeName) || typeof date !== "string" || !date) {
      return;
    }
    if (
      !Number.isFinite(card) ||
      !Number.isFinite(cash) ||
      !Number.isFinite(delivery) ||
      card < 0 ||
      cash < 0 ||
      delivery < 0
    ) {
      return;
    }
    state.settlements.unshift({
      id: `settlement-${Date.now()}`,
      storeName,
      date,
      card,
      cash,
      delivery,
      createdAt: new Date().toISOString()
    });
    state.settlements = state.settlements
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    saveData(state);
    broadcastState();
  });

  socket.on("settlement:remove", ({ id }) => {
    state.settlements = state.settlements.filter((entry) => entry.id !== id);
    saveData(state);
    broadcastState();
  });

  socket.on("expense:add", ({ storeName, date, amount, note }) => {
    if (!FINANCE_STORES.includes(storeName) || typeof date !== "string" || !date) {
      return;
    }
    if (!Number.isFinite(amount) || amount < 0) {
      return;
    }
    const normalizedNote = typeof note === "string" ? note.trim().slice(0, 120) : "";
    state.dailyExpenses.unshift({
      id: `expense-${Date.now()}`,
      storeName,
      date,
      type: "daily",
      amount,
      note: normalizedNote,
      createdAt: new Date().toISOString()
    });
    state.dailyExpenses = state.dailyExpenses
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
      .slice(0, 300);
    saveData(state);
    broadcastState();
  });

  socket.on("expense:remove", ({ id }) => {
    state.dailyExpenses = state.dailyExpenses.filter((entry) => entry.id !== id);
    saveData(state);
    broadcastState();
  });

  socket.on("fixedCost:set", ({ storeName, month, salary, rent }) => {
    if (!FINANCE_STORES.includes(storeName) || typeof month !== "string" || !/^\d{4}-\d{2}$/.test(month)) {
      return;
    }
    if (!Number.isFinite(salary) || !Number.isFinite(rent) || salary < 0 || rent < 0) {
      return;
    }
    const existing = state.monthlyFixedCosts.find(
      (entry) => entry.storeName === storeName && entry.month === month
    );
    if (existing) {
      existing.salary = salary;
      existing.rent = rent;
      existing.updatedAt = new Date().toISOString();
    } else {
      state.monthlyFixedCosts.unshift({
        id: `fixed-${Date.now()}`,
        storeName,
        month,
        salary,
        rent,
        updatedAt: new Date().toISOString()
      });
    }
    state.monthlyFixedCosts = state.monthlyFixedCosts
      .sort((a, b) => String(b.month || "").localeCompare(String(a.month || "")))
      .slice(0, 120);
    saveData(state);
    broadcastState();
  });

  socket.on("fixedCost:remove", ({ id }) => {
    state.monthlyFixedCosts = state.monthlyFixedCosts.filter((entry) => entry.id !== id);
    saveData(state);
    broadcastState();
  });
});

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
