import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { OpenAI } from 'openai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'attendance_secret_key_2024';
const ATTENDANCE_THRESHOLD = 75;

const DATABASE_PATH = process.env.VERCEL
  ? '/tmp/database.json'
  : path.resolve(__dirname, process.env.DATABASE_PATH || 'database.json');

const FRONTEND_PATH = path.join(__dirname, '..', 'frontend');

app.use(cors());
app.use(express.json());

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

/* ===== Database ===== */

async function readDatabase() {
  try {
    const data = await fs.readFile(DATABASE_PATH, 'utf-8');
    return JSON.parse(data);
  } catch {
    const initial = { teachers: [], students: [], attendance: [], analytics: [] };
    await writeDatabase(initial);
    return initial;
  }
}

async function writeDatabase(data) {
  const dir = path.dirname(DATABASE_PATH);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(DATABASE_PATH, JSON.stringify(data, null, 2));
}

/* ===== Helpers ===== */

function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized — please login' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.teacherId = decoded.id;
    req.teacherEmail = decoded.email;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function normalizeStatus(status) {
  return status?.toLowerCase() === 'absent' ? 'absent' : 'present';
}

function updateStudentStats(db, studentId) {
  const studentAttendance = db.attendance.filter(a => a.studentId === studentId);
  const presentDays = studentAttendance.filter(a => a.status === 'present').length;
  const total = studentAttendance.length;
  const percentage = total > 0 ? (presentDays / total) * 100 : 0;

  const idx = db.students.findIndex(s => s.id === studentId);
  if (idx !== -1) {
    db.students[idx].attendance = presentDays;
    db.students[idx].totalDays = total;
    db.students[idx].attendancePercentage = Math.round(percentage * 100) / 100;
    db.students[idx].atRisk = percentage < ATTENDANCE_THRESHOLD && total > 0;
  }
}

function generateMonthlyData(attendance) {
  const monthlyMap = {};

  attendance.forEach(record => {
    const month = record.date.substring(0, 7);
    if (!monthlyMap[month]) monthlyMap[month] = { present: 0, total: 0 };
    monthlyMap[month].total++;
    if (record.status === 'present') monthlyMap[month].present++;
  });

  return Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({
      month,
      percentage: data.total > 0 ? ((data.present / data.total) * 100).toFixed(2) : '0.00'
    }));
}

function generateDailyTrend(attendance, days = 30) {
  const trendMap = {};
  const today = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    trendMap[key] = { present: 0, total: 0 };
  }

  attendance.forEach(record => {
    if (trendMap[record.date]) {
      trendMap[record.date].total++;
      if (record.status === 'present') trendMap[record.date].present++;
    }
  });

  return Object.entries(trendMap).map(([date, data]) => ({
    date,
    percentage: data.total > 0 ? ((data.present / data.total) * 100).toFixed(2) : '0.00'
  }));
}

function generateClassBreakdown(students, attendance) {
  const classMap = {};

  students.forEach(student => {
    if (!classMap[student.classSection]) {
      classMap[student.classSection] = { present: 0, total: 0 };
    }
    const records = attendance.filter(a => a.studentId === student.id);
    classMap[student.classSection].total += records.length;
    classMap[student.classSection].present += records.filter(a => a.status === 'present').length;
  });

  return Object.entries(classMap).map(([classSection, data]) => ({
    classSection,
    percentage: data.total > 0 ? ((data.present / data.total) * 100).toFixed(2) : '0.00'
  }));
}

