"use strict";

document.addEventListener("DOMContentLoaded", async () => {
    const $ = (selector) => document.querySelector(selector);
    const params = new URLSearchParams(window.location.search);
    const wikiId = params.get("id");

    const list = $("#articleList");
    const search = $("#articleSearch");
    const dialog = $("#articleDialog");
    const form = $("#articleForm");
    const toast = $("#toast");

    let wiki = null;
    let articles = [];
    let toastTimer = null;

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, (char) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
        })[char]);
    }

    function showToast(message) {
        toast.textContent = message;
        toast.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
    }

    function formatDate(value) {
        if (!value) return "日付不明";
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? "日付不明" : date.toLocaleDateString("ja-JP");
    }

    function renderArticles() {
        const keyword = search.value.trim().toLocaleLowerCase("ja");
        const filtered = articles.filter((article) => {
            const haystack = [article.title, article.summary, ...(article.tags || [])].join(" ").toLocaleLowerCase("ja");
            return haystack.includes(keyword);
        });

        $("#articleTotal").textContent = filtered.length + " 件";

        if (!filtered.length) {
            list.innerHTML = `
                <div class="wiki-empty-articles">
                    <div class="empty-icon">📝</div>
                    <h3>${keyword ? "記事が見つかりません" : "まだ記事がありません"}</h3>
                    <p>${keyword ? "別のキーワードで検索してください。" : "このWikiの最初の記事を作成してみましょう。"}</p>
                </div>
            `;
            return;
        }

        list.innerHTML = filtered.map((article) => {
            const tags = (article.tags || []).map((tag) => `<span class="article-tag">${escapeHTML(tag)}</span>`).join("");
            return `
                <a class="wiki-article-card wiki-article-link" href="article.html?id=${encodeURIComponent(article.id)}">
                    <div class="wiki-article-icon">${escapeHTML(wiki.icon || "📄")}</div>
                    <div class="wiki-article-main">
                        <h3>${escapeHTML(article.title)}</h3>
                        <p>${escapeHTML(article.summary || "概要はまだありません。")}</p>
                        <div class="wiki-article-tags">${tags}</div>
                    </div>
                    <div class="wiki-article-date">更新<br>${formatDate(article.updatedAt)}</div>
                </article>
            `;
        }).join("");
    }

    async function loadPage() {
        await WikiHubStorage.init();

        if (!wikiId) throw new Error("URLにWiki IDがありません。");

        wiki = await WikiHubStorage.getWiki(wikiId);
        if (!wiki) throw new Error("このWikiは見つかりません。削除された可能性があります。");

        articles = await WikiHubStorage.getArticlesByWiki(wikiId);

        document.title = wiki.name + " - WikiHub";
        $("#breadcrumbWikiName").textContent = wiki.name;
        $("#wikiName").textContent = wiki.name;
        $("#wikiDescription").textContent = wiki.description || "このWikiにはまだ説明がありません。";
        $("#wikiIcon").textContent = wiki.icon || "📚";
        $("#wikiHero").style.setProperty("--wiki-color", wiki.color || "#6558e8");
        $("#wikiArticleCount").textContent = articles.length + " 記事";
        $("#wikiUpdatedAt").textContent = "更新日: " + formatDate(wiki.updatedAt);

        renderArticles();
    }

    function openDialog() {
        form.reset();
        dialog.showModal();
        $("#articleTitle").focus();
    }

    function closeDialog() {
        if (dialog.open) dialog.close();
    }

    $("#createArticleButton").addEventListener("click", openDialog);
    $("#closeArticleDialog").addEventListener("click", closeDialog);
    $("#cancelArticleButton").addEventListener("click", closeDialog);
    search.addEventListener("input", renderArticles);

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const title = $("#articleTitle").value.trim();
        if (!title) {
            showToast("記事タイトルを入力してください。");
            return;
        }

        const button = $("#saveArticleButton");
        button.disabled = true;

        try {
            const tags = $("#articleTags").value.split(",").map((tag) => tag.trim()).filter(Boolean);
            const article = await WikiHubStorage.createArticle({
                wikiId,
                title,
                summary: $("#articleSummary").value.trim(),
                tags
            });
            closeDialog();
            window.location.href = "editor.html?id=" + encodeURIComponent(article.id);
        } catch (error) {
            console.error(error);
            showToast("記事の作成に失敗しました: " + error.message);
        } finally {
            button.disabled = false;
        }
    });

    $("#menuButton").addEventListener("click", () => {
        $("#sidebar").classList.toggle("open");
        $("#sidebarOverlay").classList.toggle("show");
    });
    $("#sidebarOverlay").addEventListener("click", () => {
        $("#sidebar").classList.remove("open");
        $("#sidebarOverlay").classList.remove("show");
    });

    try {
        await loadPage();
    } catch (error) {
        console.error(error);
        $("#wikiName").textContent = "Wikiを開けませんでした";
        $("#wikiDescription").textContent = error.message;
        list.innerHTML = '<div class="wiki-empty-articles"><h3>読み込みエラー</h3><p>Wiki一覧へ戻って、対象のWikiが存在するか確認してください。</p></div>';
        $("#createArticleButton").disabled = true;
    }
});