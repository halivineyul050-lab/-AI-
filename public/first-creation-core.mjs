export const CREATION_CASES = [
  { id: 'editorial-cover', audience: 'content', name: '公众号封面底图', subtitle: '为标题留出空间，让主题一眼可见', ratio: '16:9', style: '插画', requiresReference: false,
    prompt: '为一篇关于AI创作与灵感记录的公众号文章生成横向封面底图：浅紫色整洁桌面上摆放打开的笔记本电脑、绘画草稿卡片与柔和发光的半透明紫色球体。主体集中在画面左侧，右侧保留暖白色干净留白，便于后期添加标题。现代编辑插画结合柔和3D材质，窗边自然光，淡紫、暖白和少量桃色，构图清爽，小尺寸仍清晰。不要生成文字、字母、Logo、水印或边框。', tip: '这是无字封面底图，下载后可添加标题。' },
  { id: 'video-cover', audience: 'content', name: '短视频封面底图', subtitle: '竖版主视觉，给你的故事一个开场', ratio: '9:16', style: '电影感', requiresReference: false,
    prompt: '生成关于创意灵感的竖版短视频封面底图：一个半透明紫色玻璃球悬浮在暖白色小展台上，一条精致橘色丝带围绕球体轻轻弯曲。电影感侧光，柔和薰衣草紫渐变背景，真实细腻玻璃与石材质感，主体位于中下方，上方三分之一留出清晰干净的标题空间。视觉简洁，缩小后依然醒目。不要生成文字、字母、Logo、水印或边框。', tip: '这是无字封面底图，下载后可添加标题。' },
  { id: 'pet-avatar', audience: 'personal', name: '治愈萌宠头像', subtitle: '一只小柯基，装进你的头像框', ratio: '1:1', style: '3D', requiresReference: false,
    prompt: '生成方形3D萌宠头像：一只奶油色与焦糖色毛发的柯基幼犬，穿橘色小雨衣，好奇开心的表情。只出现一只小狗，头部和肩膀居中，耳朵完整，四周留出空间，适合裁成圆形头像。柔和浅紫色棚拍背景，细腻蓬松毛发，温暖自然光，高品质动画电影风格，清晰可辨的角色轮廓。不要生成文字、字母、Logo或水印。', tip: '下载后可按头像平台要求裁剪。' },
  { id: 'chinese-illustration', audience: 'personal', name: '国风灵感插画', subtitle: '白鹤、荷塘与山色，留住一份宁静', ratio: '2:3', style: '国风', requiresReference: false,
    prompt: '生成竖版当代国风插画：一只优雅的白鹤站在荷塘边，远处是薄雾中的青绿山峦，画面上角有细致的桃花枝。暖白宣纸纹理，克制的鼠尾草绿、青绿与浅珊瑚色，精致笔触，清晰层次，主体与水面倒影自然协调。构图疏朗，适当留白，安静雅致。不要生成文字、书法、印章、字母、Logo或水印。', tip: '实际画幅以所选模型支持的比例为准。' },
  { id: 'product-background', audience: 'commerce', name: '商品摄影背景', subtitle: '先准备布景，再放入你的商品', ratio: '1:1', style: '写实', requiresReference: false,
    prompt: '生成方形商业产品摄影背景，只包含空布景，不放置商品：一个低矮的暖白色圆形石材展台位于画面下方三分之一，展台顶部留空。柔和鼠尾草绿背景，边缘有虚化植物叶片，暖色窗光形成自然投影，细腻真实石材纹理。中央有足够空间方便后期合成商品，背景干净高雅。不要生成瓶子或其他商品，不要文字、品牌、Logo或水印。', tip: '此案例仅生成背景，商品需要后期合成。' },
  { id: 'product-display', audience: 'commerce', name: '我的商品展示图', subtitle: '上传商品照片，尝试新的拍摄布景', ratio: '1:1', style: '写实', requiresReference: true,
    prompt: '以用户上传的商品参考图为主体生成方形商业展示图：尽量保持商品的外观、颜色、形状、包装和原有标识，不要编造文字或品牌。将主体放在浅暖色石材展台上，搭配柔和鼠尾草绿背景和边缘少量植物枝叶，暖色柔光，自然接触阴影，正面略偏30度商业摄影构图。完整展示主体，细节清晰，留白适中。不增加无关商品，不添加文字或水印。', tip: 'AI可能改变商品细节，发布前请核对外观、包装和文字。示例为虚构商品。' }
].map(c => ({ ...c, image: `/assets/image-generation/first-creation/${c.id}.webp` }));

export function chooseCaseModel(item, models, currentId) {
  const eligible = models.filter(m => !item.requiresReference || m.supportsReferenceImage);
  const exact = eligible.filter(m => m.supportedRatios?.includes(item.ratio));
  const pool = exact.length ? exact : eligible;
  return pool.find(m => m.id === currentId) || pool[0] || null;
}
export function creationCost(config, modelId, count, wallet) {
  const unit = config?.modelPrices?.[modelId] ?? config?.defaultImageCredits;
  const ready = Number.isSafeInteger(unit) && unit > 0 && Number.isSafeInteger(count) && count > 0;
  const total = ready ? unit * count : null;
  const available = wallet ? Math.max(0, wallet.balance - (wallet.frozen || 0)) : null;
  return { ready, total, available, sufficient: ready && available !== null && available >= total };
}
export function settlementText(settlement) {
  if (!settlement?.settled) return '积分状态待核对，请查询原任务或查看积分账户。';
  if (settlement.charged === 0) return `本次未扣费，预留已释放 ${settlement.released} 积分。`;
  return `实际使用 ${settlement.charged} 积分${settlement.released ? `，预留已释放 ${settlement.released} 积分` : ''}。`;
}
export function timingText(timing) {
  if (!timing || timing.sampleCount < 20 || !Number.isFinite(timing.minSeconds) || !Number.isFinite(timing.maxSeconds)) return '耗时取决于模型与当前负载，生成后可查看任务状态。';
  return `近期多数任务约 ${timing.minSeconds}–${timing.maxSeconds} 秒，实际耗时可能更长。`;
}
export const pendingKey = userId => `nikai-image-pending:${userId}`;
