// ui.js - Complete Chat Interface with OpenRouter API

// ========================================
// CONFIGURATION & STATE
// ========================================
const CONFIG = {
    API_BASE_URL: 'https://openrouter.ai/api/v1',
    STORAGE_KEYS: {
        API_KEY: 'grok_api_key',
        MODEL: 'grok_model',
        CUSTOM_MODEL: 'grok_custom_model',
        CHAT_HISTORY: 'grok_chat_history'
    },
    DEFAULT_MODEL: 'openai/gpt-3.5-turbo',
    MAX_HISTORY_ITEMS: 50,
    MAX_MESSAGE_LENGTH: 4000
};

// App state
const state = {
    apiKey: localStorage.getItem(CONFIG.STORAGE_KEYS.API_KEY) || '',
    selectedModel: localStorage.getItem(CONFIG.STORAGE_KEYS.MODEL) || CONFIG.DEFAULT_MODEL,
    customModel: localStorage.getItem(CONFIG.STORAGE_KEYS.CUSTOM_MODEL) || '',
    conversations: [],
    currentConversationId: null,
    isTyping: false,
    isSidebarOpen: window.innerWidth > 768,
    abortController: null
};

// DOM Elements
const elements = {
    sidebar: document.getElementById('sidebar'),
    menuBtn: document.getElementById('menuBtn'),
    mobileMenuBtn: document.getElementById('mobileMenuBtn'),
    newChatBtn: document.getElementById('newChatBtn'),
    chatHistory: document.getElementById('chatHistory'),
    chatMessages: document.getElementById('chatMessages'),
    welcomeScreen: document.getElementById('welcomeScreen'),
    typingIndicator: document.getElementById('typingIndicator'),
    messageInput: document.getElementById('messageInput'),
    sendBtn: document.getElementById('sendBtn'),
    settingsBtn: document.getElementById('settingsBtn'),
    settingsModal: document.getElementById('settingsModal'),
    apiKeyModal: document.getElementById('apiKeyModal'),
    closeSettings: document.getElementById('closeSettings'),
    cancelSettings: document.getElementById('cancelSettings'),
    saveSettings: document.getElementById('saveSettings'),
    openSettingsFromModal: document.getElementById('openSettingsFromModal'),
    apiKeyInput: document.getElementById('apiKeyInput'),
    modelSelect: document.getElementById('modelSelect'),
    customModelInput: document.getElementById('customModelInput'),
    userAvatar: document.getElementById('userAvatar'),
    aiLogo: document.getElementById('aiLogo'),
    welcomeAiLogo: document.getElementById('welcomeAiLogo'),
    typingAiLogo: document.getElementById('typingAiLogo')
};

// ========================================
// INITIALIZATION
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    loadConversations();
    setupEventListeners();
    checkApiKey();
    autoResizeTextarea();
});

function initializeApp() {
    // Set placeholder images if needed
    const placeholderImages = document.querySelectorAll('img[src*="via.placeholder.com"]');
    placeholderImages.forEach(img => {
        img.onerror = () => {
            img.style.backgroundColor = '#2a2a2a';
            img.style.display = 'flex';
            img.style.alignItems = 'center';
            img.style.justifyContent = 'center';
        };
    });

    // Set user avatar from localStorage or default
    const savedAvatar = localStorage.getItem('user_avatar');
    if (savedAvatar && elements.userAvatar) {
        elements.userAvatar.src = savedAvatar;
    }
}

function setupEventListeners() {
    // Sidebar
    elements.menuBtn?.addEventListener('click', toggleSidebar);
    elements.mobileMenuBtn?.addEventListener('click', openSidebar);
    elements.newChatBtn?.addEventListener('click', createNewChat);

    // Input
    elements.messageInput?.addEventListener('input', handleInputChange);
    elements.messageInput?.addEventListener('keydown', handleKeyDown);
    elements.sendBtn?.addEventListener('click', sendMessage);

    // Settings
    elements.settingsBtn?.addEventListener('click', openSettings);
    elements.closeSettings?.addEventListener('click', closeSettings);
    elements.cancelSettings?.addEventListener('click', closeSettings);
    elements.saveSettings?.addEventListener('click', saveSettings);
    elements.openSettingsFromModal?.addEventListener('click', () => {
        closeApiKeyModal();
        openSettings();
    });

    // Modals
    window.addEventListener('click', handleModalClick);
    window.addEventListener('resize', handleResize);

    // Model select change
    elements.modelSelect?.addEventListener('change', handleModelChange);

    // Suggestion chips
    document.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const prompt = chip.dataset.prompt;
            if (prompt && elements.messageInput) {
                elements.messageInput.value = prompt;
                elements.messageInput.dispatchEvent(new Event('input'));
                sendMessage();
            }
        });
    });
}

