"use strict";

(() => {
    const DB_NAME = "WikiHubDB_V4";
    const DB_VERSION = 1;

    const STORES = {
        WIKIS: "wikis",
        ARTICLES: "articles",
        BLOCKS: "articleBlocks",
        IMAGES: "images",
        VIDEOS: "videos",
        AUDIOS: "audios"
    };

    let databasePromise = null;

    function createId(prefix = "item") {
        if (crypto.randomUUID) {
            return `${prefix}-${crypto.randomUUID()}`;
        }

        return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    function requestResult(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    function transactionDone(transaction) {
        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(
                transaction.error || new Error("Transaction failed.")
            );
            transaction.onabort = () => reject(
                transaction.error || new Error("Transaction aborted.")
            );
        });
    }

    function openDatabase() {
        if (databasePromise) {
            return databasePromise;
        }

        databasePromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                if (!db.objectStoreNames.contains(STORES.WIKIS)) {
                    const store = db.createObjectStore(STORES.WIKIS, {
                        keyPath: "id"
                    });

                    store.createIndex("updatedAt", "updatedAt");
                }

                if (!db.objectStoreNames.contains(STORES.ARTICLES)) {
                    const store = db.createObjectStore(STORES.ARTICLES, {
                        keyPath: "id"
                    });

                    store.createIndex("wikiId", "wikiId");
                    store.createIndex("updatedAt", "updatedAt");
                }

                if (!db.objectStoreNames.contains(STORES.BLOCKS)) {
                    const store = db.createObjectStore(STORES.BLOCKS, {
                        keyPath: "id"
                    });

                    store.createIndex("articleId", "articleId");
                    store.createIndex("order", "order");
                }

                for (const storeName of [
                    STORES.IMAGES,
                    STORES.VIDEOS,
                    STORES.AUDIOS
                ]) {
                    if (!db.objectStoreNames.contains(storeName)) {
                        const store = db.createObjectStore(storeName, {
                            keyPath: "id"
                        });

                        store.createIndex("articleId", "articleId");
                    }
                }
            };

            request.onsuccess = () => {
                const db = request.result;

                db.onversionchange = () => {
                    db.close();
                    databasePromise = null;
                };

                resolve(db);
            };

            request.onerror = () => {
                databasePromise = null;
                reject(request.error);
            };

            request.onblocked = () => {
                console.warn(
                    "WikiHub DB upgrade is blocked by another open tab."
                );
            };
        });

        return databasePromise;
    }

    async function getAllFromStore(storeName) {
        const db = await openDatabase();
        const transaction = db.transaction(storeName, "readonly");
        const request = transaction.objectStore(storeName).getAll();

        return requestResult(request);
    }

    async function getFromStore(storeName, id) {
        const db = await openDatabase();
        const transaction = db.transaction(storeName, "readonly");

        return requestResult(
            transaction.objectStore(storeName).get(id)
        );
    }

    async function putIntoStore(storeName, data) {
        const db = await openDatabase();
        const transaction = db.transaction(storeName, "readwrite");

        const done = transactionDone(transaction);

        transaction.objectStore(storeName).put(data);

        await done;
        return data;
    }

    async function deleteFromStore(storeName, id) {
        const db = await openDatabase();
        const transaction = db.transaction(storeName, "readwrite");

        const done = transactionDone(transaction);

        transaction.objectStore(storeName).delete(id);

        await done;
    }

    async function getByIndex(storeName, indexName, value) {
        const db = await openDatabase();
        const transaction = db.transaction(storeName, "readonly");

        return requestResult(
            transaction
                .objectStore(storeName)
                .index(indexName)
                .getAll(value)
        );
    }

    // 指定インデックスに一致するデータをトランザクション内で削除
    function deleteByIndex(store, indexName, value) {
        return new Promise((resolve, reject) => {
            const request = store
                .index(indexName)
                .openCursor(IDBKeyRange.only(value));

            request.onerror = () => reject(request.error);

            request.onsuccess = () => {
                const cursor = request.result;

                if (!cursor) {
                    resolve();
                    return;
                }

                cursor.delete();
                cursor.continue();
            };
        });
    }

    // 初期化
    async function init() {
        await openDatabase();
        return true;
    }

    // Wiki作成
    async function createWiki(data) {
        const name = String(data.name || "").trim();

        if (!name) {
            throw new Error("Wiki名を入力してください。");
        }

        const now = new Date().toISOString();

        const wiki = {
            id: createId("wiki"),
            name,
            description: String(data.description || "").trim(),
            icon: String(data.icon || "📚"),
            color: String(data.color || "#6558e8"),
            createdAt: now,
            updatedAt: now
        };

        await putIntoStore(STORES.WIKIS, wiki);

        return wiki;
    }

    // Wiki取得
    async function getWiki(id) {
        return getFromStore(STORES.WIKIS, id);
    }

    // Wiki一覧取得
    async function getAllWikis() {
        const wikis = await getAllFromStore(STORES.WIKIS);

        return wikis.sort((a, b) => {
            return new Date(b.updatedAt) - new Date(a.updatedAt);
        });
    }

    // Wiki編集
    async function updateWiki(id, changes) {
        const wiki = await getWiki(id);

        if (!wiki) {
            throw new Error("指定されたWikiが見つかりません。");
        }

        const updated = {
            ...wiki,
            ...changes,
            id: wiki.id,
            createdAt: wiki.createdAt,
            updatedAt: new Date().toISOString()
        };

        if (typeof updated.name !== "string" || !updated.name.trim()) {
            throw new Error("Wiki名を入力してください。");
        }

        updated.name = updated.name.trim();
        updated.description = String(updated.description || "").trim();

        await putIntoStore(STORES.WIKIS, updated);

        return updated;
    }

    // Wiki削除と関連データの削除
    async function deleteWiki(id) {
        const db = await openDatabase();

        const transaction = db.transaction(
            [
                STORES.WIKIS,
                STORES.ARTICLES,
                STORES.BLOCKS,
                STORES.IMAGES,
                STORES.VIDEOS,
                STORES.AUDIOS
            ],
            "readwrite"
        );

        const done = transactionDone(transaction);

        const wikiStore = transaction.objectStore(STORES.WIKIS);
        const articleStore = transaction.objectStore(STORES.ARTICLES);
        const blockStore = transaction.objectStore(STORES.BLOCKS);

        const imageStore = transaction.objectStore(STORES.IMAGES);
        const videoStore = transaction.objectStore(STORES.VIDEOS);
        const audioStore = transaction.objectStore(STORES.AUDIOS);

        const articleRequest = articleStore
            .index("wikiId")
            .getAll(id);

        articleRequest.onsuccess = () => {
            const articles = articleRequest.result || [];

            for (const article of articles) {
                articleStore.delete(article.id);

                deleteByIndex(blockStore, "articleId", article.id);
                deleteByIndex(imageStore, "articleId", article.id);
                deleteByIndex(videoStore, "articleId", article.id);
                deleteByIndex(audioStore, "articleId", article.id);
            }
        };

        articleRequest.onerror = () => {
            try {
                transaction.abort();
            } catch (_) {
                // Already aborted.
            }
        };

        wikiStore.delete(id);

        await done;
        return true;
    }

    // Wiki内の記事一覧
    async function getArticlesByWiki(wikiId) {
        const articles = await getByIndex(
            STORES.ARTICLES,
            "wikiId",
            wikiId
        );

        return articles.sort((a, b) => {
            return new Date(b.updatedAt) - new Date(a.updatedAt);
        });
    }

    // 記事作成
    async function createArticle(data) {
        const title = String(data.title || "").trim();

        if (!title) {
            throw new Error("記事タイトルを入力してください。");
        }

        const wiki = await getWiki(data.wikiId);

        if (!wiki) {
            throw new Error("所属Wikiが見つかりません。");
        }

        const now = new Date().toISOString();

        const article = {
            id: createId("article"),
            wikiId: data.wikiId,
            title,
            summary: String(data.summary || ""),
            tags: Array.isArray(data.tags) ? data.tags : [],
            createdAt: now,
            updatedAt: now
        };

        await putIntoStore(STORES.ARTICLES, article);

        return article;
    }

    // 記事取得
    async function getArticle(id) {
        return getFromStore(STORES.ARTICLES, id);
    }

    // 全記事取得
    async function getAllArticles() {
        const articles = await getAllFromStore(STORES.ARTICLES);

        return articles.sort((a, b) => {
            return new Date(b.updatedAt) - new Date(a.updatedAt);
        });
    }

    // 記事編集
    async function updateArticle(id, changes) {
        const article = await getArticle(id);

        if (!article) {
            throw new Error("記事が見つかりません。");
        }

        const updated = {
            ...article,
            ...changes,
            id: article.id,
            wikiId: article.wikiId,
            createdAt: article.createdAt,
            updatedAt: new Date().toISOString()
        };

        if (!String(updated.title || "").trim()) {
            throw new Error("記事タイトルを入力してください。");
        }

        updated.title = updated.title.trim();

        await putIntoStore(STORES.ARTICLES, updated);

        return updated;
    }

    // 記事削除と関連データの削除
    async function deleteArticle(id) {
        const db = await openDatabase();

        const transaction = db.transaction(
            [
                STORES.ARTICLES,
                STORES.BLOCKS,
                STORES.IMAGES,
                STORES.VIDEOS,
                STORES.AUDIOS
            ],
            "readwrite"
        );

        const done = transactionDone(transaction);

        transaction.objectStore(STORES.ARTICLES).delete(id);

        deleteByIndex(
            transaction.objectStore(STORES.BLOCKS),
            "articleId",
            id
        );

        deleteByIndex(
            transaction.objectStore(STORES.IMAGES),
            "articleId",
            id
        );

        deleteByIndex(
            transaction.objectStore(STORES.VIDEOS),
            "articleId",
            id
        );

        deleteByIndex(
            transaction.objectStore(STORES.AUDIOS),
            "articleId",
            id
        );

        await done;
        return true;
    }

    // 記事ブロック
    async function getArticleBlocks(articleId) {
        const blocks = await getByIndex(
            STORES.BLOCKS,
            "articleId",
            articleId
        );

        return blocks.sort((a, b) => a.order - b.order);
    }

    async function saveArticleBlock(data) {
        const block = {
            id: data.id || createId("block"),
            articleId: data.articleId,
            type: data.type || "paragraph",
            content: data.content ?? "",
            order: Number(data.order || 0),
            settings: data.settings || {},
            updatedAt: new Date().toISOString()
        };

        await putIntoStore(STORES.BLOCKS, block);

        return block;
    }

    async function deleteArticleBlock(id) {
        return deleteFromStore(STORES.BLOCKS, id);
    }

    // メディア保存
    async function saveMedia(type, data) {
        const storeMap = {
            image: STORES.IMAGES,
            video: STORES.VIDEOS,
            audio: STORES.AUDIOS
        };

        const storeName = storeMap[type];

        if (!storeName) {
            throw new Error("対応していないメディア形式です。");
        }

        if (!data.articleId || !data.blob) {
            throw new Error("articleIdとblobが必要です。");
        }

        const media = {
            id: data.id || createId(type),
            articleId: data.articleId,
            name: String(data.name || ""),
            mimeType: data.blob.type || "",
            blob: data.blob,
            createdAt: new Date().toISOString()
        };

        await putIntoStore(storeName, media);

        return media;
    }

    async function getMedia(type, id) {
        const storeMap = {
            image: STORES.IMAGES,
            video: STORES.VIDEOS,
            audio: STORES.AUDIOS
        };

        const storeName = storeMap[type];

        if (!storeName) {
            throw new Error("対応していないメディア形式です。");
        }

        return getFromStore(storeName, id);
    }

    async function deleteMedia(type, id) {
        const storeMap = {
            image: STORES.IMAGES,
            video: STORES.VIDEOS,
            audio: STORES.AUDIOS
        };

        const storeName = storeMap[type];

        if (!storeName) {
            throw new Error("対応していないメディア形式です。");
        }

        return deleteFromStore(storeName, id);
    }

    // 記事に保存されているメディア一覧
    async function getMediaByArticle(type, articleId) {
        const storeMap = {
            image: STORES.IMAGES,
            video: STORES.VIDEOS,
            audio: STORES.AUDIOS
        };

        const storeName = storeMap[type];

        if (!storeName) {
            throw new Error("対応していないメディア形式です。");
        }

        return getByIndex(storeName, "articleId", articleId);
    }

    // 統計情報
    async function getStatistics() {
        const [wikis, articles] = await Promise.all([
            getAllWikis(),
            getAllArticles()
        ]);

        const tagSet = new Set();

        for (const article of articles) {
            for (const tag of article.tags || []) {
                tagSet.add(String(tag));
            }
        }

        return {
            wikiCount: wikis.length,
            articleCount: articles.length,
            tagCount: tagSet.size,
            recentCount: articles.filter((article) => {
                const updated = new Date(article.updatedAt).getTime();
                return Date.now() - updated < 7 * 24 * 60 * 60 * 1000;
            }).length
        };
    }

    // 公開API
    window.WikiHubStorage = Object.freeze({
        init,

        createWiki,
        getWiki,
        getAllWikis,
        updateWiki,
        deleteWiki,

        createArticle,
        getArticle,
        getAllArticles,
        getArticlesByWiki,
        updateArticle,
        deleteArticle,

        getArticleBlocks,
        saveArticleBlock,
        deleteArticleBlock,

        saveMedia,
        getMedia,
        getMediaByArticle,
        deleteMedia,

        getStatistics
    });
})();
