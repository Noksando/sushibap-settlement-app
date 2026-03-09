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

const expenseForm = document.getElementById("expenseForm");
const expenseDateEl = document.getElementById("expenseDate");
const expenseAmountEl = document.getElementById("expenseAmount");
const expenseNoteEl = document.getElementById("expenseNote");
const expenseDayTotalEl = document.getElementById("expenseDayTotal");
const expenseListEl = document.getElementById("expenseList");

const fixedCostForm = document.getElementById("fixedCostForm");
const fixedMonthEl = document.getElementById("fixedMonth");
const salaryAmountEl = document.getElementById("salaryAmount");
const rentAmountEl = document.getElementById("rentAmount");
const fixedMonthTotalEl = document.getElementById("fixedMonthTotal");
const fixedCostListEl = document.getElementById("fixedCostList");

const weekSelectEl = document.getElementById("weekSelect");
const weeklyCardsEl = document.getElementById("weeklyCards");
const weeklyTableBodyEl = document.getElementById("weeklyTableBody");
const monthPickerEl = document.getElementById("monthPicker");
const contributionWrapEl = document.getElementById("contributionWrap");

let currentState = { settlements: [], dailyExpenses: [], monthlyFixedCosts: [] };
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

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
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

function getDailyExpenses() {
  return Array.isArray(currentState.dailyExpenses) ? currentState.dailyExpenses : [];
}

function getMonthlyFixedCosts() {
  return Array.isArray(currentState.monthlyFixedCosts) ? currentState.monthlyFixedCosts : [];
}

function getFixedByMonth(storeName, month) {
  return (
    getMonthlyFixedCosts().find((entry) => entry.storeName === storeName && entry.month === month) || {
      salary: 0,
      rent: 0
    }
  );
}

function salesTotal(entry) {
  return (entry.card || 0) + (entry.cash || 0) + (entry.delivery || 0);
}

function dailyExpenseForDate(storeName, date) {
  return getDailyExpenses()
    .filter((entry) => entry.storeName === storeName && entry.date === date)
    .reduce((sum, entry) => sum + entry.amount, 0);
}

