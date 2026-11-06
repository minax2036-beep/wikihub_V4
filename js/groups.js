"use strict";
document.addEventListener("DOMContentLoaded", async () => {
    const $ = (id) => document.getElementById(id);
    const grid=$("groupGrid"), search=$("groupSearch"), dialog=$("groupDialog"), form=$("groupForm");
    const name=$("groupName"), description=$("groupDescription"), icon=$("groupIcon"), color=$("groupColor");
    const editing=$("editingGroupId"), toast=$("toast");
    let groups=[], wikis=[], timer=null;
    const esc=(v)=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
    function notify(message){toast.textContent=message;toast.classList.add("show");clearTimeout(timer);timer=setTimeout(()=>toast.classList.remove("show"),2600);}
    async function load(){await WikiHubStorage.init();[groups,wikis]=await Promise.all([WikiHubStorage.getAllGroups(),WikiHubStorage.getAllWikis()]);render();}
    function render(){
        const q=search.value.trim().toLocaleLowerCase("ja");
        const list=groups.filter(g=>(g.name+" "+(g.description||"")).toLocaleLowerCase("ja").includes(q));
        $("groupTotal").textContent=groups.length;
        if(!list.length){grid.innerHTML='<div class="empty-wikis"><div class="empty-icon">📁</div><h3>グループがありません</h3><p>最初のグループを作成しましょう。</p></div>';return;}
        grid.innerHTML=list.map(g=>{
            const count=wikis.filter(w=>w.groupId===g.id).length;
            const safeColor=/^#[0-9a-f]{6}$/i.test(g.color||"")?g.color:"#eeeaff";
            return `<article class="group-card" data-id="${esc(g.id)}">
                <div class="group-card-cover" style="background:${safeColor}">${esc(g.icon||"📁")}</div>
                <div class="group-card-body"><div class="group-card-label">${g.isDefault?"SYSTEM GROUP":"WIKI COLLECTION"}</div>
                <h2>${esc(g.name)}</h2><p>${esc(g.description||"説明はまだありません。")}</p>
                <div class="group-card-meta"><span>▤ ${count} Wiki</span><span>${g.isDefault?"既定グループ":"グループ"}</span></div>
                <div class="group-card-actions"><a class="primary-button" href="wikis.html?groupId=${encodeURIComponent(g.id)}">Wikiを見る</a>
                <button type="button" data-edit="${esc(g.id)}" ${g.isDefault?"disabled":""}>編集</button>
                <button type="button" class="danger" data-delete="${esc(g.id)}" ${g.isDefault?"disabled":""}>削除</button></div></div></article>`;
        }).join("");
    }
    function openCreate(){form.reset();editing.value="";color.value="#8b82d9";$("dialogTitle").textContent="グループを作成";$("dialogEyebrow").textContent="NEW GROUP";$("saveGroupButton").textContent="作成する";dialog.showModal();name.focus();}
    function openEdit(g){editing.value=g.id;name.value=g.name;description.value=g.description||"";icon.value=g.icon||"📁";color.value=g.color||"#8b82d9";$("dialogTitle").textContent="グループを編集";$("dialogEyebrow").textContent="EDIT GROUP";$("saveGroupButton").textContent="変更を保存";dialog.showModal();name.focus();}
    $("createGroupButton").addEventListener("click",openCreate);
    $("closeDialog").addEventListener("click",()=>dialog.close());$("cancelDialog").addEventListener("click",()=>dialog.close());
    form.addEventListener("submit",async e=>{e.preventDefault();const data={name:name.value.trim(),description:description.value.trim(),icon:icon.value,color:color.value};try{if(editing.value){await WikiHubStorage.updateGroup(editing.value,data);notify("グループを更新しました。");}else{await WikiHubStorage.createGroup(data);notify("グループを作成しました。");}dialog.close();await load();}catch(err){console.error(err);notify("保存に失敗しました: "+err.message);}});
    grid.addEventListener("click",async e=>{const edit=e.target.closest("[data-edit]"),del=e.target.closest("[data-delete]");if(edit){const g=groups.find(x=>x.id===edit.dataset.edit);if(g)openEdit(g);return;}if(del){const g=groups.find(x=>x.id===del.dataset.delete);if(!g)return;if(!confirm("「"+g.name+"」を削除しますか？\nWikiが所属している場合は削除できません。"))return;try{await WikiHubStorage.deleteGroup(g.id);notify("グループを削除しました。");await load();}catch(err){notify(err.message);}}});
    search.addEventListener("input",render);
    const sidebar=$("sidebar"),overlay=$("sidebarOverlay");$("menuButton").addEventListener("click",()=>{sidebar.classList.toggle("open");overlay.classList.toggle("show");});overlay.addEventListener("click",()=>{sidebar.classList.remove("open");overlay.classList.remove("show");});
    document.querySelectorAll("[data-action]").forEach(b=>b.addEventListener("click",()=>notify("この機能は今後実装します。")));
    try{await load();}catch(err){console.error(err);grid.innerHTML='<div class="empty-wikis"><h3>読み込みに失敗しました</h3><p>'+esc(err.message)+'</p></div>';}
});