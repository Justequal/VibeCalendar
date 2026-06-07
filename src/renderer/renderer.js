const monthYearElement = document.getElementById('month-year');
const calendarGrid = document.getElementById('calendar-grid');
const weekdaysContainer = document.getElementById('weekdays-container');
const prevBtn = document.getElementById('prev-month');
const nextBtn = document.getElementById('next-month');
const closeBtn = document.getElementById('close-btn');
const clockElement = document.getElementById('clock');
const goTodayBtn = document.getElementById('go-today-btn');
const toggleWeekBtn = document.getElementById('toggle-week-btn');

let currentDate = new Date();
let startOnMonday = false;

function renderWeekdays() {
  weekdaysContainer.innerHTML = '';
  const days = startOnMonday 
    ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  days.forEach(day => {
    const div = document.createElement('div');
    div.textContent = day;
    weekdaysContainer.appendChild(div);
  });
  toggleWeekBtn.textContent = startOnMonday ? '1st: Mon' : '1st: Sun';
}

function createDayElement(year, month, dayNum, typeClass, todayDate) {
  let y = year;
  let m = month;
  if (m < 0) { m = 11; y--; }
  if (m > 11) { m = 0; y++; }
  
  const dateObj = new Date(y, m, dayNum);
  const dayOfWeek = dateObj.getDay(); // 0 is Sun, 6 is Sat
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  
  const dayDiv = document.createElement('div');
  dayDiv.classList.add('day');
  if (typeClass !== 'current-month') {
    dayDiv.classList.add('off-month');
  }

  const dateNumEl = document.createElement('span');
  dateNumEl.classList.add('date-num');
  dateNumEl.textContent = dayNum;
  dayDiv.appendChild(dateNumEl);

  const monthStr = String(m + 1).padStart(2, '0');
  const dayStr = String(dayNum).padStart(2, '0');
  const dateKey = `${y}-${monthStr}-${dayStr}`;

  // Get cached holidays for the year of this specific date
  const holidays = window.holidayManager.cache[y];
  const holidayData = holidays && holidays[dateKey];
  let isWorkDay = !isWeekend;

  if (holidayData) {
    const holiSpan = document.createElement('span');
    if (holidayData.isHoliday) {
      isWorkDay = false;
      holiSpan.classList.add('holiday-text');
      holiSpan.textContent = holidayData.name || '休';
    } else {
      isWorkDay = true;
      holiSpan.classList.add('work-text');
      holiSpan.textContent = '班';
    }
    dayDiv.appendChild(holiSpan);
  }

  if (isWorkDay) {
    dayDiv.classList.add('is-workday');
  } else {
    dayDiv.classList.add('is-holiday');
  }

  // Check if it's today
  if (y === todayDate.getFullYear() && m === todayDate.getMonth() && dayNum === todayDate.getDate()) {
    dayDiv.classList.add('today');
  }

  return dayDiv;
}

async function renderCalendar() {
  calendarGrid.innerHTML = '';
  renderWeekdays();
  
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Fetch current year, and adjacent years to cover prev/next month overflow
  await window.holidayManager.fetchHolidays(year);
  if (month === 0) await window.holidayManager.fetchHolidays(year - 1);
  if (month === 11) await window.holidayManager.fetchHolidays(year + 1);

  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  monthYearElement.textContent = `${monthNames[month]} ${year}`;

  let emptySlots = firstDayOfMonth;
  if (startOnMonday) {
    emptySlots = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
  }

  const today = new Date();

  // Prev month days
  for (let i = emptySlots - 1; i >= 0; i--) {
    const dayNum = daysInPrevMonth - i;
    const el = createDayElement(year, month - 1, dayNum, 'prev-month', today);
    calendarGrid.appendChild(el);
  }

  // Current month days
  for (let i = 1; i <= daysInMonth; i++) {
    const el = createDayElement(year, month, i, 'current-month', today);
    calendarGrid.appendChild(el);
  }

  // Next month days (fill exactly 42 slots = 6 rows)
  const totalCellsFilled = emptySlots + daysInMonth;
  const remainingCells = 42 - totalCellsFilled;
  for (let i = 1; i <= remainingCells; i++) {
    const el = createDayElement(year, month + 1, i, 'next-month', today);
    calendarGrid.appendChild(el);
  }
}

// Clock logic
function updateClock() {
  const now = new Date();
  clockElement.textContent = now.toLocaleTimeString('en-US', { hour12: false });
}
setInterval(updateClock, 1000);
updateClock();

// Event Listeners
toggleWeekBtn.addEventListener('click', () => {
  startOnMonday = !startOnMonday;
  renderCalendar();
});

goTodayBtn.addEventListener('click', () => {
  currentDate = new Date();
  renderCalendar();
});

function goPrevMonth() {
  currentDate.setMonth(currentDate.getMonth() - 1);
  renderCalendar();
}
function goNextMonth() {
  currentDate.setMonth(currentDate.getMonth() + 1);
  renderCalendar();
}

prevBtn.addEventListener('click', goPrevMonth);
nextBtn.addEventListener('click', goNextMonth);

// Mouse wheel debounce
let scrollTimeout = null;
document.getElementById('app-container').addEventListener('wheel', (e) => {
  if (scrollTimeout) return;
  
  if (e.deltaY > 0) goNextMonth(); // scroll down -> next
  else if (e.deltaY < 0) goPrevMonth(); // scroll up -> prev

  scrollTimeout = setTimeout(() => { scrollTimeout = null; }, 200);
});

closeBtn.addEventListener('click', () => window.close());

// Initial render
renderCalendar();