function fixedPerDay(storeName, date) {
  const month = String(date).slice(0, 7);
  const fixed = getFixedByMonth(storeName, month);
  const [year, monthNum] = month.split("-").map(Number);
  if (!year || !monthNum) {
    return 0;
  }
  const perMonth = (fixed.salary || 0) + (fixed.rent || 0);
  return perMonth / daysInMonth(year, monthNum - 1);
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
      renderExpenseList();
      renderFixedCostList();
      updateEntryTotalHint();
      renderExpenseDayTotal();
      renderFixedMonthTotal();
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
    const sales = salesTotal(entry);
    const dailyExpense = dailyExpenseForDate(entry.storeName, entry.date);
    const fixedDaily = fixedPerDay(entry.storeName, entry.date);
    const net = sales - dailyExpense - fixedDaily;
    const li = document.createElement("li");
    li.className = "settlement-item";
    li.innerHTML = `
      <div class="settlement-top">
        <strong>${formatDateKOR(entry.date)}</strong>
        <span class="settlement-total">순이익 ${formatEUR(net)}</span>
      </div>
      <div class="settlement-grid">
        <span>카드 ${formatEUR(entry.card)}</span>
        <span>현금 ${formatEUR(entry.cash)}</span>
        <span>배달 ${formatEUR(entry.delivery)}</span>
        <span>매출 ${formatEUR(sales)}</span>
        <span>재료비 ${formatEUR(dailyExpense)}</span>
        <span>고정비(일할) ${formatEUR(fixedDaily)}</span>
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

function renderExpenseList() {
  const expenses = getDailyExpenses().filter((entry) => entry.storeName === selectedStore);
  expenseListEl.innerHTML = "";

  if (expenses.length === 0) {
    expenseListEl.innerHTML = "<li>아직 등록된 재료비 지출이 없습니다.</li>";
    return;
  }

  expenses.slice(0, 20).forEach((entry) => {
    const li = document.createElement("li");
    li.className = "expense-item";
    li.innerHTML = `
      <div class="settlement-top">
        <strong>${formatDateKOR(entry.date)}</strong>
        <span class="settlement-total">${formatEUR(entry.amount)}</span>
      </div>
      <div class="settlement-grid">
        <span>${entry.note || "메모 없음"}</span>
      </div>
      <button class="delete-btn">삭제</button>
    `;
    li.querySelector(".delete-btn").addEventListener("click", () => {
      const ok = window.confirm("이 재료비 지출을 삭제할까요?");
      if (!ok) {
        return;
      }
      socket.emit("expense:remove", { id: entry.id });
    });
    expenseListEl.appendChild(li);
  });
}

function renderFixedCostList() {
  const fixedCosts = getMonthlyFixedCosts().filter((entry) => entry.storeName === selectedStore);
  fixedCostListEl.innerHTML = "";

  if (fixedCosts.length === 0) {
    fixedCostListEl.innerHTML = "<li>아직 등록된 월 고정비가 없습니다.</li>";
    return;
  }

  fixedCosts.slice(0, 12).forEach((entry) => {
    const total = (entry.salary || 0) + (entry.rent || 0);
    const li = document.createElement("li");
    li.className = "expense-item";
    li.innerHTML = `
      <div class="settlement-top">
        <strong>${entry.month}</strong>
        <span class="settlement-total">총 ${formatEUR(total)}</span>
      </div>
      <div class="settlement-grid">
        <span>월급 ${formatEUR(entry.salary)}</span>
        <span>월세 ${formatEUR(entry.rent)}</span>
      </div>
      <button class="delete-btn">삭제</button>
    `;
    li.querySelector(".delete-btn").addEventListener("click", () => {
      const ok = window.confirm("이 월 고정비를 삭제할까요?");
      if (!ok) {
        return;
      }
      socket.emit("fixedCost:remove", { id: entry.id });
    });
    fixedCostListEl.appendChild(li);
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
  getDailyExpenses().forEach((entry) => {
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
    totalsByStore[store] = { card: 0, cash: 0, delivery: 0, dailyExpense: 0, fixedCost: 0 };
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

  getDailyExpenses().forEach((entry) => {
    if (toWeekStartISO(entry.date) !== weekStart) {
      return;
    }
    const target = totalsByStore[entry.storeName];
    if (!target) {
      return;
    }
    target.dailyExpense += entry.amount;
  });

  FINANCE_STORES.forEach((store) => {
    for (let offset = 0; offset < 7; offset += 1) {
      const day = addDaysISO(weekStart, offset);
      totalsByStore[store].fixedCost += fixedPerDay(store, day);
    }
  });

  const all = { card: 0, cash: 0, delivery: 0, dailyExpense: 0, fixedCost: 0 };
  FINANCE_STORES.forEach((store) => {
    all.card += totalsByStore[store].card;
    all.cash += totalsByStore[store].cash;
    all.delivery += totalsByStore[store].delivery;
    all.dailyExpense += totalsByStore[store].dailyExpense;
    all.fixedCost += totalsByStore[store].fixedCost;
  });

  return { totalsByStore, all };
}

function renderWeeklySummary() {
  const { totalsByStore, all } = calcWeekSummary(selectedWeekStart);
  const allSales = all.card + all.cash + all.delivery;
  const allCost = all.dailyExpense + all.fixedCost;
  const allNet = allSales - allCost;

  weeklyCardsEl.innerHTML = `
    <div class="summary-pill">전체 매출 ${formatEUR(allSales)}</div>
    <div class="summary-pill">재료비 ${formatEUR(all.dailyExpense)}</div>
    <div class="summary-pill">고정비(일할) ${formatEUR(all.fixedCost)}</div>
    <div class="summary-pill">전체 순이익 ${formatEUR(allNet)}</div>
  `;

  weeklyTableBodyEl.innerHTML = "";

  FINANCE_STORES.forEach((store) => {
    const data = totalsByStore[store];
    const sales = data.card + data.cash + data.delivery;
    const cost = data.dailyExpense + data.fixedCost;
    const net = sales - cost;
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${store}</td>
      <td>${formatEUR(data.card)}</td>
      <td>${formatEUR(data.cash)}</td>
      <td>${formatEUR(data.delivery)}</td>
      <td>${formatEUR(sales)}</td>
      <td>${formatEUR(net)} <small>(재료 ${formatEUR(data.dailyExpense)} + 고정 ${formatEUR(data.fixedCost)})</small></td>
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
    <td>${formatEUR(allSales)}</td>
    <td>${formatEUR(allNet)} <small>(재료 ${formatEUR(all.dailyExpense)} + 고정 ${formatEUR(all.fixedCost)})</small></td>
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
    map[entry.storeName][entry.date] += salesTotal(entry);
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

function renderExpenseDayTotal() {
  const date = expenseDateEl.value || todayISO();
  const cost = dailyExpenseForDate(selectedStore, date);
  expenseDayTotalEl.textContent = `${selectedStore} ${formatDateKOR(date)} 재료비 합계: ${formatEUR(cost)}`;
}

function renderFixedMonthTotal() {
  const month = fixedMonthEl.value || monthISO();
  const fixed = getFixedByMonth(selectedStore, month);
  const total = (fixed.salary || 0) + (fixed.rent || 0);
  fixedMonthTotalEl.textContent = `${selectedStore} ${month} 고정비: 월급 ${formatEUR(
    fixed.salary || 0
  )} + 월세 ${formatEUR(fixed.rent || 0)} = ${formatEUR(total)}`;
}

function updateEntryTotalHint() {
  const card = Number(cardAmountEl.value) || 0;
  const cash = Number(cashAmountEl.value) || 0;
  const delivery = Number(deliveryAmountEl.value) || 0;
  const sales = card + cash + delivery;
  const date = settlementDateEl.value || todayISO();
  const dailyExpense = dailyExpenseForDate(selectedStore, date);
  const fixedDaily = fixedPerDay(selectedStore, date);
  const net = sales - dailyExpense - fixedDaily;
  entryTotalEl.textContent = `입력 매출 ${formatEUR(sales)} | 재료비 ${formatEUR(
    dailyExpense
  )} | 고정비(일할) ${formatEUR(fixedDaily)} | 예상 순이익 ${formatEUR(net)}`;
}

[cardAmountEl, cashAmountEl, deliveryAmountEl, settlementDateEl].forEach((input) => {
  input.addEventListener("input", updateEntryTotalHint);
});

[expenseDateEl].forEach((input) => {
  input.addEventListener("input", renderExpenseDayTotal);
});

[fixedMonthEl, salaryAmountEl, rentAmountEl].forEach((input) => {
  input.addEventListener("input", renderFixedMonthTotal);
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

expenseForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const amount = safeAmount(expenseAmountEl.value);

  if (amount === null) {
    window.alert("재료비 금액은 0 이상의 숫자로 입력해 주세요.");
    return;
  }

  socket.emit("expense:add", {
    storeName: selectedStore,
    date: expenseDateEl.value,
    amount,
    note: expenseNoteEl.value.trim()
  });

  expenseForm.reset();
  expenseDateEl.value = todayISO();
  renderExpenseDayTotal();
});

fixedCostForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const salary = safeAmount(salaryAmountEl.value);
  const rent = safeAmount(rentAmountEl.value);

  if (salary === null || rent === null) {
    window.alert("월급/월세는 0 이상의 숫자로 입력해 주세요.");
    return;
  }

  socket.emit("fixedCost:set", {
    storeName: selectedStore,
    month: fixedMonthEl.value,
    salary,
    rent
  });

  fixedCostForm.reset();
  fixedMonthEl.value = monthISO();
  renderFixedMonthTotal();
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
  renderExpenseList();
  renderFixedCostList();
  renderWeekSelect();
  renderWeeklySummary();
  renderContributionGraph();
  updateEntryTotalHint();
  renderExpenseDayTotal();
  renderFixedMonthTotal();
});

settlementDateEl.value = todayISO();
expenseDateEl.value = todayISO();
fixedMonthEl.value = monthISO();
selectedMonth = monthISO();
monthPickerEl.value = selectedMonth;
updateEntryTotalHint();
renderExpenseDayTotal();
renderFixedMonthTotal();
