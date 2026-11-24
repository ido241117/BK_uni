// ===== Dữ liệu mẫu (không phải lộ trình thật) =====
const SEMS=[{c:'262',m:1},{c:'263',m:0},{c:'271',m:1},{c:'272',m:1},{c:'273',m:0},{c:'281',m:1},{c:'282',m:1},{c:'283',m:0}];
const IDX={};SEMS.forEach((s,i)=>IDX[s.c]=i);
// [mã, tên, TC, tiên quyết, đồ án, từng mở hè, kỳ khuyến nghị]
const REQ=[
 ['CO2013','Hệ cơ sở dữ liệu',4,[],0,1,'262'],
 ['CO3001','Công nghệ phần mềm',3,['CO2039'],0,0,'262'],
 ['CO3093','Mạng máy tính',3,[],0,1,'262'],
 ['CO3005','Nguyên lý ngôn ngữ lập trình',4,[],0,0,'262'],
 ['SP1007','Pháp luật Việt Nam',2,[],0,1,'262'],
 ['CO3021','Hệ quản trị CSDL',3,['CO2013'],0,0,'271'],
 ['CO3011','Quản lý dự án phần mềm',3,['CO3001'],0,0,'271'],
 ['CO3015','Kiểm thử phần mềm',3,['CO3001'],0,0,'271'],
 ['SP1035','Chủ nghĩa xã hội khoa học',2,[],0,1,'271'],
 ['CO3067','Tính toán song song',3,[],0,0,'272'],
 ['IM3001','Quản trị kinh doanh',3,[],0,1,'272'],
 ['SP1039','Lịch sử Đảng',2,[],0,1,'272'],
 ['CO3335','Thực tập ngoài trường',2,['CO3001'],0,1,'273'],
 ['CO4029','Đồ án chuyên ngành',2,['CO3011'],1,0,'272'],
 ['CO4337','Đồ án tốt nghiệp',4,['CO4029'],1,0,'281']
];
const POOL={CO3029:{n:'Khai phá dữ liệu',tc:3,pre:['MT2013'],sum:0},CO3061:{n:'Nhập môn trí tuệ nhân tạo',tc:3,pre:[],sum:1},
 CO3117:{n:'Học máy',tc:3,pre:['CO3061'],sum:0},CO3059:{n:'Đồ họa máy tính',tc:3,pre:[],sum:0},CO3065:{n:'CNPM nâng cao',tc:3,pre:['CO3001'],sum:0}};
const INPROG={CO2039:{n:'Lập trình nâng cao',tc:3},MT2013:{n:'Xác suất thống kê',tc:4}};
const SLOT_REC=['271','272','281'];
const PRIO={S1:'Ra trường sớm nhất',S8:'Mỗi kỳ chính 15–18 TC',S2:'Không học dư môn tự chọn'};
const KEY='bkuni-whatif-mau-12';
const clone=o=>JSON.parse(JSON.stringify(o));
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function fresh(){return{inprog:{CO2039:'pass',MT2013:'pass'},pins:{},notOff:{},fails:{},skip:[],summers:['263'],targets:{},
 prio:[{id:'S1',on:true},{id:'S8',on:true},{id:'S2',on:true}],elect:['CO3029','CO3061','CO3117'],free:'',offerOk:{}};}

// ===== Danh sách môn cần xếp =====
function items(S){
 const L=[];
 REQ.forEach(r=>L.push({id:r[0],code:r[0],name:r[1],tc:r[2],kind:'req',pre:r[3],proj:!!r[4],sum:!!r[5],rec:r[6]}));
 S.elect.forEach((c,i)=>{const p=POOL[c];L.push({id:'E'+(i+1),slot:i,code:c,name:p.n,tc:p.tc,kind:'elect',pre:p.pre,proj:false,sum:!!p.sum,rec:SLOT_REC[i]});});
 L.push({id:'F1',code:S.free||'',name:S.free?'Tự chọn tự do':'Ô tự chọn tự do',tc:3,kind:'free',pre:[],proj:false,sum:true,rec:'281'});
 Object.keys(INPROG).forEach(c=>{if(S.inprog[c]==='fail')L.push({id:'R:'+c,code:c,name:INPROG[c].n,tc:INPROG[c].tc,kind:'retake',pre:[],proj:false,sum:true,rec:'262'});});
 Object.keys(S.fails).forEach(id=>{const b=L.find(x=>x.id===id);if(b)L.push(Object.assign({},b,{id:'R:'+id,kind:'retake',of:id,rec:null}));});
 return L;
}
function needs(S,it,L){
 const ids=[],missing=[];
 it.pre.forEach(c=>{
  if(INPROG[c]){if(S.inprog[c]==='fail')ids.push('R:'+c);return;}
  const t=L.find(x=>x.code===c&&x.kind!=='retake');
  if(t){ids.push(S.fails[t.id]?'R:'+t.id:t.id);return;}
  if(POOL[c])missing.push(c);
 });
 return{ids,missing};
}
function codeOf(S,id){const x=items(S).find(y=>y.id===id);return x?(x.code||'ô tự do'):id;}
function active(S,i){const s=SEMS[i];return s.m?!S.skip.includes(s.c):S.summers.includes(s.c);}
function prioInfo(S){const p=id=>S.prio.findIndex(x=>x.id===id),on=id=>S.prio[p(id)].on;
 return{s8:on('S8'),s8first:on('S8')&&(!on('S1')||p('S8')<p('S1'))};}
