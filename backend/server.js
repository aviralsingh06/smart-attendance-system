const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Backend is running');
});

// In-memory data
const students = [
  { id: '001', name: 'Ranveer Singh' },
  { id: '002', name: 'Sneha Kumari' },
  { id: '003', name: 'Aditya Kumar' }
];

const attendanceRecords = [];

// Get students
app.get('/api/students', (req, res) => {
  res.json(students);
});

// Add student
app.post('/api/students', (req, res) => {
  const { id, name } = req.body;

  if (!id || !name) {
    return res.status(400).json({ error: 'ID and name required' });
  }

  const exists = students.find(s => s.id === id);
  if (exists) {
    return res.status(400).json({ error: 'Student already exists' });
  }

  const newStudent = { id, name };
  students.push(newStudent);

  res.status(201).json(newStudent);
});

// Mark attendance (NO DUPLICATES)
app.post('/api/attendance', (req, res) => {
  const { studentId, date, status } = req.body;

  const student = students.find(s => s.id === studentId);
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const attendanceDate = date
    ? new Date(date).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const existingIndex = attendanceRecords.findIndex(
    r => r.studentId === studentId && r.date === attendanceDate
  );

  if (existingIndex !== -1) {
    attendanceRecords[existingIndex].status = status;
  } else {
    attendanceRecords.push({
      studentId,
      studentName: student.name,
      date: attendanceDate,
      status
    });
  }

  res.json({ message: 'Attendance updated' });
});

// Get attendance
app.get('/api/attendance', (req, res) => {
  res.json(attendanceRecords);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});