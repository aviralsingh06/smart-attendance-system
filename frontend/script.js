// Backend API URL
const API_URL = 'http://localhost:3000/api';

// Global variables
let students = [];
let attendanceRecords = [];

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  setTodayDate();
  fetchStudents();
  fetchAttendanceData();
  updateStats();
});

// Fetch students from backend
function fetchStudents() {
  fetch(`${API_URL}/students`)
    .then((response) => response.json())
    .then((data) => {
      students = data;
      renderStudents();
    })
    .catch((error) => {
      console.error('Error fetching students:', error);
      alert('Error: Could not connect to backend. Make sure the server is running on http://localhost:3000');
    });
}

// Fetch attendance records from backend
function fetchAttendanceData() {
  fetch(`${API_URL}/attendance`)
    .then((response) => response.json())
    .then((data) => {
      attendanceRecords = data;
      updateStats();
    })
    .catch((error) => {
      console.error('Error fetching attendance:', error);
    });
}

// Set today's date as default
function setTodayDate() {
  const dateInput = document.getElementById('attendance-date');
  const today = new Date().toISOString().split('T')[0];
  dateInput.value = today;
}

// Render students list
function renderStudents() {
  const studentsList = document.getElementById('students-list');
  studentsList.innerHTML = '';

  students.forEach((student) => {
    const studentCard = document.createElement('div');
    studentCard.className = 'student-card';
    studentCard.innerHTML = `
      <div class="student-info">
        <div class="student-name">${student.name}</div>
        <div class="student-id">ID: ${student.id}</div>
      </div>
      <div class="student-actions">
        <button class="btn-present" onclick="markAttendance('${student.id}', 'Present')">Present</button>
        <button class="btn-absent" onclick="markAttendance('${student.id}', 'Absent')">Absent</button>
      </div>
    `;
    studentsList.appendChild(studentCard);
  });
}

// Mark attendance for a student
function markAttendance(studentId, status) {
  const dateInput = document.getElementById('attendance-date');
  const date = dateInput.value;

  if (!date) {
    alert('Please select a date.');
    return;
  }

  const attendanceData = {
    studentId,
    status,
    date
  };

  fetch(`${API_URL}/attendance`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(attendanceData)
  })
    .then((response) => response.json())
    .then(() => {
      const student = students.find((s) => s.id === studentId);
      const studentName = student ? student.name : 'Unknown';

      alert(`✓ ${studentName} marked as ${status} on ${date}`);

      fetchAttendanceData();
    })
    .catch((error) => {
      console.error('Error marking attendance:', error);
    });
}

// Fetch and display stats
function updateStats() {
  fetch(`${API_URL}/attendance/percentages`)
    .then((response) => response.json())
    .then((stats) => {
      const statsList = document.getElementById('stats-list');
      statsList.innerHTML = '';

      let totalPresent = 0;
      let totalAbsent = 0;

      stats.forEach((stat) => {
        const todayRecord = attendanceRecords.find(
          (record) =>
            record.studentId === stat.studentId &&
            record.date === document.getElementById('attendance-date').value
        );

        if (todayRecord) {
          if (todayRecord.status === 'Present') totalPresent++;
          else totalAbsent++;
        }

        const percentageClass =
          stat.percentage >= 75 && stat.totalDays > 0
            ? 'percentage-high'
            : 'percentage-low';

        const statCard = document.createElement('div');
        statCard.className = 'stat-card';
        statCard.innerHTML = `
          <div class="stat-header">
            <div class="stat-name">${stat.name}</div>
            <div class="stat-percentage ${percentageClass}">
              ${stat.percentage}%
              ${stat.percentage < 75 && stat.totalDays > 0 ? ' ⚠️' : ''}
            </div>
          </div>
          <div class="stat-details">
            <div class="stat-item"><strong>Present:</strong> ${stat.presentDays}</div>
            <div class="stat-item"><strong>Absent:</strong> ${stat.absentDays}</div>
            <div class="stat-item"><strong>Total:</strong> ${stat.totalDays}</div>
          </div>
        `;
        statsList.appendChild(statCard);
      });

      document.getElementById('total-present').textContent = totalPresent;
      document.getElementById('total-absent').textContent = totalAbsent;
    })
    .catch((error) => {
      console.error('Error fetching stats:', error);
    });
}