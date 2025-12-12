// js/backend-integration.js

// ▼▼▼ この3行を、ファイルパスだけをインポートする形に修正します ▼▼▼
// これにより、グローバルに 'firebase' オブジェクトが使えるようになります。
import 'https://www.gstatic.com/firebasejs/9.6.10/firebase-app-compat.js';
import 'https://www.gstatic.com/firebasejs/9.6.10/firebase-auth-compat.js';
import 'https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore-compat.js';


// =======================================================
//                Cloudinaryの設定
// =======================================================
const CLOUDINARY_CLOUD_NAME = "dn4kc08xj"; // ★自分のCloud Nameに書き換える
const CLOUDINARY_UPLOAD_PRESET = "ml_default"; // ★自分で作ったプリセット名に書き換える

const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`;


// =======================================================
//                Firebaseの設定
// =======================================================
  const firebaseConfig = {
    apiKey: "AIzaSyAlcK64wmymUb6eD48LaMfURCxo5XidrAQ",
    authDomain: "soundground-2202e.firebaseapp.com",
    projectId: "soundground-2202e",
    storageBucket: "soundground-2202e.firebasestorage.app",
    messagingSenderId: "413694208941",
    appId: "1:413694208941:web:36708e9dc02b6530674f24"
  };


// ▼▼▼ ここから下の行を、プレーンな `firebase` を使うように修正します ▼▼▼
// (この時点で 'firebase' はグローバルに利用可能になっています)
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
const provider = new firebase.auth.GoogleAuthProvider();


// (↓以降の関数は変更なし)
/** ユーザーのログイン状態を監視する */
export function onAuthStateChangedHandler(callback) {
    auth.onAuthStateChanged(callback);
}

/** Googleでログイン */
export function signInWithGoogle() {
    return auth.signInWithPopup(provider);
}

/** ログアウト */
export function signOutUser() {
    return auth.signOut();
}

/**
 * サンプルファイルをCloudinaryにアップロードする
 * @param {File} file アップロードするファイル
 * @returns {Promise<{downloadURL: string, fileName: string}>}
 */
export async function uploadSample(file) {
    const fileName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    const response = await fetch(CLOUDINARY_URL, {
        method: 'POST',
        body: formData
    });
    
    if (!response.ok) {
        throw new Error('Cloudinaryへのアップロードに失敗しました。');
    }

    const data = await response.json();
    return { downloadURL: data.secure_url, fileName };
}

/**
 * プリセットをFirestoreに保存する
 * @param {string} userId ユーザーID
 * @param {string} presetName プリセット名
 * @param {object} presetData 保存するデータ
 */
export function savePreset(userId, presetName, presetData) {
    if (!userId || !presetName) return Promise.reject("ユーザーIDとプリセット名は必須です。");
    return db.collection('users').doc(userId).collection('presets').doc(presetName).set(presetData);
}

/**
 * ユーザーのプリセットをリアルタイムで購読する
 * @param {string} userId ユーザーID
 * @param {function} callback プリセットリストが更新されたときに呼ばれる関数
 * @returns {function} 購読を解除する関数
 */
export function subscribeToPresets(userId, callback) {
    const presetsRef = db.collection('users').doc(userId).collection('presets');
    return presetsRef.onSnapshot(snapshot => {
        const presets = [];
        snapshot.forEach(doc => {
            presets.push({ id: doc.id, ...doc.data() });
        });
        callback(presets);
    });
}

/**
 * プリセットをFirestoreから削除する
 * @param {string} userId ユーザーID
 * @param {string} presetName 削除するプリセット名
 */
export function deletePreset(userId, presetName) {
    return db.collection('users').doc(userId).collection('presets').doc(presetName).delete();
}

/**
 * 録音ファイル(Blob)をCloudinaryにアップロードする
 * @param {Blob} blob 録音データ
 * @param {string} fileName ファイル名
 * @returns {Promise<string>} アップロードされたファイルのURL
 */
export async function uploadRecording(blob, fileName) {
    // BlobをFileオブジェクトに変換
    const file = new File([blob], fileName, { type: blob.type });
    // 既存のサンプルアップロード関数を賢く再利用します
    const result = await uploadSample(file); 
    return result.downloadURL;
}

/**
 * 録音情報をFirestoreに保存する
 * @param {string} userId ユーザーID
 * @param {string} recordingName 録音名
 * @param {object} recordingData 保存するデータ { url: "...", createdAt: ... }
 */
export function saveRecording(userId, recordingName, recordingData) {
    return db.collection('users').doc(userId).collection('recordings').doc(recordingName).set(recordingData);
}

/**
 * ユーザーの録音リストをリアルタイムで購読する
 * @param {string} userId ユーザーID
 * @param {function} callback 録音リストが更新されたときに呼ばれる関数
 * @returns {function} 購読を解除する関数
 */
export function subscribeToRecordings(userId, callback) {
    const recordingsRef = db.collection('users').doc(userId).collection('recordings').orderBy('createdAt', 'desc');
    return recordingsRef.onSnapshot(snapshot => {
        const recordings = [];
        snapshot.forEach(doc => {
            recordings.push({ id: doc.id, ...doc.data() });
        });
        callback(recordings);
    });
}

/**
 * 録音をFirestoreから削除する
 * @param {string} userId ユーザーID
 * @param {string} recordingName 削除する録音名
 */
export function deleteRecording(userId, recordingName) {
    return db.collection('users').doc(userId).collection('recordings').doc(recordingName).delete();
}
/**
 * (Optional) Save a user score to Firestore
 * @param {string} userId Firebase auth uid
 * @param {{ score: number, level: number, livesLeft: number, maxCombo: number }} scoreData
 */
export function saveScore(userId, scoreData) {
    if (!userId) return Promise.reject("User ID is required.");

    return db
        .collection('users')
        .doc(userId)
        .collection('scores')
        .add({
            ...scoreData,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
}
