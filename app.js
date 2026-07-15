const categories = [
  { id: "all", name: "全部工具", icon: "layout-grid" },
  { id: "chat", name: "AI 对话", icon: "messages-square" },
  { id: "writing", name: "AI 写作", icon: "pen-line" },
  { id: "image", name: "AI 图像", icon: "image" },
  { id: "video", name: "AI 视频", icon: "clapperboard" },
  { id: "comic", name: "AI 漫剧", icon: "panels-top-left" },
  { id: "office", name: "AI 办公", icon: "briefcase-business" },
  { id: "coding", name: "AI 编程", icon: "code-2" },
  { id: "audio", name: "AI 音频", icon: "audio-lines" },
  { id: "search", name: "AI 搜索", icon: "search-check" }
];

const tools = [
  {
    id: "doubao",
    name: "豆包",
    domain: "doubao.com",
    officialUrl: "https://www.doubao.com/",
    logoUrl: "/assets/tool-logos/doubao.png",
    category: "chat",
    summary: "面向中文场景的多模态助手，覆盖问答、写作、图片与办公任务。",
    description: "适合日常问答、资料整理、文案创作和多模态内容处理。产品提供网页、桌面和移动端，中文交互门槛较低。",
    price: "free",
    platforms: ["web", "desktop", "mobile"],
    language: "zh",
    features: ["长文本与文档分析", "图像生成与编辑", "语音和多轮对话", "桌面端任务协作"],
    useCases: ["办公协作", "内容创作", "学习研究"],
    login: "部分功能需要登录",
    region: "中国大陆可用",
    updated: "2026-07-07",
    score: 99,
    popular: 98,
    badges: ["中文", "多端"]
  },
  {
    id: "kimi",
    name: "Kimi",
    domain: "kimi.com",
    officialUrl: "https://www.kimi.com/",
    logoUrl: "/assets/tool-logos/kimi.png",
    category: "chat",
    summary: "擅长长文阅读、资料检索和中文写作的通用AI助手。",
    description: "围绕长上下文、联网检索和中文知识工作打造，适合阅读报告、汇总资料和形成结构化输出。",
    price: "freemium",
    platforms: ["web", "mobile"],
    language: "zh",
    features: ["长文档解析", "联网资料检索", "结构化写作", "文件批量处理"],
    useCases: ["研究分析", "文档总结", "中文写作"],
    login: "需要登录",
    region: "中国大陆可用",
    updated: "2026-07-05",
    score: 96,
    popular: 92,
    badges: ["长文本", "中文"]
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    domain: "deepseek.com",
    officialUrl: "https://chat.deepseek.com/",
    logoUrl: "/assets/tool-logos/deepseek.png",
    category: "chat",
    summary: "兼顾推理、代码与通用问答的大模型助手，支持深度思考模式。",
    description: "在数学推理、代码解释和复杂问题拆解方面表现突出，可作为学习、研究和开发场景中的通用助手。",
    price: "free",
    platforms: ["web", "mobile", "api"],
    language: "zh",
    features: ["复杂推理", "代码生成与解释", "数学问题求解", "开放API"],
    useCases: ["逻辑推理", "程序开发", "学习答疑"],
    login: "网页端需要登录",
    region: "中国大陆可用",
    updated: "2026-06-28",
    score: 97,
    popular: 97,
    badges: ["推理", "API"]
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    domain: "chatgpt.com",
    officialUrl: "https://chatgpt.com/",
    logoUrl: "/assets/tool-logos/chatgpt.svg",
    category: "chat",
    summary: "覆盖对话、研究、代码与多模态创作的综合AI工作空间。",
    description: "提供通用对话、文件处理、图像理解、联网研究和编码协作等能力，适合跨任务工作流。",
    price: "freemium",
    platforms: ["web", "desktop", "mobile", "api"],
    language: "multi",
    features: ["多模态对话", "深度研究", "数据与文件分析", "代码协作"],
    useCases: ["通用办公", "研究", "开发"],
    login: "部分能力需要订阅",
    region: "部分地区受限",
    updated: "2026-07-09",
    score: 98,
    popular: 99,
    badges: ["多模态", "生态"]
  },
  {
    id: "claude",
    name: "Claude",
    domain: "claude.ai",
    officialUrl: "https://claude.ai/",
    logoUrl: "/assets/tool-logos/claude.png",
    category: "writing",
    summary: "注重长文本、写作质量和复杂任务协作的AI助手。",
    description: "适合深入阅读、专业写作、代码协作与Agent任务，输出风格稳定，强调长上下文和任务连贯性。",
    price: "freemium",
    platforms: ["web", "desktop", "mobile", "api"],
    language: "multi",
    features: ["长文本写作", "文档分析", "代码协作", "Agent工作流"],
    useCases: ["专业写作", "研究分析", "软件开发"],
    login: "需要登录",
    region: "部分地区受限",
    updated: "2026-07-10",
    score: 96,
    popular: 95,
    badges: ["长文本", "Agent"]
  },
  {
    id: "notion-ai",
    name: "Notion AI",
    domain: "notion.so",
    officialUrl: "https://www.notion.so/product/ai",
    logoUrl: "/assets/tool-logos/notion-ai.png",
    category: "office",
    summary: "嵌入文档和知识库的AI协作能力，适合团队信息整理。",
    description: "在团队文档、项目空间和知识库中完成总结、检索、写作与资料问答，减少跨工具切换。",
    price: "paid",
    platforms: ["web", "desktop", "mobile"],
    language: "multi",
    features: ["知识库问答", "会议纪要", "文档生成", "团队空间检索"],
    useCases: ["团队知识库", "项目管理", "会议协作"],
    login: "需要账号与订阅",
    region: "全球可用",
    updated: "2026-06-21",
    score: 88,
    popular: 86,
    badges: ["知识库", "协作"]
  },
  {
    id: "gamma",
    name: "Gamma",
    domain: "gamma.app",
    officialUrl: "https://gamma.app/",
    logoUrl: "/assets/tool-logos/gamma.jpg",
    category: "office",
    summary: "通过主题和内容提示快速生成演示文稿、网页与文档。",
    description: "适合从大纲快速形成结构清晰的演示内容，并在网页与文档形态之间复用。",
    price: "freemium",
    platforms: ["web"],
    language: "multi",
    features: ["AI生成PPT", "主题自动排版", "网页式分享", "协作编辑"],
    useCases: ["演示汇报", "课程材料", "方案展示"],
    login: "需要登录",
    region: "全球可用",
    updated: "2026-07-01",
    score: 91,
    popular: 89,
    badges: ["PPT", "排版"]
  },
  {
    id: "notebooklm",
    name: "NotebookLM",
    domain: "notebooklm.google",
    officialUrl: "https://notebooklm.google/",
    logoUrl: "/assets/tool-logos/notebooklm.png",
    category: "office",
    summary: "以用户资料为依据的研究笔记工具，支持问答与音频概览。",
    description: "围绕自有文档建立可追溯的知识空间，回答会引用资料来源，适合专题研究和学习。",
    price: "freemium",
    platforms: ["web", "mobile"],
    language: "multi",
    features: ["资料引用问答", "音频概览", "主题笔记", "多来源整合"],
    useCases: ["专题研究", "课程学习", "资料复盘"],
    login: "需要Google账号",
    region: "部分地区受限",
    updated: "2026-07-06",
    score: 94,
    popular: 93,
    badges: ["研究", "可溯源"]
  },
  {
    id: "midjourney",
    name: "Midjourney",
    domain: "midjourney.com",
    officialUrl: "https://www.midjourney.com/",
    logoUrl: "/assets/tool-logos/midjourney.ico",
    category: "image",
    summary: "面向视觉创作的图像生成平台，擅长风格表达和画面质感。",
    description: "通过文本或参考图生成高质量视觉内容，适合概念设计、插画、品牌视觉和创意探索。",
    price: "paid",
    platforms: ["web"],
    language: "multi",
    features: ["文本生成图像", "风格参考", "局部重绘", "图像扩展"],
    useCases: ["概念设计", "插画", "营销视觉"],
    login: "需要账号与订阅",
    region: "全球可用",
    updated: "2026-06-30",
    score: 93,
    popular: 94,
    badges: ["高质感", "创意"]
  },
  {
    id: "jimeng",
    name: "即梦AI",
    domain: "jimeng.jianying.com",
    officialUrl: "https://jimeng.jianying.com/",
    logoUrl: "/assets/tool-logos/jimeng.ico",
    category: "image",
    summary: "支持图片、视频与数字人创作的一站式中文生成平台。",
    description: "提供中文提示词友好的图像与视频生成能力，覆盖海报、角色、运镜和短视频创作。",
    price: "freemium",
    platforms: ["web", "mobile"],
    language: "zh",
    features: ["中文文生图", "图生视频", "智能画布", "数字人素材"],
    useCases: ["社媒配图", "短视频", "视觉草图"],
    login: "需要登录",
    region: "中国大陆可用",
    updated: "2026-07-08",
    score: 95,
    popular: 96,
    badges: ["中文", "图像视频"]
  },
  {
    id: "liblib",
    name: "LiblibAI",
    domain: "liblib.art",
    officialUrl: "https://www.liblib.art/",
    logoUrl: "/assets/tool-logos/liblib.ico",
    category: "image",
    summary: "连接模型社区和在线创作流程的中文AI图像平台。",
    description: "可发现模型与工作流，也能直接在线生成图像，适合需要模型控制和社区素材的创作者。",
    price: "freemium",
    platforms: ["web"],
    language: "zh",
    features: ["模型社区", "在线生图", "工作流复用", "创作者发布"],
    useCases: ["模型探索", "电商视觉", "插画创作"],
    login: "需要登录",
    region: "中国大陆可用",
    updated: "2026-07-02",
    score: 90,
    popular: 91,
    badges: ["模型社区", "中文"]
  },
  {
    id: "runway",
    name: "Runway",
    domain: "runwayml.com",
    officialUrl: "https://runwayml.com/",
    logoUrl: "/assets/tool-logos/runway.png",
    category: "video",
    summary: "面向创意团队的视频生成与AI后期制作平台。",
    description: "从文本、图片和已有视频生成新片段，并提供抠像、运动控制和后期处理能力。",
    price: "freemium",
    platforms: ["web", "api"],
    language: "multi",
    features: ["文本生成视频", "运动控制", "视频重绘", "团队项目"],
    useCases: ["广告短片", "概念预演", "视频后期"],
    login: "需要登录",
    region: "全球可用",
    updated: "2026-06-25",
    score: 92,
    popular: 90,
    badges: ["视频生成", "后期"]
  },
  {
    id: "kling",
    name: "可灵AI",
    domain: "klingai.com",
    officialUrl: "https://klingai.com/",
    logoUrl: "/assets/tool-logos/kling.png",
    category: "video",
    summary: "支持文生视频、图生视频和创意特效的生成式视频平台。",
    description: "适合从静态创意快速生成动态片段，并通过首尾帧、运动与镜头控制完善效果。",
    price: "freemium",
    platforms: ["web", "mobile"],
    language: "multi",
    features: ["文生视频", "图生视频", "首尾帧控制", "创意特效"],
    useCases: ["营销视频", "动态海报", "故事短片"],
    login: "需要登录",
    region: "多地区可用",
    updated: "2026-07-04",
    score: 93,
    popular: 94,
    badges: ["视频", "多地区"]
  },
  {
    id: "trae",
    name: "TRAE",
    domain: "trae.ai",
    officialUrl: "https://www.trae.ai/",
    logoUrl: "/assets/tool-logos/trae.png",
    category: "coding",
    summary: "面向项目开发的AI原生IDE，支持代码理解和智能体协作。",
    description: "通过项目级上下文理解代码，支持从需求拆解到修改、运行和调试的连续开发流程。",
    price: "free",
    platforms: ["desktop"],
    language: "multi",
    features: ["项目级代码理解", "Agent开发模式", "终端协作", "多模型选择"],
    useCases: ["应用开发", "代码重构", "项目维护"],
    login: "需要登录",
    region: "多地区可用",
    updated: "2026-07-11",
    score: 96,
    popular: 95,
    badges: ["IDE", "Agent"]
  },
  {
    id: "cursor",
    name: "Cursor",
    domain: "cursor.com",
    officialUrl: "https://cursor.com/",
    logoUrl: "/assets/tool-logos/cursor.png",
    category: "coding",
    summary: "将AI对话、代码补全和项目级编辑整合进开发环境。",
    description: "适合在大型代码库中查询、修改和生成代码，支持多文件编辑、规则配置和智能体任务。",
    price: "freemium",
    platforms: ["desktop"],
    language: "multi",
    features: ["代码库问答", "多文件编辑", "自动补全", "Agent模式"],
    useCases: ["全栈开发", "重构", "代码理解"],
    login: "需要登录",
    region: "全球可用",
    updated: "2026-07-03",
    score: 94,
    popular: 96,
    badges: ["IDE", "代码库"]
  },
  {
    id: "github-copilot",
    name: "GitHub Copilot",
    domain: "github.com",
    officialUrl: "https://github.com/features/copilot",
    logoUrl: "/assets/tool-logos/github-copilot.svg",
    category: "coding",
    summary: "覆盖编辑器、代码托管与协作流程的AI编程助手。",
    description: "深度融入GitHub和主流编辑器，提供代码补全、对话、评审与任务协作。",
    price: "paid",
    platforms: ["desktop", "web", "api"],
    language: "multi",
    features: ["代码补全", "代码评审", "仓库问答", "Issue任务协作"],
    useCases: ["团队开发", "代码评审", "开源协作"],
    login: "需要GitHub账号",
    region: "全球可用",
    updated: "2026-06-29",
    score: 90,
    popular: 92,
    badges: ["GitHub", "团队"]
  },
  {
    id: "suno",
    name: "Suno",
    domain: "suno.com",
    officialUrl: "https://suno.com/",
    logoUrl: "/assets/tool-logos/suno.ico",
    category: "audio",
    summary: "通过文字描述快速生成包含人声、编曲和歌词的完整音乐。",
    description: "适合音乐灵感、短视频配乐和快速样曲创作，可控制主题、风格与歌词。",
    price: "freemium",
    platforms: ["web", "mobile"],
    language: "multi",
    features: ["文本生成音乐", "歌词创作", "风格控制", "歌曲延展"],
    useCases: ["短视频配乐", "音乐样曲", "内容创作"],
    login: "需要登录",
    region: "全球可用",
    updated: "2026-06-26",
    score: 89,
    popular: 91,
    badges: ["音乐", "人声"]
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    domain: "elevenlabs.io",
    officialUrl: "https://elevenlabs.io/",
    logoUrl: "/assets/tool-logos/elevenlabs.png",
    category: "audio",
    summary: "提供高自然度语音生成、配音与多语言音频处理。",
    description: "适合播客、有声内容、视频配音和语音应用开发，提供多语言语音和API。",
    price: "freemium",
    platforms: ["web", "api"],
    language: "multi",
    features: ["文本转语音", "多语言配音", "声音设计", "语音API"],
    useCases: ["视频配音", "有声内容", "语音应用"],
    login: "需要登录",
    region: "全球可用",
    updated: "2026-07-01",
    score: 87,
    popular: 88,
    badges: ["配音", "API"]
  },
  {
    id: "perplexity",
    name: "Perplexity",
    domain: "perplexity.ai",
    officialUrl: "https://www.perplexity.ai/",
    logoUrl: "/assets/tool-logos/perplexity.ico",
    category: "search",
    summary: "强调来源引用和追问能力的AI搜索与研究工具。",
    description: "通过联网检索组织答案并展示引用，适合快速了解主题、核查来源和继续深入研究。",
    price: "freemium",
    platforms: ["web", "mobile"],
    language: "multi",
    features: ["联网检索", "来源引用", "研究模式", "连续追问"],
    useCases: ["资料搜索", "事实核查", "市场研究"],
    login: "基础搜索可免登录",
    region: "全球可用",
    updated: "2026-07-08",
    score: 94,
    popular: 93,
    badges: ["引用", "研究"]
  },
  {
    id: "metaso",
    name: "秘塔AI搜索",
    domain: "metaso.cn",
    officialUrl: "https://metaso.cn/",
    logoUrl: "/assets/tool-logos/metaso.png",
    category: "search",
    summary: "面向中文资料检索、研究报告和知识问答的AI搜索引擎。",
    description: "聚合中文互联网与学术等来源，提供结构化回答、原文引用和研究型输出。",
    price: "freemium",
    platforms: ["web", "mobile"],
    language: "zh",
    features: ["中文联网搜索", "来源引用", "研究报告", "学术检索"],
    useCases: ["中文研究", "行业资料", "学术查询"],
    login: "基础搜索可免登录",
    region: "中国大陆可用",
    updated: "2026-07-06",
    score: 92,
    popular: 90,
    badges: ["中文", "研究"]
  },
  {
    id: "tencent-yuanbao",
    name: "腾讯元宝",
    domain: "yuanbao.tencent.com",
    officialUrl: "https://yuanbao.tencent.com/",
    logoUrl: "/assets/tool-logos/tencent-yuanbao.png",
    category: "chat",
    summary: "腾讯推出的中文AI助手，覆盖联网问答、文档解析、写作与多模态任务。",
    description: "适合日常问答、文件归纳、内容创作和资料整理，提供网页端与移动端服务，面向中文用户降低综合AI任务的使用门槛。",
    price: "free",
    platforms: ["web", "mobile"],
    language: "zh",
    features: ["联网问答", "文档解析", "多模态理解", "中文内容创作"],
    useCases: ["日常问答", "资料整理", "中文办公"],
    login: "部分功能需要登录",
    region: "中国大陆可用",
    updated: "2026-07-13",
    score: 94,
    popular: 95,
    badges: ["中文", "多端"]
  },
  {
    id: "manus",
    name: "Manus",
    domain: "manus.im",
    officialUrl: "https://manus.im/",
    logoUrl: "/assets/tool-logos/manus.png",
    category: "office",
    summary: "面向任务执行和工作流自动化的通用AI智能体，可从回答进一步完成实际工作。",
    description: "围绕任务规划、工具调用、网页操作和结果交付组织复杂工作流，适合研究、运营和跨应用知识任务。",
    price: "freemium",
    platforms: ["web"],
    language: "multi",
    features: ["任务规划与执行", "工具和网页调用", "工作流自动化", "交付物生成"],
    useCases: ["专题研究", "运营任务", "办公自动化"],
    login: "需要登录",
    region: "部分地区受限",
    updated: "2026-07-13",
    score: 93,
    popular: 94,
    badges: ["Agent", "自动化"]
  },
  {
    id: "hailuo-ai",
    name: "海螺AI",
    domain: "hailuoai.video",
    officialUrl: "https://hailuoai.video/",
    logoUrl: "/assets/tool-logos/hailuo-ai.png",
    category: "video",
    summary: "面向创作者的AI视频与图像生成平台，可由文字或照片生成社交内容。",
    description: "提供文生视频、图生视频、图像生成和轻量创意内容能力，适合短视频、广告素材与社交媒体创作。",
    price: "freemium",
    platforms: ["web", "mobile"],
    language: "multi",
    features: ["文生视频", "图生视频", "AI图像", "社交内容模板"],
    useCases: ["短视频创作", "广告素材", "社交媒体"],
    login: "基础浏览免登录，生成需要登录",
    region: "全球可用",
    updated: "2026-07-13",
    score: 92,
    popular: 93,
    badges: ["视频", "多模态"]
  },
  {
    id: "vidu",
    name: "Vidu AI",
    domain: "vidu.cn",
    officialUrl: "https://www.vidu.cn/",
    logoUrl: "/assets/tool-logos/vidu.png",
    category: "video",
    summary: "将文字和图像转化为动态视频的生成平台，重点强化主体与角色一致性。",
    description: "围绕文本、参考图和主体一致性生成创意视频，适合角色短片、产品动态展示和连续镜头制作。",
    price: "freemium",
    platforms: ["web"],
    language: "multi",
    features: ["文生视频", "图生视频", "主体一致性", "参考图控制"],
    useCases: ["角色短片", "产品视频", "创意分镜"],
    login: "生成需要登录",
    region: "全球可用",
    updated: "2026-07-13",
    score: 91,
    popular: 91,
    badges: ["一致性", "视频"]
  },
  {
    id: "recraft",
    name: "Recraft",
    domain: "recraft.ai",
    officialUrl: "https://www.recraft.ai/",
    logoUrl: "/assets/tool-logos/recraft.avif",
    category: "image",
    summary: "面向设计师和团队的AI视觉平台，覆盖写实图像、矢量图、风格和样机。",
    description: "结合文本生成、矢量生成、自定义风格和Mockup能力，适合品牌设计、电商素材和可编辑视觉资产生产。",
    price: "freemium",
    platforms: ["web"],
    language: "multi",
    features: ["写实图像生成", "矢量图生成", "自定义风格", "产品样机"],
    useCases: ["品牌视觉", "电商设计", "矢量素材"],
    login: "需要登录",
    region: "全球可用",
    updated: "2026-07-13",
    score: 92,
    popular: 90,
    badges: ["设计", "矢量"]
  },
  {
    id: "napkin-ai",
    name: "Napkin AI",
    domain: "napkin.ai",
    officialUrl: "https://www.napkin.ai/",
    logoUrl: "/assets/tool-logos/napkin-ai.png",
    category: "office",
    summary: "把文字内容转化为流程图、信息图和演示视觉的商业叙事工具。",
    description: "面向报告、演示和内容营销，将已有文字快速转换为可编辑视觉表达，减少非设计人员制作图示的时间。",
    price: "freemium",
    platforms: ["web"],
    language: "multi",
    features: ["文字转视觉", "流程图", "信息图", "演示素材"],
    useCases: ["商业报告", "演示文稿", "内容营销"],
    login: "需要登录",
    region: "全球可用",
    updated: "2026-07-13",
    score: 89,
    popular: 87,
    badges: ["可视化", "办公"]
  },
  {
    id: "devin",
    name: "Devin",
    domain: "devin.ai",
    officialUrl: "https://devin.ai/",
    logoUrl: "/assets/tool-logos/devin.png",
    category: "coding",
    summary: "面向工程团队的AI软件工程智能体，支持并行云端任务和完整开发流程。",
    description: "可承担代码理解、功能实现、问题修复和验证等工程任务，并通过并行云端智能体扩展团队开发能力。",
    price: "paid",
    platforms: ["web"],
    language: "multi",
    features: ["代码库理解", "功能实现", "自动调试", "并行云端智能体"],
    useCases: ["软件开发", "问题修复", "工程自动化"],
    login: "需要账号与付费方案",
    region: "部分地区受限",
    updated: "2026-07-13",
    score: 91,
    popular: 92,
    badges: ["Agent", "工程"]
  },
  {
    id: "orange-dream-factory",
    name: "橙星梦工厂",
    domain: "ai.fun.tv",
    officialUrl: "https://ai.fun.tv/",
    logoUrl: "/assets/tool-logos/orange-dream-factory.ico",
    category: "comic",
    categorySortOrder: 0,
    summary: "面向AI漫剧的全流程创作与分发平台，覆盖剧本、资产、分镜和成片预览。",
    description: "提供剧本生成与解析、全剧资产设定、分镜视频和成片预览，并通过无限画布与团队协作支持漫剧项目交付。",
    price: "unknown",
    platforms: ["web"],
    language: "zh",
    features: ["剧本生成与解析", "全剧资产设定", "分镜视频与成片预览", "无限画布与团队协作"],
    useCases: ["AI漫剧", "短剧制作", "团队内容生产"],
    login: "创作功能需要手机号登录",
    region: "中国大陆可用",
    updated: "2026-07-13",
    score: 90,
    popular: 89,
    badges: ["漫剧", "全流程"],
    sponsored: true
  }
];

