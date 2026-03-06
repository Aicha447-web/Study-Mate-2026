const state = {
    user: null,
    role: null,
    email: null,
    userId: null,
    courses: [],
    groups: [],
    projects: [],
    users: [],
    ratings: [],
    notifications: [],
    places: []
};

const API_BASE = '';
const TOKEN_KEY = 'study_mate_token';
let useBackend = false;

const supabaseClient = (typeof window !== 'undefined'
    && (window.supabase || window.Supabase)
    && window.SUPABASE_URL
    && window.SUPABASE_ANON_KEY
    && window.SUPABASE_URL.indexOf('YOUR_PROJECT') === -1)
    ? (window.supabase || window.Supabase).createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
    : null;
const useSupabase = !!supabaseClient;

function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}
function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
}
function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
}
function authHeaders() {
    const token = getToken();
    return token ? { Authorization: 'Bearer ' + token } : {};
}
async function apiGet(path) {
    const res = await fetch(API_BASE + path, { headers: authHeaders() });
    if (res.status === 401) { clearToken(); throw new Error('Unauthorized'); }
    return res;
}
async function apiPost(path, body) {
    const res = await fetch(API_BASE + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body)
    });
    if (res.status === 401) { clearToken(); throw new Error('Unauthorized'); }
    return res;
}
async function apiPatch(path, body) {
    const res = await fetch(API_BASE + path, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body)
    });
    if (res.status === 401) { clearToken(); throw new Error('Unauthorized'); }
    return res;
}
async function apiDelete(path) {
    const res = await fetch(API_BASE + path, { method: 'DELETE', headers: authHeaders() });
    if (res.status === 401) { clearToken(); throw new Error('Unauthorized'); }
    return res;
}

async function loadInitialDataFromApi() {
    const [coursesRes, groupsRes, ratingsRes, notifRes, placesRes, usersRes] = await Promise.all([
        apiGet('/api/courses'),
        apiGet('/api/groups'),
        apiGet('/api/ratings'),
        apiGet('/api/notifications'),
        apiGet('/api/places'),
        apiGet('/api/users')
    ]);
    state.courses = coursesRes.ok ? await coursesRes.json() : [];
    state.groups = groupsRes.ok ? await groupsRes.json() : [];
    state.ratings = ratingsRes.ok ? await ratingsRes.json() : [];
    state.notifications = notifRes.ok ? (await notifRes.json()).map(n => ({ id: n.id, message: n.message, type: n.type || 'info', read: !!n.read, timestamp: new Date(n.timestamp || n.created_at || Date.now()) })) : [];
    state.places = placesRes.ok ? await placesRes.json() : [];
    state.users = usersRes.ok ? await usersRes.json() : [];
}

async function loadInitialDataFromSupabase() {
    if (!supabaseClient || !state.userId) return;
    const uid = state.userId;
    const { data: ucData } = await supabaseClient.from('user_courses').select('courses(id, code, name)').eq('user_id', uid);
    state.courses = (ucData || []).map(r => r.courses).filter(Boolean);
    const { data: gmData } = await supabaseClient.from('group_members').select('group_id, groups(*)').eq('user_id', uid);
    const myGroups = (gmData || []).map(r => ({ ...r.groups, group_id: r.group_id })).filter(r => r.id);
    const withMembers = await Promise.all(myGroups.map(async (g) => {
        const { data: members } = await supabaseClient.from('group_members').select('profiles(name)').eq('group_id', g.id);
        const names = (members || []).map(m => m.profiles?.name).filter(Boolean);
        const creator = await supabaseClient.from('profiles').select('name').eq('id', g.created_by_id).single();
        return { id: g.id, name: g.name, course: g.course, goal: g.goal, maxMembers: g.max_members, currentMembers: names.length, members: names, description: g.description || '', createdBy: creator.data?.name || '' };
    }));
    state.groups = withMembers;
    const { data: ratingsData } = await supabaseClient.from('ratings').select('*').eq('rated_user_id', uid).order('date', { ascending: false });
    const raterIds = [...new Set((ratingsData || []).map(r => r.rater_id))];
    const raterNames = {};
    if (raterIds.length) {
        const { data: profs } = await supabaseClient.from('profiles').select('id, name').in('id', raterIds);
        (profs || []).forEach(p => { raterNames[p.id] = p.name; });
    }
    state.ratings = (ratingsData || []).map(r => ({ id: r.id, rater: raterNames[r.rater_id] || '', ratedUser: state.user, rating: r.rating, review: r.review || '', groupId: r.group_id, date: r.date }));
    const { data: notifData } = await supabaseClient.from('notifications').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(100);
    state.notifications = (notifData || []).map(n => ({ id: n.id, message: n.message, type: n.type || 'info', read: !!n.read, timestamp: new Date(n.created_at) }));
    const { data: placesData } = await supabaseClient.from('places').select('*').order('created_at', { ascending: false });
    const placeIds = (placesData || []).map(p => p.added_by_id);
    const addedByNames = {};
    if (placeIds.length) {
        const { data: placeProfs } = await supabaseClient.from('profiles').select('id, name').in('id', [...new Set(placeIds)]);
        (placeProfs || []).forEach(pr => { addedByNames[pr.id] = pr.name; });
    }
    state.places = (placesData || []).map(p => ({ id: p.id, name: p.name, location: p.location, type: p.type, description: p.description || '', addedBy: addedByNames[p.added_by_id] || '', createdAt: p.created_at }));
    const { data: profilesData } = await supabaseClient.from('profiles').select('id, name').eq('role', 'student');
    state.users = (profilesData || []).map(p => ({ id: p.id, name: p.name, email: '', role: 'student' }));
}

const sampleData = {
    courses: [
        { id: 1, code: 'CS101', name: 'Introduction to Computer Science' },
        { id: 2, code: 'MATH201', name: 'Calculus II' },
        { id: 3, code: 'PHYS150', name: 'Physics Fundamentals' }
    ],
    groups: [
        {
            id: 1,
            name: 'CS101 Study Group',
            course: 'CS101',
            goal: 'exam-prep',
            maxMembers: 5,
            currentMembers: 3,
            members: ['Alice', 'Bob', 'Charlie'],
            description: 'Preparing for midterm exam',
            createdBy: 'Alice'
        },
        {
            id: 2,
            name: 'MATH201 Project Team',
            course: 'MATH201',
            goal: 'project',
            maxMembers: 4,
            currentMembers: 2,
            members: ['David', 'Eve'],
            description: 'Working on group project',
            createdBy: 'David'
        }
    ],
    projects: [
        {
            id: 1,
            name: 'Web Application Project',
            groupId: 1,
            groupName: 'CS101 Study Group',
            dueDate: '2026-02-15',
            description: 'Build a full-stack web application',
            progress: 45,
            status: 'in-progress'
        }
    ]
};

