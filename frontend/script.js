// Backend API URL
const API_URL = 'http://localhost:3000/api';

// Global variables
let students = [];
let attendanceRecords = [];
let attendanceChart = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  setTodayDate();
  fetchStudents();
  fetchAttendanceData();
});

// Fetch students
function fetchStudents() {
  fetch(`${API_URL}/students`)
    .then(res => res.json())
    .then(data => {
      students = data;
      renderStudents();
    });
}

// Fetch attendance
function fetchAttendanceData() {
  fetch(`${API_URL}/attendance`)
    .then(res => res.json())
    .then(data => {
      attendanceRecords = data;

      updateStats();
      displayTodaysAttendance();
    });
}

// Set today + listen to date change
function setTodayDate() {
  const dateInput = document.getElementById('attendance-date');
  const today = new Date().toISOString().split('T')[0];
  dateInput.value = today;

  dateInput.addEventListener('change', () => {
    updateStats();
    displayTodaysAttendance();
  });
}

// Render students
function renderStudents() {
  const container = document.getElementById('students-list');
  container.innerHTML = '';

  students.forEach(student => {
    const div = document.createElement('div');
    div.className = 'student-card';

    div.innerHTML = `
      <div>
        <b>${student.name}</b><br/>
        ID: ${student.id}
      </div>
      <div>
        <button onclick="markAttendance('${student.id}','Present')">Present</button>
        <button onclick="markAttendance('${student.id}','Absent')">Absent</button>
      </div>
    `;

    container.appendChild(div);
  });
}

// Mark attendance
function markAttendance(studentId, status) {
  const date = document.getElementById('attendance-date').value;

  fetch(`${API_URL}/attendance`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ studentId, status, date })
  })
  .then(() => fetchAttendanceData());
}

// 🔥 FIXED: Stats now use selected date properly
function updateStats() {
  const selectedDate = document.getElementById('attendance-date').value;

  const filtered = attendanceRecords.filter(r => r.date === selectedDate);

  const statsList = document.getElementById('stats-list');
  statsList.innerHTML = '';

  let totalPresent = 0;
  let totalAbsent = 0;

  students.forEach(student => {
    const records = filtered.filter(r => r.studentId === student.id);

    const present = records.filter(r => r.status === 'Present').length;
    const total = records.length;
    const percent = total ? Math.round((present / total) * 100) : 0;

    if (present) totalPresent++;
    if (total && present === 0) totalAbsent++;

    const isLow = percent < 75 && total > 0;

    const div = document.createElement('div');
    div.className = isLow ? 'stat-card at-risk' : 'stat-card';

    div.innerHTML = `
      <b>${student.name}</b> 
      ${isLow ? '⚠️ At Risk' : ''}
      <br/>
      ${percent}%
    `;

    statsList.appendChild(div);
  });

  document.getElementById('total-present').textContent = totalPresent;
  document.getElementById('total-absent').textContent = totalAbsent;

  renderChart();
}

// 🔥 FIXED: Chart uses filtered data
function renderChart() {
  const selectedDate = document.getElementById('attendance-date').value;
  const filtered = attendanceRecords.filter(r => r.date === selectedDate);

  const labels = [];
  const data = [];
  const colors = [];

  students.forEach(student => {
    const records = filtered.filter(r => r.studentId === student.id);

    const present = records.filter(r => r.status === 'Present').length;
    const total = records.length;
    const percent = total ? Math.round((present / total) * 100) : 0;

    labels.push(student.name);
    data.push(percent);
    colors.push(percent >= 75 ? '#4caf50' : '#f44336');
  });

  const ctx = document.getElementById('attendanceChart');

  if (attendanceChart) attendanceChart.destroy();

  attendanceChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Attendance %',
        data,
        backgroundColor: colors
      }]
    }
  });
}

// 🔥 FIXED: studentName mapping added
function displayTodaysAttendance() {
  const selectedDate = document.getElementById('attendance-date').value;

  const list = document.getElementById('todays-attendance-list');
  list.innerHTML = '';

  const filtered = attendanceRecords.filter(r => r.date === selectedDate);

  if (filtered.length === 0) {
    list.innerHTML = '<p>No records</p>';
    return;
  }

  filtered.forEach(record => {
    const student = students.find(s => s.id === record.studentId);

    const div = document.createElement('div');
    div.innerHTML = `
      ${student ? student.name : 'Unknown'} 
      (${record.studentId}) - ${record.status}
    `;

    list.appendChild(div);
  });
}