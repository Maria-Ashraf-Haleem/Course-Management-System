-- SQL script to create test enrollment data
-- Run this in SQLite to create test data

-- First, let's see what we have
SELECT 'Users with student role:' as info;
SELECT id, username, email FROM users WHERE role = 'student';

SELECT 'Student records:' as info;
SELECT student_id, student_number, full_name, user_id FROM Student;

SELECT 'Available courses:' as info;
SELECT course_id, title, code, is_active FROM Course WHERE is_active = 1 LIMIT 3;

SELECT 'Existing enrollments:' as info;
SELECT enrollment_id, student_id, course_id, status FROM CourseEnrollment;

-- Create a test enrollment if none exists
INSERT OR IGNORE INTO CourseEnrollment (student_id, course_id, status, enrolled_at)
SELECT 
    (SELECT student_id FROM Student WHERE user_id = (SELECT id FROM users WHERE role = 'student' LIMIT 1) LIMIT 1),
    (SELECT course_id FROM Course WHERE is_active = 1 LIMIT 1),
    'Active',
    datetime('now')
WHERE NOT EXISTS (
    SELECT 1 FROM CourseEnrollment 
    WHERE student_id = (SELECT student_id FROM Student WHERE user_id = (SELECT id FROM users WHERE role = 'student' LIMIT 1) LIMIT 1)
);

-- Verify the enrollment was created
SELECT 'Final verification:' as info;
SELECT ce.enrollment_id, ce.student_id, ce.course_id, ce.status,
       s.student_number, s.full_name, c.title as course_title
FROM CourseEnrollment ce
JOIN Student s ON ce.student_id = s.student_id
JOIN Course c ON ce.course_id = c.course_id;
