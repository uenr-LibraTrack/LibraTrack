/**
 * UENR LibraTrack – Notifications Logic
 * Manages notification state via localStorage.
 */

// ============================================================
//  NOTIFICATIONS STATE (persisted to backend API)
// ============================================================
const MAX_NOTIFS = 50;
let globalNotifsState = null;

async function loadNotifsFromServer() {
  try {
    if (typeof supabaseClient === 'undefined') {
      throw new Error("Supabase client not available (offline)");
    }
    const { data: notifications, error } = await supabaseClient
      .from('notifications')
      .select('*')
      .order('timestamp', { ascending: false });
      
    if (error) throw error;
    
    if (notifications) {
      globalNotifsState = { notifications: notifications, reads: {} };
      initNotifsRealtime();
      return;
    }
  } catch(e) { console.error("Failed to fetch notifs from Supabase:", e); }
  
  if (!globalNotifsState) {
    globalNotifsState = { notifications: [], reads: {} };
  }
}

async function saveNotifsState(state) {
  globalNotifsState = state;
  // State saves are handled per-notification insertion in addNotification
}

function loadNotifsState() {
  if (!globalNotifsState) {
    return { notifications: [], reads: {} };
  }
  return globalNotifsState;
}

let notifsRealtimeInitialized = false;

function initNotifsRealtime() {
  if (notifsRealtimeInitialized) return;
  notifsRealtimeInitialized = true;
  
  supabaseClient
    .channel('public:notifications')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, payload => {
      const newNotif = payload.new;
      if (globalNotifsState && globalNotifsState.notifications) {
        globalNotifsState.notifications.unshift(newNotif);
        if (globalNotifsState.notifications.length > MAX_NOTIFS) {
          globalNotifsState.notifications.pop();
        }
        
        // Trigger UI updates
        if (typeof updateNotificationBadge === 'function') updateNotificationBadge();
        if (typeof renderNotificationHistory === 'function' && document.getElementById('notif-history')) renderNotificationHistory();
        if (typeof renderNotificationFeed === 'function' && document.getElementById('notif-feed')) renderNotificationFeed();
        if (typeof renderLibCorner === 'function') renderLibCorner();
        
        // Show in-app notification toast for all users
        if (typeof showNotificationToast === 'function') {
          showNotificationToast(newNotif.title, newNotif.message, newNotif.type);
        }
        
        // Spawn local browser notification if permitted
        if ("Notification" in window && Notification.permission === "granted") {
          // If the app is currently in the background or minimized, this will alert the user.
          // Don't show if we are the one who sent it (created by admin on same device), but for simplicity we show all.
          new Notification(newNotif.title, { 
            body: newNotif.message,
            icon: 'uenr.png'
          });
        }
      }
    })
    .subscribe();
}

document.addEventListener('DOMContentLoaded', () => {
  loadNotifsFromServer().then(() => {
    if (typeof updateNotificationBadge === 'function') updateNotificationBadge();
    if (typeof renderNotificationHistory === 'function' && document.getElementById('notif-history')) renderNotificationHistory();
    if (typeof renderNotificationFeed === 'function' && document.getElementById('notif-feed')) renderNotificationFeed();
    if (typeof renderLibCorner === 'function') renderLibCorner();
  });
});

function getNotifications(filterType = 'all', targetLib = 'auto') {
  const state = loadNotifsState();
  let notifs = state.notifications || [];
  
  if (filterType !== 'all') {
    notifs = notifs.filter(n => n.type === filterType);
  }
  
  if (targetLib === 'auto') {
    const currentLibrary = localStorage.getItem('currentLibrary');
    if (currentLibrary) {
      notifs = notifs.filter(n => n.targetLibrary === 'all' || n.targetLibrary === currentLibrary);
    } else {
      notifs = notifs.filter(n => n.targetLibrary === 'all');
    }
  } else if (targetLib !== 'admin_all') {
    notifs = notifs.filter(n => n.targetLibrary === 'all' || n.targetLibrary === targetLib);
  }
  
  // We sort by timestamp since we mapped createdAt to timestamp in Supabase
  return notifs.sort((a, b) => b.timestamp - a.timestamp);
}

async function addNotification({ title, message, type, targetLibrary, createdBy = 'admin' }) {
  const id = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  
  const notif = {
    id,
    title,
    message,
    type,
    timestamp: Date.now(),
    isRead: false
  };
  
  if (typeof supabaseClient !== 'undefined') {
    // We insert into Supabase. It will broadcast to all clients including us.
    try {
      const { error } = await supabaseClient
        .from('notifications')
        .insert([notif]);
        
      if (error) {
        console.error("Failed to insert notification into Supabase:", error);
      }
    } catch (e) {
      console.error("Supabase insert error:", e);
    }
  }
  
  // NOTE: For targetLibrary and createdBy, since we didn't add them to the Supabase schema, 
  // we will drop them for now and treat all notifications as global.
  
  return notif;
}

async function deleteNotification(id) {
  const state = loadNotifsState();
  state.notifications = state.notifications.filter(n => n.id !== id);
  
  if (typeof supabaseClient !== 'undefined') {
    try {
      const { error } = await supabaseClient
        .from('notifications')
        .delete()
        .eq('id', id);
        
      if (error) {
        console.error("Failed to delete notification from Supabase:", error);
      }
    } catch (e) {
      console.error("Supabase delete error:", e);
    }
  }
}

function markAsRead(studentId, notifId) {
  if (!studentId) return;
  const state = loadNotifsState();
  if (!state.reads[studentId]) {
    state.reads[studentId] = [];
  }
  if (!state.reads[studentId].includes(notifId)) {
    state.reads[studentId].push(notifId);
    saveNotifsState(state);
  }
}

function markAllAsRead(studentId) {
    if (!studentId) return;
    const state = loadNotifsState();
    state.reads[studentId] = state.notifications.map(n => n.id);
    saveNotifsState(state);
}

function getUnreadCount(studentId) {
  if (!studentId) {
      // If not logged in as a specific student, just track "guest" read state in session storage or simple local storage key
      const readGuest = JSON.parse(localStorage.getItem('guest_reads') || '[]');
      const all = getNotifications();
      return all.filter(n => !readGuest.includes(n.id)).length;
  }
  const state = loadNotifsState();
  const reads = state.reads[studentId] || [];
  const all = getNotifications();
  return all.filter(n => !reads.includes(n.id)).length;
}

function markGuestRead(notifId) {
    const readGuest = JSON.parse(localStorage.getItem('guest_reads') || '[]');
    if (!readGuest.includes(notifId)) {
        readGuest.push(notifId);
        localStorage.setItem('guest_reads', JSON.stringify(readGuest));
    }
}

function markAllGuestRead() {
     const all = getNotifications();
     localStorage.setItem('guest_reads', JSON.stringify(all.map(n=>n.id)));
}


const NOTIF_CONFIG = {
  closure: { icon: '<i class="fa-solid fa-lock"></i>', label: 'Closure', colorClass: 'status-full' },
  emergency: { icon: '<i class="fa-solid fa-triangle-exclamation"></i>', label: 'Emergency', colorClass: 'status-full' },
  availability: { icon: '<i class="fa-solid fa-chair"></i>', label: 'Availability', colorClass: 'status-open' },
  announcement: { icon: '<i class="fa-solid fa-bullhorn"></i>', label: 'Announcement', colorClass: 'status-closed' }
};

function getNotifConfig(type) {
  return NOTIF_CONFIG[type] || NOTIF_CONFIG.announcement;
}

function showNotificationToast(title, message, type) {
  let toastContainer = document.getElementById('notif-toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'notif-toast-container';
    toastContainer.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 10px;
    `;
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  const config = getNotifConfig(type);
  
  toast.style.cssText = `
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    box-shadow: 0 10px 30px rgba(16, 185, 129, 0.3);
    padding: 16px;
    border-radius: 12px;
    width: 320px;
    display: flex;
    gap: 12px;
    align-items: flex-start;
    transform: translateX(120%);
    transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    cursor: pointer;
  `;

  toast.innerHTML = `
    <div style="font-size: 22px; color: #ffffff; flex-shrink: 0; margin-top: 2px;">
      ${config.icon}
    </div>
    <div style="flex: 1; overflow: hidden;">
      <div style="font-weight: 700; font-size: 15px; margin-bottom: 4px; color: #ffffff;">${title}</div>
      <div style="font-size: 13.5px; color: rgba(255, 255, 255, 0.9); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${message}</div>
    </div>
  `;

  toast.onclick = () => {
    window.location.href = 'notifications.html';
  };

  toastContainer.appendChild(toast);

  // Animate in
  setTimeout(() => {
    toast.style.transform = 'translateX(0)';
  }, 50);

  // Animate out and remove
  setTimeout(() => {
    toast.style.transform = 'translateX(120%)';
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, 5000);
}