async function init() {
    loadTheme();
    setupLanding();
    setupLogin();
    setupApp();
    setupThemeToggle();

    if (useSupabase) {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session?.user) {
            useBackend = true;
            state.userId = session.user.id;
            state.email = session.user.email || '';
            const { data: profile } = await supabaseClient.from('profiles').select('name, role').eq('id', state.userId).single();
            state.user = profile?.name || session.user.user_metadata?.name || session.user.email?.split('@')[0] || '';
            state.role = profile?.role || 'student';
            await loadInitialDataFromSupabase();
            document.getElementById('landingPage').style.display = 'none';
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('app').style.display = 'block';
            document.getElementById('currentUserName').textContent = state.user;
            document.getElementById('currentUserRole').textContent = 'Student';
            updateDashboard();
            renderGroups();
            renderCourses();
            renderNotifications();
            updateNotificationBadge();
            renderPlaces();
            return;
        }
    }

    const token = getToken();
    if (token) {
        try {
            const res = await apiGet('/api/me');
            if (res.ok) {
                const me = await res.json();
                useBackend = true;
                state.user = me.name;
                state.email = me.email;
                state.role = me.role || 'student';
                state.userId = me.id;
                await loadInitialDataFromApi();
                document.getElementById('landingPage').style.display = 'none';
                document.getElementById('loginScreen').style.display = 'none';
                document.getElementById('app').style.display = 'block';
                document.getElementById('currentUserName').textContent = me.name;
                document.getElementById('currentUserRole').textContent = 'Student';
                updateDashboard();
                renderGroups();
                renderCourses();
                renderNotifications();
                updateNotificationBadge();
                renderPlaces();
                return;
            }
        } catch (e) {}
        clearToken();
    }
    state.courses = [...sampleData.courses];
    state.groups = [...sampleData.groups];
    state.projects = [...sampleData.projects];
}

function setupLanding() {
    const getStartedBtns = ['getStartedBtn', 'heroGetStartedBtn', 'ctaGetStartedBtn'];
    getStartedBtns.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.onclick = showLogin;
    });

    const heroLoginBtn = document.getElementById('heroLoginBtn');
    if (heroLoginBtn) {
        heroLoginBtn.onclick = () => {
            showLogin();
            document.getElementById('loginForm').style.display = 'block';
            document.getElementById('registerForm').style.display = 'none';
        };
    }
    
    document.querySelectorAll('a[href^="#"]').forEach(link => {
        link.onclick = (e) => {
            e.preventDefault();
            const target = document.querySelector(link.getAttribute('href'));
            if (target) target.scrollIntoView({ behavior: 'smooth' });
        };
    });
}

function setupLogin() {
    const backBtn = document.getElementById('backToLandingBtn');
    if (backBtn) backBtn.onclick = showLanding;
    
    const showRegisterLink = document.getElementById('showRegister');
    const showLoginLink = document.getElementById('showLogin');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    
    if (showRegisterLink) {
        showRegisterLink.onclick = (e) => {
            e.preventDefault();
            loginForm.style.display = 'none';
            registerForm.style.display = 'block';
        };
    }
    
    if (showLoginLink) {
        showLoginLink.onclick = (e) => {
            e.preventDefault();
            registerForm.style.display = 'none';
            loginForm.style.display = 'block';
        };
    }
    
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) loginBtn.onclick = handleLogin;
    
    const registerBtn = document.getElementById('registerBtn');
    if (registerBtn) registerBtn.onclick = handleRegister;
    
    const loginEmail = document.getElementById('loginEmail');
    const loginPassword = document.getElementById('loginPassword');
    if (loginEmail && loginPassword) {
        [loginEmail, loginPassword].forEach(input => {
            input.onkeypress = (e) => {
                if (e.key === 'Enter') handleLogin();
            };
        });
    }
    
    const registerName = document.getElementById('registerName');
    const registerEmail = document.getElementById('registerEmail');
    const registerPassword = document.getElementById('registerPassword');
    if (registerName && registerEmail && registerPassword) {
        [registerName, registerEmail, registerPassword].forEach(input => {
            input.onkeypress = (e) => {
                if (e.key === 'Enter') handleRegister();
            };
        });
    }
}

async function handleLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
        alert('Please enter both email and password');
        return;
    }

    if (useSupabase) {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (!error && data?.session?.user) {
            useBackend = true;
            state.userId = data.session.user.id;
            state.email = data.session.user.email || '';
            const { data: profile } = await supabaseClient.from('profiles').select('name, role').eq('id', state.userId).single();
            state.user = profile?.name || data.session.user.user_metadata?.name || email.split('@')[0] || '';
            state.role = profile?.role || 'student';
            await loadInitialDataFromSupabase();
            document.getElementById('landingPage').style.display = 'none';
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('app').style.display = 'block';
            document.getElementById('currentUserName').textContent = state.user;
            document.getElementById('currentUserRole').textContent = 'Student';
            document.getElementById('loginEmail').value = '';
            document.getElementById('loginPassword').value = '';
            addNotification('Welcome back!', 'success');
            updateDashboard();
            renderGroups();
            renderCourses();
            renderNotifications();
            updateNotificationBadge();
            renderPlaces();
            return;
        }
        if (error) {
            alert(error.message || 'Invalid email or password');
            return;
        }
    }

    try {
        const res = await fetch(API_BASE + '/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.token && data.user) {
            useBackend = true;
            setToken(data.token);
            state.user = data.user.name;
            state.email = data.user.email;
            state.role = data.user.role || 'student';
            state.userId = data.user.id;
            await loadInitialDataFromApi();
            document.getElementById('landingPage').style.display = 'none';
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('app').style.display = 'block';
            document.getElementById('currentUserName').textContent = data.user.name;
            document.getElementById('currentUserRole').textContent = 'Student';
            document.getElementById('loginEmail').value = '';
            document.getElementById('loginPassword').value = '';
            addNotification('Welcome back!', 'success');
            updateDashboard();
            renderGroups();
            renderCourses();
            renderNotifications();
            updateNotificationBadge();
            renderPlaces();
            return;
        }
    } catch (e) {}

    const user = state.users.find(u => u.email === email && u.password === password);
    if (!user) {
        alert('Invalid email or password');
        return;
    }
    state.user = user.name;
    state.email = user.email;
    state.role = user.role;
    document.getElementById('landingPage').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    document.getElementById('currentUserName').textContent = user.name;
    document.getElementById('currentUserRole').textContent = 'Student';
    document.getElementById('loginEmail').value = '';
    document.getElementById('loginPassword').value = '';
    addNotification('Welcome back!', 'success');
    updateDashboard();
    renderGroups();
    renderCourses();
}

async function handleRegister() {
    const name = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;

    if (!name || !email || !password) {
        alert('Please fill in all fields');
        return;
    }

    if (useSupabase) {
        const { data, error } = await supabaseClient.auth.signUp({ email, password, options: { data: { name } } });
        if (error) {
            alert(error.message || 'Sign up failed');
            return;
        }
        if (data?.session) {
            useBackend = true;
            state.userId = data.session.user.id;
            state.email = data.session.user.email || '';
            state.user = name;
            state.role = 'student';
            await loadInitialDataFromSupabase();
            document.getElementById('landingPage').style.display = 'none';
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('app').style.display = 'block';
            document.getElementById('currentUserName').textContent = name;
            document.getElementById('currentUserRole').textContent = 'Student';
            document.getElementById('registerName').value = '';
            document.getElementById('registerEmail').value = '';
            document.getElementById('registerPassword').value = '';
            addNotification('Welcome to Study Mate!', 'success');
            updateDashboard();
            renderGroups();
            renderCourses();
            renderNotifications();
            updateNotificationBadge();
            renderPlaces();
            return;
        }
        alert('Check your email to confirm your account, then log in.');
        return;
    }

    try {
        const res = await fetch(API_BASE + '/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password })
        });
        const data = await res.json().catch(() => ({}));
        if ((res.ok || res.status === 201) && data.token && data.user) {
            useBackend = true;
            setToken(data.token);
            state.user = data.user.name;
            state.email = data.user.email;
            state.role = data.user.role || 'student';
            state.userId = data.user.id;
            await loadInitialDataFromApi();
            document.getElementById('landingPage').style.display = 'none';
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('app').style.display = 'block';
            document.getElementById('currentUserName').textContent = data.user.name;
            document.getElementById('currentUserRole').textContent = 'Student';
            document.getElementById('registerName').value = '';
            document.getElementById('registerEmail').value = '';
            document.getElementById('registerPassword').value = '';
            addNotification('Welcome to Study Mate!', 'success');
            updateDashboard();
            renderGroups();
            renderCourses();
            renderNotifications();
            updateNotificationBadge();
            renderPlaces();
            return;
        }
        if (res.status === 400 && data.error) {
            alert(data.error);
            return;
        }
    } catch (e) {}

    if (state.users.some(u => u.email === email)) {
        alert('Email already registered');
        return;
    }
    const newUser = {
        id: state.users.length + 1,
        name: name,
        email: email,
        password: password,
        role: 'student',
        courses: []
    };
    state.users.push(newUser);
    state.user = name;
    state.email = email;
    state.role = 'student';
    document.getElementById('landingPage').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    document.getElementById('currentUserName').textContent = name;
    document.getElementById('currentUserRole').textContent = 'Student';
    document.getElementById('registerName').value = '';
    document.getElementById('registerEmail').value = '';
    document.getElementById('registerPassword').value = '';
    addNotification('Welcome to Study Mate!', 'success');
    updateDashboard();
    renderGroups();
    renderCourses();
}

