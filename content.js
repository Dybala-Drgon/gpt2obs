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

    // 检查是否已配置 API Key
    const config = await getAPIConfig();
    if (!config.apiKey) {
      showNotification('⚠️ 请先在扩展设置中配置 API Key');
      resetButton();
      return;
    }

    // 使用 File System Access API 保存
    await saveWithFileSystemAPI(conversation, config);

    // 保存到历史记录
    await saveToHistory(conversation);

  } catch (error) {
    console.error('[GPT2Obsidian] Save error:', error);
    showNotification('❌ 发生错误: ' + error.message);
  } finally {
    resetButton();
  }
}

// 获取 API 配置
async function getAPIConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['apiKey', 'subfolder'], (result) => {
      resolve({
        apiKey: result.apiKey || '',
        subfolder: result.subfolder || 'ChatGPT_Summary'
      });
    });
  });
}

// 使用 File System Access API 保存文件
async function saveWithFileSystemAPI(conversation, config) {
  try {
    // 1. 尝试获取已保存的文件夹 handle
    let directoryHandle = await getDirectoryHandle('vault');

    // 2. 如果没有保存的 handle，提示用户选择
    if (!directoryHandle) {
      saveButton.innerHTML = '📁 请选择文件夹...';
      showNotification('💡 首次使用需要选择保存文件夹');

      try {
        directoryHandle = await window.showDirectoryPicker({
          mode: 'readwrite',
          startIn: 'documents'
        });

        // 保存 handle 到 IndexedDB（在 content script 上下文中）
        await saveDirectoryHandle('vault', directoryHandle);

        // 同时保存文件夹名称到 chrome.storage（用于 popup 显示）
        await chrome.storage.local.set({ vaultFolderName: directoryHandle.name });

        showNotification(`✅ 已记住文件夹: ${directoryHandle.name}`);
      } catch (error) {
        if (error.name === 'AbortError') {
          showNotification('⚠️ 已取消保存');
          return;
        }
        throw error;
      }
    }

    // 3. 验证权限（如果权限被撤销，重新请求）
    try {
      // 检查权限状态
      const permission = await directoryHandle.queryPermission({ mode: 'readwrite' });

      if (permission !== 'granted') {
        console.log('[GPT2Obsidian] Permission not granted, requesting...');
        const newPermission = await directoryHandle.requestPermission({ mode: 'readwrite' });

        if (newPermission !== 'granted') {
          showNotification('⚠️ 需要授予文件夹访问权限');
          return;
        }
      }
    } catch (permissionError) {
      console.warn('[GPT2Obsidian] Permission check failed:', permissionError);
      // 如果权限检查失败，尝试重新请求
      try {
        const newPermission = await directoryHandle.requestPermission({ mode: 'readwrite' });
        if (newPermission !== 'granted') {
          showNotification('⚠️ 需要授予文件夹访问权限');
          return;
        }
      } catch (e) {
        showNotification('⚠️ 权限验证失败，请重新选择文件夹');
        // 删除无效的 handle
        await deleteDirectoryHandle('vault');
        return;
      }
    }

    // 4. 获取或创建子文件夹
    const subfolder = config.subfolder || 'ChatGPT_Summary';
    let targetDir = directoryHandle;
    try {
      targetDir = await directoryHandle.getDirectoryHandle(subfolder, { create: true });
    } catch (e) {
      console.warn('[GPT2Obsidian] Using root directory:', e);
    }

    // 5. 调用 API 进行总结
    saveButton.innerHTML = '⏳ 正在总结...';
    const summary = await summarizeWithGLM(conversation, config.apiKey);

    // 6. 生成 Markdown 内容
    const markdown = generateMarkdown(conversation, summary);

    // 7. 生成文件名
    const filename = generateFilename(conversation.title, conversation.timestamp);

    // 8. 创建并写入文件
    saveButton.innerHTML = '⏳ 正在保存...';
    const fileHandle = await targetDir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(markdown);
    await writable.close();

    console.log('[GPT2Obsidian] File saved:', filename);
    showNotification(`✅ 已保存到 ${directoryHandle.name}/${subfolder}/${filename}`);

  } catch (error) {
    console.error('[GPT2Obsidian] FileSystem API error:', error);

    // 如果是权限相关错误，清除已保存的 handle
    if (error.name === 'NotAllowedError' || error.name === 'NotFoundError') {
      await deleteDirectoryHandle('vault');
      showNotification('⚠️ 文件夹权限失效，请重新选择');
      return;
    }

    throw error;
  }
}

// 调用 GLM API 进行总结
async function summarizeWithGLM(conversation, apiKey) {
  const conversationText = conversation.messages
    .map(msg => `${msg.role === 'user' ? '我' : 'ChatGPT'}: ${msg.content}`)
    .join('\n\n');

  const prompt = `请分析以下与ChatGPT的对话记录，并按以下格式生成总结：

## 对话主题
[用一句话概括这次对话的核心主题]

## 我的问题
[列出我在对话中遇到的问题、困惑或需要解决的事项]

## ChatGPT的建议/解决方案
[提炼ChatGPT给出的关键建议、方法和解决方案]

## 关键要点
[提取所有重要知识点或行动项]

---

对话记录标题：${conversation.title}

对话内容：
${conversationText}

请严格按照上述格式输出，保持简洁明了。`;

  const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'glm-4-plus',
      messages: [
        {
          role: 'system',
          content: '你是一个专业的对话总结助手，擅长提炼关键信息。'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`GLM API错误: ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// 生成 Markdown 内容
function generateMarkdown(conversation, summary) {
  const date = new Date(conversation.timestamp).toISOString().split('T')[0];
  const datetime = new Date(conversation.timestamp).toLocaleString('zh-CN');

  let markdown = `---
title: ${conversation.title}
date: ${datetime}
tags: [chatgpt, summary]
source: chatgpt-web
url: ${conversation.url}
---

# 📝 对话总结

${summary}

---

# 💬 原始对话

`;

  conversation.messages.forEach((msg, index) => {
    const role = msg.role === 'user' ? '## 我' : '## ChatGPT';
    const cleanContent = msg.content
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    markdown += `${role}\n\n${cleanContent}`;

    if (index < conversation.messages.length - 1) {
      markdown += '\n\n';
    }
  });

  return markdown;
}

// 生成文件名
function generateFilename(title, timestamp) {
  const date = new Date(timestamp).toISOString().split('T')[0];
  const safeTitle = title
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '_')
    .substring(0, 50);
  return `${date}_${safeTitle}.md`;
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