// ========================================
// SIDEBAR FUNCTIONS
// ========================================
function toggleSidebar() {
    if (window.innerWidth <= 768) {
        elements.sidebar?.classList.toggle('open');
    } else {
        elements.sidebar?.classList.toggle('collapsed');
    }
    state.isSidebarOpen = !state.isSidebarOpen;
}

function openSidebar() {
    elements.sidebar?.classList.add('open');
    state.isSidebarOpen = true;
}

function closeSidebar() {
    if (window.innerWidth <= 768) {
        elements.sidebar?.classList.remove('open');
        state.isSidebarOpen = false;
    }
}

function handleResize() {
    if (window.innerWidth > 768) {
        elements.sidebar?.classList.remove('open');
    }
}

// ========================================
// CONVERSATION MANAGEMENT
// ========================================
function loadConversations() {
    try {
        const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.CHAT_HISTORY);
        if (saved) {
            state.conversations = JSON.parse(saved);
            renderChatHistory();
            
            // Load last active conversation or create new one
            const lastConv = state.conversations.find(c => c.id === state.currentConversationId);
            if (lastConv) {
                loadConversation(lastConv.id);
            } else if (state.conversations.length > 0) {
                loadConversation(state.conversations[0].id);
            } else {
                createNewChat();
            }
        } else {
            createNewChat();
        }
    } catch (error) {
        console.error('Error loading conversations:', error);
        state.conversations = [];
        createNewChat();
    }
}

function saveConversations() {
    try {
        localStorage.setItem(CONFIG.STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(state.conversations));
    } catch (error) {
        console.error('Error saving conversations:', error);
        showError('Failed to save chat history');
    }
}

function createNewChat() {
    const newConversation = {
        id: generateId(),
        title: 'New conversation',
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    state.conversations.unshift(newConversation);
    state.currentConversationId = newConversation.id;
    
    // Limit history
    if (state.conversations.length > CONFIG.MAX_HISTORY_ITEMS) {
        state.conversations = state.conversations.slice(0, CONFIG.MAX_HISTORY_ITEMS);
    }
    
    renderChatHistory();
    loadConversation(newConversation.id);
    saveConversations();
    
    // Focus input
    elements.messageInput?.focus();
}

function loadConversation(conversationId) {
    state.currentConversationId = conversationId;
    const conversation = state.conversations.find(c => c.id === conversationId);
    
    if (conversation) {
        renderMessages(conversation.messages);
        updateActiveHistoryItem(conversationId);
        updateConversationTitle(conversation);
    }
}

function updateConversationTitle(conversation) {
    if (!conversation) return;
    
    // Generate title from first user message if exists
    const firstUserMsg = conversation.messages.find(m => m.role === 'user');
    if (firstUserMsg && conversation.title === 'New conversation') {
        const title = firstUserMsg.content.substring(0, 30) + (firstUserMsg.content.length > 30 ? '...' : '');
        conversation.title = title;
        saveConversations();
        renderChatHistory();
    }
}

function renderChatHistory() {
    if (!elements.chatHistory) return;

    // Group conversations by date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);

    const groups = {
        today: [],
        yesterday: [],
        lastWeek: [],
        older: []
    };

    state.conversations.forEach(conv => {
        const convDate = new Date(conv.updatedAt || conv.createdAt);
        convDate.setHours(0, 0, 0, 0);

        if (convDate.getTime() === today.getTime()) {
            groups.today.push(conv);
        } else if (convDate.getTime() === yesterday.getTime()) {
            groups.yesterday.push(conv);
        } else if (convDate > lastWeek) {
            groups.lastWeek.push(conv);
        } else {
            groups.older.push(conv);
        }
    });

    // Render HTML
    let html = '';
    
    const renderGroup = (convs, label) => {
        if (convs.length === 0) return '';
        return `
            <div class="history-section">
                <span class="history-label">${label}</span>
                ${convs.map(conv => `
                    <div class="history-item ${conv.id === state.currentConversationId ? 'active' : ''}" 
                         data-id="${conv.id}">
                        <svg viewBox="0 0 24 24" fill="none">
                            <path d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        <span>${escapeHtml(conv.title)}</span>
                    </div>
                `).join('')}
            </div>
        `;
    };

    html += renderGroup(groups.today, 'Today');
    html += renderGroup(groups.yesterday, 'Yesterday');
    html += renderGroup(groups.lastWeek, 'Previous 7 days');
    html += renderGroup(groups.older, 'Older');

    elements.chatHistory.innerHTML = html;

    // Add click handlers
    elements.chatHistory.querySelectorAll('.history-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = item.dataset.id;
            if (id) {
                loadConversation(id);
                if (window.innerWidth <= 768) {
                    closeSidebar();
                }
            }
        });
    });
}

