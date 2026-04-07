import { Context, Schema, h, Session } from 'koishi'

import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { Dirent } from 'node:fs' 

export const name = 'image-selector'
export const inject = {
    required: ['http', 'logger']
}

export const usage = `
一个图片库管理插件。将图片按文件夹分类存放，发送关键词即可随机发图。

### 常用指令
- **随机 [关键词] [数量]**：直接发送关键词发图,中间的空格可以省略
- **添加 [关键词]**：保存图片或视频到指定分类
- **查看列表**：查看所有可用关键词及别名
- **刷新列表**：新增文件夹后手动刷新缓存
- **添加关键词 [关键词]**：新增一个文件夹
- **添加别名 [关键词/关键词对应的别名] [要添加的别名]**：在此关键词下添加别名


<a target="_blank" href="https://www.npmjs.com/package/@deepseaxx/koishi-plugin-image-selector">➤ 详细配置及进阶用法文档</a>
`

export interface Config {
    // 基础路径与群组映射
    basePath: string
    groupMappings: { groupName: string; guildIds: string[] }[]
    fallbackGroupName: string
    enableForUnmappedGroups: boolean

    // 图库指令
    listCommandName: string
    refreshCommandName: string

    // 发图功能
    sendCommandName: string
    maxout: number
    matchMode: 'fuzzy' | 'exact' | 'none'

    // 存图功能
    saveCommandName: string
    filenameTemplate: string
    promptTimeout: number
    saveFailFallback: boolean

    // 权限设置
    userLimits: { userId: string; sizeLimit: number }[]
    groupLimits: { guildId: string; sizeLimit: number }[]

    // 调试模式
    debugMode: boolean

    // 文件夹创建功能
    createCommandName: string

    // 别名管理功能
    addAliasCommandName: string

    // 猫娘化开关
    nekoMode: boolean
}

export const Config: Schema<Config> = Schema.intersect([
    // 基础路径与群组映射
    Schema.object({
        basePath: Schema.string().required().description('图片库根目录路径，例如 D:\\Bot\\image-selector').role('textarea', { rows: [2, 4] }),
        groupMappings: Schema.array(
            Schema.object({
                groupName: Schema.string().required().description('群组名称（用作文件夹名，例如 group1）'),
                guildIds: Schema.array(Schema.string()).role('table').description('群号列表，一行一个').default([])
            })
        ).description('群组映射配置。每个群组对应一个文件夹，群号列表中的群将使用该群组的图片库。').default([]),
        fallbackGroupName: Schema.string().default('default').description('当群号未匹配任何群组时，使用的默认群组名称'),
        enableForUnmappedGroups: Schema.boolean().default(false).description('是否允许未映射的群组使用插件功能（使用默认文件夹）。如果关闭，则未映射的群组将收到功能未开启的提示。')
    }).description('基础路径与群组映射'),

    // 图库指令
    Schema.object({
        listCommandName: Schema.string().default('查看列表').description('图库列表指令名（可自定义）'),
        refreshCommandName: Schema.string().default('刷新列表').description('刷新图库缓存指令名（可自定义）')
    }).description('图库指令'),

    // 发图功能
    Schema.object({
        sendCommandName: Schema.string().default('随机').description('发图指令名（可自定义）'),
        maxout: Schema.number().default(1).description('单次最大发图数量（可自定义）'),
        matchMode: Schema.union([
            Schema.const('fuzzy' as const).description('模糊匹配：消息以关键词开头即触发'),
            Schema.const('exact' as const).description('精确匹配：仅「关键词」或「关键词 数字」触发'),
            Schema.const('none' as const).description('禁用中间件：关键词不直接触发，仅限指令触发')
        ]).default('none').description('关键词匹配模式')
    }).description('发图功能'),

    // 存图功能
    Schema.object({
        saveCommandName: Schema.string().default('添加').description('存图指令名（可自定义）'),
        filenameTemplate: Schema.string().role('textarea', { rows: [2, 4] })
            .default('${date}-${time}-${index}-${guildId}-${userId}${ext}')
            .description('存图文件名模板，可用变量：${userId} ${username} ${timestamp} ${date} ${time} ${index} ${ext} ${guildId} ${channelId}'),
        promptTimeout: Schema.number().default(30).description('交互式存图的等待超时（秒）'),
        saveFailFallback: Schema.boolean().default(false).description('关键词匹配失败时：开启则存入临时目录，关闭则直接取消')
    }).description('存图功能'),

    // 权限设置
    Schema.object({
        userLimits: Schema.array(Schema.object({
            userId: Schema.string().required().description('用户 ID（填 default 作为全局默认）'),
            sizeLimit: Schema.number().min(0).step(0.1).required().description('上传上限（MB），0 表示禁止上传')
        })).role('table')
            .description('用户上传限制。必须包含 userId 为 default 的行作为全局默认值，0 表示禁止上传。')
            .default([{ userId: 'default', sizeLimit: 0 }]),
        groupLimits: Schema.array(Schema.object({
            guildId: Schema.string().required().description('群组 ID（填 default 作为群组默认）'),
            sizeLimit: Schema.number().min(0).step(0.1).required().description('上传上限（MB），0 表示禁止上传')
        })).role('table')
            .description('群组上传限制。可包含 guildId 为 default 的行作为群组默认值，0 表示禁止上传。')
            .default([{ guildId: 'default', sizeLimit: 0 }])
    }).description('权限设置'),

    // 调试模式
    Schema.object({
        debugMode: Schema.boolean().default(false).description('启用调试日志').experimental()
    }).description('调试模式'),

    //文件夹创建功能
    Schema.object({
        createCommandName: Schema.string().default('添加关键词').description('添加关键词文件夹指令名（可自定义）')
    }).description('文件夹创建功能'),

    // 别名管理功能
    Schema.object({
        addAliasCommandName: Schema.string().default('添加别名').description('添加别名指令名（可自定义）')
    }).description('别名管理功能'),

    // 猫娘化开关
    Schema.object({
        nekoMode: Schema.boolean().default(false).description('猫娘化回复：开启时回复带"喵~"等可爱语气，关闭时回复书面化语言')
    }).description('回复风格设置')
])

