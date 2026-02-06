import * as backend from './backend-integration.js';
import * as store from './store.js';
import * as ui from './ui.js';

let unsubscribePresets = null;
let unsubscribeRecordings = null;

// --- プリセットのロード ---
export async function applyPreset(preset) {
    if (!preset || !preset.pads) return;

    const newPadStates = Array(9).fill(null).map(() => ({
        buffer: null, url: null, name: "", inverted: false
    }));

    const loadPromises = preset.pads.map(async (padData, i) => {
        if (padData && padData.url) {
            try {
                const response = await fetch(padData.url);
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await store.audioCtx.decodeAudioData(arrayBuffer);
                newPadStates[i] = {
                    buffer: audioBuffer,
                    url: padData.url,
                    name: padData.name || "",
                    inverted: padData.inverted || false
                };
                document.getElementById(`pad-invert-${i}`).checked = padData.inverted || false;
            } catch (error) {
                console.error(`プリセット音源の読み込みに失敗: ${padData.url}`, error);
                newPadStates[i] = { buffer: null, url: null, name: "(ロード失敗)", inverted: false };
            }
        }
    });

    await Promise.all(loadPromises);
    store.setPadStates(newPadStates);
    ui.updatePadsUI();
}
// 基本プリセットを読み込む関数
export async function loadBasicPreset(presetId) {
    try {
        const docRef = firebase.firestore().collection("presets").doc(presetId);
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
            console.warn(`Basic preset not found: ${presetId}`);
            return null;
        }

        const data = docSnap.data();

        return {
            id: presetId,
            name: data.name || presetId,
            pads: data.pads || []
        };

    } catch (err) {
        console.error("loadBasicPreset error:", err);
        return null;
    }
}


// ▼▼▼ ここからコールバック関数を定義 ▼▼▼
function handleDeleteRecording(recordingId) {
    const user = store.getCurrentUser();
    if (user) {
        backend.deleteRecording(user.uid, recordingId);
    }
}

function handleDeletePreset(presetId) {
    const user = store.getCurrentUser();
    if (user) {
        backend.deletePreset(user.uid, presetId);
    }
}
// ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

// プリセットのリスト表示（コールバックを渡す）
function updatePresetList(presets) {
    // 適用コールバックと削除コールバックの両方を渡す
    ui.displayPresets(presets, applyPreset, handleDeletePreset);
}

// --- プリセットの保存 ---
function gatherPadData() {
    return store.getPadStates().map((state, i) => ({
        url: state.url,
        name: state.name,
        inverted: document.getElementById(`pad-invert-${i}`).checked
    }));
}

// --- 初期化 ---
export function initBackendHandlers() {
    // 認証状態の監視
    backend.onAuthStateChangedHandler(user => {
        store.setCurrentUser(user);
        if (user) {
            ui.showLoggedInUI(user);
            
            // ▼▼▼ 購読処理を修正 ▼▼▼
            // 録音リストの購読（削除コールバックを渡す）
            if (unsubscribeRecordings) unsubscribeRecordings();
            unsubscribeRecordings = backend.subscribeToRecordings(user.uid, (recordings) => {
                ui.displayRecordings(recordings, handleDeleteRecording);
            });
            
            // プリセットリストの購読
            if (unsubscribePresets) unsubscribePresets();
            unsubscribePresets = backend.subscribeToPresets(user.uid, updatePresetList);
            // ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

        } else {
            ui.showLoggedOutUI();
            if (unsubscribeRecordings) unsubscribeRecordings();
            if (unsubscribePresets) unsubscribePresets();
        }
    });

    // --- イベントリスナー ---
    document.getElementById('login-btn').addEventListener('click', () => {
        backend.signInWithGoogle().catch(err => console.error(err));
    });

    document.getElementById('logout-btn').addEventListener('click', () => {
        backend.signOutUser().catch(err => console.error(err));
    });

    document.getElementById('save-preset-btn').addEventListener('click', () => {
        const name = document.getElementById('preset-name').value.trim();
        const currentUser = store.getCurrentUser();
        if (!currentUser) {
            alert("プリセットを保存するにはログインが必要です。"); return;
        }
        if (!name) {
            alert("プリセット名を入力してください。"); return;
        }
        const padData = gatherPadData();
        if (padData.every(p => !p.url)) {
            alert("保存するサンプルがありません。"); return;
        }
        backend.savePreset(currentUser.uid, name, { pads: padData })
            .then(() => {
                alert(`プリセット「${name}」を保存しました。`);
                document.getElementById('preset-name').value = '';
            })
            .catch(err => alert("プリセットの保存に失敗しました。"));
    });

    document.getElementById("upload").addEventListener("change", async (e) => {
        if (!store.getCurrentUser()) {
            alert("サンプルをアップロードするにはログインが必要です。");
            return;
        }
        const files = e.target.files;
        if (files.length === 0) return;

        for (const file of files) {
            let targetIndex = store.getPadStates().findIndex(s => s.buffer === null);
            if (targetIndex === -1) {
                const replaceSlot = prompt(`パッドは満員です (9/9)。\nどのパッド(1-9)の音源と入れ替えますか？`, '1');
                const index = parseInt(replaceSlot, 10) - 1;
                if (index >= 0 && index < 9) targetIndex = index;
                else { alert('無効な番号です。'); break; }
            }

            try {
                const { downloadURL, fileName } = await backend.uploadSample(file);
                const arrayBuffer = await file.arrayBuffer();
                const audioBuffer = await store.audioCtx.decodeAudioData(arrayBuffer);
                store.setPadState(targetIndex, {
                    buffer: audioBuffer,
                    url: downloadURL,
                    name: fileName,
                    inverted: false
                });
            } catch (error) {
                console.error("アップロードエラー:", error);
                alert(`ファイルのアップロードに失敗しました: ${file.name}`);
            }
        }
        ui.updatePadsUI();
        e.target.value = '';
    });
}