"use strict";
document.addEventListener("DOMContentLoaded", async () => {
    const $ = selector => document.querySelector(selector);
    const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    })[char]);
    let toastTimer;
    function toast(message) {
        $("#toast").textContent = message;
        $("#toast").classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 3000);
    }
    async function render() {
        const templates = await WikiHubStorage.getAllTemplates();
        $("#templateCount").textContent = templates.length + " 件";
        if (!templates.length) {
            $("#templateList").innerHTML = '<div class="template-empty">まだテンプレートがありません。記事エディターから作成できます。</div>';
            return;
        }
        $("#templateList").innerHTML = templates.map(item =>
            '<article class="template-card"><div class="template-card-main"><strong>' + escapeHTML(item.name) +
            '</strong><p>' + escapeHTML(item.description || "説明はありません。") + '</p>' +
            '<div class="template-card-meta">' + (item.blocks || []).length + ' ブロック ・ 更新 ' +
            escapeHTML(new Date(item.updatedAt).toLocaleString("ja-JP")) + '</div></div>' +
            '<button class="template-delete" type="button" data-delete="' + escapeHTML(item.id) + '">削除</button></article>'
        ).join("");
    }
    $("#templateList").addEventListener("click", async event => {
        const button = event.target.closest("[data-delete]");
        if (!button) return;
        const id = button.dataset.delete;
        if (!window.confirm("このテンプレートを削除しますか？\n記事に適用済みの内容は変更されません。")) return;
        try {
            await WikiHubStorage.deleteTemplate(id);
            await render();
            toast("テンプレートを削除しました。");
        } catch (error) {
            console.error(error);
            toast("削除に失敗しました: " + error.message);
        }
    });
    $("#menuButton").addEventListener("click", () => {
        document.querySelector(".sidebar").classList.toggle("open");
        $("#sidebarOverlay").classList.toggle("show");
    });
    $("#sidebarOverlay").addEventListener("click", () => {
        document.querySelector(".sidebar").classList.remove("open");
        $("#sidebarOverlay").classList.remove("show");
    });
    try {
        await WikiHubStorage.init();
        await render();
    } catch (error) {
        console.error(error);
        $("#templateList").textContent = "テンプレートを読み込めませんでした: " + error.message;
    }
});