export function apply(ctx: Context, config: Config) {
    config = config || {} as Config

    const { basePath, groupMappings = [], fallbackGroupName = 'default', enableForUnmappedGroups = true } = config

    const guildToGroup = new Map<string, string>()
    for (const mapping of groupMappings) {
        if (mapping.groupName && Array.isArray(mapping.guildIds)) {
            for (const guildId of mapping.guildIds) {
                guildToGroup.set(guildId, mapping.groupName)
            }
        }
    }

    function getGroupName(guildId?: string): string {
        if (guildId && guildToGroup.has(guildId)) {
            return guildToGroup.get(guildId)!
        }
        return fallbackGroupName
    }

    function isGroupEnabled(session: Session): boolean {
        if (!session.guildId) {
            return enableForUnmappedGroups
        }
        if (guildToGroup.has(session.guildId)) {
            return true
        }
        return enableForUnmappedGroups
    }

    function formatMessage(nekoText: string, normalText: string): string {
        return config.nekoMode ? nekoText : normalText
    }

    function loginfo(...args: any[]) {
        if (config.debugMode) {
            ctx.logger.info(args.map(String).join(' '))
        }
    }

    function getImagePath(groupName: string): string {
        return join(basePath, groupName, 'images')
    }

    function getTempPath(groupName: string): string {
        return join(basePath, groupName, 'temp')
    }

    // 文件夹缓存机制
    const folderCacheMap = new Map<string, { folders: Dirent[]; timestamp: number }>()
    const CACHE_TTL = 5 * 60 * 1000 // 5分钟缓存

    async function getFolders(groupName: string): Promise<Dirent[]> {
        const now = Date.now()
        const cached = folderCacheMap.get(groupName)
        if (cached && now - cached.timestamp <= CACHE_TTL) {
            loginfo(`使用缓存的文件夹列表 for group ${groupName}`)
            return cached.folders
        }
        loginfo(`缓存已过期或不存在，重新读取文件夹列表 for group ${groupName}`)
        const imagePath = getImagePath(groupName)
        let folders: Dirent[] = []
        try {
            folders = await fs.readdir(imagePath, { withFileTypes: true })
        } catch (err: any) {
            loginfo(`读取图片库失败 for group ${groupName}:`, err.message)
            folders = []
        }
        folderCacheMap.set(groupName, { folders, timestamp: now })
        loginfo(`已缓存 ${folders.length} 个文件夹 for group ${groupName}`)
        return folders
    }

    function clearCache(groupName?: string) {
        if (groupName) {
            folderCacheMap.delete(groupName)
            loginfo(`文件夹缓存已清除 for group ${groupName}`)
        } else {
            folderCacheMap.clear()
            loginfo('所有文件夹缓存已清除')
        }
    }

    const getFileExtension = (file: any, imgType: string): string => {
        loginfo('文件信息:', JSON.stringify(file, null, 2))
        let detectedExtension = ''

        // 优先根据 file.type 和 file.mime 确定后缀名

        const mimeType = file.type || file.mime
        if (mimeType === 'image/jpeg') {
            detectedExtension = '.jpg'
        } else if (mimeType === 'image/png') {
            detectedExtension = '.png'
        } else if (mimeType === 'image/gif') {
            detectedExtension = '.gif'
        } else if (mimeType === 'image/webp') {
            detectedExtension = '.webp'
        } else if (mimeType === 'image/bmp') {
            detectedExtension = '.bmp'
        } else if (mimeType === 'video/mp4') {
            detectedExtension = '.mp4'
        } else if (mimeType === 'video/quicktime') {
            detectedExtension = '.mov'
        } else if (mimeType === 'video/x-msvideo') {
            detectedExtension = '.avi'
        } else if (mimeType) {
            // 如果有 type 或 mime，但不是常见的类型，则记录警告
            loginfo(`未知的文件类型，file.type=${file.type}, file.mime=${file.mime}`)
            detectedExtension = imgType === 'video' ? '.mp4' : '.jpg'
        } else {
            // 如果没有任何类型信息，则使用默认值
            loginfo(`无法检测到文件类型，file.type=${file.type}, file.mime=${file.mime}`)
            detectedExtension = imgType === 'video' ? '.mp4' : '.jpg'
        }

        loginfo('检测到的文件扩展名:', detectedExtension)
        return detectedExtension
    }

    // 统计文件夹文件数量
    async function countMediaFilesInFolder(folderPath: string): Promise<number> {
        try {
            const files = await fs.readdir(folderPath)
            const mediaFiles = files.filter(file =>
                /\.(jpe?g|png|gif|webp|mp4|mov|avi|bmp|tiff?)$/i.test(file)
            )
            return mediaFiles.length
        } catch (error) {
            loginfo(`统计文件夹 ${folderPath} 媒体文件数量失败:`, error)
            return 0
        }
    }

    // 查找角色名称匹配的文件夹
    async function findCharacterFolder(characterName: string, groupName: string): Promise<string | null> {
        try {
            const tempPath = getTempPath(groupName)
            // 首先检查临时存储路径是否已有对应文件夹
            const tempFolders = await fs.readdir(tempPath, { withFileTypes: true }).catch(() => [])
            for (const folder of tempFolders) {
                if (!folder.isDirectory()) continue
                const folderName = folder.name
                const aliases = folderName.split('-')
                if (aliases.includes(characterName)) {
                    loginfo('在临时路径找到匹配的文件夹:', folderName)
                    return folderName
                }
            }

            // 如果临时路径没有，则从图片库路径查找
            const imagePath = getImagePath(groupName)
            const imageFolders = await fs.readdir(imagePath, { withFileTypes: true }).catch(() => [])
            for (const folder of imageFolders) {
                if (!folder.isDirectory()) continue
                const folderName = folder.name
                const aliases = folderName.split('-')
                if (aliases.includes(characterName)) {
                    loginfo('在图片库找到匹配的文件夹:', folderName)
                    return folderName
                }
            }
            
            return null
        } catch (error) {
            loginfo('查找角色文件夹失败:', error)
            return null
        }
    }

    //存图指令
    ctx.command(`${config.saveCommandName} [关键词] [...图片]`, { captureQuote: false })
        .userFields(['id', 'name', 'authority'])
        .action(async ({ session }, keyword?: string, ...图片: string[]) => {
            //群聊开关插件功能
            if (!isGroupEnabled(session)) {
                return formatMessage(
                    '该功能未在此群开启，去联系Bot管理员看看吧~',
                    '该功能未在此群开启，可联系Bot管理员开启。'
                )
            }

            const groupName = getGroupName(session.guildId)

            // 预处理：检查第一参数是否为图片
            if (keyword) {
                const elements = h.parse(keyword)
                if (elements.some(el => ['img', 'mface', 'image', 'video'].includes(el.type))) {
                    图片.unshift(keyword)
                    keyword = undefined
                }
            }

            // 优先检查引用消息中的图片
            if (session.quote) {
                loginfo('检测到引用消息，尝试从引用消息中提取图片')
                const quoteElements = h.parse(session.quote.content)
                const quoteImages = quoteElements.filter(el => ['img', 'mface', 'image', 'video'].includes(el.type))

                if (quoteImages.length > 0) {
                    loginfo('从引用消息中找到图片:', quoteImages.length, '个')
                    图片 = [session.quote.content]
                }
            }

            // 解析所有图片参数
            let allImages: any[] = []
            for (const 图片Item of 图片) {
                const elements = h.parse(图片Item)
                const images = elements.filter(el => ['img', 'mface', 'image', 'video'].includes(el.type))
                allImages.push(...images)
            }

            // 如果没有图片(参数或引用)，尝试交互式获取
            if (allImages.length === 0) {
                await session.send(formatMessage('请发送图片喵~', '请发送图片。'))
                const promptResult = await session.prompt(config.promptTimeout * 1000)
                if (!promptResult) {
                    return formatMessage('未收到图片喵...', '未收到图片，操作已取消。')
                }
                const elements = h.parse(promptResult)
                const images = elements.filter(el => ['img', 'mface', 'image', 'video'].includes(el.type))
                allImages.push(...images)
            }

            if (allImages.length === 0) {
                return formatMessage('未收到有效的图片喵...', '未收到有效的图片，操作已取消。')
            }

            // 检查是否已有分类（关键词），如果没有则询问
            if (!keyword) {
                await session.send(formatMessage(
                    '请回复要保存的关键词（等待30秒超时）',
                    '请回复要保存的关键词（等待30秒超时）'
                ))
                const reply = await session.prompt(30 * 1000)
                if (!reply) {
                    return formatMessage('等待超时，未执行保存喵~', '等待超时，未执行保存操作。')
                }
                keyword = reply.trim()
            }

            // 检查权限和尺寸限制
            const userId = session.userId
            const guildId = session.guildId
            const userLimits = config.userLimits || []
            const groupLimits = config.groupLimits || []

            // 将数组转换为字典以便快速查找
            const userLimitsDict: Record<string, number> = {}
            if (Array.isArray(userLimits)) {
                for (const item of userLimits) {
                    if (item && item.userId !== undefined && item.sizeLimit !== undefined) {
                        userLimitsDict[item.userId] = item.sizeLimit
                    }
                }
            }

            const groupLimitsDict: Record<string, number> = {}
            if (Array.isArray(groupLimits)) {
                for (const item of groupLimits) {
                    if (item && item.guildId !== undefined && item.sizeLimit !== undefined) {
                        groupLimitsDict[item.guildId] = item.sizeLimit
                    }
                }
            }

             // 查找顺序: 用户独立设置 -> 群组独立设置 -> 群组默认设置 -> 全局默认设置(用户default) -> 0
            let limit: number | undefined

            // 1. 具体用户
            if (userLimitsDict[userId] !== undefined) {
                limit = userLimitsDict[userId]
            }

            // 2. 具体群组
            if (limit === undefined && guildId && groupLimitsDict[guildId] !== undefined) {
                limit = groupLimitsDict[guildId]
            }

            // 3. 群组默认
            if (limit === undefined && guildId && groupLimitsDict['default'] !== undefined) {
                limit = groupLimitsDict['default']
            }

            // 4. 全局默认 (fallback to user default)
            if (limit === undefined) {
                limit = userLimitsDict['default']
            }

            // 5. 最终兜底
            if (limit === undefined || limit === null) {
                limit = 0
            }

            // 非法值（负数等）视为 0
            if (typeof limit !== 'number' || limit < 0 || isNaN(limit)) {
                limit = 0
            }

            const sizeLimitMB = limit
            if (sizeLimitMB <= 0) {
                return formatMessage(
                    '当前用户无上传权限或已被禁止上传喵！',
                    '当前用户无上传权限或已被禁止上传。'
                )
            }
            loginfo(`用户 ${userId} 上传限制: ${sizeLimitMB}MB`)
            const sizeLimitBytes = sizeLimitMB * 1024 * 1024

            try {
                let targetPath = getTempPath(groupName)
                let folderName = ''
                let matched = false

                // 尝试在图片库中匹配文件夹 (使用发图相同的逻辑)
                if (keyword) {
                    const imageFolders = await getFolders(groupName)
                    const matchedFolders: string[] = []
                    for (const folder of imageFolders) {
                        if (!folder.isDirectory()) continue
                        const fname = folder.name
                        const aliases = fname.split('-')
                        if (aliases.includes(keyword)) {
                            matchedFolders.push(fname)
                        }
                    }

                    if (matchedFolders.length > 0) {
                        folderName = matchedFolders[0]
                        targetPath = join(getImagePath(groupName), folderName)
                        matched = true
                        loginfo('匹配到文件夹')
                    } else {
                        if (!config.saveFailFallback) {
                            return formatMessage(
                                `没有找到关键词呢...`,
                                `未找到关键词“${keyword}”，保存失败。`
                            )
                        }
                        loginfo(`没有找到关键词呢...`)
                    }
                }

                // 确保目标路径存在
                await fs.mkdir(targetPath, { recursive: true })

                const baseTimestamp = Date.now()
                let savedCount = 0

                for (let i = 0; i < allImages.length; i++) {
                    const img = allImages[i]
                    const url = img.attrs.src || img.attrs.url
                    if (!url) continue

                    const file = await ctx.http.file(url)
                    if (!file || !file.data) {
                        loginfo('无法获取文件数据:', url)
                        continue
                    }

                    const buffer = Buffer.from(file.data)

                    if (buffer.length > sizeLimitBytes) {
                        const sizeMB = (buffer.length / (1024 * 1024)).toFixed(2)
                        loginfo(`文件大小超出限制: ${sizeMB}MB > ${sizeLimitMB}MB`)
                        await session.send(formatMessage(
                            `文件 ${i + 1} 大小(${sizeMB}MB)超出限制(${sizeLimitMB}MB)，已跳过喵~`,
                            `文件 ${i + 1} 大小(${sizeMB}MB)超出限制(${sizeLimitMB}MB)，已跳过。`
                        ))
                        continue
                    }

                    const ext = getFileExtension(file, img.type)

                    // 使用基础时间戳 + 微秒偏移确保唯一性
                    const timestamp = baseTimestamp + i
                    const now = new Date(timestamp)
                    const date = now.toISOString().split('T')[0]
                    const time = now.toTimeString().split(' ')[0].replace(/:/g, '-')

                    let filename = config.filenameTemplate
                        .replace(/\$\{userId\}/g, session.userId || 'unknown')
                        .replace(/\$\{username\}/g, session.username || 'unknown')
                        .replace(/\$\{timestamp\}/g, timestamp.toString())
                        .replace(/\$\{date\}/g, date)
                        .replace(/\$\{time\}/g, time)
                        .replace(/\$\{index\}/g, (i + 1).toString())
                        .replace(/\$\{ext\}/g, ext)
                        .replace(/\$\{guildId\}/g, session.guildId || 'private')
                        .replace(/\$\{channelId\}/g, session.channelId || 'unknown')

                    filename = filename.replace(/[\u0000-\u001f\u007f-\u009f\/\\:*?"<>|]/g, '_')

                    const filepath = join(targetPath, filename)
                    

                    await fs.writeFile(filepath, buffer)
                    savedCount++

                    loginfo(`保存文件 ${i + 1}/${allImages.length}:`, filename)
                }

                if (matched) {
                    const mediaCount = await countMediaFilesInFolder(targetPath)
                    return formatMessage(`保存成功了喵~，现在有 ${mediaCount} 张图片呢~`, `保存成功，现在有 ${mediaCount} 张图片。`)
                } else {
                    return formatMessage('保存失败了喵...是不是名字写错了呢~', '保存失败，可能是关键词不存在。')
                }
            } catch (error) {
                return formatMessage(`保存失败: ${error.message}`, `保存失败: ${error.message}`)
            }

        })

     //添加别名指令
    ctx.command(`${config.addAliasCommandName} <keyword> <alias>`)
        .userFields(['id', 'authority'])
        .action(async ({ session }, keyword: string, alias: string) => {
            //群聊开关插件功能
            if (!isGroupEnabled(session)) {
                return formatMessage(
                    '该功能未在此群开启，去联系Bot管理员看看吧~',
                    '该功能未在此群开启，可联系Bot管理员开启。'
                )
            }
            const groupName = getGroupName(session.guildId)

            if (!keyword || !alias) {
                return formatMessage('请指定关键词和别名喵...', '请指定关键词和别名。')
            }

            const sanitize = (s: string) => s.replace(/[\\/:*?"<>|]/g, '_')
            const sanitizedAlias = sanitize(alias)
            if (sanitizedAlias.length === 0) {
                return formatMessage('别名包含非法字符喵！', '别名包含非法字符，无法使用。')
            }

            const folderInfo = await findFolder(keyword, groupName)
            if (!folderInfo) {
                return formatMessage(
                    `未找到关键词 "${keyword}" 对应的文件夹呢...`,
                    `未找到关键词 "${keyword}" 对应的文件夹。`
                )
            }

            const { rootPath, folderName } = folderInfo
            const currentParts = folderName.split('-')
            const mainKeyword = currentParts[0]
            const existingAliases = currentParts.slice(1)

            if (existingAliases.includes(sanitizedAlias) || sanitizedAlias === mainKeyword) {
                return formatMessage(
                    `别名 "${alias}" 已存在，不要重复添加喵！`,
                    `别名 "${alias}" 已存在，请勿重复添加。`
                )
            }

            const newFolderName = folderName + '-' + sanitizedAlias
            const oldPath = join(rootPath, folderName)
            const newPath = join(rootPath, newFolderName)

            try {
                await fs.access(newPath)
                return formatMessage(
                    `目标文件夹 "${newFolderName}" 已存在，无法重命名呢...`,
                    `目标文件夹 "${newFolderName}" 已存在，无法重命名。`
                )
            } catch {
                // 不存在，继续
            }

            try {
                await fs.rename(oldPath, newPath)
                clearCache(groupName)
                return formatMessage(
                    `别名 "${alias}" 添加成功喵，当前文件夹名称为 "${newFolderName}"喵~`,
                    `别名 "${alias}" 添加成功，当前文件夹名称为 "${newFolderName}"。`
                )
            } catch (error: any) {
                ctx.logger.error('添加别名失败', error)
                return formatMessage(`添加别名失败: ${error.message}`, `添加别名失败: ${error.message}`)
            }
        })

    // 创建关键词指令
    ctx.command(`${config.createCommandName} <keyword> [aliases...]`)
        .userFields(['id', 'authority'])
        .action(async ({ session }, keyword: string, ...aliases: string[]) => {
            //群聊开关插件功能
            if (!isGroupEnabled(session)) {
                return formatMessage(
                    '该功能未在此群开启，去联系Bot管理员看看吧~',
                    '该功能未在此群开启，可联系Bot管理员开启。'
                )
            }
            const groupName = getGroupName(session.guildId)

            if (!keyword) {
                return formatMessage('请指定关键词喵~', '请指定关键词。')
            }

            const sanitize = (s: string) => s.replace(/[\\/:*?"<>|]/g, '_')
            const mainPart = sanitize(keyword)
            const aliasParts = aliases.map(a => sanitize(a)).filter(a => a.length > 0)

            if (mainPart.length === 0) {
                return formatMessage('关键词无效（过滤后为空）。', '关键词无效（过滤后为空）。')
            }

            const folderName = [mainPart, ...aliasParts].join('-')

            // 冲突检测：构建当前群组的别名映射
            const allAliasesMap = new Map<string, string[]>()

            try {
                const imagePath = getImagePath(groupName)
                const imageFolders = await fs.readdir(imagePath, { withFileTypes: true }).catch(() => [])
                for (const folder of imageFolders) {
                    if (!folder.isDirectory()) continue
                    const name = folder.name
                    const aliasesInFolder = name.split('-')
                    for (const alias of aliasesInFolder) {
                        if (!allAliasesMap.has(alias)) allAliasesMap.set(alias, [])
                        allAliasesMap.get(alias)!.push(name)
                    }
                }
            } catch (error) {
                ctx.logger.error('读取图片库失败', error)
                return `读取图片库失败: ${(error as Error).message}`
            }

            try {
                const tempPath = getTempPath(groupName)
                const tempFolders = await fs.readdir(tempPath, { withFileTypes: true }).catch(() => [])
                for (const folder of tempFolders) {
                    if (!folder.isDirectory()) continue
                    const name = folder.name
                    const aliasesInFolder = name.split('-')
                    for (const alias of aliasesInFolder) {
                        if (!allAliasesMap.has(alias)) allAliasesMap.set(alias, [])
                        allAliasesMap.get(alias)!.push(name)
                    }
                }
            } catch (error) {
                if (config.debugMode) {
                    ctx.logger.info('临时目录读取失败（可能不存在）', error)
                }
            }

            const conflictMessages: string[] = []
            if (allAliasesMap.has(mainPart)) {
                const folders = allAliasesMap.get(mainPart)!.join('、')
                conflictMessages.push(`主关键词「${mainPart}」已存在于以下文件夹的别名中：${folders}`)
            }
            for (const aliasPart of aliasParts) {
                if (allAliasesMap.has(aliasPart)) {
                    const folders = allAliasesMap.get(aliasPart)!.join('、')
                    conflictMessages.push(`别名「${aliasPart}」已存在于以下文件夹的别名中：${folders}`)
                }
            }
            if (conflictMessages.length > 0) {
                return '创建失败，检测到别名冲突：\n' + conflictMessages.join('\n')
            }

            // 检查完整文件夹名是否已存在
            try {
                const [imageFolders, tempFolders] = await Promise.all([
                    fs.readdir(getImagePath(groupName), { withFileTypes: true }).catch(() => []),
                    fs.readdir(getTempPath(groupName), { withFileTypes: true }).catch(() => [])
                ])
                const existing = [...imageFolders, ...tempFolders].some(
                    dirent => dirent.isDirectory() && dirent.name === folderName
                )
                if (existing) {
                    return `文件夹 "${folderName}" 已存在，请勿重复创建。`
                }
            } catch (error) {
                ctx.logger.warn('检查文件夹存在性时出错', error)
            }

            try {
                const targetPath = join(getImagePath(groupName), folderName)
                await fs.mkdir(targetPath, { recursive: true })
                clearCache(groupName)
                return `关键词 "${folderName}" 创建成功！`
            } catch (error: any) {
                ctx.logger.error('创建文件夹失败', error)
                return `创建失败: ${error.message}`
            }
        })

    //图库列表指令
    ctx.command(`${config.listCommandName}`)
        .action(async ({ session }) => {
            //群聊开关插件功能
             if (!isGroupEnabled(session)) {
            return formatMessage(
                '该功能未在此群开启，去联系Bot管理员看看吧~',
                '该功能未在此群开启，可联系Bot管理员开启。'
                )
            }
            const groupName = getGroupName(session.guildId)

            try {
                const folders = await getFolders(groupName)
                const messageLines: string[] = []
                let totalMediaCount = 0

                // 收集并格式化文件夹信息
                let hasFolders = false

                for (const folder of folders) {
                    if (!folder.isDirectory()) continue

                    hasFolders = true
                    const folderName = folder.name
                    const parts = folderName.split('-')
                    const mainName = parts[0]
                    const aliases = parts.slice(1)

                    const folderPath = join(getImagePath(groupName), folderName)
                    const mediaCount = await countMediaFilesInFolder(folderPath)
                    totalMediaCount += mediaCount

                    let line = ''
                    if (aliases.length > 0) {
                        line = `${mainName} 别名：${aliases.join(', ')}   `
                    } else {
                        line = `${mainName}   `
                    }
                    if (mediaCount === 0) {
                        line += formatMessage('还没有图片呢...', '暂无图片。')
                    } else {
                        line += `有${mediaCount}张图片`
                    }
                    messageLines.push(line)
                }

                if (!hasFolders) {
                    return formatMessage('图库为空呢...', '图库为空。')
                }

                const header = `发送指令或别名随机返回图片，也可使用“${config.sendCommandName} 关键词 数量”`
                const footer = `总共有 ${totalMediaCount} 张图片喵~`
                return [header, ...messageLines, footer].join('\n')

            } catch (error: any) {
                return `获取列表失败: ${error.message}`
            }
        })

    //刷新图库缓存指令
    ctx.command(`${config.refreshCommandName}`)
        .usage(`用法：${config.refreshCommandName}
手动刷新文件夹缓存。添加、删除或重命名分类文件夹后执行，立即生效无需重启。`)
        .action(async ({ session }) => {
            //还是群聊开关插件功能
            if (!isGroupEnabled(session)) {
                return formatMessage(
                    '该功能未在此群开启，去联系Bot管理员看看吧~',
                    '该功能未在此群开启，请联系Bot管理员。'
                )
            }
            const groupName = getGroupName(session.guildId)
            try {
                clearCache(groupName)
                const folders = await getFolders(groupName)
                const folderCount = folders.filter(f => f.isDirectory()).length
                return formatMessage(
                    `图库缓存已刷新，当前共有 ${folderCount} 个文件夹`,
                    `图库缓存已刷新，当前共有 ${folderCount} 个文件夹。`
                )
            } catch (error: any) {
                return formatMessage(`刷新失败: ${error.message}`, `刷新失败: ${error.message}`)
            }
        })

    //发图核心处理函数
    async function processImageRequest(session: Session, input: string, groupName: string, sendPrompt: boolean = true): Promise<boolean> {
        //依旧是群聊开关插件功能
        if (!isGroupEnabled(session)) {
            if (sendPrompt) {
                await session.send(formatMessage(
                    '该功能未在此群开启，去联系Bot管理员看看吧~',
                    '该功能未在此群开启，请联系Bot管理员。'
                ))
            }
            return false
        }
        if (!input) return false

        try {
            const folders = await getFolders(groupName)
            const useExactMatch = config.matchMode === 'exact'

            // 寻找所有可能的匹配
            const possibleMatches: { folderName: string; alias: string; suffix: string; aliasLength: number }[] = []

            for (const folder of folders) {
                if (!folder.isDirectory()) continue
                const folderName = folder.name
                const aliases = folderName.split('-')
                for (const alias of aliases) {
                    if (useExactMatch) {
                        // 精确匹配：仅允许「关键词」或「关键词 数字」
                        if (input === alias) {
                            possibleMatches.push({ folderName, alias, suffix: '', aliasLength: alias.length })
                        } else if (input.startsWith(alias + ' ')) {
                            const suffix = input.slice(alias.length + 1).trim()
                            if (/^\d*$/.test(suffix)) {
                                possibleMatches.push({ folderName, alias, suffix, aliasLength: alias.length })
                            }
                        }
                    } else {
                        // 模糊匹配（默认）：input 以 alias 开头即触发
                        if (input.startsWith(alias)) {
                            const suffix = input.slice(alias.length).trim()
                            possibleMatches.push({ folderName, alias, suffix, aliasLength: alias.length })
                        }
                    }
                }
            }

            if (possibleMatches.length === 0) {
                return false
            }

            // 按别名长度降序排序，取最长匹配
            possibleMatches.sort((a, b) => b.aliasLength - a.aliasLength)
            const bestMatch = possibleMatches[0]

            // 收集所有具有相同最长别名的匹配（可能有多个文件夹使用相同别名）
            const bestMatches = possibleMatches.filter(m => m.aliasLength === bestMatch.aliasLength && m.alias === bestMatch.alias)

            // 随机选择一个文件夹
            const selectedMatch = bestMatches[Math.floor(Math.random() * bestMatches.length)]

            const { folderName, suffix } = selectedMatch

            loginfo('匹配结果:', { folderName, alias: selectedMatch.alias, suffix })
            if (bestMatches.length > 1) {
                ctx.logger.warn(`检测到别名重名: "${selectedMatch.alias}" 匹配到 ${bestMatches.length} 个文件夹: ${bestMatches.map(m => m.folderName).join(', ')}`)
            }

            let count = 1
            if (suffix && /^\d+$/.test(suffix)) {
                count = Math.min(parseInt(suffix, 10), config.maxout)
            }

            // 只有在确定是纯数字时才应用 limit
            if (count > config.maxout) {
                count = config.maxout
            }

            loginfo(`请求图片数量: ${count} (Max: ${config.maxout})`)

            const folderPath = join(getImagePath(groupName), folderName)
            const files = await fs.readdir(folderPath)
            const mediaFiles = files.filter(file =>
                /\.(jpe?g|png|gif|webp|mp4|mov|avi|bmp|tiff?)$/i.test(file)
            )

            if (mediaFiles.length === 0) {
                await session.send('该文件夹暂无图片或视频')
                return true
            }

            for (let i = 0; i < count; i++) {
                const randomFile = mediaFiles[Math.floor(Math.random() * mediaFiles.length)]
                const filePath = join(folderPath, randomFile)

                loginfo(`发送文件 ${i + 1}/${count}:`, randomFile)

                const isVideo = /\.(mp4|mov|avi)$/i.test(randomFile)
                const element = isVideo
                    ? h.video(filePath)
                    : h.image(filePath)

                await session.send(element)
            }

            return true

        } catch (error) {
            loginfo('发图失败:', error)
            return false
        }
    }

    //发图指令
    ctx.command(`${config.sendCommandName} <keyword:text>`)
        .action(async ({ session }, keyword: string) => {
            if (!keyword) {
                await session.execute(`${config.sendCommandName} -h`)
                return
            }
            const groupName = getGroupName(session.guildId)
            await processImageRequest(session, keyword, groupName, true)
        })

    //发图中间件
    ctx.middleware(async (session, next) => {
        const input = session.stripped.content.trim()
        
        if (!input) return next()

        const cmdName = config.sendCommandName
        // 处理“发图”开头的消息
        if (input.startsWith(cmdName)) {
            let keyword = input.slice(cmdName.length).trim()

            if (!keyword) {
                await session.send(formatMessage(`请指定关键词喵...`, `请指定关键词。`))
                return
            }
            const groupName = getGroupName(session.guildId)
            const processed = await processImageRequest(session, keyword, groupName, true)

            if (!processed) {
                await session.send(`未找到关键词“${keyword}”对应的图片`)
            }
            return
        }

        if (config.matchMode === 'none') return next()

        const groupName = getGroupName(session.guildId)
        const processed = await processImageRequest(session, input, groupName, true)

        if (processed) {
            return
        } else {
            return next()
        }
    }, true)

    //查找文件夹辅助函数（需要群组）
    async function findFolder(keyword: string, groupName: string): Promise<{ rootPath: string; folderName: string } | null> {
        try {
            const imagePath = getImagePath(groupName)
            const imageFolders = await fs.readdir(imagePath, { withFileTypes: true })

            for (const folder of imageFolders) {
                if (!folder.isDirectory()) continue

                const folderName = folder.name
                const aliases = folderName.split('-')

                if (aliases.includes(keyword)) {
                    return { rootPath: imagePath, folderName }
                }
            }
        } catch (error) {
            loginfo('查找文件夹失败:', error)
        }

        try {
            const tempPath = getTempPath(groupName)
            const tempFolders = await fs.readdir(tempPath, { withFileTypes: true })

            for (const folder of tempFolders) {
                if (!folder.isDirectory()) continue

                const folderName = folder.name
                const aliases = folderName.split('-')

                if (aliases.includes(keyword)) {
                    return { rootPath: tempPath, folderName }
                }
            }
        } catch (error) {
            loginfo('在临时目录查找文件夹失败:', error)
        }

        return null
    }
}
