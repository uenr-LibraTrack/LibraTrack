/**
 * UENR LibraTrack – Brilliant AI Study Assistant Chatbot
 * Modern, feature-rich client script supporting Voice Input (Speech-to-Text),
 * Text-to-Speech (TTS), Expanded Study Panel Mode, Interactive Occupancy Cards,
 * History Export, Toast Feedback, and Multi-Tiered Gemini / Pollinations AI Engine.
 */

(function () {
  let chatHistory = [];
  let isTyping = false;
  let speechEnabled = false;
  let isListening = false;
  let isExpanded = false;
  let recognition = null;
  let libraryOfficialInfo = null;

  // Sound Synth using Web Audio API for subtle micro-feedback
  function playChime(type) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'send') {
        osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
        osc.frequency.exponentialRampToValueAtTime(659.25, ctx.currentTime + 0.12); // E5
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      } else if (type === 'receive') {
        osc.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
      }
    } catch (e) {
      // Audio play suppressed by browser policy if un-interacted
    }
  }

  // Load official library metadata from library_info.json
  async function loadLibraryOfficialInfo() {
    if (libraryOfficialInfo) return;
    try {
      const res = await fetch('/library_info.json');
      if (res.ok) {
        libraryOfficialInfo = await res.json();
      }
    } catch (e) {
      console.warn("Could not load library_info.json:", e);
    }
  }

  // Helper to retrieve logged-in user name
  function getUserName() {
    try {
      const raw = localStorage.getItem('uenrLibraTrack_auth');
      if (raw) {
        const user = JSON.parse(raw);
        if (user && user.name) {
          return user.name;
        }
      }
    } catch (e) {
      console.error("Error reading user auth for chatbot:", e);
    }
    return null;
  }

  // Initialize Chatbot when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChatbot);
  } else {
    initChatbot();
  }

  function initChatbot() {
    if (document.getElementById('chatbot-fab')) return; // Already initialized

    // 1. Create Floating Action Button (FAB)
    const fab = document.createElement('div');
    fab.id = 'chatbot-fab';
    fab.className = 'chatbot-fab';
    fab.title = 'LibraTrack AI Assistant';
    fab.innerHTML = `
      <i class="fa-solid fa-robot"></i>
      <span id="chatbot-fab-badge" class="chatbot-fab-badge" style="display: none;">1</span>
    `;
    fab.addEventListener('click', toggleChatbot);
    document.body.appendChild(fab);

    // 2. Create Chat Panel
    const panel = document.createElement('div');
    panel.id = 'chatbot-panel';
    panel.className = 'chatbot-panel';
    panel.innerHTML = `
      <!-- Header -->
      <div class="chatbot-header">
        <div class="chatbot-header-title">
          <div class="chatbot-avatar">
            <i class="fa-solid fa-robot"></i>
          </div>
          <div class="chatbot-header-info">
            <h4>LibraTrack AI</h4>
            <div class="chatbot-status">
              <span class="chatbot-status-dot"></span> UENR Academic Assistant
            </div>
          </div>
        </div>
        <div class="chatbot-header-actions">
          <button class="chatbot-tool-btn" id="chatbot-tts-btn" title="Toggle Text-to-Speech (Voice Output)"><i class="fa-solid fa-volume-xmark"></i></button>
          <button class="chatbot-tool-btn" id="chatbot-expand-btn" title="Toggle Expanded Focus View"><i class="fa-solid fa-expand"></i></button>
          <button class="chatbot-tool-btn" id="chatbot-export-btn" title="Export Chat History"><i class="fa-solid fa-download"></i></button>
          <button class="chatbot-tool-btn" id="chatbot-clear-btn" title="Clear Chat History"><i class="fa-solid fa-trash-can"></i></button>
          <button class="chatbot-tool-btn" id="chatbot-close-btn" title="Close Panel"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </div>

      <!-- Toast Container -->
      <div id="chatbot-toast" class="chatbot-toast">Toast message</div>

      <!-- Messages Area -->
      <div id="chatbot-messages" class="chatbot-messages"></div>

      <!-- Voice Listening Banner -->
      <div id="chatbot-voice-banner" class="chatbot-voice-banner" style="display: none;">
        <span><i class="fa-solid fa-microphone"></i> Listening... Speak now</span>
        <div class="chatbot-voice-pulse"></div>
      </div>

      <!-- Quick Chips Filter Bar -->
      <div class="chatbot-chips-container">
        <div class="chatbot-chips">
          <span class="chatbot-chip" data-prompt="Which libraries have open seats right now?"><i class="fa-solid fa-chair"></i> Seats & Occupancy</span>
          <span class="chatbot-chip" data-prompt="What are the rules and regulations of the library?"><i class="fa-solid fa-book-bookmark"></i> Rules & Fines</span>
          <span class="chatbot-chip" data-prompt="How do I search for books on OPAC and e-resources?"><i class="fa-solid fa-magnifying-glass"></i> OPAC & E-Books</span>
          <span class="chatbot-chip" data-prompt="Help me create an effective exam revision study schedule"><i class="fa-solid fa-calendar-check"></i> Study Schedule</span>
          <span class="chatbot-chip" data-prompt="How is UENR CWA / GPA calculated?"><i class="fa-solid fa-calculator"></i> GPA / CWA Guide</span>
          <span class="chatbot-chip" data-prompt="Who are the library staff and what are the opening hours?"><i class="fa-solid fa-users"></i> Staff & Hours</span>
          <span class="chatbot-chip" data-prompt="How do I connect to UENR Student Wi-Fi and Eduroam?"><i class="fa-solid fa-wifi"></i> Wi-Fi Setup</span>
        </div>
      </div>

      <!-- Input Area -->
      <div class="chatbot-input-area">
        <input type="text" id="chatbot-input" class="chatbot-input" placeholder="Ask about library seats, studies, or rules..." autocomplete="off">
        <button class="chatbot-mic-btn" id="chatbot-mic-btn" title="Voice Input (Speech-to-Text)"><i class="fa-solid fa-microphone"></i></button>
        <button class="chatbot-send-btn" id="chatbot-send-btn" title="Send Message"><i class="fa-solid fa-paper-plane"></i></button>
      </div>
    `;
    document.body.appendChild(panel);

    // 3. Attach Event Listeners
    document.getElementById('chatbot-close-btn').addEventListener('click', toggleChatbot);
    document.getElementById('chatbot-send-btn').addEventListener('click', sendChatMessage);
    document.getElementById('chatbot-expand-btn').addEventListener('click', toggleExpandMode);
    document.getElementById('chatbot-clear-btn').addEventListener('click', clearChatHistory);
    document.getElementById('chatbot-export-btn').addEventListener('click', exportChatHistory);
    document.getElementById('chatbot-tts-btn').addEventListener('click', toggleTTS);
    document.getElementById('chatbot-mic-btn').addEventListener('click', toggleSpeechRecognition);

    const inputField = document.getElementById('chatbot-input');
    inputField.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });

    // Handle suggestion chips
    const chips = panel.querySelectorAll('.chatbot-chip');
    chips.forEach(chip => {
      chip.addEventListener('click', function () {
        const promptText = this.getAttribute('data-prompt');
        inputField.value = promptText;
        sendChatMessage();
      });
    });

    // Load external info & previous sessions
    loadLibraryOfficialInfo();
    loadChatFromSession();
    initSpeechRecognitionSupport();
  }

  // Toast Notification Display
  function showToast(message) {
    const toast = document.getElementById('chatbot-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2500);
  }

  // Toggle Chatbot Window Open/Close
  function toggleChatbot() {
    const panel = document.getElementById('chatbot-panel');
    const fab = document.getElementById('chatbot-fab');
    const badge = document.getElementById('chatbot-fab-badge');
    if (!panel) return;

    const isOpen = panel.classList.toggle('open');
    fab.classList.toggle('active', isOpen);

    if (badge) badge.style.display = 'none';

    if (isOpen) {
      document.getElementById('chatbot-input').focus();
      if (chatHistory.length === 0) {
        const name = getUserName();
        const studentGreeting = name ? `Hello **${name}**! 👋` : "Hello! 👋";
        const greeting = `${studentGreeting} I am **LibraTrack AI**, your official UENR library and study assistant.\n\nI can help you with:\n- 📍 **Real-time Seat Occupancy** across all UENR library branches\n- 📚 **Book catalog, OPAC & E-resources** access\n- 📜 **Library rules, borrowing limits & fines**\n- 📅 **Custom exam study schedules & CWA calculator**\n\nWhat would you like to explore today?`;
        addAssistantMessage(greeting);
      }
    }
  }
  window.toggleChatbot = toggleChatbot;

  // Toggle Focus / Expanded Wide Mode
  function toggleExpandMode() {
    const panel = document.getElementById('chatbot-panel');
    const btn = document.getElementById('chatbot-expand-btn');
    if (!panel || !btn) return;

    isExpanded = !isExpanded;
    panel.classList.toggle('expanded', isExpanded);
    btn.innerHTML = isExpanded ? '<i class="fa-solid fa-compress"></i>' : '<i class="fa-solid fa-expand"></i>';
    btn.classList.toggle('active', isExpanded);
    showToast(isExpanded ? 'Expanded Study Mode Enabled' : 'Standard View Enabled');
  }

  // Text-to-Speech (TTS) Toggle
  function toggleTTS() {
    const btn = document.getElementById('chatbot-tts-btn');
    speechEnabled = !speechEnabled;
    btn.classList.toggle('active', speechEnabled);
    btn.innerHTML = speechEnabled ? '<i class="fa-solid fa-volume-high"></i>' : '<i class="fa-solid fa-volume-xmark"></i>';
    showToast(speechEnabled ? 'Voice Output (TTS) On' : 'Voice Output Off');

    if (!speechEnabled && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }

  function speakText(text) {
    if (!speechEnabled || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();

    // Clean markdown symbols for natural audio speech
    const cleanText = text
      .replace(/[*#_`~>|]/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/<[^>]*>/g, '');

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  }

  // Voice Speech Recognition (Speech-to-Text)
  function initSpeechRecognitionSupport() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      const micBtn = document.getElementById('chatbot-mic-btn');
      if (micBtn) {
        micBtn.style.display = 'none'; // Hide if unsupported
      }
      return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = function () {
      isListening = true;
      const micBtn = document.getElementById('chatbot-mic-btn');
      const banner = document.getElementById('chatbot-voice-banner');
      if (micBtn) micBtn.classList.add('listening');
      if (banner) banner.style.display = 'flex';
    };

    recognition.onresult = function (event) {
      const transcript = event.results[0][0].transcript;
      const input = document.getElementById('chatbot-input');
      if (input && transcript) {
        input.value = transcript;
        sendChatMessage();
      }
    };

    recognition.onerror = function (event) {
      console.warn("Speech recognition error:", event.error);
      stopSpeechRecognition();
      showToast('Voice input unavailable or denied');
    };

    recognition.onend = function () {
      stopSpeechRecognition();
    };
  }

  function toggleSpeechRecognition() {
    if (!recognition) {
      showToast('Voice input is not supported in this browser');
      return;
    }

    if (isListening) {
      recognition.stop();
    } else {
      try {
        recognition.start();
      } catch (e) {
        console.error("Speech start error:", e);
      }
    }
  }

  function stopSpeechRecognition() {
    isListening = false;
    const micBtn = document.getElementById('chatbot-mic-btn');
    const banner = document.getElementById('chatbot-voice-banner');
    if (micBtn) micBtn.classList.remove('listening');
    if (banner) banner.style.display = 'none';
  }

  // Clear & Export Chat History
  function clearChatHistory() {
    if (confirm("Are you sure you want to clear your chat history with LibraTrack AI?")) {
      chatHistory = [];
      sessionStorage.removeItem('libraTrack_chatHistory');
      const container = document.getElementById('chatbot-messages');
      if (container) container.innerHTML = '';
      showToast('Chat history cleared');

      const name = getUserName();
      const greeting = `Hello ${name ? '**' + name + '**' : ''}! Chat history cleared. How can I assist you with your library search or studies?`;
      addAssistantMessage(greeting);
    }
  }

  function exportChatHistory() {
    if (chatHistory.length === 0) {
      showToast('No messages to export');
      return;
    }

    let markdownContent = `# UENR LibraTrack AI Assistant Chat Log\n*Exported on ${new Date().toLocaleString()}*\n\n---\n\n`;
    chatHistory.forEach(msg => {
      const sender = msg.role === 'user' ? '👤 Student' : '🤖 LibraTrack AI';
      markdownContent += `### ${sender} (${msg.timestamp || 'Now'})\n${msg.text}\n\n---\n\n`;
    });

    const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `LibraTrack_AI_Chat_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('Chat exported as Markdown file');
  }

  // Session Storage Management
  function loadChatFromSession() {
    try {
      const saved = sessionStorage.getItem('libraTrack_chatHistory');
      if (saved) {
        chatHistory = JSON.parse(saved);
        const container = document.getElementById('chatbot-messages');
        if (container) {
          container.innerHTML = '';
          chatHistory.forEach(msg => {
            appendMessageUI(msg.role, msg.text, msg.timestamp);
          });
          scrollToBottom();
        }
      }
    } catch (e) {
      console.error("Failed to load chat history:", e);
    }
  }

  function saveChatToSession() {
    try {
      sessionStorage.setItem('libraTrack_chatHistory', JSON.stringify(chatHistory));
    } catch (e) {
      console.error("Failed to save chat history:", e);
    }
  }

  // UI Message Append with Copy Button, Timestamps & Cards
  function getCurrentTimeString() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function appendMessageUI(role, text, timeStr) {
    const container = document.getElementById('chatbot-messages');
    if (!container) return;

    const timestamp = timeStr || getCurrentTimeString();

    const wrapper = document.createElement('div');
    wrapper.className = `chatbot-msg-wrapper ${role}`;

    const msgDiv = document.createElement('div');
    msgDiv.className = 'chatbot-msg';

    // Inject Markdown HTML
    msgDiv.innerHTML = formatMarkdown(text);

    // Meta footer line with timestamp & copy option
    const metaDiv = document.createElement('div');
    metaDiv.className = 'chatbot-msg-meta';
    metaDiv.innerHTML = `<span>${timestamp}</span>`;

    if (role === 'assistant') {
      const copyBtn = document.createElement('button');
      copyBtn.className = 'chatbot-msg-copy-btn';
      copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy';
      copyBtn.title = 'Copy response text';
      copyBtn.addEventListener('click', function () {
        navigator.clipboard.writeText(text).then(() => {
          showToast('Copied to clipboard!');
        });
      });
      metaDiv.appendChild(copyBtn);

      const speakMsgBtn = document.createElement('button');
      speakMsgBtn.className = 'chatbot-msg-copy-btn';
      speakMsgBtn.innerHTML = '<i class="fa-solid fa-volume-high"></i> Read';
      speakMsgBtn.title = 'Read response aloud';
      speakMsgBtn.addEventListener('click', function () {
        speakText(text);
      });
      metaDiv.appendChild(speakMsgBtn);
    }

    wrapper.appendChild(msgDiv);
    wrapper.appendChild(metaDiv);
    container.appendChild(wrapper);

    // Attach dynamic click handlers for interactive action buttons inside cards
    const actionBtns = wrapper.querySelectorAll('.chatbot-action-btn[data-action]');
    actionBtns.forEach(btn => {
      btn.addEventListener('click', function () {
        handleCardAction(this.getAttribute('data-action'), this.getAttribute('data-payload'));
      });
    });
  }

  function addAssistantMessage(text) {
    const time = getCurrentTimeString();
    appendMessageUI('assistant', text, time);
    chatHistory.push({ role: 'assistant', text: text, timestamp: time });
    saveChatToSession();
    speakText(text);
  }

  function handleCardAction(action, payload) {
    if (action === 'open-seat-modal') {
      if (typeof window.openSeatModal === 'function') {
        window.openSeatModal(payload || 'main');
        showToast('Opening Seat Map...');
      } else {
        window.location.href = 'index.html#occupancy';
      }
    } else if (action === 'checkin-redirect') {
      window.location.href = 'checkin.html';
    } else if (action === 'prompt') {
      const input = document.getElementById('chatbot-input');
      if (input && payload) {
        input.value = payload;
        sendChatMessage();
      }
    }
  }

  // Send Message Flow
  async function sendChatMessage() {
    if (isTyping) return;

    const input = document.getElementById('chatbot-input');
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    playChime('send');

    const time = getCurrentTimeString();
    appendMessageUI('user', text, time);
    chatHistory.push({ role: 'user', text: text, timestamp: time });
    saveChatToSession();
    scrollToBottom();

    showTypingIndicator();
    isTyping = true;

    try {
      const responseText = await fetchAIResponse(text);
      hideTypingIndicator();
      isTyping = false;
      playChime('receive');

      addAssistantMessage(responseText);
      scrollToBottom();
    } catch (error) {
      console.error("Chatbot API error:", error);
      hideTypingIndicator();
      isTyping = false;

      let errorMsg = "Sorry, I'm having trouble reaching the network right now. Switching to local assistant engine.";
      const responseText = generateSmartBuiltinResponse(text, getUserName() || "Student", getLiveOccupancyString());
      
      addAssistantMessage(responseText);
      scrollToBottom();
    }
  }

  function showTypingIndicator() {
    const container = document.getElementById('chatbot-messages');
    if (!container || document.getElementById('chatbot-typing-indicator')) return;

    const indicator = document.createElement('div');
    indicator.id = 'chatbot-typing-indicator';
    indicator.className = 'chatbot-typing';
    indicator.innerHTML = '<span></span><span></span><span></span>';
    container.appendChild(indicator);
    scrollToBottom();
  }

  function hideTypingIndicator() {
    const indicator = document.getElementById('chatbot-typing-indicator');
    if (indicator) indicator.remove();
  }

  function scrollToBottom() {
    const container = document.getElementById('chatbot-messages');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }

  // Live Occupancy Data Helper
  function getLiveOccupancyString() {
    if (typeof window.getState === 'function') {
      const state = window.getState();
      if (state && state.libraries) {
        return state.libraries.map(lib => {
          const occ = lib.occupants ? lib.occupants.length : 0;
          const pct = Math.round((occ / lib.capacity) * 100);
          return `- **${lib.name}** (${lib.id}): ${occ}/${lib.capacity} total seats filled (${pct}% occupied) | Open: ${lib.isOpen ? 'Yes' : 'No'}`;
        }).join('\n');
      }
    }
    return `- **UENR Main Library**: 65% occupied (130 / 200 seats)\n- **Bindery Reading Room**: 40% occupied (32 / 80 seats)\n- **Shelving Section**: 30% occupied (15 / 50 seats)`;
  }

  function generateOccupancyVisualCard() {
    let libraries = [
      { id: 'main', name: 'UENR Main Library', occupied: 130, capacity: 200, isOpen: true },
      { id: 'bindery', name: 'Bindery Section', occupied: 32, capacity: 80, isOpen: true },
      { id: 'shelves', name: 'Shelving Area', occupied: 15, capacity: 50, isOpen: true }
    ];

    if (typeof window.getState === 'function') {
      const state = window.getState();
      if (state && state.libraries) {
        libraries = state.libraries.map(l => ({
          id: l.id,
          name: l.name,
          occupied: l.occupants ? l.occupants.length : 0,
          capacity: l.capacity,
          isOpen: l.isOpen
        }));
      }
    }

    let cardHtml = `<div class="chatbot-card-occupancy">`;
    libraries.forEach(lib => {
      const pct = Math.round((lib.occupied / lib.capacity) * 100);
      let colorClass = 'green';
      if (pct > 80) colorClass = 'red';
      else if (pct > 55) colorClass = 'orange';

      cardHtml += `
        <div class="chatbot-occ-item">
          <div class="chatbot-occ-header">
            <span>${lib.name}</span>
            <span>${lib.occupied}/${lib.capacity} seats (${pct}%)</span>
          </div>
          <div class="chatbot-occ-bar-bg">
            <div class="chatbot-occ-bar-fill ${colorClass}" style="width: ${pct}%;"></div>
          </div>
        </div>
      `;
    });
    cardHtml += `</div>`;
    return cardHtml;
  }

  // Primary Multi-Tier AI Provider Logic
  async function fetchAIResponse(userText) {
    if (!libraryOfficialInfo) {
      loadLibraryOfficialInfo();
    }

    const name = getUserName() || "Student";
    const liveLibInfo = getLiveOccupancyString();
    const lowerQ = userText.toLowerCase().trim();

    // Direct Instant Visual Handler for Occupancy queries
    if (lowerQ.includes("open seats") || lowerQ.includes("seats right now") || lowerQ === "library seats?" || lowerQ.includes("occupancy")) {
      const visualCard = generateOccupancyVisualCard();
      return `### 📍 **Current Real-time Library Seating Status**\n\n${liveLibInfo}\n\n${visualCard}\n\n<div class="chatbot-action-btn-group"><button class="chatbot-action-btn" data-action="checkin-redirect"><i class="fa-solid fa-qrcode"></i> Check In to Seat</button><button class="chatbot-action-btn secondary" data-action="prompt" data-payload="What are the rules and regulations of the library?"><i class="fa-solid fa-shield"></i> View Rules</button></div>`;
    }

    // Direct Instant Handler for Library Rules
    if (lowerQ.includes("rule") || lowerQ.includes("regulation") || lowerQ === "library rules") {
      return `### 📜 **UENR Library Regulations & Loan Guidelines**\n\n1. **Observe Strict Silence**: Noise-making within and around library reading zones is prohibited.\n2. **No Eating or Drinking**: Food, snacks, and uncovered beverages are strictly banned inside.\n3. **Do Not Reshelve Consulted Books**: Leave consulted materials on tables for library staff.\n4. **No Seat Reservations**: Items left unattended for >15 minutes to hold seats will be removed by security.\n5. **Borrowing Limits**: \n   - Undergraduates: **4 books** for **14 days**\n   - Postgraduates: **6 books** for **30 days**\n   - Fines: **GHS 2.00 per day** for overdue items.\n6. **Dress Code**: Decent and formal attire is required at all times.`;
    }

    // Construct system instructions
    const systemPrompt = `You are LibraTrack AI, an intelligent, empathetic, and expert academic study & library assistant for UENR (University of Energy and Natural Resources, Sunyani, Ghana) student ${name}.
Context:
- Live Library Occupancy Status:
${liveLibInfo}
- Opening Hours: Mon-Fri: 8:00 AM - 10:00 PM | Sat: 9:00 AM - 5:00 PM | Sun: 2:00 PM - 8:00 PM (Exam Periods: 24/7).
- Key Staff: University Librarian Mrs. Miriam Linda Akeriwe, Senior Assistant Librarians Harriet Fosua Attafuah.
- Contact: info.library@uenr.edu.gh | +233 (0) 352 290 390.
- Guidelines: Provide clear, concise, structured markdown responses with bolding, lists, and helpful study tips. Always maintain an encouraging academic tone.`;

    // Tier 1: Local Backend Proxy `/api/chat`
    if (window.location.protocol.startsWith('http')) {
      try {
        const backendResponse = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: userText }] }],
            systemInstruction: systemPrompt
          })
        });
        if (backendResponse.ok) {
          const data = await backendResponse.json();
          if (data && data.text) return data.text;
        }
      } catch (e) {
        console.warn("Backend proxy endpoint call failed:", e);
      }
    }

    // Tier 2: Pollinations AI OpenAI Chat Completions API
    try {
      const polRes = await fetch('https://text.pollinations.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userText }
          ],
          model: 'openai'
        })
      });
      if (polRes.ok) {
        const data = await polRes.json();
        if (data && data.choices && data.choices[0] && data.choices[0].message) {
          const ansText = data.choices[0].message.content;
          if (ansText && ansText.trim() && ansText.trim().length > 4) {
            return ansText.trim();
          }
        }
      }
    } catch (e) {
      console.warn("Pollinations API failed:", e);
    }

    // Tier 3: Client-side Gemini API key if present
    let clientApiKey = localStorage.getItem('uenrLibraTrack_geminiKey');
    if (clientApiKey && clientApiKey.trim().startsWith('AIza')) {
      try {
        const directUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${clientApiKey.trim()}`;
        const directResponse = await fetch(directUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: userText }] }]
          })
        });

        if (directResponse.ok) {
          const directData = await directResponse.json();
          if (directData.candidates && directData.candidates.length > 0 && directData.candidates[0].content) {
            return directData.candidates[0].content.parts[0].text;
          }
        }
      } catch (err) {
        console.warn("Direct Gemini call error:", err);
      }
    }

    // Tier 4: Guaranteed Built-in Intelligence Engine
    return generateSmartBuiltinResponse(userText, name, liveLibInfo);
  }

  // Built-in Knowledge & Natural Language Intelligence Engine
  function generateSmartBuiltinResponse(userText, name, liveLibInfo) {
    const q = (userText || "").toLowerCase();
    const studentName = name && name !== "Guest" ? name : "Student";

    if (q.includes("schedule") || q.includes("timetable") || q.includes("plan") || q.includes("exam") || q.includes("revision") || q.includes("study")) {
      return `### 📅 **Personalized Exam & Study Plan for ${studentName}**\n\nHere is an optimized revision timetable structured for peak cognitive focus:\n\n- 🌅 **Morning Focus (8:00 AM - 11:30 AM)**:\n  - Tackle complex analytical subjects (e.g. Mathematics, Programming, Engineering Thermodynamics, Data Structures).\n  - Place: **UENR Main Library Silent Zone**.\n- ☀️ **Afternoon Review (2:00 PM - 5:00 PM)**:\n  - Reading, group discussions, note synthesis.\n  - Place: **Bindery Reading Room**.\n- 🌙 **Evening Active Recall (7:00 PM - 9:30 PM)**:\n  - Flashcards, past question solving, active quiz testing.\n- 😴 **Rest & Sleep (Before 11:00 PM)**: Maintain 7+ hours of sleep for memory consolidation.\n\n*Tip: Check live seat availability on the main dashboard before heading out!*`;
    }

    if (q.includes("gpa") || q.includes("cwa") || q.includes("grade") || q.includes("calculate") || q.includes("score")) {
      return `### 🧮 **UENR CWA / GPA Calculation Guide**\n\nAt the University of Energy and Natural Resources (UENR), academic performance is calculated using **Cumulative Weighted Average (CWA)**:\n\n$$\\text{CWA} = \\frac{\\sum (\\text{Grade Point} \\times \\text{Credit Hours})}{\\sum \\text{Total Credit Hours}}$$\n\n### 🏆 **Classification Scale**:\n- **First Class**: 75.00 – 100.00\n- **Second Class (Upper)**: 65.00 – 74.99\n- **Second Class (Lower)**: 55.00 – 64.99\n- **Pass**: 45.00 – 54.99\n- **Fail**: Below 45.00\n\n*Would you like assistance planning your target target scores for this semester?*`;
    }

    if (q.includes("wifi") || q.includes("internet") || q.includes("eduroam") || q.includes("network") || q.includes("login")) {
      return `### 📶 **UENR Wi-Fi & Eduroam Connection Guide**\n\nTo connect to campus Wi-Fi at the UENR Main Library:\n1. Select SSID **UENR-STUDENT** or **eduroam**.\n2. **Username**: Your Index Number / Student Email (e.g. \`ue1234521@uenr.edu.gh\`).\n3. **Password**: Your UENR Portal Password.\n4. E-Resource Access: Visit the UENR Library Off-Campus portal for JSTOR, IEEE Xplore, and ScienceDirect access.`;
    }

    if (q.includes("staff") || q.includes("contact") || q.includes("librarian") || q.includes("email") || q.includes("phone")) {
      return `### 📞 **UENR Library Staff & Contact Directory**\n\n- **University Librarian**: Mrs. Miriam Linda Akeriwe (*miriam.akeriwe@uenr.edu.gh*)\n- **Senior Assistant Librarian**: Harriet Fosua Attafuah (*harriet.attafuah@uenr.edu.gh*)\n- **Senior Administrative Assistant**: Matilda Asafo-Adyei (*matilda.asafo-agyei@uenr.edu.gh*)\n- **General Support**: info.library@uenr.edu.gh | +233 (0) 352 290 390 / +233 553 581 475`;
    }

    if (q.includes("opac") || q.includes("book") || q.includes("catalog") || q.includes("borrow") || q.includes("journal") || q.includes("ebook")) {
      return `### 📚 **UENR OPAC & Digital Library Catalog**\n\nYou can search for textbooks, reference journals, and past exam questions through the library catalog:\n\n- **Physical Books**: Check call numbers and shelf availability in the Main Library or Bindery section.\n- **E-Journals**: Access over 50,000+ digital publications on JSTOR, SpringerLink, IEEE Xplore, and Research4Life.\n- **Past Questions**: Available in the UENR Institutional Repository (IR).\n\n*Borrowing Terms: Undergrads can borrow up to 4 books for 14 days.*`;
    }

    return `### 🤖 **LibraTrack AI Assistant Response**\n\nHello, ${studentName}! I have processed your inquiry: **"${userText}"**.\n\nAs your UENR study assistant, I am equipped to answer questions about:\n- 📍 **Live Seat Occupancy**: Checking current seat counts across UENR libraries.\n- 📚 **Academic Resources**: OPAC search, e-journals, past questions, and Wi-Fi setup.\n- 📜 **Library Rules & Fines**: Borrowing limits, opening hours, and policies.\n- 📅 **Study & GPA Coaching**: Exam planning, study tips, and CWA calculation.\n\nHow else can I assist your study session today?`;
  }

  // Enhanced Markdown-to-HTML parser
  function formatMarkdown(text) {
    if (!text) return '';

    let escaped = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Code blocks: ```code```
    escaped = escaped.replace(/```([\s\S]+?)```/g, function (match, code) {
      return `<pre style="background: rgba(0,0,0,0.06); padding: 10px; border-radius: 8px; overflow-x: auto; font-family: monospace; font-size: 12px; margin: 8px 0; border: 1px solid rgba(0,0,0,0.1);"><code>${code.trim()}</code></pre>`;
    });

    // Inline code: `code`
    escaped = escaped.replace(/`([^`]+)`/g, '<code style="background: rgba(0,0,0,0.06); padding: 2px 5px; border-radius: 4px; font-family: monospace; font-size: 12px;">$1</code>');

    // Bold: **text**
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Italic: *text*
    escaped = escaped.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Headers: ### Header
    escaped = escaped.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    escaped = escaped.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    escaped = escaped.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Blockquotes: > quote
    escaped = escaped.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>');

    // Tables
    let lines = escaped.split('\n');
    let tables = [];
    let inTable = false;
    let tableRows = [];
    let tableHeaders = [];
    let startIdx = -1;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (line.startsWith('|') && line.endsWith('|')) {
        if (!inTable) {
          let nextLine = (lines[i + 1] || '').trim();
          if (nextLine.startsWith('|') && nextLine.endsWith('|') && nextLine.replace(/[\s|:\-]/g, '') === '' && nextLine.includes('-')) {
            inTable = true;
            startIdx = i;
            tableHeaders = line.split('|').map(s => s.trim()).filter((s, idx, arr) => idx > 0 && idx < arr.length - 1);
            i++;
          }
        } else {
          let cols = line.split('|').map(s => s.trim()).filter((s, idx, arr) => idx > 0 && idx < arr.length - 1);
          tableRows.push(cols);
        }
      } else {
        if (inTable) {
          const tableHtml = generateHTMLTable(tableHeaders, tableRows);
          const placeholder = `__TABLE_PLACEHOLDER_${tables.length}__`;
          tables.push(tableHtml);

          lines[startIdx] = placeholder;
          for (let j = startIdx + 1; j < i; j++) {
            lines[j] = '';
          }
          inTable = false;
          tableRows = [];
          tableHeaders = [];
        }
      }
    }
    if (inTable) {
      const tableHtml = generateHTMLTable(tableHeaders, tableRows);
      const placeholder = `__TABLE_PLACEHOLDER_${tables.length}__`;
      tables.push(tableHtml);
      lines[startIdx] = placeholder;
      for (let j = startIdx + 1; j < lines.length; j++) {
        lines[j] = '';
      }
    }

    escaped = lines.join('\n');

    // Bullets: - item or * item
    const parsedLines = escaped.split('\n');
    let inList = false;
    for (let i = 0; i < parsedLines.length; i++) {
      let line = parsedLines[i].trim();
      if (line.startsWith('- ') || line.startsWith('* ')) {
        if (!inList) {
          parsedLines[i] = '<ul><li>' + line.substring(2) + '</li>';
          inList = true;
        } else {
          parsedLines[i] = '<li>' + line.substring(2) + '</li>';
        }
      } else {
        if (inList) {
          parsedLines[i - 1] = parsedLines[i - 1] + '</ul>';
          inList = false;
        }
      }
    }
    if (inList) {
      parsedLines[parsedLines.length - 1] = parsedLines[parsedLines.length - 1] + '</ul>';
    }
    escaped = parsedLines.join('\n');

    // Paragraphs & Line Breaks
    escaped = escaped.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');
    let result = `<p>${escaped}</p>`.replace(/<p><br>/g, '<p>').replace(/<p><\/p>/g, '');

    // Restore Tables
    for (let i = 0; i < tables.length; i++) {
      result = result.replace(new RegExp(`<p>\\s*__TABLE_PLACEHOLDER_${i}__\\s*</p>`, 'g'), tables[i]);
      result = result.replace(new RegExp(`__TABLE_PLACEHOLDER_${i}__`, 'g'), tables[i]);
    }

    return result;
  }

  function generateHTMLTable(headers, rows) {
    let html = '<div class="chatbot-table-container" style="overflow-x:auto; margin: 12px 0; border: 1px solid var(--border, rgba(0,0,0,0.12)); border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">';
    html += '<table style="width:100%; border-collapse:collapse; font-size:12.5px; text-align:left; font-family:\'Inter\', sans-serif;">';

    html += '<thead><tr style="background:var(--bg-secondary, #f1f5f9); border-bottom: 2px solid var(--border, rgba(0,0,0,0.12));">';
    headers.forEach(h => {
      html += `<th style="padding:10px 12px; font-weight:600; color:var(--text-primary, #0f172a);">${h}</th>`;
    });
    html += '</tr></thead>';

    html += '<tbody>';
    rows.forEach((row, rIdx) => {
      const borderStyle = rIdx === rows.length - 1 ? '' : 'border-bottom:1px solid var(--border, rgba(0,0,0,0.08));';
      const bg = rIdx % 2 === 1 ? 'var(--bg-secondary, #f8fafc)' : 'transparent';
      html += `<tr style="background:${bg};">`;
      for (let c = 0; c < headers.length; c++) {
        const val = row[c] || '';
        html += `<td style="padding:10px 12px; ${borderStyle} color:var(--text-primary, #334155);">${val}</td>`;
      }
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }
})();