function buildAnalytics(db, teacherId, fromDate, toDate) {
  const students = db.students.filter(s => s.teacherId === teacherId);
  let attendance = db.attendance.filter(a => a.teacherId === teacherId);

  if (fromDate) attendance = attendance.filter(a => a.date >= fromDate);
  if (toDate) attendance = attendance.filter(a => a.date <= toDate);

  const today = new Date().toISOString().split('T')[0];
  const todayAttendance = db.attendance.filter(a => a.teacherId === teacherId && a.date === today);
  const presentToday = todayAttendance.filter(a => a.status === 'present').length;
  const absentToday = todayAttendance.filter(a => a.status === 'absent').length;

  const averageAttendance = students.length > 0
    ? students.reduce((sum, s) => sum + (s.attendancePercentage || 0), 0) / students.length
    : 0;

  const atRiskStudents = students.filter(s => s.atRisk);

  return {
    totalStudents: students.length,
    presentToday,
    absentToday,
    averageAttendance: averageAttendance.toFixed(2),
    atRiskCount: atRiskStudents.length,
    atRiskStudents,
    allStudents: students,
    monthlyData: generateMonthlyData(attendance),
    dailyTrend: generateDailyTrend(db.attendance.filter(a => a.teacherId === teacherId)),
    classBreakdown: generateClassBreakdown(students, attendance),
    trendData: attendance
  };
}

/* ===== AUTH ===== */

