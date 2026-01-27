import sqlite3
import shutil

# Create backup
shutil.copy2('database/dentist.db', 'database/dentist.db.complete_backup')
print('Complete backup created: database/dentist.db.complete_backup')

# Clear all users
conn = sqlite3.connect('database/dentist.db')
cursor = conn.cursor()

# Check current users
cursor.execute('SELECT COUNT(*) FROM users')
user_count = cursor.fetchone()[0]
print(f'Found {user_count} users to clear')

# Delete all users
cursor.execute('DELETE FROM users')
cursor.execute('DELETE FROM sqlite_sequence WHERE name="users"')

conn.commit()

# Verify clearing
cursor.execute('SELECT COUNT(*) FROM users')
remaining = cursor.fetchone()[0]
print(f'Users remaining after cleanup: {remaining}')

conn.close()
print('✅ All user accounts cleared. Database is now completely clean.')
