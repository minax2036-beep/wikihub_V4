"use strict";
(() => {
const DB_NAME = "WikiHubDB_V4";
const DB_VERSION = 2;
const STORE_NAMES = ["groups", "wikis", "articles", "articleBlocks", "images", "videos", "audios"];
const MEDIA_STORES = new Set(["images", "videos", "audios"]);
const FORMAT = "WikiHubBAU";
const FORMAT_VERSION = 2;
const createButton = document.getElementById("createBackupButton");
const restoreFile = document.getElementById("restoreFile");
const restoreButton = document.getElementById("restoreButton");
const selectedFile = document.getElementById("selectedFile");
const status = document.getElementById("backupStatus");
const counts = document.getElementById("dataCounts");
let selectedBackup = null;

function setStatus(message, type = "") {
  status.textContent = message;
  status.className = "backup-status" + (type ? " " + type : "");
}
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("データベースを開けません。"));
    request.onblocked = () => reject(new Error("別のWikiHubタブを閉じてから再試行してください。"));
  });
}
function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("データ読み込みに失敗しました。"));
  });
}
function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error("データベース処理に失敗しました。"));
    transaction.onabort = () => reject(transaction.error || new Error("データベース処理が中止されました。"));
  });
}
function crc32(bytes) {
  let crc = -1;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
  }
  return (crc ^ -1) >>> 0;
}
function write16(view, offset, value) { view.setUint16(offset, value, true); }
function write32(view, offset, value) { view.setUint32(offset, value >>> 0, true); }
function read16(view, offset) { return view.getUint16(offset, true); }
function read32(view, offset) { return view.getUint32(offset, true); }
function zipDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}
async function compressRaw(bytes) {
  if (typeof CompressionStream !== "function") return { data: bytes, method: 0 };
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    return { data: new Uint8Array(await new Response(stream).arrayBuffer()), method: 8 };
  } catch (error) {
    console.warn("DEFLATE圧縮を利用できないため、無圧縮で保存します。", error);
    return { data: bytes, method: 0 };
  }
}
async function decompressRaw(bytes) {
  if (typeof DecompressionStream !== "function") throw new Error("このブラウザはZIPのDEFLATE展開に対応していません。Chrome/Chromiumを更新してください。");
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
function makeZip(entries) {
  if (entries.length > 65535) throw new Error("ファイル数がZIP形式の上限を超えています。");
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  const stamp = zipDateTime();
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = entry.data;
    if (name.length > 65535 || data.length > 0xFFFFFFFF || localOffset > 0xFFFFFFFF) {
      throw new Error("ZIP形式のサイズ上限を超えています。");
    }
    const method = entry.method || 0;
    const crc = crc32(entry.rawData || data);
    const rawSize = (entry.rawData || data).length;
    const local = new Uint8Array(30 + name.length + data.length);
    const lv = new DataView(local.buffer);
    write32(lv, 0, 0x04034B50); write16(lv, 4, 20); write16(lv, 6, 0x0800);
    write16(lv, 8, method); write16(lv, 10, stamp.time); write16(lv, 12, stamp.date);
    write32(lv, 14, crc); write32(lv, 18, data.length); write32(lv, 22, rawSize);
    write16(lv, 26, name.length); write16(lv, 28, 0);
    local.set(name, 30); local.set(data, 30 + name.length);
    localParts.push(local);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    write32(cv, 0, 0x02014B50); write16(cv, 4, 20); write16(cv, 6, 20);
    write16(cv, 8, 0x0800); write16(cv, 10, method);
    write16(cv, 12, stamp.time); write16(cv, 14, stamp.date);
    write32(cv, 16, crc); write32(cv, 20, data.length); write32(cv, 24, rawSize);
    write16(cv, 28, name.length); write16(cv, 30, 0); write16(cv, 32, 0);
    write16(cv, 34, 0); write16(cv, 36, 0); write32(cv, 38, 0);
    write32(cv, 42, localOffset); central.set(name, 46);
    centralParts.push(central);
    localOffset += local.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  if (localOffset + centralSize > 0xFFFFFFFF) throw new Error("バックアップがZIP32の上限（約4GB）を超えています。");
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  write32(ev, 0, 0x06054B50); write16(ev, 4, 0); write16(ev, 6, 0);
  write16(ev, 8, entries.length); write16(ev, 10, entries.length);
  write32(ev, 12, centralSize); write32(ev, 16, localOffset); write16(ev, 20, 0);
  return new Blob([...localParts, ...centralParts, end], { type: "application/zip" });
}
async function readZip(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  const min = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= min; i--) {
    if (read32(view, i) === 0x06054B50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("ZIPの終了情報が見つかりません。");
  if (read16(view, eocd + 4) !== 0 || read16(view, eocd + 6) !== 0) throw new Error("複数ディスク形式のZIPには対応していません。");
  const count = read16(view, eocd + 10);
  const centralSize = read32(view, eocd + 12);
  const centralOffset = read32(view, eocd + 16);
  if (count !== read16(view, eocd + 8) || centralOffset + centralSize > eocd) throw new Error("ZIPの目録が不正です。");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const files = new Map();
  let offset = centralOffset;
  for (let i = 0; i < count; i++) {
    if (offset + 46 > bytes.length || read32(view, offset) !== 0x02014B50) throw new Error("ZIPのファイル目録が壊れています。");
    const flags = read16(view, offset + 8);
    const method = read16(view, offset + 10);
    const crc = read32(view, offset + 16);
    const compressedSize = read32(view, offset + 20);
    const rawSize = read32(view, offset + 24);
    const nameLength = read16(view, offset + 28);
    const extraLength = read16(view, offset + 30);
    const commentLength = read16(view, offset + 32);
    const localOffset = read32(view, offset + 42);
    const nameEnd = offset + 46 + nameLength;
    const next = nameEnd + extraLength + commentLength;
    if (next > bytes.length) throw new Error("ZIPの目録サイズが不正です。");
    if (flags & 1) throw new Error("暗号化されたZIPには対応していません。");
    if (!(flags & 0x0800)) throw new Error("UTF-8形式ではないZIPファイル名には対応していません。");
    if (method !== 0 && method !== 8) throw new Error("未対応の圧縮方式です。");
    const name = decoder.decode(bytes.subarray(offset + 46, nameEnd));
    if (!name || name.startsWith("/") || name.includes("\\") || name.split("/").some(part => part === ".." || part === ".")) throw new Error("不正なファイルパスが含まれています。");
    if (files.has(name)) throw new Error("ZIP内に重複したファイル名があります: " + name);
    if (localOffset + 30 > bytes.length || read32(view, localOffset) !== 0x04034B50) throw new Error("ZIPのファイル本体が壊れています。");
    const localNameLength = read16(view, localOffset + 26);
    const localExtraLength = read16(view, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.length) throw new Error("ZIPのファイルサイズが不正です。");
    const compressed = bytes.subarray(dataStart, dataEnd);
    let data = method === 0 ? compressed.slice() : await decompressRaw(compressed);
    if (data.length !== rawSize || crc32(data) !== crc) throw new Error("ZIP内部のCRCまたはサイズ検証に失敗しました: " + name);
    files.set(name, data);
    offset = next;
  }
  if (offset !== centralOffset + centralSize) throw new Error("ZIPの目録サイズが一致しません。");
  return files;
}
async function sha256(bytes) {
  if (!crypto.subtle) throw new Error("SHA-256を利用できません。HTTPSのWikiHubページから実行してください。");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
}
function hexToBytes(hex) {
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) throw new Error("SHA-256の記録形式が不正です。");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}
async function loadCounts() {
  const db = await openDatabase();
  try {
    const tx = db.transaction(STORE_NAMES, "readonly");
    const values = await Promise.all(STORE_NAMES.map(name => requestResult(tx.objectStore(name).count())));
    counts.replaceChildren();
    for (const [label, value] of [["グループ", values[0]], ["Wiki", values[1]], ["記事", values[2]], ["メディア", values[4] + values[5] + values[6]]]) {
      const box = document.createElement("div");
      const strong = document.createElement("strong");
      const span = document.createElement("span");
      strong.textContent = String(value); span.textContent = label; box.append(strong, span); counts.append(box);
    }
  } finally { db.close(); }
}
async function createBackup() {
  createButton.disabled = true;
  restoreButton.disabled = true;
  setStatus("データを読み込んでいます...");
  let db;
  try {
    db = await openDatabase();
    const tx = db.transaction(STORE_NAMES, "readonly");
    const rawStores = await Promise.all(STORE_NAMES.map(name => requestResult(tx.objectStore(name).getAll())));
    const entries = [];
    const storeData = {};
    const fileRecords = [];
    for (let index = 0; index < STORE_NAMES.length; index++) {
      const name = STORE_NAMES[index];
      storeData[name] = [];
      for (let recordIndex = 0; recordIndex < rawStores[index].length; recordIndex++) {
        const original = rawStores[index][recordIndex];
        const record = { ...original };
        if (MEDIA_STORES.has(name)) {
          if (!(record.blob instanceof Blob)) throw new Error(name + " にBlobではないメディアデータがあります。");
          const path = "media/" + name + "/" + String(recordIndex + 1).padStart(6, "0") + ".bin";
          const data = new Uint8Array(await record.blob.arrayBuffer());
          const hash = await sha256(data);
          entries.push({ name: path, data, method: 0 });
          fileRecords.push({ path, size: data.length, sha256: hash });
          record.backupMediaPath = path;
          delete record.blob;
        }
        storeData[name].push(record);
      }
    }
    setStatus("データベース情報をまとめています...");
    const databaseBytes = new TextEncoder().encode(JSON.stringify({
      format: "WikiHubDatabase",
      version: 1,
      database: DB_NAME,
      stores: storeData
    }));
    const databaseHash = await sha256(databaseBytes);
    fileRecords.unshift({ path: "database.json", size: databaseBytes.length, sha256: databaseHash });
    const manifest = {
      format: FORMAT,
      version: FORMAT_VERSION,
      database: DB_NAME,
      createdAt: new Date().toISOString(),
      hashAlgorithm: "SHA-256",
      mediaEncoding: "raw-binary",
      files: fileRecords
    };
    const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
    const manifestHash = await sha256(manifestBytes);
    const checksumLines = [
      manifestHash + "  manifest.json",
      ...fileRecords.map(file => file.sha256 + "  " + file.path)
    ];
    const checksumBytes = new TextEncoder().encode(checksumLines.join("\n") + "\n");
    const dbCompressed = await compressRaw(databaseBytes);
    const manifestCompressed = await compressRaw(manifestBytes);
    const checksumCompressed = await compressRaw(checksumBytes);
    entries.unshift({ name: "database.json", data: dbCompressed.data, rawData: databaseBytes, method: dbCompressed.method });
    entries.push({ name: "manifest.json", data: manifestCompressed.data, rawData: manifestBytes, method: manifestCompressed.method });
    entries.push({ name: "checksums.sha256", data: checksumCompressed.data, rawData: checksumBytes, method: checksumCompressed.method });
    setStatus("ZIPファイルを組み立てています...");
    const archive = makeZip(entries);
    const url = URL.createObjectURL(archive);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    link.href = url; link.download = "wikihub-backup-" + stamp + ".bau";
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    setStatus("バックアップを作成しました。SHA-256情報も保存済みです。", "success");
  } catch (error) {
    console.error(error);
    setStatus("バックアップに失敗しました: " + error.message, "error");
  } finally {
    if (db) db.close();
    createButton.disabled = false;
    loadCounts().catch(console.error);
  }
}
function parseChecksums(text) {
  const result = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = line.match(/^([0-9a-f]{64})  (.+)$/i);
    if (!match) throw new Error("checksums.sha256 の形式が不正です。");
    if (result.has(match[2])) throw new Error("SHA-256一覧に重複があります。");
    result.set(match[2], match[1].toLowerCase());
  }
  return result;
}
async function validateArchive(file) {
  const files = await readZip(file);
  const required = ["manifest.json", "database.json", "checksums.sha256"];
  for (const name of required) if (!files.has(name)) throw new Error("必要なファイルがありません: " + name);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const manifest = JSON.parse(decoder.decode(files.get("manifest.json")));
  if (!manifest || manifest.format !== FORMAT || manifest.version !== FORMAT_VERSION || manifest.database !== DB_NAME || manifest.hashAlgorithm !== "SHA-256" || !Array.isArray(manifest.files)) {
    throw new Error("WikiHub .bauバックアップではないか、バージョンが対応していません。");
  }
  const checksums = parseChecksums(decoder.decode(files.get("checksums.sha256")));
  const expectedPaths = new Set(["manifest.json", "checksums.sha256"]);
  for (const item of manifest.files) {
    if (!item || typeof item.path !== "string" || !Number.isSafeInteger(item.size) || item.size < 0 || !/^[0-9a-f]{64}$/i.test(item.sha256)) throw new Error("manifest.json のファイル情報が不正です。");
    if (item.path.startsWith("/") || item.path.includes("\\") || item.path.split("/").some(part => part === ".." || part === ".")) throw new Error("manifestに不正なパスがあります。");
    if (expectedPaths.has(item.path)) throw new Error("manifestに重複または予約済みのパスがあります。");
    expectedPaths.add(item.path);
  }
  if (files.size !== expectedPaths.size) throw new Error("ZIP内に未登録のファイル、または不足ファイルがあります。");
  for (const path of expectedPaths) if (!files.has(path)) throw new Error("ZIP内にファイルがありません: " + path);
  if (checksums.size !== manifest.files.length + 1 || !checksums.has("manifest.json")) throw new Error("SHA-256一覧とmanifestの内容が一致しません。");
  for (const path of expectedPaths) {
    if (path === "checksums.sha256") continue;
    const data = files.get(path);
    const expectedHash = checksums.get(path);
    if (!expectedHash) throw new Error("SHA-256が登録されていません: " + path);
    const actualHash = await sha256(data);
    if (actualHash !== expectedHash) throw new Error("SHA-256検証に失敗しました: " + path);
  }
  for (const item of manifest.files) {
    const data = files.get(item.path);
    if (data.length !== item.size || await sha256(data) !== item.sha256.toLowerCase()) throw new Error("ファイルの整合性検証に失敗しました: " + item.path);
  }
  const database = JSON.parse(decoder.decode(files.get("database.json")));
  if (!database || database.format !== "WikiHubDatabase" || database.version !== 1 || database.database !== DB_NAME || !database.stores) throw new Error("database.json の形式が不正です。");
  for (const name of STORE_NAMES) if (!Array.isArray(database.stores[name])) throw new Error("データストアがありません: " + name);
  const mediaPaths = new Set();
  for (const name of MEDIA_STORES) {
    for (const record of database.stores[name]) {
      if (!record || typeof record.backupMediaPath !== "string" || !files.has(record.backupMediaPath)) throw new Error(name + " のメディア参照が不正です。");
      if (!manifest.files.some(item => item.path === record.backupMediaPath)) throw new Error("メディアがmanifestに登録されていません。");
      if (mediaPaths.has(record.backupMediaPath)) throw new Error("複数のレコードが同じメディアを参照しています。");
      mediaPaths.add(record.backupMediaPath);
    }
  }
  const manifestMediaPaths = new Set(manifest.files.filter(item => item.path.startsWith("media/")).map(item => item.path));
  if (mediaPaths.size !== manifestMediaPaths.size) throw new Error("未使用または不足しているメディアファイルがあります。");
  return { files, database, manifest };
}
async function restoreBackup() {
  if (!selectedBackup) return;
  if (!window.confirm("現在のWikiHubデータをすべて置き換えて、この .bau バックアップを復元します。\n\n復元前のデータは自動保存されません。本当に続行しますか？")) return;
  restoreButton.disabled = true;
  createButton.disabled = true;
  setStatus("復元データを準備しています...");
  let db;
  try {
    const prepared = {};
    for (const name of STORE_NAMES) {
      prepared[name] = selectedBackup.database.stores[name].map(record => {
        const copy = { ...record };
        if (MEDIA_STORES.has(name)) {
          const path = copy.backupMediaPath;
          const item = selectedBackup.manifest.files.find(file => file.path === path);
          if (!item) throw new Error("メディア情報が見つかりません: " + path);
          copy.blob = new Blob([selectedBackup.files.get(path)], { type: copy.mimeType || "" });
          delete copy.backupMediaPath;
        }
        return copy;
      });
    }
    db = await openDatabase();
    const tx = db.transaction(STORE_NAMES, "readwrite");
    const done = transactionDone(tx);
    for (const name of STORE_NAMES) {
      const store = tx.objectStore(name);
      store.clear();
      for (const record of prepared[name]) store.put(record);
    }
    await done;
    selectedBackup = null;
    restoreFile.value = "";
    selectedFile.textContent = "ファイルが選択されていません";
    restoreButton.disabled = true;
    setStatus("復元が完了しました。ホームへ戻ると復元したデータを確認できます。", "success");
  } catch (error) {
    console.error(error);
    setStatus("復元に失敗しました: " + error.message, "error");
  } finally {
    if (db) db.close();
    createButton.disabled = false;
    if (selectedBackup) restoreButton.disabled = false;
    loadCounts().catch(console.error);
  }
}
createButton.addEventListener("click", createBackup);
restoreButton.addEventListener("click", restoreBackup);
restoreFile.addEventListener("change", async () => {
  selectedBackup = null;
  restoreButton.disabled = true;
  const file = restoreFile.files && restoreFile.files[0];
  if (!file) {
    selectedFile.textContent = "ファイルが選択されていません";
    return;
  }
  selectedFile.textContent = file.name + " (" + (file.size / 1024 / 1024).toFixed(2) + " MB)";
  setStatus("ZIP構造とSHA-256を検証しています...");
  try {
    if (!file.name.toLowerCase().endsWith(".bau")) throw new Error("拡張子が .bau のファイルを選択してください。");
    selectedBackup = await validateArchive(file);
    let totalRecords = 0;
    for (const name of STORE_NAMES) totalRecords += selectedBackup.database.stores[name].length;
    setStatus("検証成功。合計 " + totalRecords + " 件のデータを復元できます。", "success");
    restoreButton.disabled = false;
  } catch (error) {
    selectedBackup = null;
    selectedFile.textContent = file.name + "（読み込み不可）";
    setStatus("このファイルは復元できません: " + error.message, "error");
  }
});
loadCounts().catch(error => setStatus("データ数を読み込めません: " + error.message, "error"));
})();