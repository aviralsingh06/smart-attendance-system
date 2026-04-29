# Smart Attendance Backend

A minimal Express backend for a Smart Attendance System using in-memory arrays only.

## Run the server

1. Open a terminal in `attendance tracker/backend`
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
   npm start
   ```
4. Open the API at `http://localhost:3000`

## API Endpoints

- `GET /api/students` - Get all students
- `POST /api/attendance` - Mark attendance
- `GET /api/attendance` - Get attendance records
- `GET /api/attendance/percentages` - Get attendance percentage per student

### Example request body for `POST /api/attendance`

```json
{
  "studentId": "S001",
  "status": "Present",
  "date": "2026-04-29"
}
```
