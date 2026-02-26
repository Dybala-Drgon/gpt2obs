/**
 * ChatGPT to Obsidian - Content Script
 * 注入到ChatGPT页面，负责抓取对话内容
 */

// 页面加载完成后初始化
let saveButton = null;

function init() {
  console.log('[GPT2Obsidian] Content script loaded');
  createSaveButton();
  observePageChanges();
}

// 创建保存按钮
function createSaveButton() {
  // 避免重复创建
  if (saveButton && saveButton.parentNode) {
    return;
  }

  // 创建按钮容器
  const buttonContainer = document.createElement('div');
  buttonContainer.id = 'gpt2obs-save-btn';
  buttonContainer.innerHTML = '💾 保存到Obsidian';
  buttonContainer.title = '将当前对话总结并保存到Obsidian';

  // 添加样式
  Object.assign(buttonContainer.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    zIndex: '10000',
    padding: '12px 20px',
    backgroundColor: '#10a37f',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    transition: 'all 0.3s ease',
    userSelect: 'none'
  });

  // 鼠标悬停效果
  buttonContainer.addEventListener('mouseenter', () => {
    buttonContainer.style.backgroundColor = '#0d8c6c';
    buttonContainer.style.transform = 'translateY(-2px)';
    buttonContainer.style.boxShadow = '0 6px 16px rgba(0,0,0,0.2)';
  });

  buttonContainer.addEventListener('mouseleave', () => {
    buttonContainer.style.backgroundColor = '#10a37f';
    buttonContainer.style.transform = 'translateY(0)';
    buttonContainer.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
  });

  // 点击事件
  buttonContainer.addEventListener('click', handleSaveClick);

  // 添加到页面
  document.body.appendChild(buttonContainer);
  saveButton = buttonContainer;

  console.log('[GPT2Obsidian] Save button created');
}

// 处理保存按钮点击
async function handleSaveClick() {
  try {
    // 显示加载状态
    const originalText = saveButton.innerHTML;
    saveButton.innerHTML = '⏳ 正在处理...';
    saveButton.style.cursor = 'wait';
    saveButton.disabled = true;

    // 抓取对话内容
    const conversation = extractConversation();

    if (!conversation || conversation.messages.length === 0) {
      showNotification('⚠️ 未找到对话内容，请确保在ChatGPT对话页面');
      resetButton();
      return;
    }

    console.log('[GPT2Obsidian] Conversation extracted:', {
      title: conversation.title,
      messageCount: conversation.messages.length
    });

    // 发送消息到background.js处理
    const response = await chrome.runtime.sendMessage({
      action: 'saveConversation',
      data: conversation
    });

    if (response.success) {
      showNotification('✅ 已保存到Obsidian!');
      // 保存到历史记录
      await saveToHistory(conversation);
    } else {
      showNotification('❌ 保存失败: ' + response.error);
    }

  } catch (error) {
    console.error('[GPT2Obsidian] Save error:', error);
    showNotification('❌ 发生错误: ' + error.message);
  } finally {
    resetButton();
  }
}

// 重置按钮状态
function resetButton() {
  saveButton.innerHTML = '💾 保存到Obsidian';
  saveButton.style.cursor = 'pointer';
  saveButton.disabled = false;
}

