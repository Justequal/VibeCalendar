/**
 * 更新功能的界面控制器。
 *
 * Electron 能力只通过 preload 暴露的 appUpdates 接口使用。此模块负责更新按钮、
 * 状态提示和当前版本说明弹层，不参与日历渲染，便于独立维护更新流程。
 */
(function exposeUpdateController(root) {
  function createUpdateController({ elements, getText }) {
    let statusTimer;
    let checking = false;
    let updateState = { phase: 'idle', version: '', percent: 0 };

    function updateButton() {
      const text = getText();
      const downloading = ['available', 'downloading'].includes(updateState.phase);
      elements.checkUpdate.disabled = checking || downloading;
      elements.checkUpdate.textContent = checking
        ? text.checkingUpdates
        : downloading
          ? text.downloadingUpdate
          : text.checkUpdates;
    }

    function syncLanguage() {
      const text = getText();
      elements.version.setAttribute('aria-label', text.versionAnnouncement);
      elements.version.title = text.versionAnnouncement;
      elements.checkUpdate.setAttribute('aria-label', text.checkUpdates);
      elements.updateProgress.setAttribute('aria-label', text.updateProgressLabel);
      updateButton();
      elements.releaseTitle.textContent = text.releaseTitle;
      elements.releaseClose.setAttribute('aria-label', text.closeRelease);
      renderUpdateState();
    }

    function showStatus(message, isError = false, autoHide = true) {
      clearTimeout(statusTimer);
      elements.updateStatusText.textContent = message;
      elements.updateStatus.classList.toggle('is-error', isError);
      elements.updateStatus.hidden = false;
      if (autoHide) {
        statusTimer = setTimeout(() => {
          elements.updateStatus.hidden = true;
          elements.updateStatus.setAttribute('aria-busy', 'false');
          updateState = { phase: 'idle', version: '', percent: 0 };
        }, 4500);
      }
    }

    function showProgress(percent) {
      elements.updateProgress.hidden = false;
      if (Number.isFinite(percent)) {
        const rounded = Math.round(Math.min(100, Math.max(0, percent)));
        elements.updateProgress.classList.toggle('is-indeterminate', false);
        elements.updateProgress.style.setProperty('--progress', rounded);
        elements.updateProgress.setAttribute('aria-valuenow', rounded);
        elements.updateProgressValue.textContent = `${rounded}%`;
        return;
      }

      elements.updateProgress.classList.toggle('is-indeterminate', true);
      elements.updateProgress.removeAttribute('aria-valuenow');
      elements.updateProgressValue.textContent = '…';
    }

    function hideProgress() {
      elements.updateProgress.hidden = true;
      elements.updateProgress.classList.toggle('is-indeterminate', false);
      elements.updateProgress.removeAttribute('aria-valuenow');
    }

    function renderUpdateState() {
      const text = getText();
      const version = updateState.version || '';
      const percent = Math.round(updateState.percent || 0);

      if (updateState.phase === 'checking') {
        showProgress();
        showStatus(text.checkingUpdates, false, false);
      } else if (updateState.phase === 'available') {
        showProgress();
        showStatus(text.updateAvailable.replace('{version}', version), false, false);
      } else if (updateState.phase === 'found') {
        hideProgress();
        showStatus(text.updateFound.replace('{version}', version));
      } else if (updateState.phase === 'downloading') {
        showProgress(percent);
        showStatus(
          text.updateDownloading
            .replace('{version}', version)
            .replace('{percent}', percent),
          false,
          false
        );
      } else if (updateState.phase === 'downloaded') {
        showProgress(100);
        showStatus(text.updateDownloaded.replace('{version}', version));
      } else if (updateState.phase === 'up-to-date') {
        hideProgress();
        showStatus(text.upToDate);
      } else if (updateState.phase === 'error') {
        hideProgress();
        showStatus(text.updateCheckError, true);
      } else {
        hideProgress();
      }
      const busy = ['checking', 'available', 'downloading'].includes(updateState.phase);
      elements.updateStatus.setAttribute('aria-busy', String(busy));
      updateButton();
    }

    function handleUpdateStatus(status) {
      if (!status || typeof status !== 'object') return;
      const version = String(status.version || updateState.version || '').trim();

      if (status.phase === 'available') {
        updateState = { phase: 'available', version, percent: 0 };
      } else if (status.phase === 'downloading') {
        const rawPercent = Number(status.percent);
        updateState = {
          phase: 'downloading',
          version,
          percent: Number.isFinite(rawPercent) ? Math.min(100, Math.max(0, rawPercent)) : 0
        };
      } else if (status.phase === 'downloaded') {
        updateState = { phase: 'downloaded', version, percent: 100 };
      } else if (status.phase === 'error') {
        updateState = { phase: 'error', version, percent: 0 };
      } else {
        return;
      }
      renderUpdateState();
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

    async function showCurrentRelease() {
      const text = getText();
      elements.releaseTitle.textContent = text.releaseTitle;
      elements.releaseVersion.textContent = '';
      elements.releaseNotes.textContent = text.releaseLoading;
      elements.releaseModal.hidden = false;
      elements.releaseClose.focus();

      try {
        const release = await root.appUpdates.getCurrentRelease();
        elements.releaseVersion.textContent = formatReleaseTitle(release);
        // 使用 textContent 显示远程 Release 文本，避免把远端内容解释为 HTML。
        elements.releaseNotes.textContent = formatReleaseNotes(release.notes)
          || text.releaseNoNotes;
      } catch (error) {
        console.warn('读取当前版本说明失败：', error);
        elements.releaseNotes.textContent = text.releaseLoadError;
      }
    }

    async function checkForUpdates() {
      if (checking) return;

      checking = true;
      updateState = { phase: 'checking', version: '', percent: 0 };
      renderUpdateState();

      try {
        const result = await root.appUpdates.checkForUpdates();
        const text = getText();
        if (result.status === 'available') {
          const version = result.latestVersion || result.version;
          // 下载进度事件可能先于 IPC 结果到达，不用较旧的 available 状态覆盖它。
          if (!['downloading', 'downloaded'].includes(updateState.phase)) {
            updateState = {
              phase: result.downloadStarted === false ? 'found' : 'available',
              version,
              percent: 0
            };
            renderUpdateState();
          }
        } else if (result.status === 'up-to-date') {
          updateState = { phase: 'up-to-date', version: '', percent: 0 };
          renderUpdateState();
        } else if (result.status === 'error') {
          updateState = { phase: 'error', version: '', percent: 0 };
          renderUpdateState();
        } else {
          // IPC 返回结构异常时也必须结束“正在检查”状态，不能表现为没有反应。
          updateState = { phase: 'error', version: '', percent: 0 };
          renderUpdateState();
        }
      } catch (error) {
        console.warn('手动检查更新失败：', error);
        updateState = { phase: 'error', version: '', percent: 0 };
        renderUpdateState();
      } finally {
        checking = false;
        updateButton();
      }
    }

    function bindEvents() {
      elements.version.addEventListener('click', showCurrentRelease);
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
      root.appUpdates.onUpdateStatus?.(handleUpdateStatus);
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
