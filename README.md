# ChatGPT to Obsidian 浏览器插件

将ChatGPT对话自动总结并保存到Obsidian知识库的Chrome浏览器插件。

## 功能特性

- ✅ **一键保存**：在ChatGPT页面点击按钮即可保存当前对话
- 🤖 **智能总结**：使用GLM-4.7 API自动生成结构化总结
- 📝 **Obsidian格式**：生成包含frontmatter的Markdown文件
- 🎯 **结构化输出**：主题、问题、建议、关键要点清晰呈现
- 💾 **保留原文**：总结和原始对话同时保存

## 安装方法

### 方式一：开发者模式安装（推荐）

1. 打开Chrome浏览器，访问 `chrome://extensions/`
2. 开启右上角的「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择本项目目录 `/path/to/gpt2obs`
5. 插件安装完成！

### 方式二：打包安装

1. 在 `chrome://extensions/` 页面点击「打包扩展程序」
2. 选择本项目目录
3. 生成.crx文件后拖拽到浏览器安装

## 使用指南

### 1. 配置API Key

1. 点击浏览器工具栏的插件图标
2. 在「API配置」中输入GLM-4.7 API Key
3. 点击「测试API连接」验证配置

**获取API Key**：访问 [智谱AI开放平台](https://open.bigmodel.cn/)

### 2. 保存对话

1. 在ChatGPT网站打开任意对话
2. 点击右上角的「💾 保存到Obsidian」按钮
3. 等待处理完成（通常3-10秒）
4. 文件将保存到下载文件夹的 `gpt2obs` 目录

### 3. 导入Obsidian

1. 打开Obsidian
2. 将下载的Markdown文件移动到你的vault
3. 文件已包含完整的frontmatter和标签

## 文件结构

```
gpt2obs/
├── manifest.json       # 插件配置文件
├── background.js       # 后台服务（API调用、文件保存）
├── content.js          # 内容脚本（抓取对话、UI按钮）
├── content.css         # 注入样式
├── popup.html          # 设置界面
├── popup.js            # 设置逻辑
├── popup.css           # 设置样式
├── icons/              # 插件图标
└── README.md           # 本文档
```

## 生成的Markdown格式

```markdown
---
title: 对话标题
date: 2025-02-26 14:30:00
tags: [chatgpt, summary]
source: chatgpt-web
url: https://chatgpt.com/...
---

# 📝 对话总结

## 对话主题
[一句话概括]

## 我的问题
[列出问题]

## ChatGPT的建议/解决方案
[提炼建议]

## 关键要点
[所有重要知识点]

## 对话时间
[时间背景]

---

# 💬 原始对话

## 我
[用户消息...]

## ChatGPT
[助手回复...]
```

## 技术栈

- **Chrome Extension Manifest V3**
- **Vanilla JavaScript**（无框架依赖）
- **File System Access API**
- **智谱AI GLM-4.7 API**

## 配置说明

### API配置

| 配置项 | 说明 | 示例 |
|--------|------|------|
| API Key | 智谱AI的API密钥 | `sk-xxxxxxxx` |

### Obsidian配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| 保存位置 | 文件保存路径 | 下载文件夹 |
| 子文件夹 | 归类子目录 | `ChatGPT_Summary` |

## 常见问题

### Q: 为什么文件保存到下载文件夹？

A: Chrome扩展的安全限制无法直接写入任意目录。目前使用 `chrome.downloads` API保存到下载文件夹，您可以：
- 手动移动到Obsidian vault
- 使用Obsidian的「热备份」功能监控下载文件夹

### Q: API调用失败怎么办？

A: 请检查：
1. API Key是否正确
2. 账户余额是否充足
3. 网络连接是否正常
4. 在设置中点击「测试API连接」

### Q: 支持其他AI平台吗？

A: 目前仅支持ChatGPT网页版。后续版本将支持Claude、文心一言等平台。

### Q: 可以修改总结模板吗？

A: 目前总结格式固定在代码中。V1.1版本将支持自定义模板。

## 开发计划

- [ ] V1.1: 自定义总结模板
- [ ] V1.1: 批量保存历史对话
- [ ] V1.1: 标签自动分类
- [ ] V2.0: 支持其他AI平台
- [ ] V2.0: Obsidian原生插件版本

## 隐私说明

- API Key仅存储在本地浏览器
- 对话内容直接发送到智谱AI，不经过第三方服务器
- 不收集任何用户数据
- 代码开源，可自行审计

## 故障排除

### 按钮不显示

1. 刷新ChatGPT页面
2. 确保在 `https://chatgpt.com/*` 域名下
3. 检查控制台是否有错误

### 保存失败

1. 检查浏览器下载权限
2. 确认下载文件夹可写
3. 查看浏览器控制台错误信息

## 贡献指南

欢迎提交Issue和Pull Request！

## 许可证

MIT License

## 联系方式

- GitHub Issues: [项目地址]

---

**享受知识管理的乐趣！** 🎉
