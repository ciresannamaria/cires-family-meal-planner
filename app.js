const SUPABASE_URL=window.CIRES_SUPABASE_URL, SUPABASE_KEY=window.CIRES_SUPABASE_PUBLISHABLE_KEY;
const db=window.supabase?.createClient(SUPABASE_URL,SUPABASE_KEY);
const DAYS=["Saturday","Sunday","Monday","Tuesday","Wednesday","Thursday","Friday"],SLOTS=["Breakfast","Lunch","Dinner","Snack"],PHOTO_BUCKET="meal-photos";
let user=null,meals=[],planned=[],plannerPeople=[],spiceCards=[],spiceEditingId=null,familyId=null,mealFormSnapshot=null,pendingShareToken=new URLSearchParams(location.search).get('share'),week=startWeek(new Date()),photoFile=null,photoPreview="",signedPhotos={},checked={},authMode="login",toastTimer,mealTypeFilter="All";
const $=(s,root=document)=>root.querySelector(s), queryAll=(s,root=document)=>[...root.querySelectorAll(s)];
function startWeek(d){let x=new Date(d);x.setHours(12,0,0,0);x.setDate(x.getDate()-(x.getDay()+1)%7);return x}
function dateKey(d){return[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-")}
function dayDate(i){let d=new Date(week);d.setDate(d.getDate()+i);return d}
function id(){return"m"+Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function esc(x=""){return String(x).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function toast(s){let t=$("#toast");t.textContent=s;t.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove("show"),2600)}
function showAuth(mode="login",message=""){if($("#shared-screen"))$("#shared-screen").hidden=true;authMode=mode;$("#auth-screen").hidden=false;$("#app-shell").hidden=true;$("#auth-title").textContent=mode==="login"?"Welcome back":"Create your account";$("#auth-description").textContent=mode==="login"?"Sign in to access your meals and weekly plans on all your devices.":"Create an account to keep your recipes safely synced across your devices." ;$("#auth-submit").textContent=mode==="login"?"Sign in":"Create account";$("#auth-switch-label").textContent=mode==="login"?"Don't have an account?":"Already have an account?";$("#auth-switch").textContent=mode==="login"?"Create account":"Sign in";$("#auth-password").autocomplete=mode==="login"?"current-password":"new-password";$("#auth-message").textContent=message}
const PROFILE_AVATARS=["🌿","🍒","🍓","🍋","🥑","🍊","🫐","🌸","🌻","🐝","🦋","🐱","🐻","🦊","🐼","🐸"];
function profileName(){return user?.user_metadata?.full_name||user?.user_metadata?.name||user?.email?.split("@")[0]||"Your profile"}
function renderProfile(){const avatar=user?.user_metadata?.avatar_emoji||"🌿";$("#profile-toggle").textContent=avatar;$("#profile-avatar-preview").textContent=avatar;$("#profile-name").textContent=profileName();$("#profile-email").textContent=user?.email||"";queryAll("[data-avatar]").forEach(b=>{b.classList.toggle("selected",b.dataset.avatar===avatar);b.setAttribute("aria-pressed",String(b.dataset.avatar===avatar))})}
function showApp(){ $("#auth-screen").hidden=true;if($("#shared-screen"))$("#shared-screen").hidden=true;$("#app-shell").hidden=false;renderProfile(); }
async function authSubmit(e){e.preventDefault();if(!db){$("#auth-message").textContent="The sign-in service could not load. Refresh the page and try again.";return}let email=$("#auth-email").value.trim(),password=$("#auth-password").value;if(!email||!password){$("#auth-message").textContent="Please enter your email and password.";return}let button=$("#auth-submit");button.disabled=true;button.textContent=authMode==="login"?"Signing in…":"Creating account…";$("#auth-message").textContent="Connecting securely…";try{let res=authMode==="login"?await db.auth.signInWithPassword({email,password}):await db.auth.signUp({email,password,options:{emailRedirectTo:window.location.origin+window.location.pathname}});if(res.error)throw res.error;if(authMode==="signup"&&!res.data.session){showAuth("login","Your account has been created. Check your inbox (and spam folder) for the confirmation email, then sign in.");return}user=res.data.user;await enterApp()}catch(err){$("#auth-message").textContent=err.message||"Something went wrong. Please try again."}finally{button.disabled=false;button.textContent=authMode==="login"?"Sign in":"Create account"}}
async function enterApp(){if(!user)return;showApp();$("#auth-message").textContent="";try{await loadAll();await loadSpiceCards();drawSpiceCards();drawMeals();drawSharedMeals();drawFamilyRecipes();drawPlanner();drawShopping();if(!location.hash)history.replaceState({view:"planner"},"",location.pathname+location.search+"#planner");view(currentView(),false);if(pendingShareToken){await copySharedMeal();}}catch(err){toast("Couldn't load your data: "+err.message)}}
async function loadAll(){let fm=await db.from("family_members").select("family_id").limit(1).maybeSingle();if(fm.error)throw fm.error;familyId=fm.data?.family_id||null;let [mr,pr,peopleResult]=await Promise.all([db.from("meals").select("id,owner_id,name,instructions,notes,photo_path,family_id,shared_with_family,meal_types,calories_kcal,protein_g,fiber_g,created_by,created_at,meal_ingredients(id,name,amount,unit,calories_per_100g,ingredient_group,sort_order)").order("created_at",{ascending:true}),db.from("planned_meals").select("id,meal_id,plan_date,slot,portions,person"),db.from("planner_people").select("person_key,label,sort_order,is_active").order("sort_order")]);if(mr.error)throw mr.error;if(pr.error)throw pr.error;if(peopleResult.error)throw peopleResult.error;plannerPeople=peopleResult.data||[];if(!plannerPeople.length){let defaults=[{user_id:user.id,person_key:"me",label:"Your meals",sort_order:0,is_active:true},{user_id:user.id,person_key:"daughter",label:"Daughter’s meals",sort_order:1,is_active:true}];let seeded=await db.from("planner_people").insert(defaults).select("person_key,label,sort_order,is_active");if(seeded.error)throw seeded.error;plannerPeople=seeded.data||[]}meals=(mr.data||[]).map(m=>({...m,photo:"",ingredients:(m.meal_ingredients||[]).sort((a,b)=>a.sort_order-b.sort_order).map(i=>({id:i.id,name:i.name,amount:i.amount===null?"":Number(i.amount),unit:i.unit,caloriesPer100:i.calories_per_100g===null?"":Number(i.calories_per_100g),group:i.ingredient_group}))}));planned=pr.data||[];signedPhotos={};await Promise.all(meals.map(async m=>{if(m.photo_path){let x=await db.storage.from(PHOTO_BUCKET).createSignedUrl(m.photo_path,3600);if(!x.error){m.photo=x.data.signedUrl;signedPhotos[m.id]=m.photo}}}));}
const APP_VIEWS=["planner","meals","shared","family","shopping","spices"];function currentView(){let v=location.hash.replace(/^#/,"").toLowerCase();return APP_VIEWS.includes(v)?v:"planner"}function view(v,updateUrl=true){if(!APP_VIEWS.includes(v))v="planner";if(updateUrl&&location.hash!=="#"+v)history.pushState({view:v},"","#"+v);queryAll(".view").forEach(x=>x.classList.toggle("active",x.id==="view-"+v));queryAll("[data-view]").forEach(x=>x.classList.toggle("active",x.dataset.view===v));$("#breadcrumb-current").textContent=v==="planner"?"WEEKLY PLANNER":v==="family"?"FAMILY RECIPES":v==="shared"?"SHARED MEALS":v==="meals"?"MY MEALS":v==="spices"?"SPICES":v.toUpperCase();if(v==="planner")drawPlanner();if(v==="shopping")drawShopping();if(v==="family")drawFamilyRecipes();if(v==="shared")drawSharedMeals()}
function img(m){return m.photo?'<img src="'+m.photo+'" alt="'+esc(m.name)+'">':'<div class="image-placeholder">✳</div>'}
function summary(m){return(m.ingredients||[]).slice(0,4).map(x=>x.name).filter(Boolean).join(" · ")||"Recipe details"}
function nutritionSummary(m){let values=[["calories_kcal","kcal"],["protein_g","g protein"],["fiber_g","g fibre"]].filter(([key])=>m[key]!==null&&m[key]!==undefined&&m[key]!=="");return values.length?'<div class="meal-nutrition">'+values.map(([key,label])=>'<span>'+esc(Number(m[key]).toLocaleString(undefined,{maximumFractionDigits:1}))+' '+label+'</span>').join('<span class="nutrition-separator">·</span>')+'</div>':""}
function nutritionDetail(m){let values=[["calories_kcal","Calories","kcal"],["protein_g","Protein","g"],["fiber_g","Fibre","g"]].filter(([key])=>m[key]!==null&&m[key]!==undefined&&m[key]!=="");return values.length?'<section class="detail-nutrition"><h3>Nutrition</h3><div class="nutrition-summary-grid">'+values.map(([key,label,unit])=>'<div class="nutrition-summary-item"><strong>'+esc(Number(m[key]).toLocaleString(undefined,{maximumFractionDigits:1}))+'</strong><span>'+label+' · '+unit+'</span></div>').join("")+'</div><p class="nutrition-note">Manually entered values for the whole recipe</p></section>':""}
function mealCards(items){return items.map(m=>'<article class="meal-card" data-meal="'+m.id+'" tabindex="0" role="button" aria-label="Open recipe: '+esc(m.name)+'"><div class="meal-image">'+img(m)+(m.family_id?'<span class="family-recipe-badge">Family Heritage Recipe</span>':"")+'</div><div class="meal-card-body"><h3>'+esc(m.name)+'</h3>'+nutritionSummary(m)+((m.meal_types||[]).length?'<div class="meal-type-tags">'+m.meal_types.map(t=>'<span class="meal-type-tag">'+esc(t)+'</span>').join("")+'</div>':"")+'</div></article>').join("")}
function drawMealTypeFilters(){queryAll("[data-meal-filter]").forEach(b=>{let active=b.dataset.mealFilter===mealTypeFilter;b.classList.toggle("active",active);b.setAttribute("aria-pressed",String(active))})}
function mealTypeMatches(m){return mealTypeFilter==="All"||(m.meal_types||[]).includes(mealTypeFilter)}
function drawMeals(){let myMeals=meals.filter(m=>m.owner_id===user.id),q=$("#meal-search").value.toLowerCase().trim(),items=myMeals.filter(m=>mealTypeMatches(m)&&(m.name+" "+summary(m)).toLowerCase().includes(q));$("#meal-count").textContent=myMeals.length;$("#meal-results").textContent=items.length+" meals";$("#meal-grid").innerHTML=mealCards(items);$("#meal-empty").classList.toggle("show",!myMeals.length);$("#meal-grid").style.display=items.length?"grid":"none";if(myMeals.length&&!items.length){$("#meal-grid").innerHTML='<div class="shopping-empty">No meals found.</div>';$("#meal-grid").style.display="block"}drawMealTypeFilters()}
function drawSharedMeals(){let sharedMeals=meals.filter(m=>m.shared_with_family),items=sharedMeals.filter(mealTypeMatches);$("#shared-count").textContent=sharedMeals.length;$("#shared-results").textContent=items.length+" shared meals";$("#shared-grid").innerHTML=mealCards(items);$("#shared-empty").classList.toggle("show",!sharedMeals.length);$("#shared-grid").style.display=items.length?"grid":"none";if(sharedMeals.length&&!items.length){$("#shared-grid").innerHTML='<div class="shopping-empty">No shared meals in this category.</div>';$("#shared-grid").style.display="block"}drawMealTypeFilters()}
function drawFamilyRecipes(){let familyMeals=meals.filter(m=>m.family_id),items=familyMeals.filter(mealTypeMatches);$("#family-count").textContent=familyMeals.length;$("#family-results").textContent=items.length+" family recipes";$("#family-grid").innerHTML=mealCards(items);$("#family-empty").classList.toggle("show",!familyMeals.length);$("#family-grid").style.display=items.length?"grid":"none";if(familyMeals.length&&!items.length){$("#family-grid").innerHTML='<div class="shopping-empty">No family recipes in this category.</div>';$("#family-grid").style.display="block"}drawMealTypeFilters()}
function selectedMealTypes(){return queryAll(".meal-type-option input:checked").map(x=>x.value)}
function setMealTypes(types=[]){queryAll(".meal-type-option input").forEach(x=>x.checked=types.includes(x.value))}
function mealFormState(){return JSON.stringify({mealTypes:selectedMealTypes(),family:$("#meal-family").checked,shared:$("#meal-shared").checked,calories:$("#meal-calories").value,protein:$("#meal-protein").value,fiber:$("#meal-fiber").value,name:$("#meal-name").value,instructions:$("#meal-instructions").value,notes:$("#meal-notes").value,ingredients:queryAll(".ingredient-row",$("#ingredient-rows")).map(r=>({name:$(".ing-name",r).value,amount:$(".ing-amount",r).value,unit:$(".ing-unit",r).value,caloriesPer100:$(".ing-kcal-per100",r).value})),photo:photoFile?{name:photoFile.name,size:photoFile.size,type:photoFile.type}:null})}
function mealFormDirty(){return mealFormSnapshot!==null&&mealFormState()!==mealFormSnapshot}
function requestMealClose(){if(!mealFormDirty()){$("#meal-dialog").close();return}if(confirm("You have unsaved changes. Save them before closing?\\n\\nOK = Save changes\\nCancel = Choose whether to discard them.")){ $("#meal-form").requestSubmit();return }if(confirm("Discard your unsaved changes and close the meal?")){$("#meal-dialog").close();mealFormSnapshot=null}}
function ingredientCalories(row){let amount=Number($(".ing-amount",row).value),per100=Number($(".ing-kcal-per100",row).value),unit=$(".ing-unit",row).value;if(!Number.isFinite(amount)||amount<=0||$(".ing-kcal-per100",row).value.trim()===""||!Number.isFinite(per100)||per100<0)return null;if(unit==="g")return amount*per100/100;if(unit==="kg")return amount*1000*per100/100;return null}
function calculateRecipeCalories(){let rows=queryAll(".ingredient-row",$("#ingredient-rows")).filter(r=>$(".ing-name",r).value.trim());if(!rows.length)return null;let values=rows.map(ingredientCalories);return values.some(v=>v===null)?null:Math.round(values.reduce((a,b)=>a+b,0)*10)/10}
function updateIngredientCalories(row){let value=ingredientCalories(row);$(".ing-kcal-value",row).textContent=value===null?"—":Math.round(value*10)/10+" kcal";updateRecipeCalories()}
function updateRecipeCalories(){let field=$("#meal-calories");if(!field)return;let total=calculateRecipeCalories();if(total!==null)field.value=total}
function ingredientRow(i={}){let r=document.createElement("div");r.className="ingredient-row";r.innerHTML='<input class="ing-name" placeholder="Ingredient" value="'+esc(i.name||"")+'"><input class="ing-amount" type="number" min="0" step="any" placeholder="Qty" value="'+esc(i.amount??"")+'"><select class="ing-unit">'+["g","kg","ml","l","piece","tbsp","tsp","pinch"].map(u=>'<option '+(u===(i.unit||"g")?"selected":"")+'>'+u+'</option>').join("")+'</select><div class="ing-calories"><strong class="ing-kcal-value">—</strong><input class="ing-kcal-per100" type="number" min="0" step="any" inputmode="decimal" placeholder="kcal / 100 g" value="'+esc(i.caloriesPer100??"")+'"></div><button type="button" aria-label="Remove ingredient">×</button>';r.querySelector(".ing-name").addEventListener("input",()=>updateIngredientCalories(r));r.querySelector(".ing-amount").addEventListener("input",()=>updateIngredientCalories(r));r.querySelector(".ing-unit").addEventListener("change",()=>updateIngredientCalories(r));r.querySelector(".ing-kcal-per100").addEventListener("input",()=>updateIngredientCalories(r));r.querySelector("button").onclick=()=>{r.remove();updateRecipeCalories()};$("#ingredient-rows").append(r);updateIngredientCalories(r)}
function openForm(m){$("#meal-form").reset();$("#meal-id").value=m?.id||"";$("#meal-dialog-title").textContent=m?"Edit meal":"Add a meal";$("#meal-family").checked=!!m?.family_id;$("#meal-shared").checked=m?!!m.shared_with_family:true;setMealTypes(m?.meal_types||[]);$("#meal-calories").value=m?.calories_kcal??"";$("#meal-protein").value=m?.protein_g??"";$("#meal-fiber").value=m?.fiber_g??"";$("#meal-name").value=m?.name||"";$("#meal-instructions").value=m?.instructions||"";$("#meal-notes").value=m?.notes||"";photoFile=null;photoPreview=m?.photo||"";$("#photo-preview").innerHTML=photoPreview?'<img src="'+photoPreview+'" alt="Preview">':"";$("#ingredient-rows").innerHTML="";(m?.ingredients?.length?m.ingredients:[{}]).forEach(ingredientRow);updateRecipeCalories();mealFormSnapshot=mealFormState();$("#meal-dialog").showModal()}
async function compressMealPhoto(file){
  if(file.size>20*1024*1024)throw new Error("This photo is over 20 MB. Please choose a smaller original image.");
  let bitmap;
  try{bitmap=await createImageBitmap(file)}catch(e){throw new Error("This image format isn't supported by your browser. Please choose a JPG, PNG, or WebP photo.")}
  const maxSide=1600,scale=Math.min(1,maxSide/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const ctx=canvas.getContext("2d",{alpha:false});ctx.fillStyle="#ffffff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();
  const encode=(type,quality)=>new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("The browser couldn't optimize this photo.")),type,quality));
  let type="image/webp",blob;
  try{blob=await encode(type,.82)}catch(e){type="image/jpeg";blob=await encode(type,.84)}
  if(!blob||blob.size>4.7*1024*1024){type="image/jpeg";blob=await encode(type,.72)}
  if(!blob||blob.size>4.9*1024*1024)throw new Error("This photo is still too large after compression. Please choose another image.");
  return blob;
}
async function saveMeal(e){e.preventDefault();let name=$("#meal-name").value.trim();if(!name)return;let button=$("#save-meal-button");button.disabled=true;button.textContent="Saving…";try{let mid=$("#meal-id").value,old=meals.find(m=>m.id===mid),mealId=old?.id;let photo_path=old?.photo_path||null;let isFamily=$("#meal-family").checked,isShared=$("#meal-shared").checked,meal_types=selectedMealTypes(),calculatedCalories=calculateRecipeCalories(),calories_kcal=calculatedCalories!==null?calculatedCalories:($("#meal-calories").value.trim()===""?(old?.calories_kcal??null):Number($("#meal-calories").value)),protein_g=$("#meal-protein").value.trim()===""?null:Number($("#meal-protein").value),fiber_g=$("#meal-fiber").value.trim()===""?null:Number($("#meal-fiber").value);if(isFamily&&!familyId)throw new Error("Cires Family membership is not available for this account.");if(!mealId){let r=await db.from("meals").insert({owner_id:user.id,created_by:user.id,family_id:isFamily?familyId:null,shared_with_family:isShared,meal_types,calories_kcal,protein_g,fiber_g,name,instructions:$("#meal-instructions").value.trim(),notes:$("#meal-notes").value.trim()}).select("id").single();if(r.error)throw r.error;mealId=r.data.id}else{let r=await db.from("meals").update({family_id:isFamily?familyId:null,shared_with_family:isShared,meal_types,calories_kcal,protein_g,fiber_g,name,instructions:$("#meal-instructions").value.trim(),notes:$("#meal-notes").value.trim(),updated_at:new Date().toISOString()}).eq("id",mealId);if(r.error)throw r.error}
if(photoFile||(old&&isFamily&&!old.family_id&&photo_path)){let sourceFile=photoFile;if(!sourceFile&&old?.photo){button.textContent="Preparing shared photo…";let response=await fetch(old.photo);if(!response.ok)throw new Error("Could not prepare this photo for family sharing.");let blob=await response.blob();sourceFile=new File([blob],old.name+".jpg",{type:blob.type||"image/jpeg"});}button.textContent="Optimizing photo…";let optimized=await compressMealPhoto(sourceFile);let ext=optimized.type==="image/webp"?"webp":"jpg";button.textContent="Uploading photo…";let path=(isFamily?"family/"+familyId:user.id)+"/"+mealId+"-"+Date.now()+"."+ext;let up=await db.storage.from(PHOTO_BUCKET).upload(path,optimized,{upsert:true,contentType:optimized.type});if(up.error)throw up.error;if(photo_path){await db.storage.from(PHOTO_BUCKET).remove([photo_path])}photo_path=path;let u=await db.from("meals").update({photo_path}).eq("id",mealId);if(u.error)throw u.error}
let ingredients=queryAll(".ingredient-row",$("#ingredient-rows")).map((r,i)=>({meal_id:mealId,owner_id:user.id,name:$(".ing-name",r).value.trim(),amount:$(".ing-amount",r).value===""?null:Number($(".ing-amount",r).value),unit:$(".ing-unit",r).value,calories_per_100g:$(".ing-kcal-per100",r).value.trim()===""?null:Number($(".ing-kcal-per100",r).value),ingredient_group:"",sort_order:i})).filter(i=>i.name);let del=await db.from("meal_ingredients").delete().eq("meal_id",mealId);if(del.error)throw del.error;if(ingredients.length){let ins=await db.from("meal_ingredients").insert(ingredients);if(ins.error)throw ins.error}mealFormSnapshot=null;$("#meal-dialog").close();await loadAll();drawMeals();drawSharedMeals();drawFamilyRecipes();drawPlanner();drawShopping();toast(old?"Meal updated":"Meal saved")}catch(err){toast("Couldn't save meal: "+err.message)}finally{button.disabled=false;button.textContent="Save meal"}}
function detail(mid){
let m=meals.find(x=>x.id===mid);if(!m)return;const owns=m.owner_id===user.id,canCopy=!owns&&m.shared_with_family;
$("#detail-content").innerHTML='<div class="detail-photo">'+img(m)+'<button type="button" class="icon-button close-dialog detail-close" aria-label="Close recipe">×</button></div><div class="detail-content"><div class="eyebrow">'+(m.family_id?"CIRES FAMILY · FAMILY HERITAGE RECIPE":canCopy?"SHARED WITH YOU":"YOUR RECIPE")+'</div><h2>'+esc(m.name)+'</h2><div class="detail-actions"><button class="button primary" id="detail-add">＋ Add to planner</button>'+(owns?'<button class="button light" id="detail-share">↗ Share link</button><button class="button light" id="detail-edit">Edit meal</button><button class="button light" id="detail-delete">Delete</button>':canCopy?'<button class="button light" id="detail-copy">＋ Add to My Meals</button>':'')+'</div><h3>Ingredients</h3><div class="detail-ingredients">'+(m.ingredients||[]).map(i=>{let kcal=i.calories_per_100g!==null&&i.calories_per_100g!==undefined&&i.amount!==""&&(i.unit==="g"||i.unit==="kg")?Number(i.amount)*(i.unit==="kg"?1000:1)*Number(i.calories_per_100g)/100:null;return '<div class="detail-ingredient"><span>'+esc(i.name)+(kcal!==null?'<small class="detail-ingredient-kcal">'+Math.round(kcal*10)/10+' kcal · '+esc(i.calories_per_100g)+' kcal / 100 g</small>':"")+'</span><strong>'+esc(i.amount)+(i.amount!==""?" ":"")+esc(i.unit)+'</strong></div>'}).join("")+'</div>'+nutritionDetail(m)+'<h3>Preparation</h3><div class="detail-instructions">'+esc(m.instructions||"No preparation instructions added yet.")+'</div>'+(m.notes?'<h3>Notes</h3><p class="detail-instructions">'+esc(m.notes)+'</p>':"")+'</div><div class="modal-footer"><button class="button light close-dialog">Close</button></div>';
$("#detail-add").onclick=()=>{$("#detail-dialog").close();view("planner");let preferred=isDaughterMeal(m)?"daughter":"me",target=plannerPeople.find(p=>p.person_key===preferred&&p.is_active)||plannerPeople.find(p=>p.is_active);pick(null,"Dinner",m.id,target?.person_key||"me")};
if(owns){$("#detail-share").onclick=()=>shareMeal(m.id);$("#detail-edit").onclick=()=>{$("#detail-dialog").close();openForm(m)};$("#detail-delete").onclick=async()=>{if(confirm("Delete "+m.name+"?")){let r=await db.from("meals").delete().eq("id",mid);if(r.error){toast(r.error.message);return}meals=meals.filter(x=>x.id!==mid);planned=planned.filter(x=>x.meal_id!==mid);$("#detail-dialog").close();drawMeals();drawSharedMeals();drawFamilyRecipes();drawPlanner();drawShopping();toast("Meal deleted")}}}
if(canCopy)$("#detail-copy").onclick=()=>copyMealToMyMeals(m);$("#detail-dialog").showModal()
}
async function copyMealToMyMeals(m){
const b=$("#detail-copy");if(b){b.disabled=true;b.textContent="Copying…"}
try{const ins=await db.from("meals").insert({owner_id:user.id,created_by:user.id,name:m.name,instructions:m.instructions||"",notes:m.notes||"",meal_types:m.meal_types||[],calories_kcal:m.calories_kcal,protein_g:m.protein_g,fiber_g:m.fiber_g}).select("id").single();if(ins.error)throw ins.error;
const rows=(m.ingredients||[]).map((i,n)=>({meal_id:ins.data.id,owner_id:user.id,name:i.name,amount:i.amount===""?null:i.amount,unit:i.unit||"g",ingredient_group:i.group||"",sort_order:n}));if(rows.length){const ir=await db.from("meal_ingredients").insert(rows);if(ir.error)throw ir.error}
await loadAll();drawMeals();drawSharedMeals();drawPlanner();drawShopping();$("#detail-dialog").close();toast("A separate copy was added to My Meals. You can edit it freely.")
}catch(err){toast("Couldn't copy this recipe: "+err.message);if(b){b.disabled=false;b.textContent="＋ Add to My Meals"}}
}

async function shareMeal(mid){
  const button=$("#detail-share");if(button){button.disabled=true;button.textContent="Creating link…"}
  try{
    const result=await db.rpc("create_meal_share",{p_meal_id:mid});
    if(result.error)throw result.error;
    const url=new URL(window.location.href);url.search="";url.hash="";url.searchParams.set("share",result.data);
    if(navigator.share){try{await navigator.share({title:"A recipe from Cires Family Meal Planner",url:url.toString()});toast("Share link ready");}catch(e){if(e.name!=="AbortError")throw e;}}
    else if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(url.toString());toast("Recipe link copied. Send it to your sister!");}
    else{prompt("Copy this recipe link:",url.toString());}
  }catch(err){toast("Couldn't create share link: "+(err.message||"Please try again."))}
  finally{if(button){button.disabled=false;button.textContent="↗ Share meal"}}
}
function showSharedError(message){$("#shared-content").innerHTML='<div class="shared-error"><div class="eyebrow">CIRES FAMILY MEAL PLANNER</div><h1>Recipe unavailable</h1><p>'+esc(message)+'</p><a class="button light" href="'+esc(location.pathname)+'">Open meal planner</a></div>'}
async function openSharedMeal(){
  $("#auth-screen").hidden=true;$("#app-shell").hidden=true;$("#shared-screen").hidden=false;
  $("#shared-content").innerHTML='<div class="shared-loading">Opening shared recipe…</div>';
  try{
    const result=await db.rpc("get_shared_meal",{p_token:pendingShareToken});
    if(result.error)throw result.error;
    const m=result.data;if(!m)throw new Error("This link may have expired or been turned off by its owner.");
    const ingredients=(m.ingredients||[]).map(i=>'<div class="detail-ingredient"><span>'+esc(i.name)+'</span><strong>'+esc(i.amount??"")+(i.amount!==null&&i.amount!==""?" ":"")+esc(i.unit||"")+'</strong></div>').join("");
    $("#shared-content").innerHTML='<div class="eyebrow">A RECIPE SHARED WITH YOU</div><h1>'+esc(m.name)+'</h1><p class="shared-intro">A recipe from Cires Family Meal Planner</p><h3>Ingredients</h3><div class="detail-ingredients">'+(ingredients||'<p>No ingredients listed.</p>')+'</div><h3>Preparation</h3><div class="detail-instructions">'+esc(m.instructions||"No preparation instructions added yet.")+'</div>'+(m.notes?'<h3>Notes</h3><p class="detail-instructions">'+esc(m.notes)+'</p>':"")+'<div class="shared-actions"><button class="button primary" id="shared-copy">＋ Add to my meals</button><a class="button light" href="'+esc(location.pathname)+'">Open Cires Family Meal Planner</a></div><p class="shared-status" id="shared-status"></p>';
    $("#shared-copy").onclick=copySharedMeal;
  }catch(err){showSharedError(err.message||"Please check the link and try again.")}
}
async function copySharedMeal(){
  if(!user){showAuth("login","Sign in or create an account to add this recipe to your meals.");return}
  const b=$("#shared-copy"),status=$("#shared-status");if(b){b.disabled=true;b.textContent="Adding…"}
  try{
    const result=await db.rpc("copy_shared_meal",{p_token:pendingShareToken});
    if(result.error)throw result.error;
    if(status)status.textContent="Added to your meal collection. You can now edit your own copy.";
    if(b){b.textContent="✓ Added to my meals";b.disabled=true}
  }catch(err){if(status)status.textContent=err.message||"Couldn't add this recipe.";if(b){b.disabled=false;b.textContent="＋ Add to my meals"}}
}

function dateLabel(){let a=week,b=dayDate(6),o={month:"short",day:"numeric"};return a.toLocaleDateString("en-US",o)+" – "+b.toLocaleDateString("en-US",{...o,year:"numeric"})}
function isDaughterMeal(m){return String(m.name||"").trim().startsWith("👧")}
function mealFitsSlot(m,slot){let types=Array.isArray(m.meal_types)?m.meal_types:[];return types.length===0||types.includes(slot)}
function drawPlanner(){
 $("#week-label").textContent=dateLabel();
 const todayDate=new Date();todayDate.setHours(0,0,0,0);
 const today=dateKey(todayDate),todayIndex=(todayDate.getDay()+1)%7;
 const order=Array.from({length:7},(_,n)=>(todayIndex+n)%7);
 const activePeople=plannerPeople.filter(p=>p.is_active).sort((a,b)=>a.sort_order-b.sort_order);
 $("#week-grid").innerHTML=order.map(i=>{
  const d=DAYS[i],dt=dayDate(i),dk=dateKey(dt),items=planned.filter(e=>e.plan_date===dk);
  const isToday=dk===today,isPast=dk<today;
  const renderPerson=person=>{
   let rowItems=items.filter(e=>(e.person||"me")===person.person_key),totals={calories:0,protein:0,fiber:0},has={calories:false,protein:false,fiber:false};
   rowItems.forEach(e=>{let m=meals.find(x=>x.id===e.meal_id);if(!m)return;[["calories_kcal","calories"],["protein_g","protein"],["fiber_g","fiber"]].forEach(([key,target])=>{if(m[key]!==null&&m[key]!==undefined&&m[key]!==""&&Number.isFinite(Number(m[key]))){totals[target]+=Number(m[key])*Number(e.portions||1);has[target]=true}})});
   let nutrition=(has.calories?'<span><strong>'+Math.round(totals.calories).toLocaleString()+'</strong> kcal</span>':"")+(has.protein?'<span><strong>'+Math.round(totals.protein*10)/10+'</strong> g protein</span>':"")+(has.fiber?'<span><strong>'+Math.round(totals.fiber*10)/10+'</strong> g fibre</span>':"");
   return '<div class="day-meal-row"><div class="meal-row-heading"><div class="person-heading-tools"><strong>'+esc(person.label)+'</strong><span><button class="person-edit" data-person-action="rename" data-person="'+esc(person.person_key)+'" title="Rename person" aria-label="Rename '+esc(person.label)+'">✎</button><button class="person-remove" data-person-action="remove" data-person="'+esc(person.person_key)+'" title="Remove person" aria-label="Remove '+esc(person.label)+'">×</button></span></div>'+(nutrition?'<div class="day-nutrition">'+nutrition+'</div>':"")+'</div><div class="day-slots">'+SLOTS.map(slot=>'<div class="slot"><div class="slot-name">'+slot+'</div>'+rowItems.filter(e=>e.slot===slot).map(e=>{let m=meals.find(x=>x.id===e.meal_id);return m?'<div class="planned-meal" data-meal="'+m.id+'" tabindex="0" role="button" aria-label="Open recipe: '+esc(m.name)+'">'+(m.photo?'<img class="planned-thumb" src="'+m.photo+'" alt="'+esc(m.name)+'">':"")+'<strong>'+esc(m.name)+'</strong><small>'+e.portions+' '+(Number(e.portions)===1?"portion":"portions")+'</small><div class="meal-actions"><button data-act="edit" data-entry="'+e.id+'">Edit</button><button data-act="remove" data-entry="'+e.id+'">×</button></div></div>':""}).join("")+'<button class="add-slot" data-day="'+dk+'" data-slot="'+slot+'" data-person="'+esc(person.person_key)+'">＋ Add</button></div>').join("")+'</div></div>';
  };
  return '<section class="day-column day-'+i+(isToday?" today-day":"")+(isPast?" past-day":"")+'"><div class="day-heading"><div class="day-date"><strong>'+d+'</strong>'+(isToday?'<span class="today-label">Today</span>':"")+'<small>'+dt.toLocaleDateString("en-US",{month:"short",day:"numeric"})+'</small></div></div><div class="day-people">'+activePeople.map(renderPerson).join("")+'</div></section>';
 }).join("");
}
async function addPlannerPerson(){
 let label=prompt("What should this person’s row be called?");if(label===null)return;label=label.trim();if(!label){toast("Please enter a name.");return}
 let existing=plannerPeople.find(p=>!p.is_active&&p.label.toLowerCase()===label.toLowerCase());
 if(existing){let r=await db.from("planner_people").update({is_active:true}).eq("user_id",user.id).eq("person_key",existing.person_key);if(r.error){toast(r.error.message);return}existing.is_active=true;existing.sort_order=plannerPeople.filter(p=>p.is_active).length;drawPlanner();toast("Person added again. Their previous planned meals are still here.");return}
 let key="p"+crypto.randomUUID().replace(/-/g,"").slice(0,16),sort_order=plannerPeople.length;
 let r=await db.from("planner_people").insert({user_id:user.id,person_key:key,label,sort_order,is_active:true}).select("person_key,label,sort_order,is_active").single();if(r.error){toast(r.error.message);return}plannerPeople.push(r.data);drawPlanner();toast(label+" added to your planner.");
}
async function updatePlannerPerson(key,action){
 let person=plannerPeople.find(p=>p.person_key===key);if(!person)return;
 if(action==="remove"){if(!confirm("Remove "+person.label+" from the planner? Their planned meals will be kept and can be restored by adding this person again."))return;let r=await db.from("planner_people").update({is_active:false}).eq("user_id",user.id).eq("person_key",key);if(r.error){toast(r.error.message);return}person.is_active=false;drawPlanner();toast(person.label+" hidden. Their planned meals are preserved.");return}
 let label=prompt("Edit this person’s name:",person.label);if(label===null)return;label=label.trim();if(!label){toast("Please enter a name.");return}let r=await db.from("planner_people").update({label}).eq("user_id",user.id).eq("person_key",key);if(r.error){toast(r.error.message);return}person.label=label;drawPlanner();toast("Name updated.");
}
async function shuffleWeek(){
 const ownMeals=meals.filter(m=>m.owner_id===user.id),activePeople=plannerPeople.filter(p=>p.is_active).sort((a,b)=>a.sort_order-b.sort_order);
 if(!ownMeals.length){toast("Add some recipes to My Meals first.");view("meals");return}
 if(!activePeople.length){toast("Add at least one person to your planner first.");return}
 const startDate=dateKey(week),endDate=dateKey(dayDate(6));
 if(!confirm("Create a new week from your My Meals recipes? Your current planned meals for this week will be replaced. Snacks will be left empty."))return;
 const counts=new Map(),lastUsed=new Map(),generated=[],days=Array.from({length:7},(_,i)=>dateKey(dayDate(i)));
 for(let dayIndex=0;dayIndex<7;dayIndex++){
  const usedToday=new Set();
  for(const person of activePeople)for(const slot of ["Breakfast","Lunch","Dinner"]){
   let candidates=ownMeals.filter(m=>mealFitsSlot(m,slot)&&(person.person_key!=="me"||!isDaughterMeal(m)));
   if(!candidates.length)continue;
   let available=candidates.filter(m=>!usedToday.has(m.id));if(!available.length)available=candidates;
   const ranked=available.map(m=>{const key=person.person_key+"|"+slot+"|"+m.id,uses=counts.get(key)||0,last=lastUsed.get(key),recentPenalty=last===dayIndex-1?1.25:0;return{m,score:uses*2+recentPenalty+Math.random()*1.2}}).sort((x,y)=>x.score-y.score);
   const chosen=ranked[0].m,key=person.person_key+"|"+slot+"|"+chosen.id;
   generated.push({owner_id:user.id,meal_id:chosen.id,plan_date:days[dayIndex],slot,portions:1,person:person.person_key});
   counts.set(key,(counts.get(key)||0)+1);lastUsed.set(key,dayIndex);usedToday.add(chosen.id);
  }
 }
 if(!generated.length){toast("No suitable breakfast, lunch, or dinner recipes were found.");return}
 try{
  const inserted=await db.from("planned_meals").insert(generated).select("id,meal_id,plan_date,slot,portions,person");if(inserted.error)throw inserted.error;
  const oldDelete=await db.from("planned_meals").delete().eq("owner_id",user.id).gte("plan_date",startDate).lte("plan_date",endDate).not("id","in","("+inserted.data.map(x=>x.id).join(",")+")");
  if(oldDelete.error){await db.from("planned_meals").delete().in("id",inserted.data.map(x=>x.id));throw oldDelete.error}
  planned=planned.filter(e=>e.plan_date<startDate||e.plan_date>endDate).concat(inserted.data);drawPlanner();drawShopping();
  toast(generated.length<42?"New week created. Some slots stayed empty because no suitable recipes were available.":"Your new week is ready!");
 }catch(err){toast("Couldn't shuffle the week: "+(err.message||"Please try again."))}
}
function pick(d,slot,mealId=null,person="me"){$("#picker-day").value=d||dateKey(week);$("#picker-slot").value=slot||"Dinner";$("#picker-person").value=person;$("#picker-search").value="";drawPicker();$("#picker-dialog").showModal();if(mealId){let target=$("#picker-meals [data-pick=\""+mealId+"\"]");if(target)target.click()}}
function drawPicker(){let q=$("#picker-search").value.toLowerCase().trim(),person=$("#picker-person").value||"me",items=meals.filter(m=>(person!=="me"||!isDaughterMeal(m))&&(m.name+" "+summary(m)).toLowerCase().includes(q));$("#picker-meals").innerHTML=items.length?items.map(m=>'<button class="picker-meal" data-pick="'+m.id+'">'+(m.photo?'<img class="picker-thumb" src="'+m.photo+'">':'<span class="picker-placeholder">✳</span>')+'<span><strong>'+esc(m.name)+'</strong><small>'+esc(summary(m))+'</small></span></button>').join(""):'<div class="shopping-empty">No saved meals yet.</div>'}
async function addEntry(mid,day,slot,portions=1,person="me"){let r=await db.from("planned_meals").insert({owner_id:user.id,meal_id:mid,plan_date:day,slot,portions,person}).select().single();if(r.error){toast(r.error.message);return}planned.push(r.data);drawPlanner();drawShopping();toast("Added to your weekly plan")}
async function plannerClick(e){let b=e.target.closest("[data-day][data-slot]");if(b){if(!meals.length){toast("Add meals to your library first.");view("meals")}else pick(b.dataset.day,b.dataset.slot,null,b.dataset.person||"me");return}let a=e.target.closest("[data-act]");if(!a)return;let entry=planned.find(x=>x.id===a.dataset.entry);if(!entry)return;if(a.dataset.act==="remove"){let r=await db.from("planned_meals").delete().eq("id",entry.id);if(r.error){toast(r.error.message);return}planned=planned.filter(x=>x.id!==entry.id);drawPlanner();drawShopping()}else{let n=prompt("How many portions?",entry.portions);if(n!==null&&Number(n)>0){let r=await db.from("planned_meals").update({portions:Number(n)}).eq("id",entry.id);if(r.error){toast(r.error.message);return}entry.portions=Number(n);drawPlanner();drawShopping()}}}
async function clearWeek(){
 const startDate=dateKey(week),endDate=dateKey(dayDate(6)),entries=weekItems();
 if(!entries.length){toast("This week is already empty.");return}
 if(!confirm("Are you sure you want to delete everything?"))return;
 try{
  const result=await db.from("planned_meals").delete().eq("owner_id",user.id).gte("plan_date",startDate).lte("plan_date",endDate);
  if(result.error)throw result.error;
  planned=planned.filter(e=>e.plan_date<startDate||e.plan_date>endDate);
  drawPlanner();drawShopping();toast("This week's plan has been cleared.");
 }catch(err){toast("Couldn't clear this week: "+(err.message||"Please try again."))}
}
function weekItems(){let start=dateKey(week),end=dateKey(dayDate(6));return planned.filter(e=>e.plan_date>=start&&e.plan_date<=end)}
function amounts(){let sum=new Map();weekItems().forEach(e=>{let m=meals.find(x=>x.id===e.meal_id);if(!m)return;(m.ingredients||[]).forEach(i=>{if(i.amount===null||i.amount===""||!Number.isFinite(Number(i.amount))||!i.name)return;let unit=i.unit||"g",k=i.name.trim().toLowerCase()+"|"+unit,it=sum.get(k)||{name:i.name.trim(),unit,amount:0};it.amount+=Number(i.amount)*Number(e.portions||1);sum.set(k,it)})});return[...sum.values()].sort((a,b)=>a.name.localeCompare(b.name))}
function drawShopping(){let items=amounts(),n=weekItems().length;$("#shopping-summary").innerHTML='<div class="summary-card"><strong>'+items.length+'</strong><small>Different ingredients</small></div><div class="summary-card"><strong>'+n+'</strong><small>Planned meal entries</small></div>';$("#shopping-list").innerHTML=items.length?items.map(i=>'<div class="shopping-row"><input type="checkbox"><label>'+esc(i.name)+'</label><span class="amount">'+(Number.isInteger(i.amount)?i.amount:Math.round(i.amount*100)/100)+' '+esc(i.unit)+'</span></div>').join(""):'<div class="shopping-empty">Your shopping list is empty.<br>Add meals to your weekly planner to calculate ingredients.</div>'}

async function loadSpiceCards(){
 let result=await db.from("spice_cards").select("id,owner_id,title,description,ingredients,notes,image_url,created_at,updated_at").order("updated_at",{ascending:false});
 if(result.error)throw result.error;
 spiceCards=result.data||[];
 if(!spiceCards.length){
  const seed={owner_id:user.id,title:"Pumpkin",description:"Pumpkin has a mild, naturally sweet, earthy flavor and becomes soft and buttery when cooked. Its gentle sweetness works in two directions: warm spices can deepen its sweet, comforting character, while toasted spices and green herbs bring out a more savory, earthy side. These are useful starting points rather than strict rules.",ingredients:[
   {group:"Warm & sweet",name:"Cinnamon stick"},{group:"Warm & sweet",name:"Fresh ginger"},{group:"Warm & sweet",name:"Nutmeg"},{group:"Warm & sweet",name:"Whole cloves"},
   {group:"Savory & earthy",name:"Cumin seeds"},{group:"Savory & earthy",name:"Coriander seeds"},{group:"Savory & earthy",name:"Smoked paprika"},{group:"Savory & earthy",name:"Fresh sage leaves"},{group:"Savory & earthy",name:"Thyme"},{group:"Savory & earthy",name:"Black pepper"}
  ],notes:"Try the two directions separately first. For a warm version, use cinnamon, ginger and a little nutmeg. For a savory version, toast cumin and coriander seeds briefly, then add smoked paprika, black pepper and sage or thyme.\n\nLater, add your own shop links or links to ready-made spice blends here."};
  const created=await db.from("spice_cards").insert(seed).select("id,owner_id,title,description,ingredients,notes,image_url,created_at,updated_at").single();
  if(created.error)throw created.error;
  spiceCards=[created.data];
 }
}
function spiceCardMarkup(card){
 const names=(card.ingredients||[]).slice(0,4).map(x=>x.name).join(" · ");
 return '<article class="spice-card" data-spice-card="'+card.id+'" tabindex="0" role="button" aria-label="Open '+esc(card.title)+' flavour card"><div class="spice-card-image">'+(card.image_url?'<img src="'+esc(card.image_url)+'" alt="'+esc(card.title)+' and its whole spice pairings">':'<div class="spice-image-placeholder"><span>✿</span><small>Ingredient photo to come</small></div>')+'</div><div class="spice-card-body"><div class="eyebrow">FLAVOUR PROFILE</div><h2>'+esc(card.title)+'</h2><p>'+esc(card.description)+'</p><div class="spice-card-preview">'+esc(names)+(card.ingredients?.length>4?' · …':'')+'</div><span class="spice-card-open">Explore pairings →</span></div></article>';
}
function drawSpiceCards(){
 const grid=$("#spice-card-grid");if(!grid)return;
 grid.innerHTML=spiceCards.map(spiceCardMarkup).join("");
 $("#spice-card-count").textContent=spiceCards.length+" "+(spiceCards.length===1?"card":"cards");
 $("#spice-empty").hidden=spiceCards.length>0;
}
function openSpiceDetail(id){
 const card=spiceCards.find(x=>x.id===id);if(!card)return;
 const groups={};(card.ingredients||[]).forEach(item=>{const group=item.group||"Ingredients";(groups[group]??=[]).push(item.name)});
 const ingredients=Object.entries(groups).map(([group,names])=>'<section class="spice-detail-group"><h3>'+esc(group)+'</h3><ul>'+names.map(n=>'<li>'+esc(n)+'</li>').join("")+'</ul></section>').join("");
 const notes=esc(card.notes||"No notes yet.").replace(/(https?:\/\/[^\s<]+)/g,'<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
 $("#spice-detail-content").innerHTML='<div class="spice-detail-hero">'+(card.image_url?'<img src="'+esc(card.image_url)+'" alt="'+esc(card.title)+'">':'<div class="spice-detail-placeholder">✿<small>Whole ingredients photo will be added later</small></div>')+'</div><div class="spice-detail-inner"><div class="eyebrow">FLAVOUR PROFILE</div><h2>'+esc(card.title)+'</h2><p class="spice-detail-description">'+esc(card.description)+'</p><h3>Ingredients that pair well</h3>'+ingredients+'<section class="spice-notes"><h3>Notes & useful links</h3><p>'+notes+'</p></section><div class="modal-footer spice-detail-actions"><button type="button" class="button light" data-spice-edit="'+card.id+'">Edit card</button><button type="button" class="button light" data-spice-delete="'+card.id+'">Delete</button><button type="button" class="button primary" data-spice-close>Close</button></div></div>';
 $("#spice-detail-dialog").showModal();
}
function parseSpiceIngredients(value){
 return value.split("\n").map(line=>line.trim()).filter(Boolean).map(line=>{const i=line.indexOf(":");return i>0?{group:line.slice(0,i).trim(),name:line.slice(i+1).trim()}:{group:"Ingredients",name:line}}).filter(x=>x.name);
}
function openSpiceForm(card){
 spiceEditingId=card?.id||null;
 $("#spice-form").reset();$("#spice-form-title").textContent=card?"Edit flavour card":"Add a flavour card";
 $("#spice-title").value=card?.title||"";$("#spice-description").value=card?.description||"";
 $("#spice-ingredients").value=(card?.ingredients||[]).map(x=>(x.group&&x.group!=="Ingredients"?x.group+": ":"")+x.name).join("\n");
 $("#spice-notes").value=card?.notes||"";
 $("#spice-form-dialog").showModal();
}
async function saveSpiceCard(e){
 e.preventDefault();const button=$("#save-spice-card");button.disabled=true;button.textContent="Saving…";
 try{
  const payload={owner_id:user.id,title:$("#spice-title").value.trim(),description:$("#spice-description").value.trim(),ingredients:parseSpiceIngredients($("#spice-ingredients").value),notes:$("#spice-notes").value.trim(),updated_at:new Date().toISOString()};
  if(spiceEditingId){const r=await db.from("spice_cards").update(payload).eq("id",spiceEditingId).select("id,owner_id,title,description,ingredients,notes,image_url,created_at,updated_at").single();if(r.error)throw r.error;spiceCards=spiceCards.map(x=>x.id===spiceEditingId?r.data:x);}
  else{const r=await db.from("spice_cards").insert(payload).select("id,owner_id,title,description,ingredients,notes,image_url,created_at,updated_at").single();if(r.error)throw r.error;spiceCards.unshift(r.data);}
  $("#spice-form-dialog").close();$("#spice-detail-dialog").close();drawSpiceCards();toast("Flavour card saved.");
 }catch(err){toast("Couldn't save the card: "+(err.message||"Please try again."));}
 finally{button.disabled=false;button.textContent="Save card";}
}
async function deleteSpiceCard(id){
 const card=spiceCards.find(x=>x.id===id);if(!card||!confirm("Delete the "+card.title+" card? This cannot be undone."))return;
 const r=await db.from("spice_cards").delete().eq("id",id);if(r.error){toast("Couldn't delete the card: "+r.error.message);return;}
 spiceCards=spiceCards.filter(x=>x.id!==id);$("#spice-detail-dialog").close();drawSpiceCards();toast("Card deleted.");
}
\nfunction printView(v){queryAll(".view").forEach(x=>x.classList.toggle("print-target",x.id==="view-"+v));window.print();setTimeout(()=>queryAll(".view").forEach(x=>x.classList.remove("print-target")),500)}
function download(data,name){let a=document.createElement("a"),u=URL.createObjectURL(new Blob([data],{type:"application/json"}));a.href=u;a.download=name;a.click();URL.revokeObjectURL(u)}
async function exportData(){let payload={app:"Cires Family Meal Planner",version:2,meals:meals.map(({id,name,instructions,notes,ingredients,meal_types,calories_kcal,protein_g,fiber_g})=>({id,name,instructions,notes,ingredients,meal_types:meal_types||[],calories_kcal,protein_g,fiber_g})),planned_meals:planned};download(JSON.stringify(payload,null,2),"cires-family-meal-planner-backup.json")}
async function importData(e){let f=e.target.files[0];if(!f)return;try{let d=JSON.parse(await f.text());if(!Array.isArray(d.meals))throw Error("Invalid backup");if(!confirm("Import these meals into your account? Existing meals will not be deleted."))return;for(let m of d.meals){let ins=await db.from("meals").insert({owner_id:user.id,name:m.name,instructions:m.instructions||"",notes:m.notes||"",meal_types:Array.isArray(m.meal_types)?m.meal_types:[],calories_kcal:m.calories_kcal??null,protein_g:m.protein_g??null,fiber_g:m.fiber_g??null}).select("id").single();if(ins.error)throw ins.error;let mealId=ins.data.id;let rows=(m.ingredients||[]).map((i,n)=>({meal_id:mealId,owner_id:user.id,name:i.name,amount:i.amount===""?null:i.amount,unit:i.unit||"g",ingredient_group:i.group||"",sort_order:n}));if(rows.length){let ir=await db.from("meal_ingredients").insert(rows);if(ir.error)throw ir.error}if(m.photo_data){let source=await fetch(m.photo_data);let original=await source.blob();let optimized=await compressMealPhoto(new File([original],"recipe-photo",{type:original.type||"image/png"}));let ext=optimized.type==="image/webp"?"webp":"jpg";let path=user.id+"/"+mealId+"-"+Date.now()+"."+ext;let up=await db.storage.from(PHOTO_BUCKET).upload(path,optimized,{upsert:true,contentType:optimized.type});if(up.error)throw up.error;let pr=await db.from("meals").update({photo_path:path}).eq("id",mealId);if(pr.error)throw pr.error}}await loadAll();drawMeals();drawPlanner();drawShopping();toast("Recipe backup imported")}catch(err){toast("Import failed: "+err.message)}finally{e.target.value=""}}
async function init(){ 
$("#auth-form").onsubmit=authSubmit;
$("#auth-switch").onclick=()=>{showAuth(authMode==="login"?"signup":"login");$("#auth-password").value="";$("#auth-email").focus()};
if(!db){showAuth("login","The sign-in service did not load. Please refresh the page. If this continues, tell me.");return}
if(pendingShareToken){await openSharedMeal();const {data:{session}}=await db.auth.getSession();if(session?.user){user=session.user;}return}
$("#today-label").textContent=new Date().toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"});
queryAll("[data-view]").forEach(b=>b.onclick=()=>view(b.dataset.view));$("#add-spice-card").onclick=()=>openSpiceForm();$("#spice-form").onsubmit=saveSpiceCard;$("#spice-card-grid").onclick=e=>{const c=e.target.closest("[data-spice-card]");if(c)openSpiceDetail(c.dataset.spiceCard)};$("#spice-card-grid").onkeydown=e=>{if(e.key==="Enter"||e.key===" "){const c=e.target.closest("[data-spice-card]");if(c){e.preventDefault();openSpiceDetail(c.dataset.spiceCard)}}};$("#spice-detail-content").onclick=e=>{const edit=e.target.closest("[data-spice-edit]"),del=e.target.closest("[data-spice-delete]");if(edit){const c=spiceCards.find(x=>x.id===edit.dataset.spiceEdit);$("#spice-detail-dialog").close();openSpiceForm(c)}if(del)deleteSpiceCard(del.dataset.spiceDelete);if(e.target.closest("[data-spice-close]"))$("#spice-detail-dialog").close()};window.addEventListener("popstate",()=>{if(user&&!$("#app-shell").hidden)view(currentView(),false)});window.addEventListener("hashchange",()=>{if(user&&!$("#app-shell").hidden)view(currentView(),false)});
$("#add-meal").onclick=$("#empty-add-meal").onclick=()=>openForm();$("#family-add-meal").onclick=$("#family-empty-add").onclick=()=>{openForm();$("#meal-family").checked=true;};
$("#meal-search").oninput=drawMeals;queryAll("[data-meal-filter]").forEach(b=>b.onclick=()=>{mealTypeFilter=b.dataset.mealFilter;drawMeals();drawFamilyRecipes()});$("#meal-form").onsubmit=saveMeal;$("#add-ingredient").onclick=()=>ingredientRow();
function selectMealPhoto(e){let f=e.target.files[0];if(!f)return;if(f.size>20*1024*1024){toast("Choose an original photo under 20 MB.");e.target.value="";return}photoFile=f;let reader=new FileReader();reader.onload=()=>{$("#photo-preview").innerHTML='<img src="'+reader.result+'" alt="Preview">'};reader.readAsDataURL(f)};$("#meal-photo").onchange=selectMealPhoto;$("#meal-camera").onchange=selectMealPhoto;
$("#meal-grid").onclick=$("#family-grid").onclick=$("#shared-grid").onclick=e=>{let c=e.target.closest("[data-meal]");if(c)detail(c.dataset.meal)};
document.addEventListener("click",e=>{if(e.target instanceof HTMLDialogElement&&e.target.open){if(e.target.id==="meal-dialog")requestMealClose();else e.target.close();return}let b=e.target.closest(".close-dialog");if(b){let d=b.closest("dialog");if(d?.id==="meal-dialog")requestMealClose();else d?.close()}});$("#meal-dialog").addEventListener("cancel",e=>{e.preventDefault();requestMealClose()});
$("#prev-week").onclick=()=>{week.setDate(week.getDate()-7);drawPlanner();drawShopping()};
$("#next-week").onclick=()=>{week.setDate(week.getDate()+7);drawPlanner();drawShopping()};
$("#this-week").onclick=()=>{week=startWeek(new Date());drawPlanner();drawShopping()};
$("#week-grid").onclick=e=>{let control=e.target.closest("[data-person-action]");if(control){updatePlannerPerson(control.dataset.person,control.dataset.personAction);return}let card=e.target.closest(".planned-meal[data-meal]");if(card&&!e.target.closest("button")){detail(card.dataset.meal);return}plannerClick(e)};$("#week-grid").onkeydown=e=>{if(e.key!=="Enter"&&e.key!==" ")return;let card=e.target.closest(".planned-meal[data-meal]");if(card){e.preventDefault();detail(card.dataset.meal)}};$("#add-planner-person").onclick=addPlannerPerson;$("#picker-search").oninput=drawPicker;$("#shuffle-week").onclick=shuffleWeek;
$("#clear-week").onclick=clearWeek;$("#picker-portions").value="1";$("#picker-meals").onclick=e=>{let b=e.target.closest("[data-pick]");if(b){let portions=Math.max(1,Math.min(99,Math.floor(Number($("#picker-portions").value)||1)));addEntry(b.dataset.pick,$("#picker-day").value,$("#picker-slot").value,portions,$("#picker-person").value||"me");$("#picker-dialog").close()}};
$("#print-menu").onclick=()=>printView("planner");$("#print-shopping").onclick=()=>printView("shopping");
$("#profile-toggle").onclick=()=>{const menu=$("#profile-menu");menu.hidden=!menu.hidden;$("#profile-toggle").setAttribute("aria-expanded",String(!menu.hidden))};
document.addEventListener("click",e=>{if(!e.target.closest(".profile-wrap")){$("#profile-menu").hidden=true;$("#profile-toggle").setAttribute("aria-expanded","false")}});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("#profile-menu").hidden){$("#profile-menu").hidden=true;$("#profile-toggle").setAttribute("aria-expanded","false")}});
$("#profile-menu").onclick=async e=>{
 const button=e.target.closest("[data-avatar]");if(!button)return;
 e.preventDefault();e.stopPropagation();
 const emoji=button.dataset.avatar,previous=user?.user_metadata?.avatar_emoji||"🌿";
 if(emoji===previous){toast("That's already your avatar.");return}
 queryAll("[data-avatar]").forEach(b=>b.disabled=true);
 $("#profile-toggle").textContent=emoji;$("#profile-avatar-preview").textContent=emoji;
 try{
  const result=await db.auth.updateUser({data:{avatar_emoji:emoji}});
  if(result.error)throw result.error;
  user=result.data.user;renderProfile();toast("Profile avatar updated.");
 }catch(err){
  $("#profile-toggle").textContent=previous;$("#profile-avatar-preview").textContent=previous;renderProfile();
  toast("Couldn't save your avatar: "+(err.message||"Please try again."));
 }finally{queryAll("[data-avatar]").forEach(b=>b.disabled=false)}
};
$("#export-data").onclick=exportData;$("#import-data").onchange=importData;
$("#sign-out").onclick=async()=>{await db.auth.signOut();user=null;meals=[];planned=[];spiceCards=[];showAuth("login","You have signed out.")};
db.auth.onAuthStateChange((event,session)=>{if(event==="INITIAL_SESSION")return;if(session?.user){user=session.user;if($("#app-shell").hidden){const sessionUserId=session.user.id;window.setTimeout(()=>{if(user?.id===sessionUserId&&$("#app-shell").hidden)enterApp()},0)}}else if(event==="SIGNED_OUT"){user=null;meals=[];planned=[];showAuth("login")}});
let {data:{session},error}=await db.auth.getSession();if(error){showAuth("login",error.message);return}if(session?.user){user=session.user;await enterApp()}else showAuth("login")
}
document.addEventListener("DOMContentLoaded",init);