const tutorials = [
  {
    id: "guide-research",
    type: "研究",
    title: "从10份资料到一份可追溯报告：NotebookLM研究工作流",
    excerpt: "用来源分组、关键问题和引用核验搭建稳定的专题研究流程。",
    image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=720&q=80",
    date: "2026-07-12",
    readTime: "8分钟"
  },
  {
    id: "guide-video",
    type: "视频",
    title: "首尾帧、运镜与节奏：AI短视频生成的四步拆解",
    excerpt: "把模糊创意拆成分镜、画面、运动和剪辑四个可控制环节。",
    image: "https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&w=720&q=80",
    date: "2026-07-10",
    readTime: "11分钟"
  },
  {
    id: "guide-coding",
    type: "开发",
    title: "让AI编程助手读懂项目：规则、上下文和验收清单",
    excerpt: "用项目规则、任务边界和自动化测试减少AI修改代码的返工。",
    image: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=720&q=80",
    date: "2026-07-08",
    readTime: "9分钟"
  },
  {
    id: "guide-slides",
    type: "办公",
    title: "不是一键生成：如何把AI大纲变成可汇报的演示文稿",
    excerpt: "先定义受众和结论，再用Gamma完成结构、视觉和分享交付。",
    image: "https://images.unsplash.com/photo-1551434678-e076c223a692?auto=format&fit=crop&w=720&q=80",
    date: "2026-07-05",
    readTime: "7分钟"
  },
  {
    id: "guide-image",
    type: "图像",
    title: "建立可复用的AI视觉风格：参考图、提示词和版本管理",
    excerpt: "从一次性抽卡转向可复现的视觉系统，适合品牌和内容团队。",
    image: "https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=720&q=80",
    date: "2026-07-02",
    readTime: "10分钟"
  }
];

