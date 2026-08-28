# MBTI 性格测试

一个可发布到 GitHub Pages 的中文 MBTI 测试网站，包含：

- 90 道 A/B 二选一题目
- 姓名输入、逐题作答、进度保存与自动计分
- 仅向参与者展示四字母 MBTI 结果
- 使用腾讯云 CloudBase 保存姓名、结果与云端提交时间
- 管理员固定密码由 CloudBase 云函数验证
- 管理后台按时间倒序展示结果和类型解析
- 一键复制 CSV 或下载可由 Excel 直接打开的 CSV 文件

## 系统结构

浏览器不会直接读写数据库。GitHub Pages 通过 HTTPS 调用 `mbti-http-api` HTTP 云函数：

- `submit`：云函数校验姓名和 MBTI 结果，使用服务器时间写入 `submissions` 集合；
- `list`：云函数验证环境变量中的管理员密码，验证通过后返回按时间倒序排列的记录；
- HTTP 云函数仅允许 `keyzhao0118.github.io` 跨域调用；
- CloudBase 数据库客户端读写权限全部关闭，避免访客直接查询或篡改记录。

## 本地预览

本项目没有构建步骤。建议通过本地 HTTP 服务预览：

```powershell
python -m http.server 4173
```

然后打开 `http://127.0.0.1:4173/`。

## CloudBase 配置

### 1. CloudBase 环境

1. 打开 [腾讯云 CloudBase 控制台](https://tcb.cloud.tencent.com/dev)。
2. 创建一个免费体验环境，地域选择上海。
3. 当前项目已绑定环境 `mbti-test-d6gfle01q4ef77520`。

环境 ID 是 Web 客户端公开标识，不要在仓库中填写腾讯云 SecretId、SecretKey 或管理员密码。

### 2. GitHub Pages 与跨域

体验版不能把 GitHub Pages 加入 Web SDK 安全域名，因此本项目不使用浏览器 SDK，而使用 HTTP 云函数。函数响应只允许：

```text
keyzhao0118.github.io
```

本地调试同时允许 `localhost` 与 `127.0.0.1`。

### 3. 创建数据库集合

1. 打开“云数据库”，创建集合 `submissions`。
2. 将数据库安全规则设置为 [database.rules.json](./database.rules.json) 的内容。

数据库规则禁止所有 Web 客户端直接读写；CloudBase 云函数使用服务端身份，不受客户端数据库规则限制。

### 4. 部署云函数

1. 部署 HTTP 云函数 `mbti-http-api`。
2. 运行环境选择 Node.js 18 或更高版本。
3. 上传 [cloudfunctions/mbti-http-api](./cloudfunctions/mbti-http-api) 中的代码。
4. 安装依赖并部署函数。
5. 在云函数环境变量中新增：

```text
ADMIN_PASSWORD=<项目管理员约定的固定密码>
```

不要把真实密码写进 GitHub 仓库。

### 5. 设置 HTTP 调用权限

将 [authz.rego](./authz.rego) 应用为环境 OPA 策略。该策略默认拒绝，只允许匿名访问 `mbti-http-api`；管理员数据读取仍需通过函数内部的密码验证。

## 计分说明

每题 A 对应维度前一个字母，B 对应后一个字母。四个维度题数均为奇数，因此不会出现平分。

附件原始计分表的第 77–80 题归类与题目文字发生顺次错位，本项目按题意修正为：

- 77：S/N
- 78：T/F
- 79：J/P
- 80：E/I

最终题数为 E/I 21 题、S/N 23 题、T/F 23 题、J/P 23 题，共 90 题。

## 发布

将文件推送到 GitHub 仓库后，在仓库“Settings → Pages”中选择用于发布的分支和根目录。网站不需要服务器构建步骤。
