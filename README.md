# 简账 — 个人记账 iOS App

仿 iCost 风格的本地记账应用：支出 / 收入 / 转账、多账户、分类管理、月度预算、统计图表、数据备份。数据全部存在手机本地 SQLite，无需联网、无需账号。

技术栈：Expo (SDK 57) + React Native + TypeScript + expo-router + expo-sqlite（金额以「分」整数存储）+ 自绘图表（react-native-svg）。

---

## 一、日常使用（推荐，脱离电脑）

App 发布到 Expo 免费云端后，手机上随时可用，电脑关机也没关系：

```bash
cd simple-ledger

# 1. 注册免费账号：https://expo.dev/signup（只需一次）
npx eas-cli login          # 浏览器里登录你的 expo 账号

# 2. 登记项目（只需一次，会生成 projectId 写入 app.json）
npx eas-cli init

# 3. 发布 / 更新应用
npx eas-cli update --branch production --message "v1"
```

发布后，手机 Expo Go 里打开项目（Expo Go → Profile → Recents 里有你的项目），或访问 `https://expo.dev/@你的用户名/simple-ledger` 页面上的二维码/链接。

- 首次打开需联网（从 Expo CDN 加载），之后 Expo Go 有缓存
- 记账数据始终在本机，离线完全可用
- **不要卸载 Expo Go**（数据在其沙盒内）；可把 iOS「快捷指令」指向 exp:// 链接实现桌面一键打开

## 二、开发调试（需电脑与手机同一 Wi-Fi）

```bash
cd simple-ledger
npx expo start        # 手机 Expo Go 扫终端里的二维码
```

类型检查：`npx tsc --noEmit`。图表口径回归：`npm test`（使用支持直接运行 TypeScript 的 Node.js 22.18+）。浏览器预览：`npx expo start --web`（左滑删除等原生交互仅真机有效）。

## 三、日后上架 App Store（可选）

需要 Apple Developer 账号（$99/年），无需安装 Xcode：

```bash
npx eas-cli build --platform ios --profile production
npx eas-cli submit --platform ios
```

---

## 功能说明

| 页面 | 功能 |
|------|------|
| 明细 | 年月直达、月收支汇总、预算详情入口、本月搜索、收支/账户/分类筛选、按日分组虚拟列表、点击编辑、左滑删除（原生）、删除后 7 秒撤销 |
| 全库搜索 | 跨月份搜索备注、分类、账户或金额，支持收支类型、账户、分类组合筛选 |
| 记一笔 | 大键盘金额输入、支出/收入/转账三态、自动提取最近半年的常用账单、常用/全部分类、账户选择、日期、备注、保存防重与反馈、退出时保护未保存输入 |
| 图表 | 每日柱图点按读数、跳转当天/分类明细、月度同期比较、日均与月底预估、完整口径的分类环图 + 排行榜、当前账户余额 |
| 资产 | 净资产、资产构成、查看账户本月流水、独立的账户编辑入口 |
| 预算 | 总预算与分类预算、已用/剩余/超支、按月保存预算快照；新月份沿用最近一期，历史修改互不影响 |
| 周期账单 | 房租、工资、订阅等月账规则；到期进入首页待确认，确认后才写入流水，可跳过、暂停或恢复 |
| 我的 | 分类管理、周期规则、预算设置、设备内快照、备份健康、导出 JSON / CSV、恢复备份 |

规则要点：

- 转账不计入收支统计；账户余额 = 期初 + 收入 − 支出 + 转入 − 转出
- 有流水记录的账户/分类不可删除（保护数据），可改名改图标
- 所有金额以「分」整数存储，避免浮点误差

## 数据备份

「我的 → 备份与恢复」会自动保留最近一次设备内安全快照，并显示快照与外部备份的时间：

- 设备内快照用于撤销误操作和恢复近期状态，但会随 App 卸载一起丢失。
- JSON 是完整备份，包含账户、分类、流水、预算快照和周期账单；需要存到文件或网盘。
- CSV 用于 Excel 查看，不包含周期规则和预算快照，不能作为完整恢复来源。

建议至少每月导出一次 JSON，并在换机或卸载前再导出一次。

## 目录结构

```
src/
  app/            # expo-router 页面（明细/图表/我的 Tab + 记一笔 modal）
  components/     # 日历弹层、流水行、图表、表情选择等
  db/             # SQLite 建表迁移、repository（含统计聚合）、类型
  store/          # Zustand 全局缓存（账户/分类/设置 + 数据版本号）
  utils/          # 金额（分）、日期工具
  constants/      # 主题色
```