function capOf(S,i,pi){const s=SEMS[i];if(S.targets[s.c]!=null)return S.targets[s.c];return s.m?pi.mainCap:9;}
const lawOf=i=>SEMS[i].m?25:12;
const dedupe=a=>a.filter((x,i)=>a.findIndex(y=>y.text===x.text)===i);

// ===== Bộ giải giả lập (chỉ để minh họa luồng; bộ giải thật là CP-SAT) =====
function solve(S,forceCap){
 const pi0=prioInfo(S);
 if(forceCap==null){
  if(!pi0.s8)return solve(S,21);
  if(pi0.s8first)return solve(S,18);
  const a=solve(S,18),b=solve(S,21);
  return (!a.errors.length&&(b.errors.length||a.grad<=b.grad))?a:b;
 }
 const L=items(S),by={};L.forEach(x=>by[x.id]=x);
 const pi=Object.assign(pi0,{mainCap:forceCap}),n=SEMS.length,at={},load=Array(n).fill(0),errors=[],warns=[];
 const put=(id,i)=>{at[id]=i;load[i]+=by[id].tc;};
 Object.keys(S.pins).forEach(id=>{if(by[id]&&IDX[S.pins[id]]!=null)put(id,IDX[S.pins[id]]);});
 Object.keys(S.fails).forEach(id=>{if(by[id]&&at[id]==null)put(id,IDX[S.fails[id]]);});
 const memo={};
 const chain=id=>{if(memo[id]!=null)return memo[id];memo[id]=0;let m=0;L.forEach(y=>{if(needs(S,y,L).ids.includes(id))m=Math.max(m,1+chain(y.id));});return memo[id]=m;};
 for(let i=0;i<n;i++){
  if(!active(S,i))continue;
  const s=SEMS[i],cap=capOf(S,i,pi);
  const cand=L.filter(x=>{
   if(at[x.id]!=null)return false;
   if(x.of!=null&&!(at[x.of]!=null&&at[x.of]<i))return false;
   if(!s.m&&(x.proj||!(x.sum||S.offerOk[x.code+'|'+s.c])))return false;
   if((S.notOff[x.code]||[]).includes(s.c))return false;
   const nd=needs(S,x,L);if(nd.missing.length)return false;
   return nd.ids.every(d=>at[d]!=null&&at[d]<i);
  }).sort((a,b)=>((a.rec?IDX[a.rec]:i)-(b.rec?IDX[b.rec]:i))||(chain(b.id)-chain(a.id)));
  for(const x of cand)if(load[i]+x.tc<=cap)put(x.id,i);
 }
 L.forEach(x=>{const nd=needs(S,x,L);nd.missing.forEach(c=>errors.push({text:`${x.code} cần học ${c} trước, nhưng ${c} không có trong lộ trình`,tag:'Tiên quyết',sem:at[x.id]!=null?SEMS[at[x.id]].c:null}));});
 const un=L.filter(x=>at[x.id]==null&&!needs(S,x,L).missing.length);
 if(un.length)errors.push({text:`Không kịp trong 12 kỳ chính: còn ${un.length} môn (${un.reduce((a,x)=>a+x.tc,0)} TC) chưa xếp được`,tag:'QĐ 285',sem:null});
 Object.keys(S.pins).forEach(id=>{const x=by[id];if(!x)return;const i=at[id],s=SEMS[i];
  if(!active(S,i))errors.push({text:`${x.code||'Ô tự do'} ghim HK ${s.c}, nhưng ${s.m?'bạn nghỉ kỳ này':'bạn chưa bật học hè này'}`,tag:'Lựa chọn của bạn',sem:s.c});
  if(!s.m&&x.proj)errors.push({text:`${x.code} là đồ án, không học hè`,tag:'Quy định',sem:s.c});
  if((S.notOff[x.code]||[]).includes(s.c))errors.push({text:`${x.code} ghim HK ${s.c}, nhưng bạn báo kỳ này không mở`,tag:'Lựa chọn của bạn',sem:s.c});
  if(!s.m&&!x.sum&&!S.offerOk[x.code+'|'+s.c])warns.push({text:`${x.code}: 3 năm gần đây chưa mở hè`,sem:s.c,act:{t:'offer',code:x.code,sem:s.c}});
 });
 L.forEach(x=>{if(at[x.id]==null)return;const c=SEMS[at[x.id]].c;
  needs(S,x,L).ids.forEach(d=>{if(at[d]==null||at[d]>=at[x.id])errors.push({text:`${x.code} ở HK ${c}, nhưng phải học xong ${by[d]?by[d].code:d} trước`,tag:'Tiên quyết',sem:c});});
  if(x.of!=null&&!(at[x.of]<at[x.id]))errors.push({text:`Học lại ${x.code} phải sau kỳ rớt`,tag:'Quy định',sem:c});
 });
 let grad=-1;Object.values(at).forEach(i=>{if(i>grad)grad=i;});
 SEMS.forEach((s,i)=>{const t=S.targets[s.c],law=lawOf(i);
  if(t!=null&&t>law)warns.push({text:`Ô TC HK ${s.c} là ${t}, vượt mức ${law} TC; vẫn xếp theo ô`,tag:'Quy định',sem:s.c});
  else if(load[i]>law)errors.push({text:`HK ${s.c}: ${load[i]} TC, vượt mức ${law} TC`,tag:'Quy định',sem:s.c});
  if(t!=null&&active(S,i)&&load[i]<t-2)warns.push({text:`HK ${s.c} muốn ${t} TC, xếp được ${load[i]}: không còn môn đủ điều kiện`,sem:s.c});
  if(pi.s8&&s.m&&active(S,i)&&t==null&&load[i]>0&&i<grad&&(load[i]<15||load[i]>18))warns.push({text:`HK ${s.c}: ${load[i]} TC, ngoài mức 15–18`,sem:s.c});
 });
 const mains=SEMS.filter(s=>s.m).map(s=>s.c);
 for(let k=0;k<mains.length-1;k++)if(S.skip.includes(mains[k])&&S.skip.includes(mains[k+1]))
  warns.push({text:`Nghỉ HK ${mains[k]} và ${mains[k+1]} liên tiếp: cần làm đơn xin phép Phòng Đào tạo`,tag:'Quy định',sem:mains[k]});
 return{at,load,errors:dedupe(errors),warns:dedupe(warns),grad,gradCode:grad>=0?SEMS[grad].c:null};
}
function relaxations(S){
 const R=[];
 Object.keys(S.pins).forEach(id=>R.push({t:'pin',id,label:`Bỏ ghim ${codeOf(S,id)} ở HK ${S.pins[id]}`}));
 S.skip.forEach(c=>R.push({t:'skip',c,label:`Không nghỉ HK ${c}`}));
 Object.keys(S.fails).forEach(id=>R.push({t:'fail',id,label:`Bỏ giả định rớt ${codeOf(S,id)}`}));
 Object.keys(S.notOff).forEach(code=>S.notOff[code].forEach(c=>R.push({t:'off',code,c,label:`Cho ${code} mở lại HK ${c}`})));
 Object.keys(S.targets).forEach(c=>R.push({t:'target',c,label:`Bỏ ô TC HK ${c}`}));
 SEMS.filter(s=>!s.m&&!S.summers.includes(s.c)).forEach(s=>R.push({t:'summer',c:s.c,label:`Bật học hè HK ${s.c}`}));
 Object.keys(S.inprog).forEach(c=>{if(S.inprog[c]==='fail')R.push({t:'inprog',c,label:`Giả định đậu ${c}`});});
 const L=items(S);
 L.forEach(x=>needs(S,x,L).missing.forEach(m=>S.elect.forEach((c,k)=>{if(c!==x.code)R.push({t:'elect',k,code:m,label:`Chọn ${m} thay ${c}`});})));
 return R;
}
function applyRelax(S,r){
 if(r.t==='pin')delete S.pins[r.id];
 if(r.t==='skip')S.skip=S.skip.filter(x=>x!==r.c);
 if(r.t==='fail')delete S.fails[r.id];
 if(r.t==='off'){S.notOff[r.code]=S.notOff[r.code].filter(x=>x!==r.c);if(!S.notOff[r.code].length)delete S.notOff[r.code];}
 if(r.t==='target')delete S.targets[r.c];
 if(r.t==='summer')S.summers.push(r.c);
 if(r.t==='inprog')S.inprog[r.c]='pass';
 if(r.t==='elect')S.elect[r.k]=r.code;
}
function explain(S){return relaxations(S).filter(r=>{const T=clone(S);applyRelax(T,r);return solve(T).errors.length===0;}).slice(0,3);}
function critical(S,res){
 const out=[];
 items(S).forEach(x=>{if(x.kind==='retake'||S.fails[x.id]||res.at[x.id]==null)return;
  const T=clone(S);T.fails[x.id]=SEMS[res.at[x.id]].c;const r=solve(T);
  if(r.errors.length||r.grad>res.grad)out.push(x.code||'Ô tự do');});
 return out;
}
function kpiOf(S,at,res){
 const L=items(S);let heavy=0,summer=0,band=0,late=0;const load=Array(SEMS.length).fill(0);let grad=-1;
 L.forEach(x=>{if(at[x.id]==null)return;load[at[x.id]]+=x.tc;if(at[x.id]>grad)grad=at[x.id];
  if(x.kind==='req'&&x.rec&&at[x.id]>IDX[x.rec])late++;});
 SEMS.forEach((s,i)=>{if(s.m){heavy=Math.max(heavy,load[i]);if(load[i]>0&&i<grad&&(load[i]<15||load[i]>18))band++;}else summer+=load[i];});
 return{grad,gradCode:grad>=0?SEMS[grad].c:'—',heavy,summer,band,late,
  critical:res&&res.critical?res.critical:null,warns:res?res.warns.length:null,errors:res?res.errors.length:null};
}

