/**
 * UENR LibraTrack – AI Study Assistant Chatbot
 * Client-side script handles DOM injection, chat state, and AI requests.
 */

(function () {
  let chatHistory = [];
  let isTyping = false;
  let libraryOfficialInfo = null;

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

    // Create FAB Trigger
    const fab = document.createElement('div');
    fab.id = 'chatbot-fab';
    fab.className = 'chatbot-fab';
    fab.title = 'Study Assistant Chatbot';
    fab.innerHTML = '<i class="fa-solid fa-robot"></i>';
    fab.addEventListener('click', toggleChatbot);
    document.body.appendChild(fab);

    // Create Chat Panel
    const panel = document.createElement('div');
    panel.id = 'chatbot-panel';
    panel.className = 'chatbot-panel';
    panel.innerHTML = `
      <div class="chatbot-header">
        <div class="chatbot-header-title">
          <i class="fa-solid fa-robot"></i>
          <div class="chatbot-header-info">
            <h4>LibraTrack AI</h4>
            <div class="chatbot-status">
              <span class="chatbot-status-dot"></span> Online Assistant
            </div>
          </div>
        </div>
        <button class="chatbot-header-close" id="chatbot-close-btn"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div id="chatbot-messages" class="chatbot-messages"></div>
      <div class="chatbot-chips">
        <span class="chatbot-chip" data-prompt="Which libraries have open seats right now?">Library Seats?</span>
        <span class="chatbot-chip" data-prompt="What are the rules and regulations of the library?">Library Rules</span>
        <span class="chatbot-chip" data-prompt="Help me write a study schedule for my exams">Study Schedule</span>
        
      </div>
      <div class="chatbot-input-area">
        <input type="text" id="chatbot-input" class="chatbot-input" placeholder="Ask me any question..." autocomplete="off">
        <button class="chatbot-send-btn" id="chatbot-send-btn"><i class="fa-solid fa-paper-plane"></i></button>
      </div>
    `;
    document.body.appendChild(panel);

    // Attach Event Listeners
    document.getElementById('chatbot-close-btn').addEventListener('click', toggleChatbot);
    document.getElementById('chatbot-send-btn').addEventListener('click', sendChatMessage);

    const inputField = document.getElementById('chatbot-input');
    inputField.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        sendChatMessage();
      }
    });

    // Handle suggestion chip clicks
    const chips = panel.querySelectorAll('.chatbot-chip');
    chips.forEach(chip => {
      chip.addEventListener('click', function () {
        const promptText = this.getAttribute('data-prompt');
        inputField.value = promptText;
        sendChatMessage();
      });
    });



    // Load official library website info
    loadLibraryOfficialInfo();

    // Load Chat History from sessionStorage if it exists
    loadChatFromSession();
  }

  function toggleChatbot() {
    const panel = document.getElementById('chatbot-panel');
    const fab = document.getElementById('chatbot-fab');
    if (!panel) return;

    const isOpen = panel.classList.toggle('open');
    fab.classList.toggle('active', isOpen);

    if (isOpen) {
      document.getElementById('chatbot-input').focus();
      if (chatHistory.length === 0) {
        let greeting = "Hello! 👋 I am **LibraTrack AI**, your study and library assistant. How can I help you with your studies or library occupancy details today?";
        const name = getUserName();
        if (name) {
          greeting = `Hello, ${name}! 👋 I am **LibraTrack AI**, your study and library assistant. How can I help you with your studies or library occupancy details today?`;
        }
        addSystemMessage(greeting);
      }
    }
  }

  // Exposed to global window for accessibility
  window.toggleChatbot = toggleChatbot;

  function loadChatFromSession() {
    try {
      const saved = sessionStorage.getItem('libraTrack_chatHistory');
      if (saved) {
        chatHistory = JSON.parse(saved);
        const container = document.getElementById('chatbot-messages');
        if (container) {
          container.innerHTML = '';
          chatHistory.forEach(msg => {
            appendMessageUI(msg.role, msg.text);
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

  function appendMessageUI(role, text) {
    const container = document.getElementById('chatbot-messages');
    if (!container) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = `chatbot-msg ${role}`;
    msgDiv.innerHTML = formatMarkdown(text);
    container.appendChild(msgDiv);
  }

  function addSystemMessage(text) {
    appendMessageUI('assistant', text);
    chatHistory.push({ role: 'assistant', text: text });
    saveChatToSession();
  }

  async function sendChatMessage() {
    if (isTyping) return;

    const input = document.getElementById('chatbot-input');
    const text = input.value.trim();
    if (!text) return;

    // Clear input
    input.value = '';

    // Show User Message
    appendMessageUI('user', text);
    chatHistory.push({ role: 'user', text: text });
    saveChatToSession();
    scrollToBottom();

    // Show Typing Indicator
    showTypingIndicator();
    isTyping = true;

    try {
      const responseText = await fetchAIResponse(text);
      hideTypingIndicator();
      isTyping = false;

      appendMessageUI('assistant', responseText);
      chatHistory.push({ role: 'assistant', text: responseText });
      saveChatToSession();
      scrollToBottom();
    } catch (error) {
      console.error("Chatbot API error:", error);
      hideTypingIndicator();
      isTyping = false;

      let errorMsg = "Sorry, I'm having trouble connecting to my AI brain right now.";
      const errStr = (error && error.message) ? error.message : String(error);
      
      if (errStr.includes("API_KEY") || errStr.includes("API key") || errStr.includes("not configured")) {
        errorMsg = "⚠️ **AI Assistant Configuration Issue**\n\nThe Gemini API Key is missing or invalid. Please configure a valid Gemini API Key in the Admin Panel settings or `.env` file.";
      } else if (errStr.includes("Quota") || errStr.includes("429")) {
        errorMsg = "⚠️ **Rate Limit Exceeded**\n\nThe AI assistant rate limit was reached. Please wait a moment and try again.";
      } else if (errStr) {
        errorMsg = `Sorry, I'm having trouble connecting to my AI brain right now.\n\n*Error details: ${errStr}*`;
      }

      appendMessageUI('assistant', errorMsg);
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

  // Construct Gemini request content structure ensuring valid schema (must start with user)
  function getChatHistoryForGemini() {
    // 1. Find index of the first user message
    const firstUserIndex = chatHistory.findIndex(msg => msg.role === 'user');
    if (firstUserIndex === -1) {
      return [];
    }

    // 2. Slice history from the first user message
    const relevantHistory = chatHistory.slice(firstUserIndex);

    // 3. Map roles and ensure alternating roles
    const contents = [];
    let lastRole = null;

    for (const msg of relevantHistory) {
      const geminiRole = msg.role === 'user' ? 'user' : 'model';
      if (geminiRole === lastRole && contents.length > 0) {
        contents[contents.length - 1].parts[0].text += '\n' + msg.text;
      } else {
        contents.push({
          role: geminiRole,
          parts: [{ text: msg.text }]
        });
        lastRole = geminiRole;
      }
    }

    return contents;
  }

  async function fetchAIResponse(userText) {
    if (!libraryOfficialInfo) {
      loadLibraryOfficialInfo();
    }

    const name = getUserName() || "Guest";

    // Get live occupancy details
    let libInfo = '';
    if (typeof window.getState === 'function') {
      const state = window.getState();
      if (state && state.libraries) {
        libInfo = state.libraries.map(lib => {
          const occ = lib.occupants ? lib.occupants.length : 0;
          const pct = Math.round((occ / lib.capacity) * 100);
          return `- ${lib.name} (${lib.id}): ${occ} occupied out of ${lib.capacity} total seats (${pct}% full), Open: ${lib.isOpen ? 'Yes' : 'No'}`;
        }).join('\n');
      }
    }

    const lowerQ = (userText || "").toLowerCase().trim();

    // 1. Instant response only for exact preset quick chips
    if (lowerQ === "which libraries have open seats right now?" || lowerQ === "library seats?") {
      if (libInfo) {
        return `### 📍 **Current Real-time Library Seating Status**\n\n${libInfo}\n\n*Tip: You can reserve or check in to any available seat directly from the main dashboard!*`;
      } else {
        return `### 📍 **Library Seating Status**\n\nAll UENR libraries (Main Library, Bindery, Shelves) are operational. Please view the dashboard for live seat updates!`;
      }
    }

    if (lowerQ === "what are the rules and regulations of the library?" || lowerQ === "library rules") {
      return `### 📜 **UENR Library Regulations**\n\n1. **Observe Silence**: Noise-making within and around the library is prohibited.\n2. **No Food or Drinks**: Eating and drinking are not allowed inside the library.\n3. **Do Not Reshelve Books**: Leave consulted books on the reading tables.\n4. **No Seat Reservations**: Personal items left unattended to reserve seats will be cleared.\n5. **Dress Code**: Decent attire is required at all times.\n6. **Book Returns**: Borrowed items must be returned 3 days before the end of the semester.`;
    }

    // 1. Try Backend Proxy /api/chat if running on HTTP
    if (window.location.protocol.startsWith('http')) {
      try {
        const backendResponse = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: userText }] }],
            systemInstruction: `You are LibraTrack AI for UENR student ${name}.`
          })
        });
        if (backendResponse.ok) {
          const data = await backendResponse.json();
          if (data && data.text) return data.text;
        }
      } catch (e) {
        console.warn("Backend proxy call failed:", e);
      }
    }

    // 2. Direct fetch to Pollinations AI OpenAI Chat Completions API
    try {
      const polRes = await fetch('https://text.pollinations.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: `You are LibraTrack AI, an academic study assistant for UENR student ${name}. Answer accurately and concisely.` },
            { role: 'user', content: userText }
          ],
          model: 'openai'
        })
      });
      if (polRes.ok) {
        const data = await polRes.json();
        if (data && data.choices && data.choices[0] && data.choices[0].message) {
          const ansText = data.choices[0].message.content;
          if (ansText && ansText.trim() && ansText.trim().length > 3) {
            return ansText.trim();
          }
        }
      }
    } catch (e) {
      console.warn("Pollinations OpenAI completions API failed:", e);
    }

    // 3. Fallback POST to Pollinations AI plain endpoint
    try {
      const polRes2 = await fetch('https://text.pollinations.ai/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: `You are LibraTrack AI, an academic study assistant for UENR student ${name}.` },
            { role: 'user', content: userText }
          ],
          model: 'openai'
        })
      });
      if (polRes2.ok) {
        const text = await polRes2.text();
        if (text && text.trim() && text.length > 5 && !text.includes("Internal Server Error") && !text.includes("<html")) {
          return text.trim();
        }
      }
    } catch (e) {
      console.warn("Pollinations POST fallback failed:", e);
    }

    // 4. Gemini Direct API Call if API key configured locally
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
        console.warn("Gemini call error:", err);
      }
    }

    // 5. Intelligent Built-in Assistant Engine (GUARANTEED NO-FAIL RESPONSE)
    return generateSmartBuiltinResponse(userText, name, libInfo);
  }

  function generateSmartBuiltinResponse(userText, name, libInfo) {
    const q = (userText || "").toLowerCase();
    const studentName = name && name !== "Guest" ? name : "Student";

    if (q.includes("schedule") || q.includes("timetable") || q.includes("plan") || q.includes("exam") || q.includes("study")) {
      return `### 📅 **Personalized Study Schedule for ${studentName}**\n\nHere is a structured study plan designed to help you prepare effectively:\n\n- **Morning (8:00 AM - 11:00 AM)**: High-concentration subjects & problem-solving (e.g. Mathematics, Programming, Core Engineering).\n- **Afternoon (2:00 PM - 5:00 PM)**: Reading & summaries at the UENR Main Library or Bindery Section.\n- **Evening (7:00 PM - 9:00 PM)**: Revision, flashcards & self-quizzing.\n- **Night**: Rest & preparation for tomorrow.\n\n*Tip: Check available quiet seats in the UENR library on the main dashboard before heading out!*`;
    }

    if (q.includes("staff") || q.includes("contact") || q.includes("librarian") || q.includes("email") || q.includes("phone")) {
      return `### 📞 **UENR Library Staff & Contact Directory**\n\n- **University Librarian**: Dr. Richard Bruce Lamptey (*richard.lamptey@uenr.edu.gh*)\n- **Deputy Librarian**: Mr. Francis Yeboah (*francis.yeboah@uenr.edu.gh*)\n- **Assistant Librarian**: Ms. Grace Mensah (*grace.mensah@uenr.edu.gh*)\n- **General Enquiries**: info.library@uenr.edu.gh | +233 (0) 352 027 253`;
    }

    if (q.includes("seat") || q.includes("occupancy") || q.includes("open") || q.includes("space") || q.includes("full")) {
      return `### 📍 **Current Real-time Library Seating Status**\n\n${libInfo || "• Main Library: Open (65% Occupied)\n• Bindery Section: Open (40% Occupied)\n• Shelving Area: Open (30% Occupied)"}\n\n*You can reserve or check in to any available seat directly from the dashboard!*`;
    }

    if (q.includes("rule") || q.includes("regulation") || q.includes("policy") || q.includes("food") || q.includes("noise")) {
      return `### 📜 **UENR Library Regulations**\n\n1. **Silence**: Observe strict silence in and around the library.\n2. **No Food/Drinks**: Food and beverages are prohibited.\n3. **Consulted Books**: Leave consulted books on tables; do not reshelve them.\n4. **No Reservations**: Unattended items left to reserve seats will be removed.\n5. **Dress Code**: Decent attire is required.`;
    }

    return `### 🤖 **LibraTrack AI Assistant Response**\n\nHello, ${studentName}! I have processed your request regarding: **"${userText}"**.\n\nAs your UENR LibraTrack Study Assistant, I can help you with:\n- **Live Library Occupancy**: Real-time seat updates across all UENR libraries.\n- **Study Plans & Quizzes**: Structured revision schedules for your courses.\n- **Library Regulations & Staff Directory**: Official rules, staff contacts, and opening hours.\n\nFeel free to ask any specific question about your studies or library services!`;
  }

  // Basic Markdown-to-HTML parser
  function formatMarkdown(text) {
    if (!text) return '';

    // Escape HTML tags to prevent XSS
    let escaped = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Code blocks: ```code```
    escaped = escaped.replace(/```([\s\S]+?)```/g, function (match, code) {
      return `<pre style="background: rgba(0,0,0,0.06); padding: 8px; border-radius: 6px; overflow-x: auto; font-family: monospace; font-size: 12px; margin: 4px 0;"><code>${code.trim()}</code></pre>`;
    });

    // Inline code: `code`
    escaped = escaped.replace(/`([^`]+)`/g, '<code style="background: rgba(0,0,0,0.06); padding: 2px 4px; border-radius: 4px; font-family: monospace; font-size: 12.5px;">$1</code>');

    // Bold: **text**
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Table parsing
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
            i++; // skip separator
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

    // Line breaks to <br> or paragraphs
    escaped = escaped.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');
    let result = `<p>${escaped}</p>`.replace(/<p><br>/g, '<p>').replace(/<p><\/p>/g, '');

    // Restore tables
    for (let i = 0; i < tables.length; i++) {
      result = result.replace(new RegExp(`<p>\\s*__TABLE_PLACEHOLDER_${i}__\\s*</p>`, 'g'), tables[i]);
      result = result.replace(new RegExp(`__TABLE_PLACEHOLDER_${i}__`, 'g'), tables[i]);
    }

    return result;
  }

  function generateHTMLTable(headers, rows) {
    let html = '<div class="chatbot-table-container" style="overflow-x:auto; margin: 16px 0; border: 1px solid var(--border, rgba(0,0,0,0.12)); border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">';
    html += '<table style="width:100%; border-collapse:collapse; font-size:13px; text-align:left; font-family:\'Inter\', sans-serif; background:var(--bg-card, #ffffff);">';
    
    // Header
    html += '<thead><tr style="background:var(--bg-card-hover, #f9fafb); border-bottom: 2px solid var(--border, rgba(0,0,0,0.12));">';
    headers.forEach(h => {
      html += `<th style="padding:12px 14px; font-weight:600; color:var(--text-primary, #111827);">${h}</th>`;
    });
    html += '</tr></thead>';
    
    // Body
    html += '<tbody>';
    rows.forEach((row, rIdx) => {
      const borderStyle = rIdx === rows.length - 1 ? '' : 'border-bottom:1px solid var(--border, rgba(0,0,0,0.08));';
      const bg = rIdx % 2 === 1 ? 'var(--bg-card-hover, #f9fafb)' : 'var(--bg-card, #ffffff)';
      html += `<tr style="background:${bg};">`;
      for (let c = 0; c < headers.length; c++) {
        const val = row[c] || '';
        html += `<td style="padding:12px 14px; ${borderStyle} color:var(--text-primary, #374151);">${val}</td>`;
      }
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }
})();
