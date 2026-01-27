import sqlite3

conn = sqlite3.connect('database/dentist.db')
cursor = conn.cursor()

# Check if instructor record exists for user 1269
cursor.execute('SELECT * FROM Instructor WHERE user_id = 1269')
instructor = cursor.fetchone()
print(f'Instructor record for user 1269: {instructor}')

if not instructor:
    # Create instructor record for user 1269
    cursor.execute('INSERT INTO Instructor (user_id, full_name, email, phone, department_id) VALUES (?, ?, ?, ?, ?)', 
                   (1269, 'Tadrous', 'tadrous@example.com', '123-456-7890', 1))
    print('Created instructor record for user 1269')

# Get the instructor ID
cursor.execute('SELECT instructor_id FROM Instructor WHERE user_id = 1269')
instructor_id = cursor.fetchone()[0]

# Update courses to be created by this instructor
cursor.execute('UPDATE Course SET created_by = ? WHERE created_by = 1', (instructor_id,))

conn.commit()

# Verify
cursor.execute('SELECT COUNT(*) FROM Course WHERE created_by = ?', (instructor_id,))
course_count = cursor.fetchone()[0]
print(f'Courses assigned to instructor {instructor_id}: {course_count}')

conn.close()
