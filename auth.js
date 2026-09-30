// ==================== LOGIN & SAVED PROGRAMS (Supabase) ====================
//
// Keeps the app behind an invite-only login and saves each user's programs to
// the `programs` table (see supabase/setup.sql). The anon key is meant to be
// public: Row Level Security in the database is what keeps each user's data private.

const SUPABASE_URL = 'https://peyhmqotgmvhdwqhxrxk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBleWhtcW90Z212aGR3cWh4cnhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3ODU0NjUsImV4cCI6MjEwNjM2MTQ2NX0.DFY7jRaNGXgQLIvtO_kjXVkRf1V7FSYA2QO2c5s5UqM';

// Form fields saved alongside each program so loading it restores the configuration
const PROGRAM_SETTING_FIELDS = ['trainingAge', 'trainingGoal', 'splitType', 'duration', 'trainingBlock', 'blockLength', 'equipment'];

let supabaseClient = null;
let currentUser = null;
let appStarted = false;
let savedPrograms = [];
let activeProgramId = null;
let settingPasswordFromLink = false;

// ==================== AUTH SCREENS ====================

function showAuthView(view, subtitle) {
    document.getElementById('authOverlay').hidden = false;
    document.getElementById('loginForm').hidden = view !== 'login';
    document.getElementById('forgotForm').hidden = view !== 'forgot';
    document.getElementById('setPasswordForm').hidden = view !== 'setPassword';

    const titles = {
        login: 'Sign In',
        forgot: 'Reset Password',
        setPassword: 'Set Password',
        error: 'Sign In'
    };
    const subtitles = {
        login: 'Log in to your training dashboard.',
        forgot: "Enter your email and we'll send you a link to reset your password.",
        setPassword: 'Choose a password for your account.',
        error: ''
    };
    document.getElementById('authTitle').textContent = titles[view] ?? '';
    document.getElementById('authSubtitle').textContent = subtitle ?? subtitles[view] ?? '';
    setAuthMessage('');

    const firstInput = document.querySelector(`#${view}Form input`);
    if (firstInput) firstInput.focus();
}

function setAuthMessage(text, type) {
    const message = document.getElementById('authMessage');
    message.textContent = text;
    message.className = 'auth-message' + (type ? ` ${type}` : '');
}

function friendlyAuthError(error) {
    const message = error?.message || '';
    if (/invalid login credentials/i.test(message)) return 'Wrong email or password.';
    if (/email not confirmed/i.test(message)) return 'Your account has not been confirmed yet. Check your email for the invite link.';
    if (/rate limit/i.test(message)) return 'Too many attempts. Please wait a few minutes and try again.';
    if (/should be different/i.test(message)) return 'Your new password must be different from your old one.';
    if (/failed to fetch|network/i.test(message)) return "Can't reach the server. Check your connection and try again.";
    return message || 'Something went wrong. Please try again.';
}

async function withBusyButton(form, work) {
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
        await work();
    } finally {
        button.disabled = false;
    }
}

async function handleLogin(event) {
    event.preventDefault();
    const form = event.target;
    await withBusyButton(form, async () => {
        setAuthMessage('Logging in…');
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: document.getElementById('loginEmail').value.trim(),
            password: document.getElementById('loginPassword').value
        });
        if (error) {
            setAuthMessage(friendlyAuthError(error), 'error');
            return;
        }
        form.reset();
        await enterApp(data.user);
    });
}

async function handleForgotPassword(event) {
    event.preventDefault();
    const form = event.target;
    await withBusyButton(form, async () => {
        const { error } = await supabaseClient.auth.resetPasswordForEmail(
            document.getElementById('forgotEmail').value.trim(),
            { redirectTo: window.location.origin + window.location.pathname }
        );
        if (error) {
            setAuthMessage(friendlyAuthError(error), 'error');
            return;
        }
        setAuthMessage('If that email has an account, a reset link is on its way. Check your inbox.', 'success');
    });
}

async function handleSetPassword(event) {
    event.preventDefault();
    const form = event.target;
    const password = document.getElementById('newPassword').value;
    if (password !== document.getElementById('confirmPassword').value) {
        setAuthMessage("Passwords don't match.", 'error');
        return;
    }
    await withBusyButton(form, async () => {
        const { data, error } = await supabaseClient.auth.updateUser({ password });
        if (error) {
            setAuthMessage(friendlyAuthError(error), 'error');
            return;
        }
        form.reset();
        if (settingPasswordFromLink) {
            settingPasswordFromLink = false;
            await enterApp(data.user);
        } else {
            closeChangePassword();
            addChatMessage('Assistant', 'Your password has been updated.');
        }
    });
}

