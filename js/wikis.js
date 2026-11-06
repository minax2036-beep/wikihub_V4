"use strict";

document.addEventListener("DOMContentLoaded", async () => {
    const grid = document.getElementById("managedWikiGrid");
    const searchInput = document.getElementById("wikiSearch");
    const wikiTotal = document.getElementById("wikiTotal");

    const dialog = document.getElementById("wikiDialog");
    const form = document.getElementById("wikiForm");

    const createButton = document.getElementById("createWikiButton");
    const closeButton = document.getElementById("closeDialog");
    const cancelButton = document.getElementById("cancelDialog");

    const nameInput = document.getElementById("wikiName");
    const descriptionInput = document.getElementById("wikiDescription");
    const iconInput = document.getElementById("wikiIcon");
    const colorInput = document.getElementById("wikiColor");
    const groupInput = document.getElementById("wikiGroup");
    const editingIdInput = document.getElementById("editingWikiId");

    const dialogTitle = document.getElementById("dialogTitle");
    const dialogEyebrow = document.getElementById("dialogEyebrow");
    const saveButton = document.getElementById("saveWikiButton");

    const toast = document.getElementById("toast");

    let wikis = [];
    let articles = [];
    let groups = [];
    const requestedGroupId = new URLSearchParams(window.location.search).get("groupId");
    let toastTimer = null;

    function showToast(message) {
        toast.textContent = message;
        toast.classList.add("show");

        clearTimeout(toastTimer);

        toastTimer = setTimeout(() => {
            toast.classList.remove("show");
        }, 2600);
    }

    function escapeHTML(value) {
        return String(value).replace(/[&<>"']/g, (char) => {
            const map = {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#039;"
            };

            return map[char];
        });
    }

    function formatDate(value) {
        if (!value) {
            return "不明";
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return "不明";
        }

        return date.toLocaleDateString("ja-JP");
    }

    function getArticleCount(wikiId) {
        return articles.filter((article) => {
            return article.wikiId === wikiId;
        }).length;
    }

    async function loadData() {
        await WikiHubStorage.init();

        [wikis, articles, groups] = await Promise.all([
            WikiHubStorage.getAllWikis(),
            WikiHubStorage.getAllArticles(),
            WikiHubStorage.getAllGroups()
        ]);
        renderGroupOptions();

        renderWikis();
    }

    function renderGroupOptions(selectedId = "") {
        groupInput.innerHTML = groups.map(group => '<option value="' + escapeHTML(group.id) + '">' + escapeHTML(group.name) + '</option>').join("");
        const fallback = (groups.find(group => group.isDefault) || groups[0] || {}).id || "";
        groupInput.value = selectedId || requestedGroupId || fallback;
    }

    function getGroupName(groupId) {
        return (groups.find(group => group.id === groupId) || {}).name || "未分類";
    }

    function renderWikis() {
        const keyword = searchInput.value.trim().toLowerCase();

        const filtered = wikis.filter((wiki) => {
            const text = (wiki.name + " " + wiki.description + " " + getGroupName(wiki.groupId)).toLowerCase();
            const matchesGroup = !requestedGroupId || wiki.groupId === requestedGroupId;
            return matchesGroup && text.includes(keyword);
        });

        wikiTotal.textContent = wikis.length;

        if (filtered.length === 0) {
            grid.innerHTML = `
                <div class="empty-wikis">
                    <div class="empty-icon">📚</div>
                    <h3>${keyword ? "Wikiが見つかりません" : "まだWikiがありません"}</h3>
                    <p>
                        ${keyword
                            ? "別のキーワードで検索してみてください。"
                            : "最初のWikiを作成して、知識を整理しましょう。"}
                    </p>
                </div>
            `;
            return;
        }

        grid.innerHTML = filtered.map((wiki) => {
            const count = getArticleCount(wiki.id);

            return `
                <article class="managed-wiki-card" data-wiki-id="${escapeHTML(wiki.id)}">
                    <div
                        class="managed-wiki-cover"
                        style="background:${escapeHTML(wiki.color || "#eeeaff")};"
                    >
                        ${escapeHTML(wiki.icon || "📚")}
                    </div>

                    <div class="managed-wiki-content">
                        <h3><a class="managed-wiki-title-link" href="wiki.html?id=${encodeURIComponent(wiki.id)}">${escapeHTML(wiki.name)}</a></h3>

                        <p>
                            ${escapeHTML(wiki.description || "説明はまだありません。")}
                        </p>

                        <div class="managed-wiki-meta">
                            <span>▧ ${count} 記事</span>
                            <span>更新 ${formatDate(wiki.updatedAt)}</span>
                        </div>

                        <div class="managed-wiki-actions">
                            <button type="button" data-edit-id="${escapeHTML(wiki.id)}">
                                編集
                            </button>

                            <button
                                type="button"
                                class="delete-wiki-button"
                                data-delete-id="${escapeHTML(wiki.id)}"
                            >
                                削除
                            </button>
                        </div>
                    </div>
                </article>
            `;
        }).join("");
    }

    function openCreateDialog() {
        form.reset();

        editingIdInput.value = "";
        colorInput.value = "#6558e8";
        renderGroupOptions(requestedGroupId || "");

        dialogTitle.textContent = "Wikiを作成";
        dialogEyebrow.textContent = "NEW WORKSPACE";
        saveButton.textContent = "作成する";

        dialog.showModal();
        nameInput.focus();
    }

    function openEditDialog(wiki) {
        form.reset();

        editingIdInput.value = wiki.id;
        nameInput.value = wiki.name;
        descriptionInput.value = wiki.description || "";
        iconInput.value = wiki.icon || "📚";
        colorInput.value = wiki.color || "#6558e8";
        renderGroupOptions(wiki.groupId || "");

        dialogTitle.textContent = "Wikiを編集";
        dialogEyebrow.textContent = "EDIT WORKSPACE";
        saveButton.textContent = "変更を保存";

        dialog.showModal();
        nameInput.focus();
    }

    function closeDialog() {
        dialog.close();
    }

    createButton.addEventListener("click", openCreateDialog);
    closeButton.addEventListener("click", closeDialog);
    cancelButton.addEventListener("click", closeDialog);

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const name = nameInput.value.trim();

        if (!name) {
            showToast("Wiki名を入力してください。");
            return;
        }

        const data = {
            name,
            description: descriptionInput.value.trim(),
            icon: iconInput.value,
            color: colorInput.value,
            groupId: groupInput.value
        };

        try {
            const editingId = editingIdInput.value;

            if (editingId) {
                await WikiHubStorage.updateWiki(editingId, data);
                showToast("Wikiを更新しました。");
            } else {
                await WikiHubStorage.createWiki(data);
                showToast("Wikiを作成しました。");
            }

            closeDialog();
            await loadData();
        } catch (error) {
            console.error(error);
            showToast(`保存に失敗しました: ${error.message}`);
        }
    });

    grid.addEventListener("click", async (event) => {
        const editButton = event.target.closest("[data-edit-id]");
        const deleteButton = event.target.closest("[data-delete-id]");

        // Wiki管理画面では、編集・削除ボタン以外のカード部分からも開ける。
        const card = event.target.closest(".managed-wiki-card");
        if (card && !editButton && !deleteButton && !event.target.closest("a")) {
            const wikiId = card.dataset.wikiId;
            if (wikiId) {
                window.location.assign("wiki.html?id=" + encodeURIComponent(wikiId));
            }
            return;
        }

        if (editButton) {
            const wiki = wikis.find((item) => {
                return item.id === editButton.dataset.editId;
            });

            if (wiki) {
                openEditDialog(wiki);
            }

            return;
        }

        if (deleteButton) {
            const id = deleteButton.dataset.deleteId;
            const wiki = wikis.find((item) => item.id === id);

            if (!wiki) {
                return;
            }

            const count = getArticleCount(id);

            const message = count > 0
                ? `「${wiki.name}」と、そのWikiに所属する${count}件の記事を削除します。\nこの操作は取り消せません。本当に削除しますか？`
                : `「${wiki.name}」を削除します。\nこの操作は取り消せません。本当に削除しますか？`;

            if (!confirm(message)) {
                return;
            }

            try {
                await WikiHubStorage.deleteWiki(id);
                showToast("Wikiと関連データを削除しました。");
                await loadData();
            } catch (error) {
                console.error(error);
                showToast(`削除に失敗しました: ${error.message}`);
            }
        }
    });

    searchInput.addEventListener("input", renderWikis);

    // モバイルメニュー
    const sidebar = document.getElementById("sidebar");
    const menuButton = document.getElementById("menuButton");
    const overlay = document.getElementById("sidebarOverlay");

    function closeSidebar() {
        sidebar.classList.remove("open");
        overlay.classList.remove("show");
    }

    menuButton.addEventListener("click", () => {
        sidebar.classList.toggle("open");
        overlay.classList.toggle("show");
    });

    overlay.addEventListener("click", closeSidebar);

    document.querySelectorAll("[data-action]").forEach((button) => {
        button.addEventListener("click", () => {
            showToast("この画面は今後実装する予定です。");
            closeSidebar();
        });
    });

    try {
        await loadData();
    } catch (error) {
        console.error(error);

        grid.innerHTML = `
            <div class="empty-wikis">
                <div class="empty-icon">⚠️</div>
                <h3>データベースを開けませんでした</h3>
                <p>${escapeHTML(error.message)}</p>
            </div>
        `;
    }
});
