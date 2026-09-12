const CanvasManager = (function() {
    let canvas, ctx;
    let isDrawing = false;
    let currentColor = '#111827';
    let currentLineWidth = 6;
    let isEraser = false;
    let strokes = []; // Local stroke buffer
    let isDrawerMode = false;
    let currentPointerId = null;

    function init(canvasId) {
        canvas = document.getElementById(canvasId);
        if (!canvas) return;
        ctx = canvas.getContext('2d');

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        // Prevent double-tap zoom
        window.addEventListener('dblclick', function(e) {
            e.preventDefault();
        }, { passive: false });

        // Context menu disable on canvas (long press)
        canvas.addEventListener('contextmenu', function(e) {
            e.preventDefault();
        });

        // Pointer Events for single-finger high precision drawing
        canvas.addEventListener('pointerdown', handlePointerDown);
        canvas.addEventListener('pointermove', handlePointerMove);
        canvas.addEventListener('pointerup', handlePointerUp);
        canvas.addEventListener('pointercancel', handlePointerUp);
    }

    function resizeCanvas() {
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        // Maintain high resolution
        canvas.width = rect.width * window.devicePixelRatio || rect.width;
        canvas.height = rect.height * window.devicePixelRatio || rect.height;
        ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
        redrawAll();
    }

    function setDrawerMode(enabled) {
        isDrawerMode = enabled;
    }

    function setColor(color) {
        currentColor = color;
        isEraser = false;
    }

    function setLineWidth(width) {
        currentLineWidth = width;
    }

    function setEraser(enabled) {
        isEraser = enabled;
    }

    function getNormalizedCoords(e) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) / rect.width,
            y: (e.clientY - rect.top) / rect.height
        };
    }

    function handlePointerDown(e) {
        if (!isDrawerMode) return;
        e.preventDefault();

        currentPointerId = e.pointerId;
        canvas.setPointerCapture(e.pointerId);
        isDrawing = true;

        const coords = getNormalizedCoords(e);
        const strokePoint = {
            x: coords.x,
            y: coords.y,
            color: isEraser ? '#ffffff' : currentColor,
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
        if (!isDrawerMode || !isDrawing || e.pointerId !== currentPointerId) return;
        e.preventDefault();

        const coords = getNormalizedCoords(e);
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
                canvas.releasePointerCapture(currentPointerId);
            } catch (err) {}
            currentPointerId = null;
        }

        const coords = getNormalizedCoords(e);
        const strokePoint = {
            x: coords.x,
            y: coords.y,
            color: isEraser ? '#ffffff' : currentColor,
            size: currentLineWidth,
            type: 'end'
        };

        strokes.push(strokePoint);

        if (window.AppSocket) {
            window.AppSocket.emit('draw_stroke', { stroke: strokePoint, room_code: window.currentRoomCode });
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
        drawPoint(stroke);
    }

    function rebuildStrokes(newStrokes) {
        strokes = newStrokes || [];
        redrawAll();
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
