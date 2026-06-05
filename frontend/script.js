/* ===== Attendance Tracker — Frontend ===== */

const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3000/api'
  : '/api';

const ATTENDANCE_THRESHOLD = 75;
const FACULTY_PHONE = '919876543210';

let students = [];
let attendanceRecords = [];
let analyticsData = null;
let currentTeacher = null;
let charts = {};
let editingStudentId = null;
let attendancePeriod = 'daily';

const viewTitles = {
  dashboard: { title: 'Dashboard', subtitle: 'Overview of your class attendance' },
  students: { title: 'Students', subtitle: 'Manage your student roster' },
  attendance: { title: 'Mark Attendance', subtitle: 'Record daily presence' },
  analytics: { title: 'Analytics', subtitle: 'Deep insights into patterns' },
  alerts: { title: 'Alerts', subtitle: 'Low attendance warnings' },
  ai: { title: 'AI Analysis', subtitle: 'AI-powered risk detection' }
};

/* ===== Init ===== */

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initAuth();
  initNavigation();
  initSidebar();
  initStudentForm();
  initAttendance();
  initAnalytics();
  initModals();
  initQuickActions();
  initAI();

  checkSession();
});

/* ===== API Helper ===== */

async function api(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401 && !endpoint.includes('/login') && !endpoint.includes('/signup')) {
      logout();
    }
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

/* ===== Theme ===== */

function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);

  document.getElementById('themeToggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeIcon(next);
    refreshCharts();
  });
}

function updateThemeIcon(theme) {
  const icon = document.querySelector('#themeToggle i');
  icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

function getChartColors() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    text: isDark ? '#94a3b8' : '#475569',
    grid: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'
  };
}

/* ===== Auth ===== */

function initAuth() {
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`${tab.dataset.tab}Form`).classList.add('active');
    });
  });

  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  document.getElementById('signupForm').addEventListener('submit', handleSignup);
  document.getElementById('logoutBtn').addEventListener('click', logout);
}

async function handleLogin(e) {
  e.preventDefault();
  const errorEl = document.getElementById('loginError');
  errorEl.textContent = '';

  try {
    const data = await api('/login', {
      method: 'POST',
      body: JSON.stringify({
        email: document.getElementById('loginEmail').value.trim(),
        password: document.getElementById('loginPassword').value
      })
    });
    setSession(data.token, data.teacher);
    showToast('Login successful!', 'success');
  } catch (err) {
    errorEl.textContent = err.message;
  }
}

async function handleSignup(e) {
  e.preventDefault();
  const errorEl = document.getElementById('signupError');
  errorEl.textContent = '';

  const password = document.getElementById('signupPassword').value;
  const confirm = document.getElementById('signupConfirm').value;

  if (password !== confirm) {
    errorEl.textContent = 'Passwords do not match';
    return;
  }
  if (password.length < 6) {
    errorEl.textContent = 'Password must be at least 6 characters';
    return;
  }

  try {
    const data = await api('/signup', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('signupName').value.trim(),
        email: document.getElementById('signupEmail').value.trim(),
        password
      })
    });
    setSession(data.token, data.teacher);
    showToast('Account created successfully!', 'success');
  } catch (err) {
    errorEl.textContent = err.message;
  }
}

function setSession(token, teacher) {
  localStorage.setItem('token', token);
  localStorage.setItem('teacher', JSON.stringify(teacher));
  currentTeacher = teacher;
  showApp();
}

function checkSession() {
  const token = localStorage.getItem('token');
  const teacher = localStorage.getItem('teacher');
  if (token && teacher) {
    currentTeacher = JSON.parse(teacher);
    showApp();
  }
}

function showApp() {
  document.getElementById('authModal').style.display = 'none';
  document.getElementById('mainApp').style.display = 'flex';
  document.getElementById('teacherInfo').innerHTML = `
    <strong>${currentTeacher.name}</strong>
    <span>${currentTeacher.email}</span>
  `;
  loadAllData();
  checkAttendanceReminder();
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('teacher');
  currentTeacher = null;
  students = [];
  attendanceRecords = [];
  analyticsData = null;
  destroyAllCharts();
  document.getElementById('mainApp').style.display = 'none';
  document.getElementById('authModal').style.display = 'flex';
  document.getElementById('loginForm').reset();
  showToast('Logged out successfully', 'info');
}

/* ===== Navigation ===== */

function initNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => showView(item.dataset.view));
  });

  document.getElementById('notificationBtn').addEventListener('click', () => {
    showView('alerts');
  });
}

