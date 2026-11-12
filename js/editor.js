"use strict";

document.addEventListener("DOMContentLoaded", async () => {
    const $ = (selector) => document.querySelector(selector);
    const params = new URLSearchParams(location.search);
    const articleId = params.get("id");
    const MAX_FILE_SIZE = 100 * 1024 * 1024;

    let wiki = null;
    let article = null;
    let blocks = [];
    let toastTimer = null;
    let allGroups = [];
    let allWikis = [];
    let allArticles = [];

    const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    })[c]);

    const showToast = (message) => {
        $("#toast").textContent = message;
        $("#toast").classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 3200);
    };

    function createBlock(type = "paragraph") {
        return {
            id: "local-" + Date.now() + "-" + Math.random().toString(16).slice(2),
            type,
            content: "",
            settings: {}
        };
    }

    function blockLabel(type) {
        return ({
            paragraph: "本文",
            heading: "見出し",
            subheading: "小見出し",
            quote: "引用",
            list: "箇条書き",
            divider: "水平線",
            image: "画像",
            video: "動画",
            audio: "音声",
            internalLink: "内部リンク"
        })[type] || "ブロック";
    }

    function renderBlocks() {
        $("#blockCount").textContent = blocks.length + " ブロック";

        if (!blocks.length) {
            $("#blockList").innerHTML = '<div class="editor-empty">まだブロックがありません。下のボタンから追加してください。</div>';
            return;
        }

        $("#blockList").innerHTML = blocks.map((block, index) => {
            const actions = '<div class="block-actions">' +
                '<button type="button" data-up="' + index + '" aria-label="上へ">↑</button>' +
                '<button type="button" data-down="' + index + '" aria-label="下へ">↓</button>' +
                '<button type="button" data-remove="' + index + '" aria-label="削除">削除</button>' +
                '</div>';

            if (block.type === "divider") {
                return '<div class="editor-block"><div class="editor-block-top"><strong>水平線</strong>' +
                    actions + '</div><div class="divider-preview"><hr></div></div>';
            }

            if (block.type === "internalLink") {
                const targetType = ["article", "wiki", "group"].includes(block.settings?.targetType)
                    ? block.settings.targetType : "article";
                const targets = targetType === "article" ? allArticles :
                    targetType === "wiki" ? allWikis : allGroups;
                const targetId = block.settings?.targetId || "";
                const options = targets.map((target) => {
                    const name = targetType === "article" ? target.title : target.name;
                    const parent = targetType === "article"
                        ? "（" + ((allWikis.find((item) => item.id === target.wikiId) || {}).name || "Wiki不明") + "）"
                        : "";
                    return '<option value="' + escapeHTML(target.id) + '"' +
                        (target.id === targetId ? " selected" : "") + '>' +
                        escapeHTML(name) + escapeHTML(parent) + '</option>';
                }).join("");
                return '<div class="editor-block internal-link-editor"><div class="editor-block-top"><strong>内部リンク</strong>' +
                    actions + '</div><div class="internal-link-fields">' +
                    '<label>リンク先の種類<select data-link-type="' + index + '">' +
                    '<option value="article"' + (targetType === "article" ? " selected" : "") + '>記事</option>' +
                    '<option value="wiki"' + (targetType === "wiki" ? " selected" : "") + '>Wiki</option>' +
                    '<option value="group"' + (targetType === "group" ? " selected" : "") + '>グループ</option>' +
                    '</select></label>' +
                    '<label>リンク先<select data-link-target="' + index + '">' +
                    '<option value="">リンク先を選択してください</option>' + options +
                    '</select></label>' +
                    '<label>表示テキスト（任意）<input type="text" data-link-label="' + index +
                    '" value="' + escapeHTML(block.settings?.label || "") +
                    '" placeholder="空欄ならリンク先の名前を表示"></label></div></div>';
            }

            if (["image", "video", "audio"].includes(block.type)) {
                const fileName = block.settings?.fileName || "ファイル未選択";
                const accept = block.type === "image" ? "image/*" :
                    block.type === "video" ? "video/*" : "audio/*";
                const status = block.content
                    ? '<p class="media-upload-status">保存済み: ' + escapeHTML(fileName) + '</p>'
                    : '<p class="media-upload-status">ファイルを選択してください。</p>';

                const supportsSize = block.type === "image" || block.type === "video";
                const width = Math.min(100, Math.max(20, Number(block.settings?.width) || 100));
                const align = ["left", "center", "right"].includes(block.settings?.align)
                    ? block.settings.align : "center";
                const sizeControls = supportsSize
                    ? '<div class="media-size-controls">' +
                        '<label>表示サイズ <strong data-width-value="' + index + '">' + width + '%</strong>' +
                        '<input type="range" min="20" max="100" step="5" value="' + width +
                        '" data-width="' + index + '"></label>' +
                        '<label>配置<select data-align="' + index + '">' +
                        '<option value="left"' + (align === "left" ? " selected" : "") + '>左寄せ</option>' +
                        '<option value="center"' + (align === "center" ? " selected" : "") + '>中央</option>' +
                        '<option value="right"' + (align === "right" ? " selected" : "") + '>右寄せ</option>' +
                        '</select></label></div>'
                    : "";
                return '<div class="editor-block media-editor-block"><div class="editor-block-top"><strong>' +
                    blockLabel(block.type) + '</strong>' + actions + '</div>' +
                    '<label class="media-file-label">端末からファイルを選択' +
                    '<input type="file" data-media-file="' + index + '" accept="' + accept + '">' +
                    '</label>' + status + sizeControls +
                    '<input class="image-caption-input" data-caption="' + index +
                    '" value="' + escapeHTML(block.settings?.caption || "") +
                    '" placeholder="キャプション（任意）"></div>';
            }

            const placeholders = {
                paragraph: "ここに本文を入力...",
                heading: "見出し",
                subheading: "小見出し",
                quote: "引用文",
                list: "項目1\n項目2\n項目3"
            };
            const rows = block.type === "paragraph" || block.type === "quote" || block.type === "list" ? 4 : 2;

            const inlineType = ["article", "wiki", "group"].includes(block.settings?.inlineTargetType)
                ? block.settings.inlineTargetType : "article";
            const inlineTargets = inlineType === "article" ? allArticles :
                inlineType === "wiki" ? allWikis : allGroups;
            const inlineOptions = inlineTargets.map((target) => {
                const name = inlineType === "article" ? target.title : target.name;
                const parent = inlineType === "article"
                    ? "（" + ((allWikis.find((item) => item.id === target.wikiId) || {}).name || "Wiki不明") + "）"
                    : "";
                return '<option value="' + escapeHTML(target.id) + '"' +
                    (target.id === (block.settings?.inlineTargetId || "") ? " selected" : "") + '>' +
                    escapeHTML(name) + escapeHTML(parent) + '</option>';
            }).join("");
            return '<div class="editor-block"><div class="editor-block-top"><strong>' +
                blockLabel(block.type) + '</strong>' + actions + '</div>' +
                '<textarea data-content="' + index + '" rows="' + rows +
                '" placeholder="' + placeholders[block.type] + '">' +
                escapeHTML(block.content) + '</textarea>' +
                '<div class="inline-link-tools">' +
                '<span>選択した文字にリンクを設定</span>' +
                '<select data-inline-type="' + index + '">' +
                '<option value="article"' + (inlineType === "article" ? " selected" : "") + '>記事</option>' +
                '<option value="wiki"' + (inlineType === "wiki" ? " selected" : "") + '>Wiki</option>' +
                '<option value="group"' + (inlineType === "group" ? " selected" : "") + '>グループ</option>' +
                '</select>' +
                '<select data-inline-target="' + index + '"><option value="">リンク先を選択</option>' +
                inlineOptions + '</select>' +
                '<button type="button" data-inline-apply="' + index + '">選択範囲をリンク化</button>' +
                '</div></div>';
        }).join("");
    }

    function addBlock(type) {
        blocks.push(createBlock(type));
        renderBlocks();
        const last = $("#blockList .editor-block:last-child textarea");
        if (last) last.focus();
    }

    $("#addBlockButton").addEventListener("click", () => addBlock($("#blockType").value));

    $("#blockList").addEventListener("input", (event) => {
        const field = event.target;
        if (field.dataset.content !== undefined) {
            blocks[Number(field.dataset.content)].content = field.value;
        }
        if (field.dataset.caption !== undefined) {
            const block = blocks[Number(field.dataset.caption)];
            block.settings = { ...block.settings, caption: field.value };
        }
        if (field.dataset.linkLabel !== undefined) {
            const block = blocks[Number(field.dataset.linkLabel)];
            block.settings = { ...block.settings, label: field.value };
        }
        if (field.dataset.width !== undefined) {
            const index = Number(field.dataset.width);
            const block = blocks[index];
            const width = Math.min(100, Math.max(20, Number(field.value) || 100));
            block.settings = { ...block.settings, width };
            const output = document.querySelector('[data-width-value="' + index + '"]');
            if (output) output.textContent = width + "%";
        }
    });

    $("#blockList").addEventListener("change", async (event) => {
        const field = event.target;
        if (field.dataset.align !== undefined) {
            const block = blocks[Number(field.dataset.align)];
            if (block) block.settings = { ...block.settings, align: field.value };
            return;
        }
        if (field.dataset.linkType !== undefined) {
            const block = blocks[Number(field.dataset.linkType)];
            if (block) {
                block.settings = { ...block.settings, targetType: field.value, targetId: "" };
                renderBlocks();
            }
            return;
        }
        if (field.dataset.linkTarget !== undefined) {
            const block = blocks[Number(field.dataset.linkTarget)];
            if (block) block.settings = { ...block.settings, targetId: field.value };
            return;
        }
        if (field.dataset.inlineType !== undefined) {
            const block = blocks[Number(field.dataset.inlineType)];
            if (block) {
                block.settings = { ...block.settings, inlineTargetType: field.value, inlineTargetId: "" };
                renderBlocks();
            }
            return;
        }
        if (field.dataset.inlineTarget !== undefined) {
            const block = blocks[Number(field.dataset.inlineTarget)];
            if (block) block.settings = { ...block.settings, inlineTargetId: field.value };
            return;
        }
        if (field.dataset.mediaFile === undefined) return;

        const index = Number(field.dataset.mediaFile);
        const block = blocks[index];
        const file = field.files && field.files[0];
        if (!file || !block) return;

        if (file.size > MAX_FILE_SIZE) {
            showToast("ファイルサイズは100MB以下にしてください。");
            field.value = "";
            return;
        }

        const valid = block.type === "image" ? file.type.startsWith("image/") :
            block.type === "video" ? file.type.startsWith("video/") :
            file.type.startsWith("audio/");

        if (!valid) {
            showToast("選択したファイル形式が正しくありません。");
            field.value = "";
            return;
        }

        field.disabled = true;
        try {
            const media = await WikiHubStorage.saveMedia(block.type, {
                articleId,
                name: file.name,
                blob: file
            });
            block.content = media.id;
            block.settings = { ...block.settings, fileName: file.name };
            renderBlocks();
            showToast(blockLabel(block.type) + "をアップロードしました！");
        } catch (error) {
            console.error(error);
            showToast("アップロードに失敗しました: " + error.message);
            field.disabled = false;
        }
    });

    $("#blockList").addEventListener("click", (event) => {
        const button = event.target.closest("button");
        if (!button) return;

        if (button.dataset.inlineApply !== undefined) {
            const index = Number(button.dataset.inlineApply);
            const block = blocks[index];
            const textarea = document.querySelector('textarea[data-content="' + index + '"]');
            const targetType = block?.settings?.inlineTargetType || "article";
            const targetId = block?.settings?.inlineTargetId || "";
            if (!block || !textarea) return;
            if (!targetId) {
                showToast("先にリンク先を選択してください。");
                return;
            }
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            if (start === end) {
                showToast("リンクにしたい文字を選択してください。");
                textarea.focus();
                return;
            }
            const selected = block.content.slice(start, end);
            if (selected.includes("[[WHL:") || selected.includes("[[/WHL]]")) {
                showToast("リンク記法が含まれる範囲は選択できません。");
                return;
            }
            const markerStart = "[[WHL:" + targetType + ":" + targetId + "]]";
            const markerEnd = "[[/WHL]]";
            block.content = block.content.slice(0, start) + markerStart + selected + markerEnd + block.content.slice(end);
            renderBlocks();
            showToast("選択した文字を内部リンクにしました。");
            return;
        }

        if (button.dataset.remove !== undefined) {
            blocks.splice(Number(button.dataset.remove), 1);
            renderBlocks();
            return;
        }

        if (button.dataset.up !== undefined) {
            const index = Number(button.dataset.up);
            if (index > 0) {
                [blocks[index - 1], blocks[index]] = [blocks[index], blocks[index - 1]];
                renderBlocks();
            }
            return;
        }

        if (button.dataset.down !== undefined) {
            const index = Number(button.dataset.down);
            if (index < blocks.length - 1) {
                [blocks[index + 1], blocks[index]] = [blocks[index], blocks[index + 1]];
                renderBlocks();
            }
        }
    });

    async function cleanupUnusedMedia(targetId) {
        const used = new Set(
            blocks.filter((block) => ["image", "video", "audio"].includes(block.type))
                .map((block) => block.content).filter(Boolean)
        );

        for (const type of ["image", "video", "audio"]) {
            const mediaItems = await WikiHubStorage.getMediaByArticle(type, targetId);
            for (const media of mediaItems) {
                if (!used.has(media.id)) {
                    await WikiHubStorage.deleteMedia(type, media.id);
                }
            }
        }
    }

    async function save() {
        const title = $("#editorTitle").value.trim();
        if (!title) {
            showToast("記事タイトルを入力してください。");
            $("#editorTitle").focus();
            return;
        }

        const tags = $("#editorTags").value.split(",").map((tag) => tag.trim()).filter(Boolean);
        const topButton = $("#saveArticleButton");
        const bottomButton = $("#saveArticleButtonBottom");
        topButton.disabled = true;
        bottomButton.disabled = true;

        try {
            if (articleId) {
                await WikiHubStorage.updateArticle(articleId, {
                    title,
                    summary: $("#editorSummary").value.trim(),
                    tags
                });
            } else {
                article = await WikiHubStorage.createArticle({
                    wikiId: wiki.id,
                    title,
                    summary: $("#editorSummary").value.trim(),
                    tags
                });
            }

            const targetId = articleId || article.id;
            const oldBlocks = await WikiHubStorage.getArticleBlocks(targetId);
            for (const oldBlock of oldBlocks) {
                await WikiHubStorage.deleteArticleBlock(oldBlock.id);
            }

            for (let index = 0; index < blocks.length; index++) {
                const block = blocks[index];
                const isMedia = ["image", "video", "audio"].includes(block.type);
                const isInternalLink = block.type === "internalLink" && block.settings?.targetId;
                if (block.type === "divider" || String(block.content).trim() || isMedia || isInternalLink) {
                    await WikiHubStorage.saveArticleBlock({
                        id: block.id.startsWith("local-") ? undefined : block.id,
                        articleId: targetId,
                        type: block.type,
                        content: block.content,
                        order: index,
                        settings: block.settings || {}
                    });
                }
            }

            await cleanupUnusedMedia(targetId);
            showToast("記事を保存しました！");
            location.href = "article.html?id=" + encodeURIComponent(targetId);
        } catch (error) {
            console.error(error);
            showToast("保存に失敗しました: " + error.message);
        } finally {
            topButton.disabled = false;
            bottomButton.disabled = false;
        }
    }

    $("#saveArticleButton").addEventListener("click", save);
    $("#saveArticleButtonBottom").addEventListener("click", save);

    async function init() {
        await WikiHubStorage.init();
        if (!articleId) throw new Error("記事IDがありません。");

        article = await WikiHubStorage.getArticle(articleId);
        if (!article) throw new Error("記事が見つかりません。");

        wiki = await WikiHubStorage.getWiki(article.wikiId);
        if (!wiki) throw new Error("Wikiが見つかりません。");

        $("#wikiBreadcrumb").textContent = wiki.name;
        $("#wikiBreadcrumb").href = "wiki.html?id=" + encodeURIComponent(wiki.id);
        $("#cancelEditorLink").href = "article.html?id=" + encodeURIComponent(articleId);
        $("#cancelEditorLinkBottom").href = "article.html?id=" + encodeURIComponent(articleId);
        $("#editorTitle").value = article.title;
        $("#editorSummary").value = article.summary || "";
        $("#editorTags").value = (article.tags || []).join(", ");

        [allGroups, allWikis, allArticles] = await Promise.all([
            WikiHubStorage.getAllGroups(),
            WikiHubStorage.getAllWikis(),
            WikiHubStorage.getAllArticles()
        ]);
        blocks = await WikiHubStorage.getArticleBlocks(articleId);
        renderBlocks();
    }

    $("#menuButton").addEventListener("click", () => {
        $("#sidebar").classList.toggle("open");
        $("#sidebarOverlay").classList.toggle("show");
    });
    $("#sidebarOverlay").addEventListener("click", () => {
        $("#sidebar").classList.remove("open");
        $("#sidebarOverlay").classList.remove("show");
    });

    try {
        await init();
    } catch (error) {
        console.error(error);
        showToast(error.message);
        $("#editorTitle").placeholder = error.message;
        $("#saveArticleButton").disabled = true;
        $("#saveArticleButtonBottom").disabled = true;
    }
});