function updateActiveHistoryItem(conversationId) {
    document.querySelectorAll('.history-item').forEach(item => {
        if (item.dataset.id === conversationId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}

// ========================================
// MESSAGE RENDERING
// ========================================
function renderMessages(messages) {
    if (!elements.chatMessages) return;

    // Hide welcome screen if there are messages
    if (messages.length > 0) {
        elements.welcomeScreen?.classList.add('hidden');
    } else {
        elements.welcomeScreen?.classList.remove('hidden');
        elements.chatMessages.innerHTML = '';
        return;
    }

    let html = '';
    messages.forEach(msg => {
        html += renderMessage(msg);
    });

    elements.chatMessages.innerHTML = html;
    
    // Apply syntax highlighting to code blocks
    document.querySelectorAll('pre code').forEach(block => {
        hljs.highlightElement(block);
    });

    // Scroll to bottom
    scrollToBottom();
}

function renderMessage(message) {
    const isUser = message.role === 'user';
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    return `
        <div class="message ${isUser ? 'user-message' : 'ai-message'}">
            <div class="message-avatar">
                ${isUser 
                    ? '<img src="https://via.placeholder.com/32/667eea/ffffff?text=U" alt="User">'
                    : '<img src="https://via.placeholder.com/32/ffffff/000000?text=AI" alt="AI">'
                }
            </div>
            <div class="message-content">
                <div class="message-header">
                    <span class="message-sender">${isUser ? 'You' : 'Grok'}</span>
                    <span class="message-time">${time}</span>
                </div>
                <div class="message-text">
                    ${formatMessage(message.content)}
                </div>
                ${!isUser ? renderMessageActions() : ''}
            </div>
        </div>
    `;
}

function renderMessageActions() {
    return `
        <div class="message-actions">
            <button class="action-btn copy-btn" title="Copy response">
                <svg viewBox="0 0 24 24" fill="none">
                    <path d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
            <button class="action-btn regenerate-btn" title="Regenerate response">
                <svg viewBox="0 0 24 24" fill="none">
                    <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
        </div>
    `;
}

function formatMessage(content) {
    if (!content) return '';
    
    // Configure marked for security and syntax highlighting
    marked.setOptions({
        highlight: function(code, lang) {
            if (lang && hljs.getLanguage(lang)) {
                try {
                    return hljs.highlight(code, { language: lang }).value;
                } catch (err) {
                    console.error(err);
                }
            }
            return hljs.highlightAuto(code).value;
        },
        breaks: true,
        gfm: true
    });

    return marked.parse(content);
}

// ========================================
// MESSAGE ACTIONS
// ========================================
function setupMessageActions() {
    document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const messageText = e.target.closest('.message-content')?.querySelector('.message-text')?.innerText;
            if (messageText) {
                copyToClipboard(messageText);
                showToast('Copied to clipboard!');
            }
        });
    });

    document.querySelectorAll('.regenerate-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // Find the last user message and regenerate
            const conversation = state.conversations.find(c => c.id === state.currentConversationId);
            if (conversation) {
                const lastUserMsg = [...conversation.messages].reverse().find(m => m.role === 'user');
                if (lastUserMsg) {
                    // Remove last AI message and regenerate
                    while (conversation.messages.length > 0 && 
                           conversation.messages[conversation.messages.length - 1].role !== 'user') {
                        conversation.messages.pop();
                    }
                    renderMessages(conversation.messages);
                    sendMessage(lastUserMsg.content);
                }
            }
        });
    });
}

