"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const sidebar = document.getElementById("sidebar");
    const menuButton = document.getElementById("menuButton");
    const sidebarOverlay = document.getElementById("sidebarOverlay");

    const createWikiButton = document.getElementById("createWikiButton");
    const newWikiCard = document.getElementById("newWikiCard");

    const createWikiDialog = document.getElementById("createWikiDialog");
    const createWikiForm = document.getElementById("createWikiForm");

    const closeWikiDialog = document.getElementById("closeWikiDialog");
    const cancelWikiButton = document.getElementById("cancelWikiButton");

    const globalSearch = document.getElementById("globalSearch");
    const wikiGrid = document.getElementById("wikiGrid");

    const toast = document.getElementById("toast");

    let toastTimer = null;

    // 通知表示
    function showToast(message) {
        toast.textContent = message;
        toast.classList.add("show");

        clearTimeout(toastTimer);

        toastTimer = setTimeout(() => {
            toast.classList.remove("show");
        }, 2600);
    }

    // モバイルメニュー
    function openSidebar() {
        sidebar.classList.add("open");
        sidebarOverlay.classList.add("show");
    }

    function closeSidebar() {
        sidebar.classList.remove("open");
        sidebarOverlay.classList.remove("show");
    }

    menuButton.addEventListener("click", () => {
        if (sidebar.classList.contains("open")) {
            closeSidebar();
        } else {
            openSidebar();
        }
    });

    sidebarOverlay.addEventListener("click", closeSidebar);

    // Wiki作成ダイアログ
    function openWikiDialog() {
        createWikiForm.reset();
        createWikiDialog.showModal();

        setTimeout(() => {
            document.getElementById("wikiName").focus();
        }, 50);
    }

    function closeWikiDialogWindow() {
        createWikiDialog.close();
    }

    createWikiButton.addEventListener("click", openWikiDialog);
    newWikiCard.addEventListener("click", openWikiDialog);

    closeWikiDialog.addEventListener("click", closeWikiDialogWindow);
    cancelWikiButton.addEventListener("click", closeWikiDialogWindow);

    // Wikiカード作成
    createWikiForm.addEventListener("submit", (event) => {
        event.preventDefault();

        const name = document.getElementById("wikiName").value.trim();
        const description = document.getElementById("wikiDescription").value.trim();

        if (!name) {
            showToast("Wiki名を入力してください。");
            return;
        }

        const card = document.createElement("article");
        card.className = "wiki-card";
        card.dataset.searchItem = `${name} ${description}`;

        const top = document.createElement("div");
        top.className = "wiki-card-top";

        const cover = document.createElement("div");
        cover.className = "wiki-cover cover-tech";
        cover.textContent = "📚";

        const body = document.createElement("div");
        body.className = "wiki-card-body";

        const category = document.createElement("div");
        category.className = "wiki-category";
        category.textContent = "MY WIKI";

        const title = document.createElement("h3");
        title.textContent = name;

        const descriptionText = document.createElement("p");
        descriptionText.textContent = description || "説明はまだありません。";

        const footer = document.createElement("div");
        footer.className = "wiki-card-footer";

        const articleCount = document.createElement("span");
        articleCount.textContent = "▧ 0 記事";

        const updateDate = document.createElement("span");
        updateDate.textContent = "作成: 今";

        footer.append(articleCount, updateDate);
        body.append(category, title, descriptionText, footer);
        top.appendChild(cover);
        card.append(top, body);

        wikiGrid.insertBefore(card, newWikiCard);

        updateWikiCount();
        closeWikiDialogWindow();

        showToast("Wikiを画面に追加しました。");
    });

    // Wiki数を更新
    function updateWikiCount() {
        const cards = wikiGrid.querySelectorAll(".wiki-card");
        document.getElementById("wikiCount").textContent = cards.length;
    }

    // 全体検索
    globalSearch.addEventListener("input", () => {
        const keyword = globalSearch.value.trim().toLowerCase();
        const items = document.querySelectorAll("[data-search-item]");

        items.forEach((item) => {
            const searchText = (item.dataset.searchItem || "").toLowerCase();
            item.classList.toggle("search-hidden", !searchText.includes(keyword));
        });

        const noResults = document.getElementById("searchNoResults");
        const visibleItems = Array.from(items).filter((item) => {
            return !item.classList.contains("search-hidden");
        });

        if (noResults) {
            noResults.remove();
        }

        if (keyword && visibleItems.length === 0) {
            const message = document.createElement("div");
            message.id = "searchNoResults";
            message.className = "empty-message";
            message.textContent = "一致するWikiや記事が見つかりませんでした。";

            document.querySelector(".recent-section").appendChild(message);
        }
    });

    // サイドバーなどの仮ナビゲーション
    document.querySelectorAll("[data-action]").forEach((button) => {
        button.addEventListener("click", () => {
            const action = button.dataset.action;

            const messages = {
                wikis: "Wiki一覧画面は次の開発段階で実装する予定です。",
                articles: "記事一覧画面は次の開発段階で実装する予定です。",
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

    // Wikiカードのその他メニュー
    wikiGrid.addEventListener("click", (event) => {
        const button = event.target.closest(".more-button");

        if (!button) {
            return;
        }

        showToast("Wikiの編集・削除メニューは今後実装します。");
    });

    // 初期表示
    updateWikiCount();

    console.log("WikiHub V4.0 Preview initialized.");
});
