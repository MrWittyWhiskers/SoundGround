import * as store from './store.js';
import * as backend from './backend-integration.js';

// --- 変数 ---
let mediaRecorder;
let audioChunks = [];
let recordedWavBlob = null; // WAV Blobを保持

// --- DOM要素 ---
const recordBtn = document.getElementById('record-btn');
const stopBtn = document.getElementById('stop-btn');
const recordingControls = document.getElementById('recording-controls');
const recordingPlayer = document.getElementById('recording-player');
const downloadBtn = document.getElementById('download-btn');
const recordingNameInput = document.getElementById('recording-name');
const saveRecordingBtn = document.getElementById('save-recording-btn');

// --- WAVエンコーダー ---
function encodeWAV(audioBuffer) {
    const numOfChan = audioBuffer.numberOfChannels;
    const length = audioBuffer.length * numOfChan * 2 + 44; // 16-bit PCM
    const buffer = new ArrayBuffer(length);
    const view = new DataView(buffer);
    const channels = [];
    let i, sample;
    let offset = 0;
    let pos = 0;

    const writeString = (view, offset, string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };

    // RIFF header
    writeString(view, pos, 'RIFF'); pos += 4;
    view.setUint32(pos, length - 8, true); pos += 4; // chunk size
    writeString(view, pos, 'WAVE'); pos += 4;
    // fmt chunk
    writeString(view, pos, 'fmt '); pos += 4;
    view.setUint32(pos, 16, true); pos += 4; // subchunk size (16 for PCM)
    view.setUint16(pos, 1, true); pos += 2;  // audio format 1=PCM
    view.setUint16(pos, numOfChan, true); pos += 2; // num channels
    view.setUint32(pos, audioBuffer.sampleRate, true); pos += 4; // sample rate
    view.setUint32(pos, audioBuffer.sampleRate * 2 * numOfChan, true); pos += 4; // byte rate
    view.setUint16(pos, numOfChan * 2, true); pos += 2; // block align
    view.setUint16(pos, 16, true); pos += 2; // bits per sample (16)
    // data chunk
    writeString(view, pos, 'data'); pos += 4;
    view.setUint32(pos, length - pos - 4, true); pos += 4; // subchunk size (data size)

    // Write PCM samples
    for (i = 0; i < audioBuffer.numberOfChannels; i++) {
        channels.push(audioBuffer.getChannelData(i));
    }
    offset = pos; // Start writing samples here
    for (i = 0; i < audioBuffer.length; i++) {
        for (let ch = 0; ch < numOfChan; ch++) {
            sample = Math.max(-1, Math.min(1, channels[ch][i])); // Clamp
            sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF; // Convert to 16-bit signed int
            view.setInt16(offset, sample, true);
            offset += 2;
        }
    }
    return new Blob([view], { type: 'audio/wav' });
}

// --- 初期化 ---
export function initRecorder() {
    try {
        mediaRecorder = new MediaRecorder(store.streamDestination.stream, { mimeType: 'audio/webm' });
    } catch(e) {
        console.warn("WebMはサポートされていません。audio/oggを試します。");
        mediaRecorder = new MediaRecorder(store.streamDestination.stream, { mimeType: 'audio/ogg; codecs=opus' });
    }

    mediaRecorder.ondataavailable = event => {
        audioChunks.push(event.data);
    };

    mediaRecorder.onstop = async () => {
        const recordedBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
        audioChunks = [];

        try {
            const arrayBuffer = await recordedBlob.arrayBuffer();
            const audioBuffer = await store.audioCtx.decodeAudioData(arrayBuffer);
            recordedWavBlob = encodeWAV(audioBuffer); // WAV Blobを保存
            
            const audioUrl = URL.createObjectURL(recordedWavBlob);
            recordingPlayer.src = audioUrl;
            recordingControls.style.display = 'block';

            const currentUser = store.getCurrentUser();
            if (!currentUser) {
                saveRecordingBtn.disabled = true;
                recordingNameInput.disabled = true;
                recordingNameInput.placeholder = "保存にはログインが必要です";
            } else {
                saveRecordingBtn.disabled = false;
                recordingNameInput.disabled = false;
                recordingNameInput.placeholder = "録音名を入力";
            }
        } catch (error) {
            console.error("録音データの処理に失敗しました:", error);
            alert("録音データの処理に失敗しました。");
            recordingControls.style.display = 'none';
        }

        recordBtn.classList.remove('recording');
        recordBtn.textContent = '🔴 録音';
        stopBtn.disabled = true;
    };

    // --- イベントリスナー ---
    recordBtn.addEventListener('click', () => {
        if (mediaRecorder.state === 'recording') return;
        audioChunks = [];
        recordedWavBlob = null;
        mediaRecorder.start();
        recordBtn.classList.add('recording');
        recordBtn.textContent = '🔴 録音中...';
        stopBtn.disabled = false;
        recordingControls.style.display = 'none';
    });

    stopBtn.addEventListener('click', () => {
        if (mediaRecorder.state !== 'recording') return;
        mediaRecorder.stop();
    });

    downloadBtn.addEventListener('click', () => {
        if (!recordedWavBlob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(recordedWavBlob);
        a.download = `synth-recording-${Date.now()}.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
    });

    saveRecordingBtn.addEventListener('click', async () => {
        const currentUser = store.getCurrentUser();
        if (!recordedWavBlob || !currentUser) return;
        const name = recordingNameInput.value.trim();
        if (!name) {
            alert("録音名を入力してください。");
            return;
        }
        saveRecordingBtn.textContent = '保存中...';
        saveRecordingBtn.disabled = true;
        try {
            const fileName = `${name}.wav`;
            const downloadURL = await backend.uploadRecording(recordedWavBlob, fileName);
            await backend.saveRecording(currentUser.uid, name, {
                url: downloadURL,
                createdAt: new Date()
            });
            alert(`「${name}」を保存しました！`);
            recordingNameInput.value = '';
        } catch (error) {
            console.error("録音の保存に失敗:", error);
            alert("録音の保存に失敗しました。");
        } finally {
            saveRecordingBtn.textContent = '☁️ クラウドに保存';
            saveRecordingBtn.disabled = false;
        }
    });
}