function showView(view) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`${view}View`).classList.add('active');

  const info = viewTitles[view] || { title: view, subtitle: '' };
  document.getElementById('viewTitle').textContent = info.title;
  document.getElementById('viewSubtitle').textContent = info.subtitle;

  closeSidebar();

  if (view === 'analytics') renderAnalyticsView();
  if (view === 'alerts') renderAlerts();
  if (view === 'attendance') renderAttendanceView();
}

/* ===== Sidebar ===== */

function initSidebar() {
  document.getElementById('sidebarToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebarOverlay').classList.add('active');
  });

  document.getElementById('sidebarClose').addEventListener('click', closeSidebar);
  document.getElementById('sidebarOverlay').addEventListener('click', closeSidebar);
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('active');
}

/* ===== Data Loading ===== */

async function loadAllData() {
  try {
    const [studentsData, attendanceData, analytics] = await Promise.all([
      api('/students'),
      api('/attendance'),
      api('/analytics')
    ]);
    students = studentsData;
    attendanceRecords = attendanceData;
    analyticsData = analytics;
    updateDashboard();
    renderStudentsTable();
    populateClassFilter();
    updateNotificationBadges();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/* ===== Dashboard ===== */

function updateDashboard() {
  if (!analyticsData) return;

  document.getElementById('totalStudents').textContent = analyticsData.totalStudents;
  document.getElementById('presentToday').textContent = analyticsData.presentToday;
  document.getElementById('absentToday').textContent = analyticsData.absentToday;
  document.getElementById('avgAttendance').textContent = `${analyticsData.averageAttendance}%`;
  document.getElementById('atRiskCount').textContent = analyticsData.atRiskCount;

  renderRiskStudents();
  renderTrendChart();
  renderDistributionChart();
}

function renderRiskStudents() {
  const container = document.getElementById('riskStudentsList');
  const atRisk = analyticsData?.atRiskStudents || [];

  document.getElementById('riskCountBadge').textContent = `${atRisk.length} student${atRisk.length !== 1 ? 's' : ''}`;

  if (atRisk.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding:24px"><i class="fas fa-check-circle" style="color:var(--success)"></i><p>All students are above the attendance threshold!</p></div>`;
    return;
  }

  container.innerHTML = atRisk.map(s => `
    <div class="risk-student-item">
      <div class="risk-student-info">
        <h4>${esc(s.fullName)} <span class="badge badge-danger"><i class="fas fa-exclamation-triangle"></i> At Risk</span></h4>
        <p>Roll: ${esc(s.rollNumber)} · ${esc(s.classSection)} · ${(s.attendancePercentage || 0).toFixed(1)}% attendance</p>
      </div>
      <div class="risk-student-actions">
        ${s.parentPhone ? `<button class="btn-whatsapp btn-sm" onclick="sendWhatsAppAlert('${s.id}', 'parent')"><i class="fab fa-whatsapp"></i> Alert Parent</button>` : ''}
        <button class="btn-whatsapp btn-sm" onclick="sendWhatsAppAlert('${s.id}', 'faculty')"><i class="fab fa-whatsapp"></i> Alert Faculty</button>
      </div>
    </div>
  `).join('');
}

function updateNotificationBadges() {
  const count = analyticsData?.atRiskCount || 0;
  document.getElementById('notificationBadge').textContent = count;
  document.getElementById('navAlertBadge').textContent = count;
  document.getElementById('notificationBadge').style.display = count > 0 ? 'flex' : 'none';
  document.getElementById('navAlertBadge').style.display = count > 0 ? 'inline' : 'none';
}

/* ===== Charts ===== */

function destroyChart(name) {
  if (charts[name]) {
    charts[name].destroy();
    charts[name] = null;
  }
}

function destroyAllCharts() {
  Object.keys(charts).forEach(destroyChart);
}

function refreshCharts() {
  renderTrendChart();
  renderDistributionChart();
  if (document.getElementById('analyticsView').classList.contains('active')) {
    renderMonthlyChart();
    renderStudentWiseChart();
  }
}

function renderTrendChart() {
  const canvas = document.getElementById('trendChart');
  if (!canvas || !analyticsData) return;

  destroyChart('trend');
  const colors = getChartColors();
  const trend = analyticsData.dailyTrend || [];

  charts.trend = new Chart(canvas, {
    type: 'line',
    data: {
      labels: trend.map(d => formatShortDate(d.date)),
      datasets: [{
        label: 'Attendance %',
        data: trend.map(d => parseFloat(d.percentage)),
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointBackgroundColor: '#6366f1'
      }]
    },
    options: chartOptions(colors)
  });
}

function renderDistributionChart() {
  const canvas = document.getElementById('distributionChart');
  if (!canvas || !analyticsData) return;

  destroyChart('distribution');
  const colors = getChartColors();
  const classData = analyticsData.classBreakdown || [];

  charts.distribution = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: classData.map(c => c.classSection),
      datasets: [{
        data: classData.map(c => parseFloat(c.percentage)),
        backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: colors.text, padding: 16 } }
      }
    }
  });
}