function setupApp() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.onclick = async () => {
        if (useSupabase && supabaseClient) await supabaseClient.auth.signOut();
        state.user = null;
        state.role = null;
        state.email = null;
        state.userId = null;
        clearToken();
        showLanding();
    };
    
    document.querySelectorAll('.nav-item').forEach(link => {
        link.onclick = (e) => {
            e.preventDefault();
            const view = link.dataset.view;
            switchView(view);
        };
    });
    
    document.getElementById('createGroupBtn').onclick = () => {
        openModal('createGroupModal');
        populateSelect('groupCourse', state.courses, 'code', 'name');
    };
    
    document.getElementById('addCourseBtn').onclick = () => openModal('addCourseModal');
    document.getElementById('addPlaceBtn').onclick = () => openModal('addPlaceModal');
    document.getElementById('findMatchesBtn').onclick = findMatches;
    
    document.getElementById('createGroupForm').onsubmit = handleCreateGroup;
    document.getElementById('addCourseForm').onsubmit = handleAddCourse;
    document.getElementById('addPlaceForm').onsubmit = handleAddPlace;
    document.getElementById('rateForm').onsubmit = handleRateSubmit;
    
    const courseSearch = document.getElementById('courseSearch');
    if (courseSearch) {
        courseSearch.oninput = renderCourses;
    }
    
    document.querySelectorAll('.close').forEach(btn => {
        btn.onclick = (e) => closeModal(e.target.closest('.modal'));
    });
    
    document.querySelectorAll('.modal').forEach(modal => {
        modal.onclick = (e) => {
            if (e.target === modal) closeModal(modal);
        };
    });

    setupNotifications();
    setupAIAssistant();
    renderPlaces();
}

function setupThemeToggle() {
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const landingThemeToggleBtn = document.getElementById('landingThemeToggleBtn');
    
    if (themeToggleBtn) {
        themeToggleBtn.onclick = toggleTheme;
    }
    
    if (landingThemeToggleBtn) {
        landingThemeToggleBtn.onclick = toggleTheme;
    }
}

function toggleTheme() {
    const body = document.body;
    const themeIcon = document.getElementById('themeIcon');
    const landingThemeIcon = document.getElementById('landingThemeIcon');
    const isLightMode = body.classList.contains('light-mode');
    
    if (isLightMode) {
        body.classList.remove('light-mode');
        if (themeIcon) themeIcon.className = 'ui-icon icon-sun';
        if (landingThemeIcon) landingThemeIcon.className = 'ui-icon icon-sun';
        localStorage.setItem('theme', 'dark');
    } else {
        body.classList.add('light-mode');
        if (themeIcon) themeIcon.className = 'ui-icon icon-moon';
        if (landingThemeIcon) landingThemeIcon.className = 'ui-icon icon-moon';
        localStorage.setItem('theme', 'light');
    }
}

function loadTheme() {
    const savedTheme = localStorage.getItem('theme');
    const body = document.body;
    const themeIcon = document.getElementById('themeIcon');
    const landingThemeIcon = document.getElementById('landingThemeIcon');
    
    if (savedTheme === 'light') {
        body.classList.add('light-mode');
        if (themeIcon) themeIcon.className = 'ui-icon icon-moon';
        if (landingThemeIcon) landingThemeIcon.className = 'ui-icon icon-moon';
    } else {
        body.classList.remove('light-mode');
        if (themeIcon) themeIcon.className = 'ui-icon icon-sun';
        if (landingThemeIcon) landingThemeIcon.className = 'ui-icon icon-sun';
    }
}

