import { freqs, chromaticScale } from './constants.js';

// 各スケール（音階）の和音の種類
// Maj = メジャー, min = マイナー, dim = ディミニッシュ
const majorScaleChords = ['Maj', 'min', 'min', 'Maj', 'Maj', 'min', 'dim'];
const minorScaleChords = ['min', 'dim', 'Maj', 'min', 'min', 'Maj', 'Maj'];

/**
 * 鍵盤で押されたノートが、指定されたキー（主音）から
 * 何番目の音か（音程）を半音単位で計算します。
 */
function getDegree(rootNoteName, keyName) {
    const baseRoot = rootNoteName.replace(/低い|高い/g, '');
    const baseKey = keyName.replace(/低い|高い/g, '');

    const rootIndex = chromaticScale.indexOf(baseRoot);
    const keyIndex = chromaticScale.indexOf(baseKey);

    if (rootIndex === -1 || keyIndex === -1) return -1;

    let degree = rootIndex - keyIndex;
    if (degree < 0) {
        degree += 12;
    }
    return degree; // 0 (主音) から 11
}

/**
 * 3和音（トライアド）を構成する3つの周波数を取得します
 * (中音域〜高音域で使用)
 */
function getTriadFrequencies(rootFreq, quality) {
    const frequencies = [rootFreq];
    
    const majorThird = rootFreq * Math.pow(2, 4 / 12);
    const minorThird = rootFreq * Math.pow(2, 3 / 12);
    const perfectFifth = rootFreq * Math.pow(2, 7 / 12);
    const diminishedFifth = rootFreq * Math.pow(2, 6 / 12);

    if (quality === 'Maj') {
        frequencies.push(majorThird, perfectFifth);
    } else if (quality === 'min') {
        frequencies.push(minorThird, perfectFifth);
    } else if (quality === 'dim') {
        frequencies.push(minorThird, diminishedFifth);
    } else {
        return [rootFreq];
    }
    
    return frequencies;
}

/**
 * 押されたキーと現在の設定に基づき、再生すべきコードの周波数リストを返します。
 */
export function getChordFrequencies(rootNoteName, keyName, mode) {
    const rootFreq = freqs[rootNoteName];
    if (!rootFreq) return [];

    // 1. スケール（音階）を取得
    const intervals = (mode === 'Major') 
        ? [0, 2, 4, 5, 7, 9, 11] // メジャースケール
        : [0, 2, 3, 5, 7, 8, 10]; // ナチュラルマイナースケール
    
    // 2. 押された音が、そのスケールに含まれているか判定
    const degree = getDegree(rootNoteName, keyName);
    
    if (!intervals.includes(degree)) {
        // スケールから外れた音（#やb）が押された場合
        return [rootFreq]; // 単音を鳴らす
    }

    // 3. 押された音がスケール内の何番目の音かを取得
    const scaleDegreeIndex = intervals.indexOf(degree); // 0 (I) から 6 (VII)
    
    // 4. その番目の音がメジャーコードかマイナーコードかを取得
    const chordQuality = (mode === 'Major')
        ? majorScaleChords[scaleDegreeIndex]
        : minorScaleChords[scaleDegreeIndex];
        
    // --- ▼▼▼ 濁り防止の修正 (Open Voicing) ▼▼▼ ---
    
    // 5. 低音域 (「低い」) の場合、音を広げる
    if (rootNoteName.startsWith('低い')) {
        // 低音域: (1度, 5度, 10度)
        const frequencies = [rootFreq];
        
        // 5度 (完全5度) を追加
        // (dimコードの場合、減5度だが、低音域では濁るので完全5度で代用)
        frequencies.push(rootFreq * Math.pow(2, 7 / 12)); 
        
        // 10度 (3度 + 1オクターブ) を追加
        if (chordQuality === 'Maj') {
            // 長10度 (12 + 4 = 16半音)
            const majorTenth = rootFreq * Math.pow(2, 16 / 12);
            frequencies.push(majorTenth);
        } else { // 'min' または 'dim'
            // 短10度 (12 + 3 = 15半音)
            const minorTenth = rootFreq * Math.pow(2, 15 / 12);
            frequencies.push(minorTenth);
        }
        return frequencies;
        
    } else {
        // 6. 中音域・高音域は、通常の3和音（密集和音）を鳴らす
        return getTriadFrequencies(rootFreq, chordQuality);
    }
    // --- ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲ ---
}