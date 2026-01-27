import sqlite3

conn = sqlite3.connect('database/dentist.db')
cursor = conn.cursor()

# Create instructor record for user 1269 if it doesn't exist
cursor.execute('SELECT instructor_id FROM Instructor WHERE user_id = 1269')
existing = cursor.fetchone()

if not existing:
    cursor.execute('INSERT INTO Instructor (user_id, full_name, department_id) VALUES (?, ?, ?)', 
                   (1269, 'Tadrous', 1))
    print('Created instructor record')

# Get instructor ID
cursor.execute('SELECT instructor_id FROM Instructor WHERE user_id = 1269')
instructor_id = cursor.fetchone()[0]

# Update all courses to belong to this instructor
cursor.execute('UPDATE Course SET created_by = ?', (instructor_id,))

conn.commit()

# Verify courses
cursor.execute('SELECT course_id, title FROM Course WHERE created_by = ?', (instructor_id,))
courses = cursor.fetchall()
print(f'Instructor {instructor_id} now has {len(courses)} courses:')
for course in courses:
    print(f'  - {course[1]} (ID: {course[0]})')

conn.close()
