// Voice Chat Manager for MultiGuess
const VoiceManager = (function() {
    let localStream = null;
    let peerConnections = {};
    let isMicMuted = true;

    function init() {
        console.log('[voice] VoiceManager initialized');
    }

    async function toggleMic() {
        isMicMuted = !isMicMuted;
        if (!isMicMuted && !localStream) {
            try {
                localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                console.log('[voice] Microphone access granted');
            } catch (err) {
                console.warn('[voice] Microphone access denied or failed:', err);
                isMicMuted = true;
            }
        }
        return !isMicMuted;
    }

    return {
        init: init,
        toggleMic: toggleMic
    };
})();
