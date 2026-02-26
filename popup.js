/**
 * GPT to Obsidian - Popup Script
 * 处理设置界面的交互逻辑
 */

// DOM元素
const elements = {
  apiKey: document.getElementById('apiKey'),
  toggleApiKey: document.getElementById('toggleApiKey'),
  vaultPath: document.getElementById('vaultPath'),
  selectFolder: document.getElementById('selectFolder'),
  subfolder: document.getElementById('subfolder'),
  saveConfig: document.getElementById('saveConfig'),
  testApi: document.getElementById('testApi'),
  historyList: document.getElementById('historyList'),
  notification: document.getElementById('notification')
};

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[GPT2Obsidian] Popup loaded');

  // 加载保存的配置
  await loadConfig();

  // 加载历史记录
  await loadHistory();

  // 绑定事件
  bindEvents();
});

// 绑定事件
function bindEvents() {
  // API Key显示/隐藏
  elements.toggleApiKey.addEventListener('click', () => {
    if (elements.apiKey.type === 'password') {
      elements.apiKey.type = 'text';
      elements.toggleApiKey.textContent = '隐藏';
    } else {
      elements.apiKey.type = 'password';
      elements.toggleApiKey.textContent = '显示';
    }
  });

  // 保存配置
  elements.saveConfig.addEventListener('click', async () => {
    await saveConfig();
  });

  // 测试API
  elements.testApi.addEventListener('click', async () => {
    await testApiConnection();
  });

  // 选择文件夹
  elements.selectFolder.addEventListener('click', async () => {
    await selectFolder();
  });
}

// 加载配置
async function loadConfig() {
  try {
    const response = await sendMessage({ action: 'getConfig' });

    if (response.success) {
      const config = response.config;

      elements.apiKey.value = config.apiKey || '';
      elements.vaultPath.value = config.vaultPath || '';
      elements.subfolder.value = config.subfolder || 'ChatGPT_Summary';

      // 如果有保存的文件夹名称，显示它
      const result = await chrome.storage.local.get(['vaultFolderName']);
      if (result.vaultFolderName && !elements.vaultPath.value) {
        elements.vaultPath.value = `📁 ${result.vaultFolderName} (已选择)`;
      }

      console.log('[GPT2Obsidian] Config loaded');
    }

  } catch (error) {
    console.error('[GPT2Obsidian] Load config error:', error);
  }
}

// 保存配置
async function saveConfig() {
  try {
    const config = {
      apiKey: elements.apiKey.value.trim(),
      vaultPath: elements.vaultPath.value.trim(),
      subfolder: elements.subfolder.value.trim() || 'ChatGPT_Summary'
    };

    // 验证
    if (!config.apiKey) {
      showNotification('请输入API Key', 'error');
      return;
    }

    // 保存
    await sendMessage({ action: 'saveConfig', data: config });

    showNotification('✅ 配置已保存', 'success');

    console.log('[GPT2Obsidian] Config saved');

  } catch (error) {
    console.error('[GPT2Obsidian] Save config error:', error);
    showNotification('保存失败: ' + error.message, 'error');
  }
}

// 测试API连接
async function testApiConnection() {
  const apiKey = elements.apiKey.value.trim();

  if (!apiKey) {
    showNotification('请先输入API Key', 'error');
    return;
  }

  try {
    elements.testApi.textContent = '⏳ 测试中...';
    elements.testApi.disabled = true;

    const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'glm-4-plus',
        messages: [
          { role: 'user', content: '你好' }
        ],
        max_tokens: 10
      })
    });

    if (response.ok) {
      showNotification('✅ API连接成功', 'success');
    } else {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || '连接失败');
    }

  } catch (error) {
    console.error('[GPT2Obsidian] Test API error:', error);
    showNotification('❌ API连接失败: ' + error.message, 'error');
  } finally {
    elements.testApi.textContent = '🧪 测试API连接';
    elements.testApi.disabled = false;
  }
}

// 选择文件夹
async function selectFolder() {
  try {
    // 检查浏览器支持
    if (!('showDirectoryPicker' in window)) {
      showNotification('❌ 您的浏览器不支持文件夹选择功能', 'error');
      return;
    }

    // 打开文件夹选择器
    const dirHandle = await window.showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'downloads'
    });

    // 获取文件夹路径（注意：由于安全限制，无法获取完整路径）
    const folderName = dirHandle.name;

    // 显示路径
    elements.vaultPath.value = `📁 ${folderName} (已选择)`;

    // 保存handle到chrome.storage（注意：popup关闭后handle会失效）
    await chrome.storage.local.set({
      vaultFolderName: folderName,
      vaultPath: `📁 ${folderName} (已选择)`
    });

    showNotification(`✅ 已选择文件夹: ${folderName}`, 'success');

    console.log('[GPT2Obsidian] Folder selected:', folderName);

    // 显示提示信息
    setTimeout(() => {
      showNotification('⚠️ 文件将保存到下载文件夹，请手动移动到Obsidian', 'info');
    }, 2000);

  } catch (error) {
    // 用户取消选择
    if (error.name === 'AbortError') {
      console.log('[GPT2Obsidian] Folder selection cancelled');
      return;
    }

    console.error('[GPT2Obsidian] Select folder error:', error);
    showNotification('❌ 选择文件夹失败: ' + error.message, 'error');
  }
}

// 加载历史记录
async function loadHistory() {
  try {
    const result = await chrome.storage.local.get(['history']);
    const history = result.history || [];

    if (history.length === 0) {
      elements.historyList.innerHTML = '<p class="empty-text">暂无历史记录</p>';
      return;
    }

    // 显示历史记录
    elements.historyList.innerHTML = history
      .slice(0, 10)  // 只显示最近10条
      .map(item => {
        const date = new Date(item.timestamp);
        const timeStr = date.toLocaleString('zh-CN');

        return `
          <div class="history-item">
            <div class="history-title">${escapeHtml(item.title)}</div>
            <div class="history-time">${timeStr}</div>
          </div>
        `;
      })
      .join('');

    console.log('[GPT2Obsidian] History loaded:', history.length);

  } catch (error) {
    console.error('[GPT2Obsidian] Load history error:', error);
  }
}

// 发送消息到background
function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response && response.success) {
        resolve(response);
      } else {
        reject(new Error(response?.error || '未知错误'));
      }
    });
  });
}

// 显示通知
function showNotification(message, type = 'info') {
  const notification = elements.notification;

  notification.textContent = message;
  notification.className = `notification ${type}`;

  // 3秒后自动隐藏
  setTimeout(() => {
    notification.classList.add('hidden');
  }, 3000);
}

// HTML转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
