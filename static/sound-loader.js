const SoundLoader = (function() {
    let loaderScreen, progressBarFill, statusText, metricsText, btnSkip;
    let isSkipped = false;

    function initUI() {
        loaderScreen = document.getElementById('sound-loader-screen');
        progressBarFill = document.getElementById('progress-bar-fill');
        statusText = document.getElementById('loader-status-text');
        metricsText = document.getElementById('loader-metrics-text');
        btnSkip = document.getElementById('btn-skip-audio');

        if (btnSkip) {
            btnSkip.addEventListener('click', () => {
                console.log('[SoundLoader] User clicked skip audio.');
                isSkipped = true;
                hideLoader();
            });
        }
    }

    function showLoader() {
        if (loaderScreen) loaderScreen.classList.remove('hidden');
    }

    function hideLoader() {
        if (loaderScreen) loaderScreen.classList.add('hidden');
    }

    async function fetchWithRetry(url, maxRetries = 3) {
        for (let i = 0; i < maxRetries; i++) {
            if (isSkipped) throw new Error('User skipped');
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`HTTP error ${response.status}`);
                return response;
            } catch (err) {
                if (i === maxRetries - 1) throw err;
                await new Promise(r => setTimeout(r, 500 * Math.pow(2, i)));
            }
        }
    }

    async function loadSounds() {
        initUI();
        try {
            const manifestRes = await fetchWithRetry('/api/sound-manifest', 3);
            const manifest = await manifestRes.json();

            const savedMeta = await DB.get('sound_meta', 'version');
            const localVersion = savedMeta ? (savedMeta.value || savedMeta) : null;
            const remoteVersion = manifest.version;
            const isCached = !!(localVersion && localVersion === remoteVersion);

            console.log('[sound-loader] cached=', isCached, 'local=', localVersion, 'remote=', remoteVersion);

            if (isCached) {
                console.log('[SoundLoader] Sound cache up to date (version match). Skipping preloader.');
                hideLoader();
                return;
            }

            showLoader();
            console.log('[SoundLoader] Downloading sounds manifest:', manifest);

            const totalFiles = manifest.total_files || manifest.files.length;
            const totalBytes = manifest.total_size || 1;
            let downloadedBytes = 0;
            let completedFiles = 0;

            const speedSamples = [];
            let lastTimestamp = performance.now();
            let lastBytes = 0;

            for (const fileInfo of manifest.files) {
                if (isSkipped) break;

                const fileUrl = `/Sound/${fileInfo.path}`;
                try {
                    const res = await fetchWithRetry(fileUrl, 3);
                    const reader = res.body ? res.body.getReader() : null;
                    const chunks = [];

                    if (reader) {
                        while (true) {
                            if (isSkipped) break;
                            const { done, value } = await reader.read();
                            if (done) break;
                            chunks.push(value);
                            downloadedBytes += value.length;

                            const now = performance.now();
                            const timeDiff = (now - lastTimestamp) / 1000;
                            if (timeDiff >= 0.3) {
                                const bytesDiff = downloadedBytes - lastBytes;
                                const currentSpeed = bytesDiff / timeDiff; // B/s
                                speedSamples.push(currentSpeed);
                                if (speedSamples.length > 5) speedSamples.shift();

                                const avgSpeed = speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length;
                                const mbDownloaded = (downloadedBytes / (1024 * 1024)).toFixed(1);
                                const mbTotal = (totalBytes / (1024 * 1024)).toFixed(1);
                                const speedMB = (avgSpeed / (1024 * 1024)).toFixed(1);
                                const remainingBytes = totalBytes - downloadedBytes;
                                const etaSec = avgSpeed > 0 ? Math.max(0, Math.ceil(remainingBytes / avgSpeed)) : 0;

                                const percent = Math.min(100, Math.floor((downloadedBytes / totalBytes) * 100));
                                if (progressBarFill) progressBarFill.style.width = `${percent}%`;
                                if (statusText) statusText.textContent = `Menyiapkan audio... ${completedFiles}/${totalFiles} file (${percent}%)`;
                                if (metricsText) metricsText.textContent = `${speedMB} MB/s · ETA: ±${etaSec}s · ${mbDownloaded} MB / ${mbTotal} MB`;

                                lastTimestamp = now;
                                lastBytes = downloadedBytes;
                            }
                        }
                    }

                    if (isSkipped) break;

                    const blob = new Blob(chunks, { type: 'audio/mp3' });
                    await DB.putSound(fileInfo.path, blob, fileInfo.size, fileInfo.hash);
                    completedFiles++;

                    const percent = Math.min(100, Math.floor((downloadedBytes / totalBytes) * 100));
                    if (progressBarFill) progressBarFill.style.width = `${percent}%`;
                    if (statusText) statusText.textContent = `Menyiapkan audio... ${completedFiles}/${totalFiles} file (${percent}%)`;
                } catch (err) {
                    console.warn(`[SoundLoader] Failed to download audio file ${fileInfo.path}:`, err);
                }
            }

            if (!isSkipped) {
                await DB.set('sound_meta', 'version', { key: 'version', value: manifest.version, timestamp: Date.now() });
                if (progressBarFill) progressBarFill.style.width = '100%';
                if (statusText) statusText.textContent = 'Audio siap!';
                setTimeout(hideLoader, 300);
            }
        } catch (err) {
            console.warn('[SoundLoader] Manifest or sound loading failed non-blockingly:', err);
            hideLoader();
        } finally {
            hideLoader();
        }
    }

    return {
        loadSounds: loadSounds
    };
})();
