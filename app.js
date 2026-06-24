/**
 * UENR LibraTrack – Core Application Logic
 * Manages state via localStorage, handles check-in/out, and drives UI updates.
 */

// ============================================================
//  DEFAULTS
// ============================================================
const LIBRARY_DEFAULTS = [
  { id: 'LIB-MAIN', name: 'Main Library',   capacity: 150, color: 'lib-a' },
  { id: 'LIB-ANNX', name: 'Library Annex',  capacity: 80,  color: 'lib-b' },
  { id: 'LIB-H1',   name: 'Hall 1 Library', capacity: 50,  color: 'lib-c' },
  { id: 'LIB-RCEES',   name: 'RCEES Library', capacity: 50,  color: 'lib-d' },
];

const ICONS = ['<i class="fa-solid fa-book"></i>', '<i class="fa-solid fa-building-columns"></i>', '<i class="fa-solid fa-bolt"></i>', '<i class="fa-solid fa-landmark"></i>'];

// ============================================================
//  GEOFENCING CONSTANTS
// ============================================================
// UENR Campus approximate coordinates
const CAMPUS_LAT = 7.3399;
const CAMPUS_LNG = -2.3267;
// Radius in meters (e.g., 2000 meters = 2km)
const GEOFENCE_RADIUS_METERS = 2000;

/**
 * Calculates the distance between two coordinates in meters using the Haversine formula
 */
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth's radius in meters
  const radLat1 = lat1 * Math.PI / 180;
  const radLat2 = lat2 * Math.PI / 180;
  const deltaLat = (lat2 - lat1) * Math.PI / 180;
  const deltaLon = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
            Math.cos(radLat1) * Math.cos(radLat2) *
            Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// ============================================================
//  STATE  (persisted to backend API)
// ============================================================
let globalState = null;

async function loadStateFromServer() {
  try {
    if (typeof supabaseClient === 'undefined') {
      throw new Error("Supabase client not available (offline)");
    }
    const { data: libraries, error } = await supabaseClient
      .from('libraries')
      .select('*')
      .order('id', { ascending: true });
      
    if (error) throw error;
    
    if (libraries && libraries.length > 0) {
      globalState = {
        libraries: libraries,
        lastUpdated: Date.now()
      };
      
      // Initialize Realtime subscription
      initRealtime();
      return;
    }
  } catch(e) { console.error("Failed to fetch state from Supabase:", e); }
  
  if (!globalState) {
    globalState = {
      libraries: LIBRARY_DEFAULTS.map(lib => ({
        ...lib, occupants: [], isOpen: true,
      })),
      lastUpdated: Date.now(),
    };
    saveState(globalState);
  }
}

async function saveState(state) {
  state.lastUpdated = Date.now();
  globalState = state;
  
  if (typeof supabaseClient === 'undefined') {
    console.warn("Supabase client not available. Running in offline mode.");
    return;
  }
  
  for (const lib of state.libraries) {
    try {
      const { error } = await supabaseClient
        .from('libraries')
        .update({ occupants: lib.occupants, isOpen: lib.isOpen, capacity: lib.capacity })
        .eq('id', lib.id);
        
      if (error) {
        console.error("Failed to update library state in Supabase:", lib.id, error);
      }
    } catch (e) {
      console.error("Supabase update error:", e);
    }
  }
}

function getState() {
  if (!globalState) {
    return { libraries: LIBRARY_DEFAULTS.map(lib => ({...lib, occupants: [], isOpen: true})), lastUpdated: 0 };
  }
  return globalState;
}

let realtimeInitialized = false;