function showChangePassword() {
    document.getElementById('cancelSetPassword').hidden = false;
    showAuthView('setPassword', 'Choose a new password.');
}

function closeChangePassword() {
    document.getElementById('setPasswordForm').reset();
    document.getElementById('authOverlay').hidden = true;
}

async function signOut() {
    currentUser = null;
    await supabaseClient.auth.signOut({ scope: 'local' });
    // Reload so no previous user's program stays on screen
    window.location.reload();
}

// ==================== ENTERING THE APP ====================

async function enterApp(user) {
    currentUser = user;
    document.getElementById('authOverlay').hidden = true;
    document.getElementById('userEmail').textContent = user.email;
    document.getElementById('logoutButton').hidden = false;
    document.getElementById('changePasswordButton').hidden = false;

    if (appStarted) return;
    appStarted = true;

    await refreshSavedPrograms();
    if (savedPrograms.length > 0) {
        loadProgram(savedPrograms[0].id);
    } else {
        initializeApp();
    }
}

// ==================== SAVED PROGRAMS ====================

function setSavedProgramsStatus(text) {
    document.getElementById('savedProgramsStatus').textContent = text;
}

function isMissingTableError(error) {
    return error?.code === '42P01' || error?.code === 'PGRST205' || /could not find the table/i.test(error?.message || '');
}

async function refreshSavedPrograms() {
    const { data, error } = await supabaseClient
        .from('programs')
        .select('id, name, settings, plan, updated_at')
        .order('updated_at', { ascending: false });

    if (error) {
        console.error('Failed to load saved programs:', error);
        savedPrograms = [];
        setSavedProgramsStatus(isMissingTableError(error)
            ? 'Saving is not set up yet: run supabase/setup.sql in the Supabase SQL Editor.'
            : "Couldn't load your saved programs. Refresh the page to try again.");
        renderSavedPrograms();
        return;
    }

    savedPrograms = data;
    setSavedProgramsStatus(savedPrograms.length === 0
        ? 'No saved programs yet. Generate a program you like, then click "Save Program".'
        : '');
    renderSavedPrograms();
}

