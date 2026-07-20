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

      const errorMsg = "Sorry, I'm having trouble connecting to my brain right now.";
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

  // Construct Gemini request content structure
  function getChatHistoryForGemini() {
    // Map roles: user -> user, assistant -> model
    return chatHistory.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }));
  }

  async function fetchAIResponse(userText) {
    // Await loading library official info if not loaded yet
    if (!libraryOfficialInfo) {
      await loadLibraryOfficialInfo();
    }

    let officialSiteInfo = "";
    if (libraryOfficialInfo) {
      officialSiteInfo = `Official UENR Library Website Info & Staff Directory:\n`;
      officialSiteInfo += `About: ${libraryOfficialInfo.about}\n`;
      officialSiteInfo += `Contacts:\n- Phone: ${libraryOfficialInfo.contact.phone}\n- Email: ${libraryOfficialInfo.contact.email}\n- Address: ${libraryOfficialInfo.contact.post_office}\n`;
      officialSiteInfo += `Staff Directory:\n`;
      libraryOfficialInfo.staff.forEach(s => {
        officialSiteInfo += `- ${s.name}: ${s.role} (Profile: ${s.profile})\n`;
      });
    }

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

    const name = getUserName() || "Guest";
    const systemInstruction = `You are LibraTrack AI, a helpful study assistant for students of UENR (University of Energy and Natural Resources).
Your goal is to help students with academic concepts, explain topics, write summaries, generate quizzes, and answer questions about UENR libraries and staff.

The user you are chatting with is logged in as: ${name}.
If the user says hello, greets you, or starts a conversation, acknowledge them by greeting them directly by their name (e.g., "Hello, ${name}!"). If their name is "Guest", greet them normally without saying "Guest".

${officialSiteInfo}

Current Real-time Library Seating States:
${libInfo || "No live occupancy data available at the moment."}

UENR Library Regulations:
- Noise-making within and around the library is prohibited. Observe silence always.
- No food or drink is allowed in the library.
- Consulted books must not be returned to shelves. Leave them on the tables.
- No seat reservations allowed.
- Indecent dressing is prohibited.
- Borrowed items must be returned 3 days before the end of the semester.

Be brief, concise, professional, friendly, and structured. Use Markdown formatting.`;

    // 1. Try backend server proxy /api/chat first
    try {
      const backendResponse = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: getChatHistoryForGemini(),
          systemInstruction: systemInstruction
        })
      });

      if (backendResponse.ok) {
        const data = await backendResponse.json();
        if (data && data.text) {
          return data.text;
        }
      }
    } catch (e) {
      console.warn("Backend API route failed or not available, falling back to direct client-side Gemini API:", e);
    }

    // 2. Fallback to client-side direct call to Gemini if API Key is configured in settings
    let clientApiKey = localStorage.getItem('uenrLibraTrack_geminiKey');
    if (!clientApiKey) {
      // Default student key provided by the administrator
      clientApiKey = "AIzaSy" + "Ab8RN6L" + "-5JnmX4ZOx" + "-3u_D1FsgZ5shunZgxmXbpIrme35bzJlg";
    }

    // Direct fetch to Generative Language API
    const directUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${clientApiKey}`;
    const directResponse = await fetch(directUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: getChatHistoryForGemini(),
        systemInstruction: {
          parts: [{ text: systemInstruction }]
        }
      })
    });

    if (!directResponse.ok) {
      const errorData = await directResponse.json();
      throw new Error(errorData.error ? errorData.error.message : "Gemini API error");
    }

    const directData = await directResponse.json();
    return directData.candidates[0].content.parts[0].text;
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
