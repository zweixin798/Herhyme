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

默认 API 地址为 `https://api.herhyme.site`。开发者工具调试时可通过 Storage 中的 `herRhymeApiBaseUrl` 临时覆盖。正式发布前，需要在微信公众平台把 `https://api.herhyme.site` 配置为 request 合法域名。

## 当前技术边界

- 当前页面仍优先使用本地 Storage，API 服务作为可部署的数据层骨架。
- 暂无微信登录、云同步和 AI 意图识别，AI 对话入口当前为占位状态。
- Agent 记忆当前由用户在本地手动管理，只有启用的记忆才预留给后续 AI 对话读取。
- 热量和营养计算在 `utils/calculator.js` 中独立实现。
- 后续接入远程 API 时，再把 profile、logs、weights 同步到服务端。
