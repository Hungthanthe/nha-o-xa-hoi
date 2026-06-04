// ============================================================
// chatbot.js - Giao diện và logic chatbot Claude AI
// ============================================================

let chatOpen = false;
let isTyping = false;
let messageHistory = [];

function toggleChat() {
  chatOpen = !chatOpen;
  const win = document.getElementById('chatbot-window');
  if (win) win.classList.toggle('open', chatOpen);

  // Ẩn badge thông báo khi mở
  if (chatOpen) {
    const badge = document.querySelector('#chatbot-btn .badge-notif');
    if (badge) badge.style.display = 'none';
    focusChatInput();
  }
}

function focusChatInput() {
  setTimeout(() => {
    const input = document.getElementById('chat-input');
    if (input) input.focus();
  }, 300);
}

// Toggle khi click nút chatbot
const chatBtn = document.getElementById('chatbot-btn');
if (chatBtn) {
  chatBtn.addEventListener('click', toggleChat);
}

// Gợi ý nhanh
function sendSuggestion(btn) {
  const text = btn.textContent;
  const input = document.getElementById('chat-input');
  if (input) input.value = text;
  sendMessage();
}

async function sendMessage() {
  if (isTyping) return;

  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');
  const text = input?.value?.trim();

  if (!text) return;
  input.value = '';

  // Ẩn suggestions sau lần đầu chat
  const suggestions = document.querySelector('.chat-suggestions');
  if (suggestions) suggestions.style.display = 'none';

  // Hiển thị tin nhắn người dùng
  appendMessage('user', text);
  messageHistory.push({ role: 'user', content: text });

  // Disable input
  isTyping = true;
  if (sendBtn) sendBtn.disabled = true;
  if (input) input.disabled = true;

  // Hiển thị typing
  const typingEl = appendTyping();

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: messageHistory }),
    });

    if (!response.ok) throw new Error('Server error');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let botText = '';
    let botBubble = null;

    // Remove typing indicator
    typingEl.remove();
    botBubble = appendMessage('bot', '');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') break;

        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            botText = parsed.error;
          } else if (parsed.text) {
            botText += parsed.text;
          }
        } catch {}
      }

      // Cập nhật bubble text liên tục (streaming)
      if (botBubble) {
        botBubble.querySelector('.msg-bubble').innerHTML = formatMarkdown(botText);
        scrollToBottom();
      }
    }

    if (botText) {
      messageHistory.push({ role: 'assistant', content: botText });
    }

  } catch (err) {
    typingEl?.remove();
    const errorMsg = 'Không thể kết nối tới server. Vui lòng kiểm tra server đang chạy và thử lại.';
    appendMessage('bot', errorMsg);
  } finally {
    isTyping = false;
    if (sendBtn) sendBtn.disabled = false;
    if (input) {
      input.disabled = false;
      input.focus();
    }
    scrollToBottom();
  }
}

function appendMessage(role, text) {
  const container = document.getElementById('chat-messages');
  if (!container) return null;

  const msg = document.createElement('div');
  msg.className = `msg ${role}`;

  const avatar = role === 'bot' ? '🤖' : '👤';
  msg.innerHTML = `
    <div class="msg-avatar">${avatar}</div>
    <div class="msg-bubble">${role === 'bot' ? formatMarkdown(text) : escText(text)}</div>
  `;

  container.appendChild(msg);
  scrollToBottom();
  return msg;
}

function appendTyping() {
  const container = document.getElementById('chat-messages');
  const el = document.createElement('div');
  el.className = 'msg bot';
  el.innerHTML = `
    <div class="msg-avatar">🤖</div>
    <div class="msg-bubble typing">
      <span></span><span></span><span></span>
    </div>
  `;
  container.appendChild(el);
  scrollToBottom();
  return el;
}

function scrollToBottom() {
  const container = document.getElementById('chat-messages');
  if (container) container.scrollTop = container.scrollHeight;
}

function escText(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Chuyển markdown đơn giản sang HTML
function formatMarkdown(text) {
  if (!text) return '';
  return escText(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^#{1,3}\s+(.+)$/gm, '<strong>$1</strong>')
    .replace(/^[-•]\s+(.+)$/gm, '• $1')
    .replace(/\n\n+/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>');
}
