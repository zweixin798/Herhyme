# Her Rhyme Mini Program MVP

这是一个微信小程序原生技术栈的可部署 MVP。小程序前端可以本地运行，`server/` 提供可部署的 Node API。

## 当前部署状态

- 腾讯云公网 IP：`124.220.63.165`
- API 预留地址：`https://api.herhyme.site`
- 服务目录：`/home/ubuntu/her-rhyme-api`
- systemd 服务名：`her-rhyme`
- 域名已经解析到服务器，但当前公网 HTTPS 连接仍会被重置；备案放行前，小程序不依赖该接口运行。
- 备案完成后，需要重新检查 Nginx、HTTPS 证书和 `https://api.herhyme.site/health`，再启用云端同步。

小程序当前以本地 Storage 为主。远程请求失败不会影响档案、计划、记录、身体地图和 Agent 记忆的本地使用。

## 当前产品结构

- 计划：内置 16:8、每周饮食、每日训练、周期恢复和睡眠模板，并支持创建个性计划、暂停计划和标记今日完成。
- 今日：汇总当前状态、营养目标、五类快捷记录和今日计划，预留 AI 对话入口。
- 记录：用自然语言记录饮食、训练、睡眠、经期和心情，按周、月、年生成个人身体地图。
- 我的：管理个人身体档案、营养基线、Agent 长期记忆以及本地数据。

当前最小闭环：建档 -> 选择计划 -> 每日记录 -> 周/月/年归档 -> 形成个人基线。

## 如何打开

1. 安装并打开微信开发者工具。
2. 选择“导入项目”。
3. 项目目录选择克隆后的仓库根目录 `Herhyme`。
4. AppID 可以先使用测试号，或在 `project.config.json` 中替换为自己的小程序 AppID。
5. 点击编译即可预览。

## 本地运行 API

```bash
cd server
npm start
```

健康检查地址：`http://localhost:3000/health`

## 自然语言解析

记录页会把当前这一条文字发送到 `POST /api/logs/parse`，服务端再调用 DeepSeek 或 Qwen 的 OpenAI 兼容接口。模型只能通过 `save_parsed_log` function calling 返回结构化结果，服务端会再次校验类型、字符串长度、热量、蛋白质、训练时长、疼痛等级和周期范围，并运行确定性规则。用户确认或修改后，最终记录先保存在本地 `herRhymeLogs`，不会在备案前自动写入服务器。

当前解析链路是：

```text
自然语言 -> function calling -> 服务端校验 -> 规则评估 -> 前端确认/修改 -> 本地归档 -> 反馈留存
```

这不是只调提示词。提示词负责提取意图，function schema 负责输出形状，服务端校验负责拒绝越界值，规则负责缺失字段和安全信号，用户确认负责纠正模型，反馈数据用于后续评测。当前 MVP 每句话只归档一个主意图；一句话拆成多个身体事件并路由多个专项 Agent，见 `docs/body-memory.md` 的后续阶段。

LLM Key 只配置在服务器环境变量中，不进入小程序代码、Storage 或请求参数。支持的环境变量：

```bash
LLM_PROVIDER=deepseek
LLM_API_KEY=your-server-side-key
LLM_MODEL=deepseek-chat
LLM_PARSE_RATE_LIMIT=20
# 可选：自定义 OpenAI 兼容服务地址
# LLM_BASE_URL=https://api.deepseek.com
```

切换 Qwen 时使用 `LLM_PROVIDER=qwen`，默认模型为 `qwen-plus`，默认地址为 DashScope 兼容接口。生产环境建议通过 systemd 的 `EnvironmentFile` 注入，并将文件权限设为 `600`。未配置 Key 时，接口返回 `llm_not_configured`，前端可以先保留原文，不影响本地记录。解析端点默认按客户端 IP 限制为 5 分钟 20 次，可用 `LLM_PARSE_RATE_LIMIT` 调整；正式版仍需接入微信登录后的服务端会话鉴权。

## 备案前研究采集

在“我的 -> 身体数据研究”中，用户可以明确开启研究导出。默认导出包不包含原始自然语言，只包含去标识编号、身体档案、结构化身体事件、每日快照、基线成熟度和解析纠错反馈；“同时包含记录原文”是单独的第二个开关。研究数据包只会在用户主动生成并分享后离开设备，适合先做小范围访谈和真实记录测试。

研究数据契约和窗口定义见 [`docs/body-memory.md`](docs/body-memory.md)。

## 服务器常用命令

```bash
sudo systemctl status her-rhyme
sudo systemctl restart her-rhyme
sudo journalctl -u her-rhyme -n 100 --no-pager
sudo nginx -t
sudo systemctl reload nginx
sudo certbot certificates
sudo certbot renew --dry-run
```

当前 API 使用 JSON 文件保存数据，适合原型和单机部署。正式多用户版本应换成 PostgreSQL 或云数据库。

## 远程 API

开发者工具中的 `develop` 环境默认调用 `https://124.220.63.165`，用于内部演示和解析联调；因为 IP 证书不能作为正式合法域名，这条通道不适合收集真实敏感数据。体验版与正式版默认使用 `https://api.herhyme.site`，备案和证书完成后，再在微信公众平台把它配置为 request 合法域名。

本地调试时仍可通过 Storage 中的 `herRhymeApiBaseUrl` 临时覆盖地址。

## 当前技术边界

- 当前页面仍优先使用本地 Storage，API 服务作为可部署的数据层骨架。
- 暂无微信登录、云同步和 AI 对话，AI 对话入口当前为占位状态；自然语言记录解析端点已经完成，但需要服务器配置 LLM Key 才会真正调用模型。
- Agent 记忆当前由用户在本地手动管理，只有启用的记忆才预留给后续 AI 对话读取。
- 热量和营养计算在 `utils/calculator.js` 中独立实现。
- 备案前不自动同步 profile、logs、weights；完成备案、登录鉴权和隐私协议后，再把本地数据同步到服务端。