const newsItems = [
  {
    id: "news-openai-gpt-5-6",
    type: "模型",
    title: "OpenAI发布GPT-5.6，面向复杂目标扩展前沿智能",
    excerpt: "GPT-5.6于7月9日发布，OpenAI将其定位为可随任务规模扩展、服务复杂专业工作的前沿模型。",
    image: "https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=720&q=80",
    date: "2026-07-09",
    readTime: "5分钟",
    body: "OpenAI在官方发布中将GPT-5.6定位为面向宏大目标和复杂专业工作的前沿模型。同期公布的内容还包括部署安全资料，以及GPT-5.6成为Microsoft 365 Copilot首选模型的产品动态。",
    source: "OpenAI",
    sourceUrl: "https://openai.com/index/gpt-5-6/"
  },
  {
    id: "news-anthropic-hard-questions",
    type: "治理",
    title: "Anthropic公开征集AI难题，并承诺展示回应过程",
    excerpt: "Anthropic邀请公众提交最棘手的AI问题，强调在回答过程中公开判断依据与工作方法。",
    image: "https://images.unsplash.com/photo-1456324504439-367cee3b3c32?auto=format&fit=crop&w=720&q=80",
    date: "2026-07-09",
    readTime: "4分钟",
    body: "Anthropic在7月9日发布“Inviting hard questions”，向公众征集关于AI最困难的问题，并承诺在后续回应中展示其工作过程。这一动作把模型能力之外的透明度、治理和公众参与推到更显著的位置。",
    source: "Anthropic",
    sourceUrl: "https://www.anthropic.com/news/hard-questions"
  },
  {
    id: "news-meta-muse-spark-1-1",
    type: "模型",
    title: "Meta发布Muse Spark 1.1并开放模型API预览",
    excerpt: "新模型聚焦智能体任务，在工具与计算机使用、编码和多模态理解方面进行升级。",
    image: "https://images.unsplash.com/photo-1676299081847-824916de030a?auto=format&fit=crop&w=720&q=80",
    date: "2026-07-09",
    readTime: "6分钟",
    body: "Meta称Muse Spark 1.1是面向智能体任务的多模态推理模型，强化了工具调用、计算机操作、编码和多模态理解。模型可在Meta AI的Thinking模式中使用，开发者还能通过Meta Model API公共预览进行接入。",
    source: "Meta AI",
    sourceUrl: "https://ai.meta.com/blog/introducing-muse-spark-meta-model-api/"
  },
  {
    id: "news-google-managed-agents",
    type: "开发",
    title: "Gemini API扩展Managed Agents，加入后台任务与远程MCP",
    excerpt: "Google为托管智能体增加异步后台执行、远程MCP、自定义函数和凭据刷新能力。",
    image: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=720&q=80",
    date: "2026-07-07",
    readTime: "6分钟",
    body: "Google在Gemini API的Managed Agents中加入后台执行、远程MCP服务器、自定义函数调用和跨交互凭据刷新。开发者可通过统一端点让智能体在隔离云端沙箱中完成推理、代码执行、文件管理与网页信息处理。",
    source: "Google",
    sourceUrl: "https://blog.google/innovation-and-ai/technology/developers-tools/expanding-managed-agents-gemini-api/"
  },
  {
    id: "news-meta-muse-image-video",
    type: "多模态",
    title: "Meta推出Muse Image并预览原生音频视频模型Muse Video",
    excerpt: "Muse Image强调精确编辑、多参考图组合与智能体工具调用，Muse Video加入原生音频支持。",
    image: "https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&w=720&q=80",
    date: "2026-07-07",
    readTime: "7分钟",
    body: "Meta Superintelligence Labs发布Muse Image并预览Muse Video。Muse Image支持多参考图组合、精确编辑、搜索与代码工具调用和自我修正；Muse Video基于相同预训练底座，强调视觉质量与原生音频生成。",
    source: "Meta AI",
    sourceUrl: "https://ai.meta.com/blog/introducing-muse-image-muse-video-msl/"
  },
  {
    id: "news-anthropic-sonnet-5",
    type: "模型",
    title: "Anthropic发布Claude Sonnet 5，覆盖编码、智能体与专业工作",
    excerpt: "Sonnet 5定位于规模化专业任务，在编码、智能体执行与知识工作方面提供前沿性能。",
    image: "https://images.unsplash.com/photo-1535378917042-10a22c95931a?auto=format&fit=crop&w=720&q=80",
    date: "2026-06-30",
    readTime: "5分钟",
    body: "Anthropic在6月30日发布Claude Sonnet 5，将其定位为面向编码、智能体和专业工作的规模化前沿模型。对于工具导航平台，值得关注的是模型能力正从单轮内容生成继续转向可执行的工程与专业任务。",
    source: "Anthropic",
    sourceUrl: "https://www.anthropic.com/news/claude-sonnet-5"
  },
  {
    id: "news-anthropic-claude-science",
    type: "研究",
    title: "Claude Science工作台开放，面向科学研究提供可审计产物",
    excerpt: "新的科学研究工作台整合常用工具和软件包，并提供算力资源与可追溯的研究交付物。",
    image: "https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=720&q=80",
    date: "2026-06-30",
    readTime: "5分钟",
    body: "Claude Science是一款可定制的科学研究工作台，整合研究人员常用工具和软件包，支持灵活计算资源并输出可审计产物。它体现了通用助手进一步向垂直专业工作台演进的趋势。",
    source: "Anthropic",
    sourceUrl: "https://www.anthropic.com/news/claude-science-ai-workbench"
  }
];

const articleMap = Object.fromEntries([...tutorials, ...newsItems].map((article) => [article.id, article]));

const collections = [
  {
    title: "中文研究组合",
    description: "从联网检索、资料归纳到可追溯输出。",
    icon: "scan-search",
    accent: "#0f766e",
    toolIds: ["metaso", "kimi", "notebooklm"]
  },
  {
    title: "短视频创作线",
    description: "从静态视觉到动态镜头与配音。",
    icon: "clapperboard",
    accent: "#c2410c",
    toolIds: ["jimeng", "kling", "elevenlabs"]
  },
  {
    title: "AI开发工作台",
    description: "覆盖需求理解、项目修改和代码评审。",
    icon: "terminal-square",
    accent: "#1d5fa7",
    toolIds: ["trae", "cursor", "github-copilot"]
  }
];

const state = {
  query: "",
  category: "all",
  price: "all",
  platform: "all",
  language: "all",
  sort: "recommended",
  favoritesOnly: false,
  layout: localStorage.getItem("nike-layout") || "grid",
  favorites: new Set(readLocalArray("nike-favorites")),
  topics: new Set(readLocalArray("nike-topics")),
  compare: new Set(),
  activeView: "tools",
  toolLimit: 24,
  toolTotal: tools.filter((tool) => !tool.sponsored).length,
  toolHasMore: false,
  toolLoading: false,
  toolError: false,
  toolRetryAppend: false,
  toolServerMode: false
};

