# Her Rhyme Mini Program MVP

这是一个微信小程序原生技术栈的可部署 MVP。小程序前端可以本地运行，`server/` 提供可部署的 Node API。

## 当前部署状态

- 腾讯云公网 IP：`124.220.63.165`
- API 地址：`https://api.herhyme.site`
- 健康检查：`https://api.herhyme.site/health`
- 服务目录：`/home/ubuntu/her-rhyme-api`
- systemd 服务名：`her-rhyme`
- Nginx：公网 `443` 端口反向代理到 `127.0.0.1:3000`，`80` 自动跳转 HTTPS
- SSL：Let's Encrypt 证书，Certbot 定时自动续期

小程序默认通过 `utils/api.js` 访问正式 HTTPS API。

## 当前闭环

建档 -> 生成第一版身体基线 -> 今日状态 -> 自然语言记录 -> 本地归档 -> 查看洞察

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
- 暂无微信登录、云同步和 AI 意图识别。
- 热量和营养计算在 `utils/calculator.js` 中独立实现。
- 后续接入远程 API 时，再把 profile、logs、weights 同步到服务端。
