import sqlite3
import bcrypt

# Generate proper password hash for "password123"
password = "password123"
salt = bcrypt.gensalt()
hashed = bcrypt.hashpw(password.encode('utf-8'), salt)

conn = sqlite3.connect('database/dentist.db')
cursor = conn.cursor()

# Update user 1269 with new hash
cursor.execute('UPDATE users SET password_hash = ? WHERE username = ?', (hashed.decode('utf-8'), '1269'))

# Verify user exists and has correct role
cursor.execute('SELECT username, role, password_hash FROM users WHERE username = ?', ('1269',))
user = cursor.fetchone()

conn.commit()
conn.close()

print(f'User: {user[0]}, Role: {user[1]}')
print(f'New hash: {user[2][:50]}...')
print('Password: password123')

# Test the hash
if bcrypt.checkpw(password.encode('utf-8'), user[2].encode('utf-8')):
    print('✅ Password verification SUCCESS')
else:
    print('❌ Password verification FAILED')