function renderMonthlyChart() {
  const canvas = document.getElementById('monthlyChart');
  if (!canvas || !analyticsData) return;

  destroyChart('monthly');
  const colors = getChartColors();
  const data = analyticsData.monthlyData || [];

  charts.monthly = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: data.map(d => d.month),
      datasets: [{
        label: 'Attendance %',
        data: data.map(d => parseFloat(d.percentage)),
        backgroundColor: data.map(d => parseFloat(d.percentage) >= ATTENDANCE_THRESHOLD ? 'rgba(16,185,129,0.7)' : 'rgba(239,68,68,0.7)'),
        borderRadius: 6
      }]
    },
    options: chartOptions(colors)
  });
}

function renderStudentWiseChart() {
  const canvas = document.getElementById('studentWiseChart');
  if (!canvas || !analyticsData) return;

  destroyChart('studentWise');
  const colors = getChartColors();
  const all = analyticsData.allStudents || [];

  charts.studentWise = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: all.map(s => s.fullName),
      datasets: [{
        label: 'Attendance %',
        data: all.map(s => s.attendancePercentage || 0),
        backgroundColor: all.map(s => (s.attendancePercentage || 0) >= ATTENDANCE_THRESHOLD ? 'rgba(16,185,129,0.7)' : 'rgba(239,68,68,0.7)'),
        borderRadius: 4
      }]
    },
    options: {
      ...chartOptions(colors),
      indexAxis: 'y'
    }
  });
}

function chartOptions(colors) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: colors.grid }, ticks: { color: colors.text } },
      y: {
        grid: { color: colors.grid },
        ticks: { color: colors.text },
        min: 0,
        max: 100
      }
    }
  };
}

/* ===== Students ===== */

function initStudentForm() {
  document.getElementById('toggleStudentFormBtn').addEventListener('click', () => toggleStudentForm());
  document.getElementById('cancelStudentFormBtn').addEventListener('click', () => toggleStudentForm(false));
  document.getElementById('studentForm').addEventListener('submit', handleStudentSubmit);
  document.getElementById('studentSearch').addEventListener('input', renderStudentsTable);
  document.getElementById('classFilter').addEventListener('change', renderStudentsTable);
  document.getElementById('statusFilter').addEventListener('change', renderStudentsTable);
  document.getElementById('exportStudentsExcelBtn').addEventListener('click', exportStudentsExcel);
}

function toggleStudentForm(show) {
  const form = document.getElementById('studentForm');
  const visible = show !== undefined ? show : form.style.display === 'none';

  if (visible) {
    if (!editingStudentId) resetStudentForm();
    form.style.display = 'block';
  } else {
    form.style.display = 'none';
    editingStudentId = null;
    resetStudentForm();
  }
}

function resetStudentForm() {
  document.getElementById('studentForm').reset();
  document.getElementById('studentId').value = '';
  document.getElementById('studentFormTitle').textContent = 'Add New Student';
}

