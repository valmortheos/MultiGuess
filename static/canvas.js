// [v1.0.3-OLD] Original CanvasManager preserved in comment
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
    let isEraser = false;
    let strokes = [];
    let isDrawerMode = false;
    let isCanvasReady = false;
    let currentPointerId = null;

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
        console.log('[CanvasManager] Setting drawer mode:', enabled);
        isDrawerMode = enabled;
        if (canvas) {
            canvas.style.cursor = enabled ? 'crosshair' : 'default';
        }
    }

    function setColor(color) {
        console.log('[CanvasManager] Setting color:', color);
        currentColor = color;
        isEraser = false;
    }

    function setLineWidth(width) {
        console.log('[CanvasManager] Setting line width:', width);
        currentLineWidth = width;
    }

    function setEraser(enabled) {
        console.log('[CanvasManager] Setting eraser:', enabled);
        isEraser = enabled;
    }

    function getNormalizedCoords(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (clientX - rect.left) / rect.width,
            y: (clientY - rect.top) / rect.height
        };
    }

    function handlePointerDown(e) {
        if (!isDrawerMode || !isCanvasReady) return;
        if (e.pointerType === 'touch' && e.isPrimary === false) return;
        e.preventDefault();

        currentPointerId = e.pointerId;
        try {
            if (canvas.setPointerCapture) {
                canvas.setPointerCapture(e.pointerId);
            }
        } catch (err) {
            console.warn('[CanvasManager] setPointerCapture warning:', err);
        }

        isDrawing = true;

        const coords = getNormalizedCoords(e.clientX, e.clientY);
        const strokePoint = {
            x: coords.x,
            y: coords.y,
            color: isEraser ? '#ffffff' : currentColor,
            size: currentLineWidth,
            type: 'start'
        };

        console.log('[CanvasManager] PointerDown stroke start at:', coords);
        strokes.push(strokePoint);
        drawPoint(strokePoint);

        if (window.AppSocket) {
            window.AppSocket.emit('draw_stroke', { stroke: strokePoint, room_code: window.currentRoomCode });
        }
    }

    function handlePointerMove(e) {
        if (!isDrawerMode || !isDrawing || !isCanvasReady) return;
        if (currentPointerId !== null && e.pointerId !== currentPointerId) return;
        e.preventDefault();

        const coords = getNormalizedCoords(e.clientX, e.clientY);
        const strokePoint = {
            x: coords.x,
            y: coords.y,
            color: isEraser ? '#ffffff' : currentColor,
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
        if (!isDrawerMode || !isDrawing) return;
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

        const coords = getNormalizedCoords(e.clientX, e.clientY);
        const strokePoint = {
            x: coords.x,
            y: coords.y,
            color: isEraser ? '#ffffff' : currentColor,
            size: currentLineWidth,
            type: 'end'
        };

        console.log('[CanvasManager] PointerUp stroke end at:', coords);
        strokes.push(strokePoint);

        if (window.AppSocket) {
            window.AppSocket.emit('draw_stroke', { stroke: strokePoint, room_code: window.currentRoomCode });
        }
    }

    // Touch Event Fallback Handlers
    function handleTouchStart(e) {
        if (!isDrawerMode || !isCanvasReady || window.PointerEvent) return; // Skip if PointerEvents supported
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
        if (!isDrawerMode || !isCanvasReady || window.PointerEvent) return;
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
        if (!isDrawerMode || !isCanvasReady || window.PointerEvent) return;
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
        const absX = stroke.x * rect.width;
        const absY = stroke.y * rect.height;

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
        addRemoteStroke: addRemoteStroke,
        rebuildStrokes: rebuildStrokes,
        clear: clear,
        resizeCanvas: resizeCanvas
    };
})();
