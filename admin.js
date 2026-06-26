/**
 * UENR LibraTrack – Admin Logic
 * PIN auth, capacity management, manual checkout, library toggle, code cards.
 */

const ADMIN_PIN_KEY = 'libAdmin_pin';
const DEFAULT_PIN   = '2011';

// ============================================================
//  AUTH
// ============================================================
function getAdminPin() {
  return localStorage.getItem(ADMIN_PIN_KEY) || DEFAULT_PIN;
}

function setAdminPin(newPin) {
  localStorage.setItem(ADMIN_PIN_KEY, newPin);
}

function verifyPin(pin) {
  return pin === getAdminPin();
}

// ============================================================
//  ADMIN OPERATIONS
// ============================================================
function adminSetCapacity(libId, newCapacity) {
  const state = getState();
  const lib   = state.libraries.find(l => l.id === libId);
  if (!lib) return false;
  lib.capacity = Math.max(1, parseInt(newCapacity, 10) || lib.capacity);
  saveState(state);
  return true;
}

function adminToggleOpen(libId, isOpen) {
  const state = getState();
  const lib   = state.libraries.find(l => l.id === libId);
  if (!lib) return false;
  lib.isOpen = isOpen;
  saveState(state);
  return true;
}

function adminKickStudent(libId, studentId) {
  const state = getState();
  const lib   = state.libraries.find(l => l.id === libId);
  if (!lib) return false;
  lib.occupants = lib.occupants.filter(o => o.id !== studentId);
  saveState(state);
  return true;
}

function adminResetLibrary(libId) {
  const state = getState();
  const lib   = state.libraries.find(l => l.id === libId);
  if (!lib) return false;
  lib.occupants = [];
  saveState(state);
  return true;
}

function adminChangePin(currentPin, newPin) {
  if (!verifyPin(currentPin)) return false;
  setAdminPin(newPin);
  return true;
}

// ============================================================
//  UI RENDER (called from admin.html)
// ============================================================
function renderAdminCards() {
  const state = getState();
  const grid  = document.getElementById('admin-grid');
  if (!grid) return;

  grid.innerHTML = state.libraries.map((lib, idx) => {
    const occ = getOccupancy(lib.id);
    const status = getStatus(lib.id);
    const pct = Math.min(occ.pct, 100);

    return `
      <div class="card fade-in">
        <div class="library-card-header">
          <div class="library-name">${lib.name}</div>
          <span class="status-badge ${statusClass(status)}">
            ${statusLabel(status)}
          </span>
        </div>

        <div class="admin-stat-row"><span>Library ID</span><span class="val"><code>${lib.id}</code></span></div>
        <div class="admin-stat-row"><span>Current Goal</span><span class="val">${occ.capacity} seats</span></div>
        
        <div class="occupancy-section" style="margin: 20px 0;">
          <div class="seat-numbers">
            <div class="seat-big">${pct}%</div>
            <div class="seat-label" style="font-size: 12px;">Full</div>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width:${pct}%;"></div>
          </div>
        </div>

        <div class="toggle-row">
          <span class="toggle-label">Accepting Students</span>
          <label class="toggle">
            <input type="checkbox" id="toggle-${lib.id}" ${lib.isOpen ? 'checked' : ''} onchange="handleToggle('${lib.id}', this.checked)">
            <span class="toggle-slider"></span>
          </label>
        </div>

        <div style="margin-top:20px; border-top: 1px solid var(--border); padding-top: 16px;">
          <div class="admin-stat-row"><span>Occupants</span><span class="val">${occ.taken} students</span></div>
          <div class="occupant-list" id="occ-list-${lib.id}">
            ${lib.occupants.length === 0
              ? '<div style="text-align:center;padding:12px 0;color:var(--text-muted);font-size:13px;">Empty</div>'
              : lib.occupants.slice(0, 5).map(o => {
                  const hoursElapsed = (Date.now() - o.checkinTime) / (1000 * 60 * 60);
                  const overLimit = hoursElapsed > 3;
                  return `
                  <div class="occupant-item" style="${overLimit ? 'border-left: 3px solid var(--status-full-text);' : ''}">
                    <div style="display:flex; flex-direction:column; gap:2px;">
                      <span style="font-weight:600;">${o.name} <span style="color:var(--brand-blue); font-size:11px;">(Seat ${o.seatNumber || '?'})</span></span>
                      <span style="font-size: 11px; color: ${overLimit ? 'var(--status-full-text)' : 'var(--text-muted)'};"><i class="fa-solid fa-clock"></i> ${Math.floor(hoursElapsed)}h ${Math.floor((hoursElapsed % 1) * 60)}m</span>
                    </div>
                    <button class="btn-kick" onclick="handleKick('${lib.id}', '${o.id}')">Free Up Seat</button>
                  </div>`;
                }).join('') + (lib.occupants.length > 5 ? `<div style="text-align:center;font-size:11px;color:var(--text-muted);">+ ${lib.occupants.length - 5} more</div>` : '')}
          </div>
        </div>

        <div style="margin-top:24px; display: grid; gap: 10px;">
          <div class="capacity-row">
            <span class="capacity-row-label">Seats</span>
            <input class="capacity-input" id="cap-input-${lib.id}" type="number" value="${occ.capacity}" min="1" placeholder="0">
            <button class="btn-update-cap" onclick="handleCapacityChange('${lib.id}')"><i class="fa-solid fa-check"></i> Save</button>
          </div>
          <button class="btn-reset-lib" onclick="handleReset('${lib.id}', '${lib.name}')"><i class="fa-solid fa-rotate-right"></i> Reset</button>
        </div>
      </div>`;
  }).join('');

  if (typeof renderAnalytics === 'function') {
    renderAnalytics();
  }
}