// ===== Trạng thái trang (giữ lại khi đăng xuất: mẫu lưu trong trình duyệt) =====
let S=fresh();
let V={panel:'open',result:null,prevKpi:null,dirty:0,history:[],tab:'plan',cmpA:'cur',cmpB:'plan',sel:null,solving:false,undo:[],name:''};
try{const d=JSON.parse(localStorage.getItem(KEY));if(d){S=d.S;Object.assign(V,d.V);}}catch(e){}
function persist(){localStorage.setItem(KEY,JSON.stringify({S,V:{result:V.result,prevKpi:V.prevKpi,dirty:V.dirty,history:V.history,tab:V.tab,panel:V.panel,cmpA:V.cmpA,cmpB:V.cmpB}}));}
function edit(fn){V.undo.push({S:clone(S),dirty:V.dirty});if(V.undo.length>30)V.undo.shift();fn();V.dirty++;V.sel=null;render();}

function shown(){
 if(!V.result)return null;
 const at=Object.assign({},V.result.at);
 Object.keys(S.pins).forEach(id=>at[id]=IDX[S.pins[id]]);
 Object.keys(S.fails).forEach(id=>{if(at[id]==null)at[id]=IDX[S.fails[id]];});
 const ids=new Set(items(S).map(x=>x.id));Object.keys(at).forEach(id=>{if(!ids.has(id))delete at[id];});
 return at;
}
function hintFor(x,i,L,at){
 if(at[x.id]===i)return{cur:1};
 const s=SEMS[i];
 if(!active(S,i))return{block:s.m?'Bạn đang nghỉ kỳ này':'Chưa bật học hè này'};
 if(!s.m&&x.proj)return{block:'Đồ án không học hè'};
 if((S.notOff[x.code]||[]).includes(s.c))return{block:'Bạn báo kỳ này không mở'};
 if(x.of!=null&&!(at[x.of]<i))return{block:'Học lại phải sau kỳ rớt'};
 for(const d of needs(S,x,L).ids)if(at[d]==null||at[d]>=i)return{block:`Cần xong ${codeOf(S,d)} trước`};
 for(const y of L)if(at[y.id]!=null&&at[y.id]<=i&&needs(S,y,L).ids.includes(x.id))return{block:`Phải học trước ${y.code}`};
 const soft=[];
 if(!s.m&&!x.sum&&!S.offerOk[x.code+'|'+s.c])soft.push('3 năm chưa mở hè');
 const ld=L.filter(y=>at[y.id]===i).reduce((a,y)=>a+y.tc,0)+x.tc;
 if(ld>lawOf(i)&&S.targets[s.c]==null)soft.push(`sẽ thành ${ld} TC, quá mức ${lawOf(i)}`);
 return{ok:1,soft:soft.join(' · ')};
}

