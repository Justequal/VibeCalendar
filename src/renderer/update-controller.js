/**
 * 更新功能的界面控制器。
 *
 * Electron 能力只通过 preload 暴露的 appUpdates 接口使用。此模块负责更新按钮、
 * 当前版本说明弹层，不参与日历渲染，便于独立维护更新流程。更新状态始终直接
 * 呈现在“检查更新”按钮中，避免遮挡日历。
 *
 * 按钮可以理解为一个小型状态机：idle → checking → available/downloading →
 * downloaded → installing；任一步失败进入 error，点击后可以重试。主进程事件和
 * 手动检查结果可能乱序到达，因此这里还负责阻止状态和百分比倒退。
 */
(function exposeUpdateController(root) {
  function createUpdateController({ elements, getText }) {
    let checking = false;
    let updateState = { phase: 'idle', version: '', percent: 0 };

    /**
     * electron-updater 的事件和 IPC 返回来自两条异步通道，抵达顺序并不固定。
     * 同一版本已经下载完成或正在安装时，较早的 available/downloading 事件属于
     * 过期消息；忽略它们才能保证按钮不会从完成状态倒退。
     */
    function shouldIgnoreStaleStatus(nextPhase, nextVersion) {
      const sameVersion = !nextVersion
        || !updateState.version
        || nextVersion === updateState.version;
      if (!sameVersion) return false;

      return (
        updateState.phase === 'downloaded'
        && ['available', 'downloading'].includes(nextPhase)
      ) || (
        updateState.phase === 'downloading'
        && nextPhase === 'available'
      ) || (
        updateState.phase === 'installing'
        && nextPhase !== 'error'
      );
    }

    function updateButton() {
      const text = getText();
      const downloading = ['available', 'downloading'].includes(updateState.phase);
      const installing = updateState.phase === 'installing';
      const percent = Math.round(Math.min(100, Math.max(0, updateState.percent || 0)));
      let buttonLabel = text.checkUpdates;
      if (checking) buttonLabel = text.checkingUpdates;
      else if (installing) buttonLabel = text.updating;
      else if (updateState.phase === 'downloaded') {
        buttonLabel = text.updateNow.replace('{version}', updateState.version);
      } else if (updateState.phase === 'found') {
        buttonLabel = text.updateFound.replace('{version}', updateState.version);
      } else if (updateState.phase === 'up-to-date') buttonLabel = text.upToDate;
      else if (updateState.phase === 'error') buttonLabel = text.updateCheckError;
      else if (updateState.phase === 'downloading') {
        buttonLabel = text.downloadingUpdate.replace('{percent}', percent);
      } else if (updateState.phase === 'available') buttonLabel = text.preparingDownload;

      elements.checkUpdate.disabled = checking || downloading || installing;
      elements.checkUpdate.textContent = buttonLabel;
      elements.checkUpdate.setAttribute('aria-label', buttonLabel);
      elements.checkUpdate.title = buttonLabel;
      elements.checkUpdate.setAttribute('aria-busy', String(checking || downloading || installing));
      elements.checkUpdate.dataset.updatePhase = checking ? 'checking' : updateState.phase;
      elements.checkUpdate.style.setProperty(
        '--update-progress',
        downloading || updateState.phase === 'downloaded' ? percent : 0
      );
      elements.checkUpdate.classList.toggle('is-downloading', downloading);
      elements.checkUpdate.classList.toggle(
        'is-indeterminate',
        updateState.phase === 'available'
      );
      elements.checkUpdate.classList.toggle('is-ready', updateState.phase === 'downloaded');
      elements.checkUpdate.classList.toggle('is-error', updateState.phase === 'error');

      if (downloading) {
        elements.checkUpdate.setAttribute('role', 'progressbar');
        elements.checkUpdate.setAttribute('aria-valuemin', '0');
        elements.checkUpdate.setAttribute('aria-valuemax', '100');
        if (updateState.phase === 'downloading') {
          elements.checkUpdate.setAttribute('aria-valuenow', String(percent));
          elements.checkUpdate.setAttribute('aria-valuetext', buttonLabel);
        } else {
          elements.checkUpdate.removeAttribute('aria-valuenow');
          elements.checkUpdate.setAttribute('aria-valuetext', text.preparingDownload);
        }
      } else {
        elements.checkUpdate.removeAttribute('role');
        elements.checkUpdate.removeAttribute('aria-valuemin');
        elements.checkUpdate.removeAttribute('aria-valuemax');
        elements.checkUpdate.removeAttribute('aria-valuenow');
        elements.checkUpdate.removeAttribute('aria-valuetext');
      }
    }

    function syncLanguage() {
      const text = getText();
      elements.version.setAttribute('aria-label', text.versionAnnouncement);
      elements.version.title = text.versionAnnouncement;
      elements.releaseTitle.textContent = text.releaseTitle;
      elements.releaseClose.setAttribute('aria-label', text.closeRelease);
      renderUpdateState();
    }

    function renderUpdateState() {
      updateButton();
    }

    function handleUpdateStatus(status) {
      if (!status || typeof status !== 'object') return;
      const version = String(status.version || updateState.version || '').trim();
      const sameVersion = !version || !updateState.version || version === updateState.version;

      // 后台事件比手动检查的 IPC 返回更及时；一旦下载器开始工作，立刻展示真实
      // 状态，避免按钮继续停在“正在检查”。乱序的旧事件也不能让进度倒退。
      if (['available', 'downloading', 'downloaded', 'error'].includes(status.phase)) {
        checking = false;
      }
      if (shouldIgnoreStaleStatus(status.phase, version)) return;

      if (status.phase === 'available') {
        updateState = { phase: 'available', version, percent: 0 };
      } else if (status.phase === 'downloading') {
        const rawPercent = Number(status.percent);
        const normalizedPercent = Number.isFinite(rawPercent)
          ? Math.min(100, Math.max(0, rawPercent))
          : 0;
        updateState = {
          phase: 'downloading',
          version,
          percent: sameVersion && updateState.phase === 'downloading'
            ? Math.max(updateState.percent, normalizedPercent)
            : normalizedPercent
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

      if (updateState.phase === 'downloaded') {
        updateState = { ...updateState, phase: 'installing' };
        renderUpdateState();
        try {
          const result = await root.appUpdates.installUpdate();
          if (result?.status !== 'installing') {
            updateState = { ...updateState, phase: 'downloaded' };
            renderUpdateState();
          }
        } catch (error) {
          console.warn('安装更新失败：', error);
          updateState = { ...updateState, phase: 'downloaded' };
          renderUpdateState();
        }
        return;
      }

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
        if (elements.releaseModal.hidden) return;

        if (event.key === 'Escape') {
          closeReleaseNotes();
          return;
        }
        if (event.key === 'Tab') {
          const focusableElements = [elements.releaseClose, elements.releaseNotes];
          const currentIndex = focusableElements.indexOf(document.activeElement);
          const direction = event.shiftKey ? -1 : 1;
          const nextIndex = currentIndex < 0
            ? 0
            : (currentIndex + direction + focusableElements.length) % focusableElements.length;
          event.preventDefault();
          focusableElements[nextIndex].focus();
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
        const initialUpdateState = await root.appUpdates.getUpdateState?.();
        if (initialUpdateState?.phase && initialUpdateState.phase !== 'idle') {
          handleUpdateStatus(initialUpdateState);
        }
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
