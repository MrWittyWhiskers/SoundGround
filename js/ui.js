import { noteOrder, noteToKeyMap, freqs, chromaticScale } from './constants.js';
import * as store from './store.js';
// import * as backend from './backend-integration.js'; // 👈 この行を削除します

// キーボードのHTMLを生成
export function createKeyboard() {
    const keyboard = document.getElementById("keyboard");
    const whiteKeyWidth = 45;
    let whiteKeyCount = 0;

    noteOrder.forEach(note => {
        const key = document.createElement("div");
        const isBlack = note.includes('#');
        key.className = isBlack ? 'key black' : 'key white';
        const keyMapping = noteToKeyMap[note] || '';
        key.innerHTML = `<span>${note.replace('低い', '低').replace('高い', '高').replace('#', '♯')}</span><span class="key-mapping">${keyMapping.toUpperCase()}</span>`;
        key.dataset.note = note;
        if (isBlack) { key.style.left = `${((whiteKeyCount - 1) * whiteKeyWidth) + (whiteKeyWidth / 2)}px`; }
        else { whiteKeyCount++; }
        keyboard.appendChild(key);
    });
}

// サンプルパッドのHTMLを生成
export function createPads() {
    const padsContainer = document.getElementById('pads-container');
    for (let i = 0; i < 9; i++) {
        const wrapper = document.createElement('div');
        wrapper.classList.add('pad-wrapper');

        const pad = document.createElement('button');
        pad.classList.add('sample-pad');
        pad.textContent = i + 1;
        pad.dataset.index = i;

        const padName = document.createElement('span');
        padName.classList.add('pad-name');
        padName.id = `pad-name-${i}`;
        padName.textContent = '...';

        padName.addEventListener('click', (e) => {
            e.stopPropagation();
            const state = store.getPadState(i);
            if (!state || !state.buffer) return;
            const newName = prompt(`パッド ${i + 1} の名前を変更:`, state.name);
            if (newName !== null) {
                store.setPadState(i, { ...state, name: newName.trim() });
                padName.textContent = newName.trim() || `(パッド ${i + 1})`;
            }
        });
        pad.appendChild(padName);

        wrapper.appendChild(pad);

        const label = document.createElement('label');
        label.classList.add('pad-invert-toggle');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `pad-invert-${i}`;
        checkbox.dataset.index = i;
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(' 位相反転 (Ø)'));
        wrapper.appendChild(label);

        padsContainer.appendChild(wrapper);
    }
}

// パッドのUI（ロード状態、名前）を更新
export function updatePadsUI() {
    const padStates = store.getPadStates();
    const loadedCount = padStates.filter(s => s.buffer !== null).length;
    document.getElementById('pad-counter').textContent = `${loadedCount}/9`;

    document.querySelectorAll('.sample-pad').forEach((pad, i) => {
        const padNameEl = document.getElementById(`pad-name-${i}`);
        const state = padStates[i];

        if (state.buffer) {
            pad.classList.add('loaded');
            padNameEl.classList.add('editable');
            padNameEl.textContent = state.name || `(パッド ${i + 1})`;
        } else {
            pad.classList.remove('loaded');
            padNameEl.classList.remove('editable');
            padNameEl.textContent = '...';
            if (state) state.name = "";
        }
    });
}

// プリセットデータに基づいてパッドの状態とUIを更新する関数
/**
 * プリセットデータ（主に音源URLと名前）を store に適用し、UIを更新します。
 * 注意: この関数は AudioBuffer のデコードは行いません。デコードは drum-machine.js 側で行われます。
 * * @param {Array<{url: string, name: string}>} presetData - 9つのパッドに対応する音源情報
 */
export function setPadStatesFromPreset(presetData) {
    if (!Array.isArray(presetData) || presetData.length !== 9) {
        console.error("Invalid preset data received. Expected array of length 9.");
        return;
    }

    const newStates = presetData.map((data, i) => {
        // 現在のパッド状態を取得し、URLと名前を更新
        const currentState = store.getPadState(i) || { buffer: null, url: null, name: "", inverted: false };

        return {
            ...currentState,
            url: data.url,      // Cloudinaryなどの音源URL
            name: data.name || `Cat ${i + 1}`, // 名前
            buffer: null,       // URLが変わったのでBufferは一旦クリア (後で drum-machine がロードする)
            inverted: false     // 位相反転もリセット
        };
    });

    store.setPadStates(newStates); // store.jsに新しい状態を保存
    updatePadsUI(); // UIを更新して、名前とダウンロードボタンを表示
    
    // Note: AudioBufferのロードは、この関数を呼び出したapp.jsまたはdrum-machine.js側で
    // 別途呼び出す必要があります (例: drumMachine.loadSoundsFromUrls(presetData))。
}

// --- 認証状態に基づくUIの切り替え ---

export function showLoggedInUI(user) {
    document.getElementById('user-info').style.display = 'flex';
    document.getElementById('login-btn').style.display = 'none';
    document.getElementById('user-name').textContent = user.displayName;

    document.getElementById('preset-login-prompt').style.display = 'none';
    document.getElementById('preset-controls').style.display = 'block';
    document.getElementById('presets-list').style.display = 'block';
    document.getElementById('recordings-list-container').style.display = 'block';
}