function formatSavedDate(isoString) {
    return new Date(isoString).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function renderSavedPrograms() {
    const list = document.getElementById('savedProgramsList');
    list.innerHTML = '';

    savedPrograms.forEach(program => {
        const item = document.createElement('li');
        item.className = 'saved-program' + (program.id === activeProgramId ? ' active' : '');

        const info = document.createElement('div');
        const name = document.createElement('div');
        name.className = 'saved-program-name';
        name.textContent = program.name + (program.id === activeProgramId ? ' (open)' : '');
        const date = document.createElement('div');
        date.className = 'saved-program-date';
        date.textContent = `Last saved ${formatSavedDate(program.updated_at)}`;
        info.append(name, date);

        const buttons = document.createElement('div');
        buttons.className = 'saved-program-buttons';
        const loadButton = document.createElement('button');
        loadButton.className = 'btn';
        loadButton.textContent = 'Open';
        loadButton.onclick = () => loadProgram(program.id);
        const deleteButton = document.createElement('button');
        deleteButton.className = 'btn btn-secondary';
        deleteButton.textContent = 'Delete';
        deleteButton.onclick = () => deleteProgram(program.id);
        buttons.append(loadButton, deleteButton);

        item.append(info, buttons);
        list.appendChild(item);
    });

    const hasActive = savedPrograms.some(program => program.id === activeProgramId);
    document.getElementById('saveProgramButton').textContent = hasActive ? 'Save Changes' : 'Save Program';
    document.getElementById('saveAsNewButton').hidden = !hasActive;
}

function readProgramSettings() {
    const settings = {};
    PROGRAM_SETTING_FIELDS.forEach(id => {
        const field = document.getElementById(id);
        if (field) settings[id] = field.value;
    });
    return settings;
}

function applyProgramSettings(settings) {
    PROGRAM_SETTING_FIELDS.forEach(id => {
        const field = document.getElementById(id);
        const value = settings?.[id];
        if (field && value !== undefined && [...field.options].some(option => option.value === value)) {
            field.value = value;
        }
    });
}

function suggestedProgramName() {
    const goal = document.getElementById('trainingGoal');
    const split = document.getElementById('splitType');
    const goalText = goal?.selectedOptions[0]?.textContent.replace(/\s*\(.*\)\s*$/, '').trim() || 'Program';
    const daysText = split?.selectedOptions[0]?.textContent.split(' - ')[0].trim() || '';
    const dateText = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return [goalText, daysText, dateText].filter(Boolean).join(' · ');
}

function escapeHTML(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function saveCurrentProgram(saveAsNew) {
    if (!currentPlan) {
        alert('Generate a program first, then save it.');
        return;
    }

    const updatingExisting = !saveAsNew && savedPrograms.some(program => program.id === activeProgramId);
    let name;
    if (!updatingExisting) {
        name = prompt('Name this program:', suggestedProgramName());
        if (name === null) return;
        name = name.trim().slice(0, 100) || suggestedProgramName();
    }

    const buttons = [document.getElementById('saveProgramButton'), document.getElementById('saveAsNewButton')];
    buttons.forEach(button => button.disabled = true);
    setSavedProgramsStatus('Saving…');

    const fields = { settings: readProgramSettings(), plan: currentPlan };
    const request = updatingExisting
        ? supabaseClient.from('programs').update(fields).eq('id', activeProgramId)
        : supabaseClient.from('programs').insert({ ...fields, name });
    const { data, error } = await request.select('id, name').single();

    buttons.forEach(button => button.disabled = false);

    if (error) {
        console.error('Failed to save program:', error);
        setSavedProgramsStatus(isMissingTableError(error)
            ? 'Saving is not set up yet: run supabase/setup.sql in the Supabase SQL Editor.'
            : "Couldn't save your program. Please try again.");
        return;
    }

    activeProgramId = data.id;
    await refreshSavedPrograms();
    addChatMessage('Assistant', `Saved "${escapeHTML(data.name)}".`);
}

function loadProgram(programId) {
    const program = savedPrograms.find(p => p.id === programId);
    if (!program) return;

    applyProgramSettings(program.settings);
    currentPlan = program.plan;
    activeProgramId = program.id;

    displayWeeklyPlan(currentPlan);
    updateStats(currentPlan);
    updateProgress();
    renderSavedPrograms();
    addChatMessage('Assistant', `Opened your saved program "${escapeHTML(program.name)}".`);
}

async function deleteProgram(programId) {
    const program = savedPrograms.find(p => p.id === programId);
    if (!program || !confirm(`Delete "${program.name}"? This can't be undone.`)) return;

    const { error } = await supabaseClient.from('programs').delete().eq('id', programId);
    if (error) {
        console.error('Failed to delete program:', error);
        setSavedProgramsStatus("Couldn't delete that program. Please try again.");
        return;
    }

    if (activeProgramId === programId) activeProgramId = null;
    await refreshSavedPrograms();
}

// Generating a fresh program starts a new, unsaved program, so "Save" won't overwrite the one that was open
const generatePlanWithoutSaveTracking = generatePlan;
generatePlan = async function () {
    activeProgramId = null;
    renderSavedPrograms();
    return generatePlanWithoutSaveTracking.apply(this, arguments);
};

// ==================== STARTUP ====================

async function startAuth() {
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('forgotForm').addEventListener('submit', handleForgotPassword);
    document.getElementById('setPasswordForm').addEventListener('submit', handleSetPassword);

    if (!window.supabase?.createClient) {
        showAuthView('error', '');
        setAuthMessage("Couldn't load the login system. Check your connection and refresh the page.", 'error');
        return;
    }

    // Invite and password-reset emails send people back here with details in the URL (#type=invite, #type=recovery, or #error=...)
    const linkParams = new URLSearchParams(window.location.hash.slice(1));
    const linkType = linkParams.get('type');
    const linkError = linkParams.get('error_description');

    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { flowType: 'implicit', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true }
    });

    const { data: { session } } = await supabaseClient.auth.getSession();

    supabaseClient.auth.onAuthStateChange(event => {
        // Session ended outside of the Log Out button (e.g. expired): return to the login screen
        if (event === 'SIGNED_OUT' && currentUser) window.location.reload();
    });

    if (window.location.hash) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    if (linkError) {
        showAuthView('login');
        setAuthMessage(/expired|invalid/i.test(linkError)
            ? 'That link has expired or was already used. Ask for a new invite, or use "Forgot password?".'
            : linkError, 'error');
        return;
    }

    if (session && (linkType === 'invite' || linkType === 'recovery' || linkType === 'signup')) {
        settingPasswordFromLink = true;
        showAuthView('setPassword', linkType === 'recovery'
            ? 'Choose a new password.'
            : `Welcome, ${session.user.email}. Choose a password to finish setting up your account.`);
        return;
    }

    if (session) {
        await enterApp(session.user);
    } else {
        showAuthView('login');
    }
}

startAuth();
