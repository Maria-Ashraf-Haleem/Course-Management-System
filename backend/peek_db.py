import sqlite3

# Connect to the database
conn = sqlite3.connect('../database/dentist.db')

# Check users table for username '1269'
print("=== CHECKING FOR USERNAME '1269' ===")
try:
    cursor = conn.execute("SELECT id, username, email, role, full_name FROM users WHERE username = ?", ('1269',))
    user_data = cursor.fetchone()
    if user_data:
        print(f"User with username '1269' found: ID={user_data[0]}, Username={user_data[1]}, Email={user_data[2]}, Role={user_data[3]}, Full Name={user_data[4]}")
    else:
        print("No user with username '1269' found")
except Exception as e:
    print(f"An error occurred: {e}")
finally:
    conn.close()
