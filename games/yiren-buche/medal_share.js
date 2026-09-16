// medal_share.js —— 勋章分享卡片与小红书端能力适配
// postNote 只负责唤起发布页；用户是否最终发布或通过审核不作为游戏状态。
(function (root) {
  'use strict';

  const MEDAL_SHARE_TOPICS = [
    '一人不撤',
    '指尖FPS',
    '游戏勋章',
    '小红书vibecoding大赛',
    'vibegame',
    'vibecoding',
    '小红书小工具',
  ];

  class MedalShare {
    constructor(options) {
      this.system = options.system;
      this.config = options.config;
      this.bindTap = options.bindTap;
      this.toast = options.toast;
      this.overlay = document.getElementById('medalShare');
      this.canvas = document.getElementById('medalShareCanvas');
      this.title = document.getElementById('medalShareTitle');
      this.status = document.getElementById('medalShareStatus');
      this.postButton = document.getElementById('medalPostBtn');
      this.saveButton = document.getElementById('medalSaveBtn');
      this.closeButton = document.getElementById('medalShareCloseBtn');
      this.activeMedal = null;
      this.activeStats = null;
      this._dataUrl = '';
      this._filePath = '';
      this._busy = false;
      this._imageCache = new Map();
    }

    bind(onClose) {
      if (typeof this.bindTap !== 'function') return;
      this.bindTap(this.postButton, () => this.postNote());
      this.bindTap(this.saveButton, () => this.saveToAlbum());
      this.bindTap(this.closeButton, () => {
        this.close();
        if (typeof onClose === 'function') onClose();
      });
    }

    async open(medal, stats) {
      if (!medal || !this.canvas) return;
      this.activeMedal = medal;
      this.activeStats = Object.assign({}, stats || {});
      this._dataUrl = '';
      this._filePath = '';
      if (this.title) this.title.textContent = `分享勋章 · ${medal.title}`;
      if (this.overlay) {
        this.overlay.scrollTop = 0;
        this.overlay.classList.remove('hidden');
      }
      this._setBusy(true, '正在生成本地分享卡片…');
      try {
        await this._renderCard();
        const sdk = root.xhs && root.xhs.miniTool;
        this._setStatus(sdk ? '卡片已生成，可以发布或保存。' : '卡片已生成；请在小红书内打开后发布。');
      } catch (error) {
        this._setStatus('分享卡片生成失败，请重新打开后再试。');
      } finally {
        this._setBusy(false);
      }
    }

    close() {
      if (this.overlay) this.overlay.classList.add('hidden');
      this.activeMedal = null;
      this.activeStats = null;
      this._dataUrl = '';
      this._filePath = '';
    }

    async postNote() {
      if (this._busy || !this.activeMedal) return;
      const sdk = root.xhs && root.xhs.miniTool;
      if (!sdk || typeof sdk.postNote !== 'function') {
        this._setStatus('当前环境没有小红书发布能力，请在小红书内打开。');
        return;
      }
      this._setBusy(true, '正在准备发布内容…');
      try {
        const mediaUrl = await this._mediaUrl(sdk);
        const payload = this._notePayload(mediaUrl);
        await sdk.postNote(payload);
        this._setStatus('已打开发布页，请检查内容并由你确认发布。');
      } catch (error) {
        this._setStatus(this._errorMessage(error, '发布页打开失败，可以重新尝试。'));
      } finally {
        this._setBusy(false);
      }
    }

    async saveToAlbum() {
      if (this._busy || !this.activeMedal) return;
      const sdk = root.xhs && root.xhs.miniTool;
      if (!sdk || typeof sdk.saveImageToPhotosAlbum !== 'function') {
        this._setStatus('当前环境没有相册保存能力，请在小红书内打开。');
        return;
      }
      this._setBusy(true, '正在保存图片…');
      try {
        const filePath = await this._mediaUrl(sdk);
        await sdk.saveImageToPhotosAlbum({ filePath });
        this._setStatus('分享卡片已保存到系统相册。');
      } catch (error) {
        this._setStatus(this._errorMessage(error, '保存失败，请检查相册权限后重试。'));
      } finally {
        this._setBusy(false);
      }
    }

    _notePayload(mediaUrl) {
      const medal = this.activeMedal;
      const kills = this.system.snapshot().careerKills;
      const next = this.system.getNextMedal();
      const runKills = Math.max(0, Number(this.activeStats && this.activeStats.runKills) || 0);
      const nextLine = next
        ? `下一目标：${next.kills} 击杀，${next.title}。`
        : '六枚生涯勋章已经全部解锁。';
      const body = [
        `这一局，我在《一人不撤》里拿到 ${runKills} 次击杀，生涯击杀推进到了 ${kills}。`,
        `解锁勋章：${medal.title}。`,
        nextLine,
        '这枚勋章，算是我这段战斗的记录。',
      ].join('\n\n');
      const topicSuffix = `\n\n${MEDAL_SHARE_TOPICS.map((topic) => '#' + topic).join(' ')}`;
      const content = `${body.slice(0, Math.max(0, 1000 - topicSuffix.length))}${topicSuffix}`.slice(0, 1000);
      return {
        title: `我解锁了「${medal.title}」`.slice(0, 20),
        content,
        tags: MEDAL_SHARE_TOPICS.join(','),
        mediaInfo: { image_resources: [{ url: mediaUrl }] },
      };
    }

    async _mediaUrl(sdk) {
      if (this._filePath) return this._filePath;
      if (!this._dataUrl) await this._renderCard();
      if (sdk && typeof sdk.writeTempFile === 'function') {
        try {
          const result = await sdk.writeTempFile({ data: this._dataUrl });
          if (result && typeof result.filePath === 'string' && result.filePath) {
            this._filePath = result.filePath;
            return this._filePath;
          }
        } catch (error) {
          // 官方允许 mediaInfo 与相册直接接收 data URI，临时文件失败时使用该降级。
        }
      }
      return this._dataUrl;
    }

    async _renderCard() {
      const medal = this.activeMedal;
      if (!medal || !this.canvas) throw new Error('missing medal share target');
      const size = this.config.shareCard;
      this.canvas.width = size.width;
      this.canvas.height = size.height;
      const ctx = this.canvas.getContext('2d');
      if (!ctx) throw new Error('2d canvas unavailable');

      const image = await this._loadImage(medal.image);
      const width = this.canvas.width;
      const height = this.canvas.height;
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, '#0b1017');
      gradient.addColorStop(0.55, '#161c24');
      gradient.addColorStop(1, '#080b10');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = 'rgba(34, 211, 238, 0.18)';
      ctx.lineWidth = 3;
      for (let x = -height; x < width; x += 96) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + height, height); ctx.stroke();
      }
      ctx.strokeStyle = medal.accent || '#f5a623';
      ctx.lineWidth = 12;
      ctx.strokeRect(42, 42, width - 84, height - 84);
      ctx.strokeStyle = 'rgba(255, 142, 30, 0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(66, 66, width - 132, height - 132);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#22d3ee';
      ctx.font = '700 38px system-ui, sans-serif';
      ctx.fillText('一 人 不 撤 · 生 涯 勋 章', width / 2, 142);

      const imageSize = 650;
      ctx.drawImage(image, (width - imageSize) / 2, 200, imageSize, imageSize);

      ctx.fillStyle = '#f5efe3';
      ctx.font = '900 92px system-ui, sans-serif';
      ctx.fillText(medal.title, width / 2, 960);
      ctx.fillStyle = medal.accent || '#f5a623';
      ctx.font = '700 38px system-ui, sans-serif';
      ctx.fillText(`${medal.kills} 击杀里程碑`, width / 2, 1024);

      const kills = this.system.snapshot().careerKills;
      const runKills = Math.max(0, Number(this.activeStats && this.activeStats.runKills) || 0);
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '500 34px system-ui, sans-serif';
      ctx.fillText(`生涯击杀  ${kills}`, width / 2, 1110);
      ctx.fillText(`本局击杀  ${runKills}`, width / 2, 1162);

      // V4 生涯高光行：从勋章系统存档 bests 读取（单局最高 连杀/爆头/守到波次）。
      // 三项全 0（新档还没有完整对局）时省略该行，不占版面。
      const bests = typeof this.system.getBests === 'function' ? this.system.getBests() : null;
      if (bests && (bests.chain > 0 || bests.headshots > 0 || bests.wave > 0)) {
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '500 30px system-ui, sans-serif';
        ctx.fillText(`单局最高 ${bests.chain} 连杀 · ${bests.headshots} 爆头 · 守到第 ${bests.wave} 波`,
          width / 2, 1210);
      }

      ctx.fillStyle = '#ff8a1f';
      ctx.fillRect(310, 1238, 460, 8);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '500 28px system-ui, sans-serif';
      ctx.fillText('离线指尖 FPS · 用战绩留下自己的编号', width / 2, 1310);

      this._dataUrl = this.canvas.toDataURL('image/jpeg', size.jpegQuality);
      if (!this._dataUrl.startsWith('data:image/jpeg')) throw new Error('canvas export failed');
      return this._dataUrl;
    }

    _loadImage(path) {
      if (this._imageCache.has(path)) return Promise.resolve(this._imageCache.get(path));
      return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
          this._imageCache.set(path, image);
          resolve(image);
        };
        image.onerror = () => reject(new Error(`medal image failed: ${path}`));
        image.src = path;
      });
    }

    _setBusy(busy, message) {
      this._busy = !!busy;
      if (this.postButton) this.postButton.disabled = this._busy;
      if (this.saveButton) this.saveButton.disabled = this._busy;
      // 返回始终可用；分享卡生成或端能力调用失败时不能把用户困在覆盖层。
      if (this.closeButton) this.closeButton.disabled = false;
      if (message) this._setStatus(message);
    }

    _setStatus(message) {
      if (this.status) this.status.textContent = message;
      if (typeof this.toast === 'function' && /失败|没有.*能力/.test(message)) this.toast(message);
    }

    _errorMessage(error, fallback) {
      const raw = error && typeof error.errMsg === 'string' ? error.errMsg : '';
      return raw && raw.length <= 160 ? raw : fallback;
    }
  }

  root.MedalShare = MedalShare;
})(typeof window !== 'undefined' ? window : globalThis);