function initRealtime() {
  if (realtimeInitialized) return;
  realtimeInitialized = true;
  
  supabaseClient
    .channel('public:libraries')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'libraries' }, payload => {
      const updatedLib = payload.new;
      if (globalState && globalState.libraries) {
        const idx = globalState.libraries.findIndex(l => l.id === updatedLib.id);
        if (idx !== -1) {
          globalState.libraries[idx] = updatedLib;
          globalState.lastUpdated = Date.now();
          if (typeof renderAdminCards === 'function') renderAdminCards();
          if (typeof renderAll === 'function') renderAll();
          
          // If we're on the check-in page viewing this library, update the preview
          const libInput = document.getElementById('lib-code');
          if (libInput && libInput.value.toUpperCase() === updatedLib.id) {
            libInput.dispatchEvent(new Event('input'));
          }
        }
      }
    })
    .subscribe();
}

// ============================================================
//  AUTHENTICATION
// ============================================================
const AUTH_KEY = 'uenrLibraTrack_auth';

function getCurrentUser() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  return null;
}

function loginUser(id, name, role) {
  const user = { id, name, role, loginTime: Date.now() };
  localStorage.setItem(AUTH_KEY, JSON.stringify(user));
  return user;
}

function logoutUser() {
  localStorage.removeItem(AUTH_KEY);
  window.location.href = 'login.html';
}

function requireAuth() {
  const user = getCurrentUser();
  // If no user and not on login page, redirect
  if (!user && !window.location.pathname.endsWith('login.html')) {
    window.location.href = 'login.html';
  }
  return user;
}

function updateNavAuth() {
  const user = getCurrentUser();
  if (user) {
    const navLinks = document.querySelector('.nav-links');
    if (navLinks && !document.getElementById('nav-logout-btn')) {
      // Add logout button
      const logoutBtn = document.createElement('a');
      logoutBtn.href = '#';
      logoutBtn.id = 'nav-logout-btn';
      logoutBtn.className = 'nav-link';
      logoutBtn.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i> <span class="nav-link-full">Logout</span>';
      logoutBtn.onclick = (e) => { e.preventDefault(); logoutUser(); };
      
      // Insert before settings dropdown or theme switch
      const settingsOrTheme = document.querySelector('.nav-settings') || document.querySelector('.theme-switch');
      if (settingsOrTheme) {
        navLinks.insertBefore(logoutBtn, settingsOrTheme);
      } else {
        navLinks.appendChild(logoutBtn);
      }
      
      // Also show user name somewhere if possible, maybe add a greeting
    }
  }
}

// ============================================================
//  LIBRARY HELPERS
// ============================================================
function getLibrary(libId) {
  const state = getState();
  return state.libraries.find(l => l.id === libId);
}

function getOccupancy(libId) {
  const lib = getLibrary(libId);
  if (!lib) return null;
  return {
    capacity: lib.capacity,
    taken: lib.occupants.length,
    available: lib.capacity - lib.occupants.length,
    pct: Math.round((lib.occupants.length / lib.capacity) * 100),
    isOpen: lib.isOpen,
  };
}

function getStatus(libId) {
  const occ = getOccupancy(libId);
  if (!occ) return 'unknown';
  if (!occ.isOpen) return 'closed';
  if (occ.taken >= occ.capacity) return 'full';
  if (occ.pct >= 80) return 'almost';
  return 'open';
}

// ============================================================
//  CHECK-IN / CHECK-OUT
// ============================================================
/**
 * Returns { success, action, message, library }
 * action: 'checkin' | 'checkout' | 'error'
 */
function processCheckIn(libId, studentId, studentName, role = 'student') {
  const state = getState();
  const libIndex = state.libraries.findIndex(l => l.id === libId.toUpperCase());

  if (libIndex === -1) {
    return { success: false, action: 'error', message: `Library code "${libId}" is not recognised. Please check the code on the entrance sign.` };
  }

  const lib = state.libraries[libIndex];

  if (!lib.isOpen) {
    return { success: false, action: 'error', message: `${lib.name} is currently closed. Please try another library.` };
  }

  // Check if student is already checked in (to THIS library)
  const existingIdx = lib.occupants.findIndex(o => o.id.toLowerCase() === studentId.toLowerCase());
  if (existingIdx !== -1) {
    // Check out
    lib.occupants.splice(existingIdx, 1);
    saveState(state);
    return {
      success: true,
      action: 'checkout',
      message: `You have successfully checked out of ${lib.name}. See you next time!`,
      library: lib,
    };
  }

  // Check if student is checked in elsewhere
  for (let i = 0; i < state.libraries.length; i++) {
    if (i === libIndex) continue;
    const otherLib = state.libraries[i];
    const otherIdx = otherLib.occupants.findIndex(o => o.id.toLowerCase() === studentId.toLowerCase());
    if (otherIdx !== -1) {
      return {
        success: false,
        action: 'error',
        message: `You are currently checked in at ${otherLib.name}. Please check out there first before checking in here.`,
      };
    }
  }

  // Check capacity
  if (lib.occupants.length >= lib.capacity) {
    const others = state.libraries.filter((l, i) => i !== libIndex && l.isOpen && l.occupants.length < l.capacity);
    let suggestion = '';
    if (others.length > 0) {
      suggestion = ` Try ${others.map(l => l.name).join(' or ')} instead.`;
    }
    return {
      success: false,
      action: 'error',
      message: `${lib.name} is full (${lib.capacity}/${lib.capacity} seats taken).${suggestion}`,
    };
  }

  // Check in
  lib.occupants.push({ id: studentId, name: studentName || studentId, role: role, checkinTime: Date.now() });
  saveState(state);

  return {
    success: true,
    action: 'checkin',
    message: `Welcome to ${lib.name}! You have been checked in. Enjoy your study session.`,
    library: lib,
    seatNumber: lib.occupants.length,
  };
}

// ============================================================
//  UI HELPERS  (shared across pages)
// ============================================================
function statusClass(status) {
  return { open: 'status-open', almost: 'status-almost', full: 'status-full', closed: 'status-closed' }[status] || 'status-closed';
}

function statusLabel(status) {
  return { open: 'Open', almost: 'Almost Full', full: 'Full', closed: 'Closed' }[status] || 'Unknown';
}

function progressClass(status) {
  return { open: 'progress-open', almost: 'progress-almost', full: 'progress-full', closed: 'progress-closed' }[status] || 'progress-open';
}

function formatTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function animateCount(el, value) {
  el.classList.remove('count-animate');
  void el.offsetWidth;
  el.textContent = value;
  el.classList.add('count-animate');
}

// ============================================================
//  THEME MANAGEMENT (Persisted via localStorage)
// ============================================================
const THEME_KEY = 'uenrLibraTrack_theme';

function initTheme() {
  if (window.location.pathname.endsWith('login.html')) {
    document.body.classList.add('dark-theme');
    return;
  }
  const saved = localStorage.getItem(THEME_KEY);
  const useDark = saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (useDark) {
    document.body.classList.add('dark-theme');
  } else {
    document.body.classList.remove('dark-theme');
  }
}

// Initialize theme immediately to prevent flashing light background
initTheme();

function toggleTheme() {
  const isDark = document.body.classList.toggle('dark-theme');
  localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
  syncToggleSwitch();
}

function syncToggleSwitch() {
  const switchEls = document.querySelectorAll('#theme-toggle-switch');
  switchEls.forEach(switchEl => {
    switchEl.checked = document.body.classList.contains('dark-theme');
  });
}

// Handle toggle switch bindings on document load
document.addEventListener('DOMContentLoaded', () => {
  // Enforce auth
  requireAuth();
  updateNavAuth();

  initTheme();
  syncToggleSwitch();
  const switchEls = document.querySelectorAll('#theme-toggle-switch');
  switchEls.forEach(switchEl => {
    switchEl.addEventListener('change', toggleTheme);
  });
  initNotifications();

  // Load state from backend and render
  loadStateFromServer().then(() => {
    if (typeof renderAdminCards === 'function') renderAdminCards();
    if (typeof renderAll === 'function') renderAll();
  });
  
  // Close settings dropdown if clicked outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.nav-settings')) {
      document.querySelectorAll('.settings-dropdown').forEach(d => d.classList.remove('show'));
    }
  });
});