app.post('/api/signup', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const db = await readDatabase();
    if (db.teachers.find(t => t.email === email.toLowerCase())) {
      return res.status(400).json({ error: 'An account with this email already exists' });
    }

    const hashedPassword = await bcryptjs.hash(password, 10);
    const teacher = {
      id: Date.now().toString(),
      email: email.toLowerCase(),
      name: name.trim(),
      password: hashedPassword,
      createdAt: new Date().toISOString()
    };

    db.teachers.push(teacher);
    await writeDatabase(db);

    const token = jwt.sign({ id: teacher.id, email: teacher.email }, JWT_SECRET, { expiresIn: '30d' });

    res.status(201).json({
      message: 'Account created successfully',
      token,
      teacher: { id: teacher.id, email: teacher.email, name: teacher.name }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const db = await readDatabase();
    const teacher = db.teachers.find(t => t.email === email.toLowerCase());

    if (!teacher || !(await bcryptjs.compare(password, teacher.password))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ id: teacher.id, email: teacher.email }, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      message: 'Login successful',
      token,
      teacher: { id: teacher.id, email: teacher.email, name: teacher.name }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ===== STUDENTS ===== */

app.get('/api/students', verifyToken, async (req, res) => {
  try {
    const db = await readDatabase();
    res.json(db.students.filter(s => s.teacherId === req.teacherId));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/students', verifyToken, async (req, res) => {
  try {
    const { rollNumber, fullName, classSection, parentName, parentPhone, email, notes } = req.body;

    if (!rollNumber?.trim() || !fullName?.trim() || !classSection?.trim()) {
      return res.status(400).json({ error: 'Roll number, full name, and class/section are required' });
    }

    const db = await readDatabase();
    const exists = db.students.find(
      s => s.rollNumber === rollNumber.trim() && s.teacherId === req.teacherId
    );

    if (exists) {
      return res.status(400).json({ error: 'A student with this roll number already exists' });
    }

    const student = {
      id: Date.now().toString(),
      teacherId: req.teacherId,
      rollNumber: rollNumber.trim(),
      fullName: fullName.trim(),
      classSection: classSection.trim(),
      parentName: parentName?.trim() || '',
      parentPhone: parentPhone?.trim() || '',
      email: email?.trim() || '',
      notes: notes?.trim() || '',
      createdAt: new Date().toISOString(),
      attendance: 0,
      totalDays: 0,
      attendancePercentage: 0,
      atRisk: false
    };

    db.students.push(student);
    await writeDatabase(db);
    res.status(201).json(student);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/students/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { rollNumber, fullName, classSection, parentName, parentPhone, email, notes } = req.body;

    if (!rollNumber?.trim() || !fullName?.trim() || !classSection?.trim()) {
      return res.status(400).json({ error: 'Roll number, full name, and class/section are required' });
    }

    const db = await readDatabase();
    const idx = db.students.findIndex(s => s.id === id && s.teacherId === req.teacherId);

    if (idx === -1) {
      return res.status(404).json({ error: 'Student not found' });
    }

    db.students[idx] = {
      ...db.students[idx],
      rollNumber: rollNumber.trim(),
      fullName: fullName.trim(),
      classSection: classSection.trim(),
      parentName: parentName?.trim() || '',
      parentPhone: parentPhone?.trim() || '',
      email: email?.trim() || '',
      notes: notes?.trim() || ''
    };

    await writeDatabase(db);
    res.json(db.students[idx]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/students/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const db = await readDatabase();

    const exists = db.students.some(s => s.id === id && s.teacherId === req.teacherId);
    if (!exists) return res.status(404).json({ error: 'Student not found' });

    db.students = db.students.filter(s => !(s.id === id && s.teacherId === req.teacherId));
    db.attendance = db.attendance.filter(a => a.studentId !== id);
    await writeDatabase(db);

    res.json({ message: 'Student deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/students/search/:query', verifyToken, async (req, res) => {
  try {
    const query = req.params.query.toLowerCase();
    const db = await readDatabase();
    const results = db.students.filter(
      s => s.teacherId === req.teacherId &&
        (s.fullName.toLowerCase().includes(query) || s.rollNumber.toLowerCase().includes(query))
    );
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ===== ATTENDANCE ===== */

app.post('/api/attendance', verifyToken, async (req, res) => {
  try {
    const { studentId, date, status } = req.body;

    if (!studentId || !status) {
      return res.status(400).json({ error: 'Student ID and status are required' });
    }

    const db = await readDatabase();
    const student = db.students.find(s => s.id === studentId && s.teacherId === req.teacherId);

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const attendanceDate = date
      ? new Date(date).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    const normalizedStatus = normalizeStatus(status);
    const existingIdx = db.attendance.findIndex(
      a => a.studentId === studentId && a.date === attendanceDate
    );

    if (existingIdx !== -1) {
      db.attendance[existingIdx].status = normalizedStatus;
      db.attendance[existingIdx].updatedAt = new Date().toISOString();
    } else {
      db.attendance.push({
        id: Date.now().toString(),
        studentId,
        teacherId: req.teacherId,
        date: attendanceDate,
        status: normalizedStatus,
        createdAt: new Date().toISOString()
      });
    }

    updateStudentStats(db, studentId);
    await writeDatabase(db);

    const updatedStudent = db.students.find(s => s.id === studentId);
    res.json({ message: 'Attendance marked successfully', student: updatedStudent });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/attendance', verifyToken, async (req, res) => {
  try {
    const db = await readDatabase();
    res.json(db.attendance.filter(a => a.teacherId === req.teacherId));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/attendance/range/:startDate/:endDate', verifyToken, async (req, res) => {
  try {
    const { startDate, endDate } = req.params;
    const db = await readDatabase();
    const filtered = db.attendance.filter(
      a => a.teacherId === req.teacherId && a.date >= startDate && a.date <= endDate
    );
    res.json(filtered);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ===== ANALYTICS ===== */

app.get('/api/analytics', verifyToken, async (req, res) => {
  try {
    const db = await readDatabase();
    const { from, to } = req.query;
    const analytics = buildAnalytics(db, req.teacherId, from, to);
    res.json(analytics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ===== WHATSAPP ===== */

app.post('/api/send-whatsapp', verifyToken, async (req, res) => {
  try {
    const { studentId, parentPhone, recipient } = req.body;

    if (!studentId) {
      return res.status(400).json({ error: 'Student ID is required' });
    }

    const db = await readDatabase();
    const student = db.students.find(s => s.id === studentId && s.teacherId === req.teacherId);

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const pct = (student.attendancePercentage || 0).toFixed(1);
    let message;

    if (recipient === 'faculty') {
      message = `ATTENDANCE ALERT: Student ${student.fullName} (Roll: ${student.rollNumber}, Class: ${student.classSection}) has attendance below 75%. Current attendance: ${pct}%. Immediate attention required.`;
    } else {
      message = `Dear Parent, your child ${student.fullName} has attendance below 75%. Current attendance is ${pct}%. Please ensure regular attendance to avoid academic issues.`;
    }

    const phone = (parentPhone || student.parentPhone || '').replace(/\D/g, '');
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

    res.json({
      message: 'WhatsApp link generated successfully',
      url: whatsappUrl,
      previewMessage: message
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ===== AI ANALYSIS ===== */

app.post('/api/ai-analysis', verifyToken, async (req, res) => {
  try {
    if (!openai) {
      return res.status(400).json({ error: 'OpenAI API key not configured. Add OPENAI_API_KEY to your .env file.' });
    }

    const db = await readDatabase();
    const students = db.students.filter(s => s.teacherId === req.teacherId);
    const attendance = db.attendance.filter(a => a.teacherId === req.teacherId);

    const atRiskStudents = students.filter(s => s.atRisk);
    const borderline = students.filter(s => {
      const pct = s.attendancePercentage || 0;
      return pct >= 75 && pct < 85 && s.totalDays > 0;
    });

    const averageAttendance = students.length > 0
      ? students.reduce((sum, s) => sum + (s.attendancePercentage || 0), 0) / students.length
      : 0;

    const recentDates = [...new Set(attendance.map(a => a.date))].sort().slice(-14);
    const recentTrend = recentDates.map(date => {
      const dayRecords = attendance.filter(a => a.date === date);
      const present = dayRecords.filter(a => a.status === 'present').length;
      return { date, rate: dayRecords.length > 0 ? ((present / dayRecords.length) * 100).toFixed(1) : 0 };
    });

    const prompt = `You are an expert education analyst. Analyze this attendance data for a teacher's class:

CLASS OVERVIEW:
- Total students: ${students.length}
- Average attendance: ${averageAttendance.toFixed(2)}%
- At-risk students (below 75%): ${atRiskStudents.length}
- Borderline students (75-85%): ${borderline.length}
- Total attendance records: ${attendance.length}

AT-RISK STUDENTS:
${atRiskStudents.map(s => `- ${s.fullName} (${s.classSection}): ${s.attendancePercentage.toFixed(1)}% — ${s.attendance}/${s.totalDays} days present`).join('\n') || 'None'}

BORDERLINE STUDENTS (may fall below threshold):
${borderline.map(s => `- ${s.fullName}: ${s.attendancePercentage.toFixed(1)}%`).join('\n') || 'None'}

LAST 14 DAYS TREND:
${recentTrend.map(d => `- ${d.date}: ${d.rate}%`).join('\n') || 'No recent data'}

Provide a structured analysis with:
1. KEY PATTERNS — What attendance trends do you observe?
2. AT-RISK PREDICTIONS — Which students are likely to fall below 75% soon?
3. SPECIFIC RECOMMENDATIONS — Actionable steps for the teacher
4. INDIVIDUAL RISK ASSESSMENT — Brief note on each at-risk student

Keep the response concise, practical, and formatted with clear sections.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are a helpful school attendance analyst providing actionable insights to teachers.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 1200,
      temperature: 0.7
    });

    const analysis = response.choices[0].message.content;

    res.json({
      analysis,
      statistics: {
        totalStudents: students.length,
        atRiskCount: atRiskStudents.length,
        borderlineCount: borderline.length,
        averageAttendance: averageAttendance.toFixed(2),
        atRiskStudents: atRiskStudents.map(s => ({
          name: s.fullName,
          percentage: s.attendancePercentage.toFixed(2)
        }))
      }
    });
  } catch (error) {
    const msg = error.status === 401
      ? 'Invalid OpenAI API key. Check your OPENAI_API_KEY in .env'
      : error.message;
    res.status(500).json({ error: msg });
  }
});

/* ===== STATIC FILES (local dev) ===== */

app.use(express.static(FRONTEND_PATH));

app.get('/', (req, res) => {
  res.sendFile(path.join(FRONTEND_PATH, 'index.html'));
});

/* ===== ERROR HANDLER ===== */

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

/* ===== START SERVER ===== */

if (!process.env.VERCEL) {
  const server = app.listen(PORT, () => {
    console.log(`Attendance Tracker running at http://localhost:${PORT}`);
    console.log(`Open in browser: http://localhost:${PORT}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\nPort ${PORT} is already in use.`);
      console.error('Stop the other process first, or run:');
      console.error(`  npx kill-port ${PORT}`);
      console.error(`Or set a different PORT in backend/.env\n`);
    } else {
      console.error('Server error:', err.message);
    }
    process.exit(1);
  });
}

export default app;