// ========================================
// API COMMUNICATION
// ========================================
async function sendMessage(promptText = null) {
    if (!checkApiKey()) {
        openApiKeyModal();
        return;
    }

    const messageText = promptText || elements.messageInput?.value.trim();
    if (!messageText || messageText.length > CONFIG.MAX_MESSAGE_LENGTH) {
        if (messageText.length > CONFIG.MAX_MESSAGE_LENGTH) {
            showError(`Message too long (max ${CONFIG.MAX_MESSAGE_LENGTH} characters)`);
        }
        return;
    }

    // Clear input
    if (!promptText && elements.messageInput) {
        elements.messageInput.value = '';
        elements.messageInput.style.height = 'auto';
        updateSendButton();
    }

    // Get current conversation
    let conversation = state.conversations.find(c => c.id === state.currentConversationId);
    if (!conversation) {
        createNewChat();
        conversation = state.conversations[0];
    }

    // Add user message
    const userMessage = {
        role: 'user',
        content: messageText,
        timestamp: new Date().toISOString()
    };
    
    conversation.messages.push(userMessage);
    conversation.updatedAt = new Date().toISOString();
    
    renderMessages(conversation.messages);
    updateConversationTitle(conversation);
    saveConversations();

    // Show typing indicator
    showTypingIndicator();

    try {
        // Get AI response
        const response = await getAIResponse(conversation.messages);
        
        // Hide typing indicator
        hideTypingIndicator();

        // Add AI message
        const aiMessage = {
            role: 'assistant',
            content: response,
            timestamp: new Date().toISOString()
        };
        
        conversation.messages.push(aiMessage);
        conversation.updatedAt = new Date().toISOString();
        
        renderMessages(conversation.messages);
        saveConversations();
        
        // Setup action buttons for new message
        setupMessageActions();

    } catch (error) {
        hideTypingIndicator();
        handleAPIError(error);
    }
}

async function getAIResponse(messages) {
    // Cancel previous request if exists
    if (state.abortController) {
        state.abortController.abort();
    }

    state.abortController = new AbortController();

    const model = state.customModel || state.selectedModel;
    const apiKey = state.apiKey;

    // Prepare messages for API
    const apiMessages = messages.map(msg => ({
        role: msg.role,
        content: msg.content
    }));

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': window.location.origin,
                'X-Title': 'Grok Clone'
            },
            body: JSON.stringify({
                model: model,
                messages: apiMessages,
                temperature: 0.7,
                max_tokens: 2000,
                stream: false
            }),
            signal: state.abortController.signal
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error?.message || `API error: ${response.status}`);
        }

        const data = await response.json();
        return data.choices[0]?.message?.content || 'No response from AI';

    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('Request cancelled');
        }
        throw error;
    } finally {
        state.abortController = null;
    }
}

// ========================================
// TYPING INDICATOR
// ========================================
function showTypingIndicator() {
    state.isTyping = true;
    elements.typingIndicator?.classList.add('active');
    scrollToBottom();
}

function hideTypingIndicator() {
    state.isTyping = false;
    elements.typingIndicator?.classList.remove('active');
}

// ========================================
// INPUT HANDLING
// ========================================
function handleInputChange() {
    autoResizeTextarea();
    updateSendButton();
}

function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

function autoResizeTextarea() {
    const textarea = elements.messageInput;
    if (textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }
}

function updateSendButton() {
    if (elements.sendBtn && elements.messageInput) {
        elements.sendBtn.disabled = !elements.messageInput.value.trim();
    }
}

// ========================================
// SETTINGS & MODALS
// ========================================
function checkApiKey() {
    return !!state.apiKey;
}

function openSettings() {
    // Load current settings
    if (elements.apiKeyInput) {
        elements.apiKeyInput.value = state.apiKey;
    }
    if (elements.modelSelect) {
        elements.modelSelect.value = state.selectedModel;
    }
    if (elements.customModelInput) {
        elements.customModelInput.value = state.customModel;
    }
    
    elements.settingsModal?.classList.add('active');
}

function closeSettings() {
    elements.settingsModal?.classList.remove('active');
}

