import sqlite3

conn = sqlite3.connect('database/dentist.db')
cursor = conn.cursor()

# Fix password hash for user 1269 - set to 'password123'
correct_hash = '$2b$12$LQv3c1yqBwEHxE88c8EnsOEwlMQGgnAJSWchIENTR04/OvDNAMZ6G'
cursor.execute('UPDATE users SET password_hash = ? WHERE username = ?', (correct_hash, '1269'))

# Ensure user is instructor
cursor.execute('UPDATE users SET role = ? WHERE username = ?', ('instructor', '1269'))

conn.commit()

# Verify
cursor.execute('SELECT username, role FROM users WHERE username = ?', ('1269',))
user = cursor.fetchone()
print(f'User 1269: {user}')
print('Password reset to: password123')

conn.close()
