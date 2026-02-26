/**
 * ChatGPT to Obsidian - Background Service Worker
 * 处理API调用、文件保存等后台任务
 */

// 配置常量
const GLM_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const DEFAULT_MODEL = 'glm-4-plus';

// 监听来自content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[GPT2Obsidian] Background received:', request.action);

  if (request.action === 'saveConversation') {
    handleSaveConversation(request.data)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({
        success: false,
        error: error.message
      }));
    return true; // 异步响应
  }

  if (request.action === 'getConfig') {
    getConfig()
      .then(config => sendResponse({ success: true, config }))
      .catch(error => sendResponse({
        success: false,
        error: error.message
      }));
    return true;
  }

  if (request.action === 'saveConfig') {
    saveConfig(request.data)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({
        success: false,
        error: error.message
      }));
    return true;
  }
});

// 处理保存对话
async function handleSaveConversation(conversation) {
  try {
    console.log('[GPT2Obsidian] Saving conversation:', conversation.title);

    // 1. 获取配置
    const config = await getConfig();

    if (!config.apiKey) {
      throw new Error('请先在设置中配置GLM-4.7 API Key');
    }

    if (!config.vaultPath) {
      throw new Error('请先在设置中选择Obsidian Vault文件夹');
    }

    // 2. 调用GLM API进行总结
    console.log('[GPT2Obsidian] Calling GLM API...');
    const summary = await summarizeWithGLM(conversation, config.apiKey);

    // 3. 生成Markdown内容
    const markdown = generateMarkdown(conversation, summary);

    // 4. 保存到Obsidian
    console.log('[GPT2Obsidian] Saving to Obsidian...');
    const filename = generateFilename(conversation.title, conversation.timestamp);
    const filepath = await saveToObsidian(markdown, filename, config);

    console.log('[GPT2Obsidian] Saved successfully:', filepath);

    return {
      success: true,
      filepath: filepath,
      summary: summary
    };

  } catch (error) {
    console.error('[GPT2Obsidian] Save conversation error:', error);
    throw error;
  }
}

// 调用GLM API进行总结
async function summarizeWithGLM(conversation, apiKey) {
  // 构建对话文本
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

  try {
    const response = await fetch(GLM_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
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
    const summary = data.choices[0].message.content;

    console.log('[GPT2Obsidian] GLM API success');
    return summary;

  } catch (error) {
    console.error('[GPT2Obsidian] GLM API error:', error);
    throw new Error('总结失败: ' + error.message);
  }
}

// 生成Markdown内容
function generateMarkdown(conversation, summary) {
  const date = new Date(conversation.timestamp).toISOString().split('T')[0];
  const datetime = new Date(conversation.timestamp).toLocaleString('zh-CN');

  // Frontmatter
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

  // 添加原始对话
  conversation.messages.forEach((msg, index) => {
    const role = msg.role === 'user' ? '## 我' : '## ChatGPT';

    // 清理消息内容：移除多余的连续空行
    const cleanContent = msg.content
      .replace(/\n{3,}/g, '\n\n')  // 将3个及以上连续换行压缩为2个
      .trim();                      // 移除首尾空白

    markdown += `${role}\n\n${cleanContent}`;

    // 最后一条消息后面不加换行
    if (index < conversation.messages.length - 1) {
      markdown += '\n\n';
    }
  });

  return markdown;
}

// 生成文件名
function generateFilename(title, timestamp) {
  const date = new Date(timestamp).toISOString().split('T')[0];

  // 清理文件名中的非法字符
  const safeTitle = title
    .replace(/[<>:"/\\|?*]/g, '-') // 替换非法字符
    .replace(/\s+/g, '_')           // 替换空格
    .substring(0, 50);              // 限制长度

  return `${date}_${safeTitle}.md`;
}

// 保存到Obsidian（使用chrome.downloads API）
async function saveToObsidian(content, filename, config) {
  try {
    // 将内容转换为Data URL（Service Worker中不能用createObjectURL）
    const dataUrl = `data:text/markdown;charset=utf-8,${encodeURIComponent(content)}`;

    const downloadId = await chrome.downloads.download({
      url: dataUrl,
      filename: `gpt2obs/${filename}`,  // 保存到gpt2obs子文件夹
      saveAs: false
    });

    console.log('[GPT2Obsidian] Download started:', downloadId);

    // 返回保存路径
    return `Downloads/gpt2obs/${filename}`;

  } catch (error) {
    console.error('[GPT2Obsidian] Save to Obsidian error:', error);

    // 备用方案：保存到chrome.storage，让用户手动复制
    await saveToStorageAsBackup(content, filename);

    throw new Error('文件保存失败: ' + error.message);
  }
}

// 备用保存方案（保存到storage）
async function saveToStorageAsBackup(content, filename) {
  const result = await chrome.storage.local.get(['savedFiles']);
  const savedFiles = result.savedFiles || {};

  savedFiles[filename] = {
    content: content,
    timestamp: Date.now()
  };

  // 限制存储大小
  const entries = Object.entries(savedFiles);
  if (entries.length > 10) {
    // 删除最旧的文件
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    for (let i = 0; i < entries.length - 10; i++) {
      delete savedFiles[entries[i][0]];
    }
  }

  await chrome.storage.local.set({ savedFiles });
}

// 获取配置
async function getConfig() {
  const result = await chrome.storage.local.get([
    'apiKey',
    'vaultPath',
    'subfolder',
    'directoryHandle'
  ]);

  return {
    apiKey: result.apiKey || '',
    vaultPath: result.vaultPath || '',
    subfolder: result.subfolder || 'ChatGPT_Summary',
    directoryHandle: result.directoryHandle || null
  };
}

// 保存配置
async function saveConfig(config) {
  await chrome.storage.local.set({
    apiKey: config.apiKey,
    vaultPath: config.vaultPath,
    subfolder: config.subfolder
  });

  console.log('[GPT2Obsidian] Config saved');
}

// 插件安装时的初始化
chrome.runtime.onInstalled.addListener(() => {
  console.log('[GPT2Obsidian] Extension installed');

  // 设置默认配置
  chrome.storage.local.set({
    subfolder: 'ChatGPT_Summary',
    history: []
  });
});

// 插件启动时的初始化
chrome.runtime.onStartup.addListener(() => {
  console.log('[GPT2Obsidian] Extension started');
});