function openApiKeyModal() {
    elements.apiKeyModal?.classList.add('active');
}

function closeApiKeyModal() {
    elements.apiKeyModal?.classList.remove('active');
}

function handleModalClick(e) {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('active');
    }
}

function saveSettings() {
    const newApiKey = elements.apiKeyInput?.value.trim() || '';
    const newModel = elements.modelSelect?.value || CONFIG.DEFAULT_MODEL;
    const newCustomModel = elements.customModelInput?.value.trim() || '';

    // Validate API key format (basic)
    if (newApiKey && !newApiKey.startsWith('sk-or-')) {
        if (!confirm('API key format looks incorrect. OpenRouter keys usually start with "sk-or-". Save anyway?')) {
            return;
        }
    }

    state.apiKey = newApiKey;
    state.selectedModel = newModel;
    state.customModel = newCustomModel;

    // Save to localStorage
    localStorage.setItem(CONFIG.STORAGE_KEYS.API_KEY, newApiKey);
    localStorage.setItem(CONFIG.STORAGE_KEYS.MODEL, newModel);
    localStorage.setItem(CONFIG.STORAGE_KEYS.CUSTOM_MODEL, newCustomModel);

    closeSettings();
    closeApiKeyModal();

    // Show success message
    showToast('Settings saved successfully!');
}

function handleModelChange() {
    const select = elements.modelSelect;
    const customInput = elements.customModelInput;
    
    if (select && customInput) {
        customInput.placeholder = select.value === 'custom' ? 'Enter model ID' : 'Or enter custom model ID';
    }
}

// ========================================
// UTILITY FUNCTIONS
// ========================================
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function scrollToBottom() {
    const container = document.querySelector('.chat-container');
    if (container) {
        container.scrollTop = container.scrollHeight;
    }
}

async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
    } catch (err) {
        console.error('Failed to copy:', err);
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
    }
}

function showToast(message, duration = 3000) {
    // Create toast element if it doesn't exist
    let toast = document.querySelector('.toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'toast';
        toast.style.cssText = `
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--bg-surface);
            color: var(--text-primary);
            padding: 12px 24px;
            border-radius: var(--radius-md);
            border: 1px solid var(--border-color);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
            z-index: 2000;
            animation: fadeIn 0.2s ease;
        `;
        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.display = 'block';

    setTimeout(() => {
        toast.style.display = 'none';
    }, duration);
}

function showError(message) {
    console.error(message);
    showToast(`Error: ${message}`, 5000);
}

function handleAPIError(error) {
    console.error('API Error:', error);
    
    let errorMessage = 'Failed to get response from AI';
    
    if (error.message.includes('401')) {
        errorMessage = 'Invalid API key. Please check your OpenRouter API key in settings.';
        openApiKeyModal();
    } else if (error.message.includes('429')) {
        errorMessage = 'Rate limit exceeded. Please try again later.';
    } else if (error.message.includes('500')) {
        errorMessage = 'OpenRouter server error. Please try again.';
    } else if (error.message.includes('cancelled')) {
        return; // Don't show error for cancelled requests
    } else {
        errorMessage = `Error: ${error.message}`;
    }
    
    showError(errorMessage);
}

// ========================================
// AVATAR CUSTOMIZATION (Optional)
// ========================================
function customizeAvatar() {
    // You can replace these with your own image URLs
    const avatarUrl = prompt('Enter URL for user avatar (or leave blank for default):');
    if (avatarUrl) {
        elements.userAvatar.src = avatarUrl;
        localStorage.setItem('user_avatar', avatarUrl);
    }

    const aiLogoUrl = prompt('Enter URL for AI logo (or leave blank for default):');
    if (aiLogoUrl) {
        elements.aiLogo.src = aiLogoUrl;
        elements.welcomeAiLogo.src = aiLogoUrl;
        elements.typingAiLogo.src = aiLogoUrl;
        localStorage.setItem('ai_logo', aiLogoUrl);
    }
}

// Add right-click menu for avatar customization (optional)
document.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.user-menu') || e.target.closest('.header-title')) {
        e.preventDefault();
        customizeAvatar();
    }
});

// ========================================
// EXPORT FOR MODULE USE
// ========================================
export {
    state,
    sendMessage,
    createNewChat,
    loadConversation,
    openSettings,
    closeSettings
};