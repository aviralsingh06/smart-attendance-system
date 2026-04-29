const API_URL = 'http://localhost:3000/api';

let students = [];
let attendanceRecords = [];
let attendanceChart = null;

document.addEventListener('DOMContentLoaded', () => {
  setTodayDate();
  fetchStudents();
  fetchAttendanceData();
});

function fetchStudents() {
  fetch(`${API_URL}/students`)
    .then(res => res.json())
    .then(data => {
      students = data;
      renderStudents();
    });
}

function fetchAttendanceData() {
  fetch(`${API_URL}/attendance`)
    .then(res => res.json())
    .then(data => {
      attendanceRecords = data;
      updateStats();
      displayTodaysAttendance();
    });
}

function setTodayDate() {
  const dateInput = document.getElementById('attendance-date');
  const today = new Date().toISOString().split('T')[0];
  dateInput.value = today;

  dateInput.addEventListener('change', () => {
    updateStats();
    displayTodaysAttendance();
  });
}

function renderStudents() {
  const container = document.getElementById('students-list');
  container.innerHTML = '';

  students.forEach(student => {
    container.innerHTML += `
      <p>
        ${student.name}
        <button onclick="markAttendance('${student.id}','Present')">Present</button>
        <button onclick="markAttendance('${student.id}','Absent')">Absent</button>
      </p>
    `;
  });
}

function markAttendance(studentId, status) {
  const date = document.getElementById('attendance-date').value;

  fetch(`${API_URL}/attendance`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ studentId, status, date })
  })
  .then(() => fetchAttendanceData());
}

// ✅ FIXED STATS FUNCTION
function updateStats() {
  const selectedDate = document.getElementById('attendance-date').value;
  const filtered = attendanceRecords.filter(r => r.date === selectedDate);

  const statsList = document.getElementById('stats-list');
  statsList.innerHTML = '';

  let totalPresent = 0;
  let totalAbsent = 0;

  students.forEach(student => {
    const record = filtered.find(r => r.studentId === student.id);

    let percent = 0;
    let statusText = "Not Marked";

    if (record) {
      if (record.status === 'Present') {
        percent = 100;
        totalPresent++;
        statusText = "Present";
      } else {
        percent = 0;
        totalAbsent++;
        statusText = "Absent";
      }
    } else {
      totalAbsent++; // treat not marked as absent
    }

    const isLow = percent < 75;

    const div = document.createElement('div');
    div.className = isLow ? 'stat-card at-risk' : 'stat-card';

    div.innerHTML = `
      <b>${student.name}</b>
      ${isLow ? ' ⚠️ At Risk' : ''}
      <br/>
      Status: ${statusText}
      <br/>
      ${percent}%
    `;

    statsList.appendChild(div);
  });

  document.getElementById('total-present').textContent = totalPresent;
  document.getElementById('total-absent').textContent = totalAbsent;

  renderChart();
}

// ✅ CHART WORKING WITH NEW LOGIC
function renderChart() {
  const selectedDate = document.getElementById('attendance-date').value;
  const filtered = attendanceRecords.filter(r => r.date === selectedDate);

  const labels = [];
  const data = [];
  const colors = [];

  students.forEach(student => {
    const record = filtered.find(r => r.studentId === student.id);

    let percent = 0;

    if (record) {
      percent = record.status === 'Present' ? 100 : 0;
    }

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

// ADD STUDENT
function addStudent() {
  const id = document.getElementById('new-student-id').value.trim();
  const name = document.getElementById('new-student-name').value.trim();

  if (!id || !name) {
    alert("Enter ID and Name");
    return;
  }

  fetch(`${API_URL}/students`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ id, name })
  })
  .then(() => {
    fetchStudents();
  });
}

// TODAY'S ATTENDANCE
function displayTodaysAttendance() {
  const selectedDate = document.getElementById('attendance-date').value;
  const list = document.getElementById('todays-attendance-list');

  const filtered = attendanceRecords.filter(r => r.date === selectedDate);

  if (filtered.length === 0) {
    list.innerHTML = 'No records';
    return;
  }

  list.innerHTML = filtered.map(r =>
    `${r.studentName} - ${r.status}`
  ).join('<br>');
}

// SHARE ABSENT STUDENTS
function shareReport() {
  const selectedDate = document.getElementById('attendance-date').value;
  const filtered = attendanceRecords.filter(r => r.date === selectedDate);

  let report = `Absent Students (${selectedDate}):\n\n`;

  let hasAbsent = false;

  students.forEach(student => {
    const record = filtered.find(r => r.studentId === student.id);

    if (!record || record.status === 'Absent') {
      report += `${student.name}\n`;
      hasAbsent = true;
    }
  });

  if (!hasAbsent) {
    alert("No absent students");
    return;
  }

  navigator.clipboard.writeText(report);

  const url = `https://wa.me/?text=${encodeURIComponent(report)}`;
  window.open(url, "_blank");
}