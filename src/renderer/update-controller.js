/**
 * 更新功能的界面控制器。
 *
 * Electron 能力只通过 preload 暴露的 appUpdates 接口使用。此模块负责更新按钮、
 * 状态提示和公告弹层，不参与日历渲染，便于独立维护更新流程。
 */
(function exposeUpdateController(root) {
  function createUpdateController({ elements, getText }) {
    let statusTimer;
    let checking = false;

    function syncLanguage() {
      const text = getText();
      elements.version.setAttribute('aria-label', text.versionAnnouncement);
      elements.version.title = text.versionAnnouncement;
      elements.checkUpdate.setAttribute('aria-label', text.checkUpdates);
      elements.checkUpdate.textContent = checking
        ? text.checkingUpdates
        : text.checkUpdates;
      elements.releaseTitle.textContent = text.releaseTitle;
      elements.releaseClose.setAttribute('aria-label', text.closeRelease);
    }

    function showStatus(message, isError = false) {
      clearTimeout(statusTimer);
      elements.updateStatus.textContent = message;
      elements.updateStatus.classList.toggle('is-error', isError);
      elements.updateStatus.hidden = false;
      statusTimer = setTimeout(() => {
        elements.updateStatus.hidden = true;
      }, 4500);
    }

    function closeReleaseNotes() {
      elements.releaseModal.hidden = true;
      elements.version.focus();
    }

    function formatReleaseTitle(release) {
      const versionLabel = `v${release.version}`;
      const title = String(release.title || '').trim();
      return title.toLowerCase().includes(versionLabel.toLowerCase())
        ? title
        : `${title || 'VibeCalendar'} · ${versionLabel}`;
    }

    /** 将常见 Markdown 标记转为适合纯文本弹层阅读的形式。 */
    function formatReleaseNotes(notes) {
      return String(notes || '')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[([^\]]+)]\((https?:\/\/[^)]+)\)/g, '$1 ($2)')
        .trim();
    }

    async function showLatestRelease() {
      const text = getText();
      elements.releaseTitle.textContent = text.releaseTitle;
      elements.releaseVersion.textContent = '';
      elements.releaseNotes.textContent = text.releaseLoading;
      elements.releaseModal.hidden = false;
      elements.releaseClose.focus();

      try {
        const release = await root.appUpdates.getLatestRelease();
        elements.releaseVersion.textContent = formatReleaseTitle(release);
        // 使用 textContent 显示远程 Release 文本，避免把远端内容解释为 HTML。
        elements.releaseNotes.textContent = formatReleaseNotes(release.notes)
          || text.releaseNoNotes;
      } catch (error) {
        console.warn('加载更新公告失败：', error);
        elements.releaseNotes.textContent = text.releaseLoadError;
      }
    }

    async function checkForUpdates() {
      if (checking) return;

      const requestText = getText();
      checking = true;
      elements.checkUpdate.disabled = true;
      elements.checkUpdate.textContent = requestText.checkingUpdates;

      try {
        const result = await root.appUpdates.checkForUpdates();
        const text = getText();
        if (result.status === 'available') {
          const version = result.latestVersion || result.version;
          showStatus(text.updateAvailable.replace('{version}', version));
        } else if (result.status === 'up-to-date') {
          showStatus(text.upToDate);
        } else if (result.status === 'error') {
          showStatus(text.updateCheckError, true);
        }
      } catch (error) {
        console.warn('手动检查更新失败：', error);
        showStatus(getText().updateCheckError, true);
      } finally {
        checking = false;
        elements.checkUpdate.disabled = false;
        elements.checkUpdate.textContent = getText().checkUpdates;
      }
    }

    function bindEvents() {
      elements.version.addEventListener('click', showLatestRelease);
      elements.checkUpdate.addEventListener('click', checkForUpdates);
      elements.releaseClose.addEventListener('click', closeReleaseNotes);
      elements.releaseModal.addEventListener('click', (event) => {
        if (event.target === elements.releaseModal) closeReleaseNotes();
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !elements.releaseModal.hidden) {
          closeReleaseNotes();
        }
      });
    }

    async function initialize() {
      syncLanguage();
      if (!root.appUpdates) {
        elements.version.hidden = true;
        elements.checkUpdate.hidden = true;
        return;
      }

      bindEvents();
      try {
        elements.version.textContent = `v${await root.appUpdates.getVersion()}`;
      } catch (error) {
        console.warn('读取应用版本失败：', error);
      }
    }

    return Object.freeze({
      initialize,
      syncLanguage,
      isReleaseNotesOpen: () => !elements.releaseModal.hidden
    });
  }

  root.createUpdateController = createUpdateController;
})(window);
