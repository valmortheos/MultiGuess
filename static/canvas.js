// [v1.0.4-OLD] Previous CanvasManager preserved below in comment
/*
const CanvasManager = (function() {
    ...
})();
*/

const CanvasManager = (function() {
    let canvas, ctx;
    let isDrawing = false;
    let currentColor = '#111827';
    let currentLineWidth = 6;
    let currentTool = 'brush'; // 'brush' | 'eraser' | 'fill'
    let stickerMode = false;
    let strokes = [];
    let isDrawerMode = false;
    let isCanvasReady = false;
    let currentPointerId = null;

    const imageCache = {};
    const stickerCache = new Map();
    const stickerQueue = [];
    let isProcessingStickerQueue = false;

    function registerStickerImage(path, img) {
        stickerCache.set(path, img);
        processStickerQueue();
    }

    function processStickerQueue() {
        if (isProcessingStickerQueue) return;
        isProcessingStickerQueue = true;

        function step() {
            if (stickerQueue.length === 0) {
                isProcessingStickerQueue = false;
                return;
            }
            const stroke = stickerQueue[0];
            const src = stroke.data || stroke.path;
            const cached = stickerCache.get(src);

            if (cached && cached.complete) {
                stickerQueue.shift();
                redrawAll();
                step();
            } else if (!cached) {
                const img = new Image();
                img.onload = () => {
                    stickerCache.set(src, img);
                    stickerQueue.shift();
                    redrawAll();
                    step();
                };
                img.onerror = () => {
                    console.warn('[CanvasManager] Failed to load queued sticker:', src);
                    stickerQueue.shift();
                    step();
                };
                img.src = src;
            }
        }

        step();
    }

    function init(canvasId) {
        console.log('[CanvasManager] Initializing canvas:', canvasId);
        canvas = document.getElementById(canvasId);
        if (!canvas) {
            console.error('[CanvasManager] Error: Canvas element not found with ID:', canvasId);
            return;
        }
        ctx = canvas.getContext('2d');

        // Initial sizing before drawing
        resizeCanvas();
        window.addEventListener('resize', () => {
            requestAnimationFrame(resizeCanvas);
        });

        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', () => {
                requestAnimationFrame(resizeCanvas);
            });
        }

        const container = document.getElementById('canvas-container');
        if (container && window.ResizeObserver) {
            const ro = new ResizeObserver(() => {
                requestAnimationFrame(resizeCanvas);
            });
            ro.observe(container);
        }

        // Prevent double-tap zoom
        window.addEventListener('dblclick', function(e) {
            e.preventDefault();
        }, { passive: false });

        // Context menu disable on canvas
        canvas.addEventListener('contextmenu', function(e) {
            e.preventDefault();
        });

        // Pointer Events (Primary Input Binding)
        canvas.addEventListener('pointerdown', handlePointerDown);
        canvas.addEventListener('pointermove', handlePointerMove);
        canvas.addEventListener('pointerup', handlePointerUp);
        canvas.addEventListener('pointercancel', handlePointerUp);

        // Fallback Touch Events for devices with partial PointerEvents implementation
        canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
        canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
        canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
        canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false });

        isCanvasReady = true;
        console.log('[CanvasManager] Canvas initialized successfully.');
    }

    function resizeCanvas() {
        if (!canvas || !ctx) return;
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;

        // Reset transform to identity then scale by dpr cleanly
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        redrawAll();
    }

    function setDrawerMode(enabled) {
        console.log('[CanvasManager] [drawer-mode] setting drawer mode:', enabled);
        isDrawerMode = enabled;
        if (canvas) {
            canvas.style.cursor = enabled ? 'crosshair' : 'default';
            canvas.style.touchAction = enabled ? 'none' : 'auto';
        }
    }

    function setColor(color) {
        console.log('[CanvasManager] Setting color:', color);
        currentColor = color;
        currentTool = 'brush';
    }

    function setLineWidth(width) {
        console.log('[CanvasManager] Setting line width:', width);
        currentLineWidth = width;
    }

    function setEraser(enabled) {
        console.log('[CanvasManager] Setting eraser:', enabled);
        if (enabled) {
            currentTool = 'eraser';
            stickerMode = false;
        } else if (currentTool === 'eraser') {
            currentTool = 'brush';
        }
    }

    function setFillMode(enabled) {
        console.log('[CanvasManager] Setting fill mode:', enabled);
        if (enabled) {
            currentTool = 'fill';
            stickerMode = false;
        } else if (currentTool === 'fill') {
            currentTool = 'brush';
        }
    }

    function setStickerMode(enabled) {
        console.log('[CanvasManager] Setting sticker mode:', enabled);
        stickerMode = enabled;
    }

    function getCanvasCoords(e) {
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
        const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);

        const x = (clientX - rect.left) / rect.width;
        const y = (clientY - rect.top) / rect.height;

        const finalX = Math.max(0, Math.min(1, x));
        const finalY = Math.max(0, Math.min(1, y));

        return {
            x: finalX,
            y: finalY
        };
    }

    function hexToRgba(hex) {
        let c = hex.replace('#', '');
        if (c.length === 3) c = c.split('').map(x => x + x).join('');
        const num = parseInt(c, 16);
        return [ (num >> 16) & 255, (num >> 8) & 255, num & 255, 255 ];
    }

    function performFill(normX, normY, fillColorHex, tolerance = 30) {
        if (!canvas || !ctx) return;
        const W = canvas.width;
        const H = canvas.height;
        if (W === 0 || H === 0) return;

        const startX = Math.floor(normX * W);
        const startY = Math.floor(normY * H);
        if (startX < 0 || startX >= W || startY < 0 || startY >= H) return;

        const imgData = ctx.getImageData(0, 0, W, H);
        const data = imgData.data;

        const targetIdx = (startY * W + startX) * 4;
        const tR = data[targetIdx];
        const tG = data[targetIdx + 1];
        const tB = data[targetIdx + 2];
        const tA = data[targetIdx + 3];

        const [fR, fG, fB, fA] = hexToRgba(fillColorHex);

        function match(idx) {
            return (
                Math.abs(data[idx] - tR) <= tolerance &&
                Math.abs(data[idx + 1] - tG) <= tolerance &&
                Math.abs(data[idx + 2] - tB) <= tolerance &&
                Math.abs(data[idx + 3] - tA) <= tolerance
            );
        }

        if (Math.abs(tR - fR) <= tolerance && Math.abs(tG - fG) <= tolerance &&
            Math.abs(tB - fB) <= tolerance && Math.abs(tA - fA) <= tolerance) {
            return;
        }

        let minX = W, minY = H, maxX = 0, maxY = 0;
        const stack = [[startX, startY]];
        const visited = new Uint8Array(W * H);

        while (stack.length > 0) {
            const [cx, cy] = stack.pop();
            let y = cy;

            while (y >= 0 && match((y * W + cx) * 4) && !visited[y * W + cx]) {
                y--;
            }
            y++;

            let spanLeft = false;
            let spanRight = false;

            while (y < H && match((y * W + cx) * 4) && !visited[y * W + cx]) {
                const pIdx = (y * W + cx) * 4;
                visited[y * W + cx] = 1;

                data[pIdx] = fR;
                data[pIdx + 1] = fG;
                data[pIdx + 2] = fB;
                data[pIdx + 3] = fA;

                if (cx < minX) minX = cx;
                if (cx > maxX) maxX = cx;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;

                if (cx > 0) {
                    if (match((y * W + (cx - 1)) * 4) && !visited[y * W + (cx - 1)]) {
                        if (!spanLeft) {
                            stack.push([cx - 1, y]);
                            spanLeft = true;
                        }
                    } else {
                        spanLeft = false;
                    }
                }

                if (cx < W - 1) {
                    if (match((y * W + (cx + 1)) * 4) && !visited[y * W + (cx + 1)]) {
                        if (!spanRight) {
                            stack.push([cx + 1, y]);
                            spanRight = true;
                        }
                    } else {
                        spanRight = false;
                    }
                }

                y++;
            }
        }

        ctx.putImageData(imgData, 0, 0);

        if (minX <= maxX && minY <= maxY) {
            const pW = maxX - minX + 1;
            const pH = maxY - minY + 1;
            const patchCanvas = document.createElement('canvas');
            patchCanvas.width = pW;
            patchCanvas.height = pH;
            const patchCtx = patchCanvas.getContext('2d');
            const patchData = ctx.getImageData(minX, minY, pW, pH);
            patchCtx.putImageData(patchData, 0, 0);

            const dataUrl = patchCanvas.toDataURL('image/png');
            const stroke = {
                type: 'bitmap',
                x: minX / W,
                y: minY / H,
                w: pW / W,
                h: pH / H,
                data: dataUrl
            };

            strokes.push(stroke);
            if (window.AppSocket) {
                window.AppSocket.emit('draw_stroke', { stroke: stroke, room_code: window.currentRoomCode });
            }
        }
    }

    function handlePointerDown(e) {
        if (!isDrawerMode || !isCanvasReady) return;
        if (e.pointerType === 'touch' && e.isPrimary === false) return;
        if (stickerMode) return; // Ignore drawing when placing sticker

        e.preventDefault();

        if (currentTool === 'fill') {
            const coords = getCanvasCoords(e);
            performFill(coords.x, coords.y, currentColor, 30);
            return;
        }

        currentPointerId = e.pointerId;
        try {
            if (canvas.setPointerCapture) {
                canvas.setPointerCapture(e.pointerId);
            }
        } catch (err) {
            console.warn('[CanvasManager] setPointerCapture warning:', err);
        }

        isDrawing = true;

        const coords = getCanvasCoords(e);
        const strokePoint = {
            x: coords.x,
            y: coords.y,
            color: currentTool === 'eraser' ? '#ffffff' : currentColor,
            size: currentLineWidth,
            type: 'start'
        };

        strokes.push(strokePoint);
        drawPoint(strokePoint);

        if (window.AppSocket) {
            window.AppSocket.emit('draw_stroke', { stroke: strokePoint, room_code: window.currentRoomCode });
        }
    }

    function handlePointerMove(e) {
        if (!isDrawerMode || !isDrawing || !isCanvasReady || stickerMode || currentTool === 'fill') return;
        if (currentPointerId !== null && e.pointerId !== currentPointerId) return;
        e.preventDefault();

        const coords = getCanvasCoords(e);
        const strokePoint = {
            x: coords.x,
            y: coords.y,
            color: currentTool === 'eraser' ? '#ffffff' : currentColor,
            size: currentLineWidth,
            type: 'line'
        };

        strokes.push(strokePoint);
        drawPoint(strokePoint);

        if (window.AppSocket) {
            window.AppSocket.emit('draw_stroke', { stroke: strokePoint, room_code: window.currentRoomCode });
        }
    }

    function handlePointerUp(e) {
        if (!isDrawerMode || !isDrawing || stickerMode || currentTool === 'fill') return;
        e.preventDefault();

        isDrawing = false;
        if (currentPointerId !== null) {
            try {
                if (canvas.releasePointerCapture) {
                    canvas.releasePointerCapture(currentPointerId);
                }
            } catch (err) {
                console.warn('[CanvasManager] releasePointerCapture warning:', err);
            }
            currentPointerId = null;
        }

        const coords = getCanvasCoords(e);
        const strokePoint = {
            x: coords.x,
            y: coords.y,
            color: currentTool === 'eraser' ? '#ffffff' : currentColor,
            size: currentLineWidth,
            type: 'end'
        };

        strokes.push(strokePoint);

        if (window.AppSocket) {
            window.AppSocket.emit('draw_stroke', { stroke: strokePoint, room_code: window.currentRoomCode });
        }
    }

    // Touch Event Fallback Handlers
    function handleTouchStart(e) {
        if (!isDrawerMode || !isCanvasReady || window.PointerEvent || stickerMode) return;
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            handlePointerDown({
                clientX: touch.clientX,
                clientY: touch.clientY,
                pointerId: touch.identifier || 1,
                preventDefault: () => e.preventDefault()
            });
        }
    }

    function handleTouchMove(e) {
        if (!isDrawerMode || !isCanvasReady || window.PointerEvent || stickerMode) return;
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            handlePointerMove({
                clientX: touch.clientX,
                clientY: touch.clientY,
                pointerId: touch.identifier || 1,
                preventDefault: () => e.preventDefault()
            });
        }
    }

    function handleTouchEnd(e) {
        if (!isDrawerMode || !isCanvasReady || window.PointerEvent || stickerMode) return;
        const touch = e.changedTouches[0] || e.touches[0];
        if (touch) {
            handlePointerUp({
                clientX: touch.clientX,
                clientY: touch.clientY,
                pointerId: touch.identifier || 1,
                preventDefault: () => e.preventDefault()
            });
        }
    }

    function drawPoint(stroke) {
        if (!canvas || !ctx) return;
        const rect = canvas.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;

        if (stroke.type === 'bitmap' || stroke.type === 'sticker') {
            const src = stroke.data || stroke.path;
            if (!src) return;

            const absX = stroke.x * width;
            const absY = stroke.y * height;
            const absW = stroke.w * width;
            const absH = stroke.h * height;

            const cachedImg = stickerCache.get(src) || (imageCache[src] && imageCache[src].loaded ? imageCache[src].img : null);

            if (cachedImg && cachedImg.complete) {
                ctx.drawImage(cachedImg, absX, absY, absW, absH);
            } else {
                if (!stickerQueue.includes(stroke)) {
                    stickerQueue.push(stroke);
                }
                processStickerQueue();
            }
            return;
        }

        const absX = stroke.x * width;
        const absY = stroke.y * height;

        ctx.strokeStyle = stroke.color;
        ctx.fillStyle = stroke.color;
        ctx.lineWidth = stroke.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (stroke.type === 'start') {
            ctx.beginPath();
            ctx.moveTo(absX, absY);
            ctx.arc(absX, absY, stroke.size / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(absX, absY);
        } else if (stroke.type === 'line') {
            ctx.lineTo(absX, absY);
            ctx.stroke();
        } else if (stroke.type === 'end') {
            ctx.lineTo(absX, absY);
            ctx.stroke();
            ctx.closePath();
        }
    }

    function addRemoteStroke(stroke) {
        strokes.push(stroke);
        requestAnimationFrame(() => drawPoint(stroke));
    }

    function rebuildStrokes(newStrokes) {
        strokes = newStrokes || [];
        requestAnimationFrame(() => redrawAll());
    }

    function clear() {
        strokes = [];
        if (!canvas || !ctx) return;
        const rect = canvas.getBoundingClientRect();
        ctx.clearRect(0, 0, rect.width, rect.height);
    }

    function redrawAll() {
        if (!canvas || !ctx) return;
        const rect = canvas.getBoundingClientRect();
        ctx.clearRect(0, 0, rect.width, rect.height);

        strokes.forEach(stroke => {
            drawPoint(stroke);
        });
    }

    return {
        init: init,
        setDrawerMode: setDrawerMode,
        setColor: setColor,
        setLineWidth: setLineWidth,
        setEraser: setEraser,
        setFillMode: setFillMode,
        setStickerMode: setStickerMode,
        addRemoteStroke: addRemoteStroke,
        rebuildStrokes: rebuildStrokes,
        clear: clear,
        resizeCanvas: resizeCanvas,
        getCanvasCoords: getCanvasCoords,
        getStrokes: () => strokes,
        registerStickerImage: registerStickerImage,
        getStickerCache: () => stickerCache,
        getCurrentTool: () => currentTool
    };
})();
