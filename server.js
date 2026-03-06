/**
 * Study Mate Backend
 * Express server with SQLite. Handles auth, courses, groups, ratings, notifications, places.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'study-mate-secret-change-in-production';
const DB_PATH = path.join(__dirname, 'study_mate.db');

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const db = new Database(DB_PATH);

function initDb() {
    db.exec(`
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
    `);

    const courseCount = db.prepare('SELECT COUNT(*) as c FROM courses').get();
    if (courseCount.c === 0) {
        db.prepare("INSERT INTO courses (code, name) VALUES ('CS101', 'Introduction to Computer Science'), ('MATH201', 'Calculus II'), ('PHYS150', 'Physics Fundamentals')").run();
    }
}

function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    const token = authHeader.slice(7);
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.userId = payload.userId;
        req.userName = payload.name;
        req.userEmail = payload.email;
        next();
    } catch (e) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

initDb();

app.post('/api/register', (req, res) => {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email and password required' });
    }
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
        return res.status(400).json({ error: 'Email already registered' });
    }
    const passwordHash = bcrypt.hashSync(password, 10);
    const run = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(name.trim(), email.trim().toLowerCase(), passwordHash, 'student');
    const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(run.lastInsertRowid);
    const token = jwt.sign({ userId: user.id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }
    const user = db.prepare('SELECT id, name, email, password_hash, role FROM users WHERE email = ?').get(email.trim().toLowerCase());
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = jwt.sign({ userId: user.id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.get('/api/courses', authMiddleware, (req, res) => {
    const rows = db.prepare(`
        SELECT c.id, c.code, c.name FROM courses c
        INNER JOIN user_courses uc ON uc.course_id = c.id AND uc.user_id = ?
        ORDER BY c.code
    `).all(req.userId);
    res.json(rows);
});

app.get('/api/courses/search', authMiddleware, (req, res) => {
    const q = (req.query.q || '').trim().toLowerCase();
    let rows;
    if (q) {
        rows = db.prepare('SELECT id, code, name FROM courses WHERE LOWER(code) LIKE ? OR LOWER(name) LIKE ? ORDER BY code').all(`%${q}%`, `%${q}%`);
    } else {
        rows = db.prepare('SELECT id, code, name FROM courses ORDER BY code').all();
    }
    res.json(rows);
});

app.post('/api/courses', authMiddleware, (req, res) => {
    const { code, name } = req.body || {};
    if (!code || !name) {
        return res.status(400).json({ error: 'Course code and name required' });
    }
    const codeUpper = code.trim().toUpperCase();
    const existing = db.prepare('SELECT id FROM courses WHERE code = ?').get(codeUpper);
    let courseId;
    if (existing) {
        courseId = existing.id;
    } else {
        const run = db.prepare('INSERT INTO courses (code, name) VALUES (?, ?)').run(codeUpper, name.trim());
        courseId = run.lastInsertRowid;
    }
    try {
        db.prepare('INSERT OR IGNORE INTO user_courses (user_id, course_id) VALUES (?, ?)').run(req.userId, courseId);
    } catch (e) {}
    const course = db.prepare('SELECT id, code, name FROM courses WHERE id = ?').get(courseId);
    res.status(201).json(course);
});

app.get('/api/groups', authMiddleware, (req, res) => {
    const rows = db.prepare(`
        SELECT g.id, g.name, g.course, g.goal, g.max_members, g.description, g.created_by_id,
               u.name AS created_by_name
        FROM groups g
        INNER JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = ?
        LEFT JOIN users u ON u.id = g.created_by_id
        ORDER BY g.id DESC
    `).all(req.userId);
    const groups = rows.map(row => {
        const members = db.prepare('SELECT u.name FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.group_id = ?').all(row.id).map(r => r.name);
        return {
            id: row.id,
            name: row.name,
            course: row.course,
            goal: row.goal,
            maxMembers: row.max_members,
            currentMembers: members.length,
            members,
            description: row.description,
            createdBy: row.created_by_name
        };
    });
    res.json(groups);
});

app.get('/api/groups/all', authMiddleware, (req, res) => {
    const rows = db.prepare(`
        SELECT g.id, g.name, g.course, g.goal, g.max_members, g.description, u.name AS created_by_name
        FROM groups g
        LEFT JOIN users u ON u.id = g.created_by_id
        ORDER BY g.id DESC
    `).all();
    const groups = rows.map(row => {
        const members = db.prepare('SELECT u.name FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.group_id = ?').all(row.id).map(r => r.name);
        return {
            id: row.id,
            name: row.name,
            course: row.course,
            goal: row.goal,
            maxMembers: row.max_members,
            currentMembers: members.length,
            members,
            description: row.description,
            createdBy: row.created_by_name
        };
    });
    res.json(groups);
});

app.post('/api/groups', authMiddleware, (req, res) => {
    const { name, course, goal, maxMembers, description } = req.body || {};
    if (!name || !course || !goal) {
        return res.status(400).json({ error: 'Name, course and goal required' });
    }
    const max = Math.min(5, Math.max(2, parseInt(maxMembers, 10) || 5));
    const run = db.prepare('INSERT INTO groups (name, course, goal, max_members, description, created_by_id) VALUES (?, ?, ?, ?, ?, ?)').run(name.trim(), course, goal, max, (description || '').trim(), req.userId);
    const groupId = run.lastInsertRowid;
    db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)').run(groupId, req.userId);
    const members = [req.userName];
    res.status(201).json({
        id: groupId,
        name: name.trim(),
        course,
        goal,
        maxMembers: max,
        currentMembers: 1,
        members,
        description: (description || '').trim(),
        createdBy: req.userName
    });
});

app.get('/api/groups/:id', authMiddleware, (req, res) => {
    const groupId = parseInt(req.params.id, 10);
    const row = db.prepare(`
        SELECT g.id, g.name, g.course, g.goal, g.max_members, g.description, u.name AS created_by_name
        FROM groups g
        LEFT JOIN users u ON u.id = g.created_by_id
        WHERE g.id = ?
    `).get(groupId);
    if (!row) return res.status(404).json({ error: 'Group not found' });
    const members = db.prepare('SELECT u.name FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.group_id = ?').all(groupId).map(r => r.name);
    res.json({
        id: row.id,
        name: row.name,
        course: row.course,
        goal: row.goal,
        maxMembers: row.max_members,
        currentMembers: members.length,
        members,
        description: row.description || '',
        createdBy: row.created_by_name
    });
});

app.get('/api/users', authMiddleware, (req, res) => {
    const rows = db.prepare('SELECT id, name, email, role FROM users WHERE role = ? ORDER BY name').all('student');
    res.json(rows.map(r => ({ id: r.id, name: r.name, email: r.email, role: r.role })));
});

app.post('/api/groups/:id/join', authMiddleware, (req, res) => {
    const groupId = parseInt(req.params.id, 10);
    const group = db.prepare('SELECT id, max_members, name FROM groups WHERE id = ?').get(groupId);
    if (!group) {
        return res.status(404).json({ error: 'Group not found' });
    }
    const memberCount = db.prepare('SELECT COUNT(*) as c FROM group_members WHERE group_id = ?').get(groupId).c;
    if (memberCount >= group.max_members) {
        return res.status(400).json({ error: 'Group is full' });
    }
    try {
        db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)').run(groupId, req.userId);
    } catch (e) {
        return res.status(400).json({ error: 'Already in this group' });
    }
    const groupRow = db.prepare('SELECT course FROM groups WHERE id = ?').get(groupId);
    if (groupRow) {
        const courseRow = db.prepare('SELECT id FROM courses WHERE code = ?').get(groupRow.course);
        if (courseRow) {
            db.prepare('INSERT OR IGNORE INTO user_courses (user_id, course_id) VALUES (?, ?)').run(req.userId, courseRow.id);
        }
    }
    const members = db.prepare('SELECT u.name FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.group_id = ?').all(groupId).map(r => r.name);
    const fullGroup = db.prepare('SELECT g.id, g.name, g.course, g.goal, g.max_members, g.description, u.name AS created_by_name FROM groups g LEFT JOIN users u ON u.id = g.created_by_id WHERE g.id = ?').get(groupId);
    res.json({
        id: groupId,
        name: fullGroup.name,
        course: fullGroup.course,
        goal: fullGroup.goal,
        maxMembers: fullGroup.max_members,
        currentMembers: members.length,
        members,
        description: fullGroup.description || '',
        createdBy: fullGroup.created_by_name
    });
});

app.get('/api/ratings', authMiddleware, (req, res) => {
    const forUser = req.query.for_user;
    if (forUser) {
        const u = db.prepare('SELECT id FROM users WHERE name = ?').get(forUser);
        if (!u) return res.json([]);
        const rows = db.prepare(`
            SELECT r.id, r.rating, r.review, r.date, r.group_id,
                   u1.name AS rater_name, u2.name AS rated_user_name
            FROM ratings r
            JOIN users u1 ON u1.id = r.rater_id
            JOIN users u2 ON u2.id = r.rated_user_id
            WHERE r.rated_user_id = ?
            ORDER BY r.date DESC
        `).all(u.id);
        return res.json(rows.map(r => ({
            id: r.id,
            rater: r.rater_name,
            ratedUser: r.rated_user_name,
            rating: r.rating,
            review: r.review || '',
            groupId: r.group_id,
            date: r.date
        })));
    }
    const rows = db.prepare(`
        SELECT r.id, r.rating, r.review, r.date, r.group_id,
               u1.name AS rater_name, u2.name AS rated_user_name
        FROM ratings r
        JOIN users u1 ON u1.id = r.rater_id
        JOIN users u2 ON u2.id = r.rated_user_id
        WHERE r.rated_user_id = ?
        ORDER BY r.date DESC
    `).all(req.userId);
    res.json(rows.map(r => ({
        id: r.id,
        rater: r.rater_name,
        ratedUser: r.rated_user_name,
        rating: r.rating,
        review: r.review || '',
        groupId: r.group_id,
        date: r.date
    })));
});

app.post('/api/ratings', authMiddleware, (req, res) => {
    const { ratedUserName, groupId, rating, review } = req.body || {};
    if (!ratedUserName || !groupId || rating == null) {
        return res.status(400).json({ error: 'ratedUserName, groupId and rating required' });
    }
    const ratedUser = db.prepare('SELECT id FROM users WHERE name = ?').get(ratedUserName);
    if (!ratedUser) {
        return res.status(400).json({ error: 'User not found' });
    }
    const existing = db.prepare('SELECT id FROM ratings WHERE rater_id = ? AND rated_user_id = ? AND group_id = ?').get(req.userId, ratedUser.id, groupId);
    if (existing) {
        return res.status(400).json({ error: 'You have already rated this user for this group' });
    }
    const r = Math.min(5, Math.max(1, parseInt(rating, 10) || 5));
    const date = new Date().toISOString().split('T')[0];
    const run = db.prepare('INSERT INTO ratings (rater_id, rated_user_id, group_id, rating, review, date) VALUES (?, ?, ?, ?, ?, ?)').run(req.userId, ratedUser.id, groupId, r, (review || '').trim(), date);
    res.status(201).json({ id: run.lastInsertRowid, rating: r, review: (review || '').trim(), date });
});

app.get('/api/groups/:id/member-ratings', authMiddleware, (req, res) => {
    const groupId = parseInt(req.params.id, 10);
    const members = db.prepare('SELECT u.id, u.name FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.group_id = ?').all(groupId);
    const result = {};
    for (const m of members) {
        const rows = db.prepare(`
            SELECT r.id, r.rating, r.review, r.date, u1.name AS rater_name
            FROM ratings r JOIN users u1 ON u1.id = r.rater_id
            WHERE r.rated_user_id = ? AND r.group_id = ?
            ORDER BY r.date DESC
        `).all(m.id, groupId);
        const reviews = rows.map(r => ({ id: r.id, rater: r.rater_name, ratedUser: m.name, rating: r.rating, review: r.review || '', date: r.date }));
        const avg = rows.length ? (rows.reduce((s, r) => s + r.rating, 0) / rows.length).toFixed(1) : null;
        result[m.name] = { average: avg, reviews };
    }
    res.json(result);
});

app.get('/api/ratings/average/:userName', authMiddleware, (req, res) => {
    const u = db.prepare('SELECT id FROM users WHERE name = ?').get(req.params.userName);
    if (!u) return res.json({ average: null, count: 0 });
    const row = db.prepare('SELECT AVG(rating) as avg, COUNT(*) as count FROM ratings WHERE rated_user_id = ?').get(u.id);
    res.json({ average: row.avg ? Number(row.avg).toFixed(1) : null, count: row.count });
});

app.get('/api/notifications', authMiddleware, (req, res) => {
    const rows = db.prepare('SELECT id, message, type, read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100').all(req.userId);
    res.json(rows.map(r => ({
        id: r.id,
        message: r.message,
        type: r.type || 'info',
        read: !!r.read,
        timestamp: r.created_at,
        created_at: r.created_at
    })));
});

app.post('/api/notifications', authMiddleware, (req, res) => {
    const { message, type } = req.body || {};
    if (!message) return res.status(400).json({ error: 'Message required' });
    const run = db.prepare('INSERT INTO notifications (user_id, message, type) VALUES (?, ?, ?)').run(req.userId, message, type || 'info');
    res.status(201).json({ id: run.lastInsertRowid, message, type: type || 'info' });
});

app.patch('/api/notifications/:id/read', authMiddleware, (req, res) => {
    db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
    res.json({ ok: true });
});

app.delete('/api/notifications', authMiddleware, (req, res) => {
    db.prepare('DELETE FROM notifications WHERE user_id = ?').run(req.userId);
    res.json({ ok: true });
});

app.get('/api/places', authMiddleware, (req, res) => {
    const rows = db.prepare(`
        SELECT p.id, p.name, p.location, p.type, p.description, p.created_at, u.name AS added_by_name
        FROM places p
        JOIN users u ON u.id = p.added_by_id
        ORDER BY p.created_at DESC
    `).all();
    res.json(rows.map(r => ({
        id: r.id,
        name: r.name,
        location: r.location,
        type: r.type,
        description: r.description || '',
        addedBy: r.added_by_name,
        createdAt: r.created_at
    })));
});

app.post('/api/places', authMiddleware, (req, res) => {
    const { name, location, type, description } = req.body || {};
    if (!name || !location || !type) {
        return res.status(400).json({ error: 'Name, location and type required' });
    }
    const run = db.prepare('INSERT INTO places (name, location, type, description, added_by_id) VALUES (?, ?, ?, ?, ?)').run(name.trim(), location.trim(), type, (description || '').trim(), req.userId);
    const row = db.prepare('SELECT p.id, p.name, p.location, p.type, p.description, p.created_at FROM places p WHERE p.id = ?').get(run.lastInsertRowid);
    res.status(201).json({
        id: row.id,
        name: row.name,
        location: row.location,
        type: row.type,
        description: row.description || '',
        addedBy: req.userName,
        createdAt: row.created_at
    });
});

app.get('/api/me', authMiddleware, (req, res) => {
    res.json({ id: req.userId, name: req.userName, email: req.userEmail, role: 'student' });
});

app.get('*', (req, res) => {
    const p = path.join(__dirname, 'index.html');
    if (fs.existsSync(p)) {
        res.sendFile(p);
    } else {
        res.status(404).send('Not found');
    }
});

app.listen(PORT, () => {
    console.log('Study Mate server running at http://localhost:' + PORT);
});
