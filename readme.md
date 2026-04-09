# koishi-plugin-image-selector

[![npm](https://img.shields.io/npm/v/@saltnya/koishi-plugin-image-selector?style=flat-square)](https://www.npmjs.com/package/@saltnya/koishi-plugin-image-selector)

感谢原作者 [995837081/koishi-plugin-image-selecter](https://github.com/995837081/koishi-plugin-image-selecter)
感谢Fork作者 [DeepseaXX/koishi-plugin-image-selector](https://github.com/DeepseaXX/koishi-plugin-image-selector)

---

## 简介

一个图片库管理插件。将图片按文件夹分类存放，用户只需发送对应**关键词**即可随机获取该分类下的图片或视频；也可通过指令将图片**存入**指定分类。支持多别名、权限管控、精确/模糊两种触发模式、群组隔离以及**上传者记录与删除**功能。

---

## 功能特性

### 📤 关键词发图（消息中间件，无需指令前缀）

直接发送关键词触发，语法：`<关键词> [数量]`

**配置项：**
- `maxout`（默认 `1`）：单次最大发图数量上限
- `matchMode`（默认 `none`）：触发模式
  - `fuzzy` 模糊匹配：消息以关键词**开头**即触发，后缀非数字时发 1 张
  - `exact` 精确匹配：仅 `关键词` 或 `关键词 数字` 这两种格式触发，其余忽略
  - `none` 禁用模式：关键词不直接触发，仅限通过指令（如`随机`）调用

**示例**（以"猫图"为关键词，上限 5 张）：

- **通用情况（模糊模式）：**
```
猫图          → 发 1 张
猫图 3        → 发 3 张
猫图 100      → 发 5 张 (超出上限取配置值)
```

- **精确模式下** (`matchMode: 'exact'`)：
```
猫图真可爱    → 无反应 ❌
猫图abc       → 无反应 ❌
```

- **禁用模式下** (`matchMode: 'none'`)：
```
猫图          → 无反应 ❌ (关键词不触发，仅限指令)
```

---

### 📤 发图指令 `默认: 随机` · 可自定义（`sendCommandName`）

与关键词触发逻辑完全相同，区别是使用显式指令前缀。
和关键词直接可以没有空格

语法：`随机 <关键词> [数量]`

```
随机 猫图      → 发 1 张
随机猫图       → 发 1 张
随机 猫图 3    → 发 3 张（需要更改最大数量）
```

---

### 📥 存图指令 `默认: 添加` · 可自定义（`saveCommandName`）

语法：`添加 [关键词] [图片...]`，支持三种方式：

```
添加 猫图 [图片]       → 直接带图，存入"猫图"分类
[回复一张图] 添加      → 引用消息存图
添加                   → 交互式：机器人提示后再发图和关键词
```

**配置项：**
- `basePath`（必填）：图片库根目录路径
- `saveFailFallback`（默认 `true`）：关键词匹配失败时的行为，`true` 存入临时目录，`false` 直接取消
- `promptTimeout`（默认 `30`）：交互式存图的等待超时，单位秒
- `filenameTemplate`：存图文件名模板，详见"文件名模板"

**权限控制（`userLimits` / `groupLimits`）：**

设置用户/群组的上传尺寸上限（MB），`0` 表示禁止上传。

优先级：用户独立设置 > 群组独立设置 > 群组默认 > 全局默认

```
示例配置：
default: 0          → 默认所有人禁止上传
管理员ID: 100       → 管理员可上传 100MB
某群ID: 5           → 该群成员默认 5MB
某恶意用户ID: 0     → 即使在允许的群中也被禁止
```

**上传记录与删除功能（`enableRecordSubmit` / `enableRecordDelete`）**

- `enableRecordDelete`（默认 `true`）：允许用户删除自己上传的图片。  
- `enableRecordSubmit`（默认 `false`）：启用后，每次存图会记录上传者信息（用户ID、用户名、上传时间）。关闭时仅可删除旧记录。

使用方法：**回复 bot 发送的图片消息**，输入 `删除`（或 `delete` / `删`），然后根据提示输入验证码即可将图片移至回收目录（`delete/` 文件夹）。

> 注意：删除操作仅将文件移动到回收站，并非物理删除，便于管理员恢复。


---

### 📋 图库列表指令 `默认: 查看列表` · 可自定义（`listCommandName`）

列出所有可用分类及其别名与文件夹其下图片的数量。

```
查看列表列表
→ 猫咪 别名：猫图, 喵星人   有37张图片
→ 风景   有2张图片
→ 狗狗 别名：狗图   有1张图片
→ 总共有 40 张图片。
```

---

### 🔄 刷新图库指令 `默认: 刷新列表` · 可自定义（`refreshCommandName`）

手动刷新文件夹缓存。添加、删除或重命名文件夹后执行，立即生效无需重启。

```
刷新列表
→ 图库缓存已刷新，当前共有 15 个文件夹
```

---

### 🏷️ 添加关键词指令 `默认: 添加关键词` · 可自定义（'createCommandName'）

创建一个新的关键词文件夹，支持同时设置多个别名。

语法：'添加关键词 <主关键词> [别名...]'
```
添加关键词 猫猫                    → 创建文件夹"猫猫"
添加关键词 猫咪 猫图 喵星人         → 创建文件夹"猫咪",alias-config.json 中添加别名"猫图" "喵星人"
```
**别名冲突检测：** 创建时会自动检测关键词/别名是否已被其他文件夹使用，避免冲突。

---

### 🏷️ 添加别名指令 `默认: 添加别名` · 可自定义（'addAliasCommandName'）
为现有的关键词文件夹添加新别名。

语法：'添加别名 <关键词/对应别名> <新别名>'
```
添加别名 猫咪 猫主子
→ alias-config.json 中添加别名"猫主子"
```
**别名冲突检测：** 添加时会自动检测别名是否已被其他文件夹使用。

---

### 🏷️ 删除关键词指令 `默认: 删除关键词` · 可自定义（'deleteKeywordCommandName'）

将某关键词对应文件夹移动到 `delete/` 目录下，删去原有`alias-config.json`、`records-config.json`信息并暂存
执行删除前需要回复6位验证码确认

语法：'删除关键词 <关键词/对应别名>'
```
删除关键词 猫猫                    
→ 移动文件夹"猫猫"至 delete/ 目录下
```

---

### 🏷️ 删除别名指令 `默认: 删除别名` · 可自定义（'deleteAliasCommandName'）
为现有的关键词文件夹删除别名。

语法：'删除别名 <关键词/对应别名> <别名>'
```
删除别名 猫咪 猫主子
→ 删除 alias-config.json 中的"猫主子"别名
```

---

### ↩️ 撤销删除关键词指令 `默认: 删除关键词` · 可自定义（'undoDeleteKeywordCommandName'）

撤销最近的删除关键词操作。
删除关键词缓存只保留最近一次且只保留24h，超时的只能手动修改路径

语法：'撤销删除关键词 <关键词/对应别名>'
```
撤销删除关键词 猫猫                    
→ 移动文件夹"猫猫"从 delete/ 到 images/ 目录下，恢复原有`alias-config.json`、`records-config.json`信息
```

---

### 群组隔离功能

支持为不同群组配置独立的图片库，实现群组间的数据隔离。  
每个群组拥有独立的 `images/`、`temp/`、`delete/` 目录以及 `alias-config.json`、`records-config.json`。

**配置示例**
```yaml
groupMappings:
  - groupName: group_0
    guildIds: ['123456789', '987654321']
  - groupName: group_1
    guildIds: ['111111111']
fallbackGroupName: default
enableForUnmappedGroups: false
```

**效果说明**

| 群号 | 使用文件夹 | 说明 |
|:----:|:----:|:----:|
| 123456789 | 'group_0' | 已映射到 group_0 |
| 987654321 | 'group_0' | 已映射到 group_0 |
| 111111111 | 'group_1' | 已映射到 group_1 |
| 其他群 | 无法使用 | 'enableForUnmappedGroups: false' |

**目录结构**
```
basePath/
├── group_0/
│   ├── images/
│   │   ├── 猫咪/          # 文件夹名仅为关键词
│   │   └── 风景/
│   ├── temp/              # 临时文件
│   ├── delete/            # 回收站
│   ├── alias-config.json  # 别名配置
│   └── records-config.json # 上传记录
├── group_1/
│   └── ...
└── default/
    └── ...
```
---

## 猫娘化回复功能
  开启后Bot回复会带“喵~”等可爱语气，关闭则书面化回复

---

## 进阶说明与机制

### 别名系统
文件夹名仅使用**主关键词**（如 `猫咪`）。别名存储在 `alias-config.json` 中，格式如下：

```json
[
  {
    "keyword": "猫咪",
    "aliases": ["猫图", "喵星人"]
  }
]
```

发送消息时，匹配 `keyword` 或任意 `aliases` 中的词均可触发。
**自动迁移**：首次运行时会自动将旧版文件夹名（如 `猫咪-猫图-喵星人`）转换为新结构：

- 文件夹重命名为 `猫咪`

- 别名 `猫图`、`喵星人` 写入 `alias-config.json`

- 文件完整保留，不会丢失

### 上传记录与删除
当 `enableRecordSubmit = true` 时，每次存图会记录上传者信息到 `records-config.json`。
用户可以通过回复 bot 发出的图片并输入 `删除` 来移除自己上传的图片（文件移至 `delete/` 目录，记录从配置中删除）。
该功能需要配合 `enableRecordDelete = true`（默认开启）使用。

### 文件名模板
默认：`${date}-${time}-${index}-${guildId}-${userId}${ext}`

支持变量：`${userId} ${username} ${timestamp} ${date} ${time} ${index} ${ext} ${guildId} ${channelId}`

### 支持格式
- 图片：JPEG / PNG / GIF / WebP / BMP / TIFF

- 视频：MP4 / MOV / AVI

### 缓存机制
文件夹列表自动缓存 5 分钟，修改文件夹结构后使用 `刷新列表` 立即生效。
别名配置和上传记录不缓存，每次操作实时读写。

### 目录结构

```
basePath/                    ← 配置的 basePath
├── group_a/                 ← 群组文件夹
│   ├── images/              ← 图片库目录
│   │   ├── 猫咪/            ← 关键词文件夹
│   │   │   ├── 1.jpg
│   │   │   └── 2.gif
│   │   └── 风景/
│   │       └── sunset.mp4
│   ├── temp/                ← 临时存储（自动创建）
│   ├── delete/              ← 回收站（自动创建）
│   ├── alias-config.json    ← 别名配置
│   └── records-config.json  ← 上传记录
└── default/                 ← 默认群组文件夹
    └── images/
        └── ...
```


### 注意事项

1. `basePath` 必须存在且有读写权限
2. `userLimits` 必须包含 `userId` 为 `default` 的项作为全局默认值
3. 文件夹名避免使用特殊字符，别名会自动过滤非法字符
4. 定期清理`temp/` 和 `delete/` 文件夹，避免占用过多空间
5. 修改群组映射后建议执行一次 `刷新列表` 确保缓存更新
6. 旧版插件`0.6.x->0.7.x`升级后首次启动会自动执行**无损迁移**，无需手动干预
7. 若需完全禁用上传记录功能，请将 `enableRecordSubmit` 设为 `false`，此时删除功能仍可删除旧记录（如有）

---

## 许可证

MIT License
