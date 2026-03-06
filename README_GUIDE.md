# Study Mate – README Guide

Overview and how to get started with the project.

---

## What Is Study Mate?

Study Mate is a web app for students to find study groups, add courses, join or create groups, rate peers, and use an AI assistant for study help.

---

## Project Layout

- **index.html** – Main app (landing, login, dashboard, groups, courses, places)
- **styles.css** – All styling
- **script.js** – App logic (auth, groups, courses, ratings, AI)
- **supabase-schema.sql** – Run in Supabase to create tables
- **supabase-config.example.js** – Copy to `supabase-config.js` and add your Supabase URL and key
- **server.js** / **app.py** – Optional backends (Node or Python)

---

## How to Run It

1. **Supabase:** Create a project at supabase.com, run `supabase-schema.sql`, add your URL and anon key to `supabase-config.js`.
2. **Run:** `npx serve .` then open the URL in your browser (e.g. http://localhost:3000).
3. **Sign up** and log in to use the app.

---

## Main Features

- Dashboard with groups, courses, ratings
- Courses: add and search by code or name
- Groups: create (2–5 members) or find and join
- Rate and review peers
- Study places
- Notifications and AI assistant
- Dark/light theme

---

## Documentation Folders

- **Documentation** – SRS, Gantt chart
- **User_Documentation** – User guide, study guide, screenshots
- **Deployment_Setup** – INSTALL.md
- **SourceCode** – Source code overview
