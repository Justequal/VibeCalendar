/**
 * 教学入口：docs/learning/06-desktop.md。状态事件与请求结果是两条异步通道，应按业务进度和版本校验，而非假设到达顺序。
 *
 * 更新功能的界面控制器。
 *
 * Electron 能力只通过 preload 暴露的 appUpdates 接口使用。此模块负责更新按钮、
 * 当前版本说明弹层，不参与日历渲染。检查和下载由主进程后台完成，
 * 只有安装包下载完成后才显示操作入口。
 *
 * 状态流为idle → available/downloading → downloaded → installing。下载失败
 * 保持隐藏；安装失败由主进程恢复downloaded状态以便再次点击。实时事件和
 * 启动快照可能乱序到达，因此较早的快照不能覆盖较新的状态。
 */
(function exposeUpdateController(root) {
  function createUpdateController({ elements, getText }) {
    let updateState = { phase: 'idle', version: '', percent: 0 };
    // 每次收到有效事件或开始新操作都递增。异步请求记住出发时的序号，返回时
    // 若序号已变，就说明画面已有更新的信息，旧结果不能再修改按钮。
    let stateRevision = 0;
    let initialized = false;

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
        && ['available', 'downloading'].includes(nextPhase)
      );
    }

    /**
     * 后台检查和下载不占用界面空间。只有安装包已经就绪才提供操作入口；
     * 安装进行中保留禁用按钮，既反馈点击结果，也防止重复提交。
     * hidden同时移除布局与键盘焦点，HTML也默认hidden以避免启动时闪现。
     */
    function updateButton() {
      const text = getText();
      const ready = updateState.phase === 'downloaded';
      const installing = updateState.phase === 'installing';
      const label = installing ? text.updating : text.updateNow.replace('{version}', updateState.version);
      elements.installUpdate.hidden = !ready && !installing;
      elements.installUpdate.disabled = !ready;
      elements.installUpdate.textContent = ready || installing ? label : '';
      elements.installUpdate.title = ready || installing ? label : '';
      elements.installUpdate.setAttribute('aria-label', ready || installing ? label : '');
      elements.installUpdate.setAttribute('aria-busy', String(installing));
      elements.installUpdate.dataset.updatePhase = updateState.phase;
      elements.installUpdate.classList.toggle('is-ready', ready);
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
      if (!['available', 'downloading', 'downloaded', 'installing', 'error'].includes(status.phase)) return;
      const version = String(status.version || updateState.version || '').trim();
      const sameVersion = !version || !updateState.version || version === updateState.version;

      // 后台仍跟踪任务状态，用来判断何时允许安装；下载过程不显示进度或按钮。
      if (shouldIgnoreStaleStatus(status.phase, version)) return;
      stateRevision += 1;

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
      } else if (status.phase === 'installing') {
        updateState = { phase: 'installing', version, percent: 100 };
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

    /** 只安装已下载的包，不从按钮发起检查或下载。 */
    async function installDownloadedUpdate() {
      if (updateState.phase !== 'downloaded') return;
      const requestRevision = ++stateRevision;
      updateState = { ...updateState, phase: 'installing' };
      renderUpdateState();
      try {
        const result = await root.appUpdates.installUpdate();
        if (requestRevision === stateRevision && result?.status !== 'installing') {
          updateState = { ...updateState, phase: 'downloaded' };
          renderUpdateState();
        }
      } catch (error) {
        console.warn('安装更新失败：', error);
        // 实时恢复事件优先于IPC返回；没有新事件时，在本地恢复可重试入口。
        if (requestRevision === stateRevision) {
          updateState = { ...updateState, phase: 'downloaded' };
          renderUpdateState();
        }
      }
    }

    function bindEvents() {
      elements.version.addEventListener('click', showCurrentRelease);
      elements.installUpdate.addEventListener('click', installDownloadedUpdate);
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
      if (initialized) return;
      initialized = true;
      syncLanguage();
      if (!root.appUpdates) {
        elements.version.hidden = true;
        elements.installUpdate.hidden = true;
        return;
      }

      bindEvents();
      root.appUpdates.onUpdateStatus?.(handleUpdateStatus);
      const initialRevision = stateRevision;
      // 版本号和更新快照互不依赖：一个失败不能阻断另一个。先订阅事件再取快照，
      // 但只在期间没有新事件/点击时应用快照，避免“旧照片”覆盖实时下载进度。
      await Promise.all([
        (async () => {
          try {
            elements.version.textContent = `v${await root.appUpdates.getVersion()}`;
          } catch (error) {
            console.warn('读取应用版本失败：', error);
          }
        })(),
        (async () => {
          try {
            const initialUpdateState = await root.appUpdates.getUpdateState?.();
            if (initialRevision === stateRevision) handleUpdateStatus(initialUpdateState);
          } catch (error) {
            console.warn('恢复更新状态失败：', error);
          }
        })()
      ]);
    }

    return Object.freeze({
      initialize,
      syncLanguage,
      isReleaseNotesOpen: () => !elements.releaseModal.hidden
    });
  }

  root.createUpdateController = createUpdateController;
})(window);