// 提取对话内容
function extractConversation() {
  try {
    // 方法1: 从页面DOM提取
    const title = extractTitle();
    const messages = extractMessages();

    if (messages.length === 0) {
      console.warn('[GPT2Obsidian] No messages found');
      return null;
    }

    return {
      title: title || 'Untitled Conversation',
      messages: messages,
      url: window.location.href,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('[GPT2Obsidian] Extract error:', error);
    return null;
  }
}

// 提取对话标题
function extractTitle() {
  // 从页面标题提取
  const pageTitle = document.title;
  if (pageTitle && pageTitle !== 'ChatGPT') {
    return pageTitle.replace(' - ChatGPT', '').trim();
  }

  // 尝试从导航栏提取
  const navTitle = document.querySelector('[class*="nav"] h1, [class*="title"]');
  if (navTitle) {
    return navTitle.textContent.trim();
  }

  return 'Untitled Conversation';
}

// 提取消息内容
function extractMessages() {
  const messages = [];

  try {
    // ChatGPT的DOM结构可能会变化，这里使用多种选择器策略
    const selectors = [
      '[data-message-id]',  // 最可靠的方式
      '[class*="conversation-turn"]',
      '[class*="text-message"]',
      'article'
    ];

    let messageElements = [];

    // 尝试每个选择器
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        messageElements = Array.from(elements);
        console.log(`[GPT2Obsidian] Found ${messageElements.length} messages with selector: ${selector}`);
        break;
      }
    }

    // 如果还是找不到，尝试从React内部状态获取
    if (messageElements.length === 0) {
      console.warn('[GPT2Obsidian] No messages found via DOM selectors');
      return extractMessagesFromReact();
    }

    // 解析每条消息
    messageElements.forEach(el => {
      const role = determineRole(el);
      const content = extractMessageContent(el);

      if (content) {
        messages.push({
          role: role,
          content: content
        });
      }
    });

  } catch (error) {
    console.error('[GPT2Obsidian] Extract messages error:', error);
  }

  return messages;
}

// 判断消息角色（用户或助手）
function determineRole(element) {
  // 检查元素的class或data属性
  const classList = element.className || '';
  const dataAttrs = element.dataset || {};

  // 用户消息的特征
  if (classList.includes('user') ||
      dataAttrs.role === 'user' ||
      dataAttrs.messageAuthorRole === 'user') {
    return 'user';
  }

  // 默认为助手
  return 'assistant';
}

// 提取消息文本内容
function extractMessageContent(element) {
  // 尝试多种方式获取文本
  const textSelector = [
    '.markdown',
    '[class*="markdown"]',
    '[class*="message-content"]',
    'p'
  ];

  for (const selector of textSelector) {
    const contentEl = element.querySelector(selector);
    if (contentEl && contentEl.textContent.trim()) {
      return contentEl.textContent.trim();
    }
  }

  // 如果找不到子元素，直接返回元素文本
  const text = element.textContent.trim();
  return text.length > 0 ? text : null;
}

// 从React内部状态提取（备用方案）
function extractMessagesFromReact() {
  console.log('[GPT2Obsidian] Trying to extract from React state...');
  // 这个方法需要根据实际的React结构来实现
  // 暂时返回空数组
  return [];
}

// 保存到历史记录
async function saveToHistory(conversation) {
  try {
    const result = await chrome.storage.local.get(['history']);
    const history = result.history || [];

    // 添加新的历史记录（只保留最近50条）
    history.unshift({
      title: conversation.title,
      url: conversation.url,
      timestamp: conversation.timestamp
    });

    await chrome.storage.local.set({
      history: history.slice(0, 50)
    });

  } catch (error) {
    console.error('[GPT2Obsidian] Save history error:', error);
  }
}

// 显示通知
function showNotification(message) {
  // 创建通知元素
  const notification = document.createElement('div');
  notification.textContent = message;
  Object.assign(notification.style, {
    position: 'fixed',
    top: '80px',
    right: '20px',
    zIndex: '10001',
    padding: '16px 24px',
    backgroundColor: '#1a1a1a',
    color: 'white',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    fontSize: '14px',
    animation: 'slideIn 0.3s ease',
    maxWidth: '300px'
  });

  document.body.appendChild(notification);

  // 3秒后自动消失
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// 监听页面变化（ChatGPT是SPA，需要监听路由变化）
function observePageChanges() {
  // 监听URL变化
  let lastUrl = location.href;
  new MutationObserver(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      console.log('[GPT2Obsidian] URL changed, reinitializing...');
      setTimeout(init, 1000); // 延迟初始化，等待页面加载
    }
  }).observe(document, { subtree: true, childList: true });

  // 监听DOM变化，确保按钮始终存在
  const observer = new MutationObserver(() => {
    if (!saveButton || !saveButton.parentNode) {
      createSaveButton();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

// 添加CSS动画
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(400px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(400px);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);

// 初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