const priceLabels = {
  unknown: "价格待核验",
  free: "免费",
  freemium: "免费增值",
  trial: "限时试用",
  paid: "付费",
  contact: "联系询价"
};
const platformLabels = { web: "Web", desktop: "桌面端", mobile: "移动端", api: "API" };
const languageLabels = { unknown: "语言待核验", zh: "中文友好", multi: "多语言" };
const topicSlugMap = {
  "AI智能体": "ai-agents",
  "视频生成": "video-generation",
  "编程助手": "coding-assistants",
  "多模态": "multimodal",
  "AI搜索": "ai-search",
  "开源模型": "open-source-models",
  "产品更新": "product-updates"
};
const categoryMap = Object.fromEntries(categories.map((category) => [category.id, category]));
const toolMap = Object.fromEntries(tools.map((tool) => [tool.id, tool]));
let sponsoredTool = tools.find((tool) => tool.sponsored) || null;
let rankingTools = tools.filter((tool) => !tool.sponsored).sort((a, b) => b.popular - a.popular).slice(0, 6);
let backendAvailable = false;
let toolRequestVersion = 0;
let searchDebounceTimer = null;
let eventQueue = [];
let eventFlushTimer = null;
let eventRetryDelay = 3000;
let submissionIdempotencyKey = null;
let lastFocusedElement = null;
let sidebarReturnFocus = null;
let toastTimer = null;
let adImpressionObserver = null;
let adImpressionTimer = null;
let contentRevision = null;
let contentPollTimer = null;

function rebuildDataMaps() {
  Object.keys(categoryMap).forEach((key) => delete categoryMap[key]);
  Object.keys(toolMap).forEach((key) => delete toolMap[key]);
  Object.keys(articleMap).forEach((key) => delete articleMap[key]);
  categories.forEach((category) => { categoryMap[category.id] = category; });
  tools.forEach((tool) => { toolMap[tool.id] = tool; });
  if (sponsoredTool) toolMap[sponsoredTool.id] = sponsoredTool;
  [...tutorials, ...newsItems].forEach((article) => { articleMap[article.id] = article; });
}

async function apiRequest(path, options = {}, timeout = 8000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeout);
  const { headers = {}, ...requestOptions } = options;
  try {
    const response = await fetch(path, {
      ...requestOptions,
      headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.title || "请求失败，请稍后再试");
      error.status = response.status;
      error.code = payload.code;
      throw error;
    }
    return payload;
  } finally {
    window.clearTimeout(timer);
  }
}

async function loadBackendData() {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const payload = await apiRequest("/api/v1/site/bootstrap", {}, 5000);
      const data = payload.data;
      const valid = data
        && Array.isArray(data.categories)
        && Array.isArray(data.tutorials)
        && Array.isArray(data.newsItems)
        && Array.isArray(data.collections);
      if (!valid) throw new Error("后端初始化数据格式无效");
      categories.splice(0, categories.length, ...data.categories);
      sponsoredTool = data.sponsor || null;
      tutorials.splice(0, tutorials.length, ...data.tutorials);
      newsItems.splice(0, newsItems.length, ...data.newsItems);
      collections.splice(0, collections.length, ...data.collections);
      rebuildDataMaps();
      backendAvailable = true;
      document.documentElement.dataset.backend = "connected";
      return;
    } catch {
      if (attempt === 0) await new Promise((resolve) => window.setTimeout(resolve, 350));
    }
  }
  backendAvailable = false;
  document.documentElement.dataset.backend = "fallback";
}

function buildToolQuery(offset = 0, limit = state.toolLimit) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset), sort: state.sort });
  if (state.query.trim()) params.set("q", state.query.trim());
  if (state.category !== "all") params.set("category", state.category);
  if (state.price !== "all") params.set("price", state.price);
  if (state.platform !== "all") params.set("platform", state.platform);
  if (state.language !== "all") params.set("language", state.language);
  return params;
}

function filterToolsLocally(items) {
  const query = state.query.trim().toLocaleLowerCase("zh-CN");
  return items.filter((tool) => {
    if (tool.sponsored && state.category === "all") return false;
    if (state.category !== "all" && tool.category !== state.category) return false;
    if (state.price !== "all" && tool.price !== state.price) return false;
    if (state.platform !== "all" && !tool.platforms.includes(state.platform)) return false;
    if (state.language !== "all" && tool.language !== state.language) return false;
    if (state.favoritesOnly && !state.favorites.has(tool.id)) return false;
    if (!query) return true;
    const haystack = [
      tool.name,
      tool.summary,
      tool.description,
      categoryMap[tool.category]?.name,
      ...tool.features,
      ...tool.useCases,
      ...tool.badges
    ].join(" ").toLocaleLowerCase("zh-CN");
    return haystack.includes(query);
  });
}

async function loadFavoriteToolResults(requestVersion) {
  const ids = [...state.favorites].slice(0, 100);
  const settled = await Promise.allSettled(ids.map((id) => apiRequest(`/api/v1/tools/${encodeURIComponent(id)}`)));
  if (requestVersion !== toolRequestVersion) return false;
  const favoriteTools = settled
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value.data);
  tools.splice(0, tools.length, ...favoriteTools);
  rebuildDataMaps();
  const filtered = filterToolsLocally(favoriteTools);
  state.toolTotal = filtered.length;
  state.toolHasMore = false;
  return true;
}

async function loadToolResults({ append = false } = {}) {
  if (!backendAvailable) return false;
  const requestVersion = ++toolRequestVersion;
  state.toolLoading = true;
  state.toolError = false;
  state.toolRetryAppend = append;
  renderToolPagination();
  try {
    if (state.favoritesOnly) {
      const applied = await loadFavoriteToolResults(requestVersion);
      if (!applied) return false;
    } else {
      const offset = append ? tools.length : 0;
      const payload = await apiRequest(`/api/v1/tools?${buildToolQuery(offset)}`);
      if (requestVersion !== toolRequestVersion) return false;
      const items = Array.isArray(payload.data) ? payload.data : [];
      if (append) {
        const known = new Set(tools.map((tool) => tool.id));
        tools.push(...items.filter((tool) => !known.has(tool.id)));
      } else {
        tools.splice(0, tools.length, ...items);
      }
      rebuildDataMaps();
      state.toolTotal = Number(payload.meta?.total) || 0;
      state.toolHasMore = tools.length < state.toolTotal;
    }
    state.toolServerMode = true;
    return true;
  } catch {
    if (requestVersion !== toolRequestVersion) return false;
    state.toolError = true;
    if (!state.toolServerMode) {
      state.toolTotal = getFilteredTools().length;
      state.toolHasMore = false;
    }
    return false;
  } finally {
    if (requestVersion === toolRequestVersion) {
      state.toolLoading = false;
      renderTools();
    }
  }
}

async function loadRankingTools() {
  if (!backendAvailable) return;
  try {
    const payload = await apiRequest("/api/v1/tools?sort=popular&limit=6&offset=0");
    if (Array.isArray(payload.data)) {
      rankingTools = payload.data;
      rankingTools.forEach((tool) => { toolMap[tool.id] = tool; });
    }
  } catch {
    // 精选页可继续使用内置的离线榜单。
  }
}

async function loadCollectionTools() {
  if (!backendAvailable) return;
  const ids = [...new Set(collections.flatMap((collection) => collection.toolIds || []))]
    .filter((id) => !toolMap[id]);
  const settled = await Promise.allSettled(ids.map((id) => apiRequest(`/api/v1/tools/${encodeURIComponent(id)}`, {}, 5000)));
  settled.forEach((result) => {
    if (result.status === "fulfilled" && result.value?.data?.id) toolMap[result.value.data.id] = result.value.data;
  });
}

async function refreshPublishedContent() {
  await loadBackendData();
  if (!backendAvailable) return;
  if (!categoryMap[state.category]) state.category = "all";
  await Promise.all([loadToolResults(), loadRankingTools()]);
  await loadCollectionTools();
  renderNavigation();
  renderSponsor();
  renderTools();
  renderCollections();
  renderContentViews();
}

async function checkContentRevision({ announce = true } = {}) {
  if (!backendAvailable || document.hidden) return;
  try {
    const payload = await apiRequest("/api/v1/content/version", {}, 5000);
    const nextRevision = Number(payload.data?.revision);
    if (!Number.isInteger(nextRevision) || nextRevision < 1) return;
    if (contentRevision === null) {
      contentRevision = nextRevision;
      return;
    }
    if (nextRevision === contentRevision) return;
    contentRevision = nextRevision;
    await refreshPublishedContent();
    if (announce) showToast("内容已更新");
  } catch {
    // Content polling must never interrupt normal browsing.
  }
}

function startContentPolling() {
  if (contentPollTimer) window.clearInterval(contentPollTimer);
  contentPollTimer = window.setInterval(() => void checkContentRevision(), 15_000);
}