async function handleStudentSubmit(e) {
  e.preventDefault();

  const payload = {
    fullName: document.getElementById('studentName').value.trim(),
    rollNumber: document.getElementById('studentRoll').value.trim(),
    classSection: document.getElementById('studentClass').value.trim(),
    parentName: document.getElementById('studentParentName').value.trim(),
    parentPhone: document.getElementById('studentParentPhone').value.trim(),
    email: document.getElementById('studentEmail').value.trim(),
    notes: document.getElementById('studentNotes').value.trim()
  };

  try {
    if (editingStudentId) {
      await api(`/students/${editingStudentId}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Student updated successfully', 'success');
    } else {
      await api('/students', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Student added successfully', 'success');
    }
    toggleStudentForm(false);
    await loadAllData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function editStudent(id) {
  const student = students.find(s => s.id === id);
  if (!student) return;

  editingStudentId = id;
  document.getElementById('studentFormTitle').textContent = 'Edit Student';
  document.getElementById('studentId').value = id;
  document.getElementById('studentName').value = student.fullName;
  document.getElementById('studentRoll').value = student.rollNumber;
  document.getElementById('studentClass').value = student.classSection;
  document.getElementById('studentParentName').value = student.parentName || '';
  document.getElementById('studentParentPhone').value = student.parentPhone || '';
  document.getElementById('studentEmail').value = student.email || '';
  document.getElementById('studentNotes').value = student.notes || '';
  toggleStudentForm(true);
}

async function deleteStudent(id) {
  const student = students.find(s => s.id === id);
  if (!confirm(`Delete ${student?.fullName || 'this student'}? This cannot be undone.`)) return;

  try {
    await api(`/students/${id}`, { method: 'DELETE' });
    showToast('Student deleted', 'success');
    await loadAllData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function getFilteredStudents() {
  const search = document.getElementById('studentSearch').value.toLowerCase().trim();
  const classFilter = document.getElementById('classFilter').value;
  const statusFilter = document.getElementById('statusFilter').value;

  return students.filter(s => {
    const matchSearch = !search ||
      s.fullName.toLowerCase().includes(search) ||
      s.rollNumber.toLowerCase().includes(search);
    const matchClass = !classFilter || s.classSection === classFilter;
    const pct = s.attendancePercentage || 0;
    const matchStatus = !statusFilter ||
      (statusFilter === 'at-risk' && pct < ATTENDANCE_THRESHOLD) ||
      (statusFilter === 'safe' && pct >= ATTENDANCE_THRESHOLD);
    return matchSearch && matchClass && matchStatus;
  });
}

function renderStudentsTable() {
  const tbody = document.getElementById('studentsTableBody');
  const empty = document.getElementById('studentsEmpty');
  const filtered = getFilteredStudents();

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  tbody.innerHTML = filtered.map(s => {
    const pct = s.attendancePercentage || 0;
    const atRisk = pct < ATTENDANCE_THRESHOLD;
    const progressClass = pct >= ATTENDANCE_THRESHOLD ? 'high' : pct >= 50 ? 'mid' : 'low';

    return `
      <tr>
        <td>${esc(s.rollNumber)}</td>
        <td><strong>${esc(s.fullName)}</strong></td>
        <td>${esc(s.classSection)}</td>
        <td>${esc(s.parentName || '—')}</td>
        <td>${esc(s.parentPhone || '—')}</td>
        <td>
          <div style="min-width:100px">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:0.8rem">
              <span>${pct.toFixed(1)}%</span>
            </div>
            <div class="progress-bar"><div class="progress-fill ${progressClass}" style="width:${pct}%"></div></div>
          </div>
        </td>
        <td>${atRisk
          ? '<span class="badge badge-danger"><i class="fas fa-exclamation-triangle"></i> At Risk</span>'
          : '<span class="badge badge-success"><i class="fas fa-check"></i> Safe</span>'}</td>
        <td>
          <div class="table-actions">
            <button class="btn-edit" onclick="editStudent('${s.id}')" title="Edit"><i class="fas fa-edit"></i></button>
            <button class="btn-delete" onclick="deleteStudent('${s.id}')" title="Delete"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function populateClassFilter() {
  const select = document.getElementById('classFilter');
  const classes = [...new Set(students.map(s => s.classSection))].sort();
  const current = select.value;
  select.innerHTML = '<option value="">All Classes</option>' +
    classes.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  select.value = current;
}

/* ===== Attendance ===== */

function initAttendance() {
  const dateInput = document.getElementById('attendanceDate');
  const today = new Date().toISOString().split('T')[0];
  dateInput.value = today;
  dateInput.addEventListener('change', renderAttendanceView);

  document.getElementById('markAllPresentBtn').addEventListener('click', markAllPresent);

  document.querySelectorAll('.attendance-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.attendance-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      attendancePeriod = btn.dataset.period;
      renderAttendanceView();
    });
  });
}

function renderAttendanceView() {
  document.getElementById('dailyAttendancePanel').style.display = attendancePeriod === 'daily' ? 'block' : 'none';
  document.getElementById('weeklyAttendancePanel').style.display = attendancePeriod === 'weekly' ? 'block' : 'none';
  document.getElementById('monthlyAttendancePanel').style.display = attendancePeriod === 'monthly' ? 'block' : 'none';

  if (attendancePeriod === 'daily') renderDailyAttendance();
  else if (attendancePeriod === 'weekly') renderWeeklyAttendance();
  else renderMonthlyAttendance();
}

function renderDailyAttendance() {
  const date = document.getElementById('attendanceDate').value;
  const dayRecords = attendanceRecords.filter(r => r.date === date);

  let present = 0, absent = 0, unmarked = 0;

  const grid = document.getElementById('attendanceGrid');
  if (students.length === 0) {
    grid.innerHTML = '<div class="empty-state glass-card"><i class="fas fa-users"></i><p>Add students first to mark attendance.</p></div>';
    document.getElementById('attendanceSummary').innerHTML = '';
    return;
  }

  grid.innerHTML = students.map(s => {
    const record = dayRecords.find(r => r.studentId === s.id);
    const status = record?.status || 'unmarked';
    if (status === 'present') present++;
    else if (status === 'absent') absent++;
    else unmarked++;

    return `
      <div class="attendance-card glass-card">
        <div class="attendance-card-info">
          <h4>
            <span class="attendance-status-dot dot-${status}"></span>
            ${esc(s.fullName)}
          </h4>
          <p>Roll: ${esc(s.rollNumber)} · ${esc(s.classSection)}</p>
        </div>
        <div class="attendance-card-actions">
          <button class="btn-present ${status === 'present' ? 'active' : ''}" onclick="markAttendance('${s.id}', 'present')">
            <i class="fas fa-check"></i> Present
          </button>
          <button class="btn-absent ${status === 'absent' ? 'active' : ''}" onclick="markAttendance('${s.id}', 'absent')">
            <i class="fas fa-times"></i> Absent
          </button>
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('attendanceSummary').innerHTML = `
    <div><span>Date:</span> <strong>${formatDate(date)}</strong></div>
    <div><span>Present:</span> <strong style="color:var(--success)">${present}</strong></div>
    <div><span>Absent:</span> <strong style="color:var(--danger)">${absent}</strong></div>
    <div><span>Unmarked:</span> <strong style="color:var(--text-muted)">${unmarked}</strong></div>
  `;
}

async function markAttendance(studentId, status) {
  const date = document.getElementById('attendanceDate').value;
  try {
    await api('/attendance', {
      method: 'POST',
      body: JSON.stringify({ studentId, date, status })
    });
    attendanceRecords = await api('/attendance');
    analyticsData = await api('/analytics');
    students = await api('/students');
    renderDailyAttendance();
    updateDashboard();
    updateNotificationBadges();
    showToast(`Marked ${status}`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function markAllPresent() {
  const date = document.getElementById('attendanceDate').value;
  if (!confirm('Mark all students as present for this date?')) return;

  try {
    for (const s of students) {
      await api('/attendance', {
        method: 'POST',
        body: JSON.stringify({ studentId: s.id, date, status: 'present' })
      });
    }
    await loadAllData();
    renderDailyAttendance();
    showToast('All students marked present', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderWeeklyAttendance() {
  const date = new Date(document.getElementById('attendanceDate').value);
  const startOfWeek = new Date(date);
  startOfWeek.setDate(date.getDate() - date.getDay());

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    days.push(d.toISOString().split('T')[0]);
  }

  document.getElementById('weeklyTableHead').innerHTML = `
    <tr>
      <th>Student</th>
      ${days.map(d => `<th>${formatShortDate(d)}</th>`).join('')}
      <th>Total</th>
    </tr>
  `;

  document.getElementById('weeklyTableBody').innerHTML = students.map(s => {
    let present = 0;
    const cells = days.map(d => {
      const rec = attendanceRecords.find(r => r.studentId === s.id && r.date === d);
      if (rec?.status === 'present') present++;
      const icon = rec?.status === 'present' ? '✅' : rec?.status === 'absent' ? '❌' : '—';
      return `<td style="text-align:center">${icon}</td>`;
    }).join('');

    return `<tr><td><strong>${esc(s.fullName)}</strong></td>${cells}<td><strong>${present}/7</strong></td></tr>`;
  }).join('');
}

function renderMonthlyAttendance() {
  const date = document.getElementById('attendanceDate').value;
  const month = date.substring(0, 7);

  document.getElementById('monthlyTableBody').innerHTML = students.map(s => {
    const records = attendanceRecords.filter(r => r.studentId === s.id && r.date.startsWith(month));
    const present = records.filter(r => r.status === 'present').length;
    const absent = records.filter(r => r.status === 'absent').length;
    const total = records.length;
    const pct = total > 0 ? ((present / total) * 100) : 0;
    const atRisk = pct < ATTENDANCE_THRESHOLD && total > 0;

    return `
      <tr>
        <td><strong>${esc(s.fullName)}</strong></td>
        <td>${present}</td>
        <td>${absent}</td>
        <td>${total}</td>
        <td>${pct.toFixed(1)}%</td>
        <td>${atRisk
          ? '<span class="badge badge-danger">At Risk</span>'
          : total === 0 ? '<span class="badge badge-warning">No Data</span>'
          : '<span class="badge badge-success">Safe</span>'}</td>
      </tr>
    `;
  }).join('');
}

/* ===== Analytics ===== */

function initAnalytics() {
  const today = new Date();
  const monthAgo = new Date(today);
  monthAgo.setMonth(monthAgo.getMonth() - 1);

  document.getElementById('analyticsToDate').value = today.toISOString().split('T')[0];
  document.getElementById('analyticsFromDate').value = monthAgo.toISOString().split('T')[0];
  document.getElementById('filterAnalyticsBtn').addEventListener('click', filterAnalytics);
  document.getElementById('generateReportBtn').addEventListener('click', generateMonthlyReport);
}

async function filterAnalytics() {
  const from = document.getElementById('analyticsFromDate').value;
  const to = document.getElementById('analyticsToDate').value;

  try {
    analyticsData = await api(`/analytics?from=${from}&to=${to}`);
    renderAnalyticsView();
    showToast('Analytics filtered', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderAnalyticsView() {
  if (!analyticsData) return;

  renderMonthlyChart();
  renderStudentWiseChart();
  renderHeatmap();
  renderAnalyticsTable();
}

function renderHeatmap() {
  const grid = document.getElementById('heatmapGrid');
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' });

  document.getElementById('heatmapMonthLabel').textContent = monthLabel;

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let html = dayNames.map(d => `<div class="heatmap-day-label">${d}</div>`).join('');

  const firstDay = new Date(year, month, 1).getDay();
  for (let i = 0; i < firstDay; i++) {
    html += '<div class="heatmap-cell" style="visibility:hidden"></div>';
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayRecords = attendanceRecords.filter(r => r.date === dateStr);
    let heatClass = 'heat-none';
    let title = `${dateStr}: No data`;

    if (dayRecords.length > 0) {
      const present = dayRecords.filter(r => r.status === 'present').length;
      const pct = (present / dayRecords.length) * 100;
      if (pct >= 80) heatClass = 'heat-high';
      else if (pct >= 60) heatClass = 'heat-mid';
      else heatClass = 'heat-low';
      title = `${dateStr}: ${pct.toFixed(0)}% (${present}/${dayRecords.length})`;
    }

    html += `<div class="heatmap-cell ${heatClass}" title="${title}">${day}</div>`;
  }

  grid.innerHTML = html;
}

function renderAnalyticsTable() {
  const tbody = document.getElementById('analyticsTableBody');
  const all = analyticsData?.allStudents || [];

  tbody.innerHTML = all.map(s => {
    const pct = s.attendancePercentage || 0;
    const progressClass = pct >= ATTENDANCE_THRESHOLD ? 'high' : pct >= 50 ? 'mid' : 'low';

    return `
      <tr>
        <td><strong>${esc(s.fullName)}</strong></td>
        <td>${esc(s.classSection)}</td>
        <td>${s.attendance || 0}</td>
        <td>${s.totalDays || 0}</td>
        <td>${pct.toFixed(1)}%</td>
        <td style="min-width:120px"><div class="progress-bar"><div class="progress-fill ${progressClass}" style="width:${pct}%"></div></div></td>
        <td>${pct < ATTENDANCE_THRESHOLD && s.totalDays > 0
          ? '<span class="badge badge-danger">At Risk</span>'
          : s.totalDays === 0
          ? '<span class="badge badge-warning">No Data</span>'
          : '<span class="badge badge-success">Safe</span>'}</td>
      </tr>
    `;
  }).join('');
}

/* ===== Alerts ===== */

function renderAlerts() {
  const container = document.getElementById('alertsList');
  const atRisk = students.filter(s => (s.attendancePercentage || 0) < ATTENDANCE_THRESHOLD && (s.totalDays || 0) > 0);

  if (atRisk.length === 0) {
    container.innerHTML = `<div class="empty-state glass-card"><i class="fas fa-check-circle" style="color:var(--success)"></i><p>No low attendance alerts. All students are doing well!</p></div>`;
    return;
  }

  container.innerHTML = atRisk.map(s => {
    const pct = (s.attendancePercentage || 0).toFixed(1);
    const message = `Dear Parent, your child ${s.fullName} has attendance below 75%. Current attendance is ${pct}%. Please ensure regular attendance to avoid academic issues.`;

    return `
      <div class="alert-card glass-card">
        <div class="alert-card-header">
          <h4>${esc(s.fullName)} <span class="badge badge-danger">At Risk — ${pct}%</span></h4>
        </div>
        <div class="alert-details">
          <div><strong>Roll Number</strong>${esc(s.rollNumber)}</div>
          <div><strong>Class</strong>${esc(s.classSection)}</div>
          <div><strong>Parent</strong>${esc(s.parentName || 'N/A')}</div>
          <div><strong>Phone</strong>${esc(s.parentPhone || 'N/A')}</div>
        </div>
        <div class="alert-message-preview">"${esc(message)}"</div>
        <div class="alert-actions">
          ${s.parentPhone
            ? `<button class="btn-whatsapp" onclick="sendWhatsAppAlert('${s.id}', 'parent')"><i class="fab fa-whatsapp"></i> Send Alert to Parent</button>`
            : '<span class="badge badge-warning">No parent phone</span>'}
          <button class="btn-whatsapp" onclick="sendWhatsAppAlert('${s.id}', 'faculty')"><i class="fab fa-whatsapp"></i> Alert Upper Faculty</button>
        </div>
      </div>
    `;
  }).join('');
}

async function sendWhatsAppAlert(studentId, recipient) {
  const student = students.find(s => s.id === studentId);
  if (!student) return;

  try {
    const phone = recipient === 'faculty' ? FACULTY_PHONE : student.parentPhone;
    if (!phone) {
      showToast('No phone number available', 'warning');
      return;
    }

    const data = await api('/send-whatsapp', {
      method: 'POST',
      body: JSON.stringify({ studentId, parentPhone: phone, recipient })
    });

    window.open(data.url, '_blank');
    showToast(`WhatsApp alert opened for ${recipient}`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/* ===== AI Analysis ===== */

function initAI() {
  document.getElementById('aiAnalysisBtn').addEventListener('click', runAIAnalysis);
}

async function runAIAnalysis() {
  const btn = document.getElementById('aiAnalysisBtn');
  const loading = document.getElementById('aiLoading');
  const result = document.getElementById('aiResult');

  btn.disabled = true;
  loading.style.display = 'block';
  result.style.display = 'none';

  try {
    const data = await api('/ai-analysis', { method: 'POST' });

    const stats = data.statistics;
    result.innerHTML = `
      <div class="ai-stats">
        <div class="ai-stat"><div class="ai-stat-value">${stats.totalStudents}</div><div class="ai-stat-label">Total Students</div></div>
        <div class="ai-stat"><div class="ai-stat-value">${stats.averageAttendance}%</div><div class="ai-stat-label">Avg Attendance</div></div>
        <div class="ai-stat"><div class="ai-stat-value">${stats.atRiskCount}</div><div class="ai-stat-label">At Risk</div></div>
      </div>
      <h4><i class="fas fa-lightbulb"></i> AI Recommendations</h4>
      <div class="ai-result-content">${esc(data.analysis)}</div>
    `;
    result.style.display = 'block';
    showToast('AI analysis complete', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    loading.style.display = 'none';
  }
}

/* ===== Exports ===== */

function exportAttendancePDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const today = new Date().toISOString().split('T')[0];

  doc.setFontSize(18);
  doc.text('Attendance Report', 14, 22);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Generated: ${formatDate(today)} | Teacher: ${currentTeacher?.name || 'N/A'}`, 14, 30);

  const tableData = students.map(s => {
    const pct = (s.attendancePercentage || 0).toFixed(1);
    const status = pct < ATTENDANCE_THRESHOLD ? 'At Risk' : 'Safe';
    return [s.rollNumber, s.fullName, s.classSection, `${pct}%`, s.attendance || 0, s.totalDays || 0, status];
  });

  doc.autoTable({
    startY: 38,
    head: [['Roll', 'Name', 'Class', 'Attendance %', 'Present', 'Total Days', 'Status']],
    body: tableData,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [99, 102, 241] }
  });

  doc.save(`attendance-report-${today}.pdf`);
  showToast('PDF exported successfully', 'success');
}

function exportStudentsExcel() {
  const data = getFilteredStudents().map(s => ({
    'Roll Number': s.rollNumber,
    'Full Name': s.fullName,
    'Class/Section': s.classSection,
    'Parent Name': s.parentName || '',
    'Parent Phone': s.parentPhone || '',
    'Email': s.email || '',
    'Attendance %': (s.attendancePercentage || 0).toFixed(1),
    'Present Days': s.attendance || 0,
    'Total Days': s.totalDays || 0,
    'Status': (s.attendancePercentage || 0) < ATTENDANCE_THRESHOLD ? 'At Risk' : 'Safe',
    'Notes': s.notes || ''
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Students');
  XLSX.writeFile(wb, `students-${new Date().toISOString().split('T')[0]}.xlsx`);
  showToast('Excel exported successfully', 'success');
}

function generateMonthlyReport() {
  const now = new Date();
  const month = now.toLocaleString('default', { month: 'long', year: 'numeric' });
  const monthKey = now.toISOString().substring(0, 7);

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.text(`Monthly Attendance Report — ${month}`, 14, 22);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Teacher: ${currentTeacher?.name || 'N/A'} | Total Students: ${students.length}`, 14, 30);

  const summary = students.map(s => {
    const records = attendanceRecords.filter(r => r.studentId === s.id && r.date.startsWith(monthKey));
    const present = records.filter(r => r.status === 'present').length;
    const absent = records.filter(r => r.status === 'absent').length;
    const total = records.length;
    const pct = total > 0 ? ((present / total) * 100).toFixed(1) : '0.0';
    return [s.rollNumber, s.fullName, s.classSection, present, absent, total, `${pct}%`];
  });

  doc.autoTable({
    startY: 38,
    head: [['Roll', 'Name', 'Class', 'Present', 'Absent', 'Total', '%']],
    body: summary,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [99, 102, 241] }
  });

  const atRisk = students.filter(s => (s.attendancePercentage || 0) < ATTENDANCE_THRESHOLD);
  if (atRisk.length > 0) {
    const finalY = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(12);
    doc.setTextColor(239, 68, 68);
    doc.text(`Students Below 75% Threshold: ${atRisk.length}`, 14, finalY);
    doc.setFontSize(9);
    doc.setTextColor(60);
    atRisk.forEach((s, i) => {
      doc.text(`• ${s.fullName} (${(s.attendancePercentage || 0).toFixed(1)}%)`, 14, finalY + 8 + i * 6);
    });
  }

  doc.save(`monthly-report-${monthKey}.pdf`);
  showToast('Monthly report generated', 'success');
}

/* ===== Quick Actions ===== */

function initQuickActions() {
  document.querySelectorAll('.action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'attendance' || action === 'students') showView(action);
      else if (action === 'export-pdf') exportAttendancePDF();
      else if (action === 'export-excel') exportStudentsExcel();
      else if (action === 'monthly-report') generateMonthlyReport();
    });
  });
}

/* ===== Reminder Modal ===== */

function initModals() {
  document.getElementById('reminderClose').addEventListener('click', closeReminder);
  document.getElementById('reminderBackdrop').addEventListener('click', closeReminder);
  document.getElementById('reminderDismiss').addEventListener('click', closeReminder);
  document.getElementById('reminderGoMark').addEventListener('click', () => {
    closeReminder();
    showView('attendance');
  });
}

function checkAttendanceReminder() {
  const today = new Date().toISOString().split('T')[0];
  const dismissed = sessionStorage.getItem(`reminder_${today}`);
  if (dismissed) return;

  const todayRecords = attendanceRecords.filter(r => r.date === today);
  const markedCount = todayRecords.length;
  const hour = new Date().getHours();

  if (hour >= 8 && students.length > 0 && markedCount < students.length) {
    const unmarked = students.length - markedCount;
    document.getElementById('reminderBody').innerHTML = `
      <p>You have <strong>${unmarked} student${unmarked !== 1 ? 's' : ''}</strong> with unmarked attendance for today (<strong>${formatDate(today)}</strong>).</p>
      <p style="margin-top:12px">Don't forget to record today's attendance before the end of the school day.</p>
    `;
    document.getElementById('reminderModal').style.display = 'flex';
  }
}

function closeReminder() {
  const today = new Date().toISOString().split('T')[0];
  sessionStorage.setItem(`reminder_${today}`, 'true');
  document.getElementById('reminderModal').style.display = 'none';
}

/* ===== Toast ===== */

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<i class="fas ${icons[type]}"></i><span>${esc(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(40px)';
    toast.style.transition = '0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

/* ===== Utilities ===== */

function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
  });
}

function formatShortDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}
