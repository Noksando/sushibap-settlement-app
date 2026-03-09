const socket = io();

const FINANCE_STORES = ["1호점", "2호점"];
const TARGET_BY_STORE = {
  "1호점": 1000,
  "2호점": 500
};

const storeTabsEl = document.getElementById("storeTabs");
const settlementForm = document.getElementById("settlementForm");
const settlementDateEl = document.getElementById("settlementDate");
const cardAmountEl = document.getElementById("cardAmount");
const cashAmountEl = document.getElementById("cashAmount");
const deliveryAmountEl = document.getElementById("deliveryAmount");
const entryTotalEl = document.getElementById("entryTotal");
const settlementListEl = document.getElementById("settlementList");
const weekSelectEl = document.getElementById("weekSelect");
const weeklyCardsEl = document.getElementById("weeklyCards");
const weeklyTableBodyEl = document.getElementById("weeklyTableBody");
const monthPickerEl = document.getElementById("monthPicker");
const contributionWrapEl = document.getElementById("contributionWrap");

let currentState = { settlements: [] };
let selectedStore = FINANCE_STORES[0];
let selectedWeekStart = "";
let selectedMonth = "";

function todayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function monthISO(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function parseLocalDate(dateStr) {
  const [year, month, day] = String(dateStr)
    .split("-")
    .map((part) => Number(part));
  if (!year || !month || !day) {
    return null;
  }
  return new Date(year, month - 1, day);
}

function formatEUR(amount) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2
  }).format(amount || 0);
}

function formatDateKOR(dateStr) {
  const parsed = parseLocalDate(dateStr);
  if (!parsed) {
    return dateStr;
  }
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(parsed);
}

function toWeekStartISO(dateStr) {
  const date = parseLocalDate(dateStr);
  if (!date) {
    return "";
  }
  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  const start = new Date(date);
  start.setDate(start.getDate() + offset);
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, "0");
  const d = String(start.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDaysISO(dateStr, days) {
  const date = parseLocalDate(dateStr);
  if (!date) {
    return dateStr;
  }
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function safeAmount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

function getSettlements() {
  return Array.isArray(currentState.settlements) ? currentState.settlements : [];
}

function renderStoreTabs() {
  storeTabsEl.innerHTML = "";
  FINANCE_STORES.forEach((storeName) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `tab-btn ${selectedStore === storeName ? "active" : ""}`;
    btn.textContent = storeName;
    btn.addEventListener("click", () => {
      selectedStore = storeName;
      renderStoreTabs();
      renderSettlementList();
    });
    storeTabsEl.appendChild(btn);
  });
}

function renderSettlementList() {
  const settlements = getSettlements().filter((entry) => entry.storeName === selectedStore);
  settlementListEl.innerHTML = "";

  if (settlements.length === 0) {
    settlementListEl.innerHTML = "<li>아직 등록된 정산 기록이 없습니다.</li>";
    return;
  }

  settlements.slice(0, 20).forEach((entry) => {
    const total = entry.card + entry.cash + entry.delivery;
    const li = document.createElement("li");
    li.className = "settlement-item";
    li.innerHTML = `
      <div class="settlement-top">
        <strong>${formatDateKOR(entry.date)}</strong>
        <span class="settlement-total">총 ${formatEUR(total)}</span>
      </div>
      <div class="settlement-grid">
        <span>카드 ${formatEUR(entry.card)}</span>
        <span>현금 ${formatEUR(entry.cash)}</span>
        <span>배달 ${formatEUR(entry.delivery)}</span>
      </div>
      <button class="delete-btn">삭제</button>
    `;
    li.querySelector(".delete-btn").addEventListener("click", () => {
      const ok = window.confirm("이 정산 기록을 삭제할까요?");
      if (!ok) {
        return;
      }
      socket.emit("settlement:remove", { id: entry.id });
    });
    settlementListEl.appendChild(li);
  });
}

function weekOptions() {
  const starts = new Set();
  getSettlements().forEach((entry) => {
    const start = toWeekStartISO(entry.date);
    if (start) {
      starts.add(start);
    }
  });
  starts.add(toWeekStartISO(todayISO()));
  return [...starts].sort((a, b) => b.localeCompare(a));
}

function renderWeekSelect() {
  const options = weekOptions();
  if (!selectedWeekStart || !options.includes(selectedWeekStart)) {
    selectedWeekStart = options[0] || toWeekStartISO(todayISO());
  }

  weekSelectEl.innerHTML = "";
  options.forEach((start) => {
    const option = document.createElement("option");
    const end = addDaysISO(start, 6);
    option.value = start;
    option.textContent = `${start} ~ ${end}`;
    option.selected = start === selectedWeekStart;
    weekSelectEl.appendChild(option);
  });
}

function calcWeekSummary(weekStart) {
  const totalsByStore = {};
  FINANCE_STORES.forEach((store) => {
    totalsByStore[store] = { card: 0, cash: 0, delivery: 0 };
  });

  getSettlements().forEach((entry) => {
    if (toWeekStartISO(entry.date) !== weekStart) {
      return;
    }
    const target = totalsByStore[entry.storeName];
    if (!target) {
      return;
    }
    target.card += entry.card;
    target.cash += entry.cash;
    target.delivery += entry.delivery;
  });

  const all = { card: 0, cash: 0, delivery: 0 };
  FINANCE_STORES.forEach((store) => {
    all.card += totalsByStore[store].card;
    all.cash += totalsByStore[store].cash;
    all.delivery += totalsByStore[store].delivery;
  });

  return { totalsByStore, all };
}

function renderWeeklySummary() {
  const { totalsByStore, all } = calcWeekSummary(selectedWeekStart);

  weeklyCardsEl.innerHTML = `
    <div class="summary-pill">전체 카드 ${formatEUR(all.card)}</div>
    <div class="summary-pill">전체 현금 ${formatEUR(all.cash)}</div>
    <div class="summary-pill">전체 배달 ${formatEUR(all.delivery)}</div>
  `;

  weeklyTableBodyEl.innerHTML = "";

  FINANCE_STORES.forEach((store) => {
    const data = totalsByStore[store];
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${store}</td>
      <td>${formatEUR(data.card)}</td>
      <td>${formatEUR(data.cash)}</td>
      <td>${formatEUR(data.delivery)}</td>
      <td>${formatEUR(data.card + data.cash + data.delivery)}</td>
    `;
    weeklyTableBodyEl.appendChild(row);
  });

  const allRow = document.createElement("tr");
  allRow.className = "total-row";
  allRow.innerHTML = `
    <td>전체 합계</td>
    <td>${formatEUR(all.card)}</td>
    <td>${formatEUR(all.cash)}</td>
    <td>${formatEUR(all.delivery)}</td>
    <td>${formatEUR(all.card + all.cash + all.delivery)}</td>
  `;
  weeklyTableBodyEl.appendChild(allRow);
}

function getShadeClass(amount, target) {
  if (amount <= 0) {
    return "shade-0";
  }
  const ratio = Math.min(amount / target, 1);
  if (ratio >= 0.85) {
    return "shade-4";
  }
  if (ratio >= 0.6) {
    return "shade-3";
  }
  if (ratio >= 0.35) {
    return "shade-2";
  }
  return "shade-1";
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function monthTotalsByStore(monthStr) {
  const [year, month] = monthStr.split("-").map(Number);
  const dayCount = daysInMonth(year, month - 1);
  const map = {};
  FINANCE_STORES.forEach((store) => {
    map[store] = {};
    for (let day = 1; day <= dayCount; day += 1) {
      const key = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      map[store][key] = 0;
    }
  });

  getSettlements().forEach((entry) => {
    if (!entry.date.startsWith(monthStr)) {
      return;
    }
    if (!map[entry.storeName] || typeof map[entry.storeName][entry.date] !== "number") {
      return;
    }
    map[entry.storeName][entry.date] += entry.card + entry.cash + entry.delivery;
  });

  return map;
}

function renderContributionGraph() {
  const [year, month] = selectedMonth.split("-").map(Number);
  const monthMap = monthTotalsByStore(selectedMonth);
  const firstDate = new Date(year, month - 1, 1);
  const firstDay = firstDate.getDay();
  const leading = firstDay === 0 ? 6 : firstDay - 1;
  const totalDays = daysInMonth(year, month - 1);

  contributionWrapEl.innerHTML = "";

  FINANCE_STORES.forEach((store) => {
    const section = document.createElement("section");
    section.className = "graph-section";

    const title = document.createElement("h3");
    title.textContent = `${store} (목표 ${TARGET_BY_STORE[store]} EUR/day)`;

    const dayHeader = document.createElement("div");
    dayHeader.className = "day-header";
    dayHeader.innerHTML = "<span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span><span>일</span>";

    const grid = document.createElement("div");
    grid.className = "contribution-grid";

    for (let i = 0; i < leading; i += 1) {
      const empty = document.createElement("div");
      empty.className = "cell-empty";
      grid.appendChild(empty);
    }

    for (let day = 1; day <= totalDays; day += 1) {
      const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const amount = monthMap[store][dateKey] || 0;
      const cell = document.createElement("div");
      cell.className = `cell ${getShadeClass(amount, TARGET_BY_STORE[store])}`;
      cell.title = `${store} ${dateKey} ${formatEUR(amount)}`;
      cell.textContent = String(day);
      grid.appendChild(cell);
    }

    const monthTotal = Object.values(monthMap[store]).reduce((sum, value) => sum + value, 0);
    const note = document.createElement("p");
    note.className = "graph-note";
    note.textContent = `월 누적 ${formatEUR(monthTotal)}`;

    section.append(title, dayHeader, grid, note);
    contributionWrapEl.appendChild(section);
  });
}

function updateEntryTotalHint() {
  const card = Number(cardAmountEl.value) || 0;
  const cash = Number(cashAmountEl.value) || 0;
  const delivery = Number(deliveryAmountEl.value) || 0;
  const total = card + cash + delivery;
  entryTotalEl.textContent = `입력 합계: ${formatEUR(total)}`;
}

[cardAmountEl, cashAmountEl, deliveryAmountEl].forEach((input) => {
  input.addEventListener("input", updateEntryTotalHint);
});

settlementForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const card = safeAmount(cardAmountEl.value);
  const cash = safeAmount(cashAmountEl.value);
  const delivery = safeAmount(deliveryAmountEl.value);

  if (card === null || cash === null || delivery === null) {
    window.alert("금액은 0 이상의 숫자로 입력해 주세요.");
    return;
  }

  socket.emit("settlement:add", {
    storeName: selectedStore,
    date: settlementDateEl.value,
    card,
    cash,
    delivery
  });

  settlementForm.reset();
  settlementDateEl.value = todayISO();
  updateEntryTotalHint();
});

weekSelectEl.addEventListener("change", () => {
  selectedWeekStart = weekSelectEl.value;
  renderWeeklySummary();
});

monthPickerEl.addEventListener("change", () => {
  selectedMonth = monthPickerEl.value;
  renderContributionGraph();
});

socket.on("state:update", (state) => {
  currentState = state;

  if (!selectedMonth) {
    selectedMonth = monthISO();
  }
  monthPickerEl.value = selectedMonth;

  renderStoreTabs();
  renderSettlementList();
  renderWeekSelect();
  renderWeeklySummary();
  renderContributionGraph();
});

settlementDateEl.value = todayISO();
selectedMonth = monthISO();
monthPickerEl.value = selectedMonth;
updateEntryTotalHint();