function readLocalArray(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalArray(key, values) {
  localStorage.setItem(key, JSON.stringify([...values]));
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeIconName(value, fallback = "circle") {
  const icon = String(value || "").trim().toLowerCase();
  return /^[a-z0-9-]{1,48}$/.test(icon) ? icon : fallback;
}

function safeAccentColor(value, fallback = "#0f766e") {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function safeMediaUrl(value, fallback = "/brand-icon-192.png") {
  const candidate = String(value || "").trim();
  try {
    const parsed = new URL(candidate, document.baseURI);
    if (parsed.origin === location.origin || parsed.protocol === "https:") return parsed.href;
  } catch {
    // Invalid CMS media values use a same-origin placeholder.
  }
  return fallback;
}

function refreshIcons() {
  window.lucide?.createIcons({ attrs: { "aria-hidden": "true" } });
}

function logoMarkup(tool, extraClass = "") {
  const initial = escapeHTML(tool.name.trim().slice(0, 1).toUpperCase());
  const fallbackSrc = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(tool.domain)}&sz=128`;
  let src = fallbackSrc;
  try {
    const explicit = new URL(String(tool.logoUrl || ""), document.baseURI);
    if (explicit.protocol === "https:" || explicit.origin === location.origin) src = explicit.href;
  } catch {
    // 缺少或无效的显式 Logo 时使用官网域名 favicon。
  }
  const fallbackAttribute = src === fallbackSrc ? "" : ` data-fallback-src="${escapeHTML(fallbackSrc)}"`;
  return `
    <span class="tool-logo ${extraClass}" aria-hidden="true">
      <img src="${escapeHTML(src)}" alt="" data-fallback${fallbackAttribute} loading="lazy" referrerpolicy="no-referrer" width="48" height="48">
      <span class="logo-fallback" hidden>${initial}</span>
    </span>`;
}

function officialToolHref(tool, placement) {
  if (!backendAvailable) return tool.officialUrl;
  return `/r/tools/${encodeURIComponent(tool.id)}?placement=${encodeURIComponent(placement)}`;
}

function bindImageFallbacks(root = document) {
  root.querySelectorAll("img[data-fallback]").forEach((image) => {
    const showFallback = () => {
      image.hidden = true;
      const fallback = image.nextElementSibling;
      if (fallback) fallback.hidden = false;
    };
    const handleError = () => {
      const fallbackSrc = image.dataset.fallbackSrc;
      if (fallbackSrc) {
        delete image.dataset.fallbackSrc;
        image.src = fallbackSrc;
        return;
      }
      image.removeEventListener("error", handleError);
      showFallback();
    };
    image.addEventListener("error", handleError);
    if (image.complete && image.naturalWidth === 0) handleError();
  });
}

function track(eventName, properties = {}) {
  const eventTime = new Date().toISOString();
  const sessionId = getSessionId();
  window.nikeAIEvents = window.nikeAIEvents || [];
  window.nikeAIEvents.push({
    event_name: eventName,
    event_time: eventTime,
    session_id: sessionId,
    page_type: state.activeView,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    ...properties
  });
  eventQueue.push({
    eventId: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    eventName,
    clientTime: eventTime,
    pageType: state.activeView,
    path: `${location.pathname}${location.hash}`,
    properties: { viewport: `${window.innerWidth}x${window.innerHeight}`, ...properties }
  });
  if (eventQueue.length > 100) eventQueue.splice(0, eventQueue.length - 100);
  if (backendAvailable) {
    if (eventQueue.length >= 10) void flushEventQueue();
    else if (!eventFlushTimer) eventFlushTimer = window.setTimeout(() => void flushEventQueue(), 1800);
  }
}

function getSessionId() {
  let id = sessionStorage.getItem("nike-session");
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    sessionStorage.setItem("nike-session", id);
  }
  try {
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `nike_session=${encodeURIComponent(id)}; Path=/; Max-Age=1800; SameSite=Lax${secure}`;
  } catch {
    // file:// 演示模式不支持 Cookie。
  }
  return id;
}

function getVisitorId() {
  let id = localStorage.getItem("nike-visitor");
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem("nike-visitor", id);
  }
  return id;
}

async function flushEventQueue(useBeacon = false) {
  if (!backendAvailable || eventQueue.length === 0) return;
  window.clearTimeout(eventFlushTimer);
  eventFlushTimer = null;
  const events = eventQueue.splice(0, 50);
  const payload = {
    visitorId: getVisitorId(),
    sessionId: getSessionId(),
    events
  };
  if (useBeacon && navigator.sendBeacon) {
    const accepted = navigator.sendBeacon(
      "/api/v1/events/batch",
      new Blob([JSON.stringify(payload)], { type: "application/json" })
    );
    if (!accepted) eventQueue.unshift(...events);
    else eventRetryDelay = 3000;
    return;
  }
  try {
    await apiRequest("/api/v1/events/batch", {
      method: "POST",
      body: JSON.stringify(payload),
      keepalive: true
    }, 5000);
    eventRetryDelay = 3000;
  } catch {
    eventQueue.unshift(...events);
    eventRetryDelay = Math.min(eventRetryDelay * 2, 60_000);
  }
  if (eventQueue.length && backendAvailable && !eventFlushTimer) {
    eventFlushTimer = window.setTimeout(() => void flushEventQueue(), eventRetryDelay);
  }
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

function renderNavigation() {
  const naturalTools = tools.filter((tool) => !tool.sponsored);
  const allCount = categories.find((category) => category.id === "all")?.toolCount ?? naturalTools.length;
  document.getElementById("tool-total-nav").textContent = allCount;
  document.getElementById("category-nav").innerHTML = categories.map((category) => {
    const count = category.toolCount ?? (category.id === "all"
      ? naturalTools.length
      : tools.filter((tool) => tool.category === category.id).length);
    const categoryId = escapeHTML(category.id);
    const categoryIcon = escapeHTML(safeIconName(category.icon, "shapes"));
    return `
      <button class="category-button ${state.category === category.id ? "is-active" : ""}" type="button" data-category="${categoryId}">
        <i data-lucide="${categoryIcon}"></i>
        <span>${escapeHTML(category.name)}</span>
        <span class="category-count">${Number(count) || 0}</span>
      </button>`;
  }).join("");

  document.getElementById("task-tabs").innerHTML = categories.map((category) => `
    <button class="task-tab ${state.category === category.id ? "is-active" : ""}" type="button" data-category="${escapeHTML(category.id)}">
      <i data-lucide="${escapeHTML(safeIconName(category.icon, "shapes"))}"></i><span>${escapeHTML(category.name)}</span>
    </button>`).join("");

  const submissionCategory = document.querySelector('#submit-form select[name="category"]');
  if (submissionCategory) {
    const selected = submissionCategory.value;
    submissionCategory.innerHTML = `<option value="">请选择</option>${categories
      .filter((category) => category.id !== "all")
      .map((category) => `<option value="${escapeHTML(category.id)}">${escapeHTML(category.name.replace(/^AI\s*/, "AI"))}</option>`)
      .join("")}`;
    if ([...submissionCategory.options].some((option) => option.value === selected)) submissionCategory.value = selected;
  }
}

function getFilteredTools() {
  if (state.toolServerMode && !state.favoritesOnly) return tools;
  const filtered = filterToolsLocally(tools);

  return filtered.sort((a, b) => {
    const categoryOrder = (a.categorySortOrder ?? 1000) - (b.categorySortOrder ?? 1000);
    if (state.category !== "all" && categoryOrder !== 0) return categoryOrder;
    if (state.sort === "popular") return b.popular - a.popular;
    if (state.sort === "newest") return b.updated.localeCompare(a.updated);
    if (state.sort === "name") return a.name.localeCompare(b.name, "zh-CN");
    return b.score - a.score;
  });
}

function renderToolCard(tool, rank) {
  const isFavorite = state.favorites.has(tool.id);
  const isCompared = state.compare.has(tool.id);
  const platformBadges = tool.platforms.slice(0, 1).map((platform) =>
    `<span class="tool-badge">${platformLabels[platform]}</span>`
  ).join("");

  return `
    <article class="tool-card" data-clickable="true" data-tool-id="${tool.id}">
      <div class="tool-card-header">
        ${logoMarkup(tool)}
        <div class="tool-name-block">
          <div class="tool-name-line">
            <h2>${escapeHTML(tool.name)}</h2>
            <span class="verified-dot" title="资料更新于 ${tool.updated}"><i data-lucide="refresh-cw"></i></span>
          </div>
          <span class="tool-category">${escapeHTML(categoryMap[tool.category]?.name || "未分类")}</span>
        </div>
        <div class="tool-card-actions">
          <button class="icon-button ${isFavorite ? "is-active" : ""}" type="button" data-favorite-id="${tool.id}" aria-label="${isFavorite ? "取消收藏" : "收藏"}${escapeHTML(tool.name)}" aria-pressed="${isFavorite}" title="${isFavorite ? "取消收藏" : "收藏"}">
            <i data-lucide="bookmark"></i>
          </button>
          <button class="icon-button ${isCompared ? "is-active" : ""}" type="button" data-compare-id="${tool.id}" aria-label="${isCompared ? "移出对比" : "加入对比"}${escapeHTML(tool.name)}" aria-pressed="${isCompared}" title="${isCompared ? "移出对比" : "加入对比"}">
            <i data-lucide="columns-3"></i>
          </button>
        </div>
      </div>
      <p class="tool-summary">${escapeHTML(tool.summary)}</p>
      <div class="badge-row">
        ${tool.sponsored ? '<span class="tool-badge sponsored-badge">推广</span>' : ""}
        <span class="tool-badge price-${tool.price}">${priceLabels[tool.price]}</span>
        ${platformBadges}
        <span class="tool-badge">${languageLabels[tool.language]}</span>
      </div>
      <div class="tool-card-footer">
        <span>更新于 ${tool.updated.slice(0, 7)}</span>
        <button class="detail-link" type="button" aria-label="查看${escapeHTML(tool.name)}详情">查看详情 <i data-lucide="arrow-right"></i></button>
      </div>
    </article>`;
}

function renderSponsor() {
  const sponsor = sponsoredTool;
  const strip = document.getElementById("sponsor-strip");
  if (!sponsor) {
    strip.hidden = true;
    strip.replaceChildren();
    delete strip.dataset.sponsorId;
    return;
  }
  strip.hidden = false;
  strip.dataset.sponsorId = sponsor.id;
  strip.innerHTML = `
    ${logoMarkup(sponsor)}
    <div class="sponsor-copy">
      <span class="sponsor-label">推广</span><strong>${escapeHTML(sponsor.name)}</strong>
      <p>${escapeHTML(sponsor.summary)}</p>
    </div>
    <a class="primary-button" href="${officialToolHref(sponsor, "home_tool_strip")}" target="_blank" rel="noopener noreferrer nofollow sponsored" data-sponsored-link="${sponsor.id}" aria-label="访问${escapeHTML(sponsor.name)}官网">
      <span>访问官网</span><i data-lucide="external-link"></i>
    </a>`;
}

function renderTools() {
  const filtered = getFilteredTools();
  const grid = document.getElementById("tool-grid");
  const empty = document.getElementById("empty-state");
  grid.classList.toggle("is-list-view", state.layout === "list");
  grid.innerHTML = filtered.map(renderToolCard).join("");
  empty.hidden = filtered.length !== 0;
  grid.hidden = filtered.length === 0;
  const total = state.toolServerMode ? state.toolTotal : filtered.length;
  document.getElementById("result-count").textContent = state.toolServerMode && filtered.length < total
    ? `已显示 ${filtered.length} / ${total}`
    : `${total} 个工具`;
  document.getElementById("favorite-count").textContent = state.favorites.size;
  document.getElementById("compare-count").textContent = state.compare.size;
  document.getElementById("favorite-toggle").setAttribute("aria-pressed", String(state.favoritesOnly));
  document.getElementById("grid-view-button").classList.toggle("is-active", state.layout === "grid");
  document.getElementById("grid-view-button").setAttribute("aria-pressed", String(state.layout === "grid"));
  document.getElementById("list-view-button").classList.toggle("is-active", state.layout === "list");
  document.getElementById("list-view-button").setAttribute("aria-pressed", String(state.layout === "list"));
  renderNavigation();
  syncFilterControls();
  updateQueryString();
  renderToolPagination();
  refreshIcons();
  bindImageFallbacks(grid);
}

function renderToolPagination() {
  const pagination = document.getElementById("tool-pagination");
  if (!pagination) return;
  const canPaginate = state.toolServerMode && !state.favoritesOnly
    && (state.toolHasMore || state.toolLoading || state.toolError);
  pagination.hidden = !canPaginate;
  const button = document.getElementById("tool-load-more");
  const label = button.querySelector("span");
  button.disabled = state.toolLoading;
  label.textContent = state.toolLoading ? "正在加载…" : state.toolError ? "重试加载" : "加载更多";
  document.getElementById("tool-pagination-status").textContent = state.toolServerMode
    ? `已加载 ${tools.length} 个，共 ${state.toolTotal} 个`
    : "";
  document.getElementById("tool-grid").setAttribute("aria-busy", String(state.toolLoading));
}

function syncFilterControls() {
  document.getElementById("price-filter").value = state.price;
  document.getElementById("platform-filter").value = state.platform;
  document.getElementById("language-filter").value = state.language;
  document.getElementById("sort-select").value = state.sort;
  const input = document.getElementById("global-search-input");
  if (input.value !== state.query) input.value = state.query;
  document.getElementById("search-clear").hidden = !state.query;
}

function updateQueryString() {
  try {
    const params = new URLSearchParams();
    if (state.query) params.set("q", state.query);
    if (state.category !== "all") params.set("category", state.category);
    if (state.price !== "all") params.set("price", state.price);
    if (state.platform !== "all") params.set("platform", state.platform);
    if (state.language !== "all") params.set("lang", state.language);
    if (state.sort !== "recommended") params.set("sort", state.sort);
    if (state.favoritesOnly) params.set("favorites", "1");
    const query = params.toString();
    const next = `${location.pathname}${query ? `?${query}` : ""}${location.hash}`;
    history.replaceState(null, "", next);
  } catch {
    // Local file previews may not allow history replacement.
  }
}

function resetFilters() {
  state.query = "";
  state.category = "all";
  state.price = "all";
  state.platform = "all";
  state.language = "all";
  state.favoritesOnly = false;
  document.getElementById("filter-panel").classList.remove("is-open");
  document.getElementById("mobile-filter-toggle").setAttribute("aria-expanded", "false");
  void refreshToolResults();
  track("filter_apply", { action: "reset" });
}

function refreshToolResults() {
  window.clearTimeout(searchDebounceTimer);
  if (backendAvailable) return loadToolResults({ append: false });
  state.toolTotal = getFilteredTools().length;
  state.toolHasMore = false;
  renderTools();
  return Promise.resolve(false);
}

function toggleFavorite(toolId) {
  const tool = toolMap[toolId];
  if (!tool) return;
  const adding = !state.favorites.has(toolId);
  if (adding) state.favorites.add(toolId);
  else state.favorites.delete(toolId);
  saveLocalArray("nike-favorites", state.favorites);
  if (state.favoritesOnly) void refreshToolResults();
  else renderTools();
  requestAnimationFrame(() => {
    const nextFocus = document.querySelector(`[data-favorite-id="${toolId}"]`) || document.getElementById("favorite-toggle");
    nextFocus?.focus();
  });
  if (document.getElementById("tool-drawer").classList.contains("is-open")) renderDrawer(tool);
  showToast(adding ? `已收藏 ${tool.name}` : `已取消收藏 ${tool.name}`);
  track("tool_favorite", { tool_id: toolId, action: adding ? "add" : "remove" });
}

function toggleCompare(toolId) {
  const tool = toolMap[toolId];
  if (!tool) return;
  const adding = !state.compare.has(toolId);
  if (adding && state.compare.size >= 4) {
    showToast("最多同时对比4个工具");
    return;
  }
  if (adding) state.compare.add(toolId);
  else state.compare.delete(toolId);
  renderTools();
  renderCompareTray();
  requestAnimationFrame(() => document.querySelector(`[data-compare-id="${toolId}"]`)?.focus());
  if (document.getElementById("tool-drawer").classList.contains("is-open")) renderDrawer(tool);
  track("tool_compare_add", { tool_id: toolId, action: adding ? "add" : "remove", compare_size: state.compare.size });
}

function renderCompareTray() {
  const tray = document.getElementById("compare-tray");
  tray.hidden = state.compare.size === 0;
  document.getElementById("compare-count").textContent = state.compare.size;
  document.getElementById("compare-mini-list").innerHTML = [...state.compare].map((id) => {
    const tool = toolMap[id];
    return `<div class="compare-mini">${logoMarkup(tool)}<span>${escapeHTML(tool.name)}</span></div>`;
  }).join("");
  refreshIcons();
  bindImageFallbacks(tray);
}

function openCompareDialog() {
  if (state.compare.size < 2) {
    showToast("至少选择2个工具才能对比");
    return;
  }
  const selected = [...state.compare].map((id) => toolMap[id]);
  const rows = [
    ["价格", (tool) => priceLabels[tool.price]],
    ["分类", (tool) => categoryMap[tool.category]?.name || "未分类"],
    ["平台", (tool) => tool.platforms.map((platform) => platformLabels[platform]).join("、")],
    ["语言", (tool) => languageLabels[tool.language]],
    ["核心能力", (tool) => tool.features.slice(0, 3).join("、")],
    ["账号要求", (tool) => tool.login],
    ["可用地区", (tool) => tool.region],
    ["资料更新", (tool) => tool.updated]
  ];
  document.getElementById("compare-table-wrap").innerHTML = `
    <table class="compare-table">
      <thead><tr><th>对比项</th>${selected.map((tool) => `<th><div class="compare-tool-heading">${logoMarkup(tool)}<span>${escapeHTML(tool.name)}</span></div></th>`).join("")}</tr></thead>
      <tbody>${rows.map(([label, getter]) => `<tr><td>${label}</td>${selected.map((tool) => `<td>${escapeHTML(getter(tool))}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>`;
  const dialog = document.getElementById("compare-dialog");
  dialog.showModal();
  refreshIcons();
  bindImageFallbacks(dialog);
}

function renderDrawer(tool) {
  const isFavorite = state.favorites.has(tool.id);
  const isCompared = state.compare.has(tool.id);
  const related = tools
    .filter((candidate) => !candidate.sponsored && candidate.category === tool.category && candidate.id !== tool.id)
    .slice(0, 4);
  const sponsorNotice = tool.sponsored
    ? `<p class="sponsor-label">推广内容 · 访问链接可能用于效果统计</p>`
    : "";
  document.getElementById("drawer-content").innerHTML = `
    <div class="detail-hero">
      ${logoMarkup(tool)}
      <div>
        <div class="tool-name-line"><h2>${escapeHTML(tool.name)}</h2><span class="verified-dot" title="资料更新于 ${tool.updated}"><i data-lucide="refresh-cw"></i></span></div>
        <p>${escapeHTML(tool.summary)}</p>
        <div class="badge-row">
          <span class="tool-badge price-${tool.price}">${priceLabels[tool.price]}</span>
          <span class="tool-badge">${escapeHTML(categoryMap[tool.category]?.name || "未分类")}</span>
          <span class="tool-badge">${languageLabels[tool.language]}</span>
        </div>
      </div>
    </div>
    ${sponsorNotice}
    <div class="detail-actions">
      <a class="primary-button" href="${officialToolHref(tool, "detail_drawer")}" target="_blank" rel="noopener noreferrer${tool.sponsored ? " nofollow sponsored" : ""}" data-official-id="${tool.id}">
        <span>访问官网</span><i data-lucide="external-link"></i>
      </a>
      <button class="secondary-button ${isFavorite ? "is-active" : ""}" type="button" data-favorite-id="${tool.id}" aria-label="${isFavorite ? "取消收藏" : "收藏"}${escapeHTML(tool.name)}" title="${isFavorite ? "取消收藏" : "收藏"}"><i data-lucide="bookmark"></i></button>
      <button class="secondary-button ${isCompared ? "is-active" : ""}" type="button" data-compare-id="${tool.id}" aria-label="${isCompared ? "移出对比" : "加入对比"}${escapeHTML(tool.name)}" title="${isCompared ? "移出对比" : "加入对比"}"><i data-lucide="columns-3"></i></button>
    </div>
    <section class="detail-section">
      <h3>产品概览</h3>
      <p>${escapeHTML(tool.description)}</p>
    </section>
    <section class="detail-section">
      <h3>核心能力</h3>
      <ul class="feature-list">${tool.features.map((feature) => `<li><i data-lucide="check-circle-2"></i><span>${escapeHTML(feature)}</span></li>`).join("")}</ul>
    </section>
    <section class="detail-section">
      <h3>使用信息</h3>
      <dl class="fact-list">
        <div class="fact-row"><dt>适用场景</dt><dd>${escapeHTML(tool.useCases.join("、"))}</dd></div>
        <div class="fact-row"><dt>平台</dt><dd>${escapeHTML(tool.platforms.map((platform) => platformLabels[platform]).join("、"))}</dd></div>
        <div class="fact-row"><dt>账号要求</dt><dd>${escapeHTML(tool.login)}</dd></div>
        <div class="fact-row"><dt>可用地区</dt><dd>${escapeHTML(tool.region)}</dd></div>
        <div class="fact-row"><dt>资料更新</dt><dd>${tool.updated}</dd></div>
      </dl>
    </section>
    ${related.length ? `<section class="detail-section"><h3>相似工具</h3><div class="related-tools">${related.map((candidate) => `<button class="related-tool-button" type="button" data-related-id="${candidate.id}">${logoMarkup(candidate)}<span>${escapeHTML(candidate.name)}</span></button>`).join("")}</div></section>` : ""}
  `;
  refreshIcons();
  bindImageFallbacks(document.getElementById("drawer-content"));
}

function openDrawer(toolId) {
  const tool = toolMap[toolId];
  if (!tool) return;
  lastFocusedElement = document.activeElement;
  renderDrawer(tool);
  const drawer = document.getElementById("tool-drawer");
  drawer.setAttribute("aria-label", "工具详情");
  drawer.dataset.toolId = toolId;
  drawer.classList.add("is-open");
  drawer.setAttribute("aria-hidden", "false");
  drawer.inert = false;
  document.querySelector(".app-shell").inert = true;
  document.getElementById("drawer-scrim").classList.add("is-visible");
  document.body.classList.add("is-locked");
  window.setTimeout(() => document.getElementById("drawer-close").focus(), 200);
  track("tool_detail_view", { tool_id: toolId, category_id: tool.category, pricing_type: tool.price });
}

function renderArticleDrawer(article) {
  const relatedIds = article.type === "开发"
    ? ["trae", "cursor", "github-copilot"]
    : article.type === "视频"
      ? ["jimeng", "kling", "runway"]
      : article.type === "办公" || article.type === "研究"
        ? ["notebooklm", "kimi", "gamma"]
        : ["chatgpt", "doubao", "perplexity"];
  const related = relatedIds.map((id) => toolMap[id]).filter(Boolean);
  const keyPoints = article.type === "开发"
    ? ["先为项目建立清晰的规则和上下文边界", "把测试、检查和回滚写进任务验收", "高风险操作保留人工确认"]
    : article.type === "视频"
      ? ["把故事拆成可单独控制的镜头", "用首尾帧和参考图稳定角色与风格", "生成后仍需完成节奏与声音编辑"]
      : article.type === "研究"
        ? ["先限定资料范围和来源质量", "用问题清单驱动检索与归纳", "输出结论时保留可追溯引用"]
        : ["明确受众、任务和最终交付形态", "为关键步骤选择不同工具而非只用一个", "用人工复核保障事实和表达质量"];

  const coverUrl = escapeHTML(safeMediaUrl(article.image));
  const sourceUrl = article.sourceUrl ? escapeHTML(safeMediaUrl(article.sourceUrl, "")) : "";
  document.getElementById("drawer-content").innerHTML = `
    <div class="article-detail-cover"><img src="${coverUrl}" alt="${escapeHTML(article.title)}" width="720" height="405"></div>
    <div class="article-detail-heading">
      <div class="article-meta"><span class="article-type">${escapeHTML(article.type)}</span><span>${escapeHTML(article.date)}</span><span>${escapeHTML(article.readTime)}</span>${article.source ? `<span>来源：${escapeHTML(article.source)}</span>` : ""}</div>
      <h2>${escapeHTML(article.title)}</h2>
      <p>${escapeHTML(article.excerpt)}</p>
    </div>
    ${article.body && article.body !== article.excerpt ? `<section class="detail-section"><h3>正文</h3><p>${escapeHTML(article.body)}</p></section>` : ""}
    ${sourceUrl ? `<section class="detail-section"><h3>官方来源</h3><a class="article-source-link" href="${sourceUrl}" target="_blank" rel="noopener noreferrer nofollow">查看${escapeHTML(article.source || "原始发布")}<i data-lucide="external-link" aria-hidden="true"></i></a></section>` : ""}
    <section class="detail-section">
      <h3>核心要点</h3>
      <ul class="article-key-points">${keyPoints.map((point) => `<li>${escapeHTML(point)}</li>`).join("")}</ul>
    </section>
    <section class="detail-section">
      <h3>实践建议</h3>
      <p>从一个边界清晰的真实任务开始，先记录输入材料、工具选择和验收标准，再逐步扩大自动化范围。关键结论、外部来源和最终交付都应保留人工核验。</p>
    </section>
    <section class="detail-section">
      <h3>相关工具</h3>
      <div class="related-tools">${related.map((tool) => `<button class="related-tool-button" type="button" data-related-id="${tool.id}">${logoMarkup(tool)}<span>${escapeHTML(tool.name)}</span></button>`).join("")}</div>
    </section>`;
  refreshIcons();
  bindImageFallbacks(document.getElementById("drawer-content"));
}

function openArticle(articleId) {
  const article = articleMap[articleId];
  if (!article) return;
  lastFocusedElement = document.activeElement;
  renderArticleDrawer(article);
  const drawer = document.getElementById("tool-drawer");
  drawer.setAttribute("aria-label", "文章详情");
  drawer.dataset.toolId = "";
  drawer.classList.add("is-open");
  drawer.setAttribute("aria-hidden", "false");
  drawer.inert = false;
  document.querySelector(".app-shell").inert = true;
  document.getElementById("drawer-scrim").classList.add("is-visible");
  document.body.classList.add("is-locked");
  window.setTimeout(() => document.getElementById("drawer-close").focus(), 200);
  track("article_click", { article_id: articleId, content_type: article.type });
}

function closeDrawer() {
  const drawer = document.getElementById("tool-drawer");
  drawer.classList.remove("is-open");
  drawer.setAttribute("aria-hidden", "true");
  drawer.inert = true;
  document.querySelector(".app-shell").inert = false;
  document.getElementById("drawer-scrim").classList.remove("is-visible");
  document.body.classList.remove("is-locked");
  lastFocusedElement?.focus?.();
}

function renderCollections() {
  document.getElementById("collection-grid").innerHTML = collections.map((collection) => `
    <article class="collection-card" style="--collection-accent:${safeAccentColor(collection.accent)}">
      <i data-lucide="${escapeHTML(safeIconName(collection.icon, "folder-kanban"))}"></i>
      <h2>${escapeHTML(collection.title)}</h2>
      <p>${escapeHTML(collection.description)}</p>
      <div class="collection-tool-list">
        ${collection.toolIds.map((id) => {
          const tool = toolMap[id];
          if (!tool) return "";
          return `<button class="collection-tool" type="button" data-related-id="${escapeHTML(id)}">${logoMarkup(tool)}<span>${escapeHTML(tool.name)}</span><small>${escapeHTML(priceLabels[tool.price] || "")}</small></button>`;
        }).join("")}
      </div>
    </article>`).join("");

  document.getElementById("ranking-list").innerHTML = rankingTools.map((tool, index) => `
    <div class="ranking-row">
      <span class="rank-number">${String(index + 1).padStart(2, "0")}</span>
      <button class="rank-tool" type="button" data-related-id="${tool.id}">${logoMarkup(tool)}<strong>${escapeHTML(tool.name)}</strong></button>
      <span>${escapeHTML(tool.summary)}</span>
      <span>${priceLabels[tool.price]}</span>
      <span class="rank-change">本周关注</span>
    </div>`).join("");
  refreshIcons();
  bindImageFallbacks(document.getElementById("discover-view"));
}

function renderArticles(targetId, items) {
  document.getElementById(targetId).innerHTML = items.map((item) => `
    <article class="article-item">
      <div class="article-image"><img src="${escapeHTML(safeMediaUrl(item.image))}" alt="${escapeHTML(item.title)}" loading="lazy" width="720" height="405"></div>
      <div class="article-content">
        <div class="article-meta"><span class="article-type">${escapeHTML(item.type)}</span><span>${escapeHTML(item.date)}</span><span>${escapeHTML(item.readTime)}</span>${item.source ? `<span>来源：${escapeHTML(item.source)}</span>` : ""}</div>
        <h2>${escapeHTML(item.title)}</h2>
        <p>${escapeHTML(item.excerpt)}</p>
      </div>
      <button class="icon-button" type="button" data-article-id="${escapeHTML(item.id)}" aria-label="阅读${escapeHTML(item.title)}" title="阅读文章"><i data-lucide="arrow-up-right"></i></button>
    </article>`).join("");
}

function filterTutorials(label) {
  const filtered = label === "全部"
    ? tutorials
    : label === "创作"
      ? tutorials.filter((item) => ["视频", "图像"].includes(item.type))
      : tutorials.filter((item) => item.type === label);
  renderArticles("tutorial-list", filtered);
  refreshIcons();
}

function renderContentViews() {
  renderArticles("tutorial-list", tutorials);
  renderArticles("news-list", newsItems);
  document.getElementById("topic-cloud").innerHTML = ["AI智能体", "视频生成", "编程助手", "多模态", "AI搜索", "开源模型", "产品更新"]
    .map((topic) => `<button class="topic-tag ${state.topics.has(topic) ? "is-active" : ""}" type="button" data-topic="${topic}" aria-pressed="${state.topics.has(topic)}">${topic}</button>`).join("");
}

function setActiveView(viewName, updateHash = true, shouldTrack = true) {
  const validViews = ["tools", "discover", "tutorials", "news", "advertise", "about", "standards", "privacy", "feedback"];
  const nextView = validViews.includes(viewName) ? viewName : "tools";
  const previousView = state.activeView;
  state.activeView = nextView;
  document.querySelectorAll("[data-view-section]").forEach((section) => {
    const active = section.dataset.viewSection === nextView;
    section.hidden = !active;
    section.classList.toggle("is-visible", active);
  });
  document.querySelectorAll(".nav-item[data-view]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === nextView);
  });
  if (updateHash && location.hash !== `#${nextView}`) {
    try {
      history.pushState(null, "", `${location.pathname}${location.search}#${nextView}`);
    } catch {
      location.hash = nextView;
    }
  }
  closeSidebar();
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (shouldTrack && previousView !== nextView) track("page_view", { page_id: nextView });
}

function openSidebar() {
  sidebarReturnFocus = document.activeElement;
  const sidebar = document.getElementById("sidebar");
  sidebar.inert = false;
  sidebar.setAttribute("aria-hidden", "false");
  sidebar.classList.add("is-open");
  document.querySelector(".main-area").inert = true;
  document.getElementById("sidebar-scrim").classList.add("is-visible");
  document.body.classList.add("is-locked");
  window.setTimeout(() => document.getElementById("sidebar-close").focus(), 200);
}

function closeSidebar() {
  const sidebar = document.getElementById("sidebar");
  const wasOpen = sidebar.classList.contains("is-open");
  sidebar.classList.remove("is-open");
  document.getElementById("sidebar-scrim").classList.remove("is-visible");
  if (!document.getElementById("tool-drawer").classList.contains("is-open")) {
    document.querySelector(".main-area").inert = false;
    document.body.classList.remove("is-locked");
  }
  syncSidebarAccessibility();
  if (wasOpen) {
    sidebarReturnFocus?.focus?.();
    sidebarReturnFocus = null;
  }
}

function syncSidebarAccessibility() {
  const sidebar = document.getElementById("sidebar");
  const isMobile = window.matchMedia("(max-width: 991px)").matches;
  const isOpen = sidebar.classList.contains("is-open");
  const hidden = isMobile && !isOpen;
  sidebar.inert = hidden;
  sidebar.setAttribute("aria-hidden", String(hidden));
}

function observeSponsorImpression() {
  const sponsor = document.getElementById("sponsor-strip");
  if (!sponsor || !("IntersectionObserver" in window)) return;
  adImpressionObserver?.disconnect();
  adImpressionObserver = new IntersectionObserver((entries) => {
    const visible = entries.some((entry) => entry.target === sponsor && entry.isIntersecting && entry.intersectionRatio >= 0.5)
      && document.visibilityState === "visible"
      && !document.getElementById("tools-view").hidden;
    if (!visible) {
      clearTimeout(adImpressionTimer);
      adImpressionTimer = null;
      return;
    }
    if (adImpressionTimer) return;
    adImpressionTimer = setTimeout(() => {
      if (document.visibilityState === "visible" && !document.getElementById("tools-view").hidden) {
        track("ad_impression", { placement_id: "home_tool_strip", ad_id: sponsor.dataset.sponsorId || "unknown", visibility_threshold: "50%/1s" });
        adImpressionObserver.disconnect();
      }
      adImpressionTimer = null;
    }, 1000);
  }, { threshold: [0.5] });
  adImpressionObserver.observe(sponsor);
}

function trapFocus(container, event) {
  const focusable = Array.from(container.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'))
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    });
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function openSubmitDialog() {
  document.getElementById("submit-dialog").showModal();
  track("tool_submit_click", { source_position: "sidebar" });
}

function closeDialog(dialogId) {
  const dialog = document.getElementById(dialogId);
  if (dialog?.open) dialog.close();
}

function loadInitialState() {
  const params = new URLSearchParams(location.search);
  state.query = params.get("q") || "";
  if (categoryMap[params.get("category")]) state.category = params.get("category");
  if (["free", "freemium", "paid"].includes(params.get("price"))) state.price = params.get("price");
  if (["web", "desktop", "mobile", "api"].includes(params.get("platform"))) state.platform = params.get("platform");
  if (["zh", "multi"].includes(params.get("lang"))) state.language = params.get("lang");
  if (["recommended", "popular", "newest", "name"].includes(params.get("sort"))) state.sort = params.get("sort");
  state.favoritesOnly = params.get("favorites") === "1";
  const hashView = location.hash.replace("#", "");
  if (["tools", "discover", "tutorials", "news", "advertise", "about", "standards", "privacy", "feedback"].includes(hashView)) state.activeView = hashView;
}

function bindEvents() {
  document.getElementById("category-nav").addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    state.category = button.dataset.category;
    setActiveView("tools");
    void refreshToolResults();
    track("category_click", { category_id: state.category, source_position: "sidebar" });
  });

  document.getElementById("task-tabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    state.category = button.dataset.category;
    void refreshToolResults();
    track("category_click", { category_id: state.category, source_position: "task_tabs" });
  });

  document.querySelectorAll(".nav-item[data-view]").forEach((button) => {
    button.addEventListener("click", () => setActiveView(button.dataset.view));
  });

  document.querySelectorAll("[data-view-link]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      setActiveView(link.dataset.viewLink);
    });
  });

  const searchInput = document.getElementById("global-search-input");
  searchInput.addEventListener("input", () => {
    state.query = searchInput.value;
    document.getElementById("search-clear").hidden = !state.query;
    if (state.activeView !== "tools") setActiveView("tools");
    window.clearTimeout(searchDebounceTimer);
    searchDebounceTimer = window.setTimeout(() => void refreshToolResults(), 300);
  });
  document.getElementById("search-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    state.query = searchInput.value.trim();
    setActiveView("tools");
    await refreshToolResults();
    track("search_submit", { query: state.query, result_count: state.toolServerMode ? state.toolTotal : getFilteredTools().length, scope: "tools" });
  });
  document.getElementById("search-clear").addEventListener("click", () => {
    state.query = "";
    searchInput.value = "";
    searchInput.focus();
    void refreshToolResults();
  });

  document.getElementById("price-filter").addEventListener("change", (event) => {
    state.price = event.target.value;
    void refreshToolResults();
    track("filter_apply", { filter_key: "price", value: state.price });
  });
  document.getElementById("platform-filter").addEventListener("change", (event) => {
    state.platform = event.target.value;
    void refreshToolResults();
    track("filter_apply", { filter_key: "platform", value: state.platform });
  });
  document.getElementById("language-filter").addEventListener("change", (event) => {
    state.language = event.target.value;
    void refreshToolResults();
    track("filter_apply", { filter_key: "language", value: state.language });
  });
  document.getElementById("sort-select").addEventListener("change", (event) => {
    state.sort = event.target.value;
    void refreshToolResults();
  });
  document.getElementById("reset-filters").addEventListener("click", resetFilters);
  document.getElementById("empty-reset").addEventListener("click", resetFilters);

  document.getElementById("favorite-toggle").addEventListener("click", () => {
    state.favoritesOnly = !state.favoritesOnly;
    setActiveView("tools");
    void refreshToolResults();
    if (state.favoritesOnly && state.favorites.size === 0) showToast("还没有收藏工具");
  });

  document.getElementById("tool-load-more").addEventListener("click", () => {
    void loadToolResults({ append: state.toolError ? state.toolRetryAppend : true });
  });

  document.getElementById("grid-view-button").addEventListener("click", () => {
    state.layout = "grid";
    localStorage.setItem("nike-layout", state.layout);
    renderTools();
  });
  document.getElementById("list-view-button").addEventListener("click", () => {
    state.layout = "list";
    localStorage.setItem("nike-layout", state.layout);
    renderTools();
  });

  document.getElementById("mobile-filter-toggle").addEventListener("click", (event) => {
    const panel = document.getElementById("filter-panel");
    const open = panel.classList.toggle("is-open");
    event.currentTarget.setAttribute("aria-expanded", String(open));
  });

  document.getElementById("tool-grid").addEventListener("click", (event) => {
    const favorite = event.target.closest("[data-favorite-id]");
    if (favorite) return toggleFavorite(favorite.dataset.favoriteId);
    const compare = event.target.closest("[data-compare-id]");
    if (compare) return toggleCompare(compare.dataset.compareId);
    const card = event.target.closest("[data-tool-id]");
    if (card) {
      track("tool_card_click", { tool_id: card.dataset.toolId, list_id: "tool_grid" });
      openDrawer(card.dataset.toolId);
    }
  });
  document.getElementById("sponsor-strip").addEventListener("click", (event) => {
    const link = event.target.closest("[data-sponsored-link]");
    if (link) track("ad_click", { tool_id: link.dataset.sponsoredLink, placement_id: "home_tool_strip" });
  });

  document.getElementById("drawer-content").addEventListener("click", (event) => {
    const favorite = event.target.closest("[data-favorite-id]");
    if (favorite) return toggleFavorite(favorite.dataset.favoriteId);
    const compare = event.target.closest("[data-compare-id]");
    if (compare) return toggleCompare(compare.dataset.compareId);
    const related = event.target.closest("[data-related-id]");
    if (related) return openDrawer(related.dataset.relatedId);
    const official = event.target.closest("[data-official-id]");
    if (official) track("tool_official_click", { tool_id: official.dataset.officialId, placement: "detail_drawer" });
  });

  document.addEventListener("click", (event) => {
    const related = event.target.closest("[data-related-id]");
    if (related && !related.closest("#drawer-content")) openDrawer(related.dataset.relatedId);
    const toastButton = event.target.closest("[data-toast]");
    if (toastButton) showToast(toastButton.dataset.toast);
    const article = event.target.closest("[data-article-id]");
    if (article) {
      openArticle(article.dataset.articleId);
    }
    const topic = event.target.closest("[data-topic]");
    if (topic) {
      const name = topic.dataset.topic;
      const adding = !state.topics.has(name);
      if (adding) state.topics.add(name);
      else state.topics.delete(name);
      saveLocalArray("nike-topics", state.topics);
      topic.classList.toggle("is-active", adding);
      topic.setAttribute("aria-pressed", String(adding));
      showToast(adding ? `已关注主题：${name}` : `已取消关注：${name}`);
    }
  });

  document.getElementById("drawer-close").addEventListener("click", closeDrawer);
  document.getElementById("drawer-scrim").addEventListener("click", closeDrawer);
  document.getElementById("mobile-menu-open").addEventListener("click", openSidebar);
  document.getElementById("sidebar-close").addEventListener("click", closeSidebar);
  document.getElementById("sidebar-scrim").addEventListener("click", closeSidebar);

  document.getElementById("compare-open").addEventListener("click", openCompareDialog);
  document.getElementById("compare-tray-open").addEventListener("click", openCompareDialog);
  document.getElementById("compare-clear").addEventListener("click", () => {
    state.compare.clear();
    renderTools();
    renderCompareTray();
  });

  document.getElementById("submit-tool-open").addEventListener("click", openSubmitDialog);
  document.getElementById("standards-submit").addEventListener("click", openSubmitDialog);
  document.querySelectorAll("[data-dialog-close]").forEach((button) => {
    button.addEventListener("click", () => closeDialog(button.dataset.dialogClose));
  });

  document.getElementById("submit-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    const submitButton = form.querySelector('[type="submit"]');
    submitButton.disabled = true;
    try {
      if (!backendAvailable) throw new TypeError("Backend unavailable");
      submissionIdempotencyKey ||= crypto.randomUUID();
      const result = await apiRequest("/api/v1/tool-submissions", {
        method: "POST",
        headers: { "Idempotency-Key": submissionIdempotencyKey },
        body: JSON.stringify({
          name: data.name,
          websiteUrl: data.url,
          categoryId: data.category,
          summary: data.summary,
          contactEmail: data.email,
          declarationAccepted: data.confirm === "on",
          company: data.company || "",
          source: "sidebar"
        })
      });
      form.reset();
      submissionIdempotencyKey = null;
      sessionStorage.setItem("nike-last-submission", JSON.stringify({
        trackingCode: result.data.trackingCode,
        lookupToken: result.data.lookupToken
      }));
      closeDialog("submit-dialog");
      showToast(`已提交审核，编号 ${result.data.trackingCode}`);
      track("tool_submit_success", { category_id: data.category, submission_id: result.data.id });
    } catch (error) {
      if (error.status) {
        submissionIdempotencyKey = null;
        showToast(error.message);
      } else {
        showToast("服务暂不可用，请稍后重试");
      }
    } finally {
      submitButton.disabled = false;
    }
  });

  document.getElementById("newsletter-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const email = document.getElementById("newsletter-email").value;
    const submitButton = form.querySelector('[type="submit"]');
    submitButton.disabled = true;
    try {
      if (!backendAvailable) throw new TypeError("Backend unavailable");
      await apiRequest("/api/v1/newsletter/subscriptions", {
        method: "POST",
        body: JSON.stringify({
          email,
          topicSlugs: [...state.topics].map((topic) => topicSlugMap[topic]).filter(Boolean),
          consentVersion: "2026-07",
          consentAccepted: document.getElementById("newsletter-consent").checked,
          source: "news_sidebar"
        })
      });
      form.reset();
      showToast("订阅意向已提交");
      track("newsletter_subscribe", { source_position: "news_sidebar" });
    } catch (error) {
      if (error.status) {
        showToast(error.message);
      } else {
        showToast("服务暂不可用，请稍后重试");
      }
    } finally {
      submitButton.disabled = false;
    }
  });

  document.getElementById("feedback-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    const submitButton = form.querySelector('[type="submit"]');
    submitButton.disabled = true;
    try {
      if (!backendAvailable) throw new TypeError("Backend unavailable");
      await apiRequest("/api/v1/feedback", {
        method: "POST",
        body: JSON.stringify({
          category: data.category,
          message: data.message,
          contactEmail: data.contactEmail || "",
          pageUrl: `${location.pathname}${location.hash}`,
          consentAccepted: data.consentAccepted === "on",
          consentVersion: "2026-07",
          company: data.company || ""
        })
      });
      form.reset();
      showToast("反馈已收到，感谢你的建议");
    } catch (error) {
      showToast(error.status ? error.message : "服务暂不可用，请稍后重试");
    } finally {
      submitButton.disabled = false;
    }
  });

  document.querySelectorAll(".content-tabs").forEach((tabs) => {
    tabs.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      tabs.querySelectorAll("button").forEach((candidate) => candidate.classList.toggle("is-active", candidate === button));
      filterTutorials(button.textContent.trim());
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Tab") {
      const drawer = document.getElementById("tool-drawer");
      const sidebar = document.getElementById("sidebar");
      if (drawer.classList.contains("is-open")) trapFocus(drawer, event);
      else if (sidebar.classList.contains("is-open")) trapFocus(sidebar, event);
    }
    if (event.key === "Escape") {
      if (document.getElementById("tool-drawer").classList.contains("is-open")) closeDrawer();
      closeSidebar();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      document.getElementById("global-search-input").focus();
    }
  });

  window.addEventListener("hashchange", () => setActiveView(location.hash.replace("#", ""), false));
  window.addEventListener("popstate", () => setActiveView(location.hash.replace("#", ""), false));
  window.addEventListener("resize", syncSidebarAccessibility);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void checkContentRevision();
  });
  window.addEventListener("pagehide", () => {
    if (contentPollTimer) window.clearInterval(contentPollTimer);
    void flushEventQueue(true);
  });
}

async function initialize() {
  localStorage.removeItem("nike-submissions");
  localStorage.removeItem("nike-newsletter");
  await loadBackendData();
  loadInitialState();
  if (backendAvailable) {
    await Promise.all([loadToolResults(), loadRankingTools()]);
    await loadCollectionTools();
    await checkContentRevision({ announce: false });
  }
  renderNavigation();
  renderSponsor();
  renderTools();
  renderCollections();
  renderContentViews();
  renderCompareTray();
  bindEvents();
  document.getElementById("tool-drawer").inert = true;
  syncSidebarAccessibility();
  setActiveView(state.activeView, false, false);
  refreshIcons();
  bindImageFallbacks();
  track("page_view", { page_id: state.activeView });
  observeSponsorImpression();
  startContentPolling();
}

window.addEventListener("DOMContentLoaded", initialize);
