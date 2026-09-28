// medal_ui.js —— 勋章中心、结算摘要和非阻塞解锁提示
(function (root) {
  'use strict';

  class MedalUI {
    constructor(options) {
      this.system = options.system;
      this.audio = options.audio || null;
      this.bindTap = options.bindTap;
      this.onShare = options.onShare;
      this.center = document.getElementById('medalCenter');
      this.grid = document.getElementById('medalGrid');
      this.careerSummary = document.getElementById('medalCareerSummary');
      this.resultSummary = document.getElementById('resultMedalSummary');
      this.banner = document.getElementById('medalUnlockBanner');
      this.bannerImage = document.getElementById('medalUnlockImage');
      this.bannerTitle = document.getElementById('medalUnlockTitle');
      this.bannerProgress = document.getElementById('medalUnlockProgress');
      this._unlockQueue = [];
      this._unlockTimer = 0;
    }

    openCenter() {
      this.renderCenter();
      if (this.center) {
        this.center.scrollTop = 0;
        this.center.classList.remove('hidden');
      }
    }

    closeCenter() {
      if (this.center) this.center.classList.add('hidden');
    }

    renderCenter() {
      if (!this.grid) return;
      const snapshot = this.system.snapshot();
      const next = this.system.getNextMedal();
      if (this.careerSummary) {
        this.careerSummary.textContent = next
          ? `生涯击杀 ${snapshot.careerKills} · 下一枚 ${next.title} ${next.kills - snapshot.careerKills} 击杀后解锁`
          : `生涯击杀 ${snapshot.careerKills} · 六枚勋章已全部解锁`;
      }

      // Chrome 61 基线：不用 replaceChildren，逐个移除旧节点。
      while (this.grid.firstChild) this.grid.removeChild(this.grid.firstChild);
      for (const medal of this.system.getProgress()) {
        this.grid.appendChild(this._buildMedalCard(medal, {
          current: snapshot.careerKills,
          shareable: true,
        }));
      }

      // 枪械专精分区：独立小节标题 + 按武器计数的卡片；贴图未配置时用占位视觉。
      const weaponProgress = this.system.getWeaponProgress();
      if (weaponProgress.length) {
        const heading = document.createElement('h3');
        heading.className = 'medal-section-title';
        heading.textContent = '枪械专精';
        this.grid.appendChild(heading);
        for (const medal of weaponProgress) {
          this.grid.appendChild(this._buildMedalCard(medal, {
            current: medal.kills,
            threshold: medal.threshold,
            shareable: false,
          }));
        }
      }

      // 挑战成就分区：一次性解锁，卡片展示达成条件而非击杀进度条。
      const challenges = this.system.getChallengeProgress();
      if (challenges.length) {
        const heading = document.createElement('h3');
        heading.className = 'medal-section-title';
        heading.textContent = '挑战成就';
        this.grid.appendChild(heading);
        for (const medal of challenges) {
          this.grid.appendChild(this._buildChallengeCard(medal));
        }
      }
    }

    _buildChallengeCard(medal) {
      const card = document.createElement('article');
      card.className = `medal-card ${medal.unlocked ? 'unlocked' : 'locked'}`;
      card.dataset.medalId = medal.id;
      card.style.setProperty('--medal-accent', medal.accent || '#3d8996');

      const visual = document.createElement('div');
      visual.className = 'medal-card-visual';
      const placeholder = document.createElement('div');
      placeholder.className = 'medal-card-placeholder';
      placeholder.textContent = medal.unlocked ? '达成' : '挑战';
      visual.appendChild(placeholder);
      card.appendChild(visual);

      const title = document.createElement('h3');
      title.className = 'medal-card-title';
      title.textContent = medal.title;
      card.appendChild(title);

      const desc = document.createElement('p');
      desc.className = 'medal-card-requirement';
      desc.textContent = medal.desc || '完成指定挑战';
      card.appendChild(desc);

      const state = document.createElement('p');
      state.className = 'medal-card-requirement';
      state.textContent = medal.unlocked ? '已达成' : '未达成';
      state.style.color = medal.unlocked ? '#4ade60' : '#7f8998';
      card.appendChild(state);
      return card;
    }

    _buildMedalCard(medal, options) {
      const card = document.createElement('article');
      card.className = `medal-card ${medal.unlocked ? 'unlocked' : 'locked'}`;
      card.dataset.medalId = medal.id;
      card.style.setProperty('--medal-accent', medal.accent || '#3d8996');

      const visual = document.createElement('div');
      visual.className = 'medal-card-visual';
      if (medal.image) {
        const image = document.createElement('img');
        image.className = 'medal-card-image';
        image.src = medal.image;
        image.alt = medal.unlocked ? medal.title : `未解锁勋章：${medal.title}`;
        image.loading = 'lazy';
        image.decoding = 'async';
        visual.appendChild(image);
      } else {
        // 专精勋章贴图待补：先用主题色描边 + 武器缩写的占位视觉。
        const placeholder = document.createElement('div');
        placeholder.className = 'medal-card-placeholder';
        placeholder.textContent = this._weaponBadgeText(medal);
        visual.appendChild(placeholder);
      }
      card.appendChild(visual);

      const title = document.createElement('h3');
      title.className = 'medal-card-title';
      title.textContent = medal.title;
      card.appendChild(title);

      const threshold = options.threshold || medal.kills;
      const current = Math.min(options.current, threshold);
      const requirement = document.createElement('p');
      requirement.className = 'medal-card-requirement';
      requirement.textContent = medal.unlocked
        ? `${threshold} 击杀达成`
        : `${current} / ${threshold} 击杀`;
      card.appendChild(requirement);

      const track = document.createElement('div');
      track.className = 'medal-card-progress-track';
      const fill = document.createElement('span');
      fill.className = 'medal-card-progress-bar';
      fill.style.width = `${Math.min(100, (options.current / threshold) * 100)}%`;
      track.appendChild(fill);
      card.appendChild(track);

      if (medal.unlocked && options.shareable) {
        const share = document.createElement('button');
        share.type = 'button';
        share.className = 'medal-card-share btn btn-ghost';
        share.textContent = '生成分享卡';
        if (typeof this.bindTap === 'function') {
          this.bindTap(share, () => {
            if (typeof this.onShare === 'function') this.onShare(medal);
          });
        }
        card.appendChild(share);
      } else if (medal.unlocked && medal.type === 'weapon') {
        const pending = document.createElement('p');
        pending.className = 'medal-card-share-pending';
        pending.textContent = '分享卡待勋章贴图就绪后开放';
        card.appendChild(pending);
      }
      return card;
    }

    _weaponBadgeText(medal) {
      const weapon = medal.weaponId && root.CONFIG && root.CONFIG.weapons && root.CONFIG.weapons[medal.weaponId];
      if (!weapon) return '专';
      const match = /[A-Za-z0-9]+/.exec(weapon.name);
      return match ? match[0].toUpperCase().slice(0, 4) : '专';
    }

    setResult(unlockedIds) {
      if (!this.resultSummary) return;
      const medals = (Array.isArray(unlockedIds) ? unlockedIds : [])
        .map((id) => this.system.getMedal(id))
        .filter(Boolean);
      // Chrome 61 基线：不用 replaceChildren，逐个移除旧节点。
      while (this.resultSummary.firstChild) this.resultSummary.removeChild(this.resultSummary.firstChild);
      if (!medals.length) {
        const next = this.system.getNextMedal();
        if (!next) {
          this.resultSummary.textContent = '六枚生涯勋章已全部解锁';
          this.resultSummary.classList.remove('hidden');
          return;
        }
        const kills = this.system.snapshot().careerKills;
        this.resultSummary.textContent = `下一枚：${next.title} · ${kills} / ${next.kills}`;
        this.resultSummary.classList.remove('hidden');
        return;
      }

      const label = document.createElement('span');
      label.textContent = '本局解锁：';
      this.resultSummary.appendChild(label);
      for (const medal of medals) {
        const item = document.createElement('strong');
        item.textContent = medal.title;
        item.style.color = medal.accent || '#f5b53a';
        this.resultSummary.appendChild(item);
      }
      this.resultSummary.classList.remove('hidden');
    }

    queueUnlocks(medals) {
      for (const medal of Array.isArray(medals) ? medals : []) {
        if (!medal || this._unlockQueue.some((item) => item.id === medal.id)) continue;
        this._unlockQueue.push(medal);
      }
      if (!this._unlockTimer) this._showNextUnlock();
    }

    _showNextUnlock() {
      const medal = this._unlockQueue.shift();
      if (!medal || !this.banner) {
        this._unlockTimer = 0;
        return;
      }
      if (this.bannerImage) {
        // 专精勋章暂无贴图：隐藏图片位，只展示标题与进度文案。
        if (medal.image) {
          this.bannerImage.classList.remove('hidden');
          this.bannerImage.src = medal.image;
          this.bannerImage.alt = medal.title;
        } else {
          this.bannerImage.classList.add('hidden');
          this.bannerImage.removeAttribute('src');
        }
      }
      if (this.bannerTitle) {
        this.bannerTitle.textContent = medal.type === 'challenge'
          ? `挑战达成 · ${medal.title}`
          : `勋章解锁 · ${medal.title}`;
      }
      if (this.bannerProgress) {
        this.bannerProgress.textContent = medal.type === 'weapon'
          ? `该武器击杀达到 ${this.system.weaponMasteryKills} · 专精达成`
          : medal.type === 'challenge'
            ? (medal.desc || '挑战条件已达成')
            : `生涯击杀达到 ${medal.kills} · 回合结束后可分享`;
      }
      this.banner.classList.remove('hidden');
      this.system.markAnnounced(medal.id);
      if (this.audio && typeof this.audio.medalUnlock === 'function') this.audio.medalUnlock();

      this._unlockTimer = root.setTimeout(() => {
        this.banner.classList.add('hidden');
        this._unlockTimer = 0;
        this._showNextUnlock();
      }, 2800);
    }
  }

  root.MedalUI = MedalUI;
})(typeof window !== 'undefined' ? window : globalThis);
