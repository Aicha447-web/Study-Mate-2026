"""
Study Mate Backend (Python)
Flask server with SQLite. Handles auth, courses, groups, ratings, notifications, places.
Matches the API used by the frontend (script.js).
"""

import os
import sqlite3
from datetime import datetime, timedelta
from functools import wraps

import bcrypt
import jwt
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder=".", static_url_path="")
CORS(app)

PORT = int(os.environ.get("PORT", 3000))
JWT_SECRET = os.environ.get("JWT_SECRET", "study-mate-secret-change-in-production")
DB_PATH = os.path.join(os.path.dirname(__file__), "study_mate.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'student',
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS courses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL,
            name TEXT NOT NULL,
            UNIQUE(code)
        );
        CREATE TABLE IF NOT EXISTS user_courses (
            user_id INTEGER NOT NULL,
            course_id INTEGER NOT NULL,
            PRIMARY KEY (user_id, course_id),
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (course_id) REFERENCES courses(id)
        );
        CREATE TABLE IF NOT EXISTS groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            course TEXT NOT NULL,
            goal TEXT NOT NULL,
            max_members INTEGER NOT NULL,
            description TEXT,
            created_by_id INTEGER NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (created_by_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS group_members (
            group_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            PRIMARY KEY (group_id, user_id),
            FOREIGN KEY (group_id) REFERENCES groups(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS ratings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rater_id INTEGER NOT NULL,
            rated_user_id INTEGER NOT NULL,
            group_id INTEGER NOT NULL,
            rating INTEGER NOT NULL,
            review TEXT,
            date TEXT NOT NULL,
            FOREIGN KEY (rater_id) REFERENCES users(id),
            FOREIGN KEY (rated_user_id) REFERENCES users(id),
            FOREIGN KEY (group_id) REFERENCES groups(id)
        );
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            message TEXT NOT NULL,
            type TEXT DEFAULT 'info',
            read INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS places (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            location TEXT NOT NULL,
            type TEXT NOT NULL,
            description TEXT,
            added_by_id INTEGER NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (added_by_id) REFERENCES users(id)
        );
    """)
    row = conn.execute("SELECT COUNT(*) as c FROM courses").fetchone()
    if row["c"] == 0:
        conn.execute(
            "INSERT INTO courses (code, name) VALUES ('CS101', 'Introduction to Computer Science'), ('MATH201', 'Calculus II'), ('PHYS150', 'Physics Fundamentals')"
        )
    conn.commit()
    conn.close()


def auth_required(f):
    @wraps(f)
    def wrapped(*args, **kwargs):
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return jsonify(error="Authentication required"), 401
        token = auth_header[7:]
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            request.user_id = payload["userId"]
            request.user_name = payload["name"]
            request.user_email = payload["email"]
        except jwt.InvalidTokenError:
            return jsonify(error="Invalid or expired token"), 401
        return f(*args, **kwargs)
    return wrapped


def row_to_dict(row):
    return dict(row) if row else None


@app.route("/api/register", methods=["POST"])
def register():
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password")
    if not name or not email or not password:
        return jsonify(error="Name, email and password required"), 400
    conn = get_db()
    if conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone():
        conn.close()
        return jsonify(error="Email already registered"), 400
    password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    res = conn.execute("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)", (name, email, password_hash, "student"))
    user_id = res.lastrowid
    user = row_to_dict(conn.execute("SELECT id, name, email, role FROM users WHERE id = ?", (user_id,)).fetchone())
    conn.commit()
    conn.close()
    payload = {"userId": user["id"], "name": user["name"], "email": user["email"], "exp": datetime.utcnow() + timedelta(days=7)}
    token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")
    if hasattr(token, "decode"):
        token = token.decode("utf-8")
    return jsonify(token=token, user={"id": user["id"], "name": user["name"], "email": user["email"], "role": user["role"]})


@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password")
    if not email or not password:
        return jsonify(error="Email and password required"), 400
    conn = get_db()
    user = conn.execute("SELECT id, name, email, password_hash, role FROM users WHERE email = ?", (email,)).fetchone()
    conn.close()
    if not user or not bcrypt.checkpw(password.encode("utf-8"), user["password_hash"].encode("utf-8")):
        return jsonify(error="Invalid email or password"), 401
    user = row_to_dict(user)
    payload = {"userId": user["id"], "name": user["name"], "email": user["email"], "exp": datetime.utcnow() + timedelta(days=7)}
    token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")
    if hasattr(token, "decode"):
        token = token.decode("utf-8")
    return jsonify(token=token, user={"id": user["id"], "name": user["name"], "email": user["email"], "role": user["role"]})


@app.route("/api/courses", methods=["GET"])
@auth_required
def get_courses():
    conn = get_db()
    rows = [row_to_dict(r) for r in conn.execute("""
        SELECT c.id, c.code, c.name FROM courses c
        INNER JOIN user_courses uc ON uc.course_id = c.id AND uc.user_id = ?
        ORDER BY c.code
    """, (request.user_id,)).fetchall()]
    conn.close()
    return jsonify(rows)


@app.route("/api/courses/search", methods=["GET"])
@auth_required
def search_courses():
    q = (request.args.get("q") or "").strip().lower()
    conn = get_db()
    if q:
        rows = [row_to_dict(r) for r in conn.execute("SELECT id, code, name FROM courses WHERE LOWER(code) LIKE ? OR LOWER(name) LIKE ? ORDER BY code", (f"%{q}%", f"%{q}%")).fetchall()]
    else:
        rows = [row_to_dict(r) for r in conn.execute("SELECT id, code, name FROM courses ORDER BY code").fetchall()]
    conn.close()
    return jsonify(rows)


@app.route("/api/courses", methods=["POST"])
@auth_required
def add_course():
    data = request.get_json() or {}
    code = (data.get("code") or "").strip().upper()
    name = (data.get("name") or "").strip()
    if not code or not name:
        return jsonify(error="Course code and name required"), 400
    conn = get_db()
    existing = conn.execute("SELECT id FROM courses WHERE code = ?", (code,)).fetchone()
    if existing:
        course_id = existing["id"]
    else:
        res = conn.execute("INSERT INTO courses (code, name) VALUES (?, ?)", (code, name))
        course_id = res.lastrowid
    conn.execute("INSERT OR IGNORE INTO user_courses (user_id, course_id) VALUES (?, ?)", (request.user_id, course_id))
    course = row_to_dict(conn.execute("SELECT id, code, name FROM courses WHERE id = ?", (course_id,)).fetchone())
    conn.commit()
    conn.close()
    return jsonify(course), 201


def _group_row_to_json(conn, row):
    members = [r["name"] for r in conn.execute("SELECT u.name FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.group_id = ?", (row["id"],)).fetchall()]
    return {
        "id": row["id"],
        "name": row["name"],
        "course": row["course"],
        "goal": row["goal"],
        "maxMembers": row["max_members"],
        "currentMembers": len(members),
        "members": members,
        "description": row["description"] or "",
        "createdBy": row["created_by_name"],
    }


@app.route("/api/groups", methods=["GET"])
@auth_required
def get_groups():
    conn = get_db()
    rows = conn.execute("""
        SELECT g.id, g.name, g.course, g.goal, g.max_members, g.description, g.created_by_id, u.name AS created_by_name
        FROM groups g
        INNER JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = ?
        LEFT JOIN users u ON u.id = g.created_by_id
        ORDER BY g.id DESC
    """, (request.user_id,)).fetchall()
    groups = [_group_row_to_json(conn, row_to_dict(r)) for r in rows]
    conn.close()
    return jsonify(groups)


@app.route("/api/groups/all", methods=["GET"])
@auth_required
def get_all_groups():
    conn = get_db()
    rows = conn.execute("""
        SELECT g.id, g.name, g.course, g.goal, g.max_members, g.description, u.name AS created_by_name
        FROM groups g
        LEFT JOIN users u ON u.id = g.created_by_id
        ORDER BY g.id DESC
    """).fetchall()
    groups = [_group_row_to_json(conn, row_to_dict(r)) for r in rows]
    conn.close()
    return jsonify(groups)


@app.route("/api/groups", methods=["POST"])
@auth_required
def create_group():
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    course = data.get("course") or ""
    goal = data.get("goal") or ""
    max_members = data.get("maxMembers", 5)
    description = (data.get("description") or "").strip()
    if not name or not course or not goal:
        return jsonify(error="Name, course and goal required"), 400
    max_members = min(5, max(2, int(max_members) if max_members else 5))
    conn = get_db()
    res = conn.execute(
        "INSERT INTO groups (name, course, goal, max_members, description, created_by_id) VALUES (?, ?, ?, ?, ?, ?)",
        (name, course, goal, max_members, description, request.user_id),
    )
    group_id = res.lastrowid
    conn.execute("INSERT INTO group_members (group_id, user_id) VALUES (?, ?)", (group_id, request.user_id))
    conn.commit()
    conn.close()
    return jsonify(
        id=group_id,
        name=name,
        course=course,
        goal=goal,
        maxMembers=max_members,
        currentMembers=1,
        members=[request.user_name],
        description=description,
        createdBy=request.user_name,
    ), 201


@app.route("/api/groups/<int:group_id>", methods=["GET"])
@auth_required
def get_group(group_id):
    conn = get_db()
    row = conn.execute("""
        SELECT g.id, g.name, g.course, g.goal, g.max_members, g.description, u.name AS created_by_name
        FROM groups g
        LEFT JOIN users u ON u.id = g.created_by_id
        WHERE g.id = ?
    """, (group_id,)).fetchone()
    if not row:
        conn.close()
        return jsonify(error="Group not found"), 404
    row = row_to_dict(row)
    members = [r["name"] for r in conn.execute("SELECT u.name FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.group_id = ?", (group_id,)).fetchall()]
    conn.close()
    return jsonify(
        id=row["id"],
        name=row["name"],
        course=row["course"],
        goal=row["goal"],
        maxMembers=row["max_members"],
        currentMembers=len(members),
        members=members,
        description=row["description"] or "",
        createdBy=row["created_by_name"],
    )


@app.route("/api/users", methods=["GET"])
@auth_required
def get_users():
    conn = get_db()
    rows = [{"id": r["id"], "name": r["name"], "email": r["email"], "role": r["role"]} for r in conn.execute("SELECT id, name, email, role FROM users WHERE role = ? ORDER BY name", ("student",)).fetchall()]
    conn.close()
    return jsonify(rows)


@app.route("/api/groups/<int:group_id>/join", methods=["POST"])
@auth_required
def join_group(group_id):
    conn = get_db()
    group = conn.execute("SELECT id, max_members, name FROM groups WHERE id = ?", (group_id,)).fetchone()
    if not group:
        conn.close()
        return jsonify(error="Group not found"), 404
    count = conn.execute("SELECT COUNT(*) as c FROM group_members WHERE group_id = ?", (group_id,)).fetchone()["c"]
    if count >= group["max_members"]:
        conn.close()
        return jsonify(error="Group is full"), 400
    try:
        conn.execute("INSERT INTO group_members (group_id, user_id) VALUES (?, ?)", (group_id, request.user_id))
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify(error="Already in this group"), 400
    gr = conn.execute("SELECT course FROM groups WHERE id = ?", (group_id,)).fetchone()
    if gr:
        cr = conn.execute("SELECT id FROM courses WHERE code = ?", (gr["course"],)).fetchone()
        if cr:
            conn.execute("INSERT OR IGNORE INTO user_courses (user_id, course_id) VALUES (?, ?)", (request.user_id, cr["id"]))
    full = row_to_dict(conn.execute("""
        SELECT g.id, g.name, g.course, g.goal, g.max_members, g.description, u.name AS created_by_name
        FROM groups g LEFT JOIN users u ON u.id = g.created_by_id WHERE g.id = ?
    """, (group_id,)).fetchone())
    members = [r["name"] for r in conn.execute("SELECT u.name FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.group_id = ?", (group_id,)).fetchall()]
    conn.commit()
    conn.close()
    return jsonify(
        id=group_id,
        name=full["name"],
        course=full["course"],
        goal=full["goal"],
        maxMembers=full["max_members"],
        currentMembers=len(members),
        members=members,
        description=full["description"] or "",
        createdBy=full["created_by_name"],
    )


@app.route("/api/ratings", methods=["GET"])
@auth_required
def get_ratings():
    for_user = request.args.get("for_user")
    conn = get_db()
    if for_user:
        u = conn.execute("SELECT id FROM users WHERE name = ?", (for_user,)).fetchone()
        if not u:
            conn.close()
            return jsonify([])
        rows = conn.execute("""
            SELECT r.id, r.rating, r.review, r.date, r.group_id, u1.name AS rater_name, u2.name AS rated_user_name
            FROM ratings r
            JOIN users u1 ON u1.id = r.rater_id
            JOIN users u2 ON u2.id = r.rated_user_id
            WHERE r.rated_user_id = ?
            ORDER BY r.date DESC
        """, (u["id"],)).fetchall()
    else:
        rows = conn.execute("""
            SELECT r.id, r.rating, r.review, r.date, r.group_id, u1.name AS rater_name, u2.name AS rated_user_name
            FROM ratings r
            JOIN users u1 ON u1.id = r.rater_id
            JOIN users u2 ON u2.id = r.rated_user_id
            WHERE r.rated_user_id = ?
            ORDER BY r.date DESC
        """, (request.user_id,)).fetchall()
    conn.close()
    out = [
        {"id": r["id"], "rater": r["rater_name"], "ratedUser": r["rated_user_name"], "rating": r["rating"], "review": r["review"] or "", "groupId": r["group_id"], "date": r["date"]}
        for r in rows
    ]
    return jsonify(out)


@app.route("/api/ratings", methods=["POST"])
@auth_required
def add_rating():
    data = request.get_json() or {}
    rated_user_name = data.get("ratedUserName")
    group_id = data.get("groupId")
    rating = data.get("rating")
    review = (data.get("review") or "").strip()
    if not rated_user_name or group_id is None or rating is None:
        return jsonify(error="ratedUserName, groupId and rating required"), 400
    conn = get_db()
    rated = conn.execute("SELECT id FROM users WHERE name = ?", (rated_user_name,)).fetchone()
    if not rated:
        conn.close()
        return jsonify(error="User not found"), 400
    if conn.execute("SELECT id FROM ratings WHERE rater_id = ? AND rated_user_id = ? AND group_id = ?", (request.user_id, rated["id"], group_id)).fetchone():
        conn.close()
        return jsonify(error="You have already rated this user for this group"), 400
    r = min(5, max(1, int(rating) if rating else 5))
    date_str = datetime.utcnow().strftime("%Y-%m-%d")
    res = conn.execute("INSERT INTO ratings (rater_id, rated_user_id, group_id, rating, review, date) VALUES (?, ?, ?, ?, ?, ?)", (request.user_id, rated["id"], group_id, r, review, date_str))
    rid = res.lastrowid
    conn.commit()
    conn.close()
    return jsonify(id=rid, rating=r, review=review, date=date_str), 201


@app.route("/api/groups/<int:group_id>/member-ratings", methods=["GET"])
@auth_required
def get_member_ratings(group_id):
    conn = get_db()
    members = conn.execute("SELECT u.id, u.name FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.group_id = ?", (group_id,)).fetchall()
    result = {}
    for m in members:
        rows = conn.execute("""
            SELECT r.id, r.rating, r.review, r.date, u1.name AS rater_name
            FROM ratings r JOIN users u1 ON u1.id = r.rater_id
            WHERE r.rated_user_id = ? AND r.group_id = ?
            ORDER BY r.date DESC
        """, (m["id"], group_id)).fetchall()
        reviews = [{"id": r["id"], "rater": r["rater_name"], "ratedUser": m["name"], "rating": r["rating"], "review": r["review"] or "", "date": r["date"]} for r in rows]
        avg = f"{sum(r['rating'] for r in rows) / len(rows):.1f}" if rows else None
        result[m["name"]] = {"average": avg, "reviews": reviews}
    conn.close()
    return jsonify(result)


@app.route("/api/ratings/average/<user_name>", methods=["GET"])
@auth_required
def get_rating_average(user_name):
    conn = get_db()
    u = conn.execute("SELECT id FROM users WHERE name = ?", (user_name,)).fetchone()
    conn.close()
    if not u:
        return jsonify(average=None, count=0)
    conn = get_db()
    row = conn.execute("SELECT AVG(rating) as avg, COUNT(*) as count FROM ratings WHERE rated_user_id = ?", (u["id"],)).fetchone()
    conn.close()
    avg = f"{row['avg']:.1f}" if row["avg"] is not None else None
    return jsonify(average=avg, count=row["count"])


@app.route("/api/notifications", methods=["GET"])
@auth_required
def get_notifications():
    conn = get_db()
    rows = conn.execute("SELECT id, message, type, read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100", (request.user_id,)).fetchall()
    conn.close()
    out = [{"id": r["id"], "message": r["message"], "type": r["type"] or "info", "read": bool(r["read"]), "timestamp": r["created_at"], "created_at": r["created_at"]} for r in rows]
    return jsonify(out)


@app.route("/api/notifications", methods=["POST"])
@auth_required
def add_notification():
    data = request.get_json() or {}
    message = data.get("message")
    if not message:
        return jsonify(error="Message required"), 400
    ntype = data.get("type") or "info"
    conn = get_db()
    res = conn.execute("INSERT INTO notifications (user_id, message, type) VALUES (?, ?, ?)", (request.user_id, message, ntype))
    nid = res.lastrowid
    conn.commit()
    conn.close()
    return jsonify(id=nid, message=message, type=ntype), 201


@app.route("/api/notifications/<int:nid>/read", methods=["PATCH"])
@auth_required
def mark_notification_read(nid):
    conn = get_db()
    conn.execute("UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?", (nid, request.user_id))
    conn.commit()
    conn.close()
    return jsonify(ok=True)


@app.route("/api/notifications", methods=["DELETE"])
@auth_required
def clear_notifications():
    conn = get_db()
    conn.execute("DELETE FROM notifications WHERE user_id = ?", (request.user_id,))
    conn.commit()
    conn.close()
    return jsonify(ok=True)


@app.route("/api/places", methods=["GET"])
@auth_required
def get_places():
    conn = get_db()
    rows = conn.execute("""
        SELECT p.id, p.name, p.location, p.type, p.description, p.created_at, u.name AS added_by_name
        FROM places p
        JOIN users u ON u.id = p.added_by_id
        ORDER BY p.created_at DESC
    """).fetchall()
    conn.close()
    out = [{"id": r["id"], "name": r["name"], "location": r["location"], "type": r["type"], "description": r["description"] or "", "addedBy": r["added_by_name"], "createdAt": r["created_at"]} for r in rows]
    return jsonify(out)


@app.route("/api/places", methods=["POST"])
@auth_required
def add_place():
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    location = (data.get("location") or "").strip()
    ptype = data.get("type") or ""
    description = (data.get("description") or "").strip()
    if not name or not location or not ptype:
        return jsonify(error="Name, location and type required"), 400
    conn = get_db()
    res = conn.execute("INSERT INTO places (name, location, type, description, added_by_id) VALUES (?, ?, ?, ?, ?)", (name, location, ptype, description, request.user_id))
    pid = res.lastrowid
    row = row_to_dict(conn.execute("SELECT id, name, location, type, description, created_at FROM places WHERE id = ?", (pid,)).fetchone())
    conn.commit()
    conn.close()
    return jsonify(id=row["id"], name=row["name"], location=row["location"], type=row["type"], description=row["description"] or "", addedBy=request.user_name, createdAt=row["created_at"]), 201


@app.route("/api/me", methods=["GET"])
@auth_required
def me():
    return jsonify(id=request.user_id, name=request.user_name, email=request.user_email, role="student")


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve(path):
    if path and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, "index.html")


if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=PORT, debug=False)
