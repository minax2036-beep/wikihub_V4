"use strict";

document.addEventListener("DOMContentLoaded", async () => {
    const $ = (selector) => document.querySelector(selector);
    const $$ = (selector) => Array.from(document.querySelectorAll(selector));

    const sidebar = $("#sidebar");
    const menuButton = $("#menuButton");
    const sidebarOverlay = $("#sidebarOverlay");

    const createWikiButton = $("#createWikiButton");
    const newWikiCard = $("#newWikiCard");
    const createWikiDialog = $("#createWikiDialog");
    const createWikiForm = $("#createWikiForm");
    const closeWikiDialog = $("#closeWikiDialog");
    const cancelWikiButton = $("#cancelWikiButton");

    const globalSearch = $("#globalSearch");
    const wikiGrid = $("#wikiGrid");
    const recentList = $("#recentList");
    const toast = $("#toast");

    let wikis = [];
    let articles = [];
    let toastTimer = null;

    function showToast(message) {
        toast.textContent = message;
        toast.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
    }

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[char]);
    }

    function formatDate(value) {
        if (!value) return "日付不明";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "日付不明";
        return date.toLocaleDateString("ja-JP");
    }

    function getArticleCount(wikiId) {
        return articles.filter((article) => article.wikiId === wikiId).length;
    }

    function renderStatistics(statistics) {
        $("#wikiCount").textContent = statistics.wikiCount;
        $("#articleCount").textContent = statistics.articleCount;
        $("#tagCount").textContent = statistics.tagCount;
        $("#recentCount").textContent = statistics.recentCount;
    }

    function renderWikis() {
        const visibleWikis = wikis.slice(0, 5);

        const cards = visibleWikis.map((wiki) => {
            const count = getArticleCount(wiki.id);
            const color = /^#[0-9a-f]{6}$/i.test(wiki.color || "")
                ? wiki.color
                : "#eeeaff";

            return `
                <a class="wiki-card home-wiki-card"
                   href="wiki.html?id=${encodeURIComponent(wiki.id)}"
                   data-search-item="${escapeHTML(wiki.name)} ${escapeHTML(wiki.description)}"
                   aria-label="${escapeHTML(wiki.name)} を開く">
                    <div class="wiki-card-top">
                        <div class="wiki-cover home-wiki-cover"
                             style="background:${color};">
                            ${escapeHTML(wiki.icon || "📚")}
                        </div>
                    </div>
                    <div class="wiki-card-body">
                        <div class="wiki-category">MY WIKI</div>
                        <h3>${escapeHTML(wiki.name)}</h3>
                        <p>${escapeHTML(wiki.description || "説明はまだありません。")}</p>
                        <div class="wiki-card-footer">
                            <span>▧ ${count} 記事</span>
                            <span>更新: ${formatDate(wiki.updatedAt)}</span>
                        </div>
                    </div>
                </a>
            `;
        }).join("");

        wikiGrid.innerHTML = cards + `
            <button class="new-wiki-card" id="newWikiCard">
                <span class="new-wiki-icon">＋</span>
                <strong>新しいWikiを作成</strong>
                <span>自分だけの知識ベースを作ろう</span>
            </button>
        `;

        $("#newWikiCard").addEventListener("click", openWikiDialog);

        const empty = $("#wikiEmptyMessage");
        if (empty) empty.remove();

        if (wikis.length === 0) {
            const message = document.createElement("div");
            message.id = "wikiEmptyMessage";
            message.className = "empty-message";
            message.textContent = "まだWikiがありません。右のカードから最初のWikiを作成しよう！";
            wikiGrid.appendChild(message);
        }
    }

    function renderRecentArticles() {
        const recent = articles.slice(0, 5);

        if (recent.length === 0) {
            recentList.innerHTML = `
                <div class="home-empty-state">
                    <div class="home-empty-icon">📝</div>
                    <strong>まだ記事がありません</strong>
                    <p>Wikiを作成したら、記事を追加していこう。</p>
                </div>
            `;
            return;
        }

        recentList.innerHTML = recent.map((article, index) => {
            const wiki = wikis.find((item) => item.id === article.wikiId);
            const icon = wiki?.icon || "📄";
            const wikiName = wiki?.name || "不明なWiki";
            const colors = ["article-purple", "article-blue", "article-orange", "article-red"];
            const tags = Array.isArray(article.tags) ? article.tags : [];
            const tagText = tags.length ? " ・ " + tags.slice(0, 2).map(escapeHTML).join(" / ") : "";

            return `
                <article class="recent-item" data-search-item="${escapeHTML(article.title)} ${escapeHTML(wikiName)} ${escapeHTML(tags.join(" "))}">
                    <div class="article-icon ${colors[index % colors.length]}">${escapeHTML(icon)}</div>
                    <div class="recent-info">
                        <h3>${escapeHTML(article.title)}</h3>
                        <p>${escapeHTML(wikiName)}${tagText}</p>
                    </div>
                    <div class="recent-date">${formatDate(article.updatedAt)}</div>
                </article>
            `;
        }).join("");
    }

    async function refreshHome() {
        await WikiHubStorage.init();

        [wikis, articles] = await Promise.all([
            WikiHubStorage.getAllWikis(),
            WikiHubStorage.getAllArticles()
        ]);

        const statistics = await WikiHubStorage.getStatistics();

        renderStatistics(statistics);
        renderWikis();
        renderRecentArticles();
        applySearch();
    }

    function openWikiDialog() {
        createWikiForm.reset();
        createWikiDialog.showModal();
        setTimeout(() => $("#wikiName").focus(), 50);
    }

    function closeWikiDialogWindow() {
        if (createWikiDialog.open) createWikiDialog.close();
    }

    createWikiButton.addEventListener("click", openWikiDialog);
    newWikiCard.addEventListener("click", openWikiDialog);
    closeWikiDialog.addEventListener("click", closeWikiDialogWindow);
    cancelWikiButton.addEventListener("click", closeWikiDialogWindow);

    createWikiForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const name = $("#wikiName").value.trim();
        const description = $("#wikiDescription").value.trim();

        if (!name) {
            showToast("Wiki名を入力してください。");
            return;
        }

        const submitButton = createWikiForm.querySelector('button[type="submit"]');
        submitButton.disabled = true;

        try {
            await WikiHubStorage.createWiki({
                name,
                description,
                icon: "📚",
                color: "#6558e8"
            });

            closeWikiDialogWindow();
            await refreshHome();
            showToast("Wikiを作成して保存しました！");
        } catch (error) {
            console.error("Wiki creation failed:", error);
            showToast("Wikiの保存に失敗しました: " + error.message);
        } finally {
            submitButton.disabled = false;
        }
    });

    function applySearch() {
        const keyword = globalSearch.value.trim().toLocaleLowerCase("ja");
        const items = $$("[data-search-item]");
        let visibleCount = 0;

        items.forEach((item) => {
            const text = (item.dataset.searchItem || "").toLocaleLowerCase("ja");
            const matched = !keyword || text.includes(keyword);
            item.classList.toggle("search-hidden", !matched);
            if (matched) visibleCount++;
        });

        let noResults = $("#searchNoResults");
        if (noResults) noResults.remove();

        if (keyword && visibleCount === 0) {
            noResults = document.createElement("div");
            noResults.id = "searchNoResults";
            noResults.className = "empty-message";
            noResults.textContent = "一致するWikiや記事が見つかりませんでした。";
            $(".recent-section").appendChild(noResults);
        }
    }

    globalSearch.addEventListener("input", applySearch);

    function openSidebar() {
        sidebar.classList.add("open");
        sidebarOverlay.classList.add("show");
    }

    function closeSidebar() {
        sidebar.classList.remove("open");
        sidebarOverlay.classList.remove("show");
    }

    menuButton.addEventListener("click", () => {
        sidebar.classList.contains("open") ? closeSidebar() : openSidebar();
    });

    sidebarOverlay.addEventListener("click", closeSidebar);

    $$('[data-action]').forEach((button) => {
        button.addEventListener("click", () => {
            const action = button.dataset.action;

            if (action === "wikis") {
                window.location.href = "wikis.html";
                return;
            }

            const messages = {
                articles: "記事一覧画面は次の開発段階で実装します。",
                recent: "最近見た記事の画面は今後実装します。",
                miniapps: "MiniAppsは今後実装します。",
                xid: "XIDモジュールは今後実装します。",
                stats: "詳細な統計画面は今後実装します。",
                settings: "設定画面は今後実装します。",
                profile: "プロフィール機能は今後実装します。",
                notifications: "現在、通知はありません。"
            };

            showToast(messages[action] || "この機能はまだ実装されていません。");
            closeSidebar();
        });
    });

    // 別タブや別画面でWiki管理を変更した場合、ホーム復帰時に再読込する。
    window.addEventListener("pageshow", () => {
        refreshHome().catch((error) => {
            console.error(error);
            showToast("ホームの再読み込みに失敗しました。");
        });
    });

    // 同じタブ内でDB更新を通知できるようにするためのイベント。
    window.addEventListener("wikihub:data-changed", () => {
        refreshHome().catch(console.error);
    });

    try {
        await refreshHome();
        console.log("WikiHub V4.1 home initialized.");
    } catch (error) {
        console.error("WikiHub home initialization failed:", error);
        showToast("データベースを読み込めませんでした: " + error.message);
        wikiGrid.innerHTML = '<div class="empty-message">データベースを読み込めませんでした。js/storage.js が正しく読み込まれているか確認してください。</div>';
        recentList.innerHTML = '<div class="empty-message">記事データを読み込めませんでした。</div>';
    }
});