function toggleMobileMenu() {
  const btn = document.getElementById('mobile-menu-btn');
  const nav = document.querySelector('.nav-links');
  if (btn && nav) {
    btn.classList.toggle('active');
    nav.classList.toggle('active');
  }
}

// ============================================================
//  NOTIFICATIONS POLLING & UI
// ============================================================

function updateNotificationBadge() {
  if (typeof getUnreadCount !== 'function') return; // notifications.js might not be loaded
  
  const badge = document.getElementById('nav-bell-badge');
  if (!badge) return;
  
  const unread = getUnreadCount();
  
  if (unread > 0) {
    if (badge.textContent !== unread.toString()) {
      badge.textContent = unread > 99 ? '99+' : unread;
      badge.style.display = 'flex';
      // Pulse animation
      badge.classList.remove('pulse-anim');
      void badge.offsetWidth; // trigger reflow
      badge.classList.add('pulse-anim');
    }
  } else {
    badge.style.display = 'none';
  }
}

function initNotifications() {
  updateNotificationBadge();
  setInterval(updateNotificationBadge, 10000); // Poll every 10 seconds
}

// UPDATE SUPABASE FOR RCEES
setTimeout(async () => {
  if (!localStorage.getItem('RCEES_UPDATED_V3')) {
    try {
      // First try to update the existing LIB-H2 record
      await window.supabaseClient.from('libraries').update({ id: 'LIB-RCEES', name: 'RCEES Library' }).eq('id', 'LIB-H2');
      // Then ensure if it's already LIB-RCEES, the name is correct
      await window.supabaseClient.from('libraries').update({ name: 'RCEES Library' }).eq('id', 'LIB-RCEES');
      localStorage.setItem('RCEES_UPDATED_V3', 'true');
      console.log('Database name updated to RCEES Library');
      // Reload state
      if (typeof loadStateFromServer === 'function') {
        await loadStateFromServer();
        if (typeof renderAdminCards === 'function') renderAdminCards();
        if (typeof renderAll === 'function') renderAll();
      }
    } catch(e) { console.error(e); }
  }
}, 2000);
// REGISTER SERVICE WORKER
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(registration => {
        console.log('ServiceWorker registration successful with scope: ', registration.scope);
      })
      .catch(err => {
        console.log('ServiceWorker registration failed: ', err);
      });
  });
}

// PWA Install Prompt
let deferredPrompt;

function isIos() {
  const userAgent = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(userAgent);
}

function isInStandaloneMode() {
  return ('standalone' in window.navigator) && (window.navigator.standalone);
}

window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent the mini-infobar from appearing on mobile
  e.preventDefault();
  // Stash the event so it can be triggered later.
  deferredPrompt = e;
  // Update UI notify the user they can install the PWA
  const installBanner = document.getElementById('pwa-install-banner');
  if (installBanner) {
    installBanner.style.display = 'flex'; // Use flex for center alignment
  }
});

document.addEventListener('DOMContentLoaded', () => {
  if (isIos() && !isInStandaloneMode()) {
    const installBanner = document.getElementById('pwa-install-banner');
    if (installBanner) {
      installBanner.style.display = 'flex';
      const installBtn = installBanner.querySelector('button[onclick="installPWA()"]');
      if (installBtn) {
        installBtn.style.display = 'none';
        const textPs = installBanner.querySelectorAll('p');
        if (textPs && textPs.length > 0) {
           textPs[0].innerHTML = 'To install the app on iOS, tap the <strong>Share</strong> icon and then <strong>Add to Home Screen</strong>.';
        }
      }
    }
  }
});

function installPWA() {
  const installBanner = document.getElementById('pwa-install-banner');
  if (installBanner) {
    installBanner.style.display = 'none';
  }
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        console.log('User accepted the install prompt');
      } else {
        console.log('User dismissed the install prompt');
      }
      deferredPrompt = null;
    });
  }
}
