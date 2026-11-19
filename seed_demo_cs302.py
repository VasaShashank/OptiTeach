import sqlite3
import uuid
from datetime import datetime, timedelta

db_path = r"c:\Users\basav\Downloads\DBMS\OptiTeach\backend\optiteach.db"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cs302_id = "542ea7f9-1f3f-4618-89a1-70e4d6769f5e"

# 1. Update calendar dates for all 45 sessions of CS302
# Start on Monday Aug 17, 2026. Classes run on Mon, Wed, Fri at 10:00:00
sessions = cursor.execute(
    "SELECT id, session_number, status, current_topic_id FROM class_sessions WHERE course_id = ? ORDER BY session_number",
    (cs302_id,)
).fetchall()

print(f"Found {len(sessions)} sessions for CS302")

current_date = datetime(2026, 8, 17, 10, 0, 0)
date_updates = []
for sess_id, s_num, status, topic_id in sessions:
    # ensure it falls on Mon (0), Wed (2), or Fri (4)
    while current_date.weekday() not in (0, 2, 4):
        current_date += timedelta(days=1)
    
    date_str = current_date.strftime("%Y-%m-%d %H:%M:%S")
    cursor.execute(
        "UPDATE class_sessions SET scheduled_date = ? WHERE id = ?",
        (date_str, sess_id)
    )
    current_date += timedelta(days=1)

print("Updated scheduled_date for all 45 class_sessions.")

# 2. Add rich lesson plans for CS302
# Topics map:
# 12: 'Relational Algebra Operators'
# 13: 'SQL DDL & Complex Queries'
# 14: 'Functional Dependencies & Keys'
# 15: 'Relational Normalization (1NF, 2NF, 3NF, BCNF)' - Next Class!
# 16: 'Relational Normalization (1NF, 2NF, 3NF, BCNF)'
# 17: 'Relational Normalization (1NF, 2NF, 3NF, BCNF)'
# 18: 'Relational Normalization (1NF, 2NF, 3NF, BCNF)'
# 19: 'Relational Normalization (1NF, 2NF, 3NF, BCNF)'
# 20: 'SQL DDL & Complex Queries'

lesson_plan_specs = [
    (13, "completed", "SQL DDL & Complex Queries", False, 1),
    (14, "completed", "Functional Dependencies & Keys", False, 1),
    (15, "approved", "Relational Normalization (1NF, 2NF, 3NF, BCNF)", True, 2),
    (16, "draft", "Relational Normalization (1NF, 2NF, 3NF, BCNF)", False, 1),
    (17, "draft", "Relational Normalization (1NF, 2NF, 3NF, BCNF)", False, 1),
    (18, "draft", "Relational Normalization (1NF, 2NF, 3NF, BCNF)", False, 1),
    (19, "draft", "Relational Normalization (1NF, 2NF, 3NF, BCNF)", False, 1),
    (20, "draft", "SQL DDL & Complex Queries", False, 1),
]

now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

for s_num, status, topic_name, overridden, version in lesson_plan_specs:
    sess = cursor.execute(
        "SELECT id, current_topic_id FROM class_sessions WHERE course_id = ? AND session_number = ?",
        (cs302_id, s_num)
    ).fetchone()
    if not sess:
        continue
    sess_id, topic_id = sess
    
    # Check if lesson plan exists
    lp = cursor.execute("SELECT id FROM lesson_plans WHERE session_id = ?", (sess_id,)).fetchone()
    doc_id = str(uuid.uuid4())
    title = f"Lesson Plan: {topic_name} (Period {s_num})"
    
    if lp:
        cursor.execute(
            """UPDATE lesson_plans 
               SET status = ?, title = ?, teacher_overridden = ?, version = ?, updated_at = ?
               WHERE id = ?""",
            (status, title, 1 if overridden else 0, version, now_str, lp[0])
        )
        print(f"Updated lesson plan for session {s_num}")
    else:
        new_lp_id = str(uuid.uuid4())
        cursor.execute(
            """INSERT INTO lesson_plans (id, session_id, topic_id, title, status, mongo_doc_id, ai_confidence, teacher_overridden, version, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (new_lp_id, sess_id, topic_id, title, status, doc_id, 0.95, 1 if overridden else 0, version, now_str, now_str)
        )
        print(f"Created lesson plan for session {s_num}")

conn.commit()
conn.close()
print("All demo data seeded into SQLite!")

