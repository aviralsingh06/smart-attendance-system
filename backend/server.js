const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3000;

// Enable CORS and JSON body parsing
app.use(cors());
app.use(express.json());

// ✅ Root route (FIX for "Cannot GET /")
app.get('/', (req, res) => {
  res.send('Backend is running');
});

// Sample student data
const students = [
  { id: '001', name: 'Ranveer Singh' },
  { id: '002', name: 'Sneha Kumari' },
  { id: '003', name: 'Aditya Kumar' }
];

// In-memory attendance records
const attendanceRecords = [];

// 1. API to get all students
app.get('/api/students', (req, res) => {
  res.json(students);
});

// 2. API to mark attendance (Present/Absent)
app.post('/api/attendance', (req, res) => {
  const { studentId, date, status } = req.body;

  if (!studentId || !status) {
    return res.status(400).json({ error: 'studentId and status are required.' });
  }

  const student = students.find((s) => s.id === studentId);
  if (!student) {
    return res.status(404).json({ error: 'Student not found.' });
  }

  const attendanceDate = date
    ? new Date(date).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const normalizedStatus = status === 'Present' ? 'Present' : 'Absent';

  const record = {
    studentId,
    date: attendanceDate,
    status: normalizedStatus
  };

  attendanceRecords.push(record);

  res.status(201).json({ message: 'Attendance recorded.', record });
});

// 3. API to get attendance records
app.get('/api/attendance', (req, res) => {
  res.json(attendanceRecords);
});

// 4. API to calculate attendance percentage per student
app.get('/api/attendance/percentages', (req, res) => {
  const stats = students.map((student) => {
    const studentRecords = attendanceRecords.filter(
      (record) => record.studentId === student.id
    );

    const totalDays = studentRecords.length;
    const presentDays = studentRecords.filter(
      (record) => record.status === 'Present'
    ).length;

    const percentage =
      totalDays === 0 ? 0 : Math.round((presentDays / totalDays) * 100);

    const alert = percentage < 75 && totalDays > 0;

    return {
      studentId: student.id,
      name: student.name,
      totalDays,
      presentDays,
      absentDays: totalDays - presentDays,
      percentage,
      alert
    };
  });

  res.json(stats);
});

// Start the server
app.listen(PORT, () => {
  console.log(`Smart Attendance backend is running on http://localhost:${PORT}`);
});