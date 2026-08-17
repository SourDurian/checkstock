# VMISS Stock Monitor

每 10 分钟在 GitHub Actions 的虚拟显示器中启动标准 Chromium，检查三个 VMISS 洛杉矶套餐，并在精确目标到货时通过 SMTP 发邮件。它只读取公开商品页面，不登录、不加入购物车，也不自动购买。

## 监控目标

| 优先级 | 套餐 | 价格 | 购买链接 |
| --- | --- | --- | --- |
| 1 | `US.LA.TRI.DC2.Basic` | `$5.00 CAD / Monthly` | [打开](https://app.vmiss.com/store/us-los-angeles-bgp/basic) |
| 2 | `US.LA.TRI.Basic` | `$5.00 CAD / Monthly` | [打开](https://app.vmiss.com/store/us-los-angeles-tri/basic) |
| 3 | `US.LA.CN2.Basic` | `$6.00 CAD / Monthly` | [打开](https://app.vmiss.com/store/us-los-angeles-cn2/basic) |

只有套餐名、价格、计费周期、库存数字和订单按钮状态全部一致时才会判定到货。同一分类下其他套餐有货不会触发提醒。

## 邮箱配置

推荐使用通用 SMTP。先在邮箱服务商处开启 SMTP，并创建应用专用密码或授权码，然后在仓库的 **Settings > Secrets and variables > Actions** 中创建：

| Secret | 内容 |
| --- | --- |
| `SMTP_HOST` | SMTP 服务器地址 |
| `SMTP_PORT` | 通常为 `465` 或 `587`；不设置时为 `465` |
| `SMTP_SECURE` | `465` 使用 `true`，`587` 使用 `false`；不设置时根据端口判断 |
| `SMTP_USER` | 发件邮箱账号 |
| `SMTP_PASSWORD` | SMTP 密码、应用专用密码或授权码 |
| `MAIL_FROM` | 可选，例如 `VMISS Stock Monitor <sender@example.com>` |
| `ALERT_TO` | 收件地址；不设置时使用 `SMTP_USER` |

常见配置如下，服务商可能要求先单独开启 SMTP：

| 服务商 | `SMTP_HOST` | 端口 | `SMTP_SECURE` |
| --- | --- | --- | --- |
| Gmail | `smtp.gmail.com` | `465` | `true` |
| Outlook / Hotmail | `smtp-mail.outlook.com` | `587` | `false` |
| QQ 邮箱 | `smtp.qq.com` | `465` | `true` |
| 163 邮箱 | `smtp.163.com` | `465` | `true` |

原来的 Gmail 简化配置仍然兼容：只设置 `GMAIL_USER`、`GMAIL_APP_PASSWORD` 和可选的 `ALERT_TO`，不要同时设置 `SMTP_HOST`。

不要把 `.env`、邮箱密码、授权码或应用专用密码提交到仓库。

## 启用与验证

1. 将实现分支合并到默认分支。
2. 配置上述 Secrets。
3. 打开 **Actions > VMISS Stock Monitor > Run workflow**。
4. 勾选 `Send an SMTP test message` 并运行，确认测试邮件到达。
5. 再手动运行一次且不勾选测试邮件，检查 Actions Summary 中三个目标的结果。

定时任务安排在每小时的 `07/17/27/37/47/57` 分。GitHub 的定时任务属于尽力调度，繁忙时可能延迟。

## 告警规则

- 无货转为有货：立即发送一封邮件。
- 下一轮仍有货：再提醒一次，之后保持静默。
- 重新无货后再次到货：开始新一轮提醒。
- 单个目标连续三轮无法检查：发送一次异常邮件；恢复后发送一次恢复邮件。
- Cloudflare 挑战、`1015` 限流、价格变化或页面结构变化都视为检查失败，不会误报为到货。

状态保存在 `.monitor-state.json`。文件只在实际状态改变时更新，并且至少每 30 天更新一次心跳，避免公开仓库因长期无活动而停用定时工作流。

## 本地开发

需要 Node.js 24 和 pnpm：

```bash
pnpm install
pnpm test
pnpm exec playwright install chromium
pnpm test:live
```

`pnpm test:live` 会访问实站并输出判断结果，但不会发邮件或修改状态。可通过 `MONITOR_MIN_DELAY_MS` 和 `MONITOR_MAX_DELAY_MS` 调整本地诊断的页面间隔；正式工作流使用 20–35 秒随机间隔。

如果首个 24 小时内成功检查率低于 95%，或者一天内两次出现连续三轮 Cloudflare 拦截，应将同一程序迁移到固定 IP 的小型 VPS。
