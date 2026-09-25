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
                    // Attach to existing peers
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
        const modal = document.getElementById('video-grid-modal');

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
            if (modal) modal.classList.remove('hidden');
            renderLocalVideo();

            // Attach video track to all existing peers
            for (const sid in state.peers) {
                const pc = state.peers[sid].pc;
                const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
                if (sender) {
                    await sender.replaceTrack(videoTrack);
                } else {
                    pc.addTrack(videoTrack, state.localStream);
                    // Renegotiate for new video track
                    try {
                        const offer = await pc.createOffer();
                        await pc.setLocalDescription(offer);
                        window.AppSocket.emit('video_signal', {
                            to: sid,
                            signal: { sdp: pc.localDescription },
                            room_code: window.currentRoomCode
                        });
                    } catch (e) {
                        console.error('[AVChat] Offer renegotiation error:', e);
                    }
                }
            }

            updateControlUI();
            if (window.AppSocket) {
                window.AppSocket.emit('video_join', { room_code: window.currentRoomCode });
            }
        } else {
            // Close video (disable video track, hide grid modal, return to voice-only)
            if (videoTrack) {
                videoTrack.enabled = false;
            }
            state.camOn = false;
            state.inVideo = false;
            if (modal) modal.classList.add('hidden');
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
            localBox.className = 'video-box';

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
            box.className = 'video-box';

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

        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:global.stun.twilio.com:3478' }
            ]
        });

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
            const remoteStream = event.streams[0] || new MediaStream([event.track]);
            addOrUpdateRemoteVideo(sid, remoteStream, name || (state.peers[sid] ? state.peers[sid].name : 'Peserta'));
        };

        if (initiator) {
            pc.onnegotiationneeded = async () => {
                try {
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    if (window.AppSocket) {
                        window.AppSocket.emit('voice_signal', {
                            to: sid,
                            signal: { sdp: pc.localDescription },
                            room_code: window.currentRoomCode
                        });
                    }
                } catch (e) {
                    console.error('[AVChat] negotiationneeded offer error:', e);
                }
            };
        }

        state.peers[sid] = { pc: pc, name: name || 'Peserta' };
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
                createPeer(data.sid, true, data.sender_name);
            }
        });

        window.AppSocket.on('voice_signal', async function(data) {
            if (!data || !data.from || !data.signal) return;

            let peerObj = state.peers[data.from];
            let pc = peerObj ? peerObj.pc : createPeer(data.from, false);

            try {
                if (data.signal.sdp) {
                    await pc.setRemoteDescription(new RTCSessionDescription(data.signal.sdp));
                    if (data.signal.sdp.type === 'offer') {
                        const answer = await pc.createAnswer();
                        await pc.setLocalDescription(answer);
                        window.AppSocket.emit('voice_signal', {
                            to: data.from,
                            signal: { sdp: pc.localDescription },
                            room_code: window.currentRoomCode
                        });
                    }
                }
                if (data.signal.candidate) {
                    await pc.addIceCandidate(new RTCIceCandidate(data.signal.candidate));
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
            }
        });
    }

    function initUI() {
        const btnVoice = document.getElementById('btn-voice-toggle');
        const btnVideo = document.getElementById('btn-video-toggle');
        const btnCloseVideo = document.getElementById('btn-close-video-grid');

        if (btnVoice) {
            btnVoice.addEventListener('click', toggleVoice);
        }

        if (btnVideo) {
            btnVideo.addEventListener('click', toggleVideo);
        }

        if (btnCloseVideo) {
            btnCloseVideo.addEventListener('click', function() {
                if (state.inVideo) {
                    toggleVideo();
                }
            });
        }

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
