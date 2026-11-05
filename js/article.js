"use strict";

document.addEventListener("DOMContentLoaded", async () => {
    const $ = (selector) => document.querySelector(selector);
    const params = new URLSearchParams(location.search);
    const articleId = params.get("id");
    let article = null;
    let wiki = null;
    let toastTimer = null;
    const objectUrls = [];

    const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    })[c]);

    const formatDate = (value) => {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? "日付不明" : date.toLocaleString("ja-JP");
    };

    const showToast = (message) => {
        $("#toast").textContent = message;
        $("#toast").classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 2600);
    };

    function mediaUrl(blob) {
        const url = URL.createObjectURL(blob);
        objectUrls.push(url);
        return url;
    }

    async function renderBlock(block) {
        const content = String(block.content ?? "");
        if (block.type === "divider") return '<hr class="article-divider">';
        if (block.type === "heading") return '<h2>' + escapeHTML(content) + '</h2>';
        if (block.type === "subheading") return '<h3>' + escapeHTML(content) + '</h3>';
        if (block.type === "quote") return '<blockquote>' + escapeHTML(content).replace(/\n/g, "<br>") + '</blockquote>';
        if (block.type === "list") {
            return '<ul>' + content.split("\n").filter(Boolean)
                .map((line) => '<li>' + escapeHTML(line) + '</li>').join("") + '</ul>';
        }

        if (["image", "video", "audio"].includes(block.type)) {
            const media = await WikiHubStorage.getMedia(block.type, content);

            // V4初期版の画像URLブロックとの互換性を維持
            if (!media && block.type === "image" && /^https?:\/\//i.test(content.trim())) {
                return '<figure class="article-image"><img src="' + escapeHTML(content.trim()) +
                    '" alt="' + escapeHTML(block.settings?.alt || "") + '">' +
                    (block.settings?.caption ? '<figcaption>' + escapeHTML(block.settings.caption) + '</figcaption>' : '') +
                    '</figure>';
            }

            if (!media || !media.blob) {
                return '<p class="article-invalid-media">メディアファイルを読み込めませんでした。</p>';
            }

            const src = escapeHTML(mediaUrl(media.blob));
            const caption = escapeHTML(block.settings?.caption || "");
            if (block.type === "image") {
                return '<figure class="article-image"><img src="' + src + '" alt="' +
                    escapeHTML(block.settings?.alt || media.name || "") + '">' +
                    (caption ? '<figcaption>' + caption + '</figcaption>' : '') + '</figure>';
            }
            if (block.type === "video") {
                return '<figure class="article-video"><video controls preload="metadata" src="' +
                    src + '">このブラウザは動画再生に対応していません。</video>' +
                    (caption ? '<figcaption>' + caption + '</figcaption>' : '') + '</figure>';
            }
            return '<figure class="article-audio"><audio controls preload="metadata" src="' +
                src + '">このブラウザは音声再生に対応していません。</audio>' +
                (caption ? '<figcaption>' + caption + '</figcaption>' : '') + '</figure>';
        }

        if (block.type === "image") {
            const url = content.trim();
            if (!/^https?:\/\//i.test(url)) return '<p class="article-invalid-media">画像URLが正しくありません。</p>';
            return '<figure class="article-image"><img src="' + escapeHTML(url) +
                '" alt="' + escapeHTML(block.settings?.alt || "") + '"><figcaption>' +
                escapeHTML(block.settings?.caption || "") + '</figcaption></figure>';
        }

        return '<p>' + escapeHTML(content).replace(/\n/g, "<br>") + '</p>';
    }

    async function load() {
        await WikiHubStorage.init();
        if (!articleId) throw new Error("記事IDがありません。");

        article = await WikiHubStorage.getArticle(articleId);
        if (!article) throw new Error("記事が見つかりません。");

        wiki = await WikiHubStorage.getWiki(article.wikiId);
        if (!wiki) throw new Error("所属Wikiが見つかりません。");

        const blocks = await WikiHubStorage.getArticleBlocks(articleId);
        document.title = article.title + " - WikiHub";

        $("#wikiBreadcrumb").textContent = wiki.name;
        $("#wikiBreadcrumb").href = "wiki.html?id=" + encodeURIComponent(wiki.id);
        $("#backToWiki").href = "wiki.html?id=" + encodeURIComponent(wiki.id);
        $("#articleBreadcrumb").textContent = article.title;
        $("#articleWikiLabel").textContent = (wiki.icon || "📚") + " " + wiki.name;
        $("#articleTitle").textContent = article.title;
        $("#articleSummary").textContent = article.summary || "";
        $("#articleMeta").textContent = "作成: " + formatDate(article.createdAt) +
            " ・ 更新: " + formatDate(article.updatedAt);
        $("#articleTags").innerHTML = (article.tags || [])
            .map((tag) => '<span class="article-tag">' + escapeHTML(tag) + '</span>').join("");

        const rendered = [];
        for (const block of blocks) rendered.push(await renderBlock(block));
        $("#articleBody").innerHTML = rendered.length
            ? rendered.join("")
            : '<p class="article-no-content">本文はまだありません。「編集」からブロックを追加できます。</p>';

        $("#editArticleButton").onclick = () => {
            location.href = "editor.html?id=" + encodeURIComponent(articleId);
        };
        $("#deleteArticleButton").onclick = async () => {
            if (!confirm("この記事を削除しますか？この操作は取り消せません。")) return;
            try {
                await WikiHubStorage.deleteArticle(articleId);
                location.href = "wiki.html?id=" + encodeURIComponent(wiki.id);
            } catch (error) {
                showToast("削除に失敗しました: " + error.message);
            }
        };
    }

    $("#menuButton").addEventListener("click", () => {
        $("#sidebar").classList.toggle("open");
        $("#sidebarOverlay").classList.toggle("show");
    });
    $("#sidebarOverlay").addEventListener("click", () => {
        $("#sidebar").classList.remove("open");
        $("#sidebarOverlay").classList.remove("show");
    });
    window.addEventListener("pagehide", () => objectUrls.forEach((url) => URL.revokeObjectURL(url)));

    try {
        await load();
    } catch (error) {
        console.error(error);
        $("#articleTitle").textContent = "記事を開けませんでした";
        $("#articleBody").textContent = error.message;
    }
});