export function showLoggedOutUI() {
    document.getElementById('user-info').style.display = 'none';
    document.getElementById('login-btn').style.display = 'block';
    document.getElementById('preset-login-prompt').style.display = 'block';
    document.getElementById('preset-controls').style.display = 'none';
    document.getElementById('presets-list').style.display = 'none';
    document.getElementById('presets-list').innerHTML = '';
    document.getElementById('recordings-list-container').style.display = 'none';
    document.getElementById('recordings-list').innerHTML = '';

    store.setPadStates(Array(9).fill(null).map(() => ({
        buffer: null, url: null, name: "", inverted: false
    })));
    updatePadsUI();
}

// --- リスト表示 ---

// ▼▼▼ displayRecordings を修正 ▼▼▼
export function displayRecordings(recordings, onDeleteRecording) { // 👈 コールバックを受け取る
    const recordingsList = document.getElementById('recordings-list');
    recordingsList.innerHTML = '';
    recordings.forEach(rec => {
        const li = document.createElement('li');
        const nameSpan = document.createElement('span');
        nameSpan.textContent = rec.id;
        li.appendChild(nameSpan);

        const controlsDiv = document.createElement('div');
        const playBtn = document.createElement('button');
        playBtn.textContent = '再生';
        playBtn.onclick = () => { new Audio(rec.url).play(); };
        controlsDiv.appendChild(playBtn);

        const downloadBtn = document.createElement('button');
        downloadBtn.textContent = 'ダウンロード';
        downloadBtn.onclick = async () => {
            downloadBtn.textContent = '準備中...';
            downloadBtn.disabled = true;
            try {
                const response = await fetch(rec.url);
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${rec.id}.wav`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } catch (error) {
                console.error('Download failed:', error);
                alert('ダウンロードに失敗しました。');
            } finally {
                downloadBtn.textContent = 'ダウンロード';
                downloadBtn.disabled = false;
            }
        };
        controlsDiv.appendChild(downloadBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '削除';
        deleteBtn.style.backgroundColor = '#f44336';
        deleteBtn.onclick = () => {
            if(confirm(`録音「${rec.id}」を削除しますか？`)) {
                onDeleteRecording(rec.id); // 👈 backend.delete... の代わりにコールバックを呼ぶ
            }
        };
        controlsDiv.appendChild(deleteBtn);
        li.appendChild(controlsDiv);
        recordingsList.appendChild(li);
    });
}

// ▼▼▼ displayPresets を修正 ▼▼▼
export function displayPresets(presets, applyPresetCallback, onDeletePreset, tab = 'my') {
    // tab が 'my' ならマイプリセット、'basic' なら基本プリセット
    const listId = tab === 'my' ? 'presets-list' : 'basic-presets-list';
    const presetsList = document.getElementById(listId);
    presetsList.innerHTML = '';

    presets.forEach(preset => {
        const li = document.createElement('li');
        li.textContent = preset.id;
        li.dataset.presetId = preset.id;

        // 基本プリセットは削除ボタン不要
        if (tab === 'my' && onDeletePreset) {
            const deleteBtn = document.createElement('span');
            deleteBtn.textContent = '✖';
            deleteBtn.className = 'delete-preset';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                if (confirm(`プリセット「${preset.id}」を削除しますか？`)) {
                    onDeletePreset(preset.id);
                }
            };
            li.appendChild(deleteBtn);
        }

        li.addEventListener('click', () => applyPresetCallback(preset));
        presetsList.appendChild(li);
    });
}


// --- ペンタトニック関連 ---

export function calculatePentatonicScale() {
    const currentKey = store.getCurrentKey();
    const rootIndex = chromaticScale.indexOf(currentKey);
    if (rootIndex === -1) {
        store.setActivePentatonicScale([...chromaticScale]);
        return;
    }
    const intervals = [0, 2, 4, 7, 9];
    const newScale = intervals.map(interval => chromaticScale[(rootIndex + interval) % 12]);
    store.setActivePentatonicScale(newScale);
}

export function isNoteInScale(noteName) {
    if (!store.isPentatonicMode()) return true;
    if (!noteName) return false;
    const baseNote = noteName.replace(/低い|高い/g, ''); 
    return store.getActivePentatonicScale().includes(baseNote);
}

export function updateKeyboardForPentatonic() {
    document.querySelectorAll('#keyboard .key').forEach(key => {
        if (isNoteInScale(key.dataset.note)) {
            key.classList.remove('disabled');
        } else {
            key.classList.add('disabled');
        }
    });
}

/**
 * プリセットタブの切り替え機能を初期化する
 */
export function initPresetTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTabId = btn.dataset.tab; // "my" か "basic"

            // 1. すべてのボタンから active を消し、押されたボタンに付ける
            document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // 2. すべてのコンテンツを隠し、対象のコンテンツだけ出す
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            
            const targetContent = document.getElementById(`tab-${targetTabId}`);
            if (targetContent) {
                targetContent.classList.add('active');
            }
            
            console.log(`UI: Switched to ${targetTabId} preset tab.`);
        });
    });
}

/**
 * 基本プリセットのリストを「基本プリセット」タブ内に描画する
 */
export function displayBasicPresetsList(presetData, onApplyCallback) {
    const basicListEl = document.getElementById('basic-presets-list');
    if (!basicListEl || !presetData) return;

    basicListEl.innerHTML = ''; // 一旦クリア

    const li = document.createElement('li');
    li.textContent = presetData.name || "😺 基本セット";
    li.style.cursor = "pointer";
    
    // クリックされたらそのプリセットを適用する
    li.addEventListener('click', () => {
        onApplyCallback(presetData);
    });

    basicListEl.appendChild(li);
    console.log("UI: Basic preset list updated.");
}