// ============================================================
//  ANALYTICS & PREDICTIONS
// ============================================================
function renderAnalytics() {
  if (typeof Chart === 'undefined') return;
  const ctx = document.getElementById('usageChart');
  if (!ctx) return;
  
  const analytics = JSON.parse(localStorage.getItem('lib_analytics') || '[]');
  
  // Mock data if empty
  let dataPoints = [12, 19, 3, 5, 2, 3, 9];
  let labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  
  if (analytics.length > 0) {
    // Basic peak hour calculation
    const hourCounts = {};
    analytics.forEach(a => {
      const h = new Date(a.checkinTime).getHours();
      hourCounts[h] = (hourCounts[h] || 0) + 1;
    });
    
    let maxHour = 0;
    let maxCount = 0;
    for (const [h, count] of Object.entries(hourCounts)) {
      if (count > maxCount) {
        maxCount = count;
        maxHour = parseInt(h);
      }
    }
    
    document.getElementById('peak-hours-text').textContent = maxCount === 0 ? 'Processing...' : `${maxHour}:00 - ${maxHour+1}:00`;
  } else {
    document.getElementById('peak-hours-text').textContent = "14:00 - 15:00 (Est)";
  }

  // Generate Prediction
  const state = getState();
  const mainLib = state.libraries.find(l => l.id === 'LIB-MAIN');
  if (mainLib) {
    const fillRate = mainLib.occupants.length / mainLib.capacity;
    let predText = "";
    if (fillRate > 0.9) predText = "Main Library is almost full. Expect it to be completely full within the next 15 minutes.";
    else if (fillRate > 0.5) predText = "Main Library is filling up steadily. Predicted to be full in the next 2 hours.";
    else predText = "Main Library currently has high availability. No capacity constraints expected in the next 3 hours.";
    
    document.getElementById('prediction-text').innerHTML = `<strong>LIB-MAIN:</strong> ${predText}`;
  }

  // Render chart
  if (window.myUsageChart) window.myUsageChart.destroy();
  window.myUsageChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Weekly Check-ins',
        data: dataPoints,
        borderColor: '#5b9af8',
        backgroundColor: 'rgba(91, 154, 248, 0.1)',
        tension: 0.4,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
}

// ============================================================
//  EVENT HANDLERS  (bound to onclick in template)
// ============================================================
function handleToggle(libId, isOpen) {
  adminToggleOpen(libId, isOpen);
  renderAdminCards();
  showToast(`${libId} is now ${isOpen ? 'Open' : 'Closed'}`);
}

function handleCapacityChange(libId) {
  const val = document.getElementById(`cap-input-${libId}`).value;
  if (!val || val < 1) { showToast('Please enter a valid seat count.', 'error'); return; }
  adminSetCapacity(libId, val);
  renderAdminCards();
  showToast(`Capacity updated for ${libId}`);
}

function handleKick(libId, studentId) {
  if (!confirm(`Remove "${studentId}" from ${libId}?`)) return;
  adminKickStudent(libId, studentId);
  renderAdminCards();
  showToast(`Student removed from ${libId}`);
}

function handleReset(libId, libName) {
  if (!confirm(`Reset ALL occupants from ${libName}? This cannot be undone.`)) return;
  adminResetLibrary(libId);
  renderAdminCards();
  showToast(`${libName} cleared`);
}

function handleChangePin() {
  const cur = document.getElementById('pin-current').value;
  const nw  = document.getElementById('pin-new').value;
  const cf  = document.getElementById('pin-confirm').value;
  if (nw !== cf)         { showToast('New PINs do not match.', 'error'); return; }
  if (nw.length < 4)     { showToast('PIN must be at least 4 digits.', 'error'); return; }
  if (!adminChangePin(cur, nw)) { showToast('Current PIN is incorrect.', 'error'); return; }
  document.getElementById('pin-form').reset();
  showToast('Admin PIN updated');
}

// Toast notifications
function showToast(msg, type = 'success') {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.style.cssText = `
      position:fixed;bottom:24px;right:24px;z-index:9999;
      padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600;
      font-family:'Inter',sans-serif;box-shadow:0 8px 32px rgba(0,0,0,0.4);
      transition:all 0.3s ease;opacity:0;transform:translateY(16px);pointer-events:none;`;
    document.body.appendChild(toast);
  }
  toast.style.background = type === 'error' ? 'rgba(239,68,68,0.9)' : 'rgba(34,197,94,0.9)';
  toast.style.color       = 'white';
  toast.textContent       = msg;
  toast.style.opacity     = '1';
  toast.style.transform   = 'translateY(0)';
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateY(16px)'; }, 3000);
}

// ============================================================
//  LIB CORNER ADMIN
// ============================================================
async function handlePostLibCorner() {
  const message = document.getElementById('corner-message').value.trim();
  if (!message) return;
  
  const btn = document.querySelector('#lib-corner-form .btn-submit');
  const ogText = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Posting...';
  btn.disabled = true;

  try {
    const { error } = await supabaseClient
      .from('notifications')
      .insert([{
        id: Date.now().toString(),
        title: 'Lib Corner Update',
        message: message,
        target: 'lib-corner',
        timestamp: Date.now(),
        severity: 'info',
        type: 'general'
      }]);
      
    if (error) throw error;
    
    showToast('Posted to Lib Corner');
    document.getElementById('lib-corner-form').reset();
  } catch (e) {
    console.error("Lib Corner Post Error", e);
    showToast('Failed to post. Check connection.');
  } finally {
    btn.innerHTML = ogText;
    btn.disabled = false;
  }
}

// ============================================================
//  NOTIFICATIONS ADMIN
// ============================================================

function handleSendNotification() {
  const title = document.getElementById('notif-title').value.trim();
  const message = document.getElementById('notif-message').value.trim();
  const type = document.getElementById('notif-type').value;
  const targetLibrary = document.getElementById('notif-target').value;

  if (!title || !message) {
    showToast('Please enter both title and message.', 'error');
    return;
  }

  if (typeof addNotification === 'function') {
    addNotification({ title, message, type, targetLibrary });
    showToast('Notification sent successfully');
    document.getElementById('notif-form').reset();
    renderNotificationHistory();
  } else {
    showToast('Error: Notification system not loaded.', 'error');
  }
}

function handleDeleteNotification(id) {
  if (!confirm('Are you sure you want to delete this notification?')) return;
  
  if (typeof deleteNotification === 'function') {
    deleteNotification(id);
    showToast('Notification deleted.');
    renderNotificationHistory();
  }
}

function renderNotificationHistory() {
  const container = document.getElementById('notif-history');
  if (!container || typeof getNotifications !== 'function') return;

  const notifs = getNotifications('all', 'admin_all');
  
  if (notifs.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-muted);">No notifications sent yet.</div>';
    return;
  }

  container.innerHTML = `
    <table class="howto-table">
      <thead>
        <tr>
          <th style="text-align:left; padding-bottom:12px; color:var(--text-primary);">Date</th>
          <th style="text-align:left; padding-bottom:12px; color:var(--text-primary);">Type</th>
          <th style="text-align:left; padding-bottom:12px; color:var(--text-primary);">Title</th>
          <th style="text-align:left; padding-bottom:12px; color:var(--text-primary);">Target</th>
          <th style="text-align:right; padding-bottom:12px; color:var(--text-primary);">Action</th>
        </tr>
      </thead>
      <tbody>
        ${notifs.map(n => {
          const config = getNotifConfig(n.type);
          const targetLabel = n.targetLibrary === 'all' ? 'All Libraries' : n.targetLibrary;
          const dateStr = new Date(n.timestamp).toLocaleDateString() + ' ' + new Date(n.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
          return `
            <tr>
              <td style="font-size:12px;">${dateStr}</td>
              <td><span class="status-badge ${config.colorClass}" style="font-size:10px; padding:2px 8px;">${config.label}</span></td>
              <td style="font-weight:600;">${n.title}</td>
              <td style="font-size:12px;">${targetLabel}</td>
              <td style="text-align:right;">
                <button class="btn-kick" onclick="handleDeleteNotification('${n.id}')">Delete</button>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}
