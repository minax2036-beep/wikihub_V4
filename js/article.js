"use strict";
document.addEventListener("DOMContentLoaded", async () => {
 const $ = s => document.querySelector(s);
 const params = new URLSearchParams(location.search);
 const articleId = params.get("id");
 let article = null, wiki = null, toastTimer = null;
 const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
 const showToast = message => { $("#toast").textContent=message; $("#toast").classList.add("show"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$("#toast").classList.remove("show"),2600); };
 const formatDate = value => { const d=new Date(value); return Number.isNaN(d.getTime()) ? "日付不明" : d.toLocaleString("ja-JP"); };
 function renderBlock(block) {
  const content = String(block.content ?? "");
  if (block.type === "divider") return '<hr class="article-divider">';
  if (block.type === "heading") return '<h2>'+escapeHTML(content)+'</h2>';
  if (block.type === "subheading") return '<h3>'+escapeHTML(content)+'</h3>';
  if (block.type === "quote") return '<blockquote>'+escapeHTML(content).replace(/\n/g,"<br>")+'</blockquote>';
  if (block.type === "list") return '<ul>'+content.split("\n").filter(Boolean).map(line=>'<li>'+escapeHTML(line)+'</li>').join("")+'</ul>';
  if (block.type === "image") {
   const url = content.trim();
   if (!/^https?:\/\//i.test(url)) return '<p class="article-invalid-image">画像URLが正しくありません。</p>';
   return '<figure class="article-image"><img src="'+escapeHTML(url)+'" alt="'+escapeHTML(block.settings?.alt || "")+'"><figcaption>'+escapeHTML(block.settings?.caption || "")+'</figcaption></figure>';
  }
  return '<p>'+escapeHTML(content).replace(/\n/g,"<br>")+'</p>';
 }
 async function load() {
  await WikiHubStorage.init();
  if (!articleId) throw new Error("記事IDがありません。");
  article = await WikiHubStorage.getArticle(articleId);
  if (!article) throw new Error("記事が見つかりません。");
  wiki = await WikiHubStorage.getWiki(article.wikiId);
  if (!wiki) throw new Error("所属Wikiが見つかりません。");
  const blocks = await WikiHubStorage.getArticleBlocks(articleId);
  document.title=article.title+" - WikiHub";
  $("#wikiBreadcrumb").textContent=wiki.name; $("#wikiBreadcrumb").href="wiki.html?id="+encodeURIComponent(wiki.id);
  $("#backToWiki").href="wiki.html?id="+encodeURIComponent(wiki.id);
  $("#articleBreadcrumb").textContent=article.title;
  $("#articleWikiLabel").textContent=(wiki.icon||"📚")+" "+wiki.name;
  $("#articleTitle").textContent=article.title;
  $("#articleSummary").textContent=article.summary||"";
  $("#articleMeta").textContent="作成: "+formatDate(article.createdAt)+" ・ 更新: "+formatDate(article.updatedAt);
  $("#articleTags").innerHTML=(article.tags||[]).map(t=>'<span class="article-tag">'+escapeHTML(t)+'</span>').join("");
  $("#articleBody").innerHTML=blocks.length ? blocks.map(renderBlock).join("") : '<p class="article-no-content">本文はまだありません。「編集」からブロックを追加できます。</p>';
  $("#editArticleButton").onclick=()=>location.href="editor.html?id="+encodeURIComponent(articleId);
  $("#deleteArticleButton").onclick=async()=>{ if(!confirm("この記事を削除しますか？この操作は取り消せません。")) return; try { await WikiHubStorage.deleteArticle(articleId); location.href="wiki.html?id="+encodeURIComponent(wiki.id); } catch(e){showToast("削除に失敗しました: "+e.message);} };
 }
 $("#menuButton").addEventListener("click",()=>{$("#sidebar").classList.toggle("open");$("#sidebarOverlay").classList.toggle("show");});
 $("#sidebarOverlay").addEventListener("click",()=>{$("#sidebar").classList.remove("open");$("#sidebarOverlay").classList.remove("show");});
 try { await load(); } catch(e) { console.error(e); $("#articleTitle").textContent="記事を開けませんでした"; $("#articleBody").textContent=e.message; }
});