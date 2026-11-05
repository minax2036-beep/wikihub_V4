"use strict";
document.addEventListener("DOMContentLoaded", async () => {
 const $=s=>document.querySelector(s), params=new URLSearchParams(location.search), articleId=params.get("id");
 let wiki=null, article=null, blocks=[], toastTimer=null;
 const escapeHTML=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
 const showToast=message=>{$("#toast").textContent=message;$("#toast").classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>$("#toast").classList.remove("show"),2600);};
 function createBlock(type="paragraph"){return {id:"local-"+Date.now()+"-"+Math.random().toString(16).slice(2),type,content:"",settings:{}};}
 function renderBlocks(){
  $("#blockCount").textContent=blocks.length+" ブロック";
  if(!blocks.length){$("#blockList").innerHTML='<div class="editor-empty">まだブロックがありません。下のボタンから追加してください。</div>';return;}
  $("#blockList").innerHTML=blocks.map((b,i)=>{
   const labels={paragraph:"本文",heading:"見出し",subheading:"小見出し",quote:"引用",list:"箇条書き",divider:"水平線",image:"画像URL"};
   if(b.type==="divider") return '<div class="editor-block" data-index="'+i+'"><div class="editor-block-top"><strong>水平線</strong><div class="block-actions"><button type="button" data-up="'+i+'" aria-label="上へ">↑</button><button type="button" data-down="'+i+'" aria-label="下へ">↓</button><button type="button" data-remove="'+i+'" aria-label="削除">削除</button></div></div><div class="divider-preview"><hr></div></div>';
   const placeholder=b.type==="image"?"https://example.com/image.jpg":b.type==="list"?"項目1\n項目2\n項目3":b.type==="heading"?"見出し":b.type==="subheading"?"小見出し":"ここに"+labels[b.type]+"を入力...";
   const value=escapeHTML(b.content);
   return '<div class="editor-block" data-index="'+i+'"><div class="editor-block-top"><strong>'+labels[b.type]+'</strong><div class="block-actions"><button type="button" data-up="'+i+'" aria-label="上へ">↑</button><button type="button" data-down="'+i+'" aria-label="下へ">↓</button><button type="button" data-remove="'+i+'" aria-label="削除">削除</button></div></div><textarea data-content="'+i+'" rows="'+(b.type==="paragraph"||b.type==="quote"||b.type==="list"?4:2)+'" placeholder="'+placeholder+'">'+value+'</textarea>'+(b.type==="image"?'<input class="image-caption-input" data-caption="'+i+'" value="'+escapeHTML(b.settings?.caption||"")+'" placeholder="画像キャプション（任意）">':"")+'</div>';
  }).join("");
 }
 function addBlock(type){blocks.push(createBlock(type));renderBlocks();const last=$("#blockList .editor-block:last-child textarea");if(last)last.focus();}
 $("#addBlockButton").addEventListener("click",()=>addBlock($("#blockType").value));
 $("#blockList").addEventListener("input",event=>{const field=event.target;if(field.dataset.content!==undefined)blocks[Number(field.dataset.content)].content=field.value;if(field.dataset.caption!==undefined){const b=blocks[Number(field.dataset.caption)];b.settings={...b.settings,caption:field.value};}});
 $("#blockList").addEventListener("click",event=>{
  const button=event.target.closest("button");if(!button)return;
  if(button.dataset.remove!==undefined){blocks.splice(Number(button.dataset.remove),1);renderBlocks();return;}
  if(button.dataset.up!==undefined){const i=Number(button.dataset.up);if(i>0){[blocks[i-1],blocks[i]]=[blocks[i],blocks[i-1]];renderBlocks();}return;}
  if(button.dataset.down!==undefined){const i=Number(button.dataset.down);if(i<blocks.length-1){[blocks[i+1],blocks[i]]=[blocks[i],blocks[i+1]];renderBlocks();}}
 });
 async function save(){
  const title=$("#editorTitle").value.trim();if(!title){showToast("記事タイトルを入力してください。");$("#editorTitle").focus();return;}
  const tags=$("#editorTags").value.split(",").map(t=>t.trim()).filter(Boolean);
  const button=$("#saveArticleButton");button.disabled=true;$("#saveArticleButtonBottom").disabled=true;
  try{
   if(articleId) await WikiHubStorage.updateArticle(articleId,{title,summary:$("#editorSummary").value.trim(),tags});
   else article=await WikiHubStorage.createArticle({wikiId:wiki.id,title,summary:$("#editorSummary").value.trim(),tags});
   const targetId=articleId||article.id;
   const oldBlocks=await WikiHubStorage.getArticleBlocks(targetId);
   for(const old of oldBlocks) await WikiHubStorage.deleteArticleBlock(old.id);
   for(let i=0;i<blocks.length;i++){const b=blocks[i];if(b.type==="divider"||String(b.content).trim()||b.type==="image") await WikiHubStorage.saveArticleBlock({id:b.id.startsWith("local-")?undefined:b.id,articleId:targetId,type:b.type,content:b.content,order:i,settings:b.settings||{}});}
   showToast("記事を保存しました！");
   location.href="article.html?id="+encodeURIComponent(targetId);
  }catch(e){console.error(e);showToast("保存に失敗しました: "+e.message);}
  finally{button.disabled=false;$("#saveArticleButtonBottom").disabled=false;}
 }
 $("#saveArticleButton").addEventListener("click",save);$("#saveArticleButtonBottom").addEventListener("click",save);
 async function init(){
  await WikiHubStorage.init();
  if(!articleId)throw new Error("記事IDがありません。");
  article=await WikiHubStorage.getArticle(articleId);if(!article)throw new Error("記事が見つかりません。");
  wiki=await WikiHubStorage.getWiki(article.wikiId);if(!wiki)throw new Error("Wikiが見つかりません。");
  $("#wikiBreadcrumb").textContent=wiki.name;$("#wikiBreadcrumb").href="wiki.html?id="+encodeURIComponent(wiki.id);
  $("#cancelEditorLink").href="article.html?id="+encodeURIComponent(articleId);$("#cancelEditorLinkBottom").href="article.html?id="+encodeURIComponent(articleId);
  $("#editorTitle").value=article.title;$("#editorSummary").value=article.summary||"";$("#editorTags").value=(article.tags||[]).join(", ");
  blocks=await WikiHubStorage.getArticleBlocks(articleId);renderBlocks();
 }
 $("#menuButton").addEventListener("click",()=>{$("#sidebar").classList.toggle("open");$("#sidebarOverlay").classList.toggle("show");});
 $("#sidebarOverlay").addEventListener("click",()=>{$("#sidebar").classList.remove("open");$("#sidebarOverlay").classList.remove("show");});
 try{await init();}catch(e){console.error(e);showToast(e.message);$("#editorTitle").placeholder=e.message;$("#saveArticleButton").disabled=true;$("#saveArticleButtonBottom").disabled=true;}
});