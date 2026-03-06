# Study Mate

**A web application for connecting students with study groups and peer collaboration.**

---

## Repository Information

- **GitHub Repository URL**: *https://github.com/Aicha447-web/Study-Mate-2026*
- **Instructor Collaborator**: abenaprimo *(add as collaborator in Settings → Collaborators)*
- **Team Members**: @0169-ui

---

## Overview

Study Mate helps students find study partners based on shared courses and academic goals. The platform enables group creation, peer rating, course search, and collaboration tracking. Data is stored in **Supabase** (recommended) or an optional local backend.

### Features

- **Smart Group Matching** – Find study groups by course and goal
- **Group Management** – Create and join groups (2–5 members)
- **Course Management** – Add courses, search by code or name
- **Peer Rating System** – Rate and review peers after collaboration
- **AI Assistant** – Study tips and AI-powered group formation
- **Notifications** – In-app notification panel
- **Study Places** – Add and browse study locations
- **Dark/Light Mode** – Theme toggle
- **Responsive Design** – Works on desktop, tablet, and mobile

---

## Repository Structure

```
Study mate 2026/
├── Documentation/           # SRS, Gantt chart (add your PDFs)
│   └── README.md
├── SourceCode/             # Source code structure documentation
│   └── README.md
├── Deployment_Setup/        # Installation and deployment
│   └── INSTALL.md
├── User_Documentation/     # User guide and screenshots
│   └── USER_GUIDE.md
├── index.html              # Main application
├── styles.css              # Styling
├── script.js               # Application logic
├── supabase-schema.sql     # Database schema (run in Supabase)
├── supabase-config.example.js  # Config template
├── server.js               # Node.js backend (optional)
├── app.py                  # Python backend (optional)
├── package.json
├── requirements.txt
├── .gitignore
└── README.md               # This file
```

---

## Artifact Checklist

| Artifact | Location |
|----------|----------|
| Revised SRS (PDF) | `Documentation/` |
| Revised SRS (source) | `Documentation/` |
| Gantt chart | In SRS or `Documentation/` |
| Source code | Repository root + `SourceCode/README.md` |
| INSTALL.md | `Deployment_Setup/INSTALL.md` |
| Dependencies | `package.json`, `requirements.txt`, `Deployment_Setup/INSTALL.md` |
| USER_GUIDE.md | `User_Documentation/USER_GUIDE.md` |
| Screenshots | `User_Documentation/USER_GUIDE.md` (add images) |

---

## Quick Start

1. **Supabase (recommended)**  
   - Create project at [supabase.com](https://supabase.com)  
   - Run `supabase-schema.sql` in SQL Editor  
   - Copy `supabase-config.example.js` to `supabase-config.js` and add your URL and anon key  

2. **Run the app**  
   ```bash
   npx serve .
   ```  
   Open the URL shown (e.g., `http://localhost:3000`)

3. **Sign up** and start using Study Mate

For full instructions, see [Deployment_Setup/INSTALL.md](Deployment_Setup/INSTALL.md).

---

## Technical Stack

- **Frontend**: HTML, CSS, JavaScript
- **Backend**: Supabase (PostgreSQL + Auth) or Node.js (Express + SQLite) or Python (Flask + SQLite)
- **Auth**: Supabase Auth or JWT

---

## License

This project is available for educational and personal use.