// ===== Giao diện =====
function kpiStrip(){
 const r=V.result,k=r?r.kpi:null,p=V.prevKpi,st=(V.dirty||V.solving)?' stale':'';
 const d=(now,old,unit,lowGood)=>{if(old==null||now==null||now===old)return'';const df=now-old;const good=lowGood?df<0:df>0;
  return`<span class="pill ${good?'g':'b'}">${df>0?'+':''}${df}${unit}</span>`;};
 const gd=()=>{if(!k||!p||p.grad===k.grad||k.grad<0)return'';const df=k.grad-p.grad;return`<span class="pill ${df<0?'g':'b'}">${df>0?'trễ':'sớm'} ${Math.abs(df)} kỳ</span>`;};
 const ok=r&&!r.errors.length;
 return`<div class="kpis">
 <div class="kpi${st}"><div class="l">Ra trường</div><div class="v">${ok?'HK '+k.gradCode:'—'} ${ok?gd():''}</div><div class="s">${ok?'kỳ cuối có môn':''}</div></div>
 <div class="kpi${st}"><div class="l">Kỳ chính nặng nhất</div><div class="v">${ok?k.heavy+' TC':'—'} ${ok&&p?d(k.heavy,p.heavy,' TC',true):''}</div><div class="s">${ok&&k.band?k.band+' kỳ ngoài 15–18':''}</div></div>
 <div class="kpi${st}"><div class="l">Học hè</div><div class="v">${ok?k.summer+' TC':'—'} ${ok&&p?d(k.summer,p.summer,' TC',true):''}</div><div class="s"></div></div>
 <div class="kpi${st}" title="${ok?esc(k.critical.join(', ')):''}"><div class="l">Môn không được rớt</div><div class="v">${ok?k.critical.length+' môn':'—'} ${ok&&p&&p.critical?d(k.critical.length,p.critical.length,'',true):''}</div><div class="s">${ok?'rớt là trễ ra trường: '+esc(k.critical.slice(0,3).join(', '))+(k.critical.length>3?'…':''):''}</div></div>
 </div>`;
}
function statusBox(){
 if(V.solving)return`<div class="status st-dirty"><div class="h"><span class="spin"></span>Đang giải…</div></div>`;
 if(!V.result)return`<div class="status"><div class="h">Chưa có lộ trình.</div><div class="muted" style="margin:4px 0 0">Bấm Giải để bộ giải đề xuất lộ trình.</div></div>`;
 if(V.dirty)return`<div class="status st-dirty"><div class="h">Đã sửa ${V.dirty} chỗ, chưa kiểm.</div><div class="muted" style="margin:4px 0 0">Bấm Giải để kiểm và xếp lại phần còn lại. Môn bạn chuyển được giữ nguyên (ghim).</div></div>`;
 const r=V.result;
 if(r.errors.length)return`<div class="status st-err"><div class="h">Không giải được</div><ul>${r.errors.map(e=>`<li>${e.tag?`<span class="tag">${esc(e.tag)}</span>`:''}${esc(e.text)}</li>`).join('')}</ul>
  ${r.fix&&r.fix.length?`<ul><li><b style="font-size:12px">Cách gỡ:</b>${r.fix.map((f,i)=>`<button class="fix" data-act="relax" data-i="${i}">${esc(f.label)}</button>`).join('')}</li></ul>`:`<div class="muted" style="margin:8px 0 0">Không có một lựa chọn nào gỡ được riêng; cần nới nhiều chỗ.</div>`}</div>`;
 if(r.warns.length)return`<div class="status st-warn"><div class="h">Giải được, có ${r.warns.length} cảnh báo</div><ul>${r.warns.map((w,i)=>`<li>${w.tag?`<span class="tag">${esc(w.tag)}</span>`:''}${esc(w.text)}${w.act?` <button class="fix" data-act="offer" data-i="${i}">Kỳ này có mở</button>`:''}</li>`).join('')}</ul></div>`;
 return`<div class="status st-ok"><div class="h">Giải được. Không vi phạm quy định, không cảnh báo.</div></div>`;
}
function card(x,i,L){
 const on=V.sel===x.id,pinned=S.pins[x.id]!=null,failed=!!S.fails[x.id];
 const moved=V.result&&V.result.at[x.id]!==i;
 const info=[];
 info.push(`<div class="tl">${x.tc} TC · ${x.kind==='elect'?'Tự chọn khối C':x.kind==='free'?'Tự chọn tự do':x.kind==='retake'?'Học lại':'Bắt buộc'}</div>`);
 if(pinned)info.push('<div class="tl r">Đã ghim vào kỳ này</div>');
 if(moved)info.push('<div class="tl r">Đã chuyển, chưa giải</div>');
 if(failed)info.push('<div class="tl e">Giả định rớt kỳ này</div>');
 if((S.notOff[x.code]||[]).includes(SEMS[i].c))info.push('<div class="tl e">Bạn báo kỳ này không mở</div>');
 let pop='';
 if(on){
  const opts=Object.keys(POOL).filter(c=>c===x.code||!S.elect.includes(c));
  pop=`<div class="pop"><div class="tip-in"><div class="tt" style="font-weight:600">${esc(x.code||'Ô tự chọn tự do')} · ${esc(x.name)}</div>${info.join('')}</div><div class="acts">
   <button data-act="pin" data-id="${x.id}" data-sem="${SEMS[i].c}">${pinned?'Bỏ ghim':'Ghim vào HK '+SEMS[i].c}</button>
   <button data-act="off" data-id="${x.id}" data-sem="${SEMS[i].c}">HK ${SEMS[i].c} không mở môn này</button>
   ${x.kind!=='retake'?`<button data-act="fail" data-id="${x.id}" data-sem="${SEMS[i].c}">${failed?'Bỏ giả định rớt':'Giả định rớt kỳ này'}</button>`:''}
   ${x.kind==='elect'?`<label>Đổi môn khác cùng khối<select data-act="swap" data-slot="${x.slot}">${opts.map(c=>`<option value="${c}" ${c===x.code?'selected':''}>${c} · ${esc(POOL[c].n)}</option>`).join('')}</select></label>`:''}
   ${x.kind==='free'?`<label>Gõ mã môn bất kỳ<input data-act="free" value="${esc(S.free)}" placeholder="VD: IM1013"></label>`:''}
   <div class="muted" style="margin:4px 0 0">Bấm hàng đang sáng để chuyển môn.</div></div></div>`;
 }
 return`<div class="bead${on?' on':''}${moved?' moved':''}" data-act="sel" data-id="${x.id}">
  <span class="ball"></span><b>${esc(x.code||'Tự do')}</b><span class="nm">${esc(x.name)}</span>
  ${on?pop:`<div class="tip"><div class="tt">${esc(x.name)}</div>${info.join('')}</div>`}</div>`;
}
function boardView(){
 const L=items(S),at=shown();
 if(!at)return`<div class="empty"><svg viewBox="0 0 100 90" fill="none"><path d="M50 8c22 0 40 16 40 38s-18 38-40 38S10 68 10 46 28 8 50 8z" fill="#FFF8F4" stroke="#E7A0BA" stroke-width="1.5"/><circle cx="37" cy="46" r="3" fill="#3B2230"/><circle cx="63" cy="46" r="3" fill="#3B2230"/><ellipse cx="29" cy="56" rx="6" ry="3.2" fill="#F3C3D3"/><ellipse cx="71" cy="56" rx="6" ry="3.2" fill="#F3C3D3"/><path d="M45 55q5 5 10 0" stroke="#3B2230" stroke-width="1.6" stroke-linecap="round"/><path d="M50 8q-3-6 3-7" stroke="#E7A0BA" stroke-width="1.5" stroke-linecap="round"/></svg><div>Chưa có lộ trình nào.<br>Bấm <b style="color:var(--rose)">Giải</b> ở dưới để xếp thử nhé.</div></div>${actBar()}`;
 const sel=V.sel&&L.find(x=>x.id===V.sel);
 const tray=L.filter(x=>at[x.id]==null);
 const rows=SEMS.map((s,i)=>{
  const list=L.filter(x=>at[x.id]===i),ld=list.reduce((a,x)=>a+x.tc,0),act=active(S,i);
  const h=sel?hintFor(sel,i,L,at):null;
  if(!act&&!list.length){
   return`<div class="row fold${s.m?'':' sum'}${h&&h.block?' blk':''}"><div class="dot"></div><div class="hd"><b>${s.c}</b></div>
    <div class="lane">${s.m?`<label><input type="checkbox" data-act="skip" data-sem="${s.c}" checked>Nghỉ kỳ này</label>`:`<label><input type="checkbox" data-act="summer" data-sem="${s.c}">Học hè này</label>`}</div></div>`;
  }
  const fresh=V.result&&!V.dirty&&!V.solving;
  const errs=fresh?V.result.errors.filter(e=>e.sem===s.c):[],warns=fresh?V.result.warns.filter(w=>w.sem===s.c):[];
  let cls='row'+(s.m?'':' sum');if(h&&h.ok)cls+=' ok';else if(h&&h.block)cls+=' blk';if(errs.length)cls+=' bad';if(i===0)cls+=' cur';
  const t=S.targets[s.c];
  const notes=errs.map(e=>`<div class="line e">${esc(e.text)}</div>`).join('')+warns.map(w=>`<div class="line w">${esc(w.text)}</div>`).join('');
  return`<div class="${cls}"><div class="dot"></div>
   <div class="hd"><b>${s.c}</b>${s.m?'':'<span class="he">HÈ</span>'}<div class="ld">${ld}${t!=null?' / '+t:''} TC</div>
    <div class="ctl">${s.m?`<label><input type="checkbox" data-act="skip" data-sem="${s.c}" ${S.skip.includes(s.c)?'checked':''}>nghỉ</label>`:`<label><input type="checkbox" data-act="summer" data-sem="${s.c}" ${S.summers.includes(s.c)?'checked':''}>học hè</label>`}
     <label>muốn<input type="number" min="0" max="30" data-act="target" data-sem="${s.c}" value="${t!=null?t:''}" placeholder="—">TC</label></div></div>
   <div class="lane">${notes?`<div class="notes">${notes}</div>`:''}
    ${list.map(x=>card(x,i,L)).join('')}
    ${h&&h.ok?`<button class="move" data-act="move" data-sem="${s.c}">Chuyển vào đây</button>${h.soft?`<span class="soft">${esc(h.soft)}</span>`:''}`:''}
    ${h&&h.block?`<span class="why">${esc(h.block)}</span>`:''}
   </div></div>`;
 }).join('');
 return`${tray.length?`<div class="tray">Chờ xếp khi bấm Giải: ${tray.map(x=>esc((x.kind==='retake'?'học lại ':'')+(x.code||'ô tự do'))).join(', ')}</div>`:''}
  <div class="board">${rows}</div>
  <div class="legend">Rê chuột vào chấm để xem chi tiết, bấm chấm để chỉnh. Khi đang chọn môn: hàng sáng lên là chuyển vào được, hàng mờ là không. Dấu <b>•</b> cạnh mã: đã chuyển, chưa giải.</div>${actBar()}`;
}
function actBar(){
 return`<div class="actbar"><button class="solve" data-act="solve" ${V.solving?'disabled':''}>${V.solving?'Đang giải…':'Giải'}</button>
  <button class="sec" data-act="undo" ${V.undo.length?'':'disabled'}>Hoàn tác</button>
  <span class="muted" style="margin:0">Chỉ bấm Giải mới gọi bộ giải.</span><span class="grow"></span>
  <input id="nm" data-act="name" value="${esc(V.name)}" placeholder="Tên bản, VD: Không học hè">
  <button class="ghost" data-act="save" ${V.result?'':'disabled'}>Lưu bản này</button></div>`;
}
function side(){
 const pr=S.prio;
 if(V.panel==='closed')return`<aside class="closed" data-act="panel"><button class="tog" data-act="panel" title="Mở rộng">‹</button><span class="vt">Kịch bản</span></aside>`;
 return`<aside><div class="ah"><b>Kịch bản</b><button class="tog" data-act="panel" title="Thu gọn">›</button></div>
 <section><h3>Môn đang học (HK 261)</h3>
  ${Object.keys(INPROG).map(c=>`<div class="ip"><span><b>${c}</b><br><span class="muted">${esc(INPROG[c].n)}</span></span>
   <span class="seg"><button class="${S.inprog[c]==='pass'?'on':''}" data-act="ip" data-c="${c}" data-v="pass">Đậu</button><button class="${S.inprog[c]==='fail'?'on':''}" data-act="ip" data-c="${c}" data-v="fail">Rớt</button></span></div>`).join('')}
 </section>
 <section><h3>Ưu tiên</h3><p class="muted">Trên cùng là quan trọng nhất. Bỏ dấu nếu không cần.</p>
  ${pr.map((p,i)=>`<div class="pr"><input type="checkbox" data-act="prio-on" data-i="${i}" ${p.on?'checked':''}><span class="n">${i+1}. ${PRIO[p.id]}</span>
   <button class="ar" data-act="up" data-i="${i}" ${i?'':'disabled'}>↑</button><button class="ar" data-act="down" data-i="${i}" ${i<pr.length-1?'':'disabled'}>↓</button></div>`).join('')}
  <div class="pr dis"><input type="checkbox" disabled><span class="n">Học phí thấp (bàn sau)</span></div>
  <div class="pr dis"><input type="checkbox" disabled><span class="n">Theo sở thích (bàn sau)</span></div>
 </section>
 <section><h3>Lịch sử (${V.history.length}/10)</h3>
  ${V.history.length?`<div class="hist">${V.history.map((h,i)=>`<div class="h1"><div class="t"><button class="star ${h.star?'on':''}" data-act="star" data-i="${i}" title="Đặt làm mốc">★</button>${esc(h.name)}</div>
   <div class="muted" style="margin:2px 0 0">${h.time} · ${h.kpi.errors?'không giải được':'ra trường HK '+h.kpi.gradCode}${h.dirty?' · chưa kiểm':''}${h.star?' · mốc':''}</div>
   <div class="b"><button data-act="open" data-i="${i}">Mở</button><button data-act="cmp" data-i="${i}">So với đang xem</button><button data-act="del" data-i="${i}">Xóa</button></div></div>`).join('')}</div>`:'<p class="muted">Chưa có bản nào.</p>'}
 </section></aside>`;
}
// ===== So sánh =====
function planObj(key){
 if(key==='cur'){const at=shown();return at?{name:'Đang xem',S,at,kpi:kpiOf(S,at,V.dirty?null:V.result)}:null;}
 if(key==='plan'){const B=fresh(),at={};items(B).forEach(x=>{if(x.rec)at[x.id]=IDX[x.rec];});return{name:'Kế hoạch giảng dạy',S:B,at,kpi:kpiOf(B,at,null),isPlan:1};}
 const h=V.history[+key];if(!h)return null;
 return{name:h.name,S:h.S,at:h.at,kpi:h.kpi};
}
function describe(P){
 const S2=P.S,o=[];
 if(P.isPlan)return[['Giả định','Theo kỳ khuyến nghị của khoa']];
 o.push(['Học hè',S2.summers.length?S2.summers.join(', '):'không']);
 o.push(['Nghỉ kỳ',S2.skip.length?S2.skip.join(', '):'không']);
 o.push(['Ô TC từng kỳ',Object.keys(S2.targets).map(c=>c+': '+S2.targets[c]).join(', ')||'không']);
 o.push(['Ghim',Object.keys(S2.pins).map(id=>codeOf(S2,id)+' → '+S2.pins[id]).join(', ')||'không']);
 o.push(['Đang học',Object.keys(S2.inprog).map(c=>c+' '+(S2.inprog[c]==='pass'?'đậu':'rớt')).join(', ')]);
 o.push(['Giả định rớt',Object.keys(S2.fails).map(id=>codeOf(S2,id)+' ('+S2.fails[id]+')').join(', ')||'không']);
 o.push(['Không mở',Object.keys(S2.notOff).map(c=>c+' '+S2.notOff[c].join('/')).join(', ')||'không']);
 o.push(['Ưu tiên',S2.prio.filter(p=>p.on).map(p=>PRIO[p.id]).join(' > ')||'không']);
 o.push(['Tự chọn C',S2.elect.join(', ')]);
 o.push(['Tự chọn tự do',S2.free||'chưa chọn']);
 return o;
}
function compareView(){
 const opts=[['cur','Đang xem'],['plan','Kế hoạch giảng dạy']].concat(V.history.map((h,i)=>[String(i),h.name]));
 const sel=(k,v)=>`<select data-act="${k}">${opts.map(o=>`<option value="${o[0]}" ${o[0]===v?'selected':''}>${esc(o[1])}</option>`).join('')}</select>`;
 const A=planObj(V.cmpA),B=planObj(V.cmpB);
 let body='<p class="muted">Chọn hai bản để so.</p>';
 if(A&&B){
  const rows=[
   ['Ra trường',k=>k.grad>=0?'HK '+k.gradCode:'—',k=>k.grad,'low'],
   ['Kỳ chính ngoài 15–18 TC',k=>k.band+' kỳ',k=>k.band,'low'],
   ['Kỳ chính nặng nhất',k=>k.heavy+' TC',k=>k.heavy,'low'],
   ['Học hè',k=>k.summer+' TC',k=>k.summer,null],
   ['Môn bắt buộc trễ hơn kế hoạch khoa',k=>k.late+' môn',k=>k.late,'low'],
   ['Cảnh báo',k=>k.warns==null?'—':k.warns,k=>k.warns,'low']
  ];
  const tr=rows.map(r=>{const a=r[2](A.kpi),b=r[2](B.kpi);let ca='',cb='';
   if(r[3]&&a!=null&&b!=null&&a!==b){if(a<b)ca='best';else cb='best';}
   return`<tr><td>${r[0]}</td><td class="${ca}">${r[1](A.kpi)}</td><td class="${cb}">${r[1](B.kpi)}</td></tr>`;}).join('');
  const dA=describe(A),dB=describe(B);
  const keys=[...new Set(dA.map(x=>x[0]).concat(dB.map(x=>x[0])))];
  const gv=(d,k)=>(d.find(x=>x[0]===k)||[,''])[1];
  const asum=keys.map(k=>{const a=gv(dA,k),b=gv(dB,k);return`<tr class="${a!==b?'diff':''}"><td>${k}</td><td>${esc(a)}</td><td>${esc(b)}</td></tr>`;}).join('');
  const LA=items(A.S),LB=items(B.S),names={};
  const pos=(L,at)=>{const m={};L.forEach(x=>{if(at[x.id]!=null&&x.code){const k=(x.kind==='retake'?'Học lại ':'')+x.code;m[k]=SEMS[at[x.id]].c;names[k]=x.name;}});return m;};
  const pa=pos(LA,A.at),pb=pos(LB,B.at),moves=[];
  Object.keys(pa).forEach(c=>{if(pb[c]!=null&&pa[c]!==pb[c])moves.push(`<div><b>${esc(c)}</b><span class="nm">${esc(names[c])}</span><span class="ar2">${pa[c]} → ${pb[c]}</span></div>`);});
  body=`<div class="sheet"><table><tr><th>Chỉ số</th><th>${esc(A.name)}</th><th>${esc(B.name)}</th></tr>${tr}</table>
  <div class="two"><div><h3>Giả định khác nhau</h3><table><tr><th></th><th>${esc(A.name)}</th><th>${esc(B.name)}</th></tr>${asum}</table></div>
  <div><h3>Môn đổi kỳ <span class="muted">(${moves.length})</span></h3><div class="mv">${moves.join('')||'<span class="muted">Không môn nào đổi kỳ.</span>'}</div></div></div></div>`;
 }
 return`<div class="cmp"><div class="pick">${sel('cmpA',V.cmpA)}<span>so với</span>${sel('cmpB',V.cmpB)}</div>${body}
  <p class="muted" style="margin-top:16px">Dòng hồng: giả định khác nhau. Chữ xanh: bản tốt hơn. So sánh không gọi bộ giải.</p></div>`;
}
function render(){
 const app=document.getElementById('app');
 app.innerHTML=`<div class="top"><h1>Gợi ý lộ trình<i>✦</i></h1><div class="note">Mẫu theo đặc tả mục 12 · dữ liệu mẫu · bộ giải trong mẫu là bản giả lập đơn giản</div>
  <div class="tabs"><button class="tab ${V.tab==='plan'?'on':''}" data-act="tab" data-v="plan">Lộ trình</button><button class="tab ${V.tab==='cmp'?'on':''}" data-act="tab" data-v="cmp">So sánh (${V.history.length})</button></div></div>
  ${V.tab==='plan'?`<div class="wrap" style="grid-template-columns:minmax(0,1fr) ${V.panel==='closed'?'44px':'290px'}"><main>${kpiStrip()}${statusBox()}${boardView()}</main>${side()}</div>`:compareView()}
  <div class="foot">Trạng thái trang được giữ lại khi đăng xuất (mẫu: lưu trong trình duyệt). <button data-act="reset">Làm lại từ đầu</button></div>`;
 persist();
}
function runSolve(){
 V.solving=true;V.sel=null;render();
 setTimeout(()=>{
  const r=solve(S);
  if(r.errors.length)r.fix=explain(S);else r.critical=critical(S,r);
  r.kpi=kpiOf(S,r.at,r);
  if(V.result&&!V.result.errors.length)V.prevKpi=V.result.kpi;
  V.result=r;V.dirty=0;V.solving=false;render();
 },650);
}
document.addEventListener('click',e=>{
 const el=e.target.closest('[data-act]');if(!el||el.tagName==='INPUT'||el.tagName==='SELECT')return;
 if(e.target.closest('.pop')&&el.dataset.act==='sel')return;
 const a=el.dataset.act,id=el.dataset.id,c=el.dataset.sem,i=+el.dataset.i;
 if(a==='tab'){V.tab=el.dataset.v;render();}
 else if(a==='solve')runSolve();
 else if(a==='sel'){V.sel=V.sel===id?null:id;render();}
 else if(a==='move')edit(()=>{S.pins[V.sel]=c;if(S.fails[V.sel])S.fails[V.sel]=c;});
 else if(a==='pin')edit(()=>{if(S.pins[id]!=null)delete S.pins[id];else S.pins[id]=c;});
 else if(a==='off')edit(()=>{S.notOff[codeOf(S,id)]=(S.notOff[codeOf(S,id)]||[]).concat(c);if(S.pins[id]===c)delete S.pins[id];});
 else if(a==='fail')edit(()=>{if(S.fails[id])delete S.fails[id];else S.fails[id]=c;});
 else if(a==='ip')edit(()=>{S.inprog[el.dataset.c]=el.dataset.v;});
 else if(a==='up'||a==='down')edit(()=>{const j=a==='up'?i-1:i+1;[S.prio[i],S.prio[j]]=[S.prio[j],S.prio[i]];});
 else if(a==='relax'){const f=V.result.fix[i];edit(()=>applyRelax(S,f));runSolve();}
 else if(a==='offer'){const w=V.result.warns[i].act;edit(()=>{S.offerOk[w.code+'|'+w.sem]=true;});}
 else if(a==='undo'){const u=V.undo.pop();if(u){S=u.S;V.dirty=u.dirty;V.sel=null;render();}}
 else if(a==='save'){
  if(V.history.length>=10){const k=V.history.findIndex(h=>!h.star);V.history.splice(k<0?0:k,1);}
  const at=shown(),t=new Date();
  V.history.push({name:V.name.trim()||'Bản '+(V.history.length+1),time:t.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'}),
   S:clone(S),at,kpi:kpiOf(S,at,V.dirty?null:V.result),dirty:V.dirty>0,star:false});
  V.name='';render();
 }
 else if(a==='star'){V.history.forEach((h,k)=>h.star=k===i?!h.star:false);render();}
 else if(a==='open'){const h=V.history[i];V.undo.push({S:clone(S),dirty:V.dirty});S=clone(h.S);V.result=solve(S);
  if(V.result.errors.length)V.result.fix=explain(S);else V.result.critical=critical(S,V.result);V.result.kpi=kpiOf(S,V.result.at,V.result);
  V.prevKpi=null;V.dirty=0;V.sel=null;render();}
 else if(a==='cmp'){V.tab='cmp';V.cmpA=String(i);V.cmpB='cur';render();}
 else if(a==='del'){V.history.splice(i,1);V.cmpA='cur';V.cmpB='plan';render();}
 else if(a==='panel'){V.panel=V.panel==='closed'?'open':'closed';render();}
 else if(a==='reset'){localStorage.removeItem(KEY);location.reload();}
});
document.addEventListener('change',e=>{
 const el=e.target,a=el.dataset.act,c=el.dataset.sem;if(!a)return;
 if(a==='skip')edit(()=>{S.skip=el.checked?S.skip.concat(c):S.skip.filter(x=>x!==c);});
 else if(a==='summer')edit(()=>{S.summers=el.checked?S.summers.concat(c):S.summers.filter(x=>x!==c);});
 else if(a==='target')edit(()=>{const v=parseInt(el.value,10);if(isNaN(v))delete S.targets[c];else S.targets[c]=v;});
 else if(a==='swap')edit(()=>{S.elect[+el.dataset.slot]=el.value;});
 else if(a==='free')edit(()=>{S.free=el.value.trim().toUpperCase();});
 else if(a==='prio-on')edit(()=>{S.prio[+el.dataset.i].on=el.checked;});
 else if(a==='cmpA'||a==='cmpB'){V[a]=el.value;render();}
});
document.addEventListener('input',e=>{if(e.target.dataset.act==='name')V.name=e.target.value;});
render();
