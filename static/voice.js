// WebRTC Voice Chat & Video Call Module (v2.5.0)
(function() {
    'use strict';

    const state = {
        localStream: null,
        peers: {}, // sid -> { pc, name, videoEl, boxEl }
        hasMic: null,
        micOn: false,
        camOn: false,
        inVoice: false,
        inVideo: false
    };

    function showToast(msg) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg);
        } else {
            console.log('[AVChat Toast]', msg);
        }
    }

    function showAudioEnableButton() {
        let btn = document.getElementById('btn-enable-audio');
        if (!btn) {
            btn = document.createElement('button');
            btn.id = 'btn-enable-audio';
            btn.className = 'btn-enable-audio';
            btn.textContent = '🔊 Ketuk untuk aktifkan suara';
            btn.style.cssText = 'position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%); z-index: 10000; padding: 10px 18px; background: #ef4444; color: white; border: none; border-radius: 20px; font-weight: bold; font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); cursor: pointer;';
            btn.onclick = function() {
                document.querySelectorAll('audio[id^="audio-peer-"]').forEach(a => {
                    a.play().catch(e => console.warn('[Voice] Enable audio play error:', e));
                });
                btn.style.display = 'none';
            };
            document.body.appendChild(btn);
        }
        btn.style.display = 'block';
    }

    function createAudioPeerElement(sid, stream) {
        let audioEl = document.getElementById(`audio-peer-${sid}`);
        if (!audioEl) {
            audioEl = document.createElement('audio');
            audioEl.id = `audio-peer-${sid}`;
            audioEl.autoplay = true;
            audioEl.playsInline = true;
            audioEl.muted = false;
            audioEl.style.display = 'none';
            document.body.appendChild(audioEl);
        } else {
            audioEl.muted = false;
        }
        if (audioEl.srcObject !== stream) {
            audioEl.srcObject = stream;
            audioEl.play().then(() => {
                const btn = document.getElementById('btn-enable-audio');
                if (btn) btn.style.display = 'none';
            }).catch(e => {
                console.warn(`[Voice] Audio play blocked/error for peer ${sid}:`, e);
                showAudioEnableButton();
            });
        }
        return audioEl;
    }

    function removeAudioPeerElement(sid) {
        const audioEl = document.getElementById(`audio-peer-${sid}`);
        if (audioEl && audioEl.parentNode) {
            audioEl.parentNode.removeChild(audioEl);
        }
    }

    async function getAudioTrack() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                video: false
            });
            const track = stream.getAudioTracks()[0];
            if (track) {
                state.hasMic = true;
                return track;
            }
        } catch (err) {
            console.warn('[AVChat] Mic permission denied or unavailable:', err);
            state.hasMic = false;
        }
        return null;
    }

    async function getVideoTrack() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
                audio: false
            });
            const track = stream.getVideoTracks()[0];
            if (track) {
                return track;
            }
        } catch (err) {
            console.warn('[AVChat] Camera permission denied or unavailable:', err);
        }
        return null;
    }

    function updateControlUI() {
        const btnVoice = document.getElementById('btn-voice-toggle');
        const btnVideo = document.getElementById('btn-video-toggle');

        if (btnVoice) {
            if (!state.inVoice) {
                btnVoice.textContent = '🎤';
                btnVoice.classList.remove('btn-success', 'btn-danger');
                btnVoice.title = 'Voice Chat';
            } else if (!state.micOn || state.hasMic === false) {
                btnVoice.textContent = '🔇';
                btnVoice.classList.remove('btn-success');
                btnVoice.classList.add('btn-danger');
                btnVoice.title = 'Mic Mati';
            } else {
                btnVoice.textContent = '🎤';
                btnVoice.classList.remove('btn-danger');
                btnVoice.classList.add('btn-success');
                btnVoice.title = 'Mic Nyala';
            }
            btnVoice.disabled = false;
        }

        if (btnVideo) {
            if (state.inVideo && state.camOn) {
                btnVideo.textContent = '📹';
                btnVideo.classList.remove('btn-danger');
                btnVideo.classList.add('btn-success');
                btnVideo.title = 'Kamera Nyala';
            } else {
                btnVideo.textContent = '📹';
                btnVideo.classList.remove('btn-success', 'btn-danger');
                btnVideo.title = 'Video Call';
            }
        }
    }

    async function toggleVoice() {
        if (!state.localStream) {
            state.localStream = new MediaStream();
        }

        let audioTrack = state.localStream.getAudioTracks()[0];

        if (!state.inVoice) {
            if (!audioTrack) {
                audioTrack = await getAudioTrack();
                if (audioTrack) {
                    state.localStream.addTrack(audioTrack);
                    state.micOn = true;
                } else {
                    showToast('Izin mikrofon ditolak.');
                }
            } else {
                audioTrack.enabled = true;
                state.micOn = true;
            }
            state.inVoice = true;
            updateControlUI();

            if (window.AppSocket) {
                window.AppSocket.emit('voice_join', { room_code: window.currentRoomCode });
            }
        } else {
            // Re-request audio track if mic was previously denied or missing
            if (!audioTrack || state.hasMic === false) {
                audioTrack = await getAudioTrack();
                if (audioTrack) {
                    state.localStream.addTrack(audioTrack);
                    state.micOn = true;
            // Attach audio track to all existing peers safely
                    for (const sid in state.peers) {
                        const pc = state.peers[sid].pc;
                        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');
                        if (sender) {
                            await sender.replaceTrack(audioTrack);
                        } else {
                            pc.addTrack(audioTrack, state.localStream);
                        }
                    }
                } else {
                    showToast('Izin mikrofon ditolak.');
                }
            } else {
                // Instant mic toggle without SDP renegotiation
                audioTrack.enabled = !audioTrack.enabled;
                state.micOn = audioTrack.enabled;
            }
            updateControlUI();
        }
    }

    async function toggleVideo() {
        const overlay = document.getElementById('video-floating-overlay');

        if (!state.localStream) {
            state.localStream = new MediaStream();
        }

        let videoTrack = state.localStream.getVideoTracks()[0];

        if (!state.inVideo) {
            if (!videoTrack) {
                videoTrack = await getVideoTrack();
                if (videoTrack) {
                    state.localStream.addTrack(videoTrack);
                    state.camOn = true;
                } else {
                    showToast('Izin kamera ditolak.');
                    return;
                }
            } else {
                videoTrack.enabled = true;
                state.camOn = true;
            }

            // Also attempt audio if not requested yet
            if (!state.localStream.getAudioTracks().length && state.hasMic === null) {
                const audioTrack = await getAudioTrack();
                if (audioTrack) {
                    state.localStream.addTrack(audioTrack);
                    state.micOn = true;
                }
            }

            state.inVideo = true;
            if (overlay) overlay.classList.remove('hidden');
            renderLocalVideo();

            // Attach video track to all existing peers cleanly
            for (const sid in state.peers) {
                const pc = state.peers[sid].pc;
                const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
                if (sender) {
                    await sender.replaceTrack(videoTrack);
                } else {
                    pc.addTrack(videoTrack, state.localStream);
                }
            }

            updateControlUI();
            if (window.AppSocket) {
                window.AppSocket.emit('video_join', { room_code: window.currentRoomCode });
            }
        } else {
            // Close video (disable video track, hide grid overlay, return to voice-only)
            if (videoTrack) {
                videoTrack.enabled = false;
            }
            state.camOn = false;
            state.inVideo = false;
            if (overlay) overlay.classList.add('hidden');
            updateControlUI();
        }
    }

    function renderLocalVideo() {
        const grid = document.getElementById('video-grid');
        if (!grid) return;

        let localBox = document.getElementById('video-box-local');
        if (!localBox) {
            localBox = document.createElement('div');
            localBox.id = 'video-box-local';
            localBox.className = 'video-box video-local';

            const video = document.createElement('video');
            video.autoplay = true;
            video.playsInline = true;
            video.muted = true; // Mute local video to prevent echo

            const label = document.createElement('span');
            label.className = 'video-label';
            label.textContent = 'Saya';

            localBox.appendChild(video);
            localBox.appendChild(label);
            grid.appendChild(localBox);

            if (state.localStream) {
                video.srcObject = state.localStream;
            }
        }
    }

    function addOrUpdateRemoteVideo(sid, remoteStream, name) {
        const grid = document.getElementById('video-grid');
        if (!grid) return;

        let box = document.getElementById(`video-box-${sid}`);
        if (!box) {
            box = document.createElement('div');
            box.id = `video-box-${sid}`;
            box.className = 'video-box video-remote';

            const video = document.createElement('video');
            video.autoplay = true;
            video.playsInline = true;

            const label = document.createElement('span');
            label.className = 'video-label';
            label.textContent = name || 'Peserta';

            box.appendChild(video);
            box.appendChild(label);
            grid.appendChild(box);

            video.srcObject = remoteStream;
            if (state.peers[sid]) {
                state.peers[sid].videoEl = video;
                state.peers[sid].boxEl = box;
            }
        } else {
            const video = box.querySelector('video');
            if (video) video.srcObject = remoteStream;
            if (name) {
                const label = box.querySelector('.video-label');
                if (label) label.textContent = name;
            }
        }
    }

    function removeRemoteVideo(sid) {
        const box = document.getElementById(`video-box-${sid}`);
        if (box && box.parentNode) {
            box.parentNode.removeChild(box);
        }
    }

    function createPeer(sid, initiator, name) {
        if (state.peers[sid]) {
            if (name) state.peers[sid].name = name;
            return state.peers[sid].pc;
        }

        const mySid = window.currentSid || (window.AppSocket ? window.AppSocket.id : '');
        const polite = mySid < sid;

        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:global.stun.twilio.com:3478' }
            ]
        });

        const peerObj = {
            pc: pc,
            name: name || 'Peserta',
            polite: polite,
            makingOffer: false,
            ignoreOffer: false,
            isSettingRemoteAnswerPending: false
        };

        if (state.localStream) {
            state.localStream.getTracks().forEach(track => {
                pc.addTrack(track, state.localStream);
            });
        }

        pc.onicecandidate = event => {
            if (event.candidate && window.AppSocket) {
                window.AppSocket.emit('voice_signal', {
                    to: sid,
                    signal: { candidate: event.candidate },
                    room_code: window.currentRoomCode
                });
            }
        };

        pc.ontrack = event => {
            const trackKind = event.track ? event.track.kind : 'unknown';
            console.log(`[Voice] remote track kind=${trackKind} from ${sid}`);
            const remoteStream = event.streams[0] || new MediaStream([event.track]);

            if (trackKind === 'audio') {
                createAudioPeerElement(sid, remoteStream);
            } else if (trackKind === 'video') {
                addOrUpdateRemoteVideo(sid, remoteStream, peerObj.name);
            } else {
                createAudioPeerElement(sid, remoteStream);
                addOrUpdateRemoteVideo(sid, remoteStream, peerObj.name);
            }
        };

        pc.onnegotiationneeded = async () => {
            try {
                peerObj.makingOffer = true;
                await pc.setLocalDescription();
                const sdpStr = pc.localDescription ? pc.localDescription.sdp : '';
                console.log(`[Voice] SDP offer m=audio present: ${sdpStr.includes('m=audio')}`);
                if (window.AppSocket) {
                    window.AppSocket.emit('voice_signal', {
                        to: sid,
                        signal: { sdp: pc.localDescription },
                        room_code: window.currentRoomCode
                    });
                }
            } catch (err) {
                console.error('[AVChat] Perfect Negotiation offer error:', err);
            } finally {
                peerObj.makingOffer = false;
            }
        };

        state.peers[sid] = peerObj;
        return pc;
    }

    function initSocketListeners() {
        if (!window.AppSocket) return;

        window.AppSocket.on('voice_peers_list', function(data) {
            if (data && Array.isArray(data.peers)) {
                data.peers.forEach(peerSid => {
                    createPeer(peerSid, true);
                });
            }
        });

        window.AppSocket.on('voice_user_joined', function(data) {
            if (data && data.sid) {
                createPeer(data.sid, false, data.sender_name);
            }
        });

        window.AppSocket.on('voice_signal', async function(data) {
            if (!data || !data.from || !data.signal) return;

            let peerObj = state.peers[data.from];
            if (!peerObj) {
                createPeer(data.from, false);
                peerObj = state.peers[data.from];
            }
            const pc = peerObj.pc;

            try {
                if (data.signal.sdp) {
                    const description = new RTCSessionDescription(data.signal.sdp);
                    const readyForOffer = !peerObj.makingOffer && (pc.signalingState === 'stable' || peerObj.isSettingRemoteAnswerPending);
                    const offerCollision = description.type === 'offer' && !readyForOffer;

                    peerObj.ignoreOffer = !peerObj.polite && offerCollision;
                    if (peerObj.ignoreOffer) {
                        console.log('[Voice] Offer collision detected, impolite peer ignoring offer from', data.from);
                        return;
                    }

                    peerObj.isSettingRemoteAnswerPending = (description.type === 'answer');
                    await pc.setRemoteDescription(description);
                    peerObj.isSettingRemoteAnswerPending = false;

                    if (description.type === 'offer') {
                        await pc.setLocalDescription();
                        const sdpStr = pc.localDescription ? pc.localDescription.sdp : '';
                        console.log(`[Voice] SDP answer m=audio present: ${sdpStr.includes('m=audio')}`);
                        window.AppSocket.emit('voice_signal', {
                            to: data.from,
                            signal: { sdp: pc.localDescription },
                            room_code: window.currentRoomCode
                        });
                    }
                }
                if (data.signal.candidate) {
                    try {
                        await pc.addIceCandidate(new RTCIceCandidate(data.signal.candidate));
                    } catch (err) {
                        if (!peerObj.ignoreOffer) {
                            console.warn('[Voice] Error adding ICE candidate:', err);
                        }
                    }
                }
            } catch (err) {
                console.error('[AVChat] Signal processing error:', err);
            }
        });

        window.AppSocket.on('voice_user_left', function(data) {
            if (data && data.sid && state.peers[data.sid]) {
                try {
                    state.peers[data.sid].pc.close();
                } catch (e) {}
                delete state.peers[data.sid];
                removeRemoteVideo(data.sid);
                removeAudioPeerElement(data.sid);
            }
        });
    }

    function initOverlayDrag() {
        const overlay = document.getElementById('video-floating-overlay');
        const header = document.getElementById('video-overlay-header');
        if (!overlay || !header) return;

        // Restore saved position
        try {
            const saved = localStorage.getItem('mg_video_overlay_pos');
            if (saved) {
                const pos = JSON.parse(saved);
                if (pos.left !== undefined && pos.top !== undefined) {
                    overlay.style.left = `${pos.left}px`;
                    overlay.style.top = `${pos.top}px`;
                    overlay.style.right = 'auto';
                    overlay.style.bottom = 'auto';
                }
            }
        } catch (e) {}

        let isDragging = false;
        let startX = 0, startY = 0;
        let initialLeft = 0, initialTop = 0;

        header.addEventListener('pointerdown', function(e) {
            if (e.target.closest('.video-overlay-actions')) return;
            isDragging = true;
            try {
                header.setPointerCapture(e.pointerId);
            } catch (err) {}

            const rect = overlay.getBoundingClientRect();
            startX = e.clientX;
            startY = e.clientY;
            initialLeft = rect.left;
            initialTop = rect.top;

            overlay.style.left = `${initialLeft}px`;
            overlay.style.top = `${initialTop}px`;
            overlay.style.right = 'auto';
            overlay.style.bottom = 'auto';
        });

        header.addEventListener('pointermove', function(e) {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            let newLeft = initialLeft + dx;
            let newTop = initialTop + dy;

            const maxLeft = window.innerWidth - overlay.offsetWidth;
            const maxTop = window.innerHeight - overlay.offsetHeight;
            newLeft = Math.max(0, Math.min(newLeft, maxLeft));
            newTop = Math.max(0, Math.min(newTop, maxTop));

            overlay.style.left = `${newLeft}px`;
            overlay.style.top = `${newTop}px`;
        });

        const stopDrag = function(e) {
            if (isDragging) {
                isDragging = false;
                try {
                    const rect = overlay.getBoundingClientRect();
                    localStorage.setItem('mg_video_overlay_pos', JSON.stringify({
                        left: rect.left,
                        top: rect.top
                    }));
                } catch (err) {}
            }
        };

        header.addEventListener('pointerup', stopDrag);
        header.addEventListener('pointercancel', stopDrag);

        const btnMin = document.getElementById('btn-minimize-video-overlay');
        if (btnMin) {
            btnMin.addEventListener('click', function(e) {
                e.stopPropagation();
                overlay.classList.toggle('minimized');
                btnMin.textContent = overlay.classList.contains('minimized') ? '□' : '_';
            });
        }

        const btnClose = document.getElementById('btn-close-video-overlay');
        if (btnClose) {
            btnClose.addEventListener('click', function(e) {
                e.stopPropagation();
                if (state.inVideo) {
                    toggleVideo();
                }
            });
        }
    }

    function initUI() {
        const btnVoice = document.getElementById('btn-voice-toggle');
        const btnVideo = document.getElementById('btn-video-toggle');

        if (btnVoice) {
            btnVoice.addEventListener('click', function(e) {
                if (e) {
                    e.stopPropagation();
                    e.preventDefault();
                }
                toggleVoice();
            });
        }

        if (btnVideo) {
            btnVideo.addEventListener('click', function(e) {
                if (e) {
                    e.stopPropagation();
                    e.preventDefault();
                }
                toggleVideo();
            });
        }

        initOverlayDrag();
        updateControlUI();
    }

    // Existing API Compatibility Wrapper
    window.VoiceChat = {
        enable: toggleVoice,
        disable: function() {
            if (state.inVoice) toggleVoice();
        },
        setMuted: function(muted) {
            const track = state.localStream ? state.localStream.getAudioTracks()[0] : null;
            if (track) {
                track.enabled = !muted;
                state.micOn = track.enabled;
                updateControlUI();
            }
        },
        isEnabled: function() {
            return state.inVoice;
        },
        isMuted: function() {
            return !state.micOn;
        },
        toggleVoice: toggleVoice,
        toggleVideo: toggleVideo,
        initSocketListeners: initSocketListeners,
        initUI: initUI
    };

    document.addEventListener('DOMContentLoaded', function() {
        initUI();
    });

})();