function showLanding() {
    document.getElementById('landingPage').style.display = 'block';
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('app').style.display = 'none';
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('registerForm').style.display = 'none';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showLogin() {
    document.getElementById('landingPage').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function switchView(viewName) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(l => l.classList.remove('active'));
    
    const view = document.getElementById(viewName + 'View');
    if (view) view.classList.add('active');
    
    const link = document.querySelector(`[data-view="${viewName}"]`);
    if (link) link.classList.add('active');
    
    if (viewName === 'matching') findMatches();
    if (viewName === 'places') renderPlaces();
}

function updateDashboard() {
    const userGroups = state.groups.filter(g =>
        (g.members && g.members.includes(state.user)) || g.createdBy === state.user
    );
    const userCourses = state.courses;
    const userRatings = state.ratings.filter(r => r.ratedUser === state.user);
    document.getElementById('totalGroups').textContent = userGroups.length;
    document.getElementById('totalCourses').textContent = userCourses.length;
    document.getElementById('activeProjects').textContent = userRatings.length;
    document.getElementById('completedTasks').textContent =
        userGroups.filter(g => g.currentMembers >= g.maxMembers).length;
}

function renderGroups() {
    const grid = document.getElementById('groupsGrid');
    const userGroups = state.groups.filter(g =>
        (g.members && g.members.includes(state.user)) || g.createdBy === state.user
    );
    if (userGroups.length === 0) {
        grid.innerHTML = '<p>No groups yet</p>';
        return;
    }
    grid.innerHTML = userGroups.map(g => `
        <div class="group-card" onclick="openGroupDetail(${g.id})">
            <h3>${escape(g.name)}</h3>
            <p style="color: indigo; margin: 0.5rem 0; font-weight: 600;">${escape(g.course)}</p>
            <p style="color: slategray; margin: 1rem 0;">${escape(g.description || '')}</p>
            <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid lightgray; color: slategray;">
                ${g.currentMembers}/${g.maxMembers} members
            </div>
        </div>
    `).join('');
}

function renderCourses() {
    const list = document.getElementById('coursesList');
    const searchInput = document.getElementById('courseSearch');
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    
    let filteredCourses = state.courses;
    if (searchTerm) {
        filteredCourses = state.courses.filter(c => 
            c.code.toLowerCase().includes(searchTerm) || 
            c.name.toLowerCase().includes(searchTerm)
        );
    }
    
    if (filteredCourses.length === 0) {
        list.innerHTML = '<p>No courses found</p>';
        return;
    }
    
    list.innerHTML = filteredCourses.map(c => `
        <div class="course-card">
            <h3 style="color: indigo; margin-bottom: 0.5rem; font-weight: 600;">${escape(c.code)}</h3>
            <p>${escape(c.name)}</p>
        </div>
    `).join('');
}


async function handleCreateGroup(e) {
    e.preventDefault();
    const form = e.target;
    const name = document.getElementById('groupName').value;
    const course = document.getElementById('groupCourse').value;
    const goal = document.getElementById('groupGoal').value;
    const maxMembersInput = parseInt(document.getElementById('groupMaxMembers').value, 10);
    const maxMembers = Math.max(2, Math.min(5, maxMembersInput));
    const description = document.getElementById('groupDescription').value;

    if (useSupabase && supabaseClient) {
        const { data: newGroup, error } = await supabaseClient.from('groups').insert({ name, course, goal, max_members: maxMembers, description, created_by_id: state.userId }).select().single();
        if (!error && newGroup) {
            await supabaseClient.from('group_members').insert({ group_id: newGroup.id, user_id: state.userId });
            state.groups.push({ id: newGroup.id, name: newGroup.name, course: newGroup.course, goal: newGroup.goal, maxMembers: newGroup.max_members, currentMembers: 1, members: [state.user], description: newGroup.description || '', createdBy: state.user });
            closeModal(document.getElementById('createGroupModal'));
            form.reset();
            renderGroups();
            updateDashboard();
            addNotification('Created group: ' + newGroup.name, 'success');
            return;
        }
        if (error) alert(error.message);
        return;
    }
    if (useBackend) {
        try {
            const res = await apiPost('/api/groups', { name, course, goal, maxMembers, description });
            if (res.ok) {
                const newGroup = await res.json();
                state.groups.push(newGroup);
                closeModal(document.getElementById('createGroupModal'));
                form.reset();
                renderGroups();
                updateDashboard();
                addNotification('Created group: ' + newGroup.name, 'success');
                return;
            }
        } catch (err) {}
    }
    const newGroup = {
        id: state.groups.length + 1,
        name,
        course,
        goal,
        maxMembers,
        currentMembers: 1,
        members: [state.user],
        description,
        createdBy: state.user
    };
    state.groups.push(newGroup);
    closeModal(document.getElementById('createGroupModal'));
    form.reset();
    renderGroups();
    updateDashboard();
    addNotification('Created group: ' + newGroup.name, 'success');
}

async function handleAddCourse(e) {
    e.preventDefault();
    const form = e.target;
    const code = document.getElementById('courseCode').value.trim().toUpperCase();
    const name = document.getElementById('courseName').value.trim();
    if (!code || !name) {
        alert('Course code and name required');
        return;
    }
    if (useSupabase && supabaseClient) {
        const { data: existing } = await supabaseClient.from('courses').select('id, code, name').eq('code', code).maybeSingle();
        let courseId = existing?.id;
        if (!existing) {
            const { data: inserted } = await supabaseClient.from('courses').insert({ code, name }).select('id, code, name').single();
            if (inserted) courseId = inserted.id;
        }
        if (courseId) {
            await supabaseClient.from('user_courses').upsert({ user_id: state.userId, course_id: courseId }, { onConflict: 'user_id,course_id' });
            const c = existing || (await supabaseClient.from('courses').select('id, code, name').eq('id', courseId).single()).data;
            if (c && !state.courses.some(x => x.code === c.code)) state.courses.push(c);
        }
        closeModal(document.getElementById('addCourseModal'));
        form.reset();
        renderCourses();
        updateDashboard();
        addNotification('Added course: ' + code, 'success');
        return;
    }
    if (useBackend) {
        try {
            const res = await apiPost('/api/courses', { code, name });
            if (res.ok || res.status === 201) {
                const newCourse = await res.json();
                if (!state.courses.some(c => c.code === newCourse.code)) {
                    state.courses.push(newCourse);
                }
                closeModal(document.getElementById('addCourseModal'));
                form.reset();
                renderCourses();
                updateDashboard();
                addNotification('Added course: ' + code, 'success');
                return;
            }
            const data = await res.json().catch(() => ({}));
            if (data.error) alert(data.error);
            return;
        } catch (err) {}
    }
    if (state.courses.some(c => c.code === code)) {
        alert('Course already exists');
        return;
    }
    const newCourse = { id: state.courses.length + 1, code, name };
    state.courses.push(newCourse);
    const currentUser = state.users.find(u => u.email === state.email);
    if (currentUser && !currentUser.courses) currentUser.courses = [];
    if (currentUser && !currentUser.courses.includes(code)) currentUser.courses.push(code);
    closeModal(document.getElementById('addCourseModal'));
    form.reset();
    renderCourses();
    updateDashboard();
    addNotification('Added course: ' + code, 'success');
}


async function findMatches() {
    const courseFilter = document.getElementById('courseFilter').value;
    const goalFilter = document.getElementById('goalFilter').value;
    const list = document.getElementById('matchesList');

    let allGroups = state.groups;
    if (useSupabase && supabaseClient) {
        const { data: groupsData } = await supabaseClient.from('groups').select('*, group_members(profiles(name))');
        if (groupsData?.length) {
            const creatorIds = [...new Set(groupsData.map(g => g.created_by_id))];
            const { data: creators } = await supabaseClient.from('profiles').select('id, name').in('id', creatorIds);
            const creatorNames = {};
            (creators || []).forEach(c => { creatorNames[c.id] = c.name; });
            allGroups = groupsData.map(g => ({
                id: g.id,
                name: g.name,
                course: g.course,
                goal: g.goal,
                maxMembers: g.max_members,
                currentMembers: (g.group_members || []).length,
                members: (g.group_members || []).map(m => m.profiles?.name).filter(Boolean),
                description: g.description || '',
                createdBy: creatorNames[g.created_by_id] || ''
            }));
        }
    } else if (useBackend) {
        try {
            const res = await apiGet('/api/groups/all');
            if (res.ok) allGroups = await res.json();
        } catch (e) {}
    }

    let matches = allGroups.filter(g => {
        if (g.members && g.members.includes(state.user)) return false;
        if (courseFilter && g.course !== courseFilter) return false;
        if (goalFilter && g.goal !== goalFilter) return false;
        return g.currentMembers < g.maxMembers;
    });

    matches = matches.map(g => {
        let score = 50;
        if (state.courses.some(c => c.code === g.course)) score += 30;
        score += 20;
        return { ...g, matchScore: Math.min(score, 100) };
    });
    matches.sort((a, b) => b.matchScore - a.matchScore);

    if (matches.length === 0) {
        list.innerHTML = '<p>No matching groups found</p>';
    } else {
        list.innerHTML = matches.map(m => `
            <div class="match-card">
                <div style="background: green; color: white; padding: 0.25rem 0.75rem; border-radius: 1rem; font-size: 0.75rem; display: inline-block; margin-bottom: 1rem;">
                    ${m.matchScore}% Match
                </div>
                <h3>${escape(m.name)}</h3>
                <p style="color: indigo; font-weight: 600;">${escape(m.course)}</p>
                <p style="color: slategray; margin: 1rem 0;">${escape(m.description || '')}</p>
                <p style="color: slategray; margin-top: 1rem;">${m.currentMembers}/${m.maxMembers} members</p>
                <button class="btn-primary" style="width: 100%; margin-top: 1rem;" onclick="joinGroup(${m.id})">
                    Join Group
                </button>
            </div>
        `).join('');
    }

    const courseSelect = document.getElementById('courseFilter');
    const current = courseSelect.value;
    courseSelect.innerHTML = '<option value="">All Courses</option>' +
        state.courses.map(c => `<option value="${escape(c.code)}">${escape(c.code)}</option>`).join('');
    courseSelect.value = current;
}

async function joinGroup(id) {
    if (useSupabase && supabaseClient) {
        const { data: groupRow, error: joinErr } = await supabaseClient.from('group_members').insert({ group_id: id, user_id: state.userId }).select().maybeSingle();
        if (joinErr) {
            alert(joinErr.message || 'Could not join group');
            return;
        }
        const { data: g } = await supabaseClient.from('groups').select('course').eq('id', id).single();
        if (g?.course) {
            const { data: c } = await supabaseClient.from('courses').select('id').eq('code', g.course).maybeSingle();
            if (c) await supabaseClient.from('user_courses').upsert({ user_id: state.userId, course_id: c.id }, { onConflict: 'user_id,course_id' });
        }
        await loadInitialDataFromSupabase();
        renderGroups();
        findMatches();
        updateDashboard();
        addNotification('You joined the group', 'success');
        alert('Successfully joined the group');
        return;
    }
    if (useBackend) {
        try {
            const res = await apiPost('/api/groups/' + id + '/join', {});
            if (res.ok) {
                const data = await res.json();
                const existing = state.groups.find(g => g.id === id);
                if (existing) {
                    existing.members = data.members;
                    existing.currentMembers = data.currentMembers;
                } else {
                    state.groups.push({ id: data.id, name: data.name, currentMembers: data.currentMembers, members: data.members, maxMembers: data.maxMembers, course: data.course, goal: data.goal, description: data.description, createdBy: data.createdBy });
                }
                const groupsRes = await apiGet('/api/groups');
                if (groupsRes.ok) state.groups = await groupsRes.json();
                renderGroups();
                findMatches();
                updateDashboard();
                addNotification('You joined ' + data.name, 'success');
                alert('Successfully joined ' + data.name);
                return;
            }
            const err = await res.json().catch(() => ({}));
            alert(err.error || 'Could not join group');
            return;
        } catch (e) {
            alert('Could not join group');
            return;
        }
    }
    const group = state.groups.find(g => g.id === id);
    if (!group || (group.members && group.members.includes(state.user))) {
        alert('Already in this group or group not found');
        return;
    }
    if (group.currentMembers >= group.maxMembers) {
        alert('Group is full');
        return;
    }
    group.members.push(state.user);
    group.currentMembers = group.members.length;
    const currentUser = state.users.find(u => u.email === state.email);
    if (currentUser && !currentUser.courses) currentUser.courses = [];
    if (currentUser && group.course && !currentUser.courses.includes(group.course)) currentUser.courses.push(group.course);
    renderGroups();
    findMatches();
    updateDashboard();
    addNotification('You joined ' + group.name, 'success');
    alert('Successfully joined ' + group.name);
}

function getAverageRating(userName) {
    const userRatings = state.ratings.filter(r => r.ratedUser === userName);
    if (userRatings.length === 0) return null;
    const sum = userRatings.reduce((acc, r) => acc + r.rating, 0);
    return (sum / userRatings.length).toFixed(1);
}

function getReviewsForUser(userName) {
    return state.ratings.filter(r => r.ratedUser === userName);
}

function hasRatedUser(raterName, ratedUserName) {
    return state.ratings.some(r => r.rater === raterName && r.ratedUser === ratedUserName);
}

function starIcons(count) {
    const n = Math.max(0, Math.min(5, Number(count) || 0));
    return Array.from({ length: n }).map(() => `<span class="ui-star" aria-hidden="true"></span>`).join('');
}

async function openGroupDetail(id) {
    let group = state.groups.find(g => g.id === id);
    let memberRatings = {};

    if (useSupabase && supabaseClient) {
        const { data: g } = await supabaseClient.from('groups').select('*').eq('id', id).single();
        if (g) {
            const { data: gm } = await supabaseClient.from('group_members').select('profiles(name)').eq('group_id', id);
            const members = (gm || []).map(m => m.profiles?.name).filter(Boolean);
            const { data: creator } = await supabaseClient.from('profiles').select('name').eq('id', g.created_by_id).single();
            group = { id: g.id, name: g.name, course: g.course, goal: g.goal, maxMembers: g.max_members, currentMembers: members.length, members, description: g.description || '', createdBy: creator?.name || '' };
            const { data: ratingRows } = await supabaseClient.from('ratings').select('rated_user_id, rating, review, rater_id').eq('group_id', id);
            const ratedIds = [...new Set((ratingRows || []).map(r => r.rated_user_id))];
            const { data: ratedProfs } = await supabaseClient.from('profiles').select('id, name').in('id', ratedIds);
            const { data: raterProfs } = await supabaseClient.from('profiles').select('id, name').in('id', [...new Set((ratingRows || []).map(r => r.rater_id))]);
            const ratedNames = {}; (ratedProfs || []).forEach(p => { ratedNames[p.id] = p.name; });
            const raterNames = {}; (raterProfs || []).forEach(p => { raterNames[p.id] = p.name; });
            memberRatings = {};
            (ratingRows || []).forEach(r => {
                const name = ratedNames[r.rated_user_id];
                if (!name) return;
                if (!memberRatings[name]) memberRatings[name] = { average: 0, reviews: [], sum: 0, count: 0 };
                memberRatings[name].reviews.push({ rater: raterNames[r.rater_id] || '', review: r.review || '', rating: r.rating });
                memberRatings[name].sum += r.rating;
                memberRatings[name].count += 1;
            });
            Object.keys(memberRatings).forEach(name => {
                const d = memberRatings[name];
                d.average = d.count ? Math.round((d.sum / d.count) * 10) / 10 : 0;
            });
        }
    } else if (useBackend && !group) {
        try {
            const res = await apiGet('/api/groups/' + id);
            if (res.ok) group = await res.json();
        } catch (e) {}
    } else if (useBackend && group) {
        try {
            const res = await apiGet('/api/groups/' + id + '/member-ratings');
            if (res.ok) memberRatings = await res.json();
        } catch (e) {}
    }

    if (!group) return;

    const content = document.getElementById('groupDetailContent');
    const isMember = group.members && group.members.includes(state.user);
    const canRate = isMember;
    const members = group.members || [];

    content.innerHTML = `
        <h2>${escape(group.name)}</h2>
        <p style="color: rgba(168, 85, 247, 0.95); font-weight: 650;">${escape(group.course)}</p>
        <p style="color: rgba(255, 255, 255, 0.72); margin: 1rem 0;">${escape(group.description || '')}</p>
        <h3 style="margin-top: 2rem;">Members (${group.currentMembers}/${group.maxMembers})</h3>
        <div class="modal-grid-1" style="margin-top: 0.75rem;">
        ${members.map(m => {
            const data = memberRatings[m] || {};
            const avgRating = useBackend ? data.average : getAverageRating(m);
            const reviews = useBackend ? (data.reviews || []) : getReviewsForUser(m);
            const hasRated = useBackend ? reviews.some(r => r.rater === state.user) : hasRatedUser(state.user, m);
            return `
            <div style="padding: 1rem; background: rgba(31, 41, 55, 0.55); border: 1px solid rgba(255, 255, 255, 0.10); border-radius: 1rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.75rem;">
                    <div style="flex: 1;">
                        <span style="font-weight: 650; color: rgba(255, 255, 255, 0.92);">${escape(m)}</span>
                        ${m === group.createdBy ? '<span style="background: rgba(168, 85, 247, 0.18); color: rgba(255,255,255,0.92); padding: 0.22rem 0.65rem; border: 1px solid rgba(168, 85, 247, 0.35); border-radius: 1rem; font-size: 0.72rem; margin-left: 0.55rem; font-weight: 650;">Admin</span>' : ''}
                        ${avgRating ? `<span style="color: rgba(168, 85, 247, 0.95); margin-left: 0.55rem; font-weight: 600;" onclick="showUserReviews('${escape(m).replace(/'/g, "\\'")}')" title="Click to view reviews"><span class="ui-star" aria-hidden="true"></span> ${escape(avgRating)} (${reviews.length})</span>` : '<span style="color: rgba(255,255,255,0.48); margin-left: 0.55rem; font-size: 0.9rem;">No ratings yet</span>'}
                    </div>
                    ${canRate && m !== state.user && !hasRated ? `<button class="btn-small" onclick="openRateModal('${escape(m).replace(/'/g, "\\'")}', ${id})" style="margin-left: 1rem;">Rate</button>` : ''}
                </div>
            </div>
        `;
        }).join('')}
        </div>
    `;

    openModal('groupDetailModal');
}

function openRateModal(userName, groupId) {
    document.getElementById('rateUserName').textContent = userName;
    document.getElementById('rateGroupId').value = groupId;
    document.getElementById('rateRating').value = '5';
    document.getElementById('rateReview').value = '';
    closeModal(document.getElementById('groupDetailModal'));
    openModal('rateModal');
}

async function handleRateSubmit(e) {
    e.preventDefault();
    const userName = document.getElementById('rateUserName').textContent;
    const groupId = parseInt(document.getElementById('rateGroupId').value, 10);
    const rating = parseInt(document.getElementById('rateRating').value, 10);
    const review = document.getElementById('rateReview').value.trim();

    if (useSupabase && supabaseClient) {
        const { data: ratedProfile } = await supabaseClient.from('profiles').select('id').eq('name', userName).maybeSingle();
        if (!ratedProfile) { alert('User not found'); return; }
        const { error: rateErr } = await supabaseClient.from('ratings').insert({ rater_id: state.userId, rated_user_id: ratedProfile.id, group_id: groupId, rating, review, date: new Date().toISOString().slice(0, 10) });
        if (rateErr) { alert(rateErr.message || 'Could not submit rating'); return; }
        const { data: ratingsList } = await supabaseClient.from('ratings').select('*').eq('rated_user_id', state.userId).order('date', { ascending: false });
        const raterIds = [...new Set((ratingsList || []).map(r => r.rater_id))];
        const { data: profs } = await supabaseClient.from('profiles').select('id, name').in('id', raterIds);
        const names = {}; (profs || []).forEach(p => { names[p.id] = p.name; });
        state.ratings = (ratingsList || []).map(r => ({ id: r.id, rater: names[r.rater_id], ratedUser: state.user, rating: r.rating, review: r.review || '', groupId: r.group_id, date: r.date }));
        closeModal(document.getElementById('rateModal'));
        openGroupDetail(groupId);
        addNotification('You rated ' + userName, 'info');
        alert('Rating submitted successfully');
        return;
    }
    if (useBackend) {
        try {
            const res = await apiPost('/api/ratings', { ratedUserName: userName, groupId, rating, review });
            if (res.ok || res.status === 201) {
                const listRes = await apiGet('/api/ratings');
                if (listRes.ok) state.ratings = await listRes.json();
                closeModal(document.getElementById('rateModal'));
                openGroupDetail(groupId);
                addNotification('You rated ' + userName, 'info');
                alert('Rating submitted successfully');
                return;
            }
            const data = await res.json().catch(() => ({}));
            alert(data.error || 'Could not submit rating');
            return;
        } catch (err) {}
    }

    if (hasRatedUser(state.user, userName)) {
        alert('You have already rated this user');
        return;
    }
    state.ratings.push({
        id: state.ratings.length + 1,
        rater: state.user,
        ratedUser: userName,
        rating,
        review,
        groupId,
        date: new Date().toISOString().split('T')[0]
    });
    closeModal(document.getElementById('rateModal'));
    openGroupDetail(groupId);
    addNotification('You rated ' + userName, 'info');
    alert('Rating submitted successfully');
}

async function showUserReviews(userName) {
    let reviews = getReviewsForUser(userName);
    let avgRating = getAverageRating(userName);
    if (useSupabase && supabaseClient) {
        const { data: prof } = await supabaseClient.from('profiles').select('id').eq('name', userName).maybeSingle();
        if (prof) {
            const { data: ratingRows } = await supabaseClient.from('ratings').select('rating, review, rater_id').eq('rated_user_id', prof.id).order('date', { ascending: false });
            const raterIds = [...new Set((ratingRows || []).map(r => r.rater_id))];
            const { data: raterProfs } = await supabaseClient.from('profiles').select('id, name').in('id', raterIds);
            const raterNames = {}; (raterProfs || []).forEach(p => { raterNames[p.id] = p.name; });
            reviews = (ratingRows || []).map(r => ({ rater: raterNames[r.rater_id] || '', rating: r.rating, review: r.review || '' }));
            avgRating = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : null;
        }
    } else if (useBackend) {
        try {
            const res = await apiGet('/api/ratings?for_user=' + encodeURIComponent(userName));
            if (res.ok) {
                reviews = await res.json();
                avgRating = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : null;
            }
        } catch (e) {}
    }
    const content = document.getElementById('reviewsContent');
    if (reviews.length === 0) {
        content.innerHTML = '<p>No reviews yet for ' + escape(userName) + '</p>';
    } else {
        content.innerHTML = `
            <h2>Reviews for ${escape(userName)}</h2>
            <div style="margin-bottom: 1.5rem; padding: 1rem; background: rgba(31, 41, 55, 0.55); border: 1px solid rgba(255, 255, 255, 0.10); border-radius: 1rem;">
                <div style="font-size: 2rem; color: rgba(168, 85, 247, 0.95); margin-bottom: 0.35rem; font-weight: 800;"><span class="ui-star" aria-hidden="true"></span> ${escape(avgRating)}</div>
                <div style="color: rgba(255,255,255,0.68);">Average rating from ${reviews.length} review${reviews.length > 1 ? 's' : ''}</div>
            </div>
            <div class="modal-grid-1">
                ${reviews.map(r => `
                    <div style="padding: 1rem; background: rgba(31, 41, 55, 0.55); border: 1px solid rgba(255, 255, 255, 0.10); border-radius: 1rem; border-left: 3px solid rgba(168, 85, 247, 0.7);">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                            <span style="font-weight: 650; color: rgba(255,255,255,0.92);">${escape(r.rater)}</span>
                            <span class="ui-stars" aria-label="${r.rating} out of 5 stars">${starIcons(r.rating)}</span>
                        </div>
                        ${r.review ? `<p style="color: rgba(255,255,255,0.72); margin-top: 0.5rem;">${escape(r.review)}</p>` : ''}
                        <div style="color: rgba(255,255,255,0.48); font-size: 0.85rem; margin-top: 0.5rem;">${r.date}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }
    openModal('reviewsModal');
}

function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeModal(modal) {
    if (modal) modal.classList.remove('active');
}

function populateSelect(id, items, valueKey, labelKey) {
    const select = document.getElementById(id);
    select.innerHTML = '<option value="">Select...</option>' +
        items.map(item => `<option value="${item[valueKey]}">${item[labelKey]}</option>`).join('');
}

function escape(str) {
    if (typeof str !== 'string') return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return str.replace(/[&<>"']/g, m => map[m]);
}

function setupNotifications() {
    const notificationBtn = document.getElementById('notificationBtn');
    const closeNotificationsBtn = document.getElementById('closeNotificationsBtn');
    const clearNotificationsBtn = document.getElementById('clearNotificationsBtn');
    const notificationPanel = document.getElementById('notificationPanel');

    if (notificationBtn) {
        notificationBtn.onclick = () => {
            notificationPanel.classList.toggle('open');
        };
    }

    if (closeNotificationsBtn) {
        closeNotificationsBtn.onclick = () => {
            notificationPanel.classList.remove('open');
        };
    }

    if (clearNotificationsBtn) {
        clearNotificationsBtn.onclick = async () => {
            if (useSupabase && supabaseClient) {
                await supabaseClient.from('notifications').delete().eq('user_id', state.userId);
            }
            if (useBackend && !useSupabase) {
                try {
                    await apiDelete('/api/notifications');
                } catch (e) {}
            }
            state.notifications = [];
            renderNotifications();
            updateNotificationBadge();
        };
    }

    renderNotifications();
    updateNotificationBadge();
}

async function addNotification(message, type = 'info') {
    const notification = {
        id: Date.now(),
        message: message,
        type: type,
        timestamp: new Date(),
        read: false
    };
    state.notifications.unshift(notification);
    if (useSupabase && supabaseClient) {
        await supabaseClient.from('notifications').insert({ user_id: state.userId, message, type });
    }
    if (useBackend && !useSupabase) {
        try {
            await apiPost('/api/notifications', { message, type });
        } catch (e) {}
    }
    renderNotifications();
    updateNotificationBadge();
}

function renderNotifications() {
    const list = document.getElementById('notificationList');
    if (!list) return;

    if (state.notifications.length === 0) {
        list.innerHTML = '<p style="color: rgba(255, 255, 255, 0.6); padding: 2rem; text-align: center;">No notifications</p>';
        return;
    }

    list.innerHTML = state.notifications.map(n => {
        const timeAgo = getTimeAgo(n.timestamp);
        return `
            <div class="notification-item ${n.read ? '' : 'unread'}" onclick="markNotificationRead(${n.id})">
                <p>${escape(n.message)}</p>
                <div class="notification-time">${timeAgo}</div>
            </div>
        `;
    }).join('');
}

function markNotificationRead(id) {
    const notification = state.notifications.find(n => n.id === id);
    if (notification) {
        notification.read = true;
        renderNotifications();
        updateNotificationBadge();
    }
}

function updateNotificationBadge() {
    const badge = document.getElementById('notificationBadge');
    const unreadCount = state.notifications.filter(n => !n.read).length;
    if (badge) {
        if (unreadCount > 0) {
            badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }
}

function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

function setupAIAssistant() {
    const aiBtn = document.getElementById('aiAssistantBtn');
    const closeAIBtn = document.getElementById('closeAIBtn');
    const aiSendBtn = document.getElementById('aiSendBtn');
    const aiInput = document.getElementById('aiInput');
    const aiPanel = document.getElementById('aiAssistantPanel');

    if (aiBtn) {
        aiBtn.onclick = () => {
            aiPanel.classList.toggle('open');
            if (aiPanel.classList.contains('open')) {
                aiInput.focus();
            }
        };
    }

    if (closeAIBtn) {
        closeAIBtn.onclick = () => {
            aiPanel.classList.remove('open');
        };
    }

    const sendMessage = () => {
        const message = aiInput.value.trim();
        if (!message) return;

        addAIMessage('user', message);
        aiInput.value = '';

        setTimeout(() => {
            const response = generateAIResponse(message);
            addAIMessage('assistant', response);
        }, 500);
    };

    if (aiSendBtn) {
        aiSendBtn.onclick = sendMessage;
    }

    if (aiInput) {
        aiInput.onkeypress = (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        };
    }
}

function addAIMessage(role, text) {
    const chat = document.getElementById('aiChat');
    const messageDiv = document.createElement('div');
    messageDiv.className = `ai-message ai-${role}`;
    const formattedText = escape(text).replace(/\n/g, '<br>');
    messageDiv.innerHTML = `<p>${formattedText}</p>`;
    chat.appendChild(messageDiv);
    chat.scrollTop = chat.scrollHeight;
}

function generateAIResponse(userMessage) {
    const lowerMessage = userMessage.toLowerCase();
    
    if (lowerMessage.includes('create group') || lowerMessage.includes('group students') || lowerMessage.includes('match students') || lowerMessage.includes('form group')) {
        return handleAIGroupCreation(userMessage);
    }
    
    if (lowerMessage.includes('study') || lowerMessage.includes('learn')) {
        return "Great question! For effective studying, try the Pomodoro Technique: 25 minutes of focused study followed by a 5-minute break. Also, active recall and spaced repetition are proven methods. Would you like tips for a specific subject?";
    }
    
    if (lowerMessage.includes('group') || lowerMessage.includes('collaborate')) {
        return "Study groups work best when members have clear roles and goals. Set regular meeting times, divide topics among members, and use active discussion rather than just reviewing notes together. Communication is key! You can also ask me to create groups by saying 'Create groups for CS101' or 'Group students by course'.";
    }
    
    if (lowerMessage.includes('course') || lowerMessage.includes('class')) {
        return "To succeed in your courses, stay organized with a planner, attend all classes, take active notes, and review material regularly rather than cramming. Don't hesitate to ask questions or seek help when needed!";
    }
    
    if (lowerMessage.includes('time') || lowerMessage.includes('schedule')) {
        return "Time management is crucial! Create a weekly schedule that includes classes, study time, breaks, and personal activities. Prioritize tasks using the Eisenhower Matrix: urgent/important, important/not urgent, urgent/not important, and neither.";
    }
    
    if (lowerMessage.includes('hello') || lowerMessage.includes('hi') || lowerMessage.includes('hey')) {
        return "Hello! I'm your AI study assistant. I can help with study tips, course advice, group collaboration strategies, time management, and creating study groups. Try saying 'Create groups for CS101' or 'Group students by course' to get started!";
    }
    
    return "I'm here to help with your studies! I can assist with study techniques, group collaboration, course management, time management, and creating study groups. Try saying 'Create groups for [course]' to group students!";
}

function handleAIGroupCreation(userMessage) {
    const lowerMessage = userMessage.toLowerCase();
    
    const courseMatch = userMessage.match(/\b([A-Z]{2,4}\d{3})\b/i) || 
                       state.courses.find(c => lowerMessage.includes(c.code.toLowerCase()) || lowerMessage.includes(c.name.toLowerCase()));
    
    const goalMatch = lowerMessage.includes('exam') || lowerMessage.includes('test') ? 'exam-prep' :
                     lowerMessage.includes('project') ? 'project' :
                     lowerMessage.includes('homework') || lowerMessage.includes('hw') ? 'homework' :
                     lowerMessage.includes('review') ? 'review' : null;
    
    const courseCode = courseMatch ? (typeof courseMatch === 'string' ? courseMatch : courseMatch.code) : null;
    const course = courseCode ? state.courses.find(c => c.code === courseCode) : null;
    
    const groupSizeMatch = userMessage.match(/\b(\d+)\s*(?:members?|people|students?)\b/i);
    const requestedSize = groupSizeMatch ? parseInt(groupSizeMatch[1]) : null;
    
    const result = createAIGroups(courseCode, goalMatch, requestedSize);
    
    if (result.success) {
        return result.message;
    } else {
        return result.message;
    }
}

function createAIGroups(courseCode, goal, requestedSize) {
    const allStudents = state.users.filter(u => u.role === 'student');
    
    if (allStudents.length < 2) {
        return {
            success: false,
            message: "I need at least 2 students to create groups. Currently, there aren't enough registered students. Please invite more students to join!"
        };
    }
    
    let studentsToGroup = [...allStudents];
    
    if (courseCode) {
        const course = state.courses.find(c => c.code === courseCode);
        if (!course) {
            return {
                success: false,
                message: `I couldn't find course ${courseCode}. Available courses are: ${state.courses.map(c => c.code).join(', ')}.`
            };
        }
        
        studentsToGroup = studentsToGroup.filter(s => {
            const userGroups = state.groups.filter(g => g.members.includes(s.name) && g.course === courseCode);
            const isInFullGroup = userGroups.some(g => g.currentMembers >= g.maxMembers);
            const hasCourse = (s.courses && s.courses.includes(courseCode)) || 
                            userGroups.length > 0;
            
            return hasCourse && !isInFullGroup;
        });
        
        if (studentsToGroup.length < 2) {
            return {
                success: false,
                message: `Not enough students available for ${courseCode}. Found ${studentsToGroup.length} student(s). Students need to add this course or join existing groups first.`
            };
        }
    } else {
        studentsToGroup = studentsToGroup.filter(s => {
            const userGroups = state.groups.filter(g => g.members.includes(s.name));
            const isInFullGroup = userGroups.some(g => g.currentMembers >= g.maxMembers);
            return !isInFullGroup;
        });
        
        if (studentsToGroup.length < 2) {
            return {
                success: false,
                message: `Not enough students available. Found ${studentsToGroup.length} student(s). Most students are already in full groups.`
            };
        }
    }
    
    const minGroupSize = 2;
    const maxGroupSize = 5;
    const targetSize = requestedSize ? Math.max(minGroupSize, Math.min(maxGroupSize, requestedSize)) : 
                      Math.min(maxGroupSize, Math.max(minGroupSize, Math.floor(studentsToGroup.length / 2)));
    
    if (studentsToGroup.length < minGroupSize) {
        return {
            success: false,
            message: `I need at least ${minGroupSize} students to create a group. Currently found ${studentsToGroup.length} student(s).`
        };
    }
    
    const groups = [];
    const usedStudents = new Set();
    let groupId = state.groups.length + 1;
    
    while (studentsToGroup.length - usedStudents.size >= minGroupSize) {
        const available = studentsToGroup.filter(s => !usedStudents.has(s.name));
        if (available.length < minGroupSize) break;
        
        const groupSize = Math.min(targetSize, available.length);
        const selected = [];
        
        for (let i = 0; i < groupSize && available.length > 0; i++) {
            const randomIndex = Math.floor(Math.random() * available.length);
            selected.push(available[randomIndex]);
            available.splice(randomIndex, 1);
        }
        
        if (selected.length >= minGroupSize) {
            const members = selected.map(s => s.name);
            const groupName = courseCode ? 
                `${courseCode} ${goal || 'Study'} Group ${groups.length + 1}` :
                `Study Group ${groups.length + 1}`;
            
            const newGroup = {
                id: groupId++,
                name: groupName,
                course: courseCode || state.courses[0]?.code || 'General',
                goal: goal || 'exam-prep',
                maxMembers: maxGroupSize,
                currentMembers: members.length,
                members: members,
                description: courseCode ? 
                    `AI-created group for ${courseCode}${goal ? ` - ${goal.replace('-', ' ')}` : ''}` :
                    `AI-created study group`,
                createdBy: 'AI Assistant'
            };
            
            groups.push(newGroup);
            members.forEach(name => usedStudents.add(name));
        } else {
            break;
        }
    }
    
    if (groups.length === 0) {
        return {
            success: false,
            message: "I couldn't create any groups. Make sure there are enough students available."
        };
    }
    
    groups.forEach(group => {
        state.groups.push(group);
    });
    
    renderGroups();
    updateDashboard();
    
    const courseName = courseCode ? state.courses.find(c => c.code === courseCode)?.name || courseCode : 'all courses';
    const goalText = goal ? ` for ${goal.replace('-', ' ')}` : '';
    
    groups.forEach(group => {
        addNotification(`AI created group: ${group.name}`, 'info');
    });
    
    return {
        success: true,
        message: `✅ Successfully created ${groups.length} group(s)${courseCode ? ` for ${courseCode}` : ''}${goalText}!\n\n` +
                `Groups created:\n` +
                groups.map((g, i) => `${i + 1}. ${g.name} (${g.members.length} members: ${g.members.join(', ')})`).join('\n') +
                `\n\nAll groups have ${minGroupSize}-${maxGroupSize} members as required. Check your Groups page to see them!`
    };
}

async function handleAddPlace(e) {
    e.preventDefault();
    const form = e.target;
    const name = document.getElementById('placeName').value.trim();
    const location = document.getElementById('placeLocation').value.trim();
    const type = document.getElementById('placeType').value;
    const description = document.getElementById('placeDescription').value.trim();

    if (useSupabase && supabaseClient) {
        const { data: newPlace, error } = await supabaseClient.from('places').insert({ name, location, type, description, added_by_id: state.userId }).select().single();
        if (!error && newPlace) {
            state.places.push({ id: newPlace.id, name: newPlace.name, location: newPlace.location, type: newPlace.type, description: newPlace.description || '', addedBy: state.user, createdAt: newPlace.created_at });
            closeModal(document.getElementById('addPlaceModal'));
            form.reset();
            renderPlaces();
            addNotification('Added new study place: ' + newPlace.name, 'success');
            return;
        }
    }
    if (useBackend && !useSupabase) {
        try {
            const res = await apiPost('/api/places', { name, location, type, description });
            if (res.ok || res.status === 201) {
                const newPlace = await res.json();
                state.places.push(newPlace);
                closeModal(document.getElementById('addPlaceModal'));
                form.reset();
                renderPlaces();
                addNotification('Added new study place: ' + newPlace.name, 'success');
                return;
            }
        } catch (err) {}
    }
    const newPlace = {
        id: state.places.length + 1,
        name,
        location,
        type,
        description,
        addedBy: state.user,
        createdAt: new Date().toISOString()
    };
    state.places.push(newPlace);
    closeModal(document.getElementById('addPlaceModal'));
    form.reset();
    renderPlaces();
    addNotification('Added new study place: ' + newPlace.name, 'success');
}

function renderPlaces() {
    const list = document.getElementById('placesList');
    if (!list) return;

    if (state.places.length === 0) {
        list.innerHTML = '<p>No study places added yet</p>';
        return;
    }

    list.innerHTML = state.places.map(p => `
        <div class="place-card">
            <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 0.75rem;">
                <h3 style="margin: 0;">
                    <span class="ui-icon icon-location" style="width: 18px; height: 18px; margin-right: 0.5rem;"></span>
                    ${escape(p.name)}
                </h3>
                <span class="place-type">${escape(p.type)}</span>
            </div>
            <p style="color: rgba(255, 255, 255, 0.7); font-size: 0.9rem; margin-bottom: 0.5rem;">
                <strong style="color: rgba(255, 255, 255, 0.85);">Location:</strong> ${escape(p.location)}
            </p>
            ${p.description ? `<p style="color: rgba(255, 255, 255, 0.65); font-size: 0.85rem; margin-top: 0.5rem;">${escape(p.description)}</p>` : ''}
            <p style="color: rgba(255, 255, 255, 0.5); font-size: 0.75rem; margin-top: 1rem;">
                Added by ${escape(p.addedBy)}
            </p>
        </div>
    `).join('');
}

window.joinGroup = joinGroup;
window.openGroupDetail = openGroupDetail;
window.openRateModal = openRateModal;
window.showUserReviews = showUserReviews;
window.markNotificationRead = markNotificationRead